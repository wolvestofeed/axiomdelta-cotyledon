'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  farmSubscriptionCycles,
  farmSubscriptionCycleDays,
  farmOrders,
  farmSubscribers,
  farmSubscriberPickupPoints,
  farmSubscriberServices,
  farmDistributions,
  farmCropPlans,
} from '@mf/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmOperator, requireFarmSuperAdmin } from './access';
import { periodOf } from '../_engine/actuals';
import { refuseIfLocked } from './periods';
import { appendPosting } from './posting-log';

/**
 * MicroFarm — subscription cycles, flat plans and orders, writes. SUPER ADMIN ONLY.
 *
 * A saved subscription cycle, a subscriber's flat plan and a stored order are facts of
 * record (Roadmap N4a). Assigning a cycle copies it onto the subscriber; editing
 * a saved cycle moves only the plans picked in the apply-to picker. A forecast
 * order a flat plan generates is derived on read and is not written here;
 * confirming it writes the row that replaces it. A Forecast Subscriber takes no
 * stored order and no distribution: it is never on Actual. Distributing an order writes the distribution
 * record (the document revenue posts from) and links the order to it.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });

// ── Subscription cycles ─────────────────────────────────────────────────────────────

const CycleInput = z.object({
  /** Null = a saved subscription cycle on the shared list; set = a flat plan programmed for this subscriber. */
  subscriberId: z.string().uuid().nullable().default(null),
  /** Set = the plan for one of the subscriber's services. */
  subscriberServiceId: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1, 'Name the cycle').max(200),
  startDate: isoDate,
  endDate: isoDate.nullable().default(null),
  lengthDays: z.number().int().min(1).max(60),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'A cycle serves on at least one weekday'),
  status: z.enum(['active', 'inactive']).default('active'),
  notes: z.string().max(2000).nullable().default(null),
  days: z.array(z.object({ day: z.number().int().min(1), cropPlanCode: z.string().max(40).nullable() })),
});

/** A plan for a service must name one of the subscriber's services. */
async function checkPlanOwner(d: { subscriberId: string | null; subscriberServiceId: string | null; endDate: string | null; startDate: string }): Promise<string | null> {
  if (d.endDate !== null && d.endDate < d.startDate) return 'The end date is before the start date.';
  if (d.subscriberServiceId === null) return null;
  if (d.subscriberId === null) return 'A saved subscription cycle is not tied to a service; assign it to a subscriber first.';
  const rows = await db
    .select({ id: farmSubscriberServices.id })
    .from(farmSubscriberServices)
    .innerJoin(farmSubscriberPickupPoints, eq(farmSubscriberPickupPoints.id, farmSubscriberServices.subscriberPickupPointId))
    .where(and(eq(farmSubscriberServices.id, d.subscriberServiceId), eq(farmSubscriberPickupPoints.subscriberId, d.subscriberId)))
    .limit(1);
  return rows[0] ? null : 'The service is not one of this subscriber’s services.';
}

async function checkCycleDays(d: z.infer<typeof CycleInput>): Promise<string | null> {
  const seen = new Set<number>();
  for (const day of d.days) {
    if (day.day > d.lengthDays) return `Day ${day.day} is past the cycle length of ${d.lengthDays}.`;
    if (seen.has(day.day)) return `Day ${day.day} appears twice.`;
    seen.add(day.day);
  }
  const codes = [...new Set(d.days.map((x) => x.cropPlanCode).filter((c): c is string => c !== null))];
  if (codes.length === 0) return null;
  const found = await db.select({ code: farmCropPlans.code }).from(farmCropPlans);
  const have = new Set(found.map((r) => r.code));
  const missing = codes.filter((c) => !have.has(c));
  return missing.length ? `Not in the crop plan library: ${missing.join(', ')}.` : null;
}

