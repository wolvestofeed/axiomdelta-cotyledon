/**
 * Impact OS — meal plans (Roadmap N4a, operating-model-roadmap decision 19).
 *
 * Ledger-free, database-free.
 *
 *   * A channel groups a customer with its revenue channel and limits which
 *     recipes are offered. It never decides what the customer is served.
 *   * Every customer has its own meal plan: a saved menu cycle copied onto the
 *     customer in one click, or a recipe sequence programmed for that customer
 *     alone. Both are `MenuCycleDef` rows carrying `customerId`.
 *   * Menu cycles are the shared list — `customerId` null. Editing one moves
 *     only the plans picked in the apply-to picker.
 *   * A plan naming a service wins over the customer's all-services plan on the
 *     dates both are in force; among plans of the same reach, the latest start wins.
 */

import type { MenuCycleDef } from '../_data/menu-cycles';
import { cycleRecipeOn } from './orders';

export const isSavedCycle = (c: Pick<MenuCycleDef, 'customerId'>): boolean => c.customerId === null;
export const savedCycles = (cycles: readonly MenuCycleDef[]): MenuCycleDef[] => cycles.filter(isSavedCycle);
export const mealPlansOf = (cycles: readonly MenuCycleDef[], customerId: string): MenuCycleDef[] => cycles.filter((c) => c.customerId === customerId);

const inForce = (c: MenuCycleDef, date: string): boolean => c.status === 'active' && c.startDate <= date && (c.endDate === null || date <= c.endDate);

/**
 * The customer's meal plan in force for a service on a date: the plans naming
 * the service first, then the customer's all-services plans; the latest start
 * date within each. Null when none is in force.
 */
export function mealPlanInForce(plans: readonly MenuCycleDef[], serviceId: string | null, date: string): MenuCycleDef | null {
  const pick = (rows: MenuCycleDef[]) =>
    rows.filter((c) => inForce(c, date)).reduce<MenuCycleDef | null>((best, c) => (!best || c.startDate > best.startDate ? c : best), null);
  if (serviceId) {
    const own = pick(plans.filter((c) => c.customerServiceId === serviceId));
    if (own) return own;
  }
  return pick(plans.filter((c) => c.customerServiceId === null));
}

/** The recipe a customer's service is served on a date, with the plan it came from. */
export function mealPlanRecipeOn(plans: readonly MenuCycleDef[], serviceId: string | null, date: string): { recipeCode: string; plan: MenuCycleDef } | null {
  const plan = mealPlanInForce(plans, serviceId, date);
  if (!plan) return null;
  const recipeCode = cycleRecipeOn(plan, date);
  return recipeCode ? { recipeCode, plan } : null;
}

/** A copy of a saved cycle as a customer's meal plan — the one-click assign. */
export function copyCycleToPlan(cycle: MenuCycleDef, customerId: string, id: string, opts: { startDate?: string; customerServiceId?: string | null } = {}): MenuCycleDef {
  return {
    ...cycle,
    id,
    channel: null,
    customerId,
    customerServiceId: opts.customerServiceId ?? null,
    fromCycleId: cycle.id,
    startDate: opts.startDate ?? cycle.startDate,
    source: 'user_built',
    days: cycle.days.map((d) => ({ ...d })),
  };
}

/** The plans an edit to a saved cycle can be applied to: every plan copied from it. */
export const plansFromCycle = (cycles: readonly MenuCycleDef[], cycleId: string): MenuCycleDef[] => cycles.filter((c) => c.customerId !== null && c.fromCycleId === cycleId);

/**
 * Apply a saved cycle's sequence to the picked plans: length, weekdays and the
 * recipe per day follow the cycle; each plan keeps its own customer, service,
 * start and end. Plans not picked are returned unchanged.
 */
export function applyCycleToPlans(cycle: MenuCycleDef, plans: readonly MenuCycleDef[], pickedPlanIds: ReadonlySet<string>): MenuCycleDef[] {
  return plans.map((p) =>
    pickedPlanIds.has(p.id) ? { ...p, lengthDays: cycle.lengthDays, weekdays: [...cycle.weekdays], days: cycle.days.map((d) => ({ ...d })) } : p,
  );
}
