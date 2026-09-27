'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { farmSubscribers, farmSubscriberPickupPoints, farmSubscriberServices, farmServiceVolumePicks, farmPickupPointCalendarRanges } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from '@/server/access';
import { withWorkspace } from '@/server/workspace';
import { TARGET_BY_KEY } from '@/data/nutrition-targets';

/** Only keys the catalog knows are stored, once each. */
const knownTargets = (keys: readonly string[]): string[] => [...new Set(keys)].filter((k) => k in TARGET_BY_KEY);

/**
 * MicroFarm — subscribers and pickup points, writes. SUPER ADMIN ONLY.
 *
 * A subscriber and its pickup points are facts of record: the contract, the price, the
 * places served, each pickup point's services, their dated volume picks and the pickup point's
 * service calendar (Roadmap N4a). A forecast's edits live on its `forecast`
 * overlay and never write here.
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
  kind: z.enum(['district', 'company', 'marketplace', 'other']),
  channel: z.number().int().min(1).max(3),
  status: z.enum(['prospect', 'contracted', 'forecast', 'inactive']),
  pricePerUnitCents: z.number().int().min(0).nullable().default(null),
  /** No default (Roadmap K3): null until someone chooses the subscriber's terms. */
  paymentTerms: z.enum(['due_on_receipt', 'net_15', 'net_30']).nullable().default(null),
  contractStart: isoDate.nullable().default(null),
  contractEnd: isoDate.nullable().default(null),
  prospectId: z.string().max(120).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
  /** Keys from the nutrition target catalog; unknown keys are dropped. */
  nutritionTargets: z.array(z.string().max(60)).max(50).default([]),
});

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
  trayFormats: z.array(z.enum(['K-5', '6-8', '9-12'])).default([]),
  /** Entered when a prospect account is set up; participation is calculated from orders against it. */
  enrollment: z.number().int().min(0).nullable().default(null),
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
  // Every pickup point is served through at least one service; it starts with one, no volume until a pick is entered.
  await db.insert(farmSubscriberServices).values({ subscriberPickupPointId: inserted[0].id, name: 'Service 1', createdBy: access.userId });
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

// ── Services (Roadmap N4a) ──────────────────────────────────────────────────

const weekdays = z.array(z.number().int().min(0).max(6)).min(1, 'A service runs on at least one weekday');

const ServiceInput = z.object({
  subscriberPickupPointId: z.string().uuid(),
  name: z.string().trim().min(1, 'Name the service').max(120),
  weekdays,
  status: z.enum(['active', 'inactive']).default('active'),
  notes: z.string().max(2000).nullable().default(null),
});

