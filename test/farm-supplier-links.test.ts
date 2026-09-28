import { describe, it, expect } from 'vitest';
import { spendCoverage, inboundLogistics, toLcaOption, supplierOptionId, type LeanSupplier } from '@/engine/supplier-links';
import { haversineMiles } from '@/engine/geo';
import { KG_PER_LB } from '@/engine/carbon';

const sup = (id: string, extra: Partial<LeanSupplier> = {}): LeanSupplier => ({
  id, name: `Supplier ${id}`, location: 'Paris, TX', supplies: ['seed'], brands: [],
  lat: null, lng: null, geoSource: null, ...extra,
});

describe('farm supplier links — spend coverage', () => {
  const po = [
    { name: 'Beef', extendedCost: 600 },
    { name: 'Beans', extendedCost: 300 },
    { name: 'Salt', extendedCost: 100 },
  ];
  it('shares of spend linked', () => {
    const c = spendCoverage(po, { Beef: 'a', Beans: 'b' }, { a: sup('a'), b: sup('b') });
    expect(c.totalSpend).toBe(1000);
    expect(c.linesLinked).toBe(2);
    expect(c.linkedShare).toBeCloseTo(0.9, 9);
  });
  it('a link to an unknown supplier id counts as unlinked', () => {
    const c = spendCoverage(po, { Beef: 'zzz' }, {});
    expect(c.linesLinked).toBe(0);
    expect(c.linkedShare).toBe(0);
  });
});

describe('farm supplier links — inbound logistics', () => {
  const home = { lat: 30.2516, lng: -97.7492 };
  const farm = { lat: 30.649082, lng: -97.605065 };
  it('laden leg per placed line; unlinked and unplaced lines carry nothing', () => {
    const out = inboundLogistics(
      [{ input: 'Beef', massKg: 200 }, { input: 'Beans', massKg: 50 }, { input: 'Rice', massKg: 50 }],
      { Beef: 'a', Beans: 'b' },
      { a: sup('a', farm), b: sup('b') },
      home,
    );
    const miles = haversineMiles(home, farm);
    const tons = 200 / (2000 * KG_PER_LB);
    expect(out.legs[0].placed).toBe(true);
    expect(out.legs[0].tonMiles).toBeCloseTo(tons * miles, 9);
    expect(out.legs[0].kgCo2e).toBeCloseTo((tons * miles * 161.8) / 1000, 9);
    expect(out.legs[1].placed).toBe(false);
    expect(out.legs[1].supplierName).toBe('Supplier b');
    expect(out.legs[2].supplierId).toBeNull();
    expect(out.linesLinked).toBe(2);
    expect(out.linesPlaced).toBe(1);
    expect(out.totalKgCo2e).toBeCloseTo(out.legs[0].kgCo2e!, 9);
  });
});

describe('farm supplier links — supplier rows become engine options', () => {
  it('maps a row with a prefixed id, supplier kind, boundary and status', () => {
    const o = toLcaOption({
      id: '11111111-1111-1111-1111-111111111111', supplierId: 'x', supplierName: 'Ranch X', input: 'Ground beef, 85/15',
      label: '2025 ranch LCA', kgCo2ePerKg: 4.2, unitNote: 'per kg fresh meat', boundary: 'farm_gate', status: 'STATED', note: null, updatedAt: '2026-09-12T00:00:00Z',
    });
    expect(o.id).toBe(supplierOptionId('11111111-1111-1111-1111-111111111111'));
    expect(o.kind).toBe('supplier');
    expect(o.label).toBe('Ranch X: 2025 ranch LCA');
    expect(o.boundary).toBe('farm_gate');
    expect(o.provenance.status).toBe('STATED');
    expect(o.provenance.id).toBe(o.id);
  });
  it('unknown boundary or status fall back safely', () => {
    const o = toLcaOption({ id: 'a', supplierId: 'x', supplierName: 'X', input: 'i', label: 'l', kgCo2ePerKg: 1, unitNote: null, boundary: 'weird', status: 'nope', note: null, updatedAt: new Date('2026-01-01') });
    expect(o.boundary).toBe('farm_gate');
    expect(o.provenance.status).toBe('STATED');
    expect(o.unitNote).toBe('per kg');
  });
});
