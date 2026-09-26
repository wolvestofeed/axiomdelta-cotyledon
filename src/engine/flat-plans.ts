/**
 * MicroFarm — flat plans (Roadmap N4a, operating-model-roadmap decision 19).
 *
 * Ledger-free, database-free.
 *
 *   * A channel groups a subscriber with its revenue channel and limits which
 *     crop plans are offered. It never decides what the subscriber is served.
 *   * Every subscriber has its own flat plan: a saved subscription cycle copied onto the
 *     subscriber in one click, or a crop plan sequence programmed for that subscriber
 *     alone. Both are `SubscriptionCycleDef` rows carrying `subscriberId`.
 *   * Subscription cycles are the shared list — `subscriberId` null. Editing one moves
 *     only the plans picked in the apply-to picker.
 *   * A plan naming a service wins over the subscriber's all-services plan on the
 *     dates both are in force; among plans of the same reach, the latest start wins.
 */

import type { SubscriptionCycleDef } from '@/data/subscription-cycles';
import { cycleCropPlanOn } from '@/engine/orders';

export const isSavedCycle = (c: Pick<SubscriptionCycleDef, 'subscriberId'>): boolean => c.subscriberId === null;
export const savedCycles = (cycles: readonly SubscriptionCycleDef[]): SubscriptionCycleDef[] => cycles.filter(isSavedCycle);
export const flatPlansOf = (cycles: readonly SubscriptionCycleDef[], subscriberId: string): SubscriptionCycleDef[] => cycles.filter((c) => c.subscriberId === subscriberId);

const inForce = (c: SubscriptionCycleDef, date: string): boolean => c.status === 'active' && c.startDate <= date && (c.endDate === null || date <= c.endDate);

/**
 * The subscriber's flat plan in force for a service on a date: the plans naming
 * the service first, then the subscriber's all-services plans; the latest start
 * date within each. Null when none is in force.
 */
export function flatPlanInForce(plans: readonly SubscriptionCycleDef[], serviceId: string | null, date: string): SubscriptionCycleDef | null {
  const pick = (rows: SubscriptionCycleDef[]) =>
    rows.filter((c) => inForce(c, date)).reduce<SubscriptionCycleDef | null>((best, c) => (!best || c.startDate > best.startDate ? c : best), null);
  if (serviceId) {
    const own = pick(plans.filter((c) => c.subscriberServiceId === serviceId));
    if (own) return own;
  }
  return pick(plans.filter((c) => c.subscriberServiceId === null));
}

/** The crop plan a subscriber's service is served on a date, with the plan it came from. */
export function flatPlanCropPlanOn(plans: readonly SubscriptionCycleDef[], serviceId: string | null, date: string): { cropPlanCode: string; plan: SubscriptionCycleDef } | null {
  const plan = flatPlanInForce(plans, serviceId, date);
  if (!plan) return null;
  const cropPlanCode = cycleCropPlanOn(plan, date);
  return cropPlanCode ? { cropPlanCode, plan } : null;
}

/** A copy of a saved cycle as a subscriber's flat plan — the one-click assign. */
export function copyCycleToPlan(cycle: SubscriptionCycleDef, subscriberId: string, id: string, opts: { startDate?: string; subscriberServiceId?: string | null } = {}): SubscriptionCycleDef {
  return {
    ...cycle,
    id,
    channel: null,
    subscriberId,
    subscriberServiceId: opts.subscriberServiceId ?? null,
    fromCycleId: cycle.id,
    startDate: opts.startDate ?? cycle.startDate,
    source: 'user_built',
    days: cycle.days.map((d) => ({ ...d })),
  };
}

/** The plans an edit to a saved cycle can be applied to: every plan copied from it. */
export const plansFromCycle = (cycles: readonly SubscriptionCycleDef[], cycleId: string): SubscriptionCycleDef[] => cycles.filter((c) => c.subscriberId !== null && c.fromCycleId === cycleId);

/**
 * Apply a saved cycle's sequence to the picked plans: length, weekdays and the
 * crop plan per day follow the cycle; each plan keeps its own subscriber, service,
 * start and end. Plans not picked are returned unchanged.
 */
export function applyCycleToPlans(cycle: SubscriptionCycleDef, plans: readonly SubscriptionCycleDef[], pickedPlanIds: ReadonlySet<string>): SubscriptionCycleDef[] {
  return plans.map((p) =>
    pickedPlanIds.has(p.id) ? { ...p, lengthDays: cycle.lengthDays, weekdays: [...cycle.weekdays], days: cycle.days.map((d) => ({ ...d })) } : p,
  );
}
