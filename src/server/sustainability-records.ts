import 'server-only';
import { asc } from 'drizzle-orm';
import { farmRefrigerantService, farmSustainabilityReadings } from '@/db';
import { db } from '@/lib/db';
import type { ReadingDoc, ReadingMetric, RefrigerantServiceDoc } from '@/engine/sustainability-records';

/** Sustainability records on file (migration 0072). */
export async function listReadings(): Promise<ReadingDoc[]> {
  const rows = await db.select().from(farmSustainabilityReadings).orderBy(asc(farmSustainabilityReadings.readOn));
  return rows.map((r) => ({ id: r.id, metric: r.metric as ReadingMetric, periodStart: r.periodStart, readOn: r.readOn, quantity: r.quantity, sourceId: r.sourceId, notes: r.notes, recordedBy: r.recordedBy }));
}

export async function listRefrigerantService(): Promise<RefrigerantServiceDoc[]> {
  const rows = await db.select().from(farmRefrigerantService).orderBy(asc(farmRefrigerantService.servicedOn));
  return rows.map((r) => ({ id: r.id, equipmentKey: r.equipmentKey, servicedOn: r.servicedOn, lbAdded: r.lbAdded, sourceId: r.sourceId, technician: r.technician, notes: r.notes, recordedBy: r.recordedBy }));
}
