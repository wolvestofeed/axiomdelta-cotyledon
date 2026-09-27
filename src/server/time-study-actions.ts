'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { farmGrowPlans, farmNutrients, farmTimeStudies, farmTimeStudyIntervals } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from '@/server/access';
import { appendPosting } from '@/server/posting-log';
import { insertTimeStudy } from '@/server/seed-writes';
import { withWorkspace } from '@/server/workspace';
import { approveStandardVersion, standardRefusal } from '@/server/standard-approval';

/**
 * MicroFarm — time studies, writes. SUPER ADMIN ONLY (Roadmap O2).
 * Recording a study (always OBSERVED: a date, an observer and a quality result, the
 * task lines, and the water and supplements applied to the sowing studied; the estimates
 * are seeded, never typed), approving it — an entry on the posting trail that puts it in
 * the plan's averaged labor standard and measured consumption and approves a standard
 * version effective that day — and setting a grow plan's re-study interval.
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
  stream: z.enum(['sowing', 'daily', 'harvest']).default('sowing'),
});

const STAGE = z.enum(['soak', 'sow', 'germination', 'blackout', 'light', 'harvest-window', 'packed']);

const Water = z.object({
  day: isoDate,
  stage: STAGE,
  method: z.enum(['mist', 'bottom', 'rinse']),
  ozPerWatering: z.number().min(0, 'Ounces per watering cannot be negative').max(1_000),
  waterings: z.number().int('Waterings is a whole number').min(0).max(48),
  trays: z.number().int('Trays is a whole number').min(0).max(100_000),
});

const Supplement = z.object({
  day: isoDate,
  stage: STAGE,
  nutrientKey: z.string().trim().min(1).max(60),
  ml: z.number().min(0, 'Milliliters cannot be negative').max(1_000_000),
  trays: z.number().int('Trays is a whole number').min(0).max(100_000),
});

const StudyInput = z.object({
  growPlanId: z.string().uuid(),
  studiedOn: isoDate,
  sowingSize: z.number().int().min(1, 'Sowing size must be at least one unit').max(100_000),
  /** Days a tray was on its grow unit: what the daily lines multiply by. */
  cycleDays: z.number().int().min(0).max(365).default(0),
  observer: z.string().trim().min(1, 'Name who observed the study').max(120),
  qualityResult: z.enum(['pass', 'hold', 'fail']),
  qualityNotes: z.string().trim().max(2000).nullable().default(null),
  lines: z.array(Line).min(1, 'A study has at least one task line').max(100),
  consumption: z.object({ water: z.array(Water).max(400), supplements: z.array(Supplement).max(400) }).default({ water: [], supplements: [] }),
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
  const { growPlanId, ...study } = parsed.data;
  const known = new Set((await db.select({ key: farmNutrients.key }).from(farmNutrients)).map((r) => r.key));
  const unknown = [...new Set(study.consumption.supplements.map((e) => e.nutrientKey).filter((k) => !known.has(k)))];
  if (unknown.length) return { ok: false, error: `Not in the Nutrients & Supplements library: ${unknown.join(', ')}.` };
  const id = await insertTimeStudy(db, growPlanId, { ...study, qualityNotes: study.qualityNotes || null, basis: 'observed' }, 'user_built', access.email ?? access.userId);
  if (!id) return { ok: false, error: 'Failed to record the study.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id };
}

/**
 * Approve an observed study. It joins the plan's averaged labor standard and measured consumption at
 * once, and a standard version is approved effective today from the plan of record, so sowings from
 * today are costed at the new average; trays already sown keep the standard they were sown at. The
 * standard's conditions are checked first, so a study is never approved without its version.
 */
export async function approveTimeStudy(...args: Parameters<typeof approveTimeStudyInner>): ReturnType<typeof approveTimeStudyInner> {
  return withWorkspace(() => approveTimeStudyInner(...args));
}

async function approveTimeStudyInner(input: unknown): Promise<Result<{ label: string }>> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const today = new Date().toISOString().slice(0, 10);
  const refusal = await standardRefusal(today);
  if (refusal) return { ok: false, error: refusal };
  const found = await db
    .select({ id: farmTimeStudies.id, basis: farmTimeStudies.basis, approvedAt: farmTimeStudies.approvedAt, growPlanId: farmTimeStudies.growPlanId, studiedOn: farmTimeStudies.studiedOn, sowingSize: farmTimeStudies.sowingSize, code: farmGrowPlans.code })
    .from(farmTimeStudies)
    .innerJoin(farmGrowPlans, eq(farmGrowPlans.id, farmTimeStudies.growPlanId))
    .where(eq(farmTimeStudies.id, parsed.data.id))
    .limit(1);
  const study = found[0];
  if (!study) return { ok: false, error: 'That study no longer exists.' };
  if (study.basis !== 'observed') return { ok: false, error: 'An estimated study is not approved; it stands in until an observed one is.' };
  if (study.approvedAt) return { ok: false, error: 'That study is already approved.' };
  const who = access.email ?? access.userId;
  await db.transaction(async (tx) => {
    await tx.update(farmTimeStudies).set({ approvedAt: new Date(), approvedBy: who }).where(eq(farmTimeStudies.id, study.id));
    await appendPosting(tx, {
      actorUserId: access.userId,
      actorEmail: access.email,
      action: 'approve_time_study',
      recordKind: 'time_study',
      recordId: study.id,
      period: today.slice(0, 7),
      detail: { growPlanCode: study.code, studiedOn: study.studiedOn, sowingSize: study.sowingSize },
    });
  });
  const standard = await approveStandardVersion(access, { growPlanCode: study.code, effectiveFrom: today, notes: `Time study of ${study.studiedOn ?? 'no date'} approved` });
  if (!standard.ok) return standard;
  revalidatePath('/farm', 'layout');
  return { ok: true, label: standard.label };
}

/** Set a grow plan's re-study interval in days, or clear it with null. */
export async function setRestudyInterval(...args: Parameters<typeof setRestudyIntervalInner>): ReturnType<typeof setRestudyIntervalInner> {
  return withWorkspace(() => setRestudyIntervalInner(...args));
}

async function setRestudyIntervalInner(input: unknown): Promise<Result> {
  const parsed = z.object({ growPlanId: z.string().uuid(), intervalDays: z.number().int().min(1, 'The interval is at least one day').max(3650).nullable() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { growPlanId, intervalDays } = parsed.data;
  if (intervalDays === null) {
    await db.delete(farmTimeStudyIntervals).where(eq(farmTimeStudyIntervals.growPlanId, growPlanId));
  } else {
    await db
      .insert(farmTimeStudyIntervals)
      .values({ growPlanId, intervalDays, updatedBy: access.email ?? access.userId })
      .onConflictDoUpdate({ target: farmTimeStudyIntervals.growPlanId, set: { intervalDays, updatedBy: access.email ?? access.userId, updatedAt: new Date() } });
  }
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
