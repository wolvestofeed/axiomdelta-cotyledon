import { describe, it, expect } from 'vitest';
import { cropPlan, phases, assumptions } from '@/data/plan-data';
import { deriveCapacity, componentCosting } from '@/engine';
import {
  periodOf,
  periodEnd,
  periodsIn,
  bundleForPeriod,
  toSowingExecution,
  sowingIdFor,
  standardSowingRecordPrefill,
  finishedLotsOf,
  laborFromCrew,
  costReceiptLines,
  BILL_ACCOUNTS,
  type ActualsBundle,
  type SowingRecordDoc,
  type ReceiptDoc,
  type DistributionDoc,
  type PeriodBillDoc,
} from '@/engine/actuals';
import { postActuals, postActualLedger, periodWorkingCapital } from '@/engine/actuals-ledger';
import { resolveScenarioInputs } from '@/engine/scenario';
import { massBalance } from '@/engine/sowing';
import { manufacturingOverheadBudget } from '@/engine/fixed-costs';

const DATE = '2026-09-14';
const PERIOD = '2026-09';
const sowingSize = deriveCapacity(cropPlan).sowingSize;

function sowingDoc(overrides: Partial<SowingRecordDoc> = {}): SowingRecordDoc {
  const pre = standardSowingRecordPrefill(DATE, 1, sowingSize, cropPlan);
  return { id: 'b1000000-0000-0000-0000-000000000001', closedAt: null, ...pre, closedBy: 'R. Bogatin', ...overrides };
}

function receiptDoc(priceFactor = 1): ReceiptDoc {
  const k = componentCosting(cropPlan);
  const lines = k.flatMap((c) =>
    c.lines.map((l) => ({
      input: l.name,
      qty: (l.seedQtyPerSowing * sowingSize) / 100,
      unit: l.unit,
      lotCode: `SUP-${l.name.slice(0, 3).toUpperCase()}-01`,
      unitPriceCents: Math.round(l.seedUnitCost * 100 * priceFactor),
    })),
  );
  return {
    id: 'r1000000-0000-0000-0000-000000000001',
    poId: null,
    supplierId: null,
    supplierName: 'Test grower',
    receivedOn: '2026-09-12',
    invoiceNumber: 'INV-1',
    invoiceTotalCents: lines.reduce((s, l) => s + Math.round(l.qty * l.unitPriceCents), 0),
    lines,
    receivedBy: 'dock',
    notes: null,
  };
}

function distributionDoc(units: number, phase = 1, id = 'd1000000-0000-0000-0000-000000000001'): DistributionDoc {
  return {
    id,
    distributedOn: '2026-09-15',
    phase,
    pickupPointId: null,
    pickupPointName: 'Test prospect',
    units,
    pricePerUnitCents: Math.round(phases[phase - 1].pricePerUnit * 100),
    lotCodes: [],
    distributedBy: 'driver',
    notes: null,
  };
}

function billDoc(category: PeriodBillDoc['category'], amountCents: number, paidOn: string | null = null): PeriodBillDoc {
  return {
    id: `p1000000-0000-0000-0000-00000000000${category.length}`,
    period: PERIOD,
    category,
    accountCode: category === 'other' ? '7050' : BILL_ACCOUNTS[category],
    amountCents,
    vendor: category,
    invoiceNumber: null,
    incurredOn: '2026-09-01',
    paidOn,
    notes: null,
  };
}

const bundle: ActualsBundle = {
  sowings: [sowingDoc()],
  receipts: [receiptDoc(1.04)],
  distributions: [distributionDoc(sowingSize)],
  bills: [billDoc('lease', 1_200_000), billDoc('utilities', 450_000, '2026-09-20'), billDoc('admin', 600_000)],
};

const net = (entries: { lines: { accountCode: string; debitCents: number; creditCents: number }[] }[], code: string) =>
  entries.flatMap((e) => e.lines).filter((l) => l.accountCode === code).reduce((s, l) => s + l.debitCents - l.creditCents, 0);

