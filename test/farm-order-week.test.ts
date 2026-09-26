/**
 * MicroFarm — the dashboard's Production card: the week of orders from today.
 */

import { describe, it, expect } from 'vitest';
import { resolveScenarioInputs } from '@/engine/scenario';
import { assumptions } from '@/data/plan-data';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { projectCropPlan } from '@/engine/grow-plan-bridge';

import { costCropPlan, deriveCapacity } from '@/engine';
import { estimatedTimeStudy } from '@/engine/time-study-estimate';
import { orderWeek, unitCostsFor } from '@/engine/order-week';
import { dailyMinutesPerUnit } from '@/engine/unit-cost';
import type { BookOrder } from '@/engine/orders';
import type { TimeStudyDoc } from '@/data/time-studies';

const grow = growPlanSeed.map((p) => projectCropPlan(p));
const onChannel = (code: string, channel: number) => ({ ...grow.find((r) => r.code === code)!, channels: [channel] });
// Two plans authored for channels 2 and 3, each carrying its own unit there.
const seedLibrary = [...grow.filter((r) => r.code !== 'PEA-01' && r.code !== 'SUN-01'), onChannel('PEA-01', 2), onChannel('SUN-01', 3)];
const capacityInputs = resolveScenarioInputs({}, seedLibrary).capacityInputs;
const studies: TimeStudyDoc[] = seedLibrary.map((r, i) => ({
  id: `s${i}`, cropPlanCode: r.code, approvedAt: null, approvedBy: null, source: 'seed',
  ...estimatedTimeStudy(r, Math.max(1, deriveCapacity(r, capacityInputs).sowingSize)),
}));
const pf = { 1: 1, 2: 1.5, 3: 1.5 };
const order = (date: string, channel: number, cropPlanCode: string, units: number): BookOrder => ({
  key: `${date}|pickup point|${cropPlanCode}`, id: null, orderDate: date, subscriberId: 'c', subscriberName: 'C', subscriberPickupPointId: 'pickupPoint', pickupPointName: 'S', subscriberServiceId: null, serviceName: null, distributionPickupPointId: null,
  channel, cropPlanCode, cropPlanName: cropPlanCode, units, status: 'forecast', basis: 'derived', source: 'cycle', pricePerUnitCents: 1000, priceBasis: 'channel', distributionId: null, subscriptionCycleId: null, notes: null,
});

describe('farm dashboard — the week of orders', () => {
  const book = [order('2027-01-04', 1, 'BROC-01', 400), order('2027-01-04', 2, 'PEA-01', 100), order('2027-01-06', 3, 'SUN-01', 50), order('2027-01-11', 1, 'BROC-01', 999), order('2027-01-05', 1, 'NONE-00', 10)];
  const w = orderWeek({ book, from: '2027-01-04', channels: [1, 2, 3], cropPlans: seedLibrary, cap: capacityInputs, assumptions, studies, unitFactorByChannel: pf });

  it('runs seven days from the day in use and keeps orders outside it out', () => {
    expect(w.days.map((d) => d.date)).toEqual(['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08', '2027-01-09', '2027-01-10']);
    expect(w.to).toBe('2027-01-10');
    expect(w.units).toBe(560);
  });

  it('units by channel and by day, and the week’s totals', () => {
    expect(w.days[0]!.unitsByChannel).toEqual({ 1: 400, 2: 100, 3: 0 });
    expect(w.days[2]!.unitsByChannel).toEqual({ 1: 0, 2: 0, 3: 50 });
    expect(w.unitsByChannel).toEqual({ 1: 410, 2: 100, 3: 50 });
    expect(w.days[3]!.units).toBe(0);
  });

  it('costs each order at its crop plan’s unit input cost on the channel’s unit and its labor standard at its sowing', () => {
    const broc = seedLibrary.find((r) => r.code === 'BROC-01')!;
    const pea = seedLibrary.find((r) => r.code === 'PEA-01')!;
    const u1 = unitCostsFor(broc, 1, capacityInputs, assumptions, studies, pf);
    const u2 = unitCostsFor(pea, 2, capacityInputs, assumptions, studies, pf);
    expect(u1.food).toBeCloseTo(costCropPlan(broc, assumptions.yield.shrinkAllowance.value).totalInputCostPerUnit, 10);
    expect(u2.food).toBeCloseTo(costCropPlan(pea, assumptions.yield.shrinkAllowance.value).totalInputCostPerUnit, 10); // a plan authored for channel 2 carries its own unit there
    expect(u1.labor).toBeGreaterThan(0);
    expect(w.days[0]!.inputCost).toBeCloseTo(u1.food * 400 + u2.food * 100, 8);
    expect(w.days[0]!.laborCost).toBeCloseTo(u1.labor * 400 + u2.labor * 100, 8);
    expect(w.inputCost).toBeCloseTo(w.days.reduce((s, d) => s + d.inputCost, 0), 8);
  });

  it('an order naming a crop plan not in the library is counted as units and carries no cost', () => {
    expect(w.uncostedUnits).toBe(10);
    expect(w.days[1]!.units).toBe(10);
    expect(w.days[1]!.inputCost).toBe(0);
  });

  it('with no time study the labor is a gap, never another crop plan\'s typed figure (Roadmap N3)', () => {
    const broc = seedLibrary.find((r) => r.code === 'BROC-01')!;
    const u = unitCostsFor(broc, 1, capacityInputs, assumptions, [], pf);
    expect(u.labor).toBe(0);
    expect(u.laborGap).toBe(true);
    // Food is unaffected: only the labor is missing, and it says so.
    expect(u.food).toBeGreaterThan(0);
  });

  it('given the resolver\'s crop plan assumptions, labor is the crop plan\'s own standard', () => {
    const R = resolveScenarioInputs({}, seedLibrary);
    const broc = R.cropPlans.find((r) => r.code === 'BROC-01')!;
    const own = R.cropPlanAssumptions[broc.code]!;
    const sowing = deriveCapacity(broc, R.capacityInputs).sowingSize;
    const u = unitCostsFor(broc, 1, R.capacityInputs, R.assumptions, [], pf, R.cropPlanAssumptions);
    // A grow plan's standard carries the daily stream over its cycle as well as the sowing and harvest lines.
    const minutes = own.laborSplit.fixedMinutesPerSowing.value / sowing + own.laborSplit.variableMinutesPerUnit.value + dailyMinutesPerUnit(R.laborStandards[broc.code]!, sowing);
    expect(u.labor).toBeCloseTo((minutes / 60) * own.labor.blendedLoadedWage.value, 10);
    expect(u.laborGap).toBe(false);
  });
});
