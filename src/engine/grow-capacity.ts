/**
 * MicroFarm — capacity in trays and cycle days (outline §5 rules 1 and 8). Pure.
 *
 * A grow unit is an equipment row that carries shelves: a rack, a sprouting rack, a jar stand. It
 * takes a number of trays of a format (the format's trays per 48-inch shelf, scaled to the shelf
 * width, times the shelves) and it carries its lights. A sowing is the whole trays its orders need,
 * one flat the least (`sowingsFor`), split across units only past what one unit takes. A tray occupies its unit for the plan's cycle days, so the sustained
 * ceiling is the trays across every unit that can take the plan, over the cycle.
 *
 * A lit unit takes any plan; its lights are set shelf by shelf (`lightsOn`), each shelf a fixture and
 * how many of it, so a rack can carry different lights on different shelves. A plan with a light line
 * goes on a lit unit, a plan with none on any unit.
 */

import type { EquipmentLine } from '@/data/capex';
import { FIXTURE_BY_KEY } from '@/data/inputs-catalog';
import { GERMINATION_STACK, cycleDays, daysToHarvest, type StageDays } from '@/data/stage-schedule';
import { TRAY_FORMAT_BY_KEY, type TrayFormatKey } from '@/data/tray-formats';
import { VARIETY_BY_KEY, type VarietyDef } from '@/data/varieties';
import { lightLine, planStageDays, type GrowPlanDef } from '@/data/grow-plan';
import { phaseOneEquipment } from '@/engine/equipment';

export interface GrowUnit {
  key: string;
  item: string;
  /** Growing shelves on one unit. */
  shelves: number;
  shelfWidthIn: number;
  /** The fixture on every shelf by default; null on an unlit unit. */
  fixtureKey: string | null;
  /** Each shelf's lights, top to bottom, where they differ from the default of `fixtureKey` at its count a shelf. */
  shelfLights?: readonly ShelfLight[] | null;
  /** Independent units of the kind on the list: parallel streams, never a multiplier on one unit's trays. */
  units: number;
  /** A dark rack: it holds a tray sowing only through its dark stages (sow, germination, blackout), never under light. */
  darkOnly?: boolean;
}

/** The grow units on the Phase 1 list: rows with shelves and a quantity. */
export function growUnitsFrom(lines: readonly EquipmentLine[]): GrowUnit[] {
  return phaseOneEquipment(lines)
    .filter((l) => (l.shelves ?? 0) > 0 && l.qty > 0)
    .map((l) => ({ key: l.key, item: l.item, shelves: l.shelves!, shelfWidthIn: l.shelfWidthIn ?? 48, fixtureKey: l.fixtureKey ?? null, shelfLights: l.shelfLights ?? null, units: l.qty, darkOnly: l.darkStagesOnly === true }));
}

/** Trays of a format on one shelf: the format's count per 48 inches, scaled to the shelf, floored. */
export function traysPerShelf(format: TrayFormatKey, shelfWidthIn: number): number {
  return Math.floor(TRAY_FORMAT_BY_KEY[format].perShelf48in.value * (shelfWidthIn / 48));
}

/**
 * The sowings for a need in trays: the whole trays the orders need (a part tray is a whole one, one
 * flat the least), as one sowing, split only where it is more than one unit takes. Nothing is sown
 * to fill a unit.
 */
export function sowingsFor(traysNeeded: number, perUnit: number): number[] {
  const trays = Math.ceil(traysNeeded - 1e-9);
  if (trays <= 0 || perUnit <= 0) return [];
  const out: number[] = [];
  for (let left = trays; left > 0; left -= perUnit) out.push(Math.min(left, perUnit));
  return out;
}

/** Trays of a format ONE unit takes. */
export function traysPerUnit(unit: GrowUnit, format: TrayFormatKey): number {
  return unit.shelves * traysPerShelf(format, unit.shelfWidthIn);
}

/** Days of a plan's cycle in the dark: the sow day, germination and blackout. */
export const darkDaysOf = (days: StageDays): number => days.sow + days.germination + days.blackout;

/** Days of a plan's cycle stacked on a dark rack: the sow day and germination. */
export const stackedDaysOf = (days: StageDays): number => days.sow + days.germination;

/** The shelf places a tray takes on a dark rack on day `k` of its cycle: one per stack while stacked, one each in blackout. */
export const darkPlacesPerTray = (days: StageDays, k: number): number => (k < stackedDaysOf(days) ? 1 / GERMINATION_STACK.value : 1);

/** One shelf's lights: a fixture and how many of it; no fixture on an unlit shelf. */
export interface ShelfLight {
  fixtureKey: string | null;
  count: number;
}

