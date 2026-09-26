/**
 * MicroFarm — demand from subscribers, pickup points and services.
 *
 * Ledger-free. Nothing is automated (operating-model-roadmap decision 15): a
 * pickup point's demand is the sum over its services of the units per service in force
 * on each date the service runs — its weekdays, inside the pickup point's calendar, the
 * farm open (`_engine/services.ts`). The resolver writes the channel sums
 * onto the channel rows (`phases[].unitsPerDay`, `operatingDays`) as DERIVED
 * figures, so every consumer of those fields — allocation, the P&L, the ledger,
 * carbon — reads demand built from services, not a typed constant.
 *
 * The annual figures are read over the forecast's first year, from its start
 * date. The dated timeline itself is N4b.
 *
 * A forecast carries its own edits (`ForecastOverlay`) and never writes to the
 * subscriber record: which subscribers it includes, a service's weekdays and
 * volume picks, a subscriber's flat plan, and each unit of equipment's status and
 * in-service date. An edit replaces the record's value for that item only;
 * everything unedited follows the record (decision 16).
 */

import type { SubscriberDef, SubscriberServiceDef, SubscriberPickupPointDef, SubscriberStatus } from '@/data/subscribers';
import type { SubscriptionCycleDef } from '@/data/subscription-cycles';
import { FORECAST_FISCAL_YEAR } from '@/data/working-capital';
import type { EquipmentDateOverlay } from '@/engine/equipment';
import type { DateRange } from '@/engine/periods';
import { calendarOnFile, serviceOver, yearEndFrom } from '@/engine/services';

/** @deprecated Roadmap N4a: the pickup-point-forecast what-if is replaced by `ForecastOverlay`. Ignored on read. */
export interface SubscriberPickupPointOverlay {
  enrollment?: number;
  participationRate?: number;
  expectedUnitsPerDay?: number;
  serviceDaysPerYear?: number;
}

/** A forecast's edit on one service. */
export interface ServiceOverlay {
  weekdays?: number[];
  /** Replaces the record's picks for this forecast. */
  picks?: { effectiveDate: string; units: number }[];
}

