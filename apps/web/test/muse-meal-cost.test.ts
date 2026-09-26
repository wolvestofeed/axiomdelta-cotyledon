/**
 * Impact OS — the standard cost of a meal, per recipe (Roadmap N3).
 *
 * The finding this closes (audit A2): every recipe was charged one typed labor
 * split — AMK-E-001's plan study scaled linearly — because nothing passed a
 * per-recipe figure, and the Time Studies page already showed each recipe's own
 * study, so two pages disagreed about the same recipe. Packaging had the same
 * shape: picks were costed and ignored.
 */

import { describe, it, expect } from 'vitest';
import { assumptions as typed } from '@/app/(muse)/muse/_data/plan-data';
import { seedLibrary } from '@/app/(muse)/muse/_data/recipes-menu';
import type { TimeStudyDoc } from '@/app/(muse)/muse/_data/time-studies';
import type { PackagingLibrary } from '@/app/(muse)/muse/_data/packaging';
import { seedPackagingLibrary } from '@/app/(muse)/muse/_data/packaging';
import { resolveScenarioInputs, assumptionsFor } from '@/app/(muse)/muse/_engine/scenario';
import { costPerMeal, deriveCapacity, laborForDay } from '@/app/(muse)/muse/_engine';
import { laborStandardFor, laborMinutesPerMeal } from '@/app/(muse)/muse/_engine/meal-cost';
import { estimatedTimeStudy } from '@/app/(muse)/muse/_engine/time-study-estimate';
import { laborMinutesForBatch, summarizeStudy } from '@/app/(muse)/muse/_engine/time-studies';
import { planProductionDay } from '@/app/(muse)/muse/_engine/production-plan';

const R = resolveScenarioInputs({}, seedLibrary);
const rate = R.assumptions.labor.blendedLoadedWage.value;
const e002 = R.recipes.find((r) => r.code === 'AMK-E-002')!;
const e009 = R.recipes.find((r) => r.code === 'AMK-E-009')!;

describe('labor is each recipe\'s own standard', () => {
  it('two recipes on different batches no longer carry the same minutes', () => {
    const a = assumptionsFor(R, e002.code).laborSplit;
    const b = assumptionsFor(R, e009.code).laborSplit;
    expect(a.variableMinutesPerPortion.value).not.toBeCloseTo(b.variableMinutesPerPortion.value, 3);
    // And neither is the typed figure every recipe used to carry.
    expect(a.variableMinutesPerPortion.value).not.toBeCloseTo(typed.laborSplit.variableMinutesPerPortion.value, 3);
  });

  it('with no study library loaded, a recipe carries its code estimate — the one the database is seeded with', () => {
    const batch = deriveCapacity(e002, R.capacityInputs).batchSize;
    const est = summarizeStudy(estimatedTimeStudy(e002, batch));
    const std = R.laborStandards[e002.code]!;
    expect(std.basis).toBe('estimated');
    expect(std.fixedMinutesPerBatch).toBeCloseTo(est.fixedMinutesPerBatch, 10);
    expect(std.variableMinutesPerPortion).toBeCloseTo(est.variableMinutesPerPortion, 10);
  });

  it('a loaded library with no study for the recipe is a gap, never a borrowed figure', () => {
    const std = laborStandardFor(e002, [], 275);
    expect(std.basis).toBe('none');
    expect(laborMinutesPerMeal(std, 275)).toBeNull();
    const withGap = resolveScenarioInputs({}, seedLibrary, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, []);
    expect(withGap.laborStandards[e002.code]!.basis).toBe('none');
    expect(assumptionsFor(withGap, e002.code).laborSplit.fixedMinutesPerBatch.value).toBe(0);
    expect(assumptionsFor(withGap, e002.code).laborSplit.fixedMinutesPerBatch.note).toContain('gap');
  });

  it('an adopted observed study outranks the estimate', () => {
    const observed: TimeStudyDoc = {
      id: 'obs-1',
      recipeCode: e002.code,
      studiedOn: '2026-09-10',
      batchSize: 400,
      observer: 'lead',
      qualityResult: 'pass',
      qualityNotes: null,
      adoptedAt: '2026-09-11T10:00:00.000Z',
      adoptedBy: 'admin',
      source: 'user_built',
      basis: 'observed',
      lines: [
        { task: 'Load', station: null, staff: 2, elapsedMinutes: 30, laborMinutes: 60, scalesWith: 'fixed', stream: 'batch' },
        { task: 'Portion', station: null, staff: 2, elapsedMinutes: 200, laborMinutes: 400, scalesWith: 'variable', stream: 'batch' },
      ],
    };
    const withObs = resolveScenarioInputs({}, seedLibrary, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, [observed]);
    const std = withObs.laborStandards[e002.code]!;
    expect(std.basis).toBe('observed');
    expect(std.fixedMinutesPerBatch).toBe(60);
    expect(std.variableMinutesPerPortion).toBeCloseTo(1, 10);
  });
});

