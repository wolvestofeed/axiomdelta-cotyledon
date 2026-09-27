import 'server-only';
import { asc } from 'drizzle-orm';
import { farmStandardVersions } from '@/db';
import { db } from '@/lib/db';
import type { StandardSnapshot, StandardVersionDoc } from '@/engine/standards';

/** MicroFarm — approved standard versions, read layer (server-only). */
export async function loadStandards(): Promise<StandardVersionDoc[]> {
  const rows = await db.select().from(farmStandardVersions).orderBy(asc(farmStandardVersions.growPlanCode), asc(farmStandardVersions.version));
  return rows.map((r) => ({
    id: r.id,
    growPlanCode: r.growPlanCode,
    version: r.version,
    effectiveFrom: typeof r.effectiveFrom === 'string' ? r.effectiveFrom : String(r.effectiveFrom),
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt.toISOString(),
    notes: r.notes,
    snapshot: snapshotFrom(r.snapshot),
  }));
}

/**
 * A stored snapshot as the engine reads it. A snapshot frozen before the library held plain grow
 * plans carries the grow plan inside the old projected shape, as `growPlan.plan`; the grow plan is
 * read from there. Its frozen line prices were on the projected lines and are not carried over.
 */
function snapshotFrom(raw: unknown): StandardSnapshot {
  const snap = raw as StandardSnapshot & { growPlan: { lines?: unknown; plan?: StandardSnapshot['growPlan'] } };
  if (!Array.isArray(snap.growPlan.lines) && snap.growPlan.plan) return { ...snap, growPlan: snap.growPlan.plan };
  return snap;
}
