'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { farmGrowPlans, farmGrowPlanLines, farmSowingRecords } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin } from '@/server/access';
import { growPlanToRows, GROW_PLAN_STATUSES } from '@/engine/grow-plan-library';
import { growPlanProblems, type GrowPlanDef, type GrowPlanLine } from '@/data/grow-plan';
import { tagged } from '@/data/tagged';
import { withWorkspace } from '@/server/workspace';
import { listNutrients } from '@/server/nutrients';
import { listMedia } from '@/server/media';

/**
 * MicroFarm — grow plan library writes. SUPER ADMIN ONLY.
 *
 * A library plan is the standard a scenario's edits are measured against, so it is written here,
 * not through the forecast overlay. Saving bumps the version; the lines are replaced whole (a plan
 * is one document). A figure typed here is STATED by the editor; a null defers to the catalog or
 * the variety record and keeps that record's tag.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}

const STAGE_KEYS = ['soak', 'sow', 'germination', 'blackout', 'light', 'harvest-window'] as const;
const TYPED = 'Typed in the grow plan editor';

/** What the plan's experiments measured, written at promotion; the editor carries it back unchanged or drops it. */
const MeasuredHarvestIn = z.object({ value: z.number().min(0).max(100_000), status: z.literal('DERIVED'), unit: z.string().max(20).optional(), note: z.string().max(2000).optional() });
const SeedLineIn = z.object({ kind: z.literal('seed'), varietyKey: z.string().trim().min(1).max(60), gramsPerTray: z.number().positive('Grams per tray is above zero').max(100_000), share: z.number().positive().max(1).default(1), harvestGramsPerTray: MeasuredHarvestIn.nullable().default(null) });
const MediumLineIn = z.object({ kind: z.literal('medium'), mediumKey: z.string().trim().min(1).max(60), qtyPerTray: z.number().min(0).max(100_000).nullable().default(null) });
const NutrientLineIn = z.object({ kind: z.literal('nutrient'), nutrientKey: z.string().trim().min(1).max(60), mlPerGal: z.number().min(0).max(4_000).nullable().default(null), startsAt: z.enum(STAGE_KEYS) });
const LightLineIn = z.object({ kind: z.literal('light'), regimeKey: z.enum(['yield', 'balanced', 'nutrition-forward', 'biofortify-far-red', 'continuous']), ppfd: z.number().min(0).max(2_000).nullable().default(null), startsAt: z.enum(STAGE_KEYS) });
const LineIn = z.discriminatedUnion('kind', [SeedLineIn, MediumLineIn, NutrientLineIn, LightLineIn]);

const StageDaysIn = z.object({ soak: z.number().min(0).max(30), sow: z.number().min(0).max(30), germination: z.number().min(0).max(30), blackout: z.number().min(0).max(30), light: z.number().min(0).max(60), 'harvest-window': z.number().min(0).max(30) });

const GrowPlanInput = z.object({
  code: z.string().trim().regex(/^[A-Z]{2,5}-\d{2,3}$/, 'The code is a variety code, a dash and a serial: BROC-01'),
  name: z.string().trim().min(1).max(160),
  status: z.enum(['in_service', 'planned', 'developing']),
  channels: z.array(z.number().int().min(1).max(3)).default([]),
  format: z.enum(['flat-1020', 'tray-7x11', 'insert-5x5', 'pint-jar']),
  note: z.string().max(2000).default(''),
  allergensPresent: z.string().trim().max(500).default(''),
  allergenFreeClaims: z.string().trim().max(500).default(''),
  /** Null = the varieties' own days. */
  stageDays: StageDaysIn.nullable().default(null),
  lines: z.array(LineIn).min(1, 'A grow plan needs at least one line'),
});

