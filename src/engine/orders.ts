/**
 * MicroFarm — orders and subscription cycles, engine-side.
 *
 * Ledger-free, database-free. The order book for a date range is the union of
 * two things:
 *
 *   1. DERIVED forecast orders — for every date each service runs (its
 *      weekdays, inside the pickup point's calendar, the farm open), the subscriber's
 *      flat plan crop plan on that date × the service's units per service in force
 *      (Roadmap N4a). Two services in a day are two orders. Computed every
 *      time; never stored.
 *   2. Stored orders — typed forecasts, confirmed counts, distributed orders.
 *      A stored row replaces the derived order with the same date, pickup point and
 *      crop plan.
 *
 * A prospect's full distribution day is every order on that date for that subscriber.
 */

import type { SubscriberDef } from '@/data/subscribers';
import type { SubscriptionCycleDef, OrderDef, OrderSource, OrderStatus } from '@/data/subscription-cycles';
import type { ResolvedPickupPointForecast } from '@/engine/demand';
import type { DateRange } from '@/engine/periods';
import { flatPlanCropPlanOn, flatPlansOf } from '@/engine/flat-plans';
import { normalizePicks, serviceRunsOn, volumeOn } from '@/engine/services';

// ── Dates (UTC arithmetic on ISO strings; no time zone in play) ─────────────

export function isoAddDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** Every ISO date from `from` to `to` inclusive; empty when `to` is before `from`. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = isoAddDays(d, 1)) out.push(d);
  return out;
}

// ── Cycle position ──────────────────────────────────────────────────────────

/**
 * The cycle day (1 .. lengthDays) a date falls on: the count of the cycle's
 * service weekdays from the start date to the date, modulo the length. Null
 * before the start date, on a weekday the cycle does not serve, or when the
 * cycle is inactive.
 */
