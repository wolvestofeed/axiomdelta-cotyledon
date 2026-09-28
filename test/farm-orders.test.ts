import { describe, it, expect } from 'vitest';
import { growPlanSeed } from '@/data/grow-plans-seed';

const seedGrowPlans = [...growPlanSeed];
import type { SubscriberDef } from '@/data/subscribers';
import { serviceSubscribers as seedSubscribers } from './support/service-subscribers';
import { seedSubscriptionCycles, seedFlatPlans, mondayOf, type SubscriptionCycleDef, type OrderDef } from '@/data/subscription-cycles';
import { flatPlanInForce, applyCycleToPlans, copyCycleToPlan, plansFromCycle } from '@/engine/flat-plans';
import { resolveSubscriberPickupPoints } from '@/engine/demand';
import {
  isoAddDays,
  weekdayOf,
  datesBetween,
  cycleDayOn,
  cycleGrowPlanOn,
  orderBook,
  orderKey,
  distributionDay,
  summarizeBook,
  bookRevenueCents,
  unitsByGrowPlan,
  pickupPointActualVsForecast,
  type BookOrder,
} from '@/engine/orders';

// 2026-09-14 is a Monday.
const MON = '2026-09-14';
const FRI = '2026-09-18';
const SAT = '2026-09-19';
const NEXT_MON = '2026-09-21';
const PRICES = { 1: 1000, 2: 1500, 3: 1600 };

function seedCycle(): SubscriptionCycleDef[] {
  return seedSubscriptionCycles(seedGrowPlans, MON);
}

/** The engine default subscribers with no term on file, so they serve every weekday in September 2026. */
function everyWeekday(cs: SubscriberDef[]): SubscriberDef[] {
  return cs.map((c) => ({ ...c, pickupPoints: c.pickupPoints.map((s) => ({ ...s, calendar: [] })) }));
}

/** Saved cycles plus a flat plan copied for each subscriber. */
function withPlans(subscribers: readonly SubscriberDef[]): SubscriptionCycleDef[] {
  const saved = seedCycle();
  return [...saved, ...seedFlatPlans(subscribers, saved)];
}

const plain = { subscriberId: null, subscriberServiceId: null, fromCycleId: null, endDate: null } as const;

describe('dates', () => {
  it('adds days, reads weekdays and lists inclusive ranges without a time zone in play', () => {
    expect(isoAddDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayOf(MON)).toBe(1);
    expect(weekdayOf(SAT)).toBe(6);
    expect(datesBetween(MON, FRI)).toHaveLength(5);
    expect(datesBetween(FRI, MON)).toEqual([]);
    expect(mondayOf('2026-09-17')).toBe(MON);
    expect(mondayOf('2026-09-13')).toBe('2026-09-07');
  });
});

describe('subscription cycle position', () => {
  const cycle: SubscriptionCycleDef = {
    id: 'c', channel: null, ...plain, name: 'five', startDate: MON, lengthDays: 5, weekdays: [1, 2, 3, 4, 5], status: 'active', notes: null, source: 'user_built',
    days: [1, 2, 3, 4, 5].map((day) => ({ day, growPlanCode: `R${day}` })),
  };

  it('day 1 on the start date, advancing one day per service weekday and wrapping', () => {
    expect(cycleDayOn(cycle, MON)).toBe(1);
    expect(cycleDayOn(cycle, FRI)).toBe(5);
    expect(cycleDayOn(cycle, NEXT_MON)).toBe(1);
    expect(cycleGrowPlanOn(cycle, '2026-09-16')).toBe('R3');
  });

  it('null on a weekday off the menu, before the start, or when inactive', () => {
    expect(cycleDayOn(cycle, SAT)).toBeNull();
    expect(cycleDayOn(cycle, '2026-09-11')).toBeNull();
    expect(cycleDayOn({ ...cycle, status: 'inactive' }, MON)).toBeNull();
  });

  it('a shorter cycle wraps inside the week and a missing day serves nothing', () => {
    const three = { ...cycle, lengthDays: 3, days: [{ day: 1, growPlanCode: 'A' }, { day: 2, growPlanCode: null }] };
    expect(cycleDayOn(three, '2026-09-17')).toBe(1);
    expect(cycleGrowPlanOn(three, '2026-09-15')).toBeNull();
    expect(cycleGrowPlanOn(three, '2026-09-16')).toBeNull();
  });

  it('counts weekdays by arithmetic across many weeks, matching a day-by-day count', () => {
    const far = '2029-03-14';
    let count = 0;
    for (let d = MON; d < far; d = isoAddDays(d, 1)) if (cycle.weekdays.includes(weekdayOf(d))) count++;
    expect(cycleDayOn(cycle, far)).toBe((count % 5) + 1);
    const tueThu = { ...cycle, weekdays: [2, 4], lengthDays: 3 };
    let c2 = 0;
    for (let d = MON; d < far; d = isoAddDays(d, 1)) if (tueThu.weekdays.includes(weekdayOf(d))) c2++;
    expect(cycleDayOn(tueThu, far)).toBe(weekdayOf(far) === 2 || weekdayOf(far) === 4 ? (c2 % 3) + 1 : null);
  });
});

