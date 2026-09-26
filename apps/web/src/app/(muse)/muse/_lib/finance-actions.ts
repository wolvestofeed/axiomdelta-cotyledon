'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { museLoans, museFixedCostLines, museLeaseholdLines } from '@ct/db';
import { db } from '@/lib/db';
import { accessRefusal, requireMuseSuperAdmin } from './access';
import { LOAN_PURPOSES, LOAN_STATUSES, FIXED_COST_STATUSES, FIXED_COST_TREATMENTS } from '../_data/finance';
import { uniqueEquipmentKey } from '../_engine/equipment';

/**
 * Impact OS — loans and fixed-cost lines, writes. SUPER ADMIN ONLY.
 *
 * Both are shared definitions (Roadmap N1), so these actions change the library
 * every forecast reads. A what-if that should not follow the workspace belongs
 * on the scenario instead — the Capital & Financing page writes edits there,
 * and these actions add, rename and remove the rows themselves.
 *
 * An edited seed row becomes `user_built`; the stable `key` never changes, so a
 * saved forecast's overlay keeps pointing at the row it was written against.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });

/** A key nothing else in the table holds, derived from the label. */
async function freeKey(table: 'loans' | 'fixed' | 'leasehold', label: string): Promise<string> {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'line';
  const rows =
    table === 'loans'
      ? await db.select({ key: museLoans.key }).from(museLoans)
      : table === 'leasehold'
        ? await db.select({ key: museLeaseholdLines.key }).from(museLeaseholdLines)
        : await db.select({ key: museFixedCostLines.key }).from(museFixedCostLines);
  return uniqueEquipmentKey(base, new Set(rows.map((r) => r.key)));
}

// ── Loans ───────────────────────────────────────────────────────────────────

const NewLoan = z.object({
  label: z.string().trim().min(1, 'Name the loan').max(200),
  purpose: z.enum(LOAN_PURPOSES).default('other'),
  status: z.enum(LOAN_STATUSES).default('planned'),
  principalCents: z.number().int().min(0, 'Principal cannot be negative').max(1_000_000_000_00).default(0),
  apr: z.number().min(0, 'APR cannot be negative').max(1, 'APR is a fraction: 0.09 is 9%').default(0),
  termMonths: z.number().int().min(0).max(600).default(0),
  startDate: isoDate,
  notes: z.string().max(2000).nullable().optional(),
});

export async function createLoan(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = NewLoan.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const next = await db.select({ max: sql<number>`coalesce(max(${museLoans.position}), -1)` }).from(museLoans);
  const inserted = await db
    .insert(museLoans)
    .values({
      key: await freeKey('loans', d.label),
      label: d.label,
      purpose: d.purpose,
      status: d.status,
      principalCents: d.principalCents,
      apr: d.apr,
      termMonths: d.termMonths,
      startDate: d.startDate,
      notes: d.notes ?? null,
      position: (next[0]?.max ?? -1) + 1,
      source: 'user_built',
      createdBy: access.userId,
    })
    .returning({ id: museLoans.id });
  revalidatePath('/muse', 'layout');
  return { ok: true, id: inserted[0]!.id };
}

const LoanPatch = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(200).optional(),
  purpose: z.enum(LOAN_PURPOSES).optional(),
  status: z.enum(LOAN_STATUSES).optional(),
  principalCents: z.number().int().min(0, 'Principal cannot be negative').max(1_000_000_000_00).optional(),
  apr: z.number().min(0, 'APR cannot be negative').max(1, 'APR is a fraction: 0.09 is 9%').optional(),
  termMonths: z.number().int().min(0).max(600).optional(),
  startDate: isoDate.optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function updateLoan(input: unknown): Promise<Result> {
  const parsed = LoanPatch.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...patch } = parsed.data;
  const updated = await db
    .update(museLoans)
    .set({ ...patch, source: 'user_built', updatedAt: new Date() })
    .where(eq(museLoans.id, id))
    .returning({ id: museLoans.id });
  if (!updated[0]) return { ok: false, error: 'That loan no longer exists.' };
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

export async function deleteLoan(id: unknown): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Bad id.' };
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.delete(museLoans).where(eq(museLoans.id, id as string));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

// ── Fixed-cost lines ────────────────────────────────────────────────────────

