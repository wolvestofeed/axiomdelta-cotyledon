import 'server-only';
import { farmStandardVersions } from '@/db';
import { db } from '@/lib/db';
import { assumptionsFor } from '@/engine/scenario';
import { nextStandardVersion, standardLabel, standardSnapshot } from '@/engine/standards';
import type { requireFarmSuperAdmin } from '@/server/access';
import { postLedger } from '@/server/ledgers';
import { refuseIfLocked } from '@/server/periods';
import { appendPosting } from '@/server/posting-log';
import { getScenarioView } from '@/server/scenarios';
import { loadStandards } from '@/server/standards';

/**
 * Cotyledon — approving a standard version (Roadmap J5), shared by the Grow plans page and the
 * approval of a time study. The snapshot is the grow plan's labor standard, its variable overhead
 * per tray and the fixed overhead absorption rate, as resolved on the PLAN OF RECORD — not an open
 * forecast — frozen with an effective date. An effective date
 * inside a locked period is refused: it would re-cost sowings the lock protects. The approval is
 * an entry on the posting trail. The caller has checked the admin's access.
 */

export type StandardApproval = { ok: true; label: string } | { ok: false; error: string };

/** Why a standard cannot be approved on this date from this view, or null when it can. */
export async function standardRefusal(effectiveFrom: string): Promise<string | null> {
  const locked = await refuseIfLocked(effectiveFrom);
  if (locked) return `${locked} An approved standard cannot take effect inside it.`;
  const view = await getScenarioView();
  if (view.basis !== 'plan') return `The workspace is viewing the open forecast "${view.label ?? 'draft'}"; a standard is approved from the plan of record.`;
  return null;
}

type AdminAccess = Awaited<ReturnType<typeof requireFarmSuperAdmin>>;

export async function approveStandardVersion(access: Pick<AdminAccess, 'userId' | 'email'>, d: { growPlanCode: string; effectiveFrom: string; notes: string | null }): Promise<StandardApproval> {
  const refusal = await standardRefusal(d.effectiveFrom);
  if (refusal) return { ok: false, error: refusal };
  const [planOfRecord, standards] = await Promise.all([postLedger('plan'), loadStandards()]);
  const { inputs } = planOfRecord;
  const growPlan = inputs.growPlans.find((r) => r.code === d.growPlanCode);
  if (!growPlan) return { ok: false, error: `Grow plan ${d.growPlanCode} is not in the library.` };
  const snapshot = standardSnapshot(growPlan, assumptionsFor(inputs, d.growPlanCode), planOfRecord.ledger.absorption.ratePerUnit);
  const version = nextStandardVersion(standards, d.growPlanCode);
  const who = access.email ?? access.userId;
  return db.transaction(async (tx): Promise<StandardApproval> => {
    const rows = await tx
      .insert(farmStandardVersions)
      .values({ growPlanCode: d.growPlanCode, version, effectiveFrom: d.effectiveFrom, approvedBy: who, notes: d.notes, snapshot })
      .returning({ id: farmStandardVersions.id });
    const id = rows[0]?.id;
    if (!id) return { ok: false, error: 'Failed to record the standard.' };
    await appendPosting(tx, {
      actorUserId: access.userId,
      actorEmail: access.email,
      action: 'approve_standard',
      recordKind: 'standard',
      recordId: id,
      period: d.effectiveFrom.slice(0, 7),
      detail: { growPlanCode: d.growPlanCode, version, effectiveFrom: d.effectiveFrom, notes: d.notes },
    });
    return { ok: true, label: standardLabel({ growPlanCode: d.growPlanCode, version }) };
  });
}
