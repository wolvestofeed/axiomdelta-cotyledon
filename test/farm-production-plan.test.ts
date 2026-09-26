/**
 * MicroFarm — production planning on the grow model: requirements from the order book, finished
 * goods from the records, a production day, the horizon and a single run, on the seed grow plans.
 */

import { describe, it, expect } from 'vitest';
import { resolveScenarioInputs } from '@/engine/scenario';
import { datesBetween } from '@/engine/orders';
import { deriveCapacity, purchaseOrderForRun } from '@/engine';
import {
  requirementsFor,
  finishedGoodsOnHand,
  planProductionDay,
  planHorizon,
  productionDateFor,
  singleCropPlanRun,
  mergePurchaseLines,
} from '@/engine/production-plan';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { VARIETY_BY_KEY } from '@/data/varieties';
import { projectCropPlan } from '@/engine/grow-plan-bridge';
import { sowDateFor } from '@/engine/grow-calendar';
import type { GrowUnit } from '@/engine/grow-capacity';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';
import type { BookOrder } from '@/engine/orders';

const lib = growPlanSeed.map((p) => projectCropPlan(p));
const G = resolveScenarioInputs({}, lib);
const plan = (code: string) => G.cropPlans.find((p) => p.code === code)!;
const growPlan = (code: string) => growPlanSeed.find((p) => p.code === code)!;
const PF = { 1: 1, 2: 1.5, 3: 1.5 };
const order = (date: string, code: string, unitsOrdered: number, channel = 1): BookOrder => ({
  key: `${date}|p|s|${code}|${channel}`, id: null, orderDate: date, subscriberId: 'c', subscriberName: 'C', subscriberPickupPointId: 'p', pickupPointName: 'P', subscriberServiceId: 's', serviceName: null, distributionPickupPointId: null,
  channel, cropPlanCode: code, cropPlanName: code, units: unitsOrdered, pricePerUnitCents: 2000, status: 'forecast', source: 'cycle', subscriptionCycleId: null, notes: null, editable: true,
} as unknown as BookOrder);
// 2027-03-22 is a Monday.
const DIST = '2027-03-22';
const shrink = G.assumptions.yield.shrinkAllowance.value;
const plan30 = (book: BookOrder[], openingLots: Parameters<typeof planHorizon>[0]['openingLots'] = [], shelfLifeDays = 30) =>
  planHorizon({ from: '2027-03-01', to: '2027-03-31', book, cropPlans: G.cropPlans, capacityInputs: G.capacityInputs, assumptions: G.assumptions, cropPlanAssumptions: G.cropPlanAssumptions, unitFactorByChannel: PF, openingLots, shelfLifeDays });

describe('requirements from the order book', () => {
  it('explodes a distribution day into base units per plan at the channel unit factor, largest first', () => {
    const reqs = requirementsFor([order(DIST, 'PEA-01', 5), order(DIST, 'BROC-01', 20), order(DIST, 'BROC-01', 10)], G.cropPlans, PF);
    expect(reqs.map((r) => [r.cropPlanCode, r.units, r.baseUnits, r.orders, r.inLibrary])).toEqual([['BROC-01', 30, 30, 2, true], ['PEA-01', 5, 5, 1, true]]);
    expect(reqs[0]!.byChannel).toEqual([{ channel: 1, units: 30, unitFactor: 1 }]);
  });

  it('an order on a channel the plan is not authored for counts at that channel\'s unit factor; a code off the library is named', () => {
    expect(requirementsFor([order(DIST, 'BROC-01', 100, 2)], G.cropPlans, PF)[0]!.baseUnits).toBe(150);
    expect(requirementsFor([order(DIST, 'NONE-01', 10)], G.cropPlans, PF)[0]!.inLibrary).toBe(false);
  });
});