const NewFixedCostLine = z.object({
  label: z.string().trim().min(1, 'Name the line').max(200),
  category: z.string().trim().min(1).max(80).default('other'),
  treatment: z.enum(FIXED_COST_TREATMENTS),
  status: z.enum(FIXED_COST_STATUSES).default('planned'),
  monthlyAmountCents: z.number().int().min(0, 'A monthly amount cannot be negative').max(1_000_000_000_00).default(0),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function createFixedCostLine(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = NewFixedCostLine.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const next = await db
    .select({ max: sql<number>`coalesce(max(${museFixedCostLines.position}), -1)` })
    .from(museFixedCostLines);
  const inserted = await db
    .insert(museFixedCostLines)
    .values({
      key: await freeKey('fixed', d.label),
      label: d.label,
      category: d.category,
      treatment: d.treatment,
      status: d.status,
      monthlyAmountCents: d.monthlyAmountCents,
      startDate: d.startDate ?? null,
      endDate: d.endDate ?? null,
      notes: d.notes ?? null,
      position: (next[0]?.max ?? -1) + 1,
      source: 'user_built',
      createdBy: access.userId,
    })
    .returning({ id: museFixedCostLines.id });
  revalidatePath('/muse', 'layout');
  return { ok: true, id: inserted[0]!.id };
}

const FixedCostPatch = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  treatment: z.enum(FIXED_COST_TREATMENTS).optional(),
  status: z.enum(FIXED_COST_STATUSES).optional(),
  monthlyAmountCents: z.number().int().min(0, 'A monthly amount cannot be negative').max(1_000_000_000_00).optional(),
  startDate: isoDate.nullable().optional(),
  endDate: isoDate.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function updateFixedCostLine(input: unknown): Promise<Result> {
  const parsed = FixedCostPatch.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...patch } = parsed.data;
  const updated = await db
    .update(museFixedCostLines)
    .set({ ...patch, source: 'user_built', updatedAt: new Date() })
    .where(eq(museFixedCostLines.id, id))
    .returning({ id: museFixedCostLines.id });
  if (!updated[0]) return { ok: false, error: 'That fixed-cost line no longer exists.' };
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

export async function deleteFixedCostLine(id: unknown): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Bad id.' };
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.delete(museFixedCostLines).where(eq(museFixedCostLines.id, id as string));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

// ── Leasehold schedule ──────────────────────────────────────────────────────

const NewLeaseholdLine = z.object({
  item: z.string().trim().min(1, 'Name the line').max(200),
  extendedCents: z.number().int().min(0, 'A cost cannot be negative').max(1_000_000_000_00).default(0),
  counted: z.boolean().default(true),
  notes: z.string().max(2000).nullable().optional(),
});

export async function createLeaseholdLine(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = NewLeaseholdLine.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const next = await db
    .select({ max: sql<number>`coalesce(max(${museLeaseholdLines.position}), -1)` })
    .from(museLeaseholdLines);
  const inserted = await db
    .insert(museLeaseholdLines)
    .values({
      key: await freeKey('leasehold', d.item),
      item: d.item,
      extendedCents: d.extendedCents,
      counted: d.counted,
      notes: d.notes ?? null,
      position: (next[0]?.max ?? -1) + 1,
      source: 'user_built',
      createdBy: access.userId,
    })
    .returning({ id: museLeaseholdLines.id });
  revalidatePath('/muse', 'layout');
  return { ok: true, id: inserted[0]!.id };
}

const LeaseholdPatch = z.object({
  id: z.string().uuid(),
  item: z.string().trim().min(1).max(200).optional(),
  extendedCents: z.number().int().min(0, 'A cost cannot be negative').max(1_000_000_000_00).optional(),
  counted: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/**
 * Edit a leasehold line in the library. `counted: false` keeps the line on
 * record and out of the rollup — it is never a reason to delete the row.
 */
export async function updateLeaseholdLine(input: unknown): Promise<Result> {
  const parsed = LeaseholdPatch.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...patch } = parsed.data;
  const updated = await db
    .update(museLeaseholdLines)
    .set({ ...patch, source: 'user_built', updatedAt: new Date() })
    .where(eq(museLeaseholdLines.id, id))
    .returning({ id: museLeaseholdLines.id });
  if (!updated[0]) return { ok: false, error: 'That leasehold line no longer exists.' };
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

export async function deleteLeaseholdLine(id: unknown): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Bad id.' };
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.delete(museLeaseholdLines).where(eq(museLeaseholdLines.id, id as string));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}
