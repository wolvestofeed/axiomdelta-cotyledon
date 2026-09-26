/**
 * MicroFarm — time studies per crop plan (Roadmap O2).
 */

import { describe, it, expect } from 'vitest';
import type { TimeStudyDoc } from '@/data/time-studies';
import {
  approvedStudies,
  laborMinutesForSowing,
  nextStudyDue,
  studiesForCropPlan,
  studyTrend,
  summarizeStudy,
  timeStudyFromRows,
} from '@/engine/time-studies';

const study = (over: Partial<TimeStudyDoc> = {}): TimeStudyDoc => ({
  id: 'x', cropPlanCode: 'BROC-01', studiedOn: '2027-01-10', sowingSize: 400, cycleDays: 0, observer: 'A. Observer', qualityResult: 'pass', qualityNotes: null, approvedAt: null, approvedBy: null, source: 'user_built', basis: 'observed', consumption: { water: [], supplements: [] },
  lines: [
    { task: 'Load', station: 'Blackout rack', staff: 2, elapsedMinutes: 30, laborMinutes: 60, scalesWith: 'fixed', stream: 'sowing' },
    { task: 'Assemble', station: 'Line', staff: 4, elapsedMinutes: 50, laborMinutes: 200, scalesWith: 'variable', stream: 'harvest' },
  ],
  ...over,
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
    study({ id: 'a', studiedOn: '2027-01-10', approvedAt: '2027-01-11T10:00:00.000Z' }),
    study({ id: 'b', studiedOn: '2027-03-02' }),
    study({ id: 'c', studiedOn: null }),
    study({ id: 'd', studiedOn: '2027-02-05', approvedAt: '2027-02-06T10:00:00.000Z' }),
    study({ id: 'e', cropPlanCode: 'PEA-01', studiedOn: '2027-04-01' }),
  ];

  it('lists a crop plan’s studies newest first, undated last', () => {
    expect(studiesForCropPlan(log, 'BROC-01').map((s) => s.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('only approved observed studies are in the standard, oldest approval first', () => {
    expect(approvedStudies(studiesForCropPlan(log, 'BROC-01')).map((s) => s.id)).toEqual(['a', 'd']);
    expect(approvedStudies([study()])).toEqual([]);
    expect(approvedStudies([study({ basis: 'estimated', approvedAt: '2027-01-11T10:00:00.000Z' })])).toEqual([]);
  });

  it('trends plot dated studies only, oldest first', () => {
    expect(studyTrend(studiesForCropPlan(log, 'BROC-01'), (s) => s.sowingSize).map((p) => p.id)).toEqual(['a', 'd', 'b']);
  });

  it('the next study is due the interval after the last dated study; none without an interval', () => {
    const mine = studiesForCropPlan(log, 'BROC-01');
    expect(nextStudyDue(mine, 90, '2027-04-01')).toEqual({ lastStudiedOn: '2027-03-02', intervalDays: 90, dueOn: '2027-05-31', daysUntilDue: 60 });
    expect(nextStudyDue(mine, 14, '2027-04-01').daysUntilDue).toBe(-16);
    expect(nextStudyDue(mine, null, '2027-04-01').dueOn).toBeNull();
    expect(nextStudyDue([study({ studiedOn: null })], 30, '2027-04-01').dueOn).toBeNull();
  });

  it('reads rows: an unknown quality result is not recorded, a date object becomes ISO', () => {
    const s = timeStudyFromRows('BROC-01', { id: 'r', studiedOn: new Date('2027-01-05T00:00:00Z'), sowingSize: 500, observer: null, qualityResult: 'maybe', qualityNotes: null, approvedAt: null, approvedBy: null, source: 'seed', basis: 'estimated' }, [
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
    const s = timeStudyFromRows('BROC-01', { id: 'r', studiedOn: null, sowingSize: 20, cycleDays: 13, observer: null, qualityResult: null, qualityNotes: null, approvedAt: null, approvedBy: null, source: 'seed', basis: 'estimated' }, [
      { task: 'Watering', station: 'Grow rack', staff: 1, elapsedMinutes: 1, laborMinutes: 1, scalesWith: 'variable', stream: 'daily' },
    ]);
    expect(s.cycleDays).toBe(13);
    expect(s.lines[0]!.stream).toBe('daily');
  });
});
