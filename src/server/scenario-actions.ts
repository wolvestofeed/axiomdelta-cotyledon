'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { farmScenarios, farmWorkspaceState } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmSuperAdmin, requireFarmOperator } from '@/server/access';
import { appendPosting } from '@/server/posting-log';
import { loadDefinitions } from '@/server/scenarios';
import { periodOf } from '@/engine/actuals';
import { withWorkspace } from '@/server/workspace';

/**
 * Cotyledon — scenario write actions.
 *
 *   saveScenario   — any operator or admin; creates or updates a scenario they own
 *                    (super admins may update any). Never touches the live
 *                    master pointer. This is "Save as forecast" / Section Save.
 *   applyScenario  — SUPER ADMIN ONLY; points the workspace at a scenario, making
 *                    it the plan of record, and posts the change to the trail with
 *                    the config as applied, so a past month compares with the plan
 *                    in force at its end (Roadmap N7).
 *   saveAndApply   — SUPER ADMIN ONLY; the "Apply as live" one-shot (save the
 *                    working draft, then promote it).
 *   deleteScenario — owner or super admin; refuses to delete the live master.
 *
 * The `config` overlay is validated as loose JSON here; the engine's resolver
 * is the authority on its shape. Revalidates the whole /farm layout so every
 * page re-reads the new master after an apply.
 *
 * Every action gates on a THROWING guard (`requireFarmOperator` /
 * `requireFarmSuperAdmin`), so the body cannot run for a caller who is not
 * entitled to it. The refusal is converted to a result only so the UI can show
 * the reason; the gate itself is not ignorable.
 */

const WORKSPACE_ID = 'default';

// The overlay is a nested partial of numeric leaves — validate that it is a
// plain JSON object and defer shape-checking to the engine resolver.
const ConfigSchema = z.record(z.string(), z.unknown());

const SaveInput = z.object({
  scenarioId: z.string().uuid().optional(),
  label: z.string().trim().min(1, 'Name the scenario').max(120),
  config: ConfigSchema,
});

type SaveResult = { ok: true; id: string } | { ok: false; error: string };
type OkResult = { ok: true } | { ok: false; error: string };

function parseError(issues: z.ZodIssue[]): string {
  return issues.map((i) => i.message).join('; ');
}

/** Create or update a saved scenario. Never promotes to live. */
export async function saveScenario(...args: Parameters<typeof saveScenarioInner>): ReturnType<typeof saveScenarioInner> {
  return withWorkspace(() => saveScenarioInner(...args));
}

async function saveScenarioInner(input: unknown): Promise<SaveResult> {
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parseError(parsed.error.issues) };

  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const { scenarioId, label, config } = parsed.data;

  if (scenarioId) {
    const existing = await db
      .select({ ownerUserId: farmScenarios.ownerUserId })
      .from(farmScenarios)
      .where(eq(farmScenarios.id, scenarioId))
      .limit(1);
    if (!existing[0]) return { ok: false, error: 'Scenario not found.' };
    if (existing[0].ownerUserId !== access.userId && !access.isSuperAdmin) {
      return { ok: false, error: 'You can only edit your own scenarios.' };
    }
    await db
      .update(farmScenarios)
      .set({ label, config, updatedAt: new Date() })
      .where(eq(farmScenarios.id, scenarioId));
    revalidatePath('/farm', 'layout');
    return { ok: true, id: scenarioId };
  }

  const inserted = await db
    .insert(farmScenarios)
    .values({
      label,
      source: 'user_built',
      config,
      ownerUserId: access.userId,
      ownerTier: access.tier,
    })
    .returning({ id: farmScenarios.id });

  if (!inserted[0]) return { ok: false, error: 'Failed to save scenario.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id: inserted[0].id };
}

const ApplyInput = z.object({ scenarioId: z.string().uuid() });

/** Promote a saved scenario to the live master model. Super admin only. */
export async function applyScenario(...args: Parameters<typeof applyScenarioInner>): ReturnType<typeof applyScenarioInner> {
  return withWorkspace(() => applyScenarioInner(...args));
}

