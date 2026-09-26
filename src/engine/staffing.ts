/**
 * MicroFarm — labor as a REQUIREMENT of the plan, and crews checked
 * against it.
 *
 * The plant's capacity is equipment, process minutes and the operating day
 * (`deriveCapacity`). This module runs the other direction from the one the
 * platform used to: a production plan — sowings placed on the blackout rack — emits
 * the labor it needs, staff-hours by clock interval and the headcount each task
 * needs at the same moment. A crew register is a proposed staffing answer, and
 * the check reports where it does not cover the requirement. Nothing here feeds
 * back into the ceiling.
 *
 * What is placed on the clock today: the rack's load and unload for every
 * sowing, off the blackout rack schedule. The rack is not sanitized between sowings
 *. The other
 * time-study tasks carry staff and minutes but no placement or precedence yet
 * (Roadmap L5), so they are reported as daily staff-hours and per-task
 * headcount, marked not placed, and are not checked against crew times.
 */

import {
  timeStudy as defaultTimeStudy,
  capacityInputs as defaultCapacityInputs,
} from '@/data/plan-data';
import { clock, type CrewShift } from '@/data/crews';
import type { CapacityProfile } from '@/engine';

type CapacityInputs = typeof defaultCapacityInputs;
type TimeStudy = typeof defaultTimeStudy;

export const REQUIREMENT_INTERVAL_MIN = 15;

/**
 * The time-study tasks the rack's load and unload blocks stand in for. Their
 * minutes are placed on the clock from the capacity inputs, so they are not
 * counted a second time among the unplaced tasks.
 */
export const BLACKOUT_RACK_HANDLING_TASKS: readonly string[] = ['Component blackout and stage', 'Cold hold to harvest'];

/** One sowing on the blackout rack: when it loads and how many units it carries. */
export interface SowingSlot {
  seq: number;
  loadMin: number;
  units: number;
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
  controlPoint: string | null;
}

export interface UnplacedTask {
  task: string;
  station: string;
  /** People the task needs at the same moment. */
  staff: number;
  /** Labor minutes for the day's sowings and units. */
  laborMinutes: number;
  controlPoint: string | null;
  scalesWith: 'fixed' | 'variable';
}

export interface RequirementInterval {
  startMin: number;
  endMin: number;
  staffHours: number;
  /** The most people the placed tasks need at once inside the interval. */
  headcount: number;
}

/** The blackout stage itself runs unattended; it is carried so a check can ask who is there when it completes. */
export interface BlackoutStage {
  seq: number;
  startMin: number;
  endMin: number;
}

export interface LaborRequirement {
  intervalMinutes: number;
  openMin: number;
  closeMin: number;
  sowings: number;
  units: number;
  placed: PlacedTask[];
  chills: BlackoutStage[];
  intervals: RequirementInterval[];
  peakHeadcount: number;
  peakAtMin: number | null;
  placedStaffHours: number;
  unplaced: UnplacedTask[];
  unplacedStaffHours: number;
  totalStaffHours: number;
}

