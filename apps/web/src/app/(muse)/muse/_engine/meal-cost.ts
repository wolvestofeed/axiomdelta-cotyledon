/**
 * Impact OS — the standard cost of a meal, per recipe (Roadmap N3). Pure.
 *
 * The cost of a meal is food + labor + packaging (operating-model-roadmap §3.5).
 * Before N3 two of the three were not the recipe's own:
 *
 *   * LABOR — every recipe was charged one typed split, 180 fixed minutes a
 *     batch and 1.5 a portion: the plan's study for AMK-E-001, scaled linearly.
 *     No caller passed a per-recipe figure, so a 150-portion adult recipe and a
 *     950-portion school recipe carried the same minutes (audit A2). The Time
 *     Studies page already showed each recipe's own study, so the two pages
 *     disagreed about the same recipe.
 *   * PACKAGING — every recipe carried one flat per-meal figure, even where its
 *     packages were picked and costed. It is now the sum of the packages the
 *     recipe picks, at the packaging library's cost (zero where none is entered).
 *
 * Neither function that consumes these changes shape. `costPerMeal`,
 * `laborForDay` and the batch ledger read `assumptions.laborSplit` and
 * `assumptions.perMeal.packaging`; the resolver now builds an assumptions object
 * PER RECIPE carrying that recipe's own labor standard and packaging, and every
 * caller costing a recipe reads the recipe's. One function per quantity, and the
 * inputs are the recipe's.
 *
 * Because an approved standard freezes the assumptions it was costed at, it
 * freezes the recipe's labor and packaging with them — no second snapshot shape.
 */

import type { RecipeDef } from '../_data/plan-data';
import type { TimeStudyDoc } from '../_data/time-studies';
import type { PackagingLibrary } from '../_data/packaging';
import { estimatedTimeStudy } from './time-study-estimate';
import { laborStandard, studiesForRecipe, summarizeStudy } from './time-studies';
import { recipePackagingCost } from './packaging';

/**
 * Where a recipe's labor minutes come from.
 *   observed  — an observed study adopted by an admin.
 *   estimated — the recipe's estimated study, standing in until an observed one
 *               is adopted (Robert, 2026-09-15).
 *   none      — no study at all: labor is a GAP, reported as one, never zero
 *               presented as a cost.
 */
export type LaborBasis = 'observed' | 'estimated' | 'none';

export const LABOR_BASIS_LABELS: Record<LaborBasis, string> = {
  observed: 'Observed study',
  estimated: 'Estimated study',
  none: 'No study — labor is a gap',
};

export interface RecipeLaborStandard {
  recipeCode: string;
  fixedMinutesPerBatch: number;
  variableMinutesPerPortion: number;
  basis: LaborBasis;
  /** The study it came from; null for a code estimate or a gap. */
  studyId: string | null;
  /** The batch the study was timed or estimated at. */
  studiedBatchSize: number | null;
}

/**
 * A recipe's labor standard.
 *
 * `studies === null` means no study library was loaded — an engine call from a
 * test or a script — and the recipe's estimate is built in code, the same
 * estimate the database is seeded with. A LOADED library with no study for the
 * recipe is a gap: the record says there is none, so none is reported.
 */
export function laborStandardFor(
  recipe: RecipeDef,
  studies: readonly TimeStudyDoc[] | null,
  batchSize: number,
): RecipeLaborStandard {
  if (studies === null) {
    const s = summarizeStudy(estimatedTimeStudy(recipe, batchSize));
    return {
      recipeCode: recipe.code,
      fixedMinutesPerBatch: s.fixedMinutesPerBatch,
      variableMinutesPerPortion: s.variableMinutesPerPortion,
      basis: 'estimated',
      studyId: null,
      studiedBatchSize: batchSize,
    };
  }
  const standard = laborStandard(studiesForRecipe(studies, recipe.code));
  if (!standard) {
    return { recipeCode: recipe.code, fixedMinutesPerBatch: 0, variableMinutesPerPortion: 0, basis: 'none', studyId: null, studiedBatchSize: null };
  }
  const s = summarizeStudy(standard);
  return {
    recipeCode: recipe.code,
    fixedMinutesPerBatch: s.fixedMinutesPerBatch,
    variableMinutesPerPortion: s.variableMinutesPerPortion,
    basis: standard.basis === 'observed' && standard.adoptedAt ? 'observed' : 'estimated',
    studyId: standard.id,
    studiedBatchSize: standard.batchSize,
  };
}

/** Labor minutes for one meal at a batch size; null when labor is a gap. */
export function laborMinutesPerMeal(std: RecipeLaborStandard, batchSize: number): number | null {
  if (std.basis === 'none') return null;
  return (batchSize > 0 ? std.fixedMinutesPerBatch / batchSize : 0) + std.variableMinutesPerPortion;
}

/** The shape every cost function already reads: the plan-data assumptions. */
interface CostAssumptions {
  laborSplit: {
    fixedMinutesPerBatch: { value: number; status: string; unit?: string; note?: string };
    variableMinutesPerPortion: { value: number; status: string; unit?: string; note?: string };
  };
  perMeal: { packaging: { value: number; status: string; unit?: string; note?: string } };
}

export interface RecipeCostInputs {
  labor: RecipeLaborStandard;
  /** The sum of the recipe's picked packages at the library's cost. */
  packagingPerMeal: number;
}

/** A recipe's labor standard and its packaging per meal. */
export function recipeCostInputs(
  recipe: RecipeDef,
  studies: readonly TimeStudyDoc[] | null,
  batchSize: number,
  packaging: PackagingLibrary,
): RecipeCostInputs {
  return {
    labor: laborStandardFor(recipe, studies, batchSize),
    packagingPerMeal: recipePackagingCost(recipe.code, packaging).perMeal,
  };
}

/**
 * The assumptions a recipe is costed at: the shared ones with the recipe's own
 * labor standard and packaging written in, each retagged with where it came
 * from. The input is not mutated.
 */
export function assumptionsForRecipe<A extends CostAssumptions>(shared: A, inputs: RecipeCostInputs): A {
  const a = structuredClone(shared) as A;
  const { labor } = inputs;
  const laborNote =
    labor.basis === 'none'
      ? `No time study for ${labor.recipeCode}: labor is a gap, carried as zero minutes and reported as a gap.`
      : `${LABOR_BASIS_LABELS[labor.basis]} for ${labor.recipeCode}${labor.studiedBatchSize ? ` at a ${labor.studiedBatchSize}-portion batch` : ''}.`;
  a.laborSplit.fixedMinutesPerBatch.value = labor.fixedMinutesPerBatch;
  a.laborSplit.fixedMinutesPerBatch.status = 'DERIVED';
  a.laborSplit.fixedMinutesPerBatch.note = laborNote;
  a.laborSplit.variableMinutesPerPortion.value = labor.variableMinutesPerPortion;
  a.laborSplit.variableMinutesPerPortion.status = 'DERIVED';
  a.laborSplit.variableMinutesPerPortion.note = laborNote;
  a.perMeal.packaging.value = inputs.packagingPerMeal;
  a.perMeal.packaging.status = 'DERIVED';
  a.perMeal.packaging.note = `The packages picked for ${labor.recipeCode}, at the packaging library's cost.`;
  return a;
}
