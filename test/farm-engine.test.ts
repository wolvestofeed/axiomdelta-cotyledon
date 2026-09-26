import { describe, it, expect } from 'vitest';
import { runPlanningLoop, laborForDay, fixedLaborShareOfFullSowing } from '@/engine';
import { laborRequirement, checkStaffing, staffedSpans, scheduledHeadcountAt, newCrewDefaultsFor } from '@/engine/staffing';
import { assumptions } from '@/data/plan-data';
import { crews as seedCrews, newCrew } from '@/data/crews';
import { resolveScenarioInputs, type CrewOverlay } from '@/engine/scenario';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { projectCropPlan } from '@/engine/grow-plan-bridge';

/** Proposed crews through the overlay, resolved the way every page resolves them. */
const crewsWith = (overlay: Record<string, CrewOverlay>) => resolveScenarioInputs({ crews: overlay }).crews;

describe('farm — plan yields carry their own provenance', () => {
  const growLines = growPlanSeed.flatMap((p) => projectCropPlan(p).inputs.map((i) => ({ plan: p.code, i })));
  it('every stored harvested yield equals SEED quantity × yield factor (no drift), on every seed grow plan', () => {
    for (const { plan, i } of growLines) {
      expect(i.seedQtyPerSowing * i.yieldToHarvest, `${plan} ${i.name}`).toBeCloseTo(i.harvestedYieldPerSowing, 9);
    }
  });
  it('every line names the source of its yield, separately from its price', () => {
    for (const { plan, i } of growLines) {
      expect(i.yieldSource.length, `${plan} ${i.name}`).toBeGreaterThan(0);
      expect(i.yieldStatus, `${plan} ${i.name}`).toBeTruthy();
    }
  });
});

describe('farm — proposed crews are checked against the requirement, never the other way round', () => {
  const R = resolveScenarioInputs({});
  // A grow day places nothing on the clock: its sowing stream is its plan's lines, unplaced.
  const none = laborRequirement(R.capacityInputs);

  it('no crew is seeded; with none proposed nothing is checked', () => {
    expect(seedCrews).toEqual([]);
    expect(R.crews).toEqual([]);
    const s = checkStaffing(none, []);
    expect(s.checked).toBe(false);
    expect(s.findings).toEqual([]);
  });
  it('staffed minutes are the union of crews with headcount; a zero-headcount crew staffs nothing', () => {
    const two = crewsWith({ a: { startMin: 420, endMin: 780, headcount: 3 }, b: { startMin: 720, endMin: 1140, headcount: 2 } });
    expect(staffedSpans(two)).toEqual([{ startMin: 420, endMin: 1140 }]);
    expect(scheduledHeadcountAt(two, 750)).toBe(5);
    expect(staffedSpans(crewsWith({ ghost: { startMin: 420, endMin: 1140, headcount: 0 } }))).toEqual([]);
  });
  it('a new crew spans the operating day at one person when nothing is placed on the clock', () => {
    expect(newCrewDefaultsFor(none)).toEqual({ startMin: 420, endMin: 1140, headcount: 1 });
    const added = crewsWith({ 'crew-1': { label: 'Proposed' } })[0]!;
    expect(added.headcount.status).toBe('STATED');
    expect([added.startMin.value, added.endMin.value, added.headcount.value]).toEqual([420, 1140, 1]);
    expect(newCrew('x', {}, { startMin: 1, endMin: 2, headcount: 3 }).headcount.value).toBe(3);
  });
});

