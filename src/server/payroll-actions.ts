'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { farmStaff, farmTimePunches } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmOperator, requireFarmSuperAdmin } from '@/server/access';
import { refuseIfLocked } from '@/server/periods';
import { onStaffJoined } from '@/server/onboarding';
import { appendPosting } from '@/server/posting-log';
import { periodOf } from '@/engine/actuals';
import { WORK_ROLES, clockStateOf, isWorkRole, localDate, punchRefusal, roleOfOpenShift, type PunchDoc, type PunchKind } from '@/engine/payroll';
import { withWorkspace } from '@/server/workspace';

/**
 * Cotyledon — the time clock and the staff register, writes
 * (Roadmap K5).
 *
 * A punch on the floor is taken by an operator for the person clocking in,
 * starting or ending a break, or clocking out, at the server's clock. The staff
 * register and a punch typed afterwards — a missed clock-out, with the reason —
 * are super admin, and a typed or removed punch is an entry on the posting
 * trail. No punch is edited: a wrong one is removed and the right one typed.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const kindSchema = z.enum(['in', 'break_start', 'break_end', 'out']);

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
/** A second person with the same sign-in email (the unique index, 0063). */
function duplicateEmail(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === '23505' || err?.cause?.code === '23505';
}
const DUPLICATE_EMAIL = { ok: false as const, error: 'That email is on another person on the register.' };

const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });

async function punchesFor(staffId: string): Promise<PunchDoc[]> {
  const rows = await db.select().from(farmTimePunches).where(eq(farmTimePunches.staffId, staffId));
  return rows.map((r) => ({ id: r.id, staffId: r.staffId, kind: r.kind as PunchKind, punchedAt: r.punchedAt.toISOString(), role: isWorkRole(r.role) ? r.role : null, source: r.source === 'manual' ? 'manual' : 'clock', reason: r.reason, recordedBy: r.recordedBy }));
}

// ── Staff register ──────────────────────────────────────────────────────────

/** A person on the clock. No pay is held in Farm (Roadmap O1): wages, burden and personal details are Staffing's. */
const StaffInput = z.object({
  name: z.string().trim().min(1, 'Name the person').max(120),
  role: z.string().max(120).nullable().default(null),
  employeeRef: z.string().trim().max(120).nullable().default(null),
  email: z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email').nullable().default(null),
  status: z.enum(['active', 'inactive']).default('active'),
  /** Work roles the person may clock in under (Roadmap P2); at least one. */
  roles: z.array(z.enum(WORK_ROLES)).min(1, 'Give the person at least one work role').default(['operator']),
  startedOn: isoDate.nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});

export async function createStaff(...args: Parameters<typeof createStaffInner>): ReturnType<typeof createStaffInner> {
  return withWorkspace(() => createStaffInner(...args));
}

async function createStaffInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = StaffInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  let rows: { id: string }[];
  try {
    rows = await db.insert(farmStaff).values({ ...parsed.data, createdBy: access.userId }).returning({ id: farmStaff.id });
  } catch (e) {
    if (duplicateEmail(e)) return DUPLICATE_EMAIL;
    throw e;
  }
  if (!rows[0]) return { ok: false, error: 'Failed to save the person.' };
  // Joining the register IS the assignment. This is the same entry point the
  // `staffing.staff_joined` notice calls, so a person added here and a person
  // announced by Staffing are onboarded by identical code.
  if (parsed.data.status === 'active') await onStaffJoined(rows[0].id);
  revalidatePath('/farm', 'layout');
  return { ok: true, id: rows[0].id };
}

export async function updateStaff(...args: Parameters<typeof updateStaffInner>): ReturnType<typeof updateStaffInner> {
  return withWorkspace(() => updateStaffInner(...args));
}

async function updateStaffInner(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).and(StaffInput).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...rest } = parsed.data;
  try {
    await db.update(farmStaff).set({ ...rest, updatedAt: new Date() }).where(eq(farmStaff.id, id));
  } catch (e) {
    if (duplicateEmail(e)) return DUPLICATE_EMAIL;
    throw e;
  }
  // Reactivating someone onboards them again; already-held documents are untouched.
  if (rest.status === 'active') await onStaffJoined(id);
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

// ── The clock ───────────────────────────────────────────────────────────────

const PunchInput = z.object({ staffId: z.string().uuid(), kind: kindSchema, role: z.enum(WORK_ROLES).optional() });

/** A punch on the floor, at the server's clock. The clock accepts only the next punch the person's state allows. */
export async function punch(...args: Parameters<typeof punchInner>): ReturnType<typeof punchInner> {
  return withWorkspace(() => punchInner(...args));
}

