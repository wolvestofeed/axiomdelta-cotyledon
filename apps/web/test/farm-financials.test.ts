import { describe, it, expect } from 'vitest';
import {
  pmt,
  capexRollup,
  fixedCosts,
  phaseEconomics,
} from '@/app/(farm)/farm/_engine/financials';
import { costPerUnit, deriveCapacity, laborForDay } from '@/app/(farm)/farm/_engine';
import { assumptions as planAssumptions } from '@/app/(farm)/farm/_data/plan-data';
import { resolveScenarioInputs } from '@/app/(farm)/farm/_engine/scenario';

// The equal-distribution share at the defaults: the reference crop plan AMK-E-001
// loads at 07:55 (growing from 07:00; its brown rice, 55 min, is its longest sow
// on file), 4 cycles to the 19:00 close on the Phase 1 line — one 200 lb blast
// blackout rack, a 275 sowing = 1,100 a day × 261 production days (2026 weekdays,
// no closure entered) = 287,100 base units of capacity against 461,406
// base-unit equivalents of demand. Phase 1 operations:
// all planned volume is prospects — 1,000 a day over 180 days = 180,000 units —
// which fits, so every channel is produced in full.
const ANNUAL_CAPACITY = 1_100 * 261;
const DEMAND_BASE = 180_000;

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
  it('unit factor shrinks sowing size and daily ceiling', () => {
    const e = phaseEconomics();
    expect(e[0].sowingSize).toBe(275);
    expect(e[0].maxUnitsPerDay).toBe(1375); // 5 cycles: the 07:55–19:00 window ÷ 125-min occupancy
    expect(e[1].sowingSize).toBe(175); // 200 lb / (0.6841 × 1.5) → 194.9 → floor 25
    expect(e[1].maxUnitsPerDay).toBe(875);
  });
  it('the cost of a unit is food + labor + packaging: no distribution and no fixed cost (operating-model §3.5)', () => {
    const e = phaseEconomics()[0];
    // Costed as every page costs it: the resolved reference crop plan at its OWN
    // assumptions — its labor standard and packaging (Roadmap N3). A bare
    // `costPerUnit()` reads the typed fallback and is not what any page shows.
    const R = resolveScenarioInputs();
    const base = costPerUnit(R.cropPlan, R.assumptions, R.capacityInputs);
    expect(Object.keys(base).sort()).toEqual(['directLabor', 'food', 'packaging', 'total']);
    expect(base.total).toBeCloseTo(base.food + base.directLabor + base.packaging, 6);
    // Direct labor is the crop plan's time study at one full derived sowing; the flat units-per-labor-hour rate is deleted.
    const sowing = deriveCapacity(R.cropPlan, R.capacityInputs).sowingSize;
    expect(base.directLabor).toBeCloseTo(laborForDay(1, sowing, R.assumptions).laborCostPerUnit, 10);
    expect('designTargetUnitsPerLaborHour' in planAssumptions.labor).toBe(false);
    expect(e.costPerUnit).toBeCloseTo(e.inputCostPerUnit + base.directLabor + base.packaging, 6);
    expect(e.variablePerUnit).toBeCloseTo(e.costPerUnit + e.distributionPerUnit, 6);
    expect(e.contribution).toBeCloseTo(e.pricePerUnit - e.costPerUnit - e.distributionPerUnit - e.channelCost, 6);
  });
});

describe('farm financials — amortising payments (PMT)', () => {
  it('equipment lease and leasehold amortisation match the model', () => {
    expect(pmt(1_195_833, 0.09, 60)).toBeCloseTo(24_823.53, 1);
    expect(pmt(787_000, 0.08, 84)).toBeCloseTo(12_266.35, 1);
  });
});

describe('farm financials — capex rollup', () => {
  it('subtotals match the equipment + leasehold schedule', () => {
    const r = capexRollup();
    expect(r.equipmentAll).toBe(1_195_833);
    // Split into build-out phases in the equipment library seed (Roadmap N1);
    // both blackout racks on Phase 1 since 2026-09-17 (the second rack's $36,000).
    expect(r.equipmentPhase1).toBe(626_258);
    expect(r.equipmentPhase2Add).toBe(491_775);
    expect(r.equipmentPhase3Add).toBe(77_800);
    expect(r.leaseholdSubtotal).toBe(787_000);
    expect(r.totalCapex).toBe(1_982_833);
    expect(r.phase1Capex).toBe(1_413_258);
  });
  it('monthly financing totals ~$37,090', () => {
    expect(Math.abs(capexRollup().totalMonthlyFinancing - 37_089.88)).toBeLessThan(2);
  });
  it('fixed cost monthly ties out to ~$59,590', () => {
    expect(Math.abs(fixedCosts().monthly - 59_589.88)).toBeLessThan(2);
  });
});

