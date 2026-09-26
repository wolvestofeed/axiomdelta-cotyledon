import { describe, it, expect } from 'vitest';
import {
  buildAccountNameResolver,
  detectCsvFormat,
  mapGlRows,
  parseCsv,
  type Account,
} from '@/ledger';

const HOSPITALITY_COA_SUBSET: Account[] = [
  { code: '1010', name: 'Cash — Operating', type: 'asset' },
  { code: '4010', name: 'Food Sales', type: 'income' },
  { code: '4030', name: 'Beverage Sales — Alcoholic', type: 'income' },
  { code: '6010', name: 'Wages — BOH / Culinary', type: 'expense' },
  { code: '7010', name: 'Rent / Occupancy', type: 'expense' },
];

describe('buildAccountNameResolver', () => {
  const resolver = buildAccountNameResolver(HOSPITALITY_COA_SUBSET);

  it('matches exact name case-insensitively', () => {
    expect(resolver('Cash — Operating')).toBe('1010');
    expect(resolver('cash — operating')).toBe('1010');
    expect(resolver('  Food Sales  ')).toBe('4010');
  });

  it('matches "1010 Cash" leading-code style', () => {
    expect(resolver('1010 Cash')).toBe('1010');
    expect(resolver('4010 — anything after')).toBe('4010');
  });

  it('matches an unambiguous substring', () => {
    expect(resolver('rent')).toBe('7010');
  });

  it('returns null on an ambiguous substring', () => {
    // Both "Food Sales" and "Beverage Sales — Alcoholic" contain "sales".
    expect(resolver('sales')).toBeNull();
  });

  it('returns null on no match', () => {
    expect(resolver('Suspense Account')).toBeNull();
    expect(resolver('')).toBeNull();
  });
});