function toGrowPlan(d: z.infer<typeof GrowPlanInput>): GrowPlanDef {
  const lines: GrowPlanLine[] = d.lines.map((l): GrowPlanLine => {
    switch (l.kind) {
      case 'seed':
        return { kind: 'seed', varietyKey: l.varietyKey, gramsPerTray: tagged(l.gramsPerTray, 'STATED', 'g', TYPED), share: l.share, ...(l.harvestGramsPerTray ? { harvestGramsPerTray: tagged(l.harvestGramsPerTray.value, 'DERIVED', l.harvestGramsPerTray.unit ?? 'g', l.harvestGramsPerTray.note) } : {}) };
      case 'medium':
        return { kind: 'medium', mediumKey: l.mediumKey, qtyPerTray: l.qtyPerTray === null ? null : tagged(l.qtyPerTray, 'STATED', 'per tray', TYPED) };
      case 'nutrient':
        return { kind: 'nutrient', nutrientKey: l.nutrientKey, mlPerGal: l.mlPerGal === null ? null : tagged(l.mlPerGal, 'STATED', 'ml/gal', TYPED), startsAt: l.startsAt };
      case 'light':
        return { kind: 'light', regimeKey: l.regimeKey, ppfd: l.ppfd === null ? null : tagged(l.ppfd, 'STATED', 'µmol/m²/s', TYPED), startsAt: l.startsAt };
    }
  });
  return {
    code: d.code,
    name: d.name,
    status: d.status,
    channels: [...new Set(d.channels)].sort(),
    format: d.format,
    lines,
    stageDays: d.stageDays === null ? null : tagged(d.stageDays, 'STATED', 'days', TYPED),
    note: d.note,
    allergensPresent: d.allergensPresent,
    allergenFreeClaims: d.allergenFreeClaims,
  };
}

/** A nutrient line must name a row of the workspace's Nutrients & Supplements library. */
async function nutrientProblems(plan: GrowPlanDef): Promise<string[]> {
  const known = new Set((await listNutrients()).map((n) => n.key));
  return plan.lines.filter((l) => l.kind === 'nutrient' && !known.has(l.nutrientKey)).map((l) => `Nutrient line: "${l.kind === 'nutrient' ? l.nutrientKey : ''}" is not in the Nutrients & Supplements library.`);
}

/** A medium line must name a row of the workspace's Media library. */
async function mediumProblems(plan: GrowPlanDef): Promise<string[]> {
  const known = new Set((await listMedia()).map((m) => m.key));
  return plan.lines.filter((l) => l.kind === 'medium' && !known.has(l.mediumKey)).map((l) => `Medium line: "${l.kind === 'medium' ? l.mediumKey : ''}" is not in the Media library.`);
}

