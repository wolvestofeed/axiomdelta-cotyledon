/**
 * Cotyledon — distribution pickup points, resolved (pure, client-safe).
 *
 * A seed pickup point is a name, a type, a county and a forecast. Linking it to a prospect
 * in the prospect directory turns it into a record with a real geocode, so the
 * outbound leg stops being a county centroid. The forecast stays operator-
 * editable per scenario.
 *
 * Both Pickup Points & Routes and Logistics read this, so a placement improvement shows
 * up in the same shape on both.
 */

import type { PickupPoint } from '@/data/seed-invented';
import { pickupPointCoordinates } from '@/data/pickup-point-geo';
import {
  entityRef,
  pickupPointPlacement,
  type LeanEntity,
  type PickupPointPlacement,
} from '@/engine/entity-links';
import type { PickupPointOverlay } from '@/engine/scenario';

export interface ResolvedPickupPoint {
  id: string;
  name: string;
  type: string;
  county: string;
  serviceWindow: string;
  dailyForecastUnits: number;
  /** True when the forecast comes from a subscriber pickup point linked to this distribution pickup point. */
  forecastFromSubscriber: boolean;
  /** The linked prospect prospect, when one is linked and resolvable. */
  prospectId: string | null;
  prospectName: string | null;
  placement: PickupPointPlacement;
}

/**
 * Merge the seed pickup points with the scenario's pickup point overlay and the lean prospect
 * records the browser holds. A link to a prospect the directory cannot resolve
 * keeps the id and falls back to the county centroid rather than dropping it.
 */
export function resolvePickupPoints(
  seed: PickupPoint[],
  overlay: Record<string, PickupPointOverlay>,
  prospectsByRef: Record<string, LeanEntity> = {},
  /** distribution-pickup-point id → units per day from subscriber pickup points (Roadmap H2). Wins over the seed. */
  forecastByDistributionPickupPoint: Record<string, number> = {},
): ResolvedPickupPoint[] {
  return seed.map((s) => {
    const o = overlay[s.id] ?? {};
    const prospect = o.prospectId ? prospectsByRef[entityRef('prospect', o.prospectId)] ?? null : null;
    const fromSubscriber = forecastByDistributionPickupPoint[s.id];
    return {
      id: s.id,
      name: prospect?.name ?? s.name,
      type: s.type,
      county: s.county,
      serviceWindow: s.serviceWindow,
      dailyForecastUnits: fromSubscriber ?? o.dailyForecastUnits ?? s.dailyForecastUnits,
      forecastFromSubscriber: fromSubscriber !== undefined,
      prospectId: o.prospectId ?? null,
      prospectName: prospect?.name ?? null,
      placement: pickupPointPlacement(pickupPointCoordinates(s.county), prospect),
    };
  });
}

/** The prospect refs a pickup point overlay needs hydrated. */
export function pickupPointProspectRefs(overlay: Record<string, PickupPointOverlay>): string[] {
  return Object.values(overlay)
    .map((o) => o.prospectId)
    .filter((id): id is string => !!id)
    .map((id) => entityRef('prospect', id));
}

export interface PickupPointPlacementSummary {
  total: number;
  linkedToProspect: number;
  placedFromProspect: number;
  placedFromCounty: number;
  unplaced: number;
}

export function pickupPointPlacementSummary(pickupPoints: ResolvedPickupPoint[]): PickupPointPlacementSummary {
  return {
    total: pickupPoints.length,
    linkedToProspect: pickupPoints.filter((s) => s.prospectId).length,
    placedFromProspect: pickupPoints.filter((s) => s.placement.fromLinkedProspect).length,
    placedFromCounty: pickupPoints.filter((s) => s.placement.source === 'county-centroid').length,
    unplaced: pickupPoints.filter((s) => s.placement.source === null).length,
  };
}
