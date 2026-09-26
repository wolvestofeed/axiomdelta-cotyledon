/**
 * MicroFarm — the stage control points: which a plan records, and the spent-water verdict.
 */

import { describe, it, expect } from 'vitest';

describe('the stage control points (outline §4)', () => {
  it('four points, each with a stage, a limit carrying its tag and a record; the sprout limits sourced to the Produce Safety Rule', async () => {
    const { STAGE_CONTROL_POINTS, CONTROL_POINT_BY_ID } = await import('@/data/produce-safety');
    const { REFERENCE_SOURCES } = await import('@/data/sources-registry');
    expect(STAGE_CONTROL_POINTS.map((c) => c.id)).toEqual(['seed-sanitation', 'spent-water-test', 'temperature-humidity', 'harvest-check']);
    for (const c of STAGE_CONTROL_POINTS) {
      expect(c.stages.length).toBeGreaterThan(0);
      expect(c.record.length).toBeGreaterThan(0);
      if (c.sourceKey) expect(REFERENCE_SOURCES.some((r) => r.key === c.sourceKey)).toBe(true);
    }
    expect(CONTROL_POINT_BY_ID['spent-water-test'].criticalLimit.status).toBe('SOURCED');
    expect(CONTROL_POINT_BY_ID['temperature-humidity'].criticalLimit.status).toBe('PLACEHOLDER');
  });

  it('a plan records the points on its stages: a tray plan no spent-water test, a jar plan no light-stage check', async () => {
    const { controlPointsForPlan } = await import('@/engine/produce-safety');
    const { growPlanSeed } = await import('@/data/grow-plans-seed');
    const broc = controlPointsForPlan(growPlanSeed.find((p) => p.code === 'BROC-01')!).map((c) => c.id);
    expect(broc).toEqual(['seed-sanitation', 'temperature-humidity', 'harvest-check']);
    const mung = controlPointsForPlan(growPlanSeed.find((p) => p.code === 'MUNG-01')!).map((c) => c.id);
    expect(mung).toEqual(['seed-sanitation', 'spent-water-test', 'harvest-check']);
  });

  it('the spent-water verdict is computed: a positive fails, a missing result or an early sample leaves the batch uncleared', async () => {
    const { evaluateSpentWaterTest } = await import('@/engine/produce-safety');
    expect(evaluateSpentWaterTest({ sampledAtHours: 48, listeria: false, salmonella: false, ecoliO157: false })).toMatchObject({ pass: true, incomplete: false });
    expect(evaluateSpentWaterTest({ sampledAtHours: 60, listeria: false, salmonella: true, ecoliO157: false })).toMatchObject({ pass: false, incomplete: false, positives: ['salmonella'] });
    expect(evaluateSpentWaterTest({ sampledAtHours: 24, listeria: false, salmonella: false, ecoliO157: false })).toMatchObject({ pass: false, incomplete: true });
    expect(evaluateSpentWaterTest({ sampledAtHours: 48, listeria: null, salmonella: false, ecoliO157: false })).toMatchObject({ pass: false, incomplete: true });
  });
});
