/**
 * Impact OS — menu cycles, meal plans and orders: the document shapes, and the seed.
 *
 * A menu cycle is a saved recipe sequence on the shared list. A meal plan is
 * the same shape carrying a customer: every customer has its own, copied from
 * a saved cycle in one click or programmed for it alone (Roadmap N4a,
 * operating-model-roadmap decision 19). A channel never decides what a
 * customer is served. An order is a date, customer, site, service, recipe,
 * meals and a status. A forecast order generated from a meal plan is DERIVED —
 * the plan's recipe on the date × the service's meals per service — and is
 * never stored; the engine computes it on read (`_engine/orders.ts`). A stored
 * order is a typed forecast, a confirmed count, or a delivered order naming
 * its delivery record.
 */

import type { RecipeDef } from './plan-data';
import { MENU_CODES, ADULT_CODES } from './recipes-menu';

export type MenuCycleStatus = 'active' | 'inactive';
export type OrderStatus = 'forecast' | 'confirmed' | 'delivered';
export type OrderSource = 'typed' | 'cycle' | 'sales' | 'portal';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  forecast: 'Forecast',
  confirmed: 'Confirmed',
  delivered: 'Delivered',
};

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  typed: 'Typed',
  cycle: 'Meal plan',
  sales: 'Sales workspace',
  portal: 'Parent portal',
};

/** 0 = Sunday … 6 = Saturday, matching `Date.getUTCDay()`. */
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

export interface MenuCycleDayDef {
  /** 1 .. lengthDays */
  day: number;
  /** Library recipe code; null = no service that day. */
  recipeCode: string | null;
}

export interface MenuCycleDef {
  id: string;
  /** @deprecated Roadmap N4a: cycles are not assigned to channels. Always null; dropped in N9. */
  channel: number | null;
  /** Null = a saved menu cycle on the shared list; set = this customer's meal plan. */
  customerId: string | null;
  /** Set = the plan for this one service, winning over the customer's all-services plan. */
  customerServiceId: string | null;
  /** The saved cycle a meal plan was copied from. */
  fromCycleId: string | null;
  name: string;
  /** ISO date day 1 falls on. */
  startDate: string;
  /** Null = open-ended. */
  endDate: string | null;
  lengthDays: number;
  weekdays: number[];
  status: MenuCycleStatus;
  notes: string | null;
  source: 'seed' | 'user_built';
  days: MenuCycleDayDef[];
}

export interface OrderDef {
  id: string;
  orderDate: string;
  customerId: string;
  customerSiteId: string;
  /** The service the order is for; null on a row typed before services existed. */
  customerServiceId: string | null;
  channel: number;
  recipeCode: string;
  meals: number;
  status: OrderStatus;
  /** Null = the customer's contracted price, else the channel default. */
  pricePerMealCents: number | null;
  deliveryId: string | null;
  menuCycleId: string | null;
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

export const STUDENT_MENU_NAME = 'Student menu — 10 days';
export const ADULT_MENU_NAME = 'Adult menu — 10 days';

const cycleShape = (id: string, name: string, startDate: string, codes: readonly string[], notes: string): MenuCycleDef => ({
  id,
  channel: null,
  customerId: null,
  customerServiceId: null,
  fromCycleId: null,
  name,
  startDate,
  endDate: null,
  lengthDays: codes.length,
  weekdays: [...DEFAULT_WEEKDAYS],
  status: 'active',
  notes,
  source: 'seed',
  days: codes.map((code, i) => ({ day: i + 1, recipeCode: code })),
});

/**
 * The saved menu cycles the library starts with: the student menu (AMK-E-002 …
 * 011) and the adult menu (AMK-A-002 … 011), ten days each — week 1 is days
 * 1–5, week 2 days 6–10, Monday to Friday — anchored to the Monday of the week
 * the library is first read. They are the menu, edited in place. Where a menu's
 * recipes are not all in service in the library (a bare engine call), a five-day
 * sequence of the first in-service recipe offered to the menu's channels stands
 * in, named so.
 */
export function seedMenuCycles(library: readonly RecipeDef[], today: string): MenuCycleDef[] {
  const inService = (code: string) => library.some((r) => r.code === code && r.status === 'in_service');
  const firstOn = (channels: readonly number[]) => library.find((r) => r.status === 'in_service' && channels.some((c) => r.channels.includes(c)));
  const out: MenuCycleDef[] = [];
  const note = 'Week 1 is days 1–5, week 2 is days 6–10, Monday to Friday.';
  const start = mondayOf(today);
  const menus = [
    { id: 'CYCLE-SEED-STUDENT', name: STUDENT_MENU_NAME, codes: MENU_CODES, channels: [1] },
    { id: 'CYCLE-SEED-ADULT', name: ADULT_MENU_NAME, codes: ADULT_CODES, channels: [2, 3] },
  ];
  for (const m of menus) {
    if (m.codes.every(inService)) {
      out.push(cycleShape(m.id, m.name, start, m.codes, note));
      continue;
    }
    const r = firstOn(m.channels);
    if (r) out.push(cycleShape(m.id, `${m.name.split(' — ')[0]} — five days of ${r.code}`, start, [r.code, r.code, r.code, r.code, r.code], `The menu is not in the library; ${r.code} on every service day, Monday to Friday.`));
  }
  return out;
}

/**
 * A meal plan for every customer that is not inactive and has none: a copy of
 * the student menu for a School lunches customer, the adult menu otherwise —
 * the menus each channel's recipes are offered from. Seed rows, so a reseed
 * removes them with the seed customers.
 */
export function seedMealPlans(customers: readonly { id: string; channel: number; status: string }[], cycles: readonly MenuCycleDef[]): MenuCycleDef[] {
  const student = cycles.find((c) => c.customerId === null && c.name.startsWith('Student menu'));
  const adult = cycles.find((c) => c.customerId === null && c.name.startsWith('Adult menu'));
  const out: MenuCycleDef[] = [];
  for (const c of customers) {
    if (c.status === 'inactive' || cycles.some((p) => p.customerId === c.id)) continue;
    const from = c.channel === 1 ? student : adult;
    if (!from) continue;
    out.push({ ...from, id: `PLAN-${c.id}`, customerId: c.id, fromCycleId: from.id, name: 'Meal plan', notes: `Copied from ${from.name}.`, source: 'seed', days: from.days.map((d) => ({ ...d })) });
  }
  return out;
}
