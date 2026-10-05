/**
 * Cotyledon — the footprint of one tray (Phase 5, step 3). Golden values are arithmetic on the
 * tagged rows in `emission-factors.ts` and the fixture and regime records; the worked check in
 * the phase file is the first.
 */

import { describe, it, expect } from 'vitest';
import { trayFootprint, regimeEnergyTable, defaultFreightLegs, weakest, WARM_KG_PER_KG, L_PER_FL_OZ, SQ_M_PER_SQ_IN } from '@/engine/tray-footprint';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { costPlan } from '@/engine/grow-costing';
import { inputFactors, gridFactorERCT, warmYardTrimmings, freightFactorsHub, KG_PER_LB } from '@/data/emission-factors';
import { lcaOptions } from '@/data/lca-options';
import { LIGHT_FIXTURES, REGIME_BY_KEY, HEMP_MAT_GRADE_G_PER_M2 } from '@/data/inputs-catalog';
import { TRAY_FORMAT_BY_KEY } from '@/data/tray-formats';
import { resolveScenarioInputs } from '@/engine/scenario';

const plan = (code: string) => growPlanSeed.find((p) => p.code === code)!;
const broc = plan('BROC-01');
const mung = plan('MUNG-01');
// kg CO2e per kWh on the grid row: (CO2 + CH4 × 28 + N2O × 265) lb/MWh → kg/kWh.
const kgPerKwh = ((gridFactorERCT.co2LbPerMwh + gridFactorERCT.ch4LbPerMwh * 28 + gridFactorERCT.n2oLbPerMwh * 265) * KG_PER_LB) / 1000;

describe('tray footprint — light, the worked check', () => {
  const fp = trayFootprint(broc);
  const costing = costPlan(broc);
  const mars = LIGHT_FIXTURES[0]!;
  it('a broccoli 1020 under two VG80 kits for 16 h over its lit days: 0.64 kWh a tray-day, 4.48 kWh a tray', () => {
    expect(mars.key).toBe('mars-hydro-vg80');
    expect(costing.lightDays).toBe(7);
    expect(fp.lightDays).toBe(7);
    expect(fp.kwhPerTray).toBeCloseTo(((80 * 2) / 1000) * 16 * 7 / 4, 9);
    expect(fp.kwhPerTray).toBeCloseTo(4.48, 9);
  });
  it('posts the light on eGRID2023 ERCT, location- and market-based, and carries the watts tag', () => {
    const light = fp.lines.find((l) => l.kind === 'light')!;
    expect(light.reference!.kgCo2ePerTray).toBeCloseTo(4.48 * kgPerKwh, 9);
    expect(light.reference!.kgCo2ePerTray).toBeCloseTo(1.497, 3);
    expect(light.selected!.kgCo2ePerTray).toBeCloseTo(light.reference!.kgCo2ePerTray, 9);
    expect(light.status).toBe(weakest(mars.watts.status, mars.perShelf.status, REGIME_BY_KEY['balanced']!.photoperiodHours.status, 'SOURCED'));
    const half = trayFootprint(broc, { renewableShare: 0.5 }).lines.find((l) => l.kind === 'light')!;
    expect(half.selected!.kgCo2ePerTray).toBeCloseTo(light.reference!.kgCo2ePerTray / 2, 9);
  });
  it('amortizes the fixture\'s manufacture over its life hours, as a proxy', () => {
    const cap = fp.lines.find((l) => l.name.startsWith('Fixture manufacture'))!;
    expect(cap.quantityPerTray).toBeCloseTo((2 * 16 * 7) / 4, 9);
    expect(cap.reference!.kgCo2ePerTray).toBeCloseTo((9.2 / 70000) * 56, 9);
    expect(cap.status).toBe('UNCONFIRMED');
  });
});

