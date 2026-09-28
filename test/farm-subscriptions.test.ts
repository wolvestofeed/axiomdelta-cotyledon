/**
 * Subscriptions (outline §4 Subscriber): a cadence from the first distribution, a dated flat plan,
 * skips and a pause kept on the subscription, each read against the distribution's sow date, and
 * the order book deriving one order per flat plan line on every distribution carried.
 */
import { describe, it, expect } from 'vitest';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { seedSubscribers, type SubscriberDef } from '@/data/subscribers';
import type { SubscriptionDef } from '@/data/subscriptions';
import type { OrderDef } from '@/data/subscription-cycles';
import { cadenceDates, flatPlanOn, startProblem, subscriptionDistributions, weekOfMonth } from '@/engine/subscriptions';
import { firstUnsown, skipRefusal, sowDateOf, startRefusal, withFlatPlan } from '@/engine/subscription-cutoffs';
import { orderBook, orderKey } from '@/engine/orders';
import { recordPickupPoints, resolveSubscriberPickupPoints } from '@/engine/demand';

const plans = [...growPlanSeed];
const rules = { plans };
const BROC = [{ growPlanCode: 'BROC-01', units: 2 }];

const sub = (over: Partial<SubscriptionDef> = {}): SubscriptionDef => ({
  id: 'sub-1',
  subscriberId: 'c1',
  subscriberPickupPointId: 'pp-1',
  cadence: 'biweekly',
  startDate: '2026-10-10',
  endDate: null,
  flatPlan: [{ from: '2026-10-10', lines: BROC }],
  skips: [],
  pausedFrom: null,
  notes: null,
  ...over,
});

