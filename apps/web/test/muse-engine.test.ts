import { describe, it, expect } from 'vitest';
import {
  costRecipe,
  chilledMassPerPortion,
  platedPortionOz,
  deriveCapacity,
  runPlanningLoop,
  laborForDay,
  buildPurchaseOrder,
  fixedLaborShareOfFullBatch,
  validationWarnings,
  chillerOccupancyMinutes,
  plantChillWindow,
  coolingConformance,
  FOOD_CODE_COOLING_STAGE_ONE_MIN,
  FOOD_CODE_COOLING_TOTAL_MIN,
} from '@/app/(muse)/muse/_engine';
import {
  laborRequirement,
  ratedDaySlots,
  checkStaffing,
  staffedSpans,
  scheduledHeadcountAt,
  newCrewDefaultsFor,
} from '@/app/(muse)/muse/_engine/staffing';
import { recipeThermal } from '@/app/(muse)/muse/_engine/thermal';
import { batchVesselsFrom, vesselForProcess } from '@/app/(muse)/muse/_engine/equipment';
import { equipmentSeed } from '@/app/(muse)/muse/_data/capex';
import { assumptions, capacityInputs, recipe, timeStudy } from '@/app/(muse)/muse/_data/plan-data';
import { menuRecipes, adultRecipes } from '@/app/(muse)/muse/_data/recipes-menu';
import { crews as seedCrews, newCrew } from '@/app/(muse)/muse/_data/crews';
import { resolveScenarioInputs, type CapacityOverlay, type CrewOverlay } from '@/app/(muse)/muse/_engine/scenario';

/** The default capacity inputs with some leaves overridden — a scenario in miniature. */
const capWith = (over: CapacityOverlay = {}) => resolveScenarioInputs({ capacity: over }).capacityInputs;
/** Proposed crews through the overlay, resolved the way every page resolves them. */
const crewsWith = (overlay: Record<string, CrewOverlay>) => resolveScenarioInputs({ crews: overlay }).crews;
const menu = (code: string) => [...menuRecipes, ...adultRecipes].find((r) => r.code === code)!;

// Golden values from the operating model, restated 2026-09-13 against the USDA
// Food Buying Guide yields (docs/muse/research/model-corrections-2026-09-13.md). These
// lock the engine to the plan; change them deliberately, never by chasing red.
describe('muse — recipe costing', () => {
  it('matches the sheet food cost per portion (with 3% shrink) — unchanged by the yield corrections', () => {
    const c = costRecipe();
    expect(c.foodCostPerBatch).toBeCloseTo(178.0062, 3);
    expect(c.foodCostPerPortion).toBeCloseTo(1.7801, 3);
    expect(c.totalFoodCostPerPortion).toBeCloseTo(1.8335, 3);
  });
});

describe('muse — recipe yields carry their own provenance', () => {
  it('every stored cooked yield equals AP quantity × yield factor (no drift)', () => {
    for (const i of recipe.ingredients) {
      expect(i.apQtyPerBatch * i.yieldToCooked, i.name).toBeCloseTo(i.cookedYieldPerBatch, 3);
    }
  });
  it('every ingredient line names the source of its yield, separately from its price', () => {
    for (const i of recipe.ingredients) {
      expect(i.yieldSource.length, i.name).toBeGreaterThan(0);
      expect(i.yieldStatus, i.name).toBeTruthy();
    }
  });
  it('the three USDA Food Buying Guide yields are the published figures', () => {
    const y = (n: string) => recipe.ingredients.find((i) => i.name.startsWith(n))!.yieldToCooked;
    expect(y('Ground beef')).toBe(0.75);
    expect(y('Pinto beans')).toBeCloseTo(1.9792, 4);
    expect(y('Brown rice')).toBeCloseTo(2.8946, 4);
    expect(y('Onion')).toBe(0.78);
  });
});

describe('muse — plated portion is derived, never typed', () => {
  it('plated weight is the sum of COOKED components plus the tortilla unit mass', () => {
    const p = platedPortionOz();
    expect(p.hotOz).toBeCloseTo(10.9456, 3);
    expect(p.coldOz).toBeCloseTo(0.5, 6);
    expect(p.eachOz).toBeCloseTo(0.88, 6);
    expect(p.totalOz).toBeCloseTo(12.33, 2);
  });
  it('the as-purchased weight is a procurement figure and is NOT the plated bowl', () => {
    const p = platedPortionOz();
    expect(p.apOz).toBeCloseTo(9.45, 2); // where the old "9.5 oz stated portion" came from
    expect(p.totalOz - p.apOz).toBeGreaterThan(2); // dry beans and rice take on water
  });
  it('scales with the portion factor', () => {
    expect(platedPortionOz(recipe, 1.5).totalOz).toBeCloseTo(platedPortionOz().totalOz * 1.5, 9);
  });
});

