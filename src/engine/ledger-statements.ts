/**
 * Cotyledon — statements by period from a posted journal (Roadmap N5 / N6).
 *
 * Server-side only (reads through `@/ledger`). One builder for both ledgers:
 * the Plan ledger over a forecast's window and the Actual ledger over the
 * periods on record. Months, calendar quarters and fiscal years (the calendar
 * year, accounting-policy §15), each clipped to the window: the classified
 * income statement, the classified balance sheet at the period end, and the
 * cash flow by the direct and the indirect method, asserted equal.
 */

import { DEFAULT_CASH_CODES, balanceSheet, cashFlow, profitAndLoss, type Account, type CashFlowStatement, type JournalEntry } from '@/ledger';
import { periodEnd, periodOf, periodStart } from '@/engine/actuals';
import { ACC_LONG_TERM_DEBT } from '@/data/coa-farm';

const ACC_INTEREST = '8020';
import { addMonths } from '@/engine/working-capital';
import type { PostedPeriod } from '@/engine/actuals-ledger';
import {
  cashFlowIndirect,
  classifyBalanceSheet,
  classifyIncomeStatement,
  type CashFlowIndirect,
  type ClassifiedBalanceSheet,
  type IncomeStatement,
} from '@/engine/ledger-model';

export interface StatementPeriod {
  /** 'month' YYYY-MM, 'quarter' YYYY-Qn, 'year' YYYY. */
  kind: 'month' | 'quarter' | 'year';
  label: string;
  from: string;
  to: string;
  incomeStatement: IncomeStatement;
  balanceSheet: ClassifiedBalanceSheet;
  cashFlow: CashFlowStatement;
  cashFlowIndirect: CashFlowIndirect;
  /** Direct net change in cash equals the indirect method's. */
  cashFlowTies: boolean;
  /** Every entry in the period balances, and assets equal liabilities plus equity at its end. */
  balanced: boolean;
  /** Units made and distributed in the period, from the posted months it covers. */
  unitsProduced: number;
  unitsDistributed: number;
  /**
   * Fixed cost per unit — a period metric on the expense basis, never in the cost of a
   * unit (operating-model-roadmap §3.5): manufacturing overhead as incurred (the accrued
   * budget and depreciation, trued to the bills by the spending variance), general and
   * administrative, and interest, over the period's units distributed. Principal repaid is
   * financing and is reported beside it.
   */
  fixedExpense: {
    manufacturingOverheadCents: number;
    generalAndAdministrativeCents: number;
    interestCents: number;
    totalCents: number;
    principalRepaidCents: number;
    /** Null with no units distributed. */
    perUnitCents: number | null;
  };
  /** Overhead absorption in the period: applied, incurred and the variances. */
  overhead: { appliedCents: number; incurredCents: number; volumeVarianceCents: number; spendingVarianceCents: number };
}

export interface StatementSet {
  months: StatementPeriod[];
  quarters: StatementPeriod[];
  years: StatementPeriod[];
  balanced: boolean;
}

export const monthsBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let p = periodOf(from); p <= periodOf(to); p = periodOf(addMonths(periodStart(p), 1))) out.push(p);
  return out;
};

