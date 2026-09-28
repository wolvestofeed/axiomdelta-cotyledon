'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { farmMedia } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from '@/server/access';
import { tagged, type Tagged } from '@/data/tagged';
import { SCIENCE_SOURCE_BY_ROW } from '@/data/science-library';
import { UNIT_OF_FORM, costPerUnitFrom, mediumDeleteRefusal, mediumKeyFor } from '@/engine/media';
import { listGrowPlans } from '@/server/grow-plans';
import { withWorkspace } from '@/server/workspace';

/**
 * Cotyledon — the Media library, writes. SUPER ADMIN ONLY.
 *
 * A figure typed here is STATED, its note naming what was typed; a figure left alone keeps its
 * tag. A price is typed as what was paid and how much it gave in the medium's unit (the gallons a
 * bale expands to, the mats in a pack), and stored as dollars per unit. A medium's form, and so its
 * unit, is set when it is added. An edited seed row becomes `user_built`. A row a grow plan's
 * medium line names cannot be deleted, nor can No medium.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });

const TYPED = 'Typed on Media';

const Price = z.object({
  paid: z.number().min(0, 'The price cannot be negative').max(100_000),
  quantity: z.number().positive('Enter how much it gave').max(100_000),
});

const Fields = z.object({
  name: z.string().trim().min(1, 'Name the medium').max(120),
  qtyPer1020: z.number().min(0, 'The quantity cannot be negative').max(1_000),
  price: Price,
  ph: z.string().trim().max(60),
  porosity: z.string().trim().max(60),
  note: z.string().trim().max(2000),
  rows: z.array(z.number().int()).max(20),
});

const Create = Fields.extend({ form: z.enum(['loose', 'mat']) });

const priceTag = (p: z.infer<typeof Price>, unit: string): Tagged => tagged(costPerUnitFrom(p.paid, p.quantity), 'STATED', `$/${unit}`, `$${p.paid} for ${p.quantity} ${unit}, typed on Media`);

function rowsProblem(rows: readonly number[]): string | null {
  const unregistered = rows.filter((r) => !SCIENCE_SOURCE_BY_ROW[r]);
  return unregistered.length ? `Science library row${unregistered.length === 1 ? '' : 's'} ${unregistered.join(', ')} not registered on Sources.` : null;
}

const traitsOf = (ph: string, porosity: string, note: string) => ({ ...(ph ? { ph } : {}), ...(porosity ? { porosity } : {}), note });

/** Add a medium to the library. */
export async function createMedium(...args: Parameters<typeof createMediumInner>): ReturnType<typeof createMediumInner> {
  return withWorkspace(() => createMediumInner(...args));
}

async function createMediumInner(input: unknown): Promise<Result<{ id: string; key: string }>> {
  const parsed = Create.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const rowsIssue = rowsProblem(d.rows);
  if (rowsIssue) return { ok: false, error: rowsIssue };
  const unit = UNIT_OF_FORM[d.form];
  const existing = await db.select({ key: farmMedia.key }).from(farmMedia);
  const key = mediumKeyFor(d.name, existing.map((r) => r.key));
  const [{ next } = { next: 0 }] = await db.select({ next: sql<number>`coalesce(max(${farmMedia.position}), -1) + 1` }).from(farmMedia);
  const inserted = await db
    .insert(farmMedia)
    .values({
      key,
      position: Number(next),
      name: d.name,
      form: d.form,
      unit,
      qtyPer1020: tagged(d.qtyPer1020, 'STATED', unit, TYPED),
      costPerUnit: priceTag(d.price, unit),
      traits: traitsOf(d.ph, d.porosity, d.note),
      rows: d.rows,
      source: 'user_built',
    })
    .returning({ id: farmMedia.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to add the row.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id: inserted[0].id, key };
}

/** Only the fields that changed are sent; each becomes STATED. */
const Patch = Fields.partial().extend({ id: z.string().uuid() });

export async function updateMedium(...args: Parameters<typeof updateMediumInner>): ReturnType<typeof updateMediumInner> {
  return withWorkspace(() => updateMediumInner(...args));
}

async function updateMediumInner(input: unknown): Promise<Result> {
  const parsed = Patch.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  if (d.rows) {
    const rowsIssue = rowsProblem(d.rows);
    if (rowsIssue) return { ok: false, error: rowsIssue };
  }
  const current = (await db.select({ unit: farmMedia.unit, traits: farmMedia.traits }).from(farmMedia).where(eq(farmMedia.id, d.id)).limit(1))[0];
  if (!current) return { ok: false, error: 'That row no longer exists.' };
  if (current.unit === 'none' && (d.qtyPer1020 !== undefined || d.price !== undefined)) return { ok: false, error: 'No medium takes no quantity and no price.' };
  const set: Partial<typeof farmMedia.$inferInsert> = { source: 'user_built', updatedAt: new Date() };
  if (d.name !== undefined) set.name = d.name;
  if (d.qtyPer1020 !== undefined) set.qtyPer1020 = tagged(d.qtyPer1020, 'STATED', current.unit, TYPED);
  if (d.price !== undefined) set.costPerUnit = priceTag(d.price, current.unit);
  if (d.ph !== undefined || d.porosity !== undefined || d.note !== undefined) {
    const was = (current.traits ?? {}) as { ph?: string; porosity?: string; note?: string };
    set.traits = traitsOf(d.ph ?? was.ph ?? '', d.porosity ?? was.porosity ?? '', d.note ?? was.note ?? '');
  }
  if (d.rows !== undefined) set.rows = d.rows;
  await db.update(farmMedia).set(set).where(eq(farmMedia.id, d.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

export async function deleteMedium(...args: Parameters<typeof deleteMediumInner>): ReturnType<typeof deleteMediumInner> {
  return withWorkspace(() => deleteMediumInner(...args));
}

async function deleteMediumInner(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const row = await db.select({ key: farmMedia.key }).from(farmMedia).where(eq(farmMedia.id, parsed.data.id)).limit(1);
  if (!row[0]) return { ok: false, error: 'That row no longer exists.' };
  const refusal = mediumDeleteRefusal(row[0].key, await listGrowPlans());
  if (refusal) return { ok: false, error: refusal };
  await db.delete(farmMedia).where(eq(farmMedia.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
