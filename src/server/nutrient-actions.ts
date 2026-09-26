'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { farmNutrients } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from '@/server/access';
import { tagged, type Tagged } from '@/data/tagged';
import { SCIENCE_SOURCE_BY_ROW } from '@/data/science-library';
import { costPerMlFrom, deleteRefusal, nutrientKeyFor } from '@/engine/nutrients';
import { listCropPlans } from '@/server/crop-plans';
import { withWorkspace } from '@/server/workspace';
import { isGrowPlanCarrier } from '@/engine/grow-plan-bridge';

/**
 * MicroFarm — the Nutrients & Supplements library, writes. SUPER ADMIN ONLY.
 *
 * A figure typed here is STATED, its note naming what was typed; a figure left alone keeps its
 * tag. A price is typed as what was paid for a container and its size in gallons, and stored as
 * dollars per ml. An edited seed row becomes `user_built`. A row a grow plan's nutrient line names
 * cannot be deleted, nor can Water only.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });

const TYPED = 'Typed on Nutrients & Supplements';

const Price = z.object({
  paid: z.number().min(0, 'The price cannot be negative').max(100_000),
  containerGal: z.number().positive('The container has a size').max(1_000),
});

const Fields = z.object({
  name: z.string().trim().min(1, 'Name the nutrient or supplement').max(120),
  mlPerGal: z.number().min(0, 'Strength cannot be negative').max(4_000),
  price: Price,
  ecTarget: z.number().min(0).max(20).nullable(),
  phTarget: z.number().min(0).max(14).nullable(),
  elicitsEffect: z.string().trim().max(500),
  elicitsRows: z.array(z.number().int()).max(20),
  note: z.string().trim().max(2000),
});

const priceTag = (p: z.infer<typeof Price>): Tagged => tagged(costPerMlFrom(p.paid, p.containerGal), 'STATED', '$/ml', `$${p.paid} for ${p.containerGal} gal, typed on Nutrients & Supplements`);

function rowsProblem(rows: readonly number[]): string | null {
  const unregistered = rows.filter((r) => !SCIENCE_SOURCE_BY_ROW[r]);
  return unregistered.length ? `Science library row${unregistered.length === 1 ? '' : 's'} ${unregistered.join(', ')} not registered on Sources.` : null;
}

const elicitsOf = (effect: string, rows: number[]) => (effect ? { effect, rows } : null);

/** Add a nutrient or supplement to the library. */
export async function createNutrient(...args: Parameters<typeof createNutrientInner>): ReturnType<typeof createNutrientInner> {
  return withWorkspace(() => createNutrientInner(...args));
}

async function createNutrientInner(input: unknown): Promise<Result<{ id: string; key: string }>> {
  const parsed = Fields.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const rowsIssue = rowsProblem(d.elicitsRows);
  if (rowsIssue) return { ok: false, error: rowsIssue };
  const existing = await db.select({ key: farmNutrients.key }).from(farmNutrients);
  const key = nutrientKeyFor(d.name, existing.map((r) => r.key));
  const [{ next } = { next: 0 }] = await db.select({ next: sql<number>`coalesce(max(${farmNutrients.position}), -1) + 1` }).from(farmNutrients);
  const inserted = await db
    .insert(farmNutrients)
    .values({
      key,
      position: Number(next),
      name: d.name,
      mlPerGal: tagged(d.mlPerGal, 'STATED', 'ml/gal', TYPED),
      costPerMl: priceTag(d.price),
      ecTarget: d.ecTarget === null ? null : tagged(d.ecTarget, 'STATED', 'mS/cm', TYPED),
      phTarget: d.phTarget === null ? null : tagged(d.phTarget, 'STATED', 'pH', TYPED),
      elicits: elicitsOf(d.elicitsEffect, d.elicitsRows),
      note: d.note,
      source: 'user_built',
    })
    .returning({ id: farmNutrients.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to add the row.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id: inserted[0].id, key };
}

/** Only the fields that changed are sent; each becomes STATED. */
const Patch = Fields.partial().extend({ id: z.string().uuid() });

export async function updateNutrient(...args: Parameters<typeof updateNutrientInner>): ReturnType<typeof updateNutrientInner> {
  return withWorkspace(() => updateNutrientInner(...args));
}

async function updateNutrientInner(input: unknown): Promise<Result> {
  const parsed = Patch.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  if (d.elicitsRows) {
    const rowsIssue = rowsProblem(d.elicitsRows);
    if (rowsIssue) return { ok: false, error: rowsIssue };
  }
  const set: Partial<typeof farmNutrients.$inferInsert> = { source: 'user_built', updatedAt: new Date() };
  if (d.name !== undefined) set.name = d.name;
  if (d.mlPerGal !== undefined) set.mlPerGal = tagged(d.mlPerGal, 'STATED', 'ml/gal', TYPED);
  if (d.price !== undefined) set.costPerMl = priceTag(d.price);
  if (d.ecTarget !== undefined) set.ecTarget = d.ecTarget === null ? null : tagged(d.ecTarget, 'STATED', 'mS/cm', TYPED);
  if (d.phTarget !== undefined) set.phTarget = d.phTarget === null ? null : tagged(d.phTarget, 'STATED', 'pH', TYPED);
  if (d.elicitsEffect !== undefined || d.elicitsRows !== undefined) set.elicits = elicitsOf(d.elicitsEffect ?? '', d.elicitsRows ?? []);
  if (d.note !== undefined) set.note = d.note;
  const updated = await db.update(farmNutrients).set(set).where(eq(farmNutrients.id, d.id)).returning({ id: farmNutrients.id });
  if (!updated[0]) return { ok: false, error: 'That row no longer exists.' };
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

export async function deleteNutrient(...args: Parameters<typeof deleteNutrientInner>): ReturnType<typeof deleteNutrientInner> {
  return withWorkspace(() => deleteNutrientInner(...args));
}

async function deleteNutrientInner(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const row = await db.select({ key: farmNutrients.key }).from(farmNutrients).where(eq(farmNutrients.id, parsed.data.id)).limit(1);
  if (!row[0]) return { ok: false, error: 'That row no longer exists.' };
  const plans = (await listCropPlans()).filter(isGrowPlanCarrier).map((c) => c.plan);
  const refusal = deleteRefusal(row[0].key, plans);
  if (refusal) return { ok: false, error: refusal };
  await db.delete(farmNutrients).where(eq(farmNutrients.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
