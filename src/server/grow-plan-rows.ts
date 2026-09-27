import { asc, inArray } from 'drizzle-orm';
import { farmGrowPlans, farmGrowPlanLines } from '@/db';
import { rowsToLibraryPlan, type LibraryGrowPlan } from '@/engine/grow-plan-library';
import type { SeedDb } from '@/server/seed-writes';
import { listNutrientsWith } from '@/server/nutrient-rows';

/**
 * Rows → library plans, for any Drizzle handle. `_lib/grow-plans.ts` (server-only) and the
 * reseed script both read through this so the shape is built once. Oldest first: the seed
 * plans in variety order, then whatever was added. Each plan carries the workspace's Nutrients &
 * Supplements records its nutrient lines name.
 */
export async function listGrowPlansWith(db: SeedDb): Promise<LibraryGrowPlan[]> {
  const headers = await db.select().from(farmGrowPlans).orderBy(asc(farmGrowPlans.createdAt));
  if (headers.length === 0) return [];
  const nutrients = Object.fromEntries((await listNutrientsWith(db)).map((n) => [n.key, n]));
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
  return headers.map((h) => rowsToLibraryPlan(h, byGrowPlan.get(h.id) ?? [], nutrients));
}
