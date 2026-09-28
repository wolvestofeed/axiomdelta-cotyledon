/**
 * Cotyledon — the standard cost of a unit, per grow plan (Roadmap N3). Pure.
 *
 * The cost of a unit is food + labor + packaging (operating-model-roadmap §3.5).
 * Before N3 two of the three were not the grow plan's own:
 *
 *   * LABOR — every grow plan was charged one typed split, 180 fixed minutes a
 *     sowing and 1.5 a unit: the plan's study for AMK-E-001, scaled linearly.
 *     No caller passed a per-grow-plan figure, so a 150-unit adult grow plan and a
 *     950-unit prospect grow plan carried the same minutes (audit A2). The Time
 *     Studies page already showed each grow plan's own study, so the two pages
 *     disagreed about the same grow plan.
 *   * PACKAGING — every grow plan carried one flat per-unit figure, even where its
 *     packages were picked and costed. It is now the sum of the packages the
 *     grow plan picks, at the packaging library's cost (zero where none is entered).
 *
 * Neither function that consumes these changes shape. `costPerUnit`,
 * `laborForDay` and the sowing ledger read `assumptions.laborSplit` and
 * `assumptions.perUnit.packaging`; the resolver now builds an assumptions object
 * PER GROW PLAN carrying that grow plan's own labor standard and packaging, and every
 * caller costing a grow plan reads the grow plan's. One function per quantity, and the
 * inputs are the grow plan's.
 *
 * Because an approved standard freezes the assumptions it was costed at, it
 * freezes the grow plan's labor and packaging with them — no second snapshot shape.
 */

import type { GrowPlanDef } from '@/data/grow-plan';
import type { TimeStudyDoc } from '@/data/time-studies';
import type { PackagingLibrary } from '@/data/packaging';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';
import { laborStandard, studiesForGrowPlan, summarizeStudy } from '@/engine/time-studies';
import { growPlanPackagingCost } from '@/engine/packaging';

/**
 * Where a grow plan's labor minutes come from.
 *   observed  — observed studies approved by an admin, averaged.
 *   estimated — the grow plan's estimated study, standing in until an observed one
 *               is approved.
 *   none      — no study at all: labor is a GAP, reported as one, never zero
 *               presented as a cost.
 */
export type LaborBasis = 'observed' | 'estimated' | 'none';

export const LABOR_BASIS_LABELS: Record<LaborBasis, string> = {
  observed: 'Observed study',
  estimated: 'Estimated study',
  none: 'No study — labor is a gap',
};

export interface GrowPlanLaborStandard {
  growPlanCode: string;
  fixedMinutesPerSowing: number;
  variableMinutesPerUnit: number;
  /** The daily stream (outline §5 rule 3): per tray per day, once a day, over the cycle the study was timed at. */
  dailyMinutesPerTrayDay: number;
  dailyFixedMinutesPerDay: number;
  cycleDays: number;
  basis: LaborBasis;
  /** The study it came from; null for a code estimate or a gap. */
  studyId: string | null;
  /** The sowing the study was timed or estimated at. */
  studiedSowingSize: number | null;
}

/**
 * A grow plan's labor standard.
 *
 * `studies === null` means no study library was loaded — an engine call from a
 * test or a script — and the grow plan's estimate is built in code, the same
 * estimate the database is seeded with. A LOADED library with no study for the
 * grow plan is a gap: the record says there is none, so none is reported.
 */
export function laborStandardFor(
  growPlan: GrowPlanDef,
  studies: readonly TimeStudyDoc[] | null,
  sowingSize: number,
): GrowPlanLaborStandard {
  if (studies === null) {
    const s = summarizeStudy(estimatedTimeStudy(growPlan, sowingSize));
    return {
      growPlanCode: growPlan.code,
      fixedMinutesPerSowing: s.fixedMinutesPerSowing,
      variableMinutesPerUnit: s.variableMinutesPerUnit,
      dailyMinutesPerTrayDay: s.dailyMinutesPerTrayDay,
      dailyFixedMinutesPerDay: s.dailyFixedMinutesPerDay,
      cycleDays: s.cycleDays,
      basis: 'estimated',
      studyId: null,
      studiedSowingSize: sowingSize,
    };
  }
  const standard = laborStandard(studiesForGrowPlan(studies, growPlan.code));
  if (!standard) {
    return { growPlanCode: growPlan.code, fixedMinutesPerSowing: 0, variableMinutesPerUnit: 0, dailyMinutesPerTrayDay: 0, dailyFixedMinutesPerDay: 0, cycleDays: 0, basis: 'none', studyId: null, studiedSowingSize: null };
  }
  const s = summarizeStudy(standard);
  return {
    growPlanCode: growPlan.code,
    fixedMinutesPerSowing: s.fixedMinutesPerSowing,
    variableMinutesPerUnit: s.variableMinutesPerUnit,
    dailyMinutesPerTrayDay: s.dailyMinutesPerTrayDay,
    dailyFixedMinutesPerDay: s.dailyFixedMinutesPerDay,
    cycleDays: s.cycleDays,
    basis: standard.basis === 'observed' && standard.approvedAt ? 'observed' : 'estimated',
    studyId: standard.id,
    studiedSowingSize: standard.sowingSize,
  };
}

