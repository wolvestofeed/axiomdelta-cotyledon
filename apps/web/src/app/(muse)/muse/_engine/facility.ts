/**
 * Impact OS — the space engine (Roadmap Phase Q, facility-design-roadmap.md §3–§8). Pure.
 *
 * Five layers, each a stated operation on the one above, so any figure traces
 * to a spec sheet or a cited standard:
 *
 *   A  equipment envelope   unit footprint × quantity, summed
 *   B  zone gross           A made workable: the aisle each zone needs, by a
 *                           circulation factor derived from equipment depth and
 *                           aisle width — except where a manufacturer publishes
 *                           clearances (used directly) and the walk-ins (nominal
 *                           box + panel clearance + a loading apron)
 *   C  production floor     B plus the 5 ft cart spine through the plant
 *   D  support program      the rooms no equipment row describes, DoD 510 at
 *                           Peak Single Meals, × 1.40 net-to-gross
 *   E  building gross       C × 1.10 for walls, columns and partitions, + D
 *
 * Phases are cumulative because the shell is leased once. The warewash zone
 * is grossed here but counted in the support program as the warewash room, so
 * its equipment is counted exactly once. The potential rooms on the Design and
 * Build plan enter only as `extraRooms`, never as equipment.
 */

import type { EquipmentLine } from '../_data/capex';
import {
  DESIGN_ROOMS,
  DOCK_ALLOWANCE,
  FACILITY_ZONES,
  HOOD_OVERHANG_IN,
  SPINE_LENGTH_FACTOR,
  SPINE_WIDTH_FT,
  STRUCTURAL_GROSS_UP,
  SUPPORT_ALLOWANCES,
  SUPPORT_NET_TO_GROSS,
  WALK_IN_APRON_FT,
  WALK_IN_PANEL_CLEARANCE_IN,
  WAREWASH_ROOM_FACTOR,
  isDeliveryVan,
  zoneFactorOf,
  type DesignRoom,
  type FacilityZone,
  type FootprintBasis,
  type SupportAllowance,
} from '../_data/facility-design';
import type { StatusTag } from '../_data/tagged';

export type BuildPhase = 1 | 2 | 3;
export const BUILD_PHASES: readonly BuildPhase[] = [1, 2, 3];

/** How a unit's gross is reached. */
export type GrossMethod = 'zone_factor' | 'published_clearance' | 'walk_in' | 'none';

export interface FacilityRow {
  key: string;
  item: string;
  phase: BuildPhase;
  status: EquipmentLine['status'];
  qty: number;
  category: string;
  critical: boolean;
  zone: FacilityZone | null;
  widthIn: number | null;
  depthIn: number | null;
  clearance: { frontIn: number; rearIn: number; sideIn: number } | null;
  basis: FootprintBasis;
  underHood: boolean;
  source: string | null;
  manufacturer: string | null;
  model: string | null;
  specSheetUrl: string | null;
  /** One unit's plan area, sq ft; null where the row carries no floor. */
  unitSqFt: number | null;
  /** Plan area × quantity. */
  lineSqFt: number;
  method: GrossMethod;
  /** One unit made workable: by zone factor, by its published clearances, or as a walk-in box with its apron. */
  unitGrossSqFt: number | null;
  lineGrossSqFt: number;
  /** In service or planned with a quantity: what the requirement counts. */
  counted: boolean;
}

const sqFt = (wIn: number, dIn: number) => (wIn * dIn) / 144;

/** Nominal box + panel clearance on every side + a loading apron the width of the door wall. */
export function walkInGrossSqFt(widthIn: number, depthIn: number): number {
  const p = WALK_IN_PANEL_CLEARANCE_IN;
  return sqFt(widthIn + 2 * p, depthIn + 2 * p) + WALK_IN_APRON_FT * (widthIn / 12);
}

/** A unit's envelope with its manufacturer's published clearances on every side. */
export function publishedClearanceGrossSqFt(widthIn: number, depthIn: number, c: { frontIn: number; rearIn: number; sideIn: number }): number {
  return sqFt(widthIn + 2 * c.sideIn, depthIn + c.frontIn + c.rearIn);
}

const isPhase = (p: number): p is BuildPhase => p === 1 || p === 2 || p === 3;

