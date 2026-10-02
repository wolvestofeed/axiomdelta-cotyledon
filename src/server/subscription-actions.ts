'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { farmOrders, farmSubscribers, farmSubscriberPickupPoints, farmSubscriptions } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, getFarmAccess, requireFarmSuperAdmin, requireSubscriberAccess, FarmAccessError } from '@/server/access';
import { withWorkspace } from '@/server/workspace';
import { applyFlatPlan, linesProblem, loadSubscription as load, saveSubscription as save, sowingRules as rules } from '@/server/subscription-rules';
import { CADENCES, type FlatPlanLine, type SubscriptionDef } from '@/data/subscriptions';
import { cadenceDates, flatPlanOn, startProblem } from '@/engine/subscriptions';
import { firstUnsown, skipRefusal, sowDateOf, startRefusal } from '@/engine/subscription-cutoffs';

/**
 * Cotyledon — subscriptions, writes. Starting, the flat plan, the last date and removal are SUPER
 * ADMIN; a skip, an unskip, a pause and a resume are the record's own client's as well (Roadmap P5,
 * `requireSubscriberAccess`), and a client's flat plan change is a request staff approve
 * (`flat-plan-request-actions.ts`). Every rule that touches a distribution reads its sow date: a subscription starts on
 * a first distribution that can still be sown for, a distribution is skipped before its sow date,
 * a pause starts at the first distribution not yet sown, and a flat plan change takes effect from
 * the first distribution its new lines can be sown for.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const today = () => new Date().toISOString().slice(0, 10);

const Lines = z
  .array(z.object({ growPlanCode: z.string().trim().min(1).max(40), units: z.number().int('Whole units').min(1, 'At least one unit').max(1_000) }))
  .min(1, 'A flat plan carries at least one grow plan');

async function guard(): Promise<{ ok: false; error: string } | null> {
  try {
    await requireFarmSuperAdmin();
    return null;
  } catch (e) {
    return refuse(e);
  }
}

/** Signed in at all: checked before a record is read, so a stranger learns nothing. */
async function signedIn(): Promise<{ ok: false; error: string } | null> {
  const a = await getFarmAccess();
  return a.userId ? null : refuse(new FarmAccessError('not_signed_in'));
}

/** A super admin, or the client linked to this very record. */
async function ownerGuard(subscriberId: string): Promise<{ ok: false; error: string } | null> {
  try {
    await requireSubscriberAccess(subscriberId);
    return null;
  } catch (e) {
    return refuse(e);
  }
}

// ── Start ───────────────────────────────────────────────────────────────────

const CreateInput = z.object({
  subscriberId: z.string().uuid(),
  subscriberPickupPointId: z.string().uuid(),
  cadence: z.enum(CADENCES as unknown as [string, ...string[]]),
  startDate: isoDate,
  endDate: isoDate.nullable().default(null),
  lines: Lines,
  notes: z.string().trim().max(2000).default(''),
});

export async function createSubscription(...args: Parameters<typeof createSubscriptionInner>): ReturnType<typeof createSubscriptionInner> {
  return withWorkspace(() => createSubscriptionInner(...args));
}

async function createSubscriptionInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const cadence = d.cadence as SubscriptionDef['cadence'];
  const pp = await db
    .select({ channel: farmSubscribers.channel, status: farmSubscribers.status })
    .from(farmSubscriberPickupPoints)
    .innerJoin(farmSubscribers, eq(farmSubscribers.id, farmSubscriberPickupPoints.subscriberId))
    .where(and(eq(farmSubscriberPickupPoints.id, d.subscriberPickupPointId), eq(farmSubscribers.id, d.subscriberId)))
    .limit(1);
  if (!pp[0]) return { ok: false, error: 'The pickup point is not one of this subscriber’s pickup points.' };
  if (d.endDate !== null && d.endDate < d.startDate) return { ok: false, error: 'The last date is on or after the first distribution.' };
  const problem = startProblem(cadence, d.startDate);
  if (problem) return { ok: false, error: problem };
  const r = await rules();
  const linesBad = linesProblem(d.lines, r.plans, pp[0].channel);
  if (linesBad) return { ok: false, error: linesBad };
  const late = startRefusal(d.startDate, d.lines, today(), r);
  if (late) return { ok: false, error: late };
  const rows = await db
    .insert(farmSubscriptions)
    .values({ subscriberId: d.subscriberId, subscriberPickupPointId: d.subscriberPickupPointId, cadence, startDate: d.startDate, endDate: d.endDate, flatPlan: [{ from: d.startDate, lines: d.lines }], skips: [], pausedFrom: null, notes: d.notes || null, createdBy: access.userId })
    .returning({ id: farmSubscriptions.id });
  if (!rows[0]) return { ok: false, error: 'Failed to start the subscription.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id: rows[0].id };
}

