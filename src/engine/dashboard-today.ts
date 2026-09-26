/**
 * MicroFarm — the Dashboard's "today". The next
 * production day planned from the order book on the selected world, the way
 * Production Planning and Procurement plan one: whole sowings against the plant's
 * cycles, netted against finished stock inside shelf life. Days of cover is the
 * finished stock at the end of that day over the base units a distribution day
 * orders in the window. It replaces the typed 650 units a day on one crop plan.
 */

import type { BookOrder } from '@/engine/orders';
import type { CapacityInputs } from '@/engine';
import { planHorizon, type FinishedLot } from '@/engine/production-plan';
import type { DateRange } from '@/engine/periods';
import type { CropPlanDef } from '@/data/plan-data';
import type { ResolvedInputs } from '@/engine/scenario';

type Assumptions = ResolvedInputs['assumptions'];

export interface DashboardToday {
  /** The next production date on or after today with a sowing; null when the book has none in the window. */
  productionDate: string | null;
  sowings: number;
  units: number;
  /** Base units not made for lack of cycles on that day. */
  shortfall: number;
  closingStockBase: number;
  /** Distribution days in the window with an order. */
  distributionDays: number;
  /** Closing stock over the mean base units a distribution day orders; null with no orders in the window. */
  daysOfCover: number | null;
}

export function dashboardToday(input: {
  today: string;
  /** Days ahead the book is read. */
  windowDays?: number;
  book: readonly BookOrder[];
  cropPlans: readonly CropPlanDef[];
  capacityInputs: CapacityInputs;
  assumptions: Assumptions;
  cropPlanAssumptions?: Readonly<Record<string, Assumptions>>;
  unitFactorByChannel: Record<number, number>;
  openingLots: readonly FinishedLot[];
  closures?: readonly DateRange[];
  channels?: readonly number[];
}): DashboardToday {
  const to = addDays(input.today, input.windowDays ?? 14);
  const horizon = planHorizon({
    from: input.today,
    to,
    book: input.book,
    cropPlans: input.cropPlans,
    capacityInputs: input.capacityInputs,
    assumptions: input.assumptions,
    cropPlanAssumptions: input.cropPlanAssumptions,
    unitFactorByChannel: input.unitFactorByChannel,
    openingLots: input.openingLots,
    shelfLifeDays: input.assumptions.inventory.blackoutShelfLife.value,
    closures: input.closures,
    channels: input.channels,
  });
  const day = horizon.productionDays.filter((d) => d.productionDate >= input.today && d.runs.some((r) => r.sowingsScheduled > 0)).sort((a, b) => a.productionDate.localeCompare(b.productionDate))[0];
  const distributions = horizon.distributionDays;
  const perDistribution = distributions.length > 0 ? distributions.reduce((t, d) => t + d.orderedBase, 0) / distributions.length : 0;
  const closing = day ? horizon.byDate.find((b) => b.date === day.productionDate)?.closingStockBase ?? 0 : input.openingLots.reduce((t, l) => t + l.remaining, 0);
  return {
    productionDate: day?.productionDate ?? null,
    sowings: day ? day.runs.reduce((t, r) => t + r.sowingsScheduled, 0) : 0,
    units: day ? day.runs.reduce((t, r) => t + r.produced, 0) : 0,
    shortfall: day?.totalShortfall ?? 0,
    closingStockBase: closing,
    distributionDays: distributions.length,
    daysOfCover: perDistribution > 0 ? closing / perDistribution : null,
  };
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