describe('muse — cook to chiller is read from the recipe cook times', () => {
  it('is the longest same-day component cook at the high end of its stated range', () => {
    const fish = recipeThermal(menu('AMK-E-004')); // fish bites 12–20, potatoes 35–45, carrots 10–12
    expect(fish.complete).toBe(true);
    expect(fish.cookToChillMinutes).toBe(45);
    expect(fish.longestComponent).toBe('Crispy potatoes');
    expect(recipeThermal(menu('AMK-E-011')).cookToChillMinutes).toBe(55); // brown rice
    expect(recipeThermal(menu('AMK-E-003')).cookToChillMinutes).toBe(120); // thighs, 1.5–2 h
    expect(recipeThermal(menu('AMK-E-006')).cookToChillMinutes).toBe(180); // chili, 2–3 h
  });
  it('groups 1 and 2 never put a recipe more than 60 minutes from its first load', () => {
    for (const code of ['AMK-E-002', 'AMK-E-004', 'AMK-E-005', 'AMK-E-007', 'AMK-E-008', 'AMK-E-010', 'AMK-E-011']) {
      expect(recipeThermal(menu(code)).cookToChillMinutes!, code).toBeLessThanOrEqual(60);
    }
  });
  it('the chicken salad chicken is 25 minutes (stated)', () => {
    const salad = recipeThermal(menu('AMK-E-005'));
    expect(salad.cookToChillMinutes).toBe(25);
    expect(salad.complete).toBe(true);
    expect(salad.components[0].basis).toContain('25 minutes');
  });
  it('a gap is listed beside the time, never filled in', () => {
    const chili = recipeThermal(menu('AMK-E-006'));
    expect(chili.complete).toBe(false);
    expect(chili.gaps).toEqual(['Roasted zucchini: Zucchini is not named in the standard']);
    const code = recipeThermal(recipe); // AMK-E-001: beef 15–20, rice 45–55; pinto beans, vegetables and salsa have no time
    expect(code.cookToChillMinutes).toBe(55);
    expect(code.gaps).toHaveLength(3);
  });
  it('an overnight cook adds no same-day minutes; what follows it is a gap', () => {
    const pork = recipeThermal(menu('AMK-E-009'));
    expect(pork.overnight).toEqual(['Pulled pork']);
    expect(pork.cookToChillMinutes).toBe(0);
    expect(pork.gaps[0]).toContain('Shredding');
  });
  it('the adult meals read their student meal’s cook times', () => {
    for (let n = 2; n <= 11; n++) {
      const s = menu(`AMK-E-${String(n).padStart(3, '0')}`);
      const a = menu(`AMK-A-${String(n).padStart(3, '0')}`);
      expect(recipeThermal(a).cookToChillMinutes, a.code).toBe(recipeThermal(s).cookToChillMinutes);
      expect(deriveCapacity(a, capacityInputs).chillWindow.startMin, a.code).toBe(deriveCapacity(s, capacityInputs).chillWindow.startMin);
    }
  });
  it('a recipe with no cook time on file has no first load and no ceiling — never a placeholder', () => {
    const unknown = { ...structuredClone(recipe), code: 'AMK-X-999' };
    expect(recipeThermal(unknown).cookToChillMinutes).toBeNull();
    const cap = deriveCapacity(unknown, capacityInputs);
    expect(cap.chillWindow.firstLoadBasis).toBe('none');
    expect(cap.maxPortionsPerDay).toBe(0);
    expect(validationWarnings(unknown, assumptions, timeStudy, capacityInputs).map((w) => w.id)).toContain('plant-window-no-cycle');
  });
  it('the 25-minute load is stated', () => {
    expect(capacityInputs.loadMinutes.value).toBe(25);
    expect(capacityInputs.loadMinutes.status).toBe('PLACEHOLDER'); // an estimate (Robert, 2026-09-15)
  });
});

