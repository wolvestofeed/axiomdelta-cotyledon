/**
 * MicroFarm — the grow plan (outline §4) and the costing and capacity it carries (outline §5
 * rules 1 and 2). The seed is one plan per variety built from the variety records; every line
 * kind costs; the sowing is what one grow unit takes in trays; the library round-trips the plan
 * and projects it for the engine modules Phase 2 has not yet moved.
 */

import { describe, expect, it } from 'vitest';
import { VARIETIES, VARIETY_BY_KEY, VARIETY_BY_CODE } from '@/data/varieties';
import { TRAY_FORMAT_BY_KEY, PLAN_FORMATS, densityFactorOf, traySetCostPerUnit, unitSku } from '@/data/tray-formats';
import { MEDIUM_BY_KEY, NUTRIENT_BY_KEY, REGIME_BY_KEY, LIGHT_FIXTURES, FIXTURE_BY_KEY, SANITIZER_PER_TRAY, lightCostPerTrayDay } from '@/data/inputs-catalog';
import { FL_OZ_PER_GAL, WATER_PER_WATERING_OZ, STAGES, SPROUT_STAGES, lightDaysFrom, waterOzFrom, cycleDays, stagesFrom } from '@/data/stage-schedule';
import {
  GROW_PLAN_CODE_RX,
  codePrefixFor,
  growPlanProblems,
  leadVariety,
  lineLabel,
  nextGrowPlanCode,
  planStageDays,
  seedLineFor,
  singleVarietyPlan,
  formatNameOf,
  varietyNamesOf,
  type GrowPlanDef,
} from '@/data/grow-plan';
import { growPlanSeed, GROW_PLAN_SEED_CODES } from '@/data/grow-plans-seed';
import { GRAMS_PER_LB, costGrowPlan, defaultGrowCostContext, fixtureFor, costPlan, costContextFor } from '@/engine/grow-costing';
import { deriveGrowCapacity, growUnitsFrom, traysPerShelf, traysPerUnit, unitTakesPlan } from '@/engine/grow-capacity';
import { growPlanToRows, rowsToLibraryPlan, rowsToGrowPlan, SEED_GROW_PLANS } from '@/engine/grow-plan-library';
import { costPlanPerUnit, deriveCapacity, canopyMassPerUnit, packedUnitOz, sowingCosting, costPerUnit } from '@/engine';
import { equipmentSeed } from '@/data/capex';
import { resolveScenarioInputs } from '@/engine/scenario';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';
import { seedSubscriptionCycles } from '@/data/subscription-cycles';
import { assumptionsFor } from '@/engine/scenario';
import { laborMinutesPerUnit } from '@/engine/unit-cost';

const byCode = (code: string): GrowPlanDef => growPlanSeed.find((p) => p.code === code)!;
const broccoli = () => byCode('BROC-01');
const mung = () => byCode('MUNG-01');

describe('codes', () => {
  it('every variety carries a code and the supplier code; codes are unique', () => {
    expect(new Set(VARIETIES.map((v) => v.code)).size).toBe(VARIETIES.length);
    for (const v of VARIETIES) {
      expect(v.code).toMatch(/^[A-Z]{2,5}$/);
      expect(v.supplier.code).toBe('TLM');
      expect(VARIETY_BY_CODE[v.code]).toBe(v);
    }
  });

  it('a plan code is the lead variety code and a serial; a blend is BLEND; the next serial is one past the highest', () => {
    expect(broccoli().code).toBe('BROC-01');
    expect(GROW_PLAN_CODE_RX.test('BROC-01')).toBe(true);
    expect(GROW_PLAN_CODE_RX.test('AMK-E-001')).toBe(false);
    expect(nextGrowPlanCode([], 'BROC')).toBe('BROC-01');
    expect(nextGrowPlanCode(['BROC-01', 'BROC-07', 'RAD-02'], 'BROC')).toBe('BROC-08');
    expect(nextGrowPlanCode(['BLEND-01'], 'BLEND')).toBe('BLEND-02');
    const mixed: GrowPlanDef = { ...broccoli(), lines: [seedLineFor(VARIETY_BY_KEY['broccoli']!, 'flat-1020', 0.5), seedLineFor(VARIETY_BY_KEY['radish']!, 'flat-1020', 0.5)] };
    expect(codePrefixFor(mixed)).toBe('BLEND');
    expect(codePrefixFor(broccoli())).toBe('BROC');
  });

  it('the unit SKU is the plan code and the packaged format', () => {
    expect(unitSku('BROC-01', 'flat-1020')).toBe('BROC-01-1020');
    expect(unitSku('BROC-01', 'tray-7x11')).toBe('BROC-01-7X11');
    expect(unitSku('MUNG-01', 'pint-jar')).toBe('MUNG-01-PINT');
    expect(new Set(PLAN_FORMATS.map((f) => f.code)).size).toBe(PLAN_FORMATS.length);
  });
});

