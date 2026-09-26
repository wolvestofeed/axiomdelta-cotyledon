/**
 * Impact OS — time studies per recipe (Roadmap O2).
 */

import { describe, it, expect } from 'vitest';
import { timeStudySeed, TIME_STUDY_SEED_RECIPE, type TimeStudyDoc } from '@/app/(muse)/muse/_data/time-studies';
import { assumptions } from '@/app/(muse)/muse/_data/plan-data';
import {
  adoptedStudy,
  laborMinutesForBatch,
  nextStudyDue,
  studiesForRecipe,
  studyTrend,
  summarizeStudy,
  timeStudyFromRows,
} from '@/app/(muse)/muse/_engine/time-studies';

const study = (over: Partial<TimeStudyDoc> = {}): TimeStudyDoc => ({
  id: 'x', recipeCode: 'AMK-E-002', studiedOn: '2027-01-10', batchSize: 400, observer: 'A. Observer', qualityResult: 'pass', qualityNotes: null, adoptedAt: null, adoptedBy: null, source: 'user_built', basis: 'observed',
  lines: [
    { task: 'Load', station: 'Chiller', staff: 2, elapsedMinutes: 30, laborMinutes: 60, scalesWith: 'fixed', stream: 'batch' },
    { task: 'Assemble', station: 'Line', staff: 4, elapsedMinutes: 50, laborMinutes: 200, scalesWith: 'variable', stream: 'dispatch' },
  ],
  ...over,
});

describe('muse time studies — the seed is the plan’s estimate', () => {
  it('reproduces the plan’s fixed and variable labor split for AMK-E-001', () => {
    const s = summarizeStudy(timeStudySeed);
    expect(TIME_STUDY_SEED_RECIPE).toBe('AMK-E-001');
    expect(s.fixedMinutesPerBatch).toBe(assumptions.laborSplit.fixedMinutesPerBatch.value);
    expect(s.variableMinutesPerPortion).toBeCloseTo(assumptions.laborSplit.variableMinutesPerPortion.value, 10);
  });

  it('carries no study date, observer or quality result: it was estimated, not observed', () => {
    expect(timeStudySeed.basis).toBe('estimated');
    expect(timeStudySeed.studiedOn).toBeNull();
    expect(timeStudySeed.observer).toBeNull();
    expect(timeStudySeed.qualityResult).toBeNull();
  });

  it('is split onto the two streams: batch lines first, no second blast chill, no cold-hold line', () => {
    const tasks = timeStudySeed.lines.map((l) => l.task);
    expect(tasks).not.toContain('Final blast chill and temp logging');
    expect(tasks).not.toContain('Cold hold to dispatch');
    const streams = timeStudySeed.lines.map((l) => l.stream);
    expect(streams.indexOf('dispatch')).toBe(streams.lastIndexOf('batch') + 1);
    expect(timeStudySeed.lines.filter((l) => l.stream === 'dispatch').map((l) => l.task)).toEqual([
      'Portion and assemble bowls',
      'Seal, label, date and lot code',
      'Temperature check at pack (CCP verification)',
      'Load for transport',
    ]);
    expect(timeStudySeed.lines).toHaveLength(14);
  });
});

describe('muse time studies — a study', () => {
  it('splits fixed minutes per batch from variable minutes per portion at the batch studied', () => {
    const s = summarizeStudy(study());
    expect(s.fixedMinutesPerBatch).toBe(60);
    expect(s.variableMinutesPerPortion).toBe(0.5);
    expect(s.laborMinutesPerPortion).toBe(0.65);
    expect(s.peakStaff).toBe(4);
    expect(s.batchLaborMinutes).toBe(60);
    expect(s.dispatchLaborMinutes).toBe(200);
  });

  it('labor for a batch is fixed plus variable per portion at that batch’s size', () => {
    expect(laborMinutesForBatch(summarizeStudy(study()), 550)).toBe(60 + 0.5 * 550);
  });
});

describe('muse time studies — the log', () => {
  const log = [
    study({ id: 'a', studiedOn: '2027-01-10', adoptedAt: '2027-01-11T10:00:00.000Z' }),
    study({ id: 'b', studiedOn: '2027-03-02' }),
    study({ id: 'c', studiedOn: null }),
    study({ id: 'd', studiedOn: '2027-02-05', adoptedAt: '2027-02-06T10:00:00.000Z' }),
    study({ id: 'e', recipeCode: 'AMK-E-003', studiedOn: '2027-04-01' }),
  ];

  it('lists a recipe’s studies newest first, undated last', () => {
    expect(studiesForRecipe(log, 'AMK-E-002').map((s) => s.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('the labor standard is the most recent adoption, not the most recent study', () => {
    expect(adoptedStudy(studiesForRecipe(log, 'AMK-E-002'))?.id).toBe('d');
    expect(adoptedStudy([study()])).toBeNull();
  });

  it('trends plot dated studies only, oldest first', () => {
    expect(studyTrend(studiesForRecipe(log, 'AMK-E-002'), (s) => s.batchSize).map((p) => p.id)).toEqual(['a', 'd', 'b']);
  });

  it('the next study is due the interval after the last dated study; none without an interval', () => {
    const mine = studiesForRecipe(log, 'AMK-E-002');
    expect(nextStudyDue(mine, 90, '2027-04-01')).toEqual({ lastStudiedOn: '2027-03-02', intervalDays: 90, dueOn: '2027-05-31', daysUntilDue: 60 });
    expect(nextStudyDue(mine, 14, '2027-04-01').daysUntilDue).toBe(-16);
    expect(nextStudyDue(mine, null, '2027-04-01').dueOn).toBeNull();
    expect(nextStudyDue([study({ studiedOn: null })], 30, '2027-04-01').dueOn).toBeNull();
  });

  it('reads rows: an unknown quality result is not recorded, a date object becomes ISO', () => {
    const s = timeStudyFromRows('AMK-E-001', { id: 'r', studiedOn: new Date('2027-01-05T00:00:00Z'), batchSize: 500, observer: null, qualityResult: 'maybe', qualityNotes: null, adoptedAt: null, adoptedBy: null, source: 'seed', basis: 'estimated' }, [
      { task: 'T', station: null, staff: 1, elapsedMinutes: 10, laborMinutes: 10, scalesWith: 'fixed', stream: 'dispatch' },
      { task: 'U', station: null, staff: 1, elapsedMinutes: 10, laborMinutes: 10, scalesWith: 'fixed', stream: 'unknown' },
    ]);
    expect(s.lines.map((l) => l.stream)).toEqual(['dispatch', 'batch']);
    expect(s.studiedOn).toBe('2027-01-05');
    expect(s.qualityResult).toBeNull();
    expect(s.source).toBe('seed');
    expect(s.basis).toBe('estimated');
  });
});
