/**
 * MicroFarm — two crop plans costed under one forecast (agentic-assistance build
 * plan §6.3). Pure.
 *
 * The Crop plan tab of Compare: side A a library crop plan, side B its variant, both
 * costed at the same forecast's resolved inputs — the same plant, the same
 * shrink allowance, the same wage assumption, the same packaging. Every row is
 * off `deriveCapacity`, `sowingCosting`, `costToServe` and the labor standard;
 * nothing here is authored, and nothing picks a crop plan. Rows carry the same
 * `CompareRow` shape the Day tab renders. Labor is minutes and, because the cost
 * of a unit carries it, dollars at the forecast's blended loaded wage, labelled
 * as that assumption (decision 5).
 */

import { assumptionsForCropPlan, laborMinutesPerUnit, LABOR_BASIS_LABELS, type CropPlanCostInputs } from './unit-cost';
import { sowingCosting, costToServe, deriveCapacity, type CapacityInputs } from './index';
import type { CompareRow } from './compare';
import type { CropPlanDef } from '../_data/plan-data';
import type { ResolvedInputs } from './scenario';

export interface CropPlanSide {
  label: string;
  cropPlan: CropPlanDef;
  /** The crop plan's labor standard and packaging per unit, as the resolver builds them. */
  cost: CropPlanCostInputs;
  /** Figures on this side carried as placeholders (the variant's waived questions). */
  placeholders: number;
}

export interface CropPlanSideFigures {
  sowingSize: number;
  bindingGrowUnit: string | null;
  seedLb: number;
  harvestedLb: number;
  packedLb: number;
  sowingInputCost: number;
  sowingInputCostWithShrink: number;
  unitInputCost: number;
  /** Null where labor is a gap (no study). */
  laborMinutesPerSowing: number | null;
  laborMinutesPerUnit: number | null;
  laborDollarsPerSowing: number | null;
  laborDollarsPerUnit: number | null;
  packagingPerUnit: number;
  costToServe: number;
  linesWithoutNutrition: number;
  laborBasis: string;
}

export interface CropPlanComparison {
  labelA: string;
  labelB: string;
  a: CropPlanSideFigures;
  b: CropPlanSideFigures;
  rows: CompareRow[];
  identical: boolean;
  /** The wage the labor dollars are at, and its provenance note. */
  wage: { value: number; status: string; note: string };
}

const EPS = 1e-9;

export function cropPlanSideFigures(side: CropPlanSide, cap: CapacityInputs, shared: ResolvedInputs['assumptions']): CropPlanSideFigures {
  const a = assumptionsForCropPlan(shared, side.cost);
  const profile = deriveCapacity(side.cropPlan, cap);
  const sowing = profile.sowingSize;
  const bc = sowingCosting(side.cropPlan, cap, a.yield.shrinkAllowance.value);
  const std = side.cost.labor;
  const minutesPerUnit = laborMinutesPerUnit(std, sowing);
  const minutesPerSowing = std.basis === 'none' ? null : std.fixedMinutesPerSowing + std.variableMinutesPerUnit * sowing;
  const wage = a.labor.blendedLoadedWage.value;
  const cts = costToServe(side.cropPlan, a, cap, minutesPerUnit ?? undefined);
  return {
    sowingSize: sowing,
    bindingGrowUnit: profile.binding?.growUnit.item ?? null,
    seedLb: bc.seedLb,
    harvestedLb: bc.harvestedLb,
    packedLb: bc.packedLb,
    sowingInputCost: bc.sowingInputCost,
    sowingInputCostWithShrink: bc.sowingInputCostWithShrink,
    unitInputCost: bc.unitInputCost,
    laborMinutesPerSowing: minutesPerSowing,
    laborMinutesPerUnit: minutesPerUnit,
    laborDollarsPerSowing: minutesPerSowing === null ? null : (minutesPerSowing / 60) * wage,
    laborDollarsPerUnit: minutesPerUnit === null ? null : (minutesPerUnit / 60) * wage,
    packagingPerUnit: side.cost.packagingPerUnit,
    costToServe: cts.costToServe,
    linesWithoutNutrition: side.cropPlan.inputs.filter((l) => !l.nutrition || l.nutrition.component === 'NONE').length,
    laborBasis: LABOR_BASIS_LABELS[std.basis],
  };
}

