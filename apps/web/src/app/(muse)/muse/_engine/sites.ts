/**
 * Impact OS — delivery sites, resolved (pure, client-safe).
 *
 * A seed site is a name, a type, a county and a forecast. Linking it to a school
 * in the prospect directory turns it into a record with a real geocode, so the
 * outbound leg stops being a county centroid. The forecast stays operator-
 * editable per scenario.
 *
 * Both Sites & Delivery and Logistics read this, so a placement improvement shows
 * up in the same shape on both.
 */

import type { Site } from '../_data/seed-invented';
import { siteCoordinates } from '../_data/site-geo';
import {
  entityRef,
  sitePlacement,
  type LeanEntity,
  type SitePlacement,
} from './entity-links';
import type { SiteOverlay } from './scenario';

export interface ResolvedSite {
  id: string;
  name: string;
  type: string;
  county: string;
  serviceWindow: string;
  dailyForecastPortions: number;
  /** True when the forecast comes from a customer site linked to this delivery site. */
  forecastFromCustomer: boolean;
  /** The linked school prospect, when one is linked and resolvable. */
  schoolId: string | null;
  schoolName: string | null;
  placement: SitePlacement;
}

/**
 * Merge the seed sites with the scenario's site overlay and the lean school
 * records the browser holds. A link to a school the directory cannot resolve
 * keeps the id and falls back to the county centroid rather than dropping it.
 */
export function resolveSites(
  seed: Site[],
  overlay: Record<string, SiteOverlay>,
  schoolsByRef: Record<string, LeanEntity> = {},
  /** Delivery-site id → meals per day from customer sites (Roadmap H2). Wins over the seed. */
  forecastByDeliverySite: Record<string, number> = {},
): ResolvedSite[] {
  return seed.map((s) => {
    const o = overlay[s.id] ?? {};
    const school = o.schoolId ? schoolsByRef[entityRef('school', o.schoolId)] ?? null : null;
    const fromCustomer = forecastByDeliverySite[s.id];
    return {
      id: s.id,
      name: school?.name ?? s.name,
      type: s.type,
      county: s.county,
      serviceWindow: s.serviceWindow,
      dailyForecastPortions: fromCustomer ?? o.dailyForecastPortions ?? s.dailyForecastPortions,
      forecastFromCustomer: fromCustomer !== undefined,
      schoolId: o.schoolId ?? null,
      schoolName: school?.name ?? null,
      placement: sitePlacement(siteCoordinates(s.county), school),
    };
  });
}

/** The school refs a site overlay needs hydrated. */
export function siteSchoolRefs(overlay: Record<string, SiteOverlay>): string[] {
  return Object.values(overlay)
    .map((o) => o.schoolId)
    .filter((id): id is string => !!id)
    .map((id) => entityRef('school', id));
}

export interface SitePlacementSummary {
  total: number;
  linkedToSchool: number;
  placedFromSchool: number;
  placedFromCounty: number;
  unplaced: number;
}

export function sitePlacementSummary(sites: ResolvedSite[]): SitePlacementSummary {
  return {
    total: sites.length,
    linkedToSchool: sites.filter((s) => s.schoolId).length,
    placedFromSchool: sites.filter((s) => s.placement.fromLinkedSchool).length,
    placedFromCounty: sites.filter((s) => s.placement.source === 'county-centroid').length,
    unplaced: sites.filter((s) => s.placement.source === null).length,
  };
}
