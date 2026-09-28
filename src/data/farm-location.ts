/**
 * Cotyledon — home / facility location.
 *
 * PLACEHOLDER PIN. The exact facility address is still to be confirmed. Per
 * the operator: "just south of Lady Bird Lake, right at the separation of
 * downtown and South Austin." The coordinates below drop the home pin at the
 * South Congress / Riverside seam, immediately south of the Colorado River.
 *
 * When the real address lands, update `address`, `lat`, `lng`, and flip
 * `approximate` to false. This is the single source of truth for the home pin.
 */
export const FARM_HOME = {
  name: 'Home grow room',
  address: 'South Austin — just south of Lady Bird Lake (exact address TBD)',
  lat: 30.2516,
  lng: -97.7492,
  approximate: true,
} as const;