describe('tray footprint — seed on the dual basis', () => {
  const fp = trayFootprint(broc);
  const seed = fp.lines.find((l) => l.kind === 'seed')!;
  const brassicas = inputFactors.find((f) => f.category === 'cabbages-and-other-brassicas')!;
  it('the reference is the study crop named as a proxy, UNCONFIRMED, at the grams sown', () => {
    expect(seed.name).toBe('Di Cicco broccoli');
    expect(seed.massKgPerTray).toBeCloseTo(seed.quantityPerTray / 1000, 12);
    expect(seed.reference!.kgCo2ePerTray).toBeCloseTo(seed.massKgPerTray! * brassicas.kgCo2ePerKg, 9);
    expect(seed.reference!.label).toMatch(/proxy|brassicas/i);
    expect(seed.reference!.status).toBe('UNCONFIRMED');
    expect(seed.selected).toEqual(seed.reference);
  });
  it('the cited brassica seed figure is 57.7 kg CO2e per kg and selects by option id', () => {
    const opt = lcaOptions.find((o) => o.input === 'Di Cicco broccoli')!;
    expect(opt.kgCo2ePerKg).toBeCloseTo(4.04 / 0.07, 9);
    expect(opt.boundary).toBe('cradle_to_gate');
    const sel = trayFootprint(broc, { selection: { 'Di Cicco broccoli': opt.id } }).lines.find((l) => l.kind === 'seed')!;
    expect(sel.selected!.optionId).toBe(opt.id);
    expect(sel.selected!.kgCo2ePerTray).toBeCloseTo(sel.massKgPerTray! * (4.04 / 0.07), 9);
    expect(sel.selected!.kgCo2ePerTray).toBeGreaterThan(sel.reference!.kgCo2ePerTray * 50);
  });
  it('a variety with no study proxy is listed with the reason and no figure', () => {
    const sun = trayFootprint(plan('SUN-01')).lines.find((l) => l.kind === 'seed')!;
    expect(sun.reference).toBeNull();
    expect(sun.excludedReason).toMatch(/No seed proxy/);
  });
});

describe('tray footprint — the hemp mat: mass, a placeholder fiber figure, freight and end of life', () => {
  const fp = trayFootprint(broc);
  const area = TRAY_FORMAT_BY_KEY['flat-1020']!.areaSqIn.value;
  const matKg = (area * SQ_M_PER_SQ_IN * HEMP_MAT_GRADE_G_PER_M2.value) / 1000;
  it('one mat weighs the format\'s area at the grade on file, about 44 g, and its fiber carries a placeholder figure', () => {
    const mat = fp.lines.find((l) => l.name === 'Medium: hemp-mat')!;
    expect(mat.massKgPerTray).toBeCloseTo(matKg, 9);
    expect(mat.massKgPerTray).toBeCloseTo(0.0437, 3);
    expect(mat.reference!.status).toBe('PLACEHOLDER');
    expect(mat.reference!.kgCo2ePerTray).toBeCloseTo(matKg * 1.0, 9);
    expect(mat.excludedReason).toBeUndefined();
  });
  it('freight from Paris, TX by truck on the Hub\'s ton-mile row', () => {
    const legs = defaultFreightLegs();
    const leg = legs['Medium: hemp-mat']!;
    expect(leg.miles).toBeGreaterThan(250);
    expect(leg.miles).toBeLessThan(290);
    const fr = fp.lines.find((l) => l.name === 'Freight: Medium: hemp-mat')!;
    const tonMiles = (matKg / 907.18474) * leg.miles;
    const f = freightFactorsHub.truck;
    expect(fr.reference!.kgCo2ePerTray).toBeCloseTo(tonMiles * (f.co2KgPerTonMile + (f.ch4GPerTonMile / 1000) * 28 + (f.n2oGPerTonMile / 1000) * 265), 12);
    expect(legs['Di Cicco broccoli']!.miles).toBeGreaterThan(1000);
  });
  it('end of life reads the mat as yard trimmings, landfilled by default, composted by the share', () => {
    const eol = fp.lines.find((l) => l.kind === 'end-of-life')!;
    expect(eol.reference!.kgCo2ePerTray).toBeCloseTo(matKg * WARM_KG_PER_KG * warmYardTrimmings.landfill.mtco2ePerShortTon, 12);
    expect(eol.reference!.kgCo2ePerTray).toBeLessThan(0);
    const composted = trayFootprint(broc, { compostShare: 1 }).lines.find((l) => l.kind === 'end-of-life')!;
    expect(composted.reference!.kgCo2ePerTray).toBeCloseTo(matKg * WARM_KG_PER_KG * warmYardTrimmings.compost.mtco2ePerShortTon, 12);
  });
  it('coir pith reads the ZHAW figure per cubic metre, and the peat blend the whole volume at peat\'s, PLACEHOLDER', () => {
    const coir = trayFootprint({ ...broc, lines: broc.lines.map((l) => (l.kind === 'medium' ? { ...l, mediumKey: 'coco-coir' } : l)) }).lines.find((l) => l.name === 'Medium: coco-coir')!;
    expect(coir.quantityUnit).toBe('gal');
    expect(coir.reference!.kgCo2ePerTray).toBeCloseTo((coir.quantityPerTray / 264.172) * 40.5, 9);
    expect(coir.massKgPerTray).toBeCloseTo((coir.quantityPerTray / 264.172) * 250, 9);
    const peat = trayFootprint({ ...broc, lines: broc.lines.map((l) => (l.kind === 'medium' ? { ...l, mediumKey: 'peat-vermiculite' } : l)) }).lines.find((l) => l.name === 'Medium: peat-vermiculite')!;
    expect(peat.reference!.kgCo2ePerTray).toBeCloseTo((peat.quantityPerTray / 264.172) * 254, 9);
    expect(peat.status).toBe('PLACEHOLDER');
  });
});