describe('the seed: one plan per variety from the variety record', () => {
  it('twelve plans, codes unique, each on its default format with the variety\'s own density', () => {
    expect(growPlanSeed).toHaveLength(12);
    expect(new Set(GROW_PLAN_SEED_CODES).size).toBe(12);
    expect(SEED_GROW_PLANS).toBe(growPlanSeed);
    for (const p of growPlanSeed) {
      expect(growPlanProblems(p), p.code).toEqual([]);
      const v = leadVariety(p)!;
      expect(p.code).toBe(`${v.code}-01`);
      expect(p.format).toBe(v.kind === 'sprout' ? 'pint-jar' : 'flat-1020');
      const seed = p.lines[0]!;
      expect(seed.kind).toBe('seed');
      if (seed.kind === 'seed') {
        expect(seed.gramsPerTray.value).toBe(v.seedGramsPer1020.value * densityFactorOf(TRAY_FORMAT_BY_KEY[p.format]));
        expect(seed.gramsPerTray.status).toBe(v.seedGramsPer1020.status);
        expect(seed.share).toBe(1);
      }
    }
  });

  it('a microgreen carries medium, nutrient and light lines; a sprout in a jar carries the seed line alone', () => {
    expect(broccoli().lines.map((l) => l.kind)).toEqual(['seed', 'medium', 'nutrient', 'light']);
    expect(mung().lines.map((l) => l.kind)).toEqual(['seed']);
    const medium = broccoli().lines[1]!;
    if (medium.kind === 'medium') expect(medium.mediumKey).toBe(VARIETY_BY_KEY['broccoli']!.media.defaultMedium);
    const light = broccoli().lines[3]!;
    if (light.kind === 'light') expect(light.regimeKey).toBe(VARIETY_BY_KEY['broccoli']!.light.defaultRegime);
  });

  it('a plan runs on its varieties\' stage days; a blend runs on the slowest at each stage; an override wins', () => {
    expect(planStageDays(broccoli())).toEqual(VARIETY_BY_KEY['broccoli']!.stageDays.value);
    const mixed: GrowPlanDef = { ...broccoli(), lines: [seedLineFor(VARIETY_BY_KEY['broccoli']!, 'flat-1020', 0.5), seedLineFor(VARIETY_BY_KEY['pea']!, 'flat-1020', 0.5)] };
    const d = planStageDays(mixed);
    expect(d.blackout).toBe(Math.max(VARIETY_BY_KEY['broccoli']!.stageDays.value.blackout, VARIETY_BY_KEY['pea']!.stageDays.value.blackout));
    const over: GrowPlanDef = { ...broccoli(), stageDays: { value: { soak: 0, sow: 1, germination: 2, blackout: 2, light: 3, 'harvest-window': 2 }, status: 'STATED', unit: 'days' } };
    expect(cycleDays(planStageDays(over))).toBe(10);
  });

  it('the problems list catches a bad code, a missing seed line, shares that do not sum to one, a second light line and a jar with a medium', () => {
    expect(growPlanProblems({ ...broccoli(), code: 'AMK-E-001' })).toContain('The code is a variety code, a dash and a serial: BROC-01.');
    expect(growPlanProblems({ ...broccoli(), lines: broccoli().lines.slice(1) })).toContain('A grow plan needs at least one seed line.');
    const half: GrowPlanDef = { ...broccoli(), lines: [seedLineFor(VARIETY_BY_KEY['broccoli']!, 'flat-1020', 0.5)] };
    expect(growPlanProblems(half).some((p) => p.includes('shares sum'))).toBe(true);
    expect(growPlanProblems({ ...broccoli(), lines: [...broccoli().lines, broccoli().lines[3]!] })).toContain('A plan carries one light line.');
    expect(growPlanProblems({ ...mung(), lines: [...mung().lines, { kind: 'medium', mediumKey: 'coco-coir', qtyPerTray: null }] })).toContain('A jar plan carries seed lines only: no medium, nutrient or light.');
  });
});