describe('flat plans (Roadmap N4a)', () => {
  const base: SubscriptionCycleDef = {
    id: 'p', channel: null, subscriberId: 'c1', subscriberServiceId: null, fromCycleId: null, endDate: null, name: 'plan', startDate: MON, lengthDays: 1, weekdays: [1, 2, 3, 4, 5], status: 'active', notes: null, source: 'user_built',
    days: [{ day: 1, growPlanCode: 'A' }],
  };

  it('the latest-started plan in force wins; an ended or inactive plan does not serve', () => {
    const later = { ...base, id: 'later', startDate: '2026-09-16' };
    expect(flatPlanInForce([base, later], null, MON)?.id).toBe('p');
    expect(flatPlanInForce([base, later], null, '2026-09-16')?.id).toBe('later');
    expect(flatPlanInForce([{ ...later, endDate: '2026-09-16' }, base], null, '2026-09-17')?.id).toBe('p');
    expect(flatPlanInForce([{ ...base, status: 'inactive' }], null, MON)).toBeNull();
  });

  it('a plan for one service wins over the all-services plan on that service only', () => {
    const unit = { ...base, id: 'unit', subscriberServiceId: 'sv-unit', subscriptionId: null, startDate: '2026-09-01' };
    expect(flatPlanInForce([base, unit], 'sv-unit', MON)?.id).toBe('unit');
    expect(flatPlanInForce([base, unit], 'sv-breakfast', MON)?.id).toBe('p');
  });

  it('assigning copies a saved cycle; applying an edit moves only the picked plans', () => {
    const saved: SubscriptionCycleDef = { ...base, id: 'saved', subscriberId: null, lengthDays: 2, days: [{ day: 1, growPlanCode: 'A' }, { day: 2, growPlanCode: 'B' }] };
    const one = copyCycleToPlan(saved, 'c1', 'one', { startDate: '2026-10-05' });
    const two = copyCycleToPlan(saved, 'c2', 'two');
    expect(one).toMatchObject({ subscriberId: 'c1', fromCycleId: 'saved', startDate: '2026-10-05', lengthDays: 2 });
    expect(plansFromCycle([saved, one, two, base], 'saved').map((p) => p.id)).toEqual(['one', 'two']);
    const edited = { ...saved, lengthDays: 1, days: [{ day: 1, growPlanCode: 'C' }] };
    const [a, b] = applyCycleToPlans(edited, [one, two], new Set(['two']));
    expect(a.days.map((d) => d.growPlanCode)).toEqual(['A', 'B']);
    expect(b.days.map((d) => d.growPlanCode)).toEqual(['C']);
    expect(b.startDate).toBe(two.startDate);
    expect(b.subscriberId).toBe('c2');
  });
});

describe('the seed', () => {
  it('seeds saved cycles on no channel, and a flat plan copied for each subscriber that is not inactive', () => {
    const cycles = seedCycle();
    expect(cycles.every((c) => c.channel === null && c.subscriberId === null && c.source === 'seed')).toBe(true);
    expect(cycles[0].startDate).toBe(MON);
    expect(cycles[0].days.every((d) => d.growPlanCode === 'BROC-01')).toBe(true);
    const subscribers = seedSubscribers();
    const plans = seedFlatPlans(subscribers, cycles);
    // Every seed grow plan is authored for Subscriptions, so only the channel 1 cycle stands in.
    expect(cycles).toHaveLength(1);
    expect(plans.map((p) => p.subscriberId)).toEqual(subscribers.filter((c) => c.channel === 1).map((c) => c.id));
    expect(plans.every((p) => p.fromCycleId !== null)).toBe(true);
    expect(seedFlatPlans(subscribers, [...cycles, ...plans])).toEqual([]);
  });
});

