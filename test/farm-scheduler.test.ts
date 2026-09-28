/**
 * Cotyledon — the scheduler (scheduler build plan W1): a golden day, the flips,
 * the priority rules, constrained crews and the reconciliation to staff demand.
 */

import { describe, it, expect } from 'vitest';
import { equipmentSeed } from '@/data/capex';
import { newCrew } from '@/data/crews';
import { capacityInputs } from '@/data/plan-data';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { tagged } from '@/data/tagged';
import type { TimeStudyDoc } from '@/data/time-studies';
import { deriveCapacity } from '@/engine';
import { routeOrder, routeResources, type GrowPlanRoute, type RouteResource, type RouteStep } from '@/engine/routing';
import { resolveScenarioInputs, type SchedulePolicyOverlay } from '@/engine/scenario';
import { schedule, scheduleInputsForDay, type ScheduleInput, type ScheduledBlock } from '@/engine/scheduler';
import { staffDemand } from '@/engine/staff-demand';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';

const step = (o: Partial<RouteStep> & Pick<RouteStep, 'id' | 'stream' | 'kind'>): RouteStep => ({
  seq: 0, component: null, task: o.id, station: null, resourceKey: null, staff: 1, scalesWith: 'fixed', setupMinutes: 0, runMinutesPerUnit: 0,
  laborMinutesFixed: 0, laborMinutesPerUnit: 0, attended: true, controlPoint: null, after: [], edited: false, ...o,
});

function route(code: string, steps: RouteStep[]): GrowPlanRoute {
  const numbered = steps.map((s, i) => ({ ...s, seq: i + 1 }));
  return { growPlanCode: code, studyId: `s-${code}`, basis: 'estimated', sowingSize: 100, steps: numbered, order: routeOrder(numbered), findings: [] };
}

// A hand-built route at a 100-unit study: two sows on two grow units, a turnaround after both, and the harvest chain.
const LONG = route('T-1', [
  step({ id: 'receiving', stream: 'sowing', kind: 'prep', setupMinutes: 30, staff: 2, laborMinutesFixed: 60 }),
  step({ id: 'prep:A', stream: 'sowing', kind: 'prep', scalesWith: 'variable', runMinutesPerUnit: 0.3, laborMinutesPerUnit: 0.3, after: ['receiving'] }),
  step({ id: 'sow:A', stream: 'sowing', kind: 'sow', resourceKey: 'K', setupMinutes: 60, laborMinutesFixed: 20, attended: false, after: ['prep:A'] }),
  step({ id: 'sow:B', stream: 'sowing', kind: 'sow', resourceKey: 'S', setupMinutes: 20, laborMinutesFixed: 20, after: ['receiving'] }),
  step({ id: 'turnaround', stream: 'sowing', kind: 'other', setupMinutes: 15, staff: 2, laborMinutesFixed: 30, after: ['sow:A', 'sow:B'] }),
  step({ id: 'cold:X', stream: 'harvest', kind: 'harvest', scalesWith: 'variable', staff: 2, runMinutesPerUnit: 0.2, laborMinutesPerUnit: 0.4 }),
  step({ id: 'assemble', stream: 'harvest', kind: 'harvest', scalesWith: 'variable', staff: 4, runMinutesPerUnit: 0.5, laborMinutesPerUnit: 2, after: ['cold:X'] }),
  step({ id: 'seal', stream: 'harvest', kind: 'harvest', resourceKey: 'T', scalesWith: 'variable', staff: 2, runMinutesPerUnit: 0.3, laborMinutesPerUnit: 0.6, after: ['assemble'] }),
  step({ id: 'pack-check', stream: 'harvest', kind: 'harvest', scalesWith: 'variable', runMinutesPerUnit: 0.1, laborMinutesPerUnit: 0.1, after: ['seal'] }),
  step({ id: 'load', stream: 'harvest', kind: 'harvest', setupMinutes: 10, laborMinutesFixed: 10, after: ['pack-check'] }),
]);
// One sow only, on the shelf.
const SHORT = route('T-2', LONG.steps.filter((s) => !['prep:A', 'sow:A'].includes(s.id)).map((s) => (s.id === 'turnaround' ? { ...s, after: ['sow:B'] } : s)));

