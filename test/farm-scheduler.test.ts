/**
 * MicroFarm — the scheduler (scheduler build plan W1): a golden day, the flips,
 * the priority rules, constrained crews and the reconciliation to staff demand.
 */

import { describe, it, expect } from 'vitest';
import { equipmentSeed } from '@/data/capex';
import { newCrew } from '@/data/crews';
import { capacityInputs } from '@/data/plan-data';
import { seedLibrary } from '@/data/crop-plans-seed';
import { tagged } from '@/data/tagged';
import { timeStudySeed, TIME_STUDY_SEED_CROP_PLAN, type TimeStudyDoc } from '@/data/time-studies';
import { deriveCapacity } from '@/engine';
import { routeOrder, routeResources, type CropPlanRoute, type RouteResource, type RouteStep } from '@/engine/routing';
import { resolveScenarioInputs, type SchedulePolicyOverlay } from '@/engine/scenario';
import { schedule, scheduleInputsForDay, type ScheduleInput, type ScheduledBlock } from '@/engine/scheduler';
import { staffDemand } from '@/engine/staff-demand';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';

const step = (o: Partial<RouteStep> & Pick<RouteStep, 'id' | 'stream' | 'kind'>): RouteStep => ({
  seq: 0, component: null, task: o.id, station: null, resourceKey: null, staff: 1, scalesWith: 'fixed', setupMinutes: 0, runMinutesPerUnit: 0,
  laborMinutesFixed: 0, laborMinutesPerUnit: 0, attended: true, controlPoint: null, priorDay: false, after: [], edited: false, ...o,
});

function route(code: string, steps: RouteStep[]): CropPlanRoute {
  const numbered = steps.map((s, i) => ({ ...s, seq: i + 1 }));
  return { cropPlanCode: code, studyId: `s-${code}`, basis: 'estimated', sowingSize: 100, steps: numbered, order: routeOrder(numbered), findings: [] };
}

// A hand-built route at a 100-unit study: two sows on two grow units, the rack, and the harvest chain.
const LONG = route('T-1', [
  step({ id: 'receiving', stream: 'sowing', kind: 'receiving', setupMinutes: 30, staff: 2, laborMinutesFixed: 60 }),
  step({ id: 'prep:A', stream: 'sowing', kind: 'prep', scalesWith: 'variable', runMinutesPerUnit: 0.3, laborMinutesPerUnit: 0.3, after: ['receiving'] }),
  step({ id: 'sow:A', stream: 'sowing', kind: 'sow', resourceKey: 'K', setupMinutes: 60, laborMinutesFixed: 20, attended: false, after: ['prep:A'] }),
  step({ id: 'sow:B', stream: 'sowing', kind: 'sow', resourceKey: 'S', setupMinutes: 20, laborMinutesFixed: 20, after: ['receiving'] }),
  step({ id: 'blackout', stream: 'sowing', kind: 'blackout', resourceKey: 'CH', scalesWith: 'variable', staff: 2, runMinutesPerUnit: 0.25, laborMinutesPerUnit: 0.5, after: ['sow:A', 'sow:B'] }),
  step({ id: 'turnaround', stream: 'sowing', kind: 'turnaround', setupMinutes: 15, staff: 2, laborMinutesFixed: 30, after: ['blackout'] }),
  step({ id: 'cold:X', stream: 'harvest', kind: 'cold', scalesWith: 'variable', staff: 2, runMinutesPerUnit: 0.2, laborMinutesPerUnit: 0.4 }),
  step({ id: 'assemble', stream: 'harvest', kind: 'assemble', scalesWith: 'variable', staff: 4, runMinutesPerUnit: 0.5, laborMinutesPerUnit: 2, after: ['cold:X'] }),
  step({ id: 'seal', stream: 'harvest', kind: 'seal', resourceKey: 'T', scalesWith: 'variable', staff: 2, runMinutesPerUnit: 0.3, laborMinutesPerUnit: 0.6, after: ['assemble'] }),
  step({ id: 'pack-check', stream: 'harvest', kind: 'pack-check', scalesWith: 'variable', runMinutesPerUnit: 0.1, laborMinutesPerUnit: 0.1, after: ['seal'] }),
  step({ id: 'load', stream: 'harvest', kind: 'load', setupMinutes: 10, laborMinutesFixed: 10, after: ['pack-check'] }),
]);
// One sow only, on the shelf.
const SHORT = route('T-2', LONG.steps.filter((s) => !['prep:A', 'sow:A'].includes(s.id)).map((s) => (s.id === 'blackout' ? { ...s, after: ['sow:B'] } : s)));

