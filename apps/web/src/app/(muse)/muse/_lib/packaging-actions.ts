'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { musePackages, museRecipePackages } from '@ct/db';
import { db } from '@/lib/db';
import { accessRefusal, requireMuseSuperAdmin } from './access';

/**
 * Impact OS — packaging library and recipe packaging picks, writes.
 * SUPER ADMIN ONLY (Roadmap N1). An edited seed package becomes `user_built`.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });
const text = (max: number) => z.string().trim().max(max).nullable().transform((s) => (s ? s : null));
const Channels = z.array(z.number().int().min(1).max(3)).max(3).transform((c) => [...new Set(c)].sort());

const PackagePatch = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, 'Name the package').max(200).optional(),
  channels: Channels.optional(),
  temperature: z.enum(['hot', 'cold']).nullable().optional(),
  material: text(120).optional(),
  sizeValue: z.number().min(0).max(100_000).nullable().optional(),
  sizeUnit: text(20).optional(),
  endOfUse: text(120).optional(),
  endOfUseRank: z.number().int().min(1).max(99).nullable().optional(),
  manualUnitCost: z.number().min(0, 'Cost cannot be negative').max(10_000).nullable().optional(),
  supplierItemId: z.string().uuid().nullable().optional(),
  supplierUnitsPerPack: z.number().gt(0, 'Units per pack must be above zero').max(1_000_000).optional(),
  notes: text(2000).optional(),
});

export async function updatePackage(input: unknown): Promise<Result> {
  const parsed = PackagePatch.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...patch } = parsed.data;
  const updated = await db
    .update(musePackages)
    .set({ ...patch, source: 'user_built', updatedBy: access.userId, updatedAt: new Date() })
    .where(eq(musePackages.id, id))
    .returning({ id: musePackages.id });
  if (!updated[0]) return { ok: false, error: 'That package no longer exists.' };
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

const PackageInput = z.object({
  name: z.string().trim().min(1, 'Name the package').max(200),
  channels: Channels.default([]),
});

export async function createPackage(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = PackageInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const inserted = await db
    .insert(musePackages)
    .values({ name: parsed.data.name, channels: parsed.data.channels, source: 'user_built', createdBy: access.userId })
    .returning({ id: musePackages.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to add the package.' };
  revalidatePath('/muse', 'layout');
  return { ok: true, id: inserted[0].id };
}

/** Remove a package no recipe picks. */
export async function deletePackage(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const [{ used } = { used: 0 }] = await db
    .select({ used: sql<number>`count(*)::int` })
    .from(museRecipePackages)
    .where(eq(museRecipePackages.packageId, parsed.data.id));
  if (Number(used) > 0) return { ok: false, error: `${used} recipe${Number(used) === 1 ? '' : 's'} pick this package; remove it from ${Number(used) === 1 ? 'that recipe' : 'those recipes'} first.` };
  await db.delete(musePackages).where(eq(musePackages.id, parsed.data.id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

const PickInput = z.object({
  recipeId: z.string().uuid(),
  packageId: z.string().uuid(),
  qtyPerMeal: z.number().gt(0, 'Per meal must be above zero').max(1000).default(1),
});

/** Pick a package for a recipe; picking it again sets its per-meal count. */
export async function addRecipePackage(input: unknown): Promise<Result> {
  const parsed = PickInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db
    .insert(museRecipePackages)
    .values({ ...parsed.data, createdBy: access.userId })
    .onConflictDoUpdate({ target: [museRecipePackages.recipeId, museRecipePackages.packageId], set: { qtyPerMeal: parsed.data.qtyPerMeal } });
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

export async function updateRecipePackage(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid(), qtyPerMeal: z.number().gt(0, 'Per meal must be above zero').max(1000) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.update(museRecipePackages).set({ qtyPerMeal: parsed.data.qtyPerMeal }).where(eq(museRecipePackages.id, parsed.data.id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

export async function removeRecipePackage(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.delete(museRecipePackages).where(eq(museRecipePackages.id, parsed.data.id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}
