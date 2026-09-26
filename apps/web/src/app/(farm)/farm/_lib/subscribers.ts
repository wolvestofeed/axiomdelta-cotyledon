import 'server-only';
import { NOT_RATED, type MarkRating } from '../_data/mark';
import { asc, inArray } from 'drizzle-orm';
import { farmSubscribers, farmSubscriberPickupPoints, farmSubscriberServices, farmServiceVolumePicks, farmPickupPointCalendarRanges } from '@mf/db';
import { db } from '@/lib/db';
import type { SubscriberDef, SubscriberKind, SubscriberServiceDef, SubscriberStatus, SubscriberPickupPointStatus, PickupPointCalendarRangeDef } from '../_data/subscribers';
import { withSeedLock, insertSubscribers, dbSeedSubscribers, insertMissingFlatPlans } from './seed-writes';
import { isSubscriberPaymentTerms } from '../_data/working-capital';

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
    source: r.source === 'seed' ? 'seed' : 'user_built',
    rating: subscriberRating(r.ratingStatus, r.ratingStars, r.ratingRatedOn),
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
  }));
}

/** A stored rating as the mark's rating: stars 1–3 when rated; anything else reads not rated. */
function subscriberRating(status: string | null, stars: number | null, ratedOn: string | Date | null): MarkRating {
  const on = ratedOn === null ? undefined : typeof ratedOn === 'string' ? ratedOn : ratedOn.toISOString().slice(0, 10);
  if (status === 'rated' && (stars === 1 || stars === 2 || stars === 3)) return { status: 'rated', stars, ratedOn: on };
  if (status === 'in_review') return { status: 'in_review', since: on };
  return NOT_RATED;
}
