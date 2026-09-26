import 'server-only';
import { asc, inArray } from 'drizzle-orm';
import { farmSubscriptionCycles, farmSubscriptionCycleDays, farmOrders } from '@/db';
import { db } from '@/lib/db';
import {
  DEFAULT_WEEKDAYS,
  type SubscriptionCycleDef,
  type SubscriptionCycleStatus,
  type OrderDef,
  type OrderSource,
  type OrderStatus,
} from '@/data/subscription-cycles';
import { listCropPlans } from '@/server/crop-plans';
import { withSeedLock, insertSubscriptionCycles, dbSeedSubscriptionCycles, insertMissingFlatPlans } from '@/server/seed-writes';

/**
 * MicroFarm — subscription cycles and orders, read layer (server-only).
 *
 * On first read of an empty subscription-cycle table the saved menus (student and
 * adult) are inserted from the library, marked `source = 'seed'`, under an
 * advisory lock, with a flat plan copied for every subscriber that has none, so
 * forecast orders exist from the first read (Roadmap N4a). Orders are never
 * seeded: a forecast order from a cycle is derived on read, and every stored
 * order is a fact somebody typed, confirmed or distributed.
 */

const iso = (d: string | Date | null): string | null =>
  d === null ? null : typeof d === 'string' ? d : d.toISOString().slice(0, 10);

async function seedIfEmpty(): Promise<void> {
  const any = await db.select({ id: farmSubscriptionCycles.id }).from(farmSubscriptionCycles).limit(1);
  if (any[0]) return;
  const library = await listCropPlans();
  const today = new Date().toISOString().slice(0, 10);
  await withSeedLock(db, 'cycles', async (tx) => {
    const again = await tx.select({ id: farmSubscriptionCycles.id }).from(farmSubscriptionCycles).limit(1);
    if (again[0]) return;
    await insertSubscriptionCycles(tx, dbSeedSubscriptionCycles(library, today));
    await insertMissingFlatPlans(tx);
  });
}

export async function listSubscriptionCycles(): Promise<SubscriptionCycleDef[]> {
  await seedIfEmpty();
  const rows = await db.select().from(farmSubscriptionCycles).orderBy(asc(farmSubscriptionCycles.startDate), asc(farmSubscriptionCycles.createdAt));
  if (rows.length === 0) return [];
  const days = await db
    .select()
    .from(farmSubscriptionCycleDays)
    .where(inArray(farmSubscriptionCycleDays.cycleId, rows.map((r) => r.id)))
    .orderBy(asc(farmSubscriptionCycleDays.day));
  const byCycle = new Map<string, typeof days>();
  for (const d of days) {
    const arr = byCycle.get(d.cycleId) ?? [];
    arr.push(d);
    byCycle.set(d.cycleId, arr);
  }
  return rows.map((r) => ({
    id: r.id,
    channel: null,
    subscriberId: r.subscriberId,
    subscriberServiceId: r.subscriberServiceId,
    fromCycleId: r.fromCycleId,
    name: r.name,
    startDate: iso(r.startDate)!,
    endDate: iso(r.endDate),
    lengthDays: r.lengthDays,
    weekdays: Array.isArray(r.weekdays) ? (r.weekdays as number[]).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [...DEFAULT_WEEKDAYS],
    status: (r.status === 'inactive' ? 'inactive' : 'active') as SubscriptionCycleStatus,
    notes: r.notes,
    source: r.source === 'seed' ? 'seed' : 'user_built',
    days: (byCycle.get(r.id) ?? []).map((d) => ({ day: d.day, cropPlanCode: d.cropPlanCode })),
  }));
}

const ORDER_STATUSES: OrderStatus[] = ['forecast', 'confirmed', 'distributed'];
const ORDER_SOURCES: OrderSource[] = ['typed', 'cycle', 'sales', 'portal'];

/** Every stored order, oldest date first. */
export async function listOrders(): Promise<OrderDef[]> {
  const rows = await db.select().from(farmOrders).orderBy(asc(farmOrders.orderDate), asc(farmOrders.createdAt));
  return rows.map((r) => ({
    id: r.id,
    orderDate: iso(r.orderDate)!,
    subscriberId: r.subscriberId,
    subscriberPickupPointId: r.subscriberPickupPointId,
    subscriberServiceId: r.subscriberServiceId,
    channel: r.channel,
    cropPlanCode: r.cropPlanCode,
    units: r.units,
    status: ORDER_STATUSES.includes(r.status as OrderStatus) ? (r.status as OrderStatus) : 'forecast',
    pricePerUnitCents: r.pricePerUnitCents,
    distributionId: r.distributionId,
    subscriptionCycleId: r.subscriptionCycleId,
    source: ORDER_SOURCES.includes(r.source as OrderSource) ? (r.source as OrderSource) : 'typed',
    notes: r.notes,
  }));
}
