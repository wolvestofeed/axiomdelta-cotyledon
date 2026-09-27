/**
 * MicroFarm — production staff demand (Roadmap O3), on the sowing and harvest streams.
 */

import { describe, it, expect } from 'vitest';
import type { TimeStudyDoc } from '@/data/time-studies';
import { staffDemand, staffDemandDocument, traysOnShelf, cycleDaysByCode, stageDaysByCode } from '@/engine/staff-demand';
import { growPlanSeed } from '@/data/grow-plans-seed';
/** A plan that is not a grow plan: the carrier without the grow plan it was projected from. */

import { distributedConsumption } from '@/engine/production-plan';

const study = (over: Partial<TimeStudyDoc>): TimeStudyDoc => ({
  id: 's', growPlanCode: 'AMK-E-001', studiedOn: '2027-01-04', sowingSize: 500, cycleDays: 0, observer: 'A. Observer', qualityResult: 'pass', qualityNotes: null, approvedAt: '2027-01-05T09:00:00.000Z', approvedBy: 'admin', source: 'user_built', basis: 'observed', consumption: { water: [], supplements: [] },
  lines: [
    { task: 'Rack load', station: 'Blackout rack', staff: 2, elapsedMinutes: 25, laborMinutes: 50, scalesWith: 'fixed', stream: 'sowing' },
    { task: 'Prep', station: 'Prep bench', staff: 4, elapsedMinutes: 75, laborMinutes: 300, scalesWith: 'variable', stream: 'sowing' },
  ],
  ...over,
});

const run = (growPlanCode: string, sowingsScheduled: number, produced: number) => ({ growPlanCode, growPlanName: growPlanCode, sowingsScheduled, produced });
const ship = (growPlanCode: string, units: number) => ({ growPlanCode, growPlanName: growPlanCode, units });