describe('costing on the four line kinds', () => {
  const c = costGrowPlan(broccoli());
  const v = VARIETY_BY_KEY['broccoli']!;

  it('seed: grams over the pound at the variety\'s price per pound', () => {
    const seed = c.lines[0]!;
    expect(seed.line.kind).toBe('seed');
    expect(seed.costPerTray).toBeCloseTo((v.seedGramsPer1020.value / GRAMS_PER_LB) * v.seedPricePerLb.value, 9);
    expect(seed.status).toBe(v.seedPricePerLb.status);
    expect(seed.basis).toContain('TLM');
    expect(c.perTray.seed).toBeCloseTo(seed.costPerTray, 9);
  });

  it('medium: the library quantity per 1020 scaled to the format, at the library price; hemp mat is the default', () => {
    const m = MEDIUM_BY_KEY['hemp-mat'];
    expect(broccoli().lines.find((l) => l.kind === 'medium')).toMatchObject({ mediumKey: 'hemp-mat' });
    const line = c.lines[1]!;
    expect(line.quantity).toBeCloseTo(m.qtyPer1020.value, 9);
    expect(line.costPerTray).toBeCloseTo(m.qtyPer1020.value * m.costPerUnit.value, 9);
    const on7x11 = costGrowPlan({ ...broccoli(), format: 'tray-7x11' });
    expect(on7x11.lines[1]!.quantity).toBeCloseTo(m.qtyPer1020.value * TRAY_FORMAT_BY_KEY['tray-7x11'].densityFactor.value, 9);
  });

  it('nutrient: ml per gallon over the gallons the tray takes from the stage the line starts', () => {
    const n = NUTRIENT_BY_KEY['floragrow-npk'];
    const days = planStageDays(broccoli());
    const oz = waterOzFrom('light', days);
    const expectedOz = stagesFrom('light').reduce((t, s) => t + s.wateringsPerDay * days[s.key as 'light' | 'harvest-window'] * WATER_PER_WATERING_OZ[s.watering].value, 0);
    expect(oz).toBeCloseTo(expectedOz, 9);
    const gal = oz / FL_OZ_PER_GAL;
    const line = c.lines[2]!;
    expect(line.quantity).toBeCloseTo(n.mlPerGal.value * gal, 9);
    expect(line.costPerTray).toBeCloseTo(n.mlPerGal.value * gal * n.costPerMl.value, 9);
    const typed = costGrowPlan({ ...broccoli(), lines: broccoli().lines.map((l) => (l.kind === 'nutrient' ? { ...l, mlPerGal: { value: 2 * n.mlPerGal.value, status: 'STATED' as const } } : l)) });
    expect(typed.lines[2]!.costPerTray).toBeCloseTo(2 * line.costPerTray, 9);
  });

  it('light: the fixture\'s cost per tray-day at the variety\'s own intensity, over the days under light', () => {
    const line = c.lines[3]!;
    const regime = REGIME_BY_KEY['balanced'];
    const days = planStageDays(broccoli());
    const lit = lightDaysFrom('light', days);
    expect(lit).toBe(days.light + days['harvest-window']);
    expect(c.lightDays).toBe(lit);
    // Broccoli has its own range (50 to 70 µmol); the plan reads its top, not the regime's target.
    const ppfd = v.light.ppfdRange!.max;
    expect(line.unitCost).toBeCloseTo(lightCostPerTrayDay(c.fixture, regime, ppfd), 9);
    expect(line.costPerTray).toBeCloseTo(lightCostPerTrayDay(c.fixture, regime, ppfd) * lit, 9);
    expect(line.basis).toContain('own range');
    const pea = costGrowPlan(byCode('PEA-01'));
    expect(pea.lines[3]!.basis).toContain('target');
  });

  it('consumables: the tray set over its uses plus sanitizer; the total is the sum of the five', () => {
    const f = TRAY_FORMAT_BY_KEY['flat-1020'];
    expect(traySetCostPerUnit(f)).toBeCloseTo(13.33 / 1000, 9);
    expect(c.perTray.consumables).toBeCloseTo(13.33 / 1000 + SANITIZER_PER_TRAY.value, 9);
    expect(c.perTray.total).toBeCloseTo(c.perTray.seed + c.perTray.medium + c.perTray.nutrient + c.perTray.light + c.perTray.consumables, 9);
    expect(c.perTray.total).toBeGreaterThan(c.perTray.seed);
  });

  it('a sprout in a jar costs its seed and the jar; nothing else', () => {
    const s = costGrowPlan(mung());
    expect(s.lines).toHaveLength(1);
    expect(s.perTray.medium + s.perTray.nutrient + s.perTray.light).toBe(0);
    expect(s.cycleDays).toBe(cycleDays(VARIETY_BY_KEY['mung-bean']!.stageDays.value));
    expect(s.lightDays).toBe(0);
    expect(s.harvestGramsPerTray).toBe(VARIETY_BY_KEY['mung-bean']!.harvestGramsPer1020.value);
  });

  it('the yield chain is seed grams to harvest grams; a price standing over the record is used and tagged STATED', () => {
    expect(c.seedGramsPerTray).toBe(v.seedGramsPer1020.value);
    expect(c.harvestGramsPerTray).toBe(v.harvestGramsPer1020.value);
    expect(c.yieldToHarvest).toBeCloseTo(v.harvestGramsPer1020.value / v.seedGramsPer1020.value, 9);
    expect(c.costPerHarvestOz).toBeCloseTo(c.perTray.total / (v.harvestGramsPer1020.value / 28.349523125), 9);
    const priced = costGrowPlan(broccoli(), defaultGrowCostContext({ seedPricePerLb: { broccoli: 40 } }));
    expect(priced.lines[0]!.unitCost).toBe(40);
    expect(priced.lines[0]!.status).toBe('STATED');
  });

  it('the fixture a plan is costed on is the first that delivers its regime, else the first fixture', () => {
    expect(fixtureFor(broccoli())).toBe(LIGHT_FIXTURES.find((f) => f.key === 'mars-hydro-vg80') ?? LIGHT_FIXTURES[0]);
    // Nutrition-forward blue asks for a blue-heavy ratio the fixed white fixture cannot give: the tunable fixture.
    expect(fixtureFor(byCode('RAD-01')).key).toBe('tunable-rb-fr');
    expect(fixtureFor(mung())).toBe(LIGHT_FIXTURES[0]);
  });
});

