'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { and, ne } from 'drizzle-orm';
import { farmPortalEmails, farmSubscribers, farmSubscriberPickupPoints } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from '@/server/access';
import { withWorkspace } from '@/server/workspace';
import { TARGET_BY_KEY } from '@/data/nutrition-targets';

/** Only keys the catalog knows are stored, once each. */
const knownTargets = (keys: readonly string[]): string[] => [...new Set(keys)].filter((k) => k in TARGET_BY_KEY);

/**
 * Cotyledon — subscribers and pickup points, writes. SUPER ADMIN ONLY.
 *
 * A subscriber and its pickup points are facts of record: the contract, the price and the places
 * served. Its subscriptions are written by `subscription-actions.ts`. A forecast's edits live on
 * its `forecast` overlay and never write here.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });

const SubscriberInput = z.object({
  name: z.string().trim().min(1, 'Name the subscriber').max(200),
  channel: z.number().int().min(1).max(3),
  status: z.enum(['prospect', 'contracted', 'forecast', 'inactive']),
  pricePerUnitCents: z.number().int().min(0).nullable().default(null),
  /** No default: null until someone chooses the subscriber's terms. */
  paymentTerms: z.enum(['due_on_receipt', 'net_15', 'net_30']).nullable().default(null),
  contractStart: isoDate.nullable().default(null),
  contractEnd: isoDate.nullable().default(null),
  prospectId: z.string().max(120).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
  /** Keys from the nutrition target catalog; unknown keys are dropped. */
  nutritionTargets: z.array(z.string().max(60)).max(50).default([]),
  /** The owner's own trays: distributions to Owner Draws at cost, no revenue or invoice. */
  ownUse: z.boolean().default(false),
  /** The client's sign-in email (0025): the Client Portal links the account that signs in with it. One email, one record, across every farm. */
  email: z.string().trim().toLowerCase().max(200).refine((e) => e === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), 'An email address').transform((e) => (e === '' ? null : e)).nullable().default(null),
});

/** One email, one record: the index names the record an email already signs into, in any farm. */
async function emailTaken(email: string | null, ownId: string | null): Promise<string | null> {
  if (!email) return null;
  const rows = await db.select({ subscriberId: farmPortalEmails.subscriberId }).from(farmPortalEmails).where(ownId ? and(eq(farmPortalEmails.email, email), ne(farmPortalEmails.subscriberId, ownId)) : eq(farmPortalEmails.email, email)).limit(1);
  return rows[0] ? `${email} is already the sign-in of another subscriber record.` : null;
}

export async function createSubscriber(...args: Parameters<typeof createSubscriberInner>): ReturnType<typeof createSubscriberInner> {
  return withWorkspace(() => createSubscriberInner(...args));
}

async function createSubscriberInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = SubscriberInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const taken = await emailTaken(parsed.data.email, null);
  if (taken) return { ok: false, error: taken };
  const inserted = await db.insert(farmSubscribers).values({ ...parsed.data, nutritionTargets: knownTargets(parsed.data.nutritionTargets), createdBy: access.userId }).returning({ id: farmSubscribers.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to save the subscriber.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id: inserted[0].id };
}

export async function updateSubscriber(...args: Parameters<typeof updateSubscriberInner>): ReturnType<typeof updateSubscriberInner> {
  return withWorkspace(() => updateSubscriberInner(...args));
}

async function updateSubscriberInner(input: unknown): Promise<Result> {
  const parsed = SubscriberInput.extend({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...rest } = parsed.data;
  const taken = await emailTaken(rest.email, id);
  if (taken) return { ok: false, error: taken };
  await db.update(farmSubscribers).set({ ...rest, nutritionTargets: knownTargets(rest.nutritionTargets), source: 'user_built', updatedAt: new Date() }).where(eq(farmSubscribers.id, id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

export async function deleteSubscriber(...args: Parameters<typeof deleteSubscriberInner>): ReturnType<typeof deleteSubscriberInner> {
  return withWorkspace(() => deleteSubscriberInner(...args));
}

async function deleteSubscriberInner(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.delete(farmSubscribers).where(eq(farmSubscribers.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

const PickupPointInput = z.object({
  subscriberId: z.string().uuid(),
  pickupPointId: z.string().max(120).nullable().default(null),
  name: z.string().trim().min(1, 'Name the pickup point').max(200),
  status: z.enum(['active', 'planned', 'inactive']).default('active'),
  notes: z.string().max(2000).nullable().default(null),
});

export async function createSubscriberPickupPoint(...args: Parameters<typeof createSubscriberPickupPointInner>): ReturnType<typeof createSubscriberPickupPointInner> {
  return withWorkspace(() => createSubscriberPickupPointInner(...args));
}

async function createSubscriberPickupPointInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = PickupPointInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const inserted = await db.insert(farmSubscriberPickupPoints).values({ ...parsed.data, createdBy: access.userId }).returning({ id: farmSubscriberPickupPoints.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to save the pickup point.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id: inserted[0].id };
}

export async function updateSubscriberPickupPoint(...args: Parameters<typeof updateSubscriberPickupPointInner>): ReturnType<typeof updateSubscriberPickupPointInner> {
  return withWorkspace(() => updateSubscriberPickupPointInner(...args));
}

async function updateSubscriberPickupPointInner(input: unknown): Promise<Result> {
  const parsed = PickupPointInput.extend({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...rest } = parsed.data;
  await db.update(farmSubscriberPickupPoints).set({ ...rest, updatedAt: new Date() }).where(eq(farmSubscriberPickupPoints.id, id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

export async function deleteSubscriberPickupPoint(...args: Parameters<typeof deleteSubscriberPickupPointInner>): ReturnType<typeof deleteSubscriberPickupPointInner> {
  return withWorkspace(() => deleteSubscriberPickupPointInner(...args));
}

async function deleteSubscriberPickupPointInner(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.delete(farmSubscriberPickupPoints).where(eq(farmSubscriberPickupPoints.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
