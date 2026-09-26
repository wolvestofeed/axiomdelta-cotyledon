/**
 * MicroFarm — production staff demand (Roadmap O3). Pure.
 *
 * The days of a window, each staffed from every crop plan's labor standard — the
 * adopted time study, or the crop plan's estimated study until one is adopted
 * (`laborStandard`) — on the two streams (scheduler build plan §0):
 *
 *   SOWING lines, on the production day, per sowing harvested: a fixed line takes its
 *   labor minutes once per sowing, a per-unit line its labor minutes per
 *   unit studied × the units produced.
 *   DAILY lines, on every day a tray is on its grow unit, per tray on the shelf: a
 *   per-unit line one day's minutes per tray studied × the trays on the shelf, a fixed
 *   line once a day per plan present (`traysOnShelf` derives the shelf from the sowings
 *   and each plan's cycle days).
 *   HARVEST lines, on the distribution day, per unit shipped that day: a
 *   per-unit line its labor minutes per unit studied × the units
 *   shipped; a fixed line (loading the vehicle) once per distribution day — the
 *   largest any shipped crop plan's study names for that task, not once per crop plan.
 *
 * Demand is headcount and hours by task and station per day — no positions and
 * no pay. Staffing maps it to its roster, an admin adjusts it there and
 * publishes the schedule to staff. A crop plan with work and no study at all is
 * listed and carries no demand; a crop plan running on its estimate is listed as such.
 */

import type { TimeStudyDoc, TimeStudyStream } from '../_data/time-studies';
import type { CropPlanDef } from '../_data/plan-data';
import { cycleDays } from '../_data/stage-schedule';
import { planStageDays } from '../_data/grow-plan';
import type { CropPlanRunPlan } from './production-plan';
import { isGrowPlanCarrier } from './grow-plan-bridge';
import { isoAddDays } from './orders';
import { laborStandard, studiesForCropPlan } from './time-studies';

export interface DemandLine {
  task: string;
  station: string | null;
  stream: TimeStudyStream;
  /** The people the task needs at once, the most any crop plan's study names. */
  headcount: number;
  /** Staff-hours the day's sowings or shipments need on this task. */
  hours: number;
  cropPlanCodes: string[];
}

export interface UncoveredRun {
  cropPlanCode: string;
  cropPlanName: string;
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
  /** Crop plans with sowings or shipments and no time study at all: no demand is counted for them. */
  uncovered: UncoveredRun[];
  /** Crop plans staffed from their estimated study — no observed study adopted yet. */
  estimatedCropPlans: string[];
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
  uncoveredCropPlans: string[];
  /** Crop plans in the window staffed from an estimate rather than an observed study. */
  estimatedCropPlans: string[];
}

export interface DemandDayInput {
  productionDate: string;
  runs: readonly Pick<CropPlanRunPlan, 'cropPlanCode' | 'cropPlanName' | 'sowingsScheduled' | 'produced'>[];
}

/** A distribution day's shipments, in base units per crop plan. */
export interface HarvestDayInput {
  date: string;
  shipments: readonly { cropPlanCode: string; cropPlanName: string; units: number }[];
}

/** A day's trays on the grow units, per plan. */
export interface ShelfDayInput {
  date: string;
  trays: readonly { cropPlanCode: string; cropPlanName: string; trays: number }[];
}

/** Each plan's cycle days, for the shelf occupancy; a Phase 1-era plan has none. */
export function cycleDaysByCode(cropPlans: readonly CropPlanDef[]): Record<string, number> {
  return Object.fromEntries(cropPlans.map((r) => [r.code, isGrowPlanCarrier(r) ? cycleDays(planStageDays(r.plan)) : 0]));
}

/**
 * The trays on the grow units each day of a window, from the sowings: a sowing's trays occupy
 * the shelf from its production date through its cycle days. Days with nothing on the shelf are
 * absent.
 */
