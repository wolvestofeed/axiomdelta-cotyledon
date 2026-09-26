import { describe, it, expect } from 'vitest';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { projectCropPlan } from '@/engine/grow-plan-bridge';
import { purchaseOrderForRun } from '@/engine';
import type { SowingRecordDoc, ReceiptDoc } from '@/engine/actuals';
import { rawStockOnHand, rawLotsByUseBy, openOrders, receiptCoverage, netRequirements, netToRequirementLines, orderByDate, type PoLike } from '@/engine/net-requirements';

const receipt = (id: string, on: string, lines: { input: string; qty: number; lotCode?: string; price?: number; useBy?: string; condition?: 'accepted' | 'accepted_with_note' | 'rejected' }[], poId: string | null = null): ReceiptDoc => ({
  id, poId, supplierId: null, supplierName: null, receivedOn: on, invoiceNumber: null, invoiceTotalCents: null,
  lines: lines.map((l) => ({ input: l.input, qty: l.qty, unit: 'lb', lotCode: l.lotCode ?? 'not recorded', unitPriceCents: l.price ?? 100, ...(l.useBy ? { useBy: l.useBy } : {}), ...(l.condition ? { condition: l.condition } : {}) })),
  receivedBy: null, notes: null,
});
const sowing = (id: string, on: string, consumed: { input: string; qty: number; lot?: string }[]): SowingRecordDoc => ({
  id, sowingId: id, cropPlanCode: 'BROC-01', productionDate: on, standardVersion: 'v', plannedUnits: 0, goodUnits: 0, sowingsRun: 1, servingsProduced: null,
  components: [{ component: 'c', outputLotCode: 'o', consumed: consumed.map((c) => ({ input: c.input, inputLotCode: c.lot ?? 'not recorded', qty: c.qty, unit: 'lb', onFoodTraceabilityList: false })), seedIssuedLb: 0, harvestedLb: null, blackoutLb: null, packedLb: 0, scrap: [] }],
  actualLaborHours: null, actualLaborRate: null, closedBy: null, closedAt: null, notes: null,
});
const seed = projectCropPlan(growPlanSeed.find((p) => p.code === 'BROC-01')!);
// Two of the plan's own lines: its seed and its medium.
const SEED = seed.inputs.find((i) => i.unit === 'lb')!.name;
const MEDIUM = seed.inputs.find((i) => i.name.startsWith('Medium'))!.name;

describe('raw stock on hand', () => {
  it('receipts are lots; issues draw the named lot first, else the oldest; unmatched issues are reported', () => {
    const s = rawStockOnHand({
      receipts: [receipt('r1', '2026-09-01', [{ input: SEED, qty: 50, lotCode: 'L1' }]), receipt('r2', '2026-09-05', [{ input: SEED, qty: 50, lotCode: 'L2' }, { input: MEDIUM, qty: 25 }])],
      sowings: [sowing('b1', '2026-09-06', [{ input: SEED, qty: 30, lot: 'L2' }]), sowing('b2', '2026-09-07', [{ input: SEED, qty: 40 }, { input: 'Onion, yellow', qty: 2 }])],
      asOf: '2026-09-10',
    });
    expect(s.byInput[SEED].onHand).toBe(30);
    expect(s.lots.find((l) => l.lotCode === 'L1')?.remaining).toBe(10);
    expect(s.lots.find((l) => l.lotCode === 'L2')?.remaining).toBe(20);
    expect(s.byInput[MEDIUM].onHand).toBe(25);
    expect(s.byInput[MEDIUM].valueCents).toBe(2500);
    expect(s.unmatchedIssues['Onion, yellow']).toBe(2);
  });

  it('a receipt or an issue after the as-of date is not counted', () => {
    const s = rawStockOnHand({ receipts: [receipt('r', '2026-09-12', [{ input: SEED, qty: 10 }])], sowings: [], asOf: '2026-09-10' });
    expect(s.byInput[SEED]).toBeUndefined();
  });

  it('a rejected receipt line is on the record and never in stock (Roadmap I2)', () => {
    const s = rawStockOnHand({
      receipts: [receipt('r', '2026-09-01', [{ input: SEED, qty: 50, lotCode: 'OK', condition: 'accepted_with_note' }, { input: SEED, qty: 20, lotCode: 'BAD', condition: 'rejected' }])],
      sowings: [],
      asOf: '2026-09-10',
    });
    expect(s.byInput[SEED].onHand).toBe(50);
    expect(s.lots.map((l) => l.lotCode)).toEqual(['OK']);
  });
});

