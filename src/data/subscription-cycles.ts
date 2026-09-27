/**
 * MicroFarm — subscription cycles, flat plans and orders: the document shapes, and the seed.
 *
 * A subscription cycle is a saved grow plan sequence on the shared list. A flat plan is
 * the same shape carrying a subscriber: every subscriber has its own, copied from
 * a saved cycle in one click or programmed for it alone (Roadmap N4a,
 * operating-model-roadmap decision 19). A channel never decides what a
 * subscriber is served. An order is a date, subscriber, pickup point, service, grow plan,
 * units and a status. A forecast order generated from a flat plan is DERIVED —
 * the plan's grow plan on the date × the service's units per service — and is
 * never stored; the engine computes it on read (`_engine/orders.ts`). A stored
 * order is a typed forecast, a confirmed count, or a distributed order naming
 * its distribution record.
 */

import type { GrowPlanDef } from '@/data/grow-plan';

export type SubscriptionCycleStatus = 'active' | 'inactive';
export type OrderStatus = 'forecast' | 'confirmed' | 'distributed';
export type OrderSource = 'typed' | 'cycle' | 'subscription' | 'sales' | 'portal';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  forecast: 'Forecast',
  confirmed: 'Confirmed',
  distributed: 'Distributed',
};

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  typed: 'Typed',
  cycle: 'Flat plan',
  subscription: 'Subscription',
  sales: 'Sales workspace',
  portal: 'Subscriber portal',
};

/** 0 = Sunday … 6 = Saturday, matching `Date.getUTCDay()`. */
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

export interface SubscriptionCycleDayDef {
  /** 1 .. lengthDays */
  day: number;
  /** Library grow plan code; null = no service that day. */
  growPlanCode: string | null;
}

export interface SubscriptionCycleDef {
  id: string;
  /** @deprecated Roadmap N4a: cycles are not assigned to channels. Always null; dropped in N9. */
  channel: number | null;
  /** Null = a saved subscription cycle on the shared list; set = this subscriber's flat plan. */
  subscriberId: string | null;
  /** Set = the plan for this one service, winning over the subscriber's all-services plan. */
  subscriberServiceId: string | null;
  /** The saved cycle a flat plan was copied from. */
  fromCycleId: string | null;
  name: string;
  /** ISO date day 1 falls on. */
  startDate: string;
  /** Null = open-ended. */
  endDate: string | null;
  lengthDays: number;
  weekdays: number[];
  status: SubscriptionCycleStatus;
  notes: string | null;
  source: 'seed' | 'user_built';
  days: SubscriptionCycleDayDef[];
}

export interface OrderDef {
  id: string;
  orderDate: string;
  subscriberId: string;
  subscriberPickupPointId: string;
  /** The service the order is for; null on a row typed before services existed. */
  subscriberServiceId: string | null;
  /** The subscription the order is a distribution of; null on an order from a service or typed. */
  subscriptionId: string | null;
  channel: number;
  growPlanCode: string;
  units: number;
  status: OrderStatus;
  /** Null = the subscriber's contracted price, else the channel default. */
  pricePerUnitCents: number | null;
  distributionId: string | null;
  subscriptionCycleId: string | null;
  source: OrderSource;
  notes: string | null;
}

/** The Monday on or before an ISO date (UTC arithmetic; no time zone in play). */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** The seed cycles, one per channel group; the ids are the rows' keys in every workspace. */
export const SEED_CYCLE_SUBSCRIPTIONS = 'CYCLE-SEED-STUDENT';
export const SEED_CYCLE_OTHER_CHANNELS = 'CYCLE-SEED-ADULT';

const cycleShape = (id: string, name: string, startDate: string, codes: readonly string[], notes: string): SubscriptionCycleDef => ({
  id,
  channel: null,
  subscriberId: null,
  subscriberServiceId: null,
  fromCycleId: null,
  name,
  startDate,
  endDate: null,
  lengthDays: codes.length,
  weekdays: [...DEFAULT_WEEKDAYS],
  status: 'active',
  notes,
  source: 'seed',
  days: codes.map((code, i) => ({ day: i + 1, growPlanCode: code })),
});

/**
 * The saved subscription cycles the library starts with: for Subscriptions, and for the other
 * channels, five days of the first in-service plan offered there, Monday to Friday, anchored to the
 * Monday of the week the library is first read. A channel group with no plan in service has none.
 */
export function seedSubscriptionCycles(library: readonly GrowPlanDef[], today: string): SubscriptionCycleDef[] {
  const firstOn = (channels: readonly number[]) => library.find((r) => r.status === 'in_service' && channels.some((c) => r.channels.includes(c)));
  const start = mondayOf(today);
  const groups = [
    { id: SEED_CYCLE_SUBSCRIPTIONS, label: 'Subscriptions', channels: [1] },
    { id: SEED_CYCLE_OTHER_CHANNELS, label: 'Restaurants, retail and wholesale', channels: [2, 3] },
  ];
  return groups.flatMap((g) => {
    const r = firstOn(g.channels);
    return r ? [cycleShape(g.id, `${g.label} — five days of ${r.code}`, start, [r.code, r.code, r.code, r.code, r.code], `${r.code} on every service day, Monday to Friday.`)] : [];
  });
}

/**
 * A flat plan for every subscriber that is not inactive and has none: a copy of the Subscriptions
 * seed cycle for a Subscriptions subscriber, the other channels' cycle otherwise. Seed rows, so a
 * reseed removes them with the seed subscribers.
 */
export function seedFlatPlans(subscribers: readonly { id: string; channel: number; status: string }[], cycles: readonly SubscriptionCycleDef[]): SubscriptionCycleDef[] {
  const student = cycles.find((c) => c.subscriberId === null && c.id === SEED_CYCLE_SUBSCRIPTIONS);
  const adult = cycles.find((c) => c.subscriberId === null && c.id === SEED_CYCLE_OTHER_CHANNELS);
  const out: SubscriptionCycleDef[] = [];
  for (const c of subscribers) {
    if (c.status === 'inactive' || cycles.some((p) => p.subscriberId === c.id)) continue;
    const from = c.channel === 1 ? student : adult;
    if (!from) continue;
    out.push({ ...from, id: `PLAN-${c.id}`, subscriberId: c.id, fromCycleId: from.id, name: 'Flat plan', notes: `Copied from ${from.name}.`, source: 'seed', days: from.days.map((d) => ({ ...d })) });
  }
  return out;
}
