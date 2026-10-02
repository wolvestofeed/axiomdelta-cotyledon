'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { farmFlatPlanRequests } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, FarmAccessError, getFarmAccess, requireFarmOperator, requireSubscriberAccess } from '@/server/access';
import { withWorkspace } from '@/server/workspace';
import { applyFlatPlan, linesProblem, loadSubscription, sowingRules } from '@/server/subscription-rules';

/**
 * Cotyledon — flat plan requests, writes (Roadmap P5, P6). A client asks for the lines each
 * distribution carries; a request is one at a time per subscription and must pass the same checks a
 * change does. An operator or admin approves it, which applies the change from the first distribution
 * not yet sown (`applyFlatPlan`) so production planning follows on its own, or declines it with a
 * reason the client reads in the portal. The client may withdraw a pending request.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });

const Lines = z
  .array(z.object({ growPlanCode: z.string().trim().min(1).max(40), units: z.number().int('Whole units').min(1, 'At least one unit').max(1_000) }))
  .min(1, 'A flat plan carries at least one grow plan');

async function signedIn(): Promise<{ ok: false; error: string } | null> {
  const a = await getFarmAccess();
  return a.userId ? null : refuse(new FarmAccessError('not_signed_in'));
}

function done(): void {
  revalidatePath('/farm', 'layout');
}

// ── The client asks ─────────────────────────────────────────────────────────

const RequestInput = z.object({ subscriptionId: z.string().uuid(), lines: Lines, note: z.string().trim().max(1000).default('') });

export async function requestFlatPlanChange(...args: Parameters<typeof requestFlatPlanChangeInner>): ReturnType<typeof requestFlatPlanChangeInner> {
  return withWorkspace(() => requestFlatPlanChangeInner(...args));
}

async function requestFlatPlanChangeInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = RequestInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const signedOut = await signedIn();
  if (signedOut) return signedOut;
  const hit = await loadSubscription(parsed.data.subscriptionId);
  if (!hit) return { ok: false, error: 'Subscription not found.' };
  let access;
  try {
    access = await requireSubscriberAccess(hit.sub.subscriberId);
  } catch (e) {
    return refuse(e);
  }
  const r = await sowingRules();
  const linesBad = linesProblem(parsed.data.lines, r.plans, hit.channel);
  if (linesBad) return { ok: false, error: linesBad };
  const open = await db.select({ id: farmFlatPlanRequests.id }).from(farmFlatPlanRequests).where(and(eq(farmFlatPlanRequests.subscriptionId, hit.sub.id), eq(farmFlatPlanRequests.status, 'pending'))).limit(1);
  if (open[0]) return { ok: false, error: 'A request for this subscription is already waiting for the farm. Withdraw it to ask for something else.' };
  const inserted = await db
    .insert(farmFlatPlanRequests)
    .values({ subscriptionId: hit.sub.id, subscriberId: hit.sub.subscriberId, lines: parsed.data.lines, note: parsed.data.note || null, requestedBy: access.userId })
    .returning({ id: farmFlatPlanRequests.id });
  if (!inserted[0]) return { ok: false, error: 'The request was not saved.' };
  done();
  return { ok: true, id: inserted[0].id };
}

const IdInput = z.object({ id: z.string().uuid() });

export async function withdrawFlatPlanRequest(...args: Parameters<typeof withdrawFlatPlanRequestInner>): ReturnType<typeof withdrawFlatPlanRequestInner> {
  return withWorkspace(() => withdrawFlatPlanRequestInner(...args));
}

async function withdrawFlatPlanRequestInner(input: unknown): Promise<Result> {
  const parsed = IdInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const signedOut = await signedIn();
  if (signedOut) return signedOut;
  const row = (await db.select().from(farmFlatPlanRequests).where(eq(farmFlatPlanRequests.id, parsed.data.id)).limit(1))[0];
  if (!row) return { ok: false, error: 'Request not found.' };
  try {
    await requireSubscriberAccess(row.subscriberId);
  } catch (e) {
    return refuse(e);
  }
  if (row.status !== 'pending') return { ok: false, error: 'The farm has already decided this request.' };
  await db.update(farmFlatPlanRequests).set({ status: 'withdrawn', decidedAt: new Date() }).where(eq(farmFlatPlanRequests.id, row.id));
  done();
  return { ok: true };
}

// ── The farm decides ────────────────────────────────────────────────────────

export async function approveFlatPlanRequest(...args: Parameters<typeof approveFlatPlanRequestInner>): ReturnType<typeof approveFlatPlanRequestInner> {
  return withWorkspace(() => approveFlatPlanRequestInner(...args));
}

/** Approval applies the change; a change the rules refuse leaves the request pending with the reason. */
async function approveFlatPlanRequestInner(input: unknown): Promise<Result<{ from: string }>> {
  const parsed = IdInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    return refuse(e);
  }
  const row = (await db.select().from(farmFlatPlanRequests).where(eq(farmFlatPlanRequests.id, parsed.data.id)).limit(1))[0];
  if (!row) return { ok: false, error: 'Request not found.' };
  if (row.status !== 'pending') return { ok: false, error: 'This request has already been decided.' };
  const lines = Lines.safeParse(row.lines);
  if (!lines.success) return { ok: false, error: 'The request carries no usable lines.' };
  const hit = await loadSubscription(row.subscriptionId);
  if (!hit) return { ok: false, error: 'The subscription is no longer on file.' };
  const applied = await applyFlatPlan(hit, lines.data);
  if (!applied.ok) return applied;
  await db.update(farmFlatPlanRequests).set({ status: 'approved', decidedBy: access.userId, decidedAt: new Date(), effectiveFrom: applied.from }).where(eq(farmFlatPlanRequests.id, row.id));
  done();
  return { ok: true, from: applied.from };
}

const DeclineInput = z.object({ id: z.string().uuid(), reason: z.string().trim().min(1, 'Give the client the reason').max(1000) });

export async function declineFlatPlanRequest(...args: Parameters<typeof declineFlatPlanRequestInner>): ReturnType<typeof declineFlatPlanRequestInner> {
  return withWorkspace(() => declineFlatPlanRequestInner(...args));
}

async function declineFlatPlanRequestInner(input: unknown): Promise<Result> {
  const parsed = DeclineInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    return refuse(e);
  }
  const row = (await db.select().from(farmFlatPlanRequests).where(eq(farmFlatPlanRequests.id, parsed.data.id)).limit(1))[0];
  if (!row) return { ok: false, error: 'Request not found.' };
  if (row.status !== 'pending') return { ok: false, error: 'This request has already been decided.' };
  await db.update(farmFlatPlanRequests).set({ status: 'declined', decidedBy: access.userId, decidedAt: new Date(), decisionNote: parsed.data.reason }).where(eq(farmFlatPlanRequests.id, row.id));
  done();
  return { ok: true };
}
