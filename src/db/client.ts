import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import * as schema from '@/db/schema';

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close(): Promise<void>;
}

/**
 * Create a Drizzle handle bound to the given connection string.
 * Pass `connectionString` explicitly so callers can target dev /
 * preview / test databases without environment surgery.
 */
export function createDb(connectionString: string, opts: { workspaceId?: string } = {}): DbHandle {
  // A workspace-scoped handle sets `app.workspace_id` on every connection at startup, so
  // row-level security and the `workspace_id` default apply to every query it runs.
  const pool = new pg.Pool({ connectionString, ...(opts.workspaceId ? { options: `-c app.workspace_id=${opts.workspaceId}` } : {}) });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    close: () => pool.end(),
  };
}

/** Convenience: read DATABASE_URL or throw. */
export function dbUrlFromEnv(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Provide a Postgres connection string ' +
        '(Neon, local docker, etc.) before running migrations or queries.',
    );
  }
  return url;
}

/**
 * Run `fn` inside a transaction scoped to one workspace: the `app.workspace_id` setting is
 * what every farm table's row-level-security policy and `workspace_id` default read. The
 * web app wraps every entry point this way (`_lib/workspace.ts`); scripts call it directly.
 */
export async function withWorkspaceTx<T>(handle: DbHandle, workspaceId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  return handle.db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.workspace_id', ${workspaceId}, true)`);
    return fn(tx as unknown as Db);
  });
}
