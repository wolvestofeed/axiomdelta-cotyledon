import { describe, it, expect } from 'vitest';
import { phases } from '@/data/plan-data';
import { seedSubscribers, apportion, planSeedSubscribers, CURRENT_PROSPECT_UNITS_PER_DAY, type SubscriberDef } from '@/data/subscribers';
import { dbSeedSubscribers } from '@/server/seed-writes';
import { pickupPoints } from '@/data/seed-invented';
import { datesBetween } from '@/engine/orders';
import { channelDemand, forecastByDistributionPickupPoint, resolveSubscriberPickupPoints } from '@/engine/demand';
import { normalizePicks, serviceOver, pickupPointTakesUnitsOn, volumeOn, yearEndFrom } from '@/engine/services';
import { datedEquipment, equipmentInServiceOn } from '@/engine/equipment';
import type { EquipmentLine } from '@/data/capex';
import { resolveScenarioInputs } from '@/engine/scenario';

describe('subscribers — the seed reproduces the channel constants exactly', () => {
  it('apportions whole units by largest remainder', () => {
    expect(apportion(1000, [320, 180, 150])).toEqual([492, 277, 231]);
    expect(apportion(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(apportion(5, [])).toEqual([]);
  });

  it('seeds one placeholder subscriber per channel with pickup points that sum to the constant', () => {
    const d = channelDemand(seedSubscribers());
    for (const p of phases) {
      expect(d.byChannel[p.phase].unitsPerDay).toBe(p.unitsPerDay);
      // units-weighted service days: a channel with no planned volume (Phase 1 operations: prospects only) derives none.
      expect(d.byChannel[p.phase].operatingDays).toBeCloseTo(p.unitsPerDay > 0 ? p.operatingDays : 0, 9);
      expect(d.byChannel[p.phase].annualUnits).toBe(p.unitsPerDay * p.operatingDays);
    }
    expect(seedSubscribers().every((c) => c.source === 'seed')).toBe(true);
  });

  it('the seeded prospect pickup points carry the distribution-pickup-point ids so Pickup Points & Routes reads the same forecast', () => {
    const m = forecastByDistributionPickupPoint(channelDemand(seedSubscribers()));
    expect(m['pickup-point-01']).toBe(492);
    expect(m['pickup-point-04']).toBe(0); // corporate carries no planned volume at Phase 1 operations
  });
});

describe('services, dated volume and pickup point calendars (Roadmap N4a)', () => {
  it('a volume pick carries forward until the next; before the first there is none', () => {
    const picks = normalizePicks([{ effectiveDate: '2027-03-01', units: 150 }, { effectiveDate: '2027-01-01', units: 100 }, { effectiveDate: '2027-06-01', units: 0 }]);
    expect(volumeOn(picks, '2026-12-31')).toBe(0);
    expect(volumeOn(picks, '2027-01-01')).toBe(100);
    expect(volumeOn(picks, '2027-02-28')).toBe(100);
    expect(volumeOn(picks, '2027-05-31')).toBe(150);
    expect(volumeOn(picks, '2027-06-02')).toBe(0);
  });

  it('a pickup point takes units inside a term and outside its breaks; with no term on file, every date', () => {
    const cal = [
      { id: 't', kind: 'term' as const, label: null, startDate: '2027-01-04', endDate: '2027-05-28' },
      { id: 'b', kind: 'break' as const, label: 'Spring break', startDate: '2027-03-15', endDate: '2027-03-19' },
    ];
    expect(pickupPointTakesUnitsOn(cal, '2027-01-03')).toBe(false);
    expect(pickupPointTakesUnitsOn(cal, '2027-03-16')).toBe(false);
    expect(pickupPointTakesUnitsOn(cal, '2027-03-22')).toBe(true);
    expect(pickupPointTakesUnitsOn([], '2027-07-04')).toBe(true);
  });

  it('a service over a window counts its weekdays inside the calendar, less closures, at the pick in force', () => {
    const sv = { weekdays: [1, 3, 5], status: 'active' as const, picks: [{ id: 'p', effectiveDate: '2027-01-01', units: 40, notes: null }, { id: 'q', effectiveDate: '2027-01-11', units: 60, notes: null }] };
    // 2027-01-04 (Mon) … 2027-01-15 (Fri): Mon/Wed/Fri = 6 dates; a closure on Wed 2027-01-13 leaves 5.
    const w = serviceOver(sv, [], '2027-01-04', '2027-01-15', [{ startDate: '2027-01-13', endDate: '2027-01-13' }]);
    expect(w.serviceDates).toBe(5);
    expect(w.units).toBe(40 * 3 + 60 * 2);
    expect(yearEndFrom('2027-01-01')).toBe('2027-12-31');
  });

  it('two services on a pickup point are two orders a day: annual units add, service dates do not double', () => {
    const base = seedSubscribers()[0];
    const pickupPoint = base.pickupPoints[0];
    const c: SubscriberDef = {
      ...base,
      pickupPoints: [{ ...pickupPoint, services: [...pickupPoint.services, { ...pickupPoint.services[0], id: 'breakfast', name: 'Breakfast', picks: [{ id: 'b', effectiveDate: '2026-01-01', units: 100, notes: null }] }] }],
    };
    const [r] = resolveSubscriberPickupPoints([c]);
    expect(r.serviceDates).toBe(180);
    expect(r.annualUnits).toBe((492 + 100) * 180);
    expect(r.unitsPerDay).toBe(592);
  });

  it('a forecast edit changes the pickup point and the channel without touching the record', () => {
    const lib = seedSubscribers();
    const sv = lib[0].pickupPoints[0].services[0];
    const d = channelDemand(lib, { services: { [sv.id]: { picks: [{ effectiveDate: '2026-01-01', units: 600 }] } } });
    expect(d.byChannel[1].unitsPerDay).toBe(1000 - 492 + 600);
    expect(d.pickupPoints.find((s) => s.id === lib[0].pickupPoints[0].id)?.edited).toBe(true);
    expect(lib[0].pickupPoints[0].services[0].picks[0].units).toBe(492);
  });

  it('a forecast can leave a subscriber out, and units per day × operating days equals the annual total', () => {
    const lib = seedSubscribers();
    expect(channelDemand(lib, { subscribers: { [lib[0].id]: { included: false } } }).byChannel[1].annualUnits).toBe(0);
    const row = channelDemand(lib).byChannel[1];
    expect(row.unitsPerDay * row.operatingDays).toBeCloseTo(row.annualUnits, 6);
  });

  it('an inactive subscriber adds no demand', () => {
    const lib = seedSubscribers();
    lib[1].status = 'inactive';
    expect(channelDemand(lib).byChannel[2].unitsPerDay).toBe(0);
  });
});

describe('equipment in service on a date in a forecast (Roadmap N4a, decision 20)', () => {
  const line = (key: string, phase: 1 | 2 | 3, status: EquipmentLine['status'], inServiceDate: string | null = null): EquipmentLine => ({
    key, item: key, category: 'Hot production', phase, newUsed: 'New', qty: 1, unitCostNew: 1, critical: false, status, inServiceDate,
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
    expect(lines[1].inServiceDate).toBeNull();
  });
});

describe('the resolver derives the channel volumes from subscribers', () => {
  it('phases carry the pickup-point-derived units per day', () => {
    const r = resolveScenarioInputs();
    expect(r.phases[0].unitsPerDay).toBe(1000);
    expect(r.phases[1].operatingDays).toBeCloseTo(0, 9); // no corporate volume planned, so no service days derive
    expect(r.subscribers).toHaveLength(3);
  });

  it('a forecast service overlay flows through to the P&L basis; the retired subscriberPickupPoints overlay is ignored', () => {
    const lib = seedSubscribers();
    const sv = lib[0].pickupPoints[0].services[0];
    const r = resolveScenarioInputs({ forecast: { services: { [sv.id]: { picks: [] } } } }, undefined, lib);
    expect(r.phases[0].unitsPerDay).toBe(1000 - 492);
    const legacy = resolveScenarioInputs({ subscriberPickupPoints: { [lib[0].pickupPoints[0].id]: { expectedUnitsPerDay: 0 } } }, undefined, lib);
    expect(legacy.phases[0].unitsPerDay).toBe(1000);
    expect(r.forecast.startDate).toBe('2027-01-01');
  });

  it('a legacy unitsPerDay override on a phase is ignored — demand comes from pickup points', () => {
    const r = resolveScenarioInputs({ phases: { 1: { unitsPerDay: 5 } } });
    expect(r.phases[0].unitsPerDay).toBe(1000);
  });
});

describe('participation — a sales figure from confirmed and distributed orders', async () => {
  const { pickupPointParticipation } = await import('@/engine/participation');
  const order = (date: string, service: string | null, units: number, status: 'forecast' | 'confirmed' | 'distributed') => ({
    id: `${date}-${service}-${status}`, orderDate: date, subscriberId: 'c', subscriberPickupPointId: 'pickupPoint', subscriberServiceId: service, channel: 1, cropPlanCode: 'R', units, status,
    pricePerUnitCents: null, distributionId: null, subscriptionCycleId: null, source: 'typed' as const, notes: null,
  });

  it('counts confirmed and distributed orders only, per service occasion, against enrollment', () => {
    const orders = [
      order('2027-01-04', 'unit', 120, 'distributed'),
      order('2027-01-05', 'unit', 130, 'confirmed'),
      order('2027-01-06', 'unit', 999, 'forecast'),
      { ...order('2027-01-05', 'unit', 5, 'distributed'), subscriberPickupPointId: 'other' },
    ];
    const p = pickupPointParticipation('pickupPoint', 250, orders);
    expect(p.orders).toBe(2);
    expect(p.services).toBe(2);
    expect(p.unitsPerService).toBe(125);
    expect(p.participation).toBe(0.5);
  });

  it('two orders on the same service occasion add to one service; no enrollment or no orders reads null', () => {
    const orders = [order('2027-01-04', 'unit', 100, 'distributed'), { ...order('2027-01-04', 'unit', 40, 'distributed'), id: 'x', cropPlanCode: 'R2' }, order('2027-01-04', 'breakfast', 60, 'confirmed')];
    expect(pickupPointParticipation('pickupPoint', 400, orders)).toMatchObject({ services: 2, unitsPerService: 100, participation: 0.25 });
    expect(pickupPointParticipation('pickupPoint', null, orders).participation).toBeNull();
    expect(pickupPointParticipation('pickupPoint', 400, []).participation).toBeNull();
  });
});

describe('the Plan seed: one contracted subscriber, prospects carrying no volume', () => {
  it('the engine default reproduces the operating model constants and neutral test names', () => {
    const c = seedSubscribers();
    expect(c.map((x) => x.name)).toEqual(['Test Subscriber #1', 'Test Subscriber #2', 'Test Subscriber #3']);
    expect(c.every((x) => x.status === 'prospect')).toBe(true);
    expect(c[0].pickupPoints.map((s) => s.expectedUnitsPerDay)).toEqual([492, 277, 231]);
    expect(pickupPoints.map((s) => s.name)).toEqual(['Test Pickup point 1', 'Test Pickup point 2', 'Test Pickup point 3', 'Test Pickup point 4']);
    expect(c[2].pickupPoints[0].name).toBe('Test Pickup point 5');
  });

  it('the database seeds the contracted subscriber at its stated 125 units a day and every prospect at zero', () => {
    const plan = planSeedSubscribers();
    expect(CURRENT_PROSPECT_UNITS_PER_DAY).toBe(125);
    const contracted = plan.filter((c) => c.status === 'contracted');
    expect(contracted).toHaveLength(1);
    expect(contracted[0].channel).toBe(1);
    expect(contracted[0].pickupPoints.flatMap((x) => x.services).map((sv) => sv.picks.at(-1)?.units)).toEqual([125]);
    // The prospect's term dates are not on file: the pickup point carries no calendar rather than an invented one.
    expect(contracted[0].pickupPoints.every((x) => x.calendar.length === 0)).toBe(true);
    expect(contracted[0].notes).toContain('125');
    // The name was never given, and the row says so rather than carrying one.
    expect(contracted[0].name).toContain('not on file');
    expect(contracted[0].pricePerUnitCents).toBeNull();
    expect(contracted[0].paymentTerms).toBeNull();
    for (const c of plan.filter((x) => x.status === 'prospect')) {
      expect(c.pickupPoints.flatMap((x) => x.services).every((sv) => sv.picks.every((pk) => pk.units === 0))).toBe(true);
    }
    expect(plan.every((c) => c.source === 'seed')).toBe(true);
    expect(dbSeedSubscribers()).toEqual(plan);
  });

  it('demand splits contracted from planned, and the Plan seed is contracted only', () => {
    const d = channelDemand(planSeedSubscribers());
    expect(d.byChannel[1].unitsPerDay).toBe(125);
    expect(d.byChannel[1].contractedUnitsPerDay).toBe(125);
    expect(d.byChannel[1].contractedSubscribers).toBe(1);
    // No term on file: every Monday-to-Friday of the forecast year from 2027-01-01, the pick carried forward.
    const weekdays2027 = datesBetween('2027-01-01', '2027-12-31').filter((x) => { const w = new Date(`${x}T00:00:00Z`).getUTCDay(); return w >= 1 && w <= 5; }).length;
    expect(d.totalAnnualUnits).toBe(125 * weekdays2027);
    expect(d.contractedAnnualUnits).toBe(d.totalAnnualUnits);
    // The engine default is all prospects: every unit in it is planned volume.
    const e = channelDemand(seedSubscribers());
    expect(e.contractedAnnualUnits).toBe(0);
    expect(e.byChannel[1].contractedUnitsPerDay).toBe(0);
  });
});
