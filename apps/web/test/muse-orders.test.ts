import { describe, it, expect } from 'vitest';
import { recipes as seedRecipes } from '../src/app/(muse)/muse/_data/plan-data';
import { seedCustomers, type CustomerDef } from '../src/app/(muse)/muse/_data/customers';
import { seedMenuCycles, seedMealPlans, mondayOf, type MenuCycleDef, type OrderDef } from '../src/app/(muse)/muse/_data/menu-cycles';
import { mealPlanInForce, applyCycleToPlans, copyCycleToPlan, plansFromCycle } from '../src/app/(muse)/muse/_engine/meal-plans';
import { resolveCustomerSites } from '../src/app/(muse)/muse/_engine/demand';
import {
  isoAddDays,
  weekdayOf,
  datesBetween,
  cycleDayOn,
  cycleRecipeOn,
  orderBook,
  orderKey,
  deliveryDay,
  summarizeBook,
  bookRevenueCents,
  mealsByRecipe,
  siteActualVsForecast,
  type BookOrder,
} from '../src/app/(muse)/muse/_engine/orders';

// 2026-09-14 is a Monday.
const MON = '2026-09-14';
const FRI = '2026-09-18';
const SAT = '2026-09-19';
const NEXT_MON = '2026-09-21';
const PRICES = { 1: 1000, 2: 1500, 3: 1600 };

function seedCycle(): MenuCycleDef[] {
  return seedMenuCycles(seedRecipes, MON);
}

/** The engine default customers with no term on file, so they serve every weekday in September 2026. */
function everyWeekday(cs: CustomerDef[]): CustomerDef[] {
  return cs.map((c) => ({ ...c, sites: c.sites.map((s) => ({ ...s, calendar: [] })) }));
}

/** Saved cycles plus a meal plan copied for each customer. */
function withPlans(customers: readonly CustomerDef[]): MenuCycleDef[] {
  const saved = seedCycle();
  return [...saved, ...seedMealPlans(customers, saved)];
}

const plain = { customerId: null, customerServiceId: null, fromCycleId: null, endDate: null } as const;

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

