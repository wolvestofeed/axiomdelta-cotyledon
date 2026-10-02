/**
 * Cotyledon — sustainability records on Actual (Roadmap N6 slice 4, migration 0072).
 * A utility bill is a reading; refrigerant added at service is a service record. Actual folds them into the same activity shapes the
 * scenario carries for Plan, over the reporting year, so one set of engine
 * functions computes both. Nothing derived is stored.
 */

import { ENERGY_DEFAULTS, WATER_DEFAULTS, type EnergyActivity, type ServiceAdd, type WaterActivity } from '@/engine/scenario';

export type ReadingMetric =
  | 'electricity_kwh'
  | 'electricity_renewable_kwh'
  | 'natural_gas_therms'
  | 'propane_gal'
  | 'fleet_gasoline_gal'
  | 'fleet_diesel_gal'
  | 'water_metered_gal'
  | 'wastewater_billed_mgal';

/**
 * How a metric folds over a year: a flow sums the bills; a result reads the latest
 * on or before the year's end; an event is a dated occurrence with no quantity.
 */
export const READING_METRICS: Record<ReadingMetric, { group: 'energy' | 'water'; label: string; unit: string; fold: 'flow' | 'latest' | 'event'; document: string }> = {
  electricity_kwh: { group: 'energy', label: 'Electricity', unit: 'kWh', fold: 'flow', document: 'Electric invoice' },
  electricity_renewable_kwh: { group: 'energy', label: 'Electricity under renewable supply', unit: 'kWh', fold: 'flow', document: 'Renewable programme statement or certificates' },
  natural_gas_therms: { group: 'energy', label: 'Natural gas', unit: 'therms', fold: 'flow', document: 'Gas invoice' },
  propane_gal: { group: 'energy', label: 'Propane (liquid)', unit: 'gal', fold: 'flow', document: 'Distribution ticket' },
  fleet_gasoline_gal: { group: 'energy', label: 'Fleet gasoline', unit: 'gal', fold: 'flow', document: 'Fuel log or card statement' },
  fleet_diesel_gal: { group: 'energy', label: 'Fleet diesel', unit: 'gal', fold: 'flow', document: 'Fuel log or card statement' },
  water_metered_gal: { group: 'water', label: 'Metered water', unit: 'gal', fold: 'flow', document: 'Water invoice' },
  wastewater_billed_mgal: { group: 'water', label: 'Billed wastewater volume', unit: 'million gal', fold: 'flow', document: 'Wastewater invoice' },
};

export const READING_METRIC_KEYS = Object.keys(READING_METRICS) as ReadingMetric[];

export interface ReadingDoc {
  id: string;
  metric: ReadingMetric;
  periodStart: string | null;
  readOn: string;
  quantity: number | null;
  sourceId: string | null;
  notes: string | null;
  recordedBy: string | null;
}

export interface RefrigerantServiceDoc {
  id: string;
  equipmentKey: string;
  servicedOn: string;
  lbAdded: number;
  sourceId: string | null;
  technician: string | null;
  notes: string | null;
  recordedBy: string | null;
}

export interface SustainabilityRecords {
  year: number;
  readings: ReadingDoc[];
  refrigerantService: RefrigerantServiceDoc[];
}

const inYear = (d: string, year: number) => d.startsWith(`${year}-`);
const inWindow = (d: string, from: string, to: string) => d >= from && d <= to;

/** A flow metric summed over the bills whose period ends inside a window (Plan v Actual reads a month). */
export function flowInWindow(readings: readonly ReadingDoc[], metric: ReadingMetric, from: string, to: string): number {
  return readings.filter((r) => r.metric === metric && inWindow(r.readOn, from, to)).reduce((s, r) => s + (r.quantity ?? 0), 0);
}

/** Energy from the bills whose period ends inside a window. */
export function energyInWindow(readings: readonly ReadingDoc[], from: string, to: string): EnergyActivity {
  const kwh = flowInWindow(readings, 'electricity_kwh', from, to);
  const renewable = flowInWindow(readings, 'electricity_renewable_kwh', from, to);
  return {
    ...ENERGY_DEFAULTS,
    naturalGasTherms: flowInWindow(readings, 'natural_gas_therms', from, to),
    propaneGal: flowInWindow(readings, 'propane_gal', from, to),
    fleetGasolineGal: flowInWindow(readings, 'fleet_gasoline_gal', from, to),
    fleetDieselGal: flowInWindow(readings, 'fleet_diesel_gal', from, to),
    electricityKwh: kwh,
    renewableShare: kwh > 0 ? Math.min(1, renewable / kwh) : 0,
  };
}

function flow(readings: readonly ReadingDoc[], metric: ReadingMetric, year: number): number {
  return readings.filter((r) => r.metric === metric && inYear(r.readOn, year)).reduce((s, r) => s + (r.quantity ?? 0), 0);
}

/** The year's energy from the bills: flows summed; renewable share = renewable kWh ÷ kWh. */
export function energyFromReadings(readings: readonly ReadingDoc[], year: number): EnergyActivity {
  return energyInWindow(readings, `${year}-01-01`, `${year}-12-31`);
}

/** Months in the year with a bill for the metric: the divisor for a monthly figure. */
function monthsBilled(readings: readonly ReadingDoc[], metric: ReadingMetric, year: number): number {
  return new Set(readings.filter((r) => r.metric === metric && inYear(r.readOn, year)).map((r) => r.readOn.slice(0, 7))).size;
}

/** The year's water: monthly volumes are the year's bills ÷ the months billed. */
export function waterFromReadings(readings: readonly ReadingDoc[], year: number): WaterActivity {
  const perMonth = (m: ReadingMetric) => {
    const n = monthsBilled(readings, m, year);
    return n > 0 ? flow(readings, m, year) / n : 0;
  };
  return {
    ...WATER_DEFAULTS,
    meteredGalPerMonth: perMonth('water_metered_gal'),
    billedWastewaterMGalPerMonth: perMonth('wastewater_billed_mgal'),
  };
}

/** Service records as the per-circuit addition lists the refrigerant engine reads. */
export function serviceFromRecords(records: readonly RefrigerantServiceDoc[]): Record<string, ServiceAdd[]> {
  const out: Record<string, ServiceAdd[]> = {};
  for (const r of [...records].sort((a, b) => a.servicedOn.localeCompare(b.servicedOn))) (out[r.equipmentKey] ??= []).push({ date: r.servicedOn, lbAdded: r.lbAdded });
  return out;
}
