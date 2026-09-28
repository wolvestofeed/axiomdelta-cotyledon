/**
 * Cotyledon — the floor layout engine (Roadmap Q6): geometry, measurement
 * and the conformance checks against a drawn plan.
 */

import { describe, it, expect } from 'vitest';
import { equipmentSeed } from '@/data/capex';
import { facilityRequirement, facilityRows, rowsThroughPhase } from '@/engine/facility';
import {
  emptyLayout,
  facingGap,
  findFreeSpot,
  haloRect,
  layoutFindings,
  measureLayout,
  parseLayout,
  rectDistance,
  snap,
  unitClearanceFt,
  unitRect,
  unplacedUnits,
  type FacilityLayout,
  type LayoutUnit,
} from '@/engine/facility-layout';

// The commercial list, every row selected, as a commercial forecast would carry it.
const COMMERCIAL = equipmentSeed.filter((e) => e.setting === 'commercial').map((e) => ({ ...e, status: 'planned' as const }));
const rows = rowsThroughPhase(facilityRows(COMMERCIAL), 1);
const row = (re: RegExp) => rows.find((r) => re.test(r.item))!;
const req = facilityRequirement(COMMERCIAL, { psm: 1500 });
const derived = req.phases[0]!.floor;
const unit = (key: string, x: number, y: number, n = 1, rot: 0 | 90 = 0): LayoutUnit => ({ id: `${key}#${n}`, key, unit: n, x, y, rot });
const base = (): FacilityLayout => ({ shell: { widthFt: 100, depthFt: 80 }, rooms: [], units: [] });
const sealer = row(/Tray sealer/);
const vacuum = row(/Vacuum packaging/);
const reachIn = row(/Reach-in/);
const table = row(/prep tables/);
const W = 50.39 / 12;
const D = 42.83 / 12;

describe('farm facility layout — geometry', () => {
  it('snaps to half a foot and sizes a unit from its footprint, swapping on rotation', () => {
    expect(snap(3.24)).toBe(3);
    expect(snap(3.26)).toBe(3.5);
    const r0 = unitRect(unit(sealer.key, 0, 0), sealer)!;
    const r90 = unitRect(unit(sealer.key, 0, 0, 1, 90), sealer)!;
    expect(r0.w).toBeCloseTo(W, 5);
    expect(r0.h).toBeCloseTo(D, 5);
    expect(r90.w).toBeCloseTo(D, 5);
    expect(r90.h).toBeCloseTo(W, 5);
  });

  it('gives a unit its zone aisle at the front, and a walk-in its panel clearance and apron', () => {
    expect(unitClearanceFt(sealer)).toEqual({ front: 4, rear: 0, side: 0 });
    const walkIn = row(/Walk-in cooler, 12x20/);
    expect(unitClearanceFt(walkIn)).toEqual({ front: 6, rear: 2 / 12, side: 2 / 12 });
    const h = haloRect(unit(sealer.key, 10, 10), sealer)!;
    expect(h.y).toBe(10);
    expect(h.h).toBeCloseTo(D + 4, 5);
  });

  it('measures facing gaps and edge distances', () => {
    expect(facingGap({ x: 0, y: 0, w: 4, h: 4 }, { x: 6, y: 1, w: 4, h: 4 })).toBe(2);
    expect(facingGap({ x: 0, y: 0, w: 4, h: 4 }, { x: 1, y: 7, w: 4, h: 4 })).toBe(3);
    expect(facingGap({ x: 0, y: 0, w: 4, h: 4 }, { x: 10, y: 10, w: 4, h: 4 })).toBeNull();
    expect(rectDistance({ x: 0, y: 0, w: 4, h: 4 }, { x: 7, y: 8, w: 1, h: 1 })).toBe(5);
    expect(rectDistance({ x: 0, y: 0, w: 4, h: 4 }, { x: 2, y: 2, w: 1, h: 1 })).toBe(0);
  });

  it('sizes an empty drawing to the derived gross and finds a free spot clear of every footprint', () => {
    const e = emptyLayout(6038);
    expect(e.shell.widthFt * e.shell.depthFt).toBeGreaterThanOrEqual(5900);
    const l = { ...base(), units: [unit(sealer.key, 1, 1)] };
    const at = findFreeSpot(l, rows, { w: 4, h: 4 });
    expect(at.y).toBe(1);
    expect(at.x).toBeGreaterThanOrEqual(1 + W);
  });

  it('lists every unit of a row\'s quantity until placed', () => {
    const l = base();
    const before = unplacedUnits(l, rows);
    expect(before.filter((u) => u.row.key === reachIn.key).length).toBe(2);
    expect(before.filter((u) => u.row.key === table.key).length).toBe(3);
    expect(before.some((u) => /distribution van/i.test(u.row.item))).toBe(false);
    l.units.push(unit(reachIn.key, 1, 1, 1));
    expect(unplacedUnits(l, rows).filter((u) => u.row.key === reachIn.key).map((u) => u.unit)).toEqual([2]);
  });
});

