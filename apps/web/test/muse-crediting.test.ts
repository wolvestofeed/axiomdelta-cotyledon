import { describe, it, expect } from 'vitest';
import { costPerMeal as costPerMealOf } from '../src/app/(muse)/muse/_engine';
import { recipe, phases, assumptions, componentSpecs } from '../src/app/(muse)/muse/_data/plan-data';
import { manufacturingOverheadBudget, fixedCosts } from '../src/app/(muse)/muse/_engine/fixed-costs';
import {
  lunchPattern,
  roundDownToQuarterOzEq,
  roundDownToEighthCup,
  EXHIBIT_A_GRAMS_PER_OZ_EQ,
} from '../src/app/(muse)/muse/_data/meal-pattern';
import {
  creditRecipe,
  creditByComponent,
  highestGradeGroupMet,
  minimumPortionFactor,
  creditableLines,
} from '../src/app/(muse)/muse/_engine/crediting';
import {
  costRecipe,
  componentCosting,
  normalCapacity,
  absorbOverhead,
  platedPortionOz,
  reconcileToSpec,
} from '../src/app/(muse)/muse/_engine';

const lines = creditableLines(recipe) as never;

describe('NSLP meal pattern constants', () => {
  it('carries the 9-12 lunch daily minimums', () => {
    const p = lunchPattern('9-12');
    expect(p.mma.dailyMin).toBe(2);
    expect(p.grains.dailyMin).toBe(2);
    expect(p.vegetables.dailyMin).toBe(1);
  });

  it('vegetable subgroup weekly minimums sum to the weekly total', () => {
    for (const g of ['K-5', '6-8', '9-12'] as const) {
      const p = lunchPattern(g);
      const sum = Object.values(p.vegSubgroupWeeklyMin).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(p.vegetables.weeklyMin, 6);
    }
  });

  it('rounds credit DOWN, never to nearest', () => {
    expect(roundDownToQuarterOzEq(1.49)).toBe(1.25);
    expect(roundDownToQuarterOzEq(1.27)).toBe(1.25);
    expect(roundDownToQuarterOzEq(1.24)).toBe(1.0);
    expect(roundDownToEighthCup(0.474)).toBe(0.375);
  });

  it('tortillas are Exhibit A Group B at 28 g per oz eq', () => {
    expect(EXHIBIT_A_GRAMS_PER_OZ_EQ.B).toBe(28);
  });
});

describe('AMK-E-001 crediting', () => {
  it('credits against the grades 9-12 lunch pattern on M/MA and grains', () => {
    const c = creditRecipe(lines, '9-12');
    expect(c.mmaOzEq).toBe(2.75);
    expect(c.grainsOzEq).toBe(2.0);
    expect(c.meetsDailyMma).toBe(true);
    expect(c.meetsDailyGrains).toBe(true);
  });

  it('is authored to 9-12 — the highest group it satisfies', () => {
    expect(highestGradeGroupMet(lines).gradeGroup).toBe('9-12');
  });

  it('lands ON the grain minimum, not above it', () => {
    // 2.00 oz eq against a 2 oz eq minimum. This is why the portion cannot be cut.
    const c = creditRecipe(lines, '9-12');
    expect(c.grainsOzEq).toBe(c.pattern.grains.dailyMin);
  });

  it('a 9.5 oz plated bowl fails the 9-12 grain minimum', () => {
    const plated = platedPortionOz(recipe).totalOz;
    const f = 9.5 / plated;
    const scaled = creditableLines(recipe).map((l) => ({
      ...l,
      cookedYieldPerBatch: l.cookedYieldPerBatch * f,
    })) as never;
    const c = creditRecipe(scaled, '9-12');
    expect(c.meetsDailyGrains).toBe(false);
    expect(c.grainsOzEq).toBeLessThan(2);
  });

  it('has barely any portion headroom before non-compliance', () => {
    const m = minimumPortionFactor(lines, '9-12');
    expect(m.bindingComponent).toBe('GRAINS');
    expect(m.factor).toBeGreaterThan(0.94);
    expect(m.factor).toBeLessThan(0.95);
  });

  it('credits the salsa as one served component, not as separate lines', () => {
    // Tomato alone is 0.111 cup and onion 0.032 cup — both under the 1/8 cup
    // minimum. Together they are 0.143 cup and the salsa credits.
    const salsa = creditByComponent(lines).find((c) => c.component === 'Salsa roja');
    expect(salsa).toBeDefined();
    expect(salsa!.vegCupsRaw).toBeGreaterThan(0.125);
    expect(salsa!.belowMinimumServing).toBe(false);
  });

  it('does not carry the whole vegetable requirement, and says so', () => {
    const c = creditRecipe(lines, '9-12');
    expect(c.meetsDailyVeg).toBe(false);
    expect(recipe.spec.carriesVegetableRequirement.value).toBe(false);
  });

  it('every ingredient line declares how it credits', () => {
    for (const l of recipe.ingredients) {
      expect(l.crediting, `${l.name} has no crediting spec`).toBeDefined();
    }
  });

  it('no line is silently blocked from crediting', () => {
    expect(creditRecipe(lines, '9-12').blocked).toEqual([]);
  });
});

