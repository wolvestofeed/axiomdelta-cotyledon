/**
 * Cotyledon — supplier query, counts, and the grow-plan match (pure).
 *
 * Pure functions over a Supplier[]; the caller passes the list in, so these are testable
 * and the page decides what the browser receives.
 */

import { purchaseName, type GrowPlanDef, type GrowPlanLine } from '@/data/grow-plan';
import { SUPPLY_KINDS, type Supplier, type SupplyKind } from '@/data/suppliers';

export interface SupplierFilters {
  kind?: SupplyKind | 'all';
  /** Free text over the name, the brands, what was bought and the place. */
  q?: string;
}

function haystack(s: Supplier): string {
  return [s.name, s.brands.join(' '), s.bought, s.carries ?? '', s.city, s.state, s.website].join(' ').toLowerCase();
}

export function querySuppliers(list: Supplier[], f: SupplierFilters = {}): Supplier[] {
  const q = (f.q ?? '').trim().toLowerCase();
  return list.filter((s) => {
    if (f.kind && f.kind !== 'all' && !s.supplies.includes(f.kind)) return false;
    if (q && !haystack(s).includes(q)) return false;
    return true;
  });
}

export interface SupplyStats {
  total: number;
  byKind: Record<SupplyKind, number>;
  placed: number;
}

export function supplyStats(list: Supplier[]): SupplyStats {
  const byKind = Object.fromEntries(SUPPLY_KINDS.map((k) => [k, list.filter((s) => s.supplies.includes(k)).length])) as Record<SupplyKind, number>;
  return { total: list.length, byKind, placed: list.filter((s) => s.lat !== null && s.lng !== null).length };
}

// ── Match suppliers to the grow plan's lines ──────────────────────────────

/** The supply kind a grow plan line buys. */
export function supplyKindOf(line: GrowPlanLine): SupplyKind {
  switch (line.kind) {
    case 'seed':
      return 'seed';
    case 'medium':
      return 'medium';
    case 'nutrient':
      return 'nutrients';
    case 'light':
      return 'lights';
  }
}

export interface GrowPlanLineMatch {
  input: string;
  kind: SupplyKind;
  matches: Supplier[];
}

/** Minimal shape the matcher needs: a grow plan's lines. */
export type MatchableGrowPlan = Pick<GrowPlanDef, 'lines'>;

/** Each line the plan buys, with the suppliers on record that supply its kind. */
export function matchGrowPlanToSuppliers(list: Supplier[], plan: MatchableGrowPlan): GrowPlanLineMatch[] {
  const seen = new Map<string, SupplyKind>();
  for (const line of plan.lines) {
    const name = purchaseName(line);
    if (!seen.has(name)) seen.set(name, supplyKindOf(line));
  }
  return [...seen.entries()].map(([input, kind]) => ({ input, kind, matches: list.filter((s) => s.supplies.includes(kind)) }));
}
