/**
 * MicroFarm — the standard cost of a unit, per crop plan (Roadmap N3). Pure.
 *
 * The cost of a unit is food + labor + packaging (operating-model-roadmap §3.5).
 * Before N3 two of the three were not the crop plan's own:
 *
 *   * LABOR — every crop plan was charged one typed split, 180 fixed minutes a
 *     sowing and 1.5 a unit: the plan's study for AMK-E-001, scaled linearly.
 *     No caller passed a per-crop-plan figure, so a 150-unit adult crop plan and a
 *     950-unit prospect crop plan carried the same minutes (audit A2). The Time
 *     Studies page already showed each crop plan's own study, so the two pages
 *     disagreed about the same crop plan.
 *   * PACKAGING — every crop plan carried one flat per-unit figure, even where its
 *     packages were picked and costed. It is now the sum of the packages the
 *     crop plan picks, at the packaging library's cost (zero where none is entered).
 *
 * Neither function that consumes these changes shape. `costPerUnit`,
 * `laborForDay` and the sowing ledger read `assumptions.laborSplit` and
 * `assumptions.perUnit.packaging`; the resolver now builds an assumptions object
 * PER CROP PLAN carrying that crop plan's own labor standard and packaging, and every
 * caller costing a crop plan reads the crop plan's. One function per quantity, and the
 * inputs are the crop plan's.
 *
 * Because an approved standard freezes the assumptions it was costed at, it
 * freezes the crop plan's labor and packaging with them — no second snapshot shape.
 */

import type { CropPlanDef } from '../_data/plan-data';
import type { TimeStudyDoc } from '../_data/time-studies';
import type { PackagingLibrary } from '../_data/packaging';
import { estimatedTimeStudy } from './time-study-estimate';
import { laborStandard, studiesForCropPlan, summarizeStudy } from './time-studies';
import { cropPlanPackagingCost } from './packaging';

/**
 * Where a crop plan's labor minutes come from.
 *   observed  — an observed study adopted by an admin.
 *   estimated — the crop plan's estimated study, standing in until an observed one
 *               is adopted.
 *   none      — no study at all: labor is a GAP, reported as one, never zero
 *               presented as a cost.
 */
export type LaborBasis = 'observed' | 'estimated' | 'none';

export const LABOR_BASIS_LABELS: Record<LaborBasis, string> = {
  observed: 'Observed study',
  estimated: 'Estimated study',
  none: 'No study — labor is a gap',
};

export interface CropPlanLaborStandard {
  cropPlanCode: string;
  fixedMinutesPerSowing: number;
  variableMinutesPerUnit: number;
  basis: LaborBasis;
  /** The study it came from; null for a code estimate or a gap. */
  studyId: string | null;
  /** The sowing the study was timed or estimated at. */
  studiedSowingSize: number | null;
}

/**
 * A crop plan's labor standard.
 *
 * `studies === null` means no study library was loaded — an engine call from a
 * test or a script — and the crop plan's estimate is built in code, the same
 * estimate the database is seeded with. A LOADED library with no study for the
 * crop plan is a gap: the record says there is none, so none is reported.
 */
export function laborStandardFor(
  cropPlan: CropPlanDef,
  studies: readonly TimeStudyDoc[] | null,
  sowingSize: number,
): CropPlanLaborStandard {
  if (studies === null) {
    const s = summarizeStudy(estimatedTimeStudy(cropPlan, sowingSize));
    return {
      cropPlanCode: cropPlan.code,
      fixedMinutesPerSowing: s.fixedMinutesPerSowing,
      variableMinutesPerUnit: s.variableMinutesPerUnit,
      basis: 'estimated',
      studyId: null,
      studiedSowingSize: sowingSize,
    };
  }
  const standard = laborStandard(studiesForCropPlan(studies, cropPlan.code));
  if (!standard) {
    return { cropPlanCode: cropPlan.code, fixedMinutesPerSowing: 0, variableMinutesPerUnit: 0, basis: 'none', studyId: null, studiedSowingSize: null };
  }
  const s = summarizeStudy(standard);
  return {
    cropPlanCode: cropPlan.code,
    fixedMinutesPerSowing: s.fixedMinutesPerSowing,
    variableMinutesPerUnit: s.variableMinutesPerUnit,
    basis: standard.basis === 'observed' && standard.adoptedAt ? 'observed' : 'estimated',
    studyId: standard.id,
    studiedSowingSize: standard.sowingSize,
  };
}

/** Labor minutes for one unit at a sowing size; null when labor is a gap. */
export function laborMinutesPerUnit(std: CropPlanLaborStandard, sowingSize: number): number | null {
  if (std.basis === 'none') return null;
  return (sowingSize > 0 ? std.fixedMinutesPerSowing / sowingSize : 0) + std.variableMinutesPerUnit;
}

/** The shape every cost function already reads: the plan-data assumptions. */
interface CostAssumptions {
  laborSplit: {
    fixedMinutesPerSowing: { value: number; status: string; unit?: string; note?: string };
    variableMinutesPerUnit: { value: number; status: string; unit?: string; note?: string };
  };
  perUnit: { packaging: { value: number; status: string; unit?: string; note?: string } };
}

export interface CropPlanCostInputs {
  labor: CropPlanLaborStandard;
  /** The sum of the crop plan's picked packages at the library's cost. */
  packagingPerUnit: number;
}

/** A crop plan's labor standard and its packaging per unit. */
export function cropPlanCostInputs(
  cropPlan: CropPlanDef,
  studies: readonly TimeStudyDoc[] | null,
  sowingSize: number,
  packaging: PackagingLibrary,
): CropPlanCostInputs {
  return {
    labor: laborStandardFor(cropPlan, studies, sowingSize),
    packagingPerUnit: cropPlanPackagingCost(cropPlan.code, packaging).perUnit,
  };
}

/**
 * The assumptions a crop plan is costed at: the shared ones with the crop plan's own
 * labor standard and packaging written in, each retagged with where it came
 * from. The input is not mutated.
 */
export function assumptionsForCropPlan<A extends CostAssumptions>(shared: A, inputs: CropPlanCostInputs): A {
  const a = structuredClone(shared) as A;
  const { labor } = inputs;
  const laborNote =
    labor.basis === 'none'
      ? `No time study for ${labor.cropPlanCode}: labor is a gap, carried as zero minutes and reported as a gap.`
      : `${LABOR_BASIS_LABELS[labor.basis]} for ${labor.cropPlanCode}${labor.studiedSowingSize ? ` at a ${labor.studiedSowingSize}-unit sowing` : ''}.`;
  a.laborSplit.fixedMinutesPerSowing.value = labor.fixedMinutesPerSowing;
  a.laborSplit.fixedMinutesPerSowing.status = 'DERIVED';
  a.laborSplit.fixedMinutesPerSowing.note = laborNote;
  a.laborSplit.variableMinutesPerUnit.value = labor.variableMinutesPerUnit;
  a.laborSplit.variableMinutesPerUnit.status = 'DERIVED';
  a.laborSplit.variableMinutesPerUnit.note = laborNote;
  a.perUnit.packaging.value = inputs.packagingPerUnit;
  a.perUnit.packaging.status = 'DERIVED';
  a.perUnit.packaging.note = `The packages picked for ${labor.cropPlanCode}, at the packaging library's cost.`;
  return a;
}
