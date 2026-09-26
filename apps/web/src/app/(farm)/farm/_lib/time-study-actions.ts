'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { farmTimeStudies, farmTimeStudyIntervals } from '@mf/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from './access';
import { appendPosting } from './posting-log';
import { insertTimeStudy } from './seed-writes';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

/**
 * MicroFarm — time studies, writes. SUPER ADMIN ONLY (Roadmap O2).
 * Recording a study (always OBSERVED: a date, an observer and a quality result;
 * the estimates are seeded, never typed), adopting one as the crop plan's labor
 * standard — an entry on the posting trail — and setting a crop plan's re-study interval.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });

const Line = z.object({
  task: z.string().trim().min(1, 'Name each task').max(200),
  station: z.string().trim().max(120).nullable().default(null),
  staff: z.number().int().min(0).max(100),
  elapsedMinutes: z.number().min(0).max(10_000),
  laborMinutes: z.number().min(0).max(100_000),
  scalesWith: z.enum(['fixed', 'variable']),
  stream: z.enum(['sowing', 'harvest']).default('sowing'),
});

const StudyInput = z.object({
  cropPlanId: z.string().uuid(),
  studiedOn: isoDate,
  sowingSize: z.number().int().min(1, 'Sowing size must be at least one unit').max(100_000),
  observer: z.string().trim().min(1, 'Name who observed the study').max(120),
  qualityResult: z.enum(['pass', 'hold', 'fail']),
  qualityNotes: z.string().trim().max(2000).nullable().default(null),
  lines: z.array(Line).min(1, 'A study has at least one task line').max(100),
});

export async function recordTimeStudy(...args: Parameters<typeof recordTimeStudyInner>): ReturnType<typeof recordTimeStudyInner> {
  return withWorkspace(() => recordTimeStudyInner(...args));
}

async function recordTimeStudyInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = StudyInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { cropPlanId, ...study } = parsed.data;
  const id = await insertTimeStudy(db, cropPlanId, { ...study, qualityNotes: study.qualityNotes || null, basis: 'observed' }, 'user_built', access.email ?? access.userId);
  if (!id) return { ok: false, error: 'Failed to record the study.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id };
}

/** Adopt a study as its crop plan's labor standard. The adoption is an entry on the posting trail. */
export async function adoptTimeStudy(...args: Parameters<typeof adoptTimeStudyInner>): ReturnType<typeof adoptTimeStudyInner> {
  return withWorkspace(() => adoptTimeStudyInner(...args));
}

async function adoptTimeStudyInner(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const who = access.email ?? access.userId;
  const result = await db.transaction(async (tx): Promise<Result> => {
    const rows = await tx
      .update(farmTimeStudies)
      .set({ adoptedAt: new Date(), adoptedBy: who })
      .where(eq(farmTimeStudies.id, parsed.data.id))
      .returning({ id: farmTimeStudies.id, cropPlanId: farmTimeStudies.cropPlanId, studiedOn: farmTimeStudies.studiedOn, sowingSize: farmTimeStudies.sowingSize });
    const row = rows[0];
    if (!row) return { ok: false, error: 'That study no longer exists.' };
    await appendPosting(tx, {
      actorUserId: access.userId,
      actorEmail: access.email,
      action: 'adopt_time_study',
      recordKind: 'time_study',
      recordId: row.id,
      period: new Date().toISOString().slice(0, 7),
      detail: { cropPlanId: row.cropPlanId, studiedOn: row.studiedOn, sowingSize: row.sowingSize },
    });
    return { ok: true };
  });
  if (result.ok) revalidatePath('/farm', 'layout');
  return result;
}

/** Set a crop plan's re-study interval in days, or clear it with null. */
export async function setRestudyInterval(...args: Parameters<typeof setRestudyIntervalInner>): ReturnType<typeof setRestudyIntervalInner> {
  return withWorkspace(() => setRestudyIntervalInner(...args));
}

async function setRestudyIntervalInner(input: unknown): Promise<Result> {
  const parsed = z.object({ cropPlanId: z.string().uuid(), intervalDays: z.number().int().min(1, 'The interval is at least one day').max(3650).nullable() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { cropPlanId, intervalDays } = parsed.data;
  if (intervalDays === null) {
    await db.delete(farmTimeStudyIntervals).where(eq(farmTimeStudyIntervals.cropPlanId, cropPlanId));
  } else {
    await db
      .insert(farmTimeStudyIntervals)
      .values({ cropPlanId, intervalDays, updatedBy: access.email ?? access.userId })
      .onConflictDoUpdate({ target: farmTimeStudyIntervals.cropPlanId, set: { intervalDays, updatedBy: access.email ?? access.userId, updatedAt: new Date() } });
  }
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