describe('actuals — documents and periods', () => {
  it('a sowing id and a period come from the date', () => {
    expect(sowingIdFor('2026-09-14', 3)).toBe('B-260914-03');
    expect(periodOf('2026-09-14')).toBe('2026-09');
    expect(periodEnd('2026-02')).toBe('2026-02-28');
    expect(periodEnd('2026-12')).toBe('2026-12-31');
  });

  it('the prefill is the crop plan standard and mass-balances before anyone types', () => {
    const doc = sowingDoc();
    expect(doc.goodUnits).toBe(sowingSize);
    expect(massBalance(toSowingExecution(doc)).balanced).toBe(true);
    expect(doc.components.every((c) => c.consumed.every((l) => l.inputLotCode === 'not recorded'))).toBe(true);
  });

  it('periods are listed from every record type and filtered per period', () => {
    expect(periodsIn(bundle)).toEqual([PERIOD]);
    const p = bundleForPeriod(bundle, PERIOD);
    expect(p.sowings).toHaveLength(1);
    expect(p.receipts).toHaveLength(1);
    expect(bundleForPeriod(bundle, '2026-08').sowings).toHaveLength(0);
  });

  it('receipt lines are costed against the crop plan standard', () => {
    const c = costReceiptLines(receiptDoc(1.04).lines, cropPlan);
    const std = c.reduce((s, x) => s + x.standardCents, 0);
    const inv = c.reduce((s, x) => s + x.invoiceCents, 0);
    expect(inv / std).toBeCloseTo(1.04, 2);
    const unknown = costReceiptLines([{ input: 'Saffron', qty: 1, unit: 'lb', lotCode: 'x', unitPriceCents: 500000 }], cropPlan);
    expect(unknown[0].standardUnitPriceCents).toBeNull();
    expect(unknown[0].purchasePriceVarianceCents).toBe(0);
  });
});

