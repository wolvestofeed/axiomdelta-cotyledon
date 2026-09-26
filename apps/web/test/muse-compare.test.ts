/**
 * Impact OS — two placed days side by side (scheduler build plan W5, §5.3).
 */

import { describe, it, expect } from 'vitest';
import { compareDays, violationDelta } from '@/app/(muse)/muse/_engine/compare';
import type { ScheduleResult } from '@/app/(muse)/muse/_engine/scheduler';

const result = (over: Partial<ScheduleResult['metrics']> = {}, violations: ScheduleResult['violations'] = []): ScheduleResult => ({
  date: '2027-02-01',
  crewMode: 'requirement',
  openMin: 420,
  closeMin: 1140,
  blocks: [],
  violations,
  metrics: {
    batchesPlaced: 4,
    batchesUnplaced: 0,
    portionsPlaced: 1100,
    dispatchesPlaced: 1,
    dispatchesUnplaced: 0,
    portionsShipped: 900,
    firstStartMin: 420,
    lastEndMin: 1000,
    makespanMin: 580,
    utilizationByResource: { 'Blast chiller, 200 lb capacity': 0.6, 'Combi oven, full size 20-pan': 0.3 },
    bindingResourceKey: 'Blast chiller, 200 lb capacity',
    laborHours: 20,
    batchLaborHours: 14,
    dispatchLaborHours: 6,
    closedownHours: 1,
    crewHours: 24,
    idleCrewHours: 4,
    ...over,
  },
});

const shortfall = (n: number): ScheduleResult['violations'][number] => ({ kind: 'crew-shortfall', startMin: 480, endMin: 495, required: 4, scheduled: 2, detail: `short ${n}` });
const overCapacity: ScheduleResult['violations'][number] = { kind: 'resource-over-capacity', resourceKey: 'CH', jobs: 6, jobsInsideDay: 4, detail: 'over' };

describe('muse compare — the same day under two scenarios', () => {
  it('tables each measure with both sides and the difference', () => {
    const c = compareDays({ label: 'Plan', result: result() }, { label: 'Two crews', result: result({ portionsPlaced: 1375, batchesPlaced: 5, laborHours: 24, idleCrewHours: 2, crewHours: 36 }) }, 'Blast chiller, 200 lb capacity');
    const row = (key: string) => c.rows.find((r) => r.key === key)!;
    expect(c.labelA).toBe('Plan');
    expect(c.labelB).toBe('Two crews');
    expect(row('portions')).toMatchObject({ a: 1100, b: 1375, delta: 275, better: 'b' });
    expect(row('idle')).toMatchObject({ a: 4, b: 2, delta: -2, better: 'b' });
    expect(row('violations')).toMatchObject({ a: 0, b: 0, delta: 0, better: 'same' });
    expect(c.identical).toBe(false);
  });

  it('labor is minutes per portion, never a rate', () => {
    const c = compareDays({ label: 'A', result: result() }, { label: 'B', result: result({ laborHours: 24, portionsPlaced: 1375 }) });
    const per = c.rows.find((r) => r.key === 'laborPerPortion')!;
    expect(per.a).toBeCloseTo((20 * 60) / 1100, 9);
    expect(per.b).toBeCloseTo((24 * 60) / 1375, 9);
    expect(per.better).toBe('b'); // fewer minutes a portion
    expect(c.rows.some((r) => /\$|dollar|cost/i.test(r.label))).toBe(false);
  });

  it('the binding resource is a fact, not a score, and reads null when nothing ran', () => {
    const c = compareDays({ label: 'A', result: result() }, { label: 'B', result: result({ bindingResourceKey: 'Combi oven, full size 20-pan' }) });
    const binding = c.rows.find((r) => r.key === 'binding')!;
    expect(binding).toMatchObject({ a: 'Blast chiller, 200 lb capacity', b: 'Combi oven, full size 20-pan', delta: null, better: null });
    const none = compareDays({ label: 'A', result: result({ bindingResourceKey: null }) }, { label: 'B', result: result({ bindingResourceKey: null }) });
    expect(none.rows.find((r) => r.key === 'binding')!.a).toBeNull();
  });

  it('the chiller row appears only when the chiller is named, and reads its utilisation', () => {
    const withKey = compareDays({ label: 'A', result: result() }, { label: 'B', result: result({ utilizationByResource: { 'Blast chiller, 200 lb capacity': 0.75 } }) }, 'Blast chiller, 200 lb capacity');
    expect(withKey.rows.find((r) => r.key === 'chiller')).toMatchObject({ a: 0.6, b: 0.75 });
    expect(compareDays({ label: 'A', result: result() }, { label: 'B', result: result() }).rows.some((r) => r.key === 'chiller')).toBe(false);
  });

  it('two runs of the same scenario are identical', () => {
    const c = compareDays({ label: 'A', result: result() }, { label: 'A', result: result() }, 'Blast chiller, 200 lb capacity');
    expect(c.identical).toBe(true);
    expect(c.rows.every((r) => r.delta === null || r.delta === 0)).toBe(true);
  });

  it('unplaced batches and findings count against a side', () => {
    const c = compareDays(
      { label: 'Requirement', result: result({}, [shortfall(1), shortfall(2)]) },
      { label: 'Constrained', result: result({ batchesUnplaced: 2, portionsPlaced: 550, batchesPlaced: 2 }, []) },
    );
    expect(c.rows.find((r) => r.key === 'unplaced')).toMatchObject({ a: 0, b: 2, better: 'a' });
    expect(c.rows.find((r) => r.key === 'violations')).toMatchObject({ a: 2, b: 0, better: 'b' });
    expect(c.rows.find((r) => r.key === 'portions')!.better).toBe('a');
  });
});

describe('muse compare — the findings that differ', () => {
  it('lists only the kinds the two days disagree on, with a count each', () => {
    const d = violationDelta(result({}, [shortfall(1), shortfall(2), overCapacity]), result({}, [overCapacity]));
    expect(d).toEqual([{ kind: 'crew-shortfall', a: 2, b: 0 }]);
  });

  it('is empty when both days raise the same findings', () => {
    expect(violationDelta(result({}, [overCapacity]), result({}, [overCapacity]))).toEqual([]);
    expect(violationDelta(result(), result())).toEqual([]);
  });
});