/** Every library row with its footprint resolved. Nothing is filtered here; `throughPhase` does that. */
export function facilityRows(lines: readonly EquipmentLine[]): FacilityRow[] {
  return lines.map((l) => {
    const widthIn = l.footprintWidthIn ?? null;
    const depthIn = l.footprintDepthIn ?? null;
    const hasFloor = widthIn !== null && depthIn !== null && widthIn > 0 && depthIn > 0;
    const zone = l.zone ?? null;
    const published = l.clearanceFrontIn != null || l.clearanceRearIn != null || l.clearanceSideIn != null;
    const clearance = published ? { frontIn: l.clearanceFrontIn ?? 0, rearIn: l.clearanceRearIn ?? 0, sideIn: l.clearanceSideIn ?? 0 } : null;
    const unitSqFt = hasFloor ? sqFt(widthIn, depthIn) : null;
    let method: GrossMethod = 'none';
    let unitGrossSqFt: number | null = null;
    if (hasFloor && zone === 'Walk-in') {
      method = 'walk_in';
      unitGrossSqFt = walkInGrossSqFt(widthIn, depthIn);
    } else if (hasFloor && clearance) {
      method = 'published_clearance';
      unitGrossSqFt = publishedClearanceGrossSqFt(widthIn, depthIn, clearance);
    } else if (hasFloor && zone) {
      method = 'zone_factor';
      unitGrossSqFt = unitSqFt! * zoneFactorOf(zone).factor;
    }
    const counted = (l.status === 'in_service' || l.status === 'planned') && l.qty > 0;
    return {
      key: l.key,
      item: l.item,
      phase: isPhase(l.phase) ? l.phase : 1,
      status: l.status,
      qty: l.qty,
      category: l.category,
      critical: l.critical,
      zone,
      widthIn,
      depthIn,
      clearance,
      basis: l.footprintBasis ?? 'estimated',
      underHood: l.underHood ?? false,
      source: l.footprintSource ?? null,
      manufacturer: l.manufacturer ?? null,
      model: l.model ?? null,
      specSheetUrl: l.specSheetUrl ?? null,
      unitSqFt,
      lineSqFt: unitSqFt === null ? 0 : unitSqFt * l.qty,
      method,
      unitGrossSqFt,
      lineGrossSqFt: unitGrossSqFt === null ? 0 : unitGrossSqFt * l.qty,
      counted,
    };
  });
}

/** The counted rows on or before a build phase: cumulative, because the shell is leased once. */
export function rowsThroughPhase(rows: readonly FacilityRow[], phase: BuildPhase): FacilityRow[] {
  return rows.filter((r) => r.counted && r.phase <= phase);
}

// ── Layer A ─────────────────────────────────────────────────────────────────

/** Layer A on the production floor: every unit's plan area but the warewash zone's, which the support program carries as the warewash room. */
export const equipmentEnvelope = (rows: readonly FacilityRow[]): number => rows.filter((r) => r.zone !== 'Warewash').reduce((s, r) => s + r.lineSqFt, 0);
/** Every unit's plan area, warewash included. */
export const equipmentEnvelopeAll = (rows: readonly FacilityRow[]): number => rows.reduce((s, r) => s + r.lineSqFt, 0);

// ── Layer B ─────────────────────────────────────────────────────────────────

export interface ZoneGrossLine {
  zone: FacilityZone;
  /** Layer A within the zone. */
  envelopeSqFt: number;
  factor: number | null;
  /** Units grossed by the zone factor. */
  factoredSqFt: number;
  /** Units grossed by their own published clearances or as walk-in boxes, listed by item. */
  direct: { key: string; item: string; qty: number; unitGrossSqFt: number; lineGrossSqFt: number; method: GrossMethod }[];
  grossSqFt: number;
  /** Warewash: grossed here, counted in the support program, never on the production floor. */
  excludedFromFloor: boolean;
}

export function zoneGross(rows: readonly FacilityRow[]): ZoneGrossLine[] {
  return FACILITY_ZONES.map((zone) => {
    const inZone = rows.filter((r) => r.zone === zone && r.unitSqFt !== null);
    const factored = inZone.filter((r) => r.method === 'zone_factor');
    const direct = inZone.filter((r) => r.method !== 'zone_factor' && r.method !== 'none');
    const zf = zoneFactorOf(zone);
    const factoredSqFt = factored.reduce((s, r) => s + r.lineGrossSqFt, 0);
    const directLines = direct.map((r) => ({ key: r.key, item: r.item, qty: r.qty, unitGrossSqFt: r.unitGrossSqFt!, lineGrossSqFt: r.lineGrossSqFt, method: r.method }));
    return {
      zone,
      envelopeSqFt: inZone.reduce((s, r) => s + r.lineSqFt, 0),
      factor: zone === 'Walk-in' ? null : zf.factor,
      factoredSqFt,
      direct: directLines,
      grossSqFt: factoredSqFt + directLines.reduce((s, d) => s + d.lineGrossSqFt, 0),
      excludedFromFloor: zone === 'Warewash',
    };
  }).filter((z) => z.envelopeSqFt > 0);
}

// ── Potential rooms (the Design and Build plan) ─────────────────────────────

