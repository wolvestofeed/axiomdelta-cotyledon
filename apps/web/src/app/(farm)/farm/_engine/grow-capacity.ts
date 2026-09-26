/**
 * MicroFarm — capacity in trays and cycle days (outline §5 rules 1 and 8). Pure.
 *
 * A grow unit is an equipment row that carries shelves: a rack, a sprouting rack, a jar stand. It
 * takes a number of trays of a format (the format's trays per 48-inch shelf, scaled to the shelf
 * width, times the shelves) and it carries a fixture. A sowing is what ONE grow unit takes of the
 * plan's format: a second unit is a parallel stream the production plan places as its own sowing,
 * never a larger sowing. A tray occupies its unit for the plan's cycle days, so the sustained
 * ceiling is the trays across every unit that can take the plan, over the cycle.
 *
 * A plan with a light line is placed only on a unit whose fixture delivers the regime at the
 * intensity the plan asks for; a jar plan goes on any unit.
 */

import type { EquipmentLine } from '../_data/capex';
import { FIXTURE_BY_KEY, REGIME_BY_KEY, fixtureDelivers, type LightFixtureDef } from '../_data/inputs-catalog';
import { cycleDays, daysToHarvest } from '../_data/stage-schedule';
import { TRAY_FORMAT_BY_KEY, type TrayFormatKey } from '../_data/tray-formats';
import { VARIETY_BY_KEY, type VarietyDef } from '../_data/varieties';
import { leadVariety, lightLine, planStageDays, type GrowPlanDef } from '../_data/grow-plan';
import { phaseOneEquipment } from './equipment';

export interface GrowUnit {
  key: string;
  item: string;
  /** Growing shelves on one unit. */
  shelves: number;
  shelfWidthIn: number;
  /** The fixture on every shelf; null on an unlit unit. */
  fixtureKey: string | null;
  /** Independent units of the kind on the list: parallel streams, never a multiplier on one unit's trays. */
  units: number;
}

/** The grow units on the Phase 1 list: rows with shelves and a quantity. */
export function growUnitsFrom(lines: readonly EquipmentLine[]): GrowUnit[] {
  return phaseOneEquipment(lines)
    .filter((l) => (l.shelves ?? 0) > 0 && l.qty > 0)
    .map((l) => ({ key: l.key, item: l.item, shelves: l.shelves!, shelfWidthIn: l.shelfWidthIn ?? 48, fixtureKey: l.fixtureKey ?? null, units: l.qty }));
}

/** Trays of a format on one shelf: the format's count per 48 inches, scaled to the shelf, floored. */
export function traysPerShelf(format: TrayFormatKey, shelfWidthIn: number): number {
  return Math.floor(TRAY_FORMAT_BY_KEY[format].perShelf48in.value * (shelfWidthIn / 48));
}

/** Trays of a format ONE unit takes. */
export function traysPerUnit(unit: GrowUnit, format: TrayFormatKey): number {
  return unit.shelves * traysPerShelf(format, unit.shelfWidthIn);
}

/** Whether a unit's fixture delivers the plan's light line; a plan with no light line fits any unit. */
export function unitTakesPlan(unit: GrowUnit, plan: GrowPlanDef, varieties: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY): boolean {
  const light = lightLine(plan);
  if (!light) return true;
  const fixture: LightFixtureDef | undefined = unit.fixtureKey ? FIXTURE_BY_KEY[unit.fixtureKey] : undefined;
  const regime = REGIME_BY_KEY[light.regimeKey];
  if (!fixture || !regime) return false;
  const lead = leadVariety(plan, varieties);
  const ppfd = light.ppfd?.value ?? lead?.light.ppfdRange?.max ?? regime.ppfdTarget.value;
  return fixtureDelivers(fixture, regime, ppfd);
}

export interface GrowUnitFit {
  unit: GrowUnit;
  traysPerUnit: number;
  takesPlan: boolean;
}

export interface GrowCapacity {
  format: TrayFormatKey;
  /** Every Phase 1 grow unit, with the trays one takes and whether its fixture delivers the plan's light. */
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
  /** The sustained ceiling: total trays over the cycle. */
  traysPerDay: number;
}

export function deriveGrowCapacity(plan: GrowPlanDef, growUnits: readonly GrowUnit[], varieties: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY): GrowCapacity {
  const days = planStageDays(plan, varieties);
  const cycle = cycleDays(days);
  const units: GrowUnitFit[] = growUnits.map((u) => ({ unit: u, traysPerUnit: traysPerUnit(u, plan.format), takesPlan: unitTakesPlan(u, plan, varieties) }));
  const able = units.filter((u) => u.takesPlan && u.traysPerUnit > 0);
  const binding = able.length ? able.reduce((a, b) => (b.traysPerUnit > a.traysPerUnit ? b : a)) : null;
  const totalTrays = able.reduce((t, u) => t + u.traysPerUnit * u.unit.units, 0);
  const unitCount = able.reduce((t, u) => t + u.unit.units, 0);
  return {
    format: plan.format,
    units,
    binding,
    sowingTrays: binding?.traysPerUnit ?? 0,
    totalTrays,
    unitCount,
    cycleDays: cycle,
    daysToHarvest: daysToHarvest(days),
    traysPerDay: cycle > 0 ? totalTrays / cycle : 0,
  };
}
