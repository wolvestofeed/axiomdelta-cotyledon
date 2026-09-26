/**
 * Impact OS — the ESTIMATED time study for a recipe (Roadmap O2 follow-on). Pure.
 *
 * Every recipe in the library is seeded with an estimated study so it has a
 * labor standard before any batch is timed (Robert, 2026-09-15). The estimate
 * is a MOCK, labelled Estimated and PLACEHOLDER, and it stands only until the
 * recipe's first observed study is recorded. It is built, not typed:
 *
 *   - The task scaffold comes off the recipe's own served components (docs/muse
 *     CLAUDE.md §2 rule 7), on two streams (scheduler build plan §0):
 *       BATCH, per batch cooked — receiving; scaling and mise en place; per hot
 *       component a prep and a cook; component blast chill and stage; line
 *       turnaround.
 *       DISPATCH, per delivery day from staged components — per cold component a
 *       cold assembly; portion and assemble; seal, label, date and lot code; the
 *       temperature check at pack; load for transport.
 *     There is no second blast chill and no cold-hold line. End-of-day closedown
 *     is on no study. It is the scaffold on the downloadable Time Study Sheet.
 *   - The minutes on the common tasks are the plan's 14-task estimate for
 *     AMK-E-001 (`plan-data.timeStudy`), the two retired lines' minutes carried
 *     to the check at pack and the load (`PLAN_TASK_STREAMS`); the per-component
 *     prep and assembly minutes are that estimate's vegetable prep spread over
 *     the components.
 *   - A cook task's elapsed minutes are the component's thermal process at the
 *     point of the range the plan reads (`recipeThermal`); its labor minutes
 *     are the minutes someone tends it — the whole cook for a high-speed
 *     process, a loading-and-checking allowance for a roast, a braise or an
 *     overnight run. A component with no process on file gets the allowance and
 *     says so in the task name; the gap stays listed on Recipes.
 *
 * Fixed or variable follows the plan's estimate: receiving, cooks, the line
 * turnaround and the load are fixed; scaling, prep, chilling, assembly, sealing
 * and the check at pack scale with portions. Skillet sautés are attended and scale.
 */

import type { RecipeDef } from '../_data/plan-data';
import { timeStudy } from '../_data/plan-data';
import { LOAD_TASK, PACK_CHECK_TASK, PLAN_TASK_STREAMS, type LaborScaling, type TimeStudyLine, type TimeStudySeed, type TimeStudyStream } from '../_data/time-studies';
import { recipeThermal, PLAN_RANGE_POINT, type ComponentThermal } from './thermal';

/** What a scaffold task is, which is what the routing reads its precedence from. */
export type ScaffoldKind = 'receiving' | 'scaling' | 'prep' | 'cook' | 'chill' | 'turnaround' | 'cold' | 'assemble' | 'seal' | 'pack-check' | 'load';

/** One task on the scaffold: what the observer times, and its suggested station. */
export interface ScaffoldTask {
  seq: number;
  task: string;
  station: string;
  ccp: string | null;
  scalesWith: LaborScaling;
  stream: TimeStudyStream;
  /** The served component the task belongs to; null on a task every batch or delivery day carries. */
  component: string | null;
  kind: ScaffoldKind;
}

/** Minutes someone tends a cook that runs longer than they stand at it: loading, checking, pulling. */
export const TENDED_COOK_MINUTES = 30;
/** The elapsed and tended minutes given a cook task whose component has no process on file. */
export const UNTIMED_COOK_MINUTES = 30;
/** A high-speed process is attended for its whole run. */
const ATTENDED_MAX_MINUTES = 30;
/** Cold assembly of a cold component: two people, twenty minutes at the batch. */
const COLD_ASSEMBLY = { staff: 2, elapsedMin: 20 };
/** Prep of one hot component; the plan's vegetable prep (3 people, 60 minutes) over three components. */
const COMPONENT_PREP = { staff: 2, elapsedMin: 30 };

