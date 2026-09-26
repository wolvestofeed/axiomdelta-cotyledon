/**
 * MicroFarm — the scenario resolver over a library of grow plans: every library plan is carried,
 * the first In Service is the reference, and a line edit keyed by plan code applies to that plan
 * only. The library conversions themselves are in `farm-grow-plans.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { cropPlan as seed } from '@/data/plan-data';
import { resolveScenarioInputs, inputKey } from '@/engine/scenario';
import { cropPlanToRows, rowsToCropPlan, referenceCropPlan, isGrowPlanCode, type LibraryCropPlan } from '@/engine/crop-plan-library';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { VARIETY_BY_KEY } from '@/data/varieties';
import { costCropPlan } from '@/engine';

const lib = (code: string, status: LibraryCropPlan['status'] = 'in_service'): LibraryCropPlan => {
  const p = growPlanSeed.find((x) => x.code === code)!;
  const { header, lines } = cropPlanToRows({ ...p, status });
  return rowsToCropPlan({ ...header, id: code, version: 1, effectiveFrom: '2026-09-25', updatedAt: '2026-09-25T00:00:00.000Z' }, lines);
};

describe('scenario resolver with a library', () => {
  it('defaults to the code seed when no library is given', () => {
    const r = resolveScenarioInputs();
    expect(r.cropPlans).toHaveLength(1);
    expect(r.cropPlan.code).toBe(seed.code);
    expect(isGrowPlanCode(seed.code)).toBe(false);
  });

  it('carries every library plan and picks the first In Service as the reference', () => {
    const library = [lib('RAD-01', 'developing'), lib('BROC-01'), lib('PEA-01')];
    const r = resolveScenarioInputs({}, library);
    expect(r.cropPlans.map((x) => x.code)).toEqual(['RAD-01', 'BROC-01', 'PEA-01']);
    expect(r.cropPlan.code).toBe('BROC-01');
    expect(referenceCropPlan(library)?.code).toBe('BROC-01');
  });

  it('a seed price edit keyed by plan code applies to that plan only', () => {
    const library = [lib('BROC-01'), lib('RAD-01')];
    const broc = VARIETY_BY_KEY['broccoli']!;
    const r = resolveScenarioInputs({ inputs: { [inputKey('BROC-01', broc.name)]: { seedUnitCost: 9 } } }, library);
    const seedLine = (code: string) => r.cropPlans.find((x) => x.code === code)!.inputs[0]!;
    expect(seedLine('BROC-01').seedUnitCost).toBe(9);
    expect(seedLine('RAD-01').seedUnitCost).toBe(VARIETY_BY_KEY['radish']!.seedPricePerLb.value);
    expect(costCropPlan(r.cropPlans[0]!, 0).lines[0]!.costPerUnit).toBeCloseTo((broc.seedGramsPer1020.value / 453.59237) * 9, 9);
  });

  it('a library plan that is not In Service still costs', () => {
    const r = resolveScenarioInputs({}, [lib('CHIA-01', 'planned')]);
    expect(r.cropPlan.code).toBe('CHIA-01');
    expect(costCropPlan(r.cropPlan).totalInputCostPerUnit).toBeGreaterThan(0);
  });
});
