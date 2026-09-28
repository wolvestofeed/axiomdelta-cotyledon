import { describe, it, expect } from 'vitest';
import { phases } from '@/data/plan-data';
import { PLAN_FIRST_PICKUP, PLAN_ROTATION, PLAN_SUBSCRIBERS, planSeedSubscribers, seedSubscribers as appSeed } from '@/data/subscribers';
import { dbSeedSubscribers } from '@/server/seed-writes';
import { datesBetween } from '@/engine/orders';
import { channelDemand, forecastByDistributionPickupPoint, recordPickupPoints, resolveSubscriberPickupPoints } from '@/engine/demand';
import { growPlanSeed } from '@/data/grow-plans-seed';
import { equipmentSeed } from '@/data/capex';
import { growUnitsFrom, unitTakesPlan } from '@/engine/grow-capacity';
import { datedEquipment, equipmentInServiceOn } from '@/engine/equipment';
import type { EquipmentLine } from '@/data/capex';
import { resolveScenarioInputs } from '@/engine/scenario';

const saturdays2027 = datesBetween('2027-01-01', '2027-12-31').filter((x) => new Date(`${x}T00:00:00Z`).getUTCDay() === 6).length;

describe('demand from subscriptions', () => {
  it('a pickup point\'s demand is the units its subscriptions carry on each distribution date in the window', () => {
    const [r] = resolveSubscriberPickupPoints(planSeedSubscribers().slice(0, 1));
    expect(r!.serviceDates).toBe(saturdays2027);
    expect(r!.annualUnits).toBe(saturdays2027);
    expect(r!.unitsPerDay).toBe(1);
  });

  it('a forecast can leave a subscriber out, and units per day × operating days equals the annual total', () => {
    const lib = planSeedSubscribers();
    expect(channelDemand(lib, { subscribers: Object.fromEntries(lib.map((c) => [c.id, { included: false }])) }).byChannel[1]!.annualUnits).toBe(0);
    const row = channelDemand(lib).byChannel[1]!;
    expect(row.unitsPerDay * row.operatingDays).toBeCloseTo(row.annualUnits, 6);
  });

  it('an inactive subscriber, an inactive pickup point and a closure add no demand', () => {
    const lib = planSeedSubscribers();
    lib[0]!.status = 'inactive';
    lib[1]!.pickupPoints[0]!.status = 'inactive';
    expect(channelDemand(lib).byChannel[1]!.unitsPerDay).toBe(PLAN_SUBSCRIBERS + 1 - 2);
    const closed = channelDemand(planSeedSubscribers(), {}, [1, 2, 3], { closures: [{ startDate: '2027-01-01', endDate: '2027-12-31' }] });
    expect(closed.totalAnnualUnits).toBe(0);
  });

  it('a linked distribution pickup point reads the same forecast on Pickup Points & Routes', () => {
    const lib = planSeedSubscribers();
    lib[0]!.pickupPoints[0]!.pickupPointId = 'pickup-point-01';
    expect(forecastByDistributionPickupPoint(channelDemand(lib))['pickup-point-01']).toBe(1);
  });
});

describe('equipment in service on a date in a forecast', () => {
  const line = (key: string, phase: 1 | 2 | 3, status: EquipmentLine['status'], inServiceDate: string | null = null): EquipmentLine => ({
    key, item: key, category: 'Prep', setting: 'commercial', phase, newUsed: 'New', qty: 1, unitCostNew: 1, critical: false, status, inServiceDate,
  } as EquipmentLine);
  const lines = [line('p1', 1, 'planned'), line('p2', 2, 'planned'), line('p2dated', 2, 'planned', '2028-07-01'), line('live', 1, 'in_service', '2026-01-10'), line('no', 1, 'no')];

  it('planned Phase 1 counts from the forecast start; Phase 2 and 3 only once dated; No never', () => {
    const d = datedEquipment(lines, '2027-01-01');
    expect(Object.fromEntries(d.map((x) => [x.key, x.inServiceFrom]))).toEqual({ p1: '2027-01-01', p2: null, p2dated: '2028-07-01', live: '2026-01-10', no: null });
    expect(equipmentInServiceOn(d, '2027-06-01').map((x) => x.key)).toEqual(['p1', 'live']);
    expect(equipmentInServiceOn(d, '2028-07-01').map((x) => x.key)).toEqual(['p1', 'p2dated', 'live']);
  });

  it('a forecast dates Phase 2 or takes a line out without changing the record', () => {
    const d = datedEquipment(lines, '2027-01-01', { p2: { inServiceDate: '2029-01-01' }, p1: { status: 'no' } });
    expect(d.find((x) => x.key === 'p2')?.inServiceFrom).toBe('2029-01-01');
    expect(d.find((x) => x.key === 'p1')?.inServiceFrom).toBeNull();
    expect(lines[1]!.inServiceDate).toBeNull();
  });
});

