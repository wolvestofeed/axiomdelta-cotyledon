import { describe, it, expect } from 'vitest';
import {
  isAvailableInMonth,
  availabilityLabel,
  matchCatalogLine,
  parseCatalogSheet,
  parseMonth,
  parseNumber,
  splitRow,
  detectDelimiter,
  purchaseOrderNumber,
  canTransition,
  nextPoStatuses,
  buildDraftPurchaseOrders,
  priceInForceOn,
  matchCatalogPrice,
  type CatalogLine,
  type RequirementLine,
} from '@/app/(farm)/farm/_engine/catalog';
import { resolveInputPrice } from '@/app/(farm)/farm/_engine/input-price';
import { resolveScenarioInputs } from '@/app/(farm)/farm/_engine/scenario';

/**
 * A catalog line. `unitPrice` is a convenience: it becomes the one price in
 * force from 2020-01-01, which is what most of these cases mean by "the price".
 * A case that cares about dates passes `prices` instead.
 */
const line = (over: Partial<CatalogLine> & { unitPrice?: number | null } = {}): CatalogLine => {
  const { unitPrice, ...rest } = over;
  const priced = unitPrice === undefined ? 4.85 : unitPrice;
  return {
    id: 'c1', supplierId: 's1', item: 'Ground beef', category: null, variety: null, packSize: '40 lb case',
    unit: 'lb', status: 'approved',
    prices: priced === null ? [] : [{ effectiveFrom: '2020-01-01', unitPrice: priced, priceBasis: 'lb', sourceId: null, note: null }],
    minOrderQty: null, leadTimeDays: null,
    availStartMonth: null, availEndMonth: null, certification: null, origin: null, sku: null,
    notes: null, sourceId: null, ...rest,
  };
};

describe('farm catalog — seasonality', () => {
  it('a plain window covers the months inside it', () => {
    expect(isAvailableInMonth(6, 9, 7)).toBe(true);
    expect(isAvailableInMonth(6, 9, 5)).toBe(false);
    expect(isAvailableInMonth(6, 9, 6)).toBe(true); // inclusive at both ends
    expect(isAvailableInMonth(6, 9, 9)).toBe(true);
  });

  it('a window whose end precedes its start wraps the year end', () => {
    // October through March.
    expect(isAvailableInMonth(10, 3, 11)).toBe(true);
    expect(isAvailableInMonth(10, 3, 1)).toBe(true);
    expect(isAvailableInMonth(10, 3, 3)).toBe(true);
    expect(isAvailableInMonth(10, 3, 5)).toBe(false);
  });

  it('a single-month window covers only that month', () => {
    expect(isAvailableInMonth(5, 5, 5)).toBe(true);
    expect(isAvailableInMonth(5, 5, 6)).toBe(false);
  });

  it('no window recorded is treated as available and labelled so the absence shows', () => {
    expect(isAvailableInMonth(null, null, 2)).toBe(true);
    expect(availabilityLabel(null, null)).toBe('Year-round');
    expect(availabilityLabel(10, 3)).toBe('Oct–Mar');
    expect(availabilityLabel(5, 5)).toBe('May');
  });
});

describe('farm catalog — matching a crop plan line to a catalog', () => {
  const catalog = [line({ id: 'a', item: 'Ground beef' }), line({ id: 'b', item: 'Pinto beans, dry' })];

  it('prefers an exact name', () => {
    expect(matchCatalogLine('Ground beef', catalog)?.id).toBe('a');
  });

  it('matches on the head of a qualified crop plan name', () => {
    expect(matchCatalogLine('Ground beef, 85/15', catalog)?.id).toBe('a');
  });

  it('returns null rather than guessing when nothing matches', () => {
    expect(matchCatalogLine('Corn tortilla', catalog)).toBeNull();
  });
});

