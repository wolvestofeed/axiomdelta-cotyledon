import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

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
export function createDb(connectionString: string): DbHandle {
  const pool = new pg.Pool({ connectionString });
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
