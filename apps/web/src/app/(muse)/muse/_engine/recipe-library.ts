/**
 * Impact OS — the recipe library, engine-side.
 *
 * Ledger-free, database-free. Conversions between a library row pair
 * (`muse.recipes` + `muse.recipe_lines`) and the `RecipeDef` the engine reads,
 * the next recipe code, and the spec block a new recipe gets from its grade
 * group. The read layer (`_lib/recipes.ts`) and the actions call these so the
 * shape is defined once.
 */

import {
  recipe as seedRecipe,
  type RecipeDef,
  type RecipeSpec,
  type RecipeStatus,
  type IngredientLine,
} from '../_data/plan-data';
import { tagged } from '../_data/tagged';
import { lunchPattern, type GradeGroup } from '../_data/meal-pattern';

export const RECIPE_STATUSES: RecipeStatus[] = ['in_service', 'planned', 'developing'];

/** A library recipe: the engine shape plus the row identity. */
export interface LibraryRecipe extends RecipeDef {
  id: string;
  source: 'seed' | 'user_built';
  version: number;
  effectiveFrom: string | null;
  updatedAt: string;
}

export interface RecipeHeaderRow {
  id: string;
  code: string;
  name: string;
  category: string;
  status: string;
  channels: unknown;
  components: string;
  productionMethod: string;
  allergensPresent: string;
  allergenFreeClaims: string;
  /** The portions the ingredient quantities are written for. */
  batchPortions: number;
  spec: unknown;
  source: string;
  version: number;
  effectiveFrom: string | Date | null;
  updatedAt: Date | string;
}

export interface RecipeLineRow {
  position: number;
  name: string;
  line: unknown;
}

const iso = (d: string | Date | null): string | null =>
  d === null ? null : typeof d === 'string' ? d : d.toISOString().slice(0, 10);

/** A stored line as the engine reads it (migration 0065 carries every row on the per-batch keys). */
export function lineFromStored(raw: unknown): IngredientLine {
  return raw as IngredientLine;
}

export function rowsToRecipe(header: RecipeHeaderRow, lines: readonly RecipeLineRow[]): LibraryRecipe {
  const status = RECIPE_STATUSES.includes(header.status as RecipeStatus)
    ? (header.status as RecipeStatus)
    : 'developing';
  return {
    id: header.id,
    code: header.code,
    name: header.name,
    category: header.category,
    status,
    channels: Array.isArray(header.channels) ? (header.channels as number[]).filter((n) => Number.isInteger(n)) : [],
    components: header.components,
    productionMethod: header.productionMethod,
    allergensPresent: header.allergensPresent,
    allergenFreeClaims: header.allergenFreeClaims,
    batchPortions: header.batchPortions > 0 ? header.batchPortions : 100,
    spec: (header.spec && typeof header.spec === 'object' && Object.keys(header.spec as object).length > 0
      ? header.spec
      : specForGradeGroup('9-12')) as RecipeSpec,
    ingredients: [...lines]
      .sort((a, b) => a.position - b.position)
      .map((l) => lineFromStored(l.line)),
    source: header.source === 'seed' ? 'seed' : 'user_built',
    version: header.version,
    effectiveFrom: iso(header.effectiveFrom),
    updatedAt: typeof header.updatedAt === 'string' ? header.updatedAt : header.updatedAt.toISOString(),
  };
}

/** The header + lines a recipe writes. Lines keep their order as positions. */
export function recipeToRows(r: RecipeDef): {
  header: Omit<RecipeHeaderRow, 'id' | 'version' | 'effectiveFrom' | 'updatedAt'>;
  lines: RecipeLineRow[];
} {
  return {
    header: {
      code: r.code,
      name: r.name,
      category: r.category,
      status: r.status,
      channels: r.channels,
      components: r.components,
      productionMethod: r.productionMethod,
      allergensPresent: r.allergensPresent,
      allergenFreeClaims: r.allergenFreeClaims,
      batchPortions: r.batchPortions,
      spec: r.spec,
      source: 'user_built',
    },
    lines: r.ingredients.map((line, position) => ({ position, name: line.name, line })),
  };
}

/** The seed the library starts from when it is empty. */
export const SEED_RECIPE: RecipeDef = seedRecipe;

/** `AMK-E-NNN`, one past the highest code already in the library. */
export function nextRecipeCode(existing: readonly string[], prefix = 'AMK-E-'): string {
  let max = 0;
  for (const c of existing) {
    const m = c.match(/^AMK-E-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/**
 * The spec block a new recipe gets: the credit target is the grade group's
 * daily minimum from the meal pattern, the vessel is a placeholder until a
 * packaging quote, and the utensil is unspecified until the standardized
 * recipe names it. Nothing here is a judgement about the recipe.
 */
export function specForGradeGroup(gradeGroup: GradeGroup, vesselOz = 16): RecipeSpec {
  const p = lunchPattern(gradeGroup);
  return {
    gradeGroup: tagged<GradeGroup>(gradeGroup, 'STATED', 'grade group', 'Grade group the recipe is authored for.'),
    creditTarget: {
      mmaOzEq: tagged(p.mma.dailyMin, 'SOURCED', 'oz eq', `7 CFR 210.10(c) grades ${gradeGroup} lunch daily minimum, meats/meat alternates`),
      grainsOzEq: tagged(p.grains.dailyMin, 'SOURCED', 'oz eq', `7 CFR 210.10(c) grades ${gradeGroup} lunch daily minimum, grains`),
    },
    carriesVegetableRequirement: tagged<boolean>(false, 'STATED', 'boolean', 'Whether the entree carries the whole vegetable requirement. Sides complete the reimbursable meal unless this is set.'),
    servingVesselCapacityOz: tagged(vesselOz, 'PLACEHOLDER', 'oz', 'Bowl capacity — the hard physical bound on plated weight. A packaging quote replaces it.'),
    portioningUtensil: tagged<string>('not specified', 'PLACEHOLDER', 'utensil', 'A standardized recipe states the serving utensil by size. Required for the production record.'),
  };
}

/** A blank ingredient line with every provenance tag set to placeholder. */
export function blankIngredientLine(name = ''): IngredientLine {
  return {
    name,
    spec: '',
    apQtyPerBatch: 0,
    unit: 'lb',
    yieldToCooked: 1,
    cookedYieldPerBatch: 0,
    apUnitCost: 0,
    packSize: 1,
    isHotComponent: true,
    status: 'PLACEHOLDER',
    source: 'Placeholder, quote required',
    yieldStatus: 'PLACEHOLDER',
    yieldSource: 'Unsourced working figure',
    crediting: { component: 'NONE', status: 'STATED', source: 'Not credited until a component is assigned.' },
    component: name || 'Component',
  };
}

/** Recompute the derived cooked yield on every line before a recipe is stored. */
export function normalizeLines(lines: readonly IngredientLine[]): IngredientLine[] {
  return lines.map((l) => ({ ...l, cookedYieldPerBatch: l.apQtyPerBatch * l.yieldToCooked }));
}

/** The recipe that stands for the platform where one is needed: the first In Service, else the first. */
export function referenceRecipe<T extends RecipeDef>(library: readonly T[]): T | undefined {
  return library.find((r) => r.status === 'in_service') ?? library[0];
}
