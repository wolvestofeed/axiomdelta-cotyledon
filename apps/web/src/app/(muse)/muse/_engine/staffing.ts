/**
 * Impact OS — labor as a REQUIREMENT of the plan, and crews checked
 * against it.
 *
 * The plant's capacity is equipment, process minutes and the operating day
 * (`deriveCapacity`). This module runs the other direction from the one the
 * platform used to: a production plan — batches placed on the chiller — emits
 * the labor it needs, staff-hours by clock interval and the headcount each task
 * needs at the same moment. A crew register is a proposed staffing answer, and
 * the check reports where it does not cover the requirement. Nothing here feeds
 * back into the ceiling.
 *
 * What is placed on the clock today: the cabinet's load and unload for every
 * batch, off the chiller schedule. The cabinet is not sanitized between batches
 * (Robert, 2026-09-15). The other
 * time-study tasks carry staff and minutes but no placement or precedence yet
 * (Roadmap L5), so they are reported as daily staff-hours and per-task
 * headcount, marked not placed, and are not checked against crew times.
 */

import {
  timeStudy as defaultTimeStudy,
  capacityInputs as defaultCapacityInputs,
} from '../_data/plan-data';
import { clock, type CrewShift } from '../_data/crews';
import type { CapacityProfile } from './index';

type CapacityInputs = typeof defaultCapacityInputs;
type TimeStudy = typeof defaultTimeStudy;

export const REQUIREMENT_INTERVAL_MIN = 15;

/**
 * The time-study tasks the cabinet's load and unload blocks stand in for. Their
 * minutes are placed on the clock from the capacity inputs, so they are not
 * counted a second time among the unplaced tasks.
 */
export const CHILLER_HANDLING_TASKS: readonly string[] = ['Component blast chill and stage', 'Cold hold to dispatch'];

/** One batch on the chiller: when it loads and how many portions it carries. */
export interface BatchSlot {
  seq: number;
  loadMin: number;
  portions: number;
}

export interface PlacedTask {
  key: string;
  seq: number;
  task: string;
  station: string;
  startMin: number;
  endMin: number;
  /** People the task needs at the same moment. */
  headcount: number;
  ccp: string | null;
}

export interface UnplacedTask {
  task: string;
  station: string;
  /** People the task needs at the same moment. */
  staff: number;
  /** Labor minutes for the day's batches and portions. */
  laborMinutes: number;
  ccp: string | null;
  scalesWith: 'fixed' | 'variable';
}

export interface RequirementInterval {
  startMin: number;
  endMin: number;
  staffHours: number;
  /** The most people the placed tasks need at once inside the interval. */
  headcount: number;
}

/** The chill stage itself runs unattended; it is carried so a check can ask who is there when it completes. */
export interface ChillStage {
  seq: number;
  startMin: number;
  endMin: number;
}

export interface LaborRequirement {
  intervalMinutes: number;
  openMin: number;
  closeMin: number;
  batches: number;
  portions: number;
  placed: PlacedTask[];
  chills: ChillStage[];
  intervals: RequirementInterval[];
  peakHeadcount: number;
  peakAtMin: number | null;
  placedStaffHours: number;
  unplaced: UnplacedTask[];
  unplacedStaffHours: number;
  totalStaffHours: number;
}

/** The rated day: every cycle the plant has, loaded one occupancy apart from the first load. */
export function ratedDaySlots(capacity: CapacityProfile): BatchSlot[] {
  return Array.from({ length: capacity.cyclesPerDay }, (_, k) => ({
    seq: k + 1,
    loadMin: capacity.chillWindow.startMin + k * capacity.occupancyMinutes,
    portions: capacity.batchSize,
  }));
}

/** Most people needed at once by `tasks` inside [startMin, endMin). */
function peakConcurrent(tasks: readonly PlacedTask[], startMin: number, endMin: number): number {
  const points = new Set<number>([startMin]);
  for (const t of tasks) {
    if (t.startMin > startMin && t.startMin < endMin) points.add(t.startMin);
  }
  let peak = 0;
  for (const p of points) {
    const at = tasks.reduce((s, t) => (t.startMin <= p && p < t.endMin ? s + t.headcount : s), 0);
    peak = Math.max(peak, at);
  }
  return peak;
}

