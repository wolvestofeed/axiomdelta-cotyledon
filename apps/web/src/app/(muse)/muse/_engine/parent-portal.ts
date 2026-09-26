/**
 * Parent Admin — client-safe types + payment math.
 *
 * PREVIEW / MOCK. This models the future parent signup + payment module for
 * parent-pay / parent-provided schools. All parent accounts are synthetic
 * demo data; no real accounts, no real payments. Amounts are derived from the
 * School-meals per-meal price (plan-data) — illustrative, not a bill.
 */

export type MealPlan = 'breakfast-lunch' | 'lunch';
export type Cadence = 'per-meal' | 'per-week' | 'per-month';
export type ParentStatus = 'active' | 'pending' | 'paused';

export interface ParentAccount {
  id: string;
  schoolId: string;
  guardian: string;
  kids: number;
  plan: MealPlan;
  daysPerWeek: number;
  cadence: Cadence;
  status: ParentStatus;
  since: string; // MM/DD/YYYY
}

export interface HistoryEvent {
  id: string;
  schoolId: string;
  date: string; // MM/DD/YYYY
  type: 'enrollment' | 'payment' | 'plan-change' | 'note';
  detail: string;
  amount?: number;
}

const WEEKS_PER_MONTH = 4.33;

export const PLAN_LABEL: Record<MealPlan, string> = {
  'breakfast-lunch': 'Breakfast + Lunch',
  lunch: 'Lunch only',
};
export const CADENCE_LABEL: Record<Cadence, string> = {
  'per-meal': 'Per meal',
  'per-week': 'Per week',
  'per-month': 'Per month',
};

export const mealsPerDay = (plan: MealPlan): number => (plan === 'breakfast-lunch' ? 2 : 1);

/** Total meals per week across a family's kids. */
export const mealsPerWeek = (p: ParentAccount): number =>
  mealsPerDay(p.plan) * p.daysPerWeek * p.kids;

export const weeklyCost = (p: ParentAccount, pricePerMeal: number): number =>
  mealsPerWeek(p) * pricePerMeal;

export const monthlyCost = (p: ParentAccount, pricePerMeal: number): number =>
  weeklyCost(p, pricePerMeal) * WEEKS_PER_MONTH;

/** The amount as it is billed under the account's chosen cadence. */
export function billed(p: ParentAccount, pricePerMeal: number): { amount: number; unit: string } {
  switch (p.cadence) {
    case 'per-meal':
      return { amount: pricePerMeal, unit: 'meal' };
    case 'per-week':
      return { amount: weeklyCost(p, pricePerMeal), unit: 'week' };
    case 'per-month':
      return { amount: monthlyCost(p, pricePerMeal), unit: 'month' };
  }
}

export interface SchoolSummary {
  activeParents: number;
  totalParents: number;
  kids: number; // active only
  mealsPerWeek: number; // active only
  monthlyBilled: number; // normalized monthly value, active only
  byCadence: Record<Cadence, number>;
  byPlan: Record<MealPlan, number>;
}

/** Aggregate a school's parent roster into portal summary tiles. */
export function summarizeSchool(parents: ParentAccount[], pricePerMeal: number): SchoolSummary {
  const active = parents.filter((p) => p.status === 'active');
  const byCadence: Record<Cadence, number> = { 'per-meal': 0, 'per-week': 0, 'per-month': 0 };
  const byPlan: Record<MealPlan, number> = { 'breakfast-lunch': 0, lunch: 0 };
  let kids = 0;
  let mpw = 0;
  let monthly = 0;
  for (const p of active) {
    byCadence[p.cadence] += 1;
    byPlan[p.plan] += 1;
    kids += p.kids;
    mpw += mealsPerWeek(p);
    monthly += monthlyCost(p, pricePerMeal);
  }
  return {
    activeParents: active.length,
    totalParents: parents.length,
    kids,
    mealsPerWeek: mpw,
    monthlyBilled: monthly,
    byCadence,
    byPlan,
  };
}
