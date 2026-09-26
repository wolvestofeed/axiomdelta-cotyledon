'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, isNull, isNotNull } from 'drizzle-orm';
import { farmTrainingDocs, farmTrainingAssignments } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmOperator, requireFarmSuperAdmin } from '@/server/access';
import { listActiveStaff, listTrainingAssignments, listTrainingDocs } from '@/server/training';
import { activeVersion, planPublish } from '@/engine/training';
import { withWorkspace } from '@/server/workspace';

/**
 * MicroFarm — training documents, writes.
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
export async function publishTrainingDoc(...args: Parameters<typeof publishTrainingDocInner>): ReturnType<typeof publishTrainingDocInner> {
  return withWorkspace(() => publishTrainingDocInner(...args));
}

async function publishTrainingDocInner(input: unknown): Promise<Result<{ assigned: number; reason: string }>> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
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
        .update(farmTrainingDocs)
        .set({ archivedAt: now, supersededBy: draft.id, updatedAt: now })
        .where(eq(farmTrainingDocs.id, plan.archives.id));
    }
    await tx
      .update(farmTrainingDocs)
      .set({ publishedAt: now, publishedBy: access.userId, updatedAt: now })
      .where(eq(farmTrainingDocs.id, draft.id));
    if (plan.assignTo.length > 0) {
      await tx
        .insert(farmTrainingAssignments)
        .values(plan.assignTo.map((staffId) => ({ docId: draft.id, staffId, assignedAt: now })))
        .onConflictDoNothing();
    }
  });

  revalidatePath('/farm', 'layout');
  return { ok: true, assigned: plan.assignTo.length, reason: plan.reason };
}

/**
 * Set, on a draft, whether publishing it asks everyone to read it again. The
 * choice belongs at the moment of publishing, so it stays editable until then
 * and is frozen onto the version once it goes live.
 */
export async function setDraftRecompletion(...args: Parameters<typeof setDraftRecompletionInner>): ReturnType<typeof setDraftRecompletionInner> {
  return withWorkspace(() => setDraftRecompletionInner(...args));
}

async function setDraftRecompletionInner(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid(), requiresRecompletion: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const updated = await db
    .update(farmTrainingDocs)
    .set({ requiresRecompletion: parsed.data.requiresRecompletion, updatedAt: new Date() })
    .where(and(eq(farmTrainingDocs.id, parsed.data.id), isNull(farmTrainingDocs.publishedAt)))
    .returning({ id: farmTrainingDocs.id });
  if (!updated[0]) return { ok: false, error: 'That version is already published; the choice is part of its record.' };
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

/** Archive the active version without replacing it: nothing is then in force. */
export async function archiveTrainingDoc(...args: Parameters<typeof archiveTrainingDocInner>): ReturnType<typeof archiveTrainingDocInner> {
  return withWorkspace(() => archiveTrainingDocInner(...args));
}

async function archiveTrainingDocInner(input: unknown): Promise<Result> {
  const parsed = z.object({ docKey: z.string().trim().min(1).max(200) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const docs = await listTrainingDocs();
  const active = activeVersion(docs, parsed.data.docKey);
  if (!active) return { ok: false, error: 'Nothing is active for that document.' };
  await db
    .update(farmTrainingDocs)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(farmTrainingDocs.id, active.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

/** Discard a draft that was never published. A published version is never deleted. */
export async function deleteTrainingDraft(...args: Parameters<typeof deleteTrainingDraftInner>): ReturnType<typeof deleteTrainingDraftInner> {
  return withWorkspace(() => deleteTrainingDraftInner(...args));
}

async function deleteTrainingDraftInner(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const deleted = await db
    .delete(farmTrainingDocs)
    .where(and(eq(farmTrainingDocs.id, parsed.data.id), isNull(farmTrainingDocs.publishedAt)))
    .returning({ id: farmTrainingDocs.id });
  if (!deleted[0]) return { ok: false, error: 'Only a draft that was never published can be discarded.' };
  revalidatePath('/farm', 'layout');
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
export async function completeTraining(...args: Parameters<typeof completeTrainingInner>): ReturnType<typeof completeTrainingInner> {
  return withWorkspace(() => completeTrainingInner(...args));
}

async function completeTrainingInner(input: unknown): Promise<Result> {
  const parsed = CompleteInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmOperator();
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
    .update(farmTrainingAssignments)
    .set({ completedAt: new Date(), note: parsed.data.note ?? null, updatedAt: new Date() })
    .where(
      and(
        eq(farmTrainingAssignments.docId, parsed.data.docId),
        eq(farmTrainingAssignments.staffId, staffId),
        isNull(farmTrainingAssignments.completedAt),
      ),
    )
    .returning({ id: farmTrainingAssignments.id });
  if (!updated[0]) return { ok: false, error: 'Nothing outstanding for you on that document.' };
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

/**
 * Assign the active version to everyone on the register who does not have it.
 * Assignment follows the register, so this is only needed when someone joins
 * between page loads.
 */
export async function assignActiveTraining(...args: Parameters<typeof assignActiveTrainingInner>): ReturnType<typeof assignActiveTrainingInner> {
  return withWorkspace(() => assignActiveTrainingInner(...args));
}

async function assignActiveTrainingInner(): Promise<Result<{ assigned: number }>> {
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const [staff, active] = await Promise.all([
    listActiveStaff(),
    db
      .select({ id: farmTrainingDocs.id })
      .from(farmTrainingDocs)
      .where(and(isNotNull(farmTrainingDocs.publishedAt), isNull(farmTrainingDocs.archivedAt))),
  ]);
  const rows = active.flatMap((d) => staff.map((s) => ({ docId: d.id, staffId: s.id })));
  if (rows.length === 0) return { ok: true, assigned: 0 };
  const inserted = await db
    .insert(farmTrainingAssignments)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: farmTrainingAssignments.id });
  revalidatePath('/farm', 'layout');
  return { ok: true, assigned: inserted.length };
}