describe('the weight and cost chain', () => {
  it('separates as-purchased weight from plated weight', () => {
    const c = costRecipe(recipe);
    expect(c.apOzPerPortion).toBeCloseTo(9.45, 2);
    expect(c.platedOzPerPortion).toBeCloseTo(12.326, 2);
  });

  it('the 9.5 oz belief is the as-purchased column', () => {
    // 9.450 oz AP reads as "9.5 oz" and is not the bowl.
    const c = costRecipe(recipe);
    expect(Math.abs(c.apOzPerPortion - 9.5)).toBeLessThan(0.06);
    expect(c.platedOzPerPortion).toBeGreaterThan(12);
  });

  it('conserves dollars while mass changes, giving a different rate per stage', () => {
    const c = costRecipe(recipe);
    // Rice absorbs water: cooked cost per lb falls below as-purchased.
    const rice = c.lines.find((l) => l.name.startsWith('Brown rice'))!;
    expect(rice.cookedCostPerLb!).toBeLessThan(rice.apCostPerLb!);
    // Vegetables lose water: cooked cost per lb rises above as-purchased.
    const veg = c.lines.find((l) => l.name === 'Seasonal vegetables')!;
    expect(veg.cookedCostPerLb!).toBeGreaterThan(veg.apCostPerLb!);
    // Dollars are the same at both stages.
    expect(rice.costPerPortion).toBeCloseTo(rice.extCostPerBatch / 100, 10);
  });

  it('exposes a cost per plated ounce', () => {
    const c = costRecipe(recipe);
    expect(c.costPerPlatedOz).toBeGreaterThan(0);
    expect(c.costPerPlatedOz * c.platedOzPerPortion).toBeCloseTo(c.totalFoodCostPerPortion, 8);
  });

  it('component weights and costs sum to the recipe', () => {
    const c = costRecipe(recipe);
    const k = componentCosting(recipe);
    expect(k.reduce((s, x) => s + x.platedOz, 0)).toBeCloseTo(c.platedOzPerPortion, 6);
    expect(k.reduce((s, x) => s + x.costPerPortion, 0)).toBeCloseTo(c.foodCostPerPortion, 8);
  });

  it('the cooked-to-chilled gap is the cold-packed cheese, not a chill loss', () => {
    const k = componentCosting(recipe);
    const cheese = k.find((x) => x.name === 'Cheddar')!;
    expect(cheese.isHot).toBe(false);
    const hotPlated = k.filter((x) => x.isHot).reduce((s, x) => s + x.platedOz, 0);
    const coldPlated = k.filter((x) => !x.isHot).reduce((s, x) => s + x.platedOz, 0);
    expect(hotPlated + coldPlated).toBeCloseTo(costRecipe(recipe).platedOzPerPortion, 6);
    // No chill-stage loss has been observed, so chilled equals cooked for hot lines.
    for (const l of costRecipe(recipe).lines) {
      if (l.isHotComponent) expect(l.chilledOz).toBeCloseTo(l.cookedOz, 10);
    }
  });

  it('reconciles authored quantities to the spec floor and the vessel', () => {
    const m = minimumPortionFactor(lines, '9-12');
    const r = reconcileToSpec(recipe, m.factor, m.bindingComponent);
    expect(r.specPlatedOz).toBeLessThan(r.authoredPlatedOz);
    expect(r.exceedsVessel).toBe(false);
  });
});

