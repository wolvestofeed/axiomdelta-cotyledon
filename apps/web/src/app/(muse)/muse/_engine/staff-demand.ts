/**
 * Impact OS — production staff demand (Roadmap O3). Pure.
 *
 * The days of a window, each staffed from every recipe's labor standard — the
 * adopted time study, or the recipe's estimated study until one is adopted
 * (`laborStandard`) — on the two streams (scheduler build plan §0):
 *
 *   BATCH lines, on the production day, per batch cooked: a fixed line takes its
 *   labor minutes once per batch, a per-portion line its labor minutes per
 *   portion studied × the portions produced.
 *   DISPATCH lines, on the delivery day, per portion shipped that day: a
 *   per-portion line its labor minutes per portion studied × the portions
 *   shipped; a fixed line (loading the vehicle) once per delivery day — the
 *   largest any shipped recipe's study names for that task, not once per recipe.
 *
 * Demand is headcount and hours by task and station per day — no positions and
 * no pay. CompTable maps it to its roster, an admin adjusts it there and
 * publishes the schedule to staff. A recipe with work and no study at all is
 * listed and carries no demand; a recipe running on its estimate is listed as such.
 */

import type { TimeStudyDoc, TimeStudyStream } from '../_data/time-studies';
import type { RecipeRunPlan } from './production-plan';
import { laborStandard, studiesForRecipe } from './time-studies';

export interface DemandLine {
  task: string;
  station: string | null;
  stream: TimeStudyStream;
  /** The people the task needs at once, the most any recipe's study names. */
  headcount: number;
  /** Staff-hours the day's batches or shipments need on this task. */
  hours: number;
  recipeCodes: string[];
}

export interface UncoveredRun {
  recipeCode: string;
  recipeName: string;
  batches: number;
  portions: number;
  portionsShipped: number;
}

export interface DemandDay {
  date: string;
  batches: number;
  /** Portions produced that day. */
  portions: number;
  /** Portions shipped that day. */
  portionsShipped: number;
  staffHours: number;
  batchStaffHours: number;
  dispatchStaffHours: number;
  /** The most people any one task needs; tasks are not yet placed on the clock (Roadmap L5). */
  mostPeopleOnATask: number;
  lines: DemandLine[];
  /** Recipes with batches or shipments and no time study at all: no demand is counted for them. */
  uncovered: UncoveredRun[];
  /** Recipes staffed from their estimated study — no observed study adopted yet. */
  estimatedRecipes: string[];
}

export interface StaffDemand {
  from: string;
  to: string;
  days: DemandDay[];
  staffHours: number;
  /** Days in the window with at least one batch. */
  productionDays: number;
  /** Days in the window with at least one portion shipped. */
  deliveryDays: number;
  uncoveredRecipes: string[];
  /** Recipes in the window staffed from an estimate rather than an observed study. */
  estimatedRecipes: string[];
}

export interface DemandDayInput {
  productionDate: string;
  runs: readonly Pick<RecipeRunPlan, 'recipeCode' | 'recipeName' | 'batchesScheduled' | 'produced'>[];
}

/** A delivery day's shipments, in base portions per recipe. */
export interface DispatchDayInput {
  date: string;
  shipments: readonly { recipeCode: string; recipeName: string; portions: number }[];
}

