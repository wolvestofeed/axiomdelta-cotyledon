/**
 * MicroFarm — the equipment library (Roadmap N1).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { equipmentSeed, RESOURCE_SEED, type EquipmentLine } from '@/app/(farm)/farm/_data/capex';
import {
  countsTowardCapital,
  equipmentFromRow,
  equipmentLibraryOrder,
  filterEquipment,
  uniqueEquipmentKey,
} from '@/app/(farm)/farm/_engine/equipment';
import { capexRollup } from '@/app/(farm)/farm/_engine/fixed-costs';
import { resolveScenarioInputs } from '@/app/(farm)/farm/_engine/scenario';

const withEquipment = (lines: EquipmentLine[]) => capexRollup(resolveScenarioInputs({}, undefined, undefined, undefined, undefined, lines));
const qtyAtPhase1 = (re: RegExp) => equipmentSeed.filter((e) => e.phase === 1 && re.test(e.item)).reduce((s, e) => s + e.qty, 0);

describe('farm equipment — the seed', () => {
  it('keeps every dollar of the capex schedule and splits it into Phase 1, Phase 2 and Phase 3', () => {
    const r = capexRollup();
    expect(r.equipmentAll).toBe(1_194_775);
    // Both blackout racks are Phase 1: the second rack's $36,000 moved from Phase 2.
    expect(r.equipmentPhase1).toBe(625_200);
    expect(r.equipmentPhase2Add).toBe(491_775);
    expect(r.equipmentPhase3Add).toBe(77_800);
  });

  it('seeds every row Planned with the service date TBD', () => {
    expect(equipmentSeed.every((e) => e.status === 'planned' && e.inServiceDate === null)).toBe(true);
  });

  it('gives every row a unique key', () => {
    expect(new Set(equipmentSeed.map((e) => e.key)).size).toBe(equipmentSeed.length);
  });

  it('plans one hot line, two blackout rack racks and one cold chain at Phase 1', () => {
    // Two racks are two parallel streams, not a larger sowing; one row, qty 2, no "(Phase 2)" split.
    expect(qtyAtPhase1(/^Blackout rack/)).toBe(2);
    expect(equipmentSeed.filter((e) => /^Blackout rack/.test(e.item))).toHaveLength(1);
    expect(equipmentSeed.find((e) => e.key === 'Blackout rack, 200 lb capacity (Phase 2)')).toBeUndefined();
    expect(qtyAtPhase1(/^Walk-in cooler/)).toBe(1);
    expect(qtyAtPhase1(/^Walk-in freezer/)).toBe(1);
    expect(qtyAtPhase1(/^Jar stand oven/)).toBe(1);
    expect(qtyAtPhase1(/^Tilting braising pan/)).toBe(1);
    expect(qtyAtPhase1(/^Steam-jacketed tilting sprouting rack/)).toBe(1);
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
    const blackoutRack = equipmentSeed.find((e) => e.key === 'Blackout rack, 200 lb capacity')!;
    const lines = equipmentSeed.map((e) => (e.key === blackoutRack.key ? { ...e, status: 'no' as const } : e));
    // The one blackout rack row carries both racks, so marking it No drops both.
    expect(withEquipment(lines).equipmentAll).toBe(1_194_775 - 2 * 36_000);
    expect(withEquipment(lines).equipmentPhase1).toBe(625_200 - 2 * 36_000);
  });
});

describe('farm equipment — the library list', () => {
  const line = (key: string, qty: number, status: EquipmentLine['status'] = 'planned'): EquipmentLine => ({
    key, item: key, category: 'Prep', phase: 1, status, inServiceDate: null, newUsed: 'New', qty, unitCostNew: 100, critical: false,
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
    const l = equipmentFromRow({ id: 'x', key: 'k', item: 'Sprouting rack', category: 'Hot production', buildPhase: 2, status: 'bogus', inServiceDate: null, newUsed: 'Used', qty: 1, unitCostCents: 4_600_050, critical: true, notes: null });
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
    expect(seed('Blackout rack, 200 lb capacity')).toMatchObject({ concurrentSowings: 1, changeoverMinutes: 0, attendedRun: false, mayRunUnattended: false, resourceBasis: 'estimated' });
    expect(seed('Tilting braising pan / shelf, 40 gal')).toMatchObject({ concurrentSowings: 1, changeoverMinutes: 0, attendedRun: true, mayRunUnattended: false });
    expect(seed('Tilting braising pan / shelf, 40 gal (Phase 2)')).toMatchObject({ concurrentSowings: 1, attendedRun: true });
    expect(seed('Commercial slicer').concurrentSowings).toBeUndefined();
  });

  it('no production unit may run with the building empty; only cold storage does', () => {
    const unattended = equipmentSeed.filter((e) => e.mayRunUnattended === true);
    expect(unattended.length).toBeGreaterThan(0);
    expect(unattended.every((e) => /^Walk-in cooler/.test(e.item))).toBe(true);
  });

  it('migration 0066 seeds every item RESOURCE_SEED names', () => {
    const sql = readFileSync(join(__dirname, '../../../packages/db/drizzle/0001_farm_init.sql'), 'utf8');
    for (const item of Object.keys(RESOURCE_SEED)) expect(sql).toContain(`'${item}'`);
  });

  it('reads the attributes off a row; an unknown basis is estimated', () => {
    const l = equipmentFromRow({ id: 'x', key: 'k', item: 'Sprouting rack', category: 'Hot production', buildPhase: 1, status: 'planned', inServiceDate: null, newUsed: 'New', qty: 1, unitCostCents: 0, critical: true, notes: null, concurrentSowings: 2, changeoverMinutes: 5, attendedRun: true, mayRunUnattended: false, resourceBasis: 'bogus' });
    expect(l).toMatchObject({ concurrentSowings: 2, changeoverMinutes: 5, attendedRun: true, mayRunUnattended: false, resourceBasis: 'estimated' });
    expect(equipmentFromRow({ id: 'x', key: 'k', item: 'Sprouting rack', category: 'Hot production', buildPhase: 1, status: 'planned', inServiceDate: null, newUsed: 'New', qty: 1, unitCostCents: 0, critical: true, notes: null, resourceBasis: 'stated' }).resourceBasis).toBe('stated');
  });
});
