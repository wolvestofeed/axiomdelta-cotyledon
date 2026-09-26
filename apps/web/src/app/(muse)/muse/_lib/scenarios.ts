import 'server-only';
import { cookies } from 'next/headers';
import { desc, eq } from 'drizzle-orm';
import { museScenarios, museWorkspaceState } from '@ct/db';
import { db } from '@/lib/db';
import {
  resolveScenarioInputs,
  type MuseScenarioConfig,
  type ResolvedInputs,
} from '../_engine/scenario';
import { getMuseAccess } from './access';
import { listRecipes } from './recipes';
import { listCustomers } from './customers';
import { loadCalendar } from './periods';
import { loadSupplierTerms } from './working-capital';
import { listEquipment } from './equipment';
import { listPackagingLibrary } from './packaging';
import { listAllCatalog } from './supplier-catalog';
import { listLoans, listFixedCostLines, listLeasehold } from './finance';
import { listTimeStudies } from './time-studies';

/**
 * Impact OS — scenario read layer (server-only).
 *
 * Three things, and the vocabulary is deliberate:
 *
 *   Plan of record — the one saved scenario the workspace reports against.
 *                    `muse.workspace_state.active_scenario_id`. Null means no
 *                    plan has been set and the platform falls back to the
 *                    plan-data defaults. Only a super admin sets it.
 *   Forecast       — any saved scenario. Anyone can open one and every page,
 *                    client and server, renders it until they return to the
 *                    plan of record. The open forecast is a cookie, so it
 *                    follows the person, not the workspace.
 *   Actuals        — recorded facts (batch records, receipts, deliveries) that
 *                    replace forecast lines as they are captured. Not built yet;
 *                    the ledger already posts only from a batch record.
 *
 * `getScenarioView` is what a page renders: the open forecast if there is one,
 * otherwise the plan of record. `getActiveScenario` is the plan of record
 * itself, for the surfaces that must report against it regardless of what a
 * person has open (the evidence pack).
 */

const WORKSPACE_ID = 'default';
export const VIEW_COOKIE = 'muse_open_forecast';

export interface ActiveScenario {
  id: string;
  label: string;
  config: MuseScenarioConfig;
  appliedAt: Date | null;
}

/** The plan of record, or null when none has been set. */
export async function getActiveScenario(): Promise<ActiveScenario | null> {
  const ws = await db
    .select({
      activeId: museWorkspaceState.activeScenarioId,
      appliedAt: museWorkspaceState.appliedAt,
    })
    .from(museWorkspaceState)
    .where(eq(museWorkspaceState.id, WORKSPACE_ID))
    .limit(1);

  const activeId = ws[0]?.activeId ?? null;
  if (!activeId) return null;

  const row = await db
    .select({
      id: museScenarios.id,
      label: museScenarios.label,
      config: museScenarios.config,
    })
    .from(museScenarios)
    .where(eq(museScenarios.id, activeId))
    .limit(1);

  if (!row[0]) return null;
  return {
    id: row[0].id,
    label: row[0].label,
    config: (row[0].config ?? {}) as MuseScenarioConfig,
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
  config: MuseScenarioConfig;
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
        id: museScenarios.id,
        label: museScenarios.label,
        config: museScenarios.config,
        ownerUserId: museScenarios.ownerUserId,
      })
      .from(museScenarios)
      .where(eq(museScenarios.id, openId))
      .limit(1),
    getMuseAccess(),
  ]);
  const f = row[0];
  if (!f) return base;
  if (f.ownerUserId !== access.userId && !access.isSuperAdmin) return base;

  return {
    basis: 'forecast',
    id: f.id,
    label: f.label,
    config: (f.config ?? {}) as MuseScenarioConfig,
    planLabel: plan?.label ?? null,
    planId: plan?.id ?? null,
  };
}

/** The definitions a forecast resolves against, loaded once (Roadmap N6). */
export async function loadDefinitions() {
  const [library, customers, calendar, supplierTerms, equipment, packaging, catalog, loans, fixedCostLines, leasehold, timeStudies] = await Promise.all([listRecipes(), listCustomers(), loadCalendar(), loadSupplierTerms(), listEquipment(), listPackagingLibrary(), listAllCatalog(), listLoans(), listFixedCostLines(), listLeasehold(), listTimeStudies()]);
  return { library, customers, calendar, supplierTerms, equipment, packaging, catalog, loans, fixedCostLines, leasehold, timeStudies };
}

export type Definitions = Awaited<ReturnType<typeof loadDefinitions>>;

/** A scenario overlay resolved against the definitions — a saved config, or a working copy sent from the browser. */
export function resolveWithDefinitions(config: MuseScenarioConfig, d: Definitions): ResolvedInputs {
  return resolveScenarioInputs(config, d.library, d.customers, d.calendar.closures, d.supplierTerms, d.equipment, d.packaging, d.catalog, undefined, d.loans, d.fixedCostLines, d.leasehold, d.timeStudies.studies);
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
  config: MuseScenarioConfig;
  updatedAt: Date;
  /** True for the plan of record. */
  isActive: boolean;
}

export async function listScenarios(opts: {
  userId: string;
  isSuperAdmin: boolean;
}): Promise<ScenarioListItem[]> {
  const [rows, ws] = await Promise.all([
    db.select().from(museScenarios).orderBy(desc(museScenarios.updatedAt)),
    db
      .select({ activeId: museWorkspaceState.activeScenarioId })
      .from(museWorkspaceState)
      .where(eq(museWorkspaceState.id, WORKSPACE_ID))
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
    config: (r.config ?? {}) as MuseScenarioConfig,
    updatedAt: r.updatedAt,
    isActive: r.id === activeId,
  }));
}
