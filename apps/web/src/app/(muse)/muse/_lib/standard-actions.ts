'use server';

import { revalidatePath } from 'next/cache';
import { assumptionsFor } from '../_engine/scenario';
import { z } from 'zod';
import { museStandardVersions } from '@ct/db';
import { db } from '@/lib/db';
import { accessRefusal, requireMuseSuperAdmin } from './access';
import { postLedger } from './ledgers';
import { loadStandards } from './standards';
import { refuseIfLocked } from './periods';
import { appendPosting } from './posting-log';
import { nextStandardVersion, standardLabel, type StandardSnapshot } from '../_engine/standards';

/**
 * Impact OS — approving a standard-cost version (Roadmap J5).
 * Super admin only (Robert, 2026-09-14). The snapshot is the recipe as
 * resolved on the PLAN OF RECORD — not an open forecast — with the plan's cost
 * assumptions, frozen with an effective date. An effective date inside a
 * locked period is refused: it would re-cost batches the lock protects. The
 * approval is an entry on the posting trail.
 */

type Result = { ok: true; label: string } | { ok: false; error: string };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const ApproveInput = z.object({
  recipeCode: z.string().min(1),
  effectiveFrom: isoDate,
  notes: z.string().max(400).nullable().default(null),
});

export async function approveStandard(input: unknown): Promise<Result> {
  const parsed = ApproveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const d = parsed.data;
  const locked = await refuseIfLocked(d.effectiveFrom);
  if (locked) return { ok: false, error: `${locked} An approved standard cannot take effect inside it.` };

  // The plan of record posted as a Plan ledger: its recipes and assumptions, and the
  // absorption rate set on its own production (Roadmap N5 / N6).
  const [planOfRecord, standards] = await Promise.all([postLedger('plan'), loadStandards()]);
  const { inputs } = planOfRecord;
  const { basis, label } = planOfRecord.view;
  if (basis !== 'plan') return { ok: false, error: `The workspace is viewing the open forecast "${label ?? 'draft'}"; a standard is approved from the plan of record.` };
  const recipe = inputs.recipes.find((r) => r.code === d.recipeCode);
  if (!recipe) return { ok: false, error: `Recipe ${d.recipeCode} is not in the library.` };
  // Frozen: the recipe's OWN assumptions — its labor standard and packaging —
  // and the overhead absorption rate in force today (Roadmap N3). None of the
  // three moves until a later version is approved.
  const snapshot: StandardSnapshot = {
    recipe,
    assumptions: assumptionsFor(inputs, d.recipeCode),
    overheadRatePerMeal: planOfRecord.ledger.absorption.ratePerMeal,
  };
  const version = nextStandardVersion(standards, d.recipeCode);
  const who = access.email ?? access.userId;

  const result = await db.transaction(async (tx): Promise<Result> => {
    const rows = await tx
      .insert(museStandardVersions)
      .values({ recipeCode: d.recipeCode, version, effectiveFrom: d.effectiveFrom, approvedBy: who, notes: d.notes, snapshot })
      .returning({ id: museStandardVersions.id });
    const id = rows[0]?.id;
    if (!id) return { ok: false, error: 'Failed to record the standard.' };
    await appendPosting(tx, {
      actorUserId: access.userId,
      actorEmail: access.email,
      action: 'approve_standard',
      recordKind: 'standard',
      recordId: id,
      period: d.effectiveFrom.slice(0, 7),
      detail: { recipeCode: d.recipeCode, version, effectiveFrom: d.effectiveFrom, notes: d.notes },
    });
    return { ok: true, label: standardLabel({ recipeCode: d.recipeCode, version }) };
  });
  if (result.ok) revalidatePath('/muse', 'layout');
  return result;
}
