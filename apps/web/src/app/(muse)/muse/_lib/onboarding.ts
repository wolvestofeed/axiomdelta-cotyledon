import 'server-only';
import { and, eq, inArray, isNull, isNotNull } from 'drizzle-orm';
import { museStaff, museTrainingDocs, museTrainingAssignments } from '@ct/db';
import { db } from '@/lib/db';
import type { StaffJoinedDocument } from '../_engine/comptable-contract';

/**
 * Impact OS — onboarding: what happens when a person joins.
 *
 * ONE entry point, deliberately. A person can join two ways — an admin adds
 * them in Muse, or CompTable announces a hire over the contract — and both call
 * `onStaffJoined`. Two code paths doing the same job drift; this one cannot.
 *
 * What it is NOT: a sweep that runs when someone opens a page. That is
 * `syncOrientationAssignments`, which stays as an idempotent BACKSTOP for drift
 * — it repairs, it does not trigger. If onboarding depended on a page being
 * opened, a hire on a quiet week would have no orientation list until somebody
 * happened to look.
 */

export interface OnboardingResult {
  staffId: string;
  /** Documents in force assigned by this call. Zero when they already held them. */
  assigned: number;
}

/**
 * Assign every training document in force to one person. Idempotent: an
 * existing assignment is left exactly as it is, so a completion is never reset
 * by a repeated event.
 */
export async function onStaffJoined(staffId: string): Promise<OnboardingResult> {
  const active = await db
    .select({ id: museTrainingDocs.id })
    .from(museTrainingDocs)
    .where(and(isNotNull(museTrainingDocs.publishedAt), isNull(museTrainingDocs.archivedAt)));
  if (active.length === 0) return { staffId, assigned: 0 };

  const held = await db
    .select({ docId: museTrainingAssignments.docId })
    .from(museTrainingAssignments)
    .where(
      and(
        eq(museTrainingAssignments.staffId, staffId),
        inArray(museTrainingAssignments.docId, active.map((d) => d.id)),
      ),
    );
  const have = new Set(held.map((h) => h.docId));
  const missing = active.filter((d) => !have.has(d.id));
  if (missing.length === 0) return { staffId, assigned: 0 };

  await db
    .insert(museTrainingAssignments)
    .values(missing.map((d) => ({ docId: d.id, staffId })))
    .onConflictDoNothing();
  return { staffId, assigned: missing.length };
}

/**
 * Handle a `comptable.staff_joined` notice: open or reactivate the local
 * register row, then onboard the person.
 *
 * The local row is a MIRROR of what CompTable owns, matched on `employeeRef`.
 * A repeat of the same event updates the mirror and assigns nothing new, so
 * redelivery is safe on its own — the contract's `eventId` ledger is belt and
 * braces over the top of that.
 *
 * Unreachable until the transport in `comptable-contract.md` §3 exists. It is
 * written now so the event path and the local path are the same code from the
 * first day either of them runs.
 */
export async function handleStaffJoined(doc: StaffJoinedDocument): Promise<OnboardingResult> {
  const email = doc.email?.toLowerCase() ?? null;
  const existing = await db
    .select({ id: museStaff.id })
    .from(museStaff)
    .where(eq(museStaff.employeeRef, doc.employeeRef))
    .limit(1);

  let staffId: string;
  if (existing[0]) {
    await db
      .update(museStaff)
      .set({ name: doc.name, role: doc.role, email, status: 'active', startedOn: doc.startedOn, updatedAt: new Date() })
      .where(eq(museStaff.id, existing[0].id));
    staffId = existing[0].id;
  } else {
    const inserted = await db
      .insert(museStaff)
      .values({
        name: doc.name,
        role: doc.role,
        email,
        employeeRef: doc.employeeRef,
        status: 'active',
        startedOn: doc.startedOn,
        createdBy: 'comptable:staff_joined',
      })
      .returning({ id: museStaff.id });
    staffId = inserted[0]!.id;
  }

  return onStaffJoined(staffId);
}