const res = (key: string): RouteResource => ({ key, item: key, units: 1, concurrentSowings: tagged<number | null>(1, 'STATED'), changeoverMinutes: tagged<number | null>(0, 'STATED'), attendedRun: tagged<boolean | null>(null, 'STATED'), mayRunUnattended: tagged<boolean | null>(false, 'STATED') });
const RESOURCES = ['K', 'S', 'CH', 'T'].map(res);
const policy = (o: SchedulePolicyOverlay = {}) => resolveScenarioInputs({ schedulePolicy: o }).schedulePolicy;
const sowing = (id: string, r: CropPlanRoute = LONG, units = 100) => ({ id, cropPlanCode: r.cropPlanCode, units, route: r });
const crew = (id: string, startMin: number, endMin: number, headcount: number) => newCrew(id, { startMin, endMin, headcount }, { startMin, endMin, headcount });

const day = (over: Partial<ScheduleInput> = {}) =>
  schedule({
    date: '2027-02-01',
    sowings: [sowing('b1'), sowing('b2')],
    dispatches: [{ id: 'd1', cropPlanCode: 'T-1', units: 150, route: LONG }],
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

  it('places the first sowing: prep forward from opening, the sows finishing together at the load, the rack from Capacity', () => {
    expect(span(r.blocks, 'b1', 'receiving')).toEqual([420, 450]);
    expect(span(r.blocks, 'b1', 'prep:A')).toEqual([450, 480]);
    expect(span(r.blocks, 'b1', 'sow:A')).toEqual([480, 540]);
    expect(span(r.blocks, 'b1', 'sow:B')).toEqual([520, 540]);
    expect(span(r.blocks, 'b1', 'Rack load')).toEqual([540, 565]);
    expect(span(r.blocks, 'b1', 'Blackout stage')).toEqual([565, 655]);
    expect(span(r.blocks, 'b1', 'Rack unload to storage')).toEqual([655, 665]);
    expect(span(r.blocks, 'b1', 'turnaround')).toEqual([665, 680]);
  });

  it('the second sowing waits for the sprouting rack and the blackout rack, and its sows still finish at its load', () => {
    expect(span(r.blocks, 'b2', 'sow:A')).toEqual([605, 665]);
    expect(span(r.blocks, 'b2', 'sow:B')).toEqual([645, 665]);
    expect(span(r.blocks, 'b2', 'Rack load')).toEqual([665, 690]);
    expect(span(r.blocks, 'b2', 'Rack unload to storage')).toEqual([780, 790]);
    expect(span(r.blocks, 'b2', 'turnaround')).toEqual([790, 805]);
  });

  it('harvest is placed backward from the 10:30 distribution time, the vehicle load once for the day', () => {
    expect(span(r.blocks, null, 'load')).toEqual([620, 630]);
    expect(span(r.blocks, 'd1', 'pack-check')).toEqual([605, 620]);
    expect(span(r.blocks, 'd1', 'seal')).toEqual([560, 605]);
    expect(span(r.blocks, 'd1', 'assemble')).toEqual([485, 560]);
    expect(span(r.blocks, 'd1', 'cold:X')).toEqual([455, 485]);
    expect(r.blocks.filter((b) => b.stepId === 'load')).toHaveLength(1);
  });

  it('closedown is placed once at the close, two people for 30 minutes', () => {
    const c = r.blocks.filter((b) => b.kind === 'closedown');
    expect(c.map((b) => [b.startMin, b.endMin, b.staff, b.laborMinutes])).toEqual([[1110, 1140, 2, 60]]);
  });

  it('no violations; the metrics', () => {
    expect(r.violations).toEqual([]);
    expect(r.metrics).toMatchObject({ sowingsPlaced: 2, sowingsUnplaced: 0, unitsPlaced: 200, dispatchesPlaced: 1, unitsShipped: 150, firstStartMin: 420, lastEndMin: 805, makespanMin: 385, bindingResourceKey: 'CH' });
    // 210 min a sowing (60 + 30 + 20 + 20 + 50 + 30) × 2; harvest 60 + 300 + 90 + 15 + 10.
    expect(r.metrics.sowingLaborHours).toBeCloseTo(420 / 60, 9);
    expect(r.metrics.harvestLaborHours).toBeCloseTo(475 / 60, 9);
    expect(r.metrics.laborHours).toBeCloseTo(895 / 60, 9);
    expect(r.metrics.closedownHours).toBe(1);
    expect(r.metrics.utilizationByResource['CH']).toBeCloseTo(250 / 720, 9);
  });

  it('the rack carries the study’s blackout labor, split at the load and the unload by their staff-minutes', () => {
    const cab = r.blocks.filter((b) => b.orderId === 'b1' && b.stepId === 'blackout');
    expect(cab.reduce((t, b) => t + b.laborMinutes, 0)).toBeCloseTo(50, 9);
    expect(cab.find((b) => b.kind === 'rack-load')!.laborMinutes).toBeCloseTo((50 * 50) / 60, 9);
    expect(cab.find((b) => b.kind === 'blackout-stage')).toMatchObject({ staff: 0, laborMinutes: 0, attended: false });
  });
});

