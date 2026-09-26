import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { museEntityLinks } from '@ct/db';
import { db } from '@/lib/db';
import type { EntityKind } from '../_engine/entity-links';

/**
 * Impact OS — recorded links read layer (server-only).
 *
 * These are the links that are facts of record, not forecast inputs (see
 * `_engine/entity-links.ts` for the rule and 0046 for the table). Reads are
 * plain; writes live in `entity-link-actions.ts` behind the super-admin gate.
 */

/** What a recorded link asserts. */
export type LinkRelation = 'received_from' | 'shipped_to' | 'evidenced_by' | 'assigned' | 'certificate';

export const LINK_RELATIONS: LinkRelation[] = [
  'received_from',
  'shipped_to',
  'evidenced_by',
  'assigned',
  'certificate',
];

export const RELATION_LABEL: Record<LinkRelation, string> = {
  received_from: 'Received from',
  shipped_to: 'Shipped to',
  evidenced_by: 'Evidenced by',
  assigned: 'Assigned',
  certificate: 'Certificate',
};

export function isLinkRelation(x: string): x is LinkRelation {
  return (LINK_RELATIONS as string[]).includes(x);
}

export interface RecordedLink {
  id: string;
  fromKind: string;
  fromId: string;
  toKind: string;
  toId: string;
  relation: string;
  note: string | null;
  createdAt: Date;
}

const columns = {
  id: museEntityLinks.id,
  fromKind: museEntityLinks.fromKind,
  fromId: museEntityLinks.fromId,
  toKind: museEntityLinks.toKind,
  toId: museEntityLinks.toId,
  relation: museEntityLinks.relation,
  note: museEntityLinks.note,
  createdAt: museEntityLinks.createdAt,
};

/** Every recorded link leaving a set of records of one kind. */
export async function linksFrom(fromKind: EntityKind | string, fromIds: string[]): Promise<RecordedLink[]> {
  if (fromIds.length === 0) return [];
  return db
    .select(columns)
    .from(museEntityLinks)
    .where(and(eq(museEntityLinks.fromKind, fromKind), inArray(museEntityLinks.fromId, fromIds)));
}

/** Every recorded link arriving at one record — the reverse view. */
export async function linksTo(toKind: EntityKind | string, toId: string): Promise<RecordedLink[]> {
  return db
    .select(columns)
    .from(museEntityLinks)
    .where(and(eq(museEntityLinks.toKind, toKind), eq(museEntityLinks.toId, toId)));
}

/** Every recorded link of one relation, for the page-level traces. */
export async function linksByRelation(relation: LinkRelation): Promise<RecordedLink[]> {
  return db.select(columns).from(museEntityLinks).where(eq(museEntityLinks.relation, relation));
}

/** Every recorded link. Small table; the trace surfaces read it whole. */
export async function allLinks(): Promise<RecordedLink[]> {
  return db.select(columns).from(museEntityLinks);
}

/**
 * The single link a one-to-one relation holds, keyed by `fromId`. Used where a
 * record carries at most one link of a relation (a journal entry's invoice).
 */
export function onePerFrom(links: RecordedLink[], relation: LinkRelation): Record<string, RecordedLink> {
  const out: Record<string, RecordedLink> = {};
  for (const l of links) {
    if (l.relation !== relation) continue;
    out[l.fromId] = l;
  }
  return out;
}

/** Group links by `fromId` for the many-per-record relations. */
export function manyPerFrom(links: RecordedLink[], relation: LinkRelation): Record<string, RecordedLink[]> {
  const out: Record<string, RecordedLink[]> = {};
  for (const l of links) {
    if (l.relation !== relation) continue;
    (out[l.fromId] ??= []).push(l);
  }
  return out;
}
