import { describe, it, expect } from 'vitest';
import { resolveScenarioInputs } from '@/engine/scenario';
import {
  capexRollup,
  fixedCosts,
  fixedExpenseForMonth,
  loanMonthlyPayment,
  manufacturingOverheadBudget,
  monthlyFixedTotal,
  lineInForceOn,
  pmt,
} from '@/engine/fixed-costs';
import { codeSeedLoans, seedFixedCostLines, type FixedCostLineDef, type LoanDef } from '@/data/finance';
import { leaseholdSeed, perSqFtOf, type LeaseholdLine } from '@/data/capex';

const R = (config = {}, loans?: LoanDef[], lines?: FixedCostLineDef[]) =>
  resolveScenarioInputs(config, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, loans, lines);

// Test fixtures: a commercial forecast's loans and fixed costs, invented for the arithmetic.
const LOANS: LoanDef[] = [
  { key: 'equipment-loan', label: 'Equipment loan', purpose: 'equipment', status: 'planned', principalCents: 100_000_00, apr: 0.09, termMonths: 60, startDate: '2027-01-01', notes: null, source: 'user_built' },
  { key: 'leasehold-loan', label: 'Build-out loan', purpose: 'leasehold', status: 'planned', principalCents: 50_000_00, apr: 0.08, termMonths: 84, startDate: '2027-01-01', notes: null, source: 'user_built' },
];
const fc = (key: string, category: string, treatment: FixedCostLineDef['treatment'], dollars: number): FixedCostLineDef => ({
  key, label: key, category, setting: 'commercial', treatment, status: 'planned', monthlyAmountCents: dollars * 100, startDate: null, endDate: null, notes: null, source: 'user_built',
});
const LINES: FixedCostLineDef[] = [fc('lease', 'lease', 'manufacturing_overhead', 3_000), fc('utilities', 'utilities', 'manufacturing_overhead', 800), fc('admin', 'admin', 'general_admin', 500)];

describe('the seed: a home grow room owes nothing until it is stated', () => {
  it('no loan, no build-out, and every fixed cost at zero, home and commercial', () => {
    expect(codeSeedLoans()).toEqual([]);
    expect(leaseholdSeed).toEqual([]);
    const lines = seedFixedCostLines();
    expect(lines.map((l) => [l.key, l.setting])).toEqual([
      ['home-rent', 'home'], ['home-water', 'home'], ['home-sewer', 'home'], ['home-trash', 'home'], ['home-compost', 'home'], ['home-admin', 'home'],
      ['lease', 'commercial'], ['utilities', 'commercial'], ['admin', 'commercial'],
    ]);
    expect(lines.every((l) => l.monthlyAmountCents === 0)).toBe(true);
    // The grow lights' electricity is on the cost card, not a fixed-cost line.
    expect(lines.some((l) => /electric/i.test(l.label))).toBe(false);
    const roll = capexRollup(R());
    expect(roll.totalMonthlyFinancing).toBe(0);
    expect(roll.leaseholdSubtotal).toBe(0);
    expect(fixedCosts(R()).monthly).toBe(0);
  });
});

