/**
 * Cotyledon — the process route per plan, the units as resources and the scheduler's scenario
 * sections (scheduler build plan §0, W0 steps 3 and 4), on the seed grow plans.
 */

import { describe, it, expect } from 'vitest';
import { equipmentSeed as seed } from '@/data/capex';

// The commercial list selected, as a commercial forecast would: the units the routing can run on.
const equipmentSeed = seed.map((e) => (e.setting === 'commercial' ? { ...e, status: 'planned' as const } : e));
import { growPlanSeed } from '@/data/grow-plans-seed';
import type { TimeStudyDoc } from '@/data/time-studies';
import { deriveCapacity } from '@/engine';
import { deriveRoute, routeDepths, routeOrder, routeOverlayFor, routeKey, routeResources } from '@/engine/routing';
import { isEmptyConfig, resolveScenarioInputs, SCENARIO_SECTIONS } from '@/engine/scenario';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';

const lib = [...growPlanSeed];
const cap = resolveScenarioInputs({}, lib).capacityInputs;
const byCode = (code: string) => lib.find((r) => r.code === code)!;
const standardFor = (code: string): TimeStudyDoc => {
  const r = byCode(code);
  return { id: `s-${code}`, growPlanCode: code, approvedAt: null, approvedBy: null, source: 'seed', ...estimatedTimeStudy(r, Math.max(1, deriveCapacity(r, cap).sowingSize)) };
};
const route = (code: string, overlay?: Parameters<typeof deriveRoute>[0]['overlay']) => deriveRoute({ growPlan: byCode(code), standard: standardFor(code), equipment: equipmentSeed, overlay });
const step = (r: ReturnType<typeof route>, id: string) => r.steps.find((s) => s.id === id)!;
const aResource = routeResources(equipmentSeed)[0]!.key;

describe('farm routing — a route for every plan', () => {
  it('derives a route from every plan\'s standard: one step a sowing or harvest line, in an order every edge respects, the daily lines left to the calendar', () => {
    for (const r of lib) {
      const rt = route(r.code);
      expect(rt.steps).toHaveLength(standardFor(r.code).lines.filter((l) => l.stream !== 'daily').length);
      expect(rt.order).not.toBeNull();
      expect(new Set(rt.steps.map((s) => s.id)).size).toBe(rt.steps.length);
      expect(rt.findings.filter((f) => f.kind === 'unclassified-line' || f.kind === 'cycle' || f.kind === 'unknown-predecessor')).toEqual([]);
      expect(rt.steps.every((s) => s.resourceKey === null)).toBe(true);
      // No edge crosses the streams.
      for (const s of rt.steps) for (const a of s.after) expect(step(rt, a).stream).toBe(s.stream);
    }
  });

  it('a plan with no study has no route', () => {
    const rt = deriveRoute({ growPlan: byCode('BROC-01'), standard: null, equipment: equipmentSeed });
    expect(rt.steps).toEqual([]);
    expect(rt.findings.map((f) => f.kind)).toEqual(['no-study']);
  });
});

describe('farm routing — the scenario edits a step', () => {
  it('moves an edge, a crew size or a resource and marks the step edited', () => {
    const rt = route('BROC-01', { 'sow#5': { after: ['prep#1'] }, 'harvest#7': { staff: 3, setupMinutes: 5 }, 'prep#2': { resourceKey: aResource } });
    expect(step(rt, 'sow#5')).toMatchObject({ after: ['prep#1'], edited: true });
    expect(step(rt, 'harvest#7')).toMatchObject({ staff: 3, setupMinutes: 5, edited: true });
    expect(step(rt, 'prep#2').resourceKey).toBe(aResource);
    expect(step(rt, 'harvest#6').edited).toBe(false);
    expect(rt.findings).toEqual([]);
  });

  it('an unknown predecessor, an unknown step, an unknown resource and a cycle are reported; the edges stand as edited', () => {
    const rt = route('BROC-01', { 'harvest#8': { after: ['nope'] }, ghost: { staff: 1 }, 'harvest#7': { resourceKey: 'Nothing on the list' }, 'prep#1': { after: ['sow#5'] } });
    const kinds = rt.findings.map((f) => f.kind);
    expect(kinds).toContain('unknown-predecessor');
    expect(kinds).toContain('unknown-resource');
    expect(kinds).toContain('cycle');
    expect(rt.order).toBeNull();
    expect(step(rt, 'prep#1').after).toEqual(['sow#5']);
  });

  it('routeOrder takes the ready step with the lowest study position', () => {
    expect(routeOrder([{ id: 'b', seq: 2, after: [] }, { id: 'a', seq: 1, after: ['b'] }, { id: 'c', seq: 3, after: [] }])).toEqual(['b', 'a', 'c']);
  });

  it('the routing section is keyed by plan and step', () => {
    const routing = { [routeKey('BROC-01', 'harvest#7')]: { staff: 3 }, [routeKey('PEA-01', 'harvest#7')]: { staff: 4 } };
    expect(routeOverlayFor(routing, 'BROC-01')).toEqual({ 'harvest#7': { staff: 3 } });
  });
});

