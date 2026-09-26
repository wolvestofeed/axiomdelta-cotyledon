import { describe, it, expect } from 'vitest';
import { cropPlan, phases } from '@/data/plan-data';
import { componentCosting, deriveCapacity } from '@/engine';
import {
  addMonths,
  agingBucket,
  agingReport,
  amortizationSchedule,
  billBalances,
  billPaymentRefusal,
  currentUnitOfDebt,
  dailyBillOutstandingShare,
  daysOutstanding,
  debtServiceBetween,
  dueOn,
  invoiceBalances,
  invoiceNumberFor,
  monthlyInvoiceOutstandingShare,
  nextInvoiceSequence,
  routeCompletion,
  threeWayMatch,
  unbilledReceipts,
  type InvoiceDoc,
  type SupplierBillDoc,
} from '@/engine/working-capital';
import { splitLoadedLaborCents, loadLaborFromWagesCents } from '@/engine/comp';
import { standardSowingRecordPrefill, type ActualsBundle, type DistributionDoc, type ReceiptDoc } from '@/engine/actuals';
import { postActuals, postActualLedger, periodWorkingCapital, actualCurrentUnitOfDebtCents } from '@/engine/actuals-ledger';
import { resolveScenarioInputs } from '@/engine/scenario';
import { pmt } from '@/engine/fixed-costs';

const net = (entries: { lines: { accountCode: string; debitCents: number; creditCents: number }[] }[], code: string) =>
  entries.flatMap((e) => e.lines).filter((l) => l.accountCode === code).reduce((s, l) => s + l.debitCents - l.creditCents, 0);

describe('K3 — terms, due dates, invoice numbers', () => {
  it('a due date is the document date plus the terms days; no terms, no due date', () => {
    expect(dueOn('2027-03-31', 'net_30')).toBe('2027-04-30');
    expect(dueOn('2027-03-31', 'due_on_receipt')).toBe('2027-03-31');
    expect(dueOn('2027-03-31', 'net_90')).toBe('2027-06-29');
    expect(dueOn('2027-03-31', null)).toBeNull();
  });

  it('invoice numbers are AMK-INV-YYYYMMDD-NN, sequenced per opening date', () => {
    expect(invoiceNumberFor('2027-02-03', 1)).toBe('AMK-INV-20270203-01');
    expect(nextInvoiceSequence('2027-02-03', ['AMK-INV-20270203-01', 'AMK-INV-20270203-02', 'AMK-INV-20270204-01'])).toBe(3);
    expect(nextInvoiceSequence('2027-02-05', [])).toBe(1);
  });

  it('months add with the day clamped to the month', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2027-12-15', 1)).toBe('2028-01-15');
  });

  it('aging counts calendar days past the due date into the four groups', () => {
    expect(agingBucket('2027-05-10', '2027-05-10')).toBe('not_due');
    expect(agingBucket('2027-05-10', '2027-05-11')).toBe('d0_30');
    expect(agingBucket('2027-05-10', '2027-06-09')).toBe('d0_30');
    expect(agingBucket('2027-05-10', '2027-06-10')).toBe('d31_60');
    expect(agingBucket('2027-05-10', '2027-08-08')).toBe('d61_90');
    expect(agingBucket('2027-05-10', '2027-08-09')).toBe('d90_plus');
    expect(agingBucket(null, '2027-08-09')).toBe('no_terms');
    const r = agingReport(
      [
        { id: 'a', party: 'A', document: '1', date: '2027-01-31', dueOn: '2027-03-02', amountCents: 1000, openCents: 1000 },
        { id: 'b', party: 'A', document: '2', date: '2027-03-31', dueOn: '2027-04-30', amountCents: 500, openCents: 200 },
        { id: 'c', party: 'B', document: '3', date: '2027-03-31', dueOn: null, amountCents: 300, openCents: 300 },
        { id: 'd', party: 'B', document: '4', date: '2027-03-31', dueOn: null, amountCents: 300, openCents: 0 },
      ],
      '2027-04-15',
    );
    expect(r.totalCents).toBe(1500);
    expect(r.rows[0]!.party).toBe('A');
    expect(r.rows[0]!.buckets.d31_60).toBe(1000);
    expect(r.rows[0]!.buckets.not_due).toBe(200);
    expect(r.totals.no_terms).toBe(300);
  });

  it('days outstanding are the period-end balance over the flow times the calendar days', () => {
    expect(daysOutstanding(50_000, 150_000, 30)).toBeCloseTo(10, 9);
    expect(daysOutstanding(50_000, 0, 30)).toBeNull();
  });
});