export function statementPeriods(input: {
  entries: readonly JournalEntry[];
  coa: readonly Account[];
  from: string;
  to: string;
  /** The current unit of long-term debt presented at a date, cents. */
  currentUnitAt: (asOf: string) => number;
  posted: readonly PostedPeriod[];
}): StatementSet {
  const entries = [...input.entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const { coa, from: windowFrom, to: windowTo } = input;
  const first = entries[0]?.date ?? windowFrom;

  const statementFor = (kind: StatementPeriod['kind'], label: string, from: string, to: string): StatementPeriod => {
    // A period that opens the window carries anything posted before it — production the day before the start.
    const rangeFrom = from <= windowFrom && first < from ? first : from;
    const inRange = entries.filter((e) => e.date >= rangeFrom && e.date <= to);
    const pnl = profitAndLoss(coa, entries, rangeFrom, to);
    const bs = balanceSheet(coa, entries, to);
    const direct = cashFlow(coa, entries, DEFAULT_CASH_CODES, rangeFrom, to);
    const indirect = cashFlowIndirect(coa, inRange, pnl);
    const entriesBalance = inRange.every((e) => e.lines.reduce((s, l) => s + l.debitCents - l.creditCents, 0) === 0);
    const covered = input.posted.filter((p) => p.period >= periodOf(rangeFrom) && p.period <= periodOf(to));
    const debit = (code: string) => inRange.reduce((t, e) => t + e.lines.filter((l) => l.accountCode === code).reduce((u, l) => u + l.debitCents - l.creditCents, 0), 0);
    const statement = classifyIncomeStatement(pnl);
    const manufacturingOverheadCents = covered.reduce((t, p) => t + p.overhead.incurredCents + p.overhead.spendingVarianceCents, 0);
    const generalAndAdministrativeCents = statement.generalAndAdministrative.reduce((t, r) => t + r.cents, 0);
    const interestCents = debit(ACC_INTEREST);
    const totalCents = manufacturingOverheadCents + generalAndAdministrativeCents + interestCents;
    const unitsDistributed = covered.reduce((t, p) => t + p.unitsDistributed, 0);
    const principalRepaidCents = inRange
      .filter((e) => e.lines.some((l) => DEFAULT_CASH_CODES.has(l.accountCode)))
      .reduce((t, e) => t + e.lines.filter((l) => l.accountCode === ACC_LONG_TERM_DEBT).reduce((u, l) => u + l.debitCents, 0), 0);
    return {
      kind,
      label,
      from,
      to,
      incomeStatement: statement,
      balanceSheet: classifyBalanceSheet(bs, input.currentUnitAt(to)),
      cashFlow: direct,
      cashFlowIndirect: indirect,
      cashFlowTies: direct.netChangeCents === indirect.netChangeCents,
      balanced: entriesBalance && bs.totalAssetsCents === bs.totalLiabilitiesCents + bs.totalEquityCents,
      unitsProduced: covered.reduce((s, p) => s + p.unitsProduced, 0),
      unitsDistributed,
      fixedExpense: {
        manufacturingOverheadCents,
        generalAndAdministrativeCents,
        interestCents,
        totalCents,
        principalRepaidCents,
        perUnitCents: unitsDistributed > 0 ? totalCents / unitsDistributed : null,
      },
      overhead: {
        appliedCents: covered.reduce((t, p) => t + p.overhead.appliedCents, 0),
        incurredCents: covered.reduce((t, p) => t + p.overhead.incurredCents, 0),
        volumeVarianceCents: covered.reduce((t, p) => t + p.overhead.volumeVarianceCents, 0),
        spendingVarianceCents: covered.reduce((t, p) => t + p.overhead.spendingVarianceCents, 0),
      },
    };
  };

  const clip = (from: string, to: string) => ({ from: from < windowFrom ? windowFrom : from, to: to > windowTo ? windowTo : to });
  const months = monthsBetween(windowFrom, windowTo).map((p) => {
    const r = clip(periodStart(p), periodEnd(p));
    return statementFor('month', p, r.from, r.to);
  });
  const quarters: StatementPeriod[] = [];
  const years: StatementPeriod[] = [];
  for (let y = Number(windowFrom.slice(0, 4)); y <= Number(windowTo.slice(0, 4)); y++) {
    for (let q = 1; q <= 4; q++) {
      const qFrom = `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
      const qTo = periodEnd(`${y}-${String(q * 3).padStart(2, '0')}`);
      if (qTo < windowFrom || qFrom > windowTo) continue;
      const r = clip(qFrom, qTo);
      quarters.push(statementFor('quarter', `${y}-Q${q}`, r.from, r.to));
    }
    const r = clip(`${y}-01-01`, `${y}-12-31`);
    years.push(statementFor('year', String(y), r.from, r.to));
  }
  return { months, quarters, years, balanced: [...months, ...quarters, ...years].every((s) => s.balanced && s.cashFlowTies) };
}
