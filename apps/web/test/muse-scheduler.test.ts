/**
 * Impact OS — the scheduler (scheduler build plan W1): a golden day, the flips,
 * the priority rules, constrained crews and the reconciliation to staff demand.
 */

import { describe, it, expect } from 'vitest';
import { equipmentSeed } from '@/app/(muse)/muse/_data/capex';
import { newCrew } from '@/app/(muse)/muse/_data/crews';
import { capacityInputs } from '@/app/(muse)/muse/_data/plan-data';
import { seedLibrary } from '@/app/(muse)/muse/_data/recipes-menu';
import { tagged } from '@/app/(muse)/muse/_data/tagged';
import { timeStudySeed, TIME_STUDY_SEED_RECIPE, type TimeStudyDoc } from '@/app/(muse)/muse/_data/time-studies';
import { deriveCapacity } from '@/app/(muse)/muse/_engine';
import { routeOrder, routeResources, type RecipeRoute, type RouteResource, type RouteStep } from '@/app/(muse)/muse/_engine/routing';
import { resolveScenarioInputs, type SchedulePolicyOverlay } from '@/app/(muse)/muse/_engine/scenario';
import { schedule, scheduleInputsForDay, type ScheduleInput, type ScheduledBlock } from '@/app/(muse)/muse/_engine/scheduler';
import { staffDemand } from '@/app/(muse)/muse/_engine/staff-demand';
import { estimatedTimeStudy } from '@/app/(muse)/muse/_engine/time-study-estimate';

const step = (o: Partial<RouteStep> & Pick<RouteStep, 'id' | 'stream' | 'kind'>): RouteStep => ({
  seq: 0, component: null, task: o.id, station: null, resourceKey: null, staff: 1, scalesWith: 'fixed', setupMinutes: 0, runMinutesPerPortion: 0,
  laborMinutesFixed: 0, laborMinutesPerPortion: 0, attended: true, ccp: null, priorDay: false, after: [], edited: false, ...o,
});

function route(code: string, steps: RouteStep[]): RecipeRoute {
  const numbered = steps.map((s, i) => ({ ...s, seq: i + 1 }));
  return { recipeCode: code, studyId: `s-${code}`, basis: 'estimated', batchSize: 100, steps: numbered, order: routeOrder(numbered), findings: [] };
}

// A hand-built route at a 100-portion study: two cooks on two vessels, the cabinet, and the dispatch chain.
const LONG = route('T-1', [
  step({ id: 'receiving', stream: 'batch', kind: 'receiving', setupMinutes: 30, staff: 2, laborMinutesFixed: 60 }),
  step({ id: 'prep:A', stream: 'batch', kind: 'prep', scalesWith: 'variable', runMinutesPerPortion: 0.3, laborMinutesPerPortion: 0.3, after: ['receiving'] }),
  step({ id: 'cook:A', stream: 'batch', kind: 'cook', resourceKey: 'K', setupMinutes: 60, laborMinutesFixed: 20, attended: false, after: ['prep:A'] }),
  step({ id: 'cook:B', stream: 'batch', kind: 'cook', resourceKey: 'S', setupMinutes: 20, laborMinutesFixed: 20, after: ['receiving'] }),
  step({ id: 'chill', stream: 'batch', kind: 'chill', resourceKey: 'CH', scalesWith: 'variable', staff: 2, runMinutesPerPortion: 0.25, laborMinutesPerPortion: 0.5, after: ['cook:A', 'cook:B'] }),
  step({ id: 'turnaround', stream: 'batch', kind: 'turnaround', setupMinutes: 15, staff: 2, laborMinutesFixed: 30, after: ['chill'] }),
  step({ id: 'cold:X', stream: 'dispatch', kind: 'cold', scalesWith: 'variable', staff: 2, runMinutesPerPortion: 0.2, laborMinutesPerPortion: 0.4 }),
  step({ id: 'assemble', stream: 'dispatch', kind: 'assemble', scalesWith: 'variable', staff: 4, runMinutesPerPortion: 0.5, laborMinutesPerPortion: 2, after: ['cold:X'] }),
  step({ id: 'seal', stream: 'dispatch', kind: 'seal', resourceKey: 'T', scalesWith: 'variable', staff: 2, runMinutesPerPortion: 0.3, laborMinutesPerPortion: 0.6, after: ['assemble'] }),
  step({ id: 'pack-check', stream: 'dispatch', kind: 'pack-check', scalesWith: 'variable', runMinutesPerPortion: 0.1, laborMinutesPerPortion: 0.1, after: ['seal'] }),
  step({ id: 'load', stream: 'dispatch', kind: 'load', setupMinutes: 10, laborMinutesFixed: 10, after: ['pack-check'] }),
]);
// One cook only, on the skillet.
const SHORT = route('T-2', LONG.steps.filter((s) => !['prep:A', 'cook:A'].includes(s.id)).map((s) => (s.id === 'chill' ? { ...s, after: ['cook:B'] } : s)));

