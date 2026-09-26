/**
 * Impact OS — two recipes costed under one forecast (agentic-assistance build
 * plan §6.3). Pure.
 *
 * The Recipe tab of Compare: side A a library recipe, side B its variant, both
 * costed at the same forecast's resolved inputs — the same plant, the same
 * shrink allowance, the same wage assumption, the same packaging. Every row is
 * off `deriveCapacity`, `batchCosting`, `costToServe` and the labor standard;
 * nothing here is authored, and nothing picks a recipe. Rows carry the same
 * `CompareRow` shape the Day tab renders. Labor is minutes and, because the cost
 * of a meal carries it, dollars at the forecast's blended loaded wage, labelled
 * as that assumption (decision 5).
 */

import { assumptionsForRecipe, laborMinutesPerMeal, LABOR_BASIS_LABELS, type RecipeCostInputs } from './meal-cost';
import { batchCosting, costToServe, deriveCapacity, type CapacityInputs } from './index';
import type { CompareRow } from './compare';
import type { RecipeDef } from '../_data/plan-data';
import type { ResolvedInputs } from './scenario';

export interface RecipeSide {
  label: string;
  recipe: RecipeDef;
  /** The recipe's labor standard and packaging per meal, as the resolver builds them. */
  cost: RecipeCostInputs;
  /** Figures on this side carried as placeholders (the variant's waived questions). */
  placeholders: number;
}

export interface RecipeSideFigures {
  batchSize: number;
  bindingVessel: string | null;
  apLb: number;
  cookedLb: number;
  platedLb: number;
  batchFoodCost: number;
  batchFoodCostWithShrink: number;
  unitFoodCost: number;
  /** Null where labor is a gap (no study). */
  laborMinutesPerBatch: number | null;
  laborMinutesPerPortion: number | null;
  laborDollarsPerBatch: number | null;
  laborDollarsPerPortion: number | null;
  packagingPerMeal: number;
  costToServe: number;
  linesWithoutCrediting: number;
  laborBasis: string;
}

export interface RecipeComparison {
  labelA: string;
  labelB: string;
  a: RecipeSideFigures;
  b: RecipeSideFigures;
  rows: CompareRow[];
  identical: boolean;
  /** The wage the labor dollars are at, and its provenance note. */
  wage: { value: number; status: string; note: string };
}

const EPS = 1e-9;

export function recipeSideFigures(side: RecipeSide, cap: CapacityInputs, shared: ResolvedInputs['assumptions']): RecipeSideFigures {
  const a = assumptionsForRecipe(shared, side.cost);
  const profile = deriveCapacity(side.recipe, cap);
  const batch = profile.batchSize;
  const bc = batchCosting(side.recipe, cap, a.yield.shrinkAllowance.value);
  const std = side.cost.labor;
  const minutesPerMeal = laborMinutesPerMeal(std, batch);
  const minutesPerBatch = std.basis === 'none' ? null : std.fixedMinutesPerBatch + std.variableMinutesPerPortion * batch;
  const wage = a.labor.blendedLoadedWage.value;
  const cts = costToServe(side.recipe, a, cap, minutesPerMeal ?? undefined);
  return {
    batchSize: batch,
    bindingVessel: profile.binding?.vessel.item ?? null,
    apLb: bc.apLb,
    cookedLb: bc.cookedLb,
    platedLb: bc.platedLb,
    batchFoodCost: bc.batchFoodCost,
    batchFoodCostWithShrink: bc.batchFoodCostWithShrink,
    unitFoodCost: bc.unitFoodCost,
    laborMinutesPerBatch: minutesPerBatch,
    laborMinutesPerPortion: minutesPerMeal,
    laborDollarsPerBatch: minutesPerBatch === null ? null : (minutesPerBatch / 60) * wage,
    laborDollarsPerPortion: minutesPerMeal === null ? null : (minutesPerMeal / 60) * wage,
    packagingPerMeal: side.cost.packagingPerMeal,
    costToServe: cts.costToServe,
    linesWithoutCrediting: side.recipe.ingredients.filter((l) => !l.crediting || l.crediting.component === 'NONE').length,
    laborBasis: LABOR_BASIS_LABELS[std.basis],
  };
}

const pick = (a: number, b: number, lessIsBetter: boolean): 'a' | 'b' | 'same' => {
  if (Math.abs(a - b) <= EPS) return 'same';
  return (b < a) === lessIsBetter ? 'b' : 'a';
};

