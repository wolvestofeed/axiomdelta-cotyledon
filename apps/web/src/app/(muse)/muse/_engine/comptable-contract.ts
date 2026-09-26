/**
 * Impact OS — the CompTable contract, version 1 (Roadmap O4). Pure.
 *
 * The documents that cross between Muse and CompTable, as schemas, and the
 * functions that build them (Muse → CompTable) or read them (CompTable → Muse).
 * The canonical text is `docs/muse/comptable-contract.md`; this file and that
 * one are co-versioned.
 *
 * Transport is not here. A notice names an event and the document it concerns;
 * the receiver reads the document through an authenticated, read-only API and
 * handles each event once. That transport waits on Muse running on its own
 * domain, the Muse Kitchen account in CompTable, signing keys and the
 * CompTable-side endpoints (a CompTable change, approved separately).
 *
 * No document carries an individual's pay except the staff record, which is
 * read through for an admin at request time and never stored in `muse.*`.
 */

import { z } from 'zod';
import { KITCHEN_TIME_ZONE } from '../_data/working-capital';
import { localDate, type ClosedPayrollPeriodDoc, type PunchDoc, type StaffDoc } from './payroll';
import type { StaffDemandDocument } from './staff-demand';

export const CONTRACT_NAME = 'muse-comptable';
export const CONTRACT_VERSION = 1;

// ── Primitives ──────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a date, YYYY-MM-DD');
const isoMonth = z.string().regex(/^\d{4}-\d{2}$/, 'a month, YYYY-MM');
const timestamp = z.iso.datetime({ offset: true });
const cents = z.number().int().nonnegative();
const hours = z.number().nonnegative();
const ref = z.string().min(1).max(200);
const version = z.literal(CONTRACT_VERSION);

// ── Kinds and notices ───────────────────────────────────────────────────────

export const NOTICE_KINDS = [
  'muse.punches',
  'muse.staff_demand',
  'muse.labor_demand',
  'comptable.published_schedule',
  'comptable.closed_payroll_period',
  'comptable.labor_cost',
  // Added at version 1, additively (Robert, 2026-09-15): CompTable owns HR, so
  // "a person joined" is an event there. It is the trigger for onboarding —
  // without it, Muse can only notice a new hire by someone opening a page.
  'comptable.staff_joined',
] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

/**
 * Who sends each document. The staff RECORD is still never announced — an
 * admin's page reads it, and it carries pay. What is announced is the fact that
 * a person joined: a reference and a start date, nothing confidential.
 */
export const SENDER: Record<NoticeKind, 'muse' | 'comptable'> = {
  'muse.punches': 'muse',
  'muse.staff_demand': 'muse',
  'muse.labor_demand': 'muse',
  'comptable.published_schedule': 'comptable',
  'comptable.closed_payroll_period': 'comptable',
  'comptable.labor_cost': 'comptable',
  'comptable.staff_joined': 'comptable',
};

/** The signed notice: names the event and the document; carries no document content. */
export const noticeSchema = z
  .object({
    contract: z.literal(CONTRACT_NAME),
    version,
    eventId: z.uuid(),
    kind: z.enum(NOTICE_KINDS),
    /** The Muse Kitchen account in CompTable. */
    account: ref,
    /** What the receiver reads through the API. */
    documentRef: ref,
    occurredAt: timestamp,
  })
  .strict();
export type Notice = z.infer<typeof noticeSchema>;

/** The notices not yet handled, first delivery of each event only, in arrival order. */
export function unhandledNotices(notices: readonly Notice[], handledEventIds: ReadonlySet<string>): Notice[] {
  const seen = new Set(handledEventIds);
  const out: Notice[] = [];
  for (const n of notices) {
    if (seen.has(n.eventId)) continue;
    seen.add(n.eventId);
    out.push(n);
  }
  return out;
}

// ── Muse → CompTable: punches ───────────────────────────────────────────────

