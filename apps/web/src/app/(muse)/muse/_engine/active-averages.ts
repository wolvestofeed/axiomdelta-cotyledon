/**
 * Impact OS — the dashboard's top row: averages over every ACTIVE recipe
 * (Robert, 2026-09-15). Pure.
 *
 * Each In Service recipe is costed on its own batch — one unit of each Phase 1 vessel —
 * with its own labor standard (the adopted time study, or the seeded estimate
 * that stands in until one is adopted), then the recipes are averaged, each
 * recipe counting once. The figures are the seeded estimates until observed
 * studies, closed batch records and stated capacities replace them, and the
 * row says so. No figure here belongs to one recipe.
 */

import type { assumptions as planAssumptions, RecipeDef } from '../_data/plan-data';
import type { TimeStudyDoc } from '../_data/time-studies';
import { costRecipe, costToServe, deriveCapacity, type CapacityInputs } from './index';
import { laborMinutesForBatch, laborStandard, studiesForRecipe, summarizeStudy } from './time-studies';

export interface RecipeAverageRow {
  code: string;
  name: string;
  /** The derived batch, portions. */
  batch: number;
  /** Ingredients at as-purchased prices, per meal, before the shrink allowance. */
  asPurchasedPerMeal: number;
  /** The unit food cost: batch cost with the shrink allowance over the batch's portions. */
  foodCostPerMeal: number;
  /** Food + conversion labor + packaging + distribution. */
  costToServePerMeal: number;
  /** Clock minutes one batch takes end to end on the standard: fixed lines as timed, per-portion lines scaled to the batch. */
  batchMinutes: number;
  /** People-minutes per meal on the standard at the batch. */
  laborMinutesPerMeal: number;
  laborCostPerMeal: number;
  /** Whether the labor standard is an estimate or an observed, adopted study; null with no study. */
  laborBasis: 'estimated' | 'observed' | null;
}

export interface ActiveAverages {
  recipes: RecipeAverageRow[];
  count: number;
  asPurchasedPerMeal: number;
  foodCostPerMeal: number;
  costToServePerMeal: number;
  batchMinutes: number;
  laborMinutesPerMeal: number;
  laborCostPerMeal: number;
  /** Recipes whose labor standard is the seeded estimate. */
  onEstimate: number;
  /** Recipes with no time study at all: their labor is a gap, carried as zero and counted here. */
  withoutStudy: number;
}

/**
 * Clock minutes for one batch on a study: its batch-stream lines, fixed as timed,
 * per-portion scaled from the batch studied. Dispatch lines run on the delivery
 * day and are not part of the batch.
 */
export function batchElapsedMinutes(study: Pick<TimeStudyDoc, 'batchSize' | 'lines'>, batch: number): number {
  return study.lines
    .filter((l) => l.stream !== 'dispatch')
    .reduce((s, l) => s + (l.scalesWith === 'fixed' ? l.elapsedMinutes : study.batchSize > 0 ? (l.elapsedMinutes * batch) / study.batchSize : 0), 0);
}

export function activeRecipeAverages(
  recipes: readonly RecipeDef[],
  cap: CapacityInputs,
  a: typeof planAssumptions,
  studies: readonly TimeStudyDoc[],
  /** Each recipe's own assumptions from the resolver (Roadmap N3): its labor standard AND its packaging picks. */
  recipeAssumptions?: Readonly<Record<string, typeof planAssumptions>>,
): ActiveAverages {
  const active = recipes.filter((r) => r.status === 'in_service');
  const rows: RecipeAverageRow[] = active.map((r) => {
    const batch = deriveCapacity(r, cap).batchSize;
    const food = costRecipe(r, a.yield.shrinkAllowance.value);
    const standard = laborStandard(studiesForRecipe(studies, r.code));
    const own = recipeAssumptions?.[r.code];
    // The recipe's own minutes: from the resolver's assumptions when supplied,
    // else its study. No study is a GAP — zero minutes, counted as a recipe
    // without a study — never another recipe's typed figure (Roadmap N3).
    const summary = standard ? summarizeStudy(standard) : null;
    const laborMinutesPerMeal = own
      ? batch > 0 ? own.laborSplit.fixedMinutesPerBatch.value / batch + own.laborSplit.variableMinutesPerPortion.value : 0
      : summary && batch > 0 ? laborMinutesForBatch(summary, batch) / batch : 0;
    const serve = costToServe(r, own ?? a, cap, laborMinutesPerMeal);
    return {
      code: r.code,
      name: r.name,
      batch,
      asPurchasedPerMeal: food.foodCostPerPortion,
      foodCostPerMeal: food.totalFoodCostPerPortion,
      costToServePerMeal: serve.costToServe,
      batchMinutes: standard ? batchElapsedMinutes(standard, batch) : 0,
      laborMinutesPerMeal,
      laborCostPerMeal: serve.directLabor,
      laborBasis: standard ? standard.basis : null,
    };
  });
  const n = rows.length;
  const mean = (pick: (r: RecipeAverageRow) => number) => (n > 0 ? rows.reduce((s, r) => s + pick(r), 0) / n : 0);
  return {
    recipes: rows,
    count: n,
    asPurchasedPerMeal: mean((r) => r.asPurchasedPerMeal),
    foodCostPerMeal: mean((r) => r.foodCostPerMeal),
    costToServePerMeal: mean((r) => r.costToServePerMeal),
    batchMinutes: mean((r) => r.batchMinutes),
    laborMinutesPerMeal: mean((r) => r.laborMinutesPerMeal),
    laborCostPerMeal: mean((r) => r.laborCostPerMeal),
    onEstimate: rows.filter((r) => r.laborBasis === 'estimated').length,
    withoutStudy: rows.filter((r) => r.laborBasis === null).length,
  };
}
