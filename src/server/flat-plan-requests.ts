import 'server-only';
import { desc, eq, inArray } from 'drizzle-orm';
import { farmFlatPlanRequests, farmSubscribers, farmSubscriptions, farmSubscriberPickupPoints } from '@/db';
import { db } from '@/lib/db';
import type { FlatPlanLine } from '@/data/subscriptions';
import type { Cadence } from '@/data/subscriptions';

/**
 * Cotyledon — flat plan requests, reads (server-only). A client asks for a change in the portal;
 * staff see it on the Dashboard and approve or decline it; the client sees the outcome.
 */

export type FlatPlanRequestStatus = 'pending' | 'approved' | 'declined' | 'withdrawn';

export interface FlatPlanRequestDef {
  id: string;
  subscriptionId: string;
  subscriberId: string;
  subscriberName: string;
  cadence: Cadence;
  pickupPointName: string | null;
  /** What each distribution carries today, for the reviewer to read the request against. */
  currentLines: FlatPlanLine[];
  lines: FlatPlanLine[];
  note: string | null;
  status: FlatPlanRequestStatus;
  requestedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  effectiveFrom: string | null;
}

const toLines = (v: unknown): FlatPlanLine[] =>
  Array.isArray(v) ? v.filter((l): l is FlatPlanLine => typeof l === 'object' && l !== null && typeof (l as FlatPlanLine).growPlanCode === 'string' && Number.isInteger((l as FlatPlanLine).units)) : [];
const iso = (d: Date | string | null): string | null => (d === null ? null : typeof d === 'string' ? d : d.toISOString().slice(0, 10));

async function hydrate(rows: (typeof farmFlatPlanRequests.$inferSelect)[]): Promise<FlatPlanRequestDef[]> {
  if (rows.length === 0) return [];
  const subs = await db
    .select({ id: farmSubscriptions.id, cadence: farmSubscriptions.cadence, flatPlan: farmSubscriptions.flatPlan, pickupPointId: farmSubscriptions.subscriberPickupPointId, subscriberName: farmSubscribers.name })
    .from(farmSubscriptions)
    .innerJoin(farmSubscribers, eq(farmSubscribers.id, farmSubscriptions.subscriberId))
    .where(inArray(farmSubscriptions.id, rows.map((r) => r.subscriptionId)));
  const points = await db.select({ id: farmSubscriberPickupPoints.id, name: farmSubscriberPickupPoints.name }).from(farmSubscriberPickupPoints).where(inArray(farmSubscriberPickupPoints.id, subs.map((s) => s.pickupPointId)));
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => {
    const s = subs.find((x) => x.id === r.subscriptionId);
    // What the distributions carry today; before the first distribution, what the first one will carry.
    const all = Array.isArray(s?.flatPlan) ? (s!.flatPlan as { from: string; lines: unknown }[]) : [];
    const inForce = all.filter((v) => v.from <= today);
    const version = inForce.length > 0 ? inForce[inForce.length - 1] : all[0];
    const current = version ? toLines(version.lines) : [];
    return {
      id: r.id,
      subscriptionId: r.subscriptionId,
      subscriberId: r.subscriberId,
      subscriberName: s?.subscriberName ?? '—',
      cadence: (s?.cadence ?? 'weekly') as Cadence,
      pickupPointName: points.find((p) => p.id === s?.pickupPointId)?.name ?? null,
      currentLines: current,
      lines: toLines(r.lines),
      note: r.note,
      status: (['pending', 'approved', 'declined', 'withdrawn'].includes(r.status) ? r.status : 'pending') as FlatPlanRequestStatus,
      requestedAt: r.requestedAt.toISOString(),
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
      decisionNote: r.decisionNote,
      effectiveFrom: iso(r.effectiveFrom),
    };
  });
}

/** Every request still to be decided, oldest first: the Dashboard's alert. */
export async function listPendingFlatPlanRequests(): Promise<FlatPlanRequestDef[]> {
  return hydrate(await db.select().from(farmFlatPlanRequests).where(eq(farmFlatPlanRequests.status, 'pending')).orderBy(farmFlatPlanRequests.requestedAt));
}

/** A subscriber's requests, newest first: the portal's record of what was asked and decided. */
export async function flatPlanRequestsFor(subscriberId: string, limit = 10): Promise<FlatPlanRequestDef[]> {
  return hydrate(await db.select().from(farmFlatPlanRequests).where(eq(farmFlatPlanRequests.subscriberId, subscriberId)).orderBy(desc(farmFlatPlanRequests.requestedAt)).limit(limit));
}