describe('K4 — the loan schedule and the current unit', () => {
  const s = amortizationSchedule(100_000, 0.09, 60, '2027-01-01');

  it('amortises to zero with the level payment, first payment in the start month', () => {
    expect(s).toHaveLength(60);
    expect(s[0]!.date).toBe('2027-01-31');
    expect(s[0]!.payment).toBeCloseTo(pmt(100_000, 0.09, 60), 6);
    expect(s.at(-1)!.balance).toBeCloseTo(0, 6);
    expect(s.reduce((t, p) => t + p.principal, 0)).toBeCloseTo(100_000, 6);
  });

  it('the current unit is the principal due in the twelve months after the date', () => {
    const due2028 = debtServiceBetween(s, '2028-01-01', '2028-12-31').principal;
    expect(currentUnitOfDebt([s], '2027-12-31')).toBeCloseTo(due2028, 6);
    expect(currentUnitOfDebt([s], '2031-12-31')).toBeCloseTo(0, 6);
  });
});

describe('K5 — loaded labor split into its liabilities', () => {
  it('the parts sum to the loaded total exactly, wages take the residual', () => {
    const x = splitLoadedLaborCents(122_000, 0.22);
    expect(x.wagesCents + x.payrollTaxesCents + x.workersCompCents + x.benefitsCents).toBe(122_000);
    expect(x.wagesCents).toBe(100_000);
    expect(x.payrollTaxesCents).toBe(9_750); // FICA 7.65 + FUTA 0.6 + SUTA 1.5
    expect(x.workersCompCents).toBe(3_250);
    expect(x.benefitsCents).toBe(9_000); // 22% − 13% statutory
  });

  it('built up from wages, the burden is added', () => {
    const x = loadLaborFromWagesCents(100_000, 0.22);
    expect(x.loadedCents).toBe(122_000);
  });

  it('a burden below the statutory rates carries no benefits and scales the statutory parts', () => {
    const x = splitLoadedLaborCents(110_000, 0.1);
    expect(x.benefitsCents).toBe(0);
    expect(x.wagesCents + x.payrollTaxesCents + x.workersCompCents).toBe(110_000);
  });
});

// ── Fixtures: distributions, receipts, bills ─────────────────────────────────

const distribution = (id: string, date: string, phase: number, subscriberId: string | null, units = 100, invoiceId: string | null = null): DistributionDoc => ({
  id,
  distributedOn: date,
  phase,
  pickupPointId: null,
  pickupPointName: 'Pickup point',
  units,
  pricePerUnitCents: Math.round(phases[phase - 1]!.pricePerUnit * 100),
  lotCodes: [],
  distributedBy: null,
  subscriberId,
  invoiceId,
  notes: null,
});

const C1 = 'c1000000-0000-0000-0000-000000000001';
const C2 = 'c2000000-0000-0000-0000-000000000002';

describe('K1 — a completed route adds its distributions to the monthly invoice', () => {
  const distributions = [
    distribution('d1', '2027-02-03', 1, C1),
    distribution('d2', '2027-02-03', 1, C1),
    distribution('d3', '2027-02-03', 2, C2),
    distribution('d4', '2027-02-03', 3, null),
    distribution('d5', '2027-02-03', 1, null),
    distribution('d6', '2027-02-03', 1, C1, 100, 'already'),
    distribution('d7', '2027-02-04', 1, C1),
  ];

  it('groups by subscriber and month, skips paid-at-order, invoiced, other dates and no-subscriber distributions', () => {
    const r = routeCompletion(distributions, '2027-02-03');
    expect(r.groups).toHaveLength(2);
    const g1 = r.groups.find((g) => g.subscriberId === C1)!;
    expect(g1.distributionIds).toEqual(['d1', 'd2']);
    expect(g1.period).toBe('2027-02');
    expect(g1.amountCents).toBe(4_000_00);
    expect(r.skipped.map((s) => s.distributionId)).toEqual(['d5']);
  });

  it('one subscriber only when named', () => {
    expect(routeCompletion(distributions, '2027-02-03', C2).groups.map((g) => g.subscriberId)).toEqual([C2]);
  });

  it('an invoice bills the distributions that name it; payments applied reduce what is open', () => {
    const inv: InvoiceDoc = { id: 'i1', invoiceNumber: 'AMK-INV-20270203-01', subscriberId: C1, subscriberName: 'Test Subscriber #1', period: '2027-02', status: 'issued', openedOn: '2027-02-03', paymentTerms: 'net_30', issuedOn: '2027-02-28', dueOn: '2027-03-30', issuedBy: null, notes: null };
    const on = [distribution('d1', '2027-02-03', 1, C1, 100, 'i1'), distribution('d7', '2027-02-04', 1, C1, 50, 'i1')];
    const [b] = invoiceBalances([inv], on, [{ id: 'p', subscriberId: C1, subscriberName: 'x', receivedOn: '2027-03-15', amountCents: 60_000, method: null, reference: null, applications: [{ documentId: 'i1', amountCents: 60_000 }], notes: null }]);
    expect(b!.amountCents).toBe(300_000);
    expect(b!.openCents).toBe(240_000);
    expect(b!.lastDistributedOn).toBe('2027-02-04');
  });
});

