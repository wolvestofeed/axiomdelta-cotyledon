/**
 * MicroFarm — two crop plans costed under one forecast (agentic-assistance build plan R2).
 */

import { describe, it, expect } from 'vitest';
import { compareCropPlans, cropPlanSideFigures, type CropPlanSide } from '@/app/(farm)/farm/_engine/crop-plan-compare';
import { resolveScenarioInputs } from '@/app/(farm)/farm/_engine/scenario';
import { cropPlanCostInputs } from '@/app/(farm)/farm/_engine/unit-cost';
import { deriveCapacity } from '@/app/(farm)/farm/_engine/index';
import { estimatedTimeStudy } from '@/app/(farm)/farm/_engine/time-study-estimate';
import { seedPackagingLibrary } from '@/app/(farm)/farm/_data/packaging';
import type { CropPlanDef } from '@/app/(farm)/farm/_data/plan-data';
import type { TimeStudyDoc } from '@/app/(farm)/farm/_data/time-studies';

const resolved = resolveScenarioInputs();
const cap = resolved.capacityInputs;
const shared = resolved.assumptions;
const packaging = seedPackagingLibrary();

const study = (cropPlan: CropPlanDef, over: Partial<TimeStudyDoc> = {}): TimeStudyDoc => ({
  id: `study-${cropPlan.code}`,
  cropPlanCode: cropPlan.code,
  adoptedAt: null,
  adoptedBy: null,
  source: 'seed',
  ...estimatedTimeStudy(cropPlan, deriveCapacity(cropPlan, cap).sowingSize),
  ...over,
});

const side = (label: string, cropPlan: CropPlanDef, studies: TimeStudyDoc[] | null, placeholders = 0): CropPlanSide => ({
  label,
  cropPlan,
  cost: cropPlanCostInputs(cropPlan, studies, deriveCapacity(cropPlan, cap).sowingSize, packaging),
  placeholders,
});

const source = resolved.cropPlan;

describe('compareCropPlans', () => {
  it('two identical crop plans give an identical table', () => {
    const a = side('A', source, null);
    const b = side('B', structuredClone(source), null);
    const c = compareCropPlans(a, b, cap, shared);
    expect(c.identical).toBe(true);
    expect(c.rows.every((r) => r.delta === null || Math.abs(r.delta) < 1e-9)).toBe(true);
    expect(c.rows.map((r) => r.key)).toContain('costToServe');
  });

  it('a dropped step moves only the labor rows', () => {
    const a = side('A', source, [study(source)]);
    const s = study(source);
    const dropped = s.lines.find((l) => l.scalesWith === 'variable' && l.stream === 'sowing')!;
    const b = side('B', structuredClone(source), [{ ...s, lines: s.lines.filter((l) => l !== dropped) }]);
    const c = compareCropPlans(a, b, cap, shared);
    const moved = c.rows.filter((r) => r.delta !== null && Math.abs(r.delta) > 1e-9).map((r) => r.key).sort();
    expect(moved).toEqual(['costToServe', 'laborDollarsSowing', 'laborDollarsUnit', 'laborMinSowing', 'laborMinUnit']);
    expect(c.rows.find((r) => r.key === 'laborMinSowing')!.better).toBe('b');
    expect(c.rows.find((r) => r.key === 'sowingFood')!.delta).toBe(0);
  });

  it('labor dollars are labor minutes at the forecast’s blended loaded wage', () => {
    const a = side('A', source, [study(source)]);
    const f = cropPlanSideFigures(a, cap, shared);
    expect(f.laborDollarsPerSowing).toBeCloseTo((f.laborMinutesPerSowing! / 60) * shared.labor.blendedLoadedWage.value, 6);
    expect(f.laborDollarsPerUnit).toBeCloseTo((f.laborMinutesPerUnit! / 60) * shared.labor.blendedLoadedWage.value, 6);
    const c = compareCropPlans(a, a, cap, shared);
    expect(c.rows.find((r) => r.key === 'laborDollarsSowing')!.note).toContain(shared.labor.blendedLoadedWage.value.toFixed(2));
  });

  it('a cheaper input moves the food rows and cost to serve, marked for B', () => {
    const cheaper = structuredClone(source) as CropPlanDef;
    cheaper.inputs[0]!.seedUnitCost *= 0.5;
    const c = compareCropPlans(side('A', source, null), side('B', cheaper, null), cap, shared);
    for (const key of ['sowingFood', 'sowingFoodShrink', 'unitFood', 'costToServe']) {
      const row = c.rows.find((r) => r.key === key)!;
      expect(row.delta!).toBeLessThan(0);
      expect(row.better).toBe('b');
    }
    expect(c.rows.find((r) => r.key === 'laborMinSowing')!.delta).toBe(0);
  });

  it('a placeholder on B is counted and marked against it', () => {
    const c = compareCropPlans(side('A', source, null), side('B', structuredClone(source), null, 3), cap, shared);
    const row = c.rows.find((r) => r.key === 'placeholders')!;
    expect(row).toMatchObject({ a: 0, b: 3, better: 'a' });
    expect(c.identical).toBe(false);
  });

  it('labor as a gap reads null and carries no direction', () => {
    const gap = side('B', structuredClone(source), []);
    expect(gap.cost.labor.basis).toBe('none');
    const c = compareCropPlans(side('A', source, null), gap, cap, shared);
    const row = c.rows.find((r) => r.key === 'laborMinSowing')!;
    expect(row.b).toBeNull();
    expect(row.better).toBeNull();
    expect(c.rows.find((r) => r.key === 'laborBasis')!.b).toBe('No study — labor is a gap');
  });
});