/** What a documented room would add to the zone gross. A room is never an equipment row. */
export function designRoomZoneSqFt(room: DesignRoom): number {
  const g = room.geometry;
  return g.kind === 'walk_in' ? walkInGrossSqFt(g.widthFt * 12, g.depthFt * 12) : g.sqFt;
}

// ── Layer C ─────────────────────────────────────────────────────────────────

export interface ProductionFloor {
  zones: ZoneGrossLine[];
  /** Zone gross on the floor: every zone but warewash, plus the extra rooms. */
  zoneGrossSqFt: number;
  extraRoomsSqFt: number;
  warewashZoneGrossSqFt: number;
  spineFt: number;
  spineSqFt: number;
  productionFloorSqFt: number;
}

export function productionFloor(rows: readonly FacilityRow[], extraRooms: readonly DesignRoom[] = []): ProductionFloor {
  const zones = zoneGross(rows);
  const extraRoomsSqFt = extraRooms.reduce((s, r) => s + designRoomZoneSqFt(r), 0);
  const onFloor = zones.filter((z) => !z.excludedFromFloor).reduce((s, z) => s + z.grossSqFt, 0) + extraRoomsSqFt;
  const warewashZoneGrossSqFt = zones.find((z) => z.zone === 'Warewash')?.grossSqFt ?? 0;
  // One run the length of the plant and a cross leg: 1.7 × the side of a square block of the zone gross.
  const spineFt = onFloor > 0 ? SPINE_LENGTH_FACTOR * Math.sqrt(onFloor) : 0;
  const spineSqFt = SPINE_WIDTH_FT * spineFt;
  return { zones, zoneGrossSqFt: onFloor, extraRoomsSqFt, warewashZoneGrossSqFt, spineFt, spineSqFt, productionFloorSqFt: onFloor + spineSqFt };
}

// ── Layer D ─────────────────────────────────────────────────────────────────

export interface SupportLine {
  key: string;
  space: string;
  netSqFt: number;
  kind: SupportAllowance['kind'];
  status: StatusTag;
  basis: string;
}

export interface SupportProgram {
  psm: number;
  dockLanes: number;
  lines: SupportLine[];
  netSqFt: number;
  grossSqFt: number;
}

/** DoD 510 formula: base + perStep per `step` PSM over `over`, capped where a cap is published. */
export function psmAllowance(psm: number, f: NonNullable<SupportAllowance['psm']>): number {
  const over = Math.max(0, psm - f.over);
  const v = f.base + f.perStep * (over / f.step);
  return f.cap === undefined ? v : Math.min(f.cap, v);
}

export function supportProgram(input: { psm: number; vans: number; warewashZoneGrossSqFt: number }): SupportProgram {
  const dockLanes = DOCK_ALLOWANCE.receivingLanes + input.vans;
  const lines = SUPPORT_ALLOWANCES.map((a): SupportLine => {
    let netSqFt = 0;
    if (a.kind === 'fixed') netSqFt = a.fixedSqFt ?? 0;
    else if (a.kind === 'psm' && a.psm) netSqFt = psmAllowance(input.psm, a.psm);
    else if (a.derived === 'warewash_room') netSqFt = input.warewashZoneGrossSqFt * WAREWASH_ROOM_FACTOR;
    else if (a.derived === 'loading_dock') netSqFt = DOCK_ALLOWANCE.baseSqFt + DOCK_ALLOWANCE.perExtraLaneSqFt * Math.max(0, dockLanes - DOCK_ALLOWANCE.baseLanes);
    return { key: a.key, space: a.space, netSqFt, kind: a.kind, status: a.status, basis: a.basis };
  });
  const netSqFt = lines.reduce((s, l) => s + l.netSqFt, 0);
  return { psm: input.psm, dockLanes, lines, netSqFt, grossSqFt: netSqFt * SUPPORT_NET_TO_GROSS };
}

/** Delivery vans on the list through a phase: each is a dock lane, none is enclosed floor. */
export const vansThrough = (rows: readonly FacilityRow[]): number => rows.filter((r) => isDeliveryVan(r.item)).reduce((s, r) => s + r.qty, 0);

// ── The hood ────────────────────────────────────────────────────────────────

export interface HoodRun {
  phase: BuildPhase;
  units: { key: string; item: string; qty: number; widthIn: number }[];
  /** Σ unit widths + 6 in overhang at each open end of the run (IMC §507.4.1). */
  lengthFt: number;
}

/** One canopy run per build phase's hot units; cumulative feet through a phase is the sum of its runs. */
export function hoodRuns(rows: readonly FacilityRow[]): HoodRun[] {
  return BUILD_PHASES.map((phase) => {
    const units = rows.filter((r) => r.phase === phase && r.underHood && r.widthIn !== null && r.qty > 0).map((r) => ({ key: r.key, item: r.item, qty: r.qty, widthIn: r.widthIn! }));
    const widthIn = units.reduce((s, u) => s + u.widthIn * u.qty, 0);
    return { phase, units, lengthFt: units.length ? (widthIn + 2 * HOOD_OVERHANG_IN) / 12 : 0 };
  }).filter((r) => r.units.length > 0);
}

