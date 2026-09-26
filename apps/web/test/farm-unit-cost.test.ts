/**
 * MicroFarm — the standard cost of a unit, per crop plan (Roadmap N3).
 *
 * The finding this closes (audit A2): every crop plan was charged one typed labor
 * split — AMK-E-001's plan study scaled linearly — because nothing passed a
 * per-crop-plan figure, and the Time Studies page already showed each crop plan's own
 * study, so two pages disagreed about the same crop plan. Packaging had the same
 * shape: picks were costed and ignored.
 */

import { describe, it, expect } from 'vitest';
import { assumptions as typed } from '@/app/(farm)/farm/_data/plan-data';
import { seedLibrary } from '@/app/(farm)/farm/_data/crop-plans-seed';
import type { TimeStudyDoc } from '@/app/(farm)/farm/_data/time-studies';
import type { PackagingLibrary } from '@/app/(farm)/farm/_data/packaging';
import { seedPackagingLibrary } from '@/app/(farm)/farm/_data/packaging';
import { resolveScenarioInputs, assumptionsFor } from '@/app/(farm)/farm/_engine/scenario';
import { costPerUnit, deriveCapacity, laborForDay } from '@/app/(farm)/farm/_engine';
import { laborStandardFor, laborMinutesPerUnit } from '@/app/(farm)/farm/_engine/unit-cost';
import { estimatedTimeStudy } from '@/app/(farm)/farm/_engine/time-study-estimate';
import { laborMinutesForSowing, summarizeStudy } from '@/app/(farm)/farm/_engine/time-studies';
import { planProductionDay } from '@/app/(farm)/farm/_engine/production-plan';

const R = resolveScenarioInputs({}, seedLibrary);
const rate = R.assumptions.labor.blendedLoadedWage.value;
const e002 = R.cropPlans.find((r) => r.code === 'AMK-E-002')!;
const e009 = R.cropPlans.find((r) => r.code === 'AMK-E-009')!;

describe('labor is each crop plan\'s own standard', () => {
  it('two crop plans on different sowings no longer carry the same minutes', () => {
    const a = assumptionsFor(R, e002.code).laborSplit;
    const b = assumptionsFor(R, e009.code).laborSplit;
    expect(a.variableMinutesPerUnit.value).not.toBeCloseTo(b.variableMinutesPerUnit.value, 3);
    // And neither is the typed figure every crop plan used to carry.
    expect(a.variableMinutesPerUnit.value).not.toBeCloseTo(typed.laborSplit.variableMinutesPerUnit.value, 3);
  });

  it('with no study library loaded, a crop plan carries its code estimate — the one the database is seeded with', () => {
    const sowing = deriveCapacity(e002, R.capacityInputs).sowingSize;
    const est = summarizeStudy(estimatedTimeStudy(e002, sowing));
    const std = R.laborStandards[e002.code]!;
    expect(std.basis).toBe('estimated');
    expect(std.fixedMinutesPerSowing).toBeCloseTo(est.fixedMinutesPerSowing, 10);
    expect(std.variableMinutesPerUnit).toBeCloseTo(est.variableMinutesPerUnit, 10);
  });

  it('a loaded library with no study for the crop plan is a gap, never a borrowed figure', () => {
    const std = laborStandardFor(e002, [], 275);
    expect(std.basis).toBe('none');
    expect(laborMinutesPerUnit(std, 275)).toBeNull();
    const withGap = resolveScenarioInputs({}, seedLibrary, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, []);
    expect(withGap.laborStandards[e002.code]!.basis).toBe('none');
    expect(assumptionsFor(withGap, e002.code).laborSplit.fixedMinutesPerSowing.value).toBe(0);
    expect(assumptionsFor(withGap, e002.code).laborSplit.fixedMinutesPerSowing.note).toContain('gap');
  });

  it('an adopted observed study outranks the estimate', () => {
    const observed: TimeStudyDoc = {
      id: 'obs-1',
      cropPlanCode: e002.code,
      cycleDays: 0,
      studiedOn: '2026-09-10',
      sowingSize: 400,
      observer: 'lead',
      qualityResult: 'pass',
      qualityNotes: null,
      adoptedAt: '2026-09-11T10:00:00.000Z',
      adoptedBy: 'admin',
      source: 'user_built',
      basis: 'observed',
      lines: [
        { task: 'Load', station: null, staff: 2, elapsedMinutes: 30, laborMinutes: 60, scalesWith: 'fixed', stream: 'sowing' },
        { task: 'Unit', station: null, staff: 2, elapsedMinutes: 200, laborMinutes: 400, scalesWith: 'variable', stream: 'sowing' },
      ],
    };
    const withObs = resolveScenarioInputs({}, seedLibrary, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, [observed]);
    const std = withObs.laborStandards[e002.code]!;
    expect(std.basis).toBe('observed');
    expect(std.fixedMinutesPerSowing).toBe(60);
    expect(std.variableMinutesPerUnit).toBeCloseTo(1, 10);
  });
});