/**
 * The labor a set of placed batches requires. Staff-hours per interval and
 * the peak headcount come from the placed chiller tasks; the rest of the time
 * study scales with the day's batches (fixed tasks) and portions (variable
 * tasks, on the study's own basis) and is reported unplaced.
 */
export function laborRequirement(
  slots: readonly BatchSlot[],
  cap: CapacityInputs = defaultCapacityInputs,
  study: TimeStudy = defaultTimeStudy,
  intervalMinutes: number = REQUIREMENT_INTERVAL_MIN,
): LaborRequirement {
  const load = cap.loadMinutes.value;
  const chill = cap.chillMinutes.value;
  const unload = cap.unloadMinutes.value;

  const placed: PlacedTask[] = [];
  const chills: ChillStage[] = [];
  for (const b of slots) {
    const chillStart = b.loadMin + load;
    const chillEnd = chillStart + chill;
    const unloadEnd = chillEnd + unload;
    const push = (task: string, startMin: number, endMin: number, headcount: number, ccp: string | null) => {
      if (endMin > startMin && headcount > 0) {
        placed.push({ key: `${b.seq}:${task}`, seq: b.seq, task, station: 'Blast chiller', startMin, endMin, headcount, ccp });
      }
    };
    push('Cabinet load', b.loadMin, chillStart, cap.loadStaff.value, 'CCP-2');
    push('Cabinet unload to cold hold', chillEnd, unloadEnd, cap.unloadStaff.value, 'CCP-2');
    chills.push({ seq: b.seq, startMin: chillStart, endMin: chillEnd });
  }

  const batches = slots.length;
  const portions = slots.reduce((s, b) => s + b.portions, 0);
  const unplaced: UnplacedTask[] = study.tasks
    .filter((t) => !CHILLER_HANDLING_TASKS.includes(t.task))
    .map((t) => ({
      task: t.task,
      station: t.station,
      staff: t.staff,
      ccp: t.ccp,
      scalesWith: t.scalesWith,
      laborMinutes: t.scalesWith === 'fixed' ? t.laborMinutes * batches : (t.laborMinutes / study.estimatedAtBatchSize) * portions,
    }))
    .filter((t) => t.laborMinutes > 0);

  const openMin = cap.operatingOpenMin.value;
  const closeMin = cap.operatingCloseMin.value;
  const lo = Math.min(openMin, ...placed.map((p) => p.startMin));
  const hi = Math.max(closeMin, ...placed.map((p) => p.endMin));
  const from = Math.floor(lo / intervalMinutes) * intervalMinutes;
  const to = Math.ceil(hi / intervalMinutes) * intervalMinutes;
  const intervals: RequirementInterval[] = [];
  for (let s = from; s < to; s += intervalMinutes) {
    const e = s + intervalMinutes;
    const staffMinutes = placed.reduce((acc, p) => acc + Math.max(0, Math.min(e, p.endMin) - Math.max(s, p.startMin)) * p.headcount, 0);
    intervals.push({ startMin: s, endMin: e, staffHours: staffMinutes / 60, headcount: peakConcurrent(placed, s, e) });
  }
  const peakHeadcount = intervals.reduce((m, i) => Math.max(m, i.headcount), 0);
  const placedStaffHours = placed.reduce((s, p) => s + ((p.endMin - p.startMin) * p.headcount) / 60, 0);
  const unplacedStaffHours = unplaced.reduce((s, t) => s + t.laborMinutes, 0) / 60;

  return {
    intervalMinutes,
    openMin,
    closeMin,
    batches,
    portions,
    placed,
    chills,
    intervals,
    peakHeadcount,
    peakAtMin: peakHeadcount > 0 ? intervals.find((i) => i.headcount === peakHeadcount)!.startMin : null,
    placedStaffHours,
    unplaced,
    unplacedStaffHours,
    totalStaffHours: placedStaffHours + unplacedStaffHours,
  };
}

// ── Crews checked against the requirement ──────────────────────────────────

export interface StaffedSpan {
  startMin: number;
  endMin: number;
}

const activeCrews = (crews: readonly CrewShift[]) =>
  crews.filter((c) => c.headcount.value > 0 && c.endMin.value > c.startMin.value);

