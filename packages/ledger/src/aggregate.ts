/**
 * Pure aggregators — derive P&L, Balance Sheet, Cash Flow, and a
 * single-account ledger view from a pre-fetched array of posted
 * journal entries.
 *
 * Caller (the web app's server-side data loader) is responsible for
 * fetching the org-scoped entries + CoA. These helpers compute over
 * them with no I/O so the same shapes can be exercised by unit tests
 * with in-memory fixtures.
 */

import { isDebitNormal } from './types.js';
import type {
  Account,
  AccountRow,
  AccountType,
  BalanceSheet,
  CashFlowRow,
  CashFlowStatement,
  JournalEntry,
  LedgerRow,
  ProfitAndLoss,
} from './types.js';

export interface DateRange {
  /** ISO date "YYYY-MM-DD", inclusive lower bound. */
  onOrAfter?: string;
  /** ISO date "YYYY-MM-DD", inclusive upper bound. */
  onOrBefore?: string;
}

/**
 * Balance for a single account derived from the entry stream.
 * Debit-normal accounts (assets, expenses) report `debits − credits`;
 * credit-normal accounts (liabilities, equity, income) report the
 * inverse so every account's balance reads positive in its natural
 * direction.
 */
export function computeAccountBalance(
  code: string,
  type: AccountType,
  entries: ReadonlyArray<JournalEntry>,
  opts: DateRange = {},
): number {
  let d = 0;
  let c = 0;
  for (const entry of entries) {
    if (opts.onOrBefore && entry.date > opts.onOrBefore) continue;
    if (opts.onOrAfter && entry.date < opts.onOrAfter) continue;
    for (const l of entry.lines) {
      if (l.accountCode !== code) continue;
      d += l.debitCents;
      c += l.creditCents;
    }
  }
  return isDebitNormal(type) ? d - c : c - d;
}

export function profitAndLoss(
  coa: ReadonlyArray<Account>,
  entries: ReadonlyArray<JournalEntry>,
  rangeStart: string,
  rangeEnd: string,
): ProfitAndLoss {
  const income: AccountRow[] = [];
  const expense: AccountRow[] = [];
  for (const account of coa) {
    if (account.type !== 'income' && account.type !== 'expense') continue;
    const bal = computeAccountBalance(account.code, account.type, entries, {
      onOrAfter: rangeStart,
      onOrBefore: rangeEnd,
    });
    const row = { account, balanceCents: bal };
    if (account.type === 'income') income.push(row);
    else expense.push(row);
  }
  const totalIncomeCents = income.reduce((s, r) => s + r.balanceCents, 0);
  const totalExpenseCents = expense.reduce((s, r) => s + r.balanceCents, 0);
  return {
    rangeStart,
    rangeEnd,
    income,
    expense,
    totalIncomeCents,
    totalExpenseCents,
    netIncomeCents: totalIncomeCents - totalExpenseCents,
  };
}

/**
 * Balance Sheet as of an inclusive date. Income and expense activity
 * through `asOf` rolls into a synthetic Retained Earnings figure so
 * `assets ≡ liabilities + equity` without ever needing an explicit
 * closing entry. The roll-forward semantics mirror AxiomDelta.
 */
export function balanceSheet(
  coa: ReadonlyArray<Account>,
  entries: ReadonlyArray<JournalEntry>,
  asOf: string,
): BalanceSheet {
  const assets: AccountRow[] = [];
  const liabilities: AccountRow[] = [];
  const equity: AccountRow[] = [];
  for (const account of coa) {
    if (account.type === 'income' || account.type === 'expense') continue;
    const bal = computeAccountBalance(account.code, account.type, entries, {
      onOrBefore: asOf,
    });
    const row = { account, balanceCents: bal };
    if (account.type === 'asset') assets.push(row);
    else if (account.type === 'liability') liabilities.push(row);
    else equity.push(row);
  }
  const totalAssetsCents = assets.reduce((s, r) => s + r.balanceCents, 0);
  const totalLiabilitiesCents = liabilities.reduce(
    (s, r) => s + r.balanceCents,
    0,
  );
  const earlyEquity = equity.reduce((s, r) => s + r.balanceCents, 0);
  let retained = 0;
  for (const account of coa) {
    if (account.type !== 'income' && account.type !== 'expense') continue;
    const bal = computeAccountBalance(account.code, account.type, entries, {
      onOrBefore: asOf,
    });
    retained += account.type === 'income' ? bal : -bal;
  }
  return {
    asOf,
    assets,
    liabilities,
    equity,
    totalAssetsCents,
    totalLiabilitiesCents,
    totalEquityCents: earlyEquity + retained,
    retainedEarningsCents: retained,
  };
}

function priorDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Cash Flow — direct-method approximation. For every entry that
 * touches a cash account in the range, the net cash delta is grouped
 * by the entry's largest non-cash counter-account. That gives
 * operators an at-a-glance "where the cash went" without needing a
 * full indirect-method reconciliation.
 *
 * The deterministic `@ct/financials` engine uses the indirect method
 * for the forecast statement; the variance view in Phase 5d diffs by
 * account-line totals, not by method, so the difference is acceptable.
 */
export function cashFlow(
  coa: ReadonlyArray<Account>,
  entries: ReadonlyArray<JournalEntry>,
  cashCodes: ReadonlySet<string>,
  rangeStart: string,
  rangeEnd: string,
): CashFlowStatement {
  const inflowMap = new Map<string, number>();
  const outflowMap = new Map<string, number>();

  for (const entry of entries) {
    if (entry.date < rangeStart || entry.date > rangeEnd) continue;
    const cashLines = entry.lines.filter((l) => cashCodes.has(l.accountCode));
    if (cashLines.length === 0) continue;
    const otherLines = entry.lines.filter(
      (l) => !cashCodes.has(l.accountCode),
    );
    const cashDelta = cashLines.reduce(
      (s, l) => s + l.debitCents - l.creditCents,
      0,
    );
    if (cashDelta === 0) continue;
    const counter = otherLines.reduce<{ code: string; total: number } | null>(
      (best, l) => {
        const total = l.debitCents + l.creditCents;
        if (!best || total > best.total) return { code: l.accountCode, total };
        return best;
      },
      null,
    );
    const counterAccount = counter
      ? coa.find((a) => a.code === counter.code)
      : undefined;
    const label = counterAccount?.name ?? entry.description;
    if (cashDelta > 0) {
      inflowMap.set(label, (inflowMap.get(label) ?? 0) + cashDelta);
    } else {
      outflowMap.set(label, (outflowMap.get(label) ?? 0) + -cashDelta);
    }
  }

  const inflows: CashFlowRow[] = [...inflowMap.entries()]
    .map(([label, amountCents]) => ({ label, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);
  const outflows: CashFlowRow[] = [...outflowMap.entries()]
    .map(([label, amountCents]) => ({ label, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const inflowTotal = inflows.reduce((s, r) => s + r.amountCents, 0);
  const outflowTotal = outflows.reduce((s, r) => s + r.amountCents, 0);

  let openingCashCents = 0;
  let closingCashCents = 0;
  for (const code of cashCodes) {
    openingCashCents += computeAccountBalance(code, 'asset', entries, {
      onOrBefore: priorDay(rangeStart),
    });
    closingCashCents += computeAccountBalance(code, 'asset', entries, {
      onOrBefore: rangeEnd,
    });
  }

  return {
    rangeStart,
    rangeEnd,
    inflows,
    outflows,
    netChangeCents: inflowTotal - outflowTotal,
    openingCashCents,
    closingCashCents,
  };
}

/** Per-entry detail rows for one account, ordered chronologically with running balance. */
export function ledgerForAccount(
  coa: ReadonlyArray<Account>,
  entries: ReadonlyArray<JournalEntry>,
  code: string,
): LedgerRow[] {
  const account = coa.find((a) => a.code === code);
  if (!account) return [];
  const debitNormal = isDebitNormal(account.type);
  const rows: LedgerRow[] = [];
  let running = 0;
  // Entries are caller-sorted; the canonical loader returns date asc.
  for (const entry of entries) {
    for (const l of entry.lines) {
      if (l.accountCode !== code) continue;
      const delta = debitNormal
        ? l.debitCents - l.creditCents
        : l.creditCents - l.debitCents;
      running += delta;
      const row: LedgerRow = {
        entryId: entry.id,
        date: entry.date,
        description: entry.description,
        debitCents: l.debitCents,
        creditCents: l.creditCents,
        runningBalanceCents: running,
      };
      if (entry.reference) row.reference = entry.reference;
      rows.push(row);
    }
  }
  return rows;
}

/** Convenience: every entry imbalanced flag, for an "is journal clean?" health check. */
export function journalIsBalanced(entries: ReadonlyArray<JournalEntry>): boolean {
  for (const e of entries) {
    let d = 0;
    let c = 0;
    for (const l of e.lines) {
      d += l.debitCents;
      c += l.creditCents;
    }
    if (d !== c) return false;
  }
  return true;
}
