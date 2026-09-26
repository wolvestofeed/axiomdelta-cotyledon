import { describe, it, expect } from 'vitest';
import { costPerUnit as costPerUnitOf } from '../src/app/(farm)/farm/_engine';
import { cropPlan, phases, assumptions, componentSpecs } from '../src/app/(farm)/farm/_data/plan-data';
import { manufacturingOverheadBudget, fixedCosts } from '../src/app/(farm)/farm/_engine/fixed-costs';
import {
  nutrientProfile,
  roundDownToQuarterOzEq,
  roundDownToEighthCup,
  EXHIBIT_A_GRAMS_PER_OZ_EQ,
} from '../src/app/(farm)/farm/_data/nutrient-profile';
import {
  creditCropPlan,
  creditByComponent,
  highestTrayFormatMet,
  minimumUnitFactor,
  creditableLines,
} from '../src/app/(farm)/farm/_engine/nutrition';
import {
  costCropPlan,
  componentCosting,
  normalCapacity,
  absorbOverhead,
  packedUnitOz,
  reconcileToSpec,
} from '../src/app/(farm)/farm/_engine';

const lines = creditableLines(cropPlan) as never;

describe('NSLP nutrient profile constants', () => {
  it('carries the 9-12 unit daily minimums', () => {
    const p = nutrientProfile('9-12');
    expect(p.mma.dailyMin).toBe(2);
    expect(p.grains.dailyMin).toBe(2);
    expect(p.vegetables.dailyMin).toBe(1);
  });

  it('vegetable subgroup weekly minimums sum to the weekly total', () => {
    for (const g of ['K-5', '6-8', '9-12'] as const) {
      const p = nutrientProfile(g);
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

describe('AMK-E-001 nutrition', () => {
  it('credits against the grades 9-12 unit pattern on M/MA and grains', () => {
    const c = creditCropPlan(lines, '9-12');
    expect(c.mmaOzEq).toBe(2.75);
    expect(c.grainsOzEq).toBe(2.0);
    expect(c.meetsDailyMma).toBe(true);
    expect(c.meetsDailyGrains).toBe(true);
  });

  it('is authored to 9-12 — the highest group it satisfies', () => {
    expect(highestTrayFormatMet(lines).trayFormat).toBe('9-12');
  });

  it('lands ON the grain minimum, not above it', () => {
    // 2.00 oz eq against a 2 oz eq minimum. This is why the unit cannot be cut.
    const c = creditCropPlan(lines, '9-12');
    expect(c.grainsOzEq).toBe(c.pattern.grains.dailyMin);
  });

  it('a 9.5 oz packed bowl fails the 9-12 grain minimum', () => {
    const packed = packedUnitOz(cropPlan).totalOz;
    const f = 9.5 / packed;
    const scaled = creditableLines(cropPlan).map((l) => ({
      ...l,
      harvestedYieldPerSowing: l.harvestedYieldPerSowing * f,
    })) as never;
    const c = creditCropPlan(scaled, '9-12');
    expect(c.meetsDailyGrains).toBe(false);
    expect(c.grainsOzEq).toBeLessThan(2);
  });

  it('has barely any unit headroom before non-compliance', () => {
    const m = minimumUnitFactor(lines, '9-12');
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
    const c = creditCropPlan(lines, '9-12');
    expect(c.meetsDailyVeg).toBe(false);
    expect(cropPlan.spec.carriesVegetableRequirement.value).toBe(false);
  });

  it('every input line declares how it credits', () => {
    for (const l of cropPlan.inputs) {
      expect(l.nutrition, `${l.name} has no nutrition spec`).toBeDefined();
    }
  });

  it('no line is silently blocked from nutrition', () => {
    expect(creditCropPlan(lines, '9-12').blocked).toEqual([]);
  });
});

describe('the weight and cost chain', () => {
  it('separates as-purchased weight from packed weight', () => {
    const c = costCropPlan(cropPlan);
    expect(c.seedOzPerUnit).toBeCloseTo(9.45, 2);
    expect(c.packedOzPerUnit).toBeCloseTo(12.326, 2);
  });

  it('the 9.5 oz belief is the as-purchased column', () => {
    // 9.450 oz SEED reads as "9.5 oz" and is not the bowl.
    const c = costCropPlan(cropPlan);
    expect(Math.abs(c.seedOzPerUnit - 9.5)).toBeLessThan(0.06);
    expect(c.packedOzPerUnit).toBeGreaterThan(12);
  });

  it('conserves dollars while mass changes, giving a different rate per stage', () => {
    const c = costCropPlan(cropPlan);
    // Rice absorbs water: harvested cost per lb falls below as-purchased.
    const rice = c.lines.find((l) => l.name.startsWith('Brown rice'))!;
    expect(rice.harvestedCostPerLb!).toBeLessThan(rice.seedCostPerLb!);
    // Vegetables lose water: harvested cost per lb rises above as-purchased.
    const veg = c.lines.find((l) => l.name === 'Seasonal vegetables')!;
    expect(veg.harvestedCostPerLb!).toBeGreaterThan(veg.seedCostPerLb!);
    // Dollars are the same at both stages.
    expect(rice.costPerUnit).toBeCloseTo(rice.extCostPerSowing / 100, 10);
  });

  it('exposes a cost per packed ounce', () => {
    const c = costCropPlan(cropPlan);
    expect(c.costPerPackedOz).toBeGreaterThan(0);
    expect(c.costPerPackedOz * c.packedOzPerUnit).toBeCloseTo(c.totalInputCostPerUnit, 8);
  });

  it('component weights and costs sum to the crop plan', () => {
    const c = costCropPlan(cropPlan);
    const k = componentCosting(cropPlan);
    expect(k.reduce((s, x) => s + x.packedOz, 0)).toBeCloseTo(c.packedOzPerUnit, 6);
    expect(k.reduce((s, x) => s + x.costPerUnit, 0)).toBeCloseTo(c.inputCostPerUnit, 8);
  });

  it('the harvested-to-blackout gap is the cold-packed cheese, not a blackout loss', () => {
    const k = componentCosting(cropPlan);
    const cheese = k.find((x) => x.name === 'Cheddar')!;
    expect(cheese.isHot).toBe(false);
    const hotPacked = k.filter((x) => x.isHot).reduce((s, x) => s + x.packedOz, 0);
    const coldPacked = k.filter((x) => !x.isHot).reduce((s, x) => s + x.packedOz, 0);
    expect(hotPacked + coldPacked).toBeCloseTo(costCropPlan(cropPlan).packedOzPerUnit, 6);
    // No blackout-stage loss has been observed, so blackout equals harvested for hot lines.
    for (const l of costCropPlan(cropPlan).lines) {
      if (l.isHotComponent) expect(l.blackoutOz).toBeCloseTo(l.harvestedOz, 10);
    }
  });

  it('reconciles authored quantities to the spec floor and the grow unit', () => {
    const m = minimumUnitFactor(lines, '9-12');
    const r = reconcileToSpec(cropPlan, m.factor, m.bindingComponent);
    expect(r.specPackedOz).toBeLessThan(r.authoredPackedOz);
    expect(r.exceedsGrowUnit).toBe(false);
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

  it('the inventory rate is set on normal capacity and is no part of the cost of a unit', () => {
    const rate = absorbOverhead(annualFixed, cap, cap.unitsPerYear).ratePerUnit;
    expect(rate).toBeCloseTo(annualFixed / cap.unitsPerYear, 6);
    expect(Object.keys(costPerUnitOf())).not.toContain('fixedOverhead');
  });

  it('nets planned maintenance out of normal capacity', () => {
    expect(cap.unitsPerYear).toBeLessThan(cap.grossUnitsPerYear);
    expect(cap.unitsPerYear).toBeCloseTo(
      cap.grossUnitsPerYear * (1 - assumptions.overhead.plannedMaintenanceDownRate.value),
      6,
    );
  });

  it('absorbs fully at normal capacity', () => {
    const a = absorbOverhead(annualFixed, cap, cap.unitsPerYear);
    expect(a.volumeVariance).toBeCloseTo(0, 6);
    expect(a.capacityUtilisation).toBeCloseTo(1, 6);
  });

  it('at Phase 1 volume — the whole plan at Phase 1 operations — the budget absorbs in full; the downtime allowance is a small favourable variance', () => {
    const phase1Units = phases[0].unitsPerDay * phases[0].operatingDays;
    const a = absorbOverhead(annualFixed, cap, phase1Units);
    expect(a.capacityUtilisation).toBeCloseTo(1 / (1 - assumptions.overhead.plannedMaintenanceDownRate.value), 6);
    expect(a.volumeVariance).toBeCloseTo(annualFixed * (1 - a.capacityUtilisation), 4);
    expect(a.volumeVariance).toBeLessThan(0);
  });

  it('the rate does not change with volume — only what is absorbed does', () => {
    const a = absorbOverhead(annualFixed, cap, 100_000);
    const b = absorbOverhead(annualFixed, cap, 300_000);
    expect(a.ratePerUnit).toBeCloseTo(b.ratePerUnit, 10);
    expect(b.absorbed).toBeGreaterThan(a.absorbed);
  });
});

describe('component specs', () => {
  it('every input rolls into a declared component', () => {
    const declared = new Set(componentSpecs.map((s) => s.name));
    for (const l of cropPlan.inputs) {
      expect(declared.has(l.component), `${l.name} -> ${l.component}`).toBe(true);
    }
  });

  it('cold components skip the sow and blackout stages', () => {
    for (const s of componentSpecs) {
      if (s.isHot) expect(s.wipPath).toContain('BLACKOUT');
      else expect(s.wipPath).toEqual(['PACK']);
    }
  });
});