describe('capacity in trays and cycle days', () => {
  const seed = growUnitsFrom(equipmentSeed);
  /** One of the seed's lit racks, no dark rack. */
  const units = seed.filter((u) => !u.darkOnly).map((u) => ({ ...u, units: 1 }));

  it('the seed grow units are two of Vallecito\'s lit racks, five shelves of four 1020s under the Mars Hydro, and two dark racks of the same shelving', () => {
    expect(seed.map((u) => [u.units, u.shelves, u.fixtureKey, u.darkOnly])).toEqual([[2, 5, 'mars-hydro-vg80', false], [2, 5, null, true]]);
    const rack = units[0]!;
    expect(rack.shelves).toBe(5);
    expect(rack.fixtureKey).toBe('mars-hydro-vg80');
    expect(traysPerShelf('flat-1020', 48)).toBe(4);
    expect(traysPerShelf('flat-1020', 24)).toBe(2);
    expect(traysPerUnit(rack, 'flat-1020')).toBe(20);
    expect(traysPerUnit(rack, 'tray-7x11')).toBe(30);
    expect(traysPerUnit(rack, 'insert-5x5')).toBe(160);
  });

  it('a sowing is what one unit takes; the ceiling is the trays across the units over the cycle', () => {
    const cap = deriveGrowCapacity(broccoli(), units);
    expect(cap.sowingTrays).toBe(20);
    expect(cap.binding?.unit.key).toBe(units[0]!.key);
    expect(cap.totalTrays).toBe(20);
    expect(cap.unitCount).toBe(1);
    expect(cap.cycleDays).toBe(cycleDays(VARIETY_BY_KEY['broccoli']!.stageDays.value));
    expect(cap.traysPerDay).toBeCloseTo(20 / cap.cycleDays, 9);
    const two = deriveGrowCapacity(broccoli(), [{ ...units[0]!, units: 2 }]);
    expect(two.sowingTrays).toBe(20);
    expect(two.totalTrays).toBe(40);
  });

  it('a plan is placed only on a unit whose fixture delivers its light line; a jar plan goes anywhere', () => {
    const rack = units[0]!;
    expect(unitTakesPlan(rack, broccoli())).toBe(true);
    expect(unitTakesPlan(rack, byCode('RAD-01'))).toBe(false);
    expect(unitTakesPlan({ ...rack, fixtureKey: null }, broccoli())).toBe(false);
    expect(unitTakesPlan({ ...rack, fixtureKey: null }, mung())).toBe(true);
    expect(unitTakesPlan({ ...rack, fixtureKey: 'tunable-rb-fr' }, byCode('RAD-01'))).toBe(true);
    const none = deriveGrowCapacity(byCode('RAD-01'), units);
    expect(none.sowingTrays).toBe(0);
    expect(none.binding).toBeNull();
    expect(FIXTURE_BY_KEY['tunable-rb-fr']).toBeDefined();
  });
});