export async function createSubscriptionCycle(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = CycleInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const problem = (await checkCycleDays(parsed.data)) ?? (await checkPlanOwner(parsed.data));
  if (problem) return { ok: false, error: problem };
  const { days, ...header } = parsed.data;
  const inserted = await db
    .insert(farmSubscriptionCycles)
    .values({ ...header, weekdays: [...new Set(header.weekdays)].sort(), createdBy: access.userId })
    .returning({ id: farmSubscriptionCycles.id });
  const id = inserted[0]?.id;
  if (!id) return { ok: false, error: 'Failed to save the subscription cycle.' };
  if (days.length) await db.insert(farmSubscriptionCycleDays).values(days.map((d) => ({ cycleId: id, day: d.day, cropPlanCode: d.cropPlanCode })));
  revalidatePath('/farm', 'layout');
  return { ok: true, id };
}

/**
 * Edit a saved subscription cycle or a flat plan. For a saved cycle, `applyToPlanIds`
 * names the flat plans copied from it that take the new sequence — length,
 * weekdays and crop plan per day — the apply-to picker's selection or all of
 * them. A plan not named keeps its sequence. Each plan keeps its own subscriber,
 * service, start and end.
 */
export async function updateSubscriptionCycle(input: unknown): Promise<Result<{ applied: number }>> {
  const parsed = CycleInput.extend({ id: z.string().uuid(), applyToPlanIds: z.array(z.string().uuid()).default([]) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const problem = (await checkCycleDays(parsed.data)) ?? (await checkPlanOwner(parsed.data));
  if (problem) return { ok: false, error: problem };
  const { id, days, applyToPlanIds, ...header } = parsed.data;
  const current = await db.select({ id: farmSubscriptionCycles.id, subscriberId: farmSubscriptionCycles.subscriberId }).from(farmSubscriptionCycles).where(eq(farmSubscriptionCycles.id, id)).limit(1);
  if (!current[0]) return { ok: false, error: 'Subscription cycle not found.' };
  if ((current[0].subscriberId === null) !== (header.subscriberId === null)) return { ok: false, error: 'A saved cycle stays on the shared list and a flat plan stays with its subscriber; assign a copy instead.' };
  if (current[0].subscriberId !== null && current[0].subscriberId !== header.subscriberId) return { ok: false, error: 'A flat plan stays with its subscriber.' };
  if (current[0].subscriberId !== null && applyToPlanIds.length > 0) return { ok: false, error: 'Only a saved subscription cycle is applied to subscribers.' };
  const weekdays = [...new Set(header.weekdays)].sort();
  const applied = await db.transaction(async (tx) => {
    await tx.update(farmSubscriptionCycles).set({ ...header, weekdays, source: 'user_built', updatedAt: new Date() }).where(eq(farmSubscriptionCycles.id, id));
    await tx.delete(farmSubscriptionCycleDays).where(eq(farmSubscriptionCycleDays.cycleId, id));
    if (days.length) await tx.insert(farmSubscriptionCycleDays).values(days.map((d) => ({ cycleId: id, day: d.day, cropPlanCode: d.cropPlanCode })));
    if (applyToPlanIds.length === 0) return 0;
    const plans = await tx
      .select({ id: farmSubscriptionCycles.id })
      .from(farmSubscriptionCycles)
      .where(and(inArray(farmSubscriptionCycles.id, applyToPlanIds), eq(farmSubscriptionCycles.fromCycleId, id)));
    const planIds = plans.map((p) => p.id);
    if (planIds.length === 0) return 0;
    await tx.update(farmSubscriptionCycles).set({ lengthDays: header.lengthDays, weekdays, updatedAt: new Date() }).where(inArray(farmSubscriptionCycles.id, planIds));
    await tx.delete(farmSubscriptionCycleDays).where(inArray(farmSubscriptionCycleDays.cycleId, planIds));
    if (days.length) await tx.insert(farmSubscriptionCycleDays).values(planIds.flatMap((cycleId) => days.map((d) => ({ cycleId, day: d.day, cropPlanCode: d.cropPlanCode }))));
    return planIds.length;
  });
  revalidatePath('/farm', 'layout');
  return { ok: true, applied };
}

const AssignInput = z.object({
  cycleId: z.string().uuid(),
  subscriberIds: z.array(z.string().uuid()).min(1, 'Pick a subscriber'),
  /** Set = the plan for one service of a single subscriber. */
  subscriberServiceId: z.string().uuid().nullable().default(null),
  /** Absent = the cycle's own start date. */
  startDate: isoDate.nullable().default(null),
});

/** One-click assign: copy a saved subscription cycle onto each subscriber as its flat plan. */
export async function assignSubscriptionCycle(input: unknown): Promise<Result<{ ids: string[] }>> {
  const parsed = AssignInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  if (d.subscriberServiceId && d.subscriberIds.length !== 1) return { ok: false, error: 'A service plan is assigned to one subscriber at a time.' };
  const cycle = await db.select().from(farmSubscriptionCycles).where(and(eq(farmSubscriptionCycles.id, d.cycleId), isNull(farmSubscriptionCycles.subscriberId))).limit(1);
  const c = cycle[0];
  if (!c) return { ok: false, error: 'Saved subscription cycle not found.' };
  if (d.subscriberServiceId) {
    const problem = await checkPlanOwner({ subscriberId: d.subscriberIds[0], subscriberServiceId: d.subscriberServiceId, endDate: null, startDate: d.startDate ?? String(c.startDate) });
    if (problem) return { ok: false, error: problem };
  }
  const days = await db.select().from(farmSubscriptionCycleDays).where(eq(farmSubscriptionCycleDays.cycleId, c.id));
  const found = await db.select({ id: farmSubscribers.id }).from(farmSubscribers).where(inArray(farmSubscribers.id, d.subscriberIds));
  if (found.length !== new Set(d.subscriberIds).size) return { ok: false, error: 'A picked subscriber is not on the list.' };
  const ids = await db.transaction(async (tx) => {
    const out: string[] = [];
    for (const subscriberId of new Set(d.subscriberIds)) {
      const row = await tx
        .insert(farmSubscriptionCycles)
        .values({
          subscriberId,
          subscriberServiceId: d.subscriberServiceId,
          fromCycleId: c.id,
          name: c.name,
          startDate: d.startDate ?? c.startDate,
          lengthDays: c.lengthDays,
          weekdays: c.weekdays,
          status: 'active',
          notes: `Copied from ${c.name}.`,
          createdBy: access.userId,
        })
        .returning({ id: farmSubscriptionCycles.id });
      const id = row[0]?.id;
      if (!id) continue;
      if (days.length) await tx.insert(farmSubscriptionCycleDays).values(days.map((x) => ({ cycleId: id, day: x.day, cropPlanCode: x.cropPlanCode })));
      out.push(id);
    }
    return out;
  });
  revalidatePath('/farm', 'layout');
  return { ok: true, ids };
}

export async function deleteSubscriptionCycle(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.delete(farmSubscriptionCycles).where(eq(farmSubscriptionCycles.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

// ── Orders ──────────────────────────────────────────────────────────────────

const OrderInput = z.object({
  orderDate: isoDate,
  subscriberId: z.string().uuid(),
  subscriberPickupPointId: z.string().uuid(),
  subscriberServiceId: z.string().uuid().nullable().default(null),
  cropPlanCode: z.string().min(1, 'Name the crop plan').max(40),
  units: z.number().min(0),
  status: z.enum(['forecast', 'confirmed']).default('forecast'),
  pricePerUnitCents: z.number().int().min(0).nullable().default(null),
  subscriptionCycleId: z.string().uuid().nullable().default(null),
  source: z.enum(['typed', 'cycle', 'sales', 'portal']).default('typed'),
  notes: z.string().max(2000).nullable().default(null),
});

/** The pickup point must belong to the subscriber; the order takes the subscriber's channel. */
async function pickupPointOf(subscriberId: string, subscriberPickupPointId: string): Promise<{ channel: number; pickupPointId: string | null; name: string; subscriberStatus: string } | null> {
  const rows = await db
    .select({ channel: farmSubscribers.channel, pickupPointId: farmSubscriberPickupPoints.pickupPointId, name: farmSubscriberPickupPoints.name, subscriberStatus: farmSubscribers.status })
    .from(farmSubscriberPickupPoints)
    .innerJoin(farmSubscribers, eq(farmSubscribers.id, farmSubscriberPickupPoints.subscriberId))
    .where(and(eq(farmSubscriberPickupPoints.id, subscriberPickupPointId), eq(farmSubscribers.id, subscriberId)))
    .limit(1);
  return rows[0] ?? null;
}

async function cropPlanExists(code: string): Promise<boolean> {
  const r = await db.select({ id: farmCropPlans.id }).from(farmCropPlans).where(eq(farmCropPlans.code, code)).limit(1);
  return Boolean(r[0]);
}

/** Store an order: a typed forecast, or a confirmed count (from a derived forecast order or typed). */
export async function createOrder(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = OrderInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const pickupPoint = await pickupPointOf(d.subscriberId, d.subscriberPickupPointId);
  if (!pickupPoint) return { ok: false, error: 'The pickup point is not one of this subscriber’s pickup points.' };
  if (pickupPoint.subscriberStatus === 'forecast') return { ok: false, error: 'A Forecast Subscriber is never on Actual; its orders live in forecasts only.' };
  if (d.subscriberServiceId) {
    const sv = await db.select({ id: farmSubscriberServices.id }).from(farmSubscriberServices).where(and(eq(farmSubscriberServices.id, d.subscriberServiceId), eq(farmSubscriberServices.subscriberPickupPointId, d.subscriberPickupPointId))).limit(1);
    if (!sv[0]) return { ok: false, error: 'The service is not one of this pickup point’s services.' };
  }
  if (!(await cropPlanExists(d.cropPlanCode))) return { ok: false, error: `${d.cropPlanCode} is not in the crop plan library.` };
  const clash = await db
    .select({ id: farmOrders.id })
    .from(farmOrders)
    .where(
      and(
        eq(farmOrders.orderDate, d.orderDate),
        eq(farmOrders.subscriberPickupPointId, d.subscriberPickupPointId),
        eq(farmOrders.cropPlanCode, d.cropPlanCode),
        d.subscriberServiceId ? eq(farmOrders.subscriberServiceId, d.subscriberServiceId) : isNull(farmOrders.subscriberServiceId),
      ),
    )
    .limit(1);
  if (clash[0]) return { ok: false, error: 'An order for that pickup point, service, date and crop plan is already on file; edit it instead.' };
  const inserted = await db
    .insert(farmOrders)
    .values({ ...d, channel: pickupPoint.channel, createdBy: access.userId })
    .returning({ id: farmOrders.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to save the order.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id: inserted[0].id };
}

const UpdateOrderInput = z.object({
  id: z.string().uuid(),
  orderDate: isoDate,
  cropPlanCode: z.string().min(1).max(40),
  units: z.number().min(0),
  status: z.enum(['forecast', 'confirmed']),
  pricePerUnitCents: z.number().int().min(0).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});

/** Edit a stored order that has not been distributed. */
export async function updateOrder(input: unknown): Promise<Result> {
  const parsed = UpdateOrderInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...rest } = parsed.data;
  const current = await db.select({ status: farmOrders.status, subscriberPickupPointId: farmOrders.subscriberPickupPointId, subscriberServiceId: farmOrders.subscriberServiceId }).from(farmOrders).where(eq(farmOrders.id, id)).limit(1);
  if (!current[0]) return { ok: false, error: 'Order not found.' };
  if (current[0].status === 'distributed') return { ok: false, error: 'A distributed order is not edited; its distribution record is the fact.' };
  if (!(await cropPlanExists(rest.cropPlanCode))) return { ok: false, error: `${rest.cropPlanCode} is not in the crop plan library.` };
  const clash = await db
    .select({ id: farmOrders.id })
    .from(farmOrders)
    .where(
      and(
        eq(farmOrders.orderDate, rest.orderDate),
        eq(farmOrders.subscriberPickupPointId, current[0].subscriberPickupPointId),
        eq(farmOrders.cropPlanCode, rest.cropPlanCode),
        current[0].subscriberServiceId ? eq(farmOrders.subscriberServiceId, current[0].subscriberServiceId) : isNull(farmOrders.subscriberServiceId),
      ),
    )
    .limit(1);
  if (clash[0] && clash[0].id !== id) return { ok: false, error: 'Another order for that pickup point, service, date and crop plan is already on file.' };
  await db.update(farmOrders).set({ ...rest, updatedAt: new Date() }).where(eq(farmOrders.id, id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

/** Remove a stored order. A distributed order keeps its distribution record on Actuals. */
export async function deleteOrder(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.delete(farmOrders).where(eq(farmOrders.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

const DistributeInput = z.object({
  orderId: z.string().uuid(),
  distributedOn: isoDate,
  /** Units actually distributed; the order keeps what was ordered. */
  units: z.number().min(0),
  pricePerUnitCents: z.number().int().min(0),
  lotCodes: z.array(z.string().max(80)).default([]),
  distributedBy: z.string().max(120).nullable().default(null),
  handoffTempF: z.number().nullable().default(null),
  receivedBy: z.string().max(120).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});

/**
 * Distribute a stored order: write the distribution record (revenue and cost of goods
 * sold post from it) and link the order to it. The order's unit count is what
 * was ordered; the record's is what was distributed.
 */
export async function distributeOrder(input: unknown): Promise<Result<{ distributionId: string }>> {
  const parsed = DistributeInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const order = await db.select().from(farmOrders).where(eq(farmOrders.id, d.orderId)).limit(1);
  const o = order[0];
  if (!o) return { ok: false, error: 'Order not found.' };
  if (o.status === 'distributed' && o.distributionId) return { ok: false, error: 'This order already names a distribution record.' };
  const locked = await refuseIfLocked(d.distributedOn);
  if (locked) return { ok: false, error: locked };
  const pickupPoint = await pickupPointOf(o.subscriberId, o.subscriberPickupPointId);
  if (pickupPoint?.subscriberStatus === 'forecast') return { ok: false, error: 'A Forecast Subscriber is never on Actual; nothing is distributed to it.' };
  const distributionId = await db.transaction(async (tx) => {
    const distribution = await tx
    .insert(farmDistributions)
    .values({
      distributedOn: d.distributedOn,
      phase: o.channel,
      pickupPointId: pickupPoint?.pickupPointId ?? null,
      pickupPointName: pickupPoint?.name ?? null,
      units: d.units,
      pricePerUnitCents: d.pricePerUnitCents,
      lotCodes: d.lotCodes,
      distributedBy: d.distributedBy,
      handoffTempF: d.handoffTempF,
      receivedBy: d.receivedBy,
      subscriberId: o.subscriberId,
      notes: d.notes ?? `Order ${o.id} · ${o.cropPlanCode}`,
      createdBy: access.userId,
    })
    .returning({ id: farmDistributions.id });
    const id = distribution[0]?.id;
    if (!id) return null;
    await tx.update(farmOrders).set({ status: 'distributed', distributionId: id, updatedAt: new Date() }).where(eq(farmOrders.id, o.id));
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_distribution', recordKind: 'distribution', recordId: id, period: periodOf(d.distributedOn), detail: { orderId: o.id, cropPlanCode: o.cropPlanCode, distributedOn: d.distributedOn, pickupPointName: pickupPoint?.name ?? null, units: d.units, pricePerUnitCents: d.pricePerUnitCents, lotCodes: d.lotCodes } });
    return id;
  });
  if (!distributionId) return { ok: false, error: 'Failed to record the distribution.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, distributionId };
}