async function applyScenarioInner(input: unknown): Promise<OkResult> {
  const parsed = ApplyInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parseError(parsed.error.issues) };

  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) {
      return { ok: false, error: 'Only a super admin can apply a scenario as the live model.' };
    }
    throw e;
  }

  const exists = await db
    .select({ id: farmScenarios.id, label: farmScenarios.label, config: farmScenarios.config })
    .from(farmScenarios)
    .where(eq(farmScenarios.id, parsed.data.scenarioId))
    .limit(1);
  const scenario = exists[0];
  if (!scenario) return { ok: false, error: 'Scenario not found.' };

  // The master records as they stand, frozen with the entry: a past month compares
  // with the plan as it was, not with definitions edited since. JSON round-trip so the stored detail and
  // the hashed detail are the same value.
  const definitions = await loadDefinitions();
  const snapshot = JSON.parse(JSON.stringify({ definitions })) as unknown;
  const at = new Date();
  await db.transaction(async (tx) => {
    // The workspace's state row is written on its first apply; a workspace has none until then.
    await tx
      .insert(farmWorkspaceState)
      .values({ id: WORKSPACE_ID, activeScenarioId: parsed.data.scenarioId, appliedAt: at, appliedBy: access.userId })
      .onConflictDoUpdate({
        target: [farmWorkspaceState.workspaceId, farmWorkspaceState.id],
        set: { activeScenarioId: parsed.data.scenarioId, appliedAt: at, appliedBy: access.userId },
      });
    // The plan of record's history: the forecast, its config and the master records as applied.
    // A later save to the forecast, or an edit to a definition, does not restate the months it was in force.
    await appendPosting(tx, {
      actorUserId: access.userId,
      actorEmail: access.email,
      action: 'set_plan_of_record',
      recordKind: 'scenario',
      recordId: scenario.id,
      period: periodOf(at.toISOString().slice(0, 10)),
      detail: { label: scenario.label, appliedAt: at.toISOString(), config: JSON.parse(JSON.stringify(scenario.config ?? {})), snapshot },
    });
  });

  revalidatePath('/farm', 'layout');
  return { ok: true };
}

/** Save the working draft and promote it in one step. Super admin only. */
export async function saveAndApply(...args: Parameters<typeof saveAndApplyInner>): ReturnType<typeof saveAndApplyInner> {
  return withWorkspace(() => saveAndApplyInner(...args));
}

async function saveAndApplyInner(input: unknown): Promise<SaveResult> {
  try {
    await requireFarmSuperAdmin();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) {
      return { ok: false, error: 'Only a super admin can apply a scenario as the live model.' };
    }
    throw e;
  }
  const saved = await saveScenario(input);
  if (!saved.ok) return saved;
  const applied = await applyScenario({ scenarioId: saved.id });
  if (!applied.ok) return { ok: false, error: applied.error };
  return saved;
}

const OpenInput = z.object({ scenarioId: z.string().uuid() });
const VIEW_COOKIE = 'farm_open_forecast';

/**
 * Open a saved forecast for this person: every page, client and server, renders
 * it until `closeForecast`. The choice is a cookie — it follows the person, not
 * the workspace — so nothing here touches the plan of record.
 */
export async function openForecast(...args: Parameters<typeof openForecastInner>): ReturnType<typeof openForecastInner> {
  return withWorkspace(() => openForecastInner(...args));
}

async function openForecastInner(input: unknown): Promise<OkResult> {
  const parsed = OpenInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parseError(parsed.error.issues) };

  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }

  const row = await db
    .select({ ownerUserId: farmScenarios.ownerUserId })
    .from(farmScenarios)
    .where(eq(farmScenarios.id, parsed.data.scenarioId))
    .limit(1);
  if (!row[0]) return { ok: false, error: 'Forecast not found.' };
  if (row[0].ownerUserId !== access.userId && !access.isSuperAdmin) {
    return { ok: false, error: 'You can only open your own forecasts.' };
  }

  const jar = await cookies();
  jar.set(VIEW_COOKIE, parsed.data.scenarioId, {
    path: '/farm',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

/** Return this person to the plan of record. */
export async function closeForecast(...args: Parameters<typeof closeForecastInner>): ReturnType<typeof closeForecastInner> {
  return withWorkspace(() => closeForecastInner(...args));
}

async function closeForecastInner(): Promise<OkResult> {
  try {
    await requireFarmOperator();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }
  const jar = await cookies();
  jar.delete({ name: VIEW_COOKIE, path: '/farm' });
  revalidatePath('/farm', 'layout');
  return { ok: true };
}

const DeleteInput = z.object({ scenarioId: z.string().uuid() });

/** Delete a scenario. Owner or super admin; refuses the live master. */
export async function deleteScenario(...args: Parameters<typeof deleteScenarioInner>): ReturnType<typeof deleteScenarioInner> {
  return withWorkspace(() => deleteScenarioInner(...args));
}

async function deleteScenarioInner(input: unknown): Promise<OkResult> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parseError(parsed.error.issues) };

  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    const refused = accessRefusal(e);
    if (refused) return refused;
    throw e;
  }

  const [existing, ws] = await Promise.all([
    db
      .select({ ownerUserId: farmScenarios.ownerUserId })
      .from(farmScenarios)
      .where(eq(farmScenarios.id, parsed.data.scenarioId))
      .limit(1),
    db
      .select({ activeId: farmWorkspaceState.activeScenarioId })
      .from(farmWorkspaceState)
      .where(eq(farmWorkspaceState.id, WORKSPACE_ID))
      .limit(1),
  ]);

  if (!existing[0]) return { ok: false, error: 'Scenario not found.' };
  if (existing[0].ownerUserId !== access.userId && !access.isSuperAdmin) {
    return { ok: false, error: 'You can only delete your own scenarios.' };
  }
  if (ws[0]?.activeId === parsed.data.scenarioId) {
    return {
      ok: false,
      error: 'This is the live model. Apply a different scenario before deleting it.',
    };
  }

  await db.delete(farmScenarios).where(eq(farmScenarios.id, parsed.data.scenarioId));
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
