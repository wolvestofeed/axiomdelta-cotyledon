/**
 * Cotyledon — what the approved time studies measured, beside what the plan carried before them.
 * Pure. Actuals reads it: for each grow plan with an approved study, the labor minutes per tray,
 * the water per tray over the cycle and per watering by method, and each supplement's ml per tray,
 * measured (the tray-weighted average of the approved studies that recorded it) against the figure
 * the plan is costed at without them (the stage schedule's placeholder volumes, the nutrient
 * line's strength, the estimated study).
 */

import type { GrowPlanDef } from '@/data/grow-plan';
import { planStages } from '@/data/grow-plan';
import type { MeasuredConsumption, TimeStudyDoc } from '@/data/time-studies';
import { WATER_PER_WATERING_OZ, type WateringMethod } from '@/data/stage-schedule';
import type { StatusTag } from '@/data/tagged';
import { costGrowPlan, defaultGrowCostContext, fixtureFor } from '@/engine/grow-costing';
import { approvedStudies, laborStandard, measuredConsumption, studiesForGrowPlan, summarizeStudy } from '@/engine/time-studies';

export interface PerWateringRow {
  method: Exclude<WateringMethod, 'none'>;
  measured: number | null;
  before: number;
  beforeStatus: StatusTag;
}

export interface SupplementRow {
  key: string;
  measuredMlPerTray: number;
  /** The plan's nutrient line for the key at its strength and the placeholder volumes; null when the plan has no line for it. */
  beforeMlPerTray: number | null;
  onPlan: boolean;
}

export interface MeasuredRow {
  code: string;
  name: string;
  approved: number;
  /** Labor minutes per tray: the approved studies averaged, and the estimate that stood before them. */
  laborMinutesPerTray: number;
  estimateMinutesPerTray: number | null;
  measured: MeasuredConsumption | null;
  waterOzPerTray: { measured: number | null; before: number };
  perWatering: PerWateringRow[];
  supplements: SupplementRow[];
}

/** One row per plan with at least one approved study, in the order the plans are given. */
export function measuredRows(plans: readonly GrowPlanDef[], studies: readonly TimeStudyDoc[]): MeasuredRow[] {
  const out: MeasuredRow[] = [];
  for (const plan of plans) {
    const own = studiesForGrowPlan(studies, plan.code);
    const approved = approvedStudies(own);
    if (approved.length === 0) continue;
    const measured = measuredConsumption(own);
    const base: GrowPlanDef = { ...plan, measured: undefined };
    const before = costGrowPlan(base, defaultGrowCostContext({ fixture: fixtureFor(base) }));
    const estimate = own.find((s) => s.basis === 'estimated');
    const methods = [...new Set(planStages(plan).map((s) => s.watering).filter((m): m is Exclude<WateringMethod, 'none'> => m !== 'none'))];
    const onPlan = new Map(before.lines.filter((l) => l.line.kind === 'nutrient').map((l) => [(l.line as { nutrientKey: string }).nutrientKey, l.quantity]));
    const keys = [...new Set([...Object.keys(measured?.mlPerTray ?? {})])];
    out.push({
      code: plan.code,
      name: plan.name,
      approved: approved.length,
      laborMinutesPerTray: summarizeStudy(laborStandard(own)!).laborMinutesPerUnit,
      estimateMinutesPerTray: estimate ? summarizeStudy(estimate).laborMinutesPerUnit : null,
      measured,
      waterOzPerTray: { measured: measured?.waterOzPerTray ?? null, before: before.waterOzPerTray },
      perWatering: methods.map((m) => ({ method: m, measured: measured?.ozPerWatering[m] ?? null, before: WATER_PER_WATERING_OZ[m].value, beforeStatus: WATER_PER_WATERING_OZ[m].status })),
      supplements: keys.map((key) => ({ key, measuredMlPerTray: measured!.mlPerTray[key]!, beforeMlPerTray: onPlan.get(key) ?? null, onPlan: onPlan.has(key) })),
    });
  }
  return out;
}