describe('one cost per meal, whichever surface asks (conformance C1, as far as N3 reaches)', () => {
  it('Unit Economics and the Time Studies arithmetic agree about the reference recipe', () => {
    // Unit Economics: costPerMeal on the resolved reference recipe.
    const ue = costPerMeal(R.recipe, R.assumptions, R.capacityInputs).directLabor;
    // Time Studies: the recipe's study at its derived batch, at the loaded rate.
    const batch = deriveCapacity(R.recipe, R.capacityInputs).batchSize;
    const ts = (laborMinutesForBatch(summarizeStudy(estimatedTimeStudy(R.recipe, batch)), batch) / batch / 60) * rate;
    expect(ue).toBeCloseTo(ts, 10);
  });

  it('Recipes costs a non-reference recipe at its own labor, not the reference recipe\'s', () => {
    const own = costPerMeal(e009, assumptionsFor(R, e009.code), R.capacityInputs).directLabor;
    const borrowed = costPerMeal(e009, R.assumptions, R.capacityInputs).directLabor;
    expect(own).not.toBeCloseTo(borrowed, 3);
  });

  it('a production plan charges each run its own recipe\'s labor', () => {
    const plan = planProductionDay({
      productionDate: '2026-09-14',
      requirements: [
        { recipeCode: e002.code, recipeName: e002.name, meals: 400, basePortions: 400, byChannel: [], orders: 1, inLibrary: true },
        { recipeCode: e009.code, recipeName: e009.name, meals: 900, basePortions: 900, byChannel: [], orders: 1, inLibrary: true },
      ],
      onHand: {},
      recipes: R.recipes,
      capacityInputs: R.capacityInputs,
      assumptions: R.assumptions,
      recipeAssumptions: R.recipeAssumptions,
    });
    for (const run of plan.runs) {
      if (run.batchesScheduled === 0) continue;
      const expected = laborForDay(run.batchesScheduled, run.produced, assumptionsFor(R, run.recipeCode));
      expect(run.laborCost).toBeCloseTo(expected.directLaborCost, 8);
    }
  });
});

describe('packaging is the recipe\'s picks at the library cost — no placeholder (Robert, 2026-09-16)', () => {
  it('a recipe with no picks carries zero packaging', () => {
    expect(assumptionsFor(R, e002.code).perMeal.packaging.value).toBe(0);
    expect(costPerMeal(e002, assumptionsFor(R, e002.code), R.capacityInputs).packaging).toBe(0);
  });

  it('a recipe with picks carries their cost, and no other recipe is touched', () => {
    const seed = seedPackagingLibrary();
    const pkg = { ...seed.packages[0]!, id: 'pkg-1', manualUnitCost: 0.31 };
    const lib: PackagingLibrary = { ...seed, packages: [pkg], picks: [{ id: 'pick-1', recipeCode: e002.code, packageId: 'pkg-1', qtyPerMeal: 2 }] };
    const withPicks = resolveScenarioInputs({}, seedLibrary, undefined, undefined, undefined, undefined, lib);
    const own = assumptionsFor(withPicks, e002.code).perMeal.packaging;
    expect(own.value).toBeCloseTo(0.62, 10);
    expect(own.status).toBe('DERIVED');
    expect(assumptionsFor(withPicks, e009.code).perMeal.packaging.value).toBe(0);
  });

  it('picks with no cost entered cost zero — the AMK-E-002 bowl, lid and label as they are today', () => {
    const seed = seedPackagingLibrary();
    const bare = seed.packages.map((p, i) => ({ ...p, id: `pkg-${i}`, manualUnitCost: null, supplierItemId: null }));
    const lib: PackagingLibrary = {
      ...seed,
      packages: bare,
      picks: bare.map((p, i) => ({ id: `pick-${i}`, recipeCode: e002.code, packageId: p.id, qtyPerMeal: 1 })),
    };
    const withPicks = resolveScenarioInputs({}, seedLibrary, undefined, undefined, undefined, undefined, lib);
    expect(withPicks.recipeCosts[e002.code]!.packagingPerMeal).toBe(0);
    expect(costPerMeal(e002, assumptionsFor(withPicks, e002.code), withPicks.capacityInputs).packaging).toBe(0);
  });

  it('a packaging figure typed on an older forecast is ignored', () => {
    const legacy = resolveScenarioInputs({ assumptions: { perMeal: { packaging: 0.48 } } }, seedLibrary);
    expect(assumptionsFor(legacy, e002.code).perMeal.packaging.value).toBe(0);
  });
});