async function gate(): Promise<{ userId: string } | { ok: false; error: string }> {
  try {
    return await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
}

export async function createSubscriberService(...args: Parameters<typeof createSubscriberServiceInner>): ReturnType<typeof createSubscriberServiceInner> {
  return withWorkspace(() => createSubscriberServiceInner(...args));
}

async function createSubscriberServiceInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = ServiceInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const access = await gate();
  if ('ok' in access) return access;
  const d = parsed.data;
  const count = await db.select({ id: farmSubscriberServices.id }).from(farmSubscriberServices).where(eq(farmSubscriberServices.subscriberPickupPointId, d.subscriberPickupPointId));
  const inserted = await db
    .insert(farmSubscriberServices)
    .values({ ...d, weekdays: [...new Set(d.weekdays)].sort(), position: count.length, createdBy: access.userId })
    .returning({ id: farmSubscriberServices.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to save the service.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id: inserted[0].id };
}

export async function updateSubscriberService(...args: Parameters<typeof updateSubscriberServiceInner>): ReturnType<typeof updateSubscriberServiceInner> {
  return withWorkspace(() => updateSubscriberServiceInner(...args));
}

async function updateSubscriberServiceInner(input: unknown): Promise<Result> {
  const parsed = ServiceInput.omit({ subscriberPickupPointId: true }).extend({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const access = await gate();
  if ('ok' in access) return access;
  const { id, ...rest } = parsed.data;
  await db.update(farmSubscriberServices).set({ ...rest, weekdays: [...new Set(rest.weekdays)].sort(), updatedAt: new Date() }).where(eq(farmSubscriberServices.id, id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

export async function deleteSubscriberService(...args: Parameters<typeof deleteSubscriberServiceInner>): ReturnType<typeof deleteSubscriberServiceInner> {
  return withWorkspace(() => deleteSubscriberServiceInner(...args));
}

async function deleteSubscriberServiceInner(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const access = await gate();
  if ('ok' in access) return access;
  await db.delete(farmSubscriberServices).where(eq(farmSubscriberServices.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

const PickInput = z.object({
  serviceId: z.string().uuid(),
  effectiveDate: isoDate,
  units: z.number().min(0, 'Units cannot be negative'),
  notes: z.string().max(2000).nullable().default(null),
});

/** Set the units per service from a date; a pick already on that date is replaced. */
export async function setVolumePick(...args: Parameters<typeof setVolumePickInner>): ReturnType<typeof setVolumePickInner> {
  return withWorkspace(() => setVolumePickInner(...args));
}

async function setVolumePickInner(input: unknown): Promise<Result> {
  const parsed = PickInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const access = await gate();
  if ('ok' in access) return access;
  const d = parsed.data;
  const existing = await db
    .select({ id: farmServiceVolumePicks.id })
    .from(farmServiceVolumePicks)
    .where(and(eq(farmServiceVolumePicks.serviceId, d.serviceId), eq(farmServiceVolumePicks.effectiveDate, d.effectiveDate)))
    .limit(1);
  if (existing[0]) await db.update(farmServiceVolumePicks).set({ units: d.units, notes: d.notes, updatedAt: new Date() }).where(eq(farmServiceVolumePicks.id, existing[0].id));
  else await db.insert(farmServiceVolumePicks).values({ ...d, createdBy: access.userId });
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

export async function deleteVolumePick(...args: Parameters<typeof deleteVolumePickInner>): ReturnType<typeof deleteVolumePickInner> {
  return withWorkspace(() => deleteVolumePickInner(...args));
}

async function deleteVolumePickInner(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const access = await gate();
  if ('ok' in access) return access;
  await db.delete(farmServiceVolumePicks).where(eq(farmServiceVolumePicks.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

// ── Pickup point service calendar (Roadmap N4a) ─────────────────────────────────────

const CalendarRangeInput = z
  .object({
    subscriberPickupPointId: z.string().uuid(),
    kind: z.enum(['term', 'break']),
    label: z.string().max(120).nullable().default(null),
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine((r) => r.endDate >= r.startDate, { message: 'The end date is before the start date.' });

export async function createPickupPointCalendarRange(...args: Parameters<typeof createPickupPointCalendarRangeInner>): ReturnType<typeof createPickupPointCalendarRangeInner> {
  return withWorkspace(() => createPickupPointCalendarRangeInner(...args));
}

async function createPickupPointCalendarRangeInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = CalendarRangeInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const access = await gate();
  if ('ok' in access) return access;
  const inserted = await db.insert(farmPickupPointCalendarRanges).values({ ...parsed.data, createdBy: access.userId }).returning({ id: farmPickupPointCalendarRanges.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to save the date range.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id: inserted[0].id };
}

export async function deletePickupPointCalendarRange(...args: Parameters<typeof deletePickupPointCalendarRangeInner>): ReturnType<typeof deletePickupPointCalendarRangeInner> {
  return withWorkspace(() => deletePickupPointCalendarRangeInner(...args));
}

async function deletePickupPointCalendarRangeInner(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const access = await gate();
  if ('ok' in access) return access;
  await db.delete(farmPickupPointCalendarRanges).where(eq(farmPickupPointCalendarRanges.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
