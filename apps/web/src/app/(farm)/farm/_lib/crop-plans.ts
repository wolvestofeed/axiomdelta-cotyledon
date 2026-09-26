import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { farmCropPlans, farmCropPlanLines } from '@mf/db';
import { db } from '@/lib/db';
import { rowsToCropPlan, type LibraryCropPlan } from '../_engine/crop-plan-library';
import { withSeedLock, seedMissingCropPlans } from './seed-writes';
import { listCropPlansWith } from './crop-plan-rows';

/**
 * MicroFarm — crop plan library read layer (server-only).
 *
 * The library is the source of crop plans. Every seed crop plan whose code is not in
 * the library — the code crop plan AMK-E-001 and the ten-unit menu AMK-E-002 …
 * 011 — is inserted on read, marked `source = 'seed'`, under an advisory lock
 * and idempotent on the code, so a fresh database and one that predates the
 * menu both end up with the same library and the code constants stop being the
 * source from that moment.
 */

async function seedMissing(): Promise<void> {
  await withSeedLock(db, 'cropPlans', async (tx) => {
    await seedMissingCropPlans(tx);
  });
}

/** Every library crop plan, oldest first, seeding the library on first read. */
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
  return rowsToCropPlan(h[0], lines);
}
