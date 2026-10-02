import { describe, it, expect } from 'vitest';
import { factorFingerprint, restatementCheck, fullInventory } from '@/engine/inventory';
import { resolveScenarioInputs, AUDIT_DEFAULTS } from '@/engine/scenario';
import { factorRegistry } from '@/data/emission-factors';
import { growPlanFoodFootprint } from '@/engine/carbon';
import { emptySustainabilityBasis, type SustainabilityBasis } from '@/engine/sustainability-basis';
import { pickupPoints } from '@/data/seed-invented';

/** A year's volume on one grow plan at its own channel: 10,000 units to one seed pickup point, 10,000 units produced. */
function basisFor(code: string, channel: number): SustainabilityBasis {
  return {
    ...emptySustainabilityBasis('actual', '2026-01-01', '2026-12-31'),
    units: [{ growPlanCode: code, channel, units: 10_000 }],
    totalUnits: 10_000,
    distributionDays: 180,
    productionDays: 90,
    producedByGrowPlan: { [code]: 10_000 },
    byPickupPoint: [{ pickupPointId: pickupPoints[0].id, pickupPointName: pickupPoints[0].name, units: 10_000, distributionDays: 180 }],
  };
}

describe('farm inventory — factor fingerprint', () => {
  it('is stable, order-independent, and changes when a version changes', () => {
    const a = factorFingerprint(factorRegistry);
    const b = factorFingerprint([...factorRegistry].reverse());
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    const bumped = factorRegistry.map((f, i) => (i === 0 ? { ...f, version: `${f.version} (revised)` } : f));
    expect(factorFingerprint(bumped)).not.toBe(a);
  });
});

describe('farm inventory — restatement check', () => {
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

describe('farm inventory — full inventory from the resolved model', () => {
  it('on defaults: food reference is the footprint × units distributed, energy and refrigerants empty, freight outbound only', () => {
    const R = resolveScenarioInputs({});
    const growPlan = R.growPlans.find((r) => r.code === R.growPlan.code)!;
    const channel = growPlan.channels[0];
    const inv = fullInventory(R, '2026-09-12', { basis: basisFor(growPlan.code, channel), energy: R.sustainability.energy, refrigerantService: {} });
    const perUnit = growPlanFoodFootprint(growPlan as never).totalKgCo2ePerUnit;
    expect(inv.annualUnits).toBe(10_000);
    expect(inv.foodReferenceKg).toBeCloseTo(perUnit * 10_000, 3);
    expect(inv.foodSelectedKg).toBeCloseTo(perUnit * 10_000, 3);
    expect(inv.foodGapKg).toBeCloseTo(0, 6);
    expect(inv.lines.find((l) => l.category === 'combustion')!.kg).toBe(0);
    expect(inv.lines.find((l) => l.category === 'fugitive')!.kg).toBe(0);
    // No input is mapped to a food product until Phase 5, so there is no food mass and no shrink waste from it.
    const waste = inv.lines.find((l) => l.category === 'waste')!;
    expect(waste.kg).toBe(0);
    const freight = inv.postings.filter((p) => p.category.startsWith('freight:'));
    expect(freight.map((p) => p.category)).toEqual(['freight:outbound']);
    expect(freight[0].activityStatus).toBe('PLACEHOLDER');
    expect(inv.weakest).toBe('PLACEHOLDER');
    // Totals: scope 3 = food + waste + freight; scope 1 and 2 zero.
    const s3 = inv.foodReferenceKg + waste.kg + inv.lines.find((l) => l.category === 'freight')!.kg;
    expect(inv.reference.location.scope3Kg).toBeCloseTo(s3, 3);
    expect(inv.reference.location.totalKg).toBeCloseTo(s3, 3);
    expect(inv.normalizers.reference.kgPerUnit).toBeCloseTo(s3 / inv.annualUnits, 9);
  });
  it('energy, refrigerant, compost and basis inputs flow into the right lines and totals', () => {
    const walkIn = 'Walk-in cooler, 12x20, with refrigeration';
    const R = resolveScenarioInputs({
      // A commercial forecast that selects the walk-in cooler.
      forecast: { equipment: { [walkIn]: { status: 'planned' } } },
      sustainability: {
        energy: { naturalGasTherms: 1000, electricityKwh: 10000, renewableShare: 0.5 },
        waste: { compostShare: 1 },
        equipment: { [walkIn]: { refrigerant: 'R-404A', chargeLbPerUnit: 60 } },
      },
    });
    const growPlan = R.growPlans.find((r) => r.code === R.growPlan.code)!;
    const inv = fullInventory(R, '2026-09-12', {
      basis: basisFor(growPlan.code, growPlan.channels[0]),
      energy: R.sustainability.energy,
      refrigerantService: { [walkIn]: [{ date: '2026-04-01', lbAdded: 4 }] },
    });
    expect(inv.lines.find((l) => l.category === 'combustion')!.kg).toBeCloseTo(5311.45, 3);
    expect(inv.lines.find((l) => l.category === 'electricity-location')!.kg).toBeCloseTo(3341.588, 2);
    expect(inv.lines.find((l) => l.category === 'electricity-market')!.kg).toBeCloseTo(1670.794, 2);
    expect(inv.lines.find((l) => l.category === 'fugitive')!.kg).toBeCloseTo(4 * 0.45359237 * 3922, 3);
    expect(inv.linesOnSelectedBasis).toBe(0);
    expect(inv.reference.location.scope1Kg).toBeCloseTo(5311.45 + 4 * 0.45359237 * 3922, 3);
    expect(inv.reference.location.scope2Kg).toBeCloseTo(3341.588, 2);
    expect(inv.reference.market.scope2Kg).toBeCloseTo(1670.794, 2);
    expect(inv.selected.location.totalKg - inv.reference.location.totalKg).toBeCloseTo(inv.foodGapKg, 3);
  });
});
