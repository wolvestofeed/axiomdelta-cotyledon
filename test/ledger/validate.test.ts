import { describe, it, expect } from 'vitest';
import {
  assertBalanced,
  assertKnownAccounts,
  assertLineShape,
  buildReversingLines,
  entryImbalanceCents,
  isEntryLocked,
  JournalError,
  DEFAULT_HOSPITALITY_COA,
} from '@/ledger';

describe('validate — assertBalanced', () => {
  it('passes when debits === credits', () => {
    expect(() =>
      assertBalanced([
        { debitCents: 1000, creditCents: 0 },
        { debitCents: 0, creditCents: 1000 },
      ]),
    ).not.toThrow();
  });

  it('throws UNBALANCED when sides differ', () => {
    expect(() =>
      assertBalanced([
        { debitCents: 1000, creditCents: 0 },
        { debitCents: 0, creditCents: 900 },
      ]),
    ).toThrow(JournalError);
  });

  it('throws EMPTY_LINES on empty array', () => {
    expect(() => assertBalanced([])).toThrow(/EMPTY_LINES|no lines/);
  });
});

describe('validate — assertLineShape', () => {
  it('rejects mixed debit + credit on a single line', () => {
    expect(() =>
      assertLineShape([
        { accountCode: '1010', debitCents: 100, creditCents: 100 },
      ]),
    ).toThrow(JournalError);
  });

  it('rejects negative amounts', () => {
    expect(() =>
      assertLineShape([
        { accountCode: '1010', debitCents: -100, creditCents: 0 },
      ]),
    ).toThrow(JournalError);
  });

  it('rejects non-integer cents', () => {
    expect(() =>
      assertLineShape([
        { accountCode: '1010', debitCents: 100.5, creditCents: 0 },
      ]),
    ).toThrow(JournalError);
  });

  it('accepts a clean line', () => {
    expect(() =>
      assertLineShape([
        { accountCode: '1010', debitCents: 100, creditCents: 0 },
      ]),
    ).not.toThrow();
  });
});

describe('validate — assertKnownAccounts', () => {
  const known = new Set(DEFAULT_HOSPITALITY_COA.map((a) => a.code));

  it('passes when every line references a known account', () => {
    expect(() =>
      assertKnownAccounts(
        [
          { accountCode: '1010', debitCents: 100, creditCents: 0 },
          { accountCode: '4010', debitCents: 0, creditCents: 100 },
        ],
        known,
      ),
    ).not.toThrow();
  });

  it('throws UNKNOWN_ACCOUNT for a missing code', () => {
    expect(() =>
      assertKnownAccounts(
        [{ accountCode: '9999', debitCents: 100, creditCents: 0 }],
        known,
      ),
    ).toThrow(JournalError);
  });
});

describe('validate — entryImbalanceCents', () => {
  it('returns debits − credits', () => {
    expect(
      entryImbalanceCents({
        lines: [
          { accountCode: '1010', debitCents: 500, creditCents: 0 },
          { accountCode: '4010', debitCents: 0, creditCents: 400 },
        ],
      }),
    ).toBe(100);
  });
});

describe('validate — buildReversingLines', () => {
  it('swaps debit and credit on every line', () => {
    const reversed = buildReversingLines([
      { accountCode: '1010', debitCents: 1000, creditCents: 0, memo: 'orig' },
      { accountCode: '4010', debitCents: 0, creditCents: 1000 },
    ]);
    expect(reversed[0]).toEqual({
      accountCode: '1010',
      debitCents: 0,
      creditCents: 1000,
      memo: 'orig',
    });
    expect(reversed[1]).toEqual({
      accountCode: '4010',
      debitCents: 1000,
      creditCents: 0,
    });
  });
});

describe('validate — isEntryLocked', () => {
  it('locks entries from an import batch', () => {
    expect(isEntryLocked({ importBatchId: 'b_1' })).toBe(true);
  });
  it('locks reversal entries (void: reference)', () => {
    expect(isEntryLocked({ reference: 'void:je_orig' })).toBe(true);
  });
  it('does not lock plain manual entries', () => {
    expect(isEntryLocked({})).toBe(false);
    expect(isEntryLocked({ reference: 'manual-2026-q1' })).toBe(false);
  });
});