/** Each shelf's lights: as set shelf by shelf, else every shelf carrying the unit's fixture at its count a shelf. */
export function lightsOn(unit: Pick<GrowUnit, 'shelves' | 'fixtureKey' | 'shelfLights' | 'darkOnly'>): ShelfLight[] {
  if (unit.darkOnly) return Array.from({ length: unit.shelves }, () => ({ fixtureKey: null, count: 0 }));
  if (unit.shelfLights && unit.shelfLights.length > 0) return unit.shelfLights.map((s) => ({ fixtureKey: s.fixtureKey, count: s.fixtureKey ? s.count : 0 }));
  const f = unit.fixtureKey ? FIXTURE_BY_KEY[unit.fixtureKey] : undefined;
  return Array.from({ length: unit.shelves }, () => ({ fixtureKey: f ? f.key : null, count: f ? f.perShelf.value : 0 }));
}

/** Whether any shelf of a unit carries a light. */
export const isLit = (unit: GrowUnit): boolean => lightsOn(unit).some((s) => s.fixtureKey !== null && s.count > 0);

/**
 * Whether a unit takes a plan's whole cycle: a plan with a light line goes on a lit unit, a plan with
 * none on any unit. A dark rack takes only a plan with no light line whole.
 */
export function unitTakesPlan(unit: GrowUnit, plan: GrowPlanDef): boolean {
  const light = lightLine(plan);
  if (unit.darkOnly) return !light;
  return light ? isLit(unit) : true;
}

/** Whether a dark rack takes a plan's dark stages: a tray plan with a light line, which moves to a lit unit after blackout. */
export function unitHoldsDarkStages(unit: GrowUnit, plan: GrowPlanDef): boolean {
  return unit.darkOnly === true && lightLine(plan) !== undefined && TRAY_FORMAT_BY_KEY[plan.format].kind !== 'sprout' && traysPerUnit(unit, plan.format) > 0;
}

export interface GrowUnitFit {
  unit: GrowUnit;
  traysPerUnit: number;
  takesPlan: boolean;
}

export interface GrowCapacity {
  format: TrayFormatKey;
  /** Every Phase 1 grow unit, with the trays one takes and whether it takes the plan (lit, for a plan under light). */
  units: GrowUnitFit[];
  /** The unit a sowing binds to: the one that takes the most trays among those that take the plan; null with none. */
  binding: GrowUnitFit | null;
  /** The sowing: trays one binding unit takes. Zero with no unit. */
  sowingTrays: number;
  /** Trays across every unit that takes the plan, units counted. */
  totalTrays: number;
  /** Independent units that take the plan, counted. */
  unitCount: number;
  cycleDays: number;
  daysToHarvest: number;
  /** Trays across the dark racks that take the plan's dark stages, units counted; zero with none. */
  darkTrays: number;
  /** Days in the dark (sow, germination, blackout) and on a lit unit after them. */
  darkDays: number;
  lightDays: number;
  /**
   * The sustained ceiling in trays sown a day. With no dark rack, the trays across the lit units over
   * the cycle. With dark racks, every dark day on them: the lesser of the lit trays over the light days
   * and the dark racks' places over the place-days a tray takes there (stacked through the sow day and
   * germination, spread in blackout).
   */
  traysPerDay: number;
}

export function deriveGrowCapacity(plan: GrowPlanDef, growUnits: readonly GrowUnit[], varieties: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY): GrowCapacity {
  const days = planStageDays(plan, varieties);
  const cycle = cycleDays(days);
  const units: GrowUnitFit[] = growUnits.map((u) => ({ unit: u, traysPerUnit: traysPerUnit(u, plan.format), takesPlan: unitTakesPlan(u, plan) }));
  const able = units.filter((u) => u.takesPlan && u.traysPerUnit > 0);
  const binding = able.length ? able.reduce((a, b) => (b.traysPerUnit > a.traysPerUnit ? b : a)) : null;
  const totalTrays = able.reduce((t, u) => t + u.traysPerUnit * u.unit.units, 0);
  const unitCount = able.reduce((t, u) => t + u.unit.units, 0);
  const darkTrays = units.filter((u) => unitHoldsDarkStages(u.unit, plan)).reduce((t, u) => t + u.traysPerUnit * u.unit.units, 0);
  const darkDays = darkDaysOf(days);
  const lightDays = cycle - darkDays;
  const split = darkTrays > 0 && darkDays > 0 && lightDays > 0;
  return {
    format: plan.format,
    units,
    binding,
    sowingTrays: binding?.traysPerUnit ?? 0,
    totalTrays,
    unitCount,
    cycleDays: cycle,
    daysToHarvest: daysToHarvest(days),
    darkTrays,
    darkDays,
    lightDays,
    traysPerDay: split ? Math.min(totalTrays / lightDays, darkTrays / (stackedDaysOf(days) / GERMINATION_STACK.value + days.blackout)) : cycle > 0 ? totalTrays / cycle : 0,
  };
}
