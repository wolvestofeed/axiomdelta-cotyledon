import { describe, it, expect } from 'vitest';
import { recipe as seed, type RecipeDef } from '../src/app/(muse)/muse/_data/plan-data';
import { resolveScenarioInputs, ingredientKey } from '../src/app/(muse)/muse/_engine/scenario';
import {
  rowsToRecipe,
  recipeToRows,
  nextRecipeCode,
  specForGradeGroup,
  normalizeLines,
  blankIngredientLine,
  referenceRecipe,
} from '../src/app/(muse)/muse/_engine/recipe-library';
import { costRecipe, deriveCapacity } from '../src/app/(muse)/muse/_engine';
import { creditRecipe, creditableLines } from '../src/app/(muse)/muse/_engine/crediting';

function second(): RecipeDef {
  return {
    ...structuredClone(seed),
    code: 'AMK-E-002',
    name: 'Second bowl',
    status: 'developing',
    channels: [2, 3],
    ingredients: seed.ingredients.map((l) => ({ ...l, apQtyPerBatch: l.apQtyPerBatch * 2 })),
  };
}

describe('recipe library — the engine reads a library recipe like the seed', () => {
  it('the seed is In Service on Phase 1 and typed as a library recipe', () => {
    expect(seed.status).toBe('in_service');
    expect(seed.channels).toEqual([1]);
  });

  it('round-trips through rows and back without changing what the engine computes', () => {
    const { header, lines } = recipeToRows(seed);
    const back = rowsToRecipe(
      { ...header, id: 'x', version: 1, effectiveFrom: '2026-09-13', updatedAt: '2026-09-13T00:00:00.000Z' },
      lines,
    );
    expect(back.code).toBe(seed.code);
    expect(back.ingredients).toHaveLength(seed.ingredients.length);
    expect(costRecipe(back).totalFoodCostPerPortion).toBeCloseTo(costRecipe(seed).totalFoodCostPerPortion, 10);
    expect(deriveCapacity(back).batchSize).toBe(deriveCapacity(seed).batchSize);
    expect(creditRecipe(creditableLines(back), '9-12').grainsOzEq).toBe(creditRecipe(creditableLines(seed), '9-12').grainsOzEq);
  });

  it('lines come back in position order even if stored out of order', () => {
    const { header, lines } = recipeToRows(seed);
    const shuffled = [...lines].reverse();
    const back = rowsToRecipe({ ...header, id: 'x', version: 1, effectiveFrom: null, updatedAt: new Date() }, shuffled);
    expect(back.ingredients.map((l) => l.name)).toEqual(seed.ingredients.map((l) => l.name));
  });

  it('an unknown status or an empty spec fall back rather than throw', () => {
    const { header, lines } = recipeToRows(seed);
    const back = rowsToRecipe({ ...header, status: 'weird', spec: {}, id: 'x', version: 1, effectiveFrom: null, updatedAt: new Date() }, lines);
    expect(back.status).toBe('developing');
    expect(back.spec.gradeGroup.value).toBe('9-12');
  });

  it('numbers the next code past the highest in the library', () => {
    expect(nextRecipeCode([])).toBe('AMK-E-001');
    expect(nextRecipeCode(['AMK-E-001', 'AMK-E-007', 'OTHER-1'])).toBe('AMK-E-008');
  });

  it('a new recipe spec takes its credit target from the grade group pattern', () => {
    const k5 = specForGradeGroup('K-5', 12);
    expect(k5.creditTarget.mmaOzEq.value).toBe(1);
    expect(k5.creditTarget.grainsOzEq.value).toBe(1);
    expect(k5.servingVesselCapacityOz.value).toBe(12);
    expect(k5.servingVesselCapacityOz.status).toBe('PLACEHOLDER');
    expect(specForGradeGroup('9-12').creditTarget.mmaOzEq.value).toBe(2);
  });

  it('a blank line is placeholder-tagged and normalising recomputes the cooked yield', () => {
    const l = blankIngredientLine('Test');
    expect(l.status).toBe('PLACEHOLDER');
    expect(l.yieldStatus).toBe('PLACEHOLDER');
    const n = normalizeLines([{ ...l, apQtyPerBatch: 10, yieldToCooked: 0.8, cookedYieldPerBatch: 999 }]);
    expect(n[0].cookedYieldPerBatch).toBeCloseTo(8, 9);
  });
});

describe('scenario resolver with a library', () => {
  it('defaults to the seed list when no library is given', () => {
    const r = resolveScenarioInputs();
    expect(r.recipes).toHaveLength(1);
    expect(r.recipe.code).toBe('AMK-E-001');
  });

  it('carries every library recipe and picks the first In Service as the reference', () => {
    const lib = [second(), seed];
    const r = resolveScenarioInputs({}, lib);
    expect(r.recipes.map((x) => x.code)).toEqual(['AMK-E-002', 'AMK-E-001']);
    expect(r.recipe.code).toBe('AMK-E-001');
    expect(referenceRecipe(lib)?.code).toBe('AMK-E-001');
  });

  it('an ingredient edit keyed by recipe code applies to that recipe only', () => {
    const lib = [seed, second()];
    const r = resolveScenarioInputs({ ingredients: { [ingredientKey('AMK-E-002', 'Ground beef, 85/15')]: { apUnitCost: 9 } } }, lib);
    const beef = (code: string) => r.recipes.find((x) => x.code === code)!.ingredients.find((l) => l.name.startsWith('Ground beef'))!;
    expect(beef('AMK-E-002').apUnitCost).toBe(9);
    expect(beef('AMK-E-001').apUnitCost).toBe(7.5);
  });

  it('a legacy bare-name key still applies to the seed recipe', () => {
    const lib = [seed, second()];
    const r = resolveScenarioInputs({ ingredients: { 'Ground beef, 85/15': { apUnitCost: 8 } } }, lib);
    const beef = (code: string) => r.recipes.find((x) => x.code === code)!.ingredients.find((l) => l.name.startsWith('Ground beef'))!;
    expect(beef('AMK-E-001').apUnitCost).toBe(8);
    expect(beef('AMK-E-002').apUnitCost).toBe(7.5);
  });

  it('a yield edit recomputes the cooked yield on the edited recipe', () => {
    const r = resolveScenarioInputs({ ingredients: { [ingredientKey('AMK-E-001', 'Pinto beans, dry')]: { yieldToCooked: 2.4 } } }, [seed]);
    const beans = r.recipe.ingredients.find((l) => l.name.startsWith('Pinto'))!;
    expect(beans.cookedYieldPerBatch).toBeCloseTo(6.25 * 2.4, 9);
  });
});
