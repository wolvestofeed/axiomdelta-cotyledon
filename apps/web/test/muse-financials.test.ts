import { describe, it, expect } from 'vitest';
import {
  pmt,
  capexRollup,
  fixedCosts,
  phaseEconomics,
} from '@/app/(muse)/muse/_engine/financials';
import { costPerMeal, deriveCapacity, laborForDay } from '@/app/(muse)/muse/_engine';
import { assumptions as planAssumptions } from '@/app/(muse)/muse/_data/plan-data';
import { resolveScenarioInputs } from '@/app/(muse)/muse/_engine/scenario';

// The equal-distribution share at the defaults: the reference recipe AMK-E-001
// loads at 07:55 (cooking from 07:00; its brown rice, 55 min, is its longest cook
// on file), 4 cycles to the 19:00 close on the Phase 1 line — one 200 lb blast
// chiller, a 275 batch (Robert, 2026-09-15: a batch is one full line; planned
// build-outs never count) = 1,100 a day × 261 production days (2026 weekdays,
// no closure entered) = 287,100 base portions of capacity against 461,406
// base-portion equivalents of demand. Phase 1 operations (Robert, 2026-09-15):
// all planned volume is schools — 1,000 a day over 180 days = 180,000 meals —
// which fits, so every channel is produced in full.
const ANNUAL_CAPACITY = 1_100 * 261;
const DEMAND_BASE = 180_000;

describe('muse financials — per-phase economics', () => {
  it('Phase 1 is the base; Phase 2/3 portions are 1.5×', () => {
    const e = phaseEconomics();
    expect(e[0].portionFactor).toBe(1);
    expect(e[1].portionFactor).toBe(1.5);
    expect(e[2].portionFactor).toBe(1.5);
  });
  it('portion factor scales food cost per portion', () => {
    const e = phaseEconomics();
    expect(e[1].foodCostPerPortion).toBeCloseTo(e[0].foodCostPerPortion * 1.5, 6);
  });
  it('portion factor shrinks batch size and daily ceiling', () => {
    const e = phaseEconomics();
    expect(e[0].batchSize).toBe(275);
    expect(e[0].maxPortionsPerDay).toBe(1375); // 5 cycles: the 07:55–19:00 window ÷ 125-min occupancy
    expect(e[1].batchSize).toBe(175); // 200 lb / (0.6841 × 1.5) → 194.9 → floor 25
    expect(e[1].maxPortionsPerDay).toBe(875);
  });
  it('the cost of a meal is food + labor + packaging: no delivery and no fixed cost (operating-model §3.5)', () => {
    const e = phaseEconomics()[0];
    // Costed as every page costs it: the resolved reference recipe at its OWN
    // assumptions — its labor standard and packaging (Roadmap N3). A bare
    // `costPerMeal()` reads the typed fallback and is not what any page shows.
    const R = resolveScenarioInputs();
    const base = costPerMeal(R.recipe, R.assumptions, R.capacityInputs);
    expect(Object.keys(base).sort()).toEqual(['directLabor', 'food', 'packaging', 'total']);
    expect(base.total).toBeCloseTo(base.food + base.directLabor + base.packaging, 6);
    // Direct labor is the recipe's time study at one full derived batch; the flat meals-per-labor-hour rate is deleted.
    const batch = deriveCapacity(R.recipe, R.capacityInputs).batchSize;
    expect(base.directLabor).toBeCloseTo(laborForDay(1, batch, R.assumptions).laborCostPerPortion, 10);
    expect('designTargetMealsPerLaborHour' in planAssumptions.labor).toBe(false);
    expect(e.costPerMeal).toBeCloseTo(e.foodCostPerPortion + base.directLabor + base.packaging, 6);
    expect(e.variablePerMeal).toBeCloseTo(e.costPerMeal + e.deliveryPerMeal, 6);
    expect(e.contribution).toBeCloseTo(e.pricePerMeal - e.costPerMeal - e.deliveryPerMeal - e.channelCost, 6);
  });
});

describe('muse financials — amortising payments (PMT)', () => {
  it('equipment lease and leasehold amortisation match the model', () => {
    expect(pmt(1_194_775, 0.09, 60)).toBeCloseTo(24_801.56, 1);
    expect(pmt(787_000, 0.08, 84)).toBeCloseTo(12_266.35, 1);
  });
});

describe('muse financials — capex rollup', () => {
  it('subtotals match the equipment + leasehold schedule', () => {
    const r = capexRollup();
    expect(r.equipmentAll).toBe(1_194_775);
    // Split into build-out phases in the equipment library seed (Roadmap N1);
    // both blast chillers on Phase 1 since 2026-09-17 (the second cabinet's $36,000).
    expect(r.equipmentPhase1).toBe(625_200);
    expect(r.equipmentPhase2Add).toBe(491_775);
    expect(r.equipmentPhase3Add).toBe(77_800);
    expect(r.leaseholdSubtotal).toBe(787_000);
    expect(r.totalCapex).toBe(1_981_775);
    expect(r.phase1Capex).toBe(1_412_200);
  });
  it('monthly financing totals ~$37,068', () => {
    expect(Math.abs(capexRollup().totalMonthlyFinancing - 37_067.91)).toBeLessThan(2);
  });
  it('fixed cost monthly ties out to ~$59,568', () => {
    expect(Math.abs(fixedCosts().monthly - 59_567.91)).toBeLessThan(2);
  });
});

