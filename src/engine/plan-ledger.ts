/**
 * MicroFarm — the Plan ledger (Roadmap N5, operating-model-roadmap §2.2).
 *
 * Server-side only (posts through `@/ledger`). A forecast's timeline
 * (`simulateForecast`) is posted through the SAME posting functions as the
 * Actual ledger — `postActuals` — so actual against plan is the same report
 * run twice. Nothing is stored: a definition or forecast change reposts it.
 *
 * What the Plan ledger supplies that a recorded period does not:
 *
 *   absorption      the forecast's OWN production is its normal capacity
 *                  : the horizon's budgeted manufacturing
 *                   overhead a year over its production a year, net of planned
 *                   downtime (ASC 330-10-30-3)
 *   overhead budget each month, the manufacturing-overhead fixed-cost lines in
 *                   force that month, by the category their bill settles
 *   depreciation    straight-line on each capital purchase from the month it is
 *                   bought, over its class life — Phase 2 equipment depreciates
 *                   from its in-service date, not from day one
 *
 * Statements come out by month, calendar quarter and fiscal year (the calendar
 * year, accounting-policy §15), each clipped to the forecast window: the
 * classified income statement, the classified balance sheet at the period end,
 * and the cash flow by the direct and the indirect method, asserted equal.
 */

import type { Account, JournalEntry } from '@/ledger';
import { postActuals, type PostedPeriod } from '@/engine/actuals-ledger';
import { billCategoryForLine, periodEnd, periodOf, periodStart, type ActualsBundle } from '@/engine/actuals';
import type { OverheadAbsorption } from '@/engine';
import type { ResolvedInputs } from '@/engine/scenario';
import type { ForecastTimeline } from '@/engine/forecast-timeline';
import { DEFAULT_DEPRECIATION, lineInForceOn, loanPrincipal, type DepreciationYears } from '@/engine/fixed-costs';
import { addMonths, amortizationSchedule, currentUnitOfDebt } from '@/engine/working-capital';
import { monthsBetween, statementPeriods, type StatementPeriod } from '@/engine/ledger-statements';

export type PlanStatementPeriod = StatementPeriod;

export interface PlanLedger {
  from: string;
  to: string;
  entries: JournalEntry[];
  coa: Account[];
  /** The posting detail per month: overhead, receivables, payables, payroll, notes. */
  periods: PostedPeriod[];
  absorption: OverheadAbsorption;
  /** Budgeted manufacturing overhead a year over the horizon: lease and utilities lines plus depreciation. */
  annualOverheadBudget: number;
  months: PlanStatementPeriod[];
  quarters: PlanStatementPeriod[];
  years: PlanStatementPeriod[];
  /** Every entry balances, every period's balance sheet balances, every cash flow ties. */
  balanced: boolean;
}

/** Straight-line depreciation a month, dollars, on the capital bought by the end of the period and still inside its life. */
export function depreciationForMonth(
  purchases: ForecastTimeline['documents']['capitalPurchases'],
  period: string,
  years: DepreciationYears = DEFAULT_DEPRECIATION,
): number {
  let dollars = 0;
  for (const c of purchases) {
    const life = c.kind === 'leasehold' ? years.leasehold : years.equipment;
    if (life <= 0) continue;
    const first = periodOf(c.purchasedOn);
    const last = periodOf(addMonths(periodStart(first), life * 12 - 1));
    if (period < first || period > last) continue;
    dollars += c.amountCents / 100 / (life * 12);
  }
  return dollars;
}

/** The timeline's documents as a bundle the posting functions read. */
export function planBundle(timeline: ForecastTimeline): ActualsBundle {
  const d = timeline.documents;
  return {
    sowings: d.sowings,
    receipts: d.receipts,
    distributions: d.distributions,
    bills: d.bills,
    standards: [],
    invoices: d.invoices,
    subscriberPayments: d.subscriberPayments,
    supplierBills: d.supplierBills,
    supplierPayments: d.supplierPayments,
    payrollPeriods: d.payrollPeriods,
    capitalPurchases: d.capitalPurchases,
    loanDraws: d.loanDraws,
    loanPayments: d.loanPayments,
    equityContributions: d.equityContributions,
    processorDeposits: d.processorDeposits,
  };
}

export function postPlanLedger(input: { timeline: ForecastTimeline; inputs: ResolvedInputs; depreciation?: DepreciationYears }): PlanLedger {
  const { timeline, inputs } = input;
  const years = input.depreciation ?? DEFAULT_DEPRECIATION;
  const d = timeline.documents;
  const months = monthsBetween(timeline.from, timeline.to);
  const inWindow = (period: string) => period >= periodOf(timeline.from) && period <= periodOf(timeline.to);

  // ── The overhead budget each month, and depreciation on dated capital.
  const overheadBudgetFor = (period: string) => {
    const out = { lease: 0, utilities: 0 };
    if (!inWindow(period)) return out;
    for (const line of inputs.fixedCostLines) {
      if (line.treatment !== 'manufacturing_overhead' || !lineInForceOn(line, periodEnd(period))) continue;
      const category = billCategoryForLine(line);
      if (category === 'lease' || category === 'utilities') out[category] += line.monthlyAmountCents / 100;
    }
    return out;
  };
  const depreciationFor = (period: string) => (inWindow(period) ? depreciationForMonth(d.capitalPurchases, period, years) : 0);

  // ── Absorption on the forecast's own production.
  const horizonOverhead = months.reduce((s, p) => {
    const b = overheadBudgetFor(p);
    return s + b.lease + b.utilities + depreciationFor(p);
  }, 0);
  const annualOverheadBudget = horizonOverhead / timeline.horizonYears;
  const normalUnits = timeline.normalCapacity.netPerYear;
  const actualUnits = timeline.normalCapacity.perYear;
  const ratePerUnit = normalUnits > 0 ? annualOverheadBudget / normalUnits : 0;
  const absorption: OverheadAbsorption = {
    annualFixedOverhead: annualOverheadBudget,
    normalCapacityUnits: normalUnits,
    ratePerUnit,
    actualUnits,
    absorbed: ratePerUnit * actualUnits,
    volumeVariance: annualOverheadBudget - ratePerUnit * actualUnits,
    capacityUtilisation: normalUnits > 0 ? actualUnits / normalUnits : 0,
  };

  const bundle = planBundle(timeline);
  const posted = postActuals(bundle, inputs, years, {
    absorption,
    overheadBudgetFor,
    depreciationFor,
    periods: months,
    liveLibraryIsStandard: true,
  });

  // ── Statements.
  const drawnLoans = inputs.loans.filter((l) => d.loanDraws.some((x) => x.loanKey === l.key));
  const schedules = drawnLoans.map((l) => amortizationSchedule(loanPrincipal(l), l.apr, l.termMonths, l.startDate));
  const set = statementPeriods({
    entries: posted.entries,
    coa: posted.coa,
    from: timeline.from,
    to: timeline.to,
    posted: posted.periods,
    currentUnitAt: (asOf) => {
      const drawnBy = schedules.filter((_, i) => drawnLoans[i]!.startDate <= asOf);
      return drawnBy.length > 0 ? Math.round(currentUnitOfDebt(drawnBy, asOf) * 100) : 0;
    },
  });
  return {
    from: timeline.from,
    to: timeline.to,
    entries: [...posted.entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    coa: posted.coa,
    periods: posted.periods,
    absorption,
    annualOverheadBudget,
    months: set.months,
    quarters: set.quarters,
    years: set.years,
    balanced: posted.balanced && set.balanced,
  };
}
