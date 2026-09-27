/**
 * What a variety's seed was paid: the last price paid, which prices the seed line on the plan,
 * and the rolling 12-month average, a key figure. A purchase order prices at the supplier's
 * catalog first; a price typed on the forecast stands over both.
 */
import { describe, expect, it } from 'vitest';
import { VARIETIES, VARIETY_BY_KEY } from '@/data/varieties';
import { growPlanSeed } from '@/data/grow-plans-seed';
import type { ReceiptDoc } from '@/engine/actuals';
import type { CatalogLine } from '@/engine/catalog';
import { lastPricesPaid, rollingSeedCosts, rollingWindowFrom } from '@/engine/seed-cost';
import { growPlanToRows, rowsToGrowPlan } from '@/engine/grow-plan-library';
import { resolveScenarioInputs } from '@/engine/scenario';
import { buildPurchaseOrder, purchaseLines } from '@/engine/grow-purchase';
import { costPlan } from '@/engine/grow-costing';
import { GRAMS_PER_LB } from '@/data/tray-formats';

const BROC = VARIETY_BY_KEY['broccoli']!;
const receipt = (receivedOn: string, lines: ReceiptDoc['lines']): Pick<ReceiptDoc, 'receivedOn' | 'lines'> => ({ receivedOn, lines });
const line = (input: string, qty: number, cents: number, over: Partial<ReceiptDoc['lines'][number]> = {}): ReceiptDoc['lines'][number] => ({ input, qty, unit: 'lb', lotCode: 'L', unitPriceCents: cents, ...over });

describe('the last price paid', () => {
  it('is the most recent receipt of the variety, the day’s lines together; a rejected line is left out', () => {
    const paid = lastPricesPaid(
      [
        receipt('2026-10-01', [line(BROC.name, 5, 2000)]),
        receipt('2027-01-15', [line(BROC.name, 1, 2600), line(BROC.name, 3, 2200), line(BROC.name, 2, 1, { condition: 'rejected' })]),
        receipt('2026-12-01', [line(BROC.name, 10, 100)]),
      ],
      VARIETIES,
    );
    expect(paid['broccoli']!.pricePerLb).toBeCloseTo((26 + 3 * 22) / 4, 12);
    expect([paid['broccoli']!.receivedOn, paid['broccoli']!.lb]).toEqual(['2027-01-15', 4]);
  });

  it('counts only a variety received by the pound under its own name', () => {
    expect(lastPricesPaid([receipt('2027-01-02', [line('Medium: coco-coir', 3, 500), line(BROC.name, 2, 900, { unit: 'each' }), line(BROC.name, 0, 900)])], VARIETIES)).toEqual({});
  });

  it('the library read attaches only the varieties a plan sows', () => {
    const broc = growPlanSeed.find((p) => p.code === 'BROC-01')!;
    const { header, lines } = growPlanToRows(broc);
    const paid = lastPricesPaid([receipt('2027-01-02', [line(BROC.name, 1, 3000), line(VARIETY_BY_KEY['radish']!.name, 1, 1000)])], VARIETIES);
    const back = rowsToGrowPlan({ ...header, id: 'x', version: 1, effectiveFrom: null, updatedAt: new Date() }, lines, undefined, paid);
    expect(Object.keys(back.lastPaid ?? {})).toEqual(['broccoli']);
  });
});

describe('the rolling 12-month average (a key figure)', () => {
  it('is the dollars over the pounds of the accepted lines in the twelve months to the date', () => {
    const costs = rollingSeedCosts(
      [receipt('2026-10-01', [line(BROC.name, 5, 2000)]), receipt('2027-01-15', [line(BROC.name, 1, 2600)]), receipt('2025-12-31', [line(BROC.name, 10, 100)])],
      '2027-01-31',
      VARIETIES,
    );
    expect(costs['broccoli']!.pricePerLb).toBeCloseTo((5 * 20 + 26) / 6, 12);
  });

  it('the window opens the day after the same date a year earlier', () => {
    expect(rollingWindowFrom('2027-01-31')).toBe('2026-02-01');
    expect(rollingWindowFrom('2028-02-29')).toBe('2027-03-01');
  });
});

