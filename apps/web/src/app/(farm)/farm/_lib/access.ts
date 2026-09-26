import 'server-only';
import { getSession, getSessionUser } from './session';
import { activeStaffByEmail } from './staff-login';
import { currentWorkspaceId } from '@/lib/db';

/**
 * Access control for the OS route group.
 *
 * Two roles: admin and operator. An admin is always an operator. There is no third role.
 * The roles come from the Clerk organization that is the workspace (outline §7): `org:admin`
 * is an admin, any member is an operator, and the platform admins named below are admins in
 * every organization they belong to. External portal accounts hold neither role.
 * Sign-in itself is enforced by `proxy.ts`. Under the local development bypass (`dev-bypass.ts`)
 * every request is an admin of the local workspace.
 */

const PLATFORM_ADMINS: string[] = [
  'lonewolf@wolvestofeed.com', // Robert Bogatin
];

function platformAdmins(): string[] {
  const fromEnv = (process.env['FARM_PLATFORM_ADMIN_EMAILS'] ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...PLATFORM_ADMINS, ...fromEnv])];
}

export type FarmTier = 'super_admin' | 'user';

export interface FarmAccess {
  userId: string | null;
  email: string | null;
  /** The account's full name from Clerk; null when the account has none. */
  name: string | null;
  /** The Clerk organization active for this sign-in, which names the workspace; null when none. */
  orgId: string | null;
  /** The workspace in scope; null outside a scope. */
  workspaceId: string | null;
  /** Admins: the organization's admins, and the platform admins in any organization. */
  isSuperAdmin: boolean;
  /** Operators, and every admin: anyone who is a member of the active organization. Holding this is what opens the OS at all. */
  isOperator: boolean;
  /** The signed-in person's row on the staff register, matched by email; null when none. */
  staffId: string | null;
  /** Work roles on the staff register ('operator', 'sales'); empty with no matched record. */
  staffRoles: string[];
  /** Convenience: the tier stamped onto scenarios this user saves. */
  tier: FarmTier;
}

const NO_ACCESS: FarmAccess = { userId: null, email: null, name: null, orgId: null, workspaceId: null, isSuperAdmin: false, isOperator: false, staffId: null, staffRoles: [], tier: 'user' };

/**
 * Who the caller is, in the workspace in scope.
 *
 * Roles come from the Clerk organization (one organization per farm): `org:admin` is an admin,
 * any other membership is an operator. The platform admins named above are admins of every
 * organization they are a member of. An active person on the staff register whose email is
 * the sign-in is matched to their own record, which needs a workspace in scope.
 */
export async function getFarmAccess(): Promise<FarmAccess> {
  const { userId, orgId, orgRole } = await getSession();
  if (!userId) return NO_ACCESS;

  const user = await getSessionUser();
  const email = user.email;

  const metaSuper = user.metaSuperAdmin;
  const platformAdmin = email !== null && platformAdmins().includes(email);
  const orgAdmin = orgId != null && orgRole === 'org:admin';
  const isSuperAdmin = orgId != null && (orgAdmin || platformAdmin || metaSuper);
  const isOperator = orgId != null;

  const workspaceId = currentWorkspaceId();
  const staff = email !== null && workspaceId !== null ? await activeStaffByEmail(email) : null;

  return {
    userId,
    email,
    name: user.name,
    orgId: orgId ?? null,
    workspaceId,
    isSuperAdmin,
    isOperator,
    staffId: staff?.id ?? null,
    staffRoles: staff?.roles ?? [],
    tier: isSuperAdmin ? 'super_admin' : 'user',
  };
}

// ── Fail-closed guards (the gate every Farm write passes) ───────────────────

/**
 * Why these exist, and why `getFarmAccess` is not enough on its own.
 *
 * `getFarmAccess()` RETURNS a record; a caller that forgets to check it, or
 * checks the wrong field, proceeds with no access control at all. The guards
 * below THROW instead, so the body of an action cannot run for a caller who is
 * not entitled to it — the same fail-closed contract Staffing's
 * `requireWorkspaceAccess` holds for workspace-scoped data.
 *
 * The workspace boundary is the Clerk organization plus the database's row-level
 * security (`_lib/workspace.ts`); these guards are the role check on top of it.
 */

export type FarmAccessDenial = 'not_signed_in' | 'not_super_admin' | 'not_operator';

const DENIAL_MESSAGE: Record<FarmAccessDenial, string> = {
  not_signed_in: 'Sign in to continue.',
  not_super_admin: 'Super admin only.',
  not_operator: 'Not authorized for this workspace.',
};

/** Thrown by the guards below. Never returned — a denial must not be ignorable. */
export class FarmAccessError extends Error {
  readonly code: FarmAccessDenial;

  constructor(code: FarmAccessDenial) {
    super(DENIAL_MESSAGE[code]);
    this.name = 'FarmAccessError';
    this.code = code;
  }
}

/** An access record known to carry a signed-in user id. */
export type FarmIdentity = FarmAccess & { userId: string };

/** Throws unless the caller is a super admin. */
export async function requireFarmSuperAdmin(): Promise<FarmIdentity> {
  const access = await getFarmAccess();
  if (!access.userId) throw new FarmAccessError('not_signed_in');
  if (!access.isSuperAdmin) throw new FarmAccessError('not_super_admin');
  return access as FarmIdentity;
}

/**
 * Throws unless the caller holds a role: an operator or an admin (admins are
 * always operators). The gate for every operator write — recording on the
 * Grow Room, the clock, saving one's own forecast.
 */
export async function requireFarmOperator(): Promise<FarmIdentity> {
  const access = await getFarmAccess();
  if (!access.userId) throw new FarmAccessError('not_signed_in');
  if (!access.isOperator) throw new FarmAccessError('not_operator');
  return access as FarmIdentity;
}

/**
 * Turn a guard's refusal into the `{ ok: false }` result the Farm actions return,
 * so the UI shows the reason rather than a generic server-action failure. Any
 * other error is not ours to swallow: `null` tells the caller to rethrow.
 */
export function accessRefusal(e: unknown): { ok: false; error: string } | null {
  return e instanceof FarmAccessError ? { ok: false, error: e.message } : null;
}
