import 'server-only';
import { cookies } from 'next/headers';
import { desc, eq } from 'drizzle-orm';
import { farmScenarios, farmWorkspaceState } from '@mf/db';
import { db } from '@/lib/db';
import {
  resolveScenarioInputs,
  type FarmScenarioConfig,
  type ResolvedInputs,
} from '../_engine/scenario';
import { getFarmAccess } from './access';
import { listCropPlans } from './crop-plans';
import { listSubscribers } from './subscribers';
import { loadCalendar } from './periods';
import { loadSupplierTerms } from './working-capital';
import { listEquipment } from './equipment';
import { listPackagingLibrary } from './packaging';
import { listAllCatalog } from './supplier-catalog';
import { listLoans, listFixedCostLines, listLeasehold } from './finance';
import { listTimeStudies } from './time-studies';

/**
 * MicroFarm — scenario read layer (server-only).
 *
 * Three things, and the vocabulary is deliberate:
 *
 *   Plan of record — the one saved scenario the workspace reports against.
 *                    `farm.workspace_state.active_scenario_id`. Null means no
 *                    plan has been set and the platform falls back to the
 *                    plan-data defaults. Only a super admin sets it.
 *   Forecast       — any saved scenario. Anyone can open one and every page,
 *                    client and server, renders it until they return to the
 *                    plan of record. The open forecast is a cookie, so it
 *                    follows the person, not the workspace.
 *   Actuals        — recorded facts (sowing records, receipts, distributions) that
 *                    replace forecast lines as they are captured. Not built yet;
 *                    the ledger already posts only from a sowing record.
 *
 * `getScenarioView` is what a page renders: the open forecast if there is one,
 * otherwise the plan of record. `getActiveScenario` is the plan of record
 * itself, for the surfaces that must report against it regardless of what a
 * person has open (the evidence pack).
 */

const WORKSPACE_ID = 'default';
export const VIEW_COOKIE = 'farm_open_forecast';

export interface ActiveScenario {
  id: string;
  label: string;
  config: FarmScenarioConfig;
  appliedAt: Date | null;
}

/** The plan of record, or null when none has been set. */
export async function getActiveScenario(): Promise<ActiveScenario | null> {
  const ws = await db
    .select({
      activeId: farmWorkspaceState.activeScenarioId,
      appliedAt: farmWorkspaceState.appliedAt,
    })
    .from(farmWorkspaceState)
    .where(eq(farmWorkspaceState.id, WORKSPACE_ID))
    .limit(1);

  const activeId = ws[0]?.activeId ?? null;
  if (!activeId) return null;

  const row = await db
    .select({
      id: farmScenarios.id,
      label: farmScenarios.label,
      config: farmScenarios.config,
    })
    .from(farmScenarios)
    .where(eq(farmScenarios.id, activeId))
    .limit(1);

  if (!row[0]) return null;
  return {
    id: row[0].id,
    label: row[0].label,
    config: (row[0].config ?? {}) as FarmScenarioConfig,
    appliedAt: ws[0]?.appliedAt ?? null,
  };
}

export type ScenarioBasis = 'plan' | 'forecast';

export interface ScenarioView {
  /** What the pages render. */
  basis: ScenarioBasis;
  /** The open forecast's id, or the plan of record's id, or null for plan defaults. */
  id: string | null;
  label: string | null;
  config: FarmScenarioConfig;
  /** The plan of record's label, whatever is open. */
  planLabel: string | null;
  planId: string | null;
}

/**
 * The scenario a person is looking at: their open forecast when the cookie
 * names one they may see, otherwise the plan of record. A forecast another
 * user owns is visible only to a super admin; anyone else falls back to the
 * plan, and a stale cookie for a deleted forecast does the same.
 */
