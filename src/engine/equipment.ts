/**
 * Cotyledon — the equipment library (Roadmap N1). Pure.
 *
 * Equipment is a definition with a real-world status (docs/farm/roadmaps/
 * operating-model-roadmap.md §2.1): in service, planned for a build-out phase,
 * not selected, or on the list and not needed. Capital, depreciation and
 * financing count the rows that are in service or planned.
 */

import { EQUIPMENT_CATEGORIES, type SowingCapacityBasis, type EquipmentCategory, type EquipmentLine, type EquipmentStatus } from '@/data/capex';
import { isFacilityZone, type FootprintBasis } from '@/data/facility-design';

export const EQUIPMENT_STATUSES: readonly EquipmentStatus[] = ['in_service', 'planned', 'no', 'unset'];

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  in_service: 'In service',
  planned: 'Planned',
  no: 'No',
  unset: '–',
};

export const isEquipmentStatus = (v: unknown): v is EquipmentStatus => EQUIPMENT_STATUSES.includes(v as EquipmentStatus);

/** In service or planned: the rows capital, depreciation and financing carry. */
export const countsTowardCapital = (status: EquipmentStatus): boolean => status === 'in_service' || status === 'planned';

/** The library's default order: rows with a quantity first, rows without one last, list order kept within each. */
export function equipmentLibraryOrder<T extends Pick<EquipmentLine, 'qty'>>(lines: readonly T[]): T[] {
  return lines
    .map((line, i) => ({ line, i }))
    .sort((a, b) => Number(a.line.qty <= 0) - Number(b.line.qty <= 0) || a.i - b.i)
    .map((x) => x.line);
}

export function filterEquipment<T extends Pick<EquipmentLine, 'status'>>(lines: readonly T[], statuses: ReadonlySet<EquipmentStatus>): T[] {
  return lines.filter((l) => statuses.has(l.status));
}

/** The item name when free, else the name with the next free ordinal: `Scales (2)`. */
export function uniqueEquipmentKey(item: string, taken: ReadonlySet<string>): string {
  if (!taken.has(item)) return item;
  let n = 2;
  while (taken.has(`${item} (${n})`)) n += 1;
  return `${item} (${n})`;
}

/** The columns of `farm.equipment` the library reads. */
// ── The sowing grow units: one unit of each, on the Phase 1 list ────────────────

/**
 * A grow unit a sowing passes through, with the pounds ONE unit takes in one run.
 * `units` is how many independent units of the kind are on the Phase 1 list —
 * parallel streams the production plan and the scheduler place — and is never
 * a capacity multiplier: a sowing binds to one unit.
 */
export interface SowingGrowUnit {
  key: string;
  item: string;
  /** Pounds one unit takes in one run. */
  capacityLb: number;
  /** Independent units on the Phase 1 list. Not a multiplier on `capacityLb`. */
  units: number;
  basis: SowingCapacityBasis;
}

/**
 * The Phase 1 equipment list: rows on build phase 1 that are in service or planned. A row
 * marked No or left unselected, and a planned build-out (phases 2 and 3), never counts toward
 * capacity or the sowing.
 */
export function phaseOneEquipment<T extends Pick<EquipmentLine, 'phase' | 'status'>>(lines: readonly T[]): T[] {
  return lines.filter((l) => l.phase === 1 && countsTowardCapital(l.status));
}

/** The grow units on the Phase 1 list that carry a sowing capacity. */
export function sowingGrowUnitsFrom(lines: readonly EquipmentLine[]): SowingGrowUnit[] {
  return phaseOneEquipment(lines)
    .filter((l) => (l.sowingCapacityLb ?? 0) > 0 && l.qty > 0)
    .map((l) => ({ key: l.key, item: l.item, capacityLb: l.sowingCapacityLb!, units: l.qty, basis: l.sowingCapacityBasis ?? 'estimated' }));
}