describe('muse — capacity is a property of the plant', () => {
  it('derives chilled mass per portion from hot components only', () => {
    expect(chilledMassPerPortion()).toBeCloseTo(0.6841, 3);
  });
  it('AMK-E-001: batch 275 on the Phase 1 chiller; first load 07:55 (cooking from 07:00, rice 55 min); 5 cycles to 19:00 → 1,375/day', () => {
    const cap = deriveCapacity();
    expect(cap.lbPerCycle).toBe(200); // one cabinet's load — two cabinets on the Phase 1 list are two streams, never 400 lb (Robert, 2026-09-17)
    expect(cap.portionsPerCycleRaw).toBeCloseTo(292.3, 0);
    expect(cap.binding?.vessel.item).toBe('Blast chiller, 200 lb capacity');
    expect(cap.binding?.component).toBeNull();
    expect(cap.bounds.map((b) => b.vessel.item.split(',')[0])).toEqual(['Blast chiller', 'Tilting braising pan / skillet', 'Steam-jacketed tilting kettle']);
    expect(cap.batchSize).toBe(275);
    expect(cap.occupancyMinutes).toBe(125);
    expect(cap.chillWindow.openMin).toBe(420); // 07:00, a presumption
    expect(cap.chillWindow.closeMin).toBe(1140); // 19:00, a presumption
    expect(cap.chillWindow.firstLoadBasis).toBe('thermal');
    expect(cap.chillWindow.startMin).toBe(475);
    expect(cap.chillWindow.minutes).toBe(665);
    expect(cap.cyclesPerDay).toBe(5); // 665 ÷ 125
    expect(cap.maxPortionsPerDay).toBe(1375);
  });
  it('the operating inputs carry PLACEHOLDER tags; production days are DERIVED from the calendar', () => {
    for (const k of ['operatingOpenMin', 'operatingCloseMin', 'loadStaff', 'unloadStaff'] as const) {
      expect(capacityInputs[k].status, k).toBe('PLACEHOLDER');
    }
    expect(capacityInputs.productionDaysPerYear.status).toBe('DERIVED');
    expect('firstLoadAfterOpenMin' in capacityInputs).toBe(false);
  });
  it('no crew, headcount or staff input moves the ceiling', () => {
    const base = deriveCapacity(recipe, capWith()).maxPortionsPerDay;
    const withCrews = resolveScenarioInputs({ crews: { 'crew-1': { startMin: 420, endMin: 600, headcount: 1 } } });
    expect(deriveCapacity(recipe, withCrews.capacityInputs).maxPortionsPerDay).toBe(base);
    const legacy = resolveScenarioInputs({ crews: { 'shift-2': { endMin: 1170 } } }); // once added a cycle
    expect(deriveCapacity(recipe, legacy.capacityInputs).maxPortionsPerDay).toBe(base);
    expect(deriveCapacity(recipe, capWith({ loadStaff: 9, unloadStaff: 0 })).maxPortionsPerDay).toBe(base);
    expect('sanitizeMinutes' in capacityInputs || 'sanitizeStaff' in capacityInputs).toBe(false); // the chiller is not sanitized per batch (Robert, 2026-09-15)
  });
  it('the operating day and the recipe’s cook times are what move it', () => {
    expect(deriveCapacity(recipe, capWith({ operatingCloseMin: 1000 })).cyclesPerDay).toBe(4); // 07:55–16:40 = 525 min
    expect(deriveCapacity(recipe, capWith({ operatingCloseMin: 755 })).cyclesPerDay).toBe(2); // 07:55–12:35 = 280 min
    expect(deriveCapacity(menu('AMK-E-004'), capacityInputs).cyclesPerDay).toBe(5); // 07:45–19:00 = 675 min
    expect(deriveCapacity(menu('AMK-E-006'), capacityInputs).cyclesPerDay).toBe(4); // 10:00–19:00 = 540 min
    expect(deriveCapacity(menu('AMK-E-009'), capacityInputs).cyclesPerDay).toBe(5); // pork cooked overnight: 07:00–19:00
  });
  it('reports, without counting, a batch that could be loaded before close', () => {
    const w = plantChillWindow(); // 07:55 + 5 × 125 = 18:20; a load then ends 18:45
    expect(w.cycles).toBe(5);
    expect(w.loadBeforeCloseExtraCycle).toBe(true);
    expect(plantChillWindow(capWith({ operatingCloseMin: 1100 })).loadBeforeCloseExtraCycle).toBe(false); // closes at 18:20
  });
  it('a close before the first load is an empty window and a warning, not a crash', () => {
    const cap = capWith({ operatingCloseMin: 460 });
    expect(plantChillWindow(cap).minutes).toBe(0);
    expect(deriveCapacity(recipe, cap).maxPortionsPerDay).toBe(0);
    expect(validationWarnings(recipe, assumptions, timeStudy, cap).map((x) => x.id)).toContain('plant-window-no-cycle');
    expect(validationWarnings().map((x) => x.id)).not.toContain('plant-window-no-cycle');
  });
});