const res = (key: string): RouteResource => ({ key, item: key, units: 1, concurrentSowings: tagged<number | null>(1, 'STATED'), changeoverMinutes: tagged<number | null>(0, 'STATED'), attendedRun: tagged<boolean | null>(null, 'STATED'), mayRunUnattended: tagged<boolean | null>(false, 'STATED') });
const RESOURCES = ['K', 'S', 'T'].map(res);
const policy = (o: SchedulePolicyOverlay = {}) => resolveScenarioInputs({ schedulePolicy: o }).schedulePolicy;
const sowing = (id: string, r: GrowPlanRoute = LONG, units = 100) => ({ id, growPlanCode: r.growPlanCode, units, route: r });
const crew = (id: string, startMin: number, endMin: number, headcount: number) => newCrew(id, { startMin, endMin, headcount }, { startMin, endMin, headcount });

const day = (over: Partial<ScheduleInput> = {}) =>
  schedule({
    date: '2027-02-01',
    sowings: [sowing('b1'), sowing('b2')],
    dispatches: [{ id: 'd1', growPlanCode: 'T-1', units: 150, route: LONG }],
    resources: RESOURCES,
    crews: [],
    capacityInputs,
    policy: policy(),
    ...over,
  });
const span = (blocks: ScheduledBlock[], orderId: string | null, task: string) => {
  const b = blocks.find((x) => x.orderId === orderId && (x.stepId === task || x.task === task));
  return b ? [b.startMin, b.endMin] : null;
};

describe('farm scheduler — the golden day', () => {
  const r = day();

  it('places the first sowing forward from opening: receiving, prep, the sows on their units, the turnaround after both', () => {
    expect(span(r.blocks, 'b1', 'receiving')).toEqual([420, 450]);
    expect(span(r.blocks, 'b1', 'prep:A')).toEqual([450, 480]);
    expect(span(r.blocks, 'b1', 'sow:A')).toEqual([480, 540]);
    expect(span(r.blocks, 'b1', 'sow:B')).toEqual([450, 470]);
    expect(span(r.blocks, 'b1', 'turnaround')).toEqual([540, 555]);
  });

  it('the second sowing waits for each unit its sows run on', () => {
    expect(span(r.blocks, 'b2', 'sow:A')).toEqual([540, 600]);
    expect(span(r.blocks, 'b2', 'sow:B')).toEqual([470, 490]);
    expect(span(r.blocks, 'b2', 'turnaround')).toEqual([600, 615]);
  });

  it('harvest is placed backward from the 10:30 distribution time, the vehicle load once for the day', () => {
    expect(span(r.blocks, null, 'load')).toEqual([620, 630]);
    expect(span(r.blocks, 'd1', 'pack-check')).toEqual([605, 620]);
    expect(span(r.blocks, 'd1', 'seal')).toEqual([560, 605]);
    expect(span(r.blocks, 'd1', 'assemble')).toEqual([485, 560]);
    expect(span(r.blocks, 'd1', 'cold:X')).toEqual([455, 485]);
    expect(r.blocks.filter((b) => b.stepId === 'load')).toHaveLength(1);
  });

  it('closedown is placed once at the close, one person for 30 minutes', () => {
    const c = r.blocks.filter((b) => b.kind === 'closedown');
    expect(c.map((b) => [b.startMin, b.endMin, b.staff, b.laborMinutes])).toEqual([[1110, 1140, 1, 30]]);
  });

  it('no violations; the metrics', () => {
    expect(r.violations).toEqual([]);
    expect(r.metrics).toMatchObject({ sowingsPlaced: 2, sowingsUnplaced: 0, unitsPlaced: 200, dispatchesPlaced: 1, unitsShipped: 150, firstStartMin: 420, lastEndMin: 630, makespanMin: 210, bindingResourceKey: 'K' });
    // 160 min a sowing (60 + 30 + 20 + 20 + 30) × 2; harvest 60 + 300 + 90 + 15 + 10.
    expect(r.metrics.sowingLaborHours).toBeCloseTo(320 / 60, 9);
    expect(r.metrics.harvestLaborHours).toBeCloseTo(475 / 60, 9);
    expect(r.metrics.laborHours).toBeCloseTo(795 / 60, 9);
    expect(r.metrics.closedownHours).toBe(0.5);
    expect(r.metrics.utilizationByResource['K']).toBeCloseTo(120 / 720, 9);
  });

  it('every block is a study step or the closedown: no rack and no unattended stage', () => {
    expect(new Set(r.blocks.map((b) => b.kind))).toEqual(new Set(['step', 'closedown']));
  });
});