describe('actuals — posting a period', () => {
  const posted = postActuals(bundle);
  const p = posted.periods[0];

  it('balances and posts one period', () => {
    expect(posted.balanced).toBe(true);
    expect(posted.periods).toHaveLength(1);
    expect(p.period).toBe(PERIOD);
  });

  it('receives raw materials at standard with the invoice premium as purchase price variance', () => {
    expect(net(posted.entries, '5110')).toBe(p.purchasePriceVarianceCents);
    expect(p.purchasePriceVarianceCents).toBeGreaterThan(0);
    const rcpt = posted.entries.find((e) => e.id.startsWith('RCPT-'))!;
    expect(rcpt.lines.some((l) => l.accountCode === '1410' && l.debitCents > 0)).toBe(true);
    // Roadmap K2: the receipt waits in goods received not invoiced until the supplier's bill clears it.
    expect(rcpt.lines.some((l) => l.accountCode === '2015' && l.creditCents > 0)).toBe(true);
    expect(rcpt.lines.some((l) => l.accountCode === '2010')).toBe(false);
  });

  it('the sowing posts without its own receipt or shipment', () => {
    const ids = posted.entries.map((e) => e.id);
    expect(ids.some((id) => id.endsWith('-RECV') && !id.endsWith('-PKG-RECV'))).toBe(false);
    expect(ids.some((id) => id.endsWith('-INV'))).toBe(false);
    // No packaging cost is entered on the default library, so no zero-dollar
    // packaging receipt posts.
    expect(ids.some((id) => id.endsWith('-PKG-RECV'))).toBe(false);
    expect(ids.some((id) => id.includes('-SHIP'))).toBe(false);
    expect(ids.some((id) => id.endsWith('-ISSUE-HOT'))).toBe(true);
    expect(ids.some((id) => id.endsWith('-FG'))).toBe(true);
  });

  it('a distribution relieves finished goods at the period standard per unit and books revenue', () => {
    expect(p.standardCostPerUnitCents).toBeGreaterThan(0);
    const dlv = posted.entries.find((e) => e.id.startsWith('DLV-'))!;
    const cogs = dlv.lines.find((l) => l.accountCode === '5010')!.debitCents;
    expect(cogs).toBe(Math.round(sowingSize * p.standardCostPerUnitCents));
    expect(dlv.lines.find((l) => l.accountCode === '4010')!.creditCents).toBe(sowingSize * 1000);
    // Everything produced was distributed, so finished goods is flat.
    expect(net(posted.entries, '1450')).toBe(0);
    expect(net(posted.entries, '1430')).toBe(0);
    expect(net(posted.entries, '1440')).toBe(0);
  });

  it('bills settle the accrued overhead or post to G&A, and stay payable until paid', () => {
    expect(net(posted.entries, '7080')).toBe(600_000);
    // Lease + utilities settle the month-end accrual, not overhead control directly.
    const settled = posted.entries.filter((e) => e.id.startsWith('BILL-')).flatMap((e) => e.lines).filter((l) => l.accountCode === '2160').reduce((s, l) => s + l.debitCents, 0);
    expect(settled).toBe(1_650_000);
    const direct = posted.entries.filter((e) => e.id.startsWith('BILL-')).flatMap((e) => e.lines).filter((l) => l.accountCode === '5180').length;
    expect(direct).toBe(0);
    // Only the utilities bill was paid.
    expect(net(posted.entries, '1010')).toBe(-450_000);
    expect(net(posted.entries, '2010')).toBeLessThan(0);
  });

  it('closes overhead applied against incurred; the difference is the volume variance', () => {
    expect(net(posted.entries, '5180')).toBe(0);
    expect(net(posted.entries, '5190')).toBe(0);
    expect(net(posted.entries, '5160')).toBe(p.overhead.volumeVarianceCents);
    expect(p.overhead.volumeVarianceCents).toBe(p.overhead.incurredCents - p.overhead.appliedCents);
    // A bare call absorbs on the production it posts (Roadmap N9): normal capacity is this month's
    // units annualised net of planned downtime, so the month over-absorbs by the downtime share.
    const down = resolveScenarioInputs().assumptions.overhead.plannedMaintenanceDownRate.value;
    expect(p.overhead.appliedCents).toBeCloseTo(p.overhead.incurredCents / (1 - down), -2);
    expect(p.overhead.volumeVarianceCents).toBeLessThanOrEqual(0);
  });

  it('J2: overhead incurred is the accrued budget plus depreciation, whatever the bills say', () => {
    const budget = manufacturingOverheadBudget();
    const expected = Math.round((budget.lease / 12) * 100) + Math.round((budget.utilities / 12) * 100) + Math.round((budget.depreciation / 12) * 100);
    expect(p.overhead.incurredCents).toBe(expected);
    expect(p.overhead.budgetCents).toBe(Math.round((budget.lease / 12) * 100) + Math.round((budget.utilities / 12) * 100));
    expect(p.overhead.billedCents).toBe(1_650_000);
  });

  it('J2: a bill at budget leaves no spending variance and no accrued balance', () => {
    expect(p.overhead.spendingVarianceCents).toBe(0);
    expect(p.overhead.accruedUnbilledCents).toBe(0);
    expect(net(posted.entries, '5150')).toBe(0);
    expect(net(posted.entries, '2160')).toBe(0);
  });

  it('J2: a bill above budget is a spending variance charge, trued against the accrual', () => {
    const over = postActuals({ ...bundle, bills: [billDoc('lease', 1_300_000), billDoc('utilities', 450_000)] });
    const q = over.periods[0]!;
    expect(q.overhead.spendingVarianceCents).toBe(100_000);
    expect(net(over.entries, '5150')).toBe(100_000);
    expect(net(over.entries, '2160')).toBe(0);
    expect(q.overhead.incurredCents).toBe(p.overhead.incurredCents); // the budget, unchanged
    expect(over.balanced).toBe(true);
  });

  it('J2: a category with no bill stays accrued as a liability, with a note, and no variance', () => {
    const missing = postActuals({ ...bundle, bills: [billDoc('lease', 1_200_000)] });
    const q = missing.periods[0]!;
    expect(q.overhead.accruedUnbilledCents).toBe(450_000);
    expect(q.overhead.spendingVarianceCents).toBe(0);
    expect(net(missing.entries, '2160')).toBe(-450_000); // credit balance: accrued, unbilled
    expect(q.notes.some((n) => n.startsWith('Utilities for 2026-09: no bill on file'))).toBe(true);
    expect(missing.balanced).toBe(true);
  });

  it('reports the sowing that did not record its input lots as traceability gaps, not as fills', () => {
    expect(p.traceabilityGaps).toBeGreaterThan(0);
    expect(p.massBalanceFailures).toEqual([]);
  });

  it('a retail distribution carries the marketplace commission', () => {
    const retail = postActuals({ ...bundle, distributions: [distributionDoc(100, 3)] });
    expect(net(retail.entries, '7910')).toBe(Math.round(100 * 1600 * 0.25));
  });

  it('an empty bundle posts nothing', () => {
    const empty = postActuals({ sowings: [], receipts: [], distributions: [], bills: [] });
    expect(empty.entries).toEqual([]);
    expect(empty.periods).toEqual([]);
  });

  it('a distribution with no sowing before it relieves the opening standard it is given, zero by default (Roadmap N6)', () => {
    const only = postActuals({ sowings: [], receipts: [], distributions: [distributionDoc(50)], bills: [] });
    expect(only.periods[0].standardCostPerUnitCents).toBe(0);
    const given = postActuals({ sowings: [], receipts: [], distributions: [distributionDoc(50)], bills: [] }, undefined, undefined, { openingStandardCostPerUnitCents: 312 });
    expect(given.periods[0].standardCostPerUnitCents).toBe(312);
  });
});

