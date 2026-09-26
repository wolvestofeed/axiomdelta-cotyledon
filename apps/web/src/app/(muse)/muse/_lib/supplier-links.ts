import 'server-only';
import { supplierOperations, type SupplierOperation } from '../_data/suppliers';
import { supplierRatings, ratingFor } from '../_data/mark';
import { queryOperations } from '../_engine/suppliers';
import type { LeanSupplier } from '../_engine/supplier-links';

/**
 * Server-only lookups over the compiled supplier directory, returning the lean
 * shape the browser may hold. Never hands out the full dataset.
 */

function certScope(o: SupplierOperation): string {
  const s: string[] = [];
  if (/^cert/i.test(o.scopes.crops)) s.push('Crops');
  if (/^cert/i.test(o.scopes.livestock)) s.push('Livestock');
  if (/^cert/i.test(o.scopes.handling)) s.push('Handling');
  return s.join(', ');
}

export function toLean(o: SupplierOperation): LeanSupplier {
  return {
    id: o.id,
    name: o.name,
    location: [o.city, o.county ? `${o.county} County` : '', o.state].filter(Boolean).join(', '),
    certified: o.certified,
    certScope: certScope(o),
    schoolReady: o.schoolReady,
    lat: o.lat ?? null,
    lng: o.lng ?? null,
    geoSource: o.geoSource ?? null,
    rating: ratingFor(supplierRatings, o.id),
  };
}

const byId = new Map(supplierOperations.map((o) => [o.id, o]));

export function leanSuppliersById(ids: string[]): Record<string, LeanSupplier> {
  const out: Record<string, LeanSupplier> = {};
  for (const id of ids) {
    const o = byId.get(id);
    if (o) out[id] = toLean(o);
  }
  return out;
}

export function searchLeanSuppliers(q: string, limit = 25): LeanSupplier[] {
  const query = q.trim();
  if (query.length < 2) return [];
  // Central Texas first, then the rest of the four states.
  const central = queryOperations(supplierOperations, { region: 'central-tx', q: query });
  const rest = queryOperations(supplierOperations, { region: 'all', q: query }).filter((o) => o.region !== 'central-tx');
  return [...central, ...rest].slice(0, limit).map(toLean);
}

/** The full directory record for one operation — the detail page's source. */
export function getSupplierOperation(id: string): SupplierOperation | null {
  return byId.get(id) ?? null;
}
