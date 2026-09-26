'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { museRecipes, museRecipeLines, museBatchRecords } from '@ct/db';
import { db } from '@/lib/db';
import { accessRefusal, requireMuseSuperAdmin } from './access';
import {
  recipeToRows,
  normalizeLines,
  specForGradeGroup,
  RECIPE_STATUSES,
} from '../_engine/recipe-library';
import type { RecipeDef, IngredientLine, RecipeStatus } from '../_data/plan-data';

/**
 * Impact OS — recipe library writes. SUPER ADMIN ONLY.
 *
 * A library recipe is the standard a scenario's edits are measured against, so
 * it is written here, not through the forecast overlay. Saving bumps the
 * version; the lines are replaced whole (a recipe is one document).
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}

const Status = z.enum(['SOURCED', 'STATED', 'PLACEHOLDER', 'DERIVED', 'UNCONFIRMED', 'DATED']);

const Crediting = z
  .object({
    component: z.enum(['MMA', 'GRAINS', 'VEG', 'FRUIT', 'NONE']),
    vegSubgroup: z.enum(['DARK_GREEN', 'RED_ORANGE', 'BEANS_PEAS_LENTILS', 'STARCHY', 'OTHER']).optional(),
    grainGroup: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']).optional(),
    cupWeightG: z.number().positive().optional(),
    unitWeightG: z.number().positive().optional(),
    legumeElection: z.enum(['MMA', 'VEG']).optional(),
    status: Status,
    source: z.string().max(1000),
  })
  .optional();

const Line = z.object({
  name: z.string().trim().min(1, 'Every line needs a name').max(120),
  spec: z.string().max(400).default(''),
  apQtyPerBatch: z.number().min(0),
  unit: z.enum(['lb', 'each']),
  /** 0 is authored: a line absorbed into its component (oil, a seasoning) whose mass is carried on another line. */
  yieldToCooked: z.number().min(0),
  apUnitCost: z.number().min(0),
  packSize: z.number().positive(),
  isHotComponent: z.boolean(),
  unitMassOz: z.number().positive().optional(),
  trimYield: z.number().positive().optional(),
  chillYield: z.number().positive().optional(),
  status: Status,
  source: z.string().max(1000),
  yieldStatus: Status,
  yieldSource: z.string().max(1000),
  crediting: Crediting,
  component: z.string().trim().min(1).max(120),
  /** FDA Food Traceability List category (21 CFR 1.1990) the line falls under, set per line; absent means out of scope. */
  foodTraceabilityList: z.string().trim().min(1).max(120).optional(),
});

const RecipeInput = z.object({
  code: z.string().trim().regex(/^[A-Z0-9-]{3,24}$/, 'Code is upper-case letters, digits and dashes'),
  name: z.string().trim().min(1).max(160),
  category: z.string().max(160).default(''),
  status: z.enum(['in_service', 'planned', 'developing']),
  channels: z.array(z.number().int().min(1).max(3)).default([]),
  components: z.string().max(1000).default(''),
  productionMethod: z.string().max(1000).default(''),
  allergensPresent: z.string().max(400).default(''),
  allergenFreeClaims: z.string().max(400).default(''),
  /** The portions the ingredient quantities are written for; the production batch is derived, never typed. */
  batchPortions: z.number().int().min(1, 'The quantities are written for at least one portion').max(100_000).default(100),
  gradeGroup: z.enum(['K-5', '6-8', '9-12']).default('9-12'),
  servingVesselCapacityOz: z.number().positive().default(16),
  ingredients: z.array(Line).min(1, 'A recipe needs at least one ingredient line'),
});

function toRecipe(d: z.infer<typeof RecipeInput>): RecipeDef {
  const lines = normalizeLines(d.ingredients as IngredientLine[]);
  return {
    code: d.code,
    name: d.name,
    category: d.category,
    status: d.status as RecipeStatus,
    channels: [...new Set(d.channels)].sort(),
    components: d.components,
    productionMethod: d.productionMethod,
    allergensPresent: d.allergensPresent,
    allergenFreeClaims: d.allergenFreeClaims,
    batchPortions: d.batchPortions,
    spec: specForGradeGroup(d.gradeGroup, d.servingVesselCapacityOz),
    ingredients: lines,
  };
}

