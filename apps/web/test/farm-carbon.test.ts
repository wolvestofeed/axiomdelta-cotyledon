import { describe, it, expect } from 'vitest';
import {
  co2e,
  mmbtuFromBill,
  postCombustion,
  postRefrigerantLeak,
  postElectricity,
  postFreight,
  postWaste,
  warmNet,
  postFood,
  aggregateByScope,
  normalize,
  annualizedLeakRate,
  aimActFindings,
  greenBlackoutCheck,
  effluentSurcharge,
  greaseTrapStatus,
  tonMiles,
  cropPlanFoodFootprint,
  KG_PER_LB,
  KG_PER_OZ,
  type ActivityRecord,
  type RefrigerantCircuit,
} from '@/app/(farm)/farm/_engine/carbon';
import {
  factorRegistry,
  inputFactors,
  cropPlanFoodCategoryMap,
  type FoodFactor,
} from '@/app/(farm)/farm/_data/emission-factors';
import { cropPlan } from '@/app/(farm)/farm/_data/plan-data';

const act = (id: string, module: number, quantity: number, unit: string): ActivityRecord => ({
  id,
  module,
  period: '2026-03',
  quantity,
  unit,
  sourceDoc: `TEST-${id}`,
});

// Golden values are arithmetic from the tagged rows in the research file §19.

