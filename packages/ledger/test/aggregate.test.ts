import { describe, it, expect } from 'vitest';
import {
  balanceSheet,
  cashFlow,
  computeAccountBalance,
  createPostingService,
  DEFAULT_CASH_CODES,
  DEFAULT_HOSPITALITY_COA,
  journalIsBalanced,
  ledgerForAccount,
  profitAndLoss,
} from '../src/index.js';
import { MemoryStore } from './memoryStore.js';

function makeStore(): MemoryStore {
  return new MemoryStore(DEFAULT_HOSPITALITY_COA.slice());
}

function deterministicIdGen() {
  let n = 0;
  return () => {
    n += 1;
    return `${n.toString().padStart(16, '0')}-xxxx-xxxx-xxxx-xxxxxxxxxxxx`;
  };
}

/**
 * Seed a few representative journal entries:
 *   - Mar 5: cash sale $1,000 → DR Cash, CR Food Sales
 *   - Mar 10: rent expense $5,000 → DR Rent, CR Cash
 *   - Mar 20: BOH wages $3,000 → DR Wages BOH, CR Accrued Wages
 *   - Apr 1: wage payout — DR Accrued Wages, CR Cash
 */
async function seedTypicalMonth(store: MemoryStore) {
  const svc = createPostingService(store, { idGenerator: deterministicIdGen() });
  await svc.postEntry({
    date: '2026-03-05',
    description: 'Cash sale — Tuesday',
    lines: [
      { accountCode: '1010', debitCents: 100_000, creditCents: 0 },
      { accountCode: '4010', debitCents: 0, creditCents: 100_000 },
    ],
  });
  await svc.postEntry({
    date: '2026-03-10',
    description: 'March rent',
    lines: [
      { accountCode: '7010', debitCents: 500_000, creditCents: 0 },
      { accountCode: '1010', debitCents: 0, creditCents: 500_000 },
    ],
  });
  await svc.postEntry({
    date: '2026-03-20',
    description: 'BOH wage accrual — March',
    lines: [
      { accountCode: '6010', debitCents: 300_000, creditCents: 0 },
      { accountCode: '2110', debitCents: 0, creditCents: 300_000 },
    ],
  });
  await svc.postEntry({
    date: '2026-04-01',
    description: 'BOH wage payout',
    lines: [
      { accountCode: '2110', debitCents: 300_000, creditCents: 0 },
      { accountCode: '1010', debitCents: 0, creditCents: 300_000 },
    ],
  });
}

describe('computeAccountBalance', () => {
  it('reports cash (debit-normal) net of inflows and outflows', async () => {
    const store = makeStore();
    await seedTypicalMonth(store);
    const entries = store.sortedEntries();
    // Through end of March: +100,000 − 500,000 = -400,000
    expect(
      computeAccountBalance('1010', 'asset', entries, { onOrBefore: '2026-03-31' }),
    ).toBe(-400_000);
    // Through April 1: also subtract the 300,000 payout
    expect(
      computeAccountBalance('1010', 'asset', entries, { onOrBefore: '2026-04-01' }),
    ).toBe(-700_000);
  });

  it('reports income (credit-normal) as positive', async () => {
    const store = makeStore();
    await seedTypicalMonth(store);
    expect(
      computeAccountBalance('4010', 'income', store.sortedEntries(), {
        onOrAfter: '2026-03-01',
        onOrBefore: '2026-03-31',
      }),
    ).toBe(100_000);
  });
});

