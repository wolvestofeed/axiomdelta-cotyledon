/**
 * MicroFarm — the space engine (Roadmap Phase Q, facility-design-roadmap.md).
 *
 * Golden values are the build plan's §5–§8 and §10.8 figures. The engine is
 * the source of truth once it exists: where it and the prose differ by
 * rounding (the plan hand-rounded the spine to whole feet), the assertion
 * carries the tolerance and the plan is restated to the engine.
 */

import { describe, it, expect } from 'vitest';
import { equipmentSeed, type EquipmentLine } from '@/app/(farm)/farm/_data/capex';
import { DESIGN_ROOMS, FOOTPRINT_SEED, ZONE_FACTORS, SUPPORT_PROGRAM_PSM } from '@/app/(farm)/farm/_data/facility-design';
import { CONFORMANCE_REGISTER, SPACE_STANDARDS, SOW_BLACKOUT_RULE } from '@/app/(farm)/farm/_data/facility-conformance';
import {
  BASELINE_SHELF_LIFE_DAYS,
  designRoomZoneSqFt,
  equipmentEnvelope,
  facilityConfigurations,
  facilityRequirement,
  facilityRows,
  hoodRuns,
  psmAllowance,
  publishedClearanceGrossSqFt,
  rowsThroughPhase,
  supportProgram,
  walkInGrossSqFt,
  zoneGross,
} from '@/app/(farm)/farm/_engine/facility';

const PSM = SUPPORT_PROGRAM_PSM.value;
const rows = facilityRows(equipmentSeed);
const req = facilityRequirement(equipmentSeed, { psm: PSM });
const [p1, p2, p3] = req.phases;
const close = (actual: number, expected: number, tol: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);

describe('farm facility — the footprint seed (§5)', () => {
  it('gives every seed row a footprint entry, 63 rows split 35 / 21 / 7 by build phase', () => {
    expect(equipmentSeed.every((e) => FOOTPRINT_SEED[e.item] !== undefined)).toBe(true);
    expect(rows.length).toBe(63);
    expect(rows.filter((r) => r.phase === 1).length).toBe(35);
    expect(rows.filter((r) => r.phase === 2).length).toBe(21);
    expect(rows.filter((r) => r.phase === 3).length).toBe(7);
  });

  it('sources every row with floor to a named model and its spec sheet; rows without floor are estimated', () => {
    expect(rows.filter((r) => r.basis === 'sourced').length).toBe(39);
    expect(rows.filter((r) => r.unitSqFt !== null).every((r) => r.basis === 'sourced')).toBe(true);
    // Every unit but the walk-ins names its representative model and its sheet; a walk-in is nominal from its name.
    expect(rows.filter((r) => r.unitSqFt !== null && r.zone !== 'Walk-in').every((r) => !!r.model && !!r.specSheetUrl)).toBe(true);
    expect(rows.every((r) => r.basis === 'sourced' || r.basis === 'estimated')).toBe(true);
  });

  it('carries no floor on bench-mounted, shelved, overhead and vehicle rows, and says why', () => {
    const none = rows.filter((r) => r.method === 'none');
    expect(none.length).toBeGreaterThan(0);
    expect(none.every((r) => r.unitSqFt === null && r.lineSqFt === 0 && r.zone === null && !!r.source)).toBe(true);
    expect(none.map((r) => r.item)).toContain('Refrigerated distribution van');
  });

  it('reproduces the plan-area figures of the table', () => {
    const unit = (item: string) => rows.find((r) => r.item === item)!.unitSqFt!;
    close(unit('Jar stand oven, full size 20-pan'), 13.02, 0.01);
    close(unit('Steam-jacketed tilting sprouting rack, 100 gal'), 15.58, 0.01);
    close(unit('Tumble blackout rack / ice water bath system'), 63.29, 0.01);
    close(unit('Blackout rack, 200 lb capacity'), 9.97, 0.01);
    close(unit('Walk-in cooler, 12x20, with refrigeration'), 240, 0.01);
    close(unit('Rack conveyor dishwasher + booster'), 15.57, 0.01);
  });
});

describe('farm facility — Layer A, the equipment envelope', () => {
  it('sums 701.6 / 1,185.4 / 1,236.6 sq ft cumulative through Phases 1, 2 and 3, warewash excluded', () => {
    close(equipmentEnvelope(rowsThroughPhase(rows, 1)), 701.6, 0.2);
    close(equipmentEnvelope(rowsThroughPhase(rows, 2)), 1185.4, 0.2);
    close(equipmentEnvelope(rowsThroughPhase(rows, 3)), 1236.6, 0.2);
  });

  it('counts only in-service and planned rows with a quantity', () => {
    const no: EquipmentLine[] = equipmentSeed.map((e) => (e.item.startsWith('Walk-in') ? { ...e, status: 'no' as const } : e));
    const without = facilityRequirement(no, { psm: PSM }).phases[0]!;
    expect(without.floor.zones.find((z) => z.zone === 'Walk-in')).toBeUndefined();
    expect(without.floor.productionFloorSqFt).toBeLessThan(p1!.floor.productionFloorSqFt - 500);
  });
});

