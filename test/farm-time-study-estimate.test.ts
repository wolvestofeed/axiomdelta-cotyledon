/**
 * MicroFarm — the estimated time study every crop plan is seeded with (Roadmap O2 follow-on).
 */

import { describe, it, expect } from 'vitest';
import { seedLibrary } from '@/data/crop-plans-seed';
import { cropPlan as codeCropPlan, timeStudy } from '@/data/plan-data';
import { growStages } from '@/data/grow-stages';
import { deriveCapacity } from '@/engine';
import { estimatedTimeStudy, servedComponents, timeStudyScaffold, TENDED_SOW_MINUTES, UNTIMED_SOW_MINUTES } from '@/engine/time-study-estimate';
import { laborStandard, standardIsEstimated, summarizeStudy } from '@/engine/time-studies';
import { VALLECITO_1020_STUDY, type TimeStudyDoc } from '@/data/time-studies';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { projectCropPlan } from '@/engine/grow-plan-bridge';
import { growPlanScaffold, growPlanTimeStudy } from '@/engine/time-study-estimate';
import { cycleDays } from '@/data/stage-schedule';
import { planStageDays } from '@/data/grow-plan';

const byCode = (code: string) => {
  const r = seedLibrary.find((x) => x.code === code);
  if (!r) throw new Error(code);
  return r;
};
const process = (id: string) => growStages.find((p) => p.id === id)!;

describe('farm time-study estimate — the scaffold comes off the served components', () => {
  it('each hot component is prepped and harvested, each cold component assembled cold, between the common tasks', () => {
    const r = byCode('AMK-E-002');
    expect(servedComponents(r)).toEqual({ hot: ['Beef & bean mix', 'Spanish rice'], cold: ['Pico & corn'] });
    const tasks = timeStudyScaffold(r).map((t) => [t.stream, t.task]);
    expect(tasks).toEqual([
      ['sowing', 'Receiving, verification, put-away'],
      ['sowing', 'Dry goods scaling and mise en place'],
      ['sowing', 'Prep — Beef & bean mix: wash, trim, cut, scale'],
      ['sowing', 'Sow — Beef & bean mix'],
      ['sowing', 'Prep — Spanish rice: wash, trim, cut, scale'],
      ['sowing', 'Sow — Spanish rice'],
      ['sowing', 'Component blackout and stage'],
      ['sowing', 'Line turnaround and sanitation'],
      ['harvest', 'Cold assembly — Pico & corn'],
      ['harvest', 'Unit and assemble'],
      ['harvest', 'Seal, label, date and lot code'],
      ['harvest', 'Temperature check at pack (CONTROL POINT verification)'],
      ['harvest', 'Load for transport'],
    ]);
    expect(timeStudyScaffold(r).map((t) => t.seq)).toEqual(tasks.map((_, i) => i + 1));
  });

  it('has no second blackout and no cold-hold line; the blackout rack appears once, on the sowing stream', () => {
    for (const r of seedLibrary) {
      const s = timeStudyScaffold(r);
      expect(s.map((t) => t.task)).not.toContain('Final blackout and temp logging');
      expect(s.map((t) => t.task)).not.toContain('Cold hold to harvest');
      expect(s.filter((t) => t.station === 'Blackout rack')).toHaveLength(1);
      expect(s.find((t) => t.kind === 'blackout')!.stream).toBe('sowing');
      expect(s.filter((t) => t.kind === 'load')).toEqual([expect.objectContaining({ stream: 'harvest', scalesWith: 'fixed' })]);
    }
  });

  it('every crop plan in the library has a scaffold with at least one sow', () => {
    for (const r of seedLibrary) expect(timeStudyScaffold(r).some((t) => t.kind === 'sow')).toBe(true);
  });
});

