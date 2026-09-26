'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { farmPackages, farmCropPlanPackages } from '@mf/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from './access';

/**
 * MicroFarm — packaging library and crop plan packaging picks, writes.
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
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...patch } = parsed.data;
  const updated = await db
    .update(farmPackages)
    .set({ ...patch, source: 'user_built', updatedBy: access.userId, updatedAt: new Date() })
    .where(eq(farmPackages.id, id))
    .returning({ id: farmPackages.id });
  if (!updated[0]) return { ok: false, error: 'That package no longer exists.' };
  revalidatePath('/farm', 'layout');
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
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const inserted = await db
    .insert(farmPackages)
    .values({ name: parsed.data.name, channels: parsed.data.channels, source: 'user_built', createdBy: access.userId })
    .returning({ id: farmPackages.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to add the package.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id: inserted[0].id };
}

/** Remove a package no crop plan picks. */
export async function deletePackage(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const [{ used } = { used: 0 }] = await db
    .select({ used: sql<number>`count(*)::int` })
    .from(farmCropPlanPackages)
    .where(eq(farmCropPlanPackages.packageId, parsed.data.id));
  if (Number(used) > 0) return { ok: false, error: `${used} crop plan${Number(used) === 1 ? '' : 's'} pick this package; remove it from ${Number(used) === 1 ? 'that cropPlan' : 'those cropPlans'} first.` };
  await db.delete(farmPackages).where(eq(farmPackages.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

const PickInput = z.object({
  cropPlanId: z.string().uuid(),
  packageId: z.string().uuid(),
  qtyPerUnit: z.number().gt(0, 'Per unit must be above zero').max(1000).default(1),
});

/** Pick a package for a crop plan; picking it again sets its per-unit count. */
export async function addCropPlanPackage(input: unknown): Promise<Result> {
  const parsed = PickInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db
    .insert(farmCropPlanPackages)
    .values({ ...parsed.data, createdBy: access.userId })
    .onConflictDoUpdate({ target: [farmCropPlanPackages.cropPlanId, farmCropPlanPackages.packageId], set: { qtyPerUnit: parsed.data.qtyPerUnit } });
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

export async function updateCropPlanPackage(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid(), qtyPerUnit: z.number().gt(0, 'Per unit must be above zero').max(1000) }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.update(farmCropPlanPackages).set({ qtyPerUnit: parsed.data.qtyPerUnit }).where(eq(farmCropPlanPackages.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

export async function removeCropPlanPackage(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.delete(farmCropPlanPackages).where(eq(farmCropPlanPackages.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