describe('tray footprint — totals, per kg, water and the excluded list', () => {
  const fp = trayFootprint(broc);
  it('sums the buckets and divides by the harvest, carrying its tag', () => {
    const r = fp.perTray.reference;
    expect(r.total).toBeCloseTo(r.seed + r.medium + r.nutrient + r.light + r.freight + r.capital + r.endOfLife, 9);
    expect(r.light).toBeCloseTo(1.497, 3);
    expect(fp.harvestGramsPerTray).toEqual({ value: 250, status: 'PLACEHOLDER' });
    expect(fp.perKg!.reference.total).toBeCloseTo(r.total / 0.25, 9);
    expect(fp.perKg!.status).toBe('PLACEHOLDER');
    expect(fp.perKg!.reference.light).toBeCloseTo(5.99, 2);
  });
  it('water is a volume in litres, the nutrient and the rack are listed without a figure', () => {
    expect(fp.waterLPerTray).toBeCloseTo(costPlan(broc).waterOzPerTray * L_PER_FL_OZ, 9);
    const names = fp.excluded.map((e) => e.name);
    expect(names).toContain('Nutrient: floragrow-npk');
    expect(names).toContain('Rack share');
    expect(names).toContain('Water over the cycle');
    expect(fp.excluded.find((e) => e.name === 'Rack share')!.reason).toMatch(/stainless/);
  });
  it('the weakest tag on the plan is PLACEHOLDER while the mat\'s fiber figure is', () => {
    expect(fp.weakestStatus).toBe('PLACEHOLDER');
  });
});

describe('tray footprint — a jar of sprouts', () => {
  const fp = trayFootprint(mung);
  it('no medium, no light, no fixture share; the seed reads the pulses proxy; the water is the rinses', () => {
    expect(fp.kwhPerTray).toBe(0);
    expect(fp.lines.some((l) => l.kind === 'light')).toBe(false);
    expect(fp.lines.some((l) => l.kind === 'medium')).toBe(false);
    expect(fp.lines.find((l) => l.kind === 'seed')!.reference!.label).toMatch(/pulses/);
    expect(fp.waterLPerTray).toBeGreaterThan(0);
  });
});

describe('tray footprint — the regimes side by side', () => {
  it('each regime\'s electricity for the plan\'s lit days; continuous light is 24/16 of balanced', () => {
    const rows = regimeEnergyTable(broc);
    expect(rows.map((r) => r.key).sort()).toEqual(Object.keys(REGIME_BY_KEY).sort());
    const balanced = rows.find((r) => r.key === 'balanced')!;
    const continuous = rows.find((r) => r.key === 'continuous')!;
    expect(balanced.onPlan).toBe(true);
    expect(balanced.kwhPerTray).toBeCloseTo(4.48, 9);
    expect(continuous.kwhPerTray).toBeCloseTo(4.48 * 24 / 16, 9);
    expect(continuous.kgCo2ePerTray).toBeCloseTo(continuous.kwhPerTray * kgPerKwh, 9);
    expect(balanced.rows.length).toBeGreaterThan(0);
  });
  it('a jar plan has no regime table', () => {
    expect(regimeEnergyTable(mung)).toEqual([]);
  });
});

