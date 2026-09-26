/**
 * MicroFarm — supplier query, cross-reference, and crop-plan-match logic.
 *
 * Pure functions over a SupplierOperation[]. No I/O — the caller loads the
 * compiled dataset (server-side) and passes the array in, which keeps these
 * testable and keeps the ~600KB JSON out of any client bundle.
 */

import type { SupplierOperation, Region } from '../_data/suppliers';
import { cropPlan } from '../_data/plan-data';

export interface SupplierFilters {
  region?: Region | 'all';
  scope?: 'crops' | 'livestock' | 'handling' | 'all';
  prospectReadyOnly?: boolean;
  certifiedOnly?: boolean;
  q?: string; // free-text over name + products + type
}

const isCert = (s: string) => /^cert/i.test(s || '');

function haystack(o: SupplierOperation): string {
  return [
    o.name,
    o.products.crops,
    o.products.livestock,
    o.products.handling,
    o.tdaType ?? '',
    o.types.join(' '),
    o.city,
    o.county,
  ]
    .join(' ')
    .toLowerCase();
}

export function queryOperations(
  ops: SupplierOperation[],
  f: SupplierFilters = {},
): SupplierOperation[] {
  const q = (f.q ?? '').trim().toLowerCase();
  return ops.filter((o) => {
    if (f.region && f.region !== 'all' && o.region !== f.region) return false;
    if (f.certifiedOnly && !o.certified) return false;
    if (f.prospectReadyOnly && !o.prospectReady) return false;
    if (f.scope && f.scope !== 'all') {
      if (f.scope === 'crops' && !isCert(o.scopes.crops)) return false;
      if (f.scope === 'livestock' && !isCert(o.scopes.livestock)) return false;
      if (f.scope === 'handling' && !isCert(o.scopes.handling)) return false;
    }
    if (q && !haystack(o).includes(q)) return false;
    return true;
  });
}

export interface CrossRefStats {
  total: number;
  certifiedOrganic: number;
  prospectReady: number;
  both: number;
  centralTx: number;
}

export function crossRefStats(ops: SupplierOperation[]): CrossRefStats {
  return {
    total: ops.length,
    certifiedOrganic: ops.filter((o) => o.certified).length,
    prospectReady: ops.filter((o) => o.prospectReady).length,
    both: ops.filter((o) => o.certified && o.prospectReady).length,
    centralTx: ops.filter((o) => o.region === 'central-tx').length,
  };
}

// ── Match suppliers to the crop plan's input lines ────────────────────────

export interface CropPlanLineMatch {
  input: string;
  keywords: string[];
  matches: SupplierOperation[];
}

// Minimal shape the matcher needs — any crop plan from `crop_plans` satisfies it.
export interface MatchableCropPlan {
  code: string;
  name: string;
  category: string;
  inputs: readonly { name: string }[];
}

// Keyword sets that map each crop plan line to product/type text in the dataset.
const LINE_KEYWORDS: Record<string, string[]> = {
  'Ground beef, 85/15': ['beef', 'cattle', 'livestock', 'bison', 'grass'],
  'Pinto beans, dry': ['bean', 'legume', 'pulse'],
  'Brown rice, long grain': ['rice'],
  'Seasonal vegetables': ['vegetable', 'squash', 'pepper', 'greens', 'produce', 'zucchini', 'chard', 'kale'],
  'Tomato, crushed': ['tomato'],
  'Onion, yellow': ['onion', 'allium'],
  'Garlic, peeled': ['garlic'],
  'Corn tortilla, 6 in': ['tortilla', 'corn', 'masa'],
  'Cheddar, shredded': ['cheese', 'cheddar', 'dairy', 'milk'],
};

export function matchCropPlanToSuppliers(
  ops: SupplierOperation[],
  region: Region | 'all' = 'all',
  targetCropPlan: MatchableCropPlan = cropPlan,
): CropPlanLineMatch[] {
  const pool = region === 'all' ? ops : ops.filter((o) => o.region === region);
  return targetCropPlan.inputs.map((ing) => {
    const keywords = LINE_KEYWORDS[ing.name] ?? [];
    const matches = keywords.length
      ? pool.filter((o) => {
          const h = haystack(o);
          return keywords.some((k) => h.includes(k));
        })
      : [];
    return { input: ing.name, keywords, matches };
  });
}
