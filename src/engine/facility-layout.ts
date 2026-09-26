/**
 * MicroFarm — the floor layout (Roadmap Q6). Pure geometry.
 *
 * A layout is the shell, the rooms drawn in it and where each unit of the
 * equipment library stands, all in feet from the shell's top-left corner, y
 * down. The engine places nothing on its own; it measures what is drawn and
 * runs the conformance checks the register names against it, each finding
 * stating the measured figure beside the cited one and never what to do about
 * it. Once a plan is drawn, the spine and the zone gross are MEASURED off it
 * rather than derived from factors, and the gap between the two is reported.
 */

import { LAYOUT_LIMITS, type LayoutCheckKind } from '@/data/facility-conformance';
import { SPINE_WIDTH_FT, WALK_IN_APRON_FT, WALK_IN_PANEL_CLEARANCE_IN, zoneFactorOf, type FacilityZone } from '@/data/facility-design';
import type { BuildPhase, FacilityRow, ProductionFloor } from '@/engine/facility';

export type RoomKind = 'room' | 'spine' | 'hood' | 'exit' | 'drain' | 'hand_sink' | 'boundary';

export const ROOM_KIND_LABELS: Record<RoomKind, string> = {
  room: 'Room',
  spine: 'Cart spine',
  hood: 'Hood canopy',
  exit: 'Exit',
  drain: 'Floor drain',
  hand_sink: 'Hand sink',
  boundary: 'Boundary',
};

export interface LayoutRoom {
  id: string;
  kind: RoomKind;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The zone a room belongs to, so its area measures against that zone's derived gross. */
  zone?: FacilityZone | null;
  /** The support-program line a room answers, so its area measures against the allowance. */
  supportKey?: string | null;
}

export interface LayoutUnit {
  id: string;
  /** The equipment library key. */
  key: string;
  /** Which unit of the row's quantity: 1..qty. */
  unit: number;
  x: number;
  y: number;
  rot: 0 | 90;
}

