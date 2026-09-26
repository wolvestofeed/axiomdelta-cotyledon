'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { museTrainingDocs, museTrainingAssignments } from '@ct/db';
import { db } from '@/lib/db';
import { accessRefusal, requireMuseOperator, requireMuseSuperAdmin } from './access';
import { listActiveStaff, listTrainingAssignments, listTrainingDocs } from './training';
import { activeVersion, planPublish } from '../_engine/training';

/**
 * Impact OS — training documents, writes.
 *
 * Publishing is SUPER ADMIN ONLY. Completing is the signed-in person's own
 * act: an operator marks their own assignment read and can mark no one else's,
 * because an acknowledgement someone else can record on your behalf is not an
 * acknowledgement.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });

/**
 * Take a draft version live.
 *
 * The version being replaced is archived at the SAME instant the new one takes
 * effect, so the record shows neither a gap nor two active versions, and the
 * archived row records which version replaced it.
 *
 * `requiresRecompletion` is the publisher's choice, carried on the version:
 * everyone re-reads it, or the people who completed the previous version carry
 * that forward. Either way the reason is on the record.
 */
export async function publishTrainingDoc(input: unknown): Promise<Result<{ assigned: number; reason: string }>> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }

  const [docs, assignments, staff] = await Promise.all([listTrainingDocs(), listTrainingAssignments(), listActiveStaff()]);
  const draft = docs.find((d) => d.id === parsed.data.id);
  if (!draft) return { ok: false, error: 'That version no longer exists.' };
  if (draft.publishedAt) return { ok: false, error: 'That version is already published.' };

  const plan = planPublish(draft.docKey, docs, assignments, staff.map((s) => s.id), draft.requiresRecompletion);
  const now = new Date();

  await db.transaction(async (tx) => {
    if (plan.archives) {
      await tx
        .update(museTrainingDocs)
        .set({ archivedAt: now, supersededBy: draft.id, updatedAt: now })
        .where(eq(museTrainingDocs.id, plan.archives.id));
    }
    await tx
      .update(museTrainingDocs)
      .set({ publishedAt: now, publishedBy: access.userId, updatedAt: now })
      .where(eq(museTrainingDocs.id, draft.id));
    if (plan.assignTo.length > 0) {
      await tx
        .insert(museTrainingAssignments)
        .values(plan.assignTo.map((staffId) => ({ docId: draft.id, staffId, assignedAt: now })))
        .onConflictDoNothing();
    }
  });

  revalidatePath('/muse', 'layout');
  return { ok: true, assigned: plan.assignTo.length, reason: plan.reason };
}

/**
 * Set, on a draft, whether publishing it asks everyone to read it again. The
 * choice belongs at the moment of publishing, so it stays editable until then
 * and is frozen onto the version once it goes live.
 */
export async function setDraftRecompletion(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid(), requiresRecompletion: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const updated = await db
    .update(museTrainingDocs)
    .set({ requiresRecompletion: parsed.data.requiresRecompletion, updatedAt: new Date() })
    .where(and(eq(museTrainingDocs.id, parsed.data.id), isNull(museTrainingDocs.publishedAt)))
    .returning({ id: museTrainingDocs.id });
  if (!updated[0]) return { ok: false, error: 'That version is already published; the choice is part of its record.' };
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

/** Archive the active version without replacing it: nothing is then in force. */
export async function archiveTrainingDoc(input: unknown): Promise<Result> {
  const parsed = z.object({ docKey: z.string().trim().min(1).max(200) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const docs = await listTrainingDocs();
  const active = activeVersion(docs, parsed.data.docKey);
  if (!active) return { ok: false, error: 'Nothing is active for that document.' };
  await db
    .update(museTrainingDocs)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(museTrainingDocs.id, active.id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

/** Discard a draft that was never published. A published version is never deleted. */
export async function deleteTrainingDraft(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const deleted = await db
    .delete(museTrainingDocs)
    .where(and(eq(museTrainingDocs.id, parsed.data.id), isNull(museTrainingDocs.publishedAt)))
    .returning({ id: museTrainingDocs.id });
  if (!deleted[0]) return { ok: false, error: 'Only a draft that was never published can be discarded.' };
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

const CompleteInput = z.object({
  docId: z.string().uuid(),
  note: z.string().trim().max(1000).optional(),
});

/**
 * Record that the signed-in person has read a document. Their own assignment
 * only: the staff record matched to their sign-in email is the one that can be
 * completed, and an already-completed assignment keeps its first timestamp.
 */
export async function completeTraining(input: unknown): Promise<Result> {
  const parsed = CompleteInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  // The staff row matched to this sign-in (Roadmap O5). No row, nothing to
  // complete against — an acknowledgement has to belong to a named person.
  const staffId = access.staffId;
  if (!staffId) {
    return {
      ok: false,
      error: 'Your sign-in is not matched to a staff record, so there is nothing to complete against it.',
    };
  }
  const updated = await db
    .update(museTrainingAssignments)
    .set({ completedAt: new Date(), note: parsed.data.note ?? null, updatedAt: new Date() })
    .where(
      and(
        eq(museTrainingAssignments.docId, parsed.data.docId),
        eq(museTrainingAssignments.staffId, staffId),
        isNull(museTrainingAssignments.completedAt),
      ),
    )
    .returning({ id: museTrainingAssignments.id });
  if (!updated[0]) return { ok: false, error: 'Nothing outstanding for you on that document.' };
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

/**
 * Assign the active version to everyone on the register who does not have it.
 * Assignment follows the register, so this is only needed when someone joins
 * between page loads.
 */
export async function assignActiveTraining(): Promise<Result<{ assigned: number }>> {
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const [staff, active] = await Promise.all([
    listActiveStaff(),
    db
      .select({ id: museTrainingDocs.id })
      .from(museTrainingDocs)
      .where(and(isNotNull(museTrainingDocs.publishedAt), isNull(museTrainingDocs.archivedAt))),
  ]);
  const rows = active.flatMap((d) => staff.map((s) => ({ docId: d.id, staffId: s.id })));
  if (rows.length === 0) return { ok: true, assigned: 0 };
  const inserted = await db
    .insert(museTrainingAssignments)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: museTrainingAssignments.id });
  revalidatePath('/muse', 'layout');
  return { ok: true, assigned: inserted.length };
}