export function traysOnShelf(days: readonly DemandDayInput[], cycle: Readonly<Record<string, number>>, from: string, to: string): ShelfDayInput[] {
  const byDate = new Map<string, Map<string, { cropPlanCode: string; cropPlanName: string; trays: number }>>();
  for (const d of days) {
    for (const run of d.runs) {
      const n = cycle[run.cropPlanCode] ?? 0;
      if (run.produced <= 0 || n <= 0) continue;
      for (let k = 0; k < n; k += 1) {
        const date = isoAddDays(d.productionDate, k);
        if (date < from || date > to) continue;
        const m = byDate.get(date) ?? new Map();
        const row = m.get(run.cropPlanCode) ?? { cropPlanCode: run.cropPlanCode, cropPlanName: run.cropPlanName, trays: 0 };
        row.trays += run.produced;
        m.set(run.cropPlanCode, row);
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
}): StaffDemand {
  const standards = new Map<string, TimeStudyDoc | null>();
  const standardFor = (code: string): TimeStudyDoc | null => {
    if (!standards.has(code)) standards.set(code, laborStandard(studiesForCropPlan(input.studies, code)));
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
  const lineFor = (a: Acc, l: TimeStudyDoc['lines'][number], cropPlanCode: string): DemandLine => {
    const key = `${l.stream}|${l.task}|${l.station ?? ''}`;
    const row = a.byKey.get(key) ?? { task: l.task, station: l.station, stream: l.stream, headcount: 0, hours: 0, cropPlanCodes: [] };
    row.headcount = Math.max(row.headcount, l.staff);
    if (!row.cropPlanCodes.includes(cropPlanCode)) row.cropPlanCodes.push(cropPlanCode);
    a.byKey.set(key, row);
    return row;
  };
  const uncover = (a: Acc, code: string, name: string, sowings: number, units: number, shipped: number) => {
    const u = a.uncovered.get(code) ?? { cropPlanCode: code, cropPlanName: name, sowings: 0, units: 0, unitsShipped: 0 };
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
      const study = standardFor(run.cropPlanCode);
      if (!study) {
        uncover(a, run.cropPlanCode, run.cropPlanName, run.sowingsScheduled, run.produced, 0);
        continue;
      }
      if (study.basis === 'estimated') a.estimated.add(run.cropPlanCode);
      for (const l of study.lines) {
        if (l.stream !== 'sowing') continue;
        const minutes = l.scalesWith === 'fixed' ? l.laborMinutes * run.sowingsScheduled : study.sowingSize > 0 ? (l.laborMinutes / study.sowingSize) * run.produced : 0;
        lineFor(a, l, run.cropPlanCode).hours += minutes / 60;
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
      const study = standardFor(t.cropPlanCode);
      if (!study) continue;
      if (study.basis === 'estimated') a.estimated.add(t.cropPlanCode);
      for (const l of study.lines) {
        if (l.stream !== 'daily') continue;
        const minutes = l.scalesWith === 'fixed' ? l.laborMinutes : study.sowingSize > 0 ? (l.laborMinutes / study.sowingSize) * t.trays : 0;
        lineFor(a, l, t.cropPlanCode).hours += minutes / 60;
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
      const study = standardFor(s.cropPlanCode);
      if (!study) {
        uncover(a, s.cropPlanCode, s.cropPlanName, 0, 0, s.units);
        continue;
      }
      if (study.basis === 'estimated') a.estimated.add(s.cropPlanCode);
      for (const l of study.lines) {
        if (l.stream !== 'harvest') continue;
        const row = lineFor(a, l, s.cropPlanCode);
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
        estimatedCropPlans: [...a.estimated].sort(),
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
    uncoveredCropPlans: [...new Set(days.flatMap((d) => d.uncovered.map((u) => u.cropPlanCode)))].sort(),
    estimatedCropPlans: [...new Set(days.flatMap((d) => d.estimatedCropPlans))].sort(),
  };
}

/** The staff demand as the document for Staffing (Roadmap O4): tasks, stations, people and hours — no positions, no pay. */
export interface StaffDemandDocument {
  kind: 'farm.staff_demand';
  version: 1;
  from: string;
  to: string;
  preparedAt: string;
  days: { date: string; lines: { task: string; station: string | null; headcount: number; hours: number }[]; uncoveredCropPlans: string[] }[];
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
      uncoveredCropPlans: d.uncovered.map((u) => u.cropPlanCode),
    })),
  };
}
