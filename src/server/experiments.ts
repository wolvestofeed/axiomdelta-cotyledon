import 'server-only';
import { asc } from 'drizzle-orm';
import { farmExperiments } from '@/db';
import { db } from '@/lib/db';
import { experimentsOnShelves, type ExperimentDoc } from '@/engine/experiments';
import type { SowingRecordDoc } from '@/engine/actuals';
import type { GrowPlanDef } from '@/data/grow-plan';

/** Cotyledon — experiments in R&D, read layer (server-only). */

const iso = (d: string | Date): string => (typeof d === 'string' ? d : d.toISOString().slice(0, 10));

export async function listExperiments(): Promise<ExperimentDoc[]> {
  const rows = await db.select().from(farmExperiments).orderBy(asc(farmExperiments.sowDate), asc(farmExperiments.createdAt));
  return rows.map((r) => ({ id: r.id, title: r.title, growPlanCode: r.growPlanCode, sowDate: iso(r.sowDate), trays: r.trays, note: r.note }));
}

/** The open experiments the shelf ledger places beside the recorded sowings. */
export async function experimentSowings(sowings: readonly SowingRecordDoc[], plans: readonly GrowPlanDef[], today: string): Promise<{ growPlanCode: string; sowDate: string; trays: number; experiment: string }[]> {
  return experimentsOnShelves(await listExperiments(), sowings, plans, today);
}
