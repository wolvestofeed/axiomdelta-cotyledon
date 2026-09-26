/**
 * MicroFarm — time studies per crop plan (Roadmap O2).
 */

import { describe, it, expect } from 'vitest';
import { timeStudySeed, TIME_STUDY_SEED_CROP_PLAN, type TimeStudyDoc } from '@/app/(farm)/farm/_data/time-studies';
import { assumptions } from '@/app/(farm)/farm/_data/plan-data';
import {
  adoptedStudy,
  laborMinutesForSowing,
  nextStudyDue,
  studiesForCropPlan,
  studyTrend,
  summarizeStudy,
  timeStudyFromRows,
} from '@/app/(farm)/farm/_engine/time-studies';

const study = (over: Partial<TimeStudyDoc> = {}): TimeStudyDoc => ({
  id: 'x', cropPlanCode: 'AMK-E-002', studiedOn: '2027-01-10', sowingSize: 400, cycleDays: 0, observer: 'A. Observer', qualityResult: 'pass', qualityNotes: null, adoptedAt: null, adoptedBy: null, source: 'user_built', basis: 'observed',
  lines: [
    { task: 'Load', station: 'Blackout rack', staff: 2, elapsedMinutes: 30, laborMinutes: 60, scalesWith: 'fixed', stream: 'sowing' },
    { task: 'Assemble', station: 'Line', staff: 4, elapsedMinutes: 50, laborMinutes: 200, scalesWith: 'variable', stream: 'harvest' },
  ],
  ...over,
});

describe('farm time studies — the seed is the plan’s estimate', () => {
  it('reproduces the plan’s fixed and variable labor split for AMK-E-001', () => {
    const s = summarizeStudy(timeStudySeed);
    expect(TIME_STUDY_SEED_CROP_PLAN).toBe('AMK-E-001');
    expect(s.fixedMinutesPerSowing).toBe(assumptions.laborSplit.fixedMinutesPerSowing.value);
    expect(s.variableMinutesPerUnit).toBeCloseTo(assumptions.laborSplit.variableMinutesPerUnit.value, 10);
  });

  it('carries no study date, observer or quality result: it was estimated, not observed', () => {
    expect(timeStudySeed.basis).toBe('estimated');
    expect(timeStudySeed.studiedOn).toBeNull();
    expect(timeStudySeed.observer).toBeNull();
    expect(timeStudySeed.qualityResult).toBeNull();
  });

  it('is split onto the two streams: sowing lines first, no second blackout, no cold-hold line', () => {
    const tasks = timeStudySeed.lines.map((l) => l.task);
    expect(tasks).not.toContain('Final blackout and temp logging');
    expect(tasks).not.toContain('Cold hold to harvest');
    const streams = timeStudySeed.lines.map((l) => l.stream);
    expect(streams.indexOf('harvest')).toBe(streams.lastIndexOf('sowing') + 1);
    expect(timeStudySeed.lines.filter((l) => l.stream === 'harvest').map((l) => l.task)).toEqual([
      'Unit and assemble bowls',
      'Seal, label, date and lot code',
      'Temperature check at pack (CONTROL POINT verification)',
      'Load for transport',
    ]);
    expect(timeStudySeed.lines).toHaveLength(14);
  });
});

describe('farm time studies — a study', () => {
  it('splits fixed minutes per sowing from variable minutes per unit at the sowing studied', () => {
    const s = summarizeStudy(study());
    expect(s.fixedMinutesPerSowing).toBe(60);
    expect(s.variableMinutesPerUnit).toBe(0.5);
    expect(s.laborMinutesPerUnit).toBe(0.65);
    expect(s.peakStaff).toBe(4);
    expect(s.sowingLaborMinutes).toBe(60);
    expect(s.harvestLaborMinutes).toBe(200);
  });

  it('labor for a sowing is fixed plus variable per unit at that sowing’s size', () => {
    expect(laborMinutesForSowing(summarizeStudy(study()), 550)).toBe(60 + 0.5 * 550);
  });
});