/** The staffed minutes of the day: the merged union of crew spans with headcount > 0. */
export function staffedSpans(crews: readonly CrewShift[]): StaffedSpan[] {
  const raw = activeCrews(crews)
    .map((c) => ({ startMin: c.startMin.value, endMin: c.endMin.value }))
    .sort((a, b) => a.startMin - b.startMin);
  const merged: StaffedSpan[] = [];
  for (const s of raw) {
    const last = merged[merged.length - 1];
    if (last && s.startMin <= last.endMin) last.endMin = Math.max(last.endMin, s.endMin);
    else merged.push({ ...s });
  }
  return merged;
}

/** People scheduled at one minute of the day. */
export function scheduledHeadcountAt(crews: readonly CrewShift[], min: number): number {
  return activeCrews(crews).reduce((s, c) => (c.startMin.value <= min && min < c.endMin.value ? s + c.headcount.value : s), 0);
}

/** The fewest people scheduled at any moment of [startMin, endMin), and the first minute it happens. */
function leastScheduled(crews: readonly CrewShift[], startMin: number, endMin: number): { count: number; atMin: number } {
  const points = new Set<number>([startMin]);
  for (const c of activeCrews(crews)) {
    for (const m of [c.startMin.value, c.endMin.value]) if (m > startMin && m < endMin) points.add(m);
  }
  let best = { count: Infinity, atMin: startMin };
  for (const p of [...points].sort((a, b) => a - b)) {
    const n = scheduledHeadcountAt(crews, p);
    if (n < best.count) best = { count: n, atMin: p };
  }
  return best.count === Infinity ? { count: 0, atMin: startMin } : best;
}

export type StaffingFindingKind =
  | 'no-crew-at-task'
  | 'crew-short-at-task'
  | 'chill-completes-unstaffed'
  | 'extra-cycle-across-close'
  | 'crew-hours-below-requirement'
  | 'crew-outside-operating-day';

export interface StaffingFinding {
  kind: StaffingFindingKind;
  atMin: number | null;
  required: number | null;
  scheduled: number | null;
  detail: string;
}

export interface StaffingCheck {
  /** False when no crew is proposed: the requirement stands on its own and nothing is checked. */
  checked: boolean;
  crews: number;
  staffedSpans: StaffedSpan[];
  /** Σ headcount × crew hours. */
  crewStaffHours: number;
  requiredStaffHours: number;
  /** People on the floor across the proposed crews. */
  proposedFloorHeadcount: number;
  /** Every placed load and unload has its headcount scheduled. */
  staffedAtLoadAndUnload: boolean;
  /** Some chill stage completes with no one scheduled — CCP-2's datalogger-and-alarm path. */
  chillCrossesUnstaffed: boolean;
  /** The extra cycle across close can be loaded by the crews but not unloaded by them. */
  unattendedChillExtraCycle: boolean;
  findings: StaffingFinding[];
}

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
const hours = (h: number) => `${(Math.round(h * 10) / 10).toLocaleString()} staff-hours`;

/**
 * Check proposed crews against a labor requirement. Every finding is a fact
 * about the plan: which task, at what minute, how many people it needs and how
 * many are scheduled. The plant's ceiling is not touched.
 */
