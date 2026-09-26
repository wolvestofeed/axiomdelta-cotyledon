/**
 * Impact OS — the dashboard's top row: averages over every active recipe (Robert, 2026-09-15).
 */

import { describe, it, expect } from 'vitest';
import { seedLibrary } from '@/app/(muse)/muse/_data/recipes-menu';
import { assumptions, capacityInputs } from '@/app/(muse)/muse/_data/plan-data';
import { costToServe, deriveCapacity } from '@/app/(muse)/muse/_engine';
import { estimatedTimeStudy } from '@/app/(muse)/muse/_engine/time-study-estimate';
import { activeRecipeAverages, batchElapsedMinutes } from '@/app/(muse)/muse/_engine/active-averages';
import type { TimeStudyDoc } from '@/app/(muse)/muse/_data/time-studies';

const seeded: TimeStudyDoc[] = seedLibrary.map((r, i) => ({
  id: `s${i}`, recipeCode: r.code, adoptedAt: null, adoptedBy: null, source: 'seed',
  ...estimatedTimeStudy(r, deriveCapacity(r, capacityInputs).batchSize),
}));

describe('muse dashboard — averages over the active recipes', () => {
  it('counts every In Service recipe once and no other', () => {
    const a = activeRecipeAverages(seedLibrary, capacityInputs, assumptions, seeded);
    expect(a.count).toBe(seedLibrary.filter((r) => r.status === 'in_service').length);
    const planned = seedLibrary.map((r) => ({ ...r, status: 'planned' as const }));
    expect(activeRecipeAverages(planned, capacityInputs, assumptions, seeded).count).toBe(0);
  });

  it('each recipe is on its own batch and its own standard; the averages are the plain mean', () => {
    const a = activeRecipeAverages(seedLibrary, capacityInputs, assumptions, seeded);
    const e002 = a.recipes.find((r) => r.code === 'AMK-E-002')!;
    expect(e002.batch).toBe(deriveCapacity(seedLibrary.find((r) => r.code === 'AMK-E-002')!, capacityInputs).batchSize);
    expect(e002.laborBasis).toBe('estimated');
    expect(a.onEstimate).toBe(a.count);
    expect(a.withoutStudy).toBe(0);
    expect(a.foodCostPerMeal).toBeCloseTo(a.recipes.reduce((s, r) => s + r.foodCostPerMeal, 0) / a.count, 10);
    expect(a.costToServePerMeal).toBeGreaterThan(a.foodCostPerMeal);
    expect(a.foodCostPerMeal).toBeGreaterThan(a.asPurchasedPerMeal);
    for (const r of a.recipes) {
      expect(r.laborCostPerMeal).toBeCloseTo((r.laborMinutesPerMeal / 60) * assumptions.labor.blendedLoadedWage.value, 8);
      expect(r.costToServePerMeal).toBeCloseTo(costToServe(seedLibrary.find((x) => x.code === r.code)!, assumptions, capacityInputs, r.laborMinutesPerMeal).costToServe, 8);
    }
  });

  it('batch time is the study’s batch-stream clock minutes: fixed as timed, per-portion scaled to the batch; dispatch lines are not in the batch', () => {
    const study = { batchSize: 100, lines: [
      { task: 'a', station: null, staff: 2, elapsedMinutes: 30, laborMinutes: 60, scalesWith: 'fixed' as const, stream: 'batch' as const },
      { task: 'b', station: null, staff: 1, elapsedMinutes: 50, laborMinutes: 50, scalesWith: 'variable' as const, stream: 'batch' as const },
      { task: 'c', station: null, staff: 4, elapsedMinutes: 75, laborMinutes: 300, scalesWith: 'variable' as const, stream: 'dispatch' as const },
    ] };
    expect(batchElapsedMinutes(study, 200)).toBe(30 + 100);
    expect(batchElapsedMinutes(study, 100)).toBe(80);
  });

  it('a recipe with no study carries no labor — a gap, counted as one (Roadmap N3)', () => {
    const a = activeRecipeAverages(seedLibrary, capacityInputs, assumptions, []);
    expect(a.withoutStudy).toBe(a.count);
    expect(a.batchMinutes).toBe(0);
    expect(a.laborCostPerMeal).toBe(0);
    expect(a.laborMinutesPerMeal).toBe(0);
  });
});
