import { describe, it, expect } from 'vitest';
import { recipes as seedRecipes, recipe as seed, type RecipeDef } from '../src/app/(muse)/muse/_data/plan-data';
import { seedCustomers, type CustomerDef } from '../src/app/(muse)/muse/_data/customers';
import { seedMenuCycles, seedMealPlans } from '../src/app/(muse)/muse/_data/menu-cycles';
import { resolveScenarioInputs } from '../src/app/(muse)/muse/_engine/scenario';
import { resolveCustomerSites } from '../src/app/(muse)/muse/_engine/demand';
import { orderBook, datesBetween } from '../src/app/(muse)/muse/_engine/orders';
import { deriveCapacity, purchaseOrderForRun } from '../src/app/(muse)/muse/_engine';
import {
  requirementsFor,
  finishedGoodsOnHand,
  planProductionDay,
  planHorizon,
  productionDateFor,
  singleRecipeRun,
  mergePurchaseLines,
  ceilingByRecipe,
} from '../src/app/(muse)/muse/_engine/production-plan';

const MON = '2026-09-14';
const TUE = '2026-09-15';
const FRI = '2026-09-18';
const R = resolveScenarioInputs();
const PF = { 1: 1, 2: 1.5, 3: 1.5 };
const PRICES = { 1: 1000, 2: 1500, 3: 1600 };

/** The engine default customers with no term on file (every weekday), each with a meal plan copied from the saved cycles. */
function testCustomers(): CustomerDef[] {
  return seedCustomers().map((c) => ({ ...c, sites: c.sites.map((s) => ({ ...s, calendar: [] })) }));
}
function cyclesWithPlans(customers: readonly CustomerDef[], library: readonly RecipeDef[]) {
  const saved = seedMenuCycles(library, MON);
  return [...saved, ...seedMealPlans(customers, saved)];
}

function book(from: string, to: string, extra: RecipeDef[] = []) {
  const customers = testCustomers();
  return orderBook({
    sites: resolveCustomerSites(customers),
    customers,
    cycles: cyclesWithPlans(customers, [...seedRecipes, ...extra]),
    orders: [],
    from,
    to,
    channelPriceCents: PRICES,
  });
}

describe('requirements from the order book', () => {
  it('explodes a delivery day into base portions per recipe at the channel portion factor', () => {
    const reqs = requirementsFor(book(TUE, TUE), R.recipes, PF);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].recipeCode).toBe('AMK-E-001');
    expect(reqs[0].meals).toBe(1000);
    expect(reqs[0].basePortions).toBe(1000);
    expect(reqs[0].inLibrary).toBe(true);
    expect(reqs[0].byChannel).toEqual([{ channel: 1, meals: 1000, portionFactor: 1 }]);
  });

  it('a Phase 2 order counts 1.5 base portions per meal', () => {
    const o = { ...book(TUE, TUE)[0], channel: 2, meals: 100, key: 'x' };
    const reqs = requirementsFor([o], R.recipes, PF);
    expect(reqs[0].basePortions).toBe(150);
  });
});

describe('finished goods on hand from records', () => {
  const batches = [
    { batchId: 'B-1', recipeCode: 'AMK-E-001', productionDate: '2026-09-01', goodPortions: 550 },
    { batchId: 'B-2', recipeCode: 'AMK-E-001', productionDate: '2026-09-10', goodPortions: 550 },
  ];

  it('lots inside hold life count; delivered orders draw oldest first', () => {
    const s = finishedGoodsOnHand({ batches, consumed: [{ recipeCode: 'AMK-E-001', date: '2026-09-11', basePortions: 600 }], holdLifeDays: 30, asOf: MON });
    expect(s.byRecipe['AMK-E-001']).toBe(500);
    expect(s.lots[0].remaining).toBe(0);
    expect(s.lots[1].remaining).toBe(500);
    expect(s.unmatchedByRecipe).toEqual({});
  });

  it('a lot past hold life is expired, not on hand; consumption with no stock is unmatched', () => {
    const s = finishedGoodsOnHand({ batches, consumed: [{ recipeCode: 'AMK-E-002', date: MON, basePortions: 10 }], holdLifeDays: 7, asOf: MON });
    expect(s.byRecipe['AMK-E-001']).toBe(550);
    expect(s.expiredByRecipe['AMK-E-001']).toBe(550);
    expect(s.unmatchedByRecipe['AMK-E-002']).toBe(10);
  });

  it('a record after the as-of date is not stock yet', () => {
    const s = finishedGoodsOnHand({ batches, consumed: [], holdLifeDays: 30, asOf: '2026-09-05' });
    expect(s.byRecipe['AMK-E-001']).toBe(550);
  });
});