describe('muse — chiller occupancy is load + chill + unload, not the chill stage', () => {
  it('sums the three elements at the defaults (25 + 90 + 10 = 125); the cabinet is not sanitized per batch', () => {
    expect(chillerOccupancyMinutes()).toBe(125);
    expect(chillerOccupancyMinutes(capWith({ unloadMinutes: 25 }))).toBe(140);
    // A saved scenario's retired sanitize keys move nothing.
    expect(resolveScenarioInputs({ capacity: { sanitizeMinutes: 60, sanitizeStaff: 3 } }).capacityInputs).toEqual(resolveScenarioInputs({}).capacityInputs);
  });
  it('batch size never moves with any occupancy element or the operating day — it comes off mass', () => {
    const base = deriveCapacity().batchSize;
    for (const over of [{ loadMinutes: 0 }, { chillMinutes: 120 }, { unloadMinutes: 60 }, { operatingOpenMin: 300 }, { operatingCloseMin: 900 }]) {
      expect(deriveCapacity(recipe, capWith(over)).batchSize).toBe(base);
    }
  });
  it('cycles at a 275 batch for each occupancy and window length from the 07:55 first load', () => {
    const at = (load: number, chill: number, unload: number, windowH: number) =>
      deriveCapacity(recipe, capWith({ loadMinutes: load, chillMinutes: chill, unloadMinutes: unload, operatingCloseMin: 475 + windowH * 60 }));
    expect(at(0, 90, 0, 6).cyclesPerDay).toBe(4); // the old model: zero handling time
    expect(at(0, 90, 0, 6).maxPortionsPerDay).toBe(1100);
    expect(at(15, 90, 10, 6).cyclesPerDay).toBe(3);
    expect(at(25, 90, 10, 6).cyclesPerDay).toBe(2);
    expect(at(25, 90, 10, 7.5).cyclesPerDay).toBe(3);
    expect(at(25, 90, 10, 8).cyclesPerDay).toBe(3);
    expect(at(25, 120, 10, 7.5).cyclesPerDay).toBe(2);
    expect(at(25, 90, 10, 7.5).maxPortionsPerDay).toBe(825);
  });
});

describe('muse — labor is a requirement the plan emits', () => {
  const cap = deriveCapacity();
  const rated = laborRequirement(ratedDaySlots(cap));

  it('the rated day places every cycle one occupancy apart from the first load', () => {
    expect(ratedDaySlots(cap).map((s) => s.loadMin)).toEqual([475, 600, 725, 850, 975]); // 07:55, 10:00, 12:05, 14:10, 16:15
  });
  it('places each cabinet task on the clock with the people it needs at once — load and unload, no per-batch sanitize', () => {
    const b4 = rated.placed.filter((p) => p.seq === 4).map((p) => [p.task, p.startMin, p.endMin, p.headcount]);
    expect(b4).toEqual([
      ['Cabinet load', 850, 875, 2],
      ['Cabinet unload to cold hold', 965, 975, 1], // 16:05–16:15
    ]);
    expect(rated.placed.some((p) => /sanitiz/i.test(p.task))).toBe(false);
    expect(rated.chills.find((c) => c.seq === 4)).toEqual({ seq: 4, startMin: 875, endMin: 965 });
    expect(rated.peakHeadcount).toBe(2);
    expect(rated.peakAtMin).toBe(465); // the 07:45–08:00 interval holds the 07:55 load
  });
  it('staff-hours: 1 h a batch at the cabinet, the rest of the time study scaled and not placed', () => {
    expect(rated.placedStaffHours).toBeCloseTo(5, 9); // (25 × 2 + 10) min × 5 batches
    // fixed 180 − 10 (cold hold, placed as unload) = 170 × 5; variable 750 − 50 (chill-and-stage, placed as load) = 700 / 500 × 1,375
    expect(rated.unplacedStaffHours).toBeCloseTo((170 * 5 + (700 / 500) * 1375) / 60, 9);
    expect(rated.totalStaffHours).toBeCloseTo(rated.placedStaffHours + rated.unplacedStaffHours, 9);
    expect(rated.unplaced.map((t) => t.task)).not.toContain('Component blast chill and stage');
    expect(rated.unplaced.map((t) => t.task)).not.toContain('Cold hold to dispatch');
    expect(rated.intervals.reduce((s, i) => s + i.staffHours, 0)).toBeCloseTo(rated.placedStaffHours, 9);
  });
  it('an empty plan requires no placed labor', () => {
    const none = laborRequirement([]);
    expect(none.placed).toEqual([]);
    expect(none.totalStaffHours).toBe(0);
    expect(none.peakAtMin).toBeNull();
  });
});

