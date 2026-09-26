'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { farmCropPlans, farmCropPlanLines, farmSowingRecords } from '@mf/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from './access';
import {
  cropPlanToRows,
  normalizeLines,
  specForTrayFormat,
  CROP_PLAN_STATUSES,
} from '../_engine/crop-plan-library';
import type { CropPlanDef, InputLine, CropPlanStatus } from '../_data/plan-data';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

/**
 * MicroFarm — crop plan library writes. SUPER ADMIN ONLY.
 *
 * A library crop plan is the standard a scenario's edits are measured against, so
 * it is written here, not through the forecast overlay. Saving bumps the
 * version; the lines are replaced whole (a crop plan is one document).
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}

const Status = z.enum(['SOURCED', 'STATED', 'PLACEHOLDER', 'DERIVED', 'UNCONFIRMED', 'DATED']);

const Nutrition = z
  .object({
    component: z.enum(['MMA', 'GRAINS', 'VEG', 'FRUIT', 'NONE']),
    vegSubgroup: z.enum(['DARK_GREEN', 'RED_ORANGE', 'BEANS_PEAS_LENTILS', 'STARCHY', 'OTHER']).optional(),
    grainGroup: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']).optional(),
    cupWeightG: z.number().positive().optional(),
    unitWeightG: z.number().positive().optional(),
    legumeElection: z.enum(['MMA', 'VEG']).optional(),
    status: Status,
    source: z.string().max(1000),
  })
  .optional();

const Line = z.object({
  name: z.string().trim().min(1, 'Every line needs a name').max(120),
  spec: z.string().max(400).default(''),
  seedQtyPerSowing: z.number().min(0),
  unit: z.enum(['lb', 'each']),
  /** 0 is authored: a line absorbed into its component (oil, a seasoning) whose mass is carried on another line. */
  yieldToHarvest: z.number().min(0),
  seedUnitCost: z.number().min(0),
  packSize: z.number().positive(),
  isHotComponent: z.boolean(),
  unitMassOz: z.number().positive().optional(),
  trimYield: z.number().positive().optional(),
  blackoutYield: z.number().positive().optional(),
  status: Status,
  source: z.string().max(1000),
  yieldStatus: Status,
  yieldSource: z.string().max(1000),
  nutrition: Nutrition,
  component: z.string().trim().min(1).max(120),
  /** FDA Food Traceability List category (21 CFR 1.1990) the line falls under, set per line; absent means out of scope. */
  foodTraceabilityList: z.string().trim().min(1).max(120).optional(),
});

const CropPlanInput = z.object({
  code: z.string().trim().regex(/^[A-Z0-9-]{3,24}$/, 'Code is upper-case letters, digits and dashes'),
  name: z.string().trim().min(1).max(160),
  category: z.string().max(160).default(''),
  status: z.enum(['in_service', 'planned', 'developing']),
  channels: z.array(z.number().int().min(1).max(3)).default([]),
  components: z.string().max(1000).default(''),
  productionMethod: z.string().max(1000).default(''),
  allergensPresent: z.string().max(400).default(''),
  allergenFreeClaims: z.string().max(400).default(''),
  /** The units the input quantities are written for; the production sowing is derived, never typed. */
  sowingUnits: z.number().int().min(1, 'The quantities are written for at least one unit').max(100_000).default(100),
  trayFormat: z.enum(['K-5', '6-8', '9-12']).default('9-12'),
  servingGrowUnitCapacityOz: z.number().positive().default(16),
  inputs: z.array(Line).min(1, 'A crop plan needs at least one input line'),
});

function toCropPlan(d: z.infer<typeof CropPlanInput>): CropPlanDef {
  const lines = normalizeLines(d.inputs as InputLine[]);
  return {
    code: d.code,
    name: d.name,
    category: d.category,
    status: d.status as CropPlanStatus,
    channels: [...new Set(d.channels)].sort(),
    components: d.components,
    productionMethod: d.productionMethod,
    allergensPresent: d.allergensPresent,
    allergenFreeClaims: d.allergenFreeClaims,
    sowingUnits: d.sowingUnits,
    spec: specForTrayFormat(d.trayFormat, d.servingGrowUnitCapacityOz),
    inputs: lines,
  };
}

/** Add a crop plan to the library. */
export async function createCropPlan(...args: Parameters<typeof createCropPlanInner>): ReturnType<typeof createCropPlanInner> {
  return withWorkspace(() => createCropPlanInner(...args));
}

