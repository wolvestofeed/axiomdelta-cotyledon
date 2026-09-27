import 'server-only';
import { asc, inArray } from 'drizzle-orm';
import { farmSubscriptions, farmSubscribers, farmSubscriberPickupPoints, farmSubscriberServices, farmServiceVolumePicks, farmPickupPointCalendarRanges } from '@/db';
import { db } from '@/lib/db';
import type { SubscriberDef, SubscriberKind, SubscriberServiceDef, SubscriberStatus, SubscriberPickupPointStatus, PickupPointCalendarRangeDef } from '@/data/subscribers';
import { withSeedLock, insertSubscribers, dbSeedSubscribers, insertMissingFlatPlans } from '@/server/seed-writes';
import { isSubscriberPaymentTerms } from '@/data/working-capital';
import { isCadence, type FlatPlanLine, type SubscriptionDef } from '@/data/subscriptions';
import type { FarmSubscriptionRow } from '@/db';

/**
 * MicroFarm — subscribers read layer (server-only).
 *
 * On first read of an empty table the Plan seed is inserted, `source = 'seed'`
 * (`seed-writes.ts`): the one contracted subscriber at its stated 125 units a
 * day, and a prospect per channel carrying no volume. The insert runs under an
 * advisory lock so two parallel first reads cannot both seed.
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
  await withSeedLock(db, 'cycles', (tx) => insertMissingFlatPlans(tx));
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
  const pickupPointIds = pickupPoints.map((s) => s.id);
  const [serviceRows, calendarRows] = pickupPointIds.length
    ? await Promise.all([
        db.select().from(farmSubscriberServices).where(inArray(farmSubscriberServices.subscriberPickupPointId, pickupPointIds)).orderBy(asc(farmSubscriberServices.position), asc(farmSubscriberServices.createdAt)),
        db.select().from(farmPickupPointCalendarRanges).where(inArray(farmPickupPointCalendarRanges.subscriberPickupPointId, pickupPointIds)).orderBy(asc(farmPickupPointCalendarRanges.startDate)),
      ])
    : [[], []];
  const pickRows = serviceRows.length
    ? await db.select().from(farmServiceVolumePicks).where(inArray(farmServiceVolumePicks.serviceId, serviceRows.map((r) => r.id))).orderBy(asc(farmServiceVolumePicks.effectiveDate))
    : [];
  const servicesByPickupPoint = new Map<string, SubscriberServiceDef[]>();
  for (const r of serviceRows) {
    const arr = servicesByPickupPoint.get(r.subscriberPickupPointId) ?? [];
    arr.push({
      id: r.id,
      name: r.name,
      weekdays: Array.isArray(r.weekdays) ? (r.weekdays as number[]).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [1, 2, 3, 4, 5],
      status: r.status === 'inactive' ? 'inactive' : 'active',
      notes: r.notes,
      picks: pickRows.filter((p) => p.serviceId === r.id).map((p) => ({ id: p.id, effectiveDate: iso(p.effectiveDate)!, units: p.units, notes: p.notes })),
    });
    servicesByPickupPoint.set(r.subscriberPickupPointId, arr);
  }
  const calendarByPickupPoint = new Map<string, PickupPointCalendarRangeDef[]>();
  for (const r of calendarRows) {
    const arr = calendarByPickupPoint.get(r.subscriberPickupPointId) ?? [];
    arr.push({ id: r.id, kind: r.kind === 'break' ? 'break' : 'term', label: r.label, startDate: iso(r.startDate)!, endDate: iso(r.endDate)! });
    calendarByPickupPoint.set(r.subscriberPickupPointId, arr);
  }
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
    kind: r.kind as SubscriberKind,
    channel: r.channel,
    status: (['prospect', 'contracted', 'forecast', 'inactive'].includes(r.status) ? r.status : 'prospect') as SubscriberStatus,
    pricePerUnitCents: r.pricePerUnitCents,
    paymentTerms: isSubscriberPaymentTerms(r.paymentTerms) ? r.paymentTerms : null,
    contractStart: iso(r.contractStart),
    contractEnd: iso(r.contractEnd),
    prospectId: r.prospectId,
    notes: r.notes,
    nutritionTargets: Array.isArray(r.nutritionTargets) ? (r.nutritionTargets as unknown[]).filter((k): k is string => typeof k === 'string') : [],
    source: r.source === 'seed' ? 'seed' : 'user_built',
    pickupPoints: (bySubscriber.get(r.id) ?? []).map((s) => ({
      id: s.id,
      pickupPointId: s.pickupPointId,
      name: s.name,
      trayFormats: Array.isArray(s.trayFormats) ? (s.trayFormats as string[]) : [],
      serviceDaysPerYear: s.serviceDaysPerYear,
      enrollment: s.enrollment,
      participationRate: s.participationRate,
      expectedUnitsPerDay: s.expectedUnitsPerDay,
      status: s.status as SubscriberPickupPointStatus,
      notes: s.notes,
      services: servicesByPickupPoint.get(s.id) ?? [],
      calendar: calendarByPickupPoint.get(s.id) ?? [],
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
