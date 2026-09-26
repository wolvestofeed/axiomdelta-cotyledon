/**
 * MicroFarm — fiscal periods, the production calendar and the
 * posting trail (Roadmap J1, J3, J4). Pure: no database, no React.
 *
 * Periods are calendar months and the fiscal year is the calendar year
 *. A period is open unless a row says it is locked; a
 * locked period refuses every posting dated inside it. The production
 * calendar is the service weekdays less the dated closures — major holidays;
 * the farm runs year-round. The posting trail is a hash chain: each entry's hash
 * covers the previous entry's hash and its own canonical fields, so a change
 * or a removal anywhere breaks verification from that entry on.
 */

import { isoAddDays, weekdayOf } from './orders';
import { periodEnd, periodStart, periodOf } from './actuals';
import { FORECAST_FISCAL_YEAR } from '../_data/working-capital';

export type PeriodStatus = 'open' | 'locked';

export interface FiscalPeriod {
  period: string;
  status: PeriodStatus;
  lockedAt: string | null;
  lockedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  notes: string | null;
}

export type ClosureKind = 'holiday' | 'closure';
export const CLOSURE_KIND_LABELS: Record<ClosureKind, string> = { holiday: 'Holiday', closure: 'Closure' };

export interface CalendarClosure {
  id: string;
  label: string;
  kind: ClosureKind;
  /** ISO dates, inclusive. */
  startDate: string;
  endDate: string;
  notes: string | null;
}

export type DateRange = Pick<CalendarClosure, 'startDate' | 'endDate'>;

export const DEFAULT_PRODUCTION_WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5];

export const fiscalYearOf = (period: string): number => Number(period.slice(0, 4));

/** The twelve YYYY-MM periods of a calendar year. */
export const periodsOfYear = (year: number): string[] => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

/** The closure a date falls inside, if any. */
export function closureOn<T extends DateRange>(date: string, closures: readonly T[] | undefined): T | null {
  if (!closures) return null;
  return closures.find((c) => c.startDate <= date && date <= c.endDate) ?? null;
}

export const isClosed = (date: string, closures: readonly DateRange[] | undefined): boolean => closureOn(date, closures) !== null;

/** A production day: a service weekday not inside a closure. */
export function isProductionDay(date: string, closures: readonly DateRange[] | undefined, weekdays: readonly number[] = DEFAULT_PRODUCTION_WEEKDAYS): boolean {
  return weekdays.includes(weekdayOf(date)) && !isClosed(date, closures);
}

export interface ProductionDays {
  period: string;
  /** Production days in the period. */
  days: string[];
  /** Service weekdays in the period that a closure took out. */
  closed: string[];
}

/** The production days of a period, and the weekdays a closure removed. */
export function productionDaysIn(period: string, closures: readonly DateRange[] | undefined, weekdays: readonly number[] = DEFAULT_PRODUCTION_WEEKDAYS): ProductionDays {
  const days: string[] = [];
  const closed: string[] = [];
  const end = periodEnd(period);
  for (let d = periodStart(period); d <= end; d = isoAddDays(d, 1)) {
    if (!weekdays.includes(weekdayOf(d))) continue;
    if (isClosed(d, closures)) closed.push(d);
    else days.push(d);
  }
  return { period, days, closed };
}

/**
 * The year the annual plan is drawn on (the fiscal year of the annual
 * statements): the year the loans start.
 */
export const PLAN_YEAR = FORECAST_FISCAL_YEAR;

/**
 * Production days in a calendar year: the production weekdays less the dated
 * closures. This is the count annual plant capacity multiplies the daily
 * ceiling by — one calendar, not a typed day count beside it.
 */
export function productionDaysInYear(year: number, closures: readonly DateRange[] | undefined, weekdays: readonly number[] = DEFAULT_PRODUCTION_WEEKDAYS): number {
  return periodsOfYear(year).reduce((s, p) => s + productionDaysIn(p, closures, weekdays).days.length, 0);
}

// ── Lock ────────────────────────────────────────────────────────────────────

export function periodRow(period: string, periods: readonly FiscalPeriod[]): FiscalPeriod | null {
  return periods.find((p) => p.period === period) ?? null;
}

export function periodStatusOf(period: string, periods: readonly FiscalPeriod[]): PeriodStatus {
  return periodRow(period, periods)?.status ?? 'open';
}

