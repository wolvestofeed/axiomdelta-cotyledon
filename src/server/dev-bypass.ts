/**
 * Cotyledon — the local development switch that takes Clerk off the door.
 *
 * `FARM_DEV_BYPASS_AUTH=1` in `.env.local` signs every request in as the local admin of
 * one local workspace: no Clerk sign-in, no organization picker, no keys needed. It is read only
 * outside production, so a deployed build ignores it. The workspace it opens is a real row in
 * `farm.workspaces`, keyed on the organization id below, provisioned on first sight like any other.
 *
 * The private preview gate (`preview-gate.ts`) runs the same way behind its password, in any
 * environment: with `FARM_PREVIEW_PASSWORD` set, every visitor who has passed the gate is this admin.
 *
 * No `server-only` import: `proxy.ts` runs on the edge and reads this too.
 */

import { previewGate } from '@/server/preview-gate';

export const DEV_ORG_ID = 'org_local_dev';
export const DEV_ORG_SLUG = 'local-dev';
export const DEV_USER_ID = 'user_local_dev';

export function devBypass(): boolean {
  return (process.env['FARM_DEV_BYPASS_AUTH'] === '1' && process.env.NODE_ENV !== 'production') || previewGate();
}

/** The identity every request carries under the bypass: an admin of the local workspace. */
export function devIdentity(): { userId: string; orgId: string; orgSlug: string; orgRole: 'org:admin'; email: string; name: string } {
  return {
    userId: DEV_USER_ID,
    orgId: DEV_ORG_ID,
    orgSlug: DEV_ORG_SLUG,
    orgRole: 'org:admin',
    email: (process.env['FARM_DEV_EMAIL'] ?? 'lonewolf@wolvestofeed.com').toLowerCase(),
    name: 'Local dev',
  };
}
