/**
 * Cotyledon — capital, financing and the fixed-cost base, re-exported.
 *
 * Ledger-FREE by design so client pages (Capital & Financing, Unit Economics) can
 * import it. The annual pro-forma P&L that lived here was retired in Roadmap N6
 * (slice 2): statements come off the Plan ledger and the Actual ledger. The
 * definitions-based figures below live in `fixed-costs.ts`.
 */

export {
  pmt,
  extendedCost,
  capexRollup,
  fixedCosts,
  annualDepreciation,
  manufacturingOverheadBudget,
  fixedExpenseForMonth,
  DEFAULT_DEPRECIATION,
} from '@/engine/fixed-costs';
export type {
  CapexRollup,
  FixedCosts,
  DepreciationYears,
  ManufacturingOverheadBudget,
  PeriodFixedExpense,
} from '@/engine/fixed-costs';