describe('farm catalog — sheet parsing', () => {
  it('reads a comma sheet with loosely-named headers', () => {
    const r = parseCatalogSheet('Product,Price,Pack,Available From,Available To\nGround beef,$4.85,40 lb case,Oct,Mar');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      item: 'Ground beef', unitPrice: 4.85, packSize: '40 lb case', availStartMonth: 10, availEndMonth: 3,
    });
  });

  it('reads a pasted spreadsheet, choosing tab over comma', () => {
    expect(detectDelimiter('item\tprice\tnotes')).toBe('\t');
    expect(detectDelimiter('item,price,notes')).toBe(',');
    const r = parseCatalogSheet('item\tprice\nGround beef\t4.85');
    expect(r.rows[0].unitPrice).toBe(4.85);
  });

  it('honours quoted fields containing the delimiter', () => {
    expect(splitRow('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd']);
    expect(splitRow('a,"say ""hi""",d', ',')).toEqual(['a', 'say "hi"', 'd']);
  });

  it('refuses a sheet with no item column, and says which names it accepts', () => {
    const r = parseCatalogSheet('price,pack\n4.85,case');
    expect(r.rows).toEqual([]);
    expect(r.problems[0].reason).toContain('item');
  });

  it('reports an unreadable price by line number instead of dropping the row', () => {
    const r = parseCatalogSheet('item,price\nGround beef,call us');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].unitPrice).toBeNull();
    expect(r.problems[0]).toMatchObject({ line: 2 });
  });

  it('skips a row with no item name and names the line', () => {
    const r = parseCatalogSheet('item,price\n,4.85\nBeans,2.00');
    expect(r.rows).toHaveLength(1);
    expect(r.problems[0].line).toBe(2);
  });

  it('surfaces unrecognised headers and fields the sheet did not supply', () => {
    const r = parseCatalogSheet('item,price,wholesale tier\nBeans,2.00,A');
    expect(r.unknownHeaders).toEqual(['wholesale tier']);
    expect(r.missingFields).toContain('origin');
  });

  it('parses months by number, short name and full name', () => {
    expect(parseMonth('3')).toBe(3);
    expect(parseMonth('Mar')).toBe(3);
    expect(parseMonth('march')).toBe(3);
    expect(parseMonth('13')).toBeNull();
    expect(parseMonth('')).toBeNull();
  });

  it('parses prices carrying currency symbols and separators', () => {
    expect(parseNumber('$1,250.50')).toBe(1250.5);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('n/a')).toBeNull();
  });
});

describe('farm catalog — purchase order numbering and workflow', () => {
  it('numbers as AMK-PO-YYYYMMDD-NN', () => {
    expect(purchaseOrderNumber('2026-09-13', 1)).toBe('AMK-PO-20260913-01');
    expect(purchaseOrderNumber('2026-09-13', 12)).toBe('AMK-PO-20260913-12');
  });

  it('moves draft to issued to received to closed, and no further', () => {
    expect(canTransition('draft', 'issued')).toBe(true);
    expect(canTransition('issued', 'received')).toBe(true);
    expect(canTransition('received', 'closed')).toBe(true);
    expect(nextPoStatuses('closed')).toEqual([]);
  });

  it('refuses to skip a state or reopen a finished order', () => {
    expect(canTransition('draft', 'received')).toBe(false);
    expect(canTransition('closed', 'issued')).toBe(false);
    expect(canTransition('cancelled', 'draft')).toBe(false);
  });

  it('allows cancelling from any state that is not final', () => {
    expect(canTransition('draft', 'cancelled')).toBe(true);
    expect(canTransition('issued', 'cancelled')).toBe(true);
    expect(canTransition('received', 'cancelled')).toBe(true);
  });
});

