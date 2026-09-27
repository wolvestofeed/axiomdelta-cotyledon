/**
 * MicroFarm — the estimated time study every grow plan is seeded with: Vallecito's tray study.
 */

import { describe, it, expect } from 'vitest';
import { estimatedTimeStudy, timeStudyScaffold } from '@/engine/time-study-estimate';
import { laborStandard, standardIsEstimated, summarizeStudy } from '@/engine/time-studies';
import { VALLECITO_1020_STUDY, type TimeStudyDoc } from '@/data/time-studies';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { growPlanScaffold, growPlanTimeStudy } from '@/engine/time-study-estimate';
import { cycleDays } from '@/data/stage-schedule';
import { planStageDays } from '@/data/grow-plan';

describe('farm time-study estimate — the labor standard', () => {
  const doc = (over: Partial<TimeStudyDoc>): TimeStudyDoc => ({
    id: 'x', growPlanCode: 'BROC-01', studiedOn: '2027-01-10', sowingSize: 400, cycleDays: 0, observer: 'A. Observer', qualityResult: 'pass', qualityNotes: null, approvedAt: null, approvedBy: null, source: 'user_built', basis: 'observed', consumption: { water: [], supplements: [] },
    lines: [{ task: 'T', station: null, staff: 1, elapsedMinutes: 10, laborMinutes: 10, scalesWith: 'fixed', stream: 'sowing' }],
    ...over,
  });

  it('the estimate stands in until an observed study is adopted; an unadopted observed study does not', () => {
    const est = doc({ id: 'e', basis: 'estimated', studiedOn: null, observer: null, qualityResult: null });
    const obs = doc({ id: 'o' });
    expect(laborStandard([est])?.id).toBe('e');
    expect(laborStandard([obs, est])?.id).toBe('e');
    expect(standardIsEstimated(laborStandard([obs, est]))).toBe(true);
    const adopted = doc({ id: 'a', approvedAt: '2027-02-01T00:00:00.000Z' });
    expect(laborStandard([obs, est, adopted])?.id).toBe('a');
    expect(standardIsEstimated(laborStandard([obs, est, adopted]))).toBe(false);
    expect(laborStandard([])).toBeNull();
  });
});

describe('farm time-study estimate — a grow plan comes off Vallecito\'s tray study, on three streams', () => {
  const broc = growPlanSeed.find((p) => p.code === 'BROC-01')!;
  const mung = growPlanSeed.find((p) => p.code === 'MUNG-01')!;

  it('the scaffold is the sheet\'s tasks: five sowing, five daily, three harvest on a live tray (no knife, no weigh)', () => {
    const tasks = growPlanScaffold(broc).map((t) => [t.stream, t.task]);
    expect(tasks.filter((t) => t[0] === 'sowing').map((t) => t[1])).toEqual(VALLECITO_1020_STUDY.sowing.map((t) => t.task));
    expect(tasks.filter((t) => t[0] === 'daily').map((t) => t[1])).toEqual(VALLECITO_1020_STUDY.daily.map((t) => t.task));
    expect(tasks.filter((t) => t[0] === 'harvest').map((t) => t[1])).toEqual(['Prep harvest station', 'Packaging and labels', 'Clean station']);
    expect(timeStudyScaffold(broc).map((t) => t.task)).toEqual(tasks.map((t) => t[1]));
  });

  it('a jar plan skips the light and blackout waterings', () => {
    const tasks = growPlanScaffold(mung).filter((t) => t.stream === 'daily').map((t) => t.task);
    expect(tasks).toEqual(['Germination watering', 'Inspection and sanitization']);
  });

  it('the minutes: 7 per tray on the sow day, 11 per tray over the cycle, 3 per live tray at harvest — 21 a tray, 27 with the cut lines', () => {
    const e = growPlanTimeStudy(broc, 20);
    const cycle = cycleDays(planStageDays(broc));
    expect(e.cycleDays).toBe(cycle);
    expect(e.sowingSize).toBe(20);
    const s = summarizeStudy(e);
    expect(s.sowingLaborMinutes).toBe(7 * 20);
    expect(s.harvestLaborMinutes).toBe(3 * 20);
    expect(s.dailyLaborMinutes).toBeCloseTo(11 * 20, 9);
    expect(s.laborMinutesPerUnit).toBeCloseTo(21, 9);
    expect(s.dailyMinutesPerTrayDay).toBeCloseTo(11 / cycle, 9);
    expect(VALLECITO_1020_STUDY.sowing.reduce((t, x) => t + x.minutes, 0) + VALLECITO_1020_STUDY.daily.reduce((t, x) => t + x.minutes, 0)).toBe(18);
    expect(VALLECITO_1020_STUDY.harvest.reduce((t, x) => t + x.minutes, 0)).toBe(9);
    expect(e.basis).toBe('estimated');
    expect(e.qualityNotes).toContain('DATED');
  });

  it('the estimate of a library plan is this study, and it is the plan\'s labor standard until one is adopted', () => {
    const lib = broc;
    const e = estimatedTimeStudy(lib, 20);
    expect(e.lines.map((l) => l.task)).toEqual(growPlanTimeStudy(broc, 20).lines.map((l) => l.task));
    const std = laborStandard([{ id: 'e', growPlanCode: 'BROC-01', approvedAt: null, approvedBy: null, source: 'seed', ...e }]);
    expect(standardIsEstimated(std)).toBe(true);
  });
});
