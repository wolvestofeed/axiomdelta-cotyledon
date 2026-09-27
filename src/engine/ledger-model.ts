/**
 * MicroFarm — the statement shapes and classifiers shared by both ledgers.
 *
 * The fiscal-year journal that used to live here — the forecast year posted as one
 * sowing record, with its annual opening, overhead, financing and settlement entries —
 * was retired in Roadmap N6 (slice 2). A forecast is now posted day by day as the
 * Plan ledger (`plan-ledger.ts`) and recorded activity as the Actual ledger
 * (`actuals-ledger.ts`); both classify their journals with the functions below.
 * Server-side only where it reads `@/ledger` at runtime.
 */

import {
  DEFAULT_CASH_CODES,
  type Account,
  type JournalEntry,
  type ProfitAndLoss,
  type BalanceSheet,
} from '@/ledger';
import { DEFAULT_DEPRECIATION, type DepreciationYears } from '@/engine/fixed-costs';
import {
  ACC_RAW_MATERIALS,
  ACC_PACKAGING,
  ACC_WIP_SOW,
  ACC_WIP_GROW,
  ACC_WIP_PACK,
  ACC_FINISHED_GOODS,
  ACC_GRIR,
  ACC_COGS_MATERIALS,
  ACC_COGS_LABOR,
  ACC_COGS_OVERHEAD,
  ACC_OH_SPENDING_VAR,
  ACC_OH_VOLUME_VAR,
  ACC_ABNORMAL_SPOILAGE,
  ACC_MARKETPLACE_COMMISSION,
  ACC_ACCRUED_WAGES,
  ACC_ACCRUED_PAYROLL_TAXES,
  ACC_ACCRUED_WORKERS_COMP,
  ACC_ACCRUED_BENEFITS,
  ACC_ACCRUED_OH,
  ACC_PROCESSOR_CLEARING,
  ACC_OWNER_CONTRIBUTIONS,
  ACC_UNASSIGNED_PRODUCTION_LABOR,
  ACC_AR,
} from '@/data/coa-farm';

export type { DepreciationYears };
export { DEFAULT_DEPRECIATION };

const ACC_SEED = '2010';
const ACC_FIXED_ASSETS = '1700';
const ACC_ACCUM_DEP = '1790';
const ACC_LTD = '2900';
const ACC_OWNER_DRAWS = '3200';
const ACC_ADMIN = '7080';
const ACC_DISTRIBUTION = '7900';
const ACC_INTEREST = '8020';

/** The payroll liability accounts, in the order loaded labor is split. */
export const PAYROLL_LIABILITY_ACCOUNTS = [ACC_ACCRUED_WAGES, ACC_ACCRUED_PAYROLL_TAXES, ACC_ACCRUED_WORKERS_COMP, ACC_ACCRUED_BENEFITS] as const;

/** Net debit movement (debits − credits, cents) of one account over the entries. */
function netDebit(entries: readonly JournalEntry[], code: string): number {
  let n = 0;
  for (const e of entries) for (const l of e.lines) if (l.accountCode === code) n += l.debitCents - l.creditCents;
  return n;
}

// ── Working-capital measures from a journal ─────────────────────────────────

const inRange = (e: JournalEntry, from: string, to: string) => e.date >= from && e.date <= to;

/** What was billed to receivables in [from, to]: every debit to Accounts Receivable. */
export function receivableBillingsCents(entries: readonly JournalEntry[], from: string, to: string): number {
  let n = 0;
  for (const e of entries) if (inRange(e, from, to)) for (const l of e.lines) if (l.accountCode === ACC_AR) n += l.debitCents;
  return n;
}

/**
 * Trade purchases in [from, to]: goods received into GR/IR, plus everything
 * credited to Accounts Payable by an entry that is not clearing GR/IR (a bill
 * moving a receipt to payables is the same purchase, counted once).
 */
export function tradePurchasesCents(entries: readonly JournalEntry[], from: string, to: string): number {
  let n = 0;
  for (const e of entries) {
    if (!inRange(e, from, to)) continue;
    const clearsGrir = e.lines.some((l) => l.accountCode === ACC_GRIR && l.debitCents > 0);
    for (const l of e.lines) {
      if (l.accountCode === ACC_GRIR) n += l.creditCents;
      if (l.accountCode === ACC_SEED && !clearsGrir) n += l.creditCents;
    }
  }
  return n;
}