describe('farm scheduler — the flips', () => {
  it('over capacity: seven sowings run the blackout rack past the close and it says so', () => {
    const r = day({ sowings: Array.from({ length: 7 }, (_, i) => sowing(`b${i + 1}`)), dispatches: [] });
    const over = r.violations.filter((v) => v.kind === 'resource-over-capacity');
    expect(over.find((v) => v.kind === 'resource-over-capacity' && v.resourceKey === 'CH')).toMatchObject({ jobs: 7, jobsInsideDay: 4 });
    // The late sowings' sows run their grow units past the close too.
    expect(over.map((v) => v.kind === 'resource-over-capacity' && v.resourceKey).sort()).toEqual(['CH', 'K', 'S']);
    expect(r.violations.some((v) => v.kind === 'outside-operating-day')).toBe(true);
    expect(r.violations.filter((v) => v.kind === 'unattended-blackout').length).toBeGreaterThan(0);
    expect(r.metrics.sowingsPlaced).toBe(7); // requirement mode: placed and reported, never dropped
  });

  it('crew shortfall: two people all day cannot cover four at assembly or two receivings at once', () => {
    const r = day({ crews: [crew('c1', 420, 1140, 2)] });
    const short = r.violations.filter((v) => v.kind === 'crew-shortfall');
    expect(short.length).toBeGreaterThan(0);
    expect(short.some((v) => v.kind === 'crew-shortfall' && v.required >= 4 && v.scheduled === 2)).toBe(true);
    expect(r.metrics.crewHours).toBe(24);
  });

  it('control-point-2 breach: a 130-minute blackout stage puts 155 minutes on the 2-hour clock', () => {
    const r = day({ capacityInputs: { ...capacityInputs, blackoutMinutes: tagged(130, 'PLACEHOLDER', 'min') }, dispatches: [] });
    const controlPoint = r.violations.filter((v) => v.kind === 'control-point-cooling-stage');
    expect(controlPoint.map((v) => v.kind === 'control-point-cooling-stage' && [v.orderId, v.stage, v.minutes])).toEqual([['b1', 1, 155], ['b2', 1, 155]]);
  });

  it('unattended blackout: a crew that leaves at noon is gone when the second blackout completes', () => {
    const r = day({ crews: [crew('c1', 420, 720, 10)], dispatches: [] });
    const u = r.violations.filter((v) => v.kind === 'unattended-blackout');
    expect(u.map((v) => v.kind === 'unattended-blackout' && [v.orderId, v.completesAtMin, v.allowed])).toEqual([['b2', 780, false]]);
    const allowed = day({ crews: [crew('c1', 420, 720, 10)], dispatches: [], policy: policy({ allowUnattendedBlackout: true }) });
    expect(allowed.violations.find((v) => v.kind === 'unattended-blackout')).toMatchObject({ allowed: true }); // still reported
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
    expect(span(r.blocks, 'b2', 'receiving')).toEqual([450, 480]); // waits for b1's receiving crew
    const points = [...new Set(r.blocks.flatMap((b) => [b.startMin]))];
    for (const p of points) {
      const load = r.blocks.reduce((n, b) => (b.staff > 0 && b.laborMinutes > 0 && b.startMin <= p && p < b.startMin + b.laborMinutes / b.staff ? n + b.staff : n), 0);
      expect(load).toBeLessThanOrEqual(3);
    }
  });

  it('whole sowings only: four racks fit a day; the rest are unplaced, not squeezed', () => {
    const r = day({ sowings: Array.from({ length: 7 }, (_, i) => sowing(`b${i + 1}`)), dispatches: [], crews: [crew('c1', 420, 1140, 10)], policy: policy({ crewMode: 'constrained' }) });
    expect(r.metrics.sowingsPlaced).toBe(4);
    expect(r.metrics.sowingsUnplaced).toBe(3);
    expect(r.violations.filter((v) => v.kind === 'unplaced').map((v) => v.kind === 'unplaced' && v.orderId)).toEqual(['b5', 'b6', 'b7']);
    expect(r.violations.some((v) => v.kind === 'outside-operating-day' || v.kind === 'resource-over-capacity')).toBe(false);
  });
});