/** The daily stream's minutes on one unit at a sowing size: per tray per day and the daily fixed share, over the cycle. */
export function dailyMinutesPerUnit(std: Pick<GrowPlanLaborStandard, 'dailyMinutesPerTrayDay' | 'dailyFixedMinutesPerDay' | 'cycleDays'>, sowingSize: number): number {
  return ((sowingSize > 0 ? std.dailyFixedMinutesPerDay / sowingSize : 0) + std.dailyMinutesPerTrayDay) * std.cycleDays;
}

/** Labor minutes for one unit at a sowing size, on all three streams; null when labor is a gap. */
export function laborMinutesPerUnit(std: GrowPlanLaborStandard, sowingSize: number): number | null {
  if (std.basis === 'none') return null;
  return (sowingSize > 0 ? std.fixedMinutesPerSowing / sowingSize : 0) + std.variableMinutesPerUnit + dailyMinutesPerUnit(std, sowingSize);
}

/** The shape every cost function already reads: the plan-data assumptions. */
interface CostAssumptions {
  laborSplit: {
    fixedMinutesPerSowing: { value: number; status: string; unit?: string; note?: string };
    variableMinutesPerUnit: { value: number; status: string; unit?: string; note?: string };
    dailyMinutesPerUnit?: { value: number; status: string; unit?: string; note?: string };
  };
  perUnit: { packaging: { value: number; status: string; unit?: string; note?: string } };
}

export interface GrowPlanCostInputs {
  labor: GrowPlanLaborStandard;
  /** The sum of the grow plan's picked packages at the library's cost. */
  packagingPerUnit: number;
}

/** A grow plan's labor standard and its packaging per unit. */
export function growPlanCostInputs(
  growPlan: GrowPlanDef,
  studies: readonly TimeStudyDoc[] | null,
  sowingSize: number,
  packaging: PackagingLibrary,
): GrowPlanCostInputs {
  return {
    labor: laborStandardFor(growPlan, studies, sowingSize),
    packagingPerUnit: growPlanPackagingCost(growPlan.code, packaging).perUnit,
  };
}

/**
 * The assumptions a grow plan is costed at: the shared ones with the grow plan's own
 * labor standard and packaging written in, each retagged with where it came
 * from. The input is not mutated.
 */
export function assumptionsForGrowPlan<A extends CostAssumptions>(shared: A, inputs: GrowPlanCostInputs): A {
  const a = structuredClone(shared) as A;
  const { labor } = inputs;
  const laborNote =
    labor.basis === 'none'
      ? `No time study for ${labor.growPlanCode}: labor is a gap, carried as zero minutes and reported as a gap.`
      : `${LABOR_BASIS_LABELS[labor.basis]} for ${labor.growPlanCode}${labor.studiedSowingSize ? ` at a ${labor.studiedSowingSize}-unit sowing` : ''}.`;
  a.laborSplit.fixedMinutesPerSowing.value = labor.fixedMinutesPerSowing;
  a.laborSplit.fixedMinutesPerSowing.status = 'DERIVED';
  a.laborSplit.fixedMinutesPerSowing.note = laborNote;
  a.laborSplit.variableMinutesPerUnit.value = labor.variableMinutesPerUnit;
  a.laborSplit.variableMinutesPerUnit.status = 'DERIVED';
  a.laborSplit.variableMinutesPerUnit.note = laborNote;
  a.laborSplit.dailyMinutesPerUnit = {
    value: dailyMinutesPerUnit(labor, labor.studiedSowingSize ?? 0),
    status: 'DERIVED',
    unit: 'min/unit',
    note: labor.cycleDays > 0 ? `The daily stream over the ${labor.cycleDays}-day cycle at the sowing studied. ${laborNote}` : `No daily stream on this standard. ${laborNote}`,
  };
  a.perUnit.packaging.value = inputs.packagingPerUnit;
  a.perUnit.packaging.status = 'DERIVED';
  a.perUnit.packaging.note = `The packages picked for ${labor.growPlanCode}, at the packaging library's cost.`;
  return a;
}
