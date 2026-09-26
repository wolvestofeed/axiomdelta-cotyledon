import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { eq, sql } from 'drizzle-orm';
import { farmWorkspaces, type FarmWorkspaceRow } from '@mf/db';
import { rootDb, workspaceScope, type Db } from '@/lib/db';

/**
 * MicroFarm — the workspace scope (outline §7).
 *
 * A workspace is a farm, and a farm is one Clerk organization. The signed-in person's active
 * organization names the workspace. Every entry point runs inside `withWorkspace()`: it opens
 * a transaction, sets `app.workspace_id` for row-level security, and runs the entry point in
 * an async scope that `db` reads. Nested calls reuse the scope they are in.
 *
 * With no organization active there is no scope: `db` throws, and the front door sends the
 * person to choose or create a farm.
 */

/** The workspace for a Clerk organization, provisioned on first sight. */
export async function workspaceForOrg(orgId: string, orgSlug: string | null | undefined): Promise<FarmWorkspaceRow> {
  const found = await rootDb.select().from(farmWorkspaces).where(eq(farmWorkspaces.clerkOrgId, orgId)).limit(1);
  if (found[0]) return found[0];
  const inserted = await rootDb
    .insert(farmWorkspaces)
    .values({ clerkOrgId: orgId, name: orgSlug ?? orgId, slug: orgSlug ?? null })
    .onConflictDoNothing({ target: farmWorkspaces.clerkOrgId })
    .returning();
  if (inserted[0]) return inserted[0];
  const again = await rootDb.select().from(farmWorkspaces).where(eq(farmWorkspaces.clerkOrgId, orgId)).limit(1);
  return again[0]!;
}

/** Run `fn` scoped to one workspace by id. Scripts and tests use this; entry points use `withWorkspace`. */
export async function withWorkspaceId<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
  const existing = workspaceScope.getStore();
  if (existing?.workspaceId === workspaceId) return fn();
  return rootDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);
    return workspaceScope.run({ workspaceId, db: tx as unknown as Db }, fn);
  });
}

/**
 * Run an entry point in the signed-in person's workspace. Signed out, or signed in with no
 * organization active, `fn` runs with no scope: pages that need data throw, pages that only
 * redirect or explain still render.
 */
export async function withWorkspace<T>(fn: () => Promise<T>): Promise<T> {
  if (workspaceScope.getStore()) return fn();
  const { userId, orgId, orgSlug } = await auth();
  if (!userId || !orgId) return fn();
  const ws = await workspaceForOrg(orgId, orgSlug);
  return withWorkspaceId(ws.id, fn);
}

/** The workspace row in scope, read once per call. */
export async function currentWorkspace(): Promise<FarmWorkspaceRow | null> {
  const scope = workspaceScope.getStore();
  if (!scope) return null;
  const rows = await rootDb.select().from(farmWorkspaces).where(eq(farmWorkspaces.id, scope.workspaceId)).limit(1);
  return rows[0] ?? null;
}
