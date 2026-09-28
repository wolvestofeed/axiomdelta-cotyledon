/**
 * Cotyledon — prospective-subscriber prospect dataset (typed loader).
 *
 * Imports the generated JSON compilation (see scripts/generate-farm-prospects.py).
 * SERVER-SIDE use only — filtering happens server-side so the browser receives
 * only the rows it needs, never the whole set. This is the operator's own CRM
 * seed; status/contacts are read-only until the CRM data store lands.
 */

import compiled from '@/data/prospects-compiled.json';

export type ProspectSegment = 'charter' | 'private-tier1' | 'private-tier2';

/** The four pipeline stages present in the seed, in funnel order. */
export const PROSPECT_STATUSES = ['Lead', 'In Talks', 'Negotiating', 'Signed - Active'] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number] | string;

export interface ProspectRecord {
  id: string;
  segment: ProspectSegment;
  segmentLabel: string;
  name: string;
  location: string;
  city: string;
  state: string;
  zip: string;
  model: string;
  phone: string;
  email: string;
  website: string;
  pointOfContact: string;
  firstContact: string; // MM/DD/YYYY as given
  status: ProspectStatus;
  headcountRaw: string;
  headcount: number | null;
  grades: string;
  currentProgram: string;
  paymentModel: string;
  // Geo — baked in by scripts/enrich-farm-prospect-geo.py. 'address' = U.S.
  // Census street geocode, 'zip' = ZIP-code centroid, null = unplaceable.
  lat?: number | null;
  lng?: number | null;
  geoSource?: 'address' | 'zip' | null;
}

export interface ProspectDataset {
  generatedAt: string;
  note: string;
  source: { name: string; description: string; dataAsOf: string };
  counts: {
    total: number;
    charter: number;
    tier1: number;
    tier2: number;
    byStatus: Record<string, number>;
  };
  prospects: ProspectRecord[];
}

export const prospectDataset = compiled as unknown as ProspectDataset;
export const prospectRecords = prospectDataset.prospects;
