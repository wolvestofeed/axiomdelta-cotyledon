import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { farmFacilityLayouts } from '@/db';
import { db } from '@/lib/db';
import { parseLayout, type FacilityLayout } from '@/engine/facility-layout';
import type { BuildPhase } from '@/engine/facility';

/**
 * Cotyledon — the floor layouts, read layer (Roadmap Q6). A drawing per
 * scenario key and build phase; the latest version of each is what the page
 * shows. `scenarioKey` is the scenario id the page renders, or 'plan-data'
 * when no plan of record is set.
 */

export const PLAN_DATA_KEY = 'plan-data';

export interface SavedFacilityLayout {
  id: string;
  phase: BuildPhase;
  version: number;
  label: string;
  layout: FacilityLayout;
  createdAt: string;
  createdBy: string | null;
}

/** The latest drawing for each build phase under a scenario key. */
export async function listFacilityLayouts(scenarioKey: string): Promise<SavedFacilityLayout[]> {
  const rows = await db
    .select()
    .from(farmFacilityLayouts)
    .where(eq(farmFacilityLayouts.scenarioKey, scenarioKey))
    .orderBy(desc(farmFacilityLayouts.version));
  const latest = new Map<number, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.buildPhase)) latest.set(r.buildPhase, r);
  return [...latest.values()]
    .sort((a, b) => a.buildPhase - b.buildPhase)
    .map((r) => ({
      id: r.id,
      phase: (r.buildPhase === 2 || r.buildPhase === 3 ? r.buildPhase : 1) as BuildPhase,
      version: r.version,
      label: r.label,
      layout: parseLayout({ widthFt: r.shellWidthFt, depthFt: r.shellDepthFt }, r.layout),
      createdAt: r.createdAt.toISOString(),
      createdBy: r.createdBy,
    }));
}
