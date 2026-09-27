import { describe, it, expect } from 'vitest';
import {
  pmt,
  capexRollup,
  fixedCosts,
  phaseEconomics,
} from '@/engine/financials';
import { costPerUnit, costPerUnit as costPerUnitOf, deriveCapacity, laborForDay, normalCapacity, absorbOverhead } from '@/engine';
import { assumptions as planAssumptions, assumptions, phases } from '@/data/plan-data';
import { manufacturingOverheadBudget } from '@/engine/fixed-costs';
import { resolveScenarioInputs } from '@/engine/scenario';

describe('farm financials — per-phase economics', () => {
  it('Phase 1 is the base; Phase 2/3 units are 1.5×', () => {
    const e = phaseEconomics();
    expect(e[0].unitFactor).toBe(1);
    expect(e[1].unitFactor).toBe(1.5);
    expect(e[2].unitFactor).toBe(1.5);
  });
  it('unit factor scales input cost per unit', () => {
    const e = phaseEconomics();
    expect(e[1].inputCostPerUnit).toBeCloseTo(e[0].inputCostPerUnit * 1.5, 6);
  });
  it('the sowing is what one grow unit takes in trays, whatever the channel\'s unit factor', () => {
    const e = phaseEconomics();
    const R = resolveScenarioInputs();
    const cap = deriveCapacity(R.growPlan, R.capacityInputs);
    for (const p of e) {
      expect(p.sowingSize).toBe(cap.grow!.sowingTrays);
      expect(p.maxUnitsPerDay).toBe(cap.grow!.sowingTrays * cap.grow!.unitCount);
    }
  });
  it('the cost of a unit is food + labor + packaging: no distribution and no fixed cost (operating-model §3.5)', () => {
    const e = phaseEconomics()[0];
    // Costed as every page costs it: the resolved reference grow plan at its OWN
    // assumptions — its labor standard and packaging (Roadmap N3). A bare
    // `costPerUnit()` reads the typed fallback and is not what any page shows.
    const R = resolveScenarioInputs();
    const base = costPerUnit(R.growPlan, R.assumptions, R.capacityInputs);
    expect(Object.keys(base).sort()).toEqual(['directLabor', 'food', 'packaging', 'total']);
    expect(base.total).toBeCloseTo(base.food + base.directLabor + base.packaging, 6);
    // Direct labor is the grow plan's time study at one full derived sowing; the flat units-per-labor-hour rate is deleted.
    const sowing = deriveCapacity(R.growPlan, R.capacityInputs).sowingSize;
    expect(base.directLabor).toBeCloseTo(laborForDay(1, sowing, R.assumptions).laborCostPerUnit, 10);
    expect('designTargetUnitsPerLaborHour' in planAssumptions.labor).toBe(false);
    expect(e.costPerUnit).toBeCloseTo(e.inputCostPerUnit + base.directLabor + base.packaging, 6);
    expect(e.variablePerUnit).toBeCloseTo(e.costPerUnit + e.distributionPerUnit, 6);
    expect(e.contribution).toBeCloseTo(e.pricePerUnit - e.costPerUnit - e.distributionPerUnit - e.channelCost, 6);
  });
});

describe('farm financials — amortising payments (PMT)', () => {
  it('the level payment on a principal, a rate and a term', () => {
    expect(pmt(1_195_833, 0.09, 60)).toBeCloseTo(24_823.53, 1);
    expect(pmt(787_000, 0.08, 84)).toBeCloseTo(12_266.35, 1);
  });
});

describe('farm financials — capex rollup', () => {
  it('the seed is the home grow room: Vallecito\'s rack as bought, no build-out', () => {
    const r = capexRollup();
    expect(r.equipmentAll).toBe(1_058);
    expect(r.equipmentPhase1).toBe(1_058);
    expect(r.equipmentPhase2Add).toBe(0);
    expect(r.equipmentPhase3Add).toBe(0);
    expect(r.leaseholdSubtotal).toBe(0);
    expect(r.totalCapex).toBe(1_058);
    expect(r.phase1Capex).toBe(1_058);
  });
  it('no loan and no fixed cost is carried until one is stated', () => {
    expect(capexRollup().totalMonthlyFinancing).toBe(0);
    expect(fixedCosts().monthly).toBe(0);
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
  });

  it('the inventory rate is set on normal capacity and is no part of the cost of a unit', () => {
    const rate = absorbOverhead(annualFixed, cap, cap.unitsPerYear).ratePerUnit;
    expect(rate).toBeCloseTo(annualFixed / cap.unitsPerYear, 6);
    const R = resolveScenarioInputs();
    expect(Object.keys(costPerUnitOf(R.growPlan, R.assumptions, R.capacityInputs))).not.toContain('fixedOverhead');
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
