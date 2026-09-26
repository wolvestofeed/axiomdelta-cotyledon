import { asc } from 'drizzle-orm';
import { farmNutrients } from '@/db';
import { NUTRIENT_SOLUTIONS } from '@/data/inputs-catalog';
import { nutrientFromRow, nutrientToRow, type LibraryNutrient } from '@/engine/nutrients';
import type { SeedDb } from '@/server/seed-writes';

/**
 * Rows → the Nutrients & Supplements library, for any Drizzle handle. The server read layer, the
 * grow plan library and the scripts read through this. Every seed row whose key is not on file is
 * inserted first, `source = 'seed'`, idempotent on the workspace and key, so a workspace that
 * predates the library and a new one end up with the same rows; a row edited in the app is left
 * alone.
 */
export async function seedMissingNutrients(db: SeedDb): Promise<void> {
  const have = new Set((await db.select({ key: farmNutrients.key }).from(farmNutrients)).map((r) => r.key));
  const missing = NUTRIENT_SOLUTIONS.map((n, position) => ({ n, position })).filter(({ n }) => !have.has(n.key));
  if (missing.length === 0) return;
  await db
    .insert(farmNutrients)
    .values(missing.map(({ n, position }) => nutrientToRow(n, position, 'seed')))
    .onConflictDoNothing();
}

/** Every row in list order, seeding the missing seed rows first. */
export async function listNutrientsWith(db: SeedDb): Promise<LibraryNutrient[]> {
  await seedMissingNutrients(db);
  const rows = await db.select().from(farmNutrients).orderBy(asc(farmNutrients.position), asc(farmNutrients.createdAt));
  return rows.map(nutrientFromRow);
}
