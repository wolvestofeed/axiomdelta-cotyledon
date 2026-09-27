import { asc, inArray } from 'drizzle-orm';
import { farmGrowPlans, farmGrowPlanLines, farmReceipts } from '@/db';
import { VARIETIES } from '@/data/varieties';
import type { ReceiptDoc } from '@/engine/actuals';
import { lastPricesPaid, rollingCosts } from '@/engine/seed-cost';
import { rowsToLibraryPlan, type LibraryGrowPlan } from '@/engine/grow-plan-library';
import type { SeedDb } from '@/server/seed-writes';
import { listNutrientsWith } from '@/server/nutrient-rows';
import { listMediaWith } from '@/server/media-rows';

/**
 * Rows → library plans, for any Drizzle handle. `_lib/grow-plans.ts` (server-only) and the
 * reseed script both read through this so the shape is built once. Oldest first: the seed
 * plans in variety order, then whatever was added. Each plan carries the workspace's Nutrients &
 * Supplements and Media records its nutrient and medium lines name, and the last price paid for each variety it sows
 * from the workspace's receipts.
 */
export async function listGrowPlansWith(db: SeedDb): Promise<LibraryGrowPlan[]> {
  const headers = await db.select().from(farmGrowPlans).orderBy(asc(farmGrowPlans.createdAt));
  if (headers.length === 0) return [];
  const nutrients = Object.fromEntries((await listNutrientsWith(db)).map((n) => [n.key, n]));
  const media = Object.fromEntries((await listMediaWith(db)).map((m) => [m.key, m]));
  const lastPaid = await lastPaidWith(db);
  const lines = await db
    .select()
    .from(farmGrowPlanLines)
    .where(inArray(farmGrowPlanLines.growPlanId, headers.map((h) => h.id)))
    .orderBy(asc(farmGrowPlanLines.position));
  const byGrowPlan = new Map<string, typeof lines>();
  for (const l of lines) {
    const arr = byGrowPlan.get(l.growPlanId) ?? [];
    arr.push(l);
    byGrowPlan.set(l.growPlanId, arr);
  }
  return headers.map((h) => rowsToLibraryPlan(h, byGrowPlan.get(h.id) ?? [], nutrients, lastPaid, media));
}

/** Each input's rolling 12-month average by the name it is received under, from the receipts on file. */
export async function rollingCostsWith(db: SeedDb, asOf: string) {
  const rows = await db.select({ receivedOn: farmReceipts.receivedOn, lines: farmReceipts.lines }).from(farmReceipts);
  return rollingCosts(rows.map((r) => ({ receivedOn: String(r.receivedOn), lines: (r.lines ?? []) as ReceiptDoc['lines'] })), asOf);
}

/** Each variety's last price paid, from every receipt on file. */
export async function lastPaidWith(db: SeedDb) {
  const rows = await db.select({ receivedOn: farmReceipts.receivedOn, lines: farmReceipts.lines }).from(farmReceipts);
  return lastPricesPaid(rows.map((r) => ({ receivedOn: String(r.receivedOn), lines: (r.lines ?? []) as ReceiptDoc['lines'] })), VARIETIES);
}