describe('farm facility — Layer B, zone gross (§6)', () => {
  it('derives each depth-and-aisle factor as (depth + aisle) ÷ depth to two places', () => {
    for (const z of ZONE_FACTORS.filter((f) => f.depthIn !== undefined)) {
      expect(Math.round(((z.depthIn! + z.aisleIn!) / z.depthIn!) * 100) / 100).toBe(z.factor);
    }
  });

  it('grosses a walk-in as the nominal box + 2 in panel clearance + a 6 ft apron on the door wall', () => {
    close(walkInGrossSqFt(144, 240), 322.8, 0.05);
    close(walkInGrossSqFt(120, 144), 187.4, 0.05);
    close(walkInGrossSqFt(96, 120), 134.1, 0.05);
  });

  it('grosses the tumble blackout rack by its published clearances, not the zone factor', () => {
    close(publishedClearanceGrossSqFt(98, 93, { frontIn: 60, rearIn: 24, sideIn: 24 }), 179.5, 0.05);
    const t = rows.find((r) => r.item.startsWith('Tumble blackout rack'))!;
    expect(t.method).toBe('published_clearance');
    close(t.unitGrossSqFt!, 179.5, 0.05);
  });

  it('reproduces the Phase 1 zone gross line by line', () => {
    const z = Object.fromEntries(zoneGross(rowsThroughPhase(rows, 1)).map((l) => [l.zone, l.grossSqFt]));
    close(z['Hot line']!, 96.5, 0.1);
    close(z['Prep']!, 269.8, 0.1);
    close(z['Packaging']!, 250.5, 0.1);
    close(z['Grow']!, 77.5, 0.1);
    close(z['Cold storage']!, 99.1, 0.1);
    close(z['Walk-in']!, 322.8 + 187.4, 0.1);
    close(z['Harvest']!, 46.9, 0.1);
    close(z['Warewash']!, 183.7, 0.1);
  });

  it('keeps the warewash zone off the production floor and inside the support program', () => {
    const ww = zoneGross(rowsThroughPhase(rows, 1)).find((z) => z.zone === 'Warewash')!;
    expect(ww.excludedFromFloor).toBe(true);
    close(p1!.floor.zoneGrossSqFt, 1350.4, 0.2);
    close(p1!.support.lines.find((l) => l.key === 'warewash')!.netSqFt, 294, 0.5);
  });

  it('reads the full-build zone gross at 2,495.2 sq ft with the tumble blackout rack and the a la carte line in', () => {
    close(p3!.floor.zoneGrossSqFt, 2495.2, 0.5);
    const z = Object.fromEntries(zoneGross(rowsThroughPhase(rows, 3)).map((l) => [l.zone, l.grossSqFt]));
    close(z['A la carte']!, 125.4, 0.1);
    close(z['Grow']!, 93.6 + 179.5, 0.2);
  });
});

describe('farm facility — Layers C to E, the answer (§8)', () => {
  it('lands the production floor at 1,663 / 2,784 / 2,920 sq ft', () => {
    close(p1!.floor.productionFloorSqFt, 1663, 1.5);
    close(p2!.floor.productionFloorSqFt, 2784, 1.5);
    close(p3!.floor.productionFloorSqFt, 2920, 1.5);
    expect(p1!.floor.spineSqFt).toBe(5 * p1!.floor.spineFt);
  });

  it('sizes the support program at PSM 1,500: 3,034 net → 4,248 gross, and 4,360 with the second van', () => {
    close(p1!.support.netSqFt, 3034, 0.5);
    close(p1!.support.grossSqFt, 4248, 0.7);
    expect(p1!.support.dockLanes).toBe(2);
    expect(p2!.support.dockLanes).toBe(3);
    close(p2!.support.lines.find((l) => l.key === 'dock')!.netSqFt, 280, 0);
    close(p2!.support.grossSqFt, 4360, 0.7);
  });

  it('lands the building gross at 6,077 / 7,422 / 7,571 sq ft', () => {
    close(p1!.buildingGrossSqFt, 6077, 1.5);
    close(p2!.buildingGrossSqFt, 7422, 1.5);
    close(p3!.buildingGrossSqFt, 7571, 1.5);
  });

  it('names what Phase 1 carries idle: about 1,495 sq ft, 20% of the shell', () => {
    close(req.idle.grossSqFt, 1495, 1.5);
    close(req.idle.share, 0.197, 0.005);
  });

  it('moves only dry food storage with the PSM figure: 750 at 1,500, 500 at 1,000; chemical storage at its cap', () => {
    const dry = (psm: number) => supportProgram({ psm, vans: 1, warewashZoneGrossSqFt: 0 }).lines.find((l) => l.key === 'dry-food')!.netSqFt;
    expect(dry(1500)).toBe(750);
    expect(dry(1000)).toBe(500);
    expect(psmAllowance(1500, { base: 100, perStep: 50, step: 20, over: 200, cap: 500 })).toBe(500);
    const a = supportProgram({ psm: 1500, vans: 1, warewashZoneGrossSqFt: 100 });
    const b = supportProgram({ psm: 1000, vans: 1, warewashZoneGrossSqFt: 100 });
    expect(a.netSqFt - b.netSqFt).toBe(250);
  });

  it('puts equipment at about 42% of the production floor against the 30% rule of thumb', () => {
    close(p1!.equipmentShare, 0.42, 0.01);
  });
});