describe('raw lots by use-by (Roadmap I5)', () => {
  it('orders lots on hand by the date on the case, earliest first, undated lots last by receipt date', () => {
    const s = rawStockOnHand({
      receipts: [
        receipt('r1', '2026-09-01', [{ input: SEED, qty: 10, lotCode: 'LATE', useBy: '2026-09-20' }, { input: MEDIUM, qty: 10, lotCode: 'UNDATED-OLD' }]),
        receipt('r2', '2026-09-03', [{ input: SEED, qty: 10, lotCode: 'SOON', useBy: '2026-09-08' }, { input: MEDIUM, qty: 10, lotCode: 'UNDATED-NEW' }]),
        receipt('r3', '2026-09-04', [{ input: SEED, qty: 10, lotCode: 'GONE', useBy: '2026-09-12' }]),
      ],
      sowings: [sowing('b1', '2026-09-05', [{ input: SEED, qty: 10, lot: 'GONE' }])],
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
  const po: PoLike = { id: 'po1', poNumber: 'AMK-PO-1', status: 'issued', orderedFor: '2026-09-15', supplierId: 's', supplierName: 'S', lines: [{ input: SEED, qty: 100, unit: 'lb' }, { input: MEDIUM, qty: 25, unit: 'lb' }] };

  it('an issued order is on order less what receipts booked against it; a draft is not on order', () => {
    const rc = receipt('r', '2026-09-14', [{ input: SEED, qty: 60 }], 'po1');
    const o = openOrders({ purchaseOrders: [po, { ...po, id: 'd', poNumber: 'D', status: 'draft' }], receipts: [rc] });
    expect(o.byInput[SEED]).toBe(40);
    expect(o.byInput[MEDIUM]).toBe(25);
    expect(o.draftsByInput[SEED]).toBe(100);
    expect(o.lines.find((l) => l.input === SEED)?.expectedOn).toBe('2026-09-15');
    const cov = receiptCoverage(po, [rc]);
    expect(cov.covered).toBe(false);
    expect(cov.lines.find((l) => l.input === MEDIUM)?.short).toBe(25);
    expect(receiptCoverage(po, [rc, receipt('r2', '2026-09-15', [{ input: SEED, qty: 40 }, { input: MEDIUM, qty: 25 }], 'po1')]).covered).toBe(true);
  });
});

describe('net requirements across production days', () => {
  const gross = purchaseOrderForRun(575, seed).lines;
  const seedGross = gross.find((l) => l.name === SEED)!.requiredForProduction;

  it('nets stock then on-order arriving in time, rolling day by day, and case-rounds only the net', () => {
    const stock = rawStockOnHand({ receipts: [receipt('r', '2026-09-10', [{ input: SEED, qty: 20 }])], sowings: [], asOf: '2026-09-14' });
    const onOrder = openOrders({ purchaseOrders: [{ id: 'p', poNumber: 'P', status: 'issued', orderedFor: '2026-09-15', supplierId: 's', supplierName: 'S', lines: [{ input: SEED, qty: 30, unit: 'lb' }] }], receipts: [] });
    const net = netRequirements({ days: [{ productionDate: '2026-09-14', lines: gross }, { productionDate: '2026-09-15', lines: gross }], stock, onOrder });
    const seedRow = net.lines.find((l) => l.input === SEED)!;
    expect(seedRow.gross).toBeCloseTo(seedGross * 2, 9);
    expect(seedRow.onHandApplied).toBe(20);
    expect(seedRow.onOrderApplied).toBe(30);
    expect(seedRow.net).toBeCloseTo(seedGross * 2 - 50, 9);
    expect(seedRow.needBy).toBe('2026-09-14');
    expect(seedRow.casesToOrder).toBe(Math.ceil(seedRow.net / seedRow.packSize - 1e-9));
    expect(seedRow.qtyToOrder).toBe(seedRow.casesToOrder * seedRow.packSize);
    const medium = net.lines.find((l) => l.input === MEDIUM)!;
    expect(medium.onHandApplied).toBe(0);
    expect(medium.net).toBeCloseTo(medium.gross, 9);
    expect(netToRequirementLines(net).every((l) => l.casesToOrder > 0)).toBe(true);
    expect(net.netTotal).toBeLessThan(net.grossTotal * 1.2 + 1);
  });

  it('on order that arrives after the day is not applied to it', () => {
    const onOrder = openOrders({ purchaseOrders: [{ id: 'p', poNumber: 'P', status: 'issued', orderedFor: '2026-09-20', supplierId: 's', supplierName: 'S', lines: [{ input: SEED, qty: 1000, unit: 'lb' }] }], receipts: [] });
    const net = netRequirements({ days: [{ productionDate: '2026-09-14', lines: gross }], stock: rawStockOnHand({ receipts: [], sowings: [], asOf: '2026-09-14' }), onOrder });
    const seedRow = net.lines.find((l) => l.input === SEED)!;
    expect(seedRow.onOrder).toBe(1000);
    expect(seedRow.onOrderApplied).toBe(0);
    expect(seedRow.net).toBeCloseTo(seedGross, 9);
  });

  it('stock covering everything leaves nothing to buy and no need-by', () => {
    const stock = rawStockOnHand({ receipts: [receipt('r', '2026-09-10', gross.map((l) => ({ input: l.name, qty: l.requiredForProduction * 2 })))], sowings: [], asOf: '2026-09-14' });
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