describe('farm staff demand — the sowing stream, from the day’s sowings', () => {
  const studies = [
    study({ id: 'a' }),
    study({ id: 'b', growPlanCode: 'AMK-E-002', sowingSize: 400, lines: [{ task: 'Prep', station: 'Prep bench', staff: 3, elapsedMinutes: 60, laborMinutes: 180, scalesWith: 'variable', stream: 'sowing' }] }),
    study({ id: 'c', growPlanCode: 'AMK-E-003', approvedAt: null }),
  ];

  it('counts a fixed sowing line once per sowing and a per-unit sowing line per unit produced', () => {
    const d = staffDemand({ from: '2027-02-01', to: '2027-02-14', studies, days: [{ productionDate: '2027-02-01', runs: [run('AMK-E-001', 2, 1100)] }] });
    const day = d.days[0]!;
    expect(day.lines.find((l) => l.task === 'Rack load')!.hours).toBeCloseTo((50 * 2) / 60, 10);
    expect(day.lines.find((l) => l.task === 'Prep')!.hours).toBeCloseTo(((300 / 500) * 1100) / 60, 10);
    expect(day.sowings).toBe(2);
    expect(day.units).toBe(1100);
    expect(day.unitsShipped).toBe(0);
    expect(day.harvestStaffHours).toBe(0);
  });

  it('sums the same task and station across grow plans, headcount the most any study names', () => {
    const d = staffDemand({ from: '2027-02-01', to: '2027-02-14', studies, days: [{ productionDate: '2027-02-01', runs: [run('AMK-E-001', 1, 550), run('AMK-E-002', 1, 400)] }] });
    const prep = d.days[0]!.lines.find((l) => l.task === 'Prep')!;
    expect(prep.hours).toBeCloseTo(((300 / 500) * 550 + (180 / 400) * 400) / 60, 10);
    expect(prep.headcount).toBe(4);
    expect(prep.growPlanCodes).toEqual(['AMK-E-001', 'AMK-E-002']);
  });

  it('a grow plan with no adopted study is staffed from its estimated study, and listed as running on an estimate', () => {
    const d = staffDemand({
      from: '2027-01-04',
      to: '2027-01-08',
      days: [{ productionDate: '2027-01-04', runs: [run('AMK-E-003', 1, 500)] }],
      studies: [study({ id: 'e', growPlanCode: 'AMK-E-003', approvedAt: null, studiedOn: null, observer: null, qualityResult: null, basis: 'estimated' })],
    });
    expect(d.days[0]!.uncovered).toEqual([]);
    expect(d.days[0]!.staffHours).toBeCloseTo((50 + 300) / 60, 6);
    expect(d.estimatedGrowPlans).toEqual(['AMK-E-003']);
    expect(d.uncoveredGrowPlans).toEqual([]);
  });

  it('an observed study that is not adopted does not stand in; the estimate does', () => {
    const d = staffDemand({
      from: '2027-01-04',
      to: '2027-01-08',
      days: [{ productionDate: '2027-01-04', runs: [run('AMK-E-003', 2, 1000)] }],
      studies: [
        study({ id: 'o', growPlanCode: 'AMK-E-003', approvedAt: null, lines: [{ task: 'Everything', station: null, staff: 1, elapsedMinutes: 999, laborMinutes: 999, scalesWith: 'fixed', stream: 'sowing' }] }),
        study({ id: 'e', growPlanCode: 'AMK-E-003', approvedAt: null, studiedOn: null, basis: 'estimated' }),
      ],
    });
    expect(d.days[0]!.staffHours).toBeCloseTo((2 * 50 + 300 * 2) / 60, 6);
    expect(d.estimatedGrowPlans).toEqual(['AMK-E-003']);
  });

  it('a grow plan with sowings and no time study at all is listed and carries no demand', () => {
    const d = staffDemand({ from: '2027-02-01', to: '2027-02-14', studies, days: [{ productionDate: '2027-02-02', runs: [run('AMK-E-003', 1, 500)] }] });
    expect(d.days[0]!.lines).toEqual([]);
    expect(d.days[0]!.uncovered).toEqual([{ growPlanCode: 'AMK-E-003', growPlanName: 'AMK-E-003', sowings: 1, units: 500, unitsShipped: 0 }]);
    expect(d.uncoveredGrowPlans).toEqual(['AMK-E-003']);
    expect(d.staffHours).toBe(0);
  });

  it('keeps only days inside the window', () => {
    const d = staffDemand({
      from: '2027-02-01',
      to: '2027-02-14',
      studies,
      days: [{ productionDate: '2027-01-29', runs: [run('AMK-E-001', 1, 550)] }, { productionDate: '2027-02-15', runs: [run('AMK-E-001', 1, 550)] }],
      harvest: [{ date: '2027-02-15', shipments: [ship('AMK-E-001', 100)] }],
    });
    expect(d.days).toEqual([]);
    expect(d.productionDays).toBe(0);
    expect(d.distributionDays).toBe(0);
  });
});