/**
 * Why a posting dated `date` is refused, or null when the period is open. The
 * message states the fact and who can change it; it does not say what to do.
 */
export function postingRefusal(date: string, periods: readonly FiscalPeriod[]): string | null {
  const period = periodOf(date);
  const row = periodRow(period, periods);
  if (!row || row.status !== 'locked') return null;
  const by = row.lockedBy ? ` by ${row.lockedBy}` : '';
  const on = row.lockedAt ? ` on ${row.lockedAt.slice(0, 10)}` : '';
  return `Period ${period} is locked${by}${on}. Nothing posts into a locked period; a super admin can reopen it.`;
}

// ── The posting trail ───────────────────────────────────────────────────────

export type PostingAction =
  | 'record_sowing'
  | 'record_receipt'
  | 'record_distribution'
  | 'record_bill'
  | 'delete_record'
  | 'lock_period'
  | 'reopen_period'
  | 'add_closure'
  | 'remove_closure'
  | 'approve_standard'
  | 'record_opening_balance'
  | 'complete_route'
  | 'issue_invoice'
  | 'record_subscriber_payment'
  | 'record_supplier_bill'
  | 'record_supplier_payment'
  | 'set_payment_terms'
  | 'record_punch'
  | 'adopt_time_study'
  | 'record_sustainability'
  | 'set_plan_of_record';

export const POSTING_ACTION_LABELS: Record<PostingAction, string> = {
  record_opening_balance: 'Opening balance recorded',
  complete_route: 'Route completed — added to invoices',
  issue_invoice: 'Invoice issued',
  record_subscriber_payment: 'Subscriber payment recorded',
  record_supplier_bill: 'Supplier bill recorded',
  record_supplier_payment: 'Supplier payment recorded',
  set_payment_terms: 'Payment terms set',
  record_punch: 'Time punch typed or removed',
  record_sustainability: 'Utility, lab or refrigerant service record entered or removed',
  set_plan_of_record: 'Plan of record set',
  record_sowing: 'Sowing record closed',
  record_receipt: 'Receipt recorded',
  record_distribution: 'Distribution recorded',
  record_bill: 'Period bill recorded',
  delete_record: 'Record removed',
  lock_period: 'Period locked',
  reopen_period: 'Period reopened',
  add_closure: 'Calendar closure added',
  remove_closure: 'Calendar closure removed',
  approve_standard: 'Standard approved',
  adopt_time_study: 'Time study adopted as the labor standard',
};

/** The fields the hash covers. `seq` is assigned by the database and is not hashed; order is proved by `prevHash`. */
export interface PostingFields {
  occurredAt: string;
  actorUserId: string;
  actorEmail: string | null;
  action: PostingAction;
  recordKind: string;
  recordId: string;
  period: string;
  detail: Record<string, unknown>;
}

export interface PostingEntry extends PostingFields {
  seq: number;
  prevHash: string;
  hash: string;
}

export const GENESIS_HASH = '0'.repeat(64);

/** JSON with keys sorted at every level, so the same fields always hash the same. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

export function canonicalPosting(f: PostingFields): string {
  return stableStringify({
    occurredAt: f.occurredAt,
    actorUserId: f.actorUserId,
    actorEmail: f.actorEmail,
    action: f.action,
    recordKind: f.recordKind,
    recordId: f.recordId,
    period: f.period,
    detail: f.detail,
  });
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The hash of an entry: SHA-256 over the previous hash, a newline, and the canonical fields. */
export function postingHash(prevHash: string, fields: PostingFields): Promise<string> {
  return sha256Hex(`${prevHash}\n${canonicalPosting(fields)}`);
}

export interface ChainVerification {
  ok: boolean;
  length: number;
  /** The seq of the first entry whose hash does not verify, or whose prevHash is not its predecessor's hash. */
  brokenAt: number | null;
}

/** Walk the trail in seq order and recompute every hash. */
export async function verifyPostingChain(entries: readonly PostingEntry[]): Promise<ChainVerification> {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS_HASH;
  for (const e of sorted) {
    if (e.prevHash !== prev) return { ok: false, length: sorted.length, brokenAt: e.seq };
    const expected = await postingHash(e.prevHash, e);
    if (expected !== e.hash) return { ok: false, length: sorted.length, brokenAt: e.seq };
    prev = e.hash;
  }
  return { ok: true, length: sorted.length, brokenAt: null };
}