describe('menu cycle position', () => {
  const cycle: MenuCycleDef = {
    id: 'c', channel: null, ...plain, name: 'five', startDate: MON, lengthDays: 5, weekdays: [1, 2, 3, 4, 5], status: 'active', notes: null, source: 'user_built',
    days: [1, 2, 3, 4, 5].map((day) => ({ day, recipeCode: `R${day}` })),
  };

  it('day 1 on the start date, advancing one day per service weekday and wrapping', () => {
    expect(cycleDayOn(cycle, MON)).toBe(1);
    expect(cycleDayOn(cycle, FRI)).toBe(5);
    expect(cycleDayOn(cycle, NEXT_MON)).toBe(1);
    expect(cycleRecipeOn(cycle, '2026-09-16')).toBe('R3');
  });

  it('null on a weekday off the menu, before the start, or when inactive', () => {
    expect(cycleDayOn(cycle, SAT)).toBeNull();
    expect(cycleDayOn(cycle, '2026-09-11')).toBeNull();
    expect(cycleDayOn({ ...cycle, status: 'inactive' }, MON)).toBeNull();
  });

  it('a shorter cycle wraps inside the week and a missing day serves nothing', () => {
    const three = { ...cycle, lengthDays: 3, days: [{ day: 1, recipeCode: 'A' }, { day: 2, recipeCode: null }] };
    expect(cycleDayOn(three, '2026-09-17')).toBe(1);
    expect(cycleRecipeOn(three, '2026-09-15')).toBeNull();
    expect(cycleRecipeOn(three, '2026-09-16')).toBeNull();
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

describe('meal plans (Roadmap N4a)', () => {
  const base: MenuCycleDef = {
    id: 'p', channel: null, customerId: 'c1', customerServiceId: null, fromCycleId: null, endDate: null, name: 'plan', startDate: MON, lengthDays: 1, weekdays: [1, 2, 3, 4, 5], status: 'active', notes: null, source: 'user_built',
    days: [{ day: 1, recipeCode: 'A' }],
  };

  it('the latest-started plan in force wins; an ended or inactive plan does not serve', () => {
    const later = { ...base, id: 'later', startDate: '2026-09-16' };
    expect(mealPlanInForce([base, later], null, MON)?.id).toBe('p');
    expect(mealPlanInForce([base, later], null, '2026-09-16')?.id).toBe('later');
    expect(mealPlanInForce([{ ...later, endDate: '2026-09-16' }, base], null, '2026-09-17')?.id).toBe('p');
    expect(mealPlanInForce([{ ...base, status: 'inactive' }], null, MON)).toBeNull();
  });

  it('a plan for one service wins over the all-services plan on that service only', () => {
    const lunch = { ...base, id: 'lunch', customerServiceId: 'sv-lunch', startDate: '2026-09-01' };
    expect(mealPlanInForce([base, lunch], 'sv-lunch', MON)?.id).toBe('lunch');
    expect(mealPlanInForce([base, lunch], 'sv-breakfast', MON)?.id).toBe('p');
  });

  it('assigning copies a saved cycle; applying an edit moves only the picked plans', () => {
    const saved: MenuCycleDef = { ...base, id: 'saved', customerId: null, lengthDays: 2, days: [{ day: 1, recipeCode: 'A' }, { day: 2, recipeCode: 'B' }] };
    const one = copyCycleToPlan(saved, 'c1', 'one', { startDate: '2026-10-05' });
    const two = copyCycleToPlan(saved, 'c2', 'two');
    expect(one).toMatchObject({ customerId: 'c1', fromCycleId: 'saved', startDate: '2026-10-05', lengthDays: 2 });
    expect(plansFromCycle([saved, one, two, base], 'saved').map((p) => p.id)).toEqual(['one', 'two']);
    const edited = { ...saved, lengthDays: 1, days: [{ day: 1, recipeCode: 'C' }] };
    const [a, b] = applyCycleToPlans(edited, [one, two], new Set(['two']));
    expect(a.days.map((d) => d.recipeCode)).toEqual(['A', 'B']);
    expect(b.days.map((d) => d.recipeCode)).toEqual(['C']);
    expect(b.startDate).toBe(two.startDate);
    expect(b.customerId).toBe('c2');
  });
});

describe('the seed', () => {
  it('seeds saved cycles on no channel, and a meal plan copied for each customer that is not inactive', () => {
    const cycles = seedCycle();
    expect(cycles.every((c) => c.channel === null && c.customerId === null && c.source === 'seed')).toBe(true);
    expect(cycles[0].startDate).toBe(MON);
    expect(cycles[0].days.every((d) => d.recipeCode === 'AMK-E-001')).toBe(true);
    const customers = seedCustomers();
    const plans = seedMealPlans(customers, cycles);
    // The code library lists its one recipe on School lunches only, so only the student menu stands in.
    expect(cycles).toHaveLength(1);
    expect(plans.map((p) => p.customerId)).toEqual(customers.filter((c) => c.channel === 1).map((c) => c.id));
    expect(plans.every((p) => p.fromCycleId !== null)).toBe(true);
    expect(seedMealPlans(customers, [...cycles, ...plans])).toEqual([]);
  });
});

describe('the order book', () => {
  const customers = everyWeekday(seedCustomers());
  const sites = resolveCustomerSites(customers);
  const base = { sites, customers, cycles: withPlans(customers), orders: [] as OrderDef[], from: MON, to: SAT, channelPriceCents: PRICES, recipeNames: { 'AMK-E-001': 'Bowl' } };
  const svc = (siteIndex: number) => customers[0].sites[siteIndex].services[0].id;

  it('derives one forecast order per service per service date, from the customer meal plan', () => {
    const book = orderBook(base);
    expect(book).toHaveLength(15);
    expect(book.every((o) => o.basis === 'derived' && o.status === 'forecast' && o.source === 'cycle' && o.id === null)).toBe(true);
    expect(book.every((o) => o.customerServiceId !== null && o.serviceName === 'Lunch')).toBe(true);
    for (const d of datesBetween(MON, FRI)) {
      expect(deliveryDay(book, d).totalMeals).toBe(1000);
    }
    expect(deliveryDay(book, SAT).orders).toHaveLength(0);
    expect(book.every((o) => o.channel === 1)).toBe(true);
    expect(book[0].recipeName).toBe('Bowl');
    expect(book[0].priceBasis).toBe('channel');
    expect(book[0].pricePerMealCents).toBe(1000);
  });

  it('a forecast volume pick moves its orders from that date and carries forward; the record does not move', () => {
    const site = customers[0].sites[0];
    const edited = resolveCustomerSites(customers, { services: { [svc(0)]: { picks: [{ effectiveDate: '2026-01-01', meals: 492 }, { effectiveDate: '2026-09-16', meals: 600 }] } } });
    const book = orderBook({ ...base, sites: edited });
    expect(book.find((o) => o.customerSiteId === site.id && o.orderDate === MON)?.meals).toBe(492);
    expect(book.find((o) => o.customerSiteId === site.id && o.orderDate === '2026-09-16')?.meals).toBe(600);
    expect(book.find((o) => o.customerSiteId === site.id && o.orderDate === FRI)?.meals).toBe(600);
    expect(deliveryDay(book, FRI).totalMeals).toBe(1000 - 492 + 600);
    expect(customers[0].sites[0].services[0].picks).toHaveLength(1);
  });

  it('a second service on a site is a second order that day; a forecast meal plan replaces the record plan', () => {
    const site = customers[0].sites[0];
    const two: CustomerDef[] = customers.map((c, i) => (i !== 0 ? c : { ...c, sites: c.sites.map((s, j) => (j !== 0 ? s : { ...s, services: [...s.services, { ...s.services[0], id: 'sv-breakfast', name: 'Breakfast', picks: [{ id: 'bp', effectiveDate: '2026-01-01', meals: 80, notes: null }] }] })) }));
    const book = orderBook({ ...base, customers: two, sites: resolveCustomerSites(two) });
    const mon = book.filter((o) => o.customerSiteId === site.id && o.orderDate === MON);
    expect(mon.map((o) => o.serviceName).sort()).toEqual(['Breakfast', 'Lunch']);
    const own: MenuCycleDef = { id: 'fp', channel: null, customerId: customers[0].id, customerServiceId: null, fromCycleId: null, endDate: null, name: 'forecast plan', startDate: MON, lengthDays: 1, weekdays: [1, 2, 3, 4, 5], status: 'active', notes: null, source: 'user_built', days: [{ day: 1, recipeCode: 'AMK-E-002' }] };
    const f = orderBook({ ...base, sites: resolveCustomerSites(customers, { mealPlans: { [customers[0].id]: [own] } }) });
    expect(f.filter((o) => o.customerId === customers[0].id).every((o) => o.recipeCode === 'AMK-E-002' && o.menuCycleId === 'fp')).toBe(true);
  });

  it('a stored order replaces the derived one with the same date, site and recipe; another recipe adds', () => {
    const site = customers[0].sites[0];
    const confirmed: OrderDef = { id: 'o1', orderDate: MON, customerId: customers[0].id, customerSiteId: site.id, customerServiceId: svc(0), channel: 1, recipeCode: 'AMK-E-001', meals: 450, status: 'confirmed', pricePerMealCents: null, deliveryId: null, menuCycleId: 'CYCLE-SEED-1', source: 'cycle', notes: null };
    const extra: OrderDef = { ...confirmed, id: 'o2', recipeCode: 'AMK-E-002', meals: 40, status: 'forecast', source: 'typed', menuCycleId: null };
    const book = orderBook({ ...base, orders: [confirmed, extra] });
    expect(book).toHaveLength(16);
    const day = deliveryDay(book, MON, customers[0].id);
    expect(day.totalMeals).toBe(1000 - 492 + 450 + 40);
    const row = book.find((o) => o.key === orderKey(MON, site.id, 'AMK-E-001', svc(0)));
    expect(row?.basis).toBe('record');
    expect(row?.status).toBe('confirmed');
    expect(row?.id).toBe('o1');
    expect(day.byRecipe.map((r) => r.recipeCode)).toEqual(['AMK-E-001', 'AMK-E-002']);
    expect(day.bySite).toHaveLength(3);
  });

  it('the price in force is the order, else the contract, else the channel default', () => {
    const custs = everyWeekday(seedCustomers());
    custs[0].pricePerMealCents = 950;
    const s = resolveCustomerSites(custs);
    const site = custs[0].sites[1];
    const typed: OrderDef = { id: 'o', orderDate: MON, customerId: custs[0].id, customerSiteId: site.id, customerServiceId: null, channel: 1, recipeCode: 'AMK-E-001', meals: 10, status: 'forecast', pricePerMealCents: 1200, deliveryId: null, menuCycleId: null, source: 'typed', notes: null };
    const book = orderBook({ ...base, sites: s, customers: custs, orders: [typed] });
    const derived = book.find((o) => o.basis === 'derived');
    expect(derived?.priceBasis).toBe('contract');
    expect(derived?.pricePerMealCents).toBe(950);
    const onOrder = book.find((o) => o.id === 'o');
    expect(onOrder?.priceBasis).toBe('order');
    expect(onOrder?.pricePerMealCents).toBe(1200);
  });

  it('a stored order outside the range is not in the book; one for a removed site still shows', () => {
    const site = customers[0].sites[0];
    const outside: OrderDef = { id: 'x', orderDate: '2026-10-05', customerId: customers[0].id, customerSiteId: site.id, customerServiceId: null, channel: 1, recipeCode: 'AMK-E-001', meals: 1, status: 'confirmed', pricePerMealCents: null, deliveryId: null, menuCycleId: null, source: 'typed', notes: null };
    const orphan: OrderDef = { ...outside, id: 'y', orderDate: MON, customerSiteId: 'gone', customerId: 'gone' };
    const book = orderBook({ ...base, orders: [outside, orphan] });
    expect(book.find((o) => o.id === 'x')).toBeUndefined();
    const y = book.find((o) => o.id === 'y');
    expect(y?.siteName).toBe('Site removed');
    expect(y?.priceBasis).toBe('channel');
  });

  it('summary, revenue and meals by recipe are computed from the book', () => {
    const site = customers[0].sites[0];
    const delivered: OrderDef = { id: 'd', orderDate: MON, customerId: customers[0].id, customerSiteId: site.id, customerServiceId: svc(0), channel: 1, recipeCode: 'AMK-E-001', meals: 492, status: 'delivered', pricePerMealCents: null, deliveryId: 'del', menuCycleId: null, source: 'cycle', notes: null };
    const book = orderBook({ ...base, orders: [delivered] });
    const s = summarizeBook(book);
    expect(s[1].deliveredMeals).toBe(492);
    expect(s[1].derivedForecastMeals).toBe(5000 - 492);
    expect(s[1].totalMeals).toBe(5000);
    expect(s[1].serviceDates).toBe(5);
    expect(s[2].orders).toBe(0);
    expect(bookRevenueCents(book)).toBe(5000 * 1000);
    expect(mealsByRecipe(book)).toEqual([{ recipeCode: 'AMK-E-001', recipeName: 'Bowl', meals: 5000, orders: 15 }]);
  });

  it('a customer with no meal plan generates no forecast orders; saved cycles alone serve nobody', () => {
    expect(orderBook({ ...base, cycles: [] })).toHaveLength(0);
    expect(orderBook({ ...base, cycles: seedCycle() })).toHaveLength(0);
  });

  it('a site calendar: orders fall inside a term and outside its breaks; the kitchen closure removes a date', () => {
    const termed: CustomerDef[] = customers.map((c, i) => (i !== 0 ? c : { ...c, sites: c.sites.map((s) => ({ ...s, calendar: [{ id: 't', kind: 'term' as const, label: null, startDate: '2026-09-15', endDate: '2026-12-18' }, { id: 'b', kind: 'break' as const, label: null, startDate: '2026-09-17', endDate: '2026-09-17' }] })) }));
    const book = orderBook({ ...base, customers: termed, sites: resolveCustomerSites(termed), closures: [{ startDate: FRI, endDate: FRI }] });
    expect([...new Set(book.map((o) => o.orderDate))]).toEqual(['2026-09-15', '2026-09-16']);
  });
});

describe('per-site actual against forecast (Roadmap I4)', () => {
  const row = (over: Partial<BookOrder> & Pick<BookOrder, 'customerSiteId' | 'orderDate' | 'meals' | 'status' | 'basis'>): BookOrder => ({
    key: `${over.orderDate}|${over.customerSiteId}|R1`, id: over.basis === 'record' ? `id-${over.key ?? Math.random()}` : null,
    customerId: 'c1', customerName: 'Elm ISD', siteName: `Site ${over.customerSiteId}`, customerServiceId: null, serviceName: null, deliverySiteId: null, channel: 1,
    recipeCode: 'R1', recipeName: 'Bowl', source: 'cycle', pricePerMealCents: 1000, priceBasis: 'channel', deliveryId: null, menuCycleId: null, notes: null,
    ...over,
  });
  const book: BookOrder[] = [
    row({ customerSiteId: 'A', orderDate: MON, meals: 100, status: 'forecast', basis: 'derived' }),
    row({ customerSiteId: 'A', orderDate: FRI, meals: 90, status: 'forecast', basis: 'record' }),
    row({ customerSiteId: 'A', orderDate: NEXT_MON, meals: 120, status: 'confirmed', basis: 'record' }),
    row({ customerSiteId: 'B', orderDate: MON, meals: 60, status: 'delivered', basis: 'record', deliveryId: 'd1' }),
    row({ customerSiteId: 'B', orderDate: FRI, meals: 60, status: 'delivered', basis: 'record', deliveryId: 'd-missing' }),
    row({ customerSiteId: 'B', orderDate: FRI, meals: 40, status: 'confirmed', basis: 'record', recipeCode: 'R2', key: `${FRI}|B|R2` }),
  ];
  const rows = siteActualVsForecast(book, new Map([['d1', 55]]));

  it('splits each site by how far its orders have travelled', () => {
    const a = rows.find((r) => r.customerSiteId === 'A')!;
    expect(a).toMatchObject({ forecastMeals: 190, confirmedMeals: 120, deliveredOrders: 0, deliveredMeals: 0, serviceDates: 3 });
  });

  it('delivered meals come from the delivery record, ordered meals stay beside them', () => {
    const b = rows.find((r) => r.customerSiteId === 'B')!;
    expect(b.deliveredOrders).toBe(2);
    expect(b.orderedOnDelivered).toBe(120);
    expect(b.deliveredMeals).toBe(55 + 60); // the order with no record on file counts its ordered meals
    expect(b.deliveredLessOrdered).toBe(-5);
    expect(b.confirmedMeals).toBe(40);
    expect(b.serviceDates).toBe(2);
  });

  it('is sorted by customer then site and covers every site in the book', () => {
    expect(rows.map((r) => r.customerSiteId)).toEqual(['A', 'B']);
  });
});
