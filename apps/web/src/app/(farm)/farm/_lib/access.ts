import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { activeStaffByEmail } from './staff-login';

/**
 * Access control for the MicroFarm route group.
 *
 * Two roles:
 *   - admin    — the named super admins: everything, including pay and payroll,
 *                the financial statements, receivables and payables, capital and
 *                financing, editing definitions, the plan of record and adoption.
 *   - operator — an operating user of the farm: every operating page, the
 *                Grow Room, schedules, recording, and saving their own forecasts. No
 *                company financials and no pay.
 * An admin is always an operator. There is no third role.
 *
 * An active person on the staff register whose email is their sign-in holds the
 * operator role and is matched to their own record (`staffId`).
 *
 * A signed-in user holds a role when their primary email is on the named list
 * below or in the role's env var (comma-separated), or their Clerk
 * `publicMetadata` carries the flag (`farmSuperAdmin`, `farmOperator`). The named
 * lists are the source of truth so production access does not depend on an env
 * var. Sign-in itself is enforced by `proxy.ts`.
 */

const NAMED_SUPER_ADMINS: string[] = [
  'lonewolf@wolvestofeed.com', // Robert Bogatin
];

const NAMED_OPERATORS: string[] = [];

function listFrom(named: string[], envVar: string): string[] {
  const fromEnv = (process.env[envVar] ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...named, ...fromEnv])];
}

export type FarmTier = 'super_admin' | 'user';

export interface FarmAccess {
  userId: string | null;
  email: string | null;
  /** The account's full name from Clerk; null when the account has none. */
  name: string | null;
  /** Admins: the super admins. */
  isSuperAdmin: boolean;
  /** Operators, and every admin. Holding this is what opens the OS at all. */
  isOperator: boolean;
  /** The signed-in person's row on the staff register, matched by email; null when none. */
  staffId: string | null;
  /** Work roles on the staff register ('operator', 'sales'); empty with no matched record. */
  staffRoles: string[];
  /** Convenience: the tier stamped onto scenarios this user saves. */
  tier: FarmTier;
}

export async function getFarmAccess(): Promise<FarmAccess> {
  const { userId } = await auth();
  if (!userId) {
    return { userId: null, email: null, name: null, isSuperAdmin: false, isOperator: false, staffId: null, staffRoles: [], tier: 'user' };
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;

  const metaSuper = user?.publicMetadata?.['farmSuperAdmin'] === true;
  const emailSuper = email !== null && listFrom(NAMED_SUPER_ADMINS, 'FARM_SUPER_ADMIN_EMAILS').includes(email);
  const isSuperAdmin = metaSuper || emailSuper;

  const metaOperator = user?.publicMetadata?.['farmOperator'] === true;
  const emailOperator = email !== null && listFrom(NAMED_OPERATORS, 'FARM_OPERATOR_EMAILS').includes(email);
  const staff = email !== null ? await activeStaffByEmail(email) : null;
  const isOperator = metaOperator || emailOperator || staff !== null || isSuperAdmin;

  const name = user?.fullName?.trim() || null;

  return { userId, email, name, isSuperAdmin, isOperator, staffId: staff?.id ?? null, staffRoles: staff?.roles ?? [], tier: isSuperAdmin ? 'super_admin' : 'user' };
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
 * Farm is single-tenant: one farm, one `farm.*` schema, no workspace or org
 * id to verify. The tenant boundary here is the named operator and super-admin
 * lists in this file, which is why the org guards do not apply and
 * these stand in their place. `workspace-guard-coverage.test.ts` recognises them
 * for files under the `(farm)` route group.
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
