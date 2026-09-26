import { describe, it, expect } from 'vitest';
import { resolveScenarioInputs } from '@/app/(muse)/muse/_engine/scenario';
import { standardBatchRecordPrefill, type DeliveryDoc } from '@/app/(muse)/muse/_engine/actuals';
import type { ProductionBatchLedger } from '@/app/(muse)/muse/_engine/production-ledger';
import { emptySustainabilityBasis, mixFoodFootprint } from '@/app/(muse)/muse/_engine/sustainability-basis';
import { fullInventory } from '@/app/(muse)/muse/_engine/inventory';
import { emptyMeasures, pvaBreakdown, pvaMeasures, servedCostPerMealCents, sumMeasures, type PvaSideInput } from '@/app/(muse)/muse/_engine/plan-v-actual';

const R = resolveScenarioInputs({});
const recipe = R.recipes.find((r) => r.code === R.recipe.code)!;
const channel = recipe.channels[0];

function side(): PvaSideInput {
  const doc = { ...standardBatchRecordPrefill('2026-10-05', 1, 400, recipe as never), id: 'B1', closedAt: '2026-10-05', actualLaborHours: 10, actualLaborRate: 20 };
  // The measures read the posting's amounts only.
  const led = { amounts: { materialIssuedToWip: 812.5, directLaborActual: 200, packagingCost: 180, mealsProduced: 400 } } as unknown as ProductionBatchLedger;
  const d = (id: string, date: string, meals: number, customerId: string): DeliveryDoc => ({ id, deliveredOn: date, phase: channel, siteId: null, siteName: null, meals, pricePerMealCents: 1000, lotCodes: [], deliveredBy: null, customerId, recipeCode: recipe.code, notes: null });
  const basis = { ...emptySustainabilityBasis('actual', '2026-10-01', '2026-10-31'), meals: [{ recipeCode: recipe.code, channel, meals: 300 }], totalMeals: 300, producedByRecipe: { [recipe.code]: 400 } };
  const food = mixFoodFootprint({ basis, recipes: R.recipes, portionFactorByChannel: {} });
  return {
    period: '2026-10',
    batches: [doc],
    batchLedgers: [led],
    deliveries: [d('D1', '2026-10-06', 200, 'C1'), d('D2', '2026-10-07', 100, 'C2')],
    receipts: [],
    orders: [
      { orderDate: '2026-10-06', customerId: 'C1', channel, recipeCode: recipe.code, meals: 200 },
      { orderDate: '2026-10-07', customerId: 'C2', channel, recipeCode: recipe.code, meals: 100 },
    ],
    firstOrderOn: new Map([['C1', '2026-09-01'], ['C2', '2026-10-07']]),
    statement: null,
    basis,
    food,
    inventory: fullInventory(R, '2026-10-31', { basis, energy: R.sustainability.energy, refrigerantService: {} }),
    energy: { ...R.sustainability.energy, electricityKwh: 1200 },
    waterGal: 5000,
    shrinkAllowance: 0.05,
    recipes: R.recipes,
    customers: [
      { id: 'C1', name: 'One', erra: { status: 'rated', stars: 3 } },
      { id: 'C2', name: 'Two', erra: { status: 'not_rated' } },
    ],
    suppliers: [{ id: 'S1', erra: { status: 'rated', stars: 1 } }],
  };
}

describe('muse Plan v Actual measures (Roadmap N7)', () => {
  const s = side();
  const m = pvaMeasures(s);

  it('counts meals, revenue, orders, batches and new customers in the month of the first order', () => {
    expect(m.meals).toBe(300);
    expect(m.revenueCents).toBe(300_000);
    expect(m.orders).toBe(2);
    expect(m.batches).toBe(1);
    expect(m.newCustomers).toBe(1);
    expect(m.laborHours).toBe(10);
  });

  it('takes food and labor cost from the batch posting, and served cost per meal over the meals made', () => {
    const led = s.batchLedgers[0];
    expect(m.foodCostCents).toBe(Math.round(led.amounts.materialIssuedToWip * 100));
    expect(m.laborCostCents).toBe(Math.round(led.amounts.directLaborActual * 100));
    expect(servedCostPerMealCents(m)).toBeCloseTo((m.foodCostCents + m.laborCostCents + m.packagingCostCents) / 400, 9);
  });

  it('tallies ratings by stars and carries the sustainability quantities', () => {
    expect(m.customersByStars).toEqual({ 1: 0, 2: 0, 3: 1 });
    expect(m.suppliersByStars).toEqual({ 1: 1, 2: 0, 3: 0 });
    expect(m.electricityKwh).toBe(1200);
    expect(m.waterGal).toBe(5000);
    expect(m.food.referenceKg).toBeGreaterThan(0);
    expect(m.food.onNamedSupplierKg).toBe(0);
  });

  it('a quarter sums flows and reads ratings at its last month', () => {
    const later = { ...m, customersByStars: { 1: 2, 2: 0, 3: 0 } as const };
    const q = sumMeasures([m, emptyMeasures(), later]);
    expect(q.meals).toBe(600);
    expect(q.customersByStars).toEqual({ 1: 2, 2: 0, 3: 0 });
  });

  it('breaks meals, revenue, food cost and orders down by customer, food cost following the meals', () => {
    const { rows } = pvaBreakdown(s, 'customer');
    expect(rows.map((r) => [r.key, r.meals, r.orders])).toEqual([['C1', 200, 1], ['C2', 100, 1]]);
    const perMeal = s.batchLedgers[0].amounts.materialIssuedToWip * 100 / 400;
    expect(rows[0].foodCostCents).toBe(Math.round(perMeal * 200));
  });
});