const pick = (a: number, b: number, lessIsBetter: boolean): 'a' | 'b' | 'same' => {
  if (Math.abs(a - b) <= EPS) return 'same';
  return (b < a) === lessIsBetter ? 'b' : 'a';
};

export function compareCropPlans(a: CropPlanSide, b: CropPlanSide, cap: CapacityInputs, shared: ResolvedInputs['assumptions']): CropPlanComparison {
  const A = cropPlanSideFigures(a, cap, shared);
  const B = cropPlanSideFigures(b, cap, shared);
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
    num('sowing', 'Derived sowing size', 'units', A.sowingSize, B.sowingSize, null, 'What one unit of each Phase 1 grow unit takes, floored to 25. A different sowing is a different bound, not a better crop plan.'),
    text('binding', 'Binding grow unit', A.bindingGrowUnit, B.bindingGrowUnit, 'The grow unit that sets the sowing.'),
    num('seedLb', 'As-purchased lb per sowing', 'pounds', A.seedLb, B.seedLb, null),
    num('harvestedLb', 'Harvested lb per sowing', 'pounds', A.harvestedLb, B.harvestedLb, null),
    num('packedLb', 'Packed lb per sowing', 'pounds', A.packedLb, B.packedLb, null),
    num('sowingFood', 'Sowing input cost', 'dollars', A.sowingInputCost, B.sowingInputCost, true, 'Bulk inputs at as-purchased prices, for the derived sowing.'),
    num('sowingFoodShrink', 'Sowing input cost with shrink', 'dollars', A.sowingInputCostWithShrink, B.sowingInputCostWithShrink, true),
    num('unitFood', 'Unit input cost', 'dollars', A.unitInputCost, B.unitInputCost, true, 'Sowing input cost with shrink over the sowing’s units.'),
    num('laborMinSowing', 'Labor minutes per sowing', 'minutes', A.laborMinutesPerSowing, B.laborMinutesPerSowing, true, 'Fixed minutes per sowing plus variable minutes per unit at the sowing, off each crop plan’s labor standard.'),
    num('laborMinUnit', 'Labor minutes per unit', 'minutes', A.laborMinutesPerUnit, B.laborMinutesPerUnit, true),
    num('laborDollarsSowing', 'Labor dollars per sowing', 'dollars', A.laborDollarsPerSowing, B.laborDollarsPerSowing, true, `At the forecast’s blended loaded wage, $${wage.value.toFixed(2)}/hr (${wage.status.toLowerCase()}). Pay is held in Staffing; this is the plan assumption.`),
    num('laborDollarsUnit', 'Labor dollars per unit', 'dollars', A.laborDollarsPerUnit, B.laborDollarsPerUnit, true),
    num('packaging', 'Packaging per unit', 'dollars', A.packagingPerUnit, B.packagingPerUnit, null, 'The crop plan’s picked packages at the library’s cost; the variant carries the source crop plan’s picks.'),
    num('costToServe', 'Cost to serve per unit', 'dollars', A.costToServe, B.costToServe, true, 'Food + conversion labor + packaging + distribution. Storage excluded.'),
    num('uncredited', 'Lines without nutrition', 'count', A.linesWithoutNutrition, B.linesWithoutNutrition, true, 'A line credited as nothing toward the nutrient profile.'),
    text('laborBasis', 'Labor basis', A.laborBasis, B.laborBasis, 'An estimated standard stands until an observed study is adopted.'),
    num('placeholders', 'Placeholder figures', 'count', a.placeholders, b.placeholders, true, 'Figures carried from a waived question. Each is tagged on the variant.'),
  ];
  const identical = rows.every((r) => (r.delta === null ? r.a === r.b : Math.abs(r.delta) <= EPS));
  return { labelA: a.label, labelB: b.label, a: A, b: B, rows, identical, wage: { value: wage.value, status: wage.status, note: wage.note ?? '' } };
}
