/**
 * Impact OS — the generated arrangement (Roadmap Q6): a flow-order plan from
 * the register and the derived areas that the layout checks then verify.
 */

import { describe, it, expect } from 'vitest';
import { equipmentSeed } from '@/app/(muse)/muse/_data/capex';
import { facilityRequirement, facilityRows, rowsThroughPhase } from '@/app/(muse)/muse/_engine/facility';
import { arrangeLayout } from '@/app/(muse)/muse/_engine/facility-arrange';
import { layoutFindings, measureLayout, rectContains, unitRect } from '@/app/(muse)/muse/_engine/facility-layout';

const rows = rowsThroughPhase(facilityRows(equipmentSeed), 3);
const full = facilityRequirement(equipmentSeed, { psm: 1500 }).phases[2]!;
const left = arrangeLayout({ rows, full, dockWall: 'left' });
const right = arrangeLayout({ rows, full, dockWall: 'right' });

describe('muse facility arrangement', () => {
  it('places every unit with a footprint through Phase 3', () => {
    expect(left.unplaced).toEqual([]);
    expect(right.unplaced).toEqual([]);
    const withFloor = rows.filter((r) => r.unitSqFt !== null).reduce((s, r) => s + Math.round(r.qty), 0);
    expect(left.layout.units.length).toBe(withFloor);
  });

  it('draws the whole floor: every support room, the spine, hoods, drains, two exits, and phase boundaries', () => {
    const rooms = left.layout.rooms;
    const supportKeys = new Set(rooms.filter((r) => r.kind === 'room').map((r) => r.supportKey).filter(Boolean));
    for (const k of ['office', 'lounge', 'lockers', 'toilets', 'trash', 'refrigerated-waste', 'recyclables', 'warewash', 'cart-wash', 'wares', 'dry-food', 'chemical', 'dock']) expect(supportKeys.has(k), k).toBe(true);
    expect(rooms.filter((r) => r.kind === 'spine').length).toBe(1);
    expect(rooms.filter((r) => r.kind === 'hood').length).toBeGreaterThanOrEqual(3);
    expect(rooms.filter((r) => r.kind === 'drain').length).toBeGreaterThanOrEqual(3);
    expect(rooms.filter((r) => r.kind === 'exit').length).toBe(2);
    expect(rooms.some((r) => r.kind === 'boundary' && /Phase 2/.test(r.label))).toBe(true);
    expect(rooms.some((r) => r.kind === 'boundary' && /Phase 3/.test(r.label))).toBe(true);
  });

  it('passes every layout check against a limit, with either dock wall', () => {
    for (const { layout } of [left, right]) {
      const limits = layoutFindings(layout, rows, 3).filter((f) => f.severity === 'limit');
      expect(limits.map((f) => f.text)).toEqual([]);
    }
  });

  it('keeps every later-phase unit inside a boundary and every unit inside the shell', () => {
    const shell = { x: 0, y: 0, w: left.layout.shell.widthFt, h: left.layout.shell.depthFt };
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const boundaries = left.layout.rooms.filter((r) => r.kind === 'boundary');
    for (const u of left.layout.units) {
      const row = byKey.get(u.key)!;
      const rect = unitRect(u, row)!;
      expect(rectContains(shell, rect), row.item).toBe(true);
      if (row.phase > 1) expect(boundaries.some((b) => rectContains(b, rect)), row.item).toBe(true);
    }
  });

  it('measures the drawn plan against the derived requirement and reports the gap rather than hiding it', () => {
    const m = measureLayout(left.layout, full.floor);
    expect(m.productionFloorSqFt).toBeGreaterThan(m.derived.productionFloorSqFt);
    expect(m.zones.every((z) => z.measuredSqFt >= z.derivedSqFt * 0.9)).toBe(true);
    // The shell lands within the range the build plan names: the derived gross at the tight end, a designer's plan wider.
    const shellSqFt = left.layout.shell.widthFt * left.layout.shell.depthFt;
    expect(shellSqFt).toBeGreaterThan(full.buildingGrossSqFt);
    expect(shellSqFt).toBeLessThan(full.buildingGrossSqFt * 1.8);
  });

  it('mirrors cleanly for a dock on the right wall', () => {
    const W = right.layout.shell.widthFt;
    expect(W).toBe(left.layout.shell.widthFt);
    const dockLeft = left.layout.rooms.find((r) => r.label === 'Receiving dock')!;
    const dockRight = right.layout.rooms.find((r) => r.label === 'Receiving dock')!;
    expect(dockRight.x).toBeCloseTo(W - dockLeft.x - dockLeft.w, 5);
  });
});
