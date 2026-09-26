/**
 * MicroFarm — the dashboard's top row: averages over every ACTIVE crop plan
 *. Pure.
 *
 * Each In Service crop plan is costed on its own sowing — one unit of each Phase 1 grow unit —
 * with its own labor standard (the adopted time study, or the seeded estimate
 * that stands in until one is adopted), then the crop plans are averaged, each
 * crop plan counting once. The figures are the seeded estimates until observed
 * studies, closed sowing records and stated capacities replace them, and the
 * row says so. No figure here belongs to one crop plan.
 */

import type { assumptions as planAssumptions, CropPlanDef } from '../_data/plan-data';
import type { TimeStudyDoc } from '../_data/time-studies';
import { costCropPlan, costToServe, deriveCapacity, type CapacityInputs } from './index';
import { laborMinutesForSowing, laborStandard, studiesForCropPlan, summarizeStudy } from './time-studies';

export interface CropPlanAverageRow {
  code: string;
  name: string;
  /** The derived sowing, units. */
  sowing: number;
  /** Inputs at as-purchased prices, per unit, before the shrink allowance. */
  asPurchasedPerUnit: number;
  /** The unit input cost: sowing cost with the shrink allowance over the sowing's units. */
  inputCostPerUnit: number;
  /** Food + conversion labor + packaging + distribution. */
  costToServePerUnit: number;
  /** Clock minutes one sowing takes end to end on the standard: fixed lines as timed, per-unit lines scaled to the sowing. */
  sowingMinutes: number;
  /** People-minutes per unit on the standard at the sowing. */
  laborMinutesPerUnit: number;
  laborCostPerUnit: number;
  /** Whether the labor standard is an estimate or an observed, adopted study; null with no study. */
  laborBasis: 'estimated' | 'observed' | null;
}

export interface ActiveAverages {
  cropPlans: CropPlanAverageRow[];
  count: number;
  asPurchasedPerUnit: number;
  inputCostPerUnit: number;
  costToServePerUnit: number;
  sowingMinutes: number;
  laborMinutesPerUnit: number;
  laborCostPerUnit: number;
  /** Crop plans whose labor standard is the seeded estimate. */
  onEstimate: number;
  /** Crop plans with no time study at all: their labor is a gap, carried as zero and counted here. */
  withoutStudy: number;
}

/**
 * Clock minutes for one sowing on a study: its sowing-stream lines, fixed as timed,
 * per-unit scaled from the sowing studied. Harvest lines run on the distribution
 * day and are not part of the sowing.
 */
export function sowingElapsedMinutes(study: Pick<TimeStudyDoc, 'sowingSize' | 'lines'>, sowing: number): number {
  return study.lines
    .filter((l) => l.stream !== 'harvest')
    .reduce((s, l) => s + (l.scalesWith === 'fixed' ? l.elapsedMinutes : study.sowingSize > 0 ? (l.elapsedMinutes * sowing) / study.sowingSize : 0), 0);
}

export function activeCropPlanAverages(
  cropPlans: readonly CropPlanDef[],
  cap: CapacityInputs,
  a: typeof planAssumptions,
  studies: readonly TimeStudyDoc[],
  /** Each crop plan's own assumptions from the resolver (Roadmap N3): its labor standard AND its packaging picks. */
  cropPlanAssumptions?: Readonly<Record<string, typeof planAssumptions>>,
): ActiveAverages {
  const active = cropPlans.filter((r) => r.status === 'in_service');
  const rows: CropPlanAverageRow[] = active.map((r) => {
    const sowing = deriveCapacity(r, cap).sowingSize;
    const food = costCropPlan(r, a.yield.shrinkAllowance.value);
    const standard = laborStandard(studiesForCropPlan(studies, r.code));
    const own = cropPlanAssumptions?.[r.code];
    // The crop plan's own minutes: from the resolver's assumptions when supplied,
    // else its study. No study is a GAP — zero minutes, counted as a crop plan
    // without a study — never another crop plan's typed figure (Roadmap N3).
    const summary = standard ? summarizeStudy(standard) : null;
    const laborMinutesPerUnit = own
      ? sowing > 0 ? own.laborSplit.fixedMinutesPerSowing.value / sowing + own.laborSplit.variableMinutesPerUnit.value : 0
      : summary && sowing > 0 ? laborMinutesForSowing(summary, sowing) / sowing : 0;
    const serve = costToServe(r, own ?? a, cap, laborMinutesPerUnit);
    return {
      code: r.code,
      name: r.name,
      sowing,
      asPurchasedPerUnit: food.inputCostPerUnit,
      inputCostPerUnit: food.totalInputCostPerUnit,
      costToServePerUnit: serve.costToServe,
      sowingMinutes: standard ? sowingElapsedMinutes(standard, sowing) : 0,
      laborMinutesPerUnit,
      laborCostPerUnit: serve.directLabor,
      laborBasis: standard ? standard.basis : null,
    };
  });
  const n = rows.length;
  const mean = (pick: (r: CropPlanAverageRow) => number) => (n > 0 ? rows.reduce((s, r) => s + pick(r), 0) / n : 0);
  return {
    cropPlans: rows,
    count: n,
    asPurchasedPerUnit: mean((r) => r.asPurchasedPerUnit),
    inputCostPerUnit: mean((r) => r.inputCostPerUnit),
    costToServePerUnit: mean((r) => r.costToServePerUnit),
    sowingMinutes: mean((r) => r.sowingMinutes),
    laborMinutesPerUnit: mean((r) => r.laborMinutesPerUnit),
    laborCostPerUnit: mean((r) => r.laborCostPerUnit),
    onEstimate: rows.filter((r) => r.laborBasis === 'estimated').length,
    withoutStudy: rows.filter((r) => r.laborBasis === null).length,
  };
}
