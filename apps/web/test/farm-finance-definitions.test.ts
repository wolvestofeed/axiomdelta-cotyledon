import { describe, it, expect } from 'vitest';
import { resolveScenarioInputs } from '@/app/(farm)/farm/_engine/scenario';
import {
  capexRollup,
  fixedCosts,
  fixedExpenseForMonth,
  loanMonthlyPayment,
  manufacturingOverheadBudget,
  monthlyFixedTotal,
  lineInForceOn,
  pmt,
} from '@/app/(farm)/farm/_engine/fixed-costs';
import { codeSeedLoans, seedFixedCostLines, type FixedCostLineDef, type LoanDef } from '@/app/(farm)/farm/_data/finance';
import { leaseholdSeed, perSqFtOf, type LeaseholdLine } from '@/app/(farm)/farm/_data/capex';

const R = (config = {}, loans?: LoanDef[], lines?: FixedCostLineDef[]) =>
  resolveScenarioInputs(config, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, loans, lines);

describe('loans and fixed costs are definitions (Roadmap N1)', () => {
  it('financing is what the loans say, not what the capex schedule implies', () => {
    const loans = codeSeedLoans();
    const roll = capexRollup(R({}, loans));
    const expected = loans.reduce((s, l) => s + pmt(l.principalCents / 100, l.apr, l.termMonths), 0);
    expect(roll.totalMonthlyFinancing).toBeCloseTo(expected, 6);
    expect(roll.borrowed).toBeCloseTo(loans.reduce((s, l) => s + l.principalCents / 100, 0), 6);
  });

  it('a principal typed below the capex it finances leaves the gap visible, not closed', () => {
    const loans = codeSeedLoans();
    const half = loans.map((l) => ({ ...l, principalCents: Math.round(l.principalCents / 2) }));
    const roll = capexRollup(R({}, half));
    // The schedule is unchanged; only the borrowing moved.
    expect(roll.totalCapex).toBeCloseTo(capexRollup(R({}, loans)).totalCapex, 6);
    expect(roll.borrowed).toBeLessThan(roll.totalCapex);
    expect(roll.totalMonthlyFinancing).toBeCloseTo(capexRollup(R({}, loans)).totalMonthlyFinancing / 2, 4);
  });

  it('a loan with no term carries no payment rather than dividing by zero', () => {
    expect(loanMonthlyPayment({ ...codeSeedLoans()[0], termMonths: 0 })).toBe(0);
  });

  it('the fixed-cost total is the sum of the lines', () => {
    const lines = seedFixedCostLines();
    const fc = fixedCosts(R({}, undefined, lines));
    expect(fc.lease).toBe(12_000);
    expect(fc.utilities).toBe(4_500);
    expect(fc.admin).toBe(6_000);
    expect(fc.monthly - fc.financing).toBeCloseTo(22_500, 6);
  });

  it('the absorption base is what a line STATES its treatment is, never its label', () => {
    const lines = seedFixedCostLines().map((l) =>
      // The lease re-stated as G&A: the label is unchanged, the treatment is not.
      l.key === 'lease' ? { ...l, treatment: 'general_admin' as const } : l,
    );
    const budget = manufacturingOverheadBudget(R({}, undefined, lines));
    const base = manufacturingOverheadBudget(R({}, undefined, seedFixedCostLines()));
    expect(base.annual - budget.annual).toBeCloseTo(12_000 * 12, 6);
    expect(budget.excluded.admin).toBeCloseTo((6_000 + 12_000) * 12, 6);
  });

  it('a line is out of force before its start date and after its end date', () => {
    const l: FixedCostLineDef = { ...seedFixedCostLines()[0], startDate: '2027-03-01', endDate: '2027-09-30' };
    expect(lineInForceOn(l, '2027-01-31')).toBe(false);
    expect(lineInForceOn(l, '2027-03-31')).toBe(true);
    expect(lineInForceOn(l, '2027-12-31')).toBe(false);
    expect(monthlyFixedTotal([l])).toBe(12_000);
  });

  it('a month before a line starts carries none of it', () => {
    const lines = seedFixedCostLines().map((l) => ({ ...l, startDate: '2027-06-01' }));
    const before = fixedExpenseForMonth('2027-01', R({}, undefined, lines));
    const after = fixedExpenseForMonth('2027-06', R({}, undefined, lines));
    expect(before.lease).toBe(0);
    expect(before.generalAndAdministrative).toBe(0);
    expect(after.lease).toBe(12_000);
    // Depreciation and interest do not depend on the lines.
    expect(before.depreciation).toBeCloseTo(after.depreciation, 6);
  });

  it('a scenario edits one loan by its stable key, leaving the others alone', () => {
    const edited = R({ capex: { loans: { 'equipment-loan': { apr: 0.12 } } } });
    const base = R();
    const eq = edited.loans.find((l) => l.key === 'equipment-loan')!;
    expect(eq.apr).toBe(0.12);
    expect(edited.loans.find((l) => l.key === 'leasehold-loan')!.apr).toBe(base.loans.find((l) => l.key === 'leasehold-loan')!.apr);
  });

  it('a forecast saved before the loan rows existed still reads as its author saw it', () => {
    // Legacy keys: terms typed under capex.financeParams, dollars under monthlyFixedCosts.
    const legacy = R({ capex: { financeParams: { equipmentApr: 0.11, equipmentTermMonths: 72 }, monthlyFixedCosts: { lease: 15_000 } } });
    const eq = legacy.loans.find((l) => l.purpose === 'equipment')!;
    expect(eq.apr).toBe(0.11);
    expect(eq.termMonths).toBe(72);
    expect(legacy.fixedCostLines.find((l) => l.category === 'lease')!.monthlyAmountCents).toBe(15_000_00);
  });
});

