import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { farmGrowPlans, farmGrowPlanLines } from '@/db';
import { db } from '@/lib/db';
import { rowsToLibraryPlan, type LibraryGrowPlan } from '@/engine/grow-plan-library';
import { withSeedLock, seedMissingGrowPlans } from '@/server/seed-writes';
import { listGrowPlansWith, lastPaidWith } from '@/server/grow-plan-rows';
import { listNutrientsWith } from '@/server/nutrient-rows';
import { listMediaWith } from '@/server/media-rows';

/**
 * MicroFarm — grow plan library read layer (server-only).
 *
 * The library is the source of grow plans. Every seed plan whose code is not in the library — one
 * single-variety plan per variety — is inserted on read, marked `source = 'seed'`, under an
 * advisory lock and idempotent on the code, so a fresh database and one that predates a variety
 * both end up with the same library and the code constants stop being the source from that moment.
 */

async function seedMissing(): Promise<void> {
  await withSeedLock(db, 'growPlans', async (tx) => {
    await seedMissingGrowPlans(tx);
  });
}

/** Every library plan, oldest first, seeding the library on first read. */
export async function listGrowPlans(): Promise<LibraryGrowPlan[]> {
  await seedMissing();
  return listGrowPlansWith(db);
}

export async function getGrowPlanByCode(code: string): Promise<LibraryGrowPlan | null> {
  await seedMissing();
  const h = await db.select().from(farmGrowPlans).where(eq(farmGrowPlans.code, code)).limit(1);
  if (!h[0]) return null;
  const lines = await db
    .select()
    .from(farmGrowPlanLines)
    .where(eq(farmGrowPlanLines.growPlanId, h[0].id))
    .orderBy(asc(farmGrowPlanLines.position));
  const nutrients = Object.fromEntries((await listNutrientsWith(db)).map((n) => [n.key, n]));
  const media = Object.fromEntries((await listMediaWith(db)).map((m) => [m.key, m]));
  const lastPaid = await lastPaidWith(db);
  return rowsToLibraryPlan(h[0], lines, nutrients, lastPaid, media);
}