describe('farm catalog — building draft purchase orders', () => {
  const requirement: RequirementLine[] = [
    { input: 'Ground beef, 85/15', qty: 80, unit: 'lb', packSize: 40, casesToOrder: 2, fallbackUnitCost: 5.5 },
    { input: 'Pinto beans, dry', qty: 50, unit: 'lb', packSize: 25, casesToOrder: 2, fallbackUnitCost: 1.2 },
    { input: 'Corn tortilla', qty: 100, unit: 'each', packSize: 100, casesToOrder: 1, fallbackUnitCost: 0.1 },
  ];
  const suppliers = { s1: { id: 's1', name: 'Back Forty' }, s2: { id: 's2', name: 'Bean Co' } };

  it('groups by supplier and prices off the catalog where the item matches', () => {
    const r = buildDraftPurchaseOrders(
      requirement,
      { 'Ground beef, 85/15': 's1', 'Pinto beans, dry': 's2' },
      suppliers,
      { s1: [line({ item: 'Ground beef', unitPrice: 4.85 })] },
      '2026-09-13',
    );
    expect(r.orders).toHaveLength(2);
    const beef = r.orders.find((o) => o.supplierId === 's1')!;
    expect(beef.lines[0].pricedFrom).toBe('catalog');
    expect(beef.lines[0].unitPriceCents).toBe(485);
    expect(beef.subtotalCents).toBe(Math.round(4.85 * 80 * 100));
  });

  it('falls back to the crop plan cost when the catalog has no match, and says so', () => {
    const r = buildDraftPurchaseOrders(
      requirement,
      { 'Pinto beans, dry': 's2' },
      suppliers,
      {},
      '2026-09-13',
    );
    const beans = r.orders[0].lines[0];
    expect(beans.pricedFrom).toBe('cropPlan');
    expect(beans.unitPriceCents).toBe(120);
  });

  it('a line with no supplier linked is reported, not silently dropped', () => {
    const r = buildDraftPurchaseOrders(requirement, { 'Ground beef, 85/15': 's1' }, suppliers, {}, '2026-09-13');
    expect(r.unassigned.map((u) => u.input)).toEqual(['Pinto beans, dry', 'Corn tortilla']);
  });

  it('notes an out-of-season line without changing the quantity', () => {
    const r = buildDraftPurchaseOrders(
      [requirement[0]],
      { 'Ground beef, 85/15': 's1' },
      suppliers,
      { s1: [line({ item: 'Ground beef', availStartMonth: 1, availEndMonth: 3 })] },
      '2026-09-13',
    );
    const l = r.orders[0].lines[0];
    expect(l.seasonalityNote).toContain('Jan–Mar');
    expect(l.qty).toBe(80);
  });

  it('notes an order below the stated minimum without raising it', () => {
    const r = buildDraftPurchaseOrders(
      [requirement[0]],
      { 'Ground beef, 85/15': 's1' },
      suppliers,
      { s1: [line({ item: 'Ground beef', minOrderQty: 200 })] },
      '2026-09-13',
    );
    expect(r.orders[0].lines[0].minimumNote).toContain('200');
    expect(r.orders[0].lines[0].qty).toBe(80);
  });

  it('orders the drafts by value, largest first', () => {
    const r = buildDraftPurchaseOrders(
      requirement,
      { 'Ground beef, 85/15': 's1', 'Pinto beans, dry': 's2' },
      suppliers,
      {},
      '2026-09-13',
    );
    expect(r.orders[0].subtotalCents).toBeGreaterThanOrEqual(r.orders[1].subtotalCents);
  });

  it('two lines linked to one supplier land on one order', () => {
    const r = buildDraftPurchaseOrders(
      requirement,
      { 'Ground beef, 85/15': 's1', 'Pinto beans, dry': 's1', 'Corn tortilla': 's1' },
      suppliers,
      {},
      '2026-09-13',
    );
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0].lines).toHaveLength(3);
    expect(r.orders[0].subtotalCents).toBe(
      r.orders[0].lines.reduce((s, l) => s + l.extendedCents, 0),
    );
  });
});

