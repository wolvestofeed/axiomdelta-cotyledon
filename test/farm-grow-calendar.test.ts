/**
 * MicroFarm — the grow calendar (outline §4 stage schedule, §5 rules 1 and 8): sow dates back-planned
 * from distribution days, sowings placed on grow units for their cycle days, the day read by stage.
 */

import { describe, expect, it } from 'vitest';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { VARIETY_BY_KEY } from '@/data/varieties';
import { cycleDays, daysToHarvest } from '@/data/stage-schedule';
import { planStageDays } from '@/data/grow-plan';
import { equipmentSeed } from '@/data/capex';
import { growUnitsFrom } from '@/engine/grow-capacity';
import { ShelfLedger, calendarFromSowings, daysFrom, leadDaysFor, planGrowCalendar, sowDateFor, stageOn } from '@/engine/grow-calendar';
import { planHorizon } from '@/engine/production-plan';
import { resolveScenarioInputs } from '@/engine/scenario';
import { deriveRoute } from '@/engine/routing';
import { schedule, scheduleInputsForDay } from '@/engine/scheduler';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';
import type { BookOrder } from '@/engine/orders';

const broc = growPlanSeed.find((p) => p.code === 'BROC-01')!;
const mung = growPlanSeed.find((p) => p.code === 'MUNG-01')!;
const lib = [...growPlanSeed];
/** A plan that is not a grow plan: the carrier without the grow plan it was projected from. */

const units = growUnitsFrom(equipmentSeed);
const brocDays = VARIETY_BY_KEY['broccoli']!.stageDays.value;

describe('the stage on a day', () => {
  it('runs sow, germination, blackout, light, harvest window from the sow date, then off', () => {
    const sow = '2027-03-01';
    expect(stageOn(broc, sow, sow)).toMatchObject({ stage: 'sow', dayOfCycle: 0, onShelf: true });
    expect(stageOn(broc, sow, '2027-03-02')).toMatchObject({ stage: 'germination', dayOfCycle: 1, watering: 'mist' });
    const light = 1 + brocDays.germination + brocDays.blackout;
    expect(stageOn(broc, sow, `2027-03-${String(1 + light).padStart(2, '0')}`)).toMatchObject({ stage: 'light', watering: 'bottom', underLight: true });
    const harvest = daysToHarvest(brocDays);
    expect(stageOn(broc, sow, `2027-03-${String(1 + harvest).padStart(2, '0')}`).stage).toBe('harvest-window');
    expect(stageOn(broc, sow, `2027-03-${String(1 + cycleDays(brocDays)).padStart(2, '0')}`).stage).toBe('off');
    expect(stageOn(broc, sow, '2027-02-28').stage).toBe('off');
  });

  it('a jar sprout soaks the day before and rinses through germination', () => {
    expect(stageOn(mung, '2027-03-02', '2027-03-01')).toMatchObject({ stage: 'soak', onShelf: false });
    expect(stageOn(mung, '2027-03-02', '2027-03-02')).toMatchObject({ stage: 'germination', watering: 'rinse', wateringsPerDay: 3 });
    expect(daysFrom('2027-03-01', '2027-03-05')).toBe(4);
    expect(daysFrom('2027-03-05', '2027-03-01')).toBe(-4);
  });
});

describe('the sow date for a distribution date', () => {
  it('is the distribution date less days to harvest, moved back to a production day', () => {
    const lead = daysToHarvest(planStageDays(broc));
    // 2027-03-22 is a Monday.
    const d = sowDateFor(broc, '2027-03-22');
    expect(daysFrom(d, '2027-03-22')).toBeGreaterThanOrEqual(lead);
    expect([1, 2, 3, 4, 5]).toContain(new Date(`${d}T00:00:00Z`).getUTCDay());
    expect(sowDateFor(broc, '2027-03-22', [0, 1, 2, 3, 4, 5, 6])).toBe(new Date(Date.UTC(2027, 2, 22 - lead)).toISOString().slice(0, 10));
    expect(leadDaysFor(lib[0])).toBe(lead);
    expect(leadDaysFor(undefined)).toBe(1);
  });

  it('a closure moves the sow date earlier', () => {
    const open = sowDateFor(broc, '2027-03-22', [1, 2, 3, 4, 5]);
    const closed = sowDateFor(broc, '2027-03-22', [1, 2, 3, 4, 5], [{ startDate: open, endDate: open }]);
    expect(closed < open).toBe(true);
  });
});