export async function getScenarioView(): Promise<ScenarioView> {
  const plan = await getActiveScenario();
  const base: ScenarioView = {
    basis: 'plan',
    id: plan?.id ?? null,
    label: plan?.label ?? null,
    config: plan?.config ?? {},
    planLabel: plan?.label ?? null,
    planId: plan?.id ?? null,
  };

  const jar = await cookies();
  const openId = jar.get(VIEW_COOKIE)?.value;
  if (!openId) return base;
  if (openId === plan?.id) return base;

  const [row, access] = await Promise.all([
    db
      .select({
        id: farmScenarios.id,
        label: farmScenarios.label,
        config: farmScenarios.config,
        ownerUserId: farmScenarios.ownerUserId,
      })
      .from(farmScenarios)
      .where(eq(farmScenarios.id, openId))
      .limit(1),
    getFarmAccess(),
  ]);
  const f = row[0];
  if (!f) return base;
  if (f.ownerUserId !== access.userId && !access.isSuperAdmin) return base;

  return {
    basis: 'forecast',
    id: f.id,
    label: f.label,
    config: (f.config ?? {}) as FarmScenarioConfig,
    planLabel: plan?.label ?? null,
    planId: plan?.id ?? null,
  };
}

/** The definitions a forecast resolves against, loaded once (Roadmap N6). */
export async function loadDefinitions() {
  const [library, subscribers, calendar, supplierTerms, equipment, packaging, catalog, loans, fixedCostLines, leasehold, timeStudies] = await Promise.all([listCropPlans(), listSubscribers(), loadCalendar(), loadSupplierTerms(), listEquipment(), listPackagingLibrary(), listAllCatalog(), listLoans(), listFixedCostLines(), listLeasehold(), listTimeStudies()]);
  return { library, subscribers, calendar, supplierTerms, equipment, packaging, catalog, loans, fixedCostLines, leasehold, timeStudies };
}

export type Definitions = Awaited<ReturnType<typeof loadDefinitions>>;

/** A scenario overlay resolved against the definitions — a saved config, or a working copy sent from the browser. */
export function resolveWithDefinitions(config: FarmScenarioConfig, d: Definitions): ResolvedInputs {
  return resolveScenarioInputs(config, d.library, d.subscribers, d.calendar.closures, d.supplierTerms, d.equipment, d.packaging, d.catalog, undefined, d.loans, d.fixedCostLines, d.leasehold, d.timeStudies.studies);
}

/**
 * Resolve what the person is looking at to engine-shaped inputs. Server-rendered
 * pages consume this so the statements follow the open forecast, or the plan of
 * record when none is open. Unsaved edits in the browser draft are not visible
 * here — a server page reflects the last saved version.
 */
export async function getResolvedActiveInputs(): Promise<{
  inputs: ResolvedInputs;
  label: string | null;
  basis: ScenarioBasis;
  planLabel: string | null;
}> {
  const [view, d] = await Promise.all([getScenarioView(), loadDefinitions()]);
  return {
    inputs: resolveWithDefinitions(view.config, d),
    label: view.label,
    basis: view.basis,
    planLabel: view.planLabel,
  };
}

export interface ScenarioListItem {
  id: string;
  label: string;
  source: string;
  ownerUserId: string;
  ownerTier: string;
  config: FarmScenarioConfig;
  updatedAt: Date;
  /** True for the plan of record. */
  isActive: boolean;
}

export async function listScenarios(opts: {
  userId: string;
  isSuperAdmin: boolean;
}): Promise<ScenarioListItem[]> {
  const [rows, ws] = await Promise.all([
    db.select().from(farmScenarios).orderBy(desc(farmScenarios.updatedAt)),
    db
      .select({ activeId: farmWorkspaceState.activeScenarioId })
      .from(farmWorkspaceState)
      .where(eq(farmWorkspaceState.id, WORKSPACE_ID))
      .limit(1),
  ]);

  const activeId = ws[0]?.activeId ?? null;
  const visible = opts.isSuperAdmin
    ? rows
    : rows.filter((r) => r.ownerUserId === opts.userId);

  return visible.map((r) => ({
    id: r.id,
    label: r.label,
    source: r.source,
    ownerUserId: r.ownerUserId,
    ownerTier: r.ownerTier,
    config: (r.config ?? {}) as FarmScenarioConfig,
    updatedAt: r.updatedAt,
    isActive: r.id === activeId,
  }));
}
