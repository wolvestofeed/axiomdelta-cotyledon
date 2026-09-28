'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { farmFiscalPeriods, farmCalendarClosures } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from '@/server/access';
import { appendPosting } from '@/server/posting-log';
import { withWorkspace } from '@/server/workspace';

/**
 * Cotyledon — period lock and the production calendar (Roadmap J1,
 * J3). Super admin only. A lock and a reopen are both entries on the posting
 * trail, written in the same transaction as the change.
 */

type Result = { ok: true } | { ok: false; error: string };
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Period must be YYYY-MM');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}

const LockInput = z.object({ period, notes: z.string().max(400).nullable().default(null) });

export async function lockPeriod(...args: Parameters<typeof lockPeriodInner>): ReturnType<typeof lockPeriodInner> {
  return withWorkspace(() => lockPeriodInner(...args));
}

async function lockPeriodInner(input: unknown): Promise<Result> {
  const parsed = LockInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const who = access.email ?? access.userId;
  const result = await db.transaction(async (tx): Promise<Result> => {
    const rows = await tx.select().from(farmFiscalPeriods).where(eq(farmFiscalPeriods.period, d.period)).limit(1);
    if (rows[0]?.status === 'locked') return { ok: false, error: `Period ${d.period} is already locked.` };
    const now = new Date();
    await tx
      .insert(farmFiscalPeriods)
      .values({ period: d.period, status: 'locked', lockedAt: now, lockedBy: who, notes: d.notes, updatedAt: now })
      .onConflictDoUpdate({ target: [farmFiscalPeriods.workspaceId, farmFiscalPeriods.period], set: { status: 'locked', lockedAt: now, lockedBy: who, notes: d.notes, updatedAt: now } });
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'lock_period', recordKind: 'period', recordId: d.period, period: d.period, detail: { notes: d.notes } });
    return { ok: true };
  });
  if (result.ok) revalidatePath('/farm', 'layout');
  return result;
}

const ReopenInput = z.object({ period, reason: z.string().trim().min(3, 'A reopen states its reason').max(400) });

export async function reopenPeriod(...args: Parameters<typeof reopenPeriodInner>): ReturnType<typeof reopenPeriodInner> {
  return withWorkspace(() => reopenPeriodInner(...args));
}

async function reopenPeriodInner(input: unknown): Promise<Result> {
  const parsed = ReopenInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const who = access.email ?? access.userId;
  const result = await db.transaction(async (tx): Promise<Result> => {
    const rows = await tx.select().from(farmFiscalPeriods).where(eq(farmFiscalPeriods.period, d.period)).limit(1);
    if (rows[0]?.status !== 'locked') return { ok: false, error: `Period ${d.period} is not locked.` };
    const now = new Date();
    await tx.update(farmFiscalPeriods).set({ status: 'open', reopenedAt: now, reopenedBy: who, updatedAt: now }).where(eq(farmFiscalPeriods.period, d.period));
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'reopen_period', recordKind: 'period', recordId: d.period, period: d.period, detail: { reason: d.reason } });
    return { ok: true };
  });
  if (result.ok) revalidatePath('/farm', 'layout');
  return result;
}

const ClosureInput = z
  .object({
    label: z.string().trim().min(1).max(120),
    kind: z.enum(['holiday', 'closure']),
    startDate: isoDate,
    endDate: isoDate,
    notes: z.string().max(400).nullable().default(null),
  })
  .refine((c) => c.endDate >= c.startDate, { message: 'The closure ends on or after it starts' });

export async function addClosure(...args: Parameters<typeof addClosureInner>): ReturnType<typeof addClosureInner> {
  return withWorkspace(() => addClosureInner(...args));
}

async function addClosureInner(input: unknown): Promise<Result> {
  const parsed = ClosureInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  await db.transaction(async (tx) => {
    const rows = await tx.insert(farmCalendarClosures).values({ ...d, createdBy: access.userId }).returning({ id: farmCalendarClosures.id });
    const id = rows[0]?.id;
    if (!id) throw new Error('Failed to record the closure.');
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'add_closure', recordKind: 'closure', recordId: id, period: d.startDate.slice(0, 7), detail: { label: d.label, kind: d.kind, startDate: d.startDate, endDate: d.endDate } });
  });
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

const RemoveClosureInput = z.object({ id: z.string().uuid() });

export async function removeClosure(...args: Parameters<typeof removeClosureInner>): ReturnType<typeof removeClosureInner> {
  return withWorkspace(() => removeClosureInner(...args));
}

async function removeClosureInner(input: unknown): Promise<Result> {
  const parsed = RemoveClosureInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id } = parsed.data;
  const result = await db.transaction(async (tx): Promise<Result> => {
    const rows = await tx.select().from(farmCalendarClosures).where(eq(farmCalendarClosures.id, id)).limit(1);
    const c = rows[0];
    if (!c) return { ok: false, error: 'Closure not found.' };
    await tx.delete(farmCalendarClosures).where(eq(farmCalendarClosures.id, id));
    const start = typeof c.startDate === 'string' ? c.startDate : String(c.startDate);
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'remove_closure', recordKind: 'closure', recordId: id, period: start.slice(0, 7), detail: { label: c.label, kind: c.kind, startDate: start, endDate: String(c.endDate) } });
    return { ok: true };
  });
  if (result.ok) revalidatePath('/farm', 'layout');
  return result;
}