const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || 'plan'}: ${i.message}`).join('; ');

/** Add a grow plan to the library. */
export async function createGrowPlan(...args: Parameters<typeof createGrowPlanInner>): ReturnType<typeof createGrowPlanInner> {
  return withWorkspace(() => createGrowPlanInner(...args));
}

async function createGrowPlanInner(input: unknown): Promise<Result<{ id: string; code: string }>> {
  const parsed = GrowPlanInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: issues(parsed.error) };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const plan = toGrowPlan(parsed.data);
  const problems = [...growPlanProblems(plan), ...(await nutrientProblems(plan)), ...(await mediumProblems(plan))];
  if (problems.length) return { ok: false, error: problems.join(' ') };
  const existing = await db.select({ id: farmGrowPlans.id }).from(farmGrowPlans).where(eq(farmGrowPlans.code, plan.code)).limit(1);
  if (existing[0]) return { ok: false, error: `Grow plan code ${plan.code} is already in the library.` };

  const { header, lines } = growPlanToRows(plan);
  const inserted = await db
    .insert(farmGrowPlans)
    .values({ ...header, effectiveFrom: new Date().toISOString().slice(0, 10), createdBy: access.userId })
    .returning({ id: farmGrowPlans.id });
  const id = inserted[0]?.id;
  if (!id) return { ok: false, error: 'Failed to save the grow plan.' };
  await db.insert(farmGrowPlanLines).values(lines.map((l) => ({ growPlanId: id, ...l })));
  revalidatePath('/farm', 'layout');
  return { ok: true, id, code: plan.code };
}

const UpdateInput = GrowPlanInput.extend({ id: z.string().uuid() });

/** Replace a library plan's header and lines; bumps the version. */
export async function updateGrowPlan(...args: Parameters<typeof updateGrowPlanInner>): ReturnType<typeof updateGrowPlanInner> {
  return withWorkspace(() => updateGrowPlanInner(...args));
}

async function updateGrowPlanInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = UpdateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: issues(parsed.error) };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const plan = toGrowPlan(parsed.data);
  const problems = [...growPlanProblems(plan), ...(await nutrientProblems(plan)), ...(await mediumProblems(plan))];
  if (problems.length) return { ok: false, error: problems.join(' ') };
  const current = await db.select({ id: farmGrowPlans.id, version: farmGrowPlans.version, code: farmGrowPlans.code }).from(farmGrowPlans).where(eq(farmGrowPlans.id, parsed.data.id)).limit(1);
  if (!current[0]) return { ok: false, error: 'Grow plan not found.' };
  if (current[0].code !== plan.code) {
    const clash = await db.select({ id: farmGrowPlans.id }).from(farmGrowPlans).where(eq(farmGrowPlans.code, plan.code)).limit(1);
    if (clash[0]) return { ok: false, error: `Grow plan code ${plan.code} is already in the library.` };
  }
  const { header, lines } = growPlanToRows(plan);
  await db
    .update(farmGrowPlans)
    .set({ ...header, source: undefined, version: current[0].version + 1, effectiveFrom: new Date().toISOString().slice(0, 10), updatedAt: new Date() })
    .where(eq(farmGrowPlans.id, parsed.data.id));
  await db.delete(farmGrowPlanLines).where(eq(farmGrowPlanLines.growPlanId, parsed.data.id));
  await db.insert(farmGrowPlanLines).values(lines.map((l) => ({ growPlanId: parsed.data.id, ...l })));
  revalidatePath('/farm', 'layout');
  return { ok: true, id: parsed.data.id };
}

const StatusInput = z.object({ id: z.string().uuid(), status: z.enum(['in_service', 'planned', 'developing']) });

export async function setGrowPlanStatus(...args: Parameters<typeof setGrowPlanStatusInner>): ReturnType<typeof setGrowPlanStatusInner> {
  return withWorkspace(() => setGrowPlanStatusInner(...args));
}

async function setGrowPlanStatusInner(input: unknown): Promise<Result> {
  const parsed = StatusInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: issues(parsed.error) };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  if (!GROW_PLAN_STATUSES.includes(parsed.data.status)) return { ok: false, error: 'Unknown status.' };
  await db.update(farmGrowPlans).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(farmGrowPlans.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

const DeleteInput = z.object({ id: z.string().uuid() });

/** Remove a plan. Refused while a sowing record names its code, or if it is the last one. */
export async function deleteGrowPlan(...args: Parameters<typeof deleteGrowPlanInner>): ReturnType<typeof deleteGrowPlanInner> {
  return withWorkspace(() => deleteGrowPlanInner(...args));
}

async function deleteGrowPlanInner(input: unknown): Promise<Result> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: issues(parsed.error) };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const row = await db.select({ code: farmGrowPlans.code }).from(farmGrowPlans).where(eq(farmGrowPlans.id, parsed.data.id)).limit(1);
  if (!row[0]) return { ok: false, error: 'Grow plan not found.' };
  const used = await db.select({ id: farmSowingRecords.id }).from(farmSowingRecords).where(eq(farmSowingRecords.growPlanCode, row[0].code)).limit(1);
  if (used[0]) return { ok: false, error: `Sowing records name ${row[0].code}; a plan with production history is not deleted.` };
  const count = await db.select({ id: farmGrowPlans.id }).from(farmGrowPlans);
  if (count.length <= 1) return { ok: false, error: 'The library keeps at least one grow plan.' };
  await db.delete(farmGrowPlans).where(eq(farmGrowPlans.id, parsed.data.id));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
