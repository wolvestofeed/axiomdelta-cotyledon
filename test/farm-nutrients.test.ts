/**
 * The Nutrients & Supplements library: rows to records, keys, prices, the rows a plan names, and
 * a plan costed against its workspace's records rather than the seed list.
 */
import { describe, expect, it } from 'vitest';
import { NUTRIENT_BY_KEY, NUTRIENT_SOLUTIONS, WATER_ONLY_KEY } from '@/data/inputs-catalog';
import { tagged } from '@/data/tagged';
import { growPlanSeed } from '@/data/grow-plans-seed';
import type { GrowPlanDef } from '@/data/grow-plan';
import { costGrowPlan, defaultGrowCostContext } from '@/engine/grow-costing';
import { cropPlanToRows, rowsToGrowPlan } from '@/engine/crop-plan-library';
import { ML_PER_GAL, costPerMlFrom, deleteRefusal, nutrientFromRow, nutrientKeyFor, nutrientToRow, nutrientsForPlan, plansNaming } from '@/engine/nutrients';

const broccoli = (): GrowPlanDef => growPlanSeed.find((p) => p.code === 'BROC-01')!;
const row = (over: Record<string, unknown> = {}) => ({ id: 'r1', ...nutrientToRow(NUTRIENT_BY_KEY['floragrow-npk']!, 0, 'seed'), ...over });

describe('Nutrients & Supplements: rows to records', () => {
  it('a seed row comes back as the seed record, tags and notes kept', () => {
    for (const [i, n] of NUTRIENT_SOLUTIONS.entries()) {
      const back = nutrientFromRow({ id: `r${i}`, ...nutrientToRow(n, i, 'seed') });
      expect(back).toEqual({ ...n, id: `r${i}`, source: 'seed' });
    }
  });

  it('a malformed figure reads as a zero PLACEHOLDER, an unknown tag as PLACEHOLDER, an empty effect as none', () => {
    const r = nutrientFromRow(row({ mlPerGal: { value: 'x' }, costPerMl: { value: 0.01, status: 'GUESS' }, elicits: { effect: '  ', rows: [1] }, source: 'odd' }));
    expect(r.mlPerGal).toMatchObject({ value: 0, status: 'PLACEHOLDER' });
    expect(r.costPerMl).toMatchObject({ value: 0.01, status: 'PLACEHOLDER' });
    expect(r.elicits).toBeNull();
    expect(r.source).toBe('user_built');
  });

  it('a new key follows the name and never repeats one on file', () => {
    expect(nutrientKeyFor('Cal-Mag Plus', [])).toBe('cal-mag-plus');
    expect(nutrientKeyFor('Liquid kelp', ['liquid-kelp'])).toBe('liquid-kelp-2');
    expect(nutrientKeyFor('Liquid kelp', ['liquid-kelp', 'liquid-kelp-2'])).toBe('liquid-kelp-3');
    expect(nutrientKeyFor('***', [])).toBe('nutrient');
  });

  it('a price is what was paid over the container in ml', () => {
    expect(costPerMlFrom(175, 1)).toBeCloseTo(175 / ML_PER_GAL, 12);
    expect(costPerMlFrom(20, 0.25)).toBeCloseTo(20 / (0.25 * ML_PER_GAL), 12);
    expect(costPerMlFrom(20, 0)).toBe(0);
  });

  it('a row a plan names, and Water only, cannot be deleted', () => {
    const plans = [broccoli()];
    expect(plansNaming('floragrow-npk', plans)).toEqual(['BROC-01']);
    expect(deleteRefusal('floragrow-npk', plans)).toContain('BROC-01');
    expect(deleteRefusal(WATER_ONLY_KEY, [])).not.toBeNull();
    expect(deleteRefusal('kelp', plans)).toBeNull();
  });
});

describe('a plan is costed against its workspace library', () => {
  const doubled = { ...NUTRIENT_BY_KEY['floragrow-npk']!, costPerMl: tagged(2 * NUTRIENT_BY_KEY['floragrow-npk']!.costPerMl.value, 'STATED', '$/ml', 'test') };

  it('the read attaches only the records the plan names, and never stores them', () => {
    const { header, lines } = cropPlanToRows(broccoli());
    const back = rowsToGrowPlan({ ...header, id: 'x', version: 1, effectiveFrom: null, updatedAt: new Date() }, lines, { 'floragrow-npk': doubled, kelp: NUTRIENT_BY_KEY['kelp']! });
    expect(Object.keys(back.nutrients ?? {})).toEqual(['floragrow-npk']);
    expect(nutrientsForPlan(broccoli(), {})).toEqual({});
    expect(JSON.stringify(cropPlanToRows(back))).not.toContain('nutrients');
  });

  it("the plan's record stands over the seed list; with none, the seed list prices it", () => {
    const seedCost = costGrowPlan(broccoli()).lines.find((l) => l.line.kind === 'nutrient')!;
    const withLibrary = costGrowPlan({ ...broccoli(), nutrients: { 'floragrow-npk': doubled } }).lines.find((l) => l.line.kind === 'nutrient')!;
    expect(withLibrary.costPerTray).toBeCloseTo(2 * seedCost.costPerTray, 12);
    expect(withLibrary.status).toBe('STATED');
    const viaContext = costGrowPlan(broccoli(), defaultGrowCostContext({ nutrients: { 'floragrow-npk': doubled } })).lines.find((l) => l.line.kind === 'nutrient')!;
    expect(viaContext.costPerTray).toBeCloseTo(withLibrary.costPerTray, 12);
  });
});
