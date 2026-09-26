/**
 * MicroFarm — the ESTIMATED time study for a crop plan (Roadmap O2 follow-on). Pure.
 *
 * Every crop plan in the library is seeded with an estimated study so it has a
 * labor standard before any sowing is timed. The estimate
 * is a MOCK, labelled Estimated and PLACEHOLDER, and it stands only until the
 * crop plan's first observed study is recorded. It is built, not typed:
 *
 *   - The task scaffold comes off the crop plan's own served components (docs/farm
 *     CLAUDE.md §2 rule 7), on two streams (scheduler build plan §0):
 *       SOWING, per sowing harvested — receiving; scaling and mise en place; per hot
 *       component a prep and a sow; component blackout and stage; line
 *       turnaround.
 *       HARVEST, per distribution day from staged components — per cold component a
 *       cold assembly; unit and assemble; seal, label, date and lot code; the
 *       temperature check at pack; load for transport.
 *     There is no second blackout and no cold-hold line. End-of-day closedown
 *     is on no study. It is the scaffold on the downloadable Time Study Sheet.
 *   - The minutes on the common tasks are the plan's 14-task estimate for
 *     AMK-E-001 (`plan-data.timeStudy`), the two retired lines' minutes carried
 *     to the check at pack and the load (`PLAN_TASK_STREAMS`); the per-component
 *     prep and assembly minutes are that estimate's vegetable prep spread over
 *     the components.
 *   - A sow task's elapsed minutes are the component's grow stage at the
 *     point of the range the plan reads (`cropPlanStage`); its labor minutes
 *     are the minutes someone tends it — the whole sow for a high-speed
 *     process, a loading-and-checking allowance for a roast, a braise or an
 *     overnight run. A component with no process on file gets the allowance and
 *     says so in the task name; the gap stays listed on Crop plans.
 *
 * Fixed or variable follows the plan's estimate: receiving, sows, the line
 * turnaround and the load are fixed; scaling, prep, blackout, assembly, sealing
 * and the check at pack scale with units. Shelf sautés are attended and scale.
 */

import type { CropPlanDef } from '../_data/plan-data';
import { timeStudy } from '../_data/plan-data';
import { LOAD_TASK, PACK_CHECK_TASK, PLAN_TASK_STREAMS, type LaborScaling, type TimeStudyLine, type TimeStudySeed, type TimeStudyStream } from '../_data/time-studies';
import { cropPlanStage, PLAN_RANGE_POINT, type ComponentStage } from './stage';

/** What a scaffold task is, which is what the routing reads its precedence from. */
export type ScaffoldKind = 'receiving' | 'scaling' | 'prep' | 'sow' | 'blackout' | 'turnaround' | 'cold' | 'assemble' | 'seal' | 'pack-check' | 'load';

/** One task on the scaffold: what the observer times, and its suggested station. */
export interface ScaffoldTask {
  seq: number;
  task: string;
  station: string;
  controlPoint: string | null;
  scalesWith: LaborScaling;
  stream: TimeStudyStream;
  /** The served component the task belongs to; null on a task every sowing or distribution day carries. */
  component: string | null;
  kind: ScaffoldKind;
}

/** Minutes someone tends a sow that runs longer than they stand at it: loading, checking, pulling. */
export const TENDED_SOW_MINUTES = 30;
/** The elapsed and tended minutes given a sow task whose component has no process on file. */
export const UNTIMED_SOW_MINUTES = 30;
/** A high-speed process is attended for its whole run. */
const ATTENDED_MAX_MINUTES = 30;
/** Cold assembly of a cold component: two people, twenty minutes at the sowing. */
const COLD_ASSEMBLY = { staff: 2, elapsedMin: 20 };
/** Prep of one hot component; the plan's vegetable prep (3 people, 60 minutes) over three components. */
const COMPONENT_PREP = { staff: 2, elapsedMin: 30 };