describe('farm carbon — factor registry integrity', () => {
  it('every factor carries source, url, version, effective date and a status tag', () => {
    expect(factorRegistry.length).toBeGreaterThan(10);
    for (const f of factorRegistry) {
      expect(f.id).toMatch(/\S/);
      expect(f.sourceUrl).toMatch(/^https:\/\//);
      expect(f.version).toMatch(/\S/);
      expect(f.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['SOURCED', 'STATED', 'PLACEHOLDER', 'DERIVED', 'UNCONFIRMED', 'DATED']).toContain(f.status);
    }
  });
  it('factor ids are unique', () => {
    const ids = factorRegistry.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('food factor table carries the study\'s 43 products with unique categories', () => {
    expect(inputFactors).toHaveLength(43);
    expect(new Set(inputFactors.map((f) => f.category)).size).toBe(43);
    for (const f of inputFactors) {
      expect(f.n).toBeGreaterThan(0);
      expect(f.provenance.status).toBe('SOURCED');
      expect(f.provenance.sourceUrl).toBe('https://doi.org/10.1126/science.aaq0216');
    }
  });
  it('input factors reproduce the study means (retail weight, kg CO2e per kg)', () => {
    const by = Object.fromEntries(inputFactors.map((f) => [f.category, f.kgCo2ePerKg]));
    expect(by['bovine-meat-beef-herd']).toBeCloseTo(98.8194, 4);
    expect(by['cheese']).toBeCloseTo(23.9183, 4);
    expect(by['rice']).toBeCloseTo(4.3849, 4);
    expect(by['tomatoes']).toBeCloseTo(2.0677, 4);
    expect(by['beans-pulses']).toBeCloseTo(1.7837, 4);
    expect(by['maize-unit']).toBeCloseTo(1.7406, 4);
    expect(by['other-vegetables']).toBeCloseTo(0.5283, 4);
    expect(by['onions-and-leeks']).toBeCloseTo(0.4997, 4);
    expect(by['sunflower-oil']).toBeCloseTo(3.5837, 4);
  });
  it('every crop plan input has a mapping, and every mapped category resolves to a factor', () => {
    const cats = new Set(inputFactors.map((f) => f.category));
    for (const ing of cropPlan.inputs) {
      const m = cropPlanFoodCategoryMap[ing.name];
      expect(m, ing.name).toBeDefined();
      if (m.category !== null) expect(cats.has(m.category), m.category).toBe(true);
      if (ing.unit === 'each' && m.category !== null) {
        expect(m.massKgPerEach).toBeGreaterThan(0);
        expect(m.massStatus).toBeDefined();
      }
    }
  });
});

describe('farm carbon — crop plan food footprint (AMK-E-001)', () => {
  it('computes 4.9377 kg CO2e per unit, beef 85.1% of it, with two excluded lines', () => {
    const r = cropPlanFoodFootprint();
    expect(r.totalKgCo2ePerUnit).toBeCloseTo(4.937691, 5);
    expect(r.largestLine?.name).toBe('Ground beef, 85/15');
    expect(r.largestLine?.share).toBeCloseTo(0.851050, 5);
    const beef = r.lines.find((l) => l.name === 'Ground beef, 85/15')!;
    expect(beef.massKgPerUnit).toBeCloseTo(0.042524, 6);
    expect(beef.kgCo2ePerUnit).toBeCloseTo(4.202224, 5);
    const cheddar = r.lines.find((l) => l.name === 'Cheddar, shredded')!;
    expect(cheddar.kgCo2ePerUnit).toBeCloseTo(0.339036, 5);
    const excluded = r.lines.filter((l) => l.excludedReason);
    expect(excluded.map((l) => l.name).sort()).toEqual(['Chili-cumin spice blend', 'Sea salt']);
  });
  it('the tortilla mass is the crop plan line\'s unit mass — one constant, carrying that line\'s tag', () => {
    const r = cropPlanFoodFootprint();
    const line = cropPlan.inputs.find((i) => i.name === 'Corn tortilla, 6 in')!;
    const map = cropPlanFoodCategoryMap['Corn tortilla, 6 in'];
    expect(line.unitMassOz).toBe(0.88);
    expect(map.massKgPerEach).toBeCloseTo(0.88 * KG_PER_OZ, 12);
    expect(map.massStatus).toBe(line.yieldStatus);
    const tortilla = r.lines.find((l) => l.name === 'Corn tortilla, 6 in')!;
    expect(tortilla.massKgPerUnit).toBeCloseTo(0.88 * KG_PER_OZ, 9);
    // The mass tag is SOURCED, so the line's tag is its factor's tag, not a placeholder mass.
    const maize = inputFactors.find((f) => f.category === 'maize-unit')!;
    expect(tortilla.status).toBe(maize.provenance.status);
  });
  it('scales with the phase unit factor', () => {
    const base = cropPlanFoodFootprint().totalKgCo2ePerUnit;
    expect(cropPlanFoodFootprint(undefined, undefined, undefined, 1.5).totalKgCo2ePerUnit).toBeCloseTo(base * 1.5, 9);
  });
});

describe('farm carbon — Scope 1 combustion', () => {
  it('1,000 therms of natural gas → 5,311.45 kg CO2e at AR5', () => {
    const p = postCombustion(act('ng-1', 1, 1000, 'therm'), 'naturalGas', 'therm');
    expect(p.co2Kg).toBeCloseTo(5306, 6);
    expect(p.ch4Kg).toBeCloseTo(0.1, 9);
    expect(p.n2oKg).toBeCloseTo(0.01, 9);
    expect(p.co2eKg).toBeCloseTo(5311.45, 6);
    expect(p.scope).toBe(1);
    expect(p.gwpBasis).toBe('AR5');
    expect(p.factorId).toBe('epa-hub-2025:natural-gas');
    expect(p.factorVersion).toBe('January 2025');
    expect(p.factorStatus).toBe('SOURCED');
  });
  it('converts ccf and scf through heat content', () => {
    expect(mmbtuFromBill('naturalGas', 1000, 'scf')).toBeCloseTo(1.026, 9);
    expect(mmbtuFromBill('naturalGas', 10, 'ccf')).toBeCloseTo(1.026, 9);
    expect(() => mmbtuFromBill('diesel', 1, 'ccf')).toThrow();
  });
  it('gasoline and diesel per gallon reproduce the Hub per-gallon CO2 figures', () => {
    const g = postCombustion(act('gas-1', 1, 1, 'gal'), 'gasoline', 'gal', 'mobile');
    const d = postCombustion(act('dsl-1', 1, 1, 'gal'), 'diesel', 'gal', 'mobile');
    expect(g.co2Kg).toBeCloseTo(8.78, 2);
    expect(d.co2Kg).toBeCloseTo(10.21, 2);
    expect(g.category).toBe('mobile:gasoline');
  });
});

describe('farm carbon — Scope 1 fugitive refrigerants', () => {
  it('1 lb of R-404A ≈ 1,779 kg CO2e on the AR4 basis', () => {
    const p = postRefrigerantLeak(act('ref-1', 2, 1, 'lb'), 'R-404A');
    expect(p.co2eKg).toBeCloseTo(3922 * KG_PER_LB, 6);
    expect(p.co2eKg).toBeCloseTo(1779, 0);
    expect(p.gwpBasis).toBe('AR4');
    expect(p.factorStatus).toBe('UNCONFIRMED');
  });
  it('rejects a refrigerant with no GWP on file', () => {
    expect(() => postRefrigerantLeak(act('ref-2', 2, 1, 'lb'), 'R-999')).toThrow();
  });
});

describe('farm carbon — Scope 2 electricity, both methods', () => {
  it('10,000 kWh on ERCT → 3,516.02 kg CO2e location-based', () => {
    const { location, market } = postElectricity(act('kwh-1', 3, 10000, 'kWh'));
    expect(location.co2Kg).toBeCloseTo(7711 * KG_PER_LB, 6);
    expect(location.co2eKg).toBeCloseTo(3516.018, 2);
    expect(location.scope2Method).toBe('location');
    expect(market.co2eKg).toBeCloseTo(location.co2eKg, 9);
  });
  it('market-based falls to zero with 100% renewable supply; location-based does not', () => {
    const { location, market } = postElectricity(act('kwh-2', 3, 10000, 'kWh'), { renewableShare: 1 });
    expect(market.co2eKg).toBe(0);
    expect(location.co2eKg).toBeCloseTo(3516.018, 2);
  });
  it('aggregates by scope with the chosen Scope 2 method, and reports the weakest factor', () => {
    const ng = postCombustion(act('ng', 1, 1000, 'therm'), 'naturalGas', 'therm');
    const { location, market } = postElectricity(act('kwh', 3, 10000, 'kWh'), { renewableShare: 0.5 });
    const loc = aggregateByScope([ng, location, market], 'location');
    const mkt = aggregateByScope([ng, location, market], 'market');
    expect(loc.scope1Kg).toBeCloseTo(5311.45, 6);
    expect(loc.scope2Kg).toBeCloseTo(3516.018, 2);
    expect(mkt.scope2Kg).toBeCloseTo(1758.009, 2);
    expect(loc.totalKg).toBeCloseTo(8827.468, 2);
    expect(loc.weakestFactorStatus).toBe('UNCONFIRMED'); // eGRID year not pinned
  });
});

describe('farm carbon — Scope 3 freight, waste, food', () => {
  it('25 tons × 40 miles = 1,000 ton-miles → 161.8 kg CO2', () => {
    const p = postFreight(act('frt-1', 6, tonMiles(25, 40), 'ton-mile'));
    expect(p.co2eKg).toBeCloseTo(161.8, 9);
    expect(p.scope).toBe(3);
  });
  it('10 short tons: all landfill 6,800 kg; all compost −1,800 kg; delta 8,600 kg', () => {
    expect(postWaste(act('w-1', 8, 10, 'short ton'), 'landfill').co2eKg).toBeCloseTo(6800, 6);
    expect(postWaste(act('w-2', 8, 10, 'short ton'), 'compost').co2eKg).toBeCloseTo(-1800, 6);
    const n = warmNet(10, 1);
    expect(n.netKg).toBeCloseTo(-1800, 6);
    expect(n.deltaVsAllLandfillKg).toBeCloseTo(-8600, 6);
    const half = warmNet(10, 0.5);
    expect(half.netKg).toBeCloseTo(3400 - 900, 6);
  });
  it('posts food emissions from a supplied factor table (fixture, not reference data)', () => {
    const fixture: FoodFactor[] = [
      {
        category: 'fixture-category',
        label: 'Test fixture — not a real factor',
        kgCo2ePerKg: 2.5,
        stages: { lucBurn: 0, lucCStock: 0, feed: 0, farm: 2.5, processing: 0, transportStorage: 0, packaging: 0, retail: 0, loss: 0 },
        landM2yPerKg: 0,
        eutrKgPo4ePerKg: 0,
        waterLPerKg: 0,
        n: 1,
        provenance: {
          id: 'test:fixture',
          source: 'test fixture',
          sourceUrl: 'https://example.invalid/fixture',
          version: 'n/a',
          effectiveFrom: '2026-01-01',
          status: 'PLACEHOLDER',
        },
      },
    ];
    const p = postFood(act('food-1', 4, 100, 'kg'), 'fixture-category', fixture);
    expect(p.co2eKg).toBe(250);
    expect(p.factorStatus).toBe('PLACEHOLDER');
    expect(() => postFood(act('food-2', 4, 1, 'kg'), 'missing', fixture)).toThrow();
  });
});

describe('farm carbon — normalizers and co2e', () => {
  it('normalizes per unit, per sq ft, per operating day', () => {
    const n = normalize(3516.018, { units: 1000, sqFt: 5000, operatingDays: 20 });
    expect(n.kgPerUnit).toBeCloseTo(3.516, 3);
    expect(n.kgPerSqFt).toBeCloseTo(0.7032, 4);
    expect(n.kgPerOperatingDay).toBeCloseTo(175.8, 2);
    expect(normalize(1, {}).kgPerUnit).toBeUndefined();
  });
  it('co2e applies AR5 GWPs', () => {
    expect(co2e({ co2Kg: 1, ch4Kg: 1, n2oKg: 1 })).toBe(1 + 28 + 265);
  });
});

describe('farm carbon — AIM Act findings', () => {
  const walkIn: RefrigerantCircuit = {
    id: 'wic-1',
    equipment: 'Walk-in freezer 10x12',
    refrigerant: 'R-404A',
    fullChargeLb: 60,
    installedOn: '2026-01-01',
    serviceAdds: [{ date: '2026-04-01', lbAdded: 4 }],
  };
  it('annualized leak rate: 4 lb on a 60 lb charge over 90 days ≈ 27%', () => {
    expect(annualizedLeakRate(60, 4, 90)).toBeCloseTo(0.2704, 4);
  });
  it('a 60 lb R-404A circuit is in scope and the 27% rate crosses the 20% trigger', () => {
    const f = aimActFindings(walkIn, '2026-06-30');
    const applicability = f.find((x) => x.id === 'aim-applicability')!;
    const leak = f.find((x) => x.id === 'aim-leak-rate')!;
    const chronic = f.find((x) => x.id === 'aim-chronic-leak')!;
    expect(applicability.status).toBe('triggered');
    expect(leak.status).toBe('triggered');
    expect(leak.computed.intervalDays).toBe(90);
    expect(leak.computed.repairWindowEnds).toBe('2026-05-01');
    expect(chronic.status).toBe('within-limit');
    expect(chronic.computed.shareOfCharge).toBeCloseTo(4 / 60, 9);
    for (const x of f) expect(x.citationStatus).toBe('UNCONFIRMED');
  });
  it('a 10 lb circuit is out of scope and produces only the applicability finding', () => {
    const f = aimActFindings({ ...walkIn, id: 'ri-1', fullChargeLb: 10 }, '2026-06-30');
    expect(f).toHaveLength(1);
    expect(f[0].status).toBe('not-applicable');
  });
  it('80 lb added in a year on a 60 lb charge (133%) triggers the chronic report due March 1', () => {
    const chronic = aimActFindings(
      {
        ...walkIn,
        serviceAdds: [
          { date: '2026-02-01', lbAdded: 30 },
          { date: '2026-05-01', lbAdded: 30 },
          { date: '2026-08-01', lbAdded: 20 },
        ],
      },
      '2026-09-01',
    ).find((x) => x.id === 'aim-chronic-leak')!;
    expect(chronic.status).toBe('triggered');
    expect(chronic.computed.shareOfCharge).toBeCloseTo(80 / 60, 9);
    expect(chronic.computed.reportDue).toBe('2027-03-01');
  });
  it('GreenBlackout: aggregate rate across circuits and new equipment above GWP 150', () => {
    const g = greenBlackoutCheck(
      [walkIn, { ...walkIn, id: 'wic-2', fullChargeLb: 40, serviceAdds: [] }],
      '2026',
    );
    expect(g.aggregateLeakRate).toBeCloseTo(4 / 100, 9);
    expect(g.aggregateStatus).toBe('within-limit');
    expect(g.newEquipmentAboveGwp.map((x) => x.circuitId)).toEqual(['wic-1', 'wic-2']);
  });
});

describe('farm carbon — Austin Water effluent surcharge', () => {
  it('BOD branch: COD/BOD = 2 ≤ 2.25 → $1,005.89 on 0.5 MG', () => {
    const s = effluentSurcharge({ volumeMillionGal: 0.5, bodMgL: 400, tssMgL: 300, codMgL: 800 });
    expect(s.branch).toBe('BOD');
    expect(s.chargeBod).toBeCloseTo(0.5 * 8.34 * 0.8211 * 200, 6);
    expect(s.chargeTss).toBeCloseTo(0.5 * 8.34 * 0.77 * 100, 6);
    expect(s.chargeCod).toBe(0);
    expect(s.surcharge).toBeCloseTo(1005.8874, 3);
    expect(s.citation.status).toBe('DATED');
  });
  it('COD branch: COD/BOD = 3 > 2.25 → $1,004.89 on 0.5 MG', () => {
    const s = effluentSurcharge({ volumeMillionGal: 0.5, bodMgL: 300, tssMgL: 300, codMgL: 900 });
    expect(s.branch).toBe('COD');
    expect(s.chargeBod).toBe(0);
    expect(s.chargeCod).toBeCloseTo(0.5 * 8.34 * 0.3644 * 450, 6);
    expect(s.surcharge).toBeCloseTo(1004.8866, 3);
  });
  it('parameters under their limits are not charged; FOG is flagged separately', () => {
    const s = effluentSurcharge({ volumeMillionGal: 1, bodMgL: 150, tssMgL: 150, codMgL: 300, fogMgL: 250 });
    expect(s.surcharge).toBe(0);
    expect(s.fogExceeded).toBe(true);
    expect(effluentSurcharge({ volumeMillionGal: 1, bodMgL: 150, tssMgL: 150, codMgL: 300 }).fogExceeded).toBeNull();
  });
  it('grease trap: 90-day interval and 50% fill rule', () => {
    const ok = greaseTrapStatus('2026-06-01', '2026-08-01', 0.3);
    expect(ok.nextDueBy).toBe('2026-08-30');
    expect(ok.daysUntilDue).toBe(29);
    expect(ok.intervalExceeded).toBe(false);
    expect(ok.fillTriggered).toBe(false);
    const late = greaseTrapStatus('2026-06-01', '2026-09-15', 0.55);
    expect(late.intervalExceeded).toBe(true);
    expect(late.fillTriggered).toBe(true);
  });
});

// ── S2: annual footprint, mass, waste, logistics ────────────────────────────

import {
  seedMassPerUnitKg,
  shippedMassPerUnitKg,
  annualShrinkWaste,
  outboundLogistics,
} from '@/app/(farm)/farm/_engine/carbon';
import { haversineMiles } from '@/app/(farm)/farm/_engine/geo';
import { assumptions } from '@/app/(farm)/farm/_data/plan-data';
import { canopyMassPerUnit } from '@/app/(farm)/farm/_engine';

describe('farm carbon — mass per unit', () => {
  it('as-purchased mass sums the mapped lb lines plus the tortilla unit mass', () => {
    const lbLines = 9.375 + 6.25 + 9.375 + 15.625 + 6.25 + 1.875 + 0.1875 + 3.125 + 0.9375;
    expect(seedMassPerUnitKg()).toBeCloseTo((lbLines * KG_PER_LB) / 100 + 0.88 * KG_PER_OZ, 9);
  });
  it('shipped mass is blackout hot mass plus cheese and tortilla', () => {
    const hot = canopyMassPerUnit() * KG_PER_LB;
    expect(shippedMassPerUnitKg()).toBeCloseTo(hot + (3.125 * KG_PER_LB) / 100 + 0.88 * KG_PER_OZ, 9);
  });
});

describe('farm carbon — waste flows', () => {
  it('annual shrink at 3% of as-purchased mass over full-ramp units', () => {
    const w = annualShrinkWaste(367604, seedMassPerUnitKg(), assumptions.yield.shrinkAllowance.value);
    expect(w.annualKg).toBeCloseTo(367604 * seedMassPerUnitKg() * 0.03, 6);
    expect(w.annualShortTons).toBeCloseTo(w.annualKg / (2000 * KG_PER_LB), 9);
    expect(w.annualShortTons).toBeGreaterThan(3);
    expect(w.annualShortTons).toBeLessThan(4);
  });
});

describe('farm carbon — outbound logistics', () => {
  const home = { lat: 30.2516, lng: -97.7492 };
  const travis = { lat: 30.239513, lng: -97.69127 };
  it('ton-miles use the laden one-way leg; unplaced pickup points carry no ton-miles', () => {
    const m = 0.36;
    const out = outboundLogistics(
      [
        { id: 'A', name: 'A', county: 'Travis', dailyForecastUnits: 1000, coords: travis },
        { id: 'B', name: 'B', county: 'Hays', dailyForecastUnits: 150, coords: null },
      ],
      home,
      m,
    );
    const oneWay = haversineMiles(home, travis);
    const tons = (1000 * m) / (2000 * KG_PER_LB);
    expect(out.legs[0].milesOneWay).toBeCloseTo(oneWay, 9);
    expect(out.legs[0].milesRoundTrip).toBeCloseTo(oneWay * 2, 9);
    expect(out.legs[0].tonMiles).toBeCloseTo(tons * oneWay, 9);
    expect(out.legs[0].kgCo2ePerDay).toBeCloseTo((tons * oneWay * 161.8) / 1000, 9);
    expect(out.legs[1].placed).toBe(false);
    expect(out.legs[1].tonMiles).toBeNull();
    expect(out.placedPickupPoints).toBe(1);
    expect(out.unplacedPickupPoints).toBe(1);
    expect(out.totalUnitsPlaced).toBe(1000);
    expect(out.totalKgCo2ePerDay).toBeCloseTo(out.legs[0].kgCo2ePerDay!, 9);
    expect(out.kgCo2ePerUnitDistributed).toBeCloseTo(out.legs[0].kgCo2ePerDay! / 1000, 9);
    expect(out.factor.id).toBe('epa-smartway:avg-truck');
  });
});

// ── Dual basis: stage split, boundary alignment, selected vs reference ──────

import { alignToRetail, cropPlanFoodFootprintDual } from '@/app/(farm)/farm/_engine/carbon';
import { lcaOptions } from '@/app/(farm)/farm/_data/lca-options';

describe('farm carbon — food stage split', () => {
  it('every product\'s nine stages sum to its mean', () => {
    for (const f of inputFactors) {
      const sum = Object.values(f.stages).reduce((a, b) => a + b, 0);
      expect(sum, f.category).toBeCloseTo(f.kgCo2ePerKg, 2);
    }
  });
  it('beef herd: loss is 16.30 of 98.82; post-slaughter stages total 1.22', () => {
    const beef = inputFactors.find((f) => f.category === 'bovine-meat-beef-herd')!;
    expect(beef.stages.loss).toBeCloseTo(16.3031, 4);
    expect(beef.stages.transportStorage + beef.stages.packaging + beef.stages.retail).toBeCloseTo(1.2196, 4);
  });
});

describe('farm carbon — boundary alignment', () => {
  const beef = inputFactors.find((f) => f.category === 'bovine-meat-beef-herd')!;
  it('aligning the study\'s own farm-through-processing sum reproduces the study mean', () => {
    const s = beef.stages;
    const throughSlaughter = s.lucBurn + s.lucCStock + s.feed + s.farm + s.processing;
    expect(alignToRetail(throughSlaughter, 'slaughter_gate', beef)).toBeCloseTo(beef.kgCo2ePerKg, 3);
    const farmGate = s.lucBurn + s.lucCStock + s.feed + s.farm;
    expect(alignToRetail(farmGate, 'farm_gate', beef)).toBeCloseTo(beef.kgCo2ePerKg, 3);
  });
  it('White Oak −3.5 at the slaughter gate aligns to −2.73 at retail', () => {
    expect(alignToRetail(-3.5, 'slaughter_gate', beef)).toBeCloseTo(-2.731, 3);
  });
  it('a retail-boundary figure passes through unchanged', () => {
    expect(alignToRetail(12.3, 'retail', beef)).toBe(12.3);
  });
});

describe('farm carbon — dual basis on the crop plan', () => {
  it('with no selection both bases equal the reference and the gap is zero', () => {
    const d = cropPlanFoodFootprintDual();
    expect(d.referenceTotalKgPerUnit).toBeCloseTo(4.937691, 5);
    expect(d.selectedTotalKgPerUnit).toBeCloseTo(4.937691, 5);
    expect(d.gapKgPerUnit).toBeCloseTo(0, 9);
    expect(d.linesOnSelectedBasis).toBe(0);
    const beef = d.lines.find((l) => l.name === 'Ground beef, 85/15')!;
    expect(beef.options.map((o) => o.id)).toEqual(['quantis-wop-2019:beef-net', 'msu-ucs-amp-2018:beef-net']);
  });
  it('selecting White Oak for beef swaps that line to the aligned figure and keeps the reference', () => {
    const d = cropPlanFoodFootprintDual(undefined, { 'Ground beef, 85/15': 'quantis-wop-2019:beef-net' });
    const beef = d.lines.find((l) => l.name === 'Ground beef, 85/15')!;
    expect(beef.reference!.kgCo2ePerUnit).toBeCloseTo(4.202224, 5);
    expect(beef.selected!.rawKgPerKg).toBe(-3.5);
    expect(beef.selected!.boundary).toBe('slaughter_gate');
    expect(beef.selected!.alignedKgPerKg).toBeCloseTo(-2.731, 3);
    expect(beef.selected!.kgCo2ePerUnit).toBeCloseTo(0.042524 * -2.73095, 4);
    expect(beef.selected!.status).toBe('DERIVED');
    expect(d.referenceTotalKgPerUnit).toBeCloseTo(4.937691, 5);
    expect(d.selectedTotalKgPerUnit).toBeCloseTo(4.937691 - 4.202224 + 0.042524 * -2.73095, 3);
    expect(d.gapKgPerUnit).toBeLessThan(0);
    expect(d.linesOnSelectedBasis).toBe(1);
  });
  it('Stanley et al. 2018 option: −6.65 per kg carcass → −9.78 per kg retail mass at the farm gate → −7.78 aligned; sourced, aligned figure derived', () => {
    const d = cropPlanFoodFootprintDual(undefined, { 'Ground beef, 85/15': 'msu-ucs-amp-2018:beef-net' });
    const beef = d.lines.find((l) => l.name === 'Ground beef, 85/15')!;
    expect(beef.selected!.rawKgPerKg).toBeCloseTo(-6.65 / 0.6803, 3);
    expect(beef.selected!.boundary).toBe('farm_gate');
    expect(beef.selected!.alignedKgPerKg).toBeCloseTo(-7.777, 2);
    expect(beef.selected!.provenance.status).toBe('SOURCED');
    expect(beef.selected!.status).toBe('DERIVED');
    expect(d.selectedTotalKgPerUnit).toBeLessThan(d.referenceTotalKgPerUnit);
  });
  it('an unknown option id falls back to the study mean', () => {
    const d = cropPlanFoodFootprintDual(undefined, { 'Ground beef, 85/15': 'nope' });
    expect(d.gapKgPerUnit).toBe(0);
  });
});

// ── S3: activity inputs ─────────────────────────────────────────────────────

import { energyInventory, refrigerantInventory, waterProjection } from '@/app/(farm)/farm/_engine/carbon';
import { ENERGY_DEFAULTS, WATER_DEFAULTS } from '@/app/(farm)/farm/_engine/scenario';

describe('farm carbon — energy inventory from annual inputs', () => {
  it('posts nothing on zero defaults', () => {
    const inv = energyInventory(ENERGY_DEFAULTS);
    expect(inv.hasActivity).toBe(false);
    expect(inv.postings).toHaveLength(0);
    expect(inv.location.totalKg).toBe(0);
  });
  it('1,000 therms + 10,000 kWh at 50% renewable: scope 1 5,311.45; scope 2 3,516.0 location, 1,758.0 market', () => {
    const inv = energyInventory({ ...ENERGY_DEFAULTS, naturalGasTherms: 1000, electricityKwh: 10000, renewableShare: 0.5 });
    expect(inv.location.scope1Kg).toBeCloseTo(5311.45, 6);
    expect(inv.location.scope2Kg).toBeCloseTo(3516.018, 2);
    expect(inv.market.scope2Kg).toBeCloseTo(1758.009, 2);
    expect(inv.postings.map((p) => p.category).sort()).toEqual(['grid:ERCT', 'grid:ERCT', 'stationary:naturalGas']);
  });
  it('fleet fuel posts as mobile scope 1', () => {
    const inv = energyInventory({ ...ENERGY_DEFAULTS, fleetDieselGal: 100 });
    expect(inv.postings[0].category).toBe('mobile:diesel');
    expect(inv.postings[0].co2Kg).toBeCloseTo(1020.648, 2);
  });
});

describe('farm carbon — refrigerant inventory from equipment attributes', () => {
  const eq = [
    { item: 'Walk-in freezer, 10x12, with refrigeration', qty: 1 },
    { item: 'Blackout rack, 200 lb capacity', qty: 2 },
    { item: 'Jar stand oven, full size 20-pan', qty: 2 },
  ];
  it('only lines with refrigerant and charge become circuits; charge scales by units', () => {
    const inv = refrigerantInventory(
      eq,
      {
        'Walk-in freezer, 10x12, with refrigeration': { refrigerant: 'R-404A', chargeLbPerUnit: 60, installedOn: '2026-01-01' },
        'Blackout rack, 200 lb capacity': { refrigerant: 'R-404A', chargeLbPerUnit: 12 },
        'Jar stand oven, full size 20-pan': { fuel: 'electric', ratedKw: 18 },
      },
      { 'Walk-in freezer, 10x12, with refrigeration': [{ date: '2026-04-01', lbAdded: 4 }] },
      '2026-06-30',
    );
    expect(inv.circuitsOnFile).toBe(2);
    const wi = inv.rows.find((r) => r.circuit.id.startsWith('Walk-in'))!;
    const bc = inv.rows.find((r) => r.circuit.id.startsWith('Blackout'))!;
    expect(wi.circuit.fullChargeLb).toBe(60);
    expect(bc.circuit.fullChargeLb).toBe(24);
    expect(wi.latestRate).toBeCloseTo(0.2704, 4);
    expect(wi.findings.find((f) => f.id === 'aim-leak-rate')!.status).toBe('triggered');
    expect(wi.co2eKgInYear).toBeCloseTo(4 * KG_PER_LB * 3922, 3);
    expect(bc.lbAddedInYear).toBe(0);
    expect(inv.totalCo2eKgInYear).toBeCloseTo(wi.co2eKgInYear, 9);
    expect(inv.greenBlackout.aggregateLeakRate).toBeCloseTo(4 / 84, 9);
  });
});

describe('farm carbon — water projection', () => {
  it('needs both a sample and a billed volume, then annualizes ×12', () => {
    expect(waterProjection(WATER_DEFAULTS, 367604, '2026-09-12').surchargeMonthly).toBeNull();
    const p = waterProjection(
      { ...WATER_DEFAULTS, meteredGalPerMonth: 60000, billedWastewaterMGalPerMonth: 0.5, bodMgL: 400, tssMgL: 300, codMgL: 800, greaseTrapLastPumpOut: '2026-08-01', greaseTrapFill: 0.3 },
      367604,
      '2026-09-12',
    );
    expect(p.surchargeMonthly!.surcharge).toBeCloseTo(1005.8874, 3);
    expect(p.surchargeAnnual).toBeCloseTo(12070.649, 2);
    expect(p.annualMeteredGal).toBe(720000);
    expect(p.galPerUnit).toBeCloseTo(720000 / 367604, 6);
    expect(p.greaseTrap!.nextDueBy).toBe('2026-10-30');
    expect(p.greaseTrap!.intervalExceeded).toBe(false);
  });
});
