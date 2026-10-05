import 'server-only';
import { and, eq, inArray, isNull, isNotNull } from 'drizzle-orm';
import { farmTrainingDocs, farmTrainingAssignments } from '@/db';
import { db } from '@/lib/db';

/**
 * Cotyledon — onboarding: what happens when a person joins.
 *
 * ONE entry point, deliberately: an admin adding a person on Staffing calls
 * `onStaffJoined`, and so will any future path, so the two cannot drift.
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
    .select({ id: farmTrainingDocs.id })
    .from(farmTrainingDocs)
    .where(and(isNotNull(farmTrainingDocs.publishedAt), isNull(farmTrainingDocs.archivedAt)));
  if (active.length === 0) return { staffId, assigned: 0 };

  const held = await db
    .select({ docId: farmTrainingAssignments.docId })
    .from(farmTrainingAssignments)
    .where(
      and(
        eq(farmTrainingAssignments.staffId, staffId),
        inArray(farmTrainingAssignments.docId, active.map((d) => d.id)),
      ),
    );
  const have = new Set(held.map((h) => h.docId));
  const missing = active.filter((d) => !have.has(d.id));
  if (missing.length === 0) return { staffId, assigned: 0 };

  await db
    .insert(farmTrainingAssignments)
    .values(missing.map((d) => ({ docId: d.id, staffId })))
    .onConflictDoNothing();
  return { staffId, assigned: missing.length };
}