export const punchesSchema = z
  .object({
    kind: z.literal('muse.punches'),
    version,
    timeZone: z.string().min(1),
    preparedAt: timestamp,
    punches: z.array(
      z
        .object({
          punchId: ref,
          /** CompTable's employee id. No name crosses with a punch. */
          employeeRef: ref,
          kind: z.enum(['in', 'break_start', 'break_end', 'out']),
          /** The work role of the shift (Roadmap P2): payroll reads hours by role. */
          role: z.enum(['operator', 'sales']),
          punchedAt: timestamp,
          /** The kitchen-local date of the punch. */
          workDate: isoDate,
          source: z.enum(['clock', 'manual']),
          reason: z.string().max(500).nullable(),
        })
        .strict(),
    ),
    /** Punches by staff with no CompTable reference are held back and counted. */
    unmatched: z.object({ staffCount: z.number().int().nonnegative(), punchCount: z.number().int().nonnegative() }).strict(),
  })
  .strict();
export type PunchesDocument = z.infer<typeof punchesSchema>;

export function punchesDocument(
  staff: readonly StaffDoc[],
  punches: readonly PunchDoc[],
  preparedAt: string,
  timeZone: string = KITCHEN_TIME_ZONE,
): PunchesDocument {
  const refOf = new Map(staff.map((s) => [s.id, s.employeeRef]));
  const matched: PunchesDocument['punches'] = [];
  const unmatchedStaff = new Set<string>();
  let unmatchedPunches = 0;
  for (const p of [...punches].sort((a, b) => a.punchedAt.localeCompare(b.punchedAt))) {
    const employeeRef = refOf.get(p.staffId);
    if (!employeeRef) {
      unmatchedStaff.add(p.staffId);
      unmatchedPunches += 1;
      continue;
    }
    matched.push({
      punchId: p.id,
      employeeRef,
      kind: p.kind,
      role: p.role ?? 'operator',
      punchedAt: p.punchedAt,
      workDate: localDate(p.punchedAt, timeZone),
      source: p.source,
      reason: p.reason,
    });
  }
  return {
    kind: 'muse.punches',
    version: CONTRACT_VERSION,
    timeZone,
    preparedAt,
    punches: matched,
    unmatched: { staffCount: unmatchedStaff.size, punchCount: unmatchedPunches },
  };
}

// ── Muse → CompTable: staff demand (the O3 document) ────────────────────────

