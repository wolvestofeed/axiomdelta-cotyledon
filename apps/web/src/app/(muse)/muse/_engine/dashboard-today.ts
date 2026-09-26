/**
 * Impact OS — the Dashboard's "today" (Roadmap N9, Robert 2026-09-16). The next
 * production day planned from the order book on the selected world, the way
 * Production Planning and Procurement plan one: whole batches against the plant's
 * cycles, netted against finished stock inside hold life. Days of cover is the
 * finished stock at the end of that day over the base portions a delivery day
 * orders in the window. It replaces the typed 650 portions a day on one recipe.
 */

import type { BookOrder } from './orders';
import type { CapacityInputs } from './index';
import { planHorizon, type FinishedLot } from './production-plan';
import type { DateRange } from './periods';
import type { RecipeDef } from '../_data/plan-data';
import type { ResolvedInputs } from './scenario';

type Assumptions = ResolvedInputs['assumptions'];

export interface DashboardToday {
  /** The next production date on or after today with a batch; null when the book has none in the window. */
  productionDate: string | null;
  batches: number;
  portions: number;
  /** Base portions not made for lack of cycles on that day. */
  shortfall: number;
  closingStockBase: number;
  /** Delivery days in the window with an order. */
  deliveryDays: number;
  /** Closing stock over the mean base portions a delivery day orders; null with no orders in the window. */
  daysOfCover: number | null;
}

export function dashboardToday(input: {
  today: string;
  /** Days ahead the book is read. */
  windowDays?: number;
  book: readonly BookOrder[];
  recipes: readonly RecipeDef[];
  capacityInputs: CapacityInputs;
  assumptions: Assumptions;
  recipeAssumptions?: Readonly<Record<string, Assumptions>>;
  portionFactorByChannel: Record<number, number>;
  openingLots: readonly FinishedLot[];
  closures?: readonly DateRange[];
  channels?: readonly number[];
}): DashboardToday {
  const to = addDays(input.today, input.windowDays ?? 14);
  const horizon = planHorizon({
    from: input.today,
    to,
    book: input.book,
    recipes: input.recipes,
    capacityInputs: input.capacityInputs,
    assumptions: input.assumptions,
    recipeAssumptions: input.recipeAssumptions,
    portionFactorByChannel: input.portionFactorByChannel,
    openingLots: input.openingLots,
    holdLifeDays: input.assumptions.inventory.chilledHoldLife.value,
    closures: input.closures,
    channels: input.channels,
  });
  const day = horizon.productionDays.filter((d) => d.productionDate >= input.today && d.runs.some((r) => r.batchesScheduled > 0)).sort((a, b) => a.productionDate.localeCompare(b.productionDate))[0];
  const deliveries = horizon.deliveryDays;
  const perDelivery = deliveries.length > 0 ? deliveries.reduce((t, d) => t + d.orderedBase, 0) / deliveries.length : 0;
  const closing = day ? horizon.byDate.find((b) => b.date === day.productionDate)?.closingStockBase ?? 0 : input.openingLots.reduce((t, l) => t + l.remaining, 0);
  return {
    productionDate: day?.productionDate ?? null,
    batches: day ? day.runs.reduce((t, r) => t + r.batchesScheduled, 0) : 0,
    portions: day ? day.runs.reduce((t, r) => t + r.produced, 0) : 0,
    shortfall: day?.totalShortfall ?? 0,
    closingStockBase: closing,
    deliveryDays: deliveries.length,
    daysOfCover: perDelivery > 0 ? closing / perDelivery : null,
  };
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