describe('muse — proposed crews are checked against the requirement, never the other way round', () => {
  const cap = deriveCapacity();
  const rated = laborRequirement(ratedDaySlots(cap));

  it('no crew is seeded; with none proposed nothing is checked', () => {
    expect(seedCrews).toEqual([]);
    expect(resolveScenarioInputs({}).crews).toEqual([]);
    const s = checkStaffing(rated, [], cap);
    expect(s.checked).toBe(false);
    expect(s.findings).toEqual([]);
  });
  it('the retired two-shift pattern, resolved from a saved scenario, is PLACEHOLDER and produces findings on the schedule', () => {
    const legacy = crewsWith({ 'shift-2': {} });
    expect(legacy.map((c) => c.id)).toEqual(['shift-1', 'shift-2']);
    for (const c of legacy) expect(c.headcount.status).toBe('PLACEHOLDER');
    const s = checkStaffing(rated, legacy, cap);
    expect(s.checked).toBe(true);
    expect(s.staffedAtLoadAndUnload).toBe(false); // batch 5 unloads 18:10–18:20, after Shift 2 leaves at 18:00
    expect(s.chillCrossesUnstaffed).toBe(true);
    expect(s.unattendedChillExtraCycle).toBe(false); // no crew is there to load an 18:20 batch
    const kinds = s.findings.map((f) => f.kind);
    expect(kinds).toContain('no-crew-at-task');
    expect(kinds).toContain('crew-outside-operating-day'); // Shift 1 starts 05:00
    expect(kinds).not.toContain('crew-hours-below-requirement');
    // …and the ceiling is still the plant's.
    expect(deriveCapacity(recipe, resolveScenarioInputs({ crews: { 'shift-2': {} } }).capacityInputs).maxPortionsPerDay).toBe(1375);
  });
  it('a person needed at the cabinet with no crew scheduled is a finding at that minute', () => {
    const s = checkStaffing(rated, crewsWith({ 'shift-2': { removed: true } }), cap); // Shift 1 alone, 05:00–13:30
    expect(s.staffedAtLoadAndUnload).toBe(false);
    expect(s.chillCrossesUnstaffed).toBe(true);
    const unload = s.findings.find((f) => f.kind === 'no-crew-at-task' && f.atMin === 840)!; // batch 3's unload
    expect(unload.detail).toContain('14:00');
    expect(unload.detail).toContain('no crew is scheduled then');
  });
  it('a crew covering the operating day with enough people clears every placed task; hours and the extra cycle are still reported', () => {
    const s = checkStaffing(rated, crewsWith({ 'crew-1': { startMin: 420, endMin: 1140, headcount: 2 } }), cap);
    expect(s.staffedAtLoadAndUnload).toBe(true);
    expect(s.chillCrossesUnstaffed).toBe(false);
    expect(s.findings.map((f) => f.kind).sort()).toEqual(['crew-hours-below-requirement', 'extra-cycle-across-close']);
    expect(cap.cyclesPerDay).toBe(5); // the extra cycle is not counted
  });
  it('one person short at a two-person load is a named shortfall at that minute', () => {
    const s = checkStaffing(rated, crewsWith({ 'crew-1': { startMin: 420, endMin: 1140, headcount: 1 } }), cap);
    const first = s.findings.find((f) => f.kind === 'crew-short-at-task')!;
    expect(first.atMin).toBe(475);
    expect(first.required).toBe(2);
    expect(first.scheduled).toBe(1);
  });
  it('staffed minutes are the union of crews with headcount; a zero-headcount crew staffs nothing', () => {
    const two = crewsWith({ a: { startMin: 420, endMin: 780, headcount: 3 }, b: { startMin: 720, endMin: 1140, headcount: 2 } });
    expect(staffedSpans(two)).toEqual([{ startMin: 420, endMin: 1140 }]);
    expect(scheduledHeadcountAt(two, 750)).toBe(5);
    expect(staffedSpans(crewsWith({ ghost: { startMin: 420, endMin: 1140, headcount: 0 } }))).toEqual([]);
  });
  it('a new crew starts on the operating day with the most people the placed tasks need at once', () => {
    expect(newCrewDefaultsFor(rated)).toEqual({ startMin: 420, endMin: 1140, headcount: 2 });
    const added = crewsWith({ 'crew-1': { label: 'Proposed' } })[0];
    expect(added.headcount.status).toBe('STATED');
    expect([added.startMin.value, added.endMin.value, added.headcount.value]).toEqual([420, 1140, 2]);
    expect(newCrew('x', {}, { startMin: 1, endMin: 2, headcount: 3 }).headcount.value).toBe(3);
  });
});

