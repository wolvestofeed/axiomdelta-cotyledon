/**
 * MicroFarm — the ESTIMATED time study for a grow plan (Roadmap O2 follow-on). Pure.
 *
 * Every plan in the library is seeded with an estimated study so it has a labor standard before
 * any sowing is timed. The estimate is Vallecito's 2023 tray study (DATED), labelled Estimated, and
 * it stands only until the plan's first observed study is adopted. The task scaffold is the
 * sheet's, on three streams: the sowing stream per tray on the sow day, the daily stream per tray
 * per day across the cycle, the harvest stream per unit on the distribution day. A plan that is not
 * a grow plan has no scaffold and an empty estimate.
 */

import type { CropPlanDef } from '@/data/plan-data';
import { VALLECITO_1020_STUDY, type LaborScaling, type TimeStudyLine, type TimeStudySeed, type TimeStudyStream } from '@/data/time-studies';
import { planStageDays, planStages, type GrowPlanDef } from '@/data/grow-plan';
import { cycleDays as cycleDaysOf } from '@/data/stage-schedule';
import { TRAY_FORMAT_BY_KEY } from '@/data/tray-formats';
import { isGrowPlanCarrier } from '@/engine/grow-plan-bridge';

/** What a scaffold task is, which is what the routing reads its precedence from. */
export type ScaffoldKind = 'receiving' | 'scaling' | 'prep' | 'sow' | 'blackout' | 'turnaround' | 'cold' | 'assemble' | 'seal' | 'pack-check' | 'load' | 'daily' | 'harvest';

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

/** The task scaffold for a plan: what a time study of it times. A plan that is not a grow plan has none. */
export function timeStudyScaffold(cropPlan: CropPlanDef): ScaffoldTask[] {
  return isGrowPlanCarrier(cropPlan) ? growPlanScaffold(cropPlan.plan) : [];
}

/**
 * The task scaffold for a grow plan: Vallecito's tray study on three streams. Sowing tasks per
 * tray on the sow day, daily tasks per tray per day, harvest tasks per unit on the distribution
 * day; the knife harvest and the weigh only on a cut tray, which no plan format is.
 */
export function growPlanScaffold(plan: GrowPlanDef): ScaffoldTask[] {
  const cut = TRAY_FORMAT_BY_KEY[plan.format].kind === 'cut';
  const stageKeys = new Set(planStages(plan).map((st) => st.key));
  const tasks: Omit<ScaffoldTask, 'seq'>[] = [];
  for (const t of VALLECITO_1020_STUDY.sowing) tasks.push({ task: t.task, station: t.station, controlPoint: t.task === 'Receiving and sorting seed' ? 'seed-sanitation' : null, scalesWith: 'variable', stream: 'sowing', component: null, kind: t.task === 'Sow trays' ? 'sow' : 'prep' });
  for (const t of VALLECITO_1020_STUDY.daily) {
    if (t.span === 'light' && !stageKeys.has('light')) continue;
    if (t.span === 'blackout' && !stageKeys.has('blackout')) continue;
    tasks.push({ task: t.task, station: t.station, controlPoint: t.task === 'Inspection and sanitization' ? 'temperature-humidity' : null, scalesWith: 'variable', stream: 'daily', component: null, kind: 'daily' });
  }
  for (const t of VALLECITO_1020_STUDY.harvest) {
    if (t.cutOnly && !cut) continue;
    tasks.push({ task: t.task, station: t.station, controlPoint: t.task === 'Packaging and labels' ? 'harvest-check' : null, scalesWith: 'variable', stream: 'harvest', component: null, kind: 'harvest' });
  }
  return tasks.map((t, i) => ({ seq: i + 1, ...t }));
}


/**
 * A grow plan's estimated study at a sowing of `sowingTrays`: Vallecito's minutes per tray on the
 * sowing and harvest streams times the trays; each daily task's total over its span spread evenly
 * over the plan's cycle days as one day's minutes for the sowing. One person on every task, as
 * the sheet has it. The watering shape by stage is placed by the grow calendar (part 6); the
 * total over the cycle is the sheet's.
 */
export function growPlanTimeStudy(plan: GrowPlanDef, sowingTrays: number): TimeStudySeed {
  const days = planStageDays(plan);
  const cycle = cycleDaysOf(days);
  const trays = Math.max(0, sowingTrays);
  const perTray = (minutes: number): TimeStudyLine => ({ task: '', station: null, staff: 1, elapsedMinutes: minutes * trays, laborMinutes: minutes * trays, scalesWith: 'variable', stream: 'sowing' });
  const lines: TimeStudyLine[] = growPlanScaffold(plan).map((t): TimeStudyLine => {
    if (t.stream === 'daily') {
      const src = VALLECITO_1020_STUDY.daily.find((d) => d.task === t.task)!;
      const perDay = cycle > 0 ? src.minutes / cycle : 0;
      return { task: t.task, station: t.station, staff: 1, elapsedMinutes: perDay * trays, laborMinutes: perDay * trays, scalesWith: 'variable', stream: 'daily' };
    }
    const src = t.stream === 'sowing' ? VALLECITO_1020_STUDY.sowing.find((d) => d.task === t.task)! : VALLECITO_1020_STUDY.harvest.find((d) => d.task === t.task)!;
    return { ...perTray(src.minutes), task: t.task, station: t.station, stream: t.stream };
  });
  const live = TRAY_FORMAT_BY_KEY[plan.format].kind !== 'cut';
  return {
    studiedOn: null,
    sowingSize: trays,
    cycleDays: cycle,
    observer: null,
    qualityResult: null,
    qualityNotes: `ESTIMATED from ${VALLECITO_1020_STUDY.source} (DATED), per 1020 tray at one person, at a ${trays}-tray sowing over a ${cycle}-day cycle: sowing lines per tray on the sow day, daily lines per tray per day with each task's total spread over the cycle, harvest lines per unit on the distribution day${live ? '; the knife harvest and the weigh are cut-tray tasks a live tray does not get' : ''}. Stands until this plan's first observed study is adopted.`,
    basis: 'estimated',
    lines,
  };
}

/**
 * The estimated study for a plan at the sowing it is to stand for: the grow plan's, from
 * Vallecito's tray study. Undated, no observer, no quality result: it was not observed. A plan that
 * is not a grow plan gets an empty estimate that says so.
 */
export function estimatedTimeStudy(cropPlan: CropPlanDef, sowingSize: number): TimeStudySeed {
  if (isGrowPlanCarrier(cropPlan)) return growPlanTimeStudy(cropPlan.plan, sowingSize);
  return { studiedOn: null, sowingSize, cycleDays: 0, observer: null, qualityResult: null, qualityNotes: `${cropPlan.code} is not a grow plan, so no estimate is built for it.`, basis: 'estimated', lines: [] };
}