describe('the resolver derives the channel volumes from subscriptions', () => {
  it('phases carry the subscription-derived units per day: the Plan\'s 20 trays each Saturday', () => {
    const r = resolveScenarioInputs();
    expect(r.phases[0]!.unitsPerDay).toBe(PLAN_SUBSCRIBERS + 1);
    expect(r.phases[0]!.operatingDays).toBeCloseTo(saturdays2027, 9);
    expect(r.phases[1]!.operatingDays).toBeCloseTo(0, 9);
    expect(r.subscribers).toHaveLength(PLAN_SUBSCRIBERS + 1);
    expect(r.forecast.startDate).toBe('2027-01-01');
  });

  it('a typed unitsPerDay on a phase is ignored: demand comes from the subscriptions', () => {
    const r = resolveScenarioInputs({ phases: { 1: { unitsPerDay: 5 } } });
    expect(r.phases[0]!.unitsPerDay).toBe(PLAN_SUBSCRIBERS + 1);
  });
});

describe('the Plan seed: nineteen Forecast Subscribers and Rob\'s own tray, one 1020 flat weekly each at the Saturday pickup', () => {
  const all = planSeedSubscribers();
  const own = all.filter((c) => c.ownUse);
  const plan = all.filter((c) => !c.ownUse);
  const lit = growUnitsFrom(equipmentSeed).find((u) => !u.darkOnly)!;

  it('is the database seed and the engine default; on Actual only Rob\'s own tray is ordered', () => {
    expect(dbSeedSubscribers()).toEqual(all);
    expect(appSeed()).toEqual(all);
    expect(plan).toHaveLength(PLAN_SUBSCRIBERS);
    expect(plan.every((c) => c.status === 'forecast' && c.channel === 1 && c.source === 'seed' && /Invented test data/.test(c.notes ?? ''))).toBe(true);
    expect(own).toHaveLength(1);
    expect(own[0]).toMatchObject({ status: 'contracted', ownUse: true, channel: 1 });
    expect(recordPickupPoints(all).map((p) => p.subscriberId)).toEqual([own[0]!.id]);
  });

  it('each takes one tray weekly from the first Saturday pickup, of a plan in service that the lit racks grow', () => {
    expect(new Date(`${PLAN_FIRST_PICKUP}T00:00:00Z`).getUTCDay()).toBe(6);
    for (const c of all) {
      expect(c.pickupPoints).toHaveLength(1);
      const [sub] = c.subscriptions!;
      expect(sub).toMatchObject({ cadence: 'weekly', startDate: PLAN_FIRST_PICKUP, subscriberPickupPointId: c.pickupPoints[0]!.id, endDate: null });
      expect(sub!.flatPlan).toHaveLength(1);
      expect(sub!.flatPlan[0]!.lines).toHaveLength(1);
      expect(sub!.flatPlan[0]!.lines[0]!.units).toBe(1);
    }
    const codes = plan.map((c) => c.subscriptions![0]!.flatPlan[0]!.lines[0]!.growPlanCode);
    expect(new Set(codes)).toEqual(new Set(PLAN_ROTATION));
    for (const code of PLAN_ROTATION) {
      const p = growPlanSeed.find((x) => x.code === code)!;
      expect(p.status, code).toBe('in_service');
      expect(p.channels, code).toContain(1);
      expect(unitTakesPlan(lit, p), code).toBe(true);
    }
  });

  it('carries 20 trays each Saturday of the forecast year, at $30 a flat', () => {
    const d = channelDemand(all).byChannel[1]!;
    expect(d.unitsPerDay).toBe(PLAN_SUBSCRIBERS + 1);
    expect(d.annualUnits).toBe((PLAN_SUBSCRIBERS + 1) * saturdays2027);
    expect(phases.map((p) => p.pricePerUnit)).toEqual([30, 30, 30]);
    expect(phases.every((p) => p.unitsPerDay === 0 && p.operatingDays === 0)).toBe(true);
  });
});