describe('muse — the chill stage against FDA Food Code 3-501.14 (CCP-2)', () => {
  it('holds the two limits as named constants', () => {
    expect(FOOD_CODE_COOLING_STAGE_ONE_MIN).toBe(120);
    expect(FOOD_CODE_COOLING_TOTAL_MIN).toBe(360);
  });
  it.each([
    [75, true, true],
    [90, true, true],
    [150, false, true],
    [400, false, false],
  ])('chill stage of %i min → stage one %s, total %s', (min, one, total) => {
    const c = coolingConformance(min);
    expect(c.stageOneOk).toBe(one);
    expect(c.totalOk).toBe(total);
    expect(c.marginMin).toBe(120 - min);
  });
  it('the default passes both stages with 30 minutes of headroom on stage one', () => {
    expect(deriveCapacity().cooling.marginMin).toBe(30);
  });
  it('a scenario may set a chill the Code forbids — the engine says so, it does not refuse', () => {
    const cap = capWith({ chillMinutes: 150 });
    expect(deriveCapacity(recipe, cap).cooling.stageOneOk).toBe(false);
    expect(validationWarnings(recipe, assumptions, timeStudy, cap).map((x) => x.id)).toContain('ccp2-cooling-limit');
    expect(validationWarnings().map((x) => x.id)).not.toContain('ccp2-cooling-limit');
  });
  it('occupancy is never on the cooling clock: a 60-minute unload changes nothing here', () => {
    expect(deriveCapacity(recipe, capWith({ unloadMinutes: 60 })).cooling).toEqual(deriveCapacity().cooling);
  });
});

describe('muse — scenario resolver carries the plant inputs, the calendar and the crews', () => {
  it('legacy saved keys resolve onto the plant inputs; the retired first-load keys move nothing else', () => {
    const R = resolveScenarioInputs({ capacity: { cycleTimeMinutes: 100, chillWindowHours: 7 } });
    expect(R.capacityInputs.chillMinutes.value).toBe(100);
    expect(R.capacityInputs.operatingCloseMin.value).toBe(720 + 7 * 60); // 7 h from the old 12:00 first load
    expect(resolveScenarioInputs({ capacity: { firstLoadMin: 780, chillWindowHours: 6 } }).capacityInputs.operatingCloseMin.value).toBe(1140);
    const retired = resolveScenarioInputs({ capacity: { firstLoadMin: 780, firstLoadAfterOpenMin: 300 } });
    expect(deriveCapacity(recipe, retired.capacityInputs).chillWindow.startMin).toBe(475);
    // an explicit new key wins over the legacy one
    expect(resolveScenarioInputs({ capacity: { chillMinutes: 80, cycleTimeMinutes: 100 } }).capacityInputs.chillMinutes.value).toBe(80);
    expect(resolveScenarioInputs({ capacity: { operatingCloseMin: 1000, chillWindowOverrideHours: 9 } }).capacityInputs.operatingCloseMin.value).toBe(1000);
  });
  it('production days are counted from the production calendar unless a scenario types them', () => {
    expect(resolveScenarioInputs({}).capacityInputs.productionDaysPerYear.value).toBe(261); // 2027 weekdays, no closure (the forecast year, Roadmap K)
    const christmas = [{ startDate: '2027-12-24', endDate: '2027-12-24' }]; // a Friday
    expect(resolveScenarioInputs({}, undefined, undefined, christmas).capacityInputs.productionDaysPerYear.value).toBe(260);
    const weekend = [{ startDate: '2027-07-03', endDate: '2027-07-04' }]; // Saturday–Sunday
    expect(resolveScenarioInputs({}, undefined, undefined, weekend).capacityInputs.productionDaysPerYear.value).toBe(261);
    expect(resolveScenarioInputs({ capacity: { productionDaysPerYear: 250 } }, undefined, undefined, christmas).capacityInputs.productionDaysPerYear.value).toBe(250);
  });
  it('crews are edited, removed and added through the overlay', () => {
    const R = resolveScenarioInputs({
      crews: {
        'shift-2': { endMin: 1170 },
        'shift-1': { removed: true },
        'crew-1': { label: 'Second morning crew', startMin: 420, endMin: 930, headcount: 4 },
      },
    });
    expect(R.crews.map((c) => c.id).sort()).toEqual(['crew-1', 'shift-2']);
    expect(R.crews.find((c) => c.id === 'shift-2')!.endMin.value).toBe(1170);
    const added = R.crews.find((c) => c.id === 'crew-1')!;
    expect(added.label).toBe('Second morning crew');
    expect(added.headcount.status).toBe('STATED');
    expect('crews' in R.capacityInputs).toBe(false);
  });
});