async function createCropPlanInner(input: unknown): Promise<Result<{ id: string; code: string }>> {
  const parsed = CropPlanInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'cropPlan'}: ${i.message}`).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const names = new Set<string>();
  for (const l of parsed.data.inputs) {
    if (names.has(l.name)) return { ok: false, error: `Input "${l.name}" appears twice.` };
    names.add(l.name);
  }
  const existing = await db.select({ id: farmCropPlans.id }).from(farmCropPlans).where(eq(farmCropPlans.code, parsed.data.code)).limit(1);
  if (existing[0]) return { ok: false, error: `Crop plan code ${parsed.data.code} is already in the library.` };

  const { header, lines } = cropPlanToRows(toCropPlan(parsed.data));
  const inserted = await db
    .insert(farmCropPlans)
    .values({ ...header, effectiveFrom: new Date().toISOString().slice(0, 10), createdBy: access.userId })
    .returning({ id: farmCropPlans.id });
  const id = inserted[0]?.id;
  if (!id) return { ok: false, error: 'Failed to save the crop plan.' };
  await db.insert(farmCropPlanLines).values(lines.map((l) => ({ cropPlanId: id, ...l })));
  revalidatePath('/farm', 'layout');
  return { ok: true, id, code: parsed.data.code };
}

const UpdateInput = CropPlanInput.extend({ id: z.string().uuid() });

/** Replace a library crop plan's header and lines; bumps the version. */
export async function updateCropPlan(...args: Parameters<typeof updateCropPlanInner>): ReturnType<typeof updateCropPlanInner> {
  return withWorkspace(() => updateCropPlanInner(...args));
}

async function updateCropPlanInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = UpdateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'cropPlan'}: ${i.message}`).join('; ') };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const names = new Set<string>();
  for (const l of parsed.data.inputs) {
    if (names.has(l.name)) return { ok: false, error: `Input "${l.name}" appears twice.` };
    names.add(l.name);
  }
  const current = await db.select({ id: farmCropPlans.id, version: farmCropPlans.version, code: farmCropPlans.code }).from(farmCropPlans).where(eq(farmCropPlans.id, parsed.data.id)).limit(1);
  if (!current[0]) return { ok: false, error: 'Crop plan not found.' };
  if (current[0].code !== parsed.data.code) {
    const clash = await db.select({ id: farmCropPlans.id }).from(farmCropPlans).where(eq(farmCropPlans.code, parsed.data.code)).limit(1);
    if (clash[0]) return { ok: false, error: `Crop plan code ${parsed.data.code} is already in the library.` };
  }
  const { header, lines } = cropPlanToRows(toCropPlan(parsed.data));
  await db
    .update(farmCropPlans)
    .set({ ...header, source: undefined, version: current[0].version + 1, effectiveFrom: new Date().toISOString().slice(0, 10), updatedAt: new Date() })
    .where(eq(farmCropPlans.id, parsed.data.id));
  await db.delete(farmCropPlanLines).where(eq(farmCropPlanLines.cropPlanId, parsed.data.id));
  await db.insert(farmCropPlanLines).values(lines.map((l) => ({ cropPlanId: parsed.data.id, ...l })));
  revalidatePath('/farm', 'layout');
  return { ok: true, id: parsed.data.id };
}

const StatusInput = z.object({ id: z.string().uuid(), status: z.enum(['in_service', 'planned', 'developing']) });

export async function setCropPlanStatus(...args: Parameters<typeof setCropPlanStatusInner>): ReturnType<typeof setCropPlanStatusInner> {
  return withWorkspace(() => setCropPlanStatusInner(...args));
}

async function setCropPlanStatusInner(input: unknown): Promise<Result> {
  const parsed = StatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'cropPlan'}: ${i.message}`).join('; ') };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  if (!CROP_PLAN_STATUSES.includes(parsed.data.status)) return { ok: false, error: 'Unknown status.' };
  await db.update(farmCropPlans).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(farmCropPlans.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

const DeleteInput = z.object({ id: z.string().uuid() });

/** Remove a crop plan. Refused while a sowing record names its code, or if it is the last one. */
export async function deleteCropPlan(...args: Parameters<typeof deleteCropPlanInner>): ReturnType<typeof deleteCropPlanInner> {
  return withWorkspace(() => deleteCropPlanInner(...args));
}

async function deleteCropPlanInner(input: unknown): Promise<Result> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'cropPlan'}: ${i.message}`).join('; ') };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const row = await db.select({ code: farmCropPlans.code }).from(farmCropPlans).where(eq(farmCropPlans.id, parsed.data.id)).limit(1);
  if (!row[0]) return { ok: false, error: 'Crop plan not found.' };
  const used = await db.select({ id: farmSowingRecords.id }).from(farmSowingRecords).where(eq(farmSowingRecords.cropPlanCode, row[0].code)).limit(1);
  if (used[0]) return { ok: false, error: `Sowing records name ${row[0].code}; a crop plan with production history is not deleted.` };
  const count = await db.select({ id: farmCropPlans.id }).from(farmCropPlans);
  if (count.length <= 1) return { ok: false, error: 'The library keeps at least one crop plan.' };
  await db.delete(farmCropPlans).where(eq(farmCropPlans.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
