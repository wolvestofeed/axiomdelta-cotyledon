import { eq } from 'drizzle-orm';
import { createDb, dbUrlFromEnv, farmWorkspaces, type DbHandle } from '../../../packages/db/src/index.js';

/**
 * A database handle scoped to one workspace, for scripts. `FARM_WORKSPACE` names the
 * workspace by its id or by its Clerk organization id. Every query the handle runs sees
 * that workspace's rows and inserts into it (row-level security, migration 0002).
 */
export async function scopedHandle(): Promise<DbHandle> {
  const key = process.env['FARM_WORKSPACE'];
  if (!key) throw new Error('FARM_WORKSPACE is not set: the workspace id or Clerk organization id to run against.');
  const root = createDb(dbUrlFromEnv());
  try {
    const byId = /^[0-9a-f-]{36}$/i.test(key) ? await root.db.select({ id: farmWorkspaces.id }).from(farmWorkspaces).where(eq(farmWorkspaces.id, key)).limit(1) : [];
    const byOrg = byId[0] ? [] : await root.db.select({ id: farmWorkspaces.id }).from(farmWorkspaces).where(eq(farmWorkspaces.clerkOrgId, key)).limit(1);
    const id = byId[0]?.id ?? byOrg[0]?.id;
    if (!id) throw new Error(`No workspace matches FARM_WORKSPACE=${key}. Sign in to the farm's organization once so it is provisioned.`);
    return createDb(dbUrlFromEnv(), { workspaceId: id });
  } finally {
    await root.close();
  }
}