describe('finished goods on hand from records', () => {
  // Records of a plan off the library are stock from their production date; a grow plan's from its harvest.
  const sowings = [
    { sowingId: 'B-1', cropPlanCode: 'TEST-01', productionDate: '2026-09-01', goodUnits: 550 },
    { sowingId: 'B-2', cropPlanCode: 'TEST-01', productionDate: '2026-09-10', goodUnits: 550 },
  ];

  it('lots inside shelf life count; distributed orders draw oldest first', () => {
    const s = finishedGoodsOnHand({ sowings, consumed: [{ cropPlanCode: 'TEST-01', date: '2026-09-11', baseUnits: 600 }], shelfLifeDays: 30, asOf: '2026-09-14', cropPlans: G.cropPlans });
    expect(s.byCropPlan['TEST-01']).toBe(500);
    expect(s.lots[0].remaining).toBe(0);
    expect(s.lots[1].remaining).toBe(500);
    expect(s.unmatchedByCropPlan).toEqual({});
  });

  it('a lot past shelf life is expired, not on hand; consumption with no stock is unmatched', () => {
    const s = finishedGoodsOnHand({ sowings, consumed: [{ cropPlanCode: 'TEST-02', date: '2026-09-14', baseUnits: 10 }], shelfLifeDays: 7, asOf: '2026-09-14', cropPlans: G.cropPlans });
    expect(s.byCropPlan['TEST-01']).toBe(550);
    expect(s.expiredByCropPlan['TEST-01']).toBe(550);
    expect(s.unmatchedByCropPlan['TEST-02']).toBe(10);
  });

  it('a record after the as-of date is not stock yet', () => {
    const s = finishedGoodsOnHand({ sowings, consumed: [], shelfLifeDays: 30, asOf: '2026-09-05', cropPlans: G.cropPlans });
    expect(s.byCropPlan['TEST-01']).toBe(550);
  });
});

describe('a production day', () => {
  const broc = plan('BROC-01');
  const cap = deriveCapacity(broc, G.capacityInputs);
  const req = (code: string, baseUnits: number) => ({ cropPlanCode: code, cropPlanName: code, units: baseUnits, baseUnits, byChannel: [], orders: 1, inLibrary: true });

  it('sizes whole sowings of what one grow unit takes, net of stock', () => {
    const day = planProductionDay({ productionDate: '2027-03-11', requirements: [req('BROC-01', 30)], onHand: { 'BROC-01': 5 }, cropPlans: G.cropPlans, capacityInputs: G.capacityInputs, assumptions: G.assumptions });
    const run = day.runs[0]!;
    expect(run.net).toBe(25);
    expect(run.sowingSize).toBe(cap.grow!.sowingTrays);
    expect(run.sowingsNeeded).toBe(Math.ceil(25 / cap.sowingSize));
    expect(run.produced).toBe(run.sowingsScheduled * cap.sowingSize);
    expect(run.closing).toBe(5 + run.produced - 30);
    expect(day.cyclesAvailable).toBe(cap.grow!.unitCount);
    expect(day.purchase.total).toBeCloseTo(purchaseOrderForRun(run.produced, broc, shrink).total, 6);
  });

  it('a sowing the grow units refuse is a named shortfall, in requirement order', () => {
    let room = 1;
    const day = planProductionDay({ productionDate: '2027-03-11', requirements: [req('BROC-01', 30), req('PEA-01', 20)], onHand: {}, cropPlans: G.cropPlans, capacityInputs: G.capacityInputs, assumptions: G.assumptions, placeSowing: () => room-- > 0 });
    expect(day.fits).toBe(false);
    expect(day.runs.map((r) => [r.cropPlanCode, r.sowingsScheduled, r.shortfall])).toEqual([['BROC-01', 1, 10], ['PEA-01', 0, 20]]);
    expect(day.totalShortfall).toBe(30);
  });

  it('merges purchase lines across plans and re-rounds packs on the sum', () => {
    const a = purchaseOrderForRun(40, plan('BROC-01')).lines;
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
    expect(productionDateFor('2026-09-15')).toBe('2026-09-14');
    expect(productionDateFor('2026-09-14')).toBe('2026-09-11');
    expect(productionDateFor('2026-09-20')).toBe('2026-09-18');
  });
});

