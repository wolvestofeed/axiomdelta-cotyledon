import { describe, it, expect } from 'vitest';
import { recipe as seed } from '../src/app/(muse)/muse/_data/plan-data';
import { purchaseOrderForRun } from '../src/app/(muse)/muse/_engine';
import type { BatchRecordDoc, ReceiptDoc } from '../src/app/(muse)/muse/_engine/actuals';
import { rawStockOnHand, rawLotsByUseBy, openOrders, receiptCoverage, netRequirements, netToRequirementLines, orderByDate, type PoLike } from '../src/app/(muse)/muse/_engine/net-requirements';

const receipt = (id: string, on: string, lines: { ingredient: string; qty: number; lotCode?: string; price?: number; useBy?: string; condition?: 'accepted' | 'accepted_with_note' | 'rejected' }[], poId: string | null = null): ReceiptDoc => ({
  id, poId, supplierId: null, supplierName: null, receivedOn: on, invoiceNumber: null, invoiceTotalCents: null,
  lines: lines.map((l) => ({ ingredient: l.ingredient, qty: l.qty, unit: 'lb', lotCode: l.lotCode ?? 'not recorded', unitPriceCents: l.price ?? 100, ...(l.useBy ? { useBy: l.useBy } : {}), ...(l.condition ? { condition: l.condition } : {}) })),
  receivedBy: null, notes: null,
});
const batch = (id: string, on: string, consumed: { ingredient: string; qty: number; lot?: string }[]): BatchRecordDoc => ({
  id, batchId: id, recipeCode: 'AMK-E-001', productionDate: on, standardVersion: 'v', plannedPortions: 0, goodPortions: 0, batchesRun: 1, mealsProduced: null,
  components: [{ component: 'c', outputLotCode: 'o', consumed: consumed.map((c) => ({ ingredient: c.ingredient, inputLotCode: c.lot ?? 'not recorded', qty: c.qty, unit: 'lb', onFoodTraceabilityList: false })), apIssuedLb: 0, cookedLb: null, chilledLb: null, packedLb: 0, scrap: [] }],
  actualLaborHours: null, actualLaborRate: null, closedBy: null, closedAt: null, notes: null,
});
const BEEF = 'Ground beef, 85/15';
const BEANS = 'Pinto beans, dry';

describe('raw stock on hand', () => {
  it('receipts are lots; issues draw the named lot first, else the oldest; unmatched issues are reported', () => {
    const s = rawStockOnHand({
      receipts: [receipt('r1', '2026-09-01', [{ ingredient: BEEF, qty: 50, lotCode: 'L1' }]), receipt('r2', '2026-09-05', [{ ingredient: BEEF, qty: 50, lotCode: 'L2' }, { ingredient: BEANS, qty: 25 }])],
      batches: [batch('b1', '2026-09-06', [{ ingredient: BEEF, qty: 30, lot: 'L2' }]), batch('b2', '2026-09-07', [{ ingredient: BEEF, qty: 40 }, { ingredient: 'Onion, yellow', qty: 2 }])],
      asOf: '2026-09-10',
    });
    expect(s.byIngredient[BEEF].onHand).toBe(30);
    expect(s.lots.find((l) => l.lotCode === 'L1')?.remaining).toBe(10);
    expect(s.lots.find((l) => l.lotCode === 'L2')?.remaining).toBe(20);
    expect(s.byIngredient[BEANS].onHand).toBe(25);
    expect(s.byIngredient[BEANS].valueCents).toBe(2500);
    expect(s.unmatchedIssues['Onion, yellow']).toBe(2);
  });

  it('a receipt or an issue after the as-of date is not counted', () => {
    const s = rawStockOnHand({ receipts: [receipt('r', '2026-09-12', [{ ingredient: BEEF, qty: 10 }])], batches: [], asOf: '2026-09-10' });
    expect(s.byIngredient[BEEF]).toBeUndefined();
  });

  it('a rejected receipt line is on the record and never in stock (Roadmap I2)', () => {
    const s = rawStockOnHand({
      receipts: [receipt('r', '2026-09-01', [{ ingredient: BEEF, qty: 50, lotCode: 'OK', condition: 'accepted_with_note' }, { ingredient: BEEF, qty: 20, lotCode: 'BAD', condition: 'rejected' }])],
      batches: [],
      asOf: '2026-09-10',
    });
    expect(s.byIngredient[BEEF].onHand).toBe(50);
    expect(s.lots.map((l) => l.lotCode)).toEqual(['OK']);
  });
});

describe('raw lots by use-by (Roadmap I5)', () => {
  it('orders lots on hand by the date on the case, earliest first, undated lots last by receipt date', () => {
    const s = rawStockOnHand({
      receipts: [
        receipt('r1', '2026-09-01', [{ ingredient: BEEF, qty: 10, lotCode: 'LATE', useBy: '2026-09-20' }, { ingredient: BEANS, qty: 10, lotCode: 'UNDATED-OLD' }]),
        receipt('r2', '2026-09-03', [{ ingredient: BEEF, qty: 10, lotCode: 'SOON', useBy: '2026-09-08' }, { ingredient: BEANS, qty: 10, lotCode: 'UNDATED-NEW' }]),
        receipt('r3', '2026-09-04', [{ ingredient: BEEF, qty: 10, lotCode: 'GONE', useBy: '2026-09-12' }]),
      ],
      batches: [batch('b1', '2026-09-05', [{ ingredient: BEEF, qty: 10, lot: 'GONE' }])],
      asOf: '2026-09-10',
    });
    const lots = rawLotsByUseBy(s);
    expect(lots.map((l) => l.lotCode)).toEqual(['SOON', 'LATE', 'UNDATED-OLD', 'UNDATED-NEW']);
    expect(lots[0].daysToUseBy).toBe(-2);
    expect(lots[1].daysToUseBy).toBe(10);
    expect(lots[2].daysToUseBy).toBeNull();
  });
});