/** Add a recipe to the library. */
export async function createRecipe(input: unknown): Promise<Result<{ id: string; code: string }>> {
  const parsed = RecipeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'recipe'}: ${i.message}`).join('; ') };
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const names = new Set<string>();
  for (const l of parsed.data.ingredients) {
    if (names.has(l.name)) return { ok: false, error: `Ingredient "${l.name}" appears twice.` };
    names.add(l.name);
  }
  const existing = await db.select({ id: museRecipes.id }).from(museRecipes).where(eq(museRecipes.code, parsed.data.code)).limit(1);
  if (existing[0]) return { ok: false, error: `Recipe code ${parsed.data.code} is already in the library.` };

  const { header, lines } = recipeToRows(toRecipe(parsed.data));
  const inserted = await db
    .insert(museRecipes)
    .values({ ...header, effectiveFrom: new Date().toISOString().slice(0, 10), createdBy: access.userId })
    .returning({ id: museRecipes.id });
  const id = inserted[0]?.id;
  if (!id) return { ok: false, error: 'Failed to save the recipe.' };
  await db.insert(museRecipeLines).values(lines.map((l) => ({ recipeId: id, ...l })));
  revalidatePath('/muse', 'layout');
  return { ok: true, id, code: parsed.data.code };
}

const UpdateInput = RecipeInput.extend({ id: z.string().uuid() });

/** Replace a library recipe's header and lines; bumps the version. */
export async function updateRecipe(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = UpdateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'recipe'}: ${i.message}`).join('; ') };
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const names = new Set<string>();
  for (const l of parsed.data.ingredients) {
    if (names.has(l.name)) return { ok: false, error: `Ingredient "${l.name}" appears twice.` };
    names.add(l.name);
  }
  const current = await db.select({ id: museRecipes.id, version: museRecipes.version, code: museRecipes.code }).from(museRecipes).where(eq(museRecipes.id, parsed.data.id)).limit(1);
  if (!current[0]) return { ok: false, error: 'Recipe not found.' };
  if (current[0].code !== parsed.data.code) {
    const clash = await db.select({ id: museRecipes.id }).from(museRecipes).where(eq(museRecipes.code, parsed.data.code)).limit(1);
    if (clash[0]) return { ok: false, error: `Recipe code ${parsed.data.code} is already in the library.` };
  }
  const { header, lines } = recipeToRows(toRecipe(parsed.data));
  await db
    .update(museRecipes)
    .set({ ...header, source: undefined, version: current[0].version + 1, effectiveFrom: new Date().toISOString().slice(0, 10), updatedAt: new Date() })
    .where(eq(museRecipes.id, parsed.data.id));
  await db.delete(museRecipeLines).where(eq(museRecipeLines.recipeId, parsed.data.id));
  await db.insert(museRecipeLines).values(lines.map((l) => ({ recipeId: parsed.data.id, ...l })));
  revalidatePath('/muse', 'layout');
  return { ok: true, id: parsed.data.id };
}

const StatusInput = z.object({ id: z.string().uuid(), status: z.enum(['in_service', 'planned', 'developing']) });

export async function setRecipeStatus(input: unknown): Promise<Result> {
  const parsed = StatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'recipe'}: ${i.message}`).join('; ') };
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  if (!RECIPE_STATUSES.includes(parsed.data.status)) return { ok: false, error: 'Unknown status.' };
  await db.update(museRecipes).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(museRecipes.id, parsed.data.id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

const DeleteInput = z.object({ id: z.string().uuid() });

/** Remove a recipe. Refused while a batch record names its code, or if it is the last one. */
export async function deleteRecipe(input: unknown): Promise<Result> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'recipe'}: ${i.message}`).join('; ') };
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const row = await db.select({ code: museRecipes.code }).from(museRecipes).where(eq(museRecipes.id, parsed.data.id)).limit(1);
  if (!row[0]) return { ok: false, error: 'Recipe not found.' };
  const used = await db.select({ id: museBatchRecords.id }).from(museBatchRecords).where(eq(museBatchRecords.recipeCode, row[0].code)).limit(1);
  if (used[0]) return { ok: false, error: `Batch records name ${row[0].code}; a recipe with production history is not deleted.` };
  const count = await db.select({ id: museRecipes.id }).from(museRecipes);
  if (count.length <= 1) return { ok: false, error: 'The library keeps at least one recipe.' };
  await db.delete(museRecipes).where(eq(museRecipes.id, parsed.data.id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}
