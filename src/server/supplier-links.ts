import 'server-only';
import { suppliers, supplierById, supplierLocation, type Supplier } from '@/data/suppliers';
import { querySuppliers } from '@/engine/suppliers';
import type { LeanSupplier } from '@/engine/supplier-links';

/**
 * Server-only lookups over the suppliers on record, returning the lean shape the browser holds.
 */

export function toLean(s: Supplier): LeanSupplier {
  return {
    id: s.id,
    name: s.name,
    location: supplierLocation(s),
    supplies: s.supplies,
    brands: s.brands,
    lat: s.lat,
    lng: s.lng,
    geoSource: s.geoSource,
  };
}

export function leanSuppliersById(ids: string[]): Record<string, LeanSupplier> {
  const out: Record<string, LeanSupplier> = {};
  for (const id of ids) {
    const s = supplierById(id);
    if (s) out[id] = toLean(s);
  }
  return out;
}

export function searchLeanSuppliers(q: string, limit = 25): LeanSupplier[] {
  const query = q.trim();
  if (query.length < 2) return [];
  return querySuppliers(suppliers, { q: query }).slice(0, limit).map(toLean);
}

/** The full record for one supplier — the detail page's source. */
export function getSupplierOperation(id: string): Supplier | null {
  return supplierById(id);
}