describe('loans and fixed costs are definitions (Roadmap N1)', () => {
  it('financing is what the loans say, not what the capex schedule implies', () => {
    const roll = capexRollup(R({}, LOANS));
    const expected = LOANS.reduce((s, l) => s + pmt(l.principalCents / 100, l.apr, l.termMonths), 0);
    expect(roll.totalMonthlyFinancing).toBeCloseTo(expected, 6);
    expect(roll.borrowed).toBeCloseTo(150_000, 6);
  });

  it('a principal typed below the capex it finances leaves the gap visible, not closed', () => {
    const half = LOANS.map((l) => ({ ...l, principalCents: Math.round(l.principalCents / 2) }));
    const roll = capexRollup(R({}, half));
    expect(roll.totalCapex).toBeCloseTo(capexRollup(R({}, LOANS)).totalCapex, 6);
    expect(roll.borrowed).toBe(75_000);
    expect(roll.totalMonthlyFinancing).toBeCloseTo(capexRollup(R({}, LOANS)).totalMonthlyFinancing / 2, 4);
  });

  it('a loan with no term carries no payment rather than dividing by zero', () => {
    expect(loanMonthlyPayment({ ...LOANS[0]!, termMonths: 0 })).toBe(0);
  });

  it('the fixed-cost total is the sum of the lines', () => {
    const f = fixedCosts(R({}, undefined, LINES));
    expect(f.lease).toBe(3_000);
    expect(f.utilities).toBe(800);
    expect(f.admin).toBe(500);
    expect(f.monthly - f.financing).toBeCloseTo(4_300, 6);
  });

  it('the absorption base is what a line STATES its treatment is, never its label', () => {
    const lines = LINES.map((l) => (l.key === 'lease' ? { ...l, treatment: 'general_admin' as const } : l));
    const budget = manufacturingOverheadBudget(R({}, undefined, lines));
    const base = manufacturingOverheadBudget(R({}, undefined, LINES));
    expect(base.annual - budget.annual).toBeCloseTo(3_000 * 12, 6);
    expect(budget.excluded.admin).toBeCloseTo((500 + 3_000) * 12, 6);
  });

  it('a line is out of force before its start date and after its end date', () => {
    const l: FixedCostLineDef = { ...LINES[0]!, startDate: '2027-03-01', endDate: '2027-09-30' };
    expect(lineInForceOn(l, '2027-01-31')).toBe(false);
    expect(lineInForceOn(l, '2027-03-31')).toBe(true);
    expect(lineInForceOn(l, '2027-12-31')).toBe(false);
    expect(monthlyFixedTotal([l])).toBe(3_000);
  });

  it('a month before a line starts carries none of it', () => {
    const lines = LINES.map((l) => ({ ...l, startDate: '2027-06-01' }));
    const before = fixedExpenseForMonth('2027-01', R({}, undefined, lines));
    const after = fixedExpenseForMonth('2027-06', R({}, undefined, lines));
    expect(before.lease).toBe(0);
    expect(before.generalAndAdministrative).toBe(0);
    expect(after.lease).toBe(3_000);
    expect(before.depreciation).toBeCloseTo(after.depreciation, 6);
  });

  it('a scenario edits one loan by its stable key, leaving the others alone', () => {
    const edited = R({ capex: { loans: { 'equipment-loan': { apr: 0.12 } } } }, LOANS);
    expect(edited.loans.find((l) => l.key === 'equipment-loan')!.apr).toBe(0.12);
    expect(edited.loans.find((l) => l.key === 'leasehold-loan')!.apr).toBe(0.08);
  });

  it('a scenario states the commercial rent directly', () => {
    expect(fixedCosts(R({ capex: { fixedCostLines: { lease: { monthlyAmountCents: 4_000_00 } } } })).lease).toBe(4_000);
  });

  it('a home line is the grow room\'s share of the household bill: floor area by default, a stated share over it, all of a G&A bill', () => {
    const r = R({
      capex: {
        financeParams: { homeSqFt: 1_800, growRoomSqFt: 120 },
        fixedCostLines: {
          'home-rent': { householdAmountCents: 2_000_00 },
          'home-water': { householdAmountCents: 90_00, householdQuantity: 3_000, allocationShare: 0.1 },
          'home-admin': { householdAmountCents: 50_00 },
        },
      },
    });
    expect(r.home.share).toBeCloseTo(120 / 1_800, 9);
    const line = (k: string) => r.fixedCostLines.find((l) => l.key === k)!;
    expect(line('home-rent').monthlyAmountCents).toBe(Math.round(2_000_00 * (120 / 1_800)));
    expect(line('home-water').monthlyAmountCents).toBe(9_00);
    expect(line('home-admin').monthlyAmountCents).toBe(50_00);
    // One entry for water: the grow room's gallons are the metered water on Sustainability.
    expect(r.sustainability.water.meteredGalPerMonth).toBeCloseTo(300, 9);
    // With no floor areas a line with no stated share carries nothing yet.
    expect(R({ capex: { fixedCostLines: { 'home-rent': { householdAmountCents: 2_000_00 } } } }).fixedCostLines.find((l) => l.key === 'home-rent')!.monthlyAmountCents).toBe(0);
  });
});

describe('the build-out schedule is a definition with an on-record toggle (Roadmap N1)', () => {
  const RL = (config = {}, leasehold?: LeaseholdLine[]) =>
    resolveScenarioInputs(config, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, leasehold);
  const line = (key: string, extended: number, counted = true): LeaseholdLine => ({ key, item: key, extended, counted });
  const BUILD: LeaseholdLine[] = [line('electrical', 20_000), line('hvac', 15_000), line('permits', 5_000)];

  it('the lines entered are the subtotal', () => {
    const roll = capexRollup(RL({}, BUILD));
    expect(roll.leaseholdSubtotal).toBe(40_000);
    expect(roll.leaseholdOnRecordOnly).toBe(0);
  });

  it('dollars per square foot derive from the extended cost, so the two cannot disagree', () => {
    expect(perSqFtOf(40_000, 2_000)).toBeCloseTo(20, 9);
    expect(perSqFtOf(1_000, 0)).toBe(0); // no facility size, no rate — not a division by zero
  });

  it('an uncounted line keeps its figure and leaves the rollup, and total capital drops by exactly that', () => {
    const off = BUILD.map((l) => (l.key === 'hvac' ? { ...l, counted: false } : l));
    const roll = capexRollup(RL({}, off));
    expect(roll.leaseholdSubtotal).toBe(25_000);
    expect(roll.leaseholdOnRecordOnly).toBe(15_000);
    expect(capexRollup(RL({}, BUILD)).totalCapex - roll.totalCapex).toBe(15_000);
    expect(RL({}, off).leasehold.find((l) => l.key === 'hvac')).toMatchObject({ extended: 15_000, counted: false });
  });

  it('a scenario switches a line off without touching the library', () => {
    const r = RL({ capex: { leasehold: { permits: { counted: false } } } }, BUILD);
    expect(r.leasehold.find((l) => l.key === 'permits')!.counted).toBe(false);
    expect(BUILD.find((l) => l.key === 'permits')!.counted).toBe(true);
    expect(capexRollup(r).leaseholdSubtotal).toBe(35_000);
  });
});
