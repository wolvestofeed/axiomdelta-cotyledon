import 'server-only';
import { asc, inArray } from 'drizzle-orm';
import { farmSubscriptions, farmSubscribers, farmSubscriberPickupPoints } from '@/db';
import { db } from '@/lib/db';
import type { SubscriberDef, SubscriberStatus, SubscriberPickupPointStatus } from '@/data/subscribers';
import { withSeedLock, insertSubscribers, dbSeedSubscribers } from '@/server/seed-writes';
import { isSubscriberPaymentTerms } from '@/data/working-capital';
import { isCadence, type FlatPlanLine, type SubscriptionDef } from '@/data/subscriptions';
import type { FarmSubscriptionRow } from '@/db';

/**
 * Cotyledon — subscribers read layer (server-only).
 *
 * On first read of an empty table the Plan seed is inserted, `source = 'seed'` (`seed-writes.ts`):
 * the nineteen Forecast Subscribers on weekly subscriptions and Rob's own tray. The insert runs
 * under an advisory lock so two parallel first reads cannot both seed.
 */

const iso = (d: string | Date | null): string | null =>
  d === null ? null : typeof d === 'string' ? d : d.toISOString().slice(0, 10);

async function seedIfEmpty(): Promise<void> {
  const any = await db.select({ id: farmSubscribers.id }).from(farmSubscribers).limit(1);
  if (any[0]) return;
  await withSeedLock(db, 'subscribers', async (tx) => {
    const again = await tx.select({ id: farmSubscribers.id }).from(farmSubscribers).limit(1);
    if (again[0]) return;
    await insertSubscribers(tx, dbSeedSubscribers());
  });
}

export async function listSubscribers(): Promise<SubscriberDef[]> {
  await seedIfEmpty();
  const rows = await db.select().from(farmSubscribers).orderBy(asc(farmSubscribers.channel), asc(farmSubscribers.createdAt));
  if (rows.length === 0) return [];
  const pickupPoints = await db
    .select()
    .from(farmSubscriberPickupPoints)
    .where(inArray(farmSubscriberPickupPoints.subscriberId, rows.map((r) => r.id)))
    .orderBy(asc(farmSubscriberPickupPoints.createdAt));
  const subscriptionsBySubscriber = new Map<string, SubscriptionDef[]>();
  for (const r of await db.select().from(farmSubscriptions).where(inArray(farmSubscriptions.subscriberId, rows.map((x) => x.id))).orderBy(asc(farmSubscriptions.startDate))) {
    subscriptionsBySubscriber.set(r.subscriberId, [...(subscriptionsBySubscriber.get(r.subscriberId) ?? []), toSubscription(r)]);
  }
  const bySubscriber = new Map<string, typeof pickupPoints>();
  for (const s of pickupPoints) {
    const arr = bySubscriber.get(s.subscriberId) ?? [];
    arr.push(s);
    bySubscriber.set(s.subscriberId, arr);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    channel: r.channel,
    status: (['prospect', 'contracted', 'forecast', 'inactive'].includes(r.status) ? r.status : 'prospect') as SubscriberStatus,
    pricePerUnitCents: r.pricePerUnitCents,
    paymentTerms: isSubscriberPaymentTerms(r.paymentTerms) ? r.paymentTerms : null,
    contractStart: iso(r.contractStart),
    contractEnd: iso(r.contractEnd),
    prospectId: r.prospectId,
    notes: r.notes,
    ownUse: r.ownUse === true,
    nutritionTargets: Array.isArray(r.nutritionTargets) ? (r.nutritionTargets as unknown[]).filter((k): k is string => typeof k === 'string') : [],
    source: r.source === 'seed' ? 'seed' : 'user_built',
    pickupPoints: (bySubscriber.get(r.id) ?? []).map((s) => ({
      id: s.id,
      pickupPointId: s.pickupPointId,
      name: s.name,
      status: s.status as SubscriberPickupPointStatus,
      notes: s.notes,
    })),
    subscriptions: subscriptionsBySubscriber.get(r.id) ?? [],
  }));
}

/** A stored subscription as its definition; a malformed flat plan line or skip is dropped. */
export function toSubscription(r: FarmSubscriptionRow): SubscriptionDef {
  const versions = Array.isArray(r.flatPlan) ? (r.flatPlan as unknown[]) : [];
  return {
    id: r.id,
    subscriberId: r.subscriberId,
    subscriberPickupPointId: r.subscriberPickupPointId,
    cadence: isCadence(r.cadence) ? r.cadence : 'biweekly',
    startDate: iso(r.startDate)!,
    endDate: iso(r.endDate),
    flatPlan: versions
      .filter((v): v is { from: string; lines: unknown[] } => typeof v === 'object' && v !== null && typeof (v as { from?: unknown }).from === 'string' && Array.isArray((v as { lines?: unknown }).lines))
      .map((v) => ({
        from: v.from,
        lines: v.lines
          .filter((l): l is FlatPlanLine => typeof l === 'object' && l !== null && typeof (l as FlatPlanLine).growPlanCode === 'string' && typeof (l as FlatPlanLine).units === 'number')
          .map((l) => ({ growPlanCode: l.growPlanCode, units: l.units })),
      })),
    skips: Array.isArray(r.skips) ? (r.skips as unknown[]).filter((d): d is string => typeof d === 'string') : [],
    pausedFrom: iso(r.pausedFrom),
    notes: r.notes,
  };
}
