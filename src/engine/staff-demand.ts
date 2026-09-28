/**
 * Cotyledon — production staff demand (Roadmap O3). Pure.
 *
 * The days of a window, each staffed from every grow plan's labor standard — the
 * approved time studies averaged, or the grow plan's estimated study until one is approved
 * (`laborStandard`) — on the two streams (scheduler build plan §0):
 *
 *   SOWING lines, on the production day, per sowing harvested: a fixed line takes its
 *   labor minutes once per sowing, a per-unit line its labor minutes per
 *   unit studied × the units produced.
 *   DAILY lines, on the days a tray is in the task's span, per tray on the shelf: a
 *   per-unit line's minutes over the cycle fall on the stages its span covers
 *   (`DAILY_SPAN_STAGES`: germination and blackout watering mist those stages, watering
 *   under lights the light stage and the harvest window, inspection the whole cycle), so
 *   the total over the cycle is the study's; a fixed line once a day per plan present
 *   (`traysOnShelf` derives the shelf, by day of each sowing's cycle, from the sowings and
 *   each plan's cycle days). Without the plans' stage days a line is spread evenly.
 *   HARVEST lines, on the distribution day, per unit shipped that day: a
 *   per-unit line its labor minutes per unit studied × the units
 *   shipped; a fixed line (loading the vehicle) once per distribution day — the
 *   largest any shipped grow plan's study names for that task, not once per grow plan.
 *
 * Demand is headcount and hours by task and station per day — no positions and
 * no pay. Staffing maps it to its roster, an admin adjusts it there and
 * publishes the schedule to staff. A grow plan with work and no study at all is
 * listed and carries no demand; a grow plan running on its estimate is listed as such.
 */

import { DAILY_SPAN_STAGES, dailySpanOf, type DailySpan, type TimeStudyDoc, type TimeStudyStream } from '@/data/time-studies';
import type { GrowPlanDef } from '@/data/grow-plan';
import { cycleDays, stageOnCycleDay, type StageDays } from '@/data/stage-schedule';
import { planStageDays } from '@/data/grow-plan';
import type { GrowPlanRunPlan } from '@/engine/production-plan';
import { isoAddDays } from '@/engine/orders';
import { laborStandard, studiesForGrowPlan } from '@/engine/time-studies';

export interface DemandLine {
  task: string;
  station: string | null;
  stream: TimeStudyStream;
  /** The people the task needs at once, the most any grow plan's study names. */
  headcount: number;
  /** Staff-hours the day's sowings or shipments need on this task. */
  hours: number;
  growPlanCodes: string[];
}

export interface UncoveredRun {
  growPlanCode: string;
  growPlanName: string;
  sowings: number;
  units: number;
  unitsShipped: number;
}

export interface DemandDay {
  date: string;
  sowings: number;
  /** Units produced that day. */
  units: number;
  /** Units shipped that day. */
  unitsShipped: number;
  /** Trays on the grow units that day. */
  traysOnShelf: number;
  staffHours: number;
  sowingStaffHours: number;
  dailyStaffHours: number;
  harvestStaffHours: number;
  /** The most people any one task needs; tasks are not yet placed on the clock (Roadmap L5). */
  mostPeopleOnATask: number;
  lines: DemandLine[];
  /** Grow plans with sowings or shipments and no time study at all: no demand is counted for them. */
  uncovered: UncoveredRun[];
  /** Grow plans staffed from their estimated study — no observed study approved yet. */
  estimatedGrowPlans: string[];
}

export interface StaffDemand {
  from: string;
  to: string;
  days: DemandDay[];
  staffHours: number;
  /** Days in the window with at least one sowing. */
  productionDays: number;
  /** Days in the window with at least one unit shipped. */
  distributionDays: number;
  uncoveredGrowPlans: string[];
  /** Grow plans in the window staffed from an estimate rather than an observed study. */
  estimatedGrowPlans: string[];
}

export interface DemandDayInput {
  productionDate: string;
  runs: readonly Pick<GrowPlanRunPlan, 'growPlanCode' | 'growPlanName' | 'sowingsScheduled' | 'produced'>[];
}

