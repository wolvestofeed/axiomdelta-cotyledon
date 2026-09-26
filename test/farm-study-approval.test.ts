/**
 * Every observed time study is approved: the labor standard and the measured water and supplements
 * are the tray-weighted average of the approved studies, the costing reads the measured figures,
 * and the resolver attaches them to each plan.
 */
import { describe, expect, it } from 'vitest';
import { NO_CONSUMPTION, type TimeStudyDoc, type TimeStudyLine } from '@/data/time-studies';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { planStageDays, planStages, type GrowPlanDef } from '@/data/grow-plan';
import { FL_OZ_PER_GAL, WATER_PER_WATERING_OZ, cycleDays } from '@/data/stage-schedule';
import { NUTRIENT_BY_KEY } from '@/data/inputs-catalog';
import { averageStudies, consumptionFrom, inStandard, laborStandard, measuredConsumption, summarizeStudy, wateringDays } from '@/engine/time-studies';
import { costGrowPlan } from '@/engine/grow-costing';
import { projectCropPlan, isGrowPlanCarrier } from '@/engine/grow-plan-bridge';
import { resolveScenarioInputs } from '@/engine/scenario';
import { measuredRows } from '@/engine/measured-consumption';

const broccoli = (): GrowPlanDef => growPlanSeed.find((p) => p.code === 'BROC-01')!;

const line = (over: Partial<TimeStudyLine>): TimeStudyLine => ({ task: 'Sow', station: null, staff: 1, elapsedMinutes: 10, laborMinutes: 10, scalesWith: 'variable', stream: 'sowing', ...over });

const study = (over: Partial<TimeStudyDoc> = {}): TimeStudyDoc => ({
  id: 's1',
  cropPlanCode: 'BROC-01',
  studiedOn: '2026-10-01',
  sowingSize: 10,
  cycleDays: 10,
  observer: 'Rob',
  qualityResult: 'pass',
  qualityNotes: null,
  approvedAt: '2026-10-12T10:00:00.000Z',
  approvedBy: 'admin',
  source: 'user_built',
  basis: 'observed',
  lines: [line({ task: 'Setup', scalesWith: 'fixed', laborMinutes: 20, elapsedMinutes: 20 }), line({ task: 'Sow', laborMinutes: 30, elapsedMinutes: 30 }), line({ task: 'Water', stream: 'daily', laborMinutes: 10, elapsedMinutes: 10 })],
  consumption: NO_CONSUMPTION,
  ...over,
});

describe('the labor standard is the average of the approved studies', () => {
  const a = study({ id: 'a', sowingSize: 10, cycleDays: 10, approvedAt: '2026-10-12T10:00:00.000Z' });
  const b = study({
    id: 'b',
    sowingSize: 30,
    cycleDays: 12,
    approvedAt: '2026-11-12T10:00:00.000Z',
    lines: [line({ task: 'Setup', scalesWith: 'fixed', laborMinutes: 40, elapsedMinutes: 40 }), line({ task: 'Sow', laborMinutes: 60, elapsedMinutes: 60 }), line({ task: 'Water', stream: 'daily', laborMinutes: 15, elapsedMinutes: 15 }), line({ task: 'Pack', stream: 'harvest', laborMinutes: 30, elapsedMinutes: 30 })],
  });

  it('one approved study is the standard itself; none leaves the estimate', () => {
    const estimate = study({ id: 'e', basis: 'estimated', approvedAt: null });
    expect(laborStandard([estimate, a])?.id).toBe('a');
    expect(laborStandard([estimate, study({ id: 'n', approvedAt: null })])?.id).toBe('e');
  });

  it('two approved studies average to the tray-weighted totals per tray', () => {
    const avg = laborStandard([a, b])!;
    expect(avg.averageOf).toEqual(['a', 'b']);
    expect(inStandard(a, avg) && inStandard(b, avg)).toBe(true);
    const s = summarizeStudy(avg);
    // Per tray: a's sow 30 + water 10 a day × 10 days = 130 over 10 trays; b's sow 60 + pack 30 +
    // water 15 a day × 12 days = 270 over 30 trays; together 400 over 40 trays.
    expect(s.variableMinutesPerUnit + s.dailyMinutesPerUnit).toBeCloseTo(400 / 40, 9);
    expect(s.fixedMinutesPerSowing).toBeCloseTo((20 * 10 + 40 * 30) / 40, 9);
    expect(avg.cycleDays).toBeCloseTo((10 * 10 + 12 * 30) / 40, 9);
    expect(avg.sowingSize).toBe(30);
    // A task one study lacks counts zero there.
    const pack = avg.lines.find((l) => l.task === 'Pack')!;
    expect(pack.laborMinutes).toBeCloseTo((30 / 40) * 30, 9);
  });
});

