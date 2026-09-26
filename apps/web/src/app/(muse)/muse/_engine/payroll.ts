/**
 * Impact OS — the time clock and payroll, engine-side (Roadmap K5, O1).
 *
 * Pure: no database, no ledger import. Staff clock in, start and end a break,
 * and clock out on the floor. Punches become shifts; shifts become hours by work
 * date and workweek, with the minutes past 40 hours in a workweek counted as
 * overtime (FLSA, 29 U.S.C. 207(a)(1)).
 *
 * No pay is held in Muse (Robert, 2026-09-14, Roadmap O1). CompTable holds
 * wages, burden and benefits, closes each pay period and sends its totals by
 * account; the clock times go to CompTable. Pay periods are biweekly, Monday
 * through the second Sunday, paid the Friday five days later. The Monday the
 * sequence counts from is a PLACEHOLDER (`payrollCalendar.firstPeriodStart`).
 */

import { KITCHEN_TIME_ZONE, payrollCalendar } from '../_data/working-capital';
import { isoAddDays, weekdayOf } from './orders';
import { daysBetween } from './working-capital';
import type { LoadedLaborCents } from './comp';

// ── Documents ───────────────────────────────────────────────────────────────

export type StaffStatus = 'active' | 'inactive';

/** A person on the time clock. No pay: wages, burden and personal details are CompTable's. */
/**
 * Work roles (Roadmap P2, Robert 2026-09-16): a person may hold more than one and clocks in under one at a
 * time. Operator is production and dispatch, on the Floor; sales is the Sales portal. Muse reports the
 * hours worked by role; payroll does the rest.
 */
export const WORK_ROLES = ['operator', 'sales'] as const;
export type WorkRole = (typeof WORK_ROLES)[number];
export const WORK_ROLE_LABELS: Record<WorkRole, string> = { operator: 'Operator — production and dispatch', sales: 'Sales' };
export const isWorkRole = (v: unknown): v is WorkRole => typeof v === 'string' && (WORK_ROLES as readonly string[]).includes(v);

export interface StaffDoc {
  id: string;
  /** Full name, shown on the Floor and the clock. */
  name: string;
  /** Job title, free text. */
  role: string | null;
  /** The work roles the person may clock in under (0074). */
  roles: WorkRole[];
  /** The person's employee reference in CompTable. */
  employeeRef: string | null;
  /** Sign-in email: gives the person the operator role and their own record. Admins only. */
  email: string | null;
  status: StaffStatus;
  startedOn: string | null;
  notes: string | null;
}

export type PunchKind = 'in' | 'break_start' | 'break_end' | 'out';

export const PUNCH_KIND_LABELS: Record<PunchKind, string> = {
  in: 'Clock in',
  break_start: 'Start break',
  break_end: 'End break',
  out: 'Clock out',
};

export interface PunchDoc {
  id: string;
  staffId: string;
  kind: PunchKind;
  /** ISO timestamp. */
  punchedAt: string;
  /** The role of the shift, taken at clock-in; null on punches written before roles (read as operator). */
  role?: WorkRole | null;
  source: 'clock' | 'manual';
  reason: string | null;
  recordedBy: string | null;
}

/** A pay period closed in CompTable, received as totals by account. Never an individual's pay. */
export interface ClosedPayrollPeriodDoc {
  id: string;
  /** CompTable's reference for the closed period. */
  comptableRef: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  wagesCents: number;
  payrollTaxesCents: number;
  workersCompCents: number;
  benefitsCents: number;
  regularHours: number;
  overtimeHours: number;
  /** ISO timestamp. */
  receivedAt: string;
}

/** FLSA, 29 U.S.C. 207(a)(1): hours past 40 in a workweek are overtime. */
export const FLSA_WEEKLY_OVERTIME_MINUTES = 40 * 60;

// ── Local time ──────────────────────────────────────────────────────────────

/** The kitchen's local date for a timestamp — a punch's work date. */
export function localDate(ts: string, timeZone: string = KITCHEN_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts));
}

/** The kitchen's local clock time, HH:MM. */
export function localClock(ts: string, timeZone: string = KITCHEN_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts));
}

/** The ISO timestamp of a kitchen-local date and HH:MM, whatever time zone the browser is in. */
export function kitchenTimeToIso(date: string, hhmm: string, timeZone: string = KITCHEN_TIME_ZONE): string {
  const guess = Date.parse(`${date}T${hhmm}:00Z`);
  const offsetOf = (ms: number) => {
    const local = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
    const part = (t: string) => Number(local.find((x) => x.type === t)?.value);
    return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute')) - ms;
  };
  const first = guess - offsetOf(guess);
  return new Date(guess - offsetOf(first)).toISOString();
}

const minutesBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000;

// ── Pay periods ─────────────────────────────────────────────────────────────

export interface PayCalendar {
  /** A Monday: the start of one pay period in the sequence. */
  firstPeriodStart: string;
  periodDays: number;
  payLagDays: number;
}

export const DEFAULT_PAY_CALENDAR: PayCalendar = {
  firstPeriodStart: payrollCalendar.firstPeriodStart.value,
  periodDays: payrollCalendar.periodDays.value,
  payLagDays: payrollCalendar.payLagDays.value,
};

export interface PayPeriod {
  /** Monday. */
  start: string;
  /** The second Sunday. */
  end: string;
  /** The Friday five days after the end. */
  payDate: string;
}

/** The pay period a date falls in. The sequence runs both ways from the anchor. */
export function payPeriodFor(date: string, cal: PayCalendar = DEFAULT_PAY_CALENDAR): PayPeriod {
  const k = Math.floor(daysBetween(cal.firstPeriodStart, date) / cal.periodDays);
  const start = isoAddDays(cal.firstPeriodStart, k * cal.periodDays);
  const end = isoAddDays(start, cal.periodDays - 1);
  return { start, end, payDate: isoAddDays(end, cal.payLagDays) };
}

/** Every pay period that overlaps [from, to], in order. */
export function payPeriodsOverlapping(from: string, to: string, cal: PayCalendar = DEFAULT_PAY_CALENDAR): PayPeriod[] {
  const out: PayPeriod[] = [];
  for (let p = payPeriodFor(from, cal); p.start <= to; p = payPeriodFor(isoAddDays(p.end, 1), cal)) out.push(p);
  return out;
}

/** Every pay period whose pay date falls in [from, to]. */
export function payPeriodsPaidBetween(from: string, to: string, cal: PayCalendar = DEFAULT_PAY_CALENDAR): PayPeriod[] {
  return payPeriodsOverlapping(isoAddDays(from, -(cal.periodDays + cal.payLagDays)), to, cal).filter((p) => p.payDate >= from && p.payDate <= to);
}

/** Pay periods in a year of 364 days at this period length: 26 at biweekly. */
export const periodsPerYear = (cal: PayCalendar = DEFAULT_PAY_CALENDAR): number => 364 / cal.periodDays;

/** The Monday of a date's workweek (Monday through Sunday, aligned with the pay period). */
export function workweekOf(date: string): string {
  return isoAddDays(date, -((weekdayOf(date) + 6) % 7));
}

// ── The clock ───────────────────────────────────────────────────────────────

export type ClockState = 'out' | 'in' | 'on_break';

export const CLOCK_STATE_LABELS: Record<ClockState, string> = { out: 'Clocked out', in: 'Clocked in', on_break: 'On break' };

/** The punches the clock accepts from each state. */
export const NEXT_PUNCHES: Record<ClockState, readonly PunchKind[]> = {
  out: ['in'],
  in: ['break_start', 'out'],
  on_break: ['break_end'],
};

const byTime = (a: PunchDoc, b: PunchDoc) => a.punchedAt.localeCompare(b.punchedAt) || a.id.localeCompare(b.id);

/** A person's state after their punches, replayed in time order. */
export function clockStateOf(punches: readonly PunchDoc[]): ClockState {
  let state: ClockState = 'out';
  for (const p of [...punches].sort(byTime)) {
    if (p.kind === 'in') state = 'in';
    else if (p.kind === 'break_start' && state === 'in') state = 'on_break';
    else if (p.kind === 'break_end' && state === 'on_break') state = 'in';
    else if (p.kind === 'out') state = 'out';
  }
  return state;
}

/** Why the clock refuses a punch from a state, or null when it accepts it. */
export function punchRefusal(state: ClockState, kind: PunchKind): string | null {
  if (NEXT_PUNCHES[state].includes(kind)) return null;
  return `${PUNCH_KIND_LABELS[kind]} is not accepted while ${CLOCK_STATE_LABELS[state].toLowerCase()}.`;
}

export interface Shift {
  staffId: string;
  /** The role clocked in under; operator for a shift before roles. */
  role: WorkRole;
  /** The local date of the clock-in. */
  workDate: string;
  inAt: string;
  outAt: string | null;
  breakMinutes: number;
  /** Clock-in to clock-out less breaks; 0 while the shift is open. */
  workedMinutes: number;
  open: boolean;
  issues: string[];
}

