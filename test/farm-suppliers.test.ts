import { describe, it, expect } from 'vitest';
import { purchaseName } from '@/data/grow-plan';
import { suppliers, supplierById, supplierLocation, SUPPLY_KINDS } from '@/data/suppliers';
import { querySuppliers, supplyStats, matchGrowPlanToSuppliers, supplyKindOf } from '@/engine/suppliers';
import { growPlanSeed } from '@/data/grow-plans-seed';

const growPlan = growPlanSeed.find((p) => p.code === 'BROC-01')!;

describe('farm suppliers — the record', () => {
  it('is the vendors Vallecito bought from, each whole: an id, what it supplies, a brand on record, what was bought, a tag', () => {
    expect(suppliers.length).toBeGreaterThanOrEqual(4);
    expect(new Set(suppliers.map((s) => s.id)).size).toBe(suppliers.length);
    for (const s of suppliers) {
      expect(s.supplies.length).toBeGreaterThan(0);
      expect(s.supplies.every((k) => SUPPLY_KINDS.includes(k))).toBe(true);
      expect(s.brands.length).toBeGreaterThan(0);
      expect(s.bought.length).toBeGreaterThan(0);
      expect(['DATED', 'STATED']).toContain(s.tag);
      if (s.geoSource === 'city') expect(s.lat !== null && s.lng !== null).toBe(true);
      else expect(s.lat === null && s.lng === null).toBe(true);
    }
    expect(supplierById('true-leaf-market')?.supplies).toEqual(['seed']);
    expect(supplierById('amazon')?.brands).toEqual(['Mars Hydro', 'Barrina', 'Vivosun']);
    expect(supplierById('nobody')).toBeNull();
  });
  it('a supplier with a city is placed there; a marketplace or an online shop is Online', () => {
    expect(supplierLocation(supplierById('bootstrap-farmer')!)).toBe('Paris, TX');
    expect(supplierLocation(supplierById('amazon')!)).toBe('Online');
  });
});

describe('farm suppliers — filters and counts', () => {
  it('filters by what a supplier supplies and by text over name, brand and what was bought', () => {
    expect(querySuppliers(suppliers, { kind: 'seed' }).map((s) => s.id).sort()).toEqual(['bootstrap-farmer', 'true-leaf-market']);
    expect(querySuppliers(suppliers, { q: 'domes' }).map((s) => s.id)).toEqual(['bootstrap-farmer']);
    expect(querySuppliers(suppliers, { kind: 'trays' }).map((s) => s.id).sort()).toEqual(['bootstrap-farmer', 'on-the-grow']);
    expect(querySuppliers(suppliers, { q: 'barrina' }).map((s) => s.id)).toEqual(['amazon']);
    expect(querySuppliers(suppliers, { q: 'hemp' }).map((s) => s.id)).toEqual(['bootstrap-farmer']);
    expect(querySuppliers(suppliers, { kind: 'nutrients' })).toEqual([]);
  });
  it('counts by kind and the placed', () => {
    const s = supplyStats(suppliers);
    expect(s.total).toBe(suppliers.length);
    expect(s.byKind.seed).toBe(2);
    expect(s.byKind.nutrients).toBe(0);
    expect(s.placed).toBe(2);
  });
});

describe('farm suppliers — grow plan match', () => {
  it('matches each line the plan buys to the suppliers that supply its kind', () => {
    const m = matchGrowPlanToSuppliers(suppliers, growPlan);
    expect(m.map((line) => line.input)).toEqual([...new Set(growPlan.lines.map((l) => purchaseName(l)))]);
    const seed = m.find((line) => line.kind === 'seed')!;
    expect(seed.matches.map((s) => s.id).sort()).toEqual(['bootstrap-farmer', 'true-leaf-market']);
    const light = m.find((line) => line.kind === 'lights')!;
    expect(light.matches.map((s) => s.id)).toEqual(['amazon']);
    const nutrient = m.find((line) => line.kind === 'nutrients')!;
    expect(nutrient.matches).toEqual([]);
    expect(growPlan.lines.map(supplyKindOf)).toContain('medium');
  });
});
