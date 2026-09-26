/**
 * Impact OS — two recipes costed under one forecast (agentic-assistance build plan R2).
 */

import { describe, it, expect } from 'vitest';
import { compareRecipes, recipeSideFigures, type RecipeSide } from '@/app/(muse)/muse/_engine/recipe-compare';
import { resolveScenarioInputs } from '@/app/(muse)/muse/_engine/scenario';
import { recipeCostInputs } from '@/app/(muse)/muse/_engine/meal-cost';
import { deriveCapacity } from '@/app/(muse)/muse/_engine/index';
import { estimatedTimeStudy } from '@/app/(muse)/muse/_engine/time-study-estimate';
import { seedPackagingLibrary } from '@/app/(muse)/muse/_data/packaging';
import type { RecipeDef } from '@/app/(muse)/muse/_data/plan-data';
import type { TimeStudyDoc } from '@/app/(muse)/muse/_data/time-studies';

const resolved = resolveScenarioInputs();
const cap = resolved.capacityInputs;
const shared = resolved.assumptions;
const packaging = seedPackagingLibrary();

const study = (recipe: RecipeDef, over: Partial<TimeStudyDoc> = {}): TimeStudyDoc => ({
  id: `study-${recipe.code}`,
  recipeCode: recipe.code,
  adoptedAt: null,
  adoptedBy: null,
  source: 'seed',
  ...estimatedTimeStudy(recipe, deriveCapacity(recipe, cap).batchSize),
  ...over,
});

const side = (label: string, recipe: RecipeDef, studies: TimeStudyDoc[] | null, placeholders = 0): RecipeSide => ({
  label,
  recipe,
  cost: recipeCostInputs(recipe, studies, deriveCapacity(recipe, cap).batchSize, packaging),
  placeholders,
});

const source = resolved.recipe;

describe('compareRecipes', () => {
  it('two identical recipes give an identical table', () => {
    const a = side('A', source, null);
    const b = side('B', structuredClone(source), null);
    const c = compareRecipes(a, b, cap, shared);
    expect(c.identical).toBe(true);
    expect(c.rows.every((r) => r.delta === null || Math.abs(r.delta) < 1e-9)).toBe(true);
    expect(c.rows.map((r) => r.key)).toContain('costToServe');
  });

  it('a dropped step moves only the labor rows', () => {
    const a = side('A', source, [study(source)]);
    const s = study(source);
    const dropped = s.lines.find((l) => l.scalesWith === 'variable' && l.stream === 'batch')!;
    const b = side('B', structuredClone(source), [{ ...s, lines: s.lines.filter((l) => l !== dropped) }]);
    const c = compareRecipes(a, b, cap, shared);
    const moved = c.rows.filter((r) => r.delta !== null && Math.abs(r.delta) > 1e-9).map((r) => r.key).sort();
    expect(moved).toEqual(['costToServe', 'laborDollarsBatch', 'laborDollarsPortion', 'laborMinBatch', 'laborMinPortion']);
    expect(c.rows.find((r) => r.key === 'laborMinBatch')!.better).toBe('b');
    expect(c.rows.find((r) => r.key === 'batchFood')!.delta).toBe(0);
  });

  it('labor dollars are labor minutes at the forecast’s blended loaded wage', () => {
    const a = side('A', source, [study(source)]);
    const f = recipeSideFigures(a, cap, shared);
    expect(f.laborDollarsPerBatch).toBeCloseTo((f.laborMinutesPerBatch! / 60) * shared.labor.blendedLoadedWage.value, 6);
    expect(f.laborDollarsPerPortion).toBeCloseTo((f.laborMinutesPerPortion! / 60) * shared.labor.blendedLoadedWage.value, 6);
    const c = compareRecipes(a, a, cap, shared);
    expect(c.rows.find((r) => r.key === 'laborDollarsBatch')!.note).toContain(shared.labor.blendedLoadedWage.value.toFixed(2));
  });

  it('a cheaper ingredient moves the food rows and cost to serve, marked for B', () => {
    const cheaper = structuredClone(source) as RecipeDef;
    cheaper.ingredients[0]!.apUnitCost *= 0.5;
    const c = compareRecipes(side('A', source, null), side('B', cheaper, null), cap, shared);
    for (const key of ['batchFood', 'batchFoodShrink', 'unitFood', 'costToServe']) {
      const row = c.rows.find((r) => r.key === key)!;
      expect(row.delta!).toBeLessThan(0);
      expect(row.better).toBe('b');
    }
    expect(c.rows.find((r) => r.key === 'laborMinBatch')!.delta).toBe(0);
  });

  it('a placeholder on B is counted and marked against it', () => {
    const c = compareRecipes(side('A', source, null), side('B', structuredClone(source), null, 3), cap, shared);
    const row = c.rows.find((r) => r.key === 'placeholders')!;
    expect(row).toMatchObject({ a: 0, b: 3, better: 'a' });
    expect(c.identical).toBe(false);
  });

  it('labor as a gap reads null and carries no direction', () => {
    const gap = side('B', structuredClone(source), []);
    expect(gap.cost.labor.basis).toBe('none');
    const c = compareRecipes(side('A', source, null), gap, cap, shared);
    const row = c.rows.find((r) => r.key === 'laborMinBatch')!;
    expect(row.b).toBeNull();
    expect(row.better).toBeNull();
    expect(c.rows.find((r) => r.key === 'laborBasis')!.b).toBe('No study — labor is a gap');
  });
});