const planTask = (name: string) => {
  const t = timeStudy.tasks.find((x) => x.task === name);
  if (!t) throw new Error(`The plan's time study has no task named "${name}"`);
  return t;
};

/** The served components in line order, split hot and cold. */
export function servedComponents(recipe: RecipeDef): { hot: string[]; cold: string[] } {
  const hot: string[] = [];
  const cold: string[] = [];
  for (const l of recipe.ingredients) {
    const list = l.isHotComponent ? hot : cold;
    if (!hot.includes(l.component) && !cold.includes(l.component)) list.push(l.component);
  }
  return { hot, cold };
}

/** The task scaffold for a recipe: what a time study of it times, batch stream then dispatch stream. */
export function timeStudyScaffold(recipe: RecipeDef): ScaffoldTask[] {
  const { hot, cold } = servedComponents(recipe);
  const tasks: Omit<ScaffoldTask, 'seq'>[] = [
    { task: 'Receiving, verification, put-away', station: 'Dock, walk-in', ccp: null, scalesWith: 'fixed', stream: 'batch', component: null, kind: 'receiving' },
    { task: 'Dry goods scaling and mise en place', station: 'Prep bench', ccp: null, scalesWith: 'variable', stream: 'batch', component: null, kind: 'scaling' },
  ];
  for (const c of hot) {
    tasks.push({ task: `Prep — ${c}: wash, trim, cut, scale`, station: 'Prep bench, VCM', ccp: null, scalesWith: 'variable', stream: 'batch', component: c, kind: 'prep' });
    tasks.push({ task: `Cook — ${c}`, station: 'Kettle / tilt skillet / combi — record which', ccp: 'CCP-1', scalesWith: 'fixed', stream: 'batch', component: c, kind: 'cook' });
  }
  tasks.push(
    { task: 'Component blast chill and stage', station: 'Blast chiller', ccp: 'CCP-2', scalesWith: 'variable', stream: 'batch', component: null, kind: 'chill' },
    // Line turnaround between batches: two people, fifteen minutes, every recipe (Robert, 2026-09-15).
    // End-of-day closedown (two people, 30 minutes) is placed once at the close of the operating day, on no study.
    { task: 'Line turnaround and sanitation', station: 'Production line', ccp: null, scalesWith: 'fixed', stream: 'batch', component: null, kind: 'turnaround' },
  );
  for (const c of cold) {
    tasks.push({ task: `Cold assembly — ${c}`, station: 'Prep bench', ccp: null, scalesWith: 'variable', stream: 'dispatch', component: c, kind: 'cold' });
  }
  tasks.push(
    { task: 'Portion and assemble', station: 'Assembly line', ccp: null, scalesWith: 'variable', stream: 'dispatch', component: null, kind: 'assemble' },
    { task: 'Seal, label, date and lot code', station: 'Tray sealer', ccp: null, scalesWith: 'variable', stream: 'dispatch', component: null, kind: 'seal' },
    { task: PACK_CHECK_TASK, station: 'Assembly line', ccp: null, scalesWith: 'variable', stream: 'dispatch', component: null, kind: 'pack-check' },
    { task: LOAD_TASK, station: 'Dock', ccp: null, scalesWith: 'fixed', stream: 'dispatch', component: null, kind: 'load' },
  );
  return tasks.map((t, i) => ({ seq: i + 1, ...t }));
}

/** The plan's task whose estimate a common scaffold task carries, by the scaffold's name for it. */
const PLAN_NAME: Record<string, string> = {
  'Receiving, verification, put-away': 'Receiving, verification, put-away',
  'Dry goods scaling and mise en place': 'Dry goods scaling and mise en place',
  'Component blast chill and stage': 'Component blast chill and stage',
  'Line turnaround and sanitation': 'Line turnaround and sanitation',
  'Portion and assemble': 'Portion and assemble bowls',
  'Seal, label, date and lot code': 'Seal, label, date and lot code',
  ...Object.fromEntries(Object.entries(PLAN_TASK_STREAMS).flatMap(([plan, s]) => (s.task ? [[s.task, plan]] : []))),
};