describe('the order book', () => {
  const subscribers = everyWeekday(seedSubscribers());
  const pickupPoints = resolveSubscriberPickupPoints(subscribers);
  const base = { pickupPoints, subscribers, cycles: withPlans(subscribers), orders: [] as OrderDef[], from: MON, to: SAT, channelPriceCents: PRICES, growPlanNames: { 'BROC-01': 'Broccoli' } };
  const svc = (pickupPointIndex: number) => subscribers[0].pickupPoints[pickupPointIndex].services[0].id;

  it('derives one forecast order per service per service date, from the subscriber flat plan', () => {
    const book = orderBook(base);
    expect(book).toHaveLength(15);
    expect(book.every((o) => o.basis === 'derived' && o.status === 'forecast' && o.source === 'cycle' && o.id === null)).toBe(true);
    expect(book.every((o) => o.subscriberServiceId !== null && o.serviceName === 'Unit')).toBe(true);
    for (const d of datesBetween(MON, FRI)) {
      expect(distributionDay(book, d).totalUnits).toBe(1000);
    }
    expect(distributionDay(book, SAT).orders).toHaveLength(0);
    expect(book.every((o) => o.channel === 1)).toBe(true);
    expect(book[0].growPlanName).toBe('Broccoli');
    expect(book[0].priceBasis).toBe('channel');
    expect(book[0].pricePerUnitCents).toBe(1000);
  });

  it('a forecast volume pick moves its orders from that date and carries forward; the record does not move', () => {
    const pickupPoint = subscribers[0].pickupPoints[0];
    const edited = resolveSubscriberPickupPoints(subscribers, { services: { [svc(0)]: { picks: [{ effectiveDate: '2026-01-01', units: 492 }, { effectiveDate: '2026-09-16', units: 600 }] } } });
    const book = orderBook({ ...base, pickupPoints: edited });
    expect(book.find((o) => o.subscriberPickupPointId === pickupPoint.id && o.orderDate === MON)?.units).toBe(492);
    expect(book.find((o) => o.subscriberPickupPointId === pickupPoint.id && o.orderDate === '2026-09-16')?.units).toBe(600);
    expect(book.find((o) => o.subscriberPickupPointId === pickupPoint.id && o.orderDate === FRI)?.units).toBe(600);
    expect(distributionDay(book, FRI).totalUnits).toBe(1000 - 492 + 600);
    expect(subscribers[0].pickupPoints[0].services[0].picks).toHaveLength(1);
  });

  it('a second service on a pickup point is a second order that day; a forecast flat plan replaces the record plan', () => {
    const pickupPoint = subscribers[0].pickupPoints[0];
    const two: SubscriberDef[] = subscribers.map((c, i) => (i !== 0 ? c : { ...c, pickupPoints: c.pickupPoints.map((s, j) => (j !== 0 ? s : { ...s, services: [...s.services, { ...s.services[0], id: 'sv-breakfast', name: 'Breakfast', picks: [{ id: 'bp', effectiveDate: '2026-01-01', units: 80, notes: null }] }] })) }));
    const book = orderBook({ ...base, subscribers: two, pickupPoints: resolveSubscriberPickupPoints(two) });
    const mon = book.filter((o) => o.subscriberPickupPointId === pickupPoint.id && o.orderDate === MON);
    expect(mon.map((o) => o.serviceName).sort()).toEqual(['Breakfast', 'Unit']);
    const own: SubscriptionCycleDef = { id: 'fp', channel: null, subscriberId: subscribers[0].id, subscriberServiceId: null, fromCycleId: null, endDate: null, name: 'forecast plan', startDate: MON, lengthDays: 1, weekdays: [1, 2, 3, 4, 5], status: 'active', notes: null, source: 'user_built', days: [{ day: 1, growPlanCode: 'PEA-01' }] };
    const f = orderBook({ ...base, pickupPoints: resolveSubscriberPickupPoints(subscribers, { flatPlans: { [subscribers[0].id]: [own] } }) });
    expect(f.filter((o) => o.subscriberId === subscribers[0].id).every((o) => o.growPlanCode === 'PEA-01' && o.subscriptionCycleId === 'fp')).toBe(true);
  });

  it('a stored order replaces the derived one with the same date, pickup point and grow plan; another grow plan adds', () => {
    const pickupPoint = subscribers[0].pickupPoints[0];
    const confirmed: OrderDef = { id: 'o1', orderDate: MON, subscriberId: subscribers[0].id, subscriberPickupPointId: pickupPoint.id, subscriberServiceId: svc(0), subscriptionId: null, channel: 1, growPlanCode: 'BROC-01', units: 450, status: 'confirmed', pricePerUnitCents: null, distributionId: null, subscriptionCycleId: 'CYCLE-SEED-1', source: 'cycle', notes: null };
    const extra: OrderDef = { ...confirmed, id: 'o2', growPlanCode: 'PEA-01', units: 40, status: 'forecast', source: 'typed', subscriptionCycleId: null };
    const book = orderBook({ ...base, orders: [confirmed, extra] });
    expect(book).toHaveLength(16);
    const day = distributionDay(book, MON, subscribers[0].id);
    expect(day.totalUnits).toBe(1000 - 492 + 450 + 40);
    const row = book.find((o) => o.key === orderKey(MON, pickupPoint.id, 'BROC-01', svc(0)));
    expect(row?.basis).toBe('record');
    expect(row?.status).toBe('confirmed');
    expect(row?.id).toBe('o1');
    expect(day.byGrowPlan.map((r) => r.growPlanCode)).toEqual(['BROC-01', 'PEA-01']);
    expect(day.byPickupPoint).toHaveLength(3);
  });

  it('the price in force is the order, else the contract, else the channel default', () => {
    const custs = everyWeekday(seedSubscribers());
    custs[0].pricePerUnitCents = 950;
    const s = resolveSubscriberPickupPoints(custs);
    const pickupPoint = custs[0].pickupPoints[1];
    const typed: OrderDef = { id: 'o', orderDate: MON, subscriberId: custs[0].id, subscriberPickupPointId: pickupPoint.id, subscriberServiceId: null, subscriptionId: null, channel: 1, growPlanCode: 'BROC-01', units: 10, status: 'forecast', pricePerUnitCents: 1200, distributionId: null, subscriptionCycleId: null, source: 'typed', notes: null };
    const book = orderBook({ ...base, pickupPoints: s, subscribers: custs, orders: [typed] });
    const derived = book.find((o) => o.basis === 'derived');
    expect(derived?.priceBasis).toBe('contract');
    expect(derived?.pricePerUnitCents).toBe(950);
    const onOrder = book.find((o) => o.id === 'o');
    expect(onOrder?.priceBasis).toBe('order');
    expect(onOrder?.pricePerUnitCents).toBe(1200);
  });

  it('a stored order outside the range is not in the book; one for a removed pickup point still shows', () => {
    const pickupPoint = subscribers[0].pickupPoints[0];
    const outside: OrderDef = { id: 'x', orderDate: '2026-10-05', subscriberId: subscribers[0].id, subscriberPickupPointId: pickupPoint.id, subscriberServiceId: null, subscriptionId: null, channel: 1, growPlanCode: 'BROC-01', units: 1, status: 'confirmed', pricePerUnitCents: null, distributionId: null, subscriptionCycleId: null, source: 'typed', notes: null };
    const orphan: OrderDef = { ...outside, id: 'y', orderDate: MON, subscriberPickupPointId: 'gone', subscriberId: 'gone' };
    const book = orderBook({ ...base, orders: [outside, orphan] });
    expect(book.find((o) => o.id === 'x')).toBeUndefined();
    const y = book.find((o) => o.id === 'y');
    expect(y?.pickupPointName).toBe('Pickup point removed');
    expect(y?.priceBasis).toBe('channel');
  });

  it('summary, revenue and units by grow plan are computed from the book', () => {
    const pickupPoint = subscribers[0].pickupPoints[0];
    const distributed: OrderDef = { id: 'd', orderDate: MON, subscriberId: subscribers[0].id, subscriberPickupPointId: pickupPoint.id, subscriberServiceId: svc(0), subscriptionId: null, channel: 1, growPlanCode: 'BROC-01', units: 492, status: 'distributed', pricePerUnitCents: null, distributionId: 'del', subscriptionCycleId: null, source: 'cycle', notes: null };
    const book = orderBook({ ...base, orders: [distributed] });
    const s = summarizeBook(book);
    expect(s[1].distributedUnits).toBe(492);
    expect(s[1].derivedForecastUnits).toBe(5000 - 492);
    expect(s[1].totalUnits).toBe(5000);
    expect(s[1].serviceDates).toBe(5);
    expect(s[2].orders).toBe(0);
    expect(bookRevenueCents(book)).toBe(5000 * 1000);
    expect(unitsByGrowPlan(book)).toEqual([{ growPlanCode: 'BROC-01', growPlanName: 'Broccoli', units: 5000, orders: 15 }]);
  });

  it('a subscriber with no flat plan generates no forecast orders; saved cycles alone serve nobody', () => {
    expect(orderBook({ ...base, cycles: [] })).toHaveLength(0);
    expect(orderBook({ ...base, cycles: seedCycle() })).toHaveLength(0);
  });

  it('a pickup point calendar: orders fall inside a term and outside its breaks; the farm closure removes a date', () => {
    const termed: SubscriberDef[] = subscribers.map((c, i) => (i !== 0 ? c : { ...c, pickupPoints: c.pickupPoints.map((s) => ({ ...s, calendar: [{ id: 't', kind: 'term' as const, label: null, startDate: '2026-09-15', endDate: '2026-12-18' }, { id: 'b', kind: 'break' as const, label: null, startDate: '2026-09-17', endDate: '2026-09-17' }] })) }));
    const book = orderBook({ ...base, subscribers: termed, pickupPoints: resolveSubscriberPickupPoints(termed), closures: [{ startDate: FRI, endDate: FRI }] });
    expect([...new Set(book.map((o) => o.orderDate))]).toEqual(['2026-09-15', '2026-09-16']);
  });
});

