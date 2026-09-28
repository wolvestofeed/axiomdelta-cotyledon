/**
 * Cotyledon — capital, financing and the fixed-cost base.
 *
 * Ledger-FREE and phase-FREE by design, below `phase.ts`; `proforma.ts`
 * re-exports it so existing importers keep working.
 *
 * Fixed cost is never in the cost of a unit. Fixed cost per unit is a period metric computed on
 * each ledger's statements (`ledger-statements.ts`, Roadmap N6).
 *
 *   manufacturingOverheadBudget — lease + utilities + depreciation of the
 *                                 production fit-out. The GAAP base the ledger
 *                                 absorbs into inventory (ASC 330-10-30-1/-3).
 *                                 Admin is G&A and debt service is financing;
 *                                 ASC 330-10-30-8 keeps both out of inventory.
 */

import { resolveScenarioInputs, type ResolvedInputs } from '@/engine/scenario';
import type { EquipmentCategory } from '@/data/capex';
import type { FixedCostLineDef, LoanDef, LoanPurpose } from '@/data/finance';
import { countsTowardCapital } from '@/engine/equipment';
import { amortizationSchedule, debtServiceBetween } from '@/engine/working-capital';

// ── Capital & financing ─────────────────────────────────────────────────

/** Amortising monthly payment (PMT). */
export function pmt(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

export function extendedCost(
  line: { qty: number; unitCostNew: number; newUsed: 'New' | 'Used' },
  equipmentPurchase: ResolvedInputs['equipmentPurchase'],
): number {
  const factor = line.newUsed === 'Used' ? equipmentPurchase.usedDiscount : 1;
  return line.qty * line.unitCostNew * factor;
}

// ── Loans ───────────────────────────────────────────────────────────────

/** A loan's principal in dollars — the engine works in dollars throughout. */
export const loanPrincipal = (l: LoanDef): number => l.principalCents / 100;

/** The level monthly payment on a loan. Zero when it has no term. */
export function loanMonthlyPayment(l: LoanDef): number {
  return l.termMonths > 0 ? pmt(loanPrincipal(l), l.apr, l.termMonths) : 0;
}

/** Each loan's amortisation schedule, from its own principal, rate, term and start. */
export function loanSchedules(loans: readonly LoanDef[]) {
  return loans.map((l) => amortizationSchedule(loanPrincipal(l), l.apr, l.termMonths, l.startDate));
}

/** What the loans for one purpose add up to, monthly. */
export function monthlyPaymentForPurpose(loans: readonly LoanDef[], purpose: LoanPurpose): number {
  return loans.filter((l) => l.purpose === purpose).reduce((s, l) => s + loanMonthlyPayment(l), 0);
}

// ── Fixed-cost lines ────────────────────────────────────────────────────

/** Whether a line is carrying cost in the month starting `monthStart` (YYYY-MM-01). */
export function lineInForceOn(l: FixedCostLineDef, monthEnd: string): boolean {
  if (l.startDate && l.startDate > monthEnd) return false;
  if (l.endDate && l.endDate < monthEnd.slice(0, 8) + '01') return false;
  return true;
}

/** Monthly total of the lines matching a predicate. */
export function monthlyFixedTotal(
  lines: readonly FixedCostLineDef[],
  match: (l: FixedCostLineDef) => boolean = () => true,
): number {
  return lines.filter(match).reduce((s, l) => s + l.monthlyAmountCents / 100, 0);
}

/** Monthly total for one category label, e.g. 'lease'. */
export const monthlyFixedByCategory = (lines: readonly FixedCostLineDef[], category: string): number =>
  monthlyFixedTotal(lines, (l) => l.category === category);

export interface CapexRollup {
  byCategory: Array<{ category: EquipmentCategory; subtotal: number }>;
  equipmentAll: number;
  equipmentPhase1: number;
  equipmentPhase2Add: number;
  equipmentPhase3Add: number;
  leaseholdSubtotal: number;
  /** Lines kept on record but out of the rollup. */
  leaseholdOnRecordOnly: number;
  totalCapex: number;
  phase1Capex: number;
  monthlyEquipmentPayment: number;
  monthlyLeaseholdPayment: number;
  /** Loans that finance neither schedule. */
  monthlyOtherPayment: number;
  totalMonthlyFinancing: number;
  /** Every loan's principal. Compare with totalCapex: the gap is equity or a deposit. */
  borrowed: number;
}

export function capexRollup(inputs: ResolvedInputs = resolveScenarioInputs()): CapexRollup {
  const fp = inputs.equipmentPurchase;
  // The in-service and planned rows, at the forecast's own status for a line where it sets one.
  const equipment = inputs.datedEquipment.filter((l) => countsTowardCapital(l.status));
  const catOrder: EquipmentCategory[] = [];
  const catTotals = new Map<EquipmentCategory, number>();
  for (const l of equipment) {
    if (!catTotals.has(l.category)) catOrder.push(l.category);
    catTotals.set(l.category, (catTotals.get(l.category) ?? 0) + extendedCost(l, fp));
  }
  const sumPhase = (ph: number) =>
    equipment.filter((l) => l.phase === ph).reduce((s, l) => s + extendedCost(l, fp), 0);

  const equipmentAll = equipment.reduce((s, l) => s + extendedCost(l, fp), 0);
  // On-record-only lines keep their figure and stay out of the arithmetic.
  const leaseholdSubtotal = inputs.leasehold.filter((l) => l.counted).reduce((s, l) => s + l.extended, 0);
  const equipmentPhase1 = sumPhase(1);

  // Financing is what the LOANS say, not what the schedule implies: a loan's
  // principal is typed, so it may differ from the capex it finances (Roadmap N1).
  const monthlyEquipmentPayment = monthlyPaymentForPurpose(inputs.loans, 'equipment');
  const monthlyLeaseholdPayment = monthlyPaymentForPurpose(inputs.loans, 'leasehold');
  const monthlyOtherPayment = monthlyPaymentForPurpose(inputs.loans, 'other');

  return {
    byCategory: catOrder.map((category) => ({ category, subtotal: catTotals.get(category)! })),
    equipmentAll,
    equipmentPhase1,
    equipmentPhase2Add: sumPhase(2),
    equipmentPhase3Add: sumPhase(3),
    leaseholdSubtotal,
    leaseholdOnRecordOnly: inputs.leasehold.filter((l) => !l.counted).reduce((s, l) => s + l.extended, 0),
    totalCapex: equipmentAll + leaseholdSubtotal,
    phase1Capex: equipmentPhase1 + leaseholdSubtotal, // leasehold is all required for phase 1
    monthlyEquipmentPayment,
    monthlyLeaseholdPayment,
    monthlyOtherPayment,
    totalMonthlyFinancing: monthlyEquipmentPayment + monthlyLeaseholdPayment + monthlyOtherPayment,
    borrowed: inputs.loans.reduce((s, l) => s + loanPrincipal(l), 0),
  };
}

// ── Depreciation ────────────────────────────────────────────────────────

export interface DepreciationYears {
  equipment: number;
  leasehold: number;
}

/** Straight-line: equipment over 7 years, leasehold over the 7-year lease. */
export const DEFAULT_DEPRECIATION: DepreciationYears = { equipment: 7, leasehold: 7 };

/** Annual straight-line depreciation on the fit-out, from the capex schedule. */
export function annualDepreciation(
  inputs: ResolvedInputs = resolveScenarioInputs(),
  depreciation: DepreciationYears = DEFAULT_DEPRECIATION,
): number {
  const capex = capexRollup(inputs);
  return (
    (depreciation.equipment > 0 ? capex.equipmentAll / depreciation.equipment : 0) +
    (depreciation.leasehold > 0 ? capex.leaseholdSubtotal / depreciation.leasehold : 0)
  );
}

// ── The fixed-cost base ─────────────────────────────────────────────────

export interface FixedCosts {
  lease: number;
  utilities: number;
  admin: number;
  financing: number;
  monthly: number;
  annual: number;
}

/**
 * The monthly CASH commitments: lease, utilities, admin and the full debt
 * service. A cash view only — debt service includes principal, which is never
 * an expense. The P&L and the fixed-cost-per-unit metric use the expense basis
 * (`fixedExpenseForMonth`).
 */
export function fixedCosts(inputs: ResolvedInputs = resolveScenarioInputs()): FixedCosts {
  const financing = capexRollup(inputs).totalMonthlyFinancing;
  const lines = inputs.fixedCostLines;
  const lease = monthlyFixedByCategory(lines, 'lease');
  const utilities = monthlyFixedByCategory(lines, 'utilities');
  // Everything that is not one of the two named production categories is
  // reported as admin here; the statements split on `treatment`, not on this.
  const admin = monthlyFixedTotal(lines, (l) => l.category !== 'lease' && l.category !== 'utilities');
  const monthly = lease + utilities + admin + financing;
  return {
    lease,
    utilities,
    admin,
    financing,
    monthly,
    annual: monthly * 12,
  };
}

export interface ManufacturingOverheadBudget {
  lease: number;
  utilities: number;
  depreciation: number;
  annual: number;
  /** What the base excludes, and why. */
  excluded: { admin: number; financing: number };
}

/**
 * Budgeted fixed MANUFACTURING overhead — the GAAP absorption base.
 *
 * ASC 330-10-30-1 capitalises the costs of bringing product to its condition
 * and location: the production facility's occupancy, its utilities, and the
 * depreciation of the equipment that makes the product. ASC 330-10-30-8 keeps
 * general and administrative expense out, and debt service is financing, not
 * production — interest is expensed under ASC 835 and principal is not a cost
 * at all. Admin and financing are therefore reported as excluded, not folded in.
 */
export function manufacturingOverheadBudget(
  inputs: ResolvedInputs = resolveScenarioInputs(),
  depreciation: DepreciationYears = DEFAULT_DEPRECIATION,
): ManufacturingOverheadBudget {
  const fc = fixedCosts(inputs);
  // The absorption base is what each line states it is, not what it is called.
  const overhead = monthlyFixedTotal(inputs.fixedCostLines, (l) => l.treatment === 'manufacturing_overhead') * 12;
  const lease = monthlyFixedByCategory(inputs.fixedCostLines, 'lease') * 12;
  const utilities = monthlyFixedByCategory(inputs.fixedCostLines, 'utilities') * 12;
  const dep = annualDepreciation(inputs, depreciation);
  return {
    lease,
    utilities,
    depreciation: dep,
    annual: overhead + dep,
    excluded: {
      admin: monthlyFixedTotal(inputs.fixedCostLines, (l) => l.treatment === 'general_admin') * 12,
      financing: fc.financing * 12,
    },
  };
}

// ── Fixed cost per unit: a period metric on the expense basis ───────────────

/**
 * One period's fixed expense, itemized. Expense basis: the operating lease cost
 * and utilities (ASC 842), straight-line depreciation (ASC 360) — together the
 * manufacturing overhead — admin as general and administrative, and the period's
 * interest from each loan's amortisation schedule (ASC 835). Principal repaid is
 * a financing cash flow (ASC 230), reported beside the total and never in it.
 */
export interface PeriodFixedExpense {
  /** YYYY-MM for a month, YYYY for a year. */
  period: string;
  lease: number;
  utilities: number;
  depreciation: number;
  /** Lease + utilities + depreciation. */
  manufacturingOverhead: number;
  /** Admin, insurance, software, licenses. */
  generalAndAdministrative: number;
  interest: number;
  /** Manufacturing overhead + G&A + interest. */
  total: number;
  /** Financing, not expense. */
  principalRepaid: number;
}

function monthBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return { start: `${period}-01`, end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

/** A month's fixed expense on the expense basis. */
export function fixedExpenseForMonth(
  period: string,
  inputs: ResolvedInputs = resolveScenarioInputs(),
  depreciation: DepreciationYears = DEFAULT_DEPRECIATION,
): PeriodFixedExpense {
  const { start, end } = monthBounds(period);
  // Each loan on its own schedule, from its own start date.
  const service = loanSchedules(inputs.loans)
    .map((sch) => debtServiceBetween(sch, start, end))
    .reduce((a, b) => ({ interest: a.interest + b.interest, principal: a.principal + b.principal }), { interest: 0, principal: 0 });
  const lines = inputs.fixedCostLines.filter((l) => lineInForceOn(l, end));
  const dep = annualDepreciation(inputs, depreciation) / 12;
  // The split is the line's stated treatment, never its label.
  const overheadLines = monthlyFixedTotal(lines, (l) => l.treatment === 'manufacturing_overhead');
  const generalAndAdministrative = monthlyFixedTotal(lines, (l) => l.treatment === 'general_admin');
  const manufacturingOverhead = overheadLines + dep;
  return {
    period,
    lease: monthlyFixedByCategory(lines, 'lease'),
    utilities: monthlyFixedByCategory(lines, 'utilities'),
    depreciation: dep,
    manufacturingOverhead,
    generalAndAdministrative,
    interest: service.interest,
    total: manufacturingOverhead + generalAndAdministrative + service.interest,
    principalRepaid: service.principal,
  };
}