describe('farm staff demand — the harvest stream, per unit shipped that day', () => {
  const lines = (loadMinutes: number): TimeStudyDoc['lines'] => [
    { task: 'Component blackout and stage', station: 'Blackout rack', staff: 2, elapsedMinutes: 25, laborMinutes: 50, scalesWith: 'variable', stream: 'sowing' },
    { task: 'Unit and assemble', station: 'Assembly line', staff: 4, elapsedMinutes: 75, laborMinutes: 300, scalesWith: 'variable', stream: 'harvest' },
    { task: 'Load for transport', station: 'Dock', staff: 1, elapsedMinutes: loadMinutes, laborMinutes: loadMinutes, scalesWith: 'fixed', stream: 'harvest' },
  ];
  const studies = [study({ id: 'a', lines: lines(10) }), study({ id: 'b', growPlanCode: 'AMK-E-002', sowingSize: 400, lines: lines(12) })];

  it('harvest lines fall on the distribution day and scale with the units shipped, not produced', () => {
    const d = staffDemand({
      from: '2027-02-01',
      to: '2027-02-14',
      studies,
      days: [{ productionDate: '2027-02-01', runs: [run('AMK-E-001', 1, 500)] }],
      harvest: [{ date: '2027-02-02', shipments: [ship('AMK-E-001', 125)] }],
    });
    const [production, distribution] = d.days;
    expect(production!.date).toBe('2027-02-01');
    expect(production!.lines.map((l) => l.task)).toEqual(['Component blackout and stage']);
    expect(production!.sowingStaffHours).toBeCloseTo((50 / 500) * 500 / 60, 10);
    expect(distribution!.date).toBe('2027-02-02');
    expect(distribution!.sowings).toBe(0);
    expect(distribution!.unitsShipped).toBe(125);
    expect(distribution!.lines.find((l) => l.task === 'Unit and assemble')!.hours).toBeCloseTo(((300 / 500) * 125) / 60, 10);
    expect(distribution!.lines.every((l) => l.stream === 'harvest')).toBe(true);
    expect(d.productionDays).toBe(1);
    expect(d.distributionDays).toBe(1);
  });

  it('a fixed harvest line counts once per distribution day — the largest any shipped grow plan names — not once per grow plan', () => {
    const d = staffDemand({ from: '2027-02-01', to: '2027-02-14', studies, days: [], harvest: [{ date: '2027-02-02', shipments: [ship('AMK-E-001', 125), ship('AMK-E-002', 80)] }] });
    const day = d.days[0]!;
    expect(day.lines.find((l) => l.task === 'Load for transport')!.hours).toBeCloseTo(12 / 60, 10);
    expect(day.lines.find((l) => l.task === 'Unit and assemble')!.hours).toBeCloseTo(((300 / 500) * 125 + (300 / 400) * 80) / 60, 10);
    expect(day.harvestStaffHours).toBeCloseTo(day.staffHours, 10);
  });

  it('a production and a distribution on the same date sum on one day; a shipment with no study is listed', () => {
    const d = staffDemand({
      from: '2027-02-01',
      to: '2027-02-14',
      studies,
      days: [{ productionDate: '2027-02-02', runs: [run('AMK-E-001', 1, 500)] }],
      harvest: [{ date: '2027-02-02', shipments: [ship('AMK-E-001', 125), ship('AMK-E-009', 40), ship('AMK-E-002', 0)] }],
    });
    expect(d.days).toHaveLength(1);
    const day = d.days[0]!;
    expect(day.sowingStaffHours + day.harvestStaffHours).toBeCloseTo(day.staffHours, 10);
    expect(day.sowingStaffHours).toBeCloseTo(50 / 60, 10);
    expect(day.uncovered).toEqual([{ growPlanCode: 'AMK-E-009', growPlanName: 'AMK-E-009', sowings: 0, units: 0, unitsShipped: 40 }]);
    expect(day.unitsShipped).toBe(165);
  });

  it('the document for Staffing carries tasks, stations, people and hours — no positions, pay or stream', () => {
    const d = staffDemand({ from: '2027-02-01', to: '2027-02-14', studies, days: [{ productionDate: '2027-02-01', runs: [run('AMK-E-001', 1, 550)] }], harvest: [{ date: '2027-02-02', shipments: [ship('AMK-E-001', 125)] }] });
    const doc = staffDemandDocument(d, '2027-01-31T12:00:00.000Z');
    expect(doc.kind).toBe('farm.staff_demand');
    expect(doc.days.map((x) => x.date)).toEqual(['2027-02-01', '2027-02-02']);
    expect(Object.keys(doc.days[0]!.lines[0]!).sort()).toEqual(['headcount', 'hours', 'station', 'task']);
  });
});

describe('farm — what distributed orders drew from finished goods', () => {
  it('takes the linked distribution’s units and date, in base units', () => {
    const c = distributedConsumption(
      [
        { status: 'distributed', distributionId: 'd1', growPlanCode: 'AMK-E-001', channel: 1, orderDate: '2027-02-01', units: 100 },
        { status: 'confirmed', distributionId: null, growPlanCode: 'AMK-E-001', channel: 1, orderDate: '2027-02-02', units: 100 },
      ],
      [{ id: 'd1', distributedOn: '2027-02-01', units: 96 }],
      [],
      { 1: 1.5 },
    );
    expect(c).toEqual([{ growPlanCode: 'AMK-E-001', date: '2027-02-01', baseUnits: 144 }]);
  });
});