describe('the leasehold schedule is a definition with an on-record toggle (Roadmap N1)', () => {
  const RL = (config = {}, leasehold?: LeaseholdLine[]) =>
    resolveScenarioInputs(config, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, leasehold);

  it('the seed is the schedule that was in code: twelve lines, $787,000', () => {
    const roll = capexRollup(RL());
    expect(leaseholdSeed).toHaveLength(12);
    expect(roll.leaseholdSubtotal).toBe(787_000);
    expect(roll.leaseholdOnRecordOnly).toBe(0);
  });

  it('dollars per square foot derive from the extended cost, so the two cannot disagree', () => {
    expect(perSqFtOf(787_000, 5_000)).toBeCloseTo(157.4, 9);
    expect(perSqFtOf(62_000, 5_000)).toBeCloseTo(12.4, 9);
    expect(perSqFtOf(1_000, 0)).toBe(0); // no facility size, no rate — not a division by zero
  });

  it('an uncounted line keeps its figure and leaves the rollup', () => {
    const off = leaseholdSeed.map((l) => (l.key === 'exhaust-hood-system-and-fire-suppression' ? { ...l, counted: false } : l));
    const roll = capexRollup(RL({}, off));
    expect(roll.leaseholdSubtotal).toBe(787_000 - 92_000);
    expect(roll.leaseholdOnRecordOnly).toBe(92_000);
    // The line is still on record, with its figure intact.
    expect(RL({}, off).leasehold.find((l) => l.key === 'exhaust-hood-system-and-fire-suppression')).toMatchObject({ extended: 92_000, counted: false });
  });

  it('total capital drops by exactly what was switched off', () => {
    const base = capexRollup(RL());
    const off = capexRollup(RL({}, leaseholdSeed.map((l) => ({ ...l, counted: l.key !== 'sprinkler-modification' }))));
    expect(base.totalCapex - off.totalCapex).toBe(22_000);
  });

  it('a scenario switches a line off without touching the library', () => {
    const r = RL({ capex: { leasehold: { 'floor-and-trench-drains': { counted: false } } } });
    expect(r.leasehold.find((l) => l.key === 'floor-and-trench-drains')!.counted).toBe(false);
    expect(leaseholdSeed.find((l) => l.key === 'floor-and-trench-drains')!.counted).toBe(true);
    expect(capexRollup(r).leaseholdSubtotal).toBe(787_000 - 46_000);
  });
});
