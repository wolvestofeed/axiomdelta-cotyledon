import 'server-only';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { farmSubscribers, farmSubscriptions } from '@/db';
import { db } from '@/lib/db';
import { listGrowPlans } from '@/server/grow-plans';
import { loadCalendar } from '@/server/periods';
import { toSubscription } from '@/server/subscribers';
import type { FlatPlanLine, SubscriptionDef } from '@/data/subscriptions';
import { withFlatPlan, type SowingRules } from '@/engine/subscription-cutoffs';

/**
 * Cotyledon — the rules a subscription write reads, shared by the super admin's actions
 * (`subscription-actions.ts`) and the approval of a client's flat plan request
 * (`flat-plan-request-actions.ts`). Nothing here checks who the caller is: every caller guards first.
 */

export async function sowingRules(): Promise<SowingRules & { plans: Awaited<ReturnType<typeof listGrowPlans>> }> {
  const [plans, calendar] = await Promise.all([listGrowPlans(), loadCalendar()]);
  return { plans, closures: calendar.closures };
}

/** A line's plan must be in service and offered on the subscriber's channel; the same plan twice is one line. */
export function linesProblem(lines: readonly FlatPlanLine[], plans: SowingRules['plans'], channel: number): string | null {
  const codes = lines.map((l) => l.growPlanCode);
  if (new Set(codes).size !== codes.length) return 'Each grow plan appears once in a flat plan; set its units instead.';
  for (const l of lines) {
    const p = plans.find((x) => x.code === l.growPlanCode);
    if (!p) return `${l.growPlanCode} is not in the grow plan library.`;
    if (p.status !== 'in_service') return `${p.code} is not in service.`;
    if (!p.channels.includes(channel)) return `${p.code} is not offered on this subscriber's channel.`;
  }
  return null;
}

export async function loadSubscription(id: string): Promise<{ sub: SubscriptionDef; channel: number } | null> {
  const r = await db
    .select({ s: farmSubscriptions, channel: farmSubscribers.channel })
    .from(farmSubscriptions)
    .innerJoin(farmSubscribers, eq(farmSubscribers.id, farmSubscriptions.subscriberId))
    .where(eq(farmSubscriptions.id, id))
    .limit(1);
  return r[0] ? { sub: toSubscription(r[0].s), channel: r[0].channel } : null;
}

export async function saveSubscription(id: string, set: Partial<typeof farmSubscriptions.$inferInsert>): Promise<void> {
  await db.update(farmSubscriptions).set({ ...set, updatedAt: new Date() }).where(eq(farmSubscriptions.id, id));
  revalidatePath('/farm', 'layout');
}


export type Loaded = NonNullable<Awaited<ReturnType<typeof loadSubscription>>>;

/**
 * Change a subscription's flat plan: the lines must be in service and offered on the channel, and the
 * change takes effect from the first distribution its new lines can still be sown for. Demand, the
 * order book, sowings and procurement follow from the subscriptions, so nothing else is written.
 */
export async function applyFlatPlan(hit: Loaded, lines: readonly FlatPlanLine[]): Promise<{ ok: true; from: string } | { ok: false; error: string }> {
  const r = await sowingRules();
  const linesBad = linesProblem(lines, r.plans, hit.channel);
  if (linesBad) return { ok: false, error: linesBad };
  const next = withFlatPlan(hit.sub, lines, new Date().toISOString().slice(0, 10), r);
  if ('error' in next) return { ok: false, error: next.error };
  await saveSubscription(hit.sub.id, { flatPlan: next.flatPlan });
  return { ok: true, from: next.from };
}
