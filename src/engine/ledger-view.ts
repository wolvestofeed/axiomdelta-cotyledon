/**
 * MicroFarm — the ledger a page is reading (Roadmap N6). Types only, safe for the
 * browser: the books themselves are posted on the server (`_lib/ledger-actions.ts`).
 *
 * The scenario bar selects **Plan** — the open forecast, or the plan of record —
 * or **Actual**, the recorded documents. Every statement page renders the same
 * layout against the selection.
 */

import type { JournalEntry } from '@/ledger';
import type { StatementPeriod } from '@/engine/ledger-statements';
import type { TimelineGap } from '@/engine/forecast-timeline';
import type { OverheadAbsorption } from '@/engine';

export type LedgerKind = 'plan' | 'actual';
export const LEDGER_KINDS: readonly LedgerKind[] = ['plan', 'actual'];
export const isLedgerKind = (v: unknown): v is LedgerKind => v === 'plan' || v === 'actual';
export const LEDGER_COOKIE = 'farm_ledger';

export type Granularity = 'month' | 'quarter' | 'year';

export interface LedgerBookView {
  kind: LedgerKind;
  /** The forecast the Plan ledger ran, or the plan of record; null on Actual. */
  forecastLabel: string | null;
  from: string;
  to: string;
  months: StatementPeriod[];
  quarters: StatementPeriod[];
  years: StatementPeriod[];
  /** Actual with nothing on record: every figure is zero. */
  empty: boolean;
  balanced: boolean;
  entryCount: number;
  /** Plan only. */
  horizonYears: number | null;
  gaps: TimelineGap[];
  absorption: OverheadAbsorption | null;
  /** Notes the posting wrote, each once. */
  notes: string[];
  computedMs: number;
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  debitCents: number;
  creditCents: number;
}

export interface LedgerJournalView {
  kind: LedgerKind;
  from: string;
  to: string;
  entries: JournalEntry[];
  /** Entries in the range beyond the page shown. */
  truncated: number;
  accountNames: Record<string, string>;
  /** Balances through the end of the range. */
  trialBalance: TrialBalanceRow[];
  /**
   * Actual only: the document evidencing each entry shown, a fact of record on
   * Sources. Plan entries are generated and carry no evidence.
   */
  evidence: Record<string, import('@/engine/entity-links').LeanEntity | null>;
}

/** The statement periods of a granularity. */
export const periodsOf = (book: Pick<LedgerBookView, 'months' | 'quarters' | 'years'>, g: Granularity): StatementPeriod[] =>
  g === 'month' ? book.months : g === 'quarter' ? book.quarters : book.years;
