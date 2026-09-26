import { describe, it, expect } from 'vitest';
import { recipe, assumptions } from '../src/app/(muse)/muse/_data/plan-data';
import { deriveCapacity } from '../src/app/(muse)/muse/_engine';
import { resolveScenarioInputs, ingredientKey, assumptionsFor } from '../src/app/(muse)/muse/_engine/scenario';
import { standardBatchRecordPrefill, type ActualsBundle, type BatchRecordDoc } from '../src/app/(muse)/muse/_engine/actuals';
import { postActuals } from '../src/app/(muse)/muse/_engine/actuals-ledger';
import { standardInForce, standardHistory, nextStandardVersion, standardDiffers, standardLabel, libraryLabel, type StandardVersionDoc } from '../src/app/(muse)/muse/_engine/standards';

const batchSize = deriveCapacity(recipe).batchSize;
// What an approval freezes since Roadmap N3: the recipe at its OWN assumptions —
// its labor standard and packaging — from the resolved plan, not the typed
// shared ones every recipe used to share.
const R0 = resolveScenarioInputs();
const ownAssumptions = assumptionsFor(R0, recipe.code);
const version = (n: number, effectiveFrom: string, over: Partial<StandardVersionDoc> = {}): StandardVersionDoc => ({
  id: `s${n}`, recipeCode: recipe.code, version: n, effectiveFrom, approvedBy: 'cpa@example.com', approvedAt: `${effectiveFrom}T09:00:00.000Z`, notes: null,
  snapshot: { recipe: structuredClone(recipe), assumptions: structuredClone(ownAssumptions) }, ...over,
});
const batch = (productionDate: string, standardVersion = libraryLabel(recipe.code)): BatchRecordDoc => ({
  ...standardBatchRecordPrefill(productionDate, 1, batchSize, recipe, assumptions.yield.shrinkAllowance.value, standardVersion),
  id: `b-${productionDate}`,
  closedAt: null,
  closedBy: 'R. Bogatin',
});
const bundle = (batches: BatchRecordDoc[], standards?: StandardVersionDoc[]): ActualsBundle => ({ batches, receipts: [], deliveries: [], bills: [], ...(standards ? { standards } : {}) });