/** A distribution day's shipments, in base units per grow plan. */
export interface HarvestDayInput {
  date: string;
  shipments: readonly { growPlanCode: string; growPlanName: string; units: number }[];
}

/** A day's trays on the grow units, per plan. */
export interface ShelfDayInput {
  date: string;
  /** Per plan, the trays on the shelf that day, and how many sit on each day of their cycle (0 = the sow day). */
  trays: readonly { growPlanCode: string; growPlanName: string; trays: number; byDay?: readonly { dayOfCycle: number; trays: number }[] }[];
}

/** Each plan's stage days, for placing the daily stream on the stages its tasks cover. */
export function stageDaysByCode(growPlans: readonly GrowPlanDef[]): Record<string, StageDays> {
  return Object.fromEntries(growPlans.map((r) => [r.code, planStageDays(r)]));
}

/**
 * The trays a daily task's minutes fall on, weighted so the total over the cycle is kept: each
 * tray in a stage the span covers counts cycle ÷ span days, a tray outside it none. Null when the
 * plan has no day in the span, and the task is spread evenly.
 */
export function spanWeightedTrays(days: StageDays, span: DailySpan, cycle: number, byDay: readonly { dayOfCycle: number; trays: number }[]): number | null {
  const stages = DAILY_SPAN_STAGES[span];
  const spanDays = stages.reduce((t, k) => t + (k === 'soak' || k === 'packed' ? 0 : days[k]), 0);
  if (spanDays <= 0 || cycle <= 0) return null;
  return byDay.reduce((t, d) => {
    const st = stageOnCycleDay(days, d.dayOfCycle);
    return st !== 'off' && stages.includes(st) ? t + (d.trays * cycle) / spanDays : t;
  }, 0);
}

/** Each plan's cycle days, for the shelf occupancy. */
export function cycleDaysByCode(growPlans: readonly GrowPlanDef[]): Record<string, number> {
  return Object.fromEntries(growPlans.map((r) => [r.code, cycleDays(planStageDays(r))]));
}

/**
 * The trays on the grow units each day of a window, from the sowings: a sowing's trays occupy
 * the shelf from its production date through its cycle days. Days with nothing on the shelf are
 * absent.
 */
export function traysOnShelf(days: readonly DemandDayInput[], cycle: Readonly<Record<string, number>>, from: string, to: string): ShelfDayInput[] {
  const byDate = new Map<string, Map<string, { growPlanCode: string; growPlanName: string; trays: number; byDay: { dayOfCycle: number; trays: number }[] }>>();
  for (const d of days) {
    for (const run of d.runs) {
      const n = cycle[run.growPlanCode] ?? 0;
      if (run.produced <= 0 || n <= 0) continue;
      for (let k = 0; k < n; k += 1) {
        const date = isoAddDays(d.productionDate, k);
        if (date < from || date > to) continue;
        type Row = { growPlanCode: string; growPlanName: string; trays: number; byDay: { dayOfCycle: number; trays: number }[] };
        const m: Map<string, Row> = byDate.get(date) ?? new Map();
        const row: Row = m.get(run.growPlanCode) ?? { growPlanCode: run.growPlanCode, growPlanName: run.growPlanName, trays: 0, byDay: [] };
        row.trays += run.produced;
        const at = row.byDay.find((x) => x.dayOfCycle === k);
        if (at) at.trays += run.produced;
        else row.byDay.push({ dayOfCycle: k, trays: run.produced });
        m.set(run.growPlanCode, row);
        byDate.set(date, m);
      }
    }
  }
  return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, m]) => ({ date, trays: [...m.values()] }));
}

