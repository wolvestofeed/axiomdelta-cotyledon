import 'server-only';
import { createDb, type DbHandle } from '@ct/db';

/**
 * Server-only singleton Drizzle handle. We hold one process-wide pool
 * (next dev hot-reload aware via globalThis) so we don't leak
 * connections between RSC renders.
 */
declare global {
  // eslint-disable-next-line no-var
  var __ct_db_handle__: DbHandle | undefined;
}

function getHandle(): DbHandle {
  if (!globalThis.__ct_db_handle__) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set in apps/web environment.');
    }
    globalThis.__ct_db_handle__ = createDb(url);
  }
  return globalThis.__ct_db_handle__;
}

export const db = new Proxy({} as DbHandle['db'], {
  get(_, prop) {
    const target = getHandle().db as unknown as Record<PropertyKey, unknown>;
    return target[prop as string];
  },
});