describe('the horizon', () => {
  it('carries a row per date that ties to the totals: what was made, what shipped, what expired, what is left', () => {
    const h = plan30([order(DIST, 'BROC-01', 10), order('2027-03-31', 'MUNG-01', 30)]);
    expect(h.byDate.map((r) => r.date)).toEqual([...h.byDate.map((r) => r.date)].sort());
    expect(h.byDate.every((r) => r.date >= '2027-03-01' && r.date <= '2027-03-31')).toBe(true);
    const made = h.byDate.reduce((s, r) => s + r.unitsProduced, 0);
    expect(made).toBeCloseTo(h.productionDays.filter((p) => p.productionDate >= '2027-03-01').reduce((s, p) => s + p.totalProduced, 0), 6);
    expect(h.byDate.reduce((s, r) => s + r.filledBase, 0)).toBeCloseTo(h.totals.filledBase, 6);
    expect(h.byDate.reduce((s, r) => s + r.expiredBase, 0)).toBeCloseTo(h.totals.expiredBase, 6);
    expect(h.byDate[h.byDate.length - 1]!.closingStockBase).toBeCloseTo(h.totals.closingStockBase, 6);
    expect(h.totals.orderedUnits).toBe(40);
    expect(h.totals.filledUnits).toBe(40);
    expect(datesBetween('2027-03-01', '2027-03-31')).toContain(DIST);
  });

  it('stock that nothing draws expires where it sits, once, on a date past its shelf life', () => {
    const h = plan30([order(DIST, 'BROC-01', 20)], [{ sowingId: 'old', cropPlanCode: 'SUN-01', produced: '2027-02-20', expires: '2027-03-05', qtyProduced: 30, remaining: 30 }]);
    const expired = h.byDate.filter((r) => r.expiredBase > 0);
    expect(expired).toHaveLength(1);
    expect(expired[0]!.date > '2027-03-05').toBe(true);
    expect(expired[0]!.expiredBase).toBe(30);
    expect(h.totals.expiredBase).toBe(30);
  });

  it('stock that expires before the distribution a sow day serves is not counted as on hand', () => {
    const h = plan30([order(DIST, 'BROC-01', 20)], [{ sowingId: 'short', cropPlanCode: 'BROC-01', produced: '2027-03-01', expires: '2027-03-20', qtyProduced: 20, remaining: 20 }]);
    expect(h.productionDays[0]!.runs[0]!.onHand).toBe(0);
    expect(h.productionDays[0]!.runs[0]!.produced).toBe(20);
    expect(h.distributionDays[0]!.unfilledBase).toBe(0);
  });

  it('opening stock is drawn first, and what the grow units cannot make is unfilled and shared across channels', () => {
    const h = plan30([order(DIST, 'BROC-01', 50)], [{ sowingId: 'x', cropPlanCode: 'BROC-01', produced: '2027-03-01', expires: '2027-03-30', qtyProduced: 10, remaining: 10 }]);
    const run = h.productionDays[0]!.runs[0]!;
    expect(run.onHand).toBe(10);
    expect(run.sowingsNeeded).toBe(2);
    expect(run.sowingsScheduled).toBe(1);
    expect(h.totals.daysThatDoNotFit).toBe(1);
    expect(h.distributionDays[0]!.filledBase).toBe(10 + run.produced);
    expect(h.distributionDays[0]!.unfilledBase).toBe(50 - 10 - run.produced);
    expect(h.byChannel[0]!.share).toBeCloseTo((10 + run.produced) / 50, 9);
  });
});

describe('a single plan run', () => {
  const broc = plan('BROC-01');
  const run = (over: Partial<Parameters<typeof singleCropPlanRun>[0]>) => singleCropPlanRun({ cropPlan: broc, units: 100, unitFactor: 1, premiumFactor: 1, pricePerUnit: 16, commissionShare: 0, openingInventory: 0, capacityInputs: G.capacityInputs, assumptions: G.assumptions, ...over });

  it('a Phase 3 run carries the marketplace commission and the unit and premium factors', () => {
    const p3 = run({ unitFactor: 1.5, premiumFactor: 1.2, commissionShare: 0.25 });
    expect(p3.baseUnits).toBe(150);
    expect(p3.commission).toBe(400);
    expect(p3.inputCostPerUnit).toBeCloseTo(run({}).inputCostPerUnit * 1.5 * 1.2, 9);
    expect(p3.contribution).toBeCloseTo(p3.revenue - p3.inputCostSold - p3.laborCost - p3.packaging - p3.distribution - p3.commission, 6);
  });

  it('opening inventory nets the requirement and can make the run zero sowings', () => {
    const r = run({ units: 10, openingInventory: 30 });
    expect(r.sowings).toBe(0);
    expect(r.produced).toBe(0);
    expect(r.closing).toBe(20);
    expect(r.laborCost).toBe(0);
  });
});

