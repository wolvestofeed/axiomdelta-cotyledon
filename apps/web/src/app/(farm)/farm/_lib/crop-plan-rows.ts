import { asc, inArray } from 'drizzle-orm';
import { farmCropPlans, farmCropPlanLines } from '@mf/db';
import { rowsToCropPlan, type LibraryCropPlan } from '../_engine/crop-plan-library';
import type { SeedDb } from './seed-writes';

/** Listed at the bottom of the library. */
const LISTED_LAST = 'AMK-E-001';

/**
 * Rows → library crop plans, for any Drizzle handle. `_lib/crop-plans.ts` (server-only)
 * and the reseed script both read through this so the shape is built once.
 */
export async function listCropPlansWith(db: SeedDb): Promise<LibraryCropPlan[]> {
  const byCreated = await db.select().from(farmCropPlans).orderBy(asc(farmCropPlans.createdAt));
  if (byCreated.length === 0) return [];
  // The operating model's costed bowl is listed after every other crop plan
  //, so the first In Service crop plan — the reference the
  // statements read — is a menu crop plan.
  const headers = [...byCreated.filter((h) => h.code !== LISTED_LAST), ...byCreated.filter((h) => h.code === LISTED_LAST)];
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
  return headers.map((h) => rowsToCropPlan(h, byCropPlan.get(h.id) ?? []));
}
