/**
 * Impact OS — Plan v Actual (Roadmap N7). One month's figures computed the same way
 * on either side: the plan of record in force at the month end, posted through its
 * own timeline and Plan ledger, and the records posted through the Actual ledger.
 * A quarter is the sum of its months, each against its own plan; rates recompute
 * from the sums. Nothing is stored.
 */

import type { BatchRecordDoc, DeliveryDoc, ReceiptDoc } from './actuals';
import type { ProductionBatchLedger } from './production-ledger';
import type { IncomeStatement } from './ledger-model';
import type { FullInventory } from './inventory';
import type { EnergyActivity } from './scenario';
import type { MixFoodFootprint, SustainabilityBasis } from './sustainability-basis';
import { expiredMassKg, mixShrinkKg } from './sustainability-basis';
import { deliveryRevenueCents } from './working-capital';
import type { MarkRating } from '../_data/mark';
import type { RecipeDef } from '../_data/plan-data';

export interface PvaOrder {
  orderDate: string;
  customerId: string;
  channel: number;
  recipeCode: string;
  meals: number;
}

/** Everything one side of one month needs; the server assembles it for Plan and for Actual. */
export interface PvaSideInput {
  period: string;
  batches: readonly BatchRecordDoc[];
  /** The Plan or Actual ledger's posting of those batches, in the same order. */
  batchLedgers: readonly ProductionBatchLedger[];
  deliveries: readonly DeliveryDoc[];
  receipts: readonly ReceiptDoc[];
  orders: readonly PvaOrder[];
  /** Each customer's first order on or before the month end, on this side. */
  firstOrderOn: ReadonlyMap<string, string>;
  statement: IncomeStatement | null;
  basis: SustainabilityBasis;
  food: MixFoodFootprint;
  inventory: FullInventory;
  energy: EnergyActivity;
  waterGal: number;
  shrinkAllowance: number;
  recipes: readonly RecipeDef[];
  /** The customers this side serves in the month, with the rating Muse Kitchen assigned. */
  customers: readonly { id: string; name: string; erra: MarkRating }[];
  /** The suppliers on this side's receipts in the month, with their ratings. */
  suppliers: readonly { id: string; erra: MarkRating }[];
}

export interface PvaMeasures {
  meals: number;
  revenueCents: number;
  orders: number;
  foodCostCents: number;
  laborHours: number;
  laborCostCents: number;
  packagingCostCents: number;
  distributionCostCents: number;
  mealsProduced: number;
  batches: number;
  newCustomers: number;
  wasteKg: number;
  waterGal: number;
  electricityKwh: number;
  naturalGasTherms: number;
  fuelGal: number;
  emissionsKg: { total: number; scope1: number; scope2: number; scope3: number };
  /** Purchased-food emissions (reference basis): all, on ingredients received from a named supplier, and on a supplier's own figure. */
  food: { referenceKg: number; onNamedSupplierKg: number; onSupplierDataKg: number };
  customersByStars: Record<1 | 2 | 3, number>;
  suppliersByStars: Record<1 | 2 | 3, number>;
}

const cents = (dollars: number) => Math.round(dollars * 100);
const inMonth = (d: string, period: string) => d.slice(0, 7) === period;

function byStars(list: readonly { erra: MarkRating }[]): Record<1 | 2 | 3, number> {
  const out: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  for (const x of list) if (x.erra.status === 'rated') out[x.erra.stars] += 1;
  return out;
}

export function pvaMeasures(side: PvaSideInput): PvaMeasures {
  const namedSupplierIngredients = new Set(side.receipts.flatMap((r) => (r.supplierId ? r.lines.filter((l) => l.condition !== 'rejected').map((l) => l.ingredient) : [])));
  const shrink = mixShrinkKg(side.basis, side.recipes, side.shrinkAllowance).kg;
  const expired = expiredMassKg(side.basis, side.recipes).kg;
  const loc = side.inventory.reference.location;
  return {
    meals: side.deliveries.reduce((t, d) => t + d.meals, 0),
    revenueCents: side.deliveries.reduce((t, d) => t + deliveryRevenueCents(d), 0),
    orders: side.orders.length,
    foodCostCents: cents(side.batchLedgers.reduce((t, b) => t + b.amounts.materialIssuedToWip, 0)),
    laborHours: side.batches.reduce((t, b) => t + (b.actualLaborHours ?? 0), 0),
    laborCostCents: cents(side.batchLedgers.reduce((t, b) => t + b.amounts.directLaborActual, 0)),
    packagingCostCents: cents(side.batchLedgers.reduce((t, b) => t + b.amounts.packagingCost, 0)),
    distributionCostCents: (side.statement?.sellingAndDistribution ?? []).reduce((t, r) => t + r.cents, 0),
    mealsProduced: side.batchLedgers.reduce((t, b) => t + b.amounts.mealsProduced, 0),
    batches: side.batches.reduce((t, b) => t + b.batchesRun, 0),
    newCustomers: [...side.firstOrderOn.values()].filter((d) => inMonth(d, side.period)).length,
    wasteKg: shrink + expired,
    waterGal: side.waterGal,
    electricityKwh: side.energy.electricityKwh,
    naturalGasTherms: side.energy.naturalGasTherms,
    fuelGal: side.energy.propaneGal + side.energy.fleetGasolineGal + side.energy.fleetDieselGal,
    emissionsKg: { total: loc.totalKg, scope1: loc.scope1Kg, scope2: loc.scope2Kg, scope3: loc.scope3Kg },
    food: {
      referenceKg: side.food.referenceKg,
      onNamedSupplierKg: side.food.byIngredient.filter((i) => namedSupplierIngredients.has(i.name)).reduce((t, i) => t + i.referenceKg, 0),
      onSupplierDataKg: side.food.byIngredient.filter((i) => i.selectedKind === 'supplier').reduce((t, i) => t + i.referenceKg, 0),
    },
    customersByStars: byStars(side.customers),
    suppliersByStars: byStars(side.suppliers),
  };
}