describe('measured water and supplements', () => {
  const water = [
    { day: '2026-10-01', stage: 'germination' as const, method: 'mist' as const, ozPerWatering: 1.5, waterings: 2, trays: 10 },
    { day: '2026-10-06', stage: 'light' as const, method: 'bottom' as const, ozPerWatering: 12, waterings: 1, trays: 10 },
  ];
  const a = study({ id: 'a', sowingSize: 10, consumption: { water, supplements: [{ day: '2026-10-06', stage: 'light', nutrientKey: 'floragrow-npk', ml: 20, trays: 10 }] } });
  const b = study({ id: 'b', sowingSize: 30, consumption: { water: [{ ...water[1]!, ozPerWatering: 16, trays: 30 }], supplements: [] } });

  it('averages per tray, weighted by trays studied; a supplement a study did not record counts zero', () => {
    const m = measuredConsumption([a, b])!;
    expect(m.studies).toBe(2);
    expect(m.trays).toBe(40);
    expect(m.waterOzPerTray).toBeCloseTo((1.5 * 2 * 10 + 12 * 10 + 16 * 30) / 40, 9);
    expect(m.ozPerWatering.mist).toBeCloseTo(1.5, 9);
    expect(m.ozPerWatering.bottom).toBeCloseTo((12 * 10 + 16 * 30) / 40, 9);
    expect(m.mlPerTray['floragrow-npk']).toBeCloseTo(20 / 40, 9);
  });

  it('only approved studies that recorded consumption count', () => {
    expect(measuredConsumption([study({ consumption: { water, supplements: [] }, approvedAt: null })])).toBeNull();
    expect(measuredConsumption([study()])).toBeNull();
  });

  it('a stored document keeps what reads and drops what does not', () => {
    const c = consumptionFrom({ water: [...water, { day: 'x', stage: 'light', method: 'bottom', ozPerWatering: 1, waterings: 1, trays: 1 }], supplements: [{ day: '2026-10-06', stage: 'light', nutrientKey: '', ml: 1, trays: 1 }] });
    expect(c.water).toHaveLength(2);
    expect(c.supplements).toHaveLength(0);
    expect(consumptionFrom(null)).toEqual(NO_CONSUMPTION);
  });

  it('the recording form starts from the stage schedule: every watered day, with its method and waterings', () => {
    const plan = broccoli();
    const days = planStageDays(plan);
    const rows = wateringDays(planStages(plan), days, '2026-10-01', 10);
    expect(rows[0]!.day).toBe('2026-10-01');
    expect(rows.every((r) => r.trays === 10)).toBe(true);
    expect(rows.at(-1)!.day <= `2026-10-${String(cycleDays(days)).padStart(2, '0')}`).toBe(true);
    expect(new Set(rows.map((r) => r.method))).toEqual(new Set(planStages(plan).filter((s) => s.watering !== 'none' && s.key !== 'soak').map((s) => s.watering)));
  });
});