describe('farm staff demand — the daily stream, from the trays on the shelves', () => {
  const daily = study({
    id: 'd', growPlanCode: 'BROC-01', sowingSize: 20, cycleDays: 4,
    lines: [
      { task: 'Sow trays', station: 'Prep station', staff: 1, elapsedMinutes: 60, laborMinutes: 60, scalesWith: 'variable', stream: 'sowing' },
      { task: 'Watering', station: 'Grow rack', staff: 1, elapsedMinutes: 10, laborMinutes: 10, scalesWith: 'variable', stream: 'daily' },
      { task: 'Walk-through', station: 'Grow rack', staff: 1, elapsedMinutes: 6, laborMinutes: 6, scalesWith: 'fixed', stream: 'daily' },
    ],
  });

  it('the shelf is derived from the sowings: a sowing occupies its cycle days from the production date', () => {
    const shelf = traysOnShelf([{ productionDate: '2027-02-01', runs: [run('BROC-01', 1, 20)] }, { productionDate: '2027-02-03', runs: [run('BROC-01', 1, 20)] }], { 'BROC-01': 4 }, '2027-02-01', '2027-02-14');
    expect(shelf.map((d) => [d.date, d.trays[0]!.trays])).toEqual([['2027-02-01', 20], ['2027-02-02', 20], ['2027-02-03', 40], ['2027-02-04', 40], ['2027-02-05', 20], ['2027-02-06', 20]]);
    expect(traysOnShelf([{ productionDate: '2027-01-30', runs: [run('BROC-01', 1, 20)] }], { 'BROC-01': 4 }, '2027-02-01', '2027-02-14').map((d) => d.date)).toEqual(['2027-02-01', '2027-02-02']);
    expect(traysOnShelf([{ productionDate: '2027-02-01', runs: [run('AMK-E-001', 1, 500)] }], { 'AMK-E-001': 0 }, '2027-02-01', '2027-02-14')).toEqual([]);
  });

  it('cycle days come off the grow plan', () => {
    const c = cycleDaysByCode([growPlanSeed[0]!]);
    expect(c['BROC-01']).toBe(14);
  });

  it('a per-tray daily line counts per tray on the shelf; a fixed daily line once a day', () => {
    const shelf = [{ date: '2027-02-02', trays: [{ growPlanCode: 'BROC-01', growPlanName: 'BROC-01', trays: 40 }] }];
    const d = staffDemand({ from: '2027-02-01', to: '2027-02-14', studies: [daily], days: [], shelf });
    const day = d.days.find((x) => x.date === '2027-02-02')!;
    expect(day.traysOnShelf).toBe(40);
    const watering = day.lines.find((l) => l.task === 'Watering')!;
    expect(watering.stream).toBe('daily');
    expect(watering.hours).toBeCloseTo((10 / 20) * 40 / 60, 9);
    expect(day.lines.find((l) => l.task === 'Walk-through')!.hours).toBeCloseTo(6 / 60, 9);
    expect(day.dailyStaffHours).toBeCloseTo((20 + 6) / 60, 9);
    expect(day.sowingStaffHours).toBe(0);
    expect(day.staffHours).toBeCloseTo(day.dailyStaffHours, 9);
  });

  it('the sow day carries the sowing stream and the daily stream of what is already on the shelf', () => {
    const days = [{ productionDate: '2027-02-01', runs: [run('BROC-01', 1, 20)] }];
    const shelf = traysOnShelf(days, { 'BROC-01': 4 }, '2027-02-01', '2027-02-14');
    const d = staffDemand({ from: '2027-02-01', to: '2027-02-14', studies: [daily], days, shelf });
    expect(d.days.map((x) => x.date)).toEqual(['2027-02-01', '2027-02-02', '2027-02-03', '2027-02-04']);
    expect(d.days[0]!.sowingStaffHours).toBeCloseTo(1, 9);
    expect(d.days[0]!.dailyStaffHours).toBeCloseTo((10 + 6) / 60, 9);
    expect(d.days[3]!.sowingStaffHours).toBe(0);
    expect(d.staffHours).toBeCloseTo(1 + 4 * (16 / 60), 9);
  });
});