describe('farm routing — precedence depth, the process map\'s columns', () => {
  const depths = routeDepths(route('BROC-01').steps);

  it('a step sits one column past its deepest predecessor, within its own stream', () => {
    for (const id of ['prep#1', 'prep#2', 'prep#3', 'prep#4']) expect(depths.get(id)).toBe(0);
    expect(depths.get('sow#5')).toBe(1);
  });

  it('the harvest stream starts again at zero and runs in a chain', () => {
    expect(['harvest#6', 'harvest#7', 'harvest#8'].map((id) => depths.get(id))).toEqual([0, 1, 2]);
  });

  it('a cycle leaves the steps at a depth rather than looping', () => {
    const cyclic = route('BROC-01', { 'prep#1': { after: ['sow#5'] } });
    const d = routeDepths(cyclic.steps);
    expect(d.size).toBe(cyclic.steps.length);
    expect([...d.values()].every((x) => Number.isFinite(x))).toBe(true);
  });
});

describe('farm routing — the units as resources', () => {
  it('tags the library’s estimate a placeholder; only selected Phase 1 units are resources', () => {
    const rs = routeResources(equipmentSeed);
    const sealer = rs.find((r) => r.key === 'Tray sealer, semi-automatic')!;
    expect(sealer.concurrentSowings).toMatchObject({ value: 1, status: 'PLACEHOLDER' });
    expect(sealer.changeoverMinutes).toMatchObject({ value: 0, status: 'PLACEHOLDER' });
    expect(sealer.attendedRun.value).toBe(true);
    expect(rs.every((r) => equipmentSeed.find((e) => e.key === r.key)!.phase === 1)).toBe(true);
    // The commercial list as seeded is unselected: no resource until a forecast selects one.
    expect(routeResources(seed)).toEqual([]);
  });

  it('a stated library value is STATED; a scenario edit is STATED and wins', () => {
    const stated = equipmentSeed.map((e) => (e.key === 'Tray sealer, semi-automatic' ? { ...e, resourceBasis: 'stated' as const } : e));
    const rs = routeResources(stated, { 'Walk-in cooler, 12x20, with refrigeration': { changeoverMinutes: 5 } });
    expect(rs.find((r) => r.key === 'Tray sealer, semi-automatic')!.concurrentSowings.status).toBe('STATED');
    expect(rs.find((r) => r.key === 'Walk-in cooler, 12x20, with refrigeration')!.changeoverMinutes).toMatchObject({ value: 5, status: 'STATED' });
  });
});

describe('farm scenario — the scheduler’s sections', () => {
  it('routing, resources and schedulePolicy are sections of a saved scenario', () => {
    expect(SCENARIO_SECTIONS).toEqual(expect.arrayContaining(['routing', 'resources', 'schedulePolicy']));
    expect(isEmptyConfig({ schedulePolicy: {} })).toBe(true);
    expect(isEmptyConfig({ routing: { [routeKey('BROC-01', 'harvest#7')]: { staff: 3 } } })).toBe(false);
  });

  it('resolves the schedule policy defaults, tagged, and the scenario’s edits onto them', () => {
    const d = resolveScenarioInputs().schedulePolicy;
    expect(d.distributionTimeMin).toMatchObject({ value: 630, status: 'PLACEHOLDER' });
    expect(d.closedownStaff).toMatchObject({ value: 1, status: 'PLACEHOLDER' });
    expect(d.closedownMinutes).toMatchObject({ value: 30, status: 'PLACEHOLDER' });
    const e = resolveScenarioInputs({ schedulePolicy: { distributionTimeMin: 660, priorityRule: 'longest-path' } }).schedulePolicy;
    expect(e.distributionTimeMin.value).toBe(660);
    expect(e.priorityRule.value).toBe('longest-path');
    expect(resolveScenarioInputs().schedulePolicy.distributionTimeMin.value).toBe(630);
  });

  it('resolves the resources off the equipment, with the scenario’s edits', () => {
    const r = resolveScenarioInputs({ forecast: { equipment: { [aResource]: { status: 'planned' } } }, resources: { [aResource]: { concurrentSowings: 2 } } });
    expect(r.resources.find((x) => x.key === aResource)!.concurrentSowings).toMatchObject({ value: 2, status: 'STATED' });
  });

  it('carries the routing edits for the routes to read', () => {
    const routing = { [routeKey('BROC-01', 'sow#5')]: { after: ['prep#1'] } };
    const r = resolveScenarioInputs({ routing });
    expect(r.routing).toEqual(routing);
    const rt = deriveRoute({ growPlan: byCode('BROC-01'), standard: standardFor('BROC-01'), equipment: r.equipment, overlay: routeOverlayFor(r.routing, 'BROC-01') });
    expect(step(rt, 'sow#5').after).toEqual(['prep#1']);
  });
});
