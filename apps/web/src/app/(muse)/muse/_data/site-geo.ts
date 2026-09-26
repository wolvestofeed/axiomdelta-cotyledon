/**
 * Impact OS — coarse coordinates for the illustrative delivery sites.
 *
 * The sites in `seed-invented.ts` are invented and carry only a county. For
 * distance arithmetic they are placed at their county's centroid, taken from
 * the U.S. Census Bureau 2023 Gazetteer (public domain) as already baked into
 * the compiled supplier dataset. County-level, PLACEHOLDER precision by
 * design. A county with no centroid on file stays unplaced and is listed as
 * such rather than given a made-up distance.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export const countyCentroidsTX: Record<string, LatLng> = {
  TRAVIS: { lat: 30.239513, lng: -97.69127 },
  WILLIAMSON: { lat: 30.649082, lng: -97.605065 },
  BASTROP: { lat: 30.100772, lng: -97.310639 },
};

export function siteCoordinates(county: string): LatLng | null {
  return countyCentroidsTX[county.toUpperCase()] ?? null;
}
