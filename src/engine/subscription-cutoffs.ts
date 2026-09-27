/**
 * MicroFarm — the sow-date rules on a subscription (outline §4 Subscriber). Pure.
 *
 * A distribution's trays are sown days before it: each line's grow plan on its sow date, the
 * distribution date less the plan's days to harvest on a production day (`sowDateFor`), and the
 * distribution's sow date is the earliest of its lines'. Once that day has come the trays are
 * growing, so a distribution can be skipped only before its sow date, a pause starts at the first
 * distribution not yet sown, a flat plan change takes effect from the first distribution its new
 * lines can still be sown for, and a subscription starts on a first distribution that can still
 * be sown for.
 */

import type { FlatPlanLine, FlatPlanVersion, SubscriptionDef } from '@/data/subscriptions';
import type { GrowPlanDef } from '@/data/grow-plan';
import type { DateRange } from '@/engine/periods';
import { sowDateFor } from '@/engine/grow-calendar';
import { cadenceDates, flatPlanOn } from '@/engine/subscriptions';
import { isoAddDays } from '@/engine/orders';

export interface SowingRules {
  plans: readonly GrowPlanDef[];
  /** The days sowing happens; absent, Monday to Friday. */
  weekdays?: readonly number[];
  closures?: readonly DateRange[];
}

/** The earliest sow date among a distribution's lines; null when no line's plan is in the library. */
export function sowDateOf(lines: readonly FlatPlanLine[], date: string, rules: SowingRules): string | null {
  const dates = lines
    .map((l) => rules.plans.find((p) => p.code === l.growPlanCode))
    .filter((p): p is GrowPlanDef => p !== undefined)
    .map((p) => sowDateFor(p, date, rules.weekdays ?? [1, 2, 3, 4, 5], rules.closures));
  return dates.length ? dates.sort()[0]! : null;
}

/** True once the distribution's sow date has come. */
export function isSown(lines: readonly FlatPlanLine[], date: string, today: string, rules: SowingRules): boolean {
  const sow = sowDateOf(lines, date, rules);
  return sow !== null && sow <= today;
}

/** The first distribution from today on whose trays, with these lines (else the flat plan each carries), are not yet sown. */
export function firstUnsown(sub: SubscriptionDef, today: string, rules: SowingRules, lines?: readonly FlatPlanLine[]): string | null {
  for (const date of cadenceDates(sub, today, isoAddDays(today, 400))) {
    if (!isSown(lines ?? flatPlanOn(sub, date), date, today, rules)) return date;
  }
  return null;
}

/** Why a subscription cannot start on its first distribution with these lines; null when it can. */
export function startRefusal(startDate: string, lines: readonly FlatPlanLine[], today: string, rules: SowingRules): string | null {
  if (startDate < today) return `The first distribution, ${startDate}, is past.`;
  const sow = sowDateOf(lines, startDate, rules);
  if (sow !== null && sow <= today) return `The first distribution, ${startDate}, would need its trays sown on ${sow}; choose a date whose sow date is after today.`;
  return null;
}

/** Why a distribution cannot be skipped; null when it can. */
export function skipRefusal(sub: SubscriptionDef, date: string, today: string, rules: SowingRules): string | null {
  if (!cadenceDates(sub, date, date).includes(date)) return `${date} is not a distribution of this subscription.`;
  if (sub.skips.includes(date)) return `${date} is already skipped.`;
  const sow = sowDateOf(flatPlanOn(sub, date), date, rules);
  if (sow !== null && sow <= today) return `The trays for ${date} are sown on ${sow}; a distribution is skipped before its sow date.`;
  return null;
}

/** The flat plan with a new version from the first distribution its lines can still be sown for; later versions give way. */
export function withFlatPlan(sub: SubscriptionDef, lines: readonly FlatPlanLine[], today: string, rules: SowingRules): { flatPlan: FlatPlanVersion[]; from: string } | { error: string } {
  const from = firstUnsown(sub, today, rules, lines);
  if (from === null) return { error: 'No distribution in the next year can still be sown for.' };
  return { flatPlan: [...sub.flatPlan.filter((v) => v.from < from), { from, lines: lines.map((l) => ({ ...l })) }], from };
}