export const isBlackoutRack = (item: string): boolean => /blackout rack/i.test(item);

/**
 * The grow unit a grow stage sows in, by the equipment the standard names
 * (`grow-stages.ts`): a jar stand, a tilt shelf, or a sprouting rack — the largest
 * single unit where the standard allows either (one unit bounds a sowing, so
 * the count of units does not enter the pick). Null when the list has none.
 */
export function growUnitForProcess(equipment: string, growUnits: readonly SowingGrowUnit[]): SowingGrowUnit | null {
  const e = equipment.toLowerCase();
  const pick = (test: (item: string) => boolean) => {
    const m = growUnits.filter((v) => test(v.item.toLowerCase()));
    return m.length ? m.reduce((a, b) => (b.capacityLb > a.capacityLb ? b : a)) : null;
  };
  if (e.includes('jar stand')) return pick((i) => i.includes('jar stand'));
  if (e.includes('sprouting rack') || e.includes('steam or boil')) return pick((i) => i.includes('sprouting rack')) ?? pick((i) => i.includes('shelf'));
  if (e.includes('shelf')) return pick((i) => i.includes('shelf'));
  return null;
}

export interface EquipmentRowShape {
  id: string;
  key: string;
  item: string;
  category: string;
  setting: string;
  buildPhase: number;
  status: string;
  inServiceDate: string | Date | null;
  newUsed: string;
  qty: number;
  unitCostCents: number;
  critical: boolean;
  notes: string | null;
  shelves?: number | null;
  shelfWidthIn?: number | null;
  fixtureKey?: string | null;
  darkStagesOnly?: boolean | null;
  shelfLights?: unknown;
  sowingCapacityLb?: number | null;
  sowingCapacityBasis?: string | null;
  concurrentSowings?: number | null;
  changeoverMinutes?: number | null;
  attendedRun?: boolean | null;
  mayRunUnattended?: boolean | null;
  resourceBasis?: string | null;
  footprintWidthIn?: number | null;
  footprintDepthIn?: number | null;
  clearanceFrontIn?: number | null;
  clearanceRearIn?: number | null;
  clearanceSideIn?: number | null;
  footprintBasis?: string | null;
  zone?: string | null;
  underHood?: boolean | null;
  footprintSource?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  specSheetUrl?: string | null;
}

const isCapacityBasis = (v: unknown): v is SowingCapacityBasis => v === 'estimated' || v === 'stated' || v === 'observed';
const isFootprintBasis = (v: unknown): v is FootprintBasis => v === 'sourced' || v === 'estimated' || v === 'stated' || v === 'observed';

