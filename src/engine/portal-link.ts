/**
 * Cotyledon — linking a sign-in to its subscriber record (Roadmap P5), pure.
 *
 * A link already made stands. Otherwise a sign-in whose email is on exactly one record, in any farm,
 * is linked to it; the index (`farm.portal_emails`) holds one record per email, so a match is that
 * one. No email, or no record carrying it: nothing, and the account stays under review.
 */

export interface PortalMatch {
  workspaceId: string;
  subscriberId: string;
}

export type LinkDecision = { kind: 'linked'; link: PortalMatch } | { kind: 'link'; link: PortalMatch } | { kind: 'none' };

export function linkDecision(existing: PortalMatch | null, email: string | null, match: PortalMatch | null): LinkDecision {
  if (existing) return { kind: 'linked', link: existing };
  if (email && match) return { kind: 'link', link: match };
  return { kind: 'none' };
}
