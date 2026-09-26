/**
 * MicroFarm — the equipment library (Roadmap N1).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { equipmentSeed, RESOURCE_SEED, type EquipmentLine } from '@/data/capex';
import {
  countsTowardCapital,
  equipmentFromRow,
  equipmentLibraryOrder,
  filterEquipment,
  uniqueEquipmentKey,
} from '@/engine/equipment';
import { capexRollup } from '@/engine/fixed-costs';
import { resolveScenarioInputs } from '@/engine/scenario';

const withEquipment = (lines: EquipmentLine[]) => capexRollup(resolveScenarioInputs({}, undefined, undefined, undefined, undefined, lines));
const home = equipmentSeed.filter((e) => e.setting === 'home');
const commercial = equipmentSeed.filter((e) => e.setting === 'commercial');

describe('farm equipment — the seed', () => {
  it('carries the home grow room in capital and no commercial row until a forecast selects it', () => {
    const r = capexRollup();
    // Vallecito's starter rack as bought: rack $200, five lights $450, four fans $200, sixteen flat sets $208.
    expect(r.equipmentAll).toBe(1_058);
    expect(r.equipmentPhase1).toBe(1_058);
    expect(r.equipmentPhase2Add).toBe(0);
    const all = withEquipment(equipmentSeed.map((e) => ({ ...e, status: 'planned' as const })));
    expect(all.equipmentAll).toBe(419_833);
    expect(all.equipmentPhase2Add).toBe(145_775);
    expect(all.equipmentPhase3Add).toBe(0);
  });

  it('seeds home rows Planned and commercial rows Unset, every service date TBD', () => {
    expect(home.every((e) => e.status === 'planned' && e.inServiceDate === null)).toBe(true);
    expect(commercial.every((e) => e.status === 'unset' && e.inServiceDate === null)).toBe(true);
  });

  it('the home list is Vallecito\'s rack as bought and Rob\'s list at quantity 1 with no price', () => {
    expect(home.filter((e) => e.category === 'Grow room').map((e) => e.item)).toEqual(['Grow rack, 6-tier 24x48 wire shelving', 'LED grow light, Mars Hydro VG80', 'Clip fan, 6 in', '1020 three-piece flat set']);
    const list = home.filter((e) => e.category !== 'Grow room');
    expect(list).toHaveLength(25);
    expect(list.every((e) => e.qty === 1 && e.unitCostNew === 0 && /not stated/.test(e.note ?? ''))).toBe(true);
    expect(list.map((e) => e.item)).toEqual(expect.arrayContaining(['5x5 tray set', '1010 tray set', '1020 tray set', '1020 solid bottom, top tray', 'Refrigerator', 'Stainless steel prep table', 'Dehumidifier, commercial']));
  });

  it('the commercial list is a grow facility\'s: prep, packaging, cold storage, sanitation, instruments, transport, technology', () => {
    expect(commercial).toHaveLength(27);
    expect([...new Set(commercial.map((e) => e.category))].sort()).toEqual(['Cold storage', 'Packaging', 'Prep', 'Storage, smallwares, instruments', 'Technology', 'Transport', 'Warewash & sanitation']);
  });

  it('gives every row a unique key', () => {
    expect(new Set(equipmentSeed.map((e) => e.key)).size).toBe(equipmentSeed.length);
  });
});

describe('farm equipment — status', () => {
  it('counts in service and planned rows toward capital, never No or –', () => {
    expect(countsTowardCapital('in_service')).toBe(true);
    expect(countsTowardCapital('planned')).toBe(true);
    expect(countsTowardCapital('no')).toBe(false);
    expect(countsTowardCapital('unset')).toBe(false);
  });

  it('drops a row from capital when it is marked No', () => {
    const lines = equipmentSeed.map((e) => (e.key === 'Grow rack, 6-tier 24x48 wire shelving' ? { ...e, status: 'no' as const } : e));
    expect(withEquipment(lines).equipmentAll).toBe(1_058 - 200);
  });

  it('a forecast selects a commercial row by its own status, and the capital, the grow units and the dates follow', () => {
    const key = 'Walk-in cooler, 12x20, with refrigeration';
    const R = resolveScenarioInputs({ forecast: { equipment: { [key]: { status: 'planned' } } } });
    expect(capexRollup(R).equipmentAll).toBe(1_058 + 52_000);
    expect(R.datedEquipment.find((e) => e.key === key)!.inServiceBasis).toBe('phase_one_at_start');
    expect(capexRollup().equipmentAll).toBe(1_058);
  });
});

describe('farm equipment — the library list', () => {
  const line = (key: string, qty: number, status: EquipmentLine['status'] = 'planned'): EquipmentLine => ({
    key, item: key, category: 'Prep', setting: 'commercial', phase: 1, status, inServiceDate: null, newUsed: 'New', qty, unitCostNew: 100, critical: false,
  });

  it('lists rows with no quantity last and keeps list order within each group', () => {
    const order = equipmentLibraryOrder([line('a', 0), line('b', 2), line('c', 0), line('d', 1)]).map((l) => l.key);
    expect(order).toEqual(['b', 'd', 'a', 'c']);
  });

  it('filters by the selected statuses', () => {
    const rows = [line('a', 1, 'planned'), line('b', 1, 'no'), line('c', 0, 'unset'), line('d', 1, 'in_service')];
    expect(filterEquipment(rows, new Set(['planned', 'in_service'] as const)).map((l) => l.key)).toEqual(['a', 'd']);
  });

  it('names a duplicate item with the next free ordinal', () => {
    expect(uniqueEquipmentKey('Scales', new Set())).toBe('Scales');
    expect(uniqueEquipmentKey('Scales', new Set(['Scales', 'Scales (2)']))).toBe('Scales (3)');
  });

  it('reads a row: cents to dollars, an unknown status to –, a missing date to TBD', () => {
    const l = equipmentFromRow({ id: 'x', key: 'k', item: 'Sprouting rack', category: 'Grow room', setting: 'home', buildPhase: 2, status: 'bogus', inServiceDate: null, newUsed: 'Used', qty: 1, unitCostCents: 4_600_050, critical: true, notes: null });
    expect(l.unitCostNew).toBe(46_000.5);
    expect(l.status).toBe('unset');
    expect(l.inServiceDate).toBeNull();
    expect(l.phase).toBe(2);
    expect(l.newUsed).toBe('Used');
    expect(l).toMatchObject({ concurrentSowings: null, changeoverMinutes: null, attendedRun: null, mayRunUnattended: null, resourceBasis: 'estimated' });
  });
});

describe('farm equipment — the unit as a scheduling resource (0066)', () => {
  const seed = (key: string) => equipmentSeed.find((e) => e.key === key)!;

  it('seeds the four attributes as estimated on the units the routing runs on', () => {
    expect(seed('Tray sealer, semi-automatic')).toMatchObject({ concurrentSowings: 1, changeoverMinutes: 0, attendedRun: true, mayRunUnattended: false, resourceBasis: 'estimated' });
    expect(seed('Walk-in cooler, 12x20, with refrigeration')).toMatchObject({ concurrentSowings: null, mayRunUnattended: true });
    expect(seed('Scales, receiving and unit').concurrentSowings).toBeUndefined();
  });

  it('no production unit may run with the building empty; only cold storage does', () => {
    const unattended = equipmentSeed.filter((e) => e.mayRunUnattended === true);
    expect(unattended.length).toBeGreaterThan(0);
    expect(unattended.every((e) => /^Walk-in cooler/.test(e.item))).toBe(true);
  });

  it('migration 0066 seeds every item RESOURCE_SEED names', () => {
    const sql = readFileSync(join(__dirname, '../drizzle/0001_farm_init.sql'), 'utf8');
    for (const item of Object.keys(RESOURCE_SEED)) expect(sql).toContain(`'${item}'`);
  });

  it('reads the attributes off a row; an unknown basis is estimated', () => {
    const l = equipmentFromRow({ id: 'x', key: 'k', item: 'Sprouting rack', category: 'Grow room', setting: 'home', buildPhase: 1, status: 'planned', inServiceDate: null, newUsed: 'New', qty: 1, unitCostCents: 0, critical: true, notes: null, concurrentSowings: 2, changeoverMinutes: 5, attendedRun: true, mayRunUnattended: false, resourceBasis: 'bogus' });
    expect(l).toMatchObject({ concurrentSowings: 2, changeoverMinutes: 5, attendedRun: true, mayRunUnattended: false, resourceBasis: 'estimated' });
    expect(equipmentFromRow({ id: 'x', key: 'k', item: 'Sprouting rack', category: 'Grow room', setting: 'home', buildPhase: 1, status: 'planned', inServiceDate: null, newUsed: 'New', qty: 1, unitCostCents: 0, critical: true, notes: null, resourceBasis: 'stated' }).resourceBasis).toBe('stated');
  });
});