export function equipmentFromRow(r: EquipmentRowShape): EquipmentLine {
  const phase = r.buildPhase === 2 || r.buildPhase === 3 ? r.buildPhase : 1;
  const date = r.inServiceDate === null ? null : typeof r.inServiceDate === 'string' ? r.inServiceDate : r.inServiceDate.toISOString().slice(0, 10);
  return {
    id: r.id,
    key: r.key,
    item: r.item,
    category: (EQUIPMENT_CATEGORIES as readonly string[]).includes(r.category) ? (r.category as EquipmentCategory) : 'Storage, smallwares, instruments',
    setting: r.setting === 'home' ? 'home' : 'commercial',
    phase,
    status: isEquipmentStatus(r.status) ? r.status : 'unset',
    inServiceDate: date,
    newUsed: r.newUsed === 'Used' ? 'Used' : 'New',
    qty: r.qty,
    unitCostNew: r.unitCostCents / 100,
    critical: r.critical,
    ...(r.notes ? { note: r.notes } : {}),
    shelves: r.shelves ?? null,
    shelfWidthIn: r.shelfWidthIn ?? null,
    fixtureKey: r.fixtureKey ?? null,
    darkStagesOnly: r.darkStagesOnly === true,
    shelfLights: Array.isArray(r.shelfLights) ? (r.shelfLights as { fixtureKey: string | null; count: number }[]).filter((x) => typeof x === 'object' && x !== null && typeof x.count === 'number') : null,
    sowingCapacityLb: r.sowingCapacityLb ?? null,
    sowingCapacityBasis: isCapacityBasis(r.sowingCapacityBasis) ? r.sowingCapacityBasis : 'estimated',
    concurrentSowings: r.concurrentSowings ?? null,
    changeoverMinutes: r.changeoverMinutes ?? null,
    attendedRun: r.attendedRun ?? null,
    mayRunUnattended: r.mayRunUnattended ?? null,
    resourceBasis: isCapacityBasis(r.resourceBasis) ? r.resourceBasis : 'estimated',
    footprintWidthIn: r.footprintWidthIn ?? null,
    footprintDepthIn: r.footprintDepthIn ?? null,
    clearanceFrontIn: r.clearanceFrontIn ?? null,
    clearanceRearIn: r.clearanceRearIn ?? null,
    clearanceSideIn: r.clearanceSideIn ?? null,
    footprintBasis: isFootprintBasis(r.footprintBasis) ? r.footprintBasis : 'estimated',
    zone: isFacilityZone(r.zone) ? r.zone : null,
    underHood: r.underHood ?? false,
    footprintSource: r.footprintSource ?? null,
    manufacturer: r.manufacturer ?? null,
    model: r.model ?? null,
    specSheetUrl: r.specSheetUrl ?? null,
  };
}

// ── In service on a date (Roadmap N4a, decision 20) ─────────────────────────

/** A forecast's edit on one unit: its status and in-service date. */
export interface EquipmentDateOverlay {
  status?: EquipmentStatus;
  /** ISO date; null = TBD. */
  inServiceDate?: string | null;
}

export interface DatedEquipmentLine extends EquipmentLine {
  /** The date the line counts from in the forecast; null = not in service on any date. */
  inServiceFrom: string | null;
  /** Where the date came from. */
  inServiceBasis: 'in_service' | 'dated' | 'phase_one_at_start' | 'undated' | 'not_selected';
  edited: boolean;
}

/**
 * Each line's in-service date in a forecast. In service on the record: from the
 * date on file, else from the forecast start. Planned with a date (the record's
 * or the forecast's): from that date. Planned on build phase 1 with no date: from
 * the forecast start. Planned on phase 2 or 3 with no date: not in service until
 * the forecast dates it. "No" and "–": never.
 */
export function datedEquipment(lines: readonly EquipmentLine[], forecastStart: string, overlay: Readonly<Record<string, EquipmentDateOverlay>> = {}): DatedEquipmentLine[] {
  return lines.map((l) => {
    const o = overlay[l.key];
    const status = o?.status ?? l.status;
    const date = o && 'inServiceDate' in o ? (o.inServiceDate ?? null) : l.inServiceDate;
    const edited = o !== undefined && Object.keys(o).length > 0;
    const base = { ...l, status, inServiceDate: date, edited };
    if (status === 'no' || status === 'unset') return { ...base, inServiceFrom: null, inServiceBasis: 'not_selected' as const };
    if (status === 'in_service') return { ...base, inServiceFrom: date ?? forecastStart, inServiceBasis: 'in_service' as const };
    if (date) return { ...base, inServiceFrom: date, inServiceBasis: 'dated' as const };
    if (l.phase === 1) return { ...base, inServiceFrom: forecastStart, inServiceBasis: 'phase_one_at_start' as const };
    return { ...base, inServiceFrom: null, inServiceBasis: 'undated' as const };
  });
}

/** The lines in service on a date. */
export function equipmentInServiceOn<T extends Pick<DatedEquipmentLine, 'inServiceFrom'>>(lines: readonly T[], date: string): T[] {
  return lines.filter((l) => l.inServiceFrom !== null && l.inServiceFrom <= date);
}