export interface FacilityLayout {
  shell: { widthFt: number; depthFt: number };
  rooms: LayoutRoom[];
  units: LayoutUnit[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SNAP_FT = 0.5;
export const snap = (v: number): number => Math.round(v / SNAP_FT) * SNAP_FT;

/** A sensible empty drawing: a 4:3 shell whose area is the derived building gross for the phase. */
export function emptyLayout(buildingGrossSqFt: number): FacilityLayout {
  const w = Math.max(40, Math.round(Math.sqrt((buildingGrossSqFt * 4) / 3)));
  const d = Math.max(30, Math.round(buildingGrossSqFt / w));
  return { shell: { widthFt: w, depthFt: d }, rooms: [], units: [] };
}

/** Something a layout carries that the row shape does not: null on a row without a footprint. */
export function unitSizeFt(row: FacilityRow, rot: 0 | 90): { w: number; h: number } | null {
  if (row.widthIn === null || row.depthIn === null) return null;
  const w = row.widthIn / 12;
  const d = row.depthIn / 12;
  return rot === 90 ? { w: d, h: w } : { w, h: d };
}

export function unitRect(u: LayoutUnit, row: FacilityRow): Rect | null {
  const s = unitSizeFt(row, u.rot);
  return s ? { x: u.x, y: u.y, w: s.w, h: s.h } : null;
}

/**
 * The working clearance a unit needs around its footprint, feet: the front is
 * the zone's aisle (or the published front clearance), the sides and rear are
 * the published clearances, a walk-in carries its panel clearance and its
 * apron. "Front" is the +y face at rotation 0 and the +x face at 90.
 */
export function unitClearanceFt(row: FacilityRow): { front: number; rear: number; side: number } {
  if (row.zone === 'Walk-in') {
    const p = WALK_IN_PANEL_CLEARANCE_IN / 12;
    return { front: WALK_IN_APRON_FT, rear: p, side: p };
  }
  if (row.clearance) return { front: row.clearance.frontIn / 12, rear: row.clearance.rearIn / 12, side: row.clearance.sideIn / 12 };
  const zf = row.zone ? zoneFactorOf(row.zone) : null;
  return { front: (zf?.aisleIn ?? 0) / 12, rear: 0, side: 0 };
}

export function haloRect(u: LayoutUnit, row: FacilityRow): Rect | null {
  const r = unitRect(u, row);
  if (!r) return null;
  const c = unitClearanceFt(row);
  return u.rot === 90
    ? { x: r.x - c.rear, y: r.y - c.side, w: r.w + c.rear + c.front, h: r.h + 2 * c.side }
    : { x: r.x - c.side, y: r.y - c.rear, w: r.w + 2 * c.side, h: r.h + c.rear + c.front };
}

const EPS = 1e-6;
/** Two rectangles share area; touching edges do not count, nor does a hair of floating-point error. */
export const rectsOverlap = (a: Rect, b: Rect): boolean => a.x + EPS < b.x + b.w && b.x + EPS < a.x + a.w && a.y + EPS < b.y + b.h && b.y + EPS < a.y + a.h;
export const rectContains = (outer: Rect, inner: Rect, tol = 1e-6): boolean => inner.x >= outer.x - tol && inner.y >= outer.y - tol && inner.x + inner.w <= outer.x + outer.w + tol && inner.y + inner.h <= outer.y + outer.h + tol;
const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Edge-to-edge distance between two rectangles; 0 when they touch or overlap. */
export function rectDistance(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

/** The gap between two rectangles that face each other along one axis and overlap along the other; null when they do not face. */
export function facingGap(a: Rect, b: Rect): number | null {
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  if (overlapY > 0.25) {
    const gap = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
    if (gap >= 0) return gap;
  }
  if (overlapX > 0.25) {
    const gap = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
    if (gap >= 0) return gap;
  }
  return null;
}

/** The rectangle between two facing rectangles: the gap along one axis, their overlap along the other. */
export function gapRect(a: Rect, b: Rect): Rect | null {
  const overlapY0 = Math.max(a.y, b.y);
  const overlapY1 = Math.min(a.y + a.h, b.y + b.h);
  if (overlapY1 - overlapY0 > 0.25) {
    const x0 = Math.min(a.x + a.w, b.x + b.w);
    const x1 = Math.max(a.x, b.x);
    if (x1 >= x0) return { x: x0, y: overlapY0, w: x1 - x0, h: overlapY1 - overlapY0 };
  }
  const overlapX0 = Math.max(a.x, b.x);
  const overlapX1 = Math.min(a.x + a.w, b.x + b.w);
  if (overlapX1 - overlapX0 > 0.25) {
    const y0 = Math.min(a.y + a.h, b.y + b.h);
    const y1 = Math.max(a.y, b.y);
    if (y1 >= y0) return { x: overlapX0, y: y0, w: overlapX1 - overlapX0, h: y1 - y0 };
  }
  return null;
}

// ── Placement helpers ───────────────────────────────────────────────────────

export interface PlacedUnit {
  unit: LayoutUnit;
  row: FacilityRow;
  rect: Rect;
  halo: Rect;
}

export function placedUnits(layout: FacilityLayout, rows: readonly FacilityRow[]): PlacedUnit[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: PlacedUnit[] = [];
  for (const u of layout.units) {
    const row = byKey.get(u.key);
    if (!row) continue;
    const rect = unitRect(u, row);
    const halo = haloRect(u, row);
    if (rect && halo) out.push({ unit: u, row, rect, halo });
  }
  return out;
}

/** The units on the phase's list with a footprint that the drawing does not yet place. */
export function unplacedUnits(layout: FacilityLayout, rows: readonly FacilityRow[]): { row: FacilityRow; unit: number }[] {
  const placed = new Set(layout.units.map((u) => `${u.key}#${u.unit}`));
  const out: { row: FacilityRow; unit: number }[] = [];
  for (const row of rows) {
    if (row.unitSqFt === null || row.qty <= 0) continue;
    for (let n = 1; n <= Math.round(row.qty); n += 1) if (!placed.has(`${row.key}#${n}`)) out.push({ row, unit: n });
  }
  return out;
}

/** The first spot, scanning left to right and top to bottom on the snap grid, where a unit of this size sits clear of every other footprint. */
export function findFreeSpot(layout: FacilityLayout, rows: readonly FacilityRow[], size: { w: number; h: number }): { x: number; y: number } {
  const taken = placedUnits(layout, rows).map((p) => p.rect);
  const step = 1;
  for (let y = 1; y + size.h <= layout.shell.depthFt - 1; y += step) {
    for (let x = 1; x + size.w <= layout.shell.widthFt - 1; x += step) {
      const r = { x, y, w: size.w, h: size.h };
      if (!taken.some((t) => rectsOverlap(t, r))) return { x, y };
    }
  }
  return { x: 1, y: 1 };
}

// ── Measured against derived ────────────────────────────────────────────────

export interface MeasuredZone {
  zone: FacilityZone;
  measuredSqFt: number;
  derivedSqFt: number;
}

export interface Measurement {
  shellSqFt: number;
  /** Rooms with a zone: the drawn zone gross. */
  zonesSqFt: number;
  zones: MeasuredZone[];
  spineFt: number;
  spineSqFt: number;
  /** Zone rooms + spine: the drawn production floor. */
  productionFloorSqFt: number;
  /** Rooms answering a support-program line. */
  supportSqFt: number;
  support: { supportKey: string; measuredSqFt: number }[];
  derived: { zoneGrossSqFt: number; spineFt: number; spineSqFt: number; productionFloorSqFt: number };
}

export function measureLayout(layout: FacilityLayout, derived: ProductionFloor): Measurement {
  const zoneRooms = layout.rooms.filter((r) => r.kind === 'room' && r.zone);
  const zones = derived.zones
    .filter((z) => !z.excludedFromFloor)
    .map((z) => ({ zone: z.zone, derivedSqFt: z.grossSqFt, measuredSqFt: zoneRooms.filter((r) => r.zone === z.zone).reduce((s, r) => s + r.w * r.h, 0) }));
  const zonesSqFt = zoneRooms.reduce((s, r) => s + r.w * r.h, 0);
  const spines = layout.rooms.filter((r) => r.kind === 'spine');
  const spineFt = spines.reduce((s, r) => s + Math.max(r.w, r.h), 0);
  const spineSqFt = spines.reduce((s, r) => s + r.w * r.h, 0);
  const supportRooms = layout.rooms.filter((r) => r.kind === 'room' && r.supportKey);
  const support = [...new Set(supportRooms.map((r) => r.supportKey!))].map((k) => ({ supportKey: k, measuredSqFt: supportRooms.filter((r) => r.supportKey === k).reduce((s, r) => s + r.w * r.h, 0) }));
  return {
    shellSqFt: layout.shell.widthFt * layout.shell.depthFt,
    zonesSqFt,
    zones,
    spineFt,
    spineSqFt,
    productionFloorSqFt: zonesSqFt + spineSqFt,
    supportSqFt: supportRooms.reduce((s, r) => s + r.w * r.h, 0),
    support,
    derived: { zoneGrossSqFt: derived.zoneGrossSqFt, spineFt: derived.spineFt, spineSqFt: derived.spineSqFt, productionFloorSqFt: derived.productionFloorSqFt },
  };
}

// ── The conformance checks ──────────────────────────────────────────────────

export interface LayoutFinding {
  check: LayoutCheckKind;
  /** The register item the check answers. */
  item: string;
  /** The unit or room the finding is on. */
  subject: string;
  subjectIds: string[];
  /** The measured figure against the cited one. Never what to do about it. */
  text: string;
  /** 'limit' — a cited figure is not met; 'note' — a measurement reported without a limit. */
  severity: 'limit' | 'note';
}

const isBlackoutRack = (r: FacilityRow) => /blackout rack/i.test(r.item);
const isDishMachine = (r: FacilityRow) => /dishwasher/i.test(r.item);
const isHandSink = (r: FacilityRow) => /hand sink/i.test(r.item);
const ft = (v: number) => `${v.toFixed(1)} ft`;
const inch = (v: number) => `${Math.round(v * 12)} in`;

/** Run every check the register names against the drawing. */
export function layoutFindings(layout: FacilityLayout, rows: readonly FacilityRow[], phase: BuildPhase): LayoutFinding[] {
  const out: LayoutFinding[] = [];
  const shell: Rect = { x: 0, y: 0, w: layout.shell.widthFt, h: layout.shell.depthFt };
  const placed = placedUnits(layout, rows);
  const label = (p: PlacedUnit) => (p.row.qty > 1 ? `${p.row.item} (${p.unit.unit})` : p.row.item);

  // inside_shell — every footprint inside the shell.
  for (const p of placed) {
    if (!rectContains(shell, p.rect)) out.push({ check: 'inside_shell', item: '—', subject: label(p), subjectIds: [p.unit.id], text: `${label(p)} extends past the shell (${ft(layout.shell.widthFt)} × ${ft(layout.shell.depthFt)}).`, severity: 'limit' });
  }

  // clearance — a footprint standing inside another unit's working clearance.
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = 0; j < placed.length; j += 1) {
      if (i === j) continue;
      const a = placed[i]!;
      const b = placed[j]!;
      if (rectsOverlap(a.rect, b.rect)) {
        if (i < j) out.push({ check: 'clearance', item: 'S-07', subject: label(a), subjectIds: [a.unit.id, b.unit.id], text: `${label(a)} and ${label(b)} overlap.`, severity: 'limit' });
        continue;
      }
      if (rectsOverlap(b.rect, a.halo)) {
        const c = unitClearanceFt(a.row);
        out.push({ check: 'clearance', item: a.row.zone === 'Walk-in' ? 'S-11' : a.row.clearance ? 'S-13' : 'S-07', subject: label(a), subjectIds: [a.unit.id, b.unit.id], text: `${label(b)} stands in the working clearance of ${label(a)} (${inch(c.front)} in front${c.side ? `, ${inch(c.side)} at the sides` : ''}${c.rear ? `, ${inch(c.rear)} at the rear` : ''}).`, severity: 'limit' });
      }
    }
  }

  // aisle_min — two footprints facing each other across a gap under 36 in with nothing standing between
  // them. A gap of 6 in or less is a service gap between abutting units, not an aisle.
  const minAisle = LAYOUT_LIMITS.aisleMinIn / 12;
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = placed[i]!;
      const b = placed[j]!;
      const gap = facingGap(a.rect, b.rect);
      if (gap === null || gap <= 0.5 || gap >= minAisle) continue;
      const between = gapRect(a.rect, b.rect);
      if (between && placed.some((p) => p !== a && p !== b && rectsOverlap(p.rect, between))) continue;
      out.push({ check: 'aisle_min', item: 'C-33', subject: label(a), subjectIds: [a.unit.id, b.unit.id], text: `${inch(gap)} between ${label(a)} and ${label(b)}; the accessible route is ${LAYOUT_LIMITS.aisleMinIn} in (ADA §403.5.1; IBC §1018.2.2).`, severity: 'limit' });
    }
  }

  // spine_width — every cart spine at least 5 ft clear, and nothing standing in it.
  for (const s of layout.rooms.filter((r) => r.kind === 'spine')) {
    const width = Math.min(s.w, s.h);
    if (width < LAYOUT_LIMITS.spineMinFt) out.push({ check: 'spine_width', item: 'S-09', subject: s.label, subjectIds: [s.id], text: `${s.label} is ${ft(width)} clear; the cart spine is carried at ${SPINE_WIDTH_FT} ft.`, severity: 'limit' });
    for (const p of placed) if (rectsOverlap(p.rect, s)) out.push({ check: 'spine_width', item: 'S-09', subject: s.label, subjectIds: [s.id, p.unit.id], text: `${label(p)} stands in ${s.label}.`, severity: 'limit' });
  }

  // hood_overhang — every unit under a hood covered by a canopy that overhangs it 6 in on the sides not against the shell.
  const hoods = layout.rooms.filter((r) => r.kind === 'hood');
  const over = LAYOUT_LIMITS.hoodOverhangIn / 12;
  for (const p of placed.filter((x) => x.row.underHood)) {
    const need: Rect = { x: p.rect.x - over, y: p.rect.y - over, w: p.rect.w + 2 * over, h: p.rect.h + 2 * over };
    // A face on the shell wall is not an open side.
    if (p.rect.x <= 1e-6) { need.x = p.rect.x; need.w -= over; }
    if (p.rect.y <= 1e-6) { need.y = p.rect.y; need.h -= over; }
    if (Math.abs(p.rect.x + p.rect.w - shell.w) <= 1e-6) need.w -= over;
    if (Math.abs(p.rect.y + p.rect.h - shell.h) <= 1e-6) need.h -= over;
    const covered = hoods.some((h) => rectContains(h, need));
    if (!covered) out.push({ check: 'hood_overhang', item: 'C-15', subject: label(p), subjectIds: [p.unit.id], text: hoods.length ? `${label(p)} is not covered by a canopy overhanging it ${LAYOUT_LIMITS.hoodOverhangIn} in on every open side (IMC §507.4.1).` : `${label(p)} sits under a hood and no canopy is drawn.`, severity: 'limit' });
  }

  // dish_machine_drain — the dish machine within 5 ft of a trapped floor drain.
  const drains = layout.rooms.filter((r) => r.kind === 'drain');
  for (const p of placed.filter((x) => isDishMachine(x.row))) {
    const d = drains.length ? Math.min(...drains.map((dr) => rectDistance(p.rect, dr))) : null;
    if (d === null) out.push({ check: 'dish_machine_drain', item: 'C-23', subject: label(p), subjectIds: [p.unit.id], text: `No floor drain is drawn; the warewashing machine discharges within ${LAYOUT_LIMITS.dishMachineDrainMaxFt} ft of a trapped floor drain (Food Code 5-402.11).`, severity: 'limit' });
    else if (d > LAYOUT_LIMITS.dishMachineDrainMaxFt) out.push({ check: 'dish_machine_drain', item: 'C-23', subject: label(p), subjectIds: [p.unit.id], text: `${label(p)} is ${ft(d)} from the nearest floor drain; Food Code 5-402.11 allows ${LAYOUT_LIMITS.dishMachineDrainMaxFt} ft.`, severity: 'limit' });
  }

  // hand_sink_travel — every work position within 25 ft of a hand sink (self-imposed, C-05).
  const sinks: Rect[] = [...layout.rooms.filter((r) => r.kind === 'hand_sink'), ...placed.filter((x) => isHandSink(x.row)).map((x) => x.rect)];
  const workZones = new Set<FacilityZone>(['Prep', 'Packaging', 'Hot line', 'Grow', 'A la carte', 'Warewash']);
  for (const p of placed.filter((x) => x.row.zone && workZones.has(x.row.zone) && !isHandSink(x.row))) {
    const d = sinks.length ? Math.min(...sinks.map((s) => rectDistance(p.rect, s))) : null;
    if (d === null) out.push({ check: 'hand_sink_travel', item: 'C-04', subject: label(p), subjectIds: [p.unit.id], text: 'No hand sink is drawn; Food Code 5-204.11 places sinks for convenient use in every prep, dispensing and warewashing area.', severity: 'limit' });
    else if (d > LAYOUT_LIMITS.handSinkTravelMaxFt) out.push({ check: 'hand_sink_travel', item: 'C-05', subject: label(p), subjectIds: [p.unit.id], text: `${label(p)} is ${ft(d)} from the nearest hand sink; the self-imposed standard is ${LAYOUT_LIMITS.handSinkTravelMaxFt} ft (code in WA, NYC and NV, not in Texas).`, severity: 'limit' });
  }

  // two_streams — both blackout racks placed, each reachable from the hot line without the streams crossing.
  const blackoutRacks = placed.filter((x) => isBlackoutRack(x.row));
  const hot = placed.filter((x) => x.row.zone === 'Hot line');
  if (blackoutRacks.length >= 2 && hot.length > 0) {
    const hc = { x: hot.reduce((s, h) => s + center(h.rect).x, 0) / hot.length, y: hot.reduce((s, h) => s + center(h.rect).y, 0) / hot.length };
    const [a, b] = blackoutRacks;
    const va = { x: center(a!.rect).x - hc.x, y: center(a!.rect).y - hc.y };
    const vb = { x: center(b!.rect).x - hc.x, y: center(b!.rect).y - hc.y };
    const la = Math.hypot(va.x, va.y);
    const lb = Math.hypot(vb.x, vb.y);
    const cos = la && lb ? (va.x * vb.x + va.y * vb.y) / (la * lb) : 1;
    const gap = rectDistance(a!.rect, b!.rect);
    if (cos > 0.966 && gap < 3) out.push({ check: 'two_streams', item: 'C-02', subject: a!.row.item, subjectIds: [a!.unit.id, b!.unit.id], text: `Both blackout racks stack at one end of a single aisle from the hot line (${ft(la)} and ${ft(lb)} away on the same bearing, ${inch(gap)} apart); the two sow→blackout streams would cross to reach them.`, severity: 'limit' });
    else out.push({ check: 'two_streams', item: 'C-02', subject: a!.row.item, subjectIds: [a!.unit.id, b!.unit.id], text: `The racks are ${ft(la)} and ${ft(lb)} from the hot line on separate bearings.`, severity: 'note' });
  } else if (phase >= 1 && rows.some((r) => isBlackoutRack(r) && r.counted) && blackoutRacks.length < 2) {
    out.push({ check: 'two_streams', item: 'C-02', subject: 'Blackout racks', subjectIds: [], text: `${blackoutRacks.length} of 2 blackout racks placed; the two-stream check runs when both stand on the plan.`, severity: 'note' });
  }

  // egress — two exits, and the longest straight line from any unit to its nearest exit.
  const exits = layout.rooms.filter((r) => r.kind === 'exit');
  if (exits.length < LAYOUT_LIMITS.exitsMin) out.push({ check: 'egress', item: 'C-34', subject: 'Exits', subjectIds: exits.map((e) => e.id), text: `${exits.length} exit${exits.length === 1 ? '' : 's'} drawn; IBC requires ${LAYOUT_LIMITS.exitsMin} where the occupant load or travel distance calls for them.`, severity: 'limit' });
  else if (placed.length) {
    const worst = placed.map((p) => ({ p, d: Math.min(...exits.map((e) => rectDistance(p.rect, e))) })).reduce((m, x) => (x.d > m.d ? x : m));
    out.push({ check: 'egress', item: 'C-34', subject: label(worst.p), subjectIds: [worst.p.unit.id], text: `Longest straight line to an exit: ${ft(worst.d)} from ${label(worst.p)}. Travel distance is measured along the path, not the straight line; the adopted IBC edition sets the limit.`, severity: 'note' });
  }

  return out;
}