function cookLine(task: ScaffoldTask, thermal: ComponentThermal | undefined): TimeStudyLine {
  const process = thermal?.process ?? null;
  if (!process || thermal?.minutes === null || thermal?.minutes === undefined) {
    return {
      task: `${task.task} (no cook time on file; ${UNTIMED_COOK_MINUTES} min allowance)`,
      station: task.station,
      staff: 1,
      elapsedMinutes: UNTIMED_COOK_MINUTES,
      laborMinutes: UNTIMED_COOK_MINUTES,
      scalesWith: 'fixed',
      stream: 'batch',
    };
  }
  const elapsed = thermal.minutes;
  const attended = process.category === 'high-speed' && elapsed <= ATTENDED_MAX_MINUTES;
  // A sauté is worked for its whole run and grows with the batch: two people, per portion.
  const skillet = process.equipment.toLowerCase().includes('tilt skillet') && attended;
  const staff = skillet ? 2 : 1;
  const tended = attended ? elapsed : Math.min(elapsed, TENDED_COOK_MINUTES);
  return {
    task: `${task.task} (${process.name}, ${process.equipment})`,
    station: process.equipment,
    staff,
    elapsedMinutes: elapsed,
    laborMinutes: tended * staff,
    scalesWith: skillet ? 'variable' : 'fixed',
    stream: 'batch',
  };
}

/**
 * The estimated study for a recipe at the batch size it is to stand for — the
 * recipe's derived batch at the plan's defaults when seeded. Undated, no
 * observer, no quality result: it was not observed.
 */
export function estimatedTimeStudy(recipe: RecipeDef, batchSize: number): TimeStudySeed {
  const thermal = recipeThermal(recipe, PLAN_RANGE_POINT);
  const byComponent = new Map(thermal.components.map((c) => [c.component, c]));
  const lines: TimeStudyLine[] = timeStudyScaffold(recipe).map((t): TimeStudyLine => {
    switch (t.kind) {
      case 'prep':
        return { task: t.task, station: t.station, staff: COMPONENT_PREP.staff, elapsedMinutes: COMPONENT_PREP.elapsedMin, laborMinutes: COMPONENT_PREP.staff * COMPONENT_PREP.elapsedMin, scalesWith: 'variable', stream: t.stream };
      case 'cold':
        return { task: t.task, station: t.station, staff: COLD_ASSEMBLY.staff, elapsedMinutes: COLD_ASSEMBLY.elapsedMin, laborMinutes: COLD_ASSEMBLY.staff * COLD_ASSEMBLY.elapsedMin, scalesWith: 'variable', stream: t.stream };
      case 'cook':
        return cookLine(t, byComponent.get(t.component!));
      default: {
        const p = planTask(PLAN_NAME[t.task] ?? t.task);
        return { task: t.task, station: t.station, staff: p.staff, elapsedMinutes: p.elapsedMin, laborMinutes: p.laborMinutes, scalesWith: t.scalesWith, stream: t.stream };
      }
    }
  });
  const gaps = thermal.gaps.length ? ` Cook times not on file: ${thermal.gaps.join('; ')}.` : '';
  return {
    studiedOn: null,
    batchSize,
    observer: null,
    qualityResult: null,
    qualityNotes: `ESTIMATED — a mock estimate per step, not an observation (Robert, 2026-09-15). Built at a ${batchSize}-portion batch from the plan's 14-task estimate and the thermal processing standards at the ${PLAN_RANGE_POINT} end of each range, on two streams: batch lines per batch cooked, dispatch lines per portion shipped that day; PLACEHOLDER until this recipe's first observed study is recorded.${gaps}`,
    basis: 'estimated',
    lines,
  };
}