describe('a production day', () => {
  const cap = deriveCapacity(seed, R.capacityInputs);

  it('sizes whole batches per recipe net of stock and places them one cycle apart', () => {
    const reqs = requirementsFor(book(TUE, TUE), R.recipes, PF);
    const day = planProductionDay({ productionDate: MON, requirements: reqs, onHand: { 'AMK-E-001': 100 }, recipes: R.recipes, capacityInputs: R.capacityInputs, assumptions: R.assumptions });
    const run = day.runs[0];
    expect(run.net).toBe(900);
    expect(run.batchSize).toBe(cap.batchSize);
    expect(run.batchesNeeded).toBe(Math.ceil(900 / cap.batchSize));
    expect(run.produced).toBe(run.batchesNeeded * cap.batchSize);
    expect(run.closing).toBe(100 + run.produced - 1000);
    expect(day.fits).toBe(run.batchesNeeded <= cap.cyclesPerDay);
    expect(day.schedule).toHaveLength(run.batchesNeeded);
    expect(day.schedule[0].loadMin).toBe(cap.chillWindow.startMin);
    expect(day.schedule[1].loadMin - day.schedule[0].loadMin).toBe(cap.occupancyMinutes);
    expect(day.purchase.total).toBeCloseTo(purchaseOrderForRun(run.produced, seed, R.assumptions.yield.shrinkAllowance.value).total, 6);
  });

  it('cycles go to the largest requirement first and the rest is a named shortfall', () => {
    const second: RecipeDef = { ...structuredClone(seed), code: 'AMK-E-002', name: 'Second', channels: [1] };
    const reqs = [
      { recipeCode: 'AMK-E-001', recipeName: 'A', meals: 5000, basePortions: 5000, byChannel: [], orders: 1, inLibrary: true },
      { recipeCode: 'AMK-E-002', recipeName: 'B', meals: 1000, basePortions: 1000, byChannel: [], orders: 1, inLibrary: true },
    ];
    const day = planProductionDay({ productionDate: MON, requirements: reqs, onHand: {}, recipes: [seed, second], capacityInputs: R.capacityInputs, assumptions: R.assumptions });
    expect(day.fits).toBe(false);
    expect(day.runs[0].batchesScheduled).toBe(cap.cyclesPerDay);
    expect(day.runs[1].batchesScheduled).toBe(0);
    expect(day.runs[1].shortfall).toBe(1000);
    expect(day.schedule.filter((b) => b.fits)).toHaveLength(cap.cyclesPerDay);
    expect(day.cyclesRequired).toBeGreaterThan(day.cyclesAvailable);

    // A second line in service is a second stream: twice the cycles, the same batch on each,
    // the chilled ceiling one cabinet's load across every cycle — never a larger batch (Robert, 2026-09-17).
    const two = planProductionDay({ productionDate: MON, requirements: reqs, onHand: {}, recipes: [seed, second], capacityInputs: R.capacityInputs, assumptions: R.assumptions, lines: 2 });
    expect(two.cyclesAvailable).toBe(2 * day.cyclesAvailable);
    expect(two.runs.map((r) => r.batchSize)).toEqual(day.runs.map((r) => r.batchSize));
    expect(two.schedule.every((b) => b.portions === two.runs.find((r) => r.recipeCode === b.recipeCode)!.batchSize)).toBe(true);
    expect(two.chilledCeilingLb).toBe(cap.lbPerCycle * two.cyclesAvailable);
    expect(two.schedule.filter((b) => b.fits).length).toBe(Math.min(two.cyclesAvailable, two.cyclesRequired));
    // Two batches load at the same minute — two cabinets, one each.
    const fits = two.schedule.filter((b) => b.fits);
    expect(fits.filter((b) => b.loadMin === fits[0]!.loadMin)).toHaveLength(2);
  });

  it('merges purchase lines across recipes and re-rounds cases on the sum', () => {
    const a = purchaseOrderForRun(100, seed).lines;
    const merged = mergePurchaseLines([...a, ...a]);
    expect(merged.lines).toHaveLength(a.length);
    for (const l of merged.lines) {
      const src = a.find((x) => x.name === l.name)!;
      expect(l.requiredForProduction).toBeCloseTo(src.requiredForProduction * 2, 9);
      expect(l.casesToOrder).toBe(Math.ceil(l.requiredForProduction / l.packSize - 1e-9));
    }
  });
});

describe('delivery date to production date', () => {
  it('is the last production weekday strictly before delivery', () => {
    expect(productionDateFor(TUE)).toBe(MON);
    expect(productionDateFor(MON)).toBe('2026-09-11');
    expect(productionDateFor('2026-09-20')).toBe(FRI);
  });
});