export interface ShiftReplay {
  shifts: Shift[];
  /** Punches that belong to no shift, and why. */
  orphans: { punchId: string; staffId: string; reason: string }[];
}

/**
 * Shifts from punches. A shift runs clock-in to clock-out; breaks between a
 * start and an end are unpaid time; a shift with no clock-out is open and
 * counts no hours until it is closed. Nothing is filled in: a missing punch is
 * an issue on the shift, and a manual punch with its reason is the correction.
 */
export function shiftsFrom(punches: readonly PunchDoc[]): ShiftReplay {
  const shifts: Shift[] = [];
  const orphans: ShiftReplay['orphans'] = [];
  const byStaff = new Map<string, PunchDoc[]>();
  for (const p of punches) byStaff.set(p.staffId, [...(byStaff.get(p.staffId) ?? []), p]);

  for (const [staffId, list] of byStaff) {
    let cur: Shift | null = null;
    let breakStart: string | null = null;
    for (const p of [...list].sort(byTime)) {
      if (p.kind === 'in') {
        if (cur) {
          cur.issues.push('A second clock-in with this shift still open; it has no clock-out.');
          shifts.push(cur);
        }
        cur = { staffId, role: p.role ?? 'operator', workDate: localDate(p.punchedAt), inAt: p.punchedAt, outAt: null, breakMinutes: 0, workedMinutes: 0, open: true, issues: [] };
        breakStart = null;
      } else if (p.kind === 'break_start') {
        if (!cur) orphans.push({ punchId: p.id, staffId, reason: 'Break started with no shift open.' });
        else if (breakStart) cur.issues.push('A second break start with a break already running; the first is kept.');
        else breakStart = p.punchedAt;
      } else if (p.kind === 'break_end') {
        if (!cur || !breakStart) orphans.push({ punchId: p.id, staffId, reason: 'Break ended with no break running.' });
        else {
          cur.breakMinutes += minutesBetween(breakStart, p.punchedAt);
          breakStart = null;
        }
      } else {
        if (!cur) {
          orphans.push({ punchId: p.id, staffId, reason: 'Clock-out with no shift open.' });
          continue;
        }
        if (breakStart) {
          cur.breakMinutes += minutesBetween(breakStart, p.punchedAt);
          cur.issues.push('Clocked out during a break; the break runs to the clock-out.');
          breakStart = null;
        }
        cur.outAt = p.punchedAt;
        cur.open = false;
        cur.workedMinutes = Math.max(0, minutesBetween(cur.inAt, p.punchedAt) - cur.breakMinutes);
        shifts.push(cur);
        cur = null;
      }
    }
    if (cur) {
      cur.issues.push('No clock-out yet; the shift counts no hours until it closes.');
      shifts.push(cur);
    }
  }
  shifts.sort((a, b) => a.inAt.localeCompare(b.inAt));
  return { shifts, orphans };
}

// ── Hours worked ────────────────────────────────────────────────────────────

export interface HoursDay {
  staffId: string;
  date: string;
  regularMinutes: number;
  overtimeMinutes: number;
}

/**
 * Hours worked by person and work date in [from, to], from closed shifts. The
 * minutes past 40 hours in the workweek are overtime, counted in time order
 * across the whole week, including days outside the range.
 */
export function hoursWorked(punches: readonly PunchDoc[], from: string, to: string): HoursDay[] {
  const weekFrom = workweekOf(from);
  const weekTo = isoAddDays(workweekOf(to), 6);
  const closed = shiftsFrom(punches).shifts.filter((sh) => !sh.open && sh.workDate >= weekFrom && sh.workDate <= weekTo);
  const usedByStaffWeek = new Map<string, number>();
  const byKey = new Map<string, HoursDay>();
  for (const sh of closed) {
    const weekKey = `${sh.staffId}|${workweekOf(sh.workDate)}`;
    const used = usedByStaffWeek.get(weekKey) ?? 0;
    const regular = Math.max(0, Math.min(sh.workedMinutes, FLSA_WEEKLY_OVERTIME_MINUTES - used));
    usedByStaffWeek.set(weekKey, used + sh.workedMinutes);
    if (sh.workDate < from || sh.workDate > to) continue;
    const key = `${sh.staffId}|${sh.workDate}`;
    const day = byKey.get(key) ?? { staffId: sh.staffId, date: sh.workDate, regularMinutes: 0, overtimeMinutes: 0 };
    day.regularMinutes += regular;
    day.overtimeMinutes += sh.workedMinutes - regular;
    byKey.set(key, day);
  }
  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.staffId.localeCompare(b.staffId));
}