export function cycleDayOn(cycle: Pick<SubscriptionCycleDef, 'startDate' | 'lengthDays' | 'weekdays' | 'status'>, date: string): number | null {
  if (cycle.status !== 'active') return null;
  if (date < cycle.startDate) return null;
  if (!cycle.weekdays.includes(weekdayOf(date))) return null;
  if (cycle.lengthDays < 1) return null;
  // Service weekdays in [startDate, date): whole weeks by arithmetic, the remainder counted.
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${cycle.startDate}T00:00:00Z`)) / 86_400_000);
  const perWeek = new Set(cycle.weekdays).size;
  let count = Math.floor(days / 7) * perWeek;
  const startWeekday = weekdayOf(cycle.startDate);
  for (let i = 0; i < days % 7; i++) if (cycle.weekdays.includes((startWeekday + i) % 7)) count++;
  return (count % cycle.lengthDays) + 1;
}

export function cycleCropPlanOn(cycle: SubscriptionCycleDef, date: string): string | null {
  const day = cycleDayOn(cycle, date);
  if (day === null) return null;
  return cycle.days.find((d) => d.day === day)?.cropPlanCode ?? null;
}

// ── The order book ──────────────────────────────────────────────────────────

export type OrderBasis = 'derived' | 'record';
export type PriceBasis = 'order' | 'contract' | 'channel';

export interface BookOrder {
  /** `${date}|${subscriberPickupPointId}|${subscriberServiceId}|${cropPlanCode}` — the identity a stored row replaces. */
  key: string;
  /** Stored row id; null for a derived forecast order. */
  id: string | null;
  orderDate: string;
  subscriberId: string;
  subscriberName: string;
  subscriberPickupPointId: string;
  pickupPointName: string;
  /** The service the order is for; null on a stored row typed before services existed. */
  subscriberServiceId: string | null;
  serviceName: string | null;
  /** distribution-pickup-point id when the subscriber pickup point is linked. */
  distributionPickupPointId: string | null;
  channel: number;
  cropPlanCode: string;
  cropPlanName: string;
  units: number;
  status: OrderStatus;
  basis: OrderBasis;
  source: OrderSource;
  /** The price in force, cents. */
  pricePerUnitCents: number;
  priceBasis: PriceBasis;
  distributionId: string | null;
  subscriptionCycleId: string | null;
  notes: string | null;
}

export const orderKey = (date: string, subscriberPickupPointId: string, cropPlanCode: string, subscriberServiceId: string | null = null): string =>
  `${date}|${subscriberPickupPointId}|${subscriberServiceId ?? ''}|${cropPlanCode}`;

export interface OrderBookInput {
  /** Pickup points with their services, calendars and the forecast's edits applied (`resolveSubscriberPickupPoints`). */
  pickupPoints: readonly ResolvedPickupPointForecast[];
  /** The subscriber library, for names and prices on stored rows whose pickup point is no longer forecast. */
  subscribers: readonly SubscriberDef[];
  /** Saved subscription cycles and every subscriber's flat plans. A forecast's own copy of a plan rides on the pickup point. */
  cycles: readonly SubscriptionCycleDef[];
  orders: readonly OrderDef[];
  from: string;
  to: string;
  /** Channel default price, cents, by phase. */
  channelPriceCents: Record<number, number>;
  /** Crop plan code → name, for display. */
  cropPlanNames?: Record<string, string>;
  /** Farm closures (major holidays): no derived forecast order falls on a closed date. Stored rows are kept. */
  closures?: readonly DateRange[];
}

function priceFor(order: number | null, contract: number | null, channelDefault: number | undefined): { cents: number; basis: PriceBasis } {
  if (order !== null) return { cents: order, basis: 'order' };
  if (contract !== null) return { cents: contract, basis: 'contract' };
  return { cents: channelDefault ?? 0, basis: 'channel' };
}

/** The order book for a date range: derived forecast orders with stored rows in their place. */
export function orderBook(input: OrderBookInput): BookOrder[] {
  const names = input.cropPlanNames ?? {};
  const byKey = new Map<string, BookOrder>();

  // Derived forecast orders: every service on every date it runs.
  const plansBySubscriber = new Map<string, SubscriptionCycleDef[]>();
  const plansFor = (s: ResolvedPickupPointForecast): SubscriptionCycleDef[] => {
    if (s.flatPlans) return s.flatPlans;
    let p = plansBySubscriber.get(s.subscriberId);
    if (!p) plansBySubscriber.set(s.subscriberId, (p = flatPlansOf(input.cycles, s.subscriberId)));
    return p;
  };
  for (const s of input.pickupPoints) {
    const plans = plansFor(s);
    for (const sv of s.services) {
      const picks = normalizePicks(sv.picks);
      if (!picks.some((p) => p.units > 0)) continue;
      for (const date of datesBetween(input.from, input.to)) {
        if (!serviceRunsOn(sv, s.calendar, date, input.closures)) continue;
        const units = volumeOn(picks, date);
        if (units <= 0) continue;
        const served = flatPlanCropPlanOn(plans, sv.id, date);
        if (!served) continue;
        const { cropPlanCode, plan } = served;
        const price = priceFor(null, s.pricePerUnitCents, input.channelPriceCents[s.channel]);
        const key = orderKey(date, s.id, cropPlanCode, sv.id);
        byKey.set(key, {
          key,
          id: null,
          orderDate: date,
          subscriberId: s.subscriberId,
          subscriberName: s.subscriberName,
          subscriberPickupPointId: s.id,
          pickupPointName: s.name,
          subscriberServiceId: sv.id,
          serviceName: sv.name,
          distributionPickupPointId: s.pickupPointId,
          channel: s.channel,
          cropPlanCode,
          cropPlanName: names[cropPlanCode] ?? cropPlanCode,
          units,
          status: 'forecast',
          basis: 'derived',
          source: 'cycle',
          pricePerUnitCents: price.cents,
          priceBasis: price.basis,
          distributionId: null,
          subscriptionCycleId: plan.id,
          notes: null,
        });
      }
    }
  }

  // Stored rows replace derived ones with the same key.
  const pickupPointIndex = new Map<string, { subscriber: SubscriberDef; pickupPoint: SubscriberDef['pickupPoints'][number] }>();
  for (const c of input.subscribers) for (const s of c.pickupPoints) pickupPointIndex.set(s.id, { subscriber: c, pickupPoint: s });
  const serviceName = new Map<string, string>();
  for (const c of input.subscribers) for (const s of c.pickupPoints) for (const sv of s.services ?? []) serviceName.set(sv.id, sv.name);
  for (const o of input.orders) {
    if (o.orderDate < input.from || o.orderDate > input.to) continue;
    const hit = pickupPointIndex.get(o.subscriberPickupPointId);
    const price = priceFor(o.pricePerUnitCents, hit?.subscriber.pricePerUnitCents ?? null, input.channelPriceCents[o.channel]);
    const key = orderKey(o.orderDate, o.subscriberPickupPointId, o.cropPlanCode, o.subscriberServiceId);
    byKey.set(key, {
      key,
      id: o.id,
      orderDate: o.orderDate,
      subscriberId: o.subscriberId,
      subscriberName: hit?.subscriber.name ?? 'Subscriber removed',
      subscriberPickupPointId: o.subscriberPickupPointId,
      pickupPointName: hit?.pickupPoint.name ?? 'Pickup point removed',
      subscriberServiceId: o.subscriberServiceId,
      serviceName: o.subscriberServiceId ? serviceName.get(o.subscriberServiceId) ?? 'Service removed' : null,
      distributionPickupPointId: hit?.pickupPoint.pickupPointId ?? null,
      channel: o.channel,
      cropPlanCode: o.cropPlanCode,
      cropPlanName: names[o.cropPlanCode] ?? o.cropPlanCode,
      units: o.units,
      status: o.status,
      basis: 'record',
      source: o.source,
      pricePerUnitCents: price.cents,
      priceBasis: price.basis,
      distributionId: o.distributionId,
      subscriptionCycleId: o.subscriptionCycleId,
      notes: o.notes,
    });
  }

  return [...byKey.values()].sort(
    (a, b) =>
      a.orderDate.localeCompare(b.orderDate) ||
      a.channel - b.channel ||
      a.subscriberName.localeCompare(b.subscriberName) ||
      a.pickupPointName.localeCompare(b.pickupPointName) ||
      (a.serviceName ?? '').localeCompare(b.serviceName ?? '') ||
      a.cropPlanCode.localeCompare(b.cropPlanCode),
  );
}

// ── Views over the book ─────────────────────────────────────────────────────

export interface CropPlanUnits {
  cropPlanCode: string;
  cropPlanName: string;
  units: number;
  orders: number;
}

export function unitsByCropPlan(orders: readonly BookOrder[]): CropPlanUnits[] {
  const m = new Map<string, CropPlanUnits>();
  for (const o of orders) {
    const row = m.get(o.cropPlanCode) ?? { cropPlanCode: o.cropPlanCode, cropPlanName: o.cropPlanName, units: 0, orders: 0 };
    row.units += o.units;
    row.orders += 1;
    m.set(o.cropPlanCode, row);
  }
  return [...m.values()].sort((a, b) => b.units - a.units || a.cropPlanCode.localeCompare(b.cropPlanCode));
}

export interface DistributionDay {
  date: string;
  subscriberId: string | null;
  orders: BookOrder[];
  byCropPlan: CropPlanUnits[];
  totalUnits: number;
  /** Units per pickup point, in book order. */
  byPickupPoint: { subscriberPickupPointId: string; pickupPointName: string; subscriberName: string; units: number }[];
}

/** Every order on a date, for one subscriber or for all. */
// ── Per-pickup-point actual against forecast (Roadmap I4) ───────────────────────────

export interface PickupPointActualVsForecast {
  subscriberPickupPointId: string;
  pickupPointName: string;
  subscriberName: string;
  channel: number;
  /** Service dates in the range with any order for the pickup point. */
  serviceDates: number;
  /** Units on derived orders and on typed forecast rows — not yet confirmed. */
  forecastUnits: number;
  /** Units on confirmed orders not yet distributed. */
  confirmedUnits: number;
  /** Distributed orders in the range. */
  distributedOrders: number;
  /** Units ordered on the distributed orders. */
  orderedOnDistributed: number;
  /** Units on the distribution records those orders name; an order whose record is missing counts its ordered units. */
  distributedUnits: number;
  /** distributedUnits − orderedOnDistributed, over distributed orders only. */
  distributedLessOrdered: number;
}

/**
 * Every pickup point in the book, with its units split by how far each order has
 * travelled: forecast, confirmed, distributed. Distributed units come from the
 * distribution record the order names (`distributionUnitsById`), so the pickup point's
 * actual sits beside the count that was ordered. A table of facts; it states
 * no action.
 */
export function pickupPointActualVsForecast(book: readonly BookOrder[], distributionUnitsById: ReadonlyMap<string, number>): PickupPointActualVsForecast[] {
  const rows = new Map<string, PickupPointActualVsForecast & { dates: Set<string> }>();
  for (const o of book) {
    const row = rows.get(o.subscriberPickupPointId) ?? {
      subscriberPickupPointId: o.subscriberPickupPointId, pickupPointName: o.pickupPointName, subscriberName: o.subscriberName, channel: o.channel, dates: new Set<string>(),
      serviceDates: 0, forecastUnits: 0, confirmedUnits: 0, distributedOrders: 0, orderedOnDistributed: 0, distributedUnits: 0, distributedLessOrdered: 0,
    };
    row.dates.add(o.orderDate);
    if (o.status === 'distributed') {
      const actual = (o.distributionId ? distributionUnitsById.get(o.distributionId) : undefined) ?? o.units;
      row.distributedOrders += 1;
      row.orderedOnDistributed += o.units;
      row.distributedUnits += actual;
    } else if (o.status === 'confirmed') row.confirmedUnits += o.units;
    else row.forecastUnits += o.units;
    rows.set(o.subscriberPickupPointId, row);
  }
  return [...rows.values()]
    .map(({ dates, ...r }) => ({ ...r, serviceDates: dates.size, distributedLessOrdered: r.distributedUnits - r.orderedOnDistributed }))
    .sort((a, b) => a.subscriberName.localeCompare(b.subscriberName) || a.pickupPointName.localeCompare(b.pickupPointName));
}

export function distributionDay(book: readonly BookOrder[], date: string, subscriberId: string | null = null): DistributionDay {
  const orders = book.filter((o) => o.orderDate === date && (subscriberId === null || o.subscriberId === subscriberId));
  const pickupPoints = new Map<string, DistributionDay['byPickupPoint'][number]>();
  for (const o of orders) {
    const row = pickupPoints.get(o.subscriberPickupPointId) ?? { subscriberPickupPointId: o.subscriberPickupPointId, pickupPointName: o.pickupPointName, subscriberName: o.subscriberName, units: 0 };
    row.units += o.units;
    pickupPoints.set(o.subscriberPickupPointId, row);
  }
  return {
    date,
    subscriberId,
    orders,
    byCropPlan: unitsByCropPlan(orders),
    totalUnits: orders.reduce((a, o) => a + o.units, 0),
    byPickupPoint: [...pickupPoints.values()],
  };
}

export interface ChannelBookSummary {
  channel: number;
  derivedForecastUnits: number;
  typedForecastUnits: number;
  confirmedUnits: number;
  distributedUnits: number;
  totalUnits: number;
  orders: number;
  serviceDates: number;
}

/** Units by status per channel over the book, and the dates with any order. */
export function summarizeBook(book: readonly BookOrder[], channels: readonly number[] = [1, 2, 3]): Record<number, ChannelBookSummary> {
  const out: Record<number, ChannelBookSummary> = {};
  for (const ch of channels) {
    const rows = book.filter((o) => o.channel === ch);
    out[ch] = {
      channel: ch,
      derivedForecastUnits: rows.filter((o) => o.basis === 'derived').reduce((a, o) => a + o.units, 0),
      typedForecastUnits: rows.filter((o) => o.basis === 'record' && o.status === 'forecast').reduce((a, o) => a + o.units, 0),
      confirmedUnits: rows.filter((o) => o.status === 'confirmed').reduce((a, o) => a + o.units, 0),
      distributedUnits: rows.filter((o) => o.status === 'distributed').reduce((a, o) => a + o.units, 0),
      totalUnits: rows.reduce((a, o) => a + o.units, 0),
      orders: rows.length,
      serviceDates: new Set(rows.map((o) => o.orderDate)).size,
    };
  }
  return out;
}

/** Revenue implied by the book at the prices in force, cents. Computed, never stored. */
export function bookRevenueCents(orders: readonly BookOrder[]): number {
  return orders.reduce((a, o) => a + Math.round(o.units * o.pricePerUnitCents), 0);
}
