import { asc, inArray } from 'drizzle-orm';
import { museRecipes, museRecipeLines } from '@ct/db';
import { rowsToRecipe, type LibraryRecipe } from '../_engine/recipe-library';
import type { SeedDb } from './seed-writes';

/** Listed at the bottom of the library. */
const LISTED_LAST = 'AMK-E-001';

/**
 * Rows → library recipes, for any Drizzle handle. `_lib/recipes.ts` (server-only)
 * and the reseed script both read through this so the shape is built once.
 */
export async function listRecipesWith(db: SeedDb): Promise<LibraryRecipe[]> {
  const byCreated = await db.select().from(museRecipes).orderBy(asc(museRecipes.createdAt));
  if (byCreated.length === 0) return [];
  // The operating model's costed bowl is listed after every other recipe
  // (Robert, 2026-09-14), so the first In Service recipe — the reference the
  // statements read — is a menu recipe.
  const headers = [...byCreated.filter((h) => h.code !== LISTED_LAST), ...byCreated.filter((h) => h.code === LISTED_LAST)];
  const lines = await db
    .select()
    .from(museRecipeLines)
    .where(inArray(museRecipeLines.recipeId, headers.map((h) => h.id)))
    .orderBy(asc(museRecipeLines.position));
  const byRecipe = new Map<string, typeof lines>();
  for (const l of lines) {
    const arr = byRecipe.get(l.recipeId) ?? [];
    arr.push(l);
    byRecipe.set(l.recipeId, arr);
  }
  return headers.map((h) => rowsToRecipe(h, byRecipe.get(h.id) ?? []));
}