export interface HoursRunLine {
  staffId: string;
  regularHours: number;
  overtimeHours: number;
  openShifts: number;
}

export interface HoursRun {
  period: PayPeriod;
  lines: HoursRunLine[];
  regularHours: number;
  overtimeHours: number;
  openShifts: number;
}

/** One pay period's hours per person: regular, overtime and open shifts. No pay. */
export function hoursRun(period: PayPeriod, staff: readonly Pick<StaffDoc, 'id'>[], punches: readonly PunchDoc[]): HoursRun {
  const days = hoursWorked(punches, period.start, period.end);
  const { shifts } = shiftsFrom(punches);
  const lines = staff
    .map((s) => {
      const mine = days.filter((d) => d.staffId === s.id);
      return {
        staffId: s.id,
        regularHours: mine.reduce((t, d) => t + d.regularMinutes, 0) / 60,
        overtimeHours: mine.reduce((t, d) => t + d.overtimeMinutes, 0) / 60,
        openShifts: shifts.filter((sh) => sh.staffId === s.id && sh.open && sh.workDate >= period.start && sh.workDate <= period.end).length,
      };
    })
    .filter((l) => l.regularHours > 0 || l.overtimeHours > 0 || l.openShifts > 0);
  return {
    period,
    lines,
    regularHours: lines.reduce((t, l) => t + l.regularHours, 0),
    overtimeHours: lines.reduce((t, l) => t + l.overtimeHours, 0),
    openShifts: lines.reduce((t, l) => t + l.openShifts, 0),
  };
}

/** Hours worked by person and role in a pay period, from the closed shifts (Roadmap P2). Overtime is per person across roles and is on `hoursRun`. */
export interface RoleHoursLine {
  staffId: string;
  role: WorkRole;
  hours: number;
  shifts: number;
}

export function hoursByRole(period: PayPeriod, punches: readonly PunchDoc[]): RoleHoursLine[] {
  const out = new Map<string, RoleHoursLine>();
  for (const sh of shiftsFrom(punches).shifts) {
    if (sh.open || sh.workDate < period.start || sh.workDate > period.end) continue;
    const k = `${sh.staffId}|${sh.role}`;
    const line = out.get(k) ?? { staffId: sh.staffId, role: sh.role, hours: 0, shifts: 0 };
    line.hours += sh.workedMinutes / 60;
    line.shifts += 1;
    out.set(k, line);
  }
  return [...out.values()];
}

/** The role a punch belongs to: a clock-in's own, else the open shift's. */
export function roleOfOpenShift(punches: readonly PunchDoc[]): WorkRole | null {
  const open = shiftsFrom(punches).shifts.find((sh) => sh.open);
  return open ? open.role : null;
}

// ── CompTable's closed payroll periods ─────────────────────────────────────

/** A closed period's totals as the loaded labor the ledger splits by account. */
export function loadedFromClosedPeriod(p: ClosedPayrollPeriodDoc): LoadedLaborCents {
  return {
    wagesCents: p.wagesCents,
    payrollTaxesCents: p.payrollTaxesCents,
    workersCompCents: p.workersCompCents,
    benefitsCents: p.benefitsCents,
    loadedCents: p.wagesCents + p.payrollTaxesCents + p.workersCompCents + p.benefitsCents,
  };
}

/**
 * The share of a closed pay period earned on or before `through`: the minutes on
 * the clock worked through that date over the period's minutes on the clock, or
 * calendar days when the clock shows none for the period.
 */
export function earnedShareThrough(p: Pick<ClosedPayrollPeriodDoc, 'periodStart' | 'periodEnd'>, punches: readonly PunchDoc[], through: string): number {
  if (through < p.periodStart) return 0;
  if (through >= p.periodEnd) return 1;
  const days = hoursWorked(punches, p.periodStart, p.periodEnd);
  const minutes = (list: readonly HoursDay[]) => list.reduce((s, d) => s + d.regularMinutes + d.overtimeMinutes, 0);
  const total = minutes(days);
  if (total > 0) return minutes(days.filter((d) => d.date <= through)) / total;
  return (daysBetween(p.periodStart, through) + 1) / (daysBetween(p.periodStart, p.periodEnd) + 1);
}
