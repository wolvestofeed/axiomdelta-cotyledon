/**
 * Cotyledon — the access guards fail closed, and roles come from the farm's organization.
 *
 * A workspace is a Clerk organization (outline §7). `org:admin` is an admin, any member is an
 * operator, the platform admins are admins in every organization they belong to, and no
 * organization active means no role at all. Guards throw; a returned denial cannot be ignored.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, currentUserMock, staffMock, scopeMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  currentUserMock: vi.fn(),
  staffMock: vi.fn(),
  scopeMock: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => authMock(),
  currentUser: () => currentUserMock(),
}));

// The staff register lookup (by sign-in email) without a database.
vi.mock('@/server/staff-login', () => ({
  activeStaffByEmail: (email: string) => staffMock(email),
}));

// The workspace scope without a database: in scope by default.
vi.mock('@/lib/db', () => ({
  currentWorkspaceId: () => scopeMock(),
}));

const access = await import('@/server/access');
const { requireFarmSuperAdmin, requireFarmOperator, FarmAccessError, accessRefusal, getFarmAccess } = access;

type Org = { orgId: string; orgRole: 'org:admin' | 'org:member' } | null;

/** A signed-in Clerk user with the given primary email, organization membership and metadata. */
function signedIn(email: string | null, org: Org = { orgId: 'org_farm', orgRole: 'org:member' }, publicMetadata: Record<string, unknown> = {}) {
  authMock.mockResolvedValue({ userId: 'user_123', orgId: org?.orgId ?? null, orgRole: org?.orgRole ?? null });
  currentUserMock.mockResolvedValue({
    primaryEmailAddress: email ? { emailAddress: email } : null,
    publicMetadata,
  });
}

function signedOut() {
  authMock.mockResolvedValue({ userId: null, orgId: null, orgRole: null });
  currentUserMock.mockResolvedValue(null);
}

const PLATFORM_ADMIN_EMAIL = 'lonewolf@wolvestofeed.com';
const ADMIN: Org = { orgId: 'org_farm', orgRole: 'org:admin' };
const MEMBER: Org = { orgId: 'org_farm', orgRole: 'org:member' };

beforeEach(() => {
  authMock.mockReset();
  currentUserMock.mockReset();
  staffMock.mockReset();
  staffMock.mockResolvedValue(null);
  scopeMock.mockReset();
  scopeMock.mockReturnValue('ws-1');
});

describe('farm access guards — fail closed on every no-access path', () => {
  it('a signed-out caller is refused by both guards', async () => {
    signedOut();
    await expect(requireFarmOperator()).rejects.toMatchObject({ code: 'not_signed_in' });
    signedOut();
    await expect(requireFarmSuperAdmin()).rejects.toThrow(FarmAccessError);
  });

  it('a signed-in account with no organization active is refused, not merely flagged', async () => {
    signedIn('stranger@example.com', null);
    await expect(requireFarmOperator()).rejects.toMatchObject({ code: 'not_operator' });
    signedIn('stranger@example.com', null);
    await expect(requireFarmSuperAdmin()).rejects.toMatchObject({ code: 'not_super_admin' });
  });

  it('an organization member passes the operator guard and is refused admin', async () => {
    signedIn('member@example.com', MEMBER);
    await expect(requireFarmOperator()).resolves.toMatchObject({ userId: 'user_123', isOperator: true, isSuperAdmin: false, orgId: 'org_farm', workspaceId: 'ws-1' });
    signedIn('member@example.com', MEMBER);
    await expect(requireFarmSuperAdmin()).rejects.toMatchObject({ code: 'not_super_admin' });
  });

  it('an organization admin passes both, and is an operator though holding only the admin role', async () => {
    signedIn('owner@example.com', ADMIN);
    await expect(requireFarmSuperAdmin()).resolves.toMatchObject({ tier: 'super_admin' });
    signedIn('owner@example.com', ADMIN);
    await expect(requireFarmOperator()).resolves.toMatchObject({ isOperator: true, isSuperAdmin: true });
  });

  it('a platform admin is an admin in any organization they are a member of, and nothing outside one', async () => {
    signedIn(PLATFORM_ADMIN_EMAIL, MEMBER);
    await expect(requireFarmSuperAdmin()).resolves.toMatchObject({ isSuperAdmin: true, isOperator: true });
    signedIn(PLATFORM_ADMIN_EMAIL, null);
    await expect(requireFarmOperator()).rejects.toMatchObject({ code: 'not_operator' });
  });

  it('an account with no email on file is still an operator by membership, never an admin by name', async () => {
    signedIn(null, MEMBER);
    await expect(requireFarmOperator()).resolves.toMatchObject({ isOperator: true, isSuperAdmin: false });
  });

  it('Clerk publicMetadata farmSuperAdmin grants admin inside an organization; the retired viewer flag grants nothing', async () => {
    signedIn('contractor@example.com', MEMBER, { farmSuperAdmin: true });
    await expect(requireFarmSuperAdmin()).resolves.toMatchObject({ isSuperAdmin: true });
    signedIn('reader@example.com', null, { farmViewer: true });
    await expect(requireFarmOperator()).rejects.toMatchObject({ code: 'not_operator' });
  });

  it('an active person on the staff register signing in with their email is matched to their record, inside a scope only', async () => {
    staffMock.mockImplementation(async (email: string) => (email === 'sow@example.com' ? { id: 'staff-1', roles: ['operator'] } : null));
    signedIn('sow@example.com', MEMBER);
    await expect(requireFarmOperator()).resolves.toMatchObject({ isOperator: true, isSuperAdmin: false, staffId: 'staff-1', staffRoles: ['operator'] });
    scopeMock.mockReturnValue(null);
    signedIn('sow@example.com', MEMBER);
    await expect(requireFarmOperator()).resolves.toMatchObject({ isOperator: true, staffId: null, workspaceId: null });
    expect(staffMock).toHaveBeenCalledTimes(1);
  });

  it('the FARM_PLATFORM_ADMIN_EMAILS list adds platform admins without a code change', async () => {
    const prev = process.env['FARM_PLATFORM_ADMIN_EMAILS'];
    process.env['FARM_PLATFORM_ADMIN_EMAILS'] = 'Support@Example.com';
    try {
      signedIn('support@example.com', MEMBER);
      await expect(requireFarmSuperAdmin()).resolves.toMatchObject({ isSuperAdmin: true });
    } finally {
      if (prev === undefined) delete process.env['FARM_PLATFORM_ADMIN_EMAILS'];
      else process.env['FARM_PLATFORM_ADMIN_EMAILS'] = prev;
    }
  });

  it('the guard returns an identity whose userId is non-null, so callers need no re-check', async () => {
    signedIn('owner@example.com', ADMIN);
    const identity = await requireFarmSuperAdmin();
    expect(identity.userId).toBe('user_123');
  });

  it('there is no viewer guard', () => {
    expect('requireFarmViewer' in access).toBe(false);
  });
});

describe('farm access guards — getFarmAccess still reports without throwing', () => {
  it('the reporting form, for the read paths that branch on access', async () => {
    signedIn('stranger@example.com', null);
    await expect(getFarmAccess()).resolves.toMatchObject({ userId: 'user_123', orgId: null, isOperator: false, isSuperAdmin: false });
  });

  it('accessRefusal turns a guard error into the action result shape and passes other errors through', () => {
    expect(accessRefusal(new FarmAccessError('not_operator'))).toEqual({ ok: false, error: 'Not authorized for this workspace.' });
    expect(accessRefusal(new Error('boom'))).toBeNull();
  });
});