/** The rated day: every cycle the plant has, loaded one occupancy apart from the first load. */
export function ratedDaySlots(capacity: CapacityProfile): SowingSlot[] {
  return Array.from({ length: capacity.cyclesPerDay }, (_, k) => ({
    seq: k + 1,
    loadMin: capacity.blackoutWindow.startMin + k * capacity.occupancyMinutes,
    units: capacity.sowingSize,
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
 * The labor a set of placed sowings requires. Staff-hours per interval and
 * the peak headcount come from the placed blackout rack tasks; the rest of the time
 * study scales with the day's sowings (fixed tasks) and units (variable
 * tasks, on the study's own basis) and is reported unplaced.
 */
export function laborRequirement(
  slots: readonly SowingSlot[],
  cap: CapacityInputs = defaultCapacityInputs,
  study: TimeStudy = defaultTimeStudy,
  intervalMinutes: number = REQUIREMENT_INTERVAL_MIN,
): LaborRequirement {
  const load = cap.loadMinutes.value;
  const blackout = cap.blackoutMinutes.value;
  const unload = cap.unloadMinutes.value;

  const placed: PlacedTask[] = [];
  const chills: BlackoutStage[] = [];
  for (const b of slots) {
    const blackoutStart = b.loadMin + load;
    const blackoutEnd = blackoutStart + blackout;
    const unloadEnd = blackoutEnd + unload;
    const push = (task: string, startMin: number, endMin: number, headcount: number, controlPoint: string | null) => {
      if (endMin > startMin && headcount > 0) {
        placed.push({ key: `${b.seq}:${task}`, seq: b.seq, task, station: 'Blackout rack', startMin, endMin, headcount, controlPoint });
      }
    };
    push('Rack load', b.loadMin, blackoutStart, cap.loadStaff.value, 'control-point-2');
    push('Rack unload to cold hold', blackoutEnd, unloadEnd, cap.unloadStaff.value, 'control-point-2');
    chills.push({ seq: b.seq, startMin: blackoutStart, endMin: blackoutEnd });
  }

  const sowings = slots.length;
  const units = slots.reduce((s, b) => s + b.units, 0);
  const unplaced: UnplacedTask[] = study.tasks
    .filter((t) => !BLACKOUT_RACK_HANDLING_TASKS.includes(t.task))
    .map((t) => ({
      task: t.task,
      station: t.station,
      staff: t.staff,
      controlPoint: t.controlPoint,
      scalesWith: t.scalesWith,
      laborMinutes: t.scalesWith === 'fixed' ? t.laborMinutes * sowings : (t.laborMinutes / study.estimatedAtSowingSize) * units,
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
    sowings,
    units,
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

/**
 * A requirement with more tasks not yet placed on the clock: a grow sowing's own sowing-stream
 * lines, which have no rack to place them on. Same task at the same station is one row.
 */
export function withUnplacedTasks(req: LaborRequirement, tasks: readonly UnplacedTask[], sowings: number, units: number): LaborRequirement {
  const byKey = new Map(req.unplaced.map((t) => [`${t.task}|${t.station}`, { ...t }]));
  for (const t of tasks) {
    if (t.laborMinutes <= 0) continue;
    const key = `${t.task}|${t.station}`;
    const row = byKey.get(key);
    if (row) {
      row.laborMinutes += t.laborMinutes;
      row.staff = Math.max(row.staff, t.staff);
    } else byKey.set(key, { ...t });
  }
  const unplaced = [...byKey.values()];
  const unplacedStaffHours = unplaced.reduce((s, t) => s + t.laborMinutes, 0) / 60;
  return { ...req, sowings: req.sowings + sowings, units: req.units + units, unplaced, unplacedStaffHours, totalStaffHours: req.placedStaffHours + unplacedStaffHours };
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
  | 'blackout-completes-unstaffed'
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
  /** Some blackout stage completes with no one scheduled — control-point-2's datalogger-and-alarm path. */
  blackoutCrossesUnstaffed: boolean;
  /** The extra cycle across close can be loaded by the crews but not unloaded by them. */
  unattendedBlackoutExtraCycle: boolean;
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
    if (t.task === 'Rack load' || t.task === 'Rack unload to cold hold') staffedAtLoadAndUnload = false;
    findings.push({
      kind: least.count === 0 ? 'no-crew-at-task' : 'crew-short-at-task',
      atMin: least.atMin,
      required: t.headcount,
      scheduled: least.count,
      detail: `${t.task}, sowing ${t.seq}: ${people(t.headcount)} needed at ${clock(least.atMin)}; ${least.count === 0 ? 'no crew is scheduled then' : `${least.count} scheduled then`}.`,
    });
  }

  let blackoutCrossesUnstaffed = false;
  for (const c of req.chills) {
    if (scheduledHeadcountAt(active, c.endMin) > 0) continue;
    blackoutCrossesUnstaffed = true;
    findings.push({
      kind: 'blackout-completes-unstaffed',
      atMin: c.endMin,
      required: null,
      scheduled: 0,
      detail: `Sowing ${c.seq}'s blackout stage completes at ${clock(c.endMin)} with no crew scheduled. control-point-2 covers a blackout completing while the building is empty only on the continuous datalogger with alarm to a named on-call responder.`,
    });
  }

  let unattendedBlackoutExtraCycle = false;
  const w = capacity.blackoutWindow;
  if (w.loadBeforeCloseExtraCycle) {
    const nextStart = w.startMin + w.cycles * w.occupancyMinutes;
    const loadEnd = nextStart + cap.loadMinutes.value;
    const blackoutEnd = loadEnd + cap.blackoutMinutes.value;
    const loadable = leastScheduled(active, nextStart, loadEnd).count >= cap.loadStaff.value;
    const unloadable = leastScheduled(active, blackoutEnd, blackoutEnd + cap.unloadMinutes.value).count >= cap.unloadStaff.value;
    if (loadable && !unloadable) {
      unattendedBlackoutExtraCycle = true;
      findings.push({
        kind: 'extra-cycle-across-close',
        atMin: nextStart,
        required: cap.unloadStaff.value,
        scheduled: scheduledHeadcountAt(active, blackoutEnd),
        detail: `One more sowing can be loaded at ${clock(nextStart)} by the crews proposed. Its blackout ends ${clock(blackoutEnd)}, after the operating day closes at ${clock(w.closeMin)}, and no crew is scheduled to unload it. That cycle is not in the daily ceiling; running it depends on control-point-2's datalogger-and-alarm path.`,
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
      detail: `The proposed crews are ${hours(crewStaffHours)}; the plan requires ${hours(req.totalStaffHours)}${req.placedStaffHours > 0 ? ` — ${hours(req.placedStaffHours)} placed at the rack and ${hours(req.unplacedStaffHours)} for tasks not yet placed on the clock` : ', none of it placed on the clock yet'}.`,
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

  // The roster is Staffing's (Roadmap O1); crews are no longer compared to a plan-data roster.
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
    blackoutCrossesUnstaffed,
    unattendedBlackoutExtraCycle,
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