describe('the plan’s price and the order’s', () => {
  const broc = () => growPlanSeed.find((p) => p.code === 'BROC-01')!;
  const paidAt = (pricePerLb: number) => ({ ...broc(), lastPaid: { broccoli: { pricePerLb, receivedOn: '2027-01-02', lb: 5 } } });
  const catalogAt = (unitPrice: number): Record<string, CatalogLine[]> => ({
    tlm: [
      {
        id: 'c1', supplierId: 'tlm', item: BROC.name, category: null, variety: null, packSize: '5 lb bag', unit: 'lb', status: 'approved',
        prices: [{ effectiveFrom: '2026-01-01', unitPrice, priceBasis: 'lb', sourceId: null, note: null }],
        minOrderQty: null, leadTimeDays: null, availStartMonth: null, availEndMonth: null, certification: null, origin: null, sku: null, notes: null, sourceId: null,
      },
    ],
  });
  const linked = { sustainability: { inputSupplier: { [BROC.name]: 'tlm' } } };
  const seedOf = (plan: Parameters<typeof purchaseLines>[0], priceFor: 'plan' | 'order') => purchaseLines(plan, costPlan(plan), priceFor).find((l) => l.kind === 'seed')!;

  it('the plan prices seed at the last price paid, DATED; the cost card reads it', () => {
    const plan = resolveScenarioInputs({}, [paidAt(30)]).growPlans[0]!;
    const seed = seedOf(plan, 'plan');
    expect([seed.unitCost, seed.status]).toEqual([30, 'DATED']);
    const grams = costPlan(plan).lines.find((l) => l.line.kind === 'seed')!.quantity;
    expect(costPlan(plan).lines.find((l) => l.line.kind === 'seed')!.costPerTray).toBeCloseTo((grams / GRAMS_PER_LB) * 30, 12);
  });

  it('with a catalog price in force, the plan keeps the last price paid and a purchase order pays the catalog', () => {
    const r = resolveScenarioInputs(linked, [paidAt(30)], undefined, undefined, undefined, undefined, undefined, catalogAt(24), '2027-01-10');
    const plan = r.growPlans[0]!;
    expect(seedOf(plan, 'plan').unitCost).toBe(30);
    expect(seedOf(plan, 'order').unitCost).toBe(24);
    expect(buildPurchaseOrder(10, plan).lines[0]!.unitCost).toBe(24);
    expect(r.inputPrices[`BROC-01::${BROC.name}`]!.basis).toBe('lastPaid');
    expect(r.orderLinePrices[`BROC-01::${BROC.name}`]!.basis).toBe('catalog');
  });

  it('with no catalog price, a purchase order pays the last price paid', () => {
    const plan = resolveScenarioInputs({}, [paidAt(30)]).growPlans[0]!;
    expect(buildPurchaseOrder(10, plan).lines[0]!.unitCost).toBe(30);
  });

  it('never received, the plan takes the catalog, then the record', () => {
    expect(seedOf(resolveScenarioInputs(linked, [broc()], undefined, undefined, undefined, undefined, undefined, catalogAt(24), '2027-01-10').growPlans[0]!, 'plan').unitCost).toBe(24);
    expect(seedOf(resolveScenarioInputs({}, [broc()]).growPlans[0]!, 'plan').unitCost).toBe(BROC.seedPricePerLb.value);
  });

  it('a price typed on the forecast stands over both, STATED', () => {
    const r = resolveScenarioInputs({ ...linked, inputs: { [`BROC-01::${BROC.name}`]: { unitCost: 40 } } }, [paidAt(30)], undefined, undefined, undefined, undefined, undefined, catalogAt(24), '2027-01-10');
    const plan = r.growPlans[0]!;
    expect([seedOf(plan, 'plan').unitCost, seedOf(plan, 'plan').status]).toEqual([40, 'STATED']);
    expect(seedOf(plan, 'order').unitCost).toBe(40);
    expect(seedOf(plan, 'plan').source).toContain('Last price paid');
    expect(seedOf(plan, 'order').source).toContain('Supplier catalog');
  });
});
