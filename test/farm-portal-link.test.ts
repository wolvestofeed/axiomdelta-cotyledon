/**
 * Cotyledon — linking a sign-in to its subscriber record (Roadmap P5): a link made stands, an email on
 * exactly one record links, anything else links nothing.
 */

import { describe, expect, it } from 'vitest';
import { linkDecision } from '@/engine/portal-link';

const A = { workspaceId: 'ws-1', subscriberId: 'sub-1' };
const B = { workspaceId: 'ws-2', subscriberId: 'sub-2' };

describe('portal link', () => {
  it('a link already made stands, whatever the email now matches', () => {
    expect(linkDecision(A, 'x@example.com', B)).toEqual({ kind: 'linked', link: A });
    expect(linkDecision(A, null, null)).toEqual({ kind: 'linked', link: A });
  });

  it('with no link, an email on a record links to that record', () => {
    expect(linkDecision(null, 'x@example.com', B)).toEqual({ kind: 'link', link: B });
  });

  it('no email, or an email on no record, links nothing', () => {
    expect(linkDecision(null, null, B)).toEqual({ kind: 'none' });
    expect(linkDecision(null, 'x@example.com', null)).toEqual({ kind: 'none' });
  });
});
