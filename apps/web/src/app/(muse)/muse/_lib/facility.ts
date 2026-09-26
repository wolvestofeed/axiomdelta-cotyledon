import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { museFacilityLayouts } from '@ct/db';
import { db } from '@/lib/db';
import { parseLayout, type FacilityLayout } from '../_engine/facility-layout';
import type { BuildPhase } from '../_engine/facility';

/**
 * Impact OS — the floor layouts, read layer (Roadmap Q6). A drawing per
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
    .from(museFacilityLayouts)
    .where(eq(museFacilityLayouts.scenarioKey, scenarioKey))
    .orderBy(desc(museFacilityLayouts.version));
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
