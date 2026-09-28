/**
 * Cotyledon — a subscription's distributions (outline §4 Subscriber). Pure.
 *
 * Weekly and every-two-weeks subscriptions fall every seven or fourteen days from the first
 * distribution. A monthly one falls on the same weekday of the same week of each month as the
 * first (the second Saturday), so a year carries twelve; it starts in the first four weeks of a
 * month so every month has that day. A distribution on a skipped date, on or after a pause, or on
 * a farm closure carries nothing. The sow-date rules for skipping, pausing and changing the flat
 * plan are in `subscription-cutoffs.ts`.
 */

import type { Cadence, FlatPlanLine, SubscriptionDef } from '@/data/subscriptions';
import type { DateRange } from '@/engine/periods';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = day(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const daysBetween = (a: string, b: string) => Math.round((day(b).getTime() - day(a).getTime()) / 86_400_000);

/** The week of the month a date falls in: 1 for days 1–7, and so on. */
export const weekOfMonth = (date: string): number => Math.ceil(Number(date.slice(8, 10)) / 7);

/** Why a first distribution date cannot start a subscription of the cadence; null when it can. */
export function startProblem(cadence: Cadence, startDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return 'The first distribution is a date.';
  if (cadence === 'monthly' && Number(startDate.slice(8, 10)) > 28) return 'A monthly subscription starts in the first four weeks of a month, so every month has its day.';
  return null;
}

/** The day of a month that is the `n`th `weekday` of it (0 = Sunday). */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return iso(new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7)));
}

/** Every date the cadence falls on from `from` to `to`, inside the subscription's first and last dates. */
export function cadenceDates(sub: Pick<SubscriptionDef, 'cadence' | 'startDate' | 'endDate'>, from: string, to: string): string[] {
  const lo = from > sub.startDate ? from : sub.startDate;
  const hi = sub.endDate !== null && sub.endDate < to ? sub.endDate : to;
  if (lo > hi) return [];
  const out: string[] = [];
  if (sub.cadence === 'monthly') {
    const s = day(sub.startDate);
    const weekday = s.getUTCDay();
    const n = weekOfMonth(sub.startDate);
    const end = day(hi);
    for (let y = day(lo).getUTCFullYear(), m = day(lo).getUTCMonth(); y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth()); m === 11 ? ((m = 0), (y += 1)) : (m += 1)) {
      const d = nthWeekday(y, m, weekday, n);
      if (d >= lo && d <= hi) out.push(d);
    }
    return out;
  }
  const step = sub.cadence === 'weekly' ? 7 : 14;
  const behind = daysBetween(sub.startDate, lo);
  for (let d = addDays(sub.startDate, Math.ceil(behind / step) * step); d <= hi; d = addDays(d, step)) out.push(d);
  return out;
}

/** The flat plan a distribution on `date` carries: the latest version dated on or before it. */
export function flatPlanOn(sub: Pick<SubscriptionDef, 'flatPlan'>, date: string): FlatPlanLine[] {
  const v = [...sub.flatPlan].filter((x) => x.from <= date).sort((a, b) => b.from.localeCompare(a.from))[0];
  return v ? v.lines.filter((l) => l.units > 0) : [];
}

export const isPausedOn = (sub: Pick<SubscriptionDef, 'pausedFrom'>, date: string): boolean => sub.pausedFrom !== null && date >= sub.pausedFrom;

export interface SubscriptionDistribution {
  date: string;
  lines: FlatPlanLine[];
  skipped: boolean;
  paused: boolean;
  closed: boolean;
  /** Carries its flat plan: not skipped, not paused, not on a closure, with a line to carry. */
  carried: boolean;
}

/** Each date the cadence falls on in the window, and whether it carries its flat plan. */
export function subscriptionDistributions(
  sub: SubscriptionDef,
  from: string,
  to: string,
  closures: readonly DateRange[] = [],
): SubscriptionDistribution[] {
  return cadenceDates(sub, from, to).map((date) => {
    const lines = flatPlanOn(sub, date);
    const skipped = sub.skips.includes(date);
    const paused = isPausedOn(sub, date);
    const closed = closures.some((c) => date >= c.startDate && date <= c.endDate);
    return { date, lines, skipped, paused, closed, carried: !skipped && !paused && !closed && lines.length > 0 };
  });
}