async function punchInner(input: unknown): Promise<Result<{ at: string }>> {
  const parsed = PunchInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const person = (await db.select({ status: farmStaff.status, name: farmStaff.name, roles: farmStaff.roles }).from(farmStaff).where(eq(farmStaff.id, d.staffId)).limit(1))[0];
  if (!person) return { ok: false, error: 'Not on the staff register.' };
  if (person.status !== 'active') return { ok: false, error: `${person.name} is inactive on the staff register.` };
  const mine = await punchesFor(d.staffId);
  const why = punchRefusal(clockStateOf(mine), d.kind);
  if (why) return { ok: false, error: why };
  // A clock-in takes the role worked; every later punch of the shift carries the shift's role (Roadmap P2).
  const role = d.kind === 'in' ? d.role ?? 'operator' : roleOfOpenShift(mine) ?? 'operator';
  if (d.kind === 'in' && !(person.roles ?? []).includes(role)) return { ok: false, error: `${person.name} does not hold the ${role} role on the staff register.` };
  const now = new Date();
  const locked = await refuseIfLocked(localDate(now.toISOString()));
  if (locked) return { ok: false, error: locked };
  await db.insert(farmTimePunches).values({ staffId: d.staffId, kind: d.kind, role, punchedAt: now, source: 'clock', recordedBy: access.email ?? access.userId });
  revalidatePath('/farm', 'layout');
  return { ok: true, at: now.toISOString() };
}

const ManualPunchInput = z.object({
  staffId: z.string().uuid(),
  kind: kindSchema,
  punchedAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(3, 'A typed punch states why').max(400),
  /** The role for a typed clock-in; a later punch carries its shift's role. */
  role: z.enum(WORK_ROLES).optional(),
});

/** A punch typed afterwards — a missed clock-out, a forgotten break — with its reason. On the posting trail. */
export async function addManualPunch(...args: Parameters<typeof addManualPunchInner>): ReturnType<typeof addManualPunchInner> {
  return withWorkspace(() => addManualPunchInner(...args));
}

async function addManualPunchInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = ManualPunchInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const person = (await db.select({ id: farmStaff.id }).from(farmStaff).where(eq(farmStaff.id, d.staffId)).limit(1))[0];
  if (!person) return { ok: false, error: 'Not on the staff register.' };
  const at = new Date(d.punchedAt);
  const workDate = localDate(at.toISOString());
  const role = d.kind === 'in' ? d.role ?? 'operator' : roleOfOpenShift((await punchesFor(d.staffId)).filter((p) => p.punchedAt < at.toISOString())) ?? 'operator';
  const locked = await refuseIfLocked(workDate);
  if (locked) return { ok: false, error: locked };
  const id = await db.transaction(async (tx) => {
    const rows = await tx.insert(farmTimePunches).values({ staffId: d.staffId, kind: d.kind, role, punchedAt: at, source: 'manual', reason: d.reason, recordedBy: access.email ?? access.userId }).returning({ id: farmTimePunches.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_punch', recordKind: 'time_punch', recordId: row.id, period: periodOf(workDate), detail: { staffId: d.staffId, kind: d.kind, punchedAt: at.toISOString(), reason: d.reason } });
    return row?.id ?? null;
  });
  if (!id) return { ok: false, error: 'Failed to record the punch.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id };
}

/** Remove a punch, with the reason. Refused inside a locked period; the removal is on the trail. */
export async function deletePunch(...args: Parameters<typeof deletePunchInner>): ReturnType<typeof deletePunchInner> {
  return withWorkspace(() => deletePunchInner(...args));
}

async function deletePunchInner(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid(), reason: z.string().trim().min(3, 'A removal states why').max(400) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const row = (await db.select().from(farmTimePunches).where(eq(farmTimePunches.id, parsed.data.id)).limit(1))[0];
  if (!row) return { ok: false, error: 'Punch not found.' };
  const workDate = localDate(row.punchedAt.toISOString());
  const locked = await refuseIfLocked(workDate);
  if (locked) return { ok: false, error: locked };
  await db.transaction(async (tx) => {
    await tx.delete(farmTimePunches).where(eq(farmTimePunches.id, row.id));
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'delete_record', recordKind: 'time_punch', recordId: row.id, period: periodOf(workDate), detail: { staffId: row.staffId, kind: row.kind, punchedAt: row.punchedAt.toISOString(), source: row.source, reason: parsed.data.reason } });
  });
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
