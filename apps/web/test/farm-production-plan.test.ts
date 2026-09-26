import { describe, it, expect } from 'vitest';
import { cropPlans as seedCropPlans, cropPlan as seed, type CropPlanDef } from '../src/app/(farm)/farm/_data/plan-data';
import { seedSubscribers, type SubscriberDef } from '../src/app/(farm)/farm/_data/subscribers';
import { seedSubscriptionCycles, seedFlatPlans } from '../src/app/(farm)/farm/_data/subscription-cycles';
import { resolveScenarioInputs } from '../src/app/(farm)/farm/_engine/scenario';
import { resolveSubscriberPickupPoints } from '../src/app/(farm)/farm/_engine/demand';
import { orderBook, datesBetween } from '../src/app/(farm)/farm/_engine/orders';
import { deriveCapacity, purchaseOrderForRun } from '../src/app/(farm)/farm/_engine';
import {
  requirementsFor,
  finishedGoodsOnHand,
  planProductionDay,
  planHorizon,
  productionDateFor,
  singleCropPlanRun,
  mergePurchaseLines,
  ceilingByCropPlan,
} from '../src/app/(farm)/farm/_engine/production-plan';

const MON = '2026-09-14';
const TUE = '2026-09-15';
const FRI = '2026-09-18';
const R = resolveScenarioInputs();
const PF = { 1: 1, 2: 1.5, 3: 1.5 };
const PRICES = { 1: 1000, 2: 1500, 3: 1600 };

/** The engine default subscribers with no term on file (every weekday), each with a flat plan copied from the saved cycles. */
function testSubscribers(): SubscriberDef[] {
  return seedSubscribers().map((c) => ({ ...c, pickupPoints: c.pickupPoints.map((s) => ({ ...s, calendar: [] })) }));
}
function cyclesWithPlans(subscribers: readonly SubscriberDef[], library: readonly CropPlanDef[]) {
  const saved = seedSubscriptionCycles(library, MON);
  return [...saved, ...seedFlatPlans(subscribers, saved)];
}

function book(from: string, to: string, extra: CropPlanDef[] = []) {
  const subscribers = testSubscribers();
  return orderBook({
    pickupPoints: resolveSubscriberPickupPoints(subscribers),
    subscribers,
    cycles: cyclesWithPlans(subscribers, [...seedCropPlans, ...extra]),
    orders: [],
    from,
    to,
    channelPriceCents: PRICES,
  });
}

describe('requirements from the order book', () => {
  it('explodes a distribution day into base units per crop plan at the channel unit factor', () => {
    const reqs = requirementsFor(book(TUE, TUE), R.cropPlans, PF);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].cropPlanCode).toBe('AMK-E-001');
    expect(reqs[0].units).toBe(1000);
    expect(reqs[0].baseUnits).toBe(1000);
    expect(reqs[0].inLibrary).toBe(true);
    expect(reqs[0].byChannel).toEqual([{ channel: 1, units: 1000, unitFactor: 1 }]);
  });

  it('a Phase 2 order counts 1.5 base units per unit', () => {
    const o = { ...book(TUE, TUE)[0], channel: 2, units: 100, key: 'x' };
    const reqs = requirementsFor([o], R.cropPlans, PF);
    expect(reqs[0].baseUnits).toBe(150);
  });
});

describe('finished goods on hand from records', () => {
  const sowings = [
    { sowingId: 'B-1', cropPlanCode: 'AMK-E-001', productionDate: '2026-09-01', goodUnits: 550 },
    { sowingId: 'B-2', cropPlanCode: 'AMK-E-001', productionDate: '2026-09-10', goodUnits: 550 },
  ];

  it('lots inside shelf life count; distributed orders draw oldest first', () => {
    const s = finishedGoodsOnHand({ sowings, consumed: [{ cropPlanCode: 'AMK-E-001', date: '2026-09-11', baseUnits: 600 }], shelfLifeDays: 30, asOf: MON });
    expect(s.byCropPlan['AMK-E-001']).toBe(500);
    expect(s.lots[0].remaining).toBe(0);
    expect(s.lots[1].remaining).toBe(500);
    expect(s.unmatchedByCropPlan).toEqual({});
  });

  it('a lot past shelf life is expired, not on hand; consumption with no stock is unmatched', () => {
    const s = finishedGoodsOnHand({ sowings, consumed: [{ cropPlanCode: 'AMK-E-002', date: MON, baseUnits: 10 }], shelfLifeDays: 7, asOf: MON });
    expect(s.byCropPlan['AMK-E-001']).toBe(550);
    expect(s.expiredByCropPlan['AMK-E-001']).toBe(550);
    expect(s.unmatchedByCropPlan['AMK-E-002']).toBe(10);
  });

  it('a record after the as-of date is not stock yet', () => {
    const s = finishedGoodsOnHand({ sowings, consumed: [], shelfLifeDays: 30, asOf: '2026-09-05' });
    expect(s.byCropPlan['AMK-E-001']).toBe(550);
  });
});