describe('profitAndLoss', () => {
  it('netIncome = income − expense for the range', async () => {
    const store = makeStore();
    await seedTypicalMonth(store);
    const pl = profitAndLoss(
      DEFAULT_HOSPITALITY_COA,
      store.sortedEntries(),
      '2026-03-01',
      '2026-03-31',
    );
    expect(pl.totalIncomeCents).toBe(100_000);
    // Expenses in March: Rent 500,000 + Wages BOH 300,000
    expect(pl.totalExpenseCents).toBe(800_000);
    expect(pl.netIncomeCents).toBe(-700_000);
  });

  it('excludes entries outside the range', async () => {
    const store = makeStore();
    await seedTypicalMonth(store);
    const aprilOnly = profitAndLoss(
      DEFAULT_HOSPITALITY_COA,
      store.sortedEntries(),
      '2026-04-01',
      '2026-04-30',
    );
    // April only has a cash payout against an accrual — no P&L impact.
    expect(aprilOnly.totalIncomeCents).toBe(0);
    expect(aprilOnly.totalExpenseCents).toBe(0);
    expect(aprilOnly.netIncomeCents).toBe(0);
  });
});

describe('balanceSheet — accounting identity', () => {
  it('assets === liabilities + equity at every asOf', async () => {
    const store = makeStore();
    await seedTypicalMonth(store);
    for (const asOf of ['2026-03-05', '2026-03-10', '2026-03-31', '2026-04-01']) {
      const bs = balanceSheet(
        DEFAULT_HOSPITALITY_COA,
        store.sortedEntries(),
        asOf,
      );
      const lhs = bs.totalAssetsCents;
      const rhs = bs.totalLiabilitiesCents + bs.totalEquityCents;
      expect(lhs).toBe(rhs);
    }
  });

  it('rolls income/expense activity into retained earnings', async () => {
    const store = makeStore();
    await seedTypicalMonth(store);
    const bs = balanceSheet(
      DEFAULT_HOSPITALITY_COA,
      store.sortedEntries(),
      '2026-03-31',
    );
    // March: +100,000 income, −800,000 expense → retained = −700,000
    expect(bs.retainedEarningsCents).toBe(-700_000);
  });

  it('balance sheet at empty journal is flat zero', () => {
    const bs = balanceSheet(DEFAULT_HOSPITALITY_COA, [], '2026-01-01');
    expect(bs.totalAssetsCents).toBe(0);
    expect(bs.totalLiabilitiesCents).toBe(0);
    expect(bs.totalEquityCents).toBe(0);
  });
});

describe('cashFlow', () => {
  it('groups cash movements by largest non-cash counter-account', async () => {
    const store = makeStore();
    await seedTypicalMonth(store);
    const cf = cashFlow(
      DEFAULT_HOSPITALITY_COA,
      store.sortedEntries(),
      DEFAULT_CASH_CODES,
      '2026-03-01',
      '2026-03-31',
    );
    // One inflow (Food Sales $1,000) and one outflow (Rent $5,000).
    const inflowTotal = cf.inflows.reduce((s, r) => s + r.amountCents, 0);
    const outflowTotal = cf.outflows.reduce((s, r) => s + r.amountCents, 0);
    expect(inflowTotal).toBe(100_000);
    expect(outflowTotal).toBe(500_000);
    expect(cf.netChangeCents).toBe(-400_000);
    expect(cf.openingCashCents).toBe(0);
    expect(cf.closingCashCents).toBe(-400_000);
  });
});

describe('ledgerForAccount', () => {
  it('produces a running-balance ledger for a single account', async () => {
    const store = makeStore();
    await seedTypicalMonth(store);
    const rows = ledgerForAccount(
      DEFAULT_HOSPITALITY_COA,
      store.sortedEntries(),
      '1010',
    );
    expect(rows).toHaveLength(3);
    // Mar 5: +100k → 100k
    expect(rows[0]!.runningBalanceCents).toBe(100_000);
    // Mar 10: −500k → −400k
    expect(rows[1]!.runningBalanceCents).toBe(-400_000);
    // Apr 1: −300k → −700k
    expect(rows[2]!.runningBalanceCents).toBe(-700_000);
  });
});

describe('journalIsBalanced', () => {
  it('passes after posting only balanced entries', async () => {
    const store = makeStore();
    await seedTypicalMonth(store);
    expect(journalIsBalanced(store.sortedEntries())).toBe(true);
  });
});
