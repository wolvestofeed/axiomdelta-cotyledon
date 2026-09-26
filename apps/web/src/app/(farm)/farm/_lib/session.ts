import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { devBypass, devIdentity } from './dev-bypass';

/**
 * MicroFarm — who is signed in, read in one place.
 *
 * Clerk's session, or under the local development bypass (`dev-bypass.ts`) a fixed admin of the
 * local workspace. `workspace.ts`, `access.ts` and the front door read this and nothing else reads
 * Clerk's session directly.
 */

export interface Session {
  userId: string | null;
  orgId: string | null;
  orgSlug: string | null;
  orgRole: string | null;
}

export interface SessionUser {
  email: string | null;
  name: string | null;
  /** True when the account carries the `farmSuperAdmin` flag in its public metadata. */
  metaSuperAdmin: boolean;
}

export async function getSession(): Promise<Session> {
  if (devBypass()) {
    const d = devIdentity();
    return { userId: d.userId, orgId: d.orgId, orgSlug: d.orgSlug, orgRole: d.orgRole };
  }
  const { userId, orgId, orgSlug, orgRole } = await auth();
  return { userId: userId ?? null, orgId: orgId ?? null, orgSlug: orgSlug ?? null, orgRole: orgRole ?? null };
}

export async function getSessionUser(): Promise<SessionUser> {
  if (devBypass()) {
    const d = devIdentity();
    return { email: d.email, name: d.name, metaSuperAdmin: false };
  }
  const user = await currentUser();
  return {
    email: user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null,
    name: user?.fullName ?? null,
    metaSuperAdmin: user?.publicMetadata?.['farmSuperAdmin'] === true,
  };
}
