/**
 * Public types for the ledger — MicroFarm's double-entry sub-ledger.
 *
 * The ledger is NOT a books-of-record system. This ledger ingests
 * actuals (CSV exports from QuickBooks / Xero / generic GLs in Phase
 * 5b–5c) and lets the `/financials` page diff actuals against the
 * deterministic forecast that `@ct/financials` produces.
 *
 * Money: `cents` as integers throughout. JS `number` is safe up to
 * 2^53; for restaurant-grade dollars that's $90 trillion of headroom.
 */

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'income'
  | 'expense';

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  description?: string;
}

export interface JournalLine {
  accountCode: string;
  debitCents: number;
  creditCents: number;
  memo?: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  reference?: string;
  /** Source import batch (when the entry was created by an ingest run). */
  importBatchId?: string;
  lines: JournalLine[];
}

export interface NewJournalLine {
  accountCode: string;
  debitCents: number;
  creditCents: number;
  memo?: string;
}

export interface NewJournalEntry {
  date: string;
  description: string;
  reference?: string;
  importBatchId?: string;
  lines: NewJournalLine[];
}

export interface JournalEntryPatch {
  date?: string;
  description?: string;
  reference?: string | null;
  lines?: NewJournalLine[];
}

/** A debit-normal account (asset, expense) reports activity as debits − credits. */
export function isDebitNormal(type: AccountType): boolean {
  return type === 'asset' || type === 'expense';
}

// ─── Aggregated statement shapes (computed from posted entries) ──────

export interface AccountRow {
  account: Account;
  balanceCents: number;
}

export interface ProfitAndLoss {
  rangeStart: string;
  rangeEnd: string;
  income: AccountRow[];
  expense: AccountRow[];
  totalIncomeCents: number;
  totalExpenseCents: number;
  netIncomeCents: number;
}

export interface BalanceSheet {
  asOf: string;
  assets: AccountRow[];
  liabilities: AccountRow[];
  equity: AccountRow[];
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  totalEquityCents: number;
  retainedEarningsCents: number;
}

export interface CashFlowRow {
  label: string;
  amountCents: number;
}

export interface CashFlowStatement {
  rangeStart: string;
  rangeEnd: string;
  inflows: CashFlowRow[];
  outflows: CashFlowRow[];
  netChangeCents: number;
  openingCashCents: number;
  closingCashCents: number;
}

export interface LedgerRow {
  entryId: string;
  date: string;
  description: string;
  reference?: string;
  debitCents: number;
  creditCents: number;
  runningBalanceCents: number;
}

export interface PeriodLock {
  periodEnd: string;
  lockedAt: string;
  lockedBy?: string;
  note?: string;
}