describe('the horizon', () => {
  it('rolls the seeded week: Friday makes Monday, overshoot carries, nothing expires inside hold life', () => {
    const h = planHorizon({
      from: MON,
      to: FRI,
      book: book(MON, FRI),
      recipes: R.recipes,
      capacityInputs: R.capacityInputs,
      assumptions: R.assumptions,
      portionFactorByChannel: PF,
      openingLots: [],
      holdLifeDays: 30,
    });
    expect(h.deliveryDays.map((d) => d.date)).toEqual(datesBetween(MON, FRI));
    expect(h.productionDays[0].productionDate).toBe('2026-09-11');
    expect(h.totals.orderedMeals).toBe(5000);
    expect(h.totals.filledMeals).toBe(5000);
    expect(h.totals.expiredBase).toBe(0);
    expect(h.totals.producedBase).toBeGreaterThanOrEqual(5000);
    expect(h.totals.closingStockBase).toBeCloseTo(h.totals.producedBase - 5000, 6);
    expect(h.byChannel[0].share).toBe(1);
    expect(h.totals.daysThatDoNotFit).toBe(0);
    // Whole batches overshoot; a later day with stock needs fewer batches.
    const batches = h.productionDays.map((p) => p.runs[0]?.batchesScheduled ?? 0);
    expect(Math.min(...batches)).toBeLessThan(Math.max(...batches));
  });

  it('carries a row per date: what was made, what shipped, what is left — the calendar’s rows', () => {
    const h = planHorizon({
      from: MON,
      to: FRI,
      book: book(MON, FRI),
      recipes: R.recipes,
      capacityInputs: R.capacityInputs,
      assumptions: R.assumptions,
      portionFactorByChannel: PF,
      openingLots: [],
      holdLifeDays: 30,
    });
    expect(h.byDate.map((r) => r.date)).toEqual(datesBetween(MON, FRI));
    // Rows are the window only: Monday's orders are made the Friday before it, outside the window.
    expect(h.byDate.every((r) => r.date >= MON && r.date <= FRI)).toBe(true);
    const made = h.byDate.reduce((s, r) => s + r.portionsProduced, 0);
    const inWindow = h.productionDays.filter((p) => p.productionDate >= MON && p.productionDate <= FRI).reduce((s, p) => s + p.totalProduced, 0);
    expect(made).toBeCloseTo(inWindow, 6);
    expect(made).toBeLessThan(h.totals.producedBase);
    expect(h.byDate.reduce((s, r) => s + r.filledBase, 0)).toBeCloseTo(h.totals.filledBase, 6);
    expect(h.byDate.reduce((s, r) => s + r.expiredBase, 0)).toBeCloseTo(h.totals.expiredBase, 6);
    // The last date's closing stock is what the horizon ends holding.
    expect(h.byDate[h.byDate.length - 1]!.closingStockBase).toBeCloseTo(h.totals.closingStockBase, 6);
    const day = h.byDate.find((r) => r.batches > 0)!;
    expect(day.utilisation).toBeCloseTo(day.cyclesUsed / day.cyclesAvailable, 9);
    expect(h.byDate.every((r) => r.fits)).toBe(true);
  });

  it('stock that nothing draws carries its expiry on the date it reaches hold life', () => {
    // A recipe with no order in the window: FIFO cannot draw it, so it expires where it sits.
    const early = planHorizon({
      from: MON,
      to: FRI,
      book: book(MON, FRI),
      recipes: R.recipes,
      capacityInputs: R.capacityInputs,
      assumptions: R.assumptions,
      portionFactorByChannel: PF,
      openingLots: [{ batchId: 'old', recipeCode: 'AMK-E-007', produced: '2026-08-01', expires: '2026-09-14', qtyProduced: 300, remaining: 300 }],
      holdLifeDays: 30,
    });
    const expired = early.byDate.filter((r) => r.expiredBase > 0);
    expect(expired).toHaveLength(1);
    expect(expired[0]!.date).toBe('2026-09-15');
    expect(expired[0]!.expiredBase).toBe(300);
    expect(early.totals.expiredBase).toBe(300);
    expect(early.byDate.every((r) => r.fits)).toBe(true);
  });

  it('stock that expires before the delivery a production day serves is not counted as on hand (the weekend gap)', () => {
    // Friday makes Monday's orders. A lot that expires on Saturday is inside hold life on Friday
    // but not on Monday, so Friday must still cook for Monday.
    const NEXT_MON = '2026-09-21';
    const h = planHorizon({
      from: NEXT_MON,
      to: NEXT_MON,
      book: book(NEXT_MON, NEXT_MON),
      recipes: R.recipes,
      capacityInputs: R.capacityInputs,
      assumptions: R.assumptions,
      portionFactorByChannel: PF,
      openingLots: [{ batchId: 'wkend', recipeCode: 'AMK-E-001', produced: '2026-08-20', expires: '2026-09-19', qtyProduced: 5000, remaining: 5000 }],
      holdLifeDays: 30,
    });
    expect(h.productionDays[0]!.productionDate).toBe('2026-09-18');
    expect(h.productionDays[0]!.runs[0]!.onHand).toBe(0);
    expect(h.deliveryDays[0]!.unfilledBase).toBe(0);
  });

  it('opening stock is drawn first and unfilled orders are reported when the cabinets run out', () => {
    const cap = deriveCapacity(seed, R.capacityInputs);
    const customers = testCustomers();
    customers[0].sites[0].services[0].picks = [{ id: 'big', effectiveDate: '2026-01-01', meals: cap.maxPortionsPerDay * 3, notes: null }];
    const big = orderBook({ sites: resolveCustomerSites(customers), customers, cycles: cyclesWithPlans(customers, seedRecipes), orders: [], from: TUE, to: TUE, channelPriceCents: PRICES });
    const h = planHorizon({ from: TUE, to: TUE, book: big, recipes: R.recipes, capacityInputs: R.capacityInputs, assumptions: R.assumptions, portionFactorByChannel: PF, openingLots: [{ batchId: 'x', recipeCode: 'AMK-E-001', produced: '2026-09-10', expires: '2026-10-10', qtyProduced: 200, remaining: 200 }], holdLifeDays: 30 });
    expect(h.totals.daysThatDoNotFit).toBe(1);
    expect(h.deliveryDays[0].filledBase).toBe(200 + cap.maxPortionsPerDay);
    expect(h.deliveryDays[0].unfilledBase).toBeGreaterThan(0);
    expect(h.byChannel[0].share).toBeLessThan(1);
    expect(h.byChannel[0].filledMeals).toBeCloseTo(h.deliveryDays[0].filledBase, 6);
  });
});

