/**
 * Impact OS — the estimated time study every recipe is seeded with (Roadmap O2 follow-on).
 */

import { describe, it, expect } from 'vitest';
import { seedLibrary } from '@/app/(muse)/muse/_data/recipes-menu';
import { recipe as codeRecipe, timeStudy } from '@/app/(muse)/muse/_data/plan-data';
import { thermalProcesses } from '@/app/(muse)/muse/_data/thermal-processes';
import { deriveCapacity } from '@/app/(muse)/muse/_engine';
import { estimatedTimeStudy, servedComponents, timeStudyScaffold, TENDED_COOK_MINUTES, UNTIMED_COOK_MINUTES } from '@/app/(muse)/muse/_engine/time-study-estimate';
import { laborStandard, standardIsEstimated, summarizeStudy } from '@/app/(muse)/muse/_engine/time-studies';
import type { TimeStudyDoc } from '@/app/(muse)/muse/_data/time-studies';

const byCode = (code: string) => {
  const r = seedLibrary.find((x) => x.code === code);
  if (!r) throw new Error(code);
  return r;
};
const process = (id: string) => thermalProcesses.find((p) => p.id === id)!;

describe('muse time-study estimate — the scaffold comes off the served components', () => {
  it('each hot component is prepped and cooked, each cold component assembled cold, between the common tasks', () => {
    const r = byCode('AMK-E-002');
    expect(servedComponents(r)).toEqual({ hot: ['Beef & bean mix', 'Spanish rice'], cold: ['Pico & corn'] });
    const tasks = timeStudyScaffold(r).map((t) => [t.stream, t.task]);
    expect(tasks).toEqual([
      ['batch', 'Receiving, verification, put-away'],
      ['batch', 'Dry goods scaling and mise en place'],
      ['batch', 'Prep — Beef & bean mix: wash, trim, cut, scale'],
      ['batch', 'Cook — Beef & bean mix'],
      ['batch', 'Prep — Spanish rice: wash, trim, cut, scale'],
      ['batch', 'Cook — Spanish rice'],
      ['batch', 'Component blast chill and stage'],
      ['batch', 'Line turnaround and sanitation'],
      ['dispatch', 'Cold assembly — Pico & corn'],
      ['dispatch', 'Portion and assemble'],
      ['dispatch', 'Seal, label, date and lot code'],
      ['dispatch', 'Temperature check at pack (CCP verification)'],
      ['dispatch', 'Load for transport'],
    ]);
    expect(timeStudyScaffold(r).map((t) => t.seq)).toEqual(tasks.map((_, i) => i + 1));
  });

  it('has no second blast chill and no cold-hold line; the chiller appears once, on the batch stream', () => {
    for (const r of seedLibrary) {
      const s = timeStudyScaffold(r);
      expect(s.map((t) => t.task)).not.toContain('Final blast chill and temp logging');
      expect(s.map((t) => t.task)).not.toContain('Cold hold to dispatch');
      expect(s.filter((t) => t.station === 'Blast chiller')).toHaveLength(1);
      expect(s.find((t) => t.kind === 'chill')!.stream).toBe('batch');
      expect(s.filter((t) => t.kind === 'load')).toEqual([expect.objectContaining({ stream: 'dispatch', scalesWith: 'fixed' })]);
    }
  });

  it('every recipe in the library has a scaffold with at least one cook', () => {
    for (const r of seedLibrary) expect(timeStudyScaffold(r).some((t) => t.kind === 'cook')).toBe(true);
  });
});

