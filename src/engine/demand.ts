/**
 * Cotyledon — demand from subscribers and their subscriptions.
 *
 * Ledger-free. A pickup point's demand is the units each of its subscriptions carries on each
 * distribution date the cadence falls on, the farm open. The resolver writes the channel sums
 * onto the channel rows (`phases[].unitsPerDay`, `operatingDays`) as DERIVED figures, so every
 * consumer of those fields (the P&L, the ledger, carbon) reads demand built from subscriptions,
 * not a typed constant.
 *
 * The annual figures are read over the forecast's first year, from its start date.
 *
 * A forecast carries its own edits (`ForecastOverlay`) and never writes to the subscriber
 * record: which subscribers it includes, and each unit of equipment's status and in-service date.
 */

import { recordsActuals, type SubscriberDef, type SubscriberPickupPointDef, type SubscriberStatus } from '@/data/subscribers';
import { FORECAST_FISCAL_YEAR } from '@/data/working-capital';
import type { EquipmentDateOverlay } from '@/engine/equipment';
import { isoAddDays } from '@/engine/orders';
import type { DateRange } from '@/engine/periods';
import { subscriptionDistributions } from '@/engine/subscriptions';

/** What a forecast is built from, beyond the master list. */
export interface ForecastOverlay {
  /** ISO date the forecast starts. Absent = the first day of the forecast fiscal year. */
  startDate?: string;
  /** Years the timeline runs from the start date. Absent = one. */
  horizonYears?: ForecastHorizonYears;
  /** Keyed by subscriber id. Absent = included. */
  subscribers?: Record<string, { included?: boolean }>;
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

/** The last day of a one-year window starting on `start`. */
export const yearEndFrom = (start: string): string => isoAddDays(`${Number(start.slice(0, 4)) + 1}${start.slice(4)}`, -1);

export interface ResolvedPickupPointForecast extends SubscriberPickupPointDef {
  subscriberId: string;
  subscriberName: string;
  channel: number;
  /** The subscriber's real-world status: a contracted pickup point's units are sold; a prospect's or a Forecast Subscriber's are planned. */
  subscriberStatus: SubscriberStatus;
  /** Units per distribution date: annual units ÷ the dates any subscription carries. */
  unitsPerDay: number;
  annualUnits: number;
  /** Distinct dates any of the pickup point's subscriptions carries a distribution in the demand window. */
  serviceDates: number;
  /** Subscriber price, or null for the channel default. */
  pricePerUnitCents: number | null;
}

export interface ChannelDemandRow {
  phase: number;
  pickupPoints: ResolvedPickupPointForecast[];
  unitsPerDay: number;
  annualUnits: number;
  /** units-weighted distribution dates, so unitsPerDay × operatingDays = annualUnits. */
  operatingDays: number;
  subscribers: number;
  /** The contracted part of the same figures; the rest is planned volume. */
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
  /** Farm closures: no distribution falls on a closed date. */
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
    for (const s of c.pickupPoints) {
      // Each subscription at the pickup point adds the units of each distribution it carries in the window.
      const carried = s.status === 'inactive'
        ? []
        : (c.subscriptions ?? [])
            .filter((x) => x.subscriberPickupPointId === s.id)
            .flatMap((x) => subscriptionDistributions(x, from, to, opts.closures).filter((d) => d.carried))
            .map((d) => ({ date: d.date, units: d.lines.reduce((t, l) => t + l.units, 0) }));
      const annualUnits = carried.reduce((t, d) => t + d.units, 0);
      const serviceDates = new Set(carried.map((d) => d.date)).size;
      out.push({
        ...s,
        subscriberId: c.id,
        subscriberName: c.name,
        subscriberStatus: c.status,
        channel: c.channel,
        unitsPerDay: serviceDates > 0 ? annualUnits / serviceDates : 0,
        annualUnits,
        serviceDates,
        pricePerUnitCents: c.pricePerUnitCents,
      });
    }
  }
  return out;
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
    // Units per distribution date on the channel: the pickup points' per-date figures summed, which is what a day on the channel carries.
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

/**
 * The pickup points of the real farm, for Actual: the subscribers on record with no forecast edit,
 * a Forecast Subscriber never among them. A subscription's orders are derived only at a pickup
 * point on this list.
 */
export function recordPickupPoints(subscribers: readonly SubscriberDef[], opts: DemandOptions = {}): ResolvedPickupPointForecast[] {
  return resolveSubscriberPickupPoints(subscribers.filter((c) => recordsActuals(c.status)), {}, opts);
}

/** distribution-pickup-point id → units per distribution date, for Pickup Points & Routes and Logistics. */
export function forecastByDistributionPickupPoint(demand: ChannelDemand): Record<string, number> {
  const m: Record<string, number> = {};
  for (const s of demand.pickupPoints) {
    if (!s.pickupPointId) continue;
    m[s.pickupPointId] = (m[s.pickupPointId] ?? 0) + s.unitsPerDay;
  }
  return m;
}