const planTask = (name: string) => {
  const t = timeStudy.tasks.find((x) => x.task === name);
  if (!t) throw new Error(`The plan's time study has no task named "${name}"`);
  return t;
};

/** The served components in line order, split hot and cold. */
export function servedComponents(cropPlan: CropPlanDef): { hot: string[]; cold: string[] } {
  const hot: string[] = [];
  const cold: string[] = [];
  for (const l of cropPlan.inputs) {
    const list = l.isHotComponent ? hot : cold;
    if (!hot.includes(l.component) && !cold.includes(l.component)) list.push(l.component);
  }
  return { hot, cold };
}

/** The task scaffold for a crop plan: what a time study of it times, sowing stream then harvest stream. */
export function timeStudyScaffold(cropPlan: CropPlanDef): ScaffoldTask[] {
  const { hot, cold } = servedComponents(cropPlan);
  const tasks: Omit<ScaffoldTask, 'seq'>[] = [
    { task: 'Receiving, verification, put-away', station: 'Dock, walk-in', controlPoint: null, scalesWith: 'fixed', stream: 'sowing', component: null, kind: 'receiving' },
    { task: 'Dry goods scaling and mise en place', station: 'Prep bench', controlPoint: null, scalesWith: 'variable', stream: 'sowing', component: null, kind: 'scaling' },
  ];
  for (const c of hot) {
    tasks.push({ task: `Prep — ${c}: wash, trim, cut, scale`, station: 'Prep bench, VCM', controlPoint: null, scalesWith: 'variable', stream: 'sowing', component: c, kind: 'prep' });
    tasks.push({ task: `Sow — ${c}`, station: 'Sprouting rack / tilt shelf / jar stand — record which', controlPoint: 'control-point-1', scalesWith: 'fixed', stream: 'sowing', component: c, kind: 'sow' });
  }
  tasks.push(
    { task: 'Component blackout and stage', station: 'Blackout rack', controlPoint: 'control-point-2', scalesWith: 'variable', stream: 'sowing', component: null, kind: 'blackout' },
    // Line turnaround between sowings: two people, fifteen minutes, every crop plan.
    // End-of-day closedown (two people, 30 minutes) is placed once at the close of the operating day, on no study.
    { task: 'Line turnaround and sanitation', station: 'Production line', controlPoint: null, scalesWith: 'fixed', stream: 'sowing', component: null, kind: 'turnaround' },
  );
  for (const c of cold) {
    tasks.push({ task: `Cold assembly — ${c}`, station: 'Prep bench', controlPoint: null, scalesWith: 'variable', stream: 'harvest', component: c, kind: 'cold' });
  }
  tasks.push(
    { task: 'Unit and assemble', station: 'Assembly line', controlPoint: null, scalesWith: 'variable', stream: 'harvest', component: null, kind: 'assemble' },
    { task: 'Seal, label, date and lot code', station: 'Tray sealer', controlPoint: null, scalesWith: 'variable', stream: 'harvest', component: null, kind: 'seal' },
    { task: PACK_CHECK_TASK, station: 'Assembly line', controlPoint: null, scalesWith: 'variable', stream: 'harvest', component: null, kind: 'pack-check' },
    { task: LOAD_TASK, station: 'Dock', controlPoint: null, scalesWith: 'fixed', stream: 'harvest', component: null, kind: 'load' },
  );
  return tasks.map((t, i) => ({ seq: i + 1, ...t }));
}

/** The plan's task whose estimate a common scaffold task carries, by the scaffold's name for it. */
const PLAN_NAME: Record<string, string> = {
  'Receiving, verification, put-away': 'Receiving, verification, put-away',
  'Dry goods scaling and mise en place': 'Dry goods scaling and mise en place',
  'Component blackout and stage': 'Component blackout and stage',
  'Line turnaround and sanitation': 'Line turnaround and sanitation',
  'Unit and assemble': 'Unit and assemble bowls',
  'Seal, label, date and lot code': 'Seal, label, date and lot code',
  ...Object.fromEntries(Object.entries(PLAN_TASK_STREAMS).flatMap(([plan, s]) => (s.task ? [[s.task, plan]] : []))),
};