describe('approved standard versions (Roadmap J5)', () => {
  const versions = [version(1, '2026-08-01'), version(2, '2026-09-15'), version(3, '2026-09-15', { notes: 'same-day correction' })];

  it('picks the latest effective date on or before the production date, highest version on a tie', () => {
    expect(standardInForce(versions, recipe.code, '2026-07-31')).toBeNull();
    expect(standardInForce(versions, recipe.code, '2026-08-01')?.version).toBe(1);
    expect(standardInForce(versions, recipe.code, '2026-09-14')?.version).toBe(1);
    expect(standardInForce(versions, recipe.code, '2026-09-15')?.version).toBe(3);
    expect(standardInForce(versions, 'AMK-E-999', '2026-09-15')).toBeNull();
  });

  it('history is newest first, the next version number follows the highest, labels are code@vN', () => {
    expect(standardHistory(versions, recipe.code).map((v) => v.version)).toEqual([3, 2, 1]);
    expect(nextStandardVersion(versions, recipe.code)).toBe(4);
    expect(nextStandardVersion(versions, 'AMK-E-999')).toBe(1);
    expect(standardLabel(versions[0]!)).toBe(`${recipe.code}@v1`);
    expect(libraryLabel(recipe.code)).toBe(`${recipe.code}@library`);
  });

  it('a snapshot differs from the live standard when a price or an assumption moved', () => {
    const live = { recipe: structuredClone(recipe), assumptions: structuredClone(ownAssumptions) };
    expect(standardDiffers(versions[0]!.snapshot, live)).toBe(false);
    const dearer = structuredClone(live);
    dearer.recipe.ingredients[0]!.apUnitCost *= 1.1;
    expect(standardDiffers(versions[0]!.snapshot, dearer)).toBe(true);
  });

  it('the ledger costs a batch at the version in force, not at the live library', () => {
    const first = recipe.ingredients[0]!;
    const dearer = resolveScenarioInputs({ ingredients: { [ingredientKey(recipe.code, first.name)]: { apUnitCost: first.apUnitCost * 2 } } });
    const std = version(1, '2026-09-01');
    const atStandard = postActuals(bundle([batch('2026-09-14', standardLabel(std))], [std]), dearer);
    const atLibrary = postActuals(bundle([batch('2026-09-14')]), dearer);
    const base = postActuals(bundle([batch('2026-09-14')]));
    const fg = (r: ReturnType<typeof postActuals>) => r.periods[0]!.batches[0]!.amounts.finishedGoodsCost;
    expect(fg(atStandard)).toBeCloseTo(fg(base), 6); // frozen snapshot: the library price rise does not reach it
    expect(fg(atLibrary)).toBeGreaterThan(fg(base)); // no version in force: costed at the live library
    expect(atLibrary.periods[0]!.notes.some((n) => n.includes('no approved standard in force'))).toBe(true);
    expect(atStandard.periods[0]!.notes.some((n) => n.includes('no approved standard'))).toBe(false);
    expect(atStandard.balanced && atLibrary.balanced).toBe(true);
  });

  it('a record naming a different version than the one in force is costed at the one in force, with a note', () => {
    const std = version(2, '2026-09-01');
    const posted = postActuals(bundle([batch('2026-09-14', `${recipe.code}@v1`)], [std]));
    expect(posted.periods[0]!.notes.some((n) => n.includes(`names ${recipe.code}@v1; the version in force on 2026-09-14 is ${recipe.code}@v2`))).toBe(true);
  });

  it('the prefill names the standard it was built from', () => {
    expect(standardBatchRecordPrefill('2026-09-14', 1, batchSize, recipe).standardVersion).toBe(`${recipe.code}@library`);
    expect(standardBatchRecordPrefill('2026-09-14', 1, batchSize, recipe, 0.03, `${recipe.code}@v7`).standardVersion).toBe(`${recipe.code}@v7`);
  });

  it('a standard freezes the recipe\'s own labor, not the typed figure every recipe shared (Roadmap N3)', () => {
    const typed = assumptions.laborSplit.variableMinutesPerPortion.value;
    const own = ownAssumptions.laborSplit.variableMinutesPerPortion.value;
    // AMK-E-001's own estimated study is not the plan's linear 1.5 min a portion.
    expect(own).not.toBeCloseTo(typed, 3);
    expect(version(1, '2026-09-01').snapshot.assumptions.laborSplit.variableMinutesPerPortion.value).toBeCloseTo(own, 10);
  });

  it('a standard carrying an overhead rate absorbs at it, not at the live rate (audit A15)', () => {
    const std = version(1, '2026-09-01', { snapshot: { recipe: structuredClone(recipe), assumptions: structuredClone(ownAssumptions), overheadRatePerMeal: 9.99 } });
    const frozen = postActuals(bundle([batch('2026-09-14', standardLabel(std))], [std]));
    const live = postActuals(bundle([batch('2026-09-14', standardLabel(version(1, '2026-09-01')))], [version(1, '2026-09-01')]));
    const absorbed = (r: ReturnType<typeof postActuals>) => r.periods[0]!.batches[0]!.amounts.overheadAbsorbed;
    const meals = frozen.periods[0]!.batches[0]!.amounts.mealsProduced;
    expect(absorbed(frozen)).toBeCloseTo(9.99 * meals, 6);
    expect(absorbed(live)).not.toBeCloseTo(absorbed(frozen), 2);
  });

  it('a standard approved before rates were frozen absorbs at the live rate, and the ledger says so', () => {
    const legacy = version(1, '2026-09-01'); // no overheadRatePerMeal on the snapshot
    const r = postActuals(bundle([batch('2026-09-14', standardLabel(legacy))], [legacy]));
    expect(r.periods[0]!.notes.some((n) => n.includes('before standards froze the overhead rate'))).toBe(true);
  });

  it('a changed overhead rate counts as a difference only when both sides carry one', () => {
    const withRate = { recipe: structuredClone(recipe), assumptions: structuredClone(ownAssumptions), overheadRatePerMeal: 1.35 };
    expect(standardDiffers(withRate, { ...withRate, overheadRatePerMeal: 1.35 })).toBe(false);
    expect(standardDiffers(withRate, { ...withRate, overheadRatePerMeal: 1.4 })).toBe(true);
    const legacy = { recipe: structuredClone(recipe), assumptions: structuredClone(ownAssumptions) };
    expect(standardDiffers(legacy, withRate)).toBe(false);
  });
});