export function staffDemand(input: {
  from: string;
  to: string;
  days: readonly DemandDayInput[];
  harvest?: readonly HarvestDayInput[];
  shelf?: readonly ShelfDayInput[];
  studies: readonly TimeStudyDoc[];
  /** Each plan's stage days (`stageDaysByCode`); absent, the daily stream is spread evenly over the cycle. */
  stageDays?: Readonly<Record<string, StageDays>>;
}): StaffDemand {
  const standards = new Map<string, TimeStudyDoc | null>();
  const standardFor = (code: string): TimeStudyDoc | null => {
    if (!standards.has(code)) standards.set(code, laborStandard(studiesForGrowPlan(input.studies, code)));
    return standards.get(code) ?? null;
  };
  const inWindow = (date: string) => date >= input.from && date <= input.to;

  interface Acc {
    byKey: Map<string, DemandLine>;
    /** Fixed harvest lines: once per distribution day, the largest minutes named. */
    fixedHarvest: Map<string, number>;
    uncovered: Map<string, UncoveredRun>;
    estimated: Set<string>;
    sowings: number;
    units: number;
    unitsShipped: number;
    traysOnShelf: number;
  }
  const accs = new Map<string, Acc>();
  const accFor = (date: string): Acc => {
    let a = accs.get(date);
    if (!a) {
      a = { byKey: new Map(), fixedHarvest: new Map(), uncovered: new Map(), estimated: new Set(), sowings: 0, units: 0, unitsShipped: 0, traysOnShelf: 0 };
      accs.set(date, a);
    }
    return a;
  };
  const lineFor = (a: Acc, l: TimeStudyDoc['lines'][number], growPlanCode: string): DemandLine => {
    const key = `${l.stream}|${l.task}|${l.station ?? ''}`;
    const row = a.byKey.get(key) ?? { task: l.task, station: l.station, stream: l.stream, headcount: 0, hours: 0, growPlanCodes: [] };
    row.headcount = Math.max(row.headcount, l.staff);
    if (!row.growPlanCodes.includes(growPlanCode)) row.growPlanCodes.push(growPlanCode);
    a.byKey.set(key, row);
    return row;
  };
  const uncover = (a: Acc, code: string, name: string, sowings: number, units: number, shipped: number) => {
    const u = a.uncovered.get(code) ?? { growPlanCode: code, growPlanName: name, sowings: 0, units: 0, unitsShipped: 0 };
    u.sowings += sowings;
    u.units += units;
    u.unitsShipped += shipped;
    a.uncovered.set(code, u);
  };

  for (const d of input.days) {
    if (!inWindow(d.productionDate)) continue;
    const a = accFor(d.productionDate);
    for (const run of d.runs) {
      if (run.sowingsScheduled <= 0) continue;
      a.sowings += run.sowingsScheduled;
      a.units += run.produced;
      const study = standardFor(run.growPlanCode);
      if (!study) {
        uncover(a, run.growPlanCode, run.growPlanName, run.sowingsScheduled, run.produced, 0);
        continue;
      }
      if (study.basis === 'estimated') a.estimated.add(run.growPlanCode);
      for (const l of study.lines) {
        if (l.stream !== 'sowing') continue;
        const minutes = l.scalesWith === 'fixed' ? l.laborMinutes * run.sowingsScheduled : study.sowingSize > 0 ? (l.laborMinutes / study.sowingSize) * run.produced : 0;
        lineFor(a, l, run.growPlanCode).hours += minutes / 60;
      }
    }
  }

  for (const d of input.shelf ?? []) {
    if (!inWindow(d.date)) continue;
    const on = d.trays.filter((t) => t.trays > 0);
    if (on.length === 0) continue;
    const a = accFor(d.date);
    for (const t of on) {
      a.traysOnShelf += t.trays;
      const study = standardFor(t.growPlanCode);
      if (!study) continue;
      if (study.basis === 'estimated') a.estimated.add(t.growPlanCode);
      for (const l of study.lines) {
        if (l.stream !== 'daily') continue;
        const days = input.stageDays?.[t.growPlanCode];
        const cycle = study.cycleDays > 0 ? study.cycleDays : days ? cycleDays(days) : 0;
        const shaped = days && t.byDay ? spanWeightedTrays(days, dailySpanOf(l.task), cycle, t.byDay) : null;
        const minutes = l.scalesWith === 'fixed' ? l.laborMinutes : study.sowingSize > 0 ? (l.laborMinutes / study.sowingSize) * (shaped ?? t.trays) : 0;
        lineFor(a, l, t.growPlanCode).hours += minutes / 60;
      }
    }
  }

  for (const d of input.harvest ?? []) {
    if (!inWindow(d.date)) continue;
    const shipped = d.shipments.filter((s) => s.units > 0);
    if (shipped.length === 0) continue;
    const a = accFor(d.date);
    for (const s of shipped) {
      a.unitsShipped += s.units;
      const study = standardFor(s.growPlanCode);
      if (!study) {
        uncover(a, s.growPlanCode, s.growPlanName, 0, 0, s.units);
        continue;
      }
      if (study.basis === 'estimated') a.estimated.add(s.growPlanCode);
      for (const l of study.lines) {
        if (l.stream !== 'harvest') continue;
        const row = lineFor(a, l, s.growPlanCode);
        if (l.scalesWith === 'fixed') {
          const key = `${l.stream}|${l.task}|${l.station ?? ''}`;
          a.fixedHarvest.set(key, Math.max(a.fixedHarvest.get(key) ?? 0, l.laborMinutes));
        } else if (study.sowingSize > 0) {
          row.hours += ((l.laborMinutes / study.sowingSize) * s.units) / 60;
        }
      }
    }
  }

  const days: DemandDay[] = [...accs.entries()]
    .map(([date, a]) => {
      for (const [key, minutes] of a.fixedHarvest) a.byKey.get(key)!.hours += minutes / 60;
      const lines = [...a.byKey.values()].sort((x, y) => y.hours - x.hours || x.task.localeCompare(y.task));
      const streamHours = (s: TimeStudyStream) => lines.filter((l) => l.stream === s).reduce((t, l) => t + l.hours, 0);
      return {
        date,
        sowings: a.sowings,
        units: a.units,
        unitsShipped: a.unitsShipped,
        traysOnShelf: a.traysOnShelf,
        staffHours: lines.reduce((t, l) => t + l.hours, 0),
        sowingStaffHours: streamHours('sowing'),
        dailyStaffHours: streamHours('daily'),
        harvestStaffHours: streamHours('harvest'),
        mostPeopleOnATask: lines.reduce((m, l) => Math.max(m, l.headcount), 0),
        lines,
        uncovered: [...a.uncovered.values()],
        estimatedGrowPlans: [...a.estimated].sort(),
      };
    })
    .sort((x, y) => x.date.localeCompare(y.date));

  return {
    from: input.from,
    to: input.to,
    days,
    staffHours: days.reduce((s, d) => s + d.staffHours, 0),
    productionDays: days.filter((d) => d.sowings > 0).length,
    distributionDays: days.filter((d) => d.unitsShipped > 0).length,
    uncoveredGrowPlans: [...new Set(days.flatMap((d) => d.uncovered.map((u) => u.growPlanCode)))].sort(),
    estimatedGrowPlans: [...new Set(days.flatMap((d) => d.estimatedGrowPlans))].sort(),
  };
}

/** The staff demand as the document for Staffing (Roadmap O4): tasks, stations, people and hours — no positions, no pay. */
export interface StaffDemandDocument {
  kind: 'farm.staff_demand';
  version: 1;
  from: string;
  to: string;
  preparedAt: string;
  days: { date: string; lines: { task: string; station: string | null; headcount: number; hours: number }[]; uncoveredGrowPlans: string[] }[];
}

export function staffDemandDocument(demand: StaffDemand, preparedAt: string): StaffDemandDocument {
  return {
    kind: 'farm.staff_demand',
    version: 1,
    from: demand.from,
    to: demand.to,
    preparedAt,
    days: demand.days.map((d) => ({
      date: d.date,
      lines: d.lines.map((l) => ({ task: l.task, station: l.station, headcount: l.headcount, hours: Math.round(l.hours * 100) / 100 })),
      uncoveredGrowPlans: d.uncovered.map((u) => u.growPlanCode),
    })),
  };
}