describe('muse — planning loop', () => {
  const base = {
    forecastPortions: 650,
    openingInventory: 3250,
    daysOfCoverTarget: 5,
    holdLifeDays: 30,
    batchSize: 575,
    cyclesAvailable: 2,
  };
  it('matches the single-day plan at the derived batch', () => {
    const r = runPlanningLoop(base);
    expect(r.targetInventory).toBe(3250);
    expect(r.projectedInventory).toBe(2600);
    expect(r.shortfall).toBe(650);
    expect(r.batchesToRun).toBe(2);
    expect(r.portionsProduced).toBe(1150);
    expect(r.closingInventory).toBe(3750);
    expect(r.daysOfCover).toBeCloseTo(5.7692, 3);
    expect(r.overproductionCarriedForward).toBe(500);
    expect(r.holdLifeCheck).toBe('OK');
    expect(r.capacityCheck).toBe('OK');
  });
  it('flips to OVER_CAPACITY when the forecast exceeds the chiller', () => {
    const r = runPlanningLoop({ ...base, forecastPortions: 3000, openingInventory: 3000 });
    expect(r.batchesToRun).toBeGreaterThan(base.cyclesAvailable);
    expect(r.capacityCheck).toBe('OVER_CAPACITY');
  });
});

describe('muse — labor (fixed per batch + variable per portion)', () => {
  it('the time study reconciles to the labor split it feeds', () => {
    const minutes = (kind: 'fixed' | 'variable') =>
      timeStudy.tasks.filter((t) => t.scalesWith === kind).reduce((s, t) => s + t.laborMinutes, 0);
    for (const t of timeStudy.tasks) expect(t.laborMinutes, t.task).toBe(t.staff * t.elapsedMin);
    expect(minutes('fixed')).toBe(assumptions.laborSplit.fixedMinutesPerBatch.value); // 180
    expect(minutes('variable')).toBe(750);
    // The variable rate is the study's own minutes over the study's own basis —
    // dividing by the larger derived batch understated it by 9.1%.
    expect(minutes('variable') / timeStudy.estimatedAtBatchSize).toBeCloseTo(
      assumptions.laborSplit.variableMinutesPerPortion.value,
      6,
    );
  });
  it('matches the day labor (2 batches, 1150 portions)', () => {
    const l = laborForDay(2, 1150);
    expect(l.fixedLaborHours).toBeCloseTo(6, 3); // 180 fixed minutes a batch: closedown is a day task, not a batch task
    expect(l.variableLaborHours).toBeCloseTo(28.75, 3);
    expect(l.totalLaborHours).toBeCloseTo(34.75, 3);
    expect(l.directLaborCost).toBeCloseTo(1017.48, 1);
    expect(l.laborCostPerPortion).toBeCloseTo(0.8848, 3);
  });
  it('fixed share of a full 275 batch on the Phase 1 line is ~30%', () => {
    expect(fixedLaborShareOfFullBatch(275)).toBeCloseTo(0.304, 2);
  });
});