describe('farm scheduler — priority rules are a policy input', () => {
  const firstLoad = (rule: 'earliest-due' | 'longest-path' | 'shortest-processing') =>
    day({ sowings: [sowing('long', LONG), sowing('short', SHORT)], dispatches: [], policy: policy({ priorityRule: rule }) }).blocks.filter((b) => b.kind === 'rack-load').map((b) => b.orderId);
  it('earliest due keeps the plan’s order; shortest processing takes the short sowing first; longest path the long one', () => {
    expect(firstLoad('earliest-due')).toEqual(['long', 'short']);
    expect(firstLoad('shortest-processing')).toEqual(['short', 'long']);
    expect(firstLoad('longest-path')).toEqual(['long', 'short']);
  });
});

describe('farm scheduler — the crop plan library', () => {
  const studyFor = (code: string): TimeStudyDoc => {
    const r = seedLibrary.find((x) => x.code === code)!;
    const seed = code === TIME_STUDY_SEED_CROP_PLAN ? timeStudySeed : estimatedTimeStudy(r, deriveCapacity(r, capacityInputs).sowingSize);
    return { id: `s-${code}`, cropPlanCode: code, adoptedAt: null, adoptedBy: null, source: 'seed', ...seed };
  };
  const R = resolveScenarioInputs({});

  it('labor reconciles to staff demand for the same day, from the same time studies', () => {
    const code = 'AMK-E-002';
    const studies = [studyFor(code)];
    const size = deriveCapacity(seedLibrary.find((x) => x.code === code)!, capacityInputs).sowingSize;
    const runs = [{ cropPlanCode: code, cropPlanName: code, sowingsScheduled: 2, produced: 2 * size }];
    const shipments = [{ cropPlanCode: code, filledBase: 125 }];
    const inputs = scheduleInputsForDay({ productionRuns: runs, shipments, cropPlans: seedLibrary, studies, equipment: equipmentSeed, routing: {} });
    const r = schedule({ date: '2027-02-01', sowings: inputs.sowings, dispatches: inputs.dispatches, resources: routeResources(equipmentSeed), crews: [], capacityInputs, policy: R.schedulePolicy });
    const demand = staffDemand({ from: '2027-02-01', to: '2027-02-01', studies, days: [{ productionDate: '2027-02-01', runs }], harvest: [{ date: '2027-02-01', shipments: [{ cropPlanCode: code, cropPlanName: code, units: 125 }] }] });
    expect(r.metrics.sowingsPlaced).toBe(2);
    expect(r.metrics.laborHours).toBeCloseTo(demand.days[0]!.staffHours, 9);
    expect(r.metrics.sowingLaborHours).toBeCloseTo(demand.days[0]!.sowingStaffHours, 9);
    expect(r.metrics.harvestLaborHours).toBeCloseTo(demand.days[0]!.harvestStaffHours, 9);
  });

  // The rated day for AMK-E-001 on a given equipment list: five sowings of the one-rack sowing size.
  const ratedDay = (equipment: typeof equipmentSeed) => {
    const code = 'AMK-E-001';
    const size = deriveCapacity(seedLibrary.find((x) => x.code === code)!, capacityInputs).sowingSize;
    const inputs = scheduleInputsForDay({ productionRuns: [{ cropPlanCode: code, sowingsScheduled: 5, produced: 5 * size }], cropPlans: seedLibrary, studies: [studyFor(code)], equipment, routing: {} });
    const r = schedule({ date: '2027-02-01', sowings: inputs.sowings, dispatches: [], resources: routeResources(equipment), crews: [], capacityInputs, policy: R.schedulePolicy });
    const loads = r.blocks.filter((b) => b.kind === 'rack-load').sort((a, b) => a.startMin - b.startMin);
    return { r, inputs, loads, size };
  };
  const oneRack = equipmentSeed.map((e) => (/^Blackout rack/.test(e.item) ? { ...e, qty: 1 } : e));

  it('AMK-E-001 on one rack: the rated day’s five sowings placed one after another, every sow done by its load, no control-point-2 breach', () => {
    const { r, inputs, loads } = ratedDay(oneRack);
    expect(r.metrics.sowingsPlaced).toBe(5);
    expect(loads).toHaveLength(5);
    for (let i = 1; i < loads.length; i++) expect(loads[i]!.startMin).toBeGreaterThanOrEqual(loads[i - 1]!.startMin + 125 - 1e-9);
    for (const l of loads) {
      const sows = r.blocks.filter((b) => b.orderId === l.orderId && b.kind === 'step' && inputs.routes[0]!.steps.find((s) => s.id === b.stepId)?.kind === 'sow');
      expect(sows.length).toBeGreaterThan(0);
      for (const c of sows) expect(c.endMin).toBeLessThanOrEqual(l.startMin + 1e-9);
    }
    expect(r.violations.filter((v) => v.kind === 'control-point-cooling-stage')).toEqual([]);
    expect(r.metrics.bindingResourceKey).toBe('Blackout rack, 200 lb capacity');
  });

  it('the two Phase 1 racks are two slots: the same five sowings, the same sowing size, at most two racks occupied at once, the day done sooner', () => {
    // A sowing binds to one rack; a second rack is a parallel stream, never a larger sowing.
    const one = ratedDay(oneRack);
    const two = ratedDay(equipmentSeed);
    expect(two.size).toBe(one.size);
    expect(two.r.metrics.sowingsPlaced).toBe(5);
    expect(two.loads).toHaveLength(5);
    // Never a third occupancy inside any 125-minute rack window: two slots, each serial.
    for (let i = 2; i < two.loads.length; i++) expect(two.loads[i]!.startMin).toBeGreaterThanOrEqual(two.loads[i - 2]!.startMin + 125 - 1e-9);
    // And the racks do run alongside each other: at least one pair of loads closer than one occupancy.
    expect(two.loads.some((l, i) => i > 0 && l.startMin < two.loads[i - 1]!.startMin + 125)).toBe(true);
    const last = (loads: typeof one.loads) => Math.max(...loads.map((l) => l.startMin));
    expect(last(two.loads)).toBeLessThan(last(one.loads));
    expect(two.r.violations.filter((v) => v.kind === 'control-point-cooling-stage')).toEqual([]);
  });

  it('an overnight sow is reported as a prior-day step and not placed', () => {
    const code = 'AMK-E-009';
    const size = deriveCapacity(seedLibrary.find((x) => x.code === code)!, capacityInputs).sowingSize;
    const inputs = scheduleInputsForDay({ productionRuns: [{ cropPlanCode: code, sowingsScheduled: 1, produced: size }], cropPlans: seedLibrary, studies: [studyFor(code)], equipment: equipmentSeed, routing: {} });
    const r = schedule({ date: '2027-02-01', sowings: inputs.sowings, dispatches: [], resources: routeResources(equipmentSeed), crews: [], capacityInputs, policy: R.schedulePolicy });
    expect(r.violations.find((v) => v.kind === 'prior-day-step')).toMatchObject({ stepId: 'sow:Pulled pork' });
    expect(r.blocks.some((b) => b.stepId === 'sow:Pulled pork')).toBe(false);
  });

  it('the schedule policy resolves crew mode and harvest direction, tagged', () => {
    expect(R.schedulePolicy.crewMode).toMatchObject({ value: 'requirement', status: 'STATED' });
    expect(R.schedulePolicy.harvestDirection).toMatchObject({ value: 'backward', status: 'STATED' });
    expect(resolveScenarioInputs({ schedulePolicy: { crewMode: 'constrained' } }).schedulePolicy.crewMode.value).toBe('constrained');
  });
});
