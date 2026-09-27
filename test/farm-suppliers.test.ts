import { describe, it, expect } from 'vitest';
import { lineLabel } from '@/data/grow-plan';
import { supplierOperations, supplierDataset } from '@/data/suppliers';
import {
  queryOperations,
  crossRefStats,
  matchCropPlanToSuppliers,
} from '@/engine/suppliers';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { projectCropPlan } from '@/engine/grow-plan-bridge';

const cropPlan = projectCropPlan(growPlanSeed.find((p) => p.code === 'BROC-01')!);

describe('farm suppliers — compiled dataset', () => {
  it('loads and is internally consistent', () => {
    expect(supplierOperations.length).toBe(supplierDataset.counts.total);
    expect(supplierOperations.length).toBeGreaterThan(100);
    // Two attributed sources are declared.
    expect(supplierDataset.sources).toHaveLength(2);
  });
  it('counts tie out to the operations', () => {
    const s = crossRefStats(supplierOperations);
    expect(s.certifiedOrganic).toBe(supplierDataset.counts.certified);
    expect(s.prospectReady).toBe(supplierDataset.counts.prospectReady);
    expect(s.both).toBe(supplierDataset.counts.both);
    expect(s.centralTx).toBe(supplierDataset.counts.centralTx);
  });
});

describe('farm suppliers — filters', () => {
  it('region filter returns only that region', () => {
    const ctx = queryOperations(supplierOperations, { region: 'central-tx' });
    expect(ctx.length).toBeGreaterThan(0);
    expect(ctx.every((o) => o.region === 'central-tx')).toBe(true);
  });
  it('prospect-ready filter returns only prospect-ready producers', () => {
    const sr = queryOperations(supplierOperations, { region: 'all', prospectReadyOnly: true });
    expect(sr.length).toBe(supplierDataset.counts.prospectReady);
    expect(sr.every((o) => o.prospectReady)).toBe(true);
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

describe('farm suppliers — crop plan match', () => {
  it('returns a match set for every line of a grow plan; a line with no keywords on file matches none', () => {
    const m = matchCropPlanToSuppliers(supplierOperations, 'all', cropPlan);
    expect(m.map((line) => line.input)).toEqual(cropPlan.lines.map((l) => lineLabel(l)));
    expect(m.every((line) => Array.isArray(line.matches))).toBe(true);
    // No keywords are on file for the grow plan lines yet (`todo.md`), so nothing matches.
    expect(m.every((line) => line.keywords.length === 0 && line.matches.length === 0)).toBe(true);
  });
});