describe('muse — purchase order (driven by portions produced)', () => {
  it('matches the PO total for 1150 portions', () => {
    const po = buildPurchaseOrder(1150);
    expect(po.total).toBeCloseTo(2463.75, 2);
    const beef = po.lines.find((l) => l.name.startsWith('Ground beef'))!;
    expect(beef.requiredForProduction).toBeCloseTo(107.8125, 3);
    expect(beef.casesToOrder).toBe(5);
    expect(beef.extendedCost).toBeCloseTo(937.5, 2);
  });
});

describe('muse — validation warnings are computed, never silently resolved', () => {
  it('flags the time-study re-basing; the yield and rate identities hold; no second labor basis exists', () => {
    const ids = validationWarnings().map((w) => w.id);
    expect(ids).toContain('time-study-rebasing');
    expect(ids).not.toContain('labor-basis-conflict');
    expect(ids).not.toContain('yield-integrity');
    expect(ids).not.toContain('labor-rate-basis');
    expect(ids).not.toContain('portion-weight'); // resolved: it was the as-purchased column
  });
  it('fires yield-integrity when a stored cooked yield drifts from its inputs', () => {
    const drifted = structuredClone(recipe) as unknown as typeof recipe;
    (drifted.ingredients[1] as { cookedYieldPerBatch: number }).cookedYieldPerBatch += 1;
    expect(validationWarnings(drifted).map((w) => w.id)).toContain('yield-integrity');
  });
});

describe('muse — assumptions sanity', () => {
  it('blended loaded wage is the loaded average of the two roles', () => {
    const base = (assumptions.labor.cookWage.value + assumptions.labor.leadWage.value) / 2;
    expect(base * (1 + assumptions.labor.payrollBurden.value)).toBeCloseTo(
      assumptions.labor.blendedLoadedWage.value,
      2,
    );
  });
});

describe('a batch binds to one unit of each vessel (Robert, 2026-09-17)', () => {
  const vessels = batchVesselsFrom(equipmentSeed);
  const chiller = vessels.find((v) => /blast chiller/i.test(v.item))!;

  it('the Phase 1 list carries two cabinets, and the batch is still one cabinet’s load', () => {
    expect(chiller.units).toBe(2);
    const cap = deriveCapacity(recipe, { ...capacityInputs, batchVessels: vessels });
    expect(cap.lbPerCycle).toBe(200);
    expect(cap.batchSize).toBe(275);
    expect(cap.maxPortionsPerDay).toBe(1375); // one stream; the second cabinet is placed on Production Planning
  });

  it('the count of units never moves the batch, the bounds or the one-stream ceiling', () => {
    const base = deriveCapacity(recipe, { ...capacityInputs, batchVessels: vessels });
    for (const units of [1, 2, 4]) {
      const cap = deriveCapacity(recipe, { ...capacityInputs, batchVessels: vessels.map((v) => ({ ...v, units })) });
      expect(cap.batchSize).toBe(base.batchSize);
      expect(cap.lbPerCycle).toBe(base.lbPerCycle);
      expect(cap.maxPortionsPerDay).toBe(base.maxPortionsPerDay);
      expect(cap.bounds.map((b) => b.portions)).toEqual(base.bounds.map((b) => b.portions));
    }
    for (const r of [...menuRecipes, ...adultRecipes]) {
      const one = deriveCapacity(r, { ...capacityInputs, batchVessels: vessels.map((v) => ({ ...v, units: 1 })) });
      const three = deriveCapacity(r, { ...capacityInputs, batchVessels: vessels.map((v) => ({ ...v, units: 3 })) });
      expect(three.batchSize, r.code).toBe(one.batchSize);
    }
  });

  it('a process picks the largest single unit, not the most units', () => {
    const list = [
      { key: 'k100', item: 'Steam-jacketed tilting kettle, 100 gal', capacityLb: 600, units: 1, basis: 'estimated' as const },
      { key: 'k60', item: 'Steam-jacketed tilting kettle, 60 gal', capacityLb: 360, units: 3, basis: 'estimated' as const },
    ];
    expect(vesselForProcess('kettle', list)?.key).toBe('k100');
  });

  it('a forecast that still carries the retired blastChillerUnits key is read without it', () => {
    expect(capWith({ blastChillerUnits: 2 })).toEqual(capWith({}));
    expect('blastChillerUnits' in capWith({ blastChillerUnits: 2 })).toBe(false);
  });
});