export function compareRecipes(a: RecipeSide, b: RecipeSide, cap: CapacityInputs, shared: ResolvedInputs['assumptions']): RecipeComparison {
  const A = recipeSideFigures(a, cap, shared);
  const B = recipeSideFigures(b, cap, shared);
  const num = (key: string, label: string, format: CompareRow['format'], x: number | null, y: number | null, lessIsBetter: boolean | null, note?: string): CompareRow => ({
    key,
    label,
    format,
    a: x,
    b: y,
    delta: x === null || y === null ? null : y - x,
    better: lessIsBetter === null || x === null || y === null ? null : pick(x, y, lessIsBetter),
    ...(note ? { note } : {}),
  });
  const text = (key: string, label: string, x: string | null, y: string | null, note?: string): CompareRow => ({ key, label, format: 'text', a: x, b: y, delta: null, better: null, ...(note ? { note } : {}) });
  const wage = shared.labor.blendedLoadedWage;

  const rows: CompareRow[] = [
    num('batch', 'Derived batch size', 'portions', A.batchSize, B.batchSize, null, 'What one unit of each Phase 1 vessel takes, floored to 25. A different batch is a different bound, not a better recipe.'),
    text('binding', 'Binding vessel', A.bindingVessel, B.bindingVessel, 'The vessel that sets the batch.'),
    num('apLb', 'As-purchased lb per batch', 'pounds', A.apLb, B.apLb, null),
    num('cookedLb', 'Cooked lb per batch', 'pounds', A.cookedLb, B.cookedLb, null),
    num('platedLb', 'Plated lb per batch', 'pounds', A.platedLb, B.platedLb, null),
    num('batchFood', 'Batch food cost', 'dollars', A.batchFoodCost, B.batchFoodCost, true, 'Bulk inputs at as-purchased prices, for the derived batch.'),
    num('batchFoodShrink', 'Batch food cost with shrink', 'dollars', A.batchFoodCostWithShrink, B.batchFoodCostWithShrink, true),
    num('unitFood', 'Unit food cost', 'dollars', A.unitFoodCost, B.unitFoodCost, true, 'Batch food cost with shrink over the batch’s portions.'),
    num('laborMinBatch', 'Labor minutes per batch', 'minutes', A.laborMinutesPerBatch, B.laborMinutesPerBatch, true, 'Fixed minutes per batch plus variable minutes per portion at the batch, off each recipe’s labor standard.'),
    num('laborMinPortion', 'Labor minutes per portion', 'minutes', A.laborMinutesPerPortion, B.laborMinutesPerPortion, true),
    num('laborDollarsBatch', 'Labor dollars per batch', 'dollars', A.laborDollarsPerBatch, B.laborDollarsPerBatch, true, `At the forecast’s blended loaded wage, $${wage.value.toFixed(2)}/hr (${wage.status.toLowerCase()}). Pay is held in CompTable; this is the plan assumption.`),
    num('laborDollarsPortion', 'Labor dollars per portion', 'dollars', A.laborDollarsPerPortion, B.laborDollarsPerPortion, true),
    num('packaging', 'Packaging per meal', 'dollars', A.packagingPerMeal, B.packagingPerMeal, null, 'The recipe’s picked packages at the library’s cost; the variant carries the source recipe’s picks.'),
    num('costToServe', 'Cost to serve per meal', 'dollars', A.costToServe, B.costToServe, true, 'Food + conversion labor + packaging + distribution. Storage excluded.'),
    num('uncredited', 'Lines without crediting', 'count', A.linesWithoutCrediting, B.linesWithoutCrediting, true, 'A line credited as nothing toward the meal pattern.'),
    text('laborBasis', 'Labor basis', A.laborBasis, B.laborBasis, 'An estimated standard stands until an observed study is adopted.'),
    num('placeholders', 'Placeholder figures', 'count', a.placeholders, b.placeholders, true, 'Figures carried from a waived question. Each is tagged on the variant.'),
  ];
  const identical = rows.every((r) => (r.delta === null ? r.a === r.b : Math.abs(r.delta) <= EPS));
  return { labelA: a.label, labelB: b.label, a: A, b: B, rows, identical, wage: { value: wage.value, status: wage.status, note: wage.note ?? '' } };
}