describe('farm scheduler — the flips', () => {
  it('over capacity: thirteen sowings run the unit past the close and it says so', () => {
    const r = day({ sowings: Array.from({ length: 13 }, (_, i) => sowing(`b${i + 1}`)), dispatches: [] });
    const over = r.violations.find((v) => v.kind === 'resource-over-capacity' && v.resourceKey === 'K');
    expect(over).toMatchObject({ jobs: 13, jobsInsideDay: 11 });
    expect(r.violations.some((v) => v.kind === 'outside-operating-day')).toBe(true);
    expect(r.metrics.sowingsPlaced).toBe(13); // requirement mode: placed and reported, never dropped
  });

  it('crew shortfall: two people all day cannot cover four at assembly or two receivings at once', () => {
    const r = day({ crews: [crew('c1', 420, 1140, 2)] });
    const short = r.violations.filter((v) => v.kind === 'crew-shortfall');
    expect(short.length).toBeGreaterThan(0);
    expect(short.some((v) => v.kind === 'crew-shortfall' && v.required >= 4 && v.scheduled === 2)).toBe(true);
    expect(r.metrics.crewHours).toBe(24);
  });

  it('due date: a distribution at 08:00 cannot be met backward; the order is placed forward and reported late', () => {
    const r = day({ sowings: [], policy: policy({ distributionTimeMin: 480 }) });
    expect(span(r.blocks, 'd1', 'cold:X')).toEqual([420, 450]);
    expect(span(r.blocks, 'd1', 'pack-check')).toEqual([570, 585]);
    expect(r.violations.find((v) => v.kind === 'due-date-missed')).toMatchObject({ orderId: 'd1', dueMin: 480, byMin: 105 });
  });

  it('forward harvest places it first thing from opening, the load after it', () => {
    const r = day({ sowings: [], policy: policy({ harvestDirection: 'forward' }) });
    expect(span(r.blocks, 'd1', 'cold:X')).toEqual([420, 450]);
    expect(span(r.blocks, null, 'load')).toEqual([585, 595]);
    expect(r.violations).toEqual([]);
  });
});

describe('farm scheduler — constrained crews', () => {
  it('holds work for free crew, keeps everything inside the day, and reports what does not fit as unplaced', () => {
    const r = day({ crews: [crew('c1', 420, 1140, 3)], policy: policy({ crewMode: 'constrained' }) });
    expect(r.violations.find((v) => v.kind === 'unplaced')).toMatchObject({ orderId: 'd1', stream: 'harvest' }); // assembly needs 4
    expect(r.metrics.sowingsPlaced).toBe(2);
    for (const b of r.blocks) {
      expect(b.startMin).toBeGreaterThanOrEqual(420);
      expect(b.endMin).toBeLessThanOrEqual(1140);
    }
    // b1's receiving holds two of the three to 07:30, then its prep and sow B one each to 07:50: b2's two-person receiving waits for them.
    expect(span(r.blocks, 'b2', 'receiving')).toEqual([470, 500]);
    const points = [...new Set(r.blocks.flatMap((b) => [b.startMin]))];
    for (const p of points) {
      const load = r.blocks.reduce((n, b) => (b.staff > 0 && b.laborMinutes > 0 && b.startMin <= p && p < b.startMin + b.laborMinutes / b.staff ? n + b.staff : n), 0);
      expect(load).toBeLessThanOrEqual(3);
    }
  });

  it('whole sowings only: the sowings the day holds are placed; the rest are unplaced, not squeezed', () => {
    const r = day({ sowings: Array.from({ length: 13 }, (_, i) => sowing(`b${i + 1}`)), dispatches: [], crews: [crew('c1', 420, 1140, 10)], policy: policy({ crewMode: 'constrained' }) });
    expect(r.metrics.sowingsPlaced + r.metrics.sowingsUnplaced).toBe(13);
    expect(r.metrics.sowingsUnplaced).toBeGreaterThan(0);
    const unplaced = r.violations.filter((v) => v.kind === 'unplaced').map((v) => v.kind === 'unplaced' && v.orderId);
    expect(unplaced).toEqual(Array.from({ length: r.metrics.sowingsUnplaced }, (_, i) => `b${13 - r.metrics.sowingsUnplaced + i + 1}`));
    expect(r.violations.some((v) => v.kind === 'outside-operating-day' || v.kind === 'resource-over-capacity')).toBe(false);
  });
});