describe('open orders and receipt coverage', () => {
  const po: PoLike = { id: 'po1', poNumber: 'AMK-PO-1', status: 'issued', orderedFor: '2026-09-15', supplierId: 's', supplierName: 'S', lines: [{ ingredient: BEEF, qty: 100, unit: 'lb' }, { ingredient: BEANS, qty: 25, unit: 'lb' }] };

  it('an issued order is on order less what receipts booked against it; a draft is not on order', () => {
    const rc = receipt('r', '2026-09-14', [{ ingredient: BEEF, qty: 60 }], 'po1');
    const o = openOrders({ purchaseOrders: [po, { ...po, id: 'd', poNumber: 'D', status: 'draft' }], receipts: [rc] });
    expect(o.byIngredient[BEEF]).toBe(40);
    expect(o.byIngredient[BEANS]).toBe(25);
    expect(o.draftsByIngredient[BEEF]).toBe(100);
    expect(o.lines.find((l) => l.ingredient === BEEF)?.expectedOn).toBe('2026-09-15');
    const cov = receiptCoverage(po, [rc]);
    expect(cov.covered).toBe(false);
    expect(cov.lines.find((l) => l.ingredient === BEANS)?.short).toBe(25);
    expect(receiptCoverage(po, [rc, receipt('r2', '2026-09-15', [{ ingredient: BEEF, qty: 40 }, { ingredient: BEANS, qty: 25 }], 'po1')]).covered).toBe(true);
  });
});

describe('net requirements across production days', () => {
  const gross = purchaseOrderForRun(575, seed).lines;
  const beefGross = gross.find((l) => l.name === BEEF)!.requiredForProduction;

  it('nets stock then on-order arriving in time, rolling day by day, and case-rounds only the net', () => {
    const stock = rawStockOnHand({ receipts: [receipt('r', '2026-09-10', [{ ingredient: BEEF, qty: 20 }])], batches: [], asOf: '2026-09-14' });
    const onOrder = openOrders({ purchaseOrders: [{ id: 'p', poNumber: 'P', status: 'issued', orderedFor: '2026-09-15', supplierId: 's', supplierName: 'S', lines: [{ ingredient: BEEF, qty: 30, unit: 'lb' }] }], receipts: [] });
    const net = netRequirements({ days: [{ productionDate: '2026-09-14', lines: gross }, { productionDate: '2026-09-15', lines: gross }], stock, onOrder });
    const beef = net.lines.find((l) => l.ingredient === BEEF)!;
    expect(beef.gross).toBeCloseTo(beefGross * 2, 9);
    expect(beef.onHandApplied).toBe(20);
    expect(beef.onOrderApplied).toBe(30);
    expect(beef.net).toBeCloseTo(beefGross * 2 - 50, 9);
    expect(beef.needBy).toBe('2026-09-14');
    expect(beef.casesToOrder).toBe(Math.ceil(beef.net / beef.packSize - 1e-9));
    expect(beef.qtyToOrder).toBe(beef.casesToOrder * beef.packSize);
    const rice = net.lines.find((l) => l.ingredient === 'Brown rice, long grain')!;
    expect(rice.onHandApplied).toBe(0);
    expect(rice.net).toBeCloseTo(rice.gross, 9);
    expect(netToRequirementLines(net).every((l) => l.casesToOrder > 0)).toBe(true);
    expect(net.netTotal).toBeLessThan(net.grossTotal * 1.2 + 1);
  });

  it('on order that arrives after the day is not applied to it', () => {
    const onOrder = openOrders({ purchaseOrders: [{ id: 'p', poNumber: 'P', status: 'issued', orderedFor: '2026-09-20', supplierId: 's', supplierName: 'S', lines: [{ ingredient: BEEF, qty: 1000, unit: 'lb' }] }], receipts: [] });
    const net = netRequirements({ days: [{ productionDate: '2026-09-14', lines: gross }], stock: rawStockOnHand({ receipts: [], batches: [], asOf: '2026-09-14' }), onOrder });
    const beef = net.lines.find((l) => l.ingredient === BEEF)!;
    expect(beef.onOrder).toBe(1000);
    expect(beef.onOrderApplied).toBe(0);
    expect(beef.net).toBeCloseTo(beefGross, 9);
  });

  it('stock covering everything leaves nothing to buy and no need-by', () => {
    const stock = rawStockOnHand({ receipts: [receipt('r', '2026-09-10', gross.map((l) => ({ ingredient: l.name, qty: l.requiredForProduction * 2 })))], batches: [], asOf: '2026-09-14' });
    const net = netRequirements({ days: [{ productionDate: '2026-09-14', lines: gross }], stock, onOrder: openOrders({ purchaseOrders: [], receipts: [] }) });
    expect(net.toBuy).toHaveLength(0);
    expect(net.lines.every((l) => l.needBy === null && l.casesToOrder === 0)).toBe(true);
    expect(net.netTotal).toBe(0);
  });

  it('order-by is need-by less the lead time, or unknown without one', () => {
    expect(orderByDate('2026-09-14', 3)).toBe('2026-09-11');
    expect(orderByDate('2026-09-14', null)).toBeNull();
  });
});
