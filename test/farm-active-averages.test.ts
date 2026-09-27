/**
 * MicroFarm — the dashboard's top row: averages over every active grow plan.
 */

import { describe, it, expect } from 'vitest';
import { assumptions } from '@/data/plan-data';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { resolveScenarioInputs as resolveLibrary } from '@/engine/scenario';
import { costToServe, deriveCapacity } from '@/engine';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';
import { activeGrowPlanAverages, sowingElapsedMinutes } from '@/engine/active-averages';
import type { TimeStudyDoc } from '@/data/time-studies';

const seedLibrary = [...growPlanSeed];
const capacityInputs = resolveLibrary({}, seedLibrary).capacityInputs;
const seeded: TimeStudyDoc[] = seedLibrary.map((r, i) => ({
  id: `s${i}`, growPlanCode: r.code, approvedAt: null, approvedBy: null, source: 'seed',
  ...estimatedTimeStudy(r, Math.max(1, deriveCapacity(r, capacityInputs).sowingSize)),
}));

describe('farm dashboard — averages over the active grow plans', () => {
  it('counts every In Service grow plan once and no other', () => {
    const a = activeGrowPlanAverages(seedLibrary, capacityInputs, assumptions, seeded);
    expect(a.count).toBe(seedLibrary.filter((r) => r.status === 'in_service').length);
    const planned = seedLibrary.map((r) => ({ ...r, status: 'planned' as const }));
    expect(activeGrowPlanAverages(planned, capacityInputs, assumptions, seeded).count).toBe(0);
  });

  it('each grow plan is on its own sowing and its own standard; the averages are the plain mean', () => {
    const a = activeGrowPlanAverages(seedLibrary, capacityInputs, assumptions, seeded);
    const broc = a.growPlans.find((r) => r.code === 'BROC-01')!;
    expect(broc.sowing).toBe(deriveCapacity(seedLibrary.find((r) => r.code === 'BROC-01')!, capacityInputs).sowingSize);
    expect(broc.laborBasis).toBe('estimated');
    expect(a.onEstimate).toBe(a.count);
    expect(a.withoutStudy).toBe(0);
    expect(a.inputCostPerUnit).toBeCloseTo(a.growPlans.reduce((s, r) => s + r.inputCostPerUnit, 0) / a.count, 10);
    expect(a.costToServePerUnit).toBeGreaterThan(a.inputCostPerUnit);
    expect(a.inputCostPerUnit).toBeGreaterThan(a.asPurchasedPerUnit);
    for (const r of a.growPlans) {
      expect(r.laborCostPerUnit).toBeCloseTo((r.laborMinutesPerUnit / 60) * assumptions.labor.blendedLoadedWage.value, 8);
      expect(r.costToServePerUnit).toBeCloseTo(costToServe(seedLibrary.find((x) => x.code === r.code)!, assumptions, capacityInputs, r.laborMinutesPerUnit).costToServe, 8);
    }
  });

  it('sowing time is the study’s sowing-stream clock minutes: fixed as timed, per-unit scaled to the sowing; harvest lines are not in the sowing', () => {
    const study = { sowingSize: 100, lines: [
      { task: 'a', station: null, staff: 2, elapsedMinutes: 30, laborMinutes: 60, scalesWith: 'fixed' as const, stream: 'sowing' as const },
      { task: 'b', station: null, staff: 1, elapsedMinutes: 50, laborMinutes: 50, scalesWith: 'variable' as const, stream: 'sowing' as const },
      { task: 'c', station: null, staff: 4, elapsedMinutes: 75, laborMinutes: 300, scalesWith: 'variable' as const, stream: 'harvest' as const },
    ] };
    expect(sowingElapsedMinutes(study, 200)).toBe(30 + 100);
    expect(sowingElapsedMinutes(study, 100)).toBe(80);
  });

  it('a grow plan with no study carries no labor — a gap, counted as one (Roadmap N3)', () => {
    const a = activeGrowPlanAverages(seedLibrary, capacityInputs, assumptions, []);
    expect(a.withoutStudy).toBe(a.count);
    expect(a.sowingMinutes).toBe(0);
    expect(a.laborCostPerUnit).toBe(0);
    expect(a.laborMinutesPerUnit).toBe(0);
  });
});
