'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { farmExperiments, farmGrowPlanLines, farmGrowPlans, farmSowingRecords } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmOperator, requireFarmSuperAdmin } from '@/server/access';
import { listGrowPlans } from '@/server/grow-plans';
import { withWorkspace } from '@/server/workspace';
import { listExperiments } from '@/server/experiments';
import { loadProductionRecords } from '@/server/actuals';
import { promotePlan } from '@/engine/experiments';
import { growPlanToRows } from '@/engine/grow-plan-library';

/**
 * Cotyledon — experiments in R&D, writes. An operator starts an experiment: a title, a grow plan
 * not in service, a sow date and whole trays. It closes through the grow form, whose sowing record
 * names it. An experiment no record names can be removed by a super admin; a closed one cannot. A
 * super admin moves a plan to in service.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}

const StartInput = z.object({
  title: z.string().trim().min(3, 'Title the experiment').max(160),
  growPlanCode: z.string().trim().min(1, 'Choose a grow plan'),
  sowDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  trays: z.number().int('Whole trays only').min(1, 'At least one tray').max(1_000),
  note: z.string().trim().max(2000).default(''),
});

export async function startExperiment(...args: Parameters<typeof startExperimentInner>): ReturnType<typeof startExperimentInner> {
  return withWorkspace(() => startExperimentInner(...args));
}

async function startExperimentInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = StartInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const plan = (await listGrowPlans()).find((p) => p.code === d.growPlanCode);
  if (!plan) return { ok: false, error: `${d.growPlanCode} is not in the grow plan library.` };
  if (plan.status === 'in_service') return { ok: false, error: `${plan.code} is in service; an experiment runs a plan under development.` };
  const rows = await db
    .insert(farmExperiments)
    .values({ title: d.title, growPlanCode: plan.code, sowDate: d.sowDate, trays: d.trays, note: d.note || null, createdBy: access.userId })
    .returning({ id: farmExperiments.id });
  if (!rows[0]) return { ok: false, error: 'Failed to start the experiment.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id: rows[0].id };
}

export async function deleteExperiment(...args: Parameters<typeof deleteExperimentInner>): ReturnType<typeof deleteExperimentInner> {
  return withWorkspace(() => deleteExperimentInner(...args));
}

async function deleteExperimentInner(id: unknown): Promise<Result> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: 'Unknown experiment.' };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const closedBy = await db.select({ id: farmSowingRecords.id }).from(farmSowingRecords).where(eq(farmSowingRecords.experimentId, parsed.data)).limit(1);
  if (closedBy[0]) return { ok: false, error: 'A sowing record names this experiment; it stays with the record.' };
  await db.delete(farmExperiments).where(eq(farmExperiments.id, parsed.data));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

export async function moveToInService(...args: Parameters<typeof moveToInServiceInner>): ReturnType<typeof moveToInServiceInner> {
  return withWorkspace(() => moveToInServiceInner(...args));
}

/**
 * Move a plan under development to in service, as Rob judges its experiments: each variety a closed
 * experiment packed takes the mean grams per tray packed as its harvest (`promotePlan`), the plan's
 * version steps up, and it is offered on the channels chosen at the move.
 */
const MoveInput = z.object({ growPlanCode: z.string().trim().min(1), channels: z.array(z.number().int().min(1).max(3)).max(3) });

async function moveToInServiceInner(input: unknown): Promise<Result<{ measured: string[]; unmeasured: string[] }>> {
  const parsed = MoveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Unknown grow plan or channel.' };
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const plan = (await listGrowPlans()).find((p) => p.code === parsed.data.growPlanCode);
  if (!plan) return { ok: false, error: `${parsed.data.growPlanCode} is not in the grow plan library.` };
  if (plan.status === 'in_service') return { ok: false, error: `${plan.code} is already in service.` };
  const [experiments, { sowings }] = await Promise.all([listExperiments(), loadProductionRecords()]);
  const today = new Date().toISOString().slice(0, 10);
  const promoted = promotePlan(plan, experiments, sowings, today, parsed.data.channels);
  const { header, lines } = growPlanToRows(promoted.plan);
  const current = await db.select({ version: farmGrowPlans.version }).from(farmGrowPlans).where(eq(farmGrowPlans.id, plan.id)).limit(1);
  if (!current[0]) return { ok: false, error: 'Grow plan not found.' };
  await db
    .update(farmGrowPlans)
    .set({ status: header.status, channels: header.channels, version: current[0].version + 1, effectiveFrom: today, updatedAt: new Date() })
    .where(eq(farmGrowPlans.id, plan.id));
  await db.delete(farmGrowPlanLines).where(eq(farmGrowPlanLines.growPlanId, plan.id));
  await db.insert(farmGrowPlanLines).values(lines.map((l) => ({ growPlanId: plan.id, ...l })));
  revalidatePath('/farm', 'layout');
  return { ok: true, measured: promoted.measured.map((m) => `${m.name} ${Math.round(m.grams)} g (${m.n})`), unmeasured: promoted.unmeasured };
}
