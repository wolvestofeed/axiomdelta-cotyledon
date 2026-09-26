import 'server-only';
import { and, asc, eq, inArray, isNull, isNotNull } from 'drizzle-orm';
import { museTrainingDocs, museTrainingAssignments, museStaff } from '@ct/db';
import { db } from '@/lib/db';
import type { TrainingAssignmentDoc, TrainingDocDoc } from '../_engine/training';

/**
 * Impact OS — training documents read layer (server-only).
 *
 * `fileBytes` is never selected here. The file is served by its own route,
 * which is the only place that reads the column.
 */

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

/** Every column except the file itself. */
const docColumns = {
  id: museTrainingDocs.id,
  docKey: museTrainingDocs.docKey,
  version: museTrainingDocs.version,
  title: museTrainingDocs.title,
  summary: museTrainingDocs.summary,
  requiredAtOrientation: museTrainingDocs.requiredAtOrientation,
  requiresRecompletion: museTrainingDocs.requiresRecompletion,
  publishedAt: museTrainingDocs.publishedAt,
  archivedAt: museTrainingDocs.archivedAt,
  supersededBy: museTrainingDocs.supersededBy,
  fileName: museTrainingDocs.fileName,
  fileMime: museTrainingDocs.fileMime,
  fileSize: museTrainingDocs.fileSize,
  notes: museTrainingDocs.notes,
};

type DocRow = { [K in keyof typeof docColumns]: unknown };

function toDoc(r: DocRow): TrainingDocDoc {
  return {
    id: r.id as string,
    docKey: r.docKey as string,
    version: r.version as number,
    title: r.title as string,
    summary: (r.summary as string | null) ?? null,
    requiredAtOrientation: r.requiredAtOrientation as boolean,
    requiresRecompletion: r.requiresRecompletion as boolean,
    publishedAt: iso(r.publishedAt as Date | null),
    archivedAt: iso(r.archivedAt as Date | null),
    supersededBy: (r.supersededBy as string | null) ?? null,
    fileName: r.fileName as string,
    fileMime: r.fileMime as string,
    fileSize: r.fileSize as number,
    notes: (r.notes as string | null) ?? null,
  };
}

/** Every version of every training document, newest family first. */
export async function listTrainingDocs(): Promise<TrainingDocDoc[]> {
  const rows = await db
    .select(docColumns)
    .from(museTrainingDocs)
    .orderBy(asc(museTrainingDocs.docKey), asc(museTrainingDocs.version));
  return rows.map(toDoc);
}

export async function listTrainingAssignments(): Promise<TrainingAssignmentDoc[]> {
  const rows = await db
    .select()
    .from(museTrainingAssignments)
    .orderBy(asc(museTrainingAssignments.assignedAt));
  return rows.map((r) => ({
    id: r.id,
    docId: r.docId,
    staffId: r.staffId,
    assignedAt: r.assignedAt.toISOString(),
    completedAt: iso(r.completedAt),
    note: r.note,
  }));
}

export interface TrainingStaff {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  startedOn: string | null;
}

/** The people a training document is assigned to: everyone on the active register. */
export async function listActiveStaff(): Promise<TrainingStaff[]> {
  const rows = await db
    .select({
      id: museStaff.id,
      name: museStaff.name,
      role: museStaff.role,
      email: museStaff.email,
      startedOn: museStaff.startedOn,
    })
    .from(museStaff)
    .where(eq(museStaff.status, 'active'))
    .orderBy(asc(museStaff.name));
  return rows.map((r) => ({
    ...r,
    startedOn: typeof r.startedOn === 'string' ? r.startedOn : (r.startedOn as Date | null)?.toISOString().slice(0, 10) ?? null,
  }));
}

/**
 * A BACKSTOP, not the trigger. Onboarding happens on the event that a person
 * joined — `onStaffJoined` in `_lib/onboarding.ts`, called when an admin adds
 * someone and when CompTable announces a hire. This sweep exists to repair
 * drift: a row written by a script or a seed, an event that never arrived, a
 * document published while someone was inactive.
 *
 * It must never become the mechanism. If onboarding depended on this, a hire in
 * a quiet week would have no orientation list until somebody happened to open
 * the Training page — which is exactly what it did before the event existed.
 *
 * Idempotent, and it never touches an existing row: a completion is not reset
 * by a later sweep.
 */
export async function syncOrientationAssignments(): Promise<number> {
  const [staff, active] = await Promise.all([
    listActiveStaff(),
    db
      .select({ id: museTrainingDocs.id })
      .from(museTrainingDocs)
      .where(and(isNotNull(museTrainingDocs.publishedAt), isNull(museTrainingDocs.archivedAt))),
  ]);
  if (staff.length === 0 || active.length === 0) return 0;

  const docIds = active.map((d) => d.id);
  const existing = await db
    .select({ docId: museTrainingAssignments.docId, staffId: museTrainingAssignments.staffId })
    .from(museTrainingAssignments)
    .where(inArray(museTrainingAssignments.docId, docIds));
  const have = new Set(existing.map((e) => `${e.docId}:${e.staffId}`));

  const missing = docIds.flatMap((docId) =>
    staff.filter((s) => !have.has(`${docId}:${s.id}`)).map((s) => ({ docId, staffId: s.id })),
  );
  if (missing.length === 0) return 0;
  await db.insert(museTrainingAssignments).values(missing).onConflictDoNothing();
  return missing.length;
}

/** The file itself, for the serving route. */
export async function getTrainingFile(
  id: string,
): Promise<{ fileName: string; fileMime: string; bytes: Buffer } | null> {
  const rows = await db
    .select({ fileName: museTrainingDocs.fileName, fileMime: museTrainingDocs.fileMime, bytes: museTrainingDocs.fileBytes })
    .from(museTrainingDocs)
    .where(eq(museTrainingDocs.id, id))
    .limit(1);
  const r = rows[0];
  if (!r || !r.bytes) return null;
  return { fileName: r.fileName, fileMime: r.fileMime, bytes: r.bytes };
}