// ── Classified statements ───────────────────────────────────────────────────

export interface StatementRow {
  code: string;
  label: string;
  cents: number;
}

export interface IncomeStatement {
  revenue: StatementRow[];
  revenueCents: number;
  costOfGoodsSoldCents: number;
  grossMarginAtStandardCents: number;
  /** Overhead spending and volume, and abnormal spoilage. */
  manufacturingVariances: StatementRow[];
  manufacturingVariancesCents: number;
  /** Production costs of the period that no sowing carried: clocked labor not charged to a sowing. */
  periodProductionCosts: StatementRow[];
  grossMarginCents: number;
  sellingAndDistribution: StatementRow[];
  generalAndAdministrative: StatementRow[];
  otherOperating: StatementRow[];
  operatingIncomeCents: number;
  financing: StatementRow[];
  netIncomeCents: number;
}

export interface CashFlowIndirect {
  netIncomeCents: number;
  depreciationCents: number;
  /** Negative = cash tied up (an increase in the asset or decrease in the liability). */
  workingCapital: StatementRow[];
  operatingCents: number;
  investing: StatementRow[];
  investingCents: number;
  financing: StatementRow[];
  financingCents: number;
  netChangeCents: number;
  /** Non-cash: fit-out capitalised and financed by debt in the same entry. */
  nonCashFinancingCents: number;
}

export interface ClassifiedBalanceSheet {
  currentAssets: StatementRow[];
  inventoryCents: number;
  currentAssetsCents: number;
  fixedAssetsAtCostCents: number;
  accumulatedDepreciationCents: number;
  netFixedAssetsCents: number;
  totalAssetsCents: number;
  currentLiabilities: StatementRow[];
  currentLiabilitiesCents: number;
  /** The current unit of long-term debt shown among current liabilities — presentation only. */
  currentUnitOfLongTermDebtCents: number;
  /** Long-term debt less its current unit. */
  longTermDebtCents: number;
  totalLiabilitiesCents: number;
  contributedEquity: StatementRow[];
  retainedEarningsCents: number;
  totalEquityCents: number;
}

/** Cost of goods sold by element: materials, labor, overhead. */
const COGS_CODES: readonly string[] = [ACC_COGS_MATERIALS, ACC_COGS_LABOR, ACC_COGS_OVERHEAD];
const VARIANCE_CODES = [
  ACC_OH_SPENDING_VAR,
  ACC_OH_VOLUME_VAR,
  ACC_ABNORMAL_SPOILAGE,
];
const INVENTORY_CODES = [
  ACC_RAW_MATERIALS,
  ACC_PACKAGING,
  ACC_WIP_SOW,
  ACC_WIP_GROW,
  ACC_WIP_PACK,
  ACC_FINISHED_GOODS,
];

function rowsFor(pnlRows: ProfitAndLoss['income'], codes: readonly string[]): StatementRow[] {
  return codes
    .map((code) => pnlRows.find((r) => r.account.code === code))
    .filter((r): r is NonNullable<typeof r> => r !== undefined && r.balanceCents !== 0)
    .map((r) => ({ code: r.account.code, label: r.account.name, cents: r.balanceCents }));
}

/**
 * A classified income statement from the account balances. Every income and
 * expense account with a balance lands in exactly one section, so the sections
 * sum to the raw net income — asserted by test.
 */
