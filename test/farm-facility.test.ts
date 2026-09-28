/**
 * Cotyledon — the space engine (Roadmap Phase Q, facility-design-roadmap.md).
 *
 * The engine sizes a rented commercial facility from the commercial equipment a forecast
 * selects. The golden values are the commercial list selected in full, as the engine derives
 * them; the zone factors, walk-in and clearance arithmetic and the support program are checked
 * on their own inputs.
 */

import { describe, it, expect } from 'vitest';
import { equipmentSeed, type EquipmentLine } from '@/data/capex';
import { DESIGN_ROOMS, FOOTPRINT_SEED, ZONE_FACTORS, SUPPORT_PROGRAM_PSM } from '@/data/facility-design';
import { CONFORMANCE_REGISTER, SPACE_STANDARDS, SOW_BLACKOUT_RULE } from '@/data/facility-conformance';
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
} from '@/engine/facility';

const PSM = SUPPORT_PROGRAM_PSM.value;
// The commercial list, every row selected, as a commercial forecast would carry it.
const COMMERCIAL: EquipmentLine[] = equipmentSeed.filter((e) => e.setting === 'commercial').map((e) => ({ ...e, status: 'planned' as const }));
const rows = facilityRows(COMMERCIAL);
const req = facilityRequirement(COMMERCIAL, { psm: PSM });
const [p1, p2, p3] = req.phases;
const close = (actual: number, expected: number, tol: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);

describe('farm facility — the footprint seed (§5)', () => {
  it('gives every commercial row a footprint entry, 27 rows split 19 / 8 by build phase', () => {
    expect(COMMERCIAL.every((e) => FOOTPRINT_SEED[e.item] !== undefined)).toBe(true);
    expect(rows.length).toBe(27);
    expect(rows.filter((r) => r.phase === 1).length).toBe(19);
    expect(rows.filter((r) => r.phase === 2).length).toBe(8);
  });

  it('sources every row with floor to a named model and its spec sheet; rows without floor are estimated', () => {
    expect(rows.filter((r) => r.basis === 'sourced').length).toBe(15);
    expect(rows.filter((r) => r.unitSqFt !== null).every((r) => r.basis === 'sourced')).toBe(true);
    expect(rows.filter((r) => r.unitSqFt !== null && r.zone !== 'Walk-in').every((r) => !!r.model && !!r.specSheetUrl)).toBe(true);
    expect(rows.every((r) => r.basis === 'sourced' || r.basis === 'estimated')).toBe(true);
  });

  it('carries no floor on bench-mounted, shelved, overhead and vehicle rows, and says why', () => {
    const none = rows.filter((r) => r.method === 'none');
    expect(none.length).toBe(12);
    expect(none.every((r) => r.unitSqFt === null && r.lineSqFt === 0 && r.zone === null && !!r.source)).toBe(true);
    expect(none.map((r) => r.item)).toContain('Refrigerated distribution van');
  });

  it('a home row carries no floor: the grow room is no building', () => {
    const home = facilityRows(equipmentSeed.filter((e) => e.setting === 'home'));
    expect(home.every((r) => r.method === 'none' && r.lineSqFt === 0)).toBe(true);
  });

  it('reads a walk-in at its nominal box', () => {
    close(rows.find((r) => r.item === 'Walk-in cooler, 12x20, with refrigeration')!.unitSqFt!, 240, 0.01);
  });
});

