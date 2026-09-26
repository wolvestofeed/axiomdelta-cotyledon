/**
 * MicroFarm — two placed days side by side (scheduler build plan W5, §5.3).
 */

import { describe, it, expect } from 'vitest';
import { compareDays, violationDelta } from '@/engine/compare';
import type { ScheduleResult } from '@/engine/scheduler';

const result = (over: Partial<ScheduleResult['metrics']> = {}, violations: ScheduleResult['violations'] = []): ScheduleResult => ({
  date: '2027-02-01',
  crewMode: 'requirement',
  openMin: 420,
  closeMin: 1140,
  blocks: [],
  violations,
  metrics: {
    sowingsPlaced: 4,
    sowingsUnplaced: 0,
    unitsPlaced: 1100,
    dispatchesPlaced: 1,
    dispatchesUnplaced: 0,
    unitsShipped: 900,
    firstStartMin: 420,
    lastEndMin: 1000,
    makespanMin: 580,
    utilizationByResource: { 'Blackout rack, 200 lb capacity': 0.6, 'Jar stand oven, full size 20-pan': 0.3 },
    bindingResourceKey: 'Blackout rack, 200 lb capacity',
    laborHours: 20,
    sowingLaborHours: 14,
    harvestLaborHours: 6,
    closedownHours: 1,
    crewHours: 24,
    idleCrewHours: 4,
    ...over,
  },
});

const shortfall = (n: number): ScheduleResult['violations'][number] => ({ kind: 'crew-shortfall', startMin: 480, endMin: 495, required: 4, scheduled: 2, detail: `short ${n}` });
const overCapacity: ScheduleResult['violations'][number] = { kind: 'resource-over-capacity', resourceKey: 'CH', jobs: 6, jobsInsideDay: 4, detail: 'over' };

describe('farm compare — the same day under two scenarios', () => {
  it('tables each measure with both sides and the difference', () => {
    const c = compareDays({ label: 'Plan', result: result() }, { label: 'Two crews', result: result({ unitsPlaced: 1375, sowingsPlaced: 5, laborHours: 24, idleCrewHours: 2, crewHours: 36 }) });
    const row = (key: string) => c.rows.find((r) => r.key === key)!;
    expect(c.labelA).toBe('Plan');
    expect(c.labelB).toBe('Two crews');
    expect(row('units')).toMatchObject({ a: 1100, b: 1375, delta: 275, better: 'b' });
    expect(row('idle')).toMatchObject({ a: 4, b: 2, delta: -2, better: 'b' });
    expect(row('violations')).toMatchObject({ a: 0, b: 0, delta: 0, better: 'same' });
    expect(c.identical).toBe(false);
  });

  it('labor is minutes per unit, never a rate', () => {
    const c = compareDays({ label: 'A', result: result() }, { label: 'B', result: result({ laborHours: 24, unitsPlaced: 1375 }) });
    const per = c.rows.find((r) => r.key === 'laborPerUnit')!;
    expect(per.a).toBeCloseTo((20 * 60) / 1100, 9);
    expect(per.b).toBeCloseTo((24 * 60) / 1375, 9);
    expect(per.better).toBe('b'); // fewer minutes a unit
    expect(c.rows.some((r) => /\$|dollar|cost/i.test(r.label))).toBe(false);
  });

  it('the binding resource is a fact, not a score, and reads null when nothing ran', () => {
    const c = compareDays({ label: 'A', result: result() }, { label: 'B', result: result({ bindingResourceKey: 'Jar stand oven, full size 20-pan' }) });
    const binding = c.rows.find((r) => r.key === 'binding')!;
    expect(binding).toMatchObject({ a: 'Blackout rack, 200 lb capacity', b: 'Jar stand oven, full size 20-pan', delta: null, better: null });
    const none = compareDays({ label: 'A', result: result({ bindingResourceKey: null }) }, { label: 'B', result: result({ bindingResourceKey: null }) });
    expect(none.rows.find((r) => r.key === 'binding')!.a).toBeNull();
  });

  it('the daily stream rows appear when a side carries one, beside the placed labor', () => {
    const c = compareDays({ label: 'A', result: result(), daily: { traysOnShelf: 20, minutes: 15.7 } }, { label: 'B', result: result(), daily: { traysOnShelf: 40, minutes: 31.4 } });
    expect(c.rows.find((r) => r.key === 'onShelf')).toMatchObject({ a: 20, b: 40, delta: 20, better: null });
    expect(c.rows.find((r) => r.key === 'daily')).toMatchObject({ a: 15.7, b: 31.4, better: null });
    expect(c.rows.find((r) => r.key === 'labor')!.a).toBe(c.rows.find((r) => r.key === 'labor')!.b);
    expect(c.identical).toBe(false);
    expect(compareDays({ label: 'A', result: result() }, { label: 'B', result: result() }).rows.some((r) => r.key === 'daily')).toBe(false);
  });

  it('two runs of the same scenario are identical', () => {
    const c = compareDays({ label: 'A', result: result() }, { label: 'A', result: result() });
    expect(c.identical).toBe(true);
    expect(c.rows.every((r) => r.delta === null || r.delta === 0)).toBe(true);
  });

  it('unplaced sowings and findings count against a side', () => {
    const c = compareDays(
      { label: 'Requirement', result: result({}, [shortfall(1), shortfall(2)]) },
      { label: 'Constrained', result: result({ sowingsUnplaced: 2, unitsPlaced: 550, sowingsPlaced: 2 }, []) },
    );
    expect(c.rows.find((r) => r.key === 'unplaced')).toMatchObject({ a: 0, b: 2, better: 'a' });
    expect(c.rows.find((r) => r.key === 'violations')).toMatchObject({ a: 2, b: 0, better: 'b' });
    expect(c.rows.find((r) => r.key === 'units')!.better).toBe('a');
  });
});

describe('farm compare — the findings that differ', () => {
  it('lists only the kinds the two days disagree on, with a count each', () => {
    const d = violationDelta(result({}, [shortfall(1), shortfall(2), overCapacity]), result({}, [overCapacity]));
    expect(d).toEqual([{ kind: 'crew-shortfall', a: 2, b: 0 }]);
  });

  it('is empty when both days raise the same findings', () => {
    expect(violationDelta(result({}, [overCapacity]), result({}, [overCapacity]))).toEqual([]);
    expect(violationDelta(result(), result())).toEqual([]);
  });
});
