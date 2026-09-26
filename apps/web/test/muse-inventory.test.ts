import { describe, it, expect } from 'vitest';
import { factorFingerprint, restatementCheck, fullInventory } from '@/app/(muse)/muse/_engine/inventory';
import { resolveScenarioInputs, AUDIT_DEFAULTS } from '@/app/(muse)/muse/_engine/scenario';
import { factorRegistry } from '@/app/(muse)/muse/_data/emission-factors';
import { recipeFoodFootprint } from '@/app/(muse)/muse/_engine/carbon';
import { emptySustainabilityBasis, type SustainabilityBasis } from '@/app/(muse)/muse/_engine/sustainability-basis';
import { sites } from '@/app/(muse)/muse/_data/seed-invented';

/** A year's volume on one recipe at its own channel: 10,000 meals to one seed site, 10,000 portions produced. */
function basisFor(code: string, channel: number): SustainabilityBasis {
  return {
    ...emptySustainabilityBasis('actual', '2026-01-01', '2026-12-31'),
    meals: [{ recipeCode: code, channel, meals: 10_000 }],
    totalMeals: 10_000,
    deliveryDays: 180,
    productionDays: 90,
    producedByRecipe: { [code]: 10_000 },
    bySite: [{ siteId: sites[0].id, siteName: sites[0].name, meals: 10_000, deliveryDays: 180 }],
  };
}

describe('muse inventory — factor fingerprint', () => {
  it('is stable, order-independent, and changes when a version changes', () => {
    const a = factorFingerprint(factorRegistry);
    const b = factorFingerprint([...factorRegistry].reverse());
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    const bumped = factorRegistry.map((f, i) => (i === 0 ? { ...f, version: `${f.version} (revised)` } : f));
    expect(factorFingerprint(bumped)).not.toBe(a);
  });
});

describe('muse inventory — restatement check', () => {
  const fp = factorFingerprint();
  it('no baseline → nothing indicated', () => {
    const c = restatementCheck(1000, fp, AUDIT_DEFAULTS);
    expect(c.hasBaseline).toBe(false);
    expect(c.restatementIndicated).toBe(false);
  });
  it('within threshold and same factor set → not indicated', () => {
    const c = restatementCheck(1030, fp, { ...AUDIT_DEFAULTS, baselineTotalKg: 1000, baselineFingerprint: fp, baselineRecordedOn: '2026-01-01', baselineYear: 2026 });
    expect(c.deltaShare).toBeCloseTo(0.03, 9);
    expect(c.restatementIndicated).toBe(false);
  });
  it('above threshold → indicated with the reason', () => {
    const c = restatementCheck(1100, fp, { ...AUDIT_DEFAULTS, baselineTotalKg: 1000, baselineFingerprint: fp, baselineRecordedOn: '2026-01-01', baselineYear: 2026 });
    expect(c.restatementIndicated).toBe(true);
    expect(c.reasons[0]).toMatch(/10\.0%/);
  });
  it('changed factor set → indicated even inside the threshold', () => {
    const c = restatementCheck(1000, fp, { ...AUDIT_DEFAULTS, baselineTotalKg: 1000, baselineFingerprint: 'deadbeef', baselineRecordedOn: '2026-01-01', baselineYear: 2026 });
    expect(c.fingerprintChanged).toBe(true);
    expect(c.restatementIndicated).toBe(true);
  });
});

