import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { musePostingLog } from '@ct/db';
import { db } from '@/lib/db';
import type { PlanOfRecordEntry } from '../_engine/plan-of-record';
import type { MuseScenarioConfig } from '../_engine/scenario';

/** Every change of the plan of record on the posting trail, oldest first (Roadmap N7). */
export async function listPlanOfRecordHistory(): Promise<PlanOfRecordEntry[]> {
  const rows = await db
    .select({ recordId: musePostingLog.recordId, occurredAt: musePostingLog.occurredAt, detail: musePostingLog.detail })
    .from(musePostingLog)
    .where(and(eq(musePostingLog.action, 'set_plan_of_record'), eq(musePostingLog.recordKind, 'scenario')))
    .orderBy(asc(musePostingLog.seq));
  return rows.map((r) => {
    const d = (r.detail ?? {}) as { label?: string; appliedAt?: string; config?: MuseScenarioConfig; snapshot?: unknown };
    return { scenarioId: r.recordId, label: d.label ?? 'Forecast', appliedAt: d.appliedAt ?? r.occurredAt.toISOString(), config: d.config ?? {}, snapshot: d.snapshot };
  });
}
