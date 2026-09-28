/**
 * Cotyledon — the Media library, rows to records. Pure.
 *
 * A row is one growing medium a grow plan's medium line names by its key. Its figures are tagged
 * documents stored whole, so a seeded figure keeps its tag and its note and a figure typed on the
 * page is STATED.
 */

import { tagged, type Tagged, type StatusTag } from '@/data/tagged';
import { NO_MEDIUM_KEY, type GrowingMediumDef } from '@/data/inputs-catalog';
import type { GrowPlanDef } from '@/data/grow-plan';

/** A stored row as the read layer returns it. */
export interface MediumRow {
  id: string;
  key: string;
  position: number;
  name: string;
  form: string;
  unit: string;
  qtyPer1020: unknown;
  costPerUnit: unknown;
  traits: unknown;
  rows: unknown;
  source: string;
}

/** A library record: the medium the engine reads, with the row's id and source. */
export type LibraryMedium = GrowingMediumDef & { id: string; source: 'seed' | 'user_built' };

const STATUSES: readonly StatusTag[] = ['SOURCED', 'STATED', 'PLACEHOLDER', 'DERIVED', 'UNCONFIRMED', 'DATED'];
const FORMS: readonly GrowingMediumDef['form'][] = ['loose', 'mat', 'none'];

/** The unit each form is counted in: loose fill by the gallon, a mat by the piece. */
export const UNIT_OF_FORM: Record<GrowingMediumDef['form'], GrowingMediumDef['unit']> = { loose: 'gal', mat: 'each', none: 'none' };

function taggedFrom(raw: unknown, unit: string): Tagged | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { value?: unknown; status?: unknown; note?: unknown };
  if (typeof r.value !== 'number' || !Number.isFinite(r.value)) return null;
  const status = STATUSES.includes(r.status as StatusTag) ? (r.status as StatusTag) : 'PLACEHOLDER';
  return tagged(r.value, status, unit, typeof r.note === 'string' ? r.note : '');
}

function traitsFrom(raw: unknown): GrowingMediumDef['traits'] {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as { ph?: unknown; porosity?: unknown; note?: unknown };
  return {
    ...(typeof r.ph === 'string' && r.ph.trim() ? { ph: r.ph } : {}),
    ...(typeof r.porosity === 'string' && r.porosity.trim() ? { porosity: r.porosity } : {}),
    note: typeof r.note === 'string' ? r.note : '',
  };
}

export function mediumFromRow(row: MediumRow): LibraryMedium {
  const form = FORMS.includes(row.form as GrowingMediumDef['form']) ? (row.form as GrowingMediumDef['form']) : 'loose';
  const unit = UNIT_OF_FORM[form];
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    form,
    qtyPer1020: taggedFrom(row.qtyPer1020, unit) ?? tagged(0, 'PLACEHOLDER', unit, 'No quantity on file'),
    unit,
    costPerUnit: taggedFrom(row.costPerUnit, unit === 'none' ? '$' : `$/${unit}`) ?? tagged(0, 'PLACEHOLDER', `$/${unit}`, 'No price on file'),
    traits: traitsFrom(row.traits),
    rows: Array.isArray(row.rows) ? row.rows.filter((n): n is number => Number.isInteger(n)) : [],
    source: row.source === 'seed' ? 'seed' : 'user_built',
  };
}

/** The columns a record writes. */
export function mediumToRow(m: GrowingMediumDef, position: number, source: 'seed' | 'user_built') {
  return {
    key: m.key,
    position,
    name: m.name,
    form: m.form,
    unit: m.unit,
    qtyPer1020: m.qtyPer1020,
    costPerUnit: m.costPerUnit,
    traits: m.traits,
    rows: m.rows,
    source,
  };
}

/** A key for a new row from its name, unique against the keys on file. */
export function mediumKeyFor(name: string, existing: readonly string[]): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'medium';
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Dollars per unit from what was paid and how much it gave: the gallons a bale expands to, the mats in a pack. */
export function costPerUnitFrom(paid: number, quantity: number): number {
  return quantity > 0 ? paid / quantity : 0;
}

/** The plans whose medium lines name a key; a row they name cannot be deleted. */
export function plansNamingMedium(key: string, plans: readonly Pick<GrowPlanDef, 'code' | 'lines'>[]): string[] {
  return plans.filter((p) => p.lines.some((l) => l.kind === 'medium' && l.mediumKey === key)).map((p) => p.code);
}

/** Why a row cannot be deleted, or null when it can. */
export function mediumDeleteRefusal(key: string, plans: readonly Pick<GrowPlanDef, 'code' | 'lines'>[]): string | null {
  if (key === NO_MEDIUM_KEY) return 'No medium is the row a plan grown without one names; it stays.';
  const naming = plansNamingMedium(key, plans);
  return naming.length > 0 ? `Named by ${naming.join(', ')}; change those plans' medium lines first.` : null;
}

/** The records a plan's medium lines name, by key; the plan carries them so it is costed against its workspace's library. */
export function mediaForPlan(plan: Pick<GrowPlanDef, 'lines'>, byKey: Readonly<Record<string, GrowingMediumDef>>): Record<string, GrowingMediumDef> {
  const out: Record<string, GrowingMediumDef> = {};
  for (const l of plan.lines) if (l.kind === 'medium' && byKey[l.mediumKey]) out[l.mediumKey] = byKey[l.mediumKey]!;
  return out;
}
