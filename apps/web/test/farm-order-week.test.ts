/**
 * MicroFarm — the dashboard's Production card: the week of orders from today.
 */

import { describe, it, expect } from 'vitest';
import { resolveScenarioInputs } from '@/app/(farm)/farm/_engine/scenario';
import { seedLibrary } from '@/app/(farm)/farm/_data/crop-plans-seed';
import { assumptions, capacityInputs } from '@/app/(farm)/farm/_data/plan-data';
import { costCropPlan, deriveCapacity } from '@/app/(farm)/farm/_engine';
import { estimatedTimeStudy } from '@/app/(farm)/farm/_engine/time-study-estimate';
import { orderWeek, unitCostsFor } from '@/app/(farm)/farm/_engine/order-week';
import type { BookOrder } from '@/app/(farm)/farm/_engine/orders';
import type { TimeStudyDoc } from '@/app/(farm)/farm/_data/time-studies';

const studies: TimeStudyDoc[] = seedLibrary.map((r, i) => ({
  id: `s${i}`, cropPlanCode: r.code, adoptedAt: null, adoptedBy: null, source: 'seed',
  ...estimatedTimeStudy(r, deriveCapacity(r, capacityInputs).sowingSize),
}));
const pf = { 1: 1, 2: 1.5, 3: 1.5 };
const order = (date: string, channel: number, cropPlanCode: string, units: number): BookOrder => ({
  key: `${date}|pickup point|${cropPlanCode}`, id: null, orderDate: date, subscriberId: 'c', subscriberName: 'C', subscriberPickupPointId: 'pickupPoint', pickupPointName: 'S', subscriberServiceId: null, serviceName: null, distributionPickupPointId: null,
  channel, cropPlanCode, cropPlanName: cropPlanCode, units, status: 'forecast', basis: 'derived', source: 'cycle', pricePerUnitCents: 1000, priceBasis: 'channel', distributionId: null, subscriptionCycleId: null, notes: null,
});

describe('farm dashboard — the week of orders', () => {
  const book = [order('2027-01-04', 1, 'AMK-E-002', 400), order('2027-01-04', 2, 'AMK-A-002', 100), order('2027-01-06', 3, 'AMK-A-003', 50), order('2027-01-11', 1, 'AMK-E-002', 999), order('2027-01-05', 1, 'AMK-X-000', 10)];
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
    const e002 = seedLibrary.find((r) => r.code === 'AMK-E-002')!;
    const a002 = seedLibrary.find((r) => r.code === 'AMK-A-002')!;
    const u1 = unitCostsFor(e002, 1, capacityInputs, assumptions, studies, pf);
    const u2 = unitCostsFor(a002, 2, capacityInputs, assumptions, studies, pf);
    expect(u1.food).toBeCloseTo(costCropPlan(e002, assumptions.yield.shrinkAllowance.value).totalInputCostPerUnit, 10);
    expect(u2.food).toBeCloseTo(costCropPlan(a002, assumptions.yield.shrinkAllowance.value).totalInputCostPerUnit, 10); // an adult crop plan carries its own unit
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
    const e002 = seedLibrary.find((r) => r.code === 'AMK-E-002')!;
    const u = unitCostsFor(e002, 1, capacityInputs, assumptions, [], pf);
    expect(u.labor).toBe(0);
    expect(u.laborGap).toBe(true);
    // Food is unaffected: only the labor is missing, and it says so.
    expect(u.food).toBeGreaterThan(0);
  });

  it('given the resolver\'s crop plan assumptions, labor is the crop plan\'s own standard', () => {
    const R = resolveScenarioInputs({}, seedLibrary);
    const e002 = R.cropPlans.find((r) => r.code === 'AMK-E-002')!;
    const own = R.cropPlanAssumptions[e002.code]!;
    const sowing = deriveCapacity(e002, R.capacityInputs).sowingSize;
    const u = unitCostsFor(e002, 1, R.capacityInputs, R.assumptions, [], pf, R.cropPlanAssumptions);
    const minutes = own.laborSplit.fixedMinutesPerSowing.value / sowing + own.laborSplit.variableMinutesPerUnit.value;
    expect(u.labor).toBeCloseTo((minutes / 60) * own.labor.blendedLoadedWage.value, 10);
    expect(u.laborGap).toBe(false);
  });
});
