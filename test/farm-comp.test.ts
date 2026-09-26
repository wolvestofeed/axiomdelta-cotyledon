import { describe, it, expect } from 'vitest';
import { loadLaborFromWagesCents, splitLoadedLaborCents } from '@/engine/comp';
import { compDefaults } from '@/data/plan-data';

describe('farm — loaded labor split into the accounts it is owed on', () => {
  it('builds up from wages: a ~13% statutory floor and the rest of the 22% burden as benefits', () => {
    const l = loadLaborFromWagesCents(100_000, compDefaults.totalBurden);
    expect(l.payrollTaxesCents).toBe(9_750); // FICA 7.65 + FUTA 0.6 + SUTA 1.5
    expect(l.workersCompCents).toBe(3_250);
    expect(l.benefitsCents).toBe(9_000);
    expect(l.loadedCents).toBe(122_000);
  });

  it('splits loaded labor with the parts summing exactly, wages taking the residual', () => {
    const l = splitLoadedLaborCents(122_001, compDefaults.totalBurden);
    expect(l.wagesCents + l.payrollTaxesCents + l.workersCompCents + l.benefitsCents).toBe(122_001);
  });

  it('a burden below the statutory rates carries no benefits', () => {
    const l = loadLaborFromWagesCents(100_000, 0.1);
    expect(l.benefitsCents).toBe(0);
    expect(l.payrollTaxesCents + l.workersCompCents).toBe(10_000);
  });
});