describe('farm catalog — candidate or approved, and the price in force on a date', () => {
  const dated = (rows: [string, number][]) =>
    rows.map(([effectiveFrom, unitPrice]) => ({ effectiveFrom, unitPrice, priceBasis: 'lb', sourceId: null, note: null }));

  it('the price in force is the latest row on or before the date', () => {
    const prices = dated([['2026-01-01', 4.5], ['2026-06-01', 4.85], ['2027-01-01', 5.2]]);
    expect(priceInForceOn(prices, '2026-03-15')?.unitPrice).toBe(4.5);
    expect(priceInForceOn(prices, '2026-06-01')?.unitPrice).toBe(4.85); // inclusive on the day it starts
    expect(priceInForceOn(prices, '2026-12-31')?.unitPrice).toBe(4.85);
    expect(priceInForceOn(prices, '2027-06-01')?.unitPrice).toBe(5.2);
  });

  it('a date before any price has none, rather than borrowing the first', () => {
    expect(priceInForceOn(dated([['2026-06-01', 4.85]]), '2026-01-01')).toBeNull();
    expect(priceInForceOn([], '2026-06-01')).toBeNull();
  });

  it('only an approved line prices an input; a candidate is reported, not used', () => {
    const candidate = line({ id: 'cand', item: 'Ground beef', status: 'candidate', unitPrice: 4.85 });
    const m = matchCatalogPrice('Ground beef, 85/15', [candidate], '2026-09-13');
    expect(m.line).toBeNull();
    expect(m.price).toBeNull();
    expect(m.candidate?.id).toBe('cand');

    const approved = line({ id: 'appr', item: 'Ground beef', status: 'approved', unitPrice: 4.5 });
    const n = matchCatalogPrice('Ground beef, 85/15', [candidate, approved], '2026-09-13');
    expect(n.line?.id).toBe('appr');
    expect(n.price?.unitPrice).toBe(4.5);
    expect(n.candidate).toBeNull();
  });

  it('a purchase order prices off the approved line at the price in force on its order date', () => {
    const req: RequirementLine[] = [
      { input: 'Ground beef, 85/15', qty: 80, unit: 'lb', packSize: 40, casesToOrder: 2, fallbackUnitCost: 5.5 },
    ];
    const suppliers = { s1: { id: 's1', name: 'Back Forty' } };
    const catalog = {
      s1: [line({ item: 'Ground beef', prices: dated([['2026-01-01', 4.5], ['2026-09-01', 4.85]]) })],
    };
    const early = buildDraftPurchaseOrders(req, { 'Ground beef, 85/15': 's1' }, suppliers, catalog, '2026-05-01');
    expect(early.orders[0].lines[0].unitPriceCents).toBe(450);
    expect(early.orders[0].lines[0].priceEffectiveFrom).toBe('2026-01-01');

    const later = buildDraftPurchaseOrders(req, { 'Ground beef, 85/15': 's1' }, suppliers, catalog, '2026-09-13');
    expect(later.orders[0].lines[0].unitPriceCents).toBe(485);
    expect(later.orders[0].lines[0].priceEffectiveFrom).toBe('2026-09-01');
  });

  it('a candidate line falls back to the crop plan cost and says why', () => {
    const req: RequirementLine[] = [
      { input: 'Ground beef, 85/15', qty: 80, unit: 'lb', packSize: 40, casesToOrder: 2, fallbackUnitCost: 5.5 },
    ];
    const r = buildDraftPurchaseOrders(
      req,
      { 'Ground beef, 85/15': 's1' },
      { s1: { id: 's1', name: 'Back Forty' } },
      { s1: [line({ item: 'Ground beef', status: 'candidate', unitPrice: 4.85 })] },
      '2026-09-13',
    );
    const l = r.orders[0].lines[0];
    expect(l.pricedFrom).toBe('cropPlan');
    expect(l.unitPriceCents).toBe(550);
    expect(l.approvalNote).toContain('candidate');
    // The rest of the line still reads off the catalog: only its price is refused.
    expect(l.item).toBe('Ground beef');
  });

  it('an approved line with no price by the order date falls back and says so', () => {
    const req: RequirementLine[] = [
      { input: 'Ground beef, 85/15', qty: 80, unit: 'lb', packSize: 40, casesToOrder: 2, fallbackUnitCost: 5.5 },
    ];
    const r = buildDraftPurchaseOrders(
      req,
      { 'Ground beef, 85/15': 's1' },
      { s1: { id: 's1', name: 'Back Forty' } },
      { s1: [line({ item: 'Ground beef', prices: dated([['2027-01-01', 4.85]]) })] },
      '2026-09-13',
    );
    const l = r.orders[0].lines[0];
    expect(l.pricedFrom).toBe('cropPlan');
    expect(l.approvalNote).toContain('no price in force');
  });
});