/** What a forecast is built from, beyond the master list (Roadmap N4a). */
export interface ForecastOverlay {
  /** ISO date the forecast starts. Absent = the first day of the forecast fiscal year. */
  startDate?: string;
  /** Years the timeline runs from the start date. Absent = one. */
  horizonYears?: ForecastHorizonYears;
  /** Keyed by subscriber id. Absent = included. */
  subscribers?: Record<string, { included?: boolean }>;
  /** Keyed by service id. */
  services?: Record<string, ServiceOverlay>;
  /** Keyed by subscriber id: the forecast's own copy of the subscriber's flat plans. */
  flatPlans?: Record<string, SubscriptionCycleDef[]>;
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

export interface ResolvedServiceForecast extends SubscriberServiceDef {
  /** True when the forecast edits this service. */
  edited: boolean;
  /** Dates the service runs in the demand window. */
  serviceDates: number;
  /** Units over the demand window. */
  annualUnits: number;
}

export interface ResolvedPickupPointForecast extends Omit<SubscriberPickupPointDef, 'services'> {
  subscriberId: string;
  subscriberName: string;
  channel: number;
  /** The subscriber's real-world status: a contracted pickup point's units are sold; a prospect's or a Forecast Subscriber's are planned. */
  subscriberStatus: SubscriberStatus;
  services: ResolvedServiceForecast[];
  /** Units per service date: annual units ÷ the dates any service runs. */
  unitsPerDay: number;
  annualUnits: number;
  /** Distinct dates any of the pickup point's services runs in the demand window. */
  serviceDates: number;
  basis: ForecastBasis;
  /** False when no term is entered: the pickup point serves every service weekday and the calendar is not on file. */
  calendarOnFile: boolean;
  /** Subscriber price, or null for the channel default. */
  pricePerUnitCents: number | null;
  /** True when the forecast edits any of this pickup point's services or its subscriber's flat plan. */
  edited: boolean;
  /** The forecast's own copy of the subscriber's flat plans; null = the record's plans. */
  flatPlans: SubscriptionCycleDef[] | null;
}

export interface ChannelDemandRow {
  phase: number;
  pickupPoints: ResolvedPickupPointForecast[];
  unitsPerDay: number;
  annualUnits: number;
  /** units-weighted service days, so unitsPerDay × operatingDays = annualUnits. */
  operatingDays: number;
  subscribers: number;
  /** The contracted part of the same figures; the rest is planned volume (Roadmap N1). */
  contractedUnitsPerDay: number;
  contractedAnnualUnits: number;
  contractedSubscribers: number;
}

export interface ChannelDemand {
  byChannel: Record<number, ChannelDemandRow>;
  pickupPoints: ResolvedPickupPointForecast[];
  totalAnnualUnits: number;
  /** Of `totalAnnualUnits`, the part carried by contracted subscribers. */
  contractedAnnualUnits: number;
  /** The window the annual figures are read over. */
  window: { from: string; to: string };
}

export interface DemandOptions {
  /** Farm closures: no service runs on a closed date. */
  closures?: readonly DateRange[];
}

/** The subscribers a forecast includes: not inactive, and not excluded by the forecast. */
export function includedSubscribers(subscribers: readonly SubscriberDef[], overlay: ForecastOverlay = {}): SubscriberDef[] {
  return subscribers.filter((c) => c.status !== 'inactive' && overlay.subscribers?.[c.id]?.included !== false);
}

/** Apply the forecast's edits and compute each pickup point's demand over the forecast's first year. */
export function resolveSubscriberPickupPoints(
  subscribers: readonly SubscriberDef[],
  overlay: ForecastOverlay = {},
  opts: DemandOptions = {},
): ResolvedPickupPointForecast[] {
  const from = forecastStartOf(overlay);
  const to = yearEndFrom(from);
  const out: ResolvedPickupPointForecast[] = [];
  for (const c of includedSubscribers(subscribers, overlay)) {
    const planOverride = overlay.flatPlans?.[c.id] ?? null;
    for (const s of c.pickupPoints) {
      const services: ResolvedServiceForecast[] = (s.services ?? []).map((sv) => {
        const o = overlay.services?.[sv.id];
        const merged: SubscriberServiceDef = {
          ...sv,
          weekdays: o?.weekdays ?? sv.weekdays,
          picks: o?.picks ? o.picks.map((p, i) => ({ id: `${sv.id}-F${i}`, effectiveDate: p.effectiveDate, units: p.units, notes: null })) : sv.picks,
        };
        const active = s.status !== 'inactive';
        const w = active ? serviceOver(merged, s.calendar ?? [], from, to, opts.closures) : { serviceDates: 0, units: 0 };
        return { ...merged, edited: o !== undefined && Object.keys(o).length > 0, serviceDates: w.serviceDates, annualUnits: w.units };
      });
      const annualUnits = services.reduce((a, sv) => a + sv.annualUnits, 0);
      const serviceDates = s.status === 'inactive' ? 0 : distinctServiceDates(services, s.calendar ?? [], from, to, opts.closures);
      out.push({
        ...s,
        calendar: s.calendar ?? [],
        services,
        subscriberId: c.id,
        subscriberName: c.name,
        subscriberStatus: c.status,
        channel: c.channel,
        unitsPerDay: serviceDates > 0 ? annualUnits / serviceDates : 0,
        annualUnits,
        serviceDates,
        basis: annualUnits > 0 ? 'services' : 'none',
        calendarOnFile: calendarOnFile(s.calendar ?? []),
        pricePerUnitCents: c.pricePerUnitCents,
        edited: services.some((sv) => sv.edited) || planOverride !== null,
        flatPlans: planOverride,
      });
    }
  }
  return out;
}

/** Dates in the window on which any of the services runs. */
function distinctServiceDates(
  services: readonly ResolvedServiceForecast[],
  calendar: SubscriberPickupPointDef['calendar'],
  from: string,
  to: string,
  closures?: readonly DateRange[],
): number {
  const withVolume = services.filter((sv) => sv.annualUnits > 0);
  if (withVolume.length === 0) return 0;
  if (withVolume.length === 1) return withVolume[0].serviceDates;
  const weekdays = new Set(withVolume.flatMap((sv) => sv.weekdays));
  return serviceOver({ weekdays: [...weekdays], status: 'active', picks: [] }, calendar, from, to, closures).serviceDates;
}

export function channelDemand(
  subscribers: readonly SubscriberDef[],
  overlay: ForecastOverlay = {},
  channels: readonly number[] = [1, 2, 3],
  opts: DemandOptions = {},
): ChannelDemand {
  const pickupPoints = resolveSubscriberPickupPoints(subscribers, overlay, opts);
  const byChannel: Record<number, ChannelDemandRow> = {};
  for (const phase of channels) {
    const rows = pickupPoints.filter((s) => s.channel === phase);
    const annualUnits = rows.reduce((a, s) => a + s.annualUnits, 0);
    const contracted = rows.filter((s) => s.subscriberStatus === 'contracted');
    const contractedAnnualUnits = contracted.reduce((a, s) => a + s.annualUnits, 0);
    // Units per service date on the channel: the pickup points' per-date figures summed, which is what a day on the channel carries.
    const unitsPerDay = rows.reduce((a, s) => a + s.unitsPerDay, 0);
    const contractedUnitsPerDay = contracted.reduce((a, s) => a + s.unitsPerDay, 0);
    byChannel[phase] = {
      phase,
      pickupPoints: rows,
      unitsPerDay,
      annualUnits,
      operatingDays: unitsPerDay > 0 ? annualUnits / unitsPerDay : 0,
      subscribers: new Set(rows.map((s) => s.subscriberId)).size,
      contractedUnitsPerDay,
      contractedAnnualUnits,
      contractedSubscribers: new Set(contracted.map((s) => s.subscriberId)).size,
    };
  }
  const from = forecastStartOf(overlay);
  return {
    byChannel,
    pickupPoints,
    totalAnnualUnits: pickupPoints.reduce((a, s) => a + s.annualUnits, 0),
    contractedAnnualUnits: pickupPoints.filter((s) => s.subscriberStatus === 'contracted').reduce((a, s) => a + s.annualUnits, 0),
    window: { from, to: yearEndFrom(from) },
  };
}

/** distribution-pickup-point id → units per service date, for Pickup Points & Routes and Logistics. */
export function forecastByDistributionPickupPoint(demand: ChannelDemand): Record<string, number> {
  const m: Record<string, number> = {};
  for (const s of demand.pickupPoints) {
    if (!s.pickupPointId) continue;
    m[s.pickupPointId] = (m[s.pickupPointId] ?? 0) + s.unitsPerDay;
  }
  return m;
}
