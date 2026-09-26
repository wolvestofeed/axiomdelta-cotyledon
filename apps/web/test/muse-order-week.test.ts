/**
 * Impact OS — the dashboard's Production card: the week of orders from today (Robert, 2026-09-15).
 */

import { describe, it, expect } from 'vitest';
import { resolveScenarioInputs } from '@/app/(muse)/muse/_engine/scenario';
import { seedLibrary } from '@/app/(muse)/muse/_data/recipes-menu';
import { assumptions, capacityInputs } from '@/app/(muse)/muse/_data/plan-data';
import { costRecipe, deriveCapacity } from '@/app/(muse)/muse/_engine';
import { estimatedTimeStudy } from '@/app/(muse)/muse/_engine/time-study-estimate';
import { orderWeek, unitCostsFor } from '@/app/(muse)/muse/_engine/order-week';
import type { BookOrder } from '@/app/(muse)/muse/_engine/orders';
import type { TimeStudyDoc } from '@/app/(muse)/muse/_data/time-studies';

const studies: TimeStudyDoc[] = seedLibrary.map((r, i) => ({
  id: `s${i}`, recipeCode: r.code, adoptedAt: null, adoptedBy: null, source: 'seed',
  ...estimatedTimeStudy(r, deriveCapacity(r, capacityInputs).batchSize),
}));
const pf = { 1: 1, 2: 1.5, 3: 1.5 };
const order = (date: string, channel: number, recipeCode: string, meals: number): BookOrder => ({
  key: `${date}|site|${recipeCode}`, id: null, orderDate: date, customerId: 'c', customerName: 'C', customerSiteId: 'site', siteName: 'S', customerServiceId: null, serviceName: null, deliverySiteId: null,
  channel, recipeCode, recipeName: recipeCode, meals, status: 'forecast', basis: 'derived', source: 'cycle', pricePerMealCents: 1000, priceBasis: 'channel', deliveryId: null, menuCycleId: null, notes: null,
});

describe('muse dashboard — the week of orders', () => {
  const book = [order('2027-01-04', 1, 'AMK-E-002', 400), order('2027-01-04', 2, 'AMK-A-002', 100), order('2027-01-06', 3, 'AMK-A-003', 50), order('2027-01-11', 1, 'AMK-E-002', 999), order('2027-01-05', 1, 'AMK-X-000', 10)];
  const w = orderWeek({ book, from: '2027-01-04', channels: [1, 2, 3], recipes: seedLibrary, cap: capacityInputs, assumptions, studies, portionFactorByChannel: pf });

  it('runs seven days from the day in use and keeps orders outside it out', () => {
    expect(w.days.map((d) => d.date)).toEqual(['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08', '2027-01-09', '2027-01-10']);
    expect(w.to).toBe('2027-01-10');
    expect(w.meals).toBe(560);
  });

  it('meals by channel and by day, and the week’s totals', () => {
    expect(w.days[0]!.mealsByChannel).toEqual({ 1: 400, 2: 100, 3: 0 });
    expect(w.days[2]!.mealsByChannel).toEqual({ 1: 0, 2: 0, 3: 50 });
    expect(w.mealsByChannel).toEqual({ 1: 410, 2: 100, 3: 50 });
    expect(w.days[3]!.meals).toBe(0);
  });

  it('costs each order at its recipe’s unit food cost on the channel’s portion and its labor standard at its batch', () => {
    const e002 = seedLibrary.find((r) => r.code === 'AMK-E-002')!;
    const a002 = seedLibrary.find((r) => r.code === 'AMK-A-002')!;
    const u1 = unitCostsFor(e002, 1, capacityInputs, assumptions, studies, pf);
    const u2 = unitCostsFor(a002, 2, capacityInputs, assumptions, studies, pf);
    expect(u1.food).toBeCloseTo(costRecipe(e002, assumptions.yield.shrinkAllowance.value).totalFoodCostPerPortion, 10);
    expect(u2.food).toBeCloseTo(costRecipe(a002, assumptions.yield.shrinkAllowance.value).totalFoodCostPerPortion, 10); // an adult recipe carries its own portion
    expect(u1.labor).toBeGreaterThan(0);
    expect(w.days[0]!.foodCost).toBeCloseTo(u1.food * 400 + u2.food * 100, 8);
    expect(w.days[0]!.laborCost).toBeCloseTo(u1.labor * 400 + u2.labor * 100, 8);
    expect(w.foodCost).toBeCloseTo(w.days.reduce((s, d) => s + d.foodCost, 0), 8);
  });

  it('an order naming a recipe not in the library is counted as meals and carries no cost', () => {
    expect(w.uncostedMeals).toBe(10);
    expect(w.days[1]!.meals).toBe(10);
    expect(w.days[1]!.foodCost).toBe(0);
  });

  it('with no time study the labor is a gap, never another recipe\'s typed figure (Roadmap N3)', () => {
    const e002 = seedLibrary.find((r) => r.code === 'AMK-E-002')!;
    const u = unitCostsFor(e002, 1, capacityInputs, assumptions, [], pf);
    expect(u.labor).toBe(0);
    expect(u.laborGap).toBe(true);
    // Food is unaffected: only the labor is missing, and it says so.
    expect(u.food).toBeGreaterThan(0);
  });

  it('given the resolver\'s recipe assumptions, labor is the recipe\'s own standard', () => {
    const R = resolveScenarioInputs({}, seedLibrary);
    const e002 = R.recipes.find((r) => r.code === 'AMK-E-002')!;
    const own = R.recipeAssumptions[e002.code]!;
    const batch = deriveCapacity(e002, R.capacityInputs).batchSize;
    const u = unitCostsFor(e002, 1, R.capacityInputs, R.assumptions, [], pf, R.recipeAssumptions);
    const minutes = own.laborSplit.fixedMinutesPerBatch.value / batch + own.laborSplit.variableMinutesPerPortion.value;
    expect(u.labor).toBeCloseTo((minutes / 60) * own.labor.blendedLoadedWage.value, 10);
    expect(u.laborGap).toBe(false);
  });
});
