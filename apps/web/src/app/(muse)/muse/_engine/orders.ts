/**
 * Impact OS — orders and menu cycles, engine-side.
 *
 * Ledger-free, database-free. The order book for a date range is the union of
 * two things:
 *
 *   1. DERIVED forecast orders — for every date each service runs (its
 *      weekdays, inside the site's calendar, the kitchen open), the customer's
 *      meal plan recipe on that date × the service's meals per service in force
 *      (Roadmap N4a). Two services in a day are two orders. Computed every
 *      time; never stored.
 *   2. Stored orders — typed forecasts, confirmed counts, delivered orders.
 *      A stored row replaces the derived order with the same date, site and
 *      recipe.
 *
 * A school's full delivery day is every order on that date for that customer.
 */

import type { CustomerDef } from '../_data/customers';
import type { MenuCycleDef, OrderDef, OrderSource, OrderStatus } from '../_data/menu-cycles';
import type { ResolvedSiteForecast } from './demand';
import type { DateRange } from './periods';
import { mealPlanRecipeOn, mealPlansOf } from './meal-plans';
import { normalizePicks, serviceRunsOn, volumeOn } from './services';

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
export function cycleDayOn(cycle: Pick<MenuCycleDef, 'startDate' | 'lengthDays' | 'weekdays' | 'status'>, date: string): number | null {
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

export function cycleRecipeOn(cycle: MenuCycleDef, date: string): string | null {
  const day = cycleDayOn(cycle, date);
  if (day === null) return null;
  return cycle.days.find((d) => d.day === day)?.recipeCode ?? null;
}

// ── The order book ──────────────────────────────────────────────────────────

export type OrderBasis = 'derived' | 'record';
export type PriceBasis = 'order' | 'contract' | 'channel';

export interface BookOrder {
  /** `${date}|${customerSiteId}|${customerServiceId}|${recipeCode}` — the identity a stored row replaces. */
  key: string;
  /** Stored row id; null for a derived forecast order. */
  id: string | null;
  orderDate: string;
  customerId: string;
  customerName: string;
  customerSiteId: string;
  siteName: string;
  /** The service the order is for; null on a stored row typed before services existed. */
  customerServiceId: string | null;
  serviceName: string | null;
  /** Delivery-site id when the customer site is linked. */
  deliverySiteId: string | null;
  channel: number;
  recipeCode: string;
  recipeName: string;
  meals: number;
  status: OrderStatus;
  basis: OrderBasis;
  source: OrderSource;
  /** The price in force, cents. */
  pricePerMealCents: number;
  priceBasis: PriceBasis;
  deliveryId: string | null;
  menuCycleId: string | null;
  notes: string | null;
}

export const orderKey = (date: string, customerSiteId: string, recipeCode: string, customerServiceId: string | null = null): string =>
  `${date}|${customerSiteId}|${customerServiceId ?? ''}|${recipeCode}`;

export interface OrderBookInput {
  /** Sites with their services, calendars and the forecast's edits applied (`resolveCustomerSites`). */
  sites: readonly ResolvedSiteForecast[];
  /** The customer library, for names and prices on stored rows whose site is no longer forecast. */
  customers: readonly CustomerDef[];
  /** Saved menu cycles and every customer's meal plans. A forecast's own copy of a plan rides on the site. */
  cycles: readonly MenuCycleDef[];
  orders: readonly OrderDef[];
  from: string;
  to: string;
  /** Channel default price, cents, by phase. */
  channelPriceCents: Record<number, number>;
  /** Recipe code → name, for display. */
  recipeNames?: Record<string, string>;
  /** Kitchen closures (major holidays): no derived forecast order falls on a closed date. Stored rows are kept. */
  closures?: readonly DateRange[];
}

function priceFor(order: number | null, contract: number | null, channelDefault: number | undefined): { cents: number; basis: PriceBasis } {
  if (order !== null) return { cents: order, basis: 'order' };
  if (contract !== null) return { cents: contract, basis: 'contract' };
  return { cents: channelDefault ?? 0, basis: 'channel' };
}

/** The order book for a date range: derived forecast orders with stored rows in their place. */
export function orderBook(input: OrderBookInput): BookOrder[] {
  const names = input.recipeNames ?? {};
  const byKey = new Map<string, BookOrder>();

  // Derived forecast orders: every service on every date it runs.
  const plansByCustomer = new Map<string, MenuCycleDef[]>();
  const plansFor = (s: ResolvedSiteForecast): MenuCycleDef[] => {
    if (s.mealPlans) return s.mealPlans;
    let p = plansByCustomer.get(s.customerId);
    if (!p) plansByCustomer.set(s.customerId, (p = mealPlansOf(input.cycles, s.customerId)));
    return p;
  };
  for (const s of input.sites) {
    const plans = plansFor(s);
    for (const sv of s.services) {
      const picks = normalizePicks(sv.picks);
      if (!picks.some((p) => p.meals > 0)) continue;
      for (const date of datesBetween(input.from, input.to)) {
        if (!serviceRunsOn(sv, s.calendar, date, input.closures)) continue;
        const meals = volumeOn(picks, date);
        if (meals <= 0) continue;
        const served = mealPlanRecipeOn(plans, sv.id, date);
        if (!served) continue;
        const { recipeCode, plan } = served;
        const price = priceFor(null, s.pricePerMealCents, input.channelPriceCents[s.channel]);
        const key = orderKey(date, s.id, recipeCode, sv.id);
        byKey.set(key, {
          key,
          id: null,
          orderDate: date,
          customerId: s.customerId,
          customerName: s.customerName,
          customerSiteId: s.id,
          siteName: s.name,
          customerServiceId: sv.id,
          serviceName: sv.name,
          deliverySiteId: s.siteId,
          channel: s.channel,
          recipeCode,
          recipeName: names[recipeCode] ?? recipeCode,
          meals,
          status: 'forecast',
          basis: 'derived',
          source: 'cycle',
          pricePerMealCents: price.cents,
          priceBasis: price.basis,
          deliveryId: null,
          menuCycleId: plan.id,
          notes: null,
        });
      }
    }
  }

  // Stored rows replace derived ones with the same key.
  const siteIndex = new Map<string, { customer: CustomerDef; site: CustomerDef['sites'][number] }>();
  for (const c of input.customers) for (const s of c.sites) siteIndex.set(s.id, { customer: c, site: s });
  const serviceName = new Map<string, string>();
  for (const c of input.customers) for (const s of c.sites) for (const sv of s.services ?? []) serviceName.set(sv.id, sv.name);
  for (const o of input.orders) {
    if (o.orderDate < input.from || o.orderDate > input.to) continue;
    const hit = siteIndex.get(o.customerSiteId);
    const price = priceFor(o.pricePerMealCents, hit?.customer.pricePerMealCents ?? null, input.channelPriceCents[o.channel]);
    const key = orderKey(o.orderDate, o.customerSiteId, o.recipeCode, o.customerServiceId);
    byKey.set(key, {
      key,
      id: o.id,
      orderDate: o.orderDate,
      customerId: o.customerId,
      customerName: hit?.customer.name ?? 'Customer removed',
      customerSiteId: o.customerSiteId,
      siteName: hit?.site.name ?? 'Site removed',
      customerServiceId: o.customerServiceId,
      serviceName: o.customerServiceId ? serviceName.get(o.customerServiceId) ?? 'Service removed' : null,
      deliverySiteId: hit?.site.siteId ?? null,
      channel: o.channel,
      recipeCode: o.recipeCode,
      recipeName: names[o.recipeCode] ?? o.recipeCode,
      meals: o.meals,
      status: o.status,
      basis: 'record',
      source: o.source,
      pricePerMealCents: price.cents,
      priceBasis: price.basis,
      deliveryId: o.deliveryId,
      menuCycleId: o.menuCycleId,
      notes: o.notes,
    });
  }

  return [...byKey.values()].sort(
    (a, b) =>
      a.orderDate.localeCompare(b.orderDate) ||
      a.channel - b.channel ||
      a.customerName.localeCompare(b.customerName) ||
      a.siteName.localeCompare(b.siteName) ||
      (a.serviceName ?? '').localeCompare(b.serviceName ?? '') ||
      a.recipeCode.localeCompare(b.recipeCode),
  );
}

// ── Views over the book ─────────────────────────────────────────────────────

export interface RecipeMeals {
  recipeCode: string;
  recipeName: string;
  meals: number;
  orders: number;
}

export function mealsByRecipe(orders: readonly BookOrder[]): RecipeMeals[] {
  const m = new Map<string, RecipeMeals>();
  for (const o of orders) {
    const row = m.get(o.recipeCode) ?? { recipeCode: o.recipeCode, recipeName: o.recipeName, meals: 0, orders: 0 };
    row.meals += o.meals;
    row.orders += 1;
    m.set(o.recipeCode, row);
  }
  return [...m.values()].sort((a, b) => b.meals - a.meals || a.recipeCode.localeCompare(b.recipeCode));
}

export interface DeliveryDay {
  date: string;
  customerId: string | null;
  orders: BookOrder[];
  byRecipe: RecipeMeals[];
  totalMeals: number;
  /** Meals per site, in book order. */
  bySite: { customerSiteId: string; siteName: string; customerName: string; meals: number }[];
}

/** Every order on a date, for one customer or for all. */
// ── Per-site actual against forecast (Roadmap I4) ───────────────────────────

export interface SiteActualVsForecast {
  customerSiteId: string;
  siteName: string;
  customerName: string;
  channel: number;
  /** Service dates in the range with any order for the site. */
  serviceDates: number;
  /** Meals on derived orders and on typed forecast rows — not yet confirmed. */
  forecastMeals: number;
  /** Meals on confirmed orders not yet delivered. */
  confirmedMeals: number;
  /** Delivered orders in the range. */
  deliveredOrders: number;
  /** Meals ordered on the delivered orders. */
  orderedOnDelivered: number;
  /** Meals on the delivery records those orders name; an order whose record is missing counts its ordered meals. */
  deliveredMeals: number;
  /** deliveredMeals − orderedOnDelivered, over delivered orders only. */
  deliveredLessOrdered: number;
}

/**
 * Every site in the book, with its meals split by how far each order has
 * travelled: forecast, confirmed, delivered. Delivered meals come from the
 * delivery record the order names (`deliveryMealsById`), so the site's
 * actual sits beside the count that was ordered. A table of facts; it states
 * no action.
 */
export function siteActualVsForecast(book: readonly BookOrder[], deliveryMealsById: ReadonlyMap<string, number>): SiteActualVsForecast[] {
  const rows = new Map<string, SiteActualVsForecast & { dates: Set<string> }>();
  for (const o of book) {
    const row = rows.get(o.customerSiteId) ?? {
      customerSiteId: o.customerSiteId, siteName: o.siteName, customerName: o.customerName, channel: o.channel, dates: new Set<string>(),
      serviceDates: 0, forecastMeals: 0, confirmedMeals: 0, deliveredOrders: 0, orderedOnDelivered: 0, deliveredMeals: 0, deliveredLessOrdered: 0,
    };
    row.dates.add(o.orderDate);
    if (o.status === 'delivered') {
      const actual = (o.deliveryId ? deliveryMealsById.get(o.deliveryId) : undefined) ?? o.meals;
      row.deliveredOrders += 1;
      row.orderedOnDelivered += o.meals;
      row.deliveredMeals += actual;
    } else if (o.status === 'confirmed') row.confirmedMeals += o.meals;
    else row.forecastMeals += o.meals;
    rows.set(o.customerSiteId, row);
  }
  return [...rows.values()]
    .map(({ dates, ...r }) => ({ ...r, serviceDates: dates.size, deliveredLessOrdered: r.deliveredMeals - r.orderedOnDelivered }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName) || a.siteName.localeCompare(b.siteName));
}

export function deliveryDay(book: readonly BookOrder[], date: string, customerId: string | null = null): DeliveryDay {
  const orders = book.filter((o) => o.orderDate === date && (customerId === null || o.customerId === customerId));
  const sites = new Map<string, DeliveryDay['bySite'][number]>();
  for (const o of orders) {
    const row = sites.get(o.customerSiteId) ?? { customerSiteId: o.customerSiteId, siteName: o.siteName, customerName: o.customerName, meals: 0 };
    row.meals += o.meals;
    sites.set(o.customerSiteId, row);
  }
  return {
    date,
    customerId,
    orders,
    byRecipe: mealsByRecipe(orders),
    totalMeals: orders.reduce((a, o) => a + o.meals, 0),
    bySite: [...sites.values()],
  };
}

export interface ChannelBookSummary {
  channel: number;
  derivedForecastMeals: number;
  typedForecastMeals: number;
  confirmedMeals: number;
  deliveredMeals: number;
  totalMeals: number;
  orders: number;
  serviceDates: number;
}

/** Meals by status per channel over the book, and the dates with any order. */
export function summarizeBook(book: readonly BookOrder[], channels: readonly number[] = [1, 2, 3]): Record<number, ChannelBookSummary> {
  const out: Record<number, ChannelBookSummary> = {};
  for (const ch of channels) {
    const rows = book.filter((o) => o.channel === ch);
    out[ch] = {
      channel: ch,
      derivedForecastMeals: rows.filter((o) => o.basis === 'derived').reduce((a, o) => a + o.meals, 0),
      typedForecastMeals: rows.filter((o) => o.basis === 'record' && o.status === 'forecast').reduce((a, o) => a + o.meals, 0),
      confirmedMeals: rows.filter((o) => o.status === 'confirmed').reduce((a, o) => a + o.meals, 0),
      deliveredMeals: rows.filter((o) => o.status === 'delivered').reduce((a, o) => a + o.meals, 0),
      totalMeals: rows.reduce((a, o) => a + o.meals, 0),
      orders: rows.length,
      serviceDates: new Set(rows.map((o) => o.orderDate)).size,
    };
  }
  return out;
}

/** Revenue implied by the book at the prices in force, cents. Computed, never stored. */
export function bookRevenueCents(orders: readonly BookOrder[]): number {
  return orders.reduce((a, o) => a + Math.round(o.meals * o.pricePerMealCents), 0);
}
