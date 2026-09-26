import { describe, it, expect } from 'vitest';
import { menuRecipes, adultRecipes, seedLibrary, MENU_CODES, ADULT_CODES, adultVariant, studentProteinOz, ADULT_UPGRADE_PLACEHOLDER, ADULT_PROTEIN_TARGET_OZ, MEAL_PROTEIN } from '../src/app/(muse)/muse/_data/recipes-menu';
import { seedCustomers, planSeedCustomers, CURRENT_SCHOOL_MEALS_PER_DAY } from '../src/app/(muse)/muse/_data/customers';
import { dbSeedCustomers } from '../src/app/(muse)/muse/_lib/seed-writes';
import { seedMenuCycles, seedMealPlans } from '../src/app/(muse)/muse/_data/menu-cycles';
import { sites } from '../src/app/(muse)/muse/_data/seed-invented';
import { capacityInputs, phaseProfiles } from '../src/app/(muse)/muse/_data/plan-data';
import { deriveCapacity, costRecipe, chilledMassPerPortion, platedPortionOz } from '../src/app/(muse)/muse/_engine';
import { creditRecipe, creditableLines } from '../src/app/(muse)/muse/_engine/crediting';
import { rowsToRecipe, recipeToRows } from '../src/app/(muse)/muse/_engine/recipe-library';
import { resolveCustomerSites, channelDemand } from '../src/app/(muse)/muse/_engine/demand';
import { orderBook, cycleRecipeOn, datesBetween } from '../src/app/(muse)/muse/_engine/orders';
import { requirementsFor, planProductionDay, planHorizon, portionFactorFor } from '../src/app/(muse)/muse/_engine/production-plan';
import { resolveScenarioInputs } from '../src/app/(muse)/muse/_engine/scenario';

