/**
 * Impact OS — services, dated volume and site calendars (Roadmap N4a).
 *
 * Ledger-free, database-free. Nothing here is automated: every figure is one
 * the operator entered, extended across the calendar (operating-model-roadmap
 * decision 15).
 *
 *   * A service is one loading and dispatch/delivery of an order (decision 17).
 *   * Its volume is meals per service from the dated pick in force: from each
 *     pick the volume carries forward until the next one; before the first
 *     pick it is zero (decision 18).
 *   * It runs on a date when the date is one of its weekdays, the site's
 *     calendar takes meals that day, and the kitchen is not closed (decision 20).
 *     A site with no term entered takes meals on every service weekday — its
 *     calendar is not on file, and `calendarOnFile` says so.
 */

import type { CustomerServiceDef, SiteCalendarRangeDef, VolumePickDef } from '../_data/customers';
import { isoAddDays, weekdayOf } from './orders';
import { isClosed, type DateRange } from './periods';

/** Picks sorted oldest first, one per date (the later entry of a duplicate date wins). */
export function normalizePicks(picks: readonly Pick<VolumePickDef, 'effectiveDate' | 'meals'>[]): { effectiveDate: string; meals: number }[] {
  const byDate = new Map<string, number>();
  for (const p of picks) byDate.set(p.effectiveDate, Math.max(0, p.meals));
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([effectiveDate, meals]) => ({ effectiveDate, meals }));
}

/** Meals per service in force on a date: the latest pick on or before it, else zero. */
export function volumeOn(picks: readonly Pick<VolumePickDef, 'effectiveDate' | 'meals'>[], date: string): number {
  let meals = 0;
  let at = '';
  for (const p of picks) {
    if (p.effectiveDate <= date && p.effectiveDate >= at) {
      at = p.effectiveDate;
      meals = Math.max(0, p.meals);
    }
  }
  return meals;
}

/** True when the site has at least one term entered. */
export const calendarOnFile = (calendar: readonly SiteCalendarRangeDef[]): boolean => calendar.some((r) => r.kind === 'term');

/** Whether the site's calendar takes meals on a date: inside a term and outside every break; every date when no term is on file. */
export function siteTakesMealsOn(calendar: readonly SiteCalendarRangeDef[], date: string): boolean {
  if (calendar.some((r) => r.kind === 'break' && r.startDate <= date && date <= r.endDate)) return false;
  if (!calendarOnFile(calendar)) return true;
  return calendar.some((r) => r.kind === 'term' && r.startDate <= date && date <= r.endDate);
}

/** Whether a service runs on a date. */
export function serviceRunsOn(
  service: Pick<CustomerServiceDef, 'weekdays' | 'status'>,
  calendar: readonly SiteCalendarRangeDef[],
  date: string,
  closures?: readonly DateRange[],
): boolean {
  if (service.status !== 'active') return false;
  if (!service.weekdays.includes(weekdayOf(date))) return false;
  if (isClosed(date, closures)) return false;
  return siteTakesMealsOn(calendar, date);
}

export interface ServiceWindow {
  /** Dates in the window the service runs. */
  serviceDates: number;
  /** Meals over the window: the pick in force on each service date. */
  meals: number;
}

/** A service over [from, to] inclusive. */
export function serviceOver(
  service: Pick<CustomerServiceDef, 'weekdays' | 'status' | 'picks'>,
  calendar: readonly SiteCalendarRangeDef[],
  from: string,
  to: string,
  closures?: readonly DateRange[],
): ServiceWindow {
  let serviceDates = 0;
  let meals = 0;
  const picks = normalizePicks(service.picks);
  for (let d = from; d <= to; d = isoAddDays(d, 1)) {
    if (!serviceRunsOn(service, calendar, d, closures)) continue;
    serviceDates++;
    meals += volumeOn(picks, d);
  }
  return { serviceDates, meals };
}

/** The last day of a one-year window starting on `start`. */
export const yearEndFrom = (start: string): string => isoAddDays(`${Number(start.slice(0, 4)) + 1}${start.slice(4)}`, -1);
