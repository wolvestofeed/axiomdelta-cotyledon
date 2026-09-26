/**
 * Impact OS — the process route per recipe, the units as resources and the
 * scheduler's scenario sections (scheduler build plan §0, W0 steps 3 and 4).
 */

import { describe, it, expect } from 'vitest';
import { equipmentSeed } from '@/app/(muse)/muse/_data/capex';
import { capacityInputs } from '@/app/(muse)/muse/_data/plan-data';
import { seedLibrary } from '@/app/(muse)/muse/_data/recipes-menu';
import { timeStudySeed, TIME_STUDY_SEED_RECIPE, type TimeStudyDoc } from '@/app/(muse)/muse/_data/time-studies';
import { deriveCapacity } from '@/app/(muse)/muse/_engine';
import { deriveRoute, routeDepths, routeOrder, routeOverlayFor, routeKey, routeResources, stepDuration, stepLaborMinutes } from '@/app/(muse)/muse/_engine/routing';
import { isEmptyConfig, resolveScenarioInputs, SCENARIO_SECTIONS } from '@/app/(muse)/muse/_engine/scenario';
import { estimatedTimeStudy } from '@/app/(muse)/muse/_engine/time-study-estimate';

const byCode = (code: string) => seedLibrary.find((r) => r.code === code)!;
const standardFor = (code: string): TimeStudyDoc => {
  const r = byCode(code);
  const seed = code === TIME_STUDY_SEED_RECIPE ? timeStudySeed : estimatedTimeStudy(r, deriveCapacity(r, capacityInputs).batchSize);
  return { id: `s-${code}`, recipeCode: code, adoptedAt: null, adoptedBy: null, source: 'seed', ...seed };
};
const route = (code: string, overlay?: Parameters<typeof deriveRoute>[0]['overlay']) => deriveRoute({ recipe: byCode(code), standard: standardFor(code), equipment: equipmentSeed, overlay });
const step = (r: ReturnType<typeof route>, id: string) => r.steps.find((s) => s.id === id)!;

describe('muse routing — a route for every recipe', () => {
  it('derives a route from every recipe’s standard, one step a line, in an order every edge respects', () => {
    for (const r of seedLibrary) {
      const rt = route(r.code);
      expect(rt.steps).toHaveLength(standardFor(r.code).lines.length);
      expect(rt.order).not.toBeNull();
      expect(new Set(rt.steps.map((s) => s.id)).size).toBe(rt.steps.length);
      expect(rt.findings.filter((f) => f.kind === 'unclassified-line' || f.kind === 'cycle' || f.kind === 'unknown-predecessor')).toEqual([]);
      expect(rt.steps.filter((s) => s.kind === 'chill').map((s) => s.stream)).toEqual(['batch']);
      // No edge crosses the streams.
      for (const s of rt.steps) for (const a of s.after) expect(step(rt, a).stream).toBe(s.stream);
    }
  });

  it('the plan’s own study for AMK-E-001 classifies every line', () => {
    const rt = route('AMK-E-001');
    expect(rt.steps.some((s) => s.kind === 'other')).toBe(false);
    expect(rt.findings).toEqual([]);
    expect(rt.steps.filter((s) => s.kind === 'cook').every((s) => s.resourceKey !== null)).toBe(true);
  });
});

describe('muse routing — precedence off the kinds', () => {
  const rt = route('AMK-E-002');

  it('batch: receiving → scaling → prep → cook, the cooks alongside each other, the chill after every cook, the turnaround after the chill', () => {
    expect(step(rt, 'receiving').after).toEqual([]);
    expect(step(rt, 'scaling').after).toEqual(['receiving']);
    expect(step(rt, 'prep:Spanish rice').after).toEqual(['scaling']);
    expect(step(rt, 'cook:Beef & bean mix').after).toEqual(['prep:Beef & bean mix']);
    expect(step(rt, 'cook:Spanish rice').after).toEqual(['prep:Spanish rice']);
    expect(step(rt, 'chill').after.sort()).toEqual(['cook:Beef & bean mix', 'cook:Spanish rice']);
    expect(step(rt, 'turnaround').after).toEqual(['chill']);
  });

  it('dispatch: cold assemblies from staged components → assemble → seal → check at pack → load', () => {
    expect(step(rt, 'cold:Pico & corn').after).toEqual([]);
    expect(step(rt, 'assemble').after).toEqual(['cold:Pico & corn']);
    expect(step(rt, 'seal').after).toEqual(['assemble']);
    expect(step(rt, 'pack-check').after).toEqual(['seal']);
    expect(step(rt, 'load').after).toEqual(['pack-check']);
  });

  it('resources come off the thermal map and the Phase 1 list', () => {
    expect(step(rt, 'cook:Beef & bean mix').resourceKey).toBe('Tilting braising pan / skillet, 40 gal');
    expect(step(rt, 'cook:Spanish rice').resourceKey).toBe('Steam-jacketed tilting kettle, 100 gal');
    expect(step(rt, 'chill').resourceKey).toBe('Blast chiller, 200 lb capacity');
    expect(step(rt, 'prep:Spanish rice').resourceKey).toBe('Vertical cutter mixer, 45 qt');
    expect(step(rt, 'seal').resourceKey).toBe('Tray sealer, semi-automatic');
    expect(step(rt, 'assemble').resourceKey).toBeNull();
    expect(rt.findings).toEqual([]);
  });

  it('minutes: a fixed line is setup, a per-portion line runs per portion at the batch studied', () => {
    const batch = rt.batchSize;
    const chill = step(rt, 'chill');
    expect(chill.setupMinutes).toBe(0);
    expect(stepDuration(chill, batch)).toBeCloseTo(25, 10);
    expect(stepLaborMinutes(chill, batch)).toBeCloseTo(50, 10);
    expect(stepDuration(step(rt, 'receiving'), 999)).toBe(30);
    expect(step(rt, 'load')).toMatchObject({ setupMinutes: 10, runMinutesPerPortion: 0, stream: 'dispatch' });
    expect(chill.attended).toBe(true);
  });

  it('a tended cook is not attended for its run', () => {
    const smoked = route('AMK-E-003').steps.find((s) => s.id === 'cook:Smoked chicken')!;
    expect(smoked.attended).toBe(false);
  });
});

