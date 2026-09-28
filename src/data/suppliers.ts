/**
 * Cotyledon — the suppliers on record: the vendors Vallecito Micro Farm bought from.
 *
 * A supplier is who the farm pays. What it supplies is stated by line kind (seed, medium,
 * trays, lights, nutrients, equipment), the product brands it carries are on record, and what
 * Vallecito bought from it is stated with the price and date where one is on file, and what it
 * carries beyond that where Rob states it. Every record
 * carries the tag of what it rests on: DATED for a Vallecito purchase with its date, STATED for
 * what Rob has stated. Volume, wholesale readiness, pricing and lead time are operator-entered
 * once a conversation has happened, never invented here.
 *
 * Placement: a supplier with a city is placed at the city centre, typed by hand and labelled as
 * approximate; a marketplace or an online shop has no place. Inbound freight on Logistics reads
 * the placement.
 */

import type { StatusTag } from '@/data/tagged';

export type SupplyKind = 'seed' | 'medium' | 'trays' | 'lights' | 'nutrients' | 'equipment';

export const SUPPLY_KINDS: SupplyKind[] = ['seed', 'medium', 'trays', 'lights', 'nutrients', 'equipment'];

export const SUPPLY_KIND_LABEL: Record<SupplyKind, string> = {
  seed: 'Seed',
  medium: 'Medium',
  trays: 'Trays and sets',
  lights: 'Lights',
  nutrients: 'Nutrients',
  equipment: 'Equipment',
};

export interface Supplier {
  id: string;
  name: string;
  /** What it supplies, by the grow plan's line kinds and the equipment list. */
  supplies: SupplyKind[];
  /** The product brands on record from this supplier. */
  brands: string[];
  /** What Vallecito bought, with the price and date where one is on file. */
  bought: string;
  /** What the supplier carries beyond what was bought, as Rob states it; absent where nothing is stated. */
  carries?: string;
  city: string;
  state: string;
  website: string;
  /** What the record rests on: DATED, a Vallecito purchase with its date; STATED, what Rob states. */
  tag: Extract<StatusTag, 'DATED' | 'STATED'>;
  lat: number | null;
  lng: number | null;
  /** 'city' = the city centre, typed by hand, approximate; null = no place (a marketplace or an online shop). */
  geoSource: 'city' | null;
  // Operator-entered, from conversations; undefined until then, and the UI shows a dash.
  volumeCapacity?: string;
  wholesaleReadiness?: string;
  pricing?: string;
  leadTime?: string;
}

export const suppliers: Supplier[] = [
  {
    id: 'true-leaf-market',
    name: 'True Leaf Market',
    supplies: ['seed'],
    brands: ['True Leaf Market'],
    bought: 'Seed for all twelve varieties at the 5 lb tier, January 2024; each variety record carries its item number and price per pound.',
    city: 'Salt Lake City',
    state: 'UT',
    website: 'trueleafmarket.com',
    tag: 'DATED',
    lat: 40.7608,
    lng: -111.891,
    geoSource: 'city',
  },
  {
    id: 'bootstrap-farmer',
    name: 'Bootstrap Farmer',
    supplies: ['seed', 'medium', 'trays', 'equipment'],
    brands: ['Bootstrap Farmer'],
    bought: 'Hemp fiber mats, $241 for 140 with no shipping (Rob); 1020 flat sets in 30-packs at $13.33 a set of three (Vallecito 2023).',
    carries: 'Trays (1020 and 1010, with and without drainage, mesh), humidity domes, hemp mats and coco coir, microgreens seed, and other grow-room supplies (Rob). A source for trays and sets beside On The Grow.',
    city: 'Paris',
    state: 'TX',
    website: 'bootstrapfarmer.com',
    tag: 'STATED',
    lat: 33.6609,
    lng: -95.5555,
    geoSource: 'city',
  },
  {
    id: 'on-the-grow',
    name: 'On The Grow',
    supplies: ['trays'],
    brands: ['On The Grow'],
    bought: '1020 three-piece sets (bottom, mesh, blackout top) at $13.33 a set, the large green/white tray set at $5 and the small at $3 (Vallecito 2023); the seeding guide the variety densities cite. A YouTube channel with a shop.',
    city: '',
    state: '',
    website: '',
    tag: 'DATED',
    lat: null,
    lng: null,
    geoSource: null,
  },
  {
    id: 'amazon',
    name: 'Amazon',
    supplies: ['lights', 'equipment'],
    brands: ['Mars Hydro', 'Barrina', 'Vivosun'],
    bought: 'The grow lights: Mars Hydro VG80 at $450 for five (Vallecito 2023), Barrina T5 tubes and Vivosun; the clip fans at $200 for four (Vallecito 2023). A marketplace: the brands are on record, the sellers are not.',
    city: '',
    state: '',
    website: 'amazon.com',
    tag: 'DATED',
    lat: null,
    lng: null,
    geoSource: null,
  },
  {
    id: 'coco-bale-seller',
    name: 'Coco bale seller (not on record)',
    supplies: ['medium'],
    brands: ['Mother Earth'],
    bought: 'Mother Earth 5 kg compressed coco bale, $23.19, January 2024. The seller is not on record; the brand and the price are.',
    city: '',
    state: '',
    website: '',
    tag: 'DATED',
    lat: null,
    lng: null,
    geoSource: null,
  },
];

const byId = new Map(suppliers.map((s) => [s.id, s]));

export function supplierById(id: string): Supplier | null {
  return byId.get(id) ?? null;
}

export function supplierLocation(s: Pick<Supplier, 'city' | 'state' | 'geoSource'>): string {
  return [s.city, s.state].filter(Boolean).join(', ') || (s.geoSource === null ? 'Online' : '');
}
