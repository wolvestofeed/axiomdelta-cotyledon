import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { activeStaffByEmail } from './staff-login';

/**
 * Access control for the Impact OS route group.
 *
 * Two roles (Robert, 2026-09-15, Roadmap O5):
 *   - admin    — the named super admins: everything, including pay and payroll,
 *                the financial statements, receivables and payables, capital and
 *                financing, editing definitions, the plan of record and adoption.
 *   - operator — an operating user of the kitchen: every operating page, the
 *                Floor, schedules, recording, and saving their own forecasts. No
 *                company financials and no pay.
 * An admin is always an operator. There is no third role.
 *
 * An active person on the staff register whose email is their sign-in holds the
 * operator role and is matched to their own record (`staffId`).
 *
 * A signed-in user holds a role when their primary email is on the named list
 * below or in the role's env var (comma-separated), or their Clerk
 * `publicMetadata` carries the flag (`museSuperAdmin`, `museOperator`). The named
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

export type MuseTier = 'super_admin' | 'user';

export interface MuseAccess {
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
  tier: MuseTier;
}

export async function getMuseAccess(): Promise<MuseAccess> {
  const { userId } = await auth();
  if (!userId) {
    return { userId: null, email: null, name: null, isSuperAdmin: false, isOperator: false, staffId: null, staffRoles: [], tier: 'user' };
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;

  const metaSuper = user?.publicMetadata?.['museSuperAdmin'] === true;
  const emailSuper = email !== null && listFrom(NAMED_SUPER_ADMINS, 'MUSE_SUPER_ADMIN_EMAILS').includes(email);
  const isSuperAdmin = metaSuper || emailSuper;

  const metaOperator = user?.publicMetadata?.['museOperator'] === true;
  const emailOperator = email !== null && listFrom(NAMED_OPERATORS, 'MUSE_OPERATOR_EMAILS').includes(email);
  const staff = email !== null ? await activeStaffByEmail(email) : null;
  const isOperator = metaOperator || emailOperator || staff !== null || isSuperAdmin;

  const name = user?.fullName?.trim() || null;

  return { userId, email, name, isSuperAdmin, isOperator, staffId: staff?.id ?? null, staffRoles: staff?.roles ?? [], tier: isSuperAdmin ? 'super_admin' : 'user' };
}

// ── Fail-closed guards (the gate every Muse write passes) ───────────────────

/**
 * Why these exist, and why `getMuseAccess` is not enough on its own.
 *
 * `getMuseAccess()` RETURNS a record; a caller that forgets to check it, or
 * checks the wrong field, proceeds with no access control at all. The guards
 * below THROW instead, so the body of an action cannot run for a caller who is
 * not entitled to it — the same fail-closed contract CompTable's
 * `requireWorkspaceAccess` holds for workspace-scoped data.
 *
 * Muse is single-tenant: one kitchen, one `muse.*` schema, no workspace or org
 * id to verify. The tenant boundary here is the named operator and super-admin
 * lists in this file, which is why the org guards do not apply and
 * these stand in their place. `workspace-guard-coverage.test.ts` recognises them
 * for files under the `(muse)` route group.
 */

export type MuseAccessDenial = 'not_signed_in' | 'not_super_admin' | 'not_operator';

const DENIAL_MESSAGE: Record<MuseAccessDenial, string> = {
  not_signed_in: 'Sign in to continue.',
  not_super_admin: 'Super admin only.',
  not_operator: 'Not authorized for this workspace.',
};

/** Thrown by the guards below. Never returned — a denial must not be ignorable. */
export class MuseAccessError extends Error {
  readonly code: MuseAccessDenial;

  constructor(code: MuseAccessDenial) {
    super(DENIAL_MESSAGE[code]);
    this.name = 'MuseAccessError';
    this.code = code;
  }
}

/** An access record known to carry a signed-in user id. */
export type MuseIdentity = MuseAccess & { userId: string };

/** Throws unless the caller is a super admin. */
export async function requireMuseSuperAdmin(): Promise<MuseIdentity> {
  const access = await getMuseAccess();
  if (!access.userId) throw new MuseAccessError('not_signed_in');
  if (!access.isSuperAdmin) throw new MuseAccessError('not_super_admin');
  return access as MuseIdentity;
}

/**
 * Throws unless the caller holds a role: an operator or an admin (admins are
 * always operators). The gate for every operator write — recording on the
 * Floor, the clock, saving one's own forecast.
 */
export async function requireMuseOperator(): Promise<MuseIdentity> {
  const access = await getMuseAccess();
  if (!access.userId) throw new MuseAccessError('not_signed_in');
  if (!access.isOperator) throw new MuseAccessError('not_operator');
  return access as MuseIdentity;
}

/**
 * Turn a guard's refusal into the `{ ok: false }` result the Muse actions return,
 * so the UI shows the reason rather than a generic server-action failure. Any
 * other error is not ours to swallow: `null` tells the caller to rethrow.
 */
export function accessRefusal(e: unknown): { ok: false; error: string } | null {
  return e instanceof MuseAccessError ? { ok: false, error: e.message } : null;
}
