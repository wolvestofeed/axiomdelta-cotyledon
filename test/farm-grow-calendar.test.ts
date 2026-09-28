/**
 * Cotyledon — the grow calendar (outline §4 stage schedule, §5 rules 1 and 8): sow dates back-planned
 * from distribution days, sowings placed on grow units for their cycle days, the day read by stage.
 */

import { describe, expect, it } from 'vitest';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { VARIETY_BY_KEY } from '@/data/varieties';
import { cycleDays, daysToHarvest } from '@/data/stage-schedule';
import { planStageDays } from '@/data/grow-plan';
import { equipmentSeed } from '@/data/capex';
import { deriveGrowCapacity, growUnitsFrom, sowingsFor } from '@/engine/grow-capacity';
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

/** One of the seed's lit racks: five shelves of four 1020s under the Mars Hydro, no dark rack. */
const units = growUnitsFrom(equipmentSeed).filter((u) => !u.darkOnly).map((u) => ({ ...u, units: 1 }));
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

  it('a plan under light is never placed on an unlit unit; two units of the kind hold two sowings', () => {
    expect(new ShelfLedger([{ ...units[0]!, fixtureKey: null }]).place(broc, '2027-03-01', 20).placed).toBe(false);
    expect(new ShelfLedger(units).place(lib.find((r) => r.code === 'RAD-01')!, '2027-03-01', 20).placed).toBe(true);
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
    // The rack is full with the first broccoli sowing: the second and the radish have no room.
    expect(cal.findings.map((f) => f.kind).sort()).toEqual(['over-capacity', 'over-capacity']);
    const unlit = planGrowCalendar({ from: '2027-03-01', to: '2027-03-31', requirements: [{ distributionDate: '2027-03-22', growPlanCode: 'RAD-01', baseUnits: 4 }], growPlans: lib, units: [{ ...units[0]!, fixtureKey: null }] });
    expect(unlit.findings.map((f) => f.kind)).toEqual(['no-unit']);
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
    key: `${date}|p|s|${code}`, id: null, orderDate: date, subscriberId: 'c', subscriberName: 'C', subscriberPickupPointId: 'p', pickupPointName: 'P', subscriptionId: 's', distributionPickupPointId: null,
    channel: 1, growPlanCode: code, growPlanName: code, units: unitsOrdered, pricePerUnitCents: 2000, status: 'forecast', source: 'subscription', notes: null, editable: true,
  } as unknown as BookOrder);

  it('makes an order on its plan\'s sow date, places the sowing on the rack, and carries the calendar', () => {
    const R = resolveScenarioInputs({}, lib);
    const h = planHorizon({ from: '2027-03-01', to: '2027-03-31', book: [order('2027-03-22', 'BROC-01', 20)], growPlans: R.growPlans, capacityInputs: R.capacityInputs, assumptions: R.assumptions, growPlanAssumptions: R.growPlanAssumptions, unitFactorByChannel: { 1: 1 }, openingLots: [] });
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
    const h = planHorizon({ from: '2027-03-01', to: '2027-03-31', book: [order('2027-03-22', 'BROC-01', 20), order('2027-03-24', 'BROC-01', 20)], growPlans: R.growPlans, capacityInputs: R.capacityInputs, growUnits: units, assumptions: R.assumptions, growPlanAssumptions: R.growPlanAssumptions, unitFactorByChannel: { 1: 1 }, openingLots: [] });
    expect(h.productionDays).toHaveLength(2);
    expect(h.productionDays[0]!.fits).toBe(true);
    expect(h.productionDays[1]!.fits).toBe(false);
    expect(h.productionDays[1]!.runs[0]!.shortfall).toBe(20);
    expect(h.growCalendar!.findings.map((f) => f.kind)).toEqual(['over-capacity']);
    expect(h.totals.daysThatDoNotFit).toBe(1);
  });

  it('an opening sowing on the shelves blocks the rack until its cycle ends', () => {
    const R = resolveScenarioInputs({}, lib);
    const h = planHorizon({ from: '2027-03-01', to: '2027-03-31', book: [order('2027-03-22', 'BROC-01', 20)], growPlans: R.growPlans, capacityInputs: R.capacityInputs, growUnits: units, assumptions: R.assumptions, growPlanAssumptions: R.growPlanAssumptions, unitFactorByChannel: { 1: 1 }, openingLots: [], openingSowings: [{ growPlanCode: 'BROC-01', sowDate: '2027-03-05', trays: 20 }] });
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

describe('dark racks', () => {
  const seedUnits = growUnitsFrom(equipmentSeed);
  const lit = { ...units[0]! };
  const dark = { key: 'dark', item: 'Dark rack', shelves: 5, shelfWidthIn: 48, fixtureKey: null, units: 1, darkOnly: true };
  const days = planStageDays(broc);
  const darkDays = days.sow + days.germination + days.blackout;
  const stacked = days.sow + days.germination;
  const cycle = cycleDays(days);
  const at = (k: number) => new Date(Date.UTC(2027, 2, 1 + k)).toISOString().slice(0, 10);

  it('hold a tray sowing through its dark days, stacked five to a place through germination; it moves to a lit rack for its light days', () => {
    const ledger = new ShelfLedger([lit, dark]);
    const s = ledger.place(broc, '2027-03-01', 20);
    expect(s).toMatchObject({ placed: true, darkUnitKey: 'dark', unitKey: lit.key });
    for (let k = 0; k < cycle; k += 1) {
      expect(ledger.traysOn('dark', at(k)), `day ${k}`).toBe(k < stacked ? 4 : k < darkDays ? 20 : 0);
      expect(ledger.traysOn(lit.key, at(k)), `day ${k}`).toBe(k < darkDays ? 0 : 20);
    }
  });

  it('never take a plan under light whole; a sprout plan with no light line sits on one whole', () => {
    expect(new ShelfLedger([dark]).place(broc, '2027-03-01', 4).placed).toBe(false);
    const jars = new ShelfLedger([dark]).place(mung, '2027-03-01', 4);
    expect(jars).toMatchObject({ placed: true, unitKey: 'dark' });
    expect(jars.darkUnitKey ?? null).toBeNull();
  });

  it('with no dark rack that has room, a sowing spends its whole cycle on a lit rack', () => {
    // One shelf holds the stacks but not the 20 spread in blackout.
    const ledger = new ShelfLedger([lit, { ...dark, shelves: 1 }]);
    const s = ledger.place(broc, '2027-03-01', 20);
    expect(s).toMatchObject({ placed: true, unitKey: lit.key });
    expect(s.darkUnitKey ?? null).toBeNull();
    expect(ledger.traysOn(lit.key, at(0))).toBe(20);
  });

  it('let one lit rack take a second week sown as the first moves under light', () => {
    const one = new ShelfLedger([lit]);
    expect(one.place(broc, '2027-03-01', 20).placed).toBe(true);
    expect(one.place(broc, '2027-03-08', 20).placed).toBe(false);
    const withDark = new ShelfLedger([lit, dark]);
    expect(withDark.place(broc, '2027-03-01', 20).placed).toBe(true);
    // The second week's dark days overlap the first's light days, not its dark ones.
    expect(withDark.place(broc, `2027-03-${String(1 + darkDays).padStart(2, '0')}`, 20).placed).toBe(true);
  });

  it('are read by the calendar on the days the trays sit there', () => {
    const ledger = new ShelfLedger([lit, dark]);
    ledger.place(broc, '2027-03-01', 20);
    const cal = calendarFromSowings({ from: '2027-03-01', to: '2027-03-31', sowings: ledger.sowings, growPlans: lib, units: [lit, dark] });
    const onUnit = (date: string, key: string) => cal.days.find((d) => d.date === date)!.byUnit.find((u) => u.unitKey === key)!.trays;
    expect(onUnit(at(1), 'dark')).toBe(4);
    expect(onUnit(at(stacked), 'dark')).toBe(20);
    expect(onUnit(at(1), lit.key)).toBe(0);
    expect(onUnit(at(darkDays), 'dark')).toBe(0);
    expect(onUnit(at(darkDays), lit.key)).toBe(20);
  });

  it('set the ceiling as the lesser of the lit trays over the light days and the dark places over the place-days a tray takes there', () => {
    const cap = deriveGrowCapacity(broc, [lit, dark]);
    expect(cap.darkTrays).toBe(20);
    expect([cap.darkDays, cap.lightDays]).toEqual([darkDays, cycle - darkDays]);
    expect(cap.traysPerDay).toBeCloseTo(Math.min(20 / (cycle - darkDays), 20 / (stacked / 5 + days.blackout)), 9);
    expect(deriveGrowCapacity(broc, [lit]).traysPerDay).toBeCloseTo(20 / cycle, 9);
  });

  it('the seed racks carry 20 trays a week: a weekly sowing of 20 is placed every week, and all four racks hold trays at once', () => {
    const ledger = new ShelfLedger(seedUnits);
    const weeks = [0, 7, 14, 21, 28, 35].map((k) => ledger.place(broc, at(k), 20));
    expect(weeks.every((s) => s.placed)).toBe(true);
    expect(weeks.every((s) => s.darkUnitKey)).toBe(true);
    // Two lit racks and two dark racks: after the first fortnight every day has trays on both kinds.
    const litKey = seedUnits.find((u) => !u.darkOnly)!.key;
    const darkKey = seedUnits.find((u) => u.darkOnly)!.key;
    for (let k = 14; k < 35; k += 1) {
      expect(ledger.traysOn(litKey, at(k)), `lit day ${k}`).toBeGreaterThan(0);
      expect(ledger.traysOn(darkKey, at(k)), `dark day ${k}`).toBeGreaterThan(0);
    }
  });
});

describe('a sowing is the orders\' trays, sown so its cycle ends on the distribution day', () => {
  it('sows the whole trays ordered, one flat the least, split only past what one unit takes', () => {
    expect(sowingsFor(3, 20)).toEqual([3]);
    expect(sowingsFor(0.2, 20)).toEqual([1]);
    expect(sowingsFor(45, 20)).toEqual([20, 20, 5]);
    expect(sowingsFor(0, 20)).toEqual([]);
  });

  it('a tray is sown on the day its days to harvest end on the Saturday, weekends included; sprouts on a production day', () => {
    const saturday = '2026-10-17';
    for (const p of lib.filter((x) => x.format === 'flat-1020')) {
      expect(daysFrom(sowDateFor(p, saturday), saturday), p.code).toBe(daysToHarvest(planStageDays(p)));
    }
    const bor = lib.find((x) => x.code === 'BOR-01')!;
    expect(new Date(`${sowDateFor(bor, saturday)}T00:00:00Z`).getUTCDay()).toBe(0); // thirteen days before a Saturday is a Sunday
    const jar = sowDateFor(mung, saturday);
    expect([1, 2, 3, 4, 5]).toContain(new Date(`${jar}T00:00:00Z`).getUTCDay());
  });

  it('the Plan\'s twenty weekly trays, Rob\'s own among them, each place on the seed racks every week', () => {
    const R = resolveScenarioInputs();
    const reqs = Array.from({ length: 6 }, (_, w) => new Date(Date.UTC(2026, 9, 17 + 7 * w)).toISOString().slice(0, 10)).flatMap((date) =>
      R.subscribers.flatMap((c) => c.subscriptions!.map((s) => ({ distributionDate: date, growPlanCode: s.flatPlan[0]!.lines[0]!.growPlanCode, baseUnits: 1 }))),
    );
    const merged = [...reqs.reduce((m, r) => m.set(`${r.distributionDate}|${r.growPlanCode}`, { ...r, baseUnits: (m.get(`${r.distributionDate}|${r.growPlanCode}`)?.baseUnits ?? 0) + 1 }), new Map<string, typeof reqs[number]>()).values()];
    const cal = planGrowCalendar({ from: '2026-10-01', to: '2026-12-31', requirements: merged, growPlans: R.growPlans, units: growUnitsFrom(equipmentSeed) });
    expect(cal.findings.filter((f) => f.kind !== 'sow-before-window')).toEqual([]);
    expect(R.subscribers).toHaveLength(20);
    expect(cal.sowings.reduce((t, s) => t + s.trays, 0)).toBe(20 * 6);
  });
});