describe('the grow model', () => {
  const horizon = (book: BookOrder[], R = G, growUnits?: GrowUnit[]) =>
    planHorizon({ from: '2027-03-01', to: '2027-03-31', book, cropPlans: R.cropPlans, capacityInputs: R.capacityInputs, assumptions: R.assumptions, cropPlanAssumptions: R.cropPlanAssumptions, unitFactorByChannel: { 1: 1 }, openingLots: [], shelfLifeDays: 3, growUnits });

  it('the run sizes whole sowings in trays of one grow unit and packs what it harvests', () => {
    const broc = plan('BROC-01');
    const cap = deriveCapacity(broc, G.capacityInputs, 1);
    expect(cap.sowingSize).toBe(cap.grow!.sowingTrays);
    const run = singleCropPlanRun({ cropPlan: broc, units: cap.sowingSize + 10, unitFactor: 1, premiumFactor: 1, pricePerUnit: 20, commissionShare: 0, openingInventory: 0, capacityInputs: G.capacityInputs, assumptions: G.assumptions });
    expect(run.sowings).toBe(2);
    expect(run.produced).toBe(2 * cap.grow!.sowingTrays);
    expect(run.closing).toBe(run.produced - run.baseUnits);
    expect(run.cyclesAvailable).toBe(cap.grow!.unitCount);
    expect(run.harvestedLb).toBeCloseTo((run.produced * VARIETY_BY_KEY['broccoli']!.harvestGramsPer1020.value) / 453.59237, 6);
    expect(run.packedLb).toBeCloseTo(run.harvestedLb, 9);
    expect(run.purchasedLb).toBeLessThan(run.harvestedLb);
  });

  it('an order is made on its plan\'s sow date and its sowing carries the distribution date', () => {
    const h = horizon([order(DIST, 'BROC-01', 20)]);
    const sowDate = sowDateFor(growPlan('BROC-01'), DIST);
    expect(sowDate).not.toBe(productionDateFor(DIST));
    expect(h.productionDays.map((p) => p.productionDate)).toEqual([sowDate]);
    expect(h.productionDays[0]!.distributionDates).toEqual([DIST]);
    expect(h.distributionDays[0]!.productionDate).toBe(sowDate);
    const [sowing] = h.growCalendar!.sowings;
    expect(sowing).toMatchObject({ cropPlanCode: 'BROC-01', sowDate, distributionDate: DIST, trays: 20, placed: true });
  });

  it('plans with different days to harvest sow on different days for one distribution date', () => {
    const rack = G.capacityInputs.growUnits![0]!;
    const h = horizon([order(DIST, 'BROC-01', 20), order(DIST, 'PEA-01', 20), order(DIST, 'MUNG-01', 60)], G, [{ ...rack, units: 3 }]);
    const sowOf = (code: string) => sowDateFor(growPlan(code), DIST);
    expect(new Set(['BROC-01', 'PEA-01', 'MUNG-01'].map(sowOf)).size).toBe(3);
    expect(h.productionDays.map((p) => p.productionDate)).toEqual(['PEA-01', 'BROC-01', 'MUNG-01'].map(sowOf));
    for (const p of h.productionDays) {
      expect(p.runs).toHaveLength(1);
      expect(sowOf(p.runs[0]!.cropPlanCode)).toBe(p.productionDate);
      expect(p.distributionDates).toEqual([DIST]);
      expect(p.fits).toBe(true);
    }
    // The distribution day names the earliest sow date among its orders.
    expect(h.distributionDays[0]!.productionDate).toBe(sowOf('PEA-01'));
    expect(h.growCalendar!.sowings.every((s) => s.placed && s.distributionDate === DIST)).toBe(true);
  });

  it('a requirement past the grow units\' room is a shortfall with an unplaced sowing', () => {
    const h = horizon([order(DIST, 'BROC-01', 30)]);
    const day = h.productionDays[0]!;
    const run = day.runs[0]!;
    expect(run.sowingsNeeded).toBe(2);
    expect(run.sowingsScheduled).toBe(1);
    expect(run.produced).toBe(20);
    expect(run.shortfall).toBe(10);
    expect(day.fits).toBe(false);
    expect(h.totals.daysThatDoNotFit).toBe(1);
    const sowings = h.growCalendar!.sowings;
    expect(sowings.map((s) => s.placed)).toEqual([true, false]);
    expect(sowings[1]!.distributionDate).toBe(DIST);
    expect(h.growCalendar!.findings.map((f) => f.kind)).toEqual(['over-capacity']);
  });

  it('a grow sowing is stock from its first harvest day, and its shelf life counts from there', () => {
    const h = planHorizon({ from: '2027-03-01', to: '2027-03-31', book: [order(DIST, 'BROC-01', 10)], cropPlans: G.cropPlans, capacityInputs: G.capacityInputs, assumptions: G.assumptions, cropPlanAssumptions: G.cropPlanAssumptions, unitFactorByChannel: { 1: 1 }, openingLots: [], shelfLifeDays: 7 });
    const harvest = h.growCalendar!.sowings[0]!.harvestFrom;
    expect(harvest).toBe(DIST);
    // On the shelves from the sow date to the harvest: no stock.
    expect(h.byDate.filter((r) => r.date < harvest).every((r) => r.closingStockBase === 0)).toBe(true);
    expect(h.distributionDays[0]).toMatchObject({ filledBase: 10, unfilledBase: 0 });
    expect(h.byDate.find((r) => r.date === DIST)!.closingStockBase).toBe(10);
    // Seven days from the sow date the lot would have expired before the distribution; from the harvest
    // it fills it, and the overshoot expires inside the window.
    expect(h.totals.expiredBase).toBe(10);
    expect(h.totals.closingStockBase).toBe(0);
  });

  it('a closed grow sowing record is stock from its first harvest day; an order before it finds none', () => {
    const sowDate = sowDateFor(growPlan('BROC-01'), DIST);
    const records = [{ sowingId: 'G-1', cropPlanCode: 'BROC-01', productionDate: sowDate, goodUnits: 20 }];
    const onShelf = finishedGoodsOnHand({ sowings: records, consumed: [], shelfLifeDays: 7, asOf: '2027-03-15', cropPlans: G.cropPlans });
    expect(onShelf.lots).toHaveLength(0);
    const harvested = finishedGoodsOnHand({ sowings: records, consumed: [{ cropPlanCode: 'BROC-01', date: '2027-03-15', baseUnits: 20 }], shelfLifeDays: 7, asOf: DIST, cropPlans: G.cropPlans });
    expect(harvested.lots[0]).toMatchObject({ produced: DIST, expires: '2027-03-29', remaining: 20 });
    expect(harvested.byCropPlan['BROC-01']).toBe(20);
    expect(harvested.unmatchedByCropPlan['BROC-01']).toBe(20);
  });

  it('grow capacity reads no rack minutes: the sowings a day are the grow units that take the plan', () => {
    const broc = plan('BROC-01');
    const cap = deriveCapacity(broc, G.capacityInputs, 1);
    expect(cap.cyclesPerDay).toBe(cap.grow!.unitCount);
    expect([cap.loadMinutes, cap.blackoutMinutes, cap.unloadMinutes]).toEqual([0, 0, 0]);
    expect(cap.blackoutWindow).toMatchObject({ startMin: G.capacityInputs.operatingOpenMin.value, endMin: G.capacityInputs.operatingCloseMin.value, cycles: cap.grow!.unitCount, loadBeforeCloseExtraCycle: false });
    const slower = { ...G.capacityInputs, loadMinutes: { ...G.capacityInputs.loadMinutes, value: 600 }, unloadMinutes: { ...G.capacityInputs.unloadMinutes, value: 600 } };
    expect(deriveCapacity(broc, slower, 1)).toEqual(cap);
  });

  it('a grow sow day\'s labor is the plan\'s own sowing stream: no rack task and no Phase 1-era study task', () => {
    const h = horizon([order(DIST, 'BROC-01', 20)]);
    const labor = h.productionDays[0]!.labor;
    expect(labor.placed).toEqual([]);
    const study = estimatedTimeStudy(plan('BROC-01'), 20);
    const sowingLines = study.lines.filter((l) => l.stream === 'sowing');
    expect(labor.unplaced.map((t) => t.task).sort()).toEqual(sowingLines.map((l) => l.task).sort());
    expect(labor.totalStaffHours).toBeCloseTo(sowingLines.reduce((t, l) => t + l.laborMinutes, 0) / 60, 9);
    expect(labor.sowings).toBe(1);
    expect(labor.units).toBe(20);
    // A stored study stands over the estimate.
    const doc = { id: 's', cropPlanCode: 'BROC-01', adoptedAt: '2027-01-01T00:00:00Z', adoptedBy: null, source: 'user_built' as const, ...study, basis: 'observed' as const, lines: study.lines.map((l) => (l.stream === 'sowing' ? { ...l, laborMinutes: l.laborMinutes * 2 } : l)) };
    const withStudy = planHorizon({ from: '2027-03-01', to: '2027-03-31', book: [order(DIST, 'BROC-01', 20)], cropPlans: G.cropPlans, capacityInputs: G.capacityInputs, assumptions: G.assumptions, unitFactorByChannel: { 1: 1 }, openingLots: [], shelfLifeDays: 3, studies: [doc] as never });
    expect(withStudy.productionDays[0]!.labor.totalStaffHours).toBeCloseTo(labor.totalStaffHours * 2, 9);
  });
});