describe('the cadence', () => {
  it('falls weekly or every two weeks from the first distribution', () => {
    expect(cadenceDates(sub({ cadence: 'weekly' }), '2026-10-01', '2026-10-31')).toEqual(['2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31']);
    expect(cadenceDates(sub(), '2026-10-01', '2026-11-30')).toEqual(['2026-10-10', '2026-10-24', '2026-11-07', '2026-11-21']);
    // A window opening mid-cadence lands on the cadence, not on its own first day.
    expect(cadenceDates(sub(), '2026-10-12', '2026-11-08')).toEqual(['2026-10-24', '2026-11-07']);
  });

  it('falls monthly on the same weekday of the same week of the month, twelve a year', () => {
    expect(weekOfMonth('2026-10-10')).toBe(2);
    const monthly = cadenceDates(sub({ cadence: 'monthly' }), '2026-10-01', '2027-09-30');
    expect(monthly).toHaveLength(12);
    expect(monthly.slice(0, 4)).toEqual(['2026-10-10', '2026-11-14', '2026-12-12', '2027-01-09']);
    expect(monthly.every((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6 && weekOfMonth(d) === 2)).toBe(true);
    expect(startProblem('monthly', '2026-10-29')).toMatch(/first four weeks/);
    expect(startProblem('biweekly', '2026-10-29')).toBeNull();
  });

  it('stops at the last date', () => {
    expect(cadenceDates(sub({ endDate: '2026-10-30' }), '2026-10-01', '2026-12-31')).toEqual(['2026-10-10', '2026-10-24']);
  });
});

describe('what each distribution carries', () => {
  it('is the flat plan version in force on its date', () => {
    const s = sub({ flatPlan: [{ from: '2026-10-10', lines: BROC }, { from: '2026-11-07', lines: [{ growPlanCode: 'PEA-01', units: 1 }] }] });
    expect(flatPlanOn(s, '2026-10-24')).toEqual(BROC);
    expect(flatPlanOn(s, '2026-11-07')).toEqual([{ growPlanCode: 'PEA-01', units: 1 }]);
    expect(flatPlanOn(s, '2026-10-01')).toEqual([]);
  });

  it('is nothing on a skip, on and after a pause, or on a farm closure', () => {
    const d = subscriptionDistributions(sub({ skips: ['2026-10-24'], pausedFrom: '2026-11-21' }), '2026-10-01', '2026-12-31', [{ startDate: '2026-11-07', endDate: '2026-11-07' }]);
    expect(d.map((x) => [x.date, x.carried])).toEqual([
      ['2026-10-10', true],
      ['2026-10-24', false],
      ['2026-11-07', false],
      ['2026-11-21', false],
      ['2026-12-05', false],
      ['2026-12-19', false],
    ]);
    expect(d.find((x) => x.date === '2026-10-24')!.skipped).toBe(true);
    expect(d.find((x) => x.date === '2026-11-07')!.closed).toBe(true);
    expect(d.find((x) => x.date === '2026-12-05')!.paused).toBe(true);
  });
});

describe('the sow-date rules', () => {
  // BROC-01 is eleven days to harvest: a Saturday distribution is sown the Tuesday eleven days before.
  it('reads a distribution\'s sow date from its lines\' plans', () => {
    expect(sowDateOf(BROC, '2026-10-24', rules)).toBe('2026-10-13');
    expect(sowDateOf([{ growPlanCode: 'NONE-01', units: 1 }], '2026-10-24', rules)).toBeNull();
  });

  it('starts only on a first distribution that can still be sown for', () => {
    expect(startRefusal('2026-10-24', BROC, '2026-10-12', rules)).toBeNull();
    expect(startRefusal('2026-10-24', BROC, '2026-10-13', rules)).toMatch(/sown on 2026-10-13/);
    expect(startRefusal('2026-10-01', BROC, '2026-10-12', rules)).toMatch(/past/);
  });

  it('skips a distribution only before its sow date', () => {
    expect(skipRefusal(sub(), '2026-10-24', '2026-10-12', rules)).toBeNull();
    expect(skipRefusal(sub(), '2026-10-24', '2026-10-13', rules)).toMatch(/skipped before its sow date/);
    expect(skipRefusal(sub(), '2026-10-25', '2026-10-01', rules)).toMatch(/not a distribution/);
    expect(skipRefusal(sub({ skips: ['2026-10-24'] }), '2026-10-24', '2026-10-01', rules)).toMatch(/already skipped/);
  });

  it('pauses and changes the flat plan from the first distribution not yet sown', () => {
    // On the 14th the 24th is sown; the next distribution, 7 November, is not.
    expect(firstUnsown(sub(), '2026-10-14', rules)).toBe('2026-11-07');
    const next = withFlatPlan(sub(), [{ growPlanCode: 'PEA-01', units: 3 }], '2026-10-14', rules);
    expect('error' in next).toBe(false);
    if ('error' in next) return;
    expect(next.from).toBe('2026-11-07');
    expect(next.flatPlan).toEqual([{ from: '2026-10-10', lines: BROC }, { from: '2026-11-07', lines: [{ growPlanCode: 'PEA-01', units: 3 }] }]);
    // A later change gives way to an earlier one: the newest from-date wins from where it starts.
    const again = withFlatPlan({ ...sub(), flatPlan: next.flatPlan }, BROC, '2026-10-14', rules);
    expect('error' in again ? null : again.flatPlan).toEqual([{ from: '2026-10-10', lines: BROC }, { from: '2026-11-07', lines: BROC }]);
  });
});

describe('the order book', () => {
  const base = seedSubscribers()[0]!;
  const pp = { ...base.pickupPoints[0]!, services: [] };
  const subscriber: SubscriberDef = { ...base, status: 'contracted', channel: 1, pricePerUnitCents: 2000, pickupPoints: [pp], subscriptions: [sub({ subscriberId: base.id, subscriberPickupPointId: pp.id, flatPlan: [{ from: '2026-10-10', lines: [...BROC, { growPlanCode: 'PEA-01', units: 1 }] }], skips: ['2026-10-24'] })] };
  const input = { pickupPoints: resolveSubscriberPickupPoints([subscriber]), subscribers: [subscriber], cycles: [], orders: [] as OrderDef[], from: '2026-10-01', to: '2026-11-15', channelPriceCents: { 1: 2000, 2: 1500, 3: 2500 } };

  it('derives one forecast order per flat plan line on every distribution carried, at the subscriber\'s price', () => {
    const book = orderBook(input);
    expect(book.map((o) => [o.orderDate, o.growPlanCode, o.units])).toEqual([
      ['2026-10-10', 'BROC-01', 2],
      ['2026-10-10', 'PEA-01', 1],
      ['2026-11-07', 'BROC-01', 2],
      ['2026-11-07', 'PEA-01', 1],
    ].sort());
    expect(book.every((o) => o.source === 'subscription' && o.status === 'forecast' && o.subscriptionId === 'sub-1' && o.pricePerUnitCents === 2000)).toBe(true);
  });

  it('a confirmed order naming the subscription replaces the derived one', () => {
    const stored: OrderDef = { id: 'o1', orderDate: '2026-11-07', subscriberId: base.id, subscriberPickupPointId: pp.id, subscriberServiceId: null, subscriptionId: 'sub-1', channel: 1, growPlanCode: 'BROC-01', units: 3, status: 'confirmed', pricePerUnitCents: null, distributionId: null, subscriptionCycleId: null, source: 'subscription', notes: null };
    const book = orderBook({ ...input, orders: [stored] });
    const hit = book.filter((o) => o.key === orderKey('2026-11-07', pp.id, 'BROC-01', 'sub-1'));
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ id: 'o1', units: 3, status: 'confirmed', basis: 'record' });
    expect(book).toHaveLength(4);
  });

  it('an inactive subscriber carries no subscription', () => {
    expect(orderBook({ ...input, subscribers: [{ ...subscriber, status: 'inactive' }] })).toEqual([]);
  });

  it('a Forecast Subscriber\'s subscription is in the Plan and never on Actual', () => {
    const planOnly: SubscriberDef = { ...subscriber, status: 'forecast' };
    expect(orderBook({ ...input, subscribers: [planOnly], pickupPoints: resolveSubscriberPickupPoints([planOnly]) })).toHaveLength(4);
    expect(orderBook({ ...input, subscribers: [planOnly], pickupPoints: recordPickupPoints([planOnly]) })).toEqual([]);
  });
});
