/**
 * MicroFarm — the packaging library (Roadmap N1).
 */

import { describe, it, expect } from 'vitest';
import { packagingSeed, seedPackagingLibrary, type PackageDef, type PackagingLibrary } from '@/app/(farm)/farm/_data/packaging';
import { packageFromRow, packageUnitCost, packagingOrder, cropPlanPackagingCost } from '@/app/(farm)/farm/_engine/packaging';
import { resolveScenarioInputs } from '@/app/(farm)/farm/_engine/scenario';

const pkg = (over: Partial<PackageDef> = {}): PackageDef => ({
  id: 'p1', name: 'Bowl', channels: [1], temperature: null, material: null, sizeValue: null, sizeUnit: null, endOfUse: null, endOfUseRank: null,
  manualUnitCost: null, supplierItemId: null, supplierUnitsPerPack: 1, notes: null, source: 'user_built', ...over,
});
const item = (over: Partial<PackagingLibrary['supplierItems'][number]> = {}) => ({
  id: 's1', supplierId: 'op-1', supplierName: null, item: 'Bowls', unitPrice: 30, priceBasis: 'case', packSize: '300 ct', ...over,
});

describe('farm packaging — a package’s unit cost', () => {
  it('takes the supplier price per each when the catalog prices each', () => {
    expect(packageUnitCost(pkg({ supplierItemId: 's1', manualUnitCost: 0.5 }), [item({ unitPrice: 0.11, priceBasis: 'each' })])).toEqual({ cost: 0.11, basis: 'supplier' });
  });

  it('divides a pack price by the units in the pack', () => {
    expect(packageUnitCost(pkg({ supplierItemId: 's1', supplierUnitsPerPack: 300 }), [item()])).toEqual({ cost: 0.1, basis: 'supplier' });
  });

  it('falls back to the manual cost when the linked item has no price, and to none with neither', () => {
    expect(packageUnitCost(pkg({ supplierItemId: 's1', manualUnitCost: 0.2 }), [item({ unitPrice: null })])).toEqual({ cost: 0.2, basis: 'manual' });
    expect(packageUnitCost(pkg(), [])).toEqual({ cost: null, basis: 'none' });
  });
});

describe('farm packaging — a crop plan’s packaging per unit', () => {
  const lib: PackagingLibrary = {
    packages: [pkg({ id: 'bowl', manualUnitCost: 0.3 }), pkg({ id: 'lid', manualUnitCost: 0.08 }), pkg({ id: 'label' })],
    picks: [
      { id: 'a', cropPlanCode: 'AMK-E-001', packageId: 'bowl', qtyPerUnit: 1 },
      { id: 'b', cropPlanCode: 'AMK-E-001', packageId: 'lid', qtyPerUnit: 2 },
      { id: 'c', cropPlanCode: 'AMK-E-001', packageId: 'label', qtyPerUnit: 1 },
    ],
    supplierItems: [],
  };

  it('a crop plan that picks nothing carries zero packaging', () => {
    const r = cropPlanPackagingCost('AMK-E-002', lib);
    expect(r.perUnit).toBe(0);
    expect(r.lines).toEqual([]);
  });

  it('sums the picks at the library cost; a package with no cost entered counts as zero and stays listed', () => {
    // Robert, 2026-09-16: two states — picked or unpicked — and no placeholder.
    const r = cropPlanPackagingCost('AMK-E-001', lib);
    expect(r.perUnit).toBeCloseTo(0.3 + 0.08 * 2, 10);
    expect(r.lines.map((l) => l.pick.packageId)).toEqual(['bowl', 'lid', 'label']);
    expect(r.lines.find((l) => l.pick.packageId === 'label')!.extended).toBe(0);
  });

  it('with no cost entered on any pick, the crop plan shows zero — the picks are still listed', () => {
    const bare = { ...lib, packages: lib.packages.map((p) => ({ ...p, manualUnitCost: null, supplierItemId: null })) };
    const r = cropPlanPackagingCost('AMK-E-001', bare);
    expect(r.perUnit).toBe(0);
    expect(r.lines).toHaveLength(3);
  });
});

describe('farm packaging — the library', () => {
  it('seeds only what the placeholder names, with no cost, temperature or rank', () => {
    expect(packagingSeed.map((p) => p.name)).toEqual(['Compostable bowl, 16 oz', 'Lid, 16 oz compostable bowl', 'Label']);
    expect(packagingSeed.every((p) => p.manualUnitCost === null && p.temperature === null && p.endOfUseRank === null)).toBe(true);
  });

  it('sorts hot, cold, unset; then material, size, rank (unranked last), name', () => {
    const rows = [
      pkg({ id: 'd', name: 'D', temperature: null }),
      pkg({ id: 'c', name: 'C', temperature: 'cold' }),
      pkg({ id: 'b2', name: 'B2', temperature: 'hot', material: 'Fiber', sizeValue: 32 }),
      pkg({ id: 'b1', name: 'B1', temperature: 'hot', material: 'Fiber', sizeValue: 16, endOfUseRank: null }),
      pkg({ id: 'b0', name: 'B0', temperature: 'hot', material: 'Fiber', sizeValue: 16, endOfUseRank: 1 }),
    ];
    expect([...rows].sort(packagingOrder).map((p) => p.id)).toEqual(['b0', 'b1', 'b2', 'c', 'd']);
  });

  it('reads a row: channels cleaned to 1–3, an unknown temperature to unset', () => {
    const p = packageFromRow({ id: 'x', name: 'Tray', channels: [3, 1, 1, 7, 'x'], temperature: 'warm', material: null, sizeValue: null, sizeUnit: null, endOfUse: null, endOfUseRank: null, manualUnitCost: 0.2, supplierItemId: null, supplierUnitsPerPack: 0, notes: null, source: 'seed' });
    expect(p.channels).toEqual([1, 3]);
    expect(p.temperature).toBeNull();
    expect(p.supplierUnitsPerPack).toBe(1);
  });

  it('resolves with the seed library; with nothing picked, packaging is zero — there is no placeholder', () => {
    const R = resolveScenarioInputs();
    expect(R.packaging.packages).toHaveLength(seedPackagingLibrary().packages.length);
    expect(R.assumptions.perUnit.packaging.value).toBe(0);
  });
});