describe('farm — scenario resolver carries the plant inputs, the calendar and the crews', () => {
  it('production days are counted from the production calendar unless a scenario types them', () => {
    expect(resolveScenarioInputs({}).capacityInputs.productionDaysPerYear.value).toBe(261); // 2027 weekdays, no closure (the forecast year, Roadmap K)
    const christmas = [{ startDate: '2027-12-24', endDate: '2027-12-24' }]; // a Friday
    expect(resolveScenarioInputs({}, undefined, undefined, christmas).capacityInputs.productionDaysPerYear.value).toBe(260);
    const weekend = [{ startDate: '2027-07-03', endDate: '2027-07-04' }]; // Saturday–Sunday
    expect(resolveScenarioInputs({}, undefined, undefined, weekend).capacityInputs.productionDaysPerYear.value).toBe(261);
    expect(resolveScenarioInputs({ capacity: { productionDaysPerYear: 250 } }, undefined, undefined, christmas).capacityInputs.productionDaysPerYear.value).toBe(250);
  });
  it('crews are edited, removed and added through the overlay', () => {
    const R = resolveScenarioInputs({
      crews: {
        'shift-2': { endMin: 1170 },
        'shift-1': { removed: true },
        'crew-1': { label: 'Second morning crew', startMin: 420, endMin: 930, headcount: 4 },
      },
    });
    expect(R.crews.map((c) => c.id).sort()).toEqual(['crew-1', 'shift-2']);
    expect(R.crews.find((c) => c.id === 'shift-2')!.endMin.value).toBe(1170);
    const added = R.crews.find((c) => c.id === 'crew-1')!;
    expect(added.label).toBe('Second morning crew');
    expect(added.headcount.status).toBe('STATED');
    expect('crews' in R.capacityInputs).toBe(false);
  });
});

describe('farm — planning loop', () => {
  const base = {
    forecastUnits: 650,
    openingInventory: 3250,
    daysOfCoverTarget: 5,
    shelfLifeDays: 30,
    sowingSize: 575,
    cyclesAvailable: 2,
  };
  it('matches the single-day plan at the derived sowing', () => {
    const r = runPlanningLoop(base);
    expect(r.targetInventory).toBe(3250);
    expect(r.projectedInventory).toBe(2600);
    expect(r.shortfall).toBe(650);
    expect(r.sowingsToRun).toBe(2);
    expect(r.unitsProduced).toBe(1150);
    expect(r.closingInventory).toBe(3750);
    expect(r.daysOfCover).toBeCloseTo(5.7692, 3);
    expect(r.overproductionCarriedForward).toBe(500);
    expect(r.shelfLifeCheck).toBe('OK');
    expect(r.capacityCheck).toBe('OK');
  });
  it('flips to OVER_CAPACITY when the forecast exceeds the sowings available', () => {
    const r = runPlanningLoop({ ...base, forecastUnits: 3000, openingInventory: 3000 });
    expect(r.sowingsToRun).toBeGreaterThan(base.cyclesAvailable);
    expect(r.capacityCheck).toBe('OVER_CAPACITY');
  });
});

describe('farm — labor (fixed per sowing + variable per unit)', () => {
  it('matches the day labor on the typed split (2 sowings, 1150 units)', () => {
    const l = laborForDay(2, 1150);
    expect(l.fixedLaborHours).toBeCloseTo(6, 3);
    expect(l.variableLaborHours).toBeCloseTo(28.75, 3);
    expect(l.totalLaborHours).toBeCloseTo(34.75, 3);
    expect(l.directLaborCost).toBeCloseTo(1017.48, 1);
    expect(l.laborCostPerUnit).toBeCloseTo(0.8848, 3);
  });
  it('the fixed share of a full sowing is the fixed minutes over the sowing\'s minutes', () => {
    const f = assumptions.laborSplit.fixedMinutesPerSowing.value;
    const v = assumptions.laborSplit.variableMinutesPerUnit.value;
    expect(fixedLaborShareOfFullSowing(275)).toBeCloseTo(f / (f + v * 275), 9);
  });
});

describe('farm — assumptions sanity', () => {
  it('blended loaded wage is the loaded average of the two roles', () => {
    const base = (assumptions.labor.sowWage.value + assumptions.labor.leadWage.value) / 2;
    expect(base * (1 + assumptions.labor.payrollBurden.value)).toBeCloseTo(assumptions.labor.blendedLoadedWage.value, 2);
  });
});
