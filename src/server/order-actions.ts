'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { farmOrders, farmSubscribers, farmSubscriberPickupPoints, farmDistributions, farmGrowPlans, farmSubscriptions } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmOperator, requireFarmSuperAdmin } from '@/server/access';
import { periodOf } from '@/engine/actuals';
import { refuseIfLocked } from '@/server/periods';
import { appendPosting } from '@/server/posting-log';
import { withWorkspace } from '@/server/workspace';

/**
 * Cotyledon — orders, writes. SUPER ADMIN ONLY, except distributing, which an operator records.
 *
 * A stored order is a fact of record. A forecast order a subscription derives is read, not written
 * here; confirming it writes the row that replaces it. A Forecast Subscriber takes no stored order
 * and no distribution: it is never on Actual. Distributing an order writes the distribution record
 * (the document revenue posts from) and links the order to it.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });

const OrderInput = z.object({
  orderDate: isoDate,
  subscriberId: z.string().uuid(),
  subscriberPickupPointId: z.string().uuid(),
  subscriptionId: z.string().uuid().nullable().default(null),
  growPlanCode: z.string().min(1, 'Name the grow plan').max(40),
  units: z.number().min(0),
  status: z.enum(['forecast', 'confirmed']).default('forecast'),
  pricePerUnitCents: z.number().int().min(0).nullable().default(null),
  source: z.enum(['typed', 'subscription', 'sales', 'portal']).default('typed'),
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

async function growPlanExists(code: string): Promise<boolean> {
  const r = await db.select({ id: farmGrowPlans.id }).from(farmGrowPlans).where(eq(farmGrowPlans.code, code)).limit(1);
  return Boolean(r[0]);
}

/** Store an order: a typed forecast, or a confirmed count (from a derived forecast order or typed). */
export async function createOrder(...args: Parameters<typeof createOrderInner>): ReturnType<typeof createOrderInner> {
  return withWorkspace(() => createOrderInner(...args));
}

async function createOrderInner(input: unknown): Promise<Result<{ id: string }>> {
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
  if (d.subscriptionId) {
    const sub = await db.select({ id: farmSubscriptions.id }).from(farmSubscriptions).where(and(eq(farmSubscriptions.id, d.subscriptionId), eq(farmSubscriptions.subscriberPickupPointId, d.subscriberPickupPointId))).limit(1);
    if (!sub[0]) return { ok: false, error: 'The subscription is not one at this pickup point.' };
  }
  if (!(await growPlanExists(d.growPlanCode))) return { ok: false, error: `${d.growPlanCode} is not in the grow plan library.` };
  const clash = await db
    .select({ id: farmOrders.id })
    .from(farmOrders)
    .where(
      and(
        eq(farmOrders.orderDate, d.orderDate),
        eq(farmOrders.subscriberPickupPointId, d.subscriberPickupPointId),
        eq(farmOrders.growPlanCode, d.growPlanCode),
        d.subscriptionId ? eq(farmOrders.subscriptionId, d.subscriptionId) : isNull(farmOrders.subscriptionId),
      ),
    )
    .limit(1);
  if (clash[0]) return { ok: false, error: 'An order for that pickup point, subscription, date and grow plan is already on file; edit it instead.' };
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
  growPlanCode: z.string().min(1).max(40),
  units: z.number().min(0),
  status: z.enum(['forecast', 'confirmed']),
  pricePerUnitCents: z.number().int().min(0).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});

/** Edit a stored order that has not been distributed. */
export async function updateOrder(...args: Parameters<typeof updateOrderInner>): ReturnType<typeof updateOrderInner> {
  return withWorkspace(() => updateOrderInner(...args));
}

async function updateOrderInner(input: unknown): Promise<Result> {
  const parsed = UpdateOrderInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...rest } = parsed.data;
  const current = await db.select({ status: farmOrders.status, subscriberPickupPointId: farmOrders.subscriberPickupPointId, subscriptionId: farmOrders.subscriptionId }).from(farmOrders).where(eq(farmOrders.id, id)).limit(1);
  if (!current[0]) return { ok: false, error: 'Order not found.' };
  if (current[0].status === 'distributed') return { ok: false, error: 'A distributed order is not edited; its distribution record is the fact.' };
  if (!(await growPlanExists(rest.growPlanCode))) return { ok: false, error: `${rest.growPlanCode} is not in the grow plan library.` };
  const clash = await db
    .select({ id: farmOrders.id })
    .from(farmOrders)
    .where(
      and(
        eq(farmOrders.orderDate, rest.orderDate),
        eq(farmOrders.subscriberPickupPointId, current[0].subscriberPickupPointId),
        eq(farmOrders.growPlanCode, rest.growPlanCode),
        current[0].subscriptionId ? eq(farmOrders.subscriptionId, current[0].subscriptionId) : isNull(farmOrders.subscriptionId),
      ),
    )
    .limit(1);
  if (clash[0] && clash[0].id !== id) return { ok: false, error: 'Another order for that pickup point, subscription, date and grow plan is already on file.' };
  await db.update(farmOrders).set({ ...rest, updatedAt: new Date() }).where(eq(farmOrders.id, id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

/** Remove a stored order. A distributed order keeps its distribution record on Actuals. */
export async function deleteOrder(...args: Parameters<typeof deleteOrderInner>): ReturnType<typeof deleteOrderInner> {
  return withWorkspace(() => deleteOrderInner(...args));
}

async function deleteOrderInner(input: unknown): Promise<Result> {
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
export async function distributeOrder(...args: Parameters<typeof distributeOrderInner>): ReturnType<typeof distributeOrderInner> {
  return withWorkspace(() => distributeOrderInner(...args));
}

async function distributeOrderInner(input: unknown): Promise<Result<{ distributionId: string }>> {
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
      notes: d.notes ?? `Order ${o.id} · ${o.growPlanCode}`,
      createdBy: access.userId,
    })
    .returning({ id: farmDistributions.id });
    const id = distribution[0]?.id;
    if (!id) return null;
    await tx.update(farmOrders).set({ status: 'distributed', distributionId: id, updatedAt: new Date() }).where(eq(farmOrders.id, o.id));
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_distribution', recordKind: 'distribution', recordId: id, period: periodOf(d.distributedOn), detail: { orderId: o.id, growPlanCode: o.growPlanCode, distributedOn: d.distributedOn, pickupPointName: pickupPoint?.name ?? null, units: d.units, pricePerUnitCents: d.pricePerUnitCents, lotCodes: d.lotCodes } });
    return id;
  });
  if (!distributionId) return { ok: false, error: 'Failed to record the distribution.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, distributionId };
}
