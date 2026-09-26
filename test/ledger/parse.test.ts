import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  parseAmountToCents,
  parseDateToIso,
  mapTransactionRows,
} from '@/ledger';

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('handles quoted fields with commas', () => {
    expect(parseCsv('a,"hello, world",c')).toEqual([['a', 'hello, world', 'c']]);
  });

  it('handles escaped quotes inside quoted fields', () => {
    expect(parseCsv('a,"she said ""hi""",c')).toEqual([
      ['a', 'she said "hi"', 'c'],
    ]);
  });

  it('handles newlines inside quoted fields', () => {
    expect(parseCsv('a,"line1\nline2",c')).toEqual([['a', 'line1\nline2', 'c']]);
  });

  it('ignores a single trailing newline', () => {
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']]);
  });

  it('returns [] on empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('preserves empty cells', () => {
    expect(parseCsv('a,,c')).toEqual([['a', '', 'c']]);
  });
});

describe('parseAmountToCents', () => {
  it('parses plain dollars', () => {
    expect(parseAmountToCents('125.50', 'dollars')).toBe(12_550);
    expect(parseAmountToCents('100', 'dollars')).toBe(10_000);
  });

  it('strips $ and commas', () => {
    expect(parseAmountToCents('$1,234.56', 'dollars')).toBe(123_456);
  });

  it('parses parens as negative', () => {
    expect(parseAmountToCents('(125.00)', 'dollars')).toBe(-12_500);
  });

  it('parses leading minus as negative', () => {
    expect(parseAmountToCents('-50.00', 'dollars')).toBe(-5_000);
  });

  it('rounds to nearest cent', () => {
    expect(parseAmountToCents('1.005', 'dollars')).toBe(101);
    expect(parseAmountToCents('1.004', 'dollars')).toBe(100);
  });

  it('parses cents unit as integer', () => {
    expect(parseAmountToCents('12550', 'cents')).toBe(12_550);
  });

  it('rejects decimal cents', () => {
    expect(parseAmountToCents('125.50', 'cents')).toBeNull();
  });

  it('returns null on garbage', () => {
    expect(parseAmountToCents('foo', 'dollars')).toBeNull();
    expect(parseAmountToCents('', 'dollars')).toBeNull();
    expect(parseAmountToCents('1.2.3', 'dollars')).toBeNull();
  });
});

describe('parseDateToIso', () => {
  it('passes through ISO dates', () => {
    expect(parseDateToIso('2026-03-15')).toBe('2026-03-15');
  });

  it('pads single-digit ISO components', () => {
    expect(parseDateToIso('2026-3-5')).toBe('2026-03-05');
  });

  it('parses US M/D/YYYY', () => {
    expect(parseDateToIso('3/15/2026')).toBe('2026-03-15');
    expect(parseDateToIso('03/15/2026')).toBe('2026-03-15');
  });

  it('rejects 2-digit years', () => {
    expect(parseDateToIso('3/15/26')).toBeNull();
  });

  it('rejects invalid calendar dates', () => {
    expect(parseDateToIso('2026-02-30')).toBeNull();
    expect(parseDateToIso('2026-13-01')).toBeNull();
  });

  it('returns null on garbage', () => {
    expect(parseDateToIso('not a date')).toBeNull();
    expect(parseDateToIso('')).toBeNull();
  });
});

describe('mapTransactionRows', () => {
  it('builds balanced 2-line entries from a header-less CSV', () => {
    const rows = [
      ['2026-03-05', 'Cash sale', '1010', '4010', '1000.00', 'Tuesday pickup'],
      ['2026-03-10', 'Rent', '7010', '1010', '5000.00', 'March'],
    ];
    const result = mapTransactionRows(rows, {
      date: 0,
      description: 1,
      debitAccount: 2,
      creditAccount: 3,
      amount: 4,
      memo: 5,
      amountUnit: 'dollars',
      hasHeader: false,
    });
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    const e0 = result.rows[0]!.entry;
    expect(e0.date).toBe('2026-03-05');
    expect(e0.lines).toHaveLength(2);
    expect(e0.lines[0]).toMatchObject({
      accountCode: '1010',
      debitCents: 100_000,
      creditCents: 0,
      memo: 'Tuesday pickup',
    });
    expect(e0.lines[1]).toMatchObject({
      accountCode: '4010',
      debitCents: 0,
      creditCents: 100_000,
    });
  });

  it('skips the header row when hasHeader=true', () => {
    const rows = [
      ['date', 'description', 'dr', 'cr', 'amount'],
      ['2026-03-05', 'Cash sale', '1010', '4010', '1000.00'],
    ];
    const result = mapTransactionRows(rows, {
      date: 0,
      description: 1,
      debitAccount: 2,
      creditAccount: 3,
      amount: 4,
      amountUnit: 'dollars',
      hasHeader: true,
    });
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it('swaps sides for negative amounts', () => {
    const rows = [['2026-03-05', 'Refund', '1010', '4010', '-100.00']];
    const result = mapTransactionRows(rows, {
      date: 0,
      description: 1,
      debitAccount: 2,
      creditAccount: 3,
      amount: 4,
      amountUnit: 'dollars',
      hasHeader: false,
    });
    expect(result.errors).toEqual([]);
    const e = result.rows[0]!.entry;
    // With -100, the original DR=1010, CR=4010 swap: DR=4010, CR=1010.
    expect(e.lines[0]).toMatchObject({
      accountCode: '4010',
      debitCents: 10_000,
      creditCents: 0,
    });
    expect(e.lines[1]).toMatchObject({
      accountCode: '1010',
      debitCents: 0,
      creditCents: 10_000,
    });
  });

  it('reports row-level errors without aborting', () => {
    const rows = [
      ['2026-03-05', 'good', '1010', '4010', '100.00'],
      ['not-a-date', 'bad date', '1010', '4010', '50.00'],
      ['2026-03-10', '', '1010', '4010', '50.00'],
      ['2026-03-15', 'bad amount', '1010', '4010', 'foo'],
      ['2026-03-20', 'zero', '1010', '4010', '0'],
      ['2026-03-25', 'missing dr', '', '4010', '50.00'],
    ];
    const result = mapTransactionRows(rows, {
      date: 0,
      description: 1,
      debitAccount: 2,
      creditAccount: 3,
      amount: 4,
      amountUnit: 'dollars',
      hasHeader: false,
    });
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(5);
    expect(result.errors.map((e) => e.rowIndex)).toEqual([1, 2, 3, 4, 5]);
  });

  it('skips entirely-blank rows silently', () => {
    const rows = [
      ['2026-03-05', 'good', '1010', '4010', '100.00'],
      ['', '', '', '', ''],
      ['2026-03-10', 'good 2', '1010', '4010', '50.00'],
    ];
    const result = mapTransactionRows(rows, {
      date: 0,
      description: 1,
      debitAccount: 2,
      creditAccount: 3,
      amount: 4,
      amountUnit: 'dollars',
      hasHeader: false,
    });
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
  });

  it('attaches reference when mapping.reference is set', () => {
    const rows = [['2026-03-05', 'Cash sale', '1010', '4010', '100.00', '', 'tx_12345']];
    const result = mapTransactionRows(rows, {
      date: 0,
      description: 1,
      debitAccount: 2,
      creditAccount: 3,
      amount: 4,
      memo: 5,
      reference: 6,
      amountUnit: 'dollars',
      hasHeader: false,
    });
    expect(result.rows[0]!.entry.reference).toBe('tx_12345');
  });
});
