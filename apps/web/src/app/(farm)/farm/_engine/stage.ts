/**
 * MicroFarm — a crop plan's time from the start of growing to the blast
 * blackout rack, read from the crop plan's sow times.
 *
 * Every hot component of a crop plan is harvested by one of the stage processing
 * standards (`_data/grow-stages.ts`). The cooling clock starts the moment
 * a sow ends and the product goes straight into 2-inch hotel pans and the
 * rack, and one crop plan's hot components fill one blackout rack sowing together. So
 * the components are started staggered — longest first — to finish at the same
 * minute, and the crop plan's sow-to-blackout time is its LONGEST same-day component
 * sow on file, at the plan's point of the range (the high end).
 *
 * A component with no sow time on file is a gap, listed beside the time; it is
 * never filled with a placeholder. An overnight sow is ready when the crew
 * arrives and adds no same-day minutes. A crop plan with no sow time on file for
 * any component has no sow-to-blackout time at all.
 */

import type { CropPlanDef } from '../_data/plan-data';
import { growStages, CROP_PLAN_COMPONENT_STAGE, type GrowStage } from '../_data/grow-stages';

export type RangePoint = 'low' | 'mid' | 'high';

/** The point of each stated range the plan reads. */
export const PLAN_RANGE_POINT: RangePoint = 'high';

export function minutesAt(p: GrowStage, point: RangePoint = PLAN_RANGE_POINT): number {
  if (point === 'low') return p.minMinutes;
  if (point === 'mid') return (p.minMinutes + p.maxMinutes) / 2;
  return p.maxMinutes;
}

export interface ComponentStage {
  component: string;
  process: GrowStage | null;
  /** Minutes at the plan's point of the range; null with no process. */
  minutes: number | null;
  gap: string | null;
  basis: string | null;
}

export interface CropPlanStage {
  cropPlanCode: string;
  /** The standard row the crop plan reads (the student crop plan for an adult row). */
  mapCode: string;
  point: RangePoint;
  components: ComponentStage[];
  /** Every hot component has a sow time and nothing is left uncovered. */
  complete: boolean;
  /** Longest same-day sow on file; null when no component has a sow time. */
  sowToBlackoutMinutes: number | null;
  /** The component that sets it. */
  longestComponent: string | null;
  /** Components harvested the night before the production day. */
  overnight: string[];
  gaps: string[];
}

const mapCodeOf = (code: string) => code.replace(/^AMK-A-/, 'AMK-E-');

export function cropPlanStage(cropPlan: CropPlanDef, point: RangePoint = PLAN_RANGE_POINT): CropPlanStage {
  const mapCode = mapCodeOf(cropPlan.code);
  const map = CROP_PLAN_COMPONENT_STAGE[mapCode] ?? {};
  const hot: string[] = [];
  for (const l of cropPlan.inputs) {
    if (l.isHotComponent && !hot.includes(l.component)) hot.push(l.component);
  }
  const components: ComponentStage[] = hot.map((component) => {
    const entry = map[component];
    const process = entry?.process ? growStages.find((p) => p.id === entry.process) ?? null : null;
    const gap = entry?.gap ?? (process ? null : 'No sow time on file for this component');
    return { component, process, minutes: process ? minutesAt(process, point) : null, gap, basis: entry?.basis ?? null };
  });
  const timed = components.filter((c) => c.process !== null);
  let longest: ComponentStage | null = null;
  for (const c of timed) {
    if (c.process!.overnight || c.minutes === null) continue;
    if (!longest || c.minutes > (longest.minutes ?? 0)) longest = c;
  }
  return {
    cropPlanCode: cropPlan.code,
    mapCode,
    point,
    components,
    complete: components.length > 0 && components.every((c) => c.process !== null && c.gap === null),
    sowToBlackoutMinutes: timed.length > 0 ? longest?.minutes ?? 0 : null,
    longestComponent: longest?.component ?? null,
    overnight: components.filter((c) => c.process?.overnight).map((c) => c.component),
    gaps: components.filter((c) => c.gap !== null).map((c) => `${c.component}: ${c.gap}`),
  };
}
