import { asc, inArray } from 'drizzle-orm';
import { farmCropPlans, farmCropPlanLines } from '@/db';
import { rowsToCropPlan, type LibraryCropPlan } from '@/engine/crop-plan-library';
import type { SeedDb } from '@/server/seed-writes';
import { listNutrientsWith } from '@/server/nutrient-rows';

/**
 * Rows → library plans, for any Drizzle handle. `_lib/crop-plans.ts` (server-only) and the
 * reseed script both read through this so the shape is built once. Oldest first: the seed
 * plans in variety order, then whatever was added. Each plan carries the workspace's Nutrients &
 * Supplements records its nutrient lines name.
 */
export async function listCropPlansWith(db: SeedDb): Promise<LibraryCropPlan[]> {
  const headers = await db.select().from(farmCropPlans).orderBy(asc(farmCropPlans.createdAt));
  if (headers.length === 0) return [];
  const nutrients = Object.fromEntries((await listNutrientsWith(db)).map((n) => [n.key, n]));
  const lines = await db
    .select()
    .from(farmCropPlanLines)
    .where(inArray(farmCropPlanLines.cropPlanId, headers.map((h) => h.id)))
    .orderBy(asc(farmCropPlanLines.position));
  const byCropPlan = new Map<string, typeof lines>();
  for (const l of lines) {
    const arr = byCropPlan.get(l.cropPlanId) ?? [];
    arr.push(l);
    byCropPlan.set(l.cropPlanId, arr);
  }
  return headers.map((h) => rowsToCropPlan(h, byCropPlan.get(h.id) ?? [], nutrients));
}