describe('the costing reads the measured figures', () => {
  const n = NUTRIENT_BY_KEY['floragrow-npk']!;
  const nutrientOf = (plan: GrowPlanDef) => costGrowPlan(plan).lines.find((l) => l.line.kind === 'nutrient')!;

  it('a measured ml per tray is the nutrient line', () => {
    const measured = { studies: 1, trays: 10, ozPerWatering: {}, waterOzPerTray: 90, mlPerTray: { 'floragrow-npk': 3 }, approvedThrough: '2026-10-12' };
    const c = costGrowPlan({ ...broccoli(), measured });
    const l = c.lines.find((x) => x.line.kind === 'nutrient')!;
    expect(l.quantity).toBe(3);
    expect(l.costPerTray).toBeCloseTo(3 * n.costPerMl.value, 12);
    expect(l.basis).toContain('Measured');
    expect(c.waterOzPerTray).toBe(90);
    expect(c.measured).toBe(true);
  });

  it('measured ounces per watering stand over the placeholder volumes when no ml was measured', () => {
    const before = nutrientOf(broccoli());
    const bottom = WATER_PER_WATERING_OZ.bottom.value;
    const after = nutrientOf({ ...broccoli(), measured: { studies: 1, trays: 10, ozPerWatering: { bottom: 2 * bottom, mist: 2 * WATER_PER_WATERING_OZ.mist.value }, waterOzPerTray: null, mlPerTray: {}, approvedThrough: '2026-10-12' } });
    expect(after.quantity).toBeCloseTo(2 * before.quantity, 9);
    expect(after.quantity).toBeCloseTo((n.mlPerGal.value * (2 * before.quantity * FL_OZ_PER_GAL)) / n.mlPerGal.value / FL_OZ_PER_GAL, 9);
  });

  it('the resolver attaches what the approved studies measured to the plan, and the plan costs from it', () => {
    const library = growPlanSeed.map((p) => projectCropPlan(p));
    const approved = study({ consumption: { water: [], supplements: [{ day: '2026-10-06', stage: 'light', nutrientKey: 'floragrow-npk', ml: 30, trays: 10 }] } });
    const resolved = resolveScenarioInputs({}, library, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, [approved]);
    const broc = resolved.cropPlans.find((r) => r.code === 'BROC-01')!;
    expect(isGrowPlanCarrier(broc) && broc.plan.measured?.mlPerTray['floragrow-npk']).toBeCloseTo(3, 9);
    const other = resolved.cropPlans.find((r) => r.code !== 'BROC-01' && isGrowPlanCarrier(r))!;
    expect(isGrowPlanCarrier(other) && other.plan.measured).toBeUndefined();
  });

  it('Actuals lists each plan with an approved study, measured beside before', () => {
    const approved = study({ consumption: { water: [{ day: '2026-10-06', stage: 'light', method: 'bottom', ozPerWatering: 12, waterings: 1, trays: 10 }], supplements: [{ day: '2026-10-06', stage: 'light', nutrientKey: 'kelp', ml: 10, trays: 10 }] } });
    const rows = measuredRows(growPlanSeed, [approved]);
    expect(rows.map((r) => r.code)).toEqual(['BROC-01']);
    const r = rows[0]!;
    expect(r.perWatering.find((w) => w.method === 'bottom')).toMatchObject({ measured: 12, before: WATER_PER_WATERING_OZ.bottom.value });
    expect(r.supplements).toEqual([{ key: 'kelp', measuredMlPerTray: 1, beforeMlPerTray: null, onPlan: false }]);
    expect(r.laborMinutesPerTray).toBeCloseTo(summarizeStudy(approved).laborMinutesPerUnit, 9);
  });

  it('averageStudies never changes a single study it is given', () => {
    const s = study();
    expect(summarizeStudy(averageStudies([s])).laborMinutesPerUnit).toBeCloseTo(summarizeStudy(s).laborMinutesPerUnit, 9);
  });
});
