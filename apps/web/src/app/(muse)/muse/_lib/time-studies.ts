import 'server-only';
import { asc, inArray } from 'drizzle-orm';
import { museTimeStudies, museTimeStudyIntervals, museTimeStudyLines } from '@ct/db';
import { db } from '@/lib/db';
import { TIME_STUDY_SEED_RECIPE, timeStudySeed, type TimeStudyLibrary } from '../_data/time-studies';
import { deriveCapacity } from '../_engine';
import type { LibraryRecipe } from '../_engine/recipe-library';
import { estimatedTimeStudy } from '../_engine/time-study-estimate';
import { timeStudyFromRows } from '../_engine/time-studies';
import { listRecipes } from './recipes';
import { withSeedLock, insertTimeStudy } from './seed-writes';

/**
 * Impact OS — time studies, read layer (server-only, Roadmap O2).
 *
 * On read, every library recipe with no study at all is seeded with one
 * ESTIMATED study, `source = 'seed'`, under an advisory lock and idempotent
 * per recipe: AMK-E-001 gets the plan's time study; every other recipe gets
 * the built estimate (`estimatedTimeStudy`) at its derived batch size at the
 * plan's defaults. The estimate stands as the labor standard until an
 * observed study is adopted (Robert, 2026-09-15).
 */

async function seedMissingStudies(recipes: readonly LibraryRecipe[]): Promise<void> {
  if (recipes.length === 0) return;
  const covered = new Set((await db.select({ recipeId: museTimeStudies.recipeId }).from(museTimeStudies)).map((r) => r.recipeId));
  if (recipes.every((r) => covered.has(r.id))) return;
  await withSeedLock(db, 'timeStudies', async (tx) => {
    const again = new Set((await tx.select({ recipeId: museTimeStudies.recipeId }).from(museTimeStudies)).map((r) => r.recipeId));
    for (const r of recipes) {
      if (again.has(r.id)) continue;
      const seed = r.code === TIME_STUDY_SEED_RECIPE ? timeStudySeed : estimatedTimeStudy(r, deriveCapacity(r).batchSize);
      await insertTimeStudy(tx, r.id, seed, 'seed');
    }
  });
}

export async function listTimeStudies(): Promise<TimeStudyLibrary> {
  const recipes = await listRecipes();
  const recipeIds = Object.fromEntries(recipes.map((r) => [r.code, r.id]));
  await seedMissingStudies(recipes);
  const codeById = new Map(recipes.map((r) => [r.id, r.code]));

  const [studies, intervals] = await Promise.all([
    db.select().from(museTimeStudies).orderBy(asc(museTimeStudies.createdAt)),
    db.select().from(museTimeStudyIntervals),
  ]);
  const lines = studies.length
    ? await db.select().from(museTimeStudyLines).where(inArray(museTimeStudyLines.studyId, studies.map((s) => s.id))).orderBy(asc(museTimeStudyLines.position))
    : [];
  const linesByStudy = new Map<string, typeof lines>();
  for (const l of lines) linesByStudy.set(l.studyId, [...(linesByStudy.get(l.studyId) ?? []), l]);

  return {
    studies: studies.flatMap((s) => {
      const code = codeById.get(s.recipeId);
      return code ? [timeStudyFromRows(code, s, linesByStudy.get(s.id) ?? [])] : [];
    }),
    intervals: Object.fromEntries(intervals.flatMap((i) => {
      const code = codeById.get(i.recipeId);
      return code ? [[code, i.intervalDays]] : [];
    })),
    recipeIds,
  };
}
