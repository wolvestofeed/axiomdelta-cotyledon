/**
 * Impact OS — prospective-customer school dataset (typed loader).
 *
 * Imports the generated JSON compilation (see scripts/generate-muse-schools.py).
 * SERVER-SIDE use only — filtering happens server-side so the browser receives
 * only the rows it needs, never the whole set. This is the operator's own CRM
 * seed; status/contacts are read-only until the CRM data store lands.
 */

import compiled from './schools-compiled.json';

export type SchoolSegment = 'charter' | 'private-tier1' | 'private-tier2';

/** The four pipeline stages present in the seed, in funnel order. */
export const SCHOOL_STATUSES = ['Lead', 'In Talks', 'Negotiating', 'Signed - Active'] as const;
export type SchoolStatus = (typeof SCHOOL_STATUSES)[number] | string;

export interface SchoolRecord {
  id: string;
  segment: SchoolSegment;
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
  status: SchoolStatus;
  studentsRaw: string;
  students: number | null;
  grades: string;
  foodProgram: string;
  parentPay: string;
  // Geo — baked in by scripts/enrich-muse-school-geo.py. 'address' = U.S.
  // Census street geocode, 'zip' = ZIP-code centroid, null = unplaceable.
  lat?: number | null;
  lng?: number | null;
  geoSource?: 'address' | 'zip' | null;
}

export interface SchoolDataset {
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
  schools: SchoolRecord[];
}

export const schoolDataset = compiled as unknown as SchoolDataset;
export const schoolRecords = schoolDataset.schools;
