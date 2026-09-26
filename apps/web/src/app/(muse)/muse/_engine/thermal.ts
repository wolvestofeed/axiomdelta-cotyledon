/**
 * Impact OS — a recipe's time from the start of cooking to the blast
 * chiller, read from the recipe's cook times.
 *
 * Every hot component of a recipe is cooked by one of the thermal processing
 * standards (`_data/thermal-processes.ts`). The cooling clock starts the moment
 * a cook ends and the product goes straight into 2-inch hotel pans and the
 * cabinet, and one recipe's hot components fill one chiller batch together. So
 * the components are started staggered — longest first — to finish at the same
 * minute, and the recipe's cook-to-chill time is its LONGEST same-day component
 * cook on file, at the plan's point of the range (the high end).
 *
 * A component with no cook time on file is a gap, listed beside the time; it is
 * never filled with a placeholder. An overnight cook is ready when the crew
 * arrives and adds no same-day minutes. A recipe with no cook time on file for
 * any component has no cook-to-chill time at all.
 */

import type { RecipeDef } from '../_data/plan-data';
import { thermalProcesses, RECIPE_COMPONENT_THERMAL, type ThermalProcess } from '../_data/thermal-processes';

export type RangePoint = 'low' | 'mid' | 'high';

/** The point of each stated range the plan reads (Robert, 2026-09-14). */
export const PLAN_RANGE_POINT: RangePoint = 'high';

export function minutesAt(p: ThermalProcess, point: RangePoint = PLAN_RANGE_POINT): number {
  if (point === 'low') return p.minMinutes;
  if (point === 'mid') return (p.minMinutes + p.maxMinutes) / 2;
  return p.maxMinutes;
}

export interface ComponentThermal {
  component: string;
  process: ThermalProcess | null;
  /** Minutes at the plan's point of the range; null with no process. */
  minutes: number | null;
  gap: string | null;
  basis: string | null;
}

export interface RecipeThermal {
  recipeCode: string;
  /** The standard row the recipe reads (the student recipe for an adult row). */
  mapCode: string;
  point: RangePoint;
  components: ComponentThermal[];
  /** Every hot component has a cook time and nothing is left uncovered. */
  complete: boolean;
  /** Longest same-day cook on file; null when no component has a cook time. */
  cookToChillMinutes: number | null;
  /** The component that sets it. */
  longestComponent: string | null;
  /** Components cooked the night before the production day. */
  overnight: string[];
  gaps: string[];
}

const mapCodeOf = (code: string) => code.replace(/^AMK-A-/, 'AMK-E-');

export function recipeThermal(recipe: RecipeDef, point: RangePoint = PLAN_RANGE_POINT): RecipeThermal {
  const mapCode = mapCodeOf(recipe.code);
  const map = RECIPE_COMPONENT_THERMAL[mapCode] ?? {};
  const hot: string[] = [];
  for (const l of recipe.ingredients) {
    if (l.isHotComponent && !hot.includes(l.component)) hot.push(l.component);
  }
  const components: ComponentThermal[] = hot.map((component) => {
    const entry = map[component];
    const process = entry?.process ? thermalProcesses.find((p) => p.id === entry.process) ?? null : null;
    const gap = entry?.gap ?? (process ? null : 'No cook time on file for this component');
    return { component, process, minutes: process ? minutesAt(process, point) : null, gap, basis: entry?.basis ?? null };
  });
  const timed = components.filter((c) => c.process !== null);
  let longest: ComponentThermal | null = null;
  for (const c of timed) {
    if (c.process!.overnight || c.minutes === null) continue;
    if (!longest || c.minutes > (longest.minutes ?? 0)) longest = c;
  }
  return {
    recipeCode: recipe.code,
    mapCode,
    point,
    components,
    complete: components.length > 0 && components.every((c) => c.process !== null && c.gap === null),
    cookToChillMinutes: timed.length > 0 ? longest?.minutes ?? 0 : null,
    longestComponent: longest?.component ?? null,
    overnight: components.filter((c) => c.process?.overnight).map((c) => c.component),
    gaps: components.filter((c) => c.gap !== null).map((c) => `${c.component}: ${c.gap}`),
  };
}