describe('overhead absorption on normal capacity', () => {
  const cap = normalCapacity(phases);
  const budget = manufacturingOverheadBudget();
  const annualFixed = budget.annual;

  it('absorbs manufacturing overhead only — admin and debt service stay in the period', () => {
    const fc = fixedCosts();
    expect(budget.lease).toBeCloseTo(fc.lease * 12, 6);
    expect(budget.utilities).toBeCloseTo(fc.utilities * 12, 6);
    expect(budget.depreciation).toBeGreaterThan(0);
    expect(budget.annual).toBeCloseTo(budget.lease + budget.utilities + budget.depreciation, 6);
    expect(budget.excluded.admin).toBeCloseTo(fc.admin * 12, 6);
    expect(budget.excluded.financing).toBeCloseTo(fc.financing * 12, 6);
    expect(budget.annual).toBeLessThan(fc.annual);
  });

  it('the inventory rate is set on normal capacity and is no part of the cost of a meal', () => {
    const rate = absorbOverhead(annualFixed, cap, cap.mealsPerYear).ratePerMeal;
    expect(rate).toBeCloseTo(annualFixed / cap.mealsPerYear, 6);
    expect(Object.keys(costPerMealOf())).not.toContain('fixedOverhead');
  });

  it('nets planned maintenance out of normal capacity', () => {
    expect(cap.mealsPerYear).toBeLessThan(cap.grossMealsPerYear);
    expect(cap.mealsPerYear).toBeCloseTo(
      cap.grossMealsPerYear * (1 - assumptions.overhead.plannedMaintenanceDownRate.value),
      6,
    );
  });

  it('absorbs fully at normal capacity', () => {
    const a = absorbOverhead(annualFixed, cap, cap.mealsPerYear);
    expect(a.volumeVariance).toBeCloseTo(0, 6);
    expect(a.capacityUtilisation).toBeCloseTo(1, 6);
  });

  it('at Phase 1 volume — the whole plan at Phase 1 operations — the budget absorbs in full; the downtime allowance is a small favourable variance', () => {
    const phase1Meals = phases[0].mealsPerDay * phases[0].operatingDays;
    const a = absorbOverhead(annualFixed, cap, phase1Meals);
    expect(a.capacityUtilisation).toBeCloseTo(1 / (1 - assumptions.overhead.plannedMaintenanceDownRate.value), 6);
    expect(a.volumeVariance).toBeCloseTo(annualFixed * (1 - a.capacityUtilisation), 4);
    expect(a.volumeVariance).toBeLessThan(0);
  });

  it('the rate does not change with volume — only what is absorbed does', () => {
    const a = absorbOverhead(annualFixed, cap, 100_000);
    const b = absorbOverhead(annualFixed, cap, 300_000);
    expect(a.ratePerMeal).toBeCloseTo(b.ratePerMeal, 10);
    expect(b.absorbed).toBeGreaterThan(a.absorbed);
  });
});

describe('component specs', () => {
  it('every ingredient rolls into a declared component', () => {
    const declared = new Set(componentSpecs.map((s) => s.name));
    for (const l of recipe.ingredients) {
      expect(declared.has(l.component), `${l.name} -> ${l.component}`).toBe(true);
    }
  });

  it('cold components skip the cook and chill stages', () => {
    for (const s of componentSpecs) {
      if (s.isHot) expect(s.wipPath).toContain('CHILL');
      else expect(s.wipPath).toEqual(['PACK']);
    }
  });
});