const PO = { id: 'po1', poNumber: 'AMK-PO-20270201-01', lines: [{ input: 'Pinto beans', qty: 50, unit: 'lb', unitPriceCents: 150 }, { input: 'Brown rice', qty: 40, unit: 'lb', unitPriceCents: 120 }] };

const receipt = (id: string, lines: ReceiptDoc['lines'], poId: string | null = 'po1'): ReceiptDoc => ({
  id,
  poId,
  supplierId: 'sup-1',
  supplierName: 'Test grower',
  receivedOn: '2027-02-02',
  invoiceNumber: null,
  invoiceTotalCents: null,
  lines,
  receivedBy: null,
  notes: null,
});

const bill = (lines: SupplierBillDoc['lines'], receiptIds = ['r1']): SupplierBillDoc => ({
  id: 'b1',
  supplierId: 'sup-1',
  supplierName: 'Test grower',
  billNumber: 'G-100',
  billDate: '2027-02-05',
  paymentTerms: 'net_30',
  receiptIds,
  lines,
  notes: null,
});

describe('K2 — the three-way match', () => {
  const exact = receipt('r1', [
    { input: 'Pinto beans', qty: 50, unit: 'lb', lotCode: 'L1', unitPriceCents: 150, poQty: 50, poUnitPriceCents: 150 },
    { input: 'Brown rice', qty: 40, unit: 'lb', lotCode: 'L2', unitPriceCents: 120, poQty: 40, poUnitPriceCents: 120 },
  ]);

  it('a bill equal to what was received, received as ordered, matches', () => {
    const m = threeWayMatch(bill([{ input: 'Pinto beans', qty: 50, unit: 'lb', unitPriceCents: 150 }, { input: 'Brown rice', qty: 40, unit: 'lb', unitPriceCents: 120 }]), [exact], [PO]);
    expect(m.status).toBe('matched');
    expect(m.issues).toEqual([]);
    expect(m.differenceCents).toBe(0);
    expect(m.receivedCents).toBe(50 * 150 + 40 * 120);
  });

  it('received short with an override reason, billed for what was received: matched', () => {
    const short = receipt('r1', [
      { input: 'Pinto beans', qty: 45, unit: 'lb', lotCode: 'L1', unitPriceCents: 150, poQty: 50, poUnitPriceCents: 150, overrideReason: 'One case short on the truck' },
      { input: 'Brown rice', qty: 40, unit: 'lb', lotCode: 'L2', unitPriceCents: 120, poQty: 40, poUnitPriceCents: 120 },
    ]);
    const m = threeWayMatch(bill([{ input: 'Pinto beans', qty: 45, unit: 'lb', unitPriceCents: 150 }, { input: 'Brown rice', qty: 40, unit: 'lb', unitPriceCents: 120 }]), [short], [PO]);
    expect(m.status).toBe('matched');
  });

  it('received short with no reason is an issue even when the bill agrees', () => {
    const short = receipt('r1', [{ input: 'Pinto beans', qty: 45, unit: 'lb', lotCode: 'L1', unitPriceCents: 150, poQty: 50, poUnitPriceCents: 150 }]);
    const m = threeWayMatch(bill([{ input: 'Pinto beans', qty: 45, unit: 'lb', unitPriceCents: 150 }]), [short], [PO]);
    expect(m.status).toBe('mismatched');
    expect(m.issues[0]).toContain('no override reason');
  });

  it('billed above the price received is mismatched, with the difference', () => {
    const m = threeWayMatch(bill([{ input: 'Pinto beans', qty: 50, unit: 'lb', unitPriceCents: 160 }, { input: 'Brown rice', qty: 40, unit: 'lb', unitPriceCents: 120 }]), [exact], [PO]);
    expect(m.status).toBe('mismatched');
    expect(m.differenceCents).toBe(500);
    expect(m.issues.some((i) => i.startsWith('Pinto beans: billed $80.00 against $75.00'))).toBe(true);
  });

  it('a received line not billed, a billed line not received, and a rejected line all count', () => {
    const withRejected = receipt('r1', [
      ...exact.lines,
      { input: 'Cheddar', qty: 10, unit: 'lb', lotCode: 'L3', unitPriceCents: 400, condition: 'rejected' },
    ]);
    const m = threeWayMatch(bill([{ input: 'Pinto beans', qty: 50, unit: 'lb', unitPriceCents: 150 }, { input: 'Cheddar', qty: 10, unit: 'lb', unitPriceCents: 400 }]), [withRejected], [PO]);
    expect(m.status).toBe('mismatched');
    expect(m.issues.some((i) => i.startsWith('Brown rice: received'))).toBe(true);
    expect(m.issues.some((i) => i.startsWith('Cheddar: billed'))).toBe(true);
  });

  it('a mismatched bill is refused payment; a matched one is paid up to what is open', () => {
    const bad = billBalances([bill([{ input: 'Pinto beans', qty: 50, unit: 'lb', unitPriceCents: 160 }])], [exact], [PO], [])[0]!;
    expect(billPaymentRefusal(bad, 100)).toContain('not paid until rectified');
    const good = billBalances([bill([{ input: 'Pinto beans', qty: 50, unit: 'lb', unitPriceCents: 150 }, { input: 'Brown rice', qty: 40, unit: 'lb', unitPriceCents: 120 }])], [exact], [PO], [])[0]!;
    expect(good.dueOn).toBe('2027-03-07');
    expect(billPaymentRefusal(good, good.openCents)).toBeNull();
    expect(billPaymentRefusal(good, good.openCents + 1)).toContain('open');
  });

  it('a receipt no bill names is goods received, not invoiced', () => {
    expect(unbilledReceipts([exact, receipt('r2', exact.lines)], [bill([], ['r1'])]).map((r) => r.id)).toEqual(['r2']);
  });
});

