/**
 * Impact OS — demand from customers, sites and services.
 *
 * Ledger-free. Nothing is automated (operating-model-roadmap decision 15): a
 * site's demand is the sum over its services of the meals per service in force
 * on each date the service runs — its weekdays, inside the site's calendar, the
 * kitchen open (`_engine/services.ts`). The resolver writes the channel sums
 * onto the channel rows (`phases[].mealsPerDay`, `operatingDays`) as DERIVED
 * figures, so every consumer of those fields — allocation, the P&L, the ledger,
 * carbon — reads demand built from services, not a typed constant.
 *
 * The annual figures are read over the forecast's first year, from its start
 * date. The dated timeline itself is N4b.
 *
 * A forecast carries its own edits (`ForecastOverlay`) and never writes to the
 * customer record: which customers it includes, a service's weekdays and
 * volume picks, a customer's meal plan, and each unit of equipment's status and
 * in-service date. An edit replaces the record's value for that item only;
 * everything unedited follows the record (decision 16).
 */

import type { CustomerDef, CustomerServiceDef, CustomerSiteDef, CustomerStatus } from '../_data/customers';
import type { MenuCycleDef } from '../_data/menu-cycles';
import { FORECAST_FISCAL_YEAR } from '../_data/working-capital';
import type { EquipmentDateOverlay } from './equipment';
import type { DateRange } from './periods';
import { calendarOnFile, serviceOver, yearEndFrom } from './services';

/** @deprecated Roadmap N4a: the site-forecast what-if is replaced by `ForecastOverlay`. Ignored on read. */
export interface CustomerSiteOverlay {
  enrollment?: number;
  participationRate?: number;
  expectedMealsPerDay?: number;
  serviceDaysPerYear?: number;
}

/** A forecast's edit on one service. */
export interface ServiceOverlay {
  weekdays?: number[];
  /** Replaces the record's picks for this forecast. */
  picks?: { effectiveDate: string; meals: number }[];
}

/** What a forecast is built from, beyond the master list (Roadmap N4a). */
export interface ForecastOverlay {
  /** ISO date the forecast starts. Absent = the first day of the forecast fiscal year. */
  startDate?: string;
  /** Years the timeline runs from the start date (Robert, 2026-09-16). Absent = one. */
  horizonYears?: ForecastHorizonYears;
  /** Keyed by customer id. Absent = included. */
  customers?: Record<string, { included?: boolean }>;
  /** Keyed by service id. */
  services?: Record<string, ServiceOverlay>;
  /** Keyed by customer id: the forecast's own copy of the customer's meal plans. */
  mealPlans?: Record<string, MenuCycleDef[]>;
  /** Keyed by equipment library key. */
  equipment?: Record<string, EquipmentDateOverlay>;
}

export type ForecastHorizonYears = 1 | 2 | 3;
export const FORECAST_HORIZON_OPTIONS: readonly ForecastHorizonYears[] = [1, 2, 3];
/** The timeline's length: one year unless the forecast expands it to two or three. */
export const forecastHorizonOf = (o: ForecastOverlay | undefined): ForecastHorizonYears =>
  o?.horizonYears === 2 || o?.horizonYears === 3 ? o.horizonYears : 1;

export const defaultForecastStart = (): string => `${FORECAST_FISCAL_YEAR}-01-01`;
export const forecastStartOf = (o: ForecastOverlay | undefined): string => o?.startDate ?? defaultForecastStart();

export type ForecastBasis = 'services' | 'none';

export interface ResolvedServiceForecast extends CustomerServiceDef {
  /** True when the forecast edits this service. */
  edited: boolean;
  /** Dates the service runs in the demand window. */
  serviceDates: number;
  /** Meals over the demand window. */
  annualMeals: number;
}

export interface ResolvedSiteForecast extends Omit<CustomerSiteDef, 'services'> {
  customerId: string;
  customerName: string;
  channel: number;
  /** The customer's real-world status: a contracted site's meals are sold; a prospect's or a Forecast Customer's are planned. */
  customerStatus: CustomerStatus;
  services: ResolvedServiceForecast[];
  /** Meals per service date: annual meals ÷ the dates any service runs. */
  mealsPerDay: number;
  annualMeals: number;
  /** Distinct dates any of the site's services runs in the demand window. */
  serviceDates: number;
  basis: ForecastBasis;
  /** False when no term is entered: the site serves every service weekday and the calendar is not on file. */
  calendarOnFile: boolean;
  /** Customer price, or null for the channel default. */
  pricePerMealCents: number | null;
  /** True when the forecast edits any of this site's services or its customer's meal plan. */
  edited: boolean;
  /** The forecast's own copy of the customer's meal plans; null = the record's plans. */
  mealPlans: MenuCycleDef[] | null;
}

export interface ChannelDemandRow {
  phase: number;
  sites: ResolvedSiteForecast[];
  mealsPerDay: number;
  annualMeals: number;
  /** Meals-weighted service days, so mealsPerDay × operatingDays = annualMeals. */
  operatingDays: number;
  customers: number;
  /** The contracted part of the same figures; the rest is planned volume (Roadmap N1). */
  contractedMealsPerDay: number;
  contractedAnnualMeals: number;
  contractedCustomers: number;
}

export interface ChannelDemand {
  byChannel: Record<number, ChannelDemandRow>;
  sites: ResolvedSiteForecast[];
  totalAnnualMeals: number;
  /** Of `totalAnnualMeals`, the part carried by contracted customers. */
  contractedAnnualMeals: number;
  /** The window the annual figures are read over. */
  window: { from: string; to: string };
}