describe('a production day', () => {
  const cap = deriveCapacity(seed, R.capacityInputs);

  it('sizes whole sowings per crop plan net of stock and places them one cycle apart', () => {
    const reqs = requirementsFor(book(TUE, TUE), R.cropPlans, PF);
    const day = planProductionDay({ productionDate: MON, requirements: reqs, onHand: { 'AMK-E-001': 100 }, cropPlans: R.cropPlans, capacityInputs: R.capacityInputs, assumptions: R.assumptions });
    const run = day.runs[0];
    expect(run.net).toBe(900);
    expect(run.sowingSize).toBe(cap.sowingSize);
    expect(run.sowingsNeeded).toBe(Math.ceil(900 / cap.sowingSize));
    expect(run.produced).toBe(run.sowingsNeeded * cap.sowingSize);
    expect(run.closing).toBe(100 + run.produced - 1000);
    expect(day.fits).toBe(run.sowingsNeeded <= cap.cyclesPerDay);
    expect(day.schedule).toHaveLength(run.sowingsNeeded);
    expect(day.schedule[0].loadMin).toBe(cap.blackoutWindow.startMin);
    expect(day.schedule[1].loadMin - day.schedule[0].loadMin).toBe(cap.occupancyMinutes);
    expect(day.purchase.total).toBeCloseTo(purchaseOrderForRun(run.produced, seed, R.assumptions.yield.shrinkAllowance.value).total, 6);
  });

  it('cycles go to the largest requirement first and the rest is a named shortfall', () => {
    const second: CropPlanDef = { ...structuredClone(seed), code: 'AMK-E-002', name: 'Second', channels: [1] };
    const reqs = [
      { cropPlanCode: 'AMK-E-001', cropPlanName: 'A', units: 5000, baseUnits: 5000, byChannel: [], orders: 1, inLibrary: true },
      { cropPlanCode: 'AMK-E-002', cropPlanName: 'B', units: 1000, baseUnits: 1000, byChannel: [], orders: 1, inLibrary: true },
    ];
    const day = planProductionDay({ productionDate: MON, requirements: reqs, onHand: {}, cropPlans: [seed, second], capacityInputs: R.capacityInputs, assumptions: R.assumptions });
    expect(day.fits).toBe(false);
    expect(day.runs[0].sowingsScheduled).toBe(cap.cyclesPerDay);
    expect(day.runs[1].sowingsScheduled).toBe(0);
    expect(day.runs[1].shortfall).toBe(1000);
    expect(day.schedule.filter((b) => b.fits)).toHaveLength(cap.cyclesPerDay);
    expect(day.cyclesRequired).toBeGreaterThan(day.cyclesAvailable);

    // A second line in service is a second stream: twice the cycles, the same sowing on each,
    // the blackout ceiling one rack's load across every cycle — never a larger sowing.
    const two = planProductionDay({ productionDate: MON, requirements: reqs, onHand: {}, cropPlans: [seed, second], capacityInputs: R.capacityInputs, assumptions: R.assumptions, lines: 2 });
    expect(two.cyclesAvailable).toBe(2 * day.cyclesAvailable);
    expect(two.runs.map((r) => r.sowingSize)).toEqual(day.runs.map((r) => r.sowingSize));
    expect(two.schedule.every((b) => b.units === two.runs.find((r) => r.cropPlanCode === b.cropPlanCode)!.sowingSize)).toBe(true);
    expect(two.blackoutCeilingLb).toBe(cap.lbPerCycle * two.cyclesAvailable);
    expect(two.schedule.filter((b) => b.fits).length).toBe(Math.min(two.cyclesAvailable, two.cyclesRequired));
    // Two sowings load at the same minute — two racks, one each.
    const fits = two.schedule.filter((b) => b.fits);
    expect(fits.filter((b) => b.loadMin === fits[0]!.loadMin)).toHaveLength(2);
  });

  it('merges purchase lines across crop plans and re-rounds cases on the sum', () => {
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

describe('distribution date to production date', () => {
  it('is the last production weekday strictly before distribution', () => {
    expect(productionDateFor(TUE)).toBe(MON);
    expect(productionDateFor(MON)).toBe('2026-09-11');
    expect(productionDateFor('2026-09-20')).toBe(FRI);
  });
});

describe('the horizon', () => {
  it('rolls the seeded week: Friday makes Monday, overshoot carries, nothing expires inside shelf life', () => {
    const h = planHorizon({
      from: MON,
      to: FRI,
      book: book(MON, FRI),
      cropPlans: R.cropPlans,
      capacityInputs: R.capacityInputs,
      assumptions: R.assumptions,
      unitFactorByChannel: PF,
      openingLots: [],
      shelfLifeDays: 30,
    });
    expect(h.distributionDays.map((d) => d.date)).toEqual(datesBetween(MON, FRI));
    expect(h.productionDays[0].productionDate).toBe('2026-09-11');
    expect(h.totals.orderedUnits).toBe(5000);
    expect(h.totals.filledUnits).toBe(5000);
    expect(h.totals.expiredBase).toBe(0);
    expect(h.totals.producedBase).toBeGreaterThanOrEqual(5000);
    expect(h.totals.closingStockBase).toBeCloseTo(h.totals.producedBase - 5000, 6);
    expect(h.byChannel[0].share).toBe(1);
    expect(h.totals.daysThatDoNotFit).toBe(0);
    // Whole sowings overshoot; a later day with stock needs fewer sowings.
    const sowings = h.productionDays.map((p) => p.runs[0]?.sowingsScheduled ?? 0);
    expect(Math.min(...sowings)).toBeLessThan(Math.max(...sowings));
  });

  it('carries a row per date: what was made, what shipped, what is left — the calendar’s rows', () => {
    const h = planHorizon({
      from: MON,
      to: FRI,
      book: book(MON, FRI),
      cropPlans: R.cropPlans,
      capacityInputs: R.capacityInputs,
      assumptions: R.assumptions,
      unitFactorByChannel: PF,
      openingLots: [],
      shelfLifeDays: 30,
    });
    expect(h.byDate.map((r) => r.date)).toEqual(datesBetween(MON, FRI));
    // Rows are the window only: Monday's orders are made the Friday before it, outside the window.
    expect(h.byDate.every((r) => r.date >= MON && r.date <= FRI)).toBe(true);
    const made = h.byDate.reduce((s, r) => s + r.unitsProduced, 0);
    const inWindow = h.productionDays.filter((p) => p.productionDate >= MON && p.productionDate <= FRI).reduce((s, p) => s + p.totalProduced, 0);
    expect(made).toBeCloseTo(inWindow, 6);
    expect(made).toBeLessThan(h.totals.producedBase);
    expect(h.byDate.reduce((s, r) => s + r.filledBase, 0)).toBeCloseTo(h.totals.filledBase, 6);
    expect(h.byDate.reduce((s, r) => s + r.expiredBase, 0)).toBeCloseTo(h.totals.expiredBase, 6);
    // The last date's closing stock is what the horizon ends holding.
    expect(h.byDate[h.byDate.length - 1]!.closingStockBase).toBeCloseTo(h.totals.closingStockBase, 6);
    const day = h.byDate.find((r) => r.sowings > 0)!;
    expect(day.utilisation).toBeCloseTo(day.cyclesUsed / day.cyclesAvailable, 9);
    expect(h.byDate.every((r) => r.fits)).toBe(true);
  });

  it('stock that nothing draws carries its expiry on the date it reaches shelf life', () => {
    // A crop plan with no order in the window: FIFO cannot draw it, so it expires where it sits.
    const early = planHorizon({
      from: MON,
      to: FRI,
      book: book(MON, FRI),
      cropPlans: R.cropPlans,
      capacityInputs: R.capacityInputs,
      assumptions: R.assumptions,
      unitFactorByChannel: PF,
      openingLots: [{ sowingId: 'old', cropPlanCode: 'AMK-E-007', produced: '2026-08-01', expires: '2026-09-14', qtyProduced: 300, remaining: 300 }],
      shelfLifeDays: 30,
    });
    const expired = early.byDate.filter((r) => r.expiredBase > 0);
    expect(expired).toHaveLength(1);
    expect(expired[0]!.date).toBe('2026-09-15');
    expect(expired[0]!.expiredBase).toBe(300);
    expect(early.totals.expiredBase).toBe(300);
    expect(early.byDate.every((r) => r.fits)).toBe(true);
  });

  it('stock that expires before the distribution a production day serves is not counted as on hand (the weekend gap)', () => {
    // Friday makes Monday's orders. A lot that expires on Saturday is inside shelf life on Friday
    // but not on Monday, so Friday must still sow for Monday.
    const NEXT_MON = '2026-09-21';
    const h = planHorizon({
      from: NEXT_MON,
      to: NEXT_MON,
      book: book(NEXT_MON, NEXT_MON),
      cropPlans: R.cropPlans,
      capacityInputs: R.capacityInputs,
      assumptions: R.assumptions,
      unitFactorByChannel: PF,
      openingLots: [{ sowingId: 'wkend', cropPlanCode: 'AMK-E-001', produced: '2026-08-20', expires: '2026-09-19', qtyProduced: 5000, remaining: 5000 }],
      shelfLifeDays: 30,
    });
    expect(h.productionDays[0]!.productionDate).toBe('2026-09-18');
    expect(h.productionDays[0]!.runs[0]!.onHand).toBe(0);
    expect(h.distributionDays[0]!.unfilledBase).toBe(0);
  });

  it('opening stock is drawn first and unfilled orders are reported when the racks run out', () => {
    const cap = deriveCapacity(seed, R.capacityInputs);
    const subscribers = testSubscribers();
    subscribers[0].pickupPoints[0].services[0].picks = [{ id: 'big', effectiveDate: '2026-01-01', units: cap.maxUnitsPerDay * 3, notes: null }];
    const big = orderBook({ pickupPoints: resolveSubscriberPickupPoints(subscribers), subscribers, cycles: cyclesWithPlans(subscribers, seedCropPlans), orders: [], from: TUE, to: TUE, channelPriceCents: PRICES });
    const h = planHorizon({ from: TUE, to: TUE, book: big, cropPlans: R.cropPlans, capacityInputs: R.capacityInputs, assumptions: R.assumptions, unitFactorByChannel: PF, openingLots: [{ sowingId: 'x', cropPlanCode: 'AMK-E-001', produced: '2026-09-10', expires: '2026-10-10', qtyProduced: 200, remaining: 200 }], shelfLifeDays: 30 });
    expect(h.totals.daysThatDoNotFit).toBe(1);
    expect(h.distributionDays[0].filledBase).toBe(200 + cap.maxUnitsPerDay);
    expect(h.distributionDays[0].unfilledBase).toBeGreaterThan(0);
    expect(h.byChannel[0].share).toBeLessThan(1);
    expect(h.byChannel[0].filledUnits).toBeCloseTo(h.distributionDays[0].filledBase, 6);
  });
});

describe('a single crop plan run', () => {
  it('runs a crop plan at a channel unit and price through sowings, weights, labor and contribution', () => {
    const run = singleCropPlanRun({ cropPlan: seed, units: 1000, unitFactor: 1, premiumFactor: 1, pricePerUnit: 10, commissionShare: 0, openingInventory: 0, capacityInputs: R.capacityInputs, assumptions: R.assumptions });
    const cap = deriveCapacity(seed, R.capacityInputs);
    expect(run.sowings).toBe(Math.ceil(1000 / cap.sowingSize));
    expect(run.produced).toBe(run.sowings * cap.sowingSize);
    expect(run.revenue).toBe(10_000);
    expect(run.contribution).toBeCloseTo(run.revenue - run.inputCostSold - run.laborCost - run.packaging - run.distribution, 6);
    expect(run.commission).toBe(0);
    expect(run.carriedForward).toBeCloseTo(run.purchase.total - run.inputCostStandard, 6);
    expect(run.blackoutLb).toBeLessThan(run.harvestedLb);
  });

  it('a Phase 3 run carries the marketplace commission and the unit and premium factors', () => {
    const base = singleCropPlanRun({ cropPlan: seed, units: 100, unitFactor: 1, premiumFactor: 1, pricePerUnit: 16, commissionShare: 0, openingInventory: 0, capacityInputs: R.capacityInputs, assumptions: R.assumptions });
    const p3 = singleCropPlanRun({ cropPlan: seed, units: 100, unitFactor: 1.5, premiumFactor: 1.2, pricePerUnit: 16, commissionShare: 0.25, openingInventory: 0, capacityInputs: R.capacityInputs, assumptions: R.assumptions });
    expect(p3.baseUnits).toBe(150);
    expect(p3.commission).toBe(400);
    expect(p3.inputCostPerUnit).toBeCloseTo(base.inputCostPerUnit * 1.5 * 1.2, 9);
  });

  it('opening inventory nets the requirement and can make the run zero sowings', () => {
    const run = singleCropPlanRun({ cropPlan: seed, units: 100, unitFactor: 1, premiumFactor: 1, pricePerUnit: 10, commissionShare: 0, openingInventory: 500, capacityInputs: R.capacityInputs, assumptions: R.assumptions });
    expect(run.sowings).toBe(0);
    expect(run.produced).toBe(0);
    expect(run.closing).toBe(400);
    expect(run.laborCost).toBe(0);
  });
});

describe('ceiling by crop plan', () => {
  it('reports each crop plan on its own sowing size against the same cycles', () => {
    const rows = ceilingByCropPlan(R.cropPlans, R.capacityInputs);
    const cap = deriveCapacity(seed, R.capacityInputs);
    expect(rows[0]).toMatchObject({ cropPlanCode: 'AMK-E-001', sowingSize: cap.sowingSize, cyclesPerDay: cap.cyclesPerDay, maxUnitsPerDay: cap.maxUnitsPerDay });
  });
});
