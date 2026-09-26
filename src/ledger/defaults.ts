import type { Account } from '@/ledger/types';

/**
 * Hospitality-flavored default Chart of Accounts. Seeded for every
 * org when actuals ingestion is enabled.
 *
 * Code convention (mirrors common restaurant CoA layouts and the
 * AxiomDelta 4-digit scheme):
 *   1xxx assets (debit-normal)
 *   2xxx liabilities (credit-normal)
 *   3xxx equity (credit-normal)
 *   4xxx income (credit-normal; 4500s contra-revenue)
 *   5xxx COGS (debit-normal)
 *   6xxx payroll & related (debit-normal)
 *   7xxx operating expenses (debit-normal)
 *   8xxx below-operating (debit-normal)
 *
 * The five accrued-payroll liability accounts and the eleven payroll-
 * related expense buckets are intentionally split fine-grained so the
 * Phase 5d reconciliation view can diff line-for-line against
 * `@ct/financials` forecast lines without re-aggregating.
 *
 * Operators can rename any `name` after seed; codes are stable and
 * referenced by the forecast→actuals mapping layer.
 */
export const DEFAULT_HOSPITALITY_COA: Account[] = [
  // ── 1xxx Assets ────────────────────────────────────────────────────
  { code: '1010', name: 'Cash — Operating', type: 'asset', description: 'Primary business checking account.' },
  { code: '1020', name: 'Cash — Reserve', type: 'asset', description: 'Reserve / savings account.' },
  { code: '1110', name: 'Petty Cash', type: 'asset', description: 'Physical cash on hand for small offline activity.' },
  { code: '1120', name: 'Undeposited Funds', type: 'asset', description: 'Cash and checks received but not yet banked.' },
  { code: '1200', name: 'Card Processor Clearing', type: 'asset', description: 'Funds captured by the card processor, not yet deposited.' },
  { code: '1300', name: 'Accounts Receivable', type: 'asset', description: 'Amounts billed to subscribers and wholesale accounts.' },
  { code: '1410', name: 'Inventory — Food', type: 'asset', description: 'On-hand food inventory at cost.' },
  { code: '1420', name: 'Inventory — Beverage', type: 'asset', description: 'On-hand beverage inventory at cost.' },
  { code: '1500', name: 'Prepaid Expenses', type: 'asset', description: 'Insurance, rent, deposits paid in advance.' },
  { code: '1700', name: 'Fixed Assets', type: 'asset', description: 'Equipment, furniture, leasehold improvements at cost.' },
  { code: '1790', name: 'Accumulated Depreciation', type: 'asset', description: 'Contra-asset — accumulated depreciation against fixed assets.' },

  // ── 2xxx Liabilities ───────────────────────────────────────────────
  { code: '2010', name: 'Accounts Payable', type: 'liability', description: 'Amounts owed to vendors.' },
  { code: '2020', name: 'Sales Tax Payable', type: 'liability', description: 'Sales tax collected, owed to the state.' },
  { code: '2030', name: 'Card Processor Fees Payable', type: 'liability', description: 'Accrued processing fees, cleared on payout.' },
  { code: '2110', name: 'Accrued Wages Payable', type: 'liability', description: 'Wages earned but not yet paid.' },
  { code: '2120', name: 'Accrued Payroll Taxes Payable', type: 'liability', description: 'Employer payroll taxes accrued, not yet remitted.' },
  { code: '2130', name: "Accrued Workers' Comp Payable", type: 'liability', description: "Workers' compensation premium accrued, not yet remitted." },
  { code: '2140', name: 'Accrued Benefits Payable', type: 'liability', description: 'Health, retirement, and other benefits accrued, not yet remitted.' },
  { code: '2150', name: 'Accrued PTO Liability', type: 'liability', description: 'Earned but unused paid time off.' },
  { code: '2200', name: 'Tips Payable', type: 'liability', description: 'Tips collected but not yet distributed to employees.' },
  { code: '2900', name: 'Long-Term Debt', type: 'liability', description: 'Loans, financed equipment, notes payable.' },

  // ── 3xxx Equity ────────────────────────────────────────────────────
  { code: '3100', name: 'Owner Contributions', type: 'equity', description: 'Capital injected from outside the tracked accounts.' },
  { code: '3200', name: 'Owner Draws / Distributions', type: 'equity', description: 'Funds withdrawn by the owner(s).' },
  { code: '3900', name: 'Retained Earnings', type: 'equity', description: 'Cumulative net income from prior periods.' },

  // ── 4xxx Income ────────────────────────────────────────────────────
  { code: '4010', name: 'Food Sales', type: 'income', description: 'Revenue from food.' },
  { code: '4020', name: 'Beverage Sales — Non-Alcoholic', type: 'income', description: 'Revenue from non-alcoholic beverages.' },
  { code: '4030', name: 'Beverage Sales — Alcoholic', type: 'income', description: 'Revenue from beer, wine, and spirits.' },
  { code: '4100', name: 'Service Charge Revenue', type: 'income', description: 'Service charges collected from guests.' },
  { code: '4200', name: 'Events & Wholesale Revenue', type: 'income', description: 'Off-premise events, restaurant and wholesale accounts.' },
  { code: '4500', name: 'Other Income', type: 'income', description: 'Miscellaneous non-operating income.' },
  { code: '4910', name: 'Refunds & Voids', type: 'income', description: 'Contra-revenue — refunded sales and voided tickets.' },
  { code: '4920', name: 'Discounts & Comps', type: 'income', description: 'Contra-revenue — operator-granted price reductions.' },

  // ── 5xxx Cost of Goods Sold ────────────────────────────────────────
  { code: '5010', name: 'Food Cost', type: 'expense', description: 'Cost of food sold.' },
  { code: '5020', name: 'Beverage Cost — Non-Alcoholic', type: 'expense', description: 'Cost of non-alcoholic beverages sold.' },
  { code: '5030', name: 'Beverage Cost — Alcoholic', type: 'expense', description: 'Cost of alcoholic beverages sold.' },

  // ── 6xxx Payroll & related ────────────────────────────────────────
  { code: '6010', name: 'Wages — BOH / Culinary', type: 'expense', description: 'Hourly back-of-house wages.' },
  { code: '6020', name: 'Wages — FOH Tipped', type: 'expense', description: 'Hourly tipped front-of-house wages.' },
  { code: '6030', name: 'Wages — FOH Non-Tipped', type: 'expense', description: 'Hourly non-tipped front-of-house wages.' },
  { code: '6040', name: 'Wages — Salaried', type: 'expense', description: 'Salaried management and staff.' },
  { code: '6050', name: 'Service Charge Distribution', type: 'expense', description: 'Service charge dollars paid out to staff as wages.' },
  { code: '6060', name: 'Overtime Premium', type: 'expense', description: 'Overtime half-time premium (the premium share only).' },
  { code: '6100', name: 'Employer Payroll Taxes', type: 'expense', description: 'Employer FICA, FUTA, SUTA, state PFML.' },
  { code: '6110', name: "Workers' Comp Premium", type: 'expense', description: "Workers' compensation insurance premium." },
  { code: '6200', name: 'Health Insurance', type: 'expense', description: 'Employer health insurance contribution.' },
  { code: '6210', name: 'Retirement Match', type: 'expense', description: 'Employer retirement plan match.' },
  { code: '6220', name: 'Other Benefits', type: 'expense', description: 'PTO accrual, life insurance, EAP, etc.' },
  { code: '6300', name: 'Cost of Hire', type: 'expense', description: 'Recruiting, onboarding, training, productivity ramp loss.' },

  // ── 7xxx Operating expenses ───────────────────────────────────────
  { code: '7010', name: 'Rent / Occupancy', type: 'expense', description: 'Base rent, CAM, real estate taxes passed through.' },
  { code: '7020', name: 'Utilities', type: 'expense', description: 'Electricity, gas, water, trash, telecom.' },
  { code: '7030', name: 'Insurance — GL + Property', type: 'expense', description: 'General liability, property, umbrella.' },
  { code: '7040', name: 'IT / Software / POS', type: 'expense', description: 'Subscription software, POS fees, integrations.' },
  { code: '7050', name: 'Facilities / Repairs & Maintenance', type: 'expense', description: 'Equipment repair, cleaning, pest, R&M services.' },
  { code: '7060', name: 'Marketing & Advertising', type: 'expense', description: 'Ads, social, agencies, print, signage.' },
  { code: '7070', name: 'Supplies', type: 'expense', description: 'Smallwares, paper, cleaning chemicals, uniforms.' },
  { code: '7080', name: 'Professional Fees', type: 'expense', description: 'Accounting, legal, consulting.' },
  { code: '7090', name: 'Bank & Card Processing Fees', type: 'expense', description: 'Card processor fees, bank charges, payout fees.' },
  { code: '7900', name: 'Other / Miscellaneous', type: 'expense', description: 'Catch-all operating expense.' },

  // ── 8xxx Below operating ──────────────────────────────────────────
  { code: '8010', name: 'Depreciation Expense', type: 'expense', description: 'Periodic depreciation of fixed assets.' },
  { code: '8020', name: 'Interest Expense', type: 'expense', description: 'Interest on long-term debt and financed equipment.' },
  { code: '8910', name: 'Income Tax Expense', type: 'expense', description: 'Federal + state income tax (entity-level).' },
];

/** Cash-account codes used by the cash-flow aggregator. */
export const DEFAULT_CASH_CODES: ReadonlySet<string> = new Set([
  '1010',
  '1020',
  '1110',
  '1120',
]);