describe('farm facility — the hood', () => {
  it('runs one canopy per build phase: the units under it plus 6 in overhang at each open end', () => {
    const runs = hoodRuns(rowsThroughPhase(rows, 3));
    expect(runs.map((r) => r.phase)).toEqual([1, 2, 3]);
    const ph1 = runs[0]!;
    expect(ph1.units.map((u) => u.item).sort()).toEqual(['Jar stand oven, full size 20-pan', 'Steam-jacketed tilting sprouting rack, 100 gal', 'Tilting braising pan / shelf, 40 gal'].sort());
    close(ph1.lengthFt, (42.625 + 51 + 48 + 12) / 12, 0.001);
    close(p1!.hoodFt, 12.8, 0.05);
    close(p2!.hoodFt, 28.8, 0.05);
    close(p3!.hoodFt, 38.4, 0.05);
  });
});

describe('farm facility — the Design and Build plan (§10.8)', () => {
  it('documents the two potential rooms and neither is an equipment row', () => {
    const potential = DESIGN_ROOMS.filter((r) => r.status === 'potential');
    expect(potential.map((r) => r.id).sort()).toEqual(['hold-room-34f', 'packaging-room']);
    expect(equipmentSeed.some((e) => /34°F|packaging room/i.test(e.item))).toBe(false);
    for (const r of potential) {
      expect(r.cost.status).toBe('PLACEHOLDER');
      expect(r.impact.length).toBeGreaterThan(0);
      expect(r.risk.length).toBeGreaterThan(0);
    }
  });

  it('adds 134.1 sq ft of zone gross for the 34°F room and 77.5 for the packaging room', () => {
    const [hold, pack] = DESIGN_ROOMS.filter((r) => r.status === 'potential');
    close(designRoomZoneSqFt(hold!), 134.1, 0.05);
    close(designRoomZoneSqFt(pack!), 77.5, 0.001);
  });

  it('reads the four configurations at the plan\'s building gross: 6,077 / 6,241 / 6,172 / 6,335 at Phase 1', () => {
    const cfg = facilityConfigurations(equipmentSeed, PSM);
    expect(cfg.length).toBe(4);
    const gross1 = cfg.map((c) => c.requirement.phases[0]!.buildingGrossSqFt);
    close(gross1[0]!, 6077, 1.5);
    close(gross1[1]!, 6241, 1.5);
    close(gross1[2]!, 6172, 1.5);
    close(gross1[3]!, 6335, 1.5);
    close(cfg[3]!.requirement.phases[2]!.buildingGrossSqFt, 7824, 1.5);
  });

  it('distributes 7 days at baseline and 30 only with the 34°F room', () => {
    const cfg = facilityConfigurations(equipmentSeed, PSM);
    expect(BASELINE_SHELF_LIFE_DAYS).toBe(7);
    expect(cfg.map((c) => c.shelfLifeDays)).toEqual([7, 30, 7, 30]);
    expect(SOW_BLACKOUT_RULE.paths.find((p) => p.current)!.shelfLife).toBe('7 days');
  });
});

describe('farm facility — the conformance register (§4, §10.4)', () => {
  it('carries 15 space standards and 35 register items, every one with a status and an authority', () => {
    expect(SPACE_STANDARDS.length).toBe(15);
    expect(CONFORMANCE_REGISTER.length).toBe(35);
    for (const c of [...SPACE_STANDARDS, ...CONFORMANCE_REGISTER]) {
      expect(['CODE', 'SCHEME', 'GUIDANCE', 'CONVENTION']).toContain(c.status);
      expect(c.authority.length).toBeGreaterThan(0);
      expect(c.consequence.length).toBeGreaterThan(0);
    }
    expect(new Set(CONFORMANCE_REGISTER.map((c) => c.id)).size).toBe(35);
  });

  it('keeps the trade-material figures that are not code out of CODE', () => {
    const by = (id: string) => CONFORMANCE_REGISTER.find((c) => c.id === id)!.status;
    expect(by('C-05')).toBe('CONVENTION');
    expect(by('C-06')).toBe('SCHEME');
    expect(by('C-28')).toBe('CONVENTION');
    expect(by('C-15')).toBe('CODE');
    expect(SPACE_STANDARDS.find((s) => s.id === 'S-06')!.status).toBe('CODE');
    expect(SPACE_STANDARDS.find((s) => s.id === 'S-06')!.requirement).toMatch(/No number is given/);
  });

  it('never counsels: no recommend, should, best or optimal in any register text', () => {
    const text = [...SPACE_STANDARDS, ...CONFORMANCE_REGISTER].map((c) => `${c.requirement} ${c.consequence}`).join(' ');
    // "should" appears only quoted from the Texas rule's own drafting.
    expect(text.replace(/drafted "should"/g, '')).not.toMatch(/\b(recommend|best|optimal|we suggest|consider switching)\b/i);
  });
});
