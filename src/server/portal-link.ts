import 'server-only';
import { eq } from 'drizzle-orm';
import { farmPortalAccounts, farmPortalEmails } from '@/db';
import { rootDb } from '@/lib/db';
import { linkDecision, type PortalMatch } from '@/engine/portal-link';

/**
 * Cotyledon — the Client Portal's account link (server-only, Roadmap P5).
 *
 * Read at sign-in with no organization active, before any workspace is in scope, so it reads the two
 * tables that carry no policy: the link already made for this Clerk account, else the index of
 * sign-in emails. A new link is written once; one sign-in per account and one account per record are
 * the table's keys, so a second sign-in for a record already linked gets nothing and stays under
 * review. A failed lookup links nothing.
 */
export async function portalLinkFor(userId: string, email: string | null): Promise<PortalMatch | null> {
  try {
    const existing = (await rootDb.select({ workspaceId: farmPortalAccounts.workspaceId, subscriberId: farmPortalAccounts.subscriberId }).from(farmPortalAccounts).where(eq(farmPortalAccounts.clerkUserId, userId)).limit(1))[0] ?? null;
    const lower = email?.toLowerCase() ?? null;
    const match = existing || !lower ? null : ((await rootDb.select({ workspaceId: farmPortalEmails.workspaceId, subscriberId: farmPortalEmails.subscriberId }).from(farmPortalEmails).where(eq(farmPortalEmails.email, lower)).limit(1))[0] ?? null);
    const decision = linkDecision(existing, lower, match);
    if (decision.kind === 'linked') return decision.link;
    if (decision.kind === 'none') return null;
    const inserted = await rootDb
      .insert(farmPortalAccounts)
      .values({ clerkUserId: userId, workspaceId: decision.link.workspaceId, subscriberId: decision.link.subscriberId, email: lower! })
      .onConflictDoNothing()
      .returning({ subscriberId: farmPortalAccounts.subscriberId });
    return inserted[0] ? decision.link : null;
  } catch {
    return null;
  }
}
