/**
 * MicroFarm — the dashboard's top row: averages over every active crop plan.
 */

import { describe, it, expect } from 'vitest';
import { seedLibrary } from '@/app/(farm)/farm/_data/crop-plans-seed';
import { assumptions, capacityInputs } from '@/app/(farm)/farm/_data/plan-data';
import { costToServe, deriveCapacity } from '@/app/(farm)/farm/_engine';
import { estimatedTimeStudy } from '@/app/(farm)/farm/_engine/time-study-estimate';
import { activeCropPlanAverages, sowingElapsedMinutes } from '@/app/(farm)/farm/_engine/active-averages';
import type { TimeStudyDoc } from '@/app/(farm)/farm/_data/time-studies';

const seeded: TimeStudyDoc[] = seedLibrary.map((r, i) => ({
  id: `s${i}`, cropPlanCode: r.code, adoptedAt: null, adoptedBy: null, source: 'seed',
  ...estimatedTimeStudy(r, deriveCapacity(r, capacityInputs).sowingSize),
}));

describe('farm dashboard — averages over the active crop plans', () => {
  it('counts every In Service crop plan once and no other', () => {
    const a = activeCropPlanAverages(seedLibrary, capacityInputs, assumptions, seeded);
    expect(a.count).toBe(seedLibrary.filter((r) => r.status === 'in_service').length);
    const planned = seedLibrary.map((r) => ({ ...r, status: 'planned' as const }));
    expect(activeCropPlanAverages(planned, capacityInputs, assumptions, seeded).count).toBe(0);
  });

  it('each crop plan is on its own sowing and its own standard; the averages are the plain mean', () => {
    const a = activeCropPlanAverages(seedLibrary, capacityInputs, assumptions, seeded);
    const e002 = a.cropPlans.find((r) => r.code === 'AMK-E-002')!;
    expect(e002.sowing).toBe(deriveCapacity(seedLibrary.find((r) => r.code === 'AMK-E-002')!, capacityInputs).sowingSize);
    expect(e002.laborBasis).toBe('estimated');
    expect(a.onEstimate).toBe(a.count);
    expect(a.withoutStudy).toBe(0);
    expect(a.inputCostPerUnit).toBeCloseTo(a.cropPlans.reduce((s, r) => s + r.inputCostPerUnit, 0) / a.count, 10);
    expect(a.costToServePerUnit).toBeGreaterThan(a.inputCostPerUnit);
    expect(a.inputCostPerUnit).toBeGreaterThan(a.asPurchasedPerUnit);
    for (const r of a.cropPlans) {
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

  it('a crop plan with no study carries no labor — a gap, counted as one (Roadmap N3)', () => {
    const a = activeCropPlanAverages(seedLibrary, capacityInputs, assumptions, []);
    expect(a.withoutStudy).toBe(a.count);
    expect(a.sowingMinutes).toBe(0);
    expect(a.laborCostPerUnit).toBe(0);
    expect(a.laborMinutesPerUnit).toBe(0);
  });
});
