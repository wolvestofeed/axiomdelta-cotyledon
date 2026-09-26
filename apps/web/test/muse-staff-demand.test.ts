/**
 * Impact OS — production staff demand (Roadmap O3), on the batch and dispatch streams.
 */

import { describe, it, expect } from 'vitest';
import type { TimeStudyDoc } from '@/app/(muse)/muse/_data/time-studies';
import { staffDemand, staffDemandDocument } from '@/app/(muse)/muse/_engine/staff-demand';
import { deliveredConsumption } from '@/app/(muse)/muse/_engine/production-plan';

const study = (over: Partial<TimeStudyDoc>): TimeStudyDoc => ({
  id: 's', recipeCode: 'AMK-E-001', studiedOn: '2027-01-04', batchSize: 500, observer: 'A. Observer', qualityResult: 'pass', qualityNotes: null, adoptedAt: '2027-01-05T09:00:00.000Z', adoptedBy: 'admin', source: 'user_built', basis: 'observed',
  lines: [
    { task: 'Cabinet load', station: 'Blast chiller', staff: 2, elapsedMinutes: 25, laborMinutes: 50, scalesWith: 'fixed', stream: 'batch' },
    { task: 'Prep', station: 'Prep bench', staff: 4, elapsedMinutes: 75, laborMinutes: 300, scalesWith: 'variable', stream: 'batch' },
  ],
  ...over,
});

const run = (recipeCode: string, batchesScheduled: number, produced: number) => ({ recipeCode, recipeName: recipeCode, batchesScheduled, produced });
const ship = (recipeCode: string, portions: number) => ({ recipeCode, recipeName: recipeCode, portions });