describe('K3 — the forecast year’s outstanding shares', () => {
  it('monthly invoices collected on the due date leave December open on Net 15 and Net 30', () => {
    expect(monthlyInvoiceOutstandingShare(2027, 'due_on_receipt')).toBe(0);
    expect(monthlyInvoiceOutstandingShare(2027, 'net_15')).toBeCloseTo(1 / 12, 12);
    expect(monthlyInvoiceOutstandingShare(2027, 'net_30')).toBeCloseTo(1 / 12, 12);
  });
  it('bills paid on the due date leave the last terms-days of purchases open', () => {
    expect(dailyBillOutstandingShare(2027, 'net_60')).toBeCloseTo(60 / 365, 12);
    expect(dailyBillOutstandingShare(2027, 'due_on_receipt')).toBe(0);
  });
});

describe('Phase K — actuals', () => {
  const sowingSize = deriveCapacity(cropPlan).sowingSize;
  const k = componentCosting(cropPlan);
  const lines = k.flatMap((c) => c.lines.map((l) => ({ input: l.name, qty: (l.seedQtyPerSowing * sowingSize) / 100, unit: l.unit, lotCode: 'X', unitPriceCents: Math.round(l.seedUnitCost * 100) })));
  const r1: ReceiptDoc = { ...receipt('r1', lines, null), receivedOn: '2027-02-02' };
  const pre = standardSowingRecordPrefill('2027-02-03', 1, sowingSize, cropPlan);
  const base: ActualsBundle = {
    openingBalances: [{ id: 'o1', asOf: '2027-01-01', ownerEquityCents: 200_000_00, fixedAssetsCents: 500_000_00, longTermDebtCents: 500_000_00, notes: null }],
    sowings: [{ id: 'b1', closedAt: null, ...pre, closedBy: 'R' }],
    receipts: [r1],
    distributions: [distribution('d1', '2027-02-04', 1, C1, sowingSize, 'i1'), distribution('d2', '2027-02-04', 3, null, 10)],
    bills: [],
    invoices: [{ id: 'i1', invoiceNumber: 'AMK-INV-20270204-01', subscriberId: C1, subscriberName: 'x', period: '2027-02', status: 'issued', openedOn: '2027-02-04', paymentTerms: 'net_30', issuedOn: '2027-02-28', dueOn: '2027-03-30', issuedBy: null, notes: null }],
    subscriberPayments: [],
    supplierBills: [],
    supplierPayments: [],
  };

  /** The Actual ledger's month and its working capital (Roadmap N6). */
  const monthOf = (bundle: ActualsBundle, period: string) => {
    const inputs = resolveScenarioInputs();
    const ledger = postActualLedger(bundle, inputs, `${period}-28`);
    const m = ledger.months.find((x) => x.label === period)!;
    const current = actualCurrentUnitOfDebtCents(bundle, inputs, m.to);
    return { ledger, m, wc: periodWorkingCapital(ledger.entries, period, current, (bundle.openingBalances ?? []).length > 0) };
  };

  it('the opening balance posts equity, the fit-out and its financing; cash is equity + debt − fit-out', () => {
    const posted = postActuals(base);
    expect(posted.balanced).toBe(true);
    const { m, wc } = monthOf(base, '2027-01');
    expect(net(posted.entries, '3100')).toBe(-200_000_00);
    expect(m.cashFlow.closingCashCents).toBe(200_000_00);
    expect(wc.openingRecorded).toBe(true);
    expect(wc.currentUnitOfDebtCents).toBeGreaterThan(0);
    expect(m.balanceSheet.currentUnitOfLongTermDebtCents).toBe(wc.currentUnitOfDebtCents);
  });

  it('a receipt waits in GR/IR; the bill clears it to payables; a supplier payment clears payables', () => {
    const noBill = postActuals(base);
    expect(net(noBill.entries, '2015')).toBe(-lines.reduce((t, l) => t + Math.round(l.qty * l.unitPriceCents), 0));
    const billLines = lines.map((l) => ({ input: l.input, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents }));
    const withBill = postActuals({ ...base, supplierBills: [{ ...bill(billLines), billDate: '2027-02-06' }] });
    expect(net(withBill.entries, '2015')).toBe(0);
    const billed = billLines.reduce((t, l) => t + Math.round(l.qty * l.unitPriceCents), 0);
    expect(net(withBill.entries, '2010')).toBeLessThanOrEqual(-billed);
    const paid = postActuals({ ...base, supplierBills: [{ ...bill(billLines), billDate: '2027-02-06' }], supplierPayments: [{ id: 'sp', supplierId: 'sup-1', supplierName: 'x', paidOn: '2027-02-20', amountCents: billed, method: null, reference: null, applications: [{ documentId: 'b1', amountCents: billed }], notes: null }] });
    expect(net(paid.entries, '2010') - net(withBill.entries, '2010')).toBe(billed);
    expect(paid.balanced).toBe(true);
  });

  it('a bill above what was received posts the difference to PPV', () => {
    const billLines = lines.map((l) => ({ input: l.input, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents + 10 }));
    const p = postActuals({ ...base, supplierBills: [{ ...bill(billLines), billDate: '2027-02-06' }] });
    const feb = p.periods.find((x) => x.period === '2027-02')!;
    expect(feb.payables.billDifferenceCents).toBeGreaterThan(0);
    expect(net(p.entries, '2015')).toBe(0);
  });

  it('invoiced distributions go to receivables, retail and wholesale to processor clearing; a payment collects', () => {
    const { wc } = monthOf(base, '2027-02');
    expect(wc.receivableCents).toBe(sowingSize * 2000);
    expect(wc.processorClearingCents).toBe(Math.round(10 * 2500 * 0.75));
    expect(wc.daysToCollect).toBeCloseTo(28, 6);
    const paid = monthOf({ ...base, subscriberPayments: [{ id: 'cp', subscriberId: C1, subscriberName: 'x', receivedOn: '2027-02-25', amountCents: sowingSize * 2000, method: null, reference: null, applications: [{ documentId: 'i1', amountCents: sowingSize * 2000 }], notes: null }] }, '2027-02');
    expect(paid.wc.receivableCents).toBe(0);
    expect(paid.ledger.balanced).toBe(true);
  });

  it('rejected receipt lines are not received into stock or GR/IR', () => {
    const rej: ReceiptDoc = { ...r1, lines: [...r1.lines, { input: 'Cheddar', qty: 10, unit: 'lb', lotCode: 'R', unitPriceCents: 500, condition: 'rejected' }] };
    expect(net(postActuals({ ...base, receipts: [rej] }).entries, '2015')).toBe(net(postActuals(base).entries, '2015'));
  });
});