describe('farm catalog — the price of an input line (Roadmap N1, decision 7)', () => {
  const beef = 'Ground beef, 85/15'; // the seed crop plan's own line name
  const q = (over: Partial<Parameters<typeof resolveInputPrice>[0]> = {}) =>
    resolveInputPrice({
      input: beef,
      unit: 'lb',
      cropPlanUnitCost: 7.5,
      supplierId: 's1',
      catalog: [line({ item: 'Ground beef', unitPrice: 4.85 })],
      asOf: '2026-09-13',
      ...over,
    });

  it('the catalog price wins when an approved line carries one in the line’s own unit', () => {
    const r = q();
    expect(r.basis).toBe('catalog');
    expect(r.unitPrice).toBe(4.85);
    expect(r.effectiveFrom).toBe('2020-01-01');
    expect(r.gap).toBeNull();
  });

  it('the crop plan figure stands, with the reason, at every point the catalog cannot price it', () => {
    expect(q({ supplierId: null }).gap).toBe('No supplier linked to this line.');
    expect(q({ catalog: [] }).gap).toContain('no catalog on file');
    expect(q({ catalog: [line({ item: 'Pinto beans, dry' })] }).gap).toContain('No approved catalog line');
    expect(q({ catalog: [line({ item: 'Ground beef', status: 'candidate' })] }).gap).toContain('candidate');
    for (const r of [q({ supplierId: null }), q({ catalog: [] })]) {
      expect(r.basis).toBe('cropPlan');
      expect(r.unitPrice).toBe(7.5); // never zero, never a guess
    }
  });

  it('a price stated per a different unit is NOT converted — the pack size is free text', () => {
    const r = q({
      catalog: [line({ item: 'Ground beef', prices: [{ effectiveFrom: '2026-01-01', unitPrice: 194, priceBasis: 'case', sourceId: null, note: null }] })],
    });
    expect(r.basis).toBe('cropPlan');
    expect(r.unitPrice).toBe(7.5);
    expect(r.gap).toContain('priced per case');
  });

  it('the resolver writes the catalog price onto the line and says where it came from', () => {
    const catalog = { s1: [line({ item: 'Ground beef', unitPrice: 4.85 })] };
    const R = resolveScenarioInputs(
      { sustainability: { inputSupplier: { [beef]: 's1' } } },
      undefined, undefined, undefined, undefined, undefined, undefined,
      catalog,
      '2026-09-13',
    );
    const lineOut = R.cropPlan.inputs.find((i) => i.name === beef)!;
    expect(lineOut.seedUnitCost).toBe(4.85);
    expect(lineOut.status).toBe('SOURCED');
    expect(lineOut.source).toContain('Supplier catalog');
    expect(R.inputPrices[`${R.cropPlan.code}::${beef}`].basis).toBe('catalog');
  });

  it('a price typed on the scenario outranks the catalog, and stops claiming its source', () => {
    const catalog = { s1: [line({ item: 'Ground beef', unitPrice: 4.85 })] };
    const R = resolveScenarioInputs(
      {
        sustainability: { inputSupplier: { [beef]: 's1' } },
        inputs: { [`AMK-E-001::${beef}`]: { seedUnitCost: 6 } },
      },
      undefined, undefined, undefined, undefined, undefined, undefined,
      catalog,
      '2026-09-13',
    );
    const lineOut = R.cropPlan.inputs.find((i) => i.name === beef)!;
    expect(lineOut.seedUnitCost).toBe(6);
    expect(lineOut.status).toBe('STATED');
    expect(R.inputPrices[`${R.cropPlan.code}::${beef}`].basis).toBe('cropPlan');
  });

  it('with no catalog at all, every line reads its crop plan figure and says no supplier is linked', () => {
    const R = resolveScenarioInputs();
    for (const [, p] of Object.entries(R.inputPrices)) {
      expect(p.basis).toBe('cropPlan');
      expect(p.gap).toBe('No supplier linked to this line.');
    }
  });
});
