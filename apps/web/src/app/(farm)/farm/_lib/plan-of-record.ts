import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { farmPostingLog } from '@mf/db';
import { db } from '@/lib/db';
import type { PlanOfRecordEntry } from '../_engine/plan-of-record';
import type { FarmScenarioConfig } from '../_engine/scenario';

/** Every change of the plan of record on the posting trail, oldest first (Roadmap N7). */
export async function listPlanOfRecordHistory(): Promise<PlanOfRecordEntry[]> {
  const rows = await db
    .select({ recordId: farmPostingLog.recordId, occurredAt: farmPostingLog.occurredAt, detail: farmPostingLog.detail })
    .from(farmPostingLog)
    .where(and(eq(farmPostingLog.action, 'set_plan_of_record'), eq(farmPostingLog.recordKind, 'scenario')))
    .orderBy(asc(farmPostingLog.seq));
  return rows.map((r) => {
    const d = (r.detail ?? {}) as { label?: string; appliedAt?: string; config?: FarmScenarioConfig; snapshot?: unknown };
    return { scenarioId: r.recordId, label: d.label ?? 'Forecast', appliedAt: d.appliedAt ?? r.occurredAt.toISOString(), config: d.config ?? {}, snapshot: d.snapshot };
  });
}
