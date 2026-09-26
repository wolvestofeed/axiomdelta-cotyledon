import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createDb, type DbHandle } from '@mf/db';

/**
 * Two database handles.
 *
 * `db` is the one every read and action uses. It resolves to the transaction of the
 * workspace in scope, opened by `withWorkspace()` at the entry point (a page, a layout, a
 * route handler, a server action). Inside that transaction `app.workspace_id` is set, so
 * row-level security shows the workspace's rows and `workspace_id` defaults on insert.
 * With no scope, `db` throws: a query that forgot its workspace fails, it never leaks.
 *
 * `rootDb` is unscoped: the process-wide pool, for the `farm.workspaces` table and for
 * opening scopes. Nothing else reads it.
 */

export type Db = DbHandle['db'];

export interface WorkspaceScope {
  workspaceId: string;
  db: Db;
}

declare global {
  var __mf_db_handle__: DbHandle | undefined;
  var __mf_workspace_scope__: AsyncLocalStorage<WorkspaceScope> | undefined;
}

function getHandle(): DbHandle {
  if (!globalThis.__mf_db_handle__) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set in apps/web environment.');
    globalThis.__mf_db_handle__ = createDb(url);
  }
  return globalThis.__mf_db_handle__;
}

/** The scope store, held on globalThis so hot reloads share one instance. */
export const workspaceScope: AsyncLocalStorage<WorkspaceScope> =
  globalThis.__mf_workspace_scope__ ?? (globalThis.__mf_workspace_scope__ = new AsyncLocalStorage<WorkspaceScope>());

export class NoWorkspaceScopeError extends Error {
  constructor() {
    super('No workspace in scope. Wrap the entry point in withWorkspace().');
    this.name = 'NoWorkspaceScopeError';
  }
}

export const rootDb: Db = new Proxy({} as Db, {
  get(_, prop) {
    const target = getHandle().db as unknown as Record<PropertyKey, unknown>;
    return target[prop as string];
  },
});

export const db: Db = new Proxy({} as Db, {
  get(_, prop) {
    const scope = workspaceScope.getStore();
    if (!scope) throw new NoWorkspaceScopeError();
    const target = scope.db as unknown as Record<PropertyKey, unknown>;
    return target[prop as string];
  },
});

/** The workspace in scope, or null outside one. */
export function currentWorkspaceId(): string | null {
  return workspaceScope.getStore()?.workspaceId ?? null;
}