describe('muse routing — report, never repair', () => {
  it('a cook with no process on file names no vessel and says so', () => {
    const rt = route('AMK-E-007');
    expect(step(rt, 'cook:Black beans').resourceKey).toBeNull();
    expect(rt.findings).toContainEqual(expect.objectContaining({ kind: 'no-resource', stepId: 'cook:Black beans' }));
  });

  it('an overnight process is carried as a prior-day step and reported against the no-overnight rule', () => {
    const rt = route('AMK-E-009');
    expect(step(rt, 'cook:Pulled pork').priorDay).toBe(true);
    expect(rt.findings).toContainEqual(expect.objectContaining({ kind: 'overnight-process', stepId: 'cook:Pulled pork' }));
  });

  it('a recipe with no study has no route', () => {
    const rt = deriveRoute({ recipe: byCode('AMK-E-002'), standard: null, equipment: equipmentSeed });
    expect(rt.steps).toEqual([]);
    expect(rt.findings.map((f) => f.kind)).toEqual(['no-study']);
  });

  it('a cook whose vessel is not on the Phase 1 list is reported, not moved', () => {
    const noSkillet = equipmentSeed.map((e) => (/^Tilting braising pan/.test(e.item) ? { ...e, status: 'no' as const } : e));
    const rt = deriveRoute({ recipe: byCode('AMK-E-002'), standard: standardFor('AMK-E-002'), equipment: noSkillet });
    expect(step(rt, 'cook:Beef & bean mix').resourceKey).toBeNull();
    expect(rt.findings).toContainEqual(expect.objectContaining({ kind: 'no-resource', stepId: 'cook:Beef & bean mix' }));
  });
});

describe('muse routing — the scenario edits a step', () => {
  it('moves an edge, a crew size or a resource and marks the step edited', () => {
    const rt = route('AMK-E-002', { chill: { after: ['cook:Spanish rice'] }, seal: { staff: 3, setupMinutes: 5 }, 'cook:Spanish rice': { resourceKey: 'Combi oven, full size 20-pan' } });
    expect(step(rt, 'chill')).toMatchObject({ after: ['cook:Spanish rice'], edited: true });
    expect(step(rt, 'seal')).toMatchObject({ staff: 3, setupMinutes: 5, edited: true });
    expect(step(rt, 'cook:Spanish rice').resourceKey).toBe('Combi oven, full size 20-pan');
    expect(step(rt, 'assemble').edited).toBe(false);
    expect(rt.findings).toEqual([]);
  });

  it('an unknown predecessor, an unknown step, an unknown resource and a cycle are reported; the edges stand as edited', () => {
    const rt = route('AMK-E-002', { load: { after: ['nope'] }, ghost: { staff: 1 }, seal: { resourceKey: 'Nothing on the list' }, receiving: { after: ['turnaround'] } });
    const kinds = rt.findings.map((f) => f.kind);
    expect(kinds).toContain('unknown-predecessor');
    expect(kinds).toContain('unknown-resource');
    expect(kinds).toContain('cycle');
    expect(rt.order).toBeNull();
    expect(step(rt, 'receiving').after).toEqual(['turnaround']);
  });

  it('routeOrder takes the ready step with the lowest study position', () => {
    expect(routeOrder([{ id: 'b', seq: 2, after: [] }, { id: 'a', seq: 1, after: ['b'] }, { id: 'c', seq: 3, after: [] }])).toEqual(['b', 'a', 'c']);
  });

  it('the routing section is keyed by recipe and step', () => {
    const routing = { [routeKey('AMK-E-002', 'seal')]: { staff: 3 }, [routeKey('AMK-E-003', 'seal')]: { staff: 4 } };
    expect(routeOverlayFor(routing, 'AMK-E-002')).toEqual({ seal: { staff: 3 } });
  });
});

