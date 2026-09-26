import { describe, it, expect } from 'vitest';
import { cropPlan as seed, type CropPlanDef } from '../src/app/(farm)/farm/_data/plan-data';
import { resolveScenarioInputs, inputKey } from '../src/app/(farm)/farm/_engine/scenario';
import {
  rowsToCropPlan,
  cropPlanToRows,
  nextCropPlanCode,
  specForTrayFormat,
  normalizeLines,
  blankInputLine,
  referenceCropPlan,
} from '../src/app/(farm)/farm/_engine/crop-plan-library';
import { costCropPlan, deriveCapacity } from '../src/app/(farm)/farm/_engine';
import { creditCropPlan, creditableLines } from '../src/app/(farm)/farm/_engine/nutrition';

function second(): CropPlanDef {
  return {
    ...structuredClone(seed),
    code: 'AMK-E-002',
    name: 'Second bowl',
    status: 'developing',
    channels: [2, 3],
    inputs: seed.inputs.map((l) => ({ ...l, seedQtyPerSowing: l.seedQtyPerSowing * 2 })),
  };
}

describe('crop plan library — the engine reads a library crop plan like the seed', () => {
  it('the seed is In Service on Phase 1 and typed as a library crop plan', () => {
    expect(seed.status).toBe('in_service');
    expect(seed.channels).toEqual([1]);
  });

  it('round-trips through rows and back without changing what the engine computes', () => {
    const { header, lines } = cropPlanToRows(seed);
    const back = rowsToCropPlan(
      { ...header, id: 'x', version: 1, effectiveFrom: '2026-09-13', updatedAt: '2026-09-13T00:00:00.000Z' },
      lines,
    );
    expect(back.code).toBe(seed.code);
    expect(back.inputs).toHaveLength(seed.inputs.length);
    expect(costCropPlan(back).totalInputCostPerUnit).toBeCloseTo(costCropPlan(seed).totalInputCostPerUnit, 10);
    expect(deriveCapacity(back).sowingSize).toBe(deriveCapacity(seed).sowingSize);
    expect(creditCropPlan(creditableLines(back), '9-12').grainsOzEq).toBe(creditCropPlan(creditableLines(seed), '9-12').grainsOzEq);
  });

  it('lines come back in position order even if stored out of order', () => {
    const { header, lines } = cropPlanToRows(seed);
    const shuffled = [...lines].reverse();
    const back = rowsToCropPlan({ ...header, id: 'x', version: 1, effectiveFrom: null, updatedAt: new Date() }, shuffled);
    expect(back.inputs.map((l) => l.name)).toEqual(seed.inputs.map((l) => l.name));
  });

  it('an unknown status or an empty spec fall back rather than throw', () => {
    const { header, lines } = cropPlanToRows(seed);
    const back = rowsToCropPlan({ ...header, status: 'weird', spec: {}, id: 'x', version: 1, effectiveFrom: null, updatedAt: new Date() }, lines);
    expect(back.status).toBe('developing');
    expect(back.spec.trayFormat.value).toBe('9-12');
  });

  it('numbers the next code past the highest in the library', () => {
    expect(nextCropPlanCode([])).toBe('AMK-E-001');
    expect(nextCropPlanCode(['AMK-E-001', 'AMK-E-007', 'OTHER-1'])).toBe('AMK-E-008');
  });

  it('a new crop plan spec takes its nutrition target from the tray format pattern', () => {
    const k5 = specForTrayFormat('K-5', 12);
    expect(k5.nutritionTarget.mmaOzEq.value).toBe(1);
    expect(k5.nutritionTarget.grainsOzEq.value).toBe(1);
    expect(k5.servingGrowUnitCapacityOz.value).toBe(12);
    expect(k5.servingGrowUnitCapacityOz.status).toBe('PLACEHOLDER');
    expect(specForTrayFormat('9-12').nutritionTarget.mmaOzEq.value).toBe(2);
  });

  it('a blank line is placeholder-tagged and normalising recomputes the harvested yield', () => {
    const l = blankInputLine('Test');
    expect(l.status).toBe('PLACEHOLDER');
    expect(l.yieldStatus).toBe('PLACEHOLDER');
    const n = normalizeLines([{ ...l, seedQtyPerSowing: 10, yieldToHarvest: 0.8, harvestedYieldPerSowing: 999 }]);
    expect(n[0].harvestedYieldPerSowing).toBeCloseTo(8, 9);
  });
});

describe('scenario resolver with a library', () => {
  it('defaults to the seed list when no library is given', () => {
    const r = resolveScenarioInputs();
    expect(r.cropPlans).toHaveLength(1);
    expect(r.cropPlan.code).toBe('AMK-E-001');
  });

  it('carries every library crop plan and picks the first In Service as the reference', () => {
    const lib = [second(), seed];
    const r = resolveScenarioInputs({}, lib);
    expect(r.cropPlans.map((x) => x.code)).toEqual(['AMK-E-002', 'AMK-E-001']);
    expect(r.cropPlan.code).toBe('AMK-E-001');
    expect(referenceCropPlan(lib)?.code).toBe('AMK-E-001');
  });

  it('an input edit keyed by crop plan code applies to that crop plan only', () => {
    const lib = [seed, second()];
    const r = resolveScenarioInputs({ inputs: { [inputKey('AMK-E-002', 'Ground beef, 85/15')]: { seedUnitCost: 9 } } }, lib);
    const beef = (code: string) => r.cropPlans.find((x) => x.code === code)!.inputs.find((l) => l.name.startsWith('Ground beef'))!;
    expect(beef('AMK-E-002').seedUnitCost).toBe(9);
    expect(beef('AMK-E-001').seedUnitCost).toBe(7.5);
  });

  it('a legacy bare-name key still applies to the seed crop plan', () => {
    const lib = [seed, second()];
    const r = resolveScenarioInputs({ inputs: { 'Ground beef, 85/15': { seedUnitCost: 8 } } }, lib);
    const beef = (code: string) => r.cropPlans.find((x) => x.code === code)!.inputs.find((l) => l.name.startsWith('Ground beef'))!;
    expect(beef('AMK-E-001').seedUnitCost).toBe(8);
    expect(beef('AMK-E-002').seedUnitCost).toBe(7.5);
  });

  it('a yield edit recomputes the harvested yield on the edited crop plan', () => {
    const r = resolveScenarioInputs({ inputs: { [inputKey('AMK-E-001', 'Pinto beans, dry')]: { yieldToHarvest: 2.4 } } }, [seed]);
    const beans = r.cropPlan.inputs.find((l) => l.name.startsWith('Pinto'))!;
    expect(beans.harvestedYieldPerSowing).toBeCloseTo(6.25 * 2.4, 9);
  });
});