describe('farm facility — Layer A, the equipment envelope', () => {
  it('sums 472.5 / 693.4 / 693.4 sq ft cumulative through Phases 1, 2 and 3, warewash excluded', () => {
    close(equipmentEnvelope(rowsThroughPhase(rows, 1)), 472.5, 0.2);
    close(equipmentEnvelope(rowsThroughPhase(rows, 2)), 693.4, 0.2);
    close(equipmentEnvelope(rowsThroughPhase(rows, 3)), 693.4, 0.2);
  });

  it('counts only in-service and planned rows with a quantity', () => {
    const no: EquipmentLine[] = COMMERCIAL.map((e) => (e.item.startsWith('Walk-in') ? { ...e, status: 'no' as const } : e));
    const without = facilityRequirement(no, { psm: PSM }).phases[0]!;
    expect(without.floor.zones.find((z) => z.zone === 'Walk-in')).toBeUndefined();
    expect(without.floor.productionFloorSqFt).toBeLessThan(p1!.floor.productionFloorSqFt - 300);
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

  it('grosses a unit with published clearances by them, not the zone factor', () => {
    close(publishedClearanceGrossSqFt(98, 93, { frontIn: 60, rearIn: 24, sideIn: 24 }), 179.5, 0.05);
  });

  it('reproduces the Phase 1 zone gross line by line', () => {
    const z = Object.fromEntries(zoneGross(rowsThroughPhase(rows, 1)).map((l) => [l.zone, l.grossSqFt]));
    close(z['Prep']!, 247.7, 0.1);
    close(z['Packaging']!, 250.5, 0.1);
    close(z['Cold storage']!, 49.7, 0.1);
    close(z['Walk-in']!, 322.8, 0.1);
    close(z['Harvest']!, 46.9, 0.1);
    close(z['Warewash']!, 137, 0.1);
  });

  it('keeps the warewash zone off the production floor and inside the support program', () => {
    const ww = zoneGross(rowsThroughPhase(rows, 1)).find((z) => z.zone === 'Warewash')!;
    expect(ww.excludedFromFloor).toBe(true);
    close(p1!.floor.zoneGrossSqFt, 917.5, 0.2);
    close(p1!.support.lines.find((l) => l.key === 'warewash')!.netSqFt, 219.2, 0.5);
  });

  it('reads the full-build zone gross at 1,357.5 sq ft with the second walk-in in', () => {
    close(p3!.floor.zoneGrossSqFt, 1357.5, 0.5);
    const z = Object.fromEntries(zoneGross(rowsThroughPhase(rows, 3)).map((l) => [l.zone, l.grossSqFt]));
    close(z['Walk-in']!, 322.8 + 187.4, 0.1);
  });
});

describe('farm facility — Layers C to E, the answer (§8)', () => {
  it('lands the production floor at 1,175 / 1,671 / 1,671 sq ft', () => {
    close(p1!.floor.productionFloorSqFt, 1174.9, 1.5);
    close(p2!.floor.productionFloorSqFt, 1670.6, 1.5);
    close(p3!.floor.productionFloorSqFt, 1670.6, 1.5);
    expect(p1!.floor.spineSqFt).toBe(5 * p1!.floor.spineFt);
  });

  it('sizes the support program at PSM 1,500: 2,959 net → 4,143 gross, and 4,255 with the second van', () => {
    close(p1!.support.netSqFt, 2959.2, 0.5);
    close(p1!.support.grossSqFt, 4142.9, 0.7);
    expect(p1!.support.dockLanes).toBe(2);
    expect(p2!.support.dockLanes).toBe(3);
    close(p2!.support.lines.find((l) => l.key === 'dock')!.netSqFt, 280, 0);
    close(p2!.support.grossSqFt, 4254.9, 0.7);
  });

  it('lands the building gross at 5,435 / 6,093 / 6,093 sq ft', () => {
    close(p1!.buildingGrossSqFt, 5435.3, 1.5);
    close(p2!.buildingGrossSqFt, 6092.6, 1.5);
    close(p3!.buildingGrossSqFt, 6092.6, 1.5);
  });

  it('names what Phase 1 carries idle: about 657 sq ft, 11% of the shell', () => {
    close(req.idle.grossSqFt, 657.3, 1.5);
    close(req.idle.share, 0.108, 0.005);
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

  it('puts equipment at about 40% of the production floor against the 30% rule of thumb', () => {
    close(p1!.equipmentShare, 0.402, 0.01);
  });
});

describe('farm facility — the hood', () => {
  it('draws no canopy when no unit sits under one', () => {
    expect(hoodRuns(rowsThroughPhase(rows, 3))).toEqual([]);
    expect(p1!.hoodFt).toBe(0);
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

  it('reads the four configurations at the building gross: 5,435 / 5,603 / 5,532 / 5,699 at Phase 1', () => {
    const cfg = facilityConfigurations(COMMERCIAL, PSM);
    expect(cfg.length).toBe(4);
    const gross1 = cfg.map((c) => c.requirement.phases[0]!.buildingGrossSqFt);
    close(gross1[0]!, 5435.3, 1.5);
    close(gross1[1]!, 5602.9, 1.5);
    close(gross1[2]!, 5532.3, 1.5);
    close(gross1[3]!, 5699.1, 1.5);
    close(cfg[3]!.requirement.phases[2]!.buildingGrossSqFt, 6351.3, 1.5);
  });

  it('distributes 7 days at baseline and 30 only with the 34°F room', () => {
    const cfg = facilityConfigurations(COMMERCIAL, PSM);
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
