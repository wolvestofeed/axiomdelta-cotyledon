import { describe, it, expect } from 'vitest';
import { supplierOperations, supplierDataset } from '@/app/(muse)/muse/_data/suppliers';
import {
  queryOperations,
  crossRefStats,
  matchRecipeToSuppliers,
} from '@/app/(muse)/muse/_engine/suppliers';
import { recipe } from '@/app/(muse)/muse/_data/plan-data';

describe('muse suppliers — compiled dataset', () => {
  it('loads and is internally consistent', () => {
    expect(supplierOperations.length).toBe(supplierDataset.counts.total);
    expect(supplierOperations.length).toBeGreaterThan(100);
    // Two attributed sources are declared.
    expect(supplierDataset.sources).toHaveLength(2);
  });
  it('counts tie out to the operations', () => {
    const s = crossRefStats(supplierOperations);
    expect(s.certifiedOrganic).toBe(supplierDataset.counts.certified);
    expect(s.schoolReady).toBe(supplierDataset.counts.schoolReady);
    expect(s.both).toBe(supplierDataset.counts.both);
    expect(s.centralTx).toBe(supplierDataset.counts.centralTx);
  });
});

describe('muse suppliers — filters', () => {
  it('region filter returns only that region', () => {
    const ctx = queryOperations(supplierOperations, { region: 'central-tx' });
    expect(ctx.length).toBeGreaterThan(0);
    expect(ctx.every((o) => o.region === 'central-tx')).toBe(true);
  });
  it('school-ready filter returns only school-ready producers', () => {
    const sr = queryOperations(supplierOperations, { region: 'all', schoolReadyOnly: true });
    expect(sr.length).toBe(supplierDataset.counts.schoolReady);
    expect(sr.every((o) => o.schoolReady)).toBe(true);
  });
  it('text search matches product/name text', () => {
    const beef = queryOperations(supplierOperations, { region: 'all', q: 'beef' });
    expect(beef.length).toBeGreaterThan(0);
  });
  it('scope filter returns only that certified scope', () => {
    const crops = queryOperations(supplierOperations, { region: 'all', scope: 'crops' });
    expect(crops.every((o) => /^cert/i.test(o.scopes.crops))).toBe(true);
  });
});

describe('muse suppliers — recipe match', () => {
  it('returns a match set for every recipe ingredient line', () => {
    const m = matchRecipeToSuppliers(supplierOperations, 'all');
    expect(m).toHaveLength(recipe.ingredients.length);
    expect(m.every((line) => Array.isArray(line.matches))).toBe(true);
    // At least some lines find certified producers statewide.
    expect(m.some((line) => line.matches.length > 0)).toBe(true);
  });
});