function sowLine(task: ScaffoldTask, stage: ComponentStage | undefined): TimeStudyLine {
  const process = stage?.process ?? null;
  if (!process || stage?.minutes === null || stage?.minutes === undefined) {
    return {
      task: `${task.task} (no sow time on file; ${UNTIMED_SOW_MINUTES} min allowance)`,
      station: task.station,
      staff: 1,
      elapsedMinutes: UNTIMED_SOW_MINUTES,
      laborMinutes: UNTIMED_SOW_MINUTES,
      scalesWith: 'fixed',
      stream: 'sowing',
    };
  }
  const elapsed = stage.minutes;
  const attended = process.category === 'high-speed' && elapsed <= ATTENDED_MAX_MINUTES;
  // A sauté is worked for its whole run and grows with the sowing: two people, per unit.
  const shelf = process.equipment.toLowerCase().includes('tilt shelf') && attended;
  const staff = shelf ? 2 : 1;
  const tended = attended ? elapsed : Math.min(elapsed, TENDED_SOW_MINUTES);
  return {
    task: `${task.task} (${process.name}, ${process.equipment})`,
    station: process.equipment,
    staff,
    elapsedMinutes: elapsed,
    laborMinutes: tended * staff,
    scalesWith: shelf ? 'variable' : 'fixed',
    stream: 'sowing',
  };
}

/**
 * The estimated study for a crop plan at the sowing size it is to stand for — the
 * crop plan's derived sowing at the plan's defaults when seeded. Undated, no
 * observer, no quality result: it was not observed.
 */
export function estimatedTimeStudy(cropPlan: CropPlanDef, sowingSize: number): TimeStudySeed {
  const stage = cropPlanStage(cropPlan, PLAN_RANGE_POINT);
  const byComponent = new Map(stage.components.map((c) => [c.component, c]));
  const lines: TimeStudyLine[] = timeStudyScaffold(cropPlan).map((t): TimeStudyLine => {
    switch (t.kind) {
      case 'prep':
        return { task: t.task, station: t.station, staff: COMPONENT_PREP.staff, elapsedMinutes: COMPONENT_PREP.elapsedMin, laborMinutes: COMPONENT_PREP.staff * COMPONENT_PREP.elapsedMin, scalesWith: 'variable', stream: t.stream };
      case 'cold':
        return { task: t.task, station: t.station, staff: COLD_ASSEMBLY.staff, elapsedMinutes: COLD_ASSEMBLY.elapsedMin, laborMinutes: COLD_ASSEMBLY.staff * COLD_ASSEMBLY.elapsedMin, scalesWith: 'variable', stream: t.stream };
      case 'sow':
        return sowLine(t, byComponent.get(t.component!));
      default: {
        const p = planTask(PLAN_NAME[t.task] ?? t.task);
        return { task: t.task, station: t.station, staff: p.staff, elapsedMinutes: p.elapsedMin, laborMinutes: p.laborMinutes, scalesWith: t.scalesWith, stream: t.stream };
      }
    }
  });
  const gaps = stage.gaps.length ? ` Sow times not on file: ${stage.gaps.join('; ')}.` : '';
  return {
    studiedOn: null,
    sowingSize,
    observer: null,
    qualityResult: null,
    qualityNotes: `ESTIMATED — a mock estimate per step, not an observation. Built at a ${sowingSize}-unit sowing from the plan's 14-task estimate and the stage processing standards at the ${PLAN_RANGE_POINT} end of each range, on two streams: sowing lines per sowing harvested, harvest lines per unit shipped that day; PLACEHOLDER until this crop plan's first observed study is recorded.${gaps}`,
    basis: 'estimated',
    lines,
  };
}