export function checkStaffing(
  req: LaborRequirement,
  crews: readonly CrewShift[],
  capacity: CapacityProfile,
  cap: CapacityInputs = defaultCapacityInputs,
): StaffingCheck {
  const active = activeCrews(crews);
  const checked = active.length > 0;
  const findings: StaffingFinding[] = [];

  let staffedAtLoadAndUnload = true;
  for (const t of req.placed) {
    const least = leastScheduled(active, t.startMin, t.endMin);
    if (least.count >= t.headcount) continue;
    if (t.task === 'Cabinet load' || t.task === 'Cabinet unload to cold hold') staffedAtLoadAndUnload = false;
    findings.push({
      kind: least.count === 0 ? 'no-crew-at-task' : 'crew-short-at-task',
      atMin: least.atMin,
      required: t.headcount,
      scheduled: least.count,
      detail: `${t.task}, batch ${t.seq}: ${people(t.headcount)} needed at ${clock(least.atMin)}; ${least.count === 0 ? 'no crew is scheduled then' : `${least.count} scheduled then`}.`,
    });
  }

  let chillCrossesUnstaffed = false;
  for (const c of req.chills) {
    if (scheduledHeadcountAt(active, c.endMin) > 0) continue;
    chillCrossesUnstaffed = true;
    findings.push({
      kind: 'chill-completes-unstaffed',
      atMin: c.endMin,
      required: null,
      scheduled: 0,
      detail: `Batch ${c.seq}'s chill stage completes at ${clock(c.endMin)} with no crew scheduled. CCP-2 covers a chill completing while the building is empty only on the continuous datalogger with alarm to a named on-call responder.`,
    });
  }

  let unattendedChillExtraCycle = false;
  const w = capacity.chillWindow;
  if (w.loadBeforeCloseExtraCycle) {
    const nextStart = w.startMin + w.cycles * w.occupancyMinutes;
    const loadEnd = nextStart + cap.loadMinutes.value;
    const chillEnd = loadEnd + cap.chillMinutes.value;
    const loadable = leastScheduled(active, nextStart, loadEnd).count >= cap.loadStaff.value;
    const unloadable = leastScheduled(active, chillEnd, chillEnd + cap.unloadMinutes.value).count >= cap.unloadStaff.value;
    if (loadable && !unloadable) {
      unattendedChillExtraCycle = true;
      findings.push({
        kind: 'extra-cycle-across-close',
        atMin: nextStart,
        required: cap.unloadStaff.value,
        scheduled: scheduledHeadcountAt(active, chillEnd),
        detail: `One more batch can be loaded at ${clock(nextStart)} by the crews proposed. Its chill ends ${clock(chillEnd)}, after the operating day closes at ${clock(w.closeMin)}, and no crew is scheduled to unload it. That cycle is not in the daily ceiling; running it depends on CCP-2's datalogger-and-alarm path.`,
      });
    }
  }

  const crewStaffHours = active.reduce((s, c) => s + (c.headcount.value * (c.endMin.value - c.startMin.value)) / 60, 0);
  if (checked && crewStaffHours + 1e-9 < req.totalStaffHours) {
    findings.push({
      kind: 'crew-hours-below-requirement',
      atMin: null,
      required: req.totalStaffHours,
      scheduled: crewStaffHours,
      detail: `The proposed crews are ${hours(crewStaffHours)}; the plan requires ${hours(req.totalStaffHours)} — ${hours(req.placedStaffHours)} placed at the cabinet and ${hours(req.unplacedStaffHours)} for tasks not yet placed on the clock.`,
    });
  }

  for (const c of active) {
    if (c.startMin.value >= req.openMin && c.endMin.value <= req.closeMin) continue;
    findings.push({
      kind: 'crew-outside-operating-day',
      atMin: c.startMin.value,
      required: null,
      scheduled: c.headcount.value,
      detail: `${c.label} runs ${clock(c.startMin.value)}–${clock(c.endMin.value)}; the operating day is ${clock(req.openMin)}–${clock(req.closeMin)}.`,
    });
  }

  // The roster is CompTable's (Roadmap O1); crews are no longer compared to a plan-data roster.
  const proposedFloorHeadcount = active.reduce((s, c) => s + c.headcount.value, 0);

  findings.sort((a, b) => (a.atMin ?? Infinity) - (b.atMin ?? Infinity));

  return {
    checked,
    crews: active.length,
    staffedSpans: staffedSpans(active),
    crewStaffHours,
    requiredStaffHours: req.totalStaffHours,
    proposedFloorHeadcount,
    staffedAtLoadAndUnload,
    chillCrossesUnstaffed,
    unattendedChillExtraCycle,
    findings: checked ? findings : [],
  };
}

/**
 * Starting values for a crew added in a scenario, taken from the plant and the
 * rated day's requirement rather than typed: the operating day, and the most
 * people the placed tasks need at once.
 */
export function newCrewDefaultsFor(req: LaborRequirement): { startMin: number; endMin: number; headcount: number } {
  return { startMin: req.openMin, endMin: req.closeMin, headcount: Math.max(1, req.peakHeadcount) };
}
