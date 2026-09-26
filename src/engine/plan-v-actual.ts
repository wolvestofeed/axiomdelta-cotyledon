/**
 * MicroFarm — Plan v Actual (Roadmap N7). One month's figures computed the same way
 * on either side: the plan of record in force at the month end, posted through its
 * own timeline and Plan ledger, and the records posted through the Actual ledger.
 * A quarter is the sum of its months, each against its own plan; rates recompute
 * from the sums. Nothing is stored.
 */

import type { SowingRecordDoc, DistributionDoc, ReceiptDoc } from '@/engine/actuals';
import type { ProductionSowingLedger } from '@/engine/production-ledger';
import type { IncomeStatement } from '@/engine/ledger-model';
import type { FullInventory } from '@/engine/inventory';
import type { EnergyActivity } from '@/engine/scenario';
import type { MixFoodFootprint, SustainabilityBasis } from '@/engine/sustainability-basis';
import { expiredMassKg, mixShrinkKg } from '@/engine/sustainability-basis';
import { distributionRevenueCents } from '@/engine/working-capital';
import type { MarkRating } from '@/data/mark';
import type { GrowPlanCarrier } from '@/engine/grow-plan-bridge';

export interface PvaOrder {
  orderDate: string;
  subscriberId: string;
  channel: number;
  cropPlanCode: string;
  units: number;
}

/** Everything one side of one month needs; the server assembles it for Plan and for Actual. */
export interface PvaSideInput {
  period: string;
  sowings: readonly SowingRecordDoc[];
  /** The Plan or Actual ledger's posting of those sowings, in the same order. */
  sowingLedgers: readonly ProductionSowingLedger[];
  distributions: readonly DistributionDoc[];
  receipts: readonly ReceiptDoc[];
  orders: readonly PvaOrder[];
  /** Each subscriber's first order on or before the month end, on this side. */
  firstOrderOn: ReadonlyMap<string, string>;
  statement: IncomeStatement | null;
  basis: SustainabilityBasis;
  food: MixFoodFootprint;
  inventory: FullInventory;
  energy: EnergyActivity;
  waterGal: number;
  shrinkAllowance: number;
  cropPlans: readonly GrowPlanCarrier[];
  /** The subscribers this side serves in the month, with the rating MicroFarm assigned. */
  subscribers: readonly { id: string; name: string; rating: MarkRating }[];
  /** The suppliers on this side's receipts in the month, with their ratings. */
  suppliers: readonly { id: string; rating: MarkRating }[];
}

export interface PvaMeasures {
  units: number;
  revenueCents: number;
  orders: number;
  inputCostCents: number;
  laborHours: number;
  laborCostCents: number;
  packagingCostCents: number;
  distributionCostCents: number;
  servingsProduced: number;
  sowings: number;
  newSubscribers: number;
  wasteKg: number;
  waterGal: number;
  electricityKwh: number;
  naturalGasTherms: number;
  fuelGal: number;
  emissionsKg: { total: number; scope1: number; scope2: number; scope3: number };
  /** Purchased-food emissions (reference basis): all, on inputs received from a named supplier, and on a supplier's own figure. */
  food: { referenceKg: number; onNamedSupplierKg: number; onSupplierDataKg: number };
  subscribersByStars: Record<1 | 2 | 3, number>;
  suppliersByStars: Record<1 | 2 | 3, number>;
}

const cents = (dollars: number) => Math.round(dollars * 100);
const inMonth = (d: string, period: string) => d.slice(0, 7) === period;

function byStars(list: readonly { rating: MarkRating }[]): Record<1 | 2 | 3, number> {
  const out: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  for (const x of list) if (x.rating.status === 'rated') out[x.rating.stars] += 1;
  return out;
}

export function pvaMeasures(side: PvaSideInput): PvaMeasures {
  const namedSupplierInputs = new Set(side.receipts.flatMap((r) => (r.supplierId ? r.lines.filter((l) => l.condition !== 'rejected').map((l) => l.input) : [])));
  const shrink = mixShrinkKg(side.basis, side.cropPlans, side.shrinkAllowance).kg;
  const expired = expiredMassKg(side.basis, side.cropPlans).kg;
  const loc = side.inventory.reference.location;
  return {
    units: side.distributions.reduce((t, d) => t + d.units, 0),
    revenueCents: side.distributions.reduce((t, d) => t + distributionRevenueCents(d), 0),
    orders: side.orders.length,
    inputCostCents: cents(side.sowingLedgers.reduce((t, b) => t + b.amounts.materialIssuedToWip, 0)),
    laborHours: side.sowings.reduce((t, b) => t + (b.actualLaborHours ?? 0), 0),
    laborCostCents: cents(side.sowingLedgers.reduce((t, b) => t + b.amounts.directLaborActual, 0)),
    packagingCostCents: cents(side.sowingLedgers.reduce((t, b) => t + b.amounts.packagingCost, 0)),
    distributionCostCents: (side.statement?.sellingAndDistribution ?? []).reduce((t, r) => t + r.cents, 0),
    servingsProduced: side.sowingLedgers.reduce((t, b) => t + b.amounts.servingsProduced, 0),
    sowings: side.sowings.reduce((t, b) => t + b.sowingsRun, 0),
    newSubscribers: [...side.firstOrderOn.values()].filter((d) => inMonth(d, side.period)).length,
    wasteKg: shrink + expired,
    waterGal: side.waterGal,
    electricityKwh: side.energy.electricityKwh,
    naturalGasTherms: side.energy.naturalGasTherms,
    fuelGal: side.energy.propaneGal + side.energy.fleetGasolineGal + side.energy.fleetDieselGal,
    emissionsKg: { total: loc.totalKg, scope1: loc.scope1Kg, scope2: loc.scope2Kg, scope3: loc.scope3Kg },
    food: {
      referenceKg: side.food.referenceKg,
      onNamedSupplierKg: side.food.byInput.filter((i) => namedSupplierInputs.has(i.name)).reduce((t, i) => t + i.referenceKg, 0),
      onSupplierDataKg: side.food.byInput.filter((i) => i.selectedKind === 'supplier').reduce((t, i) => t + i.referenceKg, 0),
    },
    subscribersByStars: byStars(side.subscribers),
    suppliersByStars: byStars(side.suppliers),
  };
}