export interface DemandOptions {
  /** Kitchen closures: no service runs on a closed date. */
  closures?: readonly DateRange[];
}

/** The customers a forecast includes: not inactive, and not excluded by the forecast. */
export function includedCustomers(customers: readonly CustomerDef[], overlay: ForecastOverlay = {}): CustomerDef[] {
  return customers.filter((c) => c.status !== 'inactive' && overlay.customers?.[c.id]?.included !== false);
}

/** Apply the forecast's edits and compute each site's demand over the forecast's first year. */
export function resolveCustomerSites(
  customers: readonly CustomerDef[],
  overlay: ForecastOverlay = {},
  opts: DemandOptions = {},
): ResolvedSiteForecast[] {
  const from = forecastStartOf(overlay);
  const to = yearEndFrom(from);
  const out: ResolvedSiteForecast[] = [];
  for (const c of includedCustomers(customers, overlay)) {
    const planOverride = overlay.mealPlans?.[c.id] ?? null;
    for (const s of c.sites) {
      const services: ResolvedServiceForecast[] = (s.services ?? []).map((sv) => {
        const o = overlay.services?.[sv.id];
        const merged: CustomerServiceDef = {
          ...sv,
          weekdays: o?.weekdays ?? sv.weekdays,
          picks: o?.picks ? o.picks.map((p, i) => ({ id: `${sv.id}-F${i}`, effectiveDate: p.effectiveDate, meals: p.meals, notes: null })) : sv.picks,
        };
        const active = s.status !== 'inactive';
        const w = active ? serviceOver(merged, s.calendar ?? [], from, to, opts.closures) : { serviceDates: 0, meals: 0 };
        return { ...merged, edited: o !== undefined && Object.keys(o).length > 0, serviceDates: w.serviceDates, annualMeals: w.meals };
      });
      const annualMeals = services.reduce((a, sv) => a + sv.annualMeals, 0);
      const serviceDates = s.status === 'inactive' ? 0 : distinctServiceDates(services, s.calendar ?? [], from, to, opts.closures);
      out.push({
        ...s,
        calendar: s.calendar ?? [],
        services,
        customerId: c.id,
        customerName: c.name,
        customerStatus: c.status,
        channel: c.channel,
        mealsPerDay: serviceDates > 0 ? annualMeals / serviceDates : 0,
        annualMeals,
        serviceDates,
        basis: annualMeals > 0 ? 'services' : 'none',
        calendarOnFile: calendarOnFile(s.calendar ?? []),
        pricePerMealCents: c.pricePerMealCents,
        edited: services.some((sv) => sv.edited) || planOverride !== null,
        mealPlans: planOverride,
      });
    }
  }
  return out;
}

/** Dates in the window on which any of the services runs. */
function distinctServiceDates(
  services: readonly ResolvedServiceForecast[],
  calendar: CustomerSiteDef['calendar'],
  from: string,
  to: string,
  closures?: readonly DateRange[],
): number {
  const withVolume = services.filter((sv) => sv.annualMeals > 0);
  if (withVolume.length === 0) return 0;
  if (withVolume.length === 1) return withVolume[0].serviceDates;
  const weekdays = new Set(withVolume.flatMap((sv) => sv.weekdays));
  return serviceOver({ weekdays: [...weekdays], status: 'active', picks: [] }, calendar, from, to, closures).serviceDates;
}

export function channelDemand(
  customers: readonly CustomerDef[],
  overlay: ForecastOverlay = {},
  channels: readonly number[] = [1, 2, 3],
  opts: DemandOptions = {},
): ChannelDemand {
  const sites = resolveCustomerSites(customers, overlay, opts);
  const byChannel: Record<number, ChannelDemandRow> = {};
  for (const phase of channels) {
    const rows = sites.filter((s) => s.channel === phase);
    const annualMeals = rows.reduce((a, s) => a + s.annualMeals, 0);
    const contracted = rows.filter((s) => s.customerStatus === 'contracted');
    const contractedAnnualMeals = contracted.reduce((a, s) => a + s.annualMeals, 0);
    // Meals per service date on the channel: the sites' per-date figures summed, which is what a day on the channel carries.
    const mealsPerDay = rows.reduce((a, s) => a + s.mealsPerDay, 0);
    const contractedMealsPerDay = contracted.reduce((a, s) => a + s.mealsPerDay, 0);
    byChannel[phase] = {
      phase,
      sites: rows,
      mealsPerDay,
      annualMeals,
      operatingDays: mealsPerDay > 0 ? annualMeals / mealsPerDay : 0,
      customers: new Set(rows.map((s) => s.customerId)).size,
      contractedMealsPerDay,
      contractedAnnualMeals,
      contractedCustomers: new Set(contracted.map((s) => s.customerId)).size,
    };
  }
  const from = forecastStartOf(overlay);
  return {
    byChannel,
    sites,
    totalAnnualMeals: sites.reduce((a, s) => a + s.annualMeals, 0),
    contractedAnnualMeals: sites.filter((s) => s.customerStatus === 'contracted').reduce((a, s) => a + s.annualMeals, 0),
    window: { from, to: yearEndFrom(from) },
  };
}

/** Delivery-site id → meals per service date, for Sites & Delivery and Logistics. */
export function forecastByDeliverySite(demand: ChannelDemand): Record<string, number> {
  const m: Record<string, number> = {};
  for (const s of demand.sites) {
    if (!s.siteId) continue;
    m[s.siteId] = (m[s.siteId] ?? 0) + s.mealsPerDay;
  }
  return m;
}