const res = (key: string): RouteResource => ({ key, item: key, units: 1, concurrentBatches: tagged<number | null>(1, 'STATED'), changeoverMinutes: tagged<number | null>(0, 'STATED'), attendedRun: tagged<boolean | null>(null, 'STATED'), mayRunUnattended: tagged<boolean | null>(false, 'STATED') });
const RESOURCES = ['K', 'S', 'CH', 'T'].map(res);
const policy = (o: SchedulePolicyOverlay = {}) => resolveScenarioInputs({ schedulePolicy: o }).schedulePolicy;
const batch = (id: string, r: RecipeRoute = LONG, portions = 100) => ({ id, recipeCode: r.recipeCode, portions, route: r });
const crew = (id: string, startMin: number, endMin: number, headcount: number) => newCrew(id, { startMin, endMin, headcount }, { startMin, endMin, headcount });

const day = (over: Partial<ScheduleInput> = {}) =>
  schedule({
    date: '2027-02-01',
    batches: [batch('b1'), batch('b2')],
    dispatches: [{ id: 'd1', recipeCode: 'T-1', portions: 150, route: LONG }],
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

describe('muse scheduler — the golden day', () => {
  const r = day();

  it('places the first batch: prep forward from opening, the cooks finishing together at the load, the cabinet from Capacity', () => {
    expect(span(r.blocks, 'b1', 'receiving')).toEqual([420, 450]);
    expect(span(r.blocks, 'b1', 'prep:A')).toEqual([450, 480]);
    expect(span(r.blocks, 'b1', 'cook:A')).toEqual([480, 540]);
    expect(span(r.blocks, 'b1', 'cook:B')).toEqual([520, 540]);
    expect(span(r.blocks, 'b1', 'Cabinet load')).toEqual([540, 565]);
    expect(span(r.blocks, 'b1', 'Chill stage')).toEqual([565, 655]);
    expect(span(r.blocks, 'b1', 'Cabinet unload to storage')).toEqual([655, 665]);
    expect(span(r.blocks, 'b1', 'turnaround')).toEqual([665, 680]);
  });

  it('the second batch waits for the kettle and the chiller, and its cooks still finish at its load', () => {
    expect(span(r.blocks, 'b2', 'cook:A')).toEqual([605, 665]);
    expect(span(r.blocks, 'b2', 'cook:B')).toEqual([645, 665]);
    expect(span(r.blocks, 'b2', 'Cabinet load')).toEqual([665, 690]);
    expect(span(r.blocks, 'b2', 'Cabinet unload to storage')).toEqual([780, 790]);
    expect(span(r.blocks, 'b2', 'turnaround')).toEqual([790, 805]);
  });

  it('dispatch is placed backward from the 10:30 delivery time, the vehicle load once for the day', () => {
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
    expect(r.metrics).toMatchObject({ batchesPlaced: 2, batchesUnplaced: 0, portionsPlaced: 200, dispatchesPlaced: 1, portionsShipped: 150, firstStartMin: 420, lastEndMin: 805, makespanMin: 385, bindingResourceKey: 'CH' });
    // 210 min a batch (60 + 30 + 20 + 20 + 50 + 30) × 2; dispatch 60 + 300 + 90 + 15 + 10.
    expect(r.metrics.batchLaborHours).toBeCloseTo(420 / 60, 9);
    expect(r.metrics.dispatchLaborHours).toBeCloseTo(475 / 60, 9);
    expect(r.metrics.laborHours).toBeCloseTo(895 / 60, 9);
    expect(r.metrics.closedownHours).toBe(1);
    expect(r.metrics.utilizationByResource['CH']).toBeCloseTo(250 / 720, 9);
  });

  it('the cabinet carries the study’s chill labor, split at the load and the unload by their staff-minutes', () => {
    const cab = r.blocks.filter((b) => b.orderId === 'b1' && b.stepId === 'chill');
    expect(cab.reduce((t, b) => t + b.laborMinutes, 0)).toBeCloseTo(50, 9);
    expect(cab.find((b) => b.kind === 'cabinet-load')!.laborMinutes).toBeCloseTo((50 * 50) / 60, 9);
    expect(cab.find((b) => b.kind === 'chill-stage')).toMatchObject({ staff: 0, laborMinutes: 0, attended: false });
  });
});

describe('muse scheduler — the flips', () => {
  it('over capacity: seven batches run the chiller past the close and it says so', () => {
    const r = day({ batches: Array.from({ length: 7 }, (_, i) => batch(`b${i + 1}`)), dispatches: [] });
    const over = r.violations.filter((v) => v.kind === 'resource-over-capacity');
    expect(over.find((v) => v.kind === 'resource-over-capacity' && v.resourceKey === 'CH')).toMatchObject({ jobs: 7, jobsInsideDay: 4 });
    // The late batches' cooks run their vessels past the close too.
    expect(over.map((v) => v.kind === 'resource-over-capacity' && v.resourceKey).sort()).toEqual(['CH', 'K', 'S']);
    expect(r.violations.some((v) => v.kind === 'outside-operating-day')).toBe(true);
    expect(r.violations.filter((v) => v.kind === 'unattended-chill').length).toBeGreaterThan(0);
    expect(r.metrics.batchesPlaced).toBe(7); // requirement mode: placed and reported, never dropped
  });

  it('crew shortfall: two people all day cannot cover four at assembly or two receivings at once', () => {
    const r = day({ crews: [crew('c1', 420, 1140, 2)] });
    const short = r.violations.filter((v) => v.kind === 'crew-shortfall');
    expect(short.length).toBeGreaterThan(0);
    expect(short.some((v) => v.kind === 'crew-shortfall' && v.required >= 4 && v.scheduled === 2)).toBe(true);
    expect(r.metrics.crewHours).toBe(24);
  });

  it('CCP-2 breach: a 130-minute chill stage puts 155 minutes on the 2-hour clock', () => {
    const r = day({ capacityInputs: { ...capacityInputs, chillMinutes: tagged(130, 'PLACEHOLDER', 'min') }, dispatches: [] });
    const ccp = r.violations.filter((v) => v.kind === 'ccp-cooling-stage');
    expect(ccp.map((v) => v.kind === 'ccp-cooling-stage' && [v.orderId, v.stage, v.minutes])).toEqual([['b1', 1, 155], ['b2', 1, 155]]);
  });

  it('unattended chill: a crew that leaves at noon is gone when the second chill completes', () => {
    const r = day({ crews: [crew('c1', 420, 720, 10)], dispatches: [] });
    const u = r.violations.filter((v) => v.kind === 'unattended-chill');
    expect(u.map((v) => v.kind === 'unattended-chill' && [v.orderId, v.completesAtMin, v.allowed])).toEqual([['b2', 780, false]]);
    const allowed = day({ crews: [crew('c1', 420, 720, 10)], dispatches: [], policy: policy({ allowUnattendedChill: true }) });
    expect(allowed.violations.find((v) => v.kind === 'unattended-chill')).toMatchObject({ allowed: true }); // still reported
  });

  it('due date: a delivery at 08:00 cannot be met backward; the order is placed forward and reported late', () => {
    const r = day({ batches: [], policy: policy({ deliveryTimeMin: 480 }) });
    expect(span(r.blocks, 'd1', 'cold:X')).toEqual([420, 450]);
    expect(span(r.blocks, 'd1', 'pack-check')).toEqual([570, 585]);
    expect(r.violations.find((v) => v.kind === 'due-date-missed')).toMatchObject({ orderId: 'd1', dueMin: 480, byMin: 105 });
  });

  it('forward dispatch places it first thing from opening, the load after it', () => {
    const r = day({ batches: [], policy: policy({ dispatchDirection: 'forward' }) });
    expect(span(r.blocks, 'd1', 'cold:X')).toEqual([420, 450]);
    expect(span(r.blocks, null, 'load')).toEqual([585, 595]);
    expect(r.violations).toEqual([]);
  });
});

describe('muse scheduler — constrained crews', () => {
  it('holds work for free crew, keeps everything inside the day, and reports what does not fit as unplaced', () => {
    const r = day({ crews: [crew('c1', 420, 1140, 3)], policy: policy({ crewMode: 'constrained' }) });
    expect(r.violations.find((v) => v.kind === 'unplaced')).toMatchObject({ orderId: 'd1', stream: 'dispatch' }); // assembly needs 4
    expect(r.metrics.batchesPlaced).toBe(2);
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

  it('whole batches only: four cabinets fit a day; the rest are unplaced, not squeezed', () => {
    const r = day({ batches: Array.from({ length: 7 }, (_, i) => batch(`b${i + 1}`)), dispatches: [], crews: [crew('c1', 420, 1140, 10)], policy: policy({ crewMode: 'constrained' }) });
    expect(r.metrics.batchesPlaced).toBe(4);
    expect(r.metrics.batchesUnplaced).toBe(3);
    expect(r.violations.filter((v) => v.kind === 'unplaced').map((v) => v.kind === 'unplaced' && v.orderId)).toEqual(['b5', 'b6', 'b7']);
    expect(r.violations.some((v) => v.kind === 'outside-operating-day' || v.kind === 'resource-over-capacity')).toBe(false);
  });
});

describe('muse scheduler — priority rules are a policy input', () => {
  const firstLoad = (rule: 'earliest-due' | 'longest-path' | 'shortest-processing') =>
    day({ batches: [batch('long', LONG), batch('short', SHORT)], dispatches: [], policy: policy({ priorityRule: rule }) }).blocks.filter((b) => b.kind === 'cabinet-load').map((b) => b.orderId);
  it('earliest due keeps the plan’s order; shortest processing takes the short batch first; longest path the long one', () => {
    expect(firstLoad('earliest-due')).toEqual(['long', 'short']);
    expect(firstLoad('shortest-processing')).toEqual(['short', 'long']);
    expect(firstLoad('longest-path')).toEqual(['long', 'short']);
  });
});

describe('muse scheduler — the recipe library', () => {
  const studyFor = (code: string): TimeStudyDoc => {
    const r = seedLibrary.find((x) => x.code === code)!;
    const seed = code === TIME_STUDY_SEED_RECIPE ? timeStudySeed : estimatedTimeStudy(r, deriveCapacity(r, capacityInputs).batchSize);
    return { id: `s-${code}`, recipeCode: code, adoptedAt: null, adoptedBy: null, source: 'seed', ...seed };
  };
  const R = resolveScenarioInputs({});

  it('labor reconciles to staff demand for the same day, from the same time studies', () => {
    const code = 'AMK-E-002';
    const studies = [studyFor(code)];
    const size = deriveCapacity(seedLibrary.find((x) => x.code === code)!, capacityInputs).batchSize;
    const runs = [{ recipeCode: code, recipeName: code, batchesScheduled: 2, produced: 2 * size }];
    const shipments = [{ recipeCode: code, filledBase: 125 }];
    const inputs = scheduleInputsForDay({ productionRuns: runs, shipments, recipes: seedLibrary, studies, equipment: equipmentSeed, routing: {} });
    const r = schedule({ date: '2027-02-01', batches: inputs.batches, dispatches: inputs.dispatches, resources: routeResources(equipmentSeed), crews: [], capacityInputs, policy: R.schedulePolicy });
    const demand = staffDemand({ from: '2027-02-01', to: '2027-02-01', studies, days: [{ productionDate: '2027-02-01', runs }], dispatch: [{ date: '2027-02-01', shipments: [{ recipeCode: code, recipeName: code, portions: 125 }] }] });
    expect(r.metrics.batchesPlaced).toBe(2);
    expect(r.metrics.laborHours).toBeCloseTo(demand.days[0]!.staffHours, 9);
    expect(r.metrics.batchLaborHours).toBeCloseTo(demand.days[0]!.batchStaffHours, 9);
    expect(r.metrics.dispatchLaborHours).toBeCloseTo(demand.days[0]!.dispatchStaffHours, 9);
  });

  // The rated day for AMK-E-001 on a given equipment list: five batches of the one-cabinet batch size.
  const ratedDay = (equipment: typeof equipmentSeed) => {
    const code = 'AMK-E-001';
    const size = deriveCapacity(seedLibrary.find((x) => x.code === code)!, capacityInputs).batchSize;
    const inputs = scheduleInputsForDay({ productionRuns: [{ recipeCode: code, batchesScheduled: 5, produced: 5 * size }], recipes: seedLibrary, studies: [studyFor(code)], equipment, routing: {} });
    const r = schedule({ date: '2027-02-01', batches: inputs.batches, dispatches: [], resources: routeResources(equipment), crews: [], capacityInputs, policy: R.schedulePolicy });
    const loads = r.blocks.filter((b) => b.kind === 'cabinet-load').sort((a, b) => a.startMin - b.startMin);
    return { r, inputs, loads, size };
  };
  const oneCabinet = equipmentSeed.map((e) => (/^Blast chiller/.test(e.item) ? { ...e, qty: 1 } : e));

  it('AMK-E-001 on one cabinet: the rated day’s five batches placed one after another, every cook done by its load, no CCP-2 breach', () => {
    const { r, inputs, loads } = ratedDay(oneCabinet);
    expect(r.metrics.batchesPlaced).toBe(5);
    expect(loads).toHaveLength(5);
    for (let i = 1; i < loads.length; i++) expect(loads[i]!.startMin).toBeGreaterThanOrEqual(loads[i - 1]!.startMin + 125 - 1e-9);
    for (const l of loads) {
      const cooks = r.blocks.filter((b) => b.orderId === l.orderId && b.kind === 'step' && inputs.routes[0]!.steps.find((s) => s.id === b.stepId)?.kind === 'cook');
      expect(cooks.length).toBeGreaterThan(0);
      for (const c of cooks) expect(c.endMin).toBeLessThanOrEqual(l.startMin + 1e-9);
    }
    expect(r.violations.filter((v) => v.kind === 'ccp-cooling-stage')).toEqual([]);
    expect(r.metrics.bindingResourceKey).toBe('Blast chiller, 200 lb capacity');
  });

  it('the two Phase 1 cabinets are two slots: the same five batches, the same batch size, at most two cabinets occupied at once, the day done sooner', () => {
    // A batch binds to one cabinet; a second cabinet is a parallel stream, never a larger batch (Robert, 2026-09-17).
    const one = ratedDay(oneCabinet);
    const two = ratedDay(equipmentSeed);
    expect(two.size).toBe(one.size);
    expect(two.r.metrics.batchesPlaced).toBe(5);
    expect(two.loads).toHaveLength(5);
    // Never a third occupancy inside any 125-minute cabinet window: two slots, each serial.
    for (let i = 2; i < two.loads.length; i++) expect(two.loads[i]!.startMin).toBeGreaterThanOrEqual(two.loads[i - 2]!.startMin + 125 - 1e-9);
    // And the cabinets do run alongside each other: at least one pair of loads closer than one occupancy.
    expect(two.loads.some((l, i) => i > 0 && l.startMin < two.loads[i - 1]!.startMin + 125)).toBe(true);
    const last = (loads: typeof one.loads) => Math.max(...loads.map((l) => l.startMin));
    expect(last(two.loads)).toBeLessThan(last(one.loads));
    expect(two.r.violations.filter((v) => v.kind === 'ccp-cooling-stage')).toEqual([]);
  });

  it('an overnight cook is reported as a prior-day step and not placed', () => {
    const code = 'AMK-E-009';
    const size = deriveCapacity(seedLibrary.find((x) => x.code === code)!, capacityInputs).batchSize;
    const inputs = scheduleInputsForDay({ productionRuns: [{ recipeCode: code, batchesScheduled: 1, produced: size }], recipes: seedLibrary, studies: [studyFor(code)], equipment: equipmentSeed, routing: {} });
    const r = schedule({ date: '2027-02-01', batches: inputs.batches, dispatches: [], resources: routeResources(equipmentSeed), crews: [], capacityInputs, policy: R.schedulePolicy });
    expect(r.violations.find((v) => v.kind === 'prior-day-step')).toMatchObject({ stepId: 'cook:Pulled pork' });
    expect(r.blocks.some((b) => b.stepId === 'cook:Pulled pork')).toBe(false);
  });

  it('the schedule policy resolves crew mode and dispatch direction, tagged', () => {
    expect(R.schedulePolicy.crewMode).toMatchObject({ value: 'requirement', status: 'STATED' });
    expect(R.schedulePolicy.dispatchDirection).toMatchObject({ value: 'backward', status: 'STATED' });
    expect(resolveScenarioInputs({ schedulePolicy: { crewMode: 'constrained' } }).schedulePolicy.crewMode.value).toBe('constrained');
  });
});
