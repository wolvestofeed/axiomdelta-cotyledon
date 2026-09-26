/**
 * Farm Suppliers — geo helpers shared by the server page and the client map.
 *
 * `ClientSupplier` is the lean, already-filtered shape the browser receives
 * (≤ the display cap, never the full compiled dataset). `haversineMiles` is a
 * pure straight-line ("as the crow flies") distance — no routing engine, no
 * external call. Road-following routes are intentionally out of scope for now.
 */

/** Lean supplier record sent to the client (map + directory table). */
import type { MarkRating } from '../_data/mark';

export interface ClientSupplier {
  rating: MarkRating;
  id: string;
  name: string;
  website: string;
  meta: string; // "source · certifier · types"
  location: string; // "City, County County, ST"
  certified: boolean;
  certScope: string; // "Crops, Livestock" or ''
  prospectReady: boolean;
  tdaType: string | null;
  products: string;
  volumeCapacity: string | null;
  wholesaleReadiness: string | null;
  pricing: string | null;
  leadTime: string | null;
  lat: number | null;
  lng: number | null;
  geoSource: 'zip' | 'county' | null;
}

/** One crop plan's input lines matched against suppliers, lean for the client. */
export interface CropPlanMatchView {
  code: string;
  name: string;
  category: string;
  lines: Array<{ input: string; count: number; examples: string[] }>;
}

/** Straight-line distance in statute miles between two lat/lng points. */
export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.7613; // mean Earth radius, miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
