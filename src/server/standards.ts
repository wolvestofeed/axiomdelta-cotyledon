import 'server-only';
import { asc } from 'drizzle-orm';
import { farmStandardVersions } from '@/db';
import { db } from '@/lib/db';
import { readSnapshot, type StandardVersionDoc } from '@/engine/standards';

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
    snapshot: readSnapshot(r.snapshot),
  }));
}