export const staffDemandSchema = z
  .object({
    kind: z.literal('muse.staff_demand'),
    version,
    from: isoDate,
    to: isoDate,
    preparedAt: timestamp,
    days: z.array(
      z
        .object({
          date: isoDate,
          lines: z.array(z.object({ task: z.string().min(1), station: z.string().nullable(), headcount: z.number().int().nonnegative(), hours }).strict()),
          uncoveredRecipes: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict();

// Compile-time: the O3 builder's output is this contract's document.
const _staffDemandMatches: (d: StaffDemandDocument) => z.input<typeof staffDemandSchema> = (d) => d;
void _staffDemandMatches;

// ── Muse → CompTable: labor demand per forecast version ─────────────────────

/** The forecast a labor demand was drawn from. `scenarioId` null is the plan-data defaults. */
const forecastRef = z.object({ scenarioId: ref.nullable(), savedAt: timestamp.nullable() }).strict();
export type ForecastRef = z.infer<typeof forecastRef>;

export const laborDemandSchema = z
  .object({
    kind: z.literal('muse.labor_demand'),
    version,
    forecast: forecastRef,
    preparedAt: timestamp,
    from: isoMonth,
    to: isoMonth,
    months: z.array(z.object({ month: isoMonth, lines: z.array(z.object({ task: z.string().min(1), station: z.string().nullable(), hours }).strict()) }).strict()),
  })
  .strict();

// ── CompTable → Muse: the published schedule ────────────────────────────────

export const publishedScheduleSchema = z
  .object({
    kind: z.literal('comptable.published_schedule'),
    version,
    /** CompTable publishes a week at a time; each published week is one document. */
    scheduleRef: ref,
    periodStart: isoDate,
    /** The last day of the period, inclusive. */
    periodEnd: isoDate,
    publishedAt: timestamp,
    shifts: z.array(
      z
        .object({
          shiftRef: ref,
          employeeRef: ref,
          /** Full names may be shown in Muse (Roadmap O, decision 3). */
          name: z.string().min(1),
          position: z.string().nullable(),
          startAt: timestamp,
          endAt: timestamp,
        })
        .strict()
        .refine((s) => Date.parse(s.endAt) > Date.parse(s.startAt), { message: 'a shift ends after it starts' }),
    ),
  })
  .strict()
  .refine((d) => d.periodEnd >= d.periodStart, { message: 'the period ends on or after it starts' });
export type PublishedScheduleDocument = z.infer<typeof publishedScheduleSchema>;

export interface CoverageDay {
  date: string;
  demandHours: number;
  demandPeople: number;
  scheduledHours: number;
  scheduledPeople: number;
  /** Scheduled hours less demand hours. */
  differenceHours: number;
}

/**
 * The published schedule against staff demand, by day (Roadmap O3). A shift
 * counts on the kitchen-local date it starts. Demand people is the day's peak
 * line headcount summed across tasks; scheduled people is distinct employees.
 */
export function coverageByDay(
  demand: z.input<typeof staffDemandSchema>,
  schedules: readonly PublishedScheduleDocument[],
  timeZone: string = KITCHEN_TIME_ZONE,
): CoverageDay[] {
  const scheduled = new Map<string, { minutes: number; people: Set<string> }>();
  // A week republished in CompTable supersedes the earlier publish of that week.
  const latest = new Map<string, PublishedScheduleDocument>();
  for (const s of schedules) {
    const key = `${s.periodStart}|${s.periodEnd}`;
    const prev = latest.get(key);
    if (!prev || prev.publishedAt < s.publishedAt) latest.set(key, s);
  }
  for (const s of latest.values()) {
    for (const shift of s.shifts) {
      const date = localDate(shift.startAt, timeZone);
      const day = scheduled.get(date) ?? { minutes: 0, people: new Set<string>() };
      day.minutes += (Date.parse(shift.endAt) - Date.parse(shift.startAt)) / 60_000;
      day.people.add(shift.employeeRef);
      scheduled.set(date, day);
    }
  }
  return demand.days.map((d) => {
    const demandHours = d.lines.reduce((t, l) => t + l.hours, 0);
    const demandPeople = d.lines.reduce((t, l) => t + l.headcount, 0);
    const s = scheduled.get(d.date);
    const scheduledHours = s ? s.minutes / 60 : 0;
    return {
      date: d.date,
      demandHours,
      demandPeople,
      scheduledHours,
      scheduledPeople: s ? s.people.size : 0,
      differenceHours: scheduledHours - demandHours,
    };
  });
}

// ── CompTable → Muse: a closed payroll period ───────────────────────────────

export const closedPayrollPeriodSchema = z
  .object({
    kind: z.literal('comptable.closed_payroll_period'),
    version,
    periodRef: ref,
    periodStart: isoDate,
    periodEnd: isoDate,
    payDate: isoDate,
    /** Totals by account for the whole kitchen. Never an individual's pay. */
    totals: z.object({ wagesCents: cents, payrollTaxesCents: cents, workersCompCents: cents, benefitsCents: cents }).strict(),
    hours: z.object({ regular: hours, overtime: hours }).strict(),
  })
  .strict()
  .refine((d) => d.periodEnd >= d.periodStart, { message: 'the period ends on or after it starts' })
  .refine((d) => d.payDate >= d.periodEnd, { message: 'the pay date is on or after the period end' });
export type ClosedPayrollPeriodDocument = z.infer<typeof closedPayrollPeriodSchema>;

/** The row `muse.payroll_periods` holds for a received period (O1 posts the Actual ledger from it). */
export function closedPeriodFromDocument(doc: ClosedPayrollPeriodDocument, receivedAt: string): Omit<ClosedPayrollPeriodDoc, 'id'> {
  return {
    comptableRef: doc.periodRef,
    periodStart: doc.periodStart,
    periodEnd: doc.periodEnd,
    payDate: doc.payDate,
    wagesCents: doc.totals.wagesCents,
    payrollTaxesCents: doc.totals.payrollTaxesCents,
    workersCompCents: doc.totals.workersCompCents,
    benefitsCents: doc.totals.benefitsCents,
    regularHours: doc.hours.regular,
    overtimeHours: doc.hours.overtime,
    receivedAt,
  };
}

// ── CompTable → Muse: labor cost per forecast version ───────────────────────

export const LABOR_COST_ACCOUNTS = ['wages', 'payroll_taxes', 'workers_comp', 'benefits'] as const;
export type LaborCostAccount = (typeof LABOR_COST_ACCOUNTS)[number];

export const laborCostSchema = z
  .object({
    kind: z.literal('comptable.labor_cost'),
    version,
    /** The labor demand this prices: its forecast and when it was prepared. */
    answers: z.object({ forecast: forecastRef, laborDemandPreparedAt: timestamp }).strict(),
    /** The CompTable scenario that priced it. */
    comptableScenarioRef: ref,
    pricedAt: timestamp,
    lines: z.array(z.object({ month: isoMonth, account: z.enum(LABOR_COST_ACCOUNTS), amountCents: cents }).strict()),
  })
  .strict()
  .refine((d) => new Set(d.lines.map((l) => `${l.month}|${l.account}`)).size === d.lines.length, { message: 'one line per month and account' });
export type LaborCostDocument = z.infer<typeof laborCostSchema>;

/** A labor cost reads as out of date the moment the forecast it answered is saved again. */
export function laborCostIsCurrent(doc: LaborCostDocument, forecast: ForecastRef): boolean {
  return doc.answers.forecast.scenarioId === forecast.scenarioId && doc.answers.forecast.savedAt === forecast.savedAt;
}

export function laborCostByMonth(doc: LaborCostDocument): { month: string; byAccount: Record<LaborCostAccount, number>; totalCents: number }[] {
  const months = new Map<string, Record<LaborCostAccount, number>>();
  for (const l of doc.lines) {
    const row = months.get(l.month) ?? { wages: 0, payroll_taxes: 0, workers_comp: 0, benefits: 0 };
    row[l.account] += l.amountCents;
    months.set(l.month, row);
  }
  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, byAccount]) => ({ month, byAccount, totalCents: LABOR_COST_ACCOUNTS.reduce((t, a) => t + byAccount[a], 0) }));
}

// ── CompTable → Muse: the confidential staff record (admins, read-through) ──

/** Read for an admin at request time. Never written to `muse.*`, never sent to an operator's browser. */
export const staffRecordSchema = z
  .object({
    kind: z.literal('comptable.staff_record'),
    version,
    employeeRef: ref,
    firstName: z.string(),
    lastName: z.string(),
    position: z.string(),
    employmentType: z.enum(['salaried', 'hourly_boh', 'hourly_tipped_foh', 'hourly_non_tipped_foh', 'contractor']),
    status: z.enum(['active', 'on_leave', 'terminated']),
    hireDate: isoDate.nullable(),
    termDate: isoDate.nullable(),
    flsaExemptionStatus: z.enum(['exempt', 'non_exempt']).nullable(),
    pay: z.object({ baseWageCents: cents, scheduledHoursPerWeek: hours, annualBonusCents: cents }).strict(),
    readAt: timestamp,
  })
  .strict();
export type StaffRecordDocument = z.infer<typeof staffRecordSchema>;

// ── CompTable → Muse: a person joined ───────────────────────────────────────

/**
 * The event that starts onboarding. CompTable owns HR, so a hire happens there;
 * this is how Muse hears about it.
 *
 * It carries what Muse needs to open a local record and assign the documents in
 * force, and nothing more: a reference, a display name, the role and the start
 * date. No pay, no employment classification, no personal detail — those stay
 * in the staff record an admin reads through, and this document is refused if
 * any of them appear (the schema is strict).
 *
 * `email` is the person's sign-in, which is what matches them to their own
 * record in Muse (Roadmap O5). It is optional: a person can exist on the
 * register before they have one, and they simply cannot acknowledge a document
 * until they do.
 */
export const staffJoinedSchema = z
  .object({
    kind: z.literal('comptable.staff_joined'),
    version,
    employeeRef: ref,
    name: z.string().min(1).max(200),
    role: z.string().max(200).nullable(),
    email: z.email().max(254).nullable(),
    startedOn: isoDate.nullable(),
    occurredAt: timestamp,
  })
  .strict();
export type StaffJoinedDocument = z.infer<typeof staffJoinedSchema>;

// ── Reading a document ──────────────────────────────────────────────────────

export type ReadResult<T> = { ok: true; doc: T } | { ok: false; issues: string[] };

/** Validate a received document. Unknown fields are refused, so a pay field cannot slip in. */
export function readDocument<S extends z.ZodType>(schema: S, input: unknown): ReadResult<z.infer<S>> {
  const r = schema.safeParse(input);
  return r.success
    ? { ok: true, doc: r.data }
    : { ok: false, issues: r.error.issues.map((i) => `${i.path.join('.') || '(document)'}: ${i.message}`) };
}
