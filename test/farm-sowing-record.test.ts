/**
 * MicroFarm — the sowing record on the grow model (outline §4 Sowing): the prefill at standard,
 * the lot per variety, the mass balance, and the control points as recorded, a gap or failed.
 */

import { describe, expect, it } from 'vitest';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { VARIETY_BY_KEY } from '@/data/varieties';
import { projectCropPlan } from '@/engine/grow-plan-bridge';
import { massBalance } from '@/engine/sowing';
import { standardSowingRecordPrefill, toSowingExecution } from '@/engine/actuals';
import { EMPTY_STAGE_RECORDS, growLotCode, growSowingPrefill, isGrowSowing, sowingRecordChecks } from '@/engine/sowing-record';
import { productionSowingLedger } from '@/engine/production-ledger';

const broc = projectCropPlan(growPlanSeed.find((p) => p.code === 'BROC-01')!);
const mung = projectCropPlan(growPlanSeed.find((p) => p.code === 'MUNG-01')!);

describe('the prefill at standard', () => {
  it('one lot per variety in grams: the seed issued, the harvest from the record, packed as harvested; the lot is the variety on the day', () => {
    const r = growSowingPrefill(broc, '2027-03-01', 1, 20, 'rack', 'B-270301-01', 'BROC-01@lib', 0.03);
    expect(r.lots).toHaveLength(1);
    const l = r.lots[0]!;
    expect(l.variety).toBe(VARIETY_BY_KEY['broccoli']!.name);
    expect(l.varietyKey).toBe('broccoli');
    expect(l.outputLotCode).toBe('BROC-01-270301-BROC-01');
    expect(growLotCode('BROC-01', '2027-03-01', VARIETY_BY_KEY['broccoli']!, 3)).toBe('BROC-01-270301-BROC-03');
    expect(l.seedIssuedG).toBeCloseTo(40 * 20 * 1.03, 9);
    expect(l.shrinkAllowanceG).toBeCloseTo(40 * 20 * 0.03, 9);
    expect(l.harvestedG).toBeCloseTo(250 * 20, 9);
    expect(l.packedG).toBe(l.harvestedG);
    expect(l.seedLotCode).toBe('not recorded');
    expect(r.issues.some((i) => i.kind === 'medium' && i.input.startsWith('Medium: '))).toBe(true);
    expect(r.issues.every((i) => i.kind === 'medium' || i.kind === 'nutrient')).toBe(true);
    expect(r.format).toBe('flat-1020');
    expect(r.traysSown).toBe(20);
    expect(r.growUnitKey).toBe('rack');
    expect(r.stageRecords).toEqual(EMPTY_STAGE_RECORDS);
    expect(isGrowSowing(r)).toBe(true);
  });

  it('the generic prefill hands a grow plan to the grow prefill', () => {
    const r = standardSowingRecordPrefill('2027-03-01', 2, 20, broc, 0.03);
    expect(isGrowSowing(r)).toBe(true);
    expect(r.sowingId).toBe('B-270301-02');
    expect(r.plannedUnits).toBe(20);
  });

  it('balances at standard and still balances when trays are removed at the harvest check', () => {
    const r = growSowingPrefill(broc, '2027-03-01', 1, 20, null, 'B-270301-01', 'v', 0.03);
    expect(massBalance(toSowingExecution({ ...r, id: 'x', closedAt: null })).balanced).toBe(true);
    const l = r.lots[0]!;
    const removedG = l.harvestedG * (2 / 20);
    const checked = { ...r, goodUnits: 18, lots: [{ ...l, packedG: l.harvestedG - removedG, scrap: [...l.scrap, { reason: 'CONTAMINATION' as const, g: removedG, stage: 'PACK' as const, note: 'mold' }] }] };
    const mb = massBalance(toSowingExecution({ ...checked, id: 'x', closedAt: null }));
    expect(mb.balanced).toBe(true);
    expect(mb.abnormalScrapG).toBeCloseTo(removedG, 9);
    const ledger = productionSowingLedger(toSowingExecution({ ...checked, id: 'x', closedAt: null }), { overhead: { ratePerUnit: 0, normalCapacityUnits: 1 } as never, purchaseOrderCost: 0 }, broc);
    expect(ledger.balanced).toBe(true);
    expect(ledger.amounts.traysSown).toBe(20);
    expect(ledger.amounts.unitsProduced).toBe(18);
  });

  it('a jar sows one lot on the sprout schedule, on the Food Traceability List', () => {
    const r = growSowingPrefill(mung, '2027-03-02', 1, 60, null, 'B-270302-01', 'v', 0);
    expect(r.format).toBe('pint-jar');
    expect(r.lots[0]!.onFoodTraceabilityList).toBe(true);
    expect(r.lots[0]!.harvestedG).toBeCloseTo(256 * 60, 9);
  });
});

describe('the control points on a record', () => {
  it('an empty record is all gaps; a filled one is recorded; a positive spent-water result fails', () => {
    const empty = sowingRecordChecks(EMPTY_STAGE_RECORDS, broc.plan);
    expect(empty.points.map((c) => [c.point.id, c.status])).toEqual([['seed-sanitation', 'gap'], ['temperature-humidity', 'gap'], ['harvest-check', 'gap']]);
    expect(empty.complete).toBe(false);
    expect(empty.spentWater).toBeNull();
    const filled = sowingRecordChecks({ seedTreatment: { method: 'calcium hypochlorite', concentration: '20,000 ppm', contactMinutes: 15, seedLot: 'TLM-45262-A', by: 'Rob' }, spentWaterTest: null, readings: [{ at: '2027-03-03', tempF: 70, rhPct: 55, by: 'Rob' }], harvestCheck: { traysPassed: 20, traysRemoved: 0, note: '' } }, broc.plan);
    expect(filled.complete).toBe(true);
    expect(filled.gaps).toEqual([]);
    const jar = sowingRecordChecks({ ...EMPTY_STAGE_RECORDS, spentWaterTest: { sampledAtHours: 48, listeria: false, salmonella: true, ecoliO157: false, sampledOn: null, resultOn: '2027-03-05', lab: 'x' } }, mung.plan);
    expect(jar.points.find((c) => c.point.id === 'spent-water-test')!.status).toBe('failed');
    expect(jar.spentWater?.pass).toBe(false);
    const early = sowingRecordChecks({ ...EMPTY_STAGE_RECORDS, spentWaterTest: { sampledAtHours: 24, listeria: false, salmonella: false, ecoliO157: false, sampledOn: null, resultOn: null, lab: '' } }, mung.plan);
    expect(early.points.find((c) => c.point.id === 'spent-water-test')!.status).toBe('gap');
  });
});
