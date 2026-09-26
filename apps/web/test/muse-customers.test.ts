import { describe, it, expect } from 'vitest';
import { phases } from '../src/app/(muse)/muse/_data/plan-data';
import { seedCustomers, apportion, type CustomerDef } from '../src/app/(muse)/muse/_data/customers';
import { channelDemand, forecastByDeliverySite, resolveCustomerSites } from '../src/app/(muse)/muse/_engine/demand';
import { normalizePicks, serviceOver, siteTakesMealsOn, volumeOn, yearEndFrom } from '../src/app/(muse)/muse/_engine/services';
import { datedEquipment, equipmentInServiceOn } from '../src/app/(muse)/muse/_engine/equipment';
import type { EquipmentLine } from '../src/app/(muse)/muse/_data/capex';
import { resolveScenarioInputs } from '../src/app/(muse)/muse/_engine/scenario';

describe('customers — the seed reproduces the channel constants exactly', () => {
  it('apportions whole meals by largest remainder', () => {
    expect(apportion(1000, [320, 180, 150])).toEqual([492, 277, 231]);
    expect(apportion(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(apportion(5, [])).toEqual([]);
  });

  it('seeds one placeholder customer per channel with sites that sum to the constant', () => {
    const d = channelDemand(seedCustomers());
    for (const p of phases) {
      expect(d.byChannel[p.phase].mealsPerDay).toBe(p.mealsPerDay);
      // Meals-weighted service days: a channel with no planned volume (Phase 1 operations: schools only) derives none.
      expect(d.byChannel[p.phase].operatingDays).toBeCloseTo(p.mealsPerDay > 0 ? p.operatingDays : 0, 9);
      expect(d.byChannel[p.phase].annualMeals).toBe(p.mealsPerDay * p.operatingDays);
    }
    expect(seedCustomers().every((c) => c.source === 'seed')).toBe(true);
  });

  it('the seeded school sites carry the delivery-site ids so Sites & Delivery reads the same forecast', () => {
    const m = forecastByDeliverySite(channelDemand(seedCustomers()));
    expect(m['SITE-01']).toBe(492);
    expect(m['SITE-04']).toBe(0); // corporate carries no planned volume at Phase 1 operations
  });
});

describe('services, dated volume and site calendars (Roadmap N4a)', () => {
  it('a volume pick carries forward until the next; before the first there is none', () => {
    const picks = normalizePicks([{ effectiveDate: '2027-03-01', meals: 150 }, { effectiveDate: '2027-01-01', meals: 100 }, { effectiveDate: '2027-06-01', meals: 0 }]);
    expect(volumeOn(picks, '2026-12-31')).toBe(0);
    expect(volumeOn(picks, '2027-01-01')).toBe(100);
    expect(volumeOn(picks, '2027-02-28')).toBe(100);
    expect(volumeOn(picks, '2027-05-31')).toBe(150);
    expect(volumeOn(picks, '2027-06-02')).toBe(0);
  });

  it('a site takes meals inside a term and outside its breaks; with no term on file, every date', () => {
    const cal = [
      { id: 't', kind: 'term' as const, label: null, startDate: '2027-01-04', endDate: '2027-05-28' },
      { id: 'b', kind: 'break' as const, label: 'Spring break', startDate: '2027-03-15', endDate: '2027-03-19' },
    ];
    expect(siteTakesMealsOn(cal, '2027-01-03')).toBe(false);
    expect(siteTakesMealsOn(cal, '2027-03-16')).toBe(false);
    expect(siteTakesMealsOn(cal, '2027-03-22')).toBe(true);
    expect(siteTakesMealsOn([], '2027-07-04')).toBe(true);
  });

  it('a service over a window counts its weekdays inside the calendar, less closures, at the pick in force', () => {
    const sv = { weekdays: [1, 3, 5], status: 'active' as const, picks: [{ id: 'p', effectiveDate: '2027-01-01', meals: 40, notes: null }, { id: 'q', effectiveDate: '2027-01-11', meals: 60, notes: null }] };
    // 2027-01-04 (Mon) … 2027-01-15 (Fri): Mon/Wed/Fri = 6 dates; a closure on Wed 2027-01-13 leaves 5.
    const w = serviceOver(sv, [], '2027-01-04', '2027-01-15', [{ startDate: '2027-01-13', endDate: '2027-01-13' }]);
    expect(w.serviceDates).toBe(5);
    expect(w.meals).toBe(40 * 3 + 60 * 2);
    expect(yearEndFrom('2027-01-01')).toBe('2027-12-31');
  });

  it('two services on a site are two orders a day: annual meals add, service dates do not double', () => {
    const base = seedCustomers()[0];
    const site = base.sites[0];
    const c: CustomerDef = {
      ...base,
      sites: [{ ...site, services: [...site.services, { ...site.services[0], id: 'breakfast', name: 'Breakfast', picks: [{ id: 'b', effectiveDate: '2026-01-01', meals: 100, notes: null }] }] }],
    };
    const [r] = resolveCustomerSites([c]);
    expect(r.serviceDates).toBe(180);
    expect(r.annualMeals).toBe((492 + 100) * 180);
    expect(r.mealsPerDay).toBe(592);
  });

  it('a forecast edit changes the site and the channel without touching the record', () => {
    const lib = seedCustomers();
    const sv = lib[0].sites[0].services[0];
    const d = channelDemand(lib, { services: { [sv.id]: { picks: [{ effectiveDate: '2026-01-01', meals: 600 }] } } });
    expect(d.byChannel[1].mealsPerDay).toBe(1000 - 492 + 600);
    expect(d.sites.find((s) => s.id === lib[0].sites[0].id)?.edited).toBe(true);
    expect(lib[0].sites[0].services[0].picks[0].meals).toBe(492);
  });

  it('a forecast can leave a customer out, and meals per day × operating days equals the annual total', () => {
    const lib = seedCustomers();
    expect(channelDemand(lib, { customers: { [lib[0].id]: { included: false } } }).byChannel[1].annualMeals).toBe(0);
    const row = channelDemand(lib).byChannel[1];
    expect(row.mealsPerDay * row.operatingDays).toBeCloseTo(row.annualMeals, 6);
  });

  it('an inactive customer adds no demand', () => {
    const lib = seedCustomers();
    lib[1].status = 'inactive';
    expect(channelDemand(lib).byChannel[2].mealsPerDay).toBe(0);
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

describe('the resolver derives the channel volumes from customers', () => {
  it('phases carry the site-derived meals per day', () => {
    const r = resolveScenarioInputs();
    expect(r.phases[0].mealsPerDay).toBe(1000);
    expect(r.phases[1].operatingDays).toBeCloseTo(0, 9); // no corporate volume planned, so no service days derive
    expect(r.customers).toHaveLength(3);
  });

  it('a forecast service overlay flows through to the P&L basis; the retired customerSites overlay is ignored', () => {
    const lib = seedCustomers();
    const sv = lib[0].sites[0].services[0];
    const r = resolveScenarioInputs({ forecast: { services: { [sv.id]: { picks: [] } } } }, undefined, lib);
    expect(r.phases[0].mealsPerDay).toBe(1000 - 492);
    const legacy = resolveScenarioInputs({ customerSites: { [lib[0].sites[0].id]: { expectedMealsPerDay: 0 } } }, undefined, lib);
    expect(legacy.phases[0].mealsPerDay).toBe(1000);
    expect(r.forecast.startDate).toBe('2027-01-01');
  });

  it('a legacy mealsPerDay override on a phase is ignored — demand comes from sites', () => {
    const r = resolveScenarioInputs({ phases: { 1: { mealsPerDay: 5 } } });
    expect(r.phases[0].mealsPerDay).toBe(1000);
  });
});

describe('participation — a sales figure from confirmed and delivered orders', async () => {
  const { siteParticipation } = await import('../src/app/(muse)/muse/_engine/participation');
  const order = (date: string, service: string | null, meals: number, status: 'forecast' | 'confirmed' | 'delivered') => ({
    id: `${date}-${service}-${status}`, orderDate: date, customerId: 'c', customerSiteId: 'site', customerServiceId: service, channel: 1, recipeCode: 'R', meals, status,
    pricePerMealCents: null, deliveryId: null, menuCycleId: null, source: 'typed' as const, notes: null,
  });

  it('counts confirmed and delivered orders only, per service occasion, against enrollment', () => {
    const orders = [
      order('2027-01-04', 'lunch', 120, 'delivered'),
      order('2027-01-05', 'lunch', 130, 'confirmed'),
      order('2027-01-06', 'lunch', 999, 'forecast'),
      { ...order('2027-01-05', 'lunch', 5, 'delivered'), customerSiteId: 'other' },
    ];
    const p = siteParticipation('site', 250, orders);
    expect(p.orders).toBe(2);
    expect(p.services).toBe(2);
    expect(p.mealsPerService).toBe(125);
    expect(p.participation).toBe(0.5);
  });

  it('two orders on the same service occasion add to one service; no enrollment or no orders reads null', () => {
    const orders = [order('2027-01-04', 'lunch', 100, 'delivered'), { ...order('2027-01-04', 'lunch', 40, 'delivered'), id: 'x', recipeCode: 'R2' }, order('2027-01-04', 'breakfast', 60, 'confirmed')];
    expect(siteParticipation('site', 400, orders)).toMatchObject({ services: 2, mealsPerService: 100, participation: 0.25 });
    expect(siteParticipation('site', null, orders).participation).toBeNull();
    expect(siteParticipation('site', 400, []).participation).toBeNull();
  });
});
