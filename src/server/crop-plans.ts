import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { farmCropPlans, farmCropPlanLines } from '@/db';
import { db } from '@/lib/db';
import { rowsToCropPlan, type LibraryCropPlan } from '@/engine/crop-plan-library';
import { withSeedLock, seedMissingCropPlans } from '@/server/seed-writes';
import { listCropPlansWith } from '@/server/crop-plan-rows';
import { listNutrientsWith } from '@/server/nutrient-rows';

/**
 * MicroFarm — grow plan library read layer (server-only).
 *
 * The library is the source of grow plans. Every seed plan whose code is not in the library — one
 * single-variety plan per variety — is inserted on read, marked `source = 'seed'`, under an
 * advisory lock and idempotent on the code, so a fresh database and one that predates a variety
 * both end up with the same library and the code constants stop being the source from that moment.
 */

async function seedMissing(): Promise<void> {
  await withSeedLock(db, 'cropPlans', async (tx) => {
    await seedMissingCropPlans(tx);
  });
}

/** Every library plan, oldest first, seeding the library on first read. */
export async function listCropPlans(): Promise<LibraryCropPlan[]> {
  await seedMissing();
  return listCropPlansWith(db);
}

export async function getCropPlanByCode(code: string): Promise<LibraryCropPlan | null> {
  await seedMissing();
  const h = await db.select().from(farmCropPlans).where(eq(farmCropPlans.code, code)).limit(1);
  if (!h[0]) return null;
  const lines = await db
    .select()
    .from(farmCropPlanLines)
    .where(eq(farmCropPlanLines.cropPlanId, h[0].id))
    .orderBy(asc(farmCropPlanLines.position));
  const nutrients = Object.fromEntries((await listNutrientsWith(db)).map((n) => [n.key, n]));
  return rowsToCropPlan(h[0], lines, nutrients);
}