describe('a single recipe run', () => {
  it('runs a recipe at a channel portion and price through batches, weights, labor and contribution', () => {
    const run = singleRecipeRun({ recipe: seed, meals: 1000, portionFactor: 1, premiumFactor: 1, pricePerMeal: 10, commissionShare: 0, openingInventory: 0, capacityInputs: R.capacityInputs, assumptions: R.assumptions });
    const cap = deriveCapacity(seed, R.capacityInputs);
    expect(run.batches).toBe(Math.ceil(1000 / cap.batchSize));
    expect(run.produced).toBe(run.batches * cap.batchSize);
    expect(run.revenue).toBe(10_000);
    expect(run.contribution).toBeCloseTo(run.revenue - run.foodCostSold - run.laborCost - run.packaging - run.delivery, 6);
    expect(run.commission).toBe(0);
    expect(run.carriedForward).toBeCloseTo(run.purchase.total - run.foodCostStandard, 6);
    expect(run.chilledLb).toBeLessThan(run.cookedLb);
  });

  it('a Phase 3 run carries the marketplace commission and the portion and premium factors', () => {
    const base = singleRecipeRun({ recipe: seed, meals: 100, portionFactor: 1, premiumFactor: 1, pricePerMeal: 16, commissionShare: 0, openingInventory: 0, capacityInputs: R.capacityInputs, assumptions: R.assumptions });
    const p3 = singleRecipeRun({ recipe: seed, meals: 100, portionFactor: 1.5, premiumFactor: 1.2, pricePerMeal: 16, commissionShare: 0.25, openingInventory: 0, capacityInputs: R.capacityInputs, assumptions: R.assumptions });
    expect(p3.basePortions).toBe(150);
    expect(p3.commission).toBe(400);
    expect(p3.foodCostPerMeal).toBeCloseTo(base.foodCostPerMeal * 1.5 * 1.2, 9);
  });

  it('opening inventory nets the requirement and can make the run zero batches', () => {
    const run = singleRecipeRun({ recipe: seed, meals: 100, portionFactor: 1, premiumFactor: 1, pricePerMeal: 10, commissionShare: 0, openingInventory: 500, capacityInputs: R.capacityInputs, assumptions: R.assumptions });
    expect(run.batches).toBe(0);
    expect(run.produced).toBe(0);
    expect(run.closing).toBe(400);
    expect(run.laborCost).toBe(0);
  });
});

describe('ceiling by recipe', () => {
  it('reports each recipe on its own batch size against the same cycles', () => {
    const rows = ceilingByRecipe(R.recipes, R.capacityInputs);
    const cap = deriveCapacity(seed, R.capacityInputs);
    expect(rows[0]).toMatchObject({ recipeCode: 'AMK-E-001', batchSize: cap.batchSize, cyclesPerDay: cap.cyclesPerDay, maxPortionsPerDay: cap.maxPortionsPerDay });
  });
});