describe('farm staff demand — the daily stream placed on the stages its tasks cover', () => {
  const broc = growPlanSeed.find((p) => p.code === 'BROC-01')!;
  const days = stageDaysByCode([broc]);
  const cycle = cycleDaysByCode([broc])['BROC-01']!;
  const trays = 20;
  // One day's minutes for a 20-tray sowing, each task's total per tray spread over the cycle, as the estimate writes them.
  const perDay = (totalPerTray: number) => (totalPerTray / cycle) * trays;
  const shaped = study({
    growPlanCode: 'BROC-01', sowingSize: trays, cycleDays: cycle,
    lines: [
      { task: 'Blackout watering', station: 'Grow rack', staff: 1, elapsedMinutes: perDay(1), laborMinutes: perDay(1), scalesWith: 'variable', stream: 'daily' },
      { task: 'Watering under lights', station: 'Grow rack', staff: 1, elapsedMinutes: perDay(3), laborMinutes: perDay(3), scalesWith: 'variable', stream: 'daily' },
      { task: 'Inspection and sanitization', station: 'Grow rack', staff: 1, elapsedMinutes: perDay(5), laborMinutes: perDay(5), scalesWith: 'variable', stream: 'daily' },
    ],
  });
  const shelf = traysOnShelf([{ productionDate: '2027-02-01', runs: [run('BROC-01', 1, trays)] }], { 'BROC-01': cycle }, '2027-02-01', '2027-03-31');
  const demand = staffDemand({ from: '2027-02-01', to: '2027-03-31', studies: [shaped], days: [], shelf, stageDays: days });
  const hours = (task: string) => demand.days.map((d) => d.lines.find((l) => l.task === task)?.hours ?? 0);

  it('the shelf carries each sowing by day of its cycle', () => {
    expect(shelf.map((d) => d.trays[0]!.byDay)).toEqual(Array.from({ length: cycle }, (_, k) => [{ dayOfCycle: k, trays }]));
  });

  it('falls only on the days a tray is in the task\'s span', () => {
    const d = days['BROC-01']!;
    const stageOf = (k: number) => (k < d.sow ? 'sow' : k < d.sow + d.germination ? 'germination' : k < d.sow + d.germination + d.blackout ? 'blackout' : k < d.sow + d.germination + d.blackout + d.light ? 'light' : 'harvest-window');
    hours('Blackout watering').forEach((h, k) => expect(h > 0, `blackout day ${k}`).toBe(stageOf(k) === 'blackout'));
    hours('Watering under lights').forEach((h, k) => expect(h > 0, `light day ${k}`).toBe(stageOf(k) === 'light' || stageOf(k) === 'harvest-window'));
    expect(hours('Inspection and sanitization').every((h) => h > 0)).toBe(true);
  });

  it('keeps each task\'s total over the cycle', () => {
    const total = (task: string) => hours(task).reduce((t, h) => t + h, 0) * 60;
    expect(total('Blackout watering')).toBeCloseTo(1 * trays, 9);
    expect(total('Watering under lights')).toBeCloseTo(3 * trays, 9);
    expect(total('Inspection and sanitization')).toBeCloseTo(5 * trays, 9);
  });

  it('without the stage days, a daily line is spread evenly as before', () => {
    const even = staffDemand({ from: '2027-02-01', to: '2027-03-31', studies: [shaped], days: [], shelf });
    const h = even.days.map((d) => d.lines.find((l) => l.task === 'Blackout watering')!.hours);
    expect(new Set(h.map((x) => x.toFixed(9))).size).toBe(1);
  });
});