describe('muse inventory — full inventory from the resolved model', () => {
  it('on defaults: food reference is the recipe footprint × meals delivered, energy and refrigerants empty, waste all landfill, freight outbound only', () => {
    const R = resolveScenarioInputs({});
    const recipe = R.recipes.find((r) => r.code === R.recipe.code)!;
    const channel = recipe.channels[0];
    const inv = fullInventory(R, '2026-09-12', { basis: basisFor(recipe.code, channel), energy: R.sustainability.energy, refrigerantService: {} });
    const perMeal = recipeFoodFootprint(recipe as never).totalKgCo2ePerPortion;
    expect(inv.annualMeals).toBe(10_000);
    expect(inv.foodReferenceKg).toBeCloseTo(perMeal * 10_000, 3);
    expect(inv.foodSelectedKg).toBeCloseTo(perMeal * 10_000, 3);
    expect(inv.foodGapKg).toBeCloseTo(0, 6);
    expect(inv.lines.find((l) => l.category === 'combustion')!.kg).toBe(0);
    expect(inv.lines.find((l) => l.category === 'fugitive')!.kg).toBe(0);
    const waste = inv.lines.find((l) => l.category === 'waste')!;
    expect(waste.kg).toBeGreaterThan(0);
    expect(inv.postings.filter((p) => p.category.startsWith('waste:')).map((p) => p.category)).toEqual(['waste:landfill']);
    const freight = inv.postings.filter((p) => p.category.startsWith('freight:'));
    expect(freight.map((p) => p.category)).toEqual(['freight:outbound']);
    expect(freight[0].activityStatus).toBe('PLACEHOLDER');
    expect(inv.weakest).toBe('PLACEHOLDER');
    // Totals: scope 3 = food + waste + freight; scope 1 and 2 zero.
    const s3 = inv.foodReferenceKg + waste.kg + inv.lines.find((l) => l.category === 'freight')!.kg;
    expect(inv.reference.location.scope3Kg).toBeCloseTo(s3, 3);
    expect(inv.reference.location.totalKg).toBeCloseTo(s3, 3);
    expect(inv.normalizers.reference.kgPerMeal).toBeCloseTo(s3 / inv.annualMeals, 9);
  });
  it('energy, refrigerant, compost and basis inputs flow into the right lines and totals', () => {
    const R = resolveScenarioInputs({
      sustainability: {
        energy: { naturalGasTherms: 1000, electricityKwh: 10000, renewableShare: 0.5 },
        waste: { compostShare: 1 },
        ingredientBasis: { 'Ground beef, 85/15': 'quantis-wop-2019:beef-net' },
        equipment: { 'Walk-in freezer, 10x12, with refrigeration': { refrigerant: 'R-404A', chargeLbPerUnit: 60 } },
      },
    });
    const recipe = R.recipes.find((r) => r.code === R.recipe.code)!;
    const inv = fullInventory(R, '2026-09-12', {
      basis: basisFor(recipe.code, recipe.channels[0]),
      energy: R.sustainability.energy,
      refrigerantService: { 'Walk-in freezer, 10x12, with refrigeration': [{ date: '2026-04-01', lbAdded: 4 }] },
    });
    expect(inv.lines.find((l) => l.category === 'combustion')!.kg).toBeCloseTo(5311.45, 3);
    expect(inv.lines.find((l) => l.category === 'electricity-location')!.kg).toBeCloseTo(3516.018, 2);
    expect(inv.lines.find((l) => l.category === 'electricity-market')!.kg).toBeCloseTo(1758.009, 2);
    expect(inv.lines.find((l) => l.category === 'fugitive')!.kg).toBeCloseTo(4 * 0.45359237 * 3922, 3);
    expect(inv.postings.filter((p) => p.category.startsWith('waste:')).map((p) => p.category)).toEqual(['waste:compost']);
    expect(inv.lines.find((l) => l.category === 'waste')!.kg).toBeLessThan(0);
    expect(inv.linesOnSelectedBasis).toBe(1);
    expect(inv.foodSelectedKg).toBeLessThan(inv.foodReferenceKg);
    expect(inv.reference.location.scope1Kg).toBeCloseTo(5311.45 + 4 * 0.45359237 * 3922, 3);
    expect(inv.reference.location.scope2Kg).toBeCloseTo(3516.018, 2);
    expect(inv.reference.market.scope2Kg).toBeCloseTo(1758.009, 2);
    expect(inv.selected.location.totalKg - inv.reference.location.totalKg).toBeCloseTo(inv.foodGapKg, 3);
  });
});
