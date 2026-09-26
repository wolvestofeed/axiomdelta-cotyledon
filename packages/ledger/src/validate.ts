/**
 * Pure double-entry validators — no DB, no I/O. Lifted from the
 * AxiomDelta `coach/financials.ts` reference and trimmed.
 *
 * These run inside `validateDraft()` before any insert. They're also
 * exported for callers that need to dry-run a draft (e.g. preview an
 * import batch before commit).
 */

import type {
  JournalEntry,
  JournalLine,
  NewJournalEntry,
  NewJournalLine,
} from './types.js';

export class JournalError extends Error {
  constructor(
    public readonly code:
      | 'UNBALANCED'
      | 'UNKNOWN_ACCOUNT'
      | 'EMPTY_LINES'
      | 'NEGATIVE_AMOUNT'
      | 'MIXED_DEBIT_CREDIT'
      | 'ENTRY_NOT_FOUND'
      | 'PERIOD_CLOSED'
      | 'ENTRY_LOCKED',
    message: string,
  ) {
    super(message);
    this.name = 'JournalError';
  }
}

/**
 * Sum debits − credits across an entry's lines. Zero = balanced.
 * Useful in tests and import-preview UIs that want to flag the gap.
 */
export function entryImbalanceCents(
  entry: Pick<JournalEntry, 'lines'> | Pick<NewJournalEntry, 'lines'>,
): number {
  let d = 0;
  let c = 0;
  for (const l of entry.lines) {
    d += l.debitCents;
    c += l.creditCents;
  }
  return d - c;
}

export function assertBalanced(
  lines: ReadonlyArray<Pick<JournalLine, 'debitCents' | 'creditCents'>>,
): void {
  if (lines.length === 0) {
    throw new JournalError('EMPTY_LINES', 'Entry has no lines.');
  }
  let d = 0;
  let c = 0;
  for (const l of lines) {
    d += l.debitCents;
    c += l.creditCents;
  }
  if (d !== c) {
    throw new JournalError(
      'UNBALANCED',
      `Debits (${d}) do not equal credits (${c}).`,
    );
  }
}

export function assertLineShape(
  lines: ReadonlyArray<NewJournalLine>,
): void {
  for (const [idx, l] of lines.entries()) {
    if (!Number.isInteger(l.debitCents) || !Number.isInteger(l.creditCents)) {
      throw new JournalError(
        'NEGATIVE_AMOUNT',
        `Line ${idx} has non-integer cents — ledger stores integers only.`,
      );
    }
    if (l.debitCents < 0 || l.creditCents < 0) {
      throw new JournalError(
        'NEGATIVE_AMOUNT',
        `Line ${idx} has negative amounts.`,
      );
    }
    if (l.debitCents > 0 && l.creditCents > 0) {
      throw new JournalError(
        'MIXED_DEBIT_CREDIT',
        `Line ${idx} has both a debit and a credit. Split into two lines.`,
      );
    }
  }
}

export function assertKnownAccounts(
  lines: ReadonlyArray<NewJournalLine>,
  knownCodes: ReadonlySet<string>,
): void {
  for (const l of lines) {
    if (!knownCodes.has(l.accountCode)) {
      throw new JournalError(
        'UNKNOWN_ACCOUNT',
        `Account code "${l.accountCode}" is not in the chart of accounts.`,
      );
    }
  }
}

/**
 * Entries posted by ingest are locked against hand-edits — corrections
 * happen via void + re-post. The convention: any entry with a non-null
 * `importBatchId` is immutable. Manual operator entries (no batch) are
 * editable. Reversal entries carry `reference: "void:<originalId>"`
 * and are also locked.
 */
export function isEntryLocked(
  entry: Pick<JournalEntry, 'reference' | 'importBatchId'>,
): boolean {
  if (entry.importBatchId) return true;
  const ref = entry.reference;
  if (ref && ref.startsWith('void:')) return true;
  return false;
}

/**
 * Build the reversing lines for a void. Swaps debit/credit per line so
 * the original and reversal net to zero on every account.
 */
export function buildReversingLines(
  lines: ReadonlyArray<JournalLine>,
): NewJournalLine[] {
  return lines.map((l) => {
    const out: NewJournalLine = {
      accountCode: l.accountCode,
      debitCents: l.creditCents,
      creditCents: l.debitCents,
    };
    if (l.memo !== undefined) out.memo = l.memo;
    return out;
  });
}