describe('mapGlRows — multi-line group', () => {
  const resolver = buildAccountNameResolver(HOSPITALITY_COA_SUBSET);

  it('groups two lines with matching ref/date into one balanced entry', () => {
    const rows = parseCsv(
      [
        'Date,Memo/Description,Num,Account,Debit,Credit',
        '2026-03-05,Tuesday pickup,T001,Cash — Operating,1250.00,',
        '2026-03-05,Tuesday pickup,T001,Food Sales,,1250.00',
      ].join('\n'),
    );
    const result = mapGlRows(
      rows,
      {
        groupBy: [0, 2], // date + num
        date: 0,
        description: 1,
        reference: 2,
        account: 3,
        debit: 4,
        credit: 5,
        amountUnit: 'dollars',
        hasHeader: true,
      },
      resolver,
    );
    expect(result.errors).toEqual([]);
    expect(result.unmatchedAccountNames).toEqual([]);
    expect(result.rows).toHaveLength(1);
    const e = result.rows[0]!.entry;
    expect(e.date).toBe('2026-03-05');
    expect(e.lines).toHaveLength(2);
    expect(e.lines[0]).toMatchObject({
      accountCode: '1010',
      debitCents: 125_000,
      creditCents: 0,
    });
    expect(e.lines[1]).toMatchObject({
      accountCode: '4010',
      debitCents: 0,
      creditCents: 125_000,
    });
    expect(e.reference).toBe('T001');
  });

  it('handles 3-line split transactions', () => {
    const rows = parseCsv(
      [
        'Date,Memo/Description,Num,Account,Debit,Credit',
        '2026-03-10,Mixed sale,T002,Cash — Operating,150.00,',
        '2026-03-10,Mixed sale,T002,Food Sales,,100.00',
        '2026-03-10,Mixed sale,T002,Beverage Sales — Alcoholic,,50.00',
      ].join('\n'),
    );
    const result = mapGlRows(
      rows,
      {
        groupBy: [0, 2],
        date: 0,
        description: 1,
        reference: 2,
        account: 3,
        debit: 4,
        credit: 5,
        amountUnit: 'dollars',
        hasHeader: true,
      },
      resolver,
    );
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.entry.lines).toHaveLength(3);
  });

  it('reports unbalanced groups as a group-level error', () => {
    const rows = parseCsv(
      [
        'Date,Memo/Description,Num,Account,Debit,Credit',
        '2026-03-05,bad,T999,Cash — Operating,100.00,',
        '2026-03-05,bad,T999,Food Sales,,99.00',
      ].join('\n'),
    );
    const result = mapGlRows(
      rows,
      {
        groupBy: [0, 2],
        date: 0,
        description: 1,
        reference: 2,
        account: 3,
        debit: 4,
        credit: 5,
        amountUnit: 'dollars',
        hasHeader: true,
      },
      resolver,
    );
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toMatch(/unbalanced/);
  });

  it('flags unresolved account names', () => {
    const rows = parseCsv(
      [
        'Date,Memo/Description,Num,Account,Debit,Credit',
        '2026-03-05,X,T1,Cash — Operating,100.00,',
        '2026-03-05,X,T1,Unknown Acct,,100.00',
      ].join('\n'),
    );
    const result = mapGlRows(
      rows,
      {
        groupBy: [0, 2],
        date: 0,
        description: 1,
        reference: 2,
        account: 3,
        debit: 4,
        credit: 5,
        amountUnit: 'dollars',
        hasHeader: true,
      },
      resolver,
    );
    expect(result.unmatchedAccountNames).toEqual(['Unknown Acct']);
    // The cash row alone is unbalanced, so it errors too.
    expect(result.rows).toHaveLength(0);
  });

  it('skips zero-amount metadata rows', () => {
    const rows = parseCsv(
      [
        'Date,Memo/Description,Num,Account,Debit,Credit',
        '2026-03-05,Tx,T1,Cash — Operating,100.00,',
        '2026-03-05,Tx,T1,Food Sales,,100.00',
        '2026-03-05,Tx,T1,Food Sales,0.00,0.00',
      ].join('\n'),
    );
    const result = mapGlRows(
      rows,
      {
        groupBy: [0, 2],
        date: 0,
        description: 1,
        reference: 2,
        account: 3,
        debit: 4,
        credit: 5,
        amountUnit: 'dollars',
        hasHeader: true,
      },
      resolver,
    );
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.entry.lines).toHaveLength(2);
  });

  it('rejects rows with both debit and credit set', () => {
    const rows = parseCsv(
      [
        'Date,Memo/Description,Num,Account,Debit,Credit',
        '2026-03-05,Tx,T1,Cash — Operating,50.00,50.00',
      ].join('\n'),
    );
    const result = mapGlRows(
      rows,
      {
        groupBy: [0, 2],
        date: 0,
        description: 1,
        reference: 2,
        account: 3,
        debit: 4,
        credit: 5,
        amountUnit: 'dollars',
        hasHeader: true,
      },
      resolver,
    );
    expect(result.errors[0]!.message).toMatch(/both a debit and a credit/);
  });
});

describe('detectCsvFormat', () => {
  it('recognizes QuickBooks Online Journal header', () => {
    const header = ['Date', 'Memo/Description', 'Num', 'Account', 'Debit', 'Credit'];
    const r = detectCsvFormat(header);
    expect(r.format).toBe('quickbooks_online_csv');
    expect(r.suggestedGlMapping?.date).toBe(0);
    expect(r.suggestedGlMapping?.description).toBe(1);
    expect(r.suggestedGlMapping?.reference).toBe(2);
    expect(r.suggestedGlMapping?.account).toBe(3);
    expect(r.suggestedGlMapping?.debit).toBe(4);
    expect(r.suggestedGlMapping?.credit).toBe(5);
  });

  it('recognizes Xero Journal header', () => {
    const header = ['Date', 'Description', 'Reference', 'Account', 'Debit', 'Credit'];
    const r = detectCsvFormat(header);
    expect(r.format).toBe('xero_csv');
    expect(r.suggestedGlMapping?.account).toBe(3);
    expect(r.suggestedGlMapping?.debit).toBe(4);
  });

  it('falls back to generic_csv for unknown headers', () => {
    const header = ['col1', 'col2', 'col3'];
    const r = detectCsvFormat(header);
    expect(r.format).toBe('generic_csv');
    expect(r.suggestedGlMapping).toBeUndefined();
  });

  it('is case- and whitespace-insensitive', () => {
    const header = [' date ', 'MEMO/DESCRIPTION', 'num', 'account', 'DEBIT', 'credit'];
    const r = detectCsvFormat(header);
    expect(r.format).toBe('quickbooks_online_csv');
  });
});