describe('muse time-study estimate — the minutes', () => {
  it('is estimated, undated, unobserved and labelled so', () => {
    const e = estimatedTimeStudy(byCode('AMK-E-003'), 550);
    expect(e.basis).toBe('estimated');
    expect(e.studiedOn).toBeNull();
    expect(e.observer).toBeNull();
    expect(e.qualityResult).toBeNull();
    expect(e.batchSize).toBe(550);
    expect(e.qualityNotes).toMatch(/ESTIMATED/);
    expect(e.qualityNotes).toMatch(/PLACEHOLDER/);
    expect(e.lines).toHaveLength(timeStudyScaffold(byCode('AMK-E-003')).length);
  });

  it('the common tasks carry the plan’s 14-task estimate', () => {
    const e = estimatedTimeStudy(byCode('AMK-E-011'), 550);
    const line = (task: string) => e.lines.find((l) => l.task === task)!;
    const plan = (task: string) => timeStudy.tasks.find((t) => t.task === task)!;
    expect(line('Receiving, verification, put-away')).toMatchObject({ staff: 2, elapsedMinutes: 30, laborMinutes: 60, scalesWith: 'fixed', stream: 'batch' });
    expect(line('Portion and assemble')).toMatchObject({ laborMinutes: plan('Portion and assemble bowls').laborMinutes, stream: 'dispatch' });
    expect(line('Line turnaround and sanitation')).toMatchObject({ staff: 2, elapsedMinutes: 15, laborMinutes: 30, scalesWith: 'fixed', stream: 'batch' });
  });

  it('the check at pack and the load carry the minutes of the two retired plan lines', () => {
    const e = estimatedTimeStudy(byCode('AMK-E-011'), 550);
    const line = (task: string) => e.lines.find((l) => l.task === task)!;
    const plan = (task: string) => timeStudy.tasks.find((t) => t.task === task)!;
    expect(line('Temperature check at pack (CCP verification)')).toMatchObject({ laborMinutes: plan('Final blast chill and temp logging').laborMinutes, scalesWith: 'variable', stream: 'dispatch' });
    expect(line('Load for transport')).toMatchObject({ laborMinutes: plan('Cold hold to dispatch').laborMinutes, scalesWith: 'fixed', stream: 'dispatch' });
    expect(e.lines.filter((l) => l.task.startsWith('Cook')).every((l) => l.stream === 'batch')).toBe(true);
  });

  it('a cook reads the thermal standard at the plan’s point of the range; a long cook is tended, not attended', () => {
    const e = estimatedTimeStudy(byCode('AMK-E-003'), 550);
    const smoked = e.lines.find((l) => l.task.startsWith('Cook — Smoked chicken'))!;
    expect(smoked.elapsedMinutes).toBe(process('smoked-thighs').maxMinutes);
    expect(smoked.laborMinutes).toBe(TENDED_COOK_MINUTES);
    expect(smoked.scalesWith).toBe('fixed');
    const beans = e.lines.find((l) => l.task.startsWith('Cook — Green beans'))!;
    expect(beans.elapsedMinutes).toBe(process('steamed-veg').maxMinutes);
    expect(beans.laborMinutes).toBe(process('steamed-veg').maxMinutes);
  });

  it('a skillet sauté is worked by two people and scales with the batch', () => {
    const e = estimatedTimeStudy(byCode('AMK-E-007'), 550);
    const veg = e.lines.find((l) => l.task.startsWith('Cook — Fajita vegetables'))!;
    expect(veg.staff).toBe(2);
    expect(veg.scalesWith).toBe('variable');
    expect(veg.laborMinutes).toBe(2 * process('skillet-veg-beef').maxMinutes);
  });

  it('a component with no cook time on file gets the allowance and says so', () => {
    const e = estimatedTimeStudy(byCode('AMK-E-007'), 550);
    const beans = e.lines.find((l) => l.task.startsWith('Cook — Black beans'))!;
    expect(beans.task).toMatch(/no cook time on file/);
    expect(beans.elapsedMinutes).toBe(UNTIMED_COOK_MINUTES);
    expect(e.qualityNotes).toMatch(/Black beans/);
  });

  it('an overnight roast is tended for the allowance, not the night', () => {
    const e = estimatedTimeStudy(byCode('AMK-E-009'), 550);
    const pork = e.lines.find((l) => l.task.startsWith('Cook — Pulled pork'))!;
    expect(pork.elapsedMinutes).toBe(process('overnight-pork').maxMinutes);
    expect(pork.laborMinutes).toBe(TENDED_COOK_MINUTES);
  });

  it('builds for every recipe in the library at its derived batch, with a fixed and a variable share', () => {
    for (const r of seedLibrary) {
      const batch = deriveCapacity(r).batchSize;
      const e = estimatedTimeStudy(r, batch);
      const s = summarizeStudy(e);
      expect(batch).toBeGreaterThan(0);
      expect(s.fixedMinutesPerBatch).toBeGreaterThan(0);
      expect(s.variableMinutes).toBeGreaterThan(0);
      expect(s.laborMinutesPerPortion).toBeGreaterThan(0);
      expect(s.laborMinutesPerPortion).toBeLessThan(15);
    }
  });

  it('the adult recipe reads its student recipe’s thermal row and scaffolds the same tasks', () => {
    expect(timeStudyScaffold(byCode('AMK-A-004')).map((t) => t.task)).toEqual(timeStudyScaffold(byCode('AMK-E-004')).map((t) => t.task));
  });

  it('the code recipe keeps the plan’s study as its seed; the built estimate is not used for it', () => {
    expect(codeRecipe.code).toBe('AMK-E-001');
  });
});

describe('muse time-study estimate — the labor standard', () => {
  const doc = (over: Partial<TimeStudyDoc>): TimeStudyDoc => ({
    id: 'x', recipeCode: 'AMK-E-002', studiedOn: '2027-01-10', batchSize: 400, observer: 'A. Observer', qualityResult: 'pass', qualityNotes: null, adoptedAt: null, adoptedBy: null, source: 'user_built', basis: 'observed',
    lines: [{ task: 'T', station: null, staff: 1, elapsedMinutes: 10, laborMinutes: 10, scalesWith: 'fixed', stream: 'batch' }],
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