export function classifyIncomeStatement(pnl: ProfitAndLoss): IncomeStatement {
  const revenue = pnl.income
    .filter((r) => r.balanceCents !== 0)
    .map((r) => ({ code: r.account.code, label: r.account.name, cents: r.balanceCents }));
  const cogs = pnl.expense.filter((r) => COGS_CODES.includes(r.account.code)).reduce((t, r) => t + r.balanceCents, 0);
  const variances = rowsFor(pnl.expense, VARIANCE_CODES);
  const periodProduction = rowsFor(pnl.expense, [ACC_UNASSIGNED_PRODUCTION_LABOR]);
  const selling = rowsFor(pnl.expense, [ACC_DISTRIBUTION, ACC_MARKETPLACE_COMMISSION]);
  const admin = rowsFor(pnl.expense, [ACC_ADMIN]);
  const financing = rowsFor(pnl.expense, [ACC_INTEREST]);
  const placed = new Set([...COGS_CODES, ...VARIANCE_CODES, ACC_UNASSIGNED_PRODUCTION_LABOR, ACC_DISTRIBUTION, ACC_MARKETPLACE_COMMISSION, ACC_ADMIN, ACC_INTEREST]);
  const otherOperating = pnl.expense
    .filter((r) => r.balanceCents !== 0 && !placed.has(r.account.code))
    .map((r) => ({ code: r.account.code, label: r.account.name, cents: r.balanceCents }));

  const sum = (rows: StatementRow[]) => rows.reduce((s, r) => s + r.cents, 0);
  const revenueCents = sum(revenue);
  const variancesCents = sum(variances);
  const grossAtStd = revenueCents - cogs;
  const gross = grossAtStd - variancesCents - sum(periodProduction);
  const operating = gross - sum(selling) - sum(admin) - sum(otherOperating);
  return {
    revenue,
    revenueCents,
    costOfGoodsSoldCents: cogs,
    grossMarginAtStandardCents: grossAtStd,
    manufacturingVariances: variances,
    manufacturingVariancesCents: variancesCents,
    periodProductionCosts: periodProduction,
    grossMarginCents: gross,
    sellingAndDistribution: selling,
    generalAndAdministrative: admin,
    otherOperating,
    operatingIncomeCents: operating,
    financing,
    netIncomeCents: operating - sum(financing),
  };
}

/** Indirect-method cash flow from the same entries; ties to the direct method by test. */
export function cashFlowIndirect(
  coa: readonly Account[],
  entries: readonly JournalEntry[],
  pnl: ProfitAndLoss,
): CashFlowIndirect {
  const name = (code: string) => coa.find((x) => x.code === code)?.name ?? code;
  const depreciationCents = -netDebit(entries, ACC_ACCUM_DEP);

  const wcAssets = [ACC_AR, ACC_PROCESSOR_CLEARING, ...INVENTORY_CODES];
  const wcLiabilities = [ACC_SEED, ACC_GRIR, ...PAYROLL_LIABILITY_ACCOUNTS, ACC_ACCRUED_OH];
  const workingCapital: StatementRow[] = [];
  for (const code of wcAssets) {
    const inc = netDebit(entries, code);
    if (inc !== 0) workingCapital.push({ code, label: `Increase in ${name(code)}`, cents: -inc });
  }
  for (const code of wcLiabilities) {
    const inc = -netDebit(entries, code);
    if (inc !== 0) workingCapital.push({ code, label: `Increase in ${name(code)}`, cents: inc });
  }
  const operatingCents =
    pnl.netIncomeCents + depreciationCents + workingCapital.reduce((s, r) => s + r.cents, 0);

  // Capital and debt, classified by whether cash moved in the entry: a fit-out
  // capitalised and financed in one entry is a non-cash disclosure; capital
  // bought for cash is investing; a loan drawn or repaid in cash is financing
  // (Roadmap N5).
  const touchesCash = (e: JournalEntry) => e.lines.some((l) => DEFAULT_CASH_CODES.has(l.accountCode));
  const cashEntries = entries.filter(touchesCash);
  const nonCashEntries = entries.filter((e) => !touchesCash(e));
  const capexCashCents = netDebit(cashEntries, ACC_FIXED_ASSETS);
  const capexNonCashCents = netDebit(nonCashEntries, ACC_FIXED_ASSETS);
  const investing: StatementRow[] = [];
  if (capexCashCents !== 0) investing.push({ code: ACC_FIXED_ASSETS, label: 'Capital expenditure', cents: -capexCashCents });
  const investingCents = investing.reduce((s, r) => s + r.cents, 0);

  const financing: StatementRow[] = [];
  const contributedCents = -netDebit(entries, ACC_OWNER_CONTRIBUTIONS);
  if (contributedCents !== 0) financing.push({ code: ACC_OWNER_CONTRIBUTIONS, label: "Owners' equity contributed", cents: contributedCents });
  const drawsCents = netDebit(entries, ACC_OWNER_DRAWS);
  if (drawsCents !== 0) financing.push({ code: ACC_OWNER_DRAWS, label: 'Owner draws and distributions', cents: -drawsCents });
  let debtDrawnCents = 0;
  let debtRepaidCents = 0;
  for (const e of cashEntries) for (const l of e.lines) if (l.accountCode === ACC_LTD) {
    debtDrawnCents += l.creditCents;
    debtRepaidCents += l.debitCents;
  }
  // Debt repaid on a non-cash entry cannot happen; debt raised on one (the financed fit-out) is disclosed, not a cash flow.
  if (debtDrawnCents !== 0) financing.push({ code: ACC_LTD, label: 'Debt drawn', cents: debtDrawnCents });
  if (debtRepaidCents !== 0) financing.push({ code: ACC_LTD, label: 'Debt principal repaid', cents: -debtRepaidCents });
  const financingCents = financing.reduce((s, r) => s + r.cents, 0);

  return {
    netIncomeCents: pnl.netIncomeCents,
    depreciationCents,
    workingCapital,
    operatingCents,
    investing,
    investingCents,
    financing,
    financingCents,
    netChangeCents: operatingCents + investingCents + financingCents,
    nonCashFinancingCents: capexNonCashCents,
  };
}