describe('farm time studies — the log', () => {
  const log = [
    study({ id: 'a', studiedOn: '2027-01-10', adoptedAt: '2027-01-11T10:00:00.000Z' }),
    study({ id: 'b', studiedOn: '2027-03-02' }),
    study({ id: 'c', studiedOn: null }),
    study({ id: 'd', studiedOn: '2027-02-05', adoptedAt: '2027-02-06T10:00:00.000Z' }),
    study({ id: 'e', cropPlanCode: 'AMK-E-003', studiedOn: '2027-04-01' }),
  ];

  it('lists a crop plan’s studies newest first, undated last', () => {
    expect(studiesForCropPlan(log, 'AMK-E-002').map((s) => s.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('the labor standard is the most recent adoption, not the most recent study', () => {
    expect(adoptedStudy(studiesForCropPlan(log, 'AMK-E-002'))?.id).toBe('d');
    expect(adoptedStudy([study()])).toBeNull();
  });

  it('trends plot dated studies only, oldest first', () => {
    expect(studyTrend(studiesForCropPlan(log, 'AMK-E-002'), (s) => s.sowingSize).map((p) => p.id)).toEqual(['a', 'd', 'b']);
  });

  it('the next study is due the interval after the last dated study; none without an interval', () => {
    const mine = studiesForCropPlan(log, 'AMK-E-002');
    expect(nextStudyDue(mine, 90, '2027-04-01')).toEqual({ lastStudiedOn: '2027-03-02', intervalDays: 90, dueOn: '2027-05-31', daysUntilDue: 60 });
    expect(nextStudyDue(mine, 14, '2027-04-01').daysUntilDue).toBe(-16);
    expect(nextStudyDue(mine, null, '2027-04-01').dueOn).toBeNull();
    expect(nextStudyDue([study({ studiedOn: null })], 30, '2027-04-01').dueOn).toBeNull();
  });

  it('reads rows: an unknown quality result is not recorded, a date object becomes ISO', () => {
    const s = timeStudyFromRows('AMK-E-001', { id: 'r', studiedOn: new Date('2027-01-05T00:00:00Z'), sowingSize: 500, observer: null, qualityResult: 'maybe', qualityNotes: null, adoptedAt: null, adoptedBy: null, source: 'seed', basis: 'estimated' }, [
      { task: 'T', station: null, staff: 1, elapsedMinutes: 10, laborMinutes: 10, scalesWith: 'fixed', stream: 'harvest' },
      { task: 'U', station: null, staff: 1, elapsedMinutes: 10, laborMinutes: 10, scalesWith: 'fixed', stream: 'unknown' },
    ]);
    expect(s.lines.map((l) => l.stream)).toEqual(['harvest', 'sowing']);
    expect(s.studiedOn).toBe('2027-01-05');
    expect(s.qualityResult).toBeNull();
    expect(s.source).toBe('seed');
    expect(s.basis).toBe('estimated');
  });
});

describe('farm time studies — the daily stream (outline §5 rule 3)', () => {
  const three = study({
    sowingSize: 20,
    cycleDays: 10,
    lines: [
      { task: 'Sow trays', station: 'Prep station', staff: 1, elapsedMinutes: 60, laborMinutes: 60, scalesWith: 'variable', stream: 'sowing' },
      { task: 'Watering', station: 'Grow rack', staff: 1, elapsedMinutes: 10, laborMinutes: 10, scalesWith: 'variable', stream: 'daily' },
      { task: 'Walk-through', station: 'Grow rack', staff: 1, elapsedMinutes: 5, laborMinutes: 5, scalesWith: 'fixed', stream: 'daily' },
      { task: 'Pack', station: 'Harvest station', staff: 1, elapsedMinutes: 40, laborMinutes: 40, scalesWith: 'variable', stream: 'harvest' },
    ],
  });

  it('a daily line is one day\'s minutes for the sowing; per tray per day over the sowing, over the cycle into the unit', () => {
    const s = summarizeStudy(three);
    expect(s.dailyMinutesPerTrayDay).toBeCloseTo(0.5, 9);
    expect(s.dailyFixedMinutesPerDay).toBe(5);
    expect(s.dailyLaborMinutes).toBe(150);
    expect(s.dailyMinutesPerUnit).toBeCloseTo(7.5, 9);
    expect(s.laborMinutes).toBe(60 + 40 + 150);
    expect(s.laborMinutesPerUnit).toBeCloseTo(250 / 20, 9);
    expect(s.variableMinutesPerUnit).toBeCloseTo(100 / 20, 9);
    expect(s.fixedMinutesPerSowing).toBe(0);
    expect(s.cycleDays).toBe(10);
  });

  it('a sowing of other units scales the daily stream by trays and the cycle', () => {
    const s = summarizeStudy(three);
    expect(laborMinutesForSowing(s, 40)).toBeCloseTo(0 + 5 * 40 + (5 + 0.5 * 40) * 10, 9);
  });

  it('a study with no daily line carries none: the two-stream arithmetic is unchanged', () => {
    const s = summarizeStudy(study());
    expect(s.dailyLaborMinutes).toBe(0);
    expect(s.laborMinutes).toBe(260);
    expect(laborMinutesForSowing(s, 400)).toBe(260);
  });

  it('rows map a daily line and the cycle days', () => {
    const s = timeStudyFromRows('BROC-01', { id: 'r', studiedOn: null, sowingSize: 20, cycleDays: 13, observer: null, qualityResult: null, qualityNotes: null, adoptedAt: null, adoptedBy: null, source: 'seed', basis: 'estimated' }, [
      { task: 'Watering', station: 'Grow rack', staff: 1, elapsedMinutes: 1, laborMinutes: 1, scalesWith: 'variable', stream: 'daily' },
    ]);
    expect(s.cycleDays).toBe(13);
    expect(s.lines[0]!.stream).toBe('daily');
  });
});