describe('the library: rows round-trip the plan', () => {
  const rows = (p: GrowPlanDef) => {
    const { header, lines } = growPlanToRows(p);
    return rowsToLibraryPlan({ ...header, id: 'x', version: 1, effectiveFrom: '2026-09-25', updatedAt: '2026-09-25T00:00:00.000Z' }, lines);
  };

  it('a stored plan comes back as written, lines in position order even when stored out of order', () => {
    const { header, lines } = growPlanToRows(broccoli());
    expect(header.format).toBe('flat-1020');
    expect(header.allergensPresent).toBe('');
    expect(lines.map((l) => l.name)).toEqual(broccoli().lines.map((l) => lineLabel(l)));
    const back = rowsToGrowPlan({ ...header, id: 'x', version: 1, effectiveFrom: null, updatedAt: new Date() }, [...lines].reverse());
    expect(back).toEqual(broccoli());
    expect(rowsToGrowPlan({ ...header, format: 'weird', status: 'odd', id: 'x', version: 1, effectiveFrom: null, updatedAt: new Date() }, [{ position: 0, name: 'x', line: { kind: 'nope' } }])).toMatchObject({ format: 'flat-1020', status: 'developing', lines: [] });
  });

  it('the library plan is the grow plan with its row identity', () => {
    const lib = rows(broccoli());
    const { id, source, version, effectiveFrom, updatedAt, ...plan } = lib;
    expect(plan).toEqual(broccoli());
    expect([id, source, version, effectiveFrom, typeof updatedAt]).toEqual(['x', 'user_built', 1, '2026-09-25', 'string']);
  });

  it('the engine costs a library plan on its grow costing: the same total, the mass on the seed line', () => {
    const lib = rows(broccoli());
    const g = costPlan(lib);
    const c = costPlanPerUnit(lib, 0);
    expect(c.totalInputCostPerUnit).toBeCloseTo(g.perTray.total, 9);
    expect(c.lines[0]!.costPerUnit).toBeCloseTo(g.perTray.seed, 9);
    expect(c.seedOzPerUnit).toBeCloseTo(40 / 28.349523125, 9);
    expect(c.packedOzPerUnit).toBeCloseTo(250 / 28.349523125, 9);
    expect(packedUnitOz(lib).totalOz).toBeCloseTo(250 / 28.349523125, 9);
    expect(canopyMassPerUnit(lib)).toBeCloseTo(250 / 453.59237, 9);
    const shrunk = costPlanPerUnit(lib, 0.03);
    expect(shrunk.totalInputCostPerUnit).toBeCloseTo(g.perTray.total * 1.03, 9);
  });

  it('a scenario what-if price on the projected seed line reaches the grow costing', () => {
    const lib = rows(broccoli());
    const r = resolveScenarioInputs({ inputs: { [`BROC-01::${VARIETY_BY_KEY['broccoli']!.name}`]: { unitCost: 30 } } }, [lib]);
    const edited = r.growPlans[0]!;
    expect(costContextFor(edited).seedPricePerLb).toEqual({ broccoli: 30 });
    expect(edited.prices?.[VARIETY_BY_KEY['broccoli']!.name]?.unitCost).toBe(30);
    expect(costPlan(edited).lines[0]!.costPerTray).toBeCloseTo((40 / GRAMS_PER_LB) * 30, 9);
    expect(resolveScenarioInputs({}, [lib]).growPlans[0]!.prices).toBeUndefined();
    expect(costPlanPerUnit(edited, 0).lines[0]!.costPerUnit).toBeCloseTo((40 / GRAMS_PER_LB) * 30, 9);
  });

  it('the engine sizes a library plan in trays on the grow units, never off mass', () => {
    const lib = rows(broccoli());
    const R = resolveScenarioInputs({}, [lib]);
    const cap = deriveCapacity(lib, R.capacityInputs);
    expect(cap.sowingSize).toBe(20);
    expect(cap.grow?.sowingTrays).toBe(20);
    expect(cap.grow?.cycleDays).toBe(cycleDays(VARIETY_BY_KEY['broccoli']!.stageDays.value));
    expect(cap.maxUnitsPerDay).toBe(cap.sowingSize * cap.cyclesPerDay);
    // Sowings a day are the lit racks that take the plan: two on the seed.
    expect(cap.cyclesPerDay).toBe(cap.grow!.unitCount);
    const s = sowingCosting(lib, R.capacityInputs, 0);
    expect(s.sowingUnits).toBe(20);
    expect(s.sowingInputCost).toBeCloseTo(20 * costPlan(lib).perTray.total, 6);
    const u = costPerUnit(lib, R.assumptions, R.capacityInputs);
    expect(u.food).toBeCloseTo(costPlanPerUnit(lib, R.assumptions.yield.shrinkAllowance.value).totalInputCostPerUnit, 9);
    expect(u.total).toBeGreaterThanOrEqual(u.food);
  });

  it('labor on a tray is the three streams of Vallecito\'s study: 21 minutes a live 1020 at the loaded wage', () => {
    const lib = rows(broccoli());
    const R = resolveScenarioInputs({}, [lib]);
    const std = R.laborStandards['BROC-01']!;
    expect(std.basis).toBe('estimated');
    expect(std.cycleDays).toBe(cycleDays(VARIETY_BY_KEY['broccoli']!.stageDays.value));
    expect(laborMinutesPerUnit(std, 20)).toBeCloseTo(21, 9);
    const a = assumptionsFor(R, 'BROC-01');
    expect(a.laborSplit.dailyMinutesPerUnit.value).toBeCloseTo(11, 9);
    expect(a.laborSplit.dailyMinutesPerUnit.status).toBe('DERIVED');
    const u = costPerUnit(lib, a, R.capacityInputs);
    expect(u.directLabor).toBeCloseTo((21 / 60) * a.labor.blendedLoadedWage.value, 9);
  });

  it('every seed plan projects, costs, sizes, estimates a study and seeds a cycle without throwing', () => {
    const libs = growPlanSeed.map(rows);
    const R = resolveScenarioInputs({}, libs);
    expect(R.growPlans).toHaveLength(12);
    expect(R.growPlan.code).toBe('BROC-01');
    for (const lib of libs) {
      expect(costPlanPerUnit(lib).totalInputCostPerUnit).toBeGreaterThan(0);
      const cap = deriveCapacity(lib, R.capacityInputs);
      expect(Number.isFinite(cap.sowingSize)).toBe(true);
      expect(estimatedTimeStudy(lib, Math.max(1, cap.sowingSize)).lines.length).toBeGreaterThan(0);
    }
    const cycles = seedSubscriptionCycles(libs, '2026-09-28');
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles.every((c) => c.days.every((d) => d.growPlanCode === 'BROC-01'))).toBe(true);
  });

  it('a plan is labelled by its format and its varieties', () => {
    const lib = broccoli();
    expect(lib.code).toBe('BROC-01');
    expect(formatNameOf(lib)).toBe('1020 flat');
    expect(varietyNamesOf(lib)).toBe(VARIETY_BY_KEY['broccoli']!.name);
    expect(SPROUT_STAGES.length).toBeLessThan(STAGES.length);
  });
});