const MON = '2026-09-14';
const R = resolveScenarioInputs({}, seedLibrary);
const PF = Object.fromEntries(phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>;

describe('the ten-meal menu as library rows', () => {
  it('is ten student recipes on School lunches and ten adult variants on the other two channels, the code recipe last', () => {
    expect(menuRecipes.map((r) => r.code)).toEqual([...MENU_CODES]);
    expect(adultRecipes.map((r) => r.code)).toEqual([...ADULT_CODES]);
    expect(seedLibrary[0].code).toBe('AMK-E-002');
    expect(seedLibrary[seedLibrary.length - 1].code).toBe('AMK-E-001');
    expect(seedLibrary).toHaveLength(21);
    expect(menuRecipes.every((r) => r.status === 'in_service' && r.channels.join() === '1')).toBe(true);
    expect(adultRecipes.every((r) => r.status === 'in_service' && r.channels.join() === '2,3')).toBe(true);
  });

  it('an adult variant plates the protein target: protein lines scaled to it, vegetables × 1.6, everything else the student line', () => {
    const student = menuRecipes[1]; // smoked chicken & sweet potato hash, a meat meal
    const adult = adultVariant(student);
    expect(adult.code).toBe('AMK-A-003');
    expect(adult.spec.proteinTargetOz?.value).toBe(ADULT_PROTEIN_TARGET_OZ.meat.default);
    expect(adult.spec.proteinTargetOz?.status).toBe('PLACEHOLDER');
    expect(adult.spec.upgradeMultiplier?.status).toBe('DERIVED');
    expect(adult.spec.vegetableMultiplier?.value).toBe(ADULT_UPGRADE_PLACEHOLDER);
    const m = 6 / studentProteinOz(student);
    expect(adult.spec.upgradeMultiplier?.value).toBeCloseTo(m, 9);
    const chicken = adult.ingredients.find((l) => l.name.startsWith('Chicken thighs'))!;
    const beans = adult.ingredients.find((l) => l.name === 'Green beans, fresh')!;
    const paprika = adult.ingredients.find((l) => l.name === 'Smoked paprika')!;
    expect(chicken.cookedYieldPerBatch).toBeCloseTo(18.7 * m, 6);
    expect((chicken.cookedYieldPerBatch / adult.batchPortions) * 16).toBeCloseTo(6, 6);
    expect(beans.apQtyPerBatch).toBeCloseTo(26 * 1.6, 9);
    expect(paprika.apQtyPerBatch).toBe(0.25);
    expect(deriveCapacity(adult, capacityInputs).batchSize).toBe(150);
    // A stated serving from recipe development.
    const eight = adultVariant(student, { proteinTargetOz: 8 });
    expect(eight.spec.proteinTargetOz?.status).toBe('STATED');
    expect(deriveCapacity(eight, capacityInputs).batchSize).toBeLessThanOrEqual(150);
    expect(deriveCapacity(eight, capacityInputs).portionsPerCycleRaw).toBeLessThan(deriveCapacity(adult, capacityInputs).portionsPerCycleRaw);
    // Grains are never upgraded; the beef bowl's protein is the beef-and-bean mix.
    const bowl = adultVariant(menuRecipes[0]);
    expect(bowl.ingredients.find((l) => l.name === 'Brown rice, dry')!.apQtyPerBatch).toBe(10);
    expect(bowl.ingredients.find((l) => l.name === 'Black beans, cooked')!.apQtyPerBatch).toBeGreaterThan(6.5);
    // A plant-based meal defaults to the plant target; a serving already over the target is not reduced.
    const chili = adultVariant(menuRecipes[4]);
    expect(chili.spec.proteinTargetOz?.value).toBe(ADULT_PROTEIN_TARGET_OZ.plant.default);
    const casserole = adultVariant(menuRecipes[8]);
    expect(studentProteinOz(menuRecipes[8])).toBeGreaterThan(4);
    expect(casserole.spec.upgradeMultiplier?.value).toBe(1);
    // Every meal names its protein and every adult plate is at least the student plate.
    for (const r of menuRecipes) {
      expect(MEAL_PROTEIN[r.code]).toBeDefined();
      expect(platedPortionOz(adultVariant(r), 1).totalOz).toBeGreaterThanOrEqual(platedPortionOz(r, 1).totalOz);
    }
  });

  it('an order naming a recipe on its own channel counts at the recipe portion; a foreign recipe takes the channel factor', () => {
    const pf = { 1: 1, 2: 1.5, 3: 1.5 };
    expect(portionFactorFor(adultRecipes[0], 2, pf)).toBe(1);
    expect(portionFactorFor(menuRecipes[0], 2, pf)).toBe(1.5);
    expect(portionFactorFor(undefined, 3, pf)).toBe(1.5);
  });

  it('every line carries its yield as the sheet states it and its cooked yield is AP × yield', () => {
    for (const r of menuRecipes) {
      for (const l of r.ingredients) {
        expect(l.cookedYieldPerBatch).toBeCloseTo(l.apQtyPerBatch * l.yieldToCooked, 9);
        expect(['STATED', 'PLACEHOLDER']).toContain(l.yieldStatus);
      }
      const names = r.ingredients.map((l) => l.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('derives a batch size from one full Phase 1 line — the tightest vessel on the recipe’s mass; the sheet never types one', () => {
    // One 200 lb blast chiller on the chilled portion; the chicken salad is bound by the 40 gal skillet on its chicken.
    const expected: Record<string, number> = {
      'AMK-E-002': 475, 'AMK-E-003': 275, 'AMK-E-004': 275, 'AMK-E-005': 825, 'AMK-E-006': 275,
      'AMK-E-007': 325, 'AMK-E-008': 275, 'AMK-E-009': 950, 'AMK-E-010': 300, 'AMK-E-011': 275,
    };
    // Cycles run from each recipe's first load (its cook times, cooking from 07:00) to the 19:00 close,
    // one 125-minute occupancy (load, chill, unload) apart.
    const cycles: Record<string, number> = {
      'AMK-E-002': 5, 'AMK-E-003': 4, 'AMK-E-004': 5, 'AMK-E-005': 5, 'AMK-E-006': 4,
      'AMK-E-007': 5, 'AMK-E-008': 5, 'AMK-E-009': 5, 'AMK-E-010': 5, 'AMK-E-011': 5,
    };
    for (const r of menuRecipes) {
      const cap = deriveCapacity(r, capacityInputs, 1);
      expect(cap.batchSize).toBe(expected[r.code]);
      const chillerBound = Math.floor(200 / chilledMassPerPortion(r) / 25) * 25;
      expect(cap.batchSize).toBeLessThanOrEqual(chillerBound);
      expect(cap.batchSize).toBe(Math.floor(Math.min(cap.portionsPerCycleRaw, cap.binding!.portions) / 25) * 25);
      if (r.code === 'AMK-E-005') expect(cap.binding!.vessel.item).toContain('skillet');
      else expect(cap.binding!.vessel.item).toContain('Blast chiller');
      expect(cap.cyclesPerDay, r.code).toBe(cycles[r.code]);
    }
  });

  it('the sheet yields reproduce: beef bowl hot mass 41.5 lb per 100, fajitas 59.7, honey-garlic 70.95 with the sesame', () => {
    const hot = (code: string) => chilledMassPerPortion(menuRecipes.find((r) => r.code === code)!) * 100;
    expect(hot('AMK-E-002')).toBeCloseTo(41.5, 6);
    expect(hot('AMK-E-007')).toBeCloseTo(59.7, 6);
    expect(hot('AMK-E-011')).toBeCloseTo(70.95, 6);
  });

  it('costs, credits and round-trips through library rows like the code recipe', () => {
    for (const r of menuRecipes) {
      expect(costRecipe(r).totalFoodCostPerPortion).toBeGreaterThan(0);
      const credit = creditRecipe(creditableLines(r), '9-12');
      expect(Number.isFinite(credit.grainsOzEq)).toBe(true);
      const { header, lines } = recipeToRows(r);
      const back = rowsToRecipe({ ...header, id: 'x', version: 1, effectiveFrom: null, updatedAt: new Date() }, lines);
      expect(deriveCapacity(back, capacityInputs).batchSize).toBe(deriveCapacity(r, capacityInputs).batchSize);
    }
    // Every price on the menu is a placeholder except the two cited lines.
    const cited = menuRecipes.flatMap((r) => r.ingredients).filter((l) => l.status === 'SOURCED').map((l) => l.name);
    expect(new Set(cited)).toEqual(new Set(['Ground beef, regenerative', 'Pinto beans, dry']));
  });
});

describe('the Plan seed: one contracted customer, prospects carrying no volume', () => {
  it('the engine default reproduces the operating model constants and neutral test names', () => {
    const c = seedCustomers();
    expect(c.map((x) => x.name)).toEqual(['Test Customer #1', 'Test Customer #2', 'Test Customer #3']);
    expect(c.every((x) => x.status === 'prospect')).toBe(true);
    expect(c[0].sites.map((s) => s.expectedMealsPerDay)).toEqual([492, 277, 231]);
    expect(sites.map((s) => s.name)).toEqual(['Test Site 1', 'Test Site 2', 'Test Site 3', 'Test Site 4']);
    expect(c[2].sites[0].name).toBe('Test Site 5');
  });

  it('the database seeds the contracted customer at its stated 125 meals a day and every prospect at zero', () => {
    const plan = planSeedCustomers();
    expect(CURRENT_SCHOOL_MEALS_PER_DAY).toBe(125);
    const contracted = plan.filter((c) => c.status === 'contracted');
    expect(contracted).toHaveLength(1);
    expect(contracted[0].channel).toBe(1);
    expect(contracted[0].sites.flatMap((x) => x.services).map((sv) => sv.picks.at(-1)?.meals)).toEqual([125]);
    // The school's term dates are not on file: the site carries no calendar rather than an invented one.
    expect(contracted[0].sites.every((x) => x.calendar.length === 0)).toBe(true);
    expect(contracted[0].notes).toContain('125');
    // The name was never given, and the row says so rather than carrying one.
    expect(contracted[0].name).toContain('not on file');
    expect(contracted[0].pricePerMealCents).toBeNull();
    expect(contracted[0].paymentTerms).toBeNull();
    for (const c of plan.filter((x) => x.status === 'prospect')) {
      expect(c.sites.flatMap((x) => x.services).every((sv) => sv.picks.every((pk) => pk.meals === 0))).toBe(true);
    }
    expect(plan.every((c) => c.source === 'seed')).toBe(true);
    expect(dbSeedCustomers()).toEqual(plan);
  });

  it('demand splits contracted from planned, and the Plan seed is contracted only', () => {
    const d = channelDemand(planSeedCustomers());
    expect(d.byChannel[1].mealsPerDay).toBe(125);
    expect(d.byChannel[1].contractedMealsPerDay).toBe(125);
    expect(d.byChannel[1].contractedCustomers).toBe(1);
    // No term on file: every Monday-to-Friday of the forecast year from 2027-01-01, the pick carried forward.
    const weekdays2027 = datesBetween('2027-01-01', '2027-12-31').filter((x) => { const w = new Date(`${x}T00:00:00Z`).getUTCDay(); return w >= 1 && w <= 5; }).length;
    expect(d.totalAnnualMeals).toBe(125 * weekdays2027);
    expect(d.contractedAnnualMeals).toBe(d.totalAnnualMeals);
    // The engine default is all prospects: every meal in it is planned volume.
    const e = channelDemand(seedCustomers());
    expect(e.contractedAnnualMeals).toBe(0);
    expect(e.byChannel[1].contractedMealsPerDay).toBe(0);
  });

  it('every production day of a two-week horizon fits the chiller', () => {
    const customers = planSeedCustomers();
    const saved = seedMenuCycles(seedLibrary, MON);
    const cycles = [...saved, ...seedMealPlans(customers, saved)];
    // The stated volume takes effect 2026-09-15, so the fortnight runs to the Monday that returns to day 1.
    const to = '2026-09-28';
    const book = orderBook({ sites: resolveCustomerSites(customers), customers, cycles, orders: [], from: MON, to, channelPriceCents: { 1: 1000, 2: 1500, 3: 1600 } });
    expect(new Set(book.map((o) => o.recipeCode)).size).toBe(10); // the student menu only: the adult channels have no planned volume
    for (const d of datesBetween(MON, to)) {
      const reqs = requirementsFor(book.filter((o) => o.orderDate === d), R.recipes, PF);
      const plan = planProductionDay({ productionDate: d, requirements: reqs, onHand: {}, recipes: R.recipes, capacityInputs: R.capacityInputs, assumptions: R.assumptions });
      expect(plan.fits).toBe(true);
      if (reqs.length) {
        expect(reqs).toHaveLength(1); // the student menu only
        expect(plan.runs.every((r) => r.batchesNeeded <= 1)).toBe(true);
        expect(plan.totalRequired).toBeLessThanOrEqual(CURRENT_SCHOOL_MEALS_PER_DAY);
      }
    }
    const h = planHorizon({ from: MON, to, book, recipes: R.recipes, capacityInputs: R.capacityInputs, assumptions: R.assumptions, portionFactorByChannel: PF, openingLots: [], holdLifeDays: 30 });
    expect(h.totals.daysThatDoNotFit).toBe(0);
    expect(h.totals.filledMeals).toBeCloseTo(h.totals.orderedMeals, 6);
  });
});