// ── The answer: Layers A–E by cumulative phase ──────────────────────────────

export interface PhaseRequirement {
  phase: BuildPhase;
  rows: FacilityRow[];
  envelopeSqFt: number;
  floor: ProductionFloor;
  support: SupportProgram;
  /** floor × 1.10 for walls, columns and partitions. */
  floorGrossedSqFt: number;
  buildingGrossSqFt: number;
  hoodRuns: HoodRun[];
  hoodFt: number;
  /** Equipment envelope as a share of the production floor: the single published rule of thumb says about 30%. */
  equipmentShare: number;
}

export interface FacilityRequirement {
  psm: number;
  extraRooms: DesignRoom[];
  phases: PhaseRequirement[];
  /** What Phase 1 carries idle until Phase 2 lands: the full-build shell less the Phase 1 requirement. */
  idle: { floorSqFt: number; grossSqFt: number; share: number };
  /** Per meal at the PSM figure, full build. */
  perMeal: { floorSqFt: number; grossSqFt: number };
}

export function facilityRequirement(lines: readonly EquipmentLine[], opts: { psm: number; extraRooms?: readonly DesignRoom[] }): FacilityRequirement {
  const all = facilityRows(lines);
  const extraRooms = [...(opts.extraRooms ?? [])];
  const phases = BUILD_PHASES.map((phase): PhaseRequirement => {
    const rows = rowsThroughPhase(all, phase);
    const floor = productionFloor(rows, extraRooms);
    const support = supportProgram({ psm: opts.psm, vans: vansThrough(rows), warewashZoneGrossSqFt: floor.warewashZoneGrossSqFt });
    const floorGrossedSqFt = floor.productionFloorSqFt * STRUCTURAL_GROSS_UP;
    const runs = hoodRuns(rows);
    const envelopeSqFt = equipmentEnvelope(rows);
    return {
      phase,
      rows,
      envelopeSqFt,
      floor,
      support,
      floorGrossedSqFt,
      buildingGrossSqFt: floorGrossedSqFt + support.grossSqFt,
      hoodRuns: runs,
      hoodFt: runs.reduce((s, r) => s + r.lengthFt, 0),
      equipmentShare: floor.productionFloorSqFt > 0 ? envelopeSqFt / floor.productionFloorSqFt : 0,
    };
  });
  const first = phases[0]!;
  const full = phases[phases.length - 1]!;
  const idleGross = full.buildingGrossSqFt - first.buildingGrossSqFt;
  return {
    psm: opts.psm,
    extraRooms,
    phases,
    idle: { floorSqFt: full.floor.productionFloorSqFt - first.floor.productionFloorSqFt, grossSqFt: idleGross, share: full.buildingGrossSqFt > 0 ? idleGross / full.buildingGrossSqFt : 0 },
    perMeal: { floorSqFt: opts.psm > 0 ? full.floor.productionFloorSqFt / opts.psm : 0, grossSqFt: opts.psm > 0 ? full.buildingGrossSqFt / opts.psm : 0 },
  };
}

// ── Configurations: the baseline and each potential room ────────────────────

export interface FacilityConfiguration {
  label: string;
  rooms: DesignRoom[];
  requirement: FacilityRequirement;
  /** The hold life the configuration delivers: the longest any of its rooms delivers, else the baseline's. */
  holdLifeDays: number;
}

export const BASELINE_HOLD_LIFE_DAYS = 7;

/** Baseline, each potential room on its own, and all of them together. Rooms are read from the Design and Build plan, never from equipment. */
export function facilityConfigurations(lines: readonly EquipmentLine[], psm: number, rooms: readonly DesignRoom[] = DESIGN_ROOMS.filter((r) => r.status === 'potential')): FacilityConfiguration[] {
  const holdLife = (rs: readonly DesignRoom[]) => rs.reduce((m, r) => Math.max(m, r.holdLifeDays ?? 0), BASELINE_HOLD_LIFE_DAYS);
  const build = (label: string, rs: readonly DesignRoom[]): FacilityConfiguration => ({ label, rooms: [...rs], requirement: facilityRequirement(lines, { psm, extraRooms: rs }), holdLifeDays: holdLife(rs) });
  const out = [build('Baseline: current equipment, ambient packaging', [])];
  for (const r of rooms) out.push(build(`+ ${r.name}`, [r]));
  if (rooms.length > 1) out.push(build('+ every potential room', rooms));
  return out;
}