/**
 * Current / non-current presentation of the balance sheet rows. The current
 * unit of long-term debt is carried among current liabilities when given
 * (presentation only — no account holds it), capped at the debt on the books.
 */
export function classifyBalanceSheet(bs: BalanceSheet, currentUnitOfDebtCents = 0): ClassifiedBalanceSheet {
  const row = (r: BalanceSheet['assets'][number]): StatementRow => ({
    code: r.account.code,
    label: r.account.name,
    cents: r.balanceCents,
  });
  const currentAssets = bs.assets
    .filter((r) => r.balanceCents !== 0 && r.account.code < ACC_FIXED_ASSETS)
    .map(row);
  const inventoryCents = currentAssets
    .filter((r) => INVENTORY_CODES.includes(r.code))
    .reduce((s, r) => s + r.cents, 0);
  const fixedAssetsAtCostCents = bs.assets.find((r) => r.account.code === ACC_FIXED_ASSETS)?.balanceCents ?? 0;
  const accumulatedDepreciationCents = bs.assets.find((r) => r.account.code === ACC_ACCUM_DEP)?.balanceCents ?? 0;
  const currentAssetsCents = currentAssets.reduce((s, r) => s + r.cents, 0);
  const otherNonCurrent = bs.assets
    .filter((r) => r.balanceCents !== 0 && r.account.code >= ACC_FIXED_ASSETS && r.account.code !== ACC_FIXED_ASSETS && r.account.code !== ACC_ACCUM_DEP)
    .reduce((s, r) => s + r.balanceCents, 0);

  const debtOnBooksCents = bs.liabilities
    .filter((r) => r.account.code >= ACC_LTD)
    .reduce((s, r) => s + r.balanceCents, 0);
  const currentUnit = Math.max(0, Math.min(Math.round(currentUnitOfDebtCents), debtOnBooksCents));
  const currentLiabilities = bs.liabilities
    .filter((r) => r.balanceCents !== 0 && r.account.code < ACC_LTD)
    .map(row);
  if (currentUnit > 0) currentLiabilities.push({ code: `${ACC_LTD}-C`, label: 'Current unit of long-term debt', cents: currentUnit });
  const currentLiabilitiesCents = currentLiabilities.reduce((s, r) => s + r.cents, 0);
  const contributedEquity = bs.equity.filter((r) => r.balanceCents !== 0).map(row);

  return {
    currentAssets,
    inventoryCents,
    currentAssetsCents,
    fixedAssetsAtCostCents,
    accumulatedDepreciationCents,
    netFixedAssetsCents: fixedAssetsAtCostCents + accumulatedDepreciationCents + otherNonCurrent,
    totalAssetsCents: bs.totalAssetsCents,
    currentLiabilities,
    currentLiabilitiesCents,
    currentUnitOfLongTermDebtCents: currentUnit,
    longTermDebtCents: debtOnBooksCents - currentUnit,
    totalLiabilitiesCents: bs.totalLiabilitiesCents,
    contributedEquity,
    retainedEarningsCents: bs.retainedEarningsCents,
    totalEquityCents: bs.totalEquityCents,
  };
}