describe('actuals — the Actual ledger by period (Roadmap N6)', () => {
  const ledger = postActualLedger(bundle, resolveScenarioInputs(), `${PERIOD}-28`);
  const s = ledger.months.find((m) => m.label === PERIOD)!;

  it('classifies the period income statement and balances', () => {
    expect(ledger.balanced).toBe(true);
    expect(s.balanced && s.cashFlowTies).toBe(true);
    expect(s.incomeStatement.revenueCents).toBe(sowingSize * 1000);
    expect(s.incomeStatement.manufacturingVariances.some((r) => r.code === '5110')).toBe(true);
  });

  it('the position is cumulative and balances', () => {
    const bs = s.balanceSheet;
    expect(bs.currentAssetsCents + bs.netFixedAssetsCents).toBe(bs.totalAssetsCents);
    expect(bs.totalAssetsCents).toBe(bs.totalLiabilitiesCents + bs.totalEquityCents);
    expect(s.cashFlow.closingCashCents).toBe(-450_000);
    // Receivables stay open — nothing recorded a collection.
    expect(bs.currentAssets.find((r) => r.code === '1300')?.cents).toBe(sowingSize * 1000);
    expect(periodWorkingCapital(ledger.entries, PERIOD, 0, false).receivableCents).toBe(sowingSize * 1000);
  });

  it('with nothing on record every figure is zero for the period named', () => {
    const none = postActualLedger({ sowings: [], receipts: [], distributions: [], bills: [] }, resolveScenarioInputs(), '2026-08-15');
    expect(none.empty).toBe(true);
    expect(none.months.map((m) => m.label)).toEqual(['2026-08']);
    expect(none.months[0]!.incomeStatement.revenueCents).toBe(0);
    expect(none.months[0]!.cashFlow.closingCashCents).toBe(0);
  });
});

describe('actuals — finished lots for a distribution (Roadmap I4)', () => {
  it('lists every output lot on closed sowing records, newest production date first, skipping blank codes', () => {
    const older = sowingDoc({ id: 'b1000000-0000-0000-0000-000000000002', productionDate: '2026-09-10', sowingId: 'B-260910-01' });
    const newer = sowingDoc();
    newer.components[0] = { ...newer.components[0], outputLotCode: '   ' };
    const lots = finishedLotsOf([older, newer]);
    expect(lots.length).toBe(older.components.length + newer.components.length - 1);
    expect(lots[0].productionDate).toBe(DATE);
    expect(lots.every((l) => l.cropPlanCode === cropPlan.code && l.lotCode.trim().length > 0)).toBe(true);
    expect(lots.at(-1)!.productionDate).toBe('2026-09-10');
  });
});

describe('actuals — crew hours by person (Roadmap I3)', () => {
  it('sums hours and weights the rate by hours', () => {
    const t = laborFromCrew([{ name: 'A', hours: 6, ratePerHour: 20 }, { name: 'B', hours: 2, ratePerHour: 40 }]);
    expect(t.hours).toBe(8);
    expect(t.rate).toBeCloseTo(25, 6);
  });
  it('a partly priced crew has hours but no rate; an empty crew has neither; zero-hour lines are ignored', () => {
    expect(laborFromCrew([{ name: 'A', hours: 6, ratePerHour: 20 }, { name: 'B', hours: 2, ratePerHour: null }])).toEqual({ hours: 8, rate: null });
    expect(laborFromCrew([])).toEqual({ hours: null, rate: null });
    expect(laborFromCrew([{ name: 'A', hours: 0, ratePerHour: null }, { name: 'B', hours: 3, ratePerHour: 30 }])).toEqual({ hours: 3, rate: 30 });
  });
});

describe('actuals — the mass balance gate', () => {
  it('a sowing with unaccounted weight does not balance and would be refused at close', () => {
    const doc = sowingDoc();
    doc.components[0].packedLb -= 30;
    const mb = massBalance(toSowingExecution(doc));
    expect(mb.balanced).toBe(false);
  });

  it('actual labor on the record produces labor variances in the period', () => {
    const doc = sowingDoc({ actualLaborHours: 40, actualLaborRate: assumptions.labor.blendedLoadedWage.value + 2 });
    const posted = postActuals({ ...bundle, sowings: [doc] });
    expect(Math.abs(net(posted.entries, '5130'))).toBeGreaterThan(0);
    expect(posted.balanced).toBe(true);
  });
});