/** Sum months; ratings are a count at the last month's end, not a sum. */
export function sumMeasures(months: readonly PvaMeasures[]): PvaMeasures {
  const z = emptyMeasures();
  if (months.length === 0) return z;
  const add = (a: number, b: number) => a + b;
  for (const m of months) {
    for (const k of ['meals', 'revenueCents', 'orders', 'foodCostCents', 'laborHours', 'laborCostCents', 'packagingCostCents', 'distributionCostCents', 'mealsProduced', 'batches', 'newCustomers', 'wasteKg', 'waterGal', 'electricityKwh', 'naturalGasTherms', 'fuelGal'] as const) z[k] = add(z[k], m[k]);
    for (const k of ['total', 'scope1', 'scope2', 'scope3'] as const) z.emissionsKg[k] += m.emissionsKg[k];
    for (const k of ['referenceKg', 'onNamedSupplierKg', 'onSupplierDataKg'] as const) z.food[k] += m.food[k];
  }
  const last = months[months.length - 1];
  z.customersByStars = { ...last.customersByStars };
  z.suppliersByStars = { ...last.suppliersByStars };
  return z;
}

export function emptyMeasures(): PvaMeasures {
  return {
    meals: 0, revenueCents: 0, orders: 0, foodCostCents: 0, laborHours: 0, laborCostCents: 0, packagingCostCents: 0, distributionCostCents: 0, mealsProduced: 0, batches: 0, newCustomers: 0,
    wasteKg: 0, waterGal: 0, electricityKwh: 0, naturalGasTherms: 0, fuelGal: 0,
    emissionsKg: { total: 0, scope1: 0, scope2: 0, scope3: 0 },
    food: { referenceKg: 0, onNamedSupplierKg: 0, onSupplierDataKg: 0 },
    customersByStars: { 1: 0, 2: 0, 3: 0 },
    suppliersByStars: { 1: 0, 2: 0, 3: 0 },
  };
}

/**
 * Served cost per meal: food, labor and packaging over the meals the batches made,
 * plus selling and distribution over the meals delivered. Null with nothing made.
 */
export function servedCostPerMealCents(m: PvaMeasures): number | null {
  if (m.mealsProduced <= 0) return null;
  const made = (m.foodCostCents + m.laborCostCents + m.packagingCostCents) / m.mealsProduced;
  return made + (m.meals > 0 ? m.distributionCostCents / m.meals : 0);
}

// ── Breakdowns: meals, revenue, food cost and orders by recipe, channel and customer ──

export interface PvaBreakdownRow {
  key: string;
  meals: number;
  revenueCents: number;
  foodCostCents: number;
  orders: number;
}

/**
 * Food cost follows the meals: each recipe's food cost per meal made in the month
 * (materials issued ÷ meals produced) × its meals delivered. A recipe delivered in a
 * month with no batch of its own carries no food cost there, and is named.
 */
export function pvaBreakdown(side: PvaSideInput, by: 'recipe' | 'channel' | 'customer'): { rows: PvaBreakdownRow[]; recipesDeliveredWithNoBatch: string[] } {
  const perMeal = new Map<string, { cents: number; meals: number }>();
  side.batches.forEach((b, i) => {
    const led = side.batchLedgers[i];
    if (!led) return;
    const cur = perMeal.get(b.recipeCode) ?? { cents: 0, meals: 0 };
    cur.cents += led.amounts.materialIssuedToWip * 100;
    cur.meals += led.amounts.mealsProduced;
    perMeal.set(b.recipeCode, cur);
  });
  const keyOf = (x: { recipeCode?: string | null; phase?: number; channel?: number; customerId?: string | null }) =>
    by === 'recipe' ? x.recipeCode ?? 'No recipe named' : by === 'channel' ? String(x.phase ?? x.channel) : x.customerId ?? 'No customer named';
  const rows = new Map<string, PvaBreakdownRow>();
  const row = (k: string) => rows.get(k) ?? rows.set(k, { key: k, meals: 0, revenueCents: 0, foodCostCents: 0, orders: 0 }).get(k)!;
  const noBatch = new Set<string>();
  for (const d of side.deliveries) {
    const r = row(keyOf(d));
    r.meals += d.meals;
    r.revenueCents += deliveryRevenueCents(d);
    const pm = d.recipeCode ? perMeal.get(d.recipeCode) : undefined;
    if (pm && pm.meals > 0) r.foodCostCents += Math.round((pm.cents / pm.meals) * d.meals);
    else if (d.recipeCode) noBatch.add(d.recipeCode);
  }
  for (const o of side.orders) row(keyOf(o)).orders += 1;
  return { rows: [...rows.values()].sort((a, b) => b.meals - a.meals || a.key.localeCompare(b.key)), recipesDeliveredWithNoBatch: [...noBatch] };
}