describe('farm scheduler — priority rules are a policy input', () => {
  const firstSow = (rule: 'earliest-due' | 'longest-path' | 'shortest-processing') =>
    day({ sowings: [sowing('long', LONG), sowing('short', SHORT)], dispatches: [], policy: policy({ priorityRule: rule }) }).blocks.filter((b) => b.stepId === 'sow:B').sort((a, b) => a.startMin - b.startMin).map((b) => b.orderId);
  it('earliest due keeps the plan’s order; shortest processing takes the short sowing first; longest path the long one', () => {
    expect(firstSow('earliest-due')).toEqual(['long', 'short']);
    expect(firstSow('shortest-processing')).toEqual(['short', 'long']);
    expect(firstSow('longest-path')).toEqual(['long', 'short']);
  });
});

describe('farm scheduler — the plan library', () => {
  const lib = [...growPlanSeed];
  const R = resolveScenarioInputs({}, lib);
  const studyFor = (code: string): TimeStudyDoc => {
    const r = lib.find((x) => x.code === code)!;
    return { id: `s-${code}`, growPlanCode: code, approvedAt: null, approvedBy: null, source: 'seed', ...estimatedTimeStudy(r, deriveCapacity(r, R.capacityInputs).sowingSize) };
  };

  it('labor reconciles to staff demand for the same day, from the same time studies', () => {
    const code = 'BROC-01';
    const studies = [studyFor(code)];
    const size = deriveCapacity(lib.find((x) => x.code === code)!, R.capacityInputs).sowingSize;
    const runs = [{ growPlanCode: code, growPlanName: code, sowingsScheduled: 2, produced: 2 * size }];
    const shipments = [{ growPlanCode: code, filledBase: 20 }];
    const inputs = scheduleInputsForDay({ productionRuns: runs, shipments, growPlans: lib, studies, equipment: equipmentSeed, routing: {} });
    const r = schedule({ date: '2027-02-01', sowings: inputs.sowings, dispatches: inputs.dispatches, resources: routeResources(equipmentSeed), crews: [], capacityInputs: R.capacityInputs, policy: R.schedulePolicy });
    const demand = staffDemand({ from: '2027-02-01', to: '2027-02-01', studies, days: [{ productionDate: '2027-02-01', runs }], harvest: [{ date: '2027-02-01', shipments: [{ growPlanCode: code, growPlanName: code, units: 20 }] }] });
    expect(r.metrics.sowingsPlaced).toBe(2);
    expect(r.metrics.laborHours).toBeCloseTo(demand.days[0]!.staffHours, 9);
    expect(r.metrics.sowingLaborHours).toBeCloseTo(demand.days[0]!.sowingStaffHours, 9);
    expect(r.metrics.harvestLaborHours).toBeCloseTo(demand.days[0]!.harvestStaffHours, 9);
  });

  it('the schedule policy resolves crew mode and harvest direction, tagged', () => {
    expect(R.schedulePolicy.crewMode).toMatchObject({ value: 'requirement', status: 'STATED' });
    expect(R.schedulePolicy.harvestDirection).toMatchObject({ value: 'backward', status: 'STATED' });
    expect(resolveScenarioInputs({ schedulePolicy: { crewMode: 'constrained' } }).schedulePolicy.crewMode.value).toBe('constrained');
  });
});