export function staffDemand(input: {
  from: string;
  to: string;
  days: readonly DemandDayInput[];
  dispatch?: readonly DispatchDayInput[];
  studies: readonly TimeStudyDoc[];
}): StaffDemand {
  const standards = new Map<string, TimeStudyDoc | null>();
  const standardFor = (code: string): TimeStudyDoc | null => {
    if (!standards.has(code)) standards.set(code, laborStandard(studiesForRecipe(input.studies, code)));
    return standards.get(code) ?? null;
  };
  const inWindow = (date: string) => date >= input.from && date <= input.to;

  interface Acc {
    byKey: Map<string, DemandLine>;
    /** Fixed dispatch lines: once per delivery day, the largest minutes named. */
    fixedDispatch: Map<string, number>;
    uncovered: Map<string, UncoveredRun>;
    estimated: Set<string>;
    batches: number;
    portions: number;
    portionsShipped: number;
  }
  const accs = new Map<string, Acc>();
  const accFor = (date: string): Acc => {
    let a = accs.get(date);
    if (!a) {
      a = { byKey: new Map(), fixedDispatch: new Map(), uncovered: new Map(), estimated: new Set(), batches: 0, portions: 0, portionsShipped: 0 };
      accs.set(date, a);
    }
    return a;
  };
  const lineFor = (a: Acc, l: TimeStudyDoc['lines'][number], recipeCode: string): DemandLine => {
    const key = `${l.stream}|${l.task}|${l.station ?? ''}`;
    const row = a.byKey.get(key) ?? { task: l.task, station: l.station, stream: l.stream, headcount: 0, hours: 0, recipeCodes: [] };
    row.headcount = Math.max(row.headcount, l.staff);
    if (!row.recipeCodes.includes(recipeCode)) row.recipeCodes.push(recipeCode);
    a.byKey.set(key, row);
    return row;
  };
  const uncover = (a: Acc, code: string, name: string, batches: number, portions: number, shipped: number) => {
    const u = a.uncovered.get(code) ?? { recipeCode: code, recipeName: name, batches: 0, portions: 0, portionsShipped: 0 };
    u.batches += batches;
    u.portions += portions;
    u.portionsShipped += shipped;
    a.uncovered.set(code, u);
  };

  for (const d of input.days) {
    if (!inWindow(d.productionDate)) continue;
    const a = accFor(d.productionDate);
    for (const run of d.runs) {
      if (run.batchesScheduled <= 0) continue;
      a.batches += run.batchesScheduled;
      a.portions += run.produced;
      const study = standardFor(run.recipeCode);
      if (!study) {
        uncover(a, run.recipeCode, run.recipeName, run.batchesScheduled, run.produced, 0);
        continue;
      }
      if (study.basis === 'estimated') a.estimated.add(run.recipeCode);
      for (const l of study.lines) {
        if (l.stream === 'dispatch') continue;
        const minutes = l.scalesWith === 'fixed' ? l.laborMinutes * run.batchesScheduled : study.batchSize > 0 ? (l.laborMinutes / study.batchSize) * run.produced : 0;
        lineFor(a, l, run.recipeCode).hours += minutes / 60;
      }
    }
  }

  for (const d of input.dispatch ?? []) {
    if (!inWindow(d.date)) continue;
    const shipped = d.shipments.filter((s) => s.portions > 0);
    if (shipped.length === 0) continue;
    const a = accFor(d.date);
    for (const s of shipped) {
      a.portionsShipped += s.portions;
      const study = standardFor(s.recipeCode);
      if (!study) {
        uncover(a, s.recipeCode, s.recipeName, 0, 0, s.portions);
        continue;
      }
      if (study.basis === 'estimated') a.estimated.add(s.recipeCode);
      for (const l of study.lines) {
        if (l.stream !== 'dispatch') continue;
        const row = lineFor(a, l, s.recipeCode);
        if (l.scalesWith === 'fixed') {
          const key = `${l.stream}|${l.task}|${l.station ?? ''}`;
          a.fixedDispatch.set(key, Math.max(a.fixedDispatch.get(key) ?? 0, l.laborMinutes));
        } else if (study.batchSize > 0) {
          row.hours += ((l.laborMinutes / study.batchSize) * s.portions) / 60;
        }
      }
    }
  }

  const days: DemandDay[] = [...accs.entries()]
    .map(([date, a]) => {
      for (const [key, minutes] of a.fixedDispatch) a.byKey.get(key)!.hours += minutes / 60;
      const lines = [...a.byKey.values()].sort((x, y) => y.hours - x.hours || x.task.localeCompare(y.task));
      const streamHours = (s: TimeStudyStream) => lines.filter((l) => l.stream === s).reduce((t, l) => t + l.hours, 0);
      return {
        date,
        batches: a.batches,
        portions: a.portions,
        portionsShipped: a.portionsShipped,
        staffHours: lines.reduce((t, l) => t + l.hours, 0),
        batchStaffHours: streamHours('batch'),
        dispatchStaffHours: streamHours('dispatch'),
        mostPeopleOnATask: lines.reduce((m, l) => Math.max(m, l.headcount), 0),
        lines,
        uncovered: [...a.uncovered.values()],
        estimatedRecipes: [...a.estimated].sort(),
      };
    })
    .sort((x, y) => x.date.localeCompare(y.date));

  return {
    from: input.from,
    to: input.to,
    days,
    staffHours: days.reduce((s, d) => s + d.staffHours, 0),
    productionDays: days.filter((d) => d.batches > 0).length,
    deliveryDays: days.filter((d) => d.portionsShipped > 0).length,
    uncoveredRecipes: [...new Set(days.flatMap((d) => d.uncovered.map((u) => u.recipeCode)))].sort(),
    estimatedRecipes: [...new Set(days.flatMap((d) => d.estimatedRecipes))].sort(),
  };
}

/** The staff demand as the document for CompTable (Roadmap O4): tasks, stations, people and hours — no positions, no pay. */
export interface StaffDemandDocument {
  kind: 'muse.staff_demand';
  version: 1;
  from: string;
  to: string;
  preparedAt: string;
  days: { date: string; lines: { task: string; station: string | null; headcount: number; hours: number }[]; uncoveredRecipes: string[] }[];
}

export function staffDemandDocument(demand: StaffDemand, preparedAt: string): StaffDemandDocument {
  return {
    kind: 'muse.staff_demand',
    version: 1,
    from: demand.from,
    to: demand.to,
    preparedAt,
    days: demand.days.map((d) => ({
      date: d.date,
      lines: d.lines.map((l) => ({ task: l.task, station: l.station, headcount: l.headcount, hours: Math.round(l.hours * 100) / 100 })),
      uncoveredRecipes: d.uncovered.map((u) => u.recipeCode),
    })),
  };
}