describe('farm time-study estimate — the minutes', () => {
  it('is estimated, undated, unobserved and labelled so', () => {
    const e = estimatedTimeStudy(byCode('AMK-E-003'), 550);
    expect(e.basis).toBe('estimated');
    expect(e.studiedOn).toBeNull();
    expect(e.observer).toBeNull();
    expect(e.qualityResult).toBeNull();
    expect(e.sowingSize).toBe(550);
    expect(e.qualityNotes).toMatch(/ESTIMATED/);
    expect(e.qualityNotes).toMatch(/PLACEHOLDER/);
    expect(e.lines).toHaveLength(timeStudyScaffold(byCode('AMK-E-003')).length);
  });

  it('the common tasks carry the plan’s 14-task estimate', () => {
    const e = estimatedTimeStudy(byCode('AMK-E-011'), 550);
    const line = (task: string) => e.lines.find((l) => l.task === task)!;
    const plan = (task: string) => timeStudy.tasks.find((t) => t.task === task)!;
    expect(line('Receiving, verification, put-away')).toMatchObject({ staff: 2, elapsedMinutes: 30, laborMinutes: 60, scalesWith: 'fixed', stream: 'sowing' });
    expect(line('Unit and assemble')).toMatchObject({ laborMinutes: plan('Unit and assemble bowls').laborMinutes, stream: 'harvest' });
    expect(line('Line turnaround and sanitation')).toMatchObject({ staff: 2, elapsedMinutes: 15, laborMinutes: 30, scalesWith: 'fixed', stream: 'sowing' });
  });

  it('the check at pack and the load carry the minutes of the two retired plan lines', () => {
    const e = estimatedTimeStudy(byCode('AMK-E-011'), 550);
    const line = (task: string) => e.lines.find((l) => l.task === task)!;
    const plan = (task: string) => timeStudy.tasks.find((t) => t.task === task)!;
    expect(line('Temperature check at pack (CONTROL POINT verification)')).toMatchObject({ laborMinutes: plan('Final blackout and temp logging').laborMinutes, scalesWith: 'variable', stream: 'harvest' });
    expect(line('Load for transport')).toMatchObject({ laborMinutes: plan('Cold hold to harvest').laborMinutes, scalesWith: 'fixed', stream: 'harvest' });
    expect(e.lines.filter((l) => l.task.startsWith('Sow')).every((l) => l.stream === 'sowing')).toBe(true);
  });

  it('a sow reads the stage standard at the plan’s point of the range; a long sow is tended, not attended', () => {
    const e = estimatedTimeStudy(byCode('AMK-E-003'), 550);
    const smoked = e.lines.find((l) => l.task.startsWith('Sow — Smoked chicken'))!;
    expect(smoked.elapsedMinutes).toBe(process('smoked-thighs').maxMinutes);
    expect(smoked.laborMinutes).toBe(TENDED_SOW_MINUTES);
    expect(smoked.scalesWith).toBe('fixed');
    const beans = e.lines.find((l) => l.task.startsWith('Sow — Green beans'))!;
    expect(beans.elapsedMinutes).toBe(process('steamed-veg').maxMinutes);
    expect(beans.laborMinutes).toBe(process('steamed-veg').maxMinutes);
  });

  it('a shelf sauté is worked by two people and scales with the sowing', () => {
    const e = estimatedTimeStudy(byCode('AMK-E-007'), 550);
    const veg = e.lines.find((l) => l.task.startsWith('Sow — Fajita vegetables'))!;
    expect(veg.staff).toBe(2);
    expect(veg.scalesWith).toBe('variable');
    expect(veg.laborMinutes).toBe(2 * process('shelf-veg-beef').maxMinutes);
  });

  it('a component with no sow time on file gets the allowance and says so', () => {
    const e = estimatedTimeStudy(byCode('AMK-E-007'), 550);
    const beans = e.lines.find((l) => l.task.startsWith('Sow — Black beans'))!;
    expect(beans.task).toMatch(/no sow time on file/);
    expect(beans.elapsedMinutes).toBe(UNTIMED_SOW_MINUTES);
    expect(e.qualityNotes).toMatch(/Black beans/);
  });

  it('an overnight roast is tended for the allowance, not the night', () => {
    const e = estimatedTimeStudy(byCode('AMK-E-009'), 550);
    const pork = e.lines.find((l) => l.task.startsWith('Sow — Pulled pork'))!;
    expect(pork.elapsedMinutes).toBe(process('overnight-pork').maxMinutes);
    expect(pork.laborMinutes).toBe(TENDED_SOW_MINUTES);
  });

  it('builds for every crop plan in the library at its derived sowing, with a fixed and a variable share', () => {
    for (const r of seedLibrary) {
      const sowing = deriveCapacity(r).sowingSize;
      const e = estimatedTimeStudy(r, sowing);
      const s = summarizeStudy(e);
      expect(sowing).toBeGreaterThan(0);
      expect(s.fixedMinutesPerSowing).toBeGreaterThan(0);
      expect(s.variableMinutes).toBeGreaterThan(0);
      expect(s.laborMinutesPerUnit).toBeGreaterThan(0);
      expect(s.laborMinutesPerUnit).toBeLessThan(15);
    }
  });

  it('the adult crop plan reads its student crop plan’s stage row and scaffolds the same tasks', () => {
    expect(timeStudyScaffold(byCode('AMK-A-004')).map((t) => t.task)).toEqual(timeStudyScaffold(byCode('AMK-E-004')).map((t) => t.task));
  });

  it('the code crop plan keeps the plan’s study as its seed; the built estimate is not used for it', () => {
    expect(codeCropPlan.code).toBe('AMK-E-001');
  });
});

describe('farm time-study estimate — the labor standard', () => {
  const doc = (over: Partial<TimeStudyDoc>): TimeStudyDoc => ({
    id: 'x', cropPlanCode: 'AMK-E-002', studiedOn: '2027-01-10', sowingSize: 400, cycleDays: 0, observer: 'A. Observer', qualityResult: 'pass', qualityNotes: null, adoptedAt: null, adoptedBy: null, source: 'user_built', basis: 'observed',
    lines: [{ task: 'T', station: null, staff: 1, elapsedMinutes: 10, laborMinutes: 10, scalesWith: 'fixed', stream: 'sowing' }],
    ...over,
  });

  it('the estimate stands in until an observed study is adopted; an unadopted observed study does not', () => {
    const est = doc({ id: 'e', basis: 'estimated', studiedOn: null, observer: null, qualityResult: null });
    const obs = doc({ id: 'o' });
    expect(laborStandard([est])?.id).toBe('e');
    expect(laborStandard([obs, est])?.id).toBe('e');
    expect(standardIsEstimated(laborStandard([obs, est]))).toBe(true);
    const adopted = doc({ id: 'a', adoptedAt: '2027-02-01T00:00:00.000Z' });
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
    expect(timeStudyScaffold(projectCropPlan(broc)).map((t) => t.task)).toEqual(tasks.map((t) => t[1]));
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
    const lib = projectCropPlan(broc);
    const e = estimatedTimeStudy(lib, 20);
    expect(e.lines.map((l) => l.task)).toEqual(growPlanTimeStudy(broc, 20).lines.map((l) => l.task));
    const std = laborStandard([{ id: 'e', cropPlanCode: 'BROC-01', adoptedAt: null, adoptedBy: null, source: 'seed', ...e }]);
    expect(standardIsEstimated(std)).toBe(true);
  });
});
