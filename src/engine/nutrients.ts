/**
 * MicroFarm — the Nutrients & Supplements library, rows to records. Pure.
 *
 * A row is one nutrient solution or supplement a grow plan's nutrient line names by its key. Its
 * figures are tagged documents stored whole, so a seeded figure keeps its tag and its note and a
 * figure typed on the page is STATED.
 */

import { tagged, type Tagged, type StatusTag } from '@/data/tagged';
import { WATER_ONLY_KEY, type NutrientSolutionDef } from '@/data/inputs-catalog';
import type { GrowPlanDef } from '@/data/grow-plan';

export const ML_PER_GAL = 3785.41;

/** A stored row as the read layer returns it. */
export interface NutrientRow {
  id: string;
  key: string;
  position: number;
  name: string;
  mlPerGal: unknown;
  costPerMl: unknown;
  ecTarget: unknown;
  phTarget: unknown;
  elicits: unknown;
  note: string;
  source: string;
}

/** A library record: the solution the engine reads, with the row's id and source. */
export type LibraryNutrient = NutrientSolutionDef & { id: string; source: 'seed' | 'user_built' };

const STATUSES: readonly StatusTag[] = ['SOURCED', 'STATED', 'PLACEHOLDER', 'DERIVED', 'UNCONFIRMED', 'DATED'];

function taggedFrom(raw: unknown, unit: string): Tagged | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { value?: unknown; status?: unknown; note?: unknown };
  if (typeof r.value !== 'number' || !Number.isFinite(r.value)) return null;
  const status = STATUSES.includes(r.status as StatusTag) ? (r.status as StatusTag) : 'PLACEHOLDER';
  return tagged(r.value, status, unit, typeof r.note === 'string' ? r.note : '');
}

function elicitsFrom(raw: unknown): NutrientSolutionDef['elicits'] {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { effect?: unknown; rows?: unknown };
  if (typeof r.effect !== 'string' || r.effect.trim() === '') return null;
  const rows = Array.isArray(r.rows) ? r.rows.filter((n): n is number => Number.isInteger(n)) : [];
  return { effect: r.effect, rows };
}

export function nutrientFromRow(row: NutrientRow): LibraryNutrient {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    mlPerGal: taggedFrom(row.mlPerGal, 'ml/gal') ?? tagged(0, 'PLACEHOLDER', 'ml/gal', 'No strength on file'),
    costPerMl: taggedFrom(row.costPerMl, '$/ml') ?? tagged(0, 'PLACEHOLDER', '$/ml', 'No price on file'),
    ecTarget: taggedFrom(row.ecTarget, 'mS/cm'),
    phTarget: taggedFrom(row.phTarget, 'pH'),
    elicits: elicitsFrom(row.elicits),
    note: row.note,
    source: row.source === 'seed' ? 'seed' : 'user_built',
  };
}

/** The columns a record writes. */
export function nutrientToRow(n: NutrientSolutionDef, position: number, source: 'seed' | 'user_built') {
  return {
    key: n.key,
    position,
    name: n.name,
    mlPerGal: n.mlPerGal,
    costPerMl: n.costPerMl,
    ecTarget: n.ecTarget,
    phTarget: n.phTarget,
    elicits: n.elicits,
    note: n.note,
    source,
  };
}

/** A key for a new row from its name, unique against the keys on file. */
export function nutrientKeyFor(name: string, existing: readonly string[]): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'nutrient';
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Dollars per ml from what was paid for a container of a size in gallons. */
export function costPerMlFrom(price: number, containerGal: number): number {
  return containerGal > 0 ? price / (containerGal * ML_PER_GAL) : 0;
}

/** The plans whose nutrient lines name a key; a row they name cannot be deleted. */
export function plansNaming(key: string, plans: readonly Pick<GrowPlanDef, 'code' | 'lines'>[]): string[] {
  return plans.filter((p) => p.lines.some((l) => l.kind === 'nutrient' && l.nutrientKey === key)).map((p) => p.code);
}

/** Why a row cannot be deleted, or null when it can. */
export function deleteRefusal(key: string, plans: readonly Pick<GrowPlanDef, 'code' | 'lines'>[]): string | null {
  if (key === WATER_ONLY_KEY) return 'Water only is the row a plan with nothing added names; it stays.';
  const naming = plansNaming(key, plans);
  return naming.length > 0 ? `Named by ${naming.join(', ')}; change those plans' nutrient lines first.` : null;
}

/** The records a plan's nutrient lines name, by key; the plan carries them so it is costed against its workspace's library. */
export function nutrientsForPlan(plan: Pick<GrowPlanDef, 'lines'>, byKey: Readonly<Record<string, NutrientSolutionDef>>): Record<string, NutrientSolutionDef> {
  const out: Record<string, NutrientSolutionDef> = {};
  for (const l of plan.lines) if (l.kind === 'nutrient' && byKey[l.nutrientKey]) out[l.nutrientKey] = byKey[l.nutrientKey]!;
  return out;
}