describe('the medium a forecast grows a plan on', () => {
  const MEDIA = ['hemp-mat', 'jute-mat', 'silicone-mesh', 'stainless-mesh', 'seedling-soil'] as const;
  const on = (key: string) => resolveScenarioInputs({ media: { 'FEN-01': key } }).growPlans.find((p) => p.code === 'FEN-01')!;
  const base = resolveScenarioInputs().growPlans;
  it('stands over the plan\'s own medium on that plan only, and the plan\'s record does not move', () => {
    const jute = resolveScenarioInputs({ media: { 'FEN-01': 'jute-mat' } }).growPlans;
    expect(base.find((p) => p.code === 'FEN-01')!.lines.find((l) => l.kind === 'medium')).toMatchObject({ mediumKey: 'hemp-mat' });
    expect(jute.find((p) => p.code === 'FEN-01')!.lines.find((l) => l.kind === 'medium')).toMatchObject({ mediumKey: 'jute-mat', qtyPerTray: null });
    expect(jute.find((p) => p.code === 'BROC-01')!.lines).toEqual(base.find((p) => p.code === 'BROC-01')!.lines);
    expect(plan('FEN-01').lines.find((l) => l.kind === 'medium')).toMatchObject({ mediumKey: 'hemp-mat' });
  });
  it('a key the library does not hold is ignored', () => {
    expect(on('no-such-medium').lines.find((l) => l.kind === 'medium')).toMatchObject({ mediumKey: 'hemp-mat' });
  });
  it('a reusable sheet costs its price over its grows: silicone $5.50 over 20, two stainless sheets at $3.00 over 20', () => {
    const cost = (key: string) => costPlan(on(key)).lines.find((l) => l.line.kind === 'medium')!.costPerTray;
    expect(cost('hemp-mat')).toBeCloseTo(241 / 140, 9);
    expect(cost('silicone-mesh')).toBeCloseTo(5.5 / 20, 9);
    expect(cost('stainless-mesh')).toBeCloseTo((2 * 2.997) / 20, 9);
  });
  it('light, seed and water are the same on all five; only the medium\'s lines differ, every medium figure a placeholder or the peat row', () => {
    const fps = MEDIA.map((k) => trayFootprint(on(k)));
    for (const fp of fps) {
      expect(fp.kwhPerTray).toBeCloseTo(fps[0]!.kwhPerTray, 9);
      expect(fp.waterLPerTray).toBeCloseTo(fps[0]!.waterLPerTray, 9);
      expect(fp.perTray.reference.light).toBeCloseTo(fps[0]!.perTray.reference.light, 9);
      expect(fp.perTray.reference.seed).toBeCloseTo(fps[0]!.perTray.reference.seed, 9);
    }
    const medium = Object.fromEntries(MEDIA.map((k, i) => [k, fps[i]!.lines.find((l) => l.kind === 'medium')!]));
    expect(medium['silicone-mesh']!.massKgPerTray).toBeCloseTo(0.09 / 20, 9);
    expect(medium['silicone-mesh']!.reference!.kgCo2ePerTray).toBeCloseTo((0.09 / 20) * 6.0, 9);
    expect(medium['stainless-mesh']!.reference!.kgCo2ePerTray).toBeCloseTo(((2 * 0.08) / 20) * 6.5, 9);
    expect(medium['jute-mat']!.reference!.kgCo2ePerTray).toBeCloseTo(0.0437 * 1.0, 9);
    expect(medium['seedling-soil']!.reference!.label).toMatch(/Peat/);
    for (const k of MEDIA) expect(medium[k]!.status).toBe('PLACEHOLDER');
    // A reused sheet has no end of life a grow; a mat and the soil do.
    expect(fps[2]!.lines.some((l) => l.kind === 'end-of-life')).toBe(false);
    expect(fps[0]!.lines.some((l) => l.kind === 'end-of-life')).toBe(true);
  });
});