describe('the shelf ledger', () => {
  it('places a sowing on the unit that takes the plan, for every day of its cycle, and refuses a second that does not fit', () => {
    const ledger = new ShelfLedger(units);
    const first = ledger.place(lib[0]!, '2027-03-01', 20, '2027-03-15');
    expect(first.placed).toBe(true);
    expect(first.unitKey).toBe(units[0]!.key);
    expect(first.harvestFrom).toBe(new Date(Date.UTC(2027, 2, 1 + daysToHarvest(brocDays))).toISOString().slice(0, 10));
    expect(ledger.traysOn(units[0]!.key, '2027-03-01')).toBe(20);
    expect(ledger.traysOn(units[0]!.key, new Date(Date.UTC(2027, 2, 1 + cycleDays(brocDays))).toISOString().slice(0, 10))).toBe(0);
    const second = ledger.place(lib[0]!, '2027-03-03', 20, '2027-03-17');
    expect(second.placed).toBe(false);
    const after = ledger.place(lib[0]!, new Date(Date.UTC(2027, 2, 1 + cycleDays(brocDays))).toISOString().slice(0, 10), 20, null);
    expect(after.placed).toBe(true);
  });

  it('a plan no unit lights is never placed; two units of the kind hold two sowings', () => {
    const rad = lib.find((r) => r.code === 'RAD-01')!;
    expect(new ShelfLedger(units).place(rad, '2027-03-01', 20).placed).toBe(false);
    const two = new ShelfLedger([{ ...units[0]!, units: 2 }]);
    expect(two.place(lib[0]!, '2027-03-01', 20).placed).toBe(true);
    expect(two.place(lib[0]!, '2027-03-01', 20).placed).toBe(true);
    expect(two.place(lib[0]!, '2027-03-01', 20).placed).toBe(false);
  });
});

describe('the calendar from requirements', () => {
  it('back-plans each requirement, reads each day by stage and unit, and reports what has no room', () => {
    const cal = planGrowCalendar({ from: '2027-03-01', to: '2027-03-31', requirements: [{ distributionDate: '2027-03-22', growPlanCode: 'BROC-01', baseUnits: 20 }, { distributionDate: '2027-03-23', growPlanCode: 'BROC-01', baseUnits: 20 }, { distributionDate: '2027-03-22', growPlanCode: 'RAD-01', baseUnits: 4 }], growPlans: lib, units });
    expect(cal.sowings.filter((s) => s.placed)).toHaveLength(1);
    expect(cal.findings.map((f) => f.kind).sort()).toEqual(['no-unit', 'over-capacity']);
    const sow = cal.sowings[0]!;
    const day = cal.days.find((d) => d.date === sow.sowDate)!;
    expect(day.sowingsStarted).toBe(1);
    expect(day.traysSown).toBe(20);
    expect(day.traysOnShelf).toBe(20);
    expect(day.byUnit[0]!.trays).toBe(20);
    expect(day.byUnit[0]!.capacity).toBe(20);
    expect(day.waterings.mist).toBe(20);
    const harvest = cal.days.find((d) => d.date === sow.harvestFrom)!;
    expect(harvest.traysHarvestable).toBe(20);
    expect(harvest.traysByStage['harvest-window']).toBe(20);
    expect(harvest.waterings.bottom).toBe(20);
    const off = cal.days.find((d) => d.date === '2027-03-31')!;
    expect(off.traysOnShelf).toBe(0);
    expect(cal.utilisation[0]!.used).toBe(20 * cycleDays(brocDays));
    expect(cal.utilisation[0]!.available).toBe(20 * 31);
    expect(calendarFromSowings({ from: '2027-03-01', to: '2027-03-02', sowings: [], growPlans: lib, units }).days).toHaveLength(2);
  });

  it('a code not in the library is reported, not placed', () => {
    const cal = planGrowCalendar({ from: '2027-03-01', to: '2027-03-31', requirements: [{ distributionDate: '2027-03-22', growPlanCode: 'NONE-01', baseUnits: 100 }], growPlans: lib, units });
    expect(cal.findings[0]!.kind).toBe('not-in-library');
    expect(cal.sowings).toHaveLength(0);
  });
});

