/**
 * Cotyledon — training documents and who has completed which (pure).
 *
 * A training document is a FAMILY with numbered versions. The file is replaced
 * from time to time and carries technical content, so a version is never
 * overwritten: each stays on file, timestamped IN (`publishedAt`) and OUT
 * (`archivedAt`) of active status. Publishing a new version archives the
 * current one at the same instant the new one takes effect — no gap, and never
 * two active versions.
 *
 * Completion is recorded against the VERSION, never the family, so "read and
 * acknowledged v1" stays true after v2 publishes.
 *
 * Nothing here reads a database or a clock; the caller passes the moment.
 */

export interface TrainingDocDoc {
  id: string;
  docKey: string;
  version: number;
  title: string;
  summary: string | null;
  requiredAtOrientation: boolean;
  requiresRecompletion: boolean;
  /** Null = a draft that has never been active. */
  publishedAt: string | null;
  /** Null on a published row = the active version. */
  archivedAt: string | null;
  supersededBy: string | null;
  fileName: string;
  fileMime: string;
  fileSize: number;
  notes: string | null;
}

export interface TrainingAssignmentDoc {
  id: string;
  docId: string;
  staffId: string;
  assignedAt: string;
  completedAt: string | null;
  note: string | null;
}

export type TrainingDocState = 'draft' | 'active' | 'archived';

export function docState(d: Pick<TrainingDocDoc, 'publishedAt' | 'archivedAt'>): TrainingDocState {
  if (!d.publishedAt) return 'draft';
  return d.archivedAt ? 'archived' : 'active';
}

export const TRAINING_STATE_LABELS: Record<TrainingDocState, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};

/** Every version of one family, newest version first. */
export function versionsOf(docs: readonly TrainingDocDoc[], docKey: string): TrainingDocDoc[] {
  return docs.filter((d) => d.docKey === docKey).sort((a, b) => b.version - a.version);
}

/** The active version of a family, or null when none is active. */
export function activeVersion(docs: readonly TrainingDocDoc[], docKey: string): TrainingDocDoc | null {
  return docs.find((d) => d.docKey === docKey && docState(d) === 'active') ?? null;
}

/** The active version of every family, by family key. */
export function activeVersions(docs: readonly TrainingDocDoc[]): TrainingDocDoc[] {
  return docs.filter((d) => docState(d) === 'active').sort((a, b) => a.title.localeCompare(b.title));
}

/** The next version number for a family. */
export function nextVersion(docs: readonly TrainingDocDoc[], docKey: string): number {
  const used = docs.filter((d) => d.docKey === docKey).map((d) => d.version);
  return used.length === 0 ? 1 : Math.max(...used) + 1;
}

/** A family key from a title: lowercase, dashes, nothing else. */
export function docKeyFrom(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'training-document';
}

export interface CompletionRow {
  staffId: string;
  assignmentId: string | null;
  assignedAt: string | null;
  completedAt: string | null;
}

export interface DocCompletion {
  docId: string;
  assigned: number;
  completed: number;
  outstanding: number;
  /** Null when nobody is assigned — not zero, which would read as "none done". */
  share: number | null;
  rows: CompletionRow[];
}

/**
 * Who has completed one version, across the people who should have.
 * `staffIds` is the population the document is assigned to; a person with no
 * assignment row appears outstanding rather than being left out of the count.
 */
export function completionFor(
  docId: string,
  assignments: readonly TrainingAssignmentDoc[],
  staffIds: readonly string[],
): DocCompletion {
  const mine = assignments.filter((a) => a.docId === docId);
  const byStaff = new Map(mine.map((a) => [a.staffId, a]));
  const rows: CompletionRow[] = staffIds.map((staffId) => {
    const a = byStaff.get(staffId);
    return {
      staffId,
      assignmentId: a?.id ?? null,
      assignedAt: a?.assignedAt ?? null,
      completedAt: a?.completedAt ?? null,
    };
  });
  const completed = rows.filter((r) => r.completedAt !== null).length;
  return {
    docId,
    assigned: rows.length,
    completed,
    outstanding: rows.length - completed,
    share: rows.length > 0 ? completed / rows.length : null,
    rows,
  };
}

/**
 * One line stating the actual state of a document's completion.
 *
 * The case this exists for: with nobody on the register, `completed === 0` and
 * `outstanding === 0`, and any phrasing built from "outstanding" alone reads as
 * "everyone is current" — the opposite of the truth. Assignment is a RULE
 * (everyone on the register), not a list, so an empty register is reported as
 * an empty register and never as a document that has been read.
 */
export function completionHeadline(c: DocCompletion): string {
  if (c.assigned === 0) {
    return 'Assigned to everyone on the staff register. Nobody is on the register yet, so no one has completed it.';
  }
  if (c.completed === 0) {
    return `Assigned to all ${c.assigned}. No one has completed it yet.`;
  }
  if (c.outstanding === 0) {
    return `All ${c.assigned} have completed it.`;
  }
  return `${c.completed} of ${c.assigned} have completed it; ${c.outstanding} outstanding.`;
}

/**
 * What one person still has to read: every active version they are assigned to
 * and have not completed. This is the orientation list for a new hire, and the
 * re-read list for everyone after a revision that asked for it.
 */
export function outstandingFor(
  staffId: string,
  docs: readonly TrainingDocDoc[],
  assignments: readonly TrainingAssignmentDoc[],
): TrainingDocDoc[] {
  const active = new Map(activeVersions(docs).map((d) => [d.id, d]));
  return assignments
    .filter((a) => a.staffId === staffId && a.completedAt === null && active.has(a.docId))
    .map((a) => active.get(a.docId)!)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export interface PublishPlan {
  /** The version being replaced, if any. */
  archives: TrainingDocDoc | null;
  version: number;
  /** Staff who need an assignment to the new version. */
  assignTo: string[];
  /**
   * Why those people and not others — stated so the record carries the reason
   * rather than leaving it to be inferred from the dates.
   */
  reason: string;
}

/**
 * What publishing a new version does.
 *
 * `requiresRecompletion` is the publisher's choice, defaulted ON where it is
 * offered: a revision that changes technical content asks everyone to read it
 * again. With it off, the people who had completed the version being replaced
 * carry that completion forward and are not asked again; anyone who had not
 * completed it — and every new hire after — still has to.
 */
export function planPublish(
  docKey: string,
  docs: readonly TrainingDocDoc[],
  assignments: readonly TrainingAssignmentDoc[],
  activeStaffIds: readonly string[],
  requiresRecompletion: boolean,
): PublishPlan {
  const archives = activeVersion(docs, docKey);
  const version = nextVersion(docs, docKey);
  if (requiresRecompletion || !archives) {
    return {
      archives,
      version,
      assignTo: [...activeStaffIds],
      reason: archives
        ? 'Everyone re-completes: the publisher marked this revision as one that must be read again.'
        : 'First version: assigned to every active staff member.',
    };
  }
  const done = new Set(
    assignments.filter((a) => a.docId === archives.id && a.completedAt !== null).map((a) => a.staffId),
  );
  const assignTo = activeStaffIds.filter((id) => !done.has(id));
  return {
    archives,
    version,
    assignTo,
    reason: `Carried forward: ${done.size} who completed v${archives.version} are not asked again; ${assignTo.length} still to read it.`,
  };
}