describe('one cost per unit, whichever surface asks (conformance C1, as far as N3 reaches)', () => {
  it('Unit Economics and the Time Studies arithmetic agree about the reference crop plan', () => {
    // Unit Economics: costPerUnit on the resolved reference crop plan.
    const ue = costPerUnit(R.cropPlan, R.assumptions, R.capacityInputs).directLabor;
    // Time Studies: the crop plan's study at its derived sowing, at the loaded rate.
    const sowing = deriveCapacity(R.cropPlan, R.capacityInputs).sowingSize;
    const ts = (laborMinutesForSowing(summarizeStudy(estimatedTimeStudy(R.cropPlan, sowing)), sowing) / sowing / 60) * rate;
    expect(ue).toBeCloseTo(ts, 10);
  });

  it('Crop plans costs a non-reference crop plan at its own labor, not the reference crop plan\'s', () => {
    const own = costPerUnit(e009, assumptionsFor(R, e009.code), R.capacityInputs).directLabor;
    const borrowed = costPerUnit(e009, R.assumptions, R.capacityInputs).directLabor;
    expect(own).not.toBeCloseTo(borrowed, 3);
  });

  it('a production plan charges each run its own crop plan\'s labor', () => {
    const plan = planProductionDay({
      productionDate: '2026-09-14',
      requirements: [
        { cropPlanCode: e002.code, cropPlanName: e002.name, units: 400, baseUnits: 400, byChannel: [], orders: 1, inLibrary: true },
        { cropPlanCode: e009.code, cropPlanName: e009.name, units: 900, baseUnits: 900, byChannel: [], orders: 1, inLibrary: true },
      ],
      onHand: {},
      cropPlans: R.cropPlans,
      capacityInputs: R.capacityInputs,
      assumptions: R.assumptions,
      cropPlanAssumptions: R.cropPlanAssumptions,
    });
    for (const run of plan.runs) {
      if (run.sowingsScheduled === 0) continue;
      const expected = laborForDay(run.sowingsScheduled, run.produced, assumptionsFor(R, run.cropPlanCode));
      expect(run.laborCost).toBeCloseTo(expected.directLaborCost, 8);
    }
  });
});

describe('packaging is the crop plan\'s picks at the library cost — no placeholder', () => {
  it('a crop plan with no picks carries zero packaging', () => {
    expect(assumptionsFor(R, e002.code).perUnit.packaging.value).toBe(0);
    expect(costPerUnit(e002, assumptionsFor(R, e002.code), R.capacityInputs).packaging).toBe(0);
  });

  it('a crop plan with picks carries their cost, and no other crop plan is touched', () => {
    const seed = seedPackagingLibrary();
    const pkg = { ...seed.packages[0]!, id: 'pkg-1', manualUnitCost: 0.31 };
    const lib: PackagingLibrary = { ...seed, packages: [pkg], picks: [{ id: 'pick-1', cropPlanCode: e002.code, packageId: 'pkg-1', qtyPerUnit: 2 }] };
    const withPicks = resolveScenarioInputs({}, seedLibrary, undefined, undefined, undefined, undefined, lib);
    const own = assumptionsFor(withPicks, e002.code).perUnit.packaging;
    expect(own.value).toBeCloseTo(0.62, 10);
    expect(own.status).toBe('DERIVED');
    expect(assumptionsFor(withPicks, e009.code).perUnit.packaging.value).toBe(0);
  });

  it('picks with no cost entered cost zero — the AMK-E-002 bowl, lid and label as they are today', () => {
    const seed = seedPackagingLibrary();
    const bare = seed.packages.map((p, i) => ({ ...p, id: `pkg-${i}`, manualUnitCost: null, supplierItemId: null }));
    const lib: PackagingLibrary = {
      ...seed,
      packages: bare,
      picks: bare.map((p, i) => ({ id: `pick-${i}`, cropPlanCode: e002.code, packageId: p.id, qtyPerUnit: 1 })),
    };
    const withPicks = resolveScenarioInputs({}, seedLibrary, undefined, undefined, undefined, undefined, lib);
    expect(withPicks.cropPlanCosts[e002.code]!.packagingPerUnit).toBe(0);
    expect(costPerUnit(e002, assumptionsFor(withPicks, e002.code), withPicks.capacityInputs).packaging).toBe(0);
  });

  it('a packaging figure typed on an older forecast is ignored', () => {
    const legacy = resolveScenarioInputs({ assumptions: { perUnit: { packaging: 0.48 } } }, seedLibrary);
    expect(assumptionsFor(legacy, e002.code).perUnit.packaging.value).toBe(0);
  });
});