describe('a sprout variety grown as a microgreen in a blend', () => {
  const lentil = VARIETY_BY_KEY['red-lentil']!;
  const mungBean = VARIETY_BY_KEY['mung-bean']!;
  const wheat = VARIETY_BY_KEY['wheat']!;

  it('lentil, mung and wheat stay sprouts, their jar plans unchanged, and carry a tray record for a 1020', () => {
    for (const v of [lentil, mungBean, wheat]) {
      expect(v.kind).toBe('sprout');
      expect(v.tray).toBeDefined();
      expect(byCode(`${v.code}-01`).format).toBe('pint-jar');
      expect(seedLineFor(v, 'pint-jar').gramsPerTray.value).toBe(v.seedGramsPer1020.value);
      expect(seedLineFor(v, 'flat-1020').gramsPerTray.value).toBe(v.tray!.seedGramsPer1020.value);
    }
    expect(seedLineFor(lentil, 'flat-1020').gramsPerTray.status).toBe('STATED');
    expect(seedLineFor(mungBean, 'flat-1020').gramsPerTray.status).toBe('PLACEHOLDER');
  });

  it('a tray plan runs on the tray stage days and harvest weight; a jar plan on the sprout record', () => {
    const tray = { ...singleVarietyPlan(lentil, 'flat-1020'), format: 'flat-1020' as const };
    expect(planStageDays(tray)).toEqual(lentil.tray!.stageDays.value);
    expect(planStageDays(byCode('LEN-01'))).toEqual(lentil.stageDays.value);
    expect(costGrowPlan(tray).harvestGramsPerTray).toBeCloseTo(lentil.tray!.harvestGramsPer1020.value, 9);
    expect(costGrowPlan(byCode('LEN-01')).harvestGramsPerTray).toBeCloseTo(lentil.harvestGramsPer1020.value, 9);
  });
});
