/**
 * MicroFarm — the fail-closed contract of the Farm access guards.
 *
 * Farm is single-tenant: no workspace or org id, so Staffing's tenant guards do
 * not apply. Its boundary is the named operator and super-admin lists in
 * `(farm)/farm/_lib/access.ts`, and these guards are what enforce it. Two roles,
 * admin and operator; an admin is always an operator (Roadmap O5).
 *
 * The property under test is that a denial THROWS rather than returning a record
 * a caller could ignore — the same contract `requireWorkspaceAccess` holds for
 * workspace-scoped data. `@clerk/nextjs/server` is mocked so the logic runs
 * without Clerk or a DB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { authMock, currentUserMock, staffMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  currentUserMock: vi.fn(),
  staffMock: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => authMock(),
  currentUser: () => currentUserMock(),
}));

// The staff register lookup (by sign-in email) without a database.
vi.mock('@/app/(farm)/farm/_lib/staff-login', () => ({
  activeStaffByEmail: (email: string) => staffMock(email),
}));

const access = await import('@/app/(farm)/farm/_lib/access');
const { requireFarmSuperAdmin, requireFarmOperator, FarmAccessError, accessRefusal, getFarmAccess } = access;

/** A signed-in Clerk user with the given primary email and metadata. */
function signedIn(email: string | null, publicMetadata: Record<string, unknown> = {}) {
  authMock.mockResolvedValue({ userId: 'user_123' });
  currentUserMock.mockResolvedValue({
    primaryEmailAddress: email ? { emailAddress: email } : null,
    publicMetadata,
  });
}

function signedOut() {
  authMock.mockResolvedValue({ userId: null });
  currentUserMock.mockResolvedValue(null);
}

// An operator granted through the env list (no operator is named in access.ts), and the named admin.
const OPERATOR_EMAIL = 'operator@example.com';
process.env.FARM_OPERATOR_EMAILS = OPERATOR_EMAIL;
const SUPER_ADMIN_EMAIL = 'lonewolf@wolvestofeed.com';

beforeEach(() => {
  authMock.mockReset();
  currentUserMock.mockReset();
  staffMock.mockReset();
  staffMock.mockResolvedValue(null);
});

describe('farm access guards — fail closed on every no-access path', () => {
  it('a signed-out caller is refused by both guards', async () => {
    signedOut();
    await expect(requireFarmOperator()).rejects.toMatchObject({ code: 'not_signed_in' });
    signedOut();
    await expect(requireFarmSuperAdmin()).rejects.toThrow(FarmAccessError);
  });

  it('a signed-in account on neither list is refused, not merely flagged', async () => {
    signedIn('stranger@example.com');
    await expect(requireFarmOperator()).rejects.toMatchObject({ code: 'not_operator' });
    signedIn('stranger@example.com');
    await expect(requireFarmSuperAdmin()).rejects.toMatchObject({ code: 'not_super_admin' });
  });

  it('a named operator passes the operator guard and is refused admin', async () => {
    signedIn(OPERATOR_EMAIL);
    await expect(requireFarmOperator()).resolves.toMatchObject({ userId: 'user_123', isOperator: true, isSuperAdmin: false });
    signedIn(OPERATOR_EMAIL);
    await expect(requireFarmSuperAdmin()).rejects.toMatchObject({ code: 'not_super_admin' });
  });

  it('an admin passes both, and is an operator though listed only as admin', async () => {
    signedIn(SUPER_ADMIN_EMAIL);
    await expect(requireFarmSuperAdmin()).resolves.toMatchObject({ tier: 'super_admin' });
    signedIn(SUPER_ADMIN_EMAIL);
    await expect(requireFarmOperator()).resolves.toMatchObject({ isOperator: true, isSuperAdmin: true });
  });

  it('an account with no email on file reaches neither list', async () => {
    signedIn(null);
    await expect(requireFarmOperator()).rejects.toMatchObject({ code: 'not_operator' });
  });

  it('Clerk publicMetadata grants a role without a code change; the retired viewer flag grants nothing', async () => {
    signedIn('sow@example.com', { farmOperator: true });
    await expect(requireFarmOperator()).resolves.toMatchObject({ isOperator: true, isSuperAdmin: false });
    signedIn('contractor@example.com', { farmSuperAdmin: true });
    await expect(requireFarmSuperAdmin()).resolves.toMatchObject({ isSuperAdmin: true });
    signedIn('reader@example.com', { farmViewer: true });
    await expect(requireFarmOperator()).rejects.toMatchObject({ code: 'not_operator' });
  });

  it('an active person on the staff register signing in with their email is an operator matched to their record', async () => {
    staffMock.mockImplementation(async (email: string) => (email === 'sow@example.com' ? { id: 'staff-1' } : null));
    signedIn('sow@example.com');
    await expect(requireFarmOperator()).resolves.toMatchObject({ isOperator: true, isSuperAdmin: false, staffId: 'staff-1' });
    signedIn('sow@example.com');
    await expect(requireFarmSuperAdmin()).rejects.toMatchObject({ code: 'not_super_admin' });
    signedIn('stranger@example.com');
    await expect(requireFarmOperator()).rejects.toMatchObject({ code: 'not_operator' });
  });

  it('the FARM_OPERATOR_EMAILS allowlist grants the operator role without a code change', async () => {
    const prev = process.env['FARM_OPERATOR_EMAILS'];
    process.env['FARM_OPERATOR_EMAILS'] = 'Receiver@Example.com';
    try {
      signedIn('receiver@example.com');
      await expect(requireFarmOperator()).resolves.toMatchObject({ isOperator: true });
    } finally {
      if (prev === undefined) delete process.env['FARM_OPERATOR_EMAILS'];
      else process.env['FARM_OPERATOR_EMAILS'] = prev;
    }
  });

  it('the guard returns an identity whose userId is non-null, so callers need no re-check', async () => {
    signedIn(SUPER_ADMIN_EMAIL);
    const identity = await requireFarmSuperAdmin();
    expect(identity.userId).toBe('user_123');
  });

  it('there is no viewer guard', () => {
    expect('requireFarmViewer' in access).toBe(false);
  });
});

describe('farm access guards — getFarmAccess still reports without throwing', () => {
  it('the reporting form, for the read paths that branch on access', async () => {
    signedIn('stranger@example.com');
    const a = await getFarmAccess();
    expect(a).toEqual({ userId: 'user_123', email: 'stranger@example.com', name: null, isSuperAdmin: false, isOperator: false, staffId: null, staffRoles: [], tier: 'user' });
  });
});

describe('farm access guards — refusal conversion', () => {
  it('turns a guard refusal into the result shape the actions return', () => {
    expect(accessRefusal(new FarmAccessError('not_super_admin'))).toEqual({ ok: false, error: 'Super admin only.' });
    expect(accessRefusal(new FarmAccessError('not_operator'))).toEqual({ ok: false, error: 'Not authorized for this workspace.' });
  });

  it('does NOT swallow an unrelated error — the caller must rethrow', () => {
    expect(accessRefusal(new Error('database is down'))).toBeNull();
    expect(accessRefusal('not even an error')).toBeNull();
  });
});
