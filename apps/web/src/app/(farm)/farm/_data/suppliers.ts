/**
 * MicroFarm — compiled supplier dataset (typed loader).
 *
 * Imports the generated, attributed JSON compilation (see
 * scripts/generate-farm-suppliers.ts). SERVER-SIDE / test use only — the JSON
 * is ~600KB and must not be bundled into a client component. Filtering happens
 * server-side (searchParams) so the browser never receives the whole set.
 */

import compiled from './suppliers-compiled.json';

export type Region = 'central-tx' | 'texas' | 'out-of-state';

export interface SupplierOperation {
  id: string;
  name: string;
  source: string; // 'USDA Organic INTEGRITY' | 'TDA Farm Fresh Network'
  certified: boolean;
  certifier: string;
  status: string;
  scopes: { crops: string; livestock: string; wildCrops: string; handling: string };
  products: { crops: string; livestock: string; handling: string };
  city: string;
  county: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  acres: string;
  types: string[];
  prospectReady: boolean;
  tdaType: string | null;
  region: Region;
  dataAsOf: string;
  // Geo — baked in by scripts/enrich-farm-supplier-geo.ts from U.S. Census
  // Gazetteer centroids (public domain). Coarse by design: 'zip' = ZIP-code
  // centroid (town level), 'county' = county centroid, null = unplaceable.
  lat?: number;
  lng?: number;
  geoSource?: 'zip' | 'county' | null;
  // Operator-entered — not in any public directory; populated per supplier once
  // engaged (from conversations). Undefined until then; the UI shows a dash.
  volumeCapacity?: string;
  wholesaleReadiness?: string;
  pricing?: string;
  leadTime?: string;
}

export interface SupplierSource {
  name: string;
  scope: string;
  dataAsOf: string;
  url: string;
}

export interface SupplierDataset {
  generatedAt: string;
  note: string;
  sources: SupplierSource[];
  counts: { total: number; certified: number; prospectReady: number; both: number; centralTx: number };
  operations: SupplierOperation[];
}

export const supplierDataset = compiled as unknown as SupplierDataset;
export const supplierOperations = supplierDataset.operations;