describe('per-pickup-point actual against forecast (Roadmap I4)', () => {
  const row = (over: Partial<BookOrder> & Pick<BookOrder, 'subscriberPickupPointId' | 'orderDate' | 'units' | 'status' | 'basis'>): BookOrder => ({
    key: `${over.orderDate}|${over.subscriberPickupPointId}|R1`, id: over.basis === 'record' ? `id-${over.key ?? Math.random()}` : null,
    subscriberId: 'c1', subscriberName: 'Elm ISD', pickupPointName: `Pickup point ${over.subscriberPickupPointId}`, subscriberServiceId: null, subscriptionId: null, serviceName: null, distributionPickupPointId: null, channel: 1,
    growPlanCode: 'R1', growPlanName: 'Broccoli', source: 'cycle', pricePerUnitCents: 1000, priceBasis: 'channel', distributionId: null, subscriptionCycleId: null, notes: null,
    ...over,
  });
  const book: BookOrder[] = [
    row({ subscriberPickupPointId: 'A', orderDate: MON, units: 100, status: 'forecast', basis: 'derived' }),
    row({ subscriberPickupPointId: 'A', orderDate: FRI, units: 90, status: 'forecast', basis: 'record' }),
    row({ subscriberPickupPointId: 'A', orderDate: NEXT_MON, units: 120, status: 'confirmed', basis: 'record' }),
    row({ subscriberPickupPointId: 'B', orderDate: MON, units: 60, status: 'distributed', basis: 'record', distributionId: 'd1' }),
    row({ subscriberPickupPointId: 'B', orderDate: FRI, units: 60, status: 'distributed', basis: 'record', distributionId: 'd-missing' }),
    row({ subscriberPickupPointId: 'B', orderDate: FRI, units: 40, status: 'confirmed', basis: 'record', growPlanCode: 'R2', key: `${FRI}|B|R2` }),
  ];
  const rows = pickupPointActualVsForecast(book, new Map([['d1', 55]]));

  it('splits each pickup point by how far its orders have travelled', () => {
    const a = rows.find((r) => r.subscriberPickupPointId === 'A')!;
    expect(a).toMatchObject({ forecastUnits: 190, confirmedUnits: 120, distributedOrders: 0, distributedUnits: 0, serviceDates: 3 });
  });

  it('distributed units come from the distribution record, ordered units stay beside them', () => {
    const b = rows.find((r) => r.subscriberPickupPointId === 'B')!;
    expect(b.distributedOrders).toBe(2);
    expect(b.orderedOnDistributed).toBe(120);
    expect(b.distributedUnits).toBe(55 + 60); // the order with no record on file counts its ordered units
    expect(b.distributedLessOrdered).toBe(-5);
    expect(b.confirmedUnits).toBe(40);
    expect(b.serviceDates).toBe(2);
  });

  it('is sorted by subscriber then pickup point and covers every pickup point in the book', () => {
    expect(rows.map((r) => r.subscriberPickupPointId)).toEqual(['A', 'B']);
  });
});