describe('muse staff demand — the batch stream, from the day’s batches', () => {
  const studies = [
    study({ id: 'a' }),
    study({ id: 'b', recipeCode: 'AMK-E-002', batchSize: 400, lines: [{ task: 'Prep', station: 'Prep bench', staff: 3, elapsedMinutes: 60, laborMinutes: 180, scalesWith: 'variable', stream: 'batch' }] }),
    study({ id: 'c', recipeCode: 'AMK-E-003', adoptedAt: null }),
  ];

  it('counts a fixed batch line once per batch and a per-portion batch line per portion produced', () => {
    const d = staffDemand({ from: '2027-02-01', to: '2027-02-14', studies, days: [{ productionDate: '2027-02-01', runs: [run('AMK-E-001', 2, 1100)] }] });
    const day = d.days[0]!;
    expect(day.lines.find((l) => l.task === 'Cabinet load')!.hours).toBeCloseTo((50 * 2) / 60, 10);
    expect(day.lines.find((l) => l.task === 'Prep')!.hours).toBeCloseTo(((300 / 500) * 1100) / 60, 10);
    expect(day.batches).toBe(2);
    expect(day.portions).toBe(1100);
    expect(day.portionsShipped).toBe(0);
    expect(day.dispatchStaffHours).toBe(0);
  });

  it('sums the same task and station across recipes, headcount the most any study names', () => {
    const d = staffDemand({ from: '2027-02-01', to: '2027-02-14', studies, days: [{ productionDate: '2027-02-01', runs: [run('AMK-E-001', 1, 550), run('AMK-E-002', 1, 400)] }] });
    const prep = d.days[0]!.lines.find((l) => l.task === 'Prep')!;
    expect(prep.hours).toBeCloseTo(((300 / 500) * 550 + (180 / 400) * 400) / 60, 10);
    expect(prep.headcount).toBe(4);
    expect(prep.recipeCodes).toEqual(['AMK-E-001', 'AMK-E-002']);
  });

  it('a recipe with no adopted study is staffed from its estimated study, and listed as running on an estimate', () => {
    const d = staffDemand({
      from: '2027-01-04',
      to: '2027-01-08',
      days: [{ productionDate: '2027-01-04', runs: [run('AMK-E-003', 1, 500)] }],
      studies: [study({ id: 'e', recipeCode: 'AMK-E-003', adoptedAt: null, studiedOn: null, observer: null, qualityResult: null, basis: 'estimated' })],
    });
    expect(d.days[0]!.uncovered).toEqual([]);
    expect(d.days[0]!.staffHours).toBeCloseTo((50 + 300) / 60, 6);
    expect(d.estimatedRecipes).toEqual(['AMK-E-003']);
    expect(d.uncoveredRecipes).toEqual([]);
  });

  it('an observed study that is not adopted does not stand in; the estimate does', () => {
    const d = staffDemand({
      from: '2027-01-04',
      to: '2027-01-08',
      days: [{ productionDate: '2027-01-04', runs: [run('AMK-E-003', 2, 1000)] }],
      studies: [
        study({ id: 'o', recipeCode: 'AMK-E-003', adoptedAt: null, lines: [{ task: 'Everything', station: null, staff: 1, elapsedMinutes: 999, laborMinutes: 999, scalesWith: 'fixed', stream: 'batch' }] }),
        study({ id: 'e', recipeCode: 'AMK-E-003', adoptedAt: null, studiedOn: null, basis: 'estimated' }),
      ],
    });
    expect(d.days[0]!.staffHours).toBeCloseTo((2 * 50 + 300 * 2) / 60, 6);
    expect(d.estimatedRecipes).toEqual(['AMK-E-003']);
  });

  it('a recipe with batches and no time study at all is listed and carries no demand', () => {
    const d = staffDemand({ from: '2027-02-01', to: '2027-02-14', studies, days: [{ productionDate: '2027-02-02', runs: [run('AMK-E-003', 1, 500)] }] });
    expect(d.days[0]!.lines).toEqual([]);
    expect(d.days[0]!.uncovered).toEqual([{ recipeCode: 'AMK-E-003', recipeName: 'AMK-E-003', batches: 1, portions: 500, portionsShipped: 0 }]);
    expect(d.uncoveredRecipes).toEqual(['AMK-E-003']);
    expect(d.staffHours).toBe(0);
  });

  it('keeps only days inside the window', () => {
    const d = staffDemand({
      from: '2027-02-01',
      to: '2027-02-14',
      studies,
      days: [{ productionDate: '2027-01-29', runs: [run('AMK-E-001', 1, 550)] }, { productionDate: '2027-02-15', runs: [run('AMK-E-001', 1, 550)] }],
      dispatch: [{ date: '2027-02-15', shipments: [ship('AMK-E-001', 100)] }],
    });
    expect(d.days).toEqual([]);
    expect(d.productionDays).toBe(0);
    expect(d.deliveryDays).toBe(0);
  });
});

