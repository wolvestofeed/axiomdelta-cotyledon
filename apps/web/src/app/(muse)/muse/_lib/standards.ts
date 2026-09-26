import 'server-only';
import { asc } from 'drizzle-orm';
import { museStandardVersions } from '@ct/db';
import { db } from '@/lib/db';
import type { StandardSnapshot, StandardVersionDoc } from '../_engine/standards';

/** Impact OS — approved standard versions, read layer (server-only). */
export async function loadStandards(): Promise<StandardVersionDoc[]> {
  const rows = await db.select().from(museStandardVersions).orderBy(asc(museStandardVersions.recipeCode), asc(museStandardVersions.version));
  return rows.map((r) => ({
    id: r.id,
    recipeCode: r.recipeCode,
    version: r.version,
    effectiveFrom: typeof r.effectiveFrom === 'string' ? r.effectiveFrom : String(r.effectiveFrom),
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt.toISOString(),
    notes: r.notes,
    snapshot: r.snapshot as StandardSnapshot,
  }));
}