/** Sum months; ratings are a count at the last month's end, not a sum. */
export function sumMeasures(months: readonly PvaMeasures[]): PvaMeasures {
  const z = emptyMeasures();
  if (months.length === 0) return z;
  const add = (a: number, b: number) => a + b;
  for (const m of months) {
    for (const k of ['units', 'revenueCents', 'orders', 'inputCostCents', 'laborHours', 'laborCostCents', 'packagingCostCents', 'distributionCostCents', 'servingsProduced', 'sowings', 'newSubscribers', 'wasteKg', 'waterGal', 'electricityKwh', 'naturalGasTherms', 'fuelGal'] as const) z[k] = add(z[k], m[k]);
    for (const k of ['total', 'scope1', 'scope2', 'scope3'] as const) z.emissionsKg[k] += m.emissionsKg[k];
    for (const k of ['referenceKg', 'onNamedSupplierKg', 'onSupplierDataKg'] as const) z.food[k] += m.food[k];
  }
  const last = months[months.length - 1];
  z.subscribersByStars = { ...last.subscribersByStars };
  z.suppliersByStars = { ...last.suppliersByStars };
  return z;
}

export function emptyMeasures(): PvaMeasures {
  return {
    units: 0, revenueCents: 0, orders: 0, inputCostCents: 0, laborHours: 0, laborCostCents: 0, packagingCostCents: 0, distributionCostCents: 0, servingsProduced: 0, sowings: 0, newSubscribers: 0,
    wasteKg: 0, waterGal: 0, electricityKwh: 0, naturalGasTherms: 0, fuelGal: 0,
    emissionsKg: { total: 0, scope1: 0, scope2: 0, scope3: 0 },
    food: { referenceKg: 0, onNamedSupplierKg: 0, onSupplierDataKg: 0 },
    subscribersByStars: { 1: 0, 2: 0, 3: 0 },
    suppliersByStars: { 1: 0, 2: 0, 3: 0 },
  };
}

/**
 * Served cost per unit: food, labor and packaging over the units the sowings made,
 * plus selling and distribution over the units distributed. Null with nothing made.
 */
export function servedCostPerUnitCents(m: PvaMeasures): number | null {
  if (m.servingsProduced <= 0) return null;
  const made = (m.inputCostCents + m.laborCostCents + m.packagingCostCents) / m.servingsProduced;
  return made + (m.units > 0 ? m.distributionCostCents / m.units : 0);
}

// ── Breakdowns: units, revenue, input cost and orders by crop plan, channel and subscriber ──

export interface PvaBreakdownRow {
  key: string;
  units: number;
  revenueCents: number;
  inputCostCents: number;
  orders: number;
}

/**
 * Input cost follows the units: each crop plan's input cost per unit made in the month
 * (materials issued ÷ units produced) × its units distributed. A crop plan distributed in a
 * month with no sowing of its own carries no input cost there, and is named.
 */
export function pvaBreakdown(side: PvaSideInput, by: 'cropPlan' | 'channel' | 'subscriber'): { rows: PvaBreakdownRow[]; cropPlansDistributedWithNoSowing: string[] } {
  const perUnit = new Map<string, { cents: number; units: number }>();
  side.sowings.forEach((b, i) => {
    const led = side.sowingLedgers[i];
    if (!led) return;
    const cur = perUnit.get(b.cropPlanCode) ?? { cents: 0, units: 0 };
    cur.cents += led.amounts.materialIssuedToWip * 100;
    cur.units += led.amounts.servingsProduced;
    perUnit.set(b.cropPlanCode, cur);
  });
  const keyOf = (x: { cropPlanCode?: string | null; phase?: number; channel?: number; subscriberId?: string | null }) =>
    by === 'cropPlan' ? x.cropPlanCode ?? 'No crop plan named' : by === 'channel' ? String(x.phase ?? x.channel) : x.subscriberId ?? 'No subscriber named';
  const rows = new Map<string, PvaBreakdownRow>();
  const row = (k: string) => rows.get(k) ?? rows.set(k, { key: k, units: 0, revenueCents: 0, inputCostCents: 0, orders: 0 }).get(k)!;
  const noSowing = new Set<string>();
  for (const d of side.distributions) {
    const r = row(keyOf(d));
    r.units += d.units;
    r.revenueCents += distributionRevenueCents(d);
    const pm = d.cropPlanCode ? perUnit.get(d.cropPlanCode) : undefined;
    if (pm && pm.units > 0) r.inputCostCents += Math.round((pm.cents / pm.units) * d.units);
    else if (d.cropPlanCode) noSowing.add(d.cropPlanCode);
  }
  for (const o of side.orders) row(keyOf(o)).orders += 1;
  return { rows: [...rows.values()].sort((a, b) => b.units - a.units || a.key.localeCompare(b.key)), cropPlansDistributedWithNoSowing: [...noSowing] };
}