describe('muse staff demand — the dispatch stream, per portion shipped that day', () => {
  const lines = (loadMinutes: number): TimeStudyDoc['lines'] => [
    { task: 'Component blast chill and stage', station: 'Blast chiller', staff: 2, elapsedMinutes: 25, laborMinutes: 50, scalesWith: 'variable', stream: 'batch' },
    { task: 'Portion and assemble', station: 'Assembly line', staff: 4, elapsedMinutes: 75, laborMinutes: 300, scalesWith: 'variable', stream: 'dispatch' },
    { task: 'Load for transport', station: 'Dock', staff: 1, elapsedMinutes: loadMinutes, laborMinutes: loadMinutes, scalesWith: 'fixed', stream: 'dispatch' },
  ];
  const studies = [study({ id: 'a', lines: lines(10) }), study({ id: 'b', recipeCode: 'AMK-E-002', batchSize: 400, lines: lines(12) })];

  it('dispatch lines fall on the delivery day and scale with the portions shipped, not produced', () => {
    const d = staffDemand({
      from: '2027-02-01',
      to: '2027-02-14',
      studies,
      days: [{ productionDate: '2027-02-01', runs: [run('AMK-E-001', 1, 500)] }],
      dispatch: [{ date: '2027-02-02', shipments: [ship('AMK-E-001', 125)] }],
    });
    const [production, delivery] = d.days;
    expect(production!.date).toBe('2027-02-01');
    expect(production!.lines.map((l) => l.task)).toEqual(['Component blast chill and stage']);
    expect(production!.batchStaffHours).toBeCloseTo((50 / 500) * 500 / 60, 10);
    expect(delivery!.date).toBe('2027-02-02');
    expect(delivery!.batches).toBe(0);
    expect(delivery!.portionsShipped).toBe(125);
    expect(delivery!.lines.find((l) => l.task === 'Portion and assemble')!.hours).toBeCloseTo(((300 / 500) * 125) / 60, 10);
    expect(delivery!.lines.every((l) => l.stream === 'dispatch')).toBe(true);
    expect(d.productionDays).toBe(1);
    expect(d.deliveryDays).toBe(1);
  });

  it('a fixed dispatch line counts once per delivery day — the largest any shipped recipe names — not once per recipe', () => {
    const d = staffDemand({ from: '2027-02-01', to: '2027-02-14', studies, days: [], dispatch: [{ date: '2027-02-02', shipments: [ship('AMK-E-001', 125), ship('AMK-E-002', 80)] }] });
    const day = d.days[0]!;
    expect(day.lines.find((l) => l.task === 'Load for transport')!.hours).toBeCloseTo(12 / 60, 10);
    expect(day.lines.find((l) => l.task === 'Portion and assemble')!.hours).toBeCloseTo(((300 / 500) * 125 + (300 / 400) * 80) / 60, 10);
    expect(day.dispatchStaffHours).toBeCloseTo(day.staffHours, 10);
  });

  it('a production and a delivery on the same date sum on one day; a shipment with no study is listed', () => {
    const d = staffDemand({
      from: '2027-02-01',
      to: '2027-02-14',
      studies,
      days: [{ productionDate: '2027-02-02', runs: [run('AMK-E-001', 1, 500)] }],
      dispatch: [{ date: '2027-02-02', shipments: [ship('AMK-E-001', 125), ship('AMK-E-009', 40), ship('AMK-E-002', 0)] }],
    });
    expect(d.days).toHaveLength(1);
    const day = d.days[0]!;
    expect(day.batchStaffHours + day.dispatchStaffHours).toBeCloseTo(day.staffHours, 10);
    expect(day.batchStaffHours).toBeCloseTo(50 / 60, 10);
    expect(day.uncovered).toEqual([{ recipeCode: 'AMK-E-009', recipeName: 'AMK-E-009', batches: 0, portions: 0, portionsShipped: 40 }]);
    expect(day.portionsShipped).toBe(165);
  });

  it('the document for CompTable carries tasks, stations, people and hours — no positions, pay or stream', () => {
    const d = staffDemand({ from: '2027-02-01', to: '2027-02-14', studies, days: [{ productionDate: '2027-02-01', runs: [run('AMK-E-001', 1, 550)] }], dispatch: [{ date: '2027-02-02', shipments: [ship('AMK-E-001', 125)] }] });
    const doc = staffDemandDocument(d, '2027-01-31T12:00:00.000Z');
    expect(doc.kind).toBe('muse.staff_demand');
    expect(doc.days.map((x) => x.date)).toEqual(['2027-02-01', '2027-02-02']);
    expect(Object.keys(doc.days[0]!.lines[0]!).sort()).toEqual(['headcount', 'hours', 'station', 'task']);
  });
});

describe('muse — what delivered orders drew from finished goods', () => {
  it('takes the linked delivery’s meals and date, in base portions', () => {
    const c = deliveredConsumption(
      [
        { status: 'delivered', deliveryId: 'd1', recipeCode: 'AMK-E-001', channel: 1, orderDate: '2027-02-01', meals: 100 },
        { status: 'confirmed', deliveryId: null, recipeCode: 'AMK-E-001', channel: 1, orderDate: '2027-02-02', meals: 100 },
      ],
      [{ id: 'd1', deliveredOn: '2027-02-01', meals: 96 }],
      [],
      { 1: 1.5 },
    );
    expect(c).toEqual([{ recipeCode: 'AMK-E-001', date: '2027-02-01', basePortions: 144 }]);
  });
});
