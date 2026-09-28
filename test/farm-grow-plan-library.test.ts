/**
 * Cotyledon — the scenario resolver over a library of grow plans: every library plan is carried,
 * the first In Service is the reference, and a line edit keyed by plan code applies to that plan
 * only. The library conversions themselves are in `farm-grow-plans.test.ts`.
 */

import { purchaseLines } from '@/engine/grow-purchase';
import { describe, it, expect } from 'vitest';
import { resolveScenarioInputs, inputKey } from '@/engine/scenario';
import { growPlanToRows, rowsToLibraryPlan, referenceGrowPlan, isGrowPlanCode, type LibraryGrowPlan } from '@/engine/grow-plan-library';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { VARIETY_BY_KEY } from '@/data/varieties';
import { costPlanPerUnit } from '@/engine';

const lib = (code: string, status: LibraryGrowPlan['status'] = 'in_service'): LibraryGrowPlan => {
  const p = growPlanSeed.find((x) => x.code === code)!;
  const { header, lines } = growPlanToRows({ ...p, status });
  return rowsToLibraryPlan({ ...header, id: code, version: 1, effectiveFrom: '2026-09-25', updatedAt: '2026-09-25T00:00:00.000Z' }, lines);
};

describe('scenario resolver with a library', () => {
  it('defaults to the seed grow plans when no library is given, the first In Service the reference', () => {
    const r = resolveScenarioInputs();
    expect(r.growPlans.map((x) => x.code)).toEqual(growPlanSeed.map((p) => p.code));
    expect(r.growPlans.every((x) => isGrowPlanCode(x.code))).toBe(true);
    expect(r.growPlan.code).toBe(growPlanSeed.find((p) => p.status === 'in_service')?.code ?? growPlanSeed[0]!.code);
    expect(resolveScenarioInputs({}, []).growPlans.map((x) => x.code)).toEqual(r.growPlans.map((x) => x.code));
  });

  it('carries every library plan and picks the first In Service as the reference', () => {
    const library = [lib('RAD-01', 'developing'), lib('BROC-01'), lib('PEA-01')];
    const r = resolveScenarioInputs({}, library);
    expect(r.growPlans.map((x) => x.code)).toEqual(['RAD-01', 'BROC-01', 'PEA-01']);
    expect(r.growPlan.code).toBe('BROC-01');
    expect(referenceGrowPlan(library)?.code).toBe('BROC-01');
  });

  it('a seed price edit keyed by plan code applies to that plan only', () => {
    const library = [lib('BROC-01'), lib('RAD-01')];
    const broc = VARIETY_BY_KEY['broccoli']!;
    const r = resolveScenarioInputs({ inputs: { [inputKey('BROC-01', broc.name)]: { unitCost: 9 } } }, library);
    const seedLine = (code: string) => purchaseLines(r.growPlans.find((x) => x.code === code)!)[0]!;
    expect(seedLine('BROC-01').unitCost).toBe(9);
    expect(seedLine('RAD-01').unitCost).toBe(VARIETY_BY_KEY['radish']!.seedPricePerLb.value);
    expect(costPlanPerUnit(r.growPlans[0]!, 0).lines[0]!.costPerUnit).toBeCloseTo((broc.seedGramsPer1020.value / 453.59237) * 9, 9);
  });

  it('a library plan that is not In Service still costs', () => {
    const r = resolveScenarioInputs({}, [lib('CHIA-01', 'planned')]);
    expect(r.growPlan.code).toBe('CHIA-01');
    expect(costPlanPerUnit(r.growPlan).totalInputCostPerUnit).toBeGreaterThan(0);
  });
});
