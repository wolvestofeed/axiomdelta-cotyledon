import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { museRecipes, museRecipeLines } from '@ct/db';
import { db } from '@/lib/db';
import { rowsToRecipe, type LibraryRecipe } from '../_engine/recipe-library';
import { withSeedLock, seedMissingRecipes } from './seed-writes';
import { listRecipesWith } from './recipe-rows';

/**
 * Impact OS — recipe library read layer (server-only).
 *
 * The library is the source of recipes. Every seed recipe whose code is not in
 * the library — the code recipe AMK-E-001 and the ten-meal menu AMK-E-002 …
 * 011 — is inserted on read, marked `source = 'seed'`, under an advisory lock
 * and idempotent on the code, so a fresh database and one that predates the
 * menu both end up with the same library and the code constants stop being the
 * source from that moment.
 */

async function seedMissing(): Promise<void> {
  await withSeedLock(db, 'recipes', async (tx) => {
    await seedMissingRecipes(tx);
  });
}

/** Every library recipe, oldest first, seeding the library on first read. */
export async function listRecipes(): Promise<LibraryRecipe[]> {
  await seedMissing();
  return listRecipesWith(db);
}

export async function getRecipeByCode(code: string): Promise<LibraryRecipe | null> {
  await seedMissing();
  const h = await db.select().from(museRecipes).where(eq(museRecipes.code, code)).limit(1);
  if (!h[0]) return null;
  const lines = await db
    .select()
    .from(museRecipeLines)
    .where(eq(museRecipeLines.recipeId, h[0].id))
    .orderBy(asc(museRecipeLines.position));
  return rowsToRecipe(h[0], lines);
}
