/**
 * The Media library: rows to records, keys, prices, the rows a plan names, and a plan costed
 * against its workspace's records rather than the seed list.
 */
import { describe, expect, it } from 'vitest';
import { GROWING_MEDIA, MEDIUM_BY_KEY, NO_MEDIUM_KEY } from '@/data/inputs-catalog';
import { tagged } from '@/data/tagged';
import { growPlanSeed } from '@/data/grow-plans-seed';
import type { GrowPlanDef } from '@/data/grow-plan';
import { costGrowPlan, defaultGrowCostContext } from '@/engine/grow-costing';
import { growPlanToRows, rowsToGrowPlan } from '@/engine/grow-plan-library';
import { costPerUnitFrom, mediaForPlan, mediumDeleteRefusal, mediumFromRow, mediumKeyFor, mediumToRow, plansNamingMedium } from '@/engine/media';

const broccoli = (): GrowPlanDef => growPlanSeed.find((p) => p.code === 'BROC-01')!;
const coir = MEDIUM_BY_KEY['coco-coir']!;
const row = (over: Record<string, unknown> = {}) => ({ id: 'r1', ...mediumToRow(coir, 0, 'seed'), ...over });

describe('Media: rows to records', () => {
  it('a seed row comes back as the seed record, tags and notes kept', () => {
    for (const [i, m] of GROWING_MEDIA.entries()) {
      const back = mediumFromRow({ id: `r${i}`, ...mediumToRow(m, i, 'seed') });
      expect(back).toEqual({ ...m, id: `r${i}`, source: 'seed' });
    }
  });

  it('a malformed figure reads as a zero PLACEHOLDER, an unknown form as loose fill in gallons, bad rows dropped', () => {
    const r = mediumFromRow(row({ form: 'odd', qtyPer1020: { value: 'x' }, costPerUnit: { value: 2, status: 'GUESS' }, rows: [8, 'x', 2.5], traits: null, source: 'odd' }));
    expect(r.form).toBe('loose');
    expect(r.unit).toBe('gal');
    expect(r.qtyPer1020).toMatchObject({ value: 0, status: 'PLACEHOLDER' });
    expect(r.costPerUnit).toMatchObject({ value: 2, status: 'PLACEHOLDER' });
    expect(r.rows).toEqual([8]);
    expect(r.traits).toEqual({ note: '' });
    expect(r.source).toBe('user_built');
  });

  it('a new key follows the name and never repeats one on file', () => {
    expect(mediumKeyFor('Coconut coir', [])).toBe('coconut-coir');
    expect(mediumKeyFor('Hemp mat', ['hemp-mat'])).toBe('hemp-mat-2');
    expect(mediumKeyFor('***', [])).toBe('medium');
  });

  it('a price is what was paid over how much it gave', () => {
    expect(costPerUnitFrom(23.19, 18.5)).toBeCloseTo(coir.costPerUnit.value, 12);
    expect(costPerUnitFrom(30, 20)).toBe(1.5);
    expect(costPerUnitFrom(30, 0)).toBe(0);
  });

  it('a row a plan names, and No medium, cannot be deleted', () => {
    const plans = [broccoli()];
    expect(plansNamingMedium('coco-coir', plans)).toEqual(['BROC-01']);
    expect(mediumDeleteRefusal('coco-coir', plans)).toContain('BROC-01');
    expect(mediumDeleteRefusal(NO_MEDIUM_KEY, [])).not.toBeNull();
    expect(mediumDeleteRefusal('hemp-mat', plans)).toBeNull();
  });
});

describe('a plan is costed against its workspace Media library', () => {
  const dearer = { ...coir, costPerUnit: tagged(2 * coir.costPerUnit.value, 'STATED', '$/gal', 'test') };

  it('the read attaches only the records the plan names, and never stores them', () => {
    const { header, lines } = growPlanToRows(broccoli());
    const back = rowsToGrowPlan({ ...header, id: 'x', version: 1, effectiveFrom: null, updatedAt: new Date() }, lines, undefined, undefined, { 'coco-coir': dearer, 'hemp-mat': MEDIUM_BY_KEY['hemp-mat']! });
    expect(Object.keys(back.media ?? {})).toEqual(['coco-coir']);
    expect(mediaForPlan(broccoli(), {})).toEqual({});
    expect(JSON.stringify(growPlanToRows(back))).not.toContain('"media"');
  });

  it("the plan's record stands over the seed list; with none, the seed list prices it", () => {
    const seedCost = costGrowPlan(broccoli()).lines.find((l) => l.line.kind === 'medium')!;
    const withLibrary = costGrowPlan({ ...broccoli(), media: { 'coco-coir': dearer } }).lines.find((l) => l.line.kind === 'medium')!;
    expect(withLibrary.costPerTray).toBeCloseTo(2 * seedCost.costPerTray, 12);
    expect(withLibrary.status).toBe('STATED');
    const viaContext = costGrowPlan(broccoli(), defaultGrowCostContext({ media: { 'coco-coir': dearer } })).lines.find((l) => l.line.kind === 'medium')!;
    expect(viaContext.costPerTray).toBeCloseTo(withLibrary.costPerTray, 12);
  });

  it('a medium added in the app, not in the seed list, costs a plan that names it', () => {
    const added = { ...MEDIUM_BY_KEY['hemp-mat']!, key: 'sunflower-hull-mat', name: 'Sunflower hull mat', costPerUnit: tagged(0.8, 'STATED', '$/each', 'test') };
    const plan: GrowPlanDef = { ...broccoli(), lines: broccoli().lines.map((l) => (l.kind === 'medium' ? { ...l, mediumKey: 'sunflower-hull-mat' } : l)), media: { 'sunflower-hull-mat': added } };
    const line = costGrowPlan(plan).lines.find((l) => l.line.kind === 'medium')!;
    expect(line.unitCost).toBe(0.8);
    expect(line.quantityUnit).toBe('each');
  });
});
