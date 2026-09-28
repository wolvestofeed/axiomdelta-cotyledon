import { describe, it, expect } from 'vitest';
import { PLAN_FIRST_PICKUP, PLAN_SUBSCRIBERS, planSeedSubscribers, type SubscriberDef } from '@/data/subscribers';
import type { OrderDef } from '@/data/orders';
import { resolveSubscriberPickupPoints } from '@/engine/demand';
import {
  isoAddDays,
  weekdayOf,
  datesBetween,
  orderBook,
  orderKey,
  distributionDay,
  summarizeBook,
  bookRevenueCents,
  unitsByGrowPlan,
  pickupPointActualVsForecast,
  type BookOrder,
} from '@/engine/orders';

// The Plan's subscribers first pick up on Saturday 2026-10-17; the week before it is 2026-10-12 to 2026-10-18.
const SAT = PLAN_FIRST_PICKUP;
const MON = '2026-10-12';
const SUN = '2026-10-18';
const NEXT_SAT = '2026-10-24';
const PRICES = { 1: 3000, 2: 3000, 3: 3000 };

describe('dates', () => {
  it('adds days, reads weekdays and lists inclusive ranges without a time zone in play', () => {
    expect(isoAddDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(weekdayOf(MON)).toBe(1);
    expect(weekdayOf(SAT)).toBe(6);
    expect(datesBetween(MON, SAT)).toHaveLength(6);
    expect(datesBetween(SAT, MON)).toEqual([]);
  });
});

describe('the order book', () => {
  const subscribers = planSeedSubscribers();
  const own = subscribers.find((c) => c.ownUse)!;
  const pickupPoints = resolveSubscriberPickupPoints(subscribers);
  const base = { pickupPoints, subscribers, orders: [] as OrderDef[], from: MON, to: SUN, channelPriceCents: PRICES, growPlanNames: { 'BROC-01': 'Broccoli' } };
  const first = subscribers[0]!;
  const firstPickupPoint = first.pickupPoints[0]!;
  const firstSub = first.subscriptions![0]!;

  it('derives one forecast order per flat plan line on every distribution each subscription carries', () => {
    const book = orderBook(base);
    expect(book).toHaveLength(PLAN_SUBSCRIBERS + 1);
    expect(book.every((o) => o.basis === 'derived' && o.status === 'forecast' && o.source === 'subscription' && o.id === null && o.subscriptionId !== null)).toBe(true);
    expect(book.every((o) => o.orderDate === SAT && o.channel === 1 && o.units === 1)).toBe(true);
    expect(distributionDay(book, SAT).totalUnits).toBe(PLAN_SUBSCRIBERS + 1);
    for (const d of datesBetween(MON, SUN).filter((x) => x !== SAT)) expect(distributionDay(book, d).orders).toHaveLength(0);
    expect(book.find((o) => o.growPlanCode === 'BROC-01')?.growPlanName).toBe('Broccoli');
  });

  it('prices a subscriber\'s order at the channel price, the contracted price where one is on file, and at nothing for own use', () => {
    const book = orderBook(base);
    const ownOrder = book.find((o) => o.subscriberId === own.id)!;
    expect(ownOrder).toMatchObject({ pricePerUnitCents: 0, priceBasis: 'own-use' });
    expect(book.filter((o) => o.subscriberId !== own.id).every((o) => o.pricePerUnitCents === 3000 && o.priceBasis === 'channel')).toBe(true);
    const contracted: SubscriberDef[] = subscribers.map((c) => (c.id === first.id ? { ...c, pricePerUnitCents: 2500 } : c));
    const withContract = orderBook({ ...base, subscribers: contracted, pickupPoints: resolveSubscriberPickupPoints(contracted) });
    expect(withContract.find((o) => o.subscriberId === first.id)).toMatchObject({ pricePerUnitCents: 2500, priceBasis: 'contract' });
  });

  it('a stored order replaces the derived one with the same date, pickup point, subscription and grow plan; another grow plan adds', () => {
    const code = firstSub.flatPlan[0]!.lines[0]!.growPlanCode;
    const confirmed: OrderDef = { id: 'o1', orderDate: SAT, subscriberId: first.id, subscriberPickupPointId: firstPickupPoint.id, subscriptionId: firstSub.id, channel: 1, growPlanCode: code, units: 2, status: 'confirmed', pricePerUnitCents: null, distributionId: null, source: 'subscription', notes: null };
    const extra: OrderDef = { ...confirmed, id: 'o2', subscriptionId: null, growPlanCode: 'PEA-01', units: 1, status: 'forecast', source: 'typed' };
    const book = orderBook({ ...base, orders: [confirmed, extra] });
    expect(book).toHaveLength(PLAN_SUBSCRIBERS + 2);
    const day = distributionDay(book, SAT, first.id);
    expect(day.totalUnits).toBe(3);
    const row = book.find((o) => o.key === orderKey(SAT, firstPickupPoint.id, code, firstSub.id));
    expect(row?.basis).toBe('record');
    expect(row?.status).toBe('confirmed');
    expect(row?.id).toBe('o1');
    expect(day.byGrowPlan.map((r) => r.growPlanCode).sort()).toEqual([code, 'PEA-01'].sort());
  });

  it('the price in force on a stored order is the order\'s own, else the contract, else the channel default', () => {
    const typed: OrderDef = { id: 'o', orderDate: SAT, subscriberId: first.id, subscriberPickupPointId: firstPickupPoint.id, subscriptionId: null, channel: 1, growPlanCode: 'BROC-01', units: 10, status: 'forecast', pricePerUnitCents: 1200, distributionId: null, source: 'typed', notes: null };
    const book = orderBook({ ...base, orders: [typed] });
    expect(book.find((o) => o.id === 'o')).toMatchObject({ priceBasis: 'order', pricePerUnitCents: 1200 });
  });

  it('a stored order outside the range is not in the book; one for a removed pickup point still shows', () => {
    const outside: OrderDef = { id: 'x', orderDate: NEXT_SAT, subscriberId: first.id, subscriberPickupPointId: firstPickupPoint.id, subscriptionId: null, channel: 1, growPlanCode: 'BROC-01', units: 1, status: 'confirmed', pricePerUnitCents: null, distributionId: null, source: 'typed', notes: null };
    const orphan: OrderDef = { ...outside, id: 'y', orderDate: SAT, subscriberPickupPointId: 'gone', subscriberId: 'gone' };
    const book = orderBook({ ...base, orders: [outside, orphan] });
    expect(book.find((o) => o.id === 'x')).toBeUndefined();
    const y = book.find((o) => o.id === 'y');
    expect(y?.pickupPointName).toBe('Pickup point removed');
    expect(y?.priceBasis).toBe('channel');
  });

  it('summary, revenue and units by grow plan are computed from the book', () => {
    const code = firstSub.flatPlan[0]!.lines[0]!.growPlanCode;
    const distributed: OrderDef = { id: 'd', orderDate: SAT, subscriberId: first.id, subscriberPickupPointId: firstPickupPoint.id, subscriptionId: firstSub.id, channel: 1, growPlanCode: code, units: 1, status: 'distributed', pricePerUnitCents: null, distributionId: 'del', source: 'subscription', notes: null };
    const book = orderBook({ ...base, orders: [distributed] });
    const s = summarizeBook(book);
    expect(s[1]!.distributedUnits).toBe(1);
    expect(s[1]!.derivedForecastUnits).toBe(PLAN_SUBSCRIBERS);
    expect(s[1]!.totalUnits).toBe(PLAN_SUBSCRIBERS + 1);
    expect(s[1]!.serviceDates).toBe(1);
    expect(s[2]!.orders).toBe(0);
    // Own use is priced at nothing; every other tray at the channel price.
    expect(bookRevenueCents(book)).toBe(PLAN_SUBSCRIBERS * 3000);
    expect(unitsByGrowPlan(book).reduce((t, r) => t + r.units, 0)).toBe(PLAN_SUBSCRIBERS + 1);
  });

  it('a subscriber with no subscription generates no forecast orders', () => {
    const none = subscribers.map((c) => ({ ...c, subscriptions: [] }));
    expect(orderBook({ ...base, subscribers: none, pickupPoints: resolveSubscriberPickupPoints(none) })).toHaveLength(0);
  });

  it('a farm closure removes the distributions on its dates', () => {
    const closures = [{ startDate: SAT, endDate: SAT }];
    expect(orderBook({ ...base, pickupPoints: resolveSubscriberPickupPoints(subscribers, {}, { closures }), closures })).toHaveLength(0);
    expect(orderBook({ ...base, to: NEXT_SAT, pickupPoints: resolveSubscriberPickupPoints(subscribers, {}, { closures }), closures }).every((o) => o.orderDate === NEXT_SAT)).toBe(true);
  });
});

describe('per-pickup-point actual against forecast', () => {
  const row = (over: Partial<BookOrder> & Pick<BookOrder, 'subscriberPickupPointId' | 'orderDate' | 'units' | 'status' | 'basis'>): BookOrder => ({
    key: `${over.orderDate}|${over.subscriberPickupPointId}|R1`, id: over.basis === 'record' ? `id-${over.key ?? Math.random()}` : null,
    subscriberId: 'c1', subscriberName: 'Subscriber 1', pickupPointName: `Pickup point ${over.subscriberPickupPointId}`, subscriptionId: null, distributionPickupPointId: null, channel: 1,
    growPlanCode: 'R1', growPlanName: 'Broccoli', source: 'subscription', pricePerUnitCents: 3000, priceBasis: 'channel', distributionId: null, notes: null,
    ...over,
  });
  const book: BookOrder[] = [
    row({ subscriberPickupPointId: 'A', orderDate: MON, units: 100, status: 'forecast', basis: 'derived' }),
    row({ subscriberPickupPointId: 'A', orderDate: SAT, units: 90, status: 'forecast', basis: 'record' }),
    row({ subscriberPickupPointId: 'A', orderDate: NEXT_SAT, units: 120, status: 'confirmed', basis: 'record' }),
    row({ subscriberPickupPointId: 'B', orderDate: MON, units: 60, status: 'distributed', basis: 'record', distributionId: 'd1' }),
    row({ subscriberPickupPointId: 'B', orderDate: SAT, units: 60, status: 'distributed', basis: 'record', distributionId: 'd-missing' }),
    row({ subscriberPickupPointId: 'B', orderDate: SAT, units: 40, status: 'confirmed', basis: 'record', growPlanCode: 'R2', key: `${SAT}|B|R2` }),
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