// ── The flat plan ───────────────────────────────────────────────────────────

export async function changeFlatPlan(...args: Parameters<typeof changeFlatPlanInner>): ReturnType<typeof changeFlatPlanInner> {
  return withWorkspace(() => changeFlatPlanInner(...args));
}

async function changeFlatPlanInner(input: unknown): Promise<Result<{ from: string }>> {
  const parsed = z.object({ id: z.string().uuid(), lines: Lines }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const denied = await guard();
  if (denied) return denied;
  const hit = await load(parsed.data.id);
  if (!hit) return { ok: false, error: 'Subscription not found.' };
  return applyFlatPlan(hit, parsed.data.lines);
}

// ── Skip ────────────────────────────────────────────────────────────────────

const DateInput = z.object({ id: z.string().uuid(), date: isoDate });

export async function skipDistribution(...args: Parameters<typeof skipDistributionInner>): ReturnType<typeof skipDistributionInner> {
  return withWorkspace(() => skipDistributionInner(...args));
}

async function skipDistributionInner(input: unknown): Promise<Result> {
  const parsed = DateInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const signedOut = await signedIn();
  if (signedOut) return signedOut;
  const hit = await load(parsed.data.id);
  if (!hit) return { ok: false, error: 'Subscription not found.' };
  const denied = await ownerGuard(hit.sub.subscriberId);
  if (denied) return denied;
  const refusal = skipRefusal(hit.sub, parsed.data.date, today(), await rules());
  if (refusal) return { ok: false, error: refusal };
  await save(hit.sub.id, { skips: [...hit.sub.skips, parsed.data.date].sort() });
  return { ok: true };
}

export async function unskipDistribution(...args: Parameters<typeof unskipDistributionInner>): ReturnType<typeof unskipDistributionInner> {
  return withWorkspace(() => unskipDistributionInner(...args));
}

/** A skipped distribution comes back only while its trays can still be sown. */
async function unskipDistributionInner(input: unknown): Promise<Result> {
  const parsed = DateInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const signedOut = await signedIn();
  if (signedOut) return signedOut;
  const hit = await load(parsed.data.id);
  if (!hit) return { ok: false, error: 'Subscription not found.' };
  const denied = await ownerGuard(hit.sub.subscriberId);
  if (denied) return denied;
  if (!hit.sub.skips.includes(parsed.data.date)) return { ok: false, error: `${parsed.data.date} is not skipped.` };
  const sow = sowDateOf(flatPlanOn(hit.sub, parsed.data.date), parsed.data.date, await rules());
  if (sow !== null && sow <= today()) return { ok: false, error: `The trays for ${parsed.data.date} would have been sown on ${sow}; it stays skipped.` };
  await save(hit.sub.id, { skips: hit.sub.skips.filter((d) => d !== parsed.data.date) });
  return { ok: true };
}

// ── Pause and resume ────────────────────────────────────────────────────────

const IdInput = z.object({ id: z.string().uuid() });

export async function pauseSubscription(...args: Parameters<typeof pauseSubscriptionInner>): ReturnType<typeof pauseSubscriptionInner> {
  return withWorkspace(() => pauseSubscriptionInner(...args));
}

async function pauseSubscriptionInner(input: unknown): Promise<Result<{ from: string }>> {
  const parsed = IdInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const signedOut = await signedIn();
  if (signedOut) return signedOut;
  const hit = await load(parsed.data.id);
  if (!hit) return { ok: false, error: 'Subscription not found.' };
  const denied = await ownerGuard(hit.sub.subscriberId);
  if (denied) return denied;
  if (hit.sub.pausedFrom !== null) return { ok: false, error: `Already paused from ${hit.sub.pausedFrom}.` };
  const from = firstUnsown(hit.sub, today(), await rules());
  if (from === null) return { ok: false, error: 'No distribution ahead can still be paused.' };
  await save(hit.sub.id, { pausedFrom: from });
  return { ok: true, from };
}

export async function resumeSubscription(...args: Parameters<typeof resumeSubscriptionInner>): ReturnType<typeof resumeSubscriptionInner> {
  return withWorkspace(() => resumeSubscriptionInner(...args));
}

/**
 * Resume a pause: distributions while it held, whose sow dates have passed, were never sown and
 * stay off as skips; the subscription runs again from the first distribution still to be sown.
 */
async function resumeSubscriptionInner(input: unknown): Promise<Result<{ from: string | null }>> {
  const parsed = IdInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const signedOut = await signedIn();
  if (signedOut) return signedOut;
  const hit = await load(parsed.data.id);
  if (!hit) return { ok: false, error: 'Subscription not found.' };
  const denied = await ownerGuard(hit.sub.subscriberId);
  if (denied) return denied;
  const pausedFrom = hit.sub.pausedFrom;
  if (pausedFrom === null) return { ok: false, error: 'The subscription is not paused.' };
  const running = { ...hit.sub, pausedFrom: null };
  const from = firstUnsown(running, today(), await rules());
  const missed = cadenceDates(running, pausedFrom, from ?? '9999-12-31').filter((d) => from === null || d < from);
  await save(hit.sub.id, { pausedFrom: null, skips: [...new Set([...hit.sub.skips, ...missed])].sort() });
  return { ok: true, from };
}

// ── End and remove ──────────────────────────────────────────────────────────

export async function endSubscription(...args: Parameters<typeof endSubscriptionInner>): ReturnType<typeof endSubscriptionInner> {
  return withWorkspace(() => endSubscriptionInner(...args));
}

/** Set the last date; distributions already sown are kept, so it cannot fall before the first unsown one. */
async function endSubscriptionInner(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid(), endDate: isoDate.nullable() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const denied = await guard();
  if (denied) return denied;
  const hit = await load(parsed.data.id);
  if (!hit) return { ok: false, error: 'Subscription not found.' };
  const end = parsed.data.endDate;
  if (end !== null) {
    if (end < hit.sub.startDate) return { ok: false, error: 'The last date is on or after the first distribution.' };
    const from = firstUnsown(hit.sub, today(), await rules());
    const sownAfter = cadenceDates(hit.sub, end, '9999-12-31').filter((d) => d > end && (from === null || d < from));
    if (sownAfter.length) return { ok: false, error: `The trays for ${sownAfter.join(', ')} are already sown; the last date is on or after ${sownAfter.at(-1)}.` };
  }
  await save(hit.sub.id, { endDate: end });
  return { ok: true };
}

export async function deleteSubscription(...args: Parameters<typeof deleteSubscriptionInner>): ReturnType<typeof deleteSubscriptionInner> {
  return withWorkspace(() => deleteSubscriptionInner(...args));
}

/** Remove a subscription no stored order names; one with orders on file is ended instead. */
async function deleteSubscriptionInner(input: unknown): Promise<Result> {
  const parsed = IdInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const denied = await guard();
  if (denied) return denied;
  const named = await db.select({ id: farmOrders.id }).from(farmOrders).where(eq(farmOrders.subscriptionId, parsed.data.id)).limit(1);
  if (named[0]) return { ok: false, error: 'An order on file names this subscription; set its last date instead.' };
  await db.delete(farmSubscriptions).where(eq(farmSubscriptions.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