describe('the horizon on grow plans', () => {
  const order = (date: string, code: string, unitsOrdered: number): BookOrder => ({
    key: `${date}|p|s|${code}`, id: null, orderDate: date, subscriberId: 'c', subscriberName: 'C', subscriberPickupPointId: 'p', pickupPointName: 'P', subscriberServiceId: 's', serviceName: null, distributionPickupPointId: null,
    channel: 1, growPlanCode: code, growPlanName: code, units: unitsOrdered, pricePerUnitCents: 2000, status: 'forecast', source: 'cycle', subscriptionCycleId: null, notes: null, editable: true,
  } as unknown as BookOrder);

  it('makes an order on its plan\'s sow date, places the sowing on the rack, and carries the calendar', () => {
    const R = resolveScenarioInputs({}, lib);
    const h = planHorizon({ from: '2027-03-01', to: '2027-03-31', book: [order('2027-03-22', 'BROC-01', 20)], growPlans: R.growPlans, capacityInputs: R.capacityInputs, assumptions: R.assumptions, growPlanAssumptions: R.growPlanAssumptions, unitFactorByChannel: { 1: 1 }, openingLots: [], shelfLifeDays: 3 });
    const sowDate = sowDateFor(broc, '2027-03-22');
    expect(h.productionDays.map((p) => p.productionDate)).toEqual([sowDate]);
    expect(h.distributionDays[0]!.productionDate).toBe(sowDate);
    const run = h.productionDays[0]!.runs[0]!;
    expect(run.sowingSize).toBe(20);
    expect(run.sowingsScheduled).toBe(1);
    expect(h.productionDays[0]!.fits).toBe(true);
    expect(h.growCalendar).not.toBeNull();
    expect(h.growCalendar!.sowings.filter((s) => s.placed)).toHaveLength(1);
    expect(h.growCalendar!.days.find((d) => d.date === sowDate)!.traysOnShelf).toBe(20);
  });

  it('a second sowing inside the first\'s cycle has no room on one rack: the day does not fit and the calendar says so', () => {
    const R = resolveScenarioInputs({}, lib);
    const h = planHorizon({ from: '2027-03-01', to: '2027-03-31', book: [order('2027-03-22', 'BROC-01', 20), order('2027-03-24', 'BROC-01', 20)], growPlans: R.growPlans, capacityInputs: R.capacityInputs, assumptions: R.assumptions, growPlanAssumptions: R.growPlanAssumptions, unitFactorByChannel: { 1: 1 }, openingLots: [], shelfLifeDays: 3 });
    expect(h.productionDays).toHaveLength(2);
    expect(h.productionDays[0]!.fits).toBe(true);
    expect(h.productionDays[1]!.fits).toBe(false);
    expect(h.productionDays[1]!.runs[0]!.shortfall).toBe(20);
    expect(h.growCalendar!.findings.map((f) => f.kind)).toEqual(['over-capacity']);
    expect(h.totals.daysThatDoNotFit).toBe(1);
  });

  it('an opening sowing on the shelves blocks the rack until its cycle ends', () => {
    const R = resolveScenarioInputs({}, lib);
    const h = planHorizon({ from: '2027-03-01', to: '2027-03-31', book: [order('2027-03-22', 'BROC-01', 20)], growPlans: R.growPlans, capacityInputs: R.capacityInputs, assumptions: R.assumptions, growPlanAssumptions: R.growPlanAssumptions, unitFactorByChannel: { 1: 1 }, openingLots: [], shelfLifeDays: 3, openingSowings: [{ growPlanCode: 'BROC-01', sowDate: '2027-03-05', trays: 20 }] });
    expect(h.productionDays[0]!.fits).toBe(false);
    expect(h.growCalendar!.sowings.filter((s) => s.distributionDate === null && s.placed)).toHaveLength(1);
  });
});

describe('the route and the day for a grow plan', () => {
  it('a grow plan\'s route is its sow and harvest lines at the stations, the daily lines left to the calendar, and the day places it without a rack', () => {
    const study = { id: 'e', growPlanCode: 'BROC-01', approvedAt: null, approvedBy: null, source: 'seed' as const, ...estimatedTimeStudy(lib[0]!, 20) };
    const route = deriveRoute({ growPlan: lib[0]!, standard: study, equipment: equipmentSeed });
    expect(route.findings).toEqual([]);
    expect(route.steps.every((s) => s.stream !== 'daily')).toBe(true);
    expect(route.steps.filter((s) => s.stream === 'sowing')).toHaveLength(5);
    expect(route.steps.filter((s) => s.stream === 'harvest')).toHaveLength(3);
    expect(route.steps.every((s) => s.resourceKey === null)).toBe(true);
    const sow = route.steps.find((s) => s.kind === 'sow')!;
    expect(sow.after).toEqual(route.steps.filter((s) => s.kind === 'prep').map((s) => s.id));
    expect(route.order).not.toBeNull();
    const R = resolveScenarioInputs({}, lib);
    const inputs = scheduleInputsForDay({ productionRuns: [{ growPlanCode: 'BROC-01', sowingsScheduled: 1, produced: 20 }], shipments: [{ growPlanCode: 'BROC-01', filledBase: 20 }], growPlans: R.growPlans, studies: [study], equipment: R.equipment, routing: {} });
    const day = schedule({ date: '2027-03-08', sowings: inputs.sowings, dispatches: inputs.dispatches, resources: R.resources, crews: [], capacityInputs: R.capacityInputs, policy: R.schedulePolicy });
    expect(day.metrics.sowingsPlaced).toBe(1);
    expect(day.metrics.dispatchesPlaced).toBe(1);
    expect(day.violations.filter((v) => v.kind === 'route' || v.kind === 'unplaced')).toEqual([]);
    expect(day.metrics.sowingLaborHours).toBeCloseTo((7 * 20) / 60, 6);
    expect(day.metrics.harvestLaborHours).toBeCloseTo((3 * 20) / 60, 6);
  });
});