describe('farm facility layout — the conformance checks', () => {
  it('reports a unit outside the shell', () => {
    const l = { ...base(), units: [unit(sealer.key, 98, 1)] };
    expect(layoutFindings(l, rows, 1).some((f) => f.check === 'inside_shell')).toBe(true);
  });

  it('reports a footprint standing in another unit\'s working clearance, and an aisle under 36 in', () => {
    // The vacuum packer stands 2 ft in front of the sealer: inside its 4 ft aisle, and the gap is under 36 in.
    const l = { ...base(), units: [unit(sealer.key, 10, 10), unit(vacuum.key, 10, 10 + D + 2)] };
    const f = layoutFindings(l, rows, 1);
    expect(f.some((x) => x.check === 'clearance')).toBe(true);
    expect(f.some((x) => x.check === 'aisle_min' && /24 in/.test(x.text))).toBe(true);
    // Side by side, abutting, is a line and not an aisle.
    const line = { ...base(), units: [unit(sealer.key, 10, 10), unit(vacuum.key, 10 + W, 10)] };
    expect(layoutFindings(line, rows, 1).some((x) => x.check === 'aisle_min')).toBe(false);
  });

  it('holds the cart spine to 5 ft clear and keeps footprints out of it', () => {
    const l = { ...base(), rooms: [{ id: 's', kind: 'spine' as const, label: 'Spine', x: 40, y: 0, w: 4, h: 80 }], units: [unit(sealer.key, 41, 10)] };
    const f = layoutFindings(l, rows, 1).filter((x) => x.check === 'spine_width');
    expect(f.some((x) => /4\.0 ft clear/.test(x.text))).toBe(true);
    expect(f.some((x) => /stands in Spine/.test(x.text))).toBe(true);
  });

  it('holds every work position within the self-imposed 25 ft of a hand sink, and names it as convention', () => {
    const l = { ...base(), units: [unit(table.key, 10, 10)], rooms: [{ id: 'hs', kind: 'hand_sink' as const, label: 'Hand sink', x: 60, y: 60, w: 2, h: 2 }] };
    const f = layoutFindings(l, rows, 1).find((x) => x.check === 'hand_sink_travel')!;
    expect(f.item).toBe('C-05');
    expect(f.text).toMatch(/not in Texas/);
    const close = { ...l, rooms: [{ id: 'hs', kind: 'hand_sink' as const, label: 'Hand sink', x: 20, y: 10, w: 2, h: 2 }] };
    expect(layoutFindings(close, rows, 1).some((x) => x.check === 'hand_sink_travel')).toBe(false);
  });

  it('counts exits and reports the longest straight line to one as a measurement, not a limit', () => {
    const l = { ...base(), units: [unit(sealer.key, 10, 10)], rooms: [{ id: 'e1', kind: 'exit' as const, label: 'Exit', x: 0, y: 0, w: 3, h: 1 }] };
    expect(layoutFindings(l, rows, 1).find((x) => x.check === 'egress')!.severity).toBe('limit');
    const two = { ...l, rooms: [...l.rooms, { id: 'e2', kind: 'exit' as const, label: 'Exit 2', x: 97, y: 79, w: 3, h: 1 }] };
    const e = layoutFindings(two, rows, 1).find((x) => x.check === 'egress')!;
    expect(e.severity).toBe('note');
    expect(e.text).toMatch(/straight line/);
  });

  it('never counsels: no recommend, should, best or optimal in any finding', () => {
    const l = { ...base(), units: [unit(sealer.key, 98, 1), unit(vacuum.key, 10, 10), unit(reachIn.key, 40, 10, 1), unit(reachIn.key, 44, 10, 2)] };
    const text = layoutFindings(l, rows, 1).map((f) => f.text).join(' ');
    expect(text).not.toMatch(/\b(recommend|should|best|optimal|consider)\b/i);
  });
});

describe('farm facility layout — measured against derived', () => {
  it('measures drawn zone rooms, the spine and support rooms against the derived floor', () => {
    const l: FacilityLayout = {
      ...base(),
      rooms: [
        { id: 'z', kind: 'room', label: 'Prep', x: 0, y: 0, w: 20, h: 14, zone: 'Prep' },
        { id: 's', kind: 'spine', label: 'Spine', x: 40, y: 0, w: 5, h: 60 },
        { id: 'o', kind: 'room', label: 'Office', x: 60, y: 0, w: 10, h: 12, supportKey: 'office' },
      ],
    };
    const m = measureLayout(l, derived);
    expect(m.zones.find((z) => z.zone === 'Prep')!.measuredSqFt).toBe(280);
    expect(m.zones.find((z) => z.zone === 'Prep')!.derivedSqFt).toBeCloseTo(247.7, 0);
    expect(m.spineFt).toBe(60);
    expect(m.spineSqFt).toBe(300);
    expect(m.productionFloorSqFt).toBe(580);
    expect(m.support).toEqual([{ supportKey: 'office', measuredSqFt: 120 }]);
    expect(m.derived.productionFloorSqFt).toBeCloseTo(derived.productionFloorSqFt, 5);
  });

  it('reads a stored drawing defensively', () => {
    const l = parseLayout({ widthFt: 50, depthFt: 40 }, { rooms: [{ id: 'a', kind: 'nonsense', label: 3, x: 1, y: 1, w: 2, h: 2 }, { id: 'bad' }], units: [{ id: 'u', key: 'k', x: 1, y: 2, rot: 45 }, null] });
    expect(l.rooms).toEqual([{ id: 'a', kind: 'room', label: '', x: 1, y: 1, w: 2, h: 2, zone: null, supportKey: null }]);
    expect(l.units).toEqual([{ id: 'u', key: 'k', unit: 1, x: 1, y: 2, rot: 0 }]);
  });
});
