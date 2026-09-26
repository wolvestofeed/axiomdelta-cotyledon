/**
 * MicroFarm — services, dated volume and pickup point calendars (Roadmap N4a).
 *
 * Ledger-free, database-free. Nothing here is automated: every figure is one
 * the operator entered, extended across the calendar (operating-model-roadmap
 * decision 15).
 *
 *   * A service is one loading and harvest/distribution of an order (decision 17).
 *   * Its volume is units per service from the dated pick in force: from each
 *     pick the volume carries forward until the next one; before the first
 *     pick it is zero (decision 18).
 *   * It runs on a date when the date is one of its weekdays, the pickup point's
 *     calendar takes units that day, and the farm is not closed (decision 20).
 *     A pickup point with no term entered takes units on every service weekday — its
 *     calendar is not on file, and `calendarOnFile` says so.
 */

import type { SubscriberServiceDef, PickupPointCalendarRangeDef, VolumePickDef } from '@/data/subscribers';
import { isoAddDays, weekdayOf } from '@/engine/orders';
import { isClosed, type DateRange } from '@/engine/periods';

/** Picks sorted oldest first, one per date (the later entry of a duplicate date wins). */
export function normalizePicks(picks: readonly Pick<VolumePickDef, 'effectiveDate' | 'units'>[]): { effectiveDate: string; units: number }[] {
  const byDate = new Map<string, number>();
  for (const p of picks) byDate.set(p.effectiveDate, Math.max(0, p.units));
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([effectiveDate, units]) => ({ effectiveDate, units }));
}

/** Units per service in force on a date: the latest pick on or before it, else zero. */
export function volumeOn(picks: readonly Pick<VolumePickDef, 'effectiveDate' | 'units'>[], date: string): number {
  let units = 0;
  let at = '';
  for (const p of picks) {
    if (p.effectiveDate <= date && p.effectiveDate >= at) {
      at = p.effectiveDate;
      units = Math.max(0, p.units);
    }
  }
  return units;
}

/** True when the pickup point has at least one term entered. */
export const calendarOnFile = (calendar: readonly PickupPointCalendarRangeDef[]): boolean => calendar.some((r) => r.kind === 'term');

/** Whether the pickup point's calendar takes units on a date: inside a term and outside every break; every date when no term is on file. */
export function pickupPointTakesUnitsOn(calendar: readonly PickupPointCalendarRangeDef[], date: string): boolean {
  if (calendar.some((r) => r.kind === 'break' && r.startDate <= date && date <= r.endDate)) return false;
  if (!calendarOnFile(calendar)) return true;
  return calendar.some((r) => r.kind === 'term' && r.startDate <= date && date <= r.endDate);
}

/** Whether a service runs on a date. */
export function serviceRunsOn(
  service: Pick<SubscriberServiceDef, 'weekdays' | 'status'>,
  calendar: readonly PickupPointCalendarRangeDef[],
  date: string,
  closures?: readonly DateRange[],
): boolean {
  if (service.status !== 'active') return false;
  if (!service.weekdays.includes(weekdayOf(date))) return false;
  if (isClosed(date, closures)) return false;
  return pickupPointTakesUnitsOn(calendar, date);
}

export interface ServiceWindow {
  /** Dates in the window the service runs. */
  serviceDates: number;
  /** Units over the window: the pick in force on each service date. */
  units: number;
}

/** A service over [from, to] inclusive. */
export function serviceOver(
  service: Pick<SubscriberServiceDef, 'weekdays' | 'status' | 'picks'>,
  calendar: readonly PickupPointCalendarRangeDef[],
  from: string,
  to: string,
  closures?: readonly DateRange[],
): ServiceWindow {
  let serviceDates = 0;
  let units = 0;
  const picks = normalizePicks(service.picks);
  for (let d = from; d <= to; d = isoAddDays(d, 1)) {
    if (!serviceRunsOn(service, calendar, d, closures)) continue;
    serviceDates++;
    units += volumeOn(picks, d);
  }
  return { serviceDates, units };
}

/** The last day of a one-year window starting on `start`. */
export const yearEndFrom = (start: string): string => isoAddDays(`${Number(start.slice(0, 4)) + 1}${start.slice(4)}`, -1);