// ── Validation of a stored drawing ──────────────────────────────────────────

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A stored layout is data from the database; read it defensively. */
export function parseLayout(shell: { widthFt: number; depthFt: number }, raw: unknown): FacilityLayout {
  const o = (raw ?? {}) as { rooms?: unknown; units?: unknown };
  const rooms: LayoutRoom[] = Array.isArray(o.rooms)
    ? o.rooms
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .filter((r) => typeof r['id'] === 'string' && isNum(r['x']) && isNum(r['y']) && isNum(r['w']) && isNum(r['h']))
        .map((r) => ({
          id: r['id'] as string,
          kind: (['room', 'spine', 'hood', 'exit', 'drain', 'hand_sink', 'boundary'] as const).includes(r['kind'] as RoomKind) ? (r['kind'] as RoomKind) : 'room',
          label: typeof r['label'] === 'string' ? r['label'] : '',
          x: r['x'] as number,
          y: r['y'] as number,
          w: r['w'] as number,
          h: r['h'] as number,
          zone: typeof r['zone'] === 'string' ? (r['zone'] as FacilityZone) : null,
          supportKey: typeof r['supportKey'] === 'string' ? r['supportKey'] : null,
        }))
    : [];
  const units: LayoutUnit[] = Array.isArray(o.units)
    ? o.units
        .filter((u): u is Record<string, unknown> => !!u && typeof u === 'object')
        .filter((u) => typeof u['id'] === 'string' && typeof u['key'] === 'string' && isNum(u['x']) && isNum(u['y']))
        .map((u) => ({ id: u['id'] as string, key: u['key'] as string, unit: isNum(u['unit']) ? (u['unit'] as number) : 1, x: u['x'] as number, y: u['y'] as number, rot: u['rot'] === 90 ? 90 : 0 }))
    : [];
  return { shell, rooms, units };
}
