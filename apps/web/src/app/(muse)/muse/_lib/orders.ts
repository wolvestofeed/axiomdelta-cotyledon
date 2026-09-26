import 'server-only';
import { asc, inArray } from 'drizzle-orm';
import { museMenuCycles, museMenuCycleDays, museOrders } from '@ct/db';
import { db } from '@/lib/db';
import {
  DEFAULT_WEEKDAYS,
  type MenuCycleDef,
  type MenuCycleStatus,
  type OrderDef,
  type OrderSource,
  type OrderStatus,
} from '../_data/menu-cycles';
import { listRecipes } from './recipes';
import { withSeedLock, insertMenuCycles, dbSeedMenuCycles, insertMissingMealPlans } from './seed-writes';

/**
 * Impact OS — menu cycles and orders, read layer (server-only).
 *
 * On first read of an empty menu-cycle table the saved menus (student and
 * adult) are inserted from the library, marked `source = 'seed'`, under an
 * advisory lock, with a meal plan copied for every customer that has none, so
 * forecast orders exist from the first read (Roadmap N4a). Orders are never
 * seeded: a forecast order from a cycle is derived on read, and every stored
 * order is a fact somebody typed, confirmed or delivered.
 */

const iso = (d: string | Date | null): string | null =>
  d === null ? null : typeof d === 'string' ? d : d.toISOString().slice(0, 10);

async function seedIfEmpty(): Promise<void> {
  const any = await db.select({ id: museMenuCycles.id }).from(museMenuCycles).limit(1);
  if (any[0]) return;
  const library = await listRecipes();
  const today = new Date().toISOString().slice(0, 10);
  await withSeedLock(db, 'cycles', async (tx) => {
    const again = await tx.select({ id: museMenuCycles.id }).from(museMenuCycles).limit(1);
    if (again[0]) return;
    await insertMenuCycles(tx, dbSeedMenuCycles(library, today));
    await insertMissingMealPlans(tx);
  });
}

export async function listMenuCycles(): Promise<MenuCycleDef[]> {
  await seedIfEmpty();
  const rows = await db.select().from(museMenuCycles).orderBy(asc(museMenuCycles.startDate), asc(museMenuCycles.createdAt));
  if (rows.length === 0) return [];
  const days = await db
    .select()
    .from(museMenuCycleDays)
    .where(inArray(museMenuCycleDays.cycleId, rows.map((r) => r.id)))
    .orderBy(asc(museMenuCycleDays.day));
  const byCycle = new Map<string, typeof days>();
  for (const d of days) {
    const arr = byCycle.get(d.cycleId) ?? [];
    arr.push(d);
    byCycle.set(d.cycleId, arr);
  }
  return rows.map((r) => ({
    id: r.id,
    channel: null,
    customerId: r.customerId,
    customerServiceId: r.customerServiceId,
    fromCycleId: r.fromCycleId,
    name: r.name,
    startDate: iso(r.startDate)!,
    endDate: iso(r.endDate),
    lengthDays: r.lengthDays,
    weekdays: Array.isArray(r.weekdays) ? (r.weekdays as number[]).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [...DEFAULT_WEEKDAYS],
    status: (r.status === 'inactive' ? 'inactive' : 'active') as MenuCycleStatus,
    notes: r.notes,
    source: r.source === 'seed' ? 'seed' : 'user_built',
    days: (byCycle.get(r.id) ?? []).map((d) => ({ day: d.day, recipeCode: d.recipeCode })),
  }));
}

const ORDER_STATUSES: OrderStatus[] = ['forecast', 'confirmed', 'delivered'];
const ORDER_SOURCES: OrderSource[] = ['typed', 'cycle', 'sales', 'portal'];

/** Every stored order, oldest date first. */
export async function listOrders(): Promise<OrderDef[]> {
  const rows = await db.select().from(museOrders).orderBy(asc(museOrders.orderDate), asc(museOrders.createdAt));
  return rows.map((r) => ({
    id: r.id,
    orderDate: iso(r.orderDate)!,
    customerId: r.customerId,
    customerSiteId: r.customerSiteId,
    customerServiceId: r.customerServiceId,
    channel: r.channel,
    recipeCode: r.recipeCode,
    meals: r.meals,
    status: ORDER_STATUSES.includes(r.status as OrderStatus) ? (r.status as OrderStatus) : 'forecast',
    pricePerMealCents: r.pricePerMealCents,
    deliveryId: r.deliveryId,
    menuCycleId: r.menuCycleId,
    source: ORDER_SOURCES.includes(r.source as OrderSource) ? (r.source as OrderSource) : 'typed',
    notes: r.notes,
  }));
}