describe('muse routing — precedence depth, the process map’s columns', () => {
  const rt = route('AMK-E-002');
  const depths = routeDepths(rt.steps);

  it('a step sits one column past its deepest predecessor, within its own stream', () => {
    expect(depths.get('receiving')).toBe(0);
    expect(depths.get('scaling')).toBe(1);
    expect(depths.get('prep:Spanish rice')).toBe(2);
    expect(depths.get('cook:Spanish rice')).toBe(3);
    expect(depths.get('chill')).toBe(4);
    expect(depths.get('turnaround')).toBe(5);
  });

  it('the cooks share a column, and the dispatch stream starts again at zero', () => {
    expect(depths.get('cook:Beef & bean mix')).toBe(depths.get('cook:Spanish rice'));
    expect(depths.get('cold:Pico & corn')).toBe(0);
    expect(depths.get('assemble')).toBe(1);
    expect(depths.get('load')).toBe(4);
  });

  it('a cycle leaves the steps at a depth rather than looping', () => {
    const cyclic = route('AMK-E-002', { receiving: { after: ['turnaround'] } });
    const d = routeDepths(cyclic.steps);
    expect(d.size).toBe(cyclic.steps.length);
    expect([...d.values()].every((x) => Number.isFinite(x))).toBe(true);
  });
});

describe('muse routing — the units as resources', () => {
  it('tags the library’s estimate a placeholder; the chiller has no changeover between batches', () => {
    const rs = routeResources(equipmentSeed);
    const chiller = rs.find((r) => r.key === 'Blast chiller, 200 lb capacity')!;
    expect(chiller.concurrentBatches).toMatchObject({ value: 1, status: 'PLACEHOLDER' });
    expect(chiller.changeoverMinutes).toMatchObject({ value: 0, status: 'PLACEHOLDER' });
    expect(chiller.attendedRun.value).toBe(false);
    expect(rs.every((r) => equipmentSeed.find((e) => e.key === r.key)!.phase === 1)).toBe(true);
  });

  it('a stated library value is STATED; a scenario edit is STATED and wins', () => {
    const stated = equipmentSeed.map((e) => (e.key === 'Tray sealer, semi-automatic' ? { ...e, resourceBasis: 'stated' as const } : e));
    const rs = routeResources(stated, { 'Blast chiller, 200 lb capacity': { changeoverMinutes: 5 } });
    expect(rs.find((r) => r.key === 'Tray sealer, semi-automatic')!.concurrentBatches.status).toBe('STATED');
    expect(rs.find((r) => r.key === 'Blast chiller, 200 lb capacity')!.changeoverMinutes).toMatchObject({ value: 5, status: 'STATED' });
  });
});

describe('muse scenario — the scheduler’s sections', () => {
  it('routing, resources and schedulePolicy are sections of a saved scenario', () => {
    expect(SCENARIO_SECTIONS).toEqual(expect.arrayContaining(['routing', 'resources', 'schedulePolicy']));
    expect(isEmptyConfig({ schedulePolicy: {} })).toBe(true);
    expect(isEmptyConfig({ routing: { [routeKey('AMK-E-002', 'seal')]: { staff: 3 } } })).toBe(false);
  });

  it('resolves the schedule policy defaults, tagged, and the scenario’s edits onto them', () => {
    const d = resolveScenarioInputs().schedulePolicy;
    expect(d.deliveryTimeMin).toMatchObject({ value: 630, status: 'PLACEHOLDER' });
    expect(d.closedownStaff).toMatchObject({ value: 2, status: 'STATED' });
    expect(d.closedownMinutes).toMatchObject({ value: 30, status: 'STATED' });
    expect(d.allowUnattendedChill.value).toBe(false);
    const e = resolveScenarioInputs({ schedulePolicy: { deliveryTimeMin: 660, allowUnattendedChill: true, priorityRule: 'longest-path' } }).schedulePolicy;
    expect(e.deliveryTimeMin.value).toBe(660);
    expect(e.allowUnattendedChill.value).toBe(true);
    expect(e.priorityRule.value).toBe('longest-path');
    expect(resolveScenarioInputs().schedulePolicy.deliveryTimeMin.value).toBe(630);
  });

  it('resolves the resources off the equipment, with the scenario’s edits', () => {
    const r = resolveScenarioInputs({ resources: { 'Tilting braising pan / skillet, 40 gal': { concurrentBatches: 2 } } });
    expect(r.resources.find((x) => x.key === 'Blast chiller, 200 lb capacity')!.changeoverMinutes.value).toBe(0);
    expect(r.resources.find((x) => x.key === 'Tilting braising pan / skillet, 40 gal')!.concurrentBatches).toMatchObject({ value: 2, status: 'STATED' });
  });

  it('carries the routing edits for the routes to read', () => {
    const routing = { [routeKey('AMK-E-002', 'chill')]: { after: ['cook:Spanish rice'] } };
    const r = resolveScenarioInputs({ routing });
    expect(r.routing).toEqual(routing);
    const rt = deriveRoute({ recipe: byCode('AMK-E-002'), standard: standardFor('AMK-E-002'), equipment: r.equipment, overlay: routeOverlayFor(r.routing, 'AMK-E-002') });
    expect(step(rt, 'chill').after).toEqual(['cook:Spanish rice']);
  });
});
