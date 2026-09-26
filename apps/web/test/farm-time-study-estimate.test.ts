/**
 * MicroFarm — the estimated time study every crop plan is seeded with (Roadmap O2 follow-on).
 */

import { describe, it, expect } from 'vitest';
import { seedLibrary } from '@/app/(farm)/farm/_data/crop-plans-seed';
import { cropPlan as codeCropPlan, timeStudy } from '@/app/(farm)/farm/_data/plan-data';
import { growStages } from '@/app/(farm)/farm/_data/grow-stages';
import { deriveCapacity } from '@/app/(farm)/farm/_engine';
import { estimatedTimeStudy, servedComponents, timeStudyScaffold, TENDED_SOW_MINUTES, UNTIMED_SOW_MINUTES } from '@/app/(farm)/farm/_engine/time-study-estimate';
import { laborStandard, standardIsEstimated, summarizeStudy } from '@/app/(farm)/farm/_engine/time-studies';
import type { TimeStudyDoc } from '@/app/(farm)/farm/_data/time-studies';

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
    id: 'x', cropPlanCode: 'AMK-E-002', studiedOn: '2027-01-10', sowingSize: 400, observer: 'A. Observer', qualityResult: 'pass', qualityNotes: null, adoptedAt: null, adoptedBy: null, source: 'user_built', basis: 'observed',
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
