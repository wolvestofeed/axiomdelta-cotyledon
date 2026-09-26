/**
 * Parent Admin — SYNTHETIC demo data.
 *
 * PREVIEW / MOCK ONLY. These parent accounts and history events are invented to
 * demonstrate the future parent signup + payment module. They are not real
 * families and represent no real payments. Accounts are keyed to the school IDs
 * of signed-active, parent-pay customers in schools-compiled.json.
 */

import type { ParentAccount, HistoryEvent, Cadence } from '../_engine/parent-portal';

/**
 * PLACEHOLDER plan products for the parent-facing signup shell.
 *
 * These stand in for future Stripe products/prices — none are wired. Product
 * names and the pricing basis are placeholders; `stripePriceId` is null until
 * the real products are created in Stripe. The three cadences map to the three
 * ways a family can buy: per meal, per week (a set number of days), or per
 * month (a block of meals).
 */
export interface ParentPlanProduct {
  id: string;
  cadence: Cadence;
  name: string;
  blurb: string;
  /** Not wired — set when the real Stripe price exists. */
  stripePriceId: string | null;
}

export const parentPlanProducts: ParentPlanProduct[] = [
  { id: 'plan-per-meal', cadence: 'per-meal', name: 'À la carte', blurb: 'Pay per meal, no commitment. Charged as meals are ordered.', stripePriceId: null },
  { id: 'plan-per-week', cadence: 'per-week', name: 'Weekly plan', blurb: 'A set number of days each week, billed weekly.', stripePriceId: null },
  { id: 'plan-per-month', cadence: 'per-month', name: 'Monthly plan', blurb: 'A month of meals in one plan, billed monthly.', stripePriceId: null },
];

export const parentAccounts: ParentAccount[] = [
  // ── Meridian World School ──────────────────────────────────────────────
  { id: 'p-mwe-01', schoolId: 'meridian-world-school', guardian: 'Alvarez family', kids: 2, plan: 'breakfast-lunch', daysPerWeek: 5, cadence: 'per-month', status: 'active', since: '08/18/2026' },
  { id: 'p-mwe-02', schoolId: 'meridian-world-school', guardian: 'Nguyen family', kids: 1, plan: 'lunch', daysPerWeek: 5, cadence: 'per-week', status: 'active', since: '08/20/2026' },
  { id: 'p-mwe-03', schoolId: 'meridian-world-school', guardian: 'Okafor family', kids: 3, plan: 'lunch', daysPerWeek: 5, cadence: 'per-month', status: 'active', since: '08/22/2026' },
  { id: 'p-mwe-04', schoolId: 'meridian-world-school', guardian: 'Patel family', kids: 1, plan: 'breakfast-lunch', daysPerWeek: 3, cadence: 'per-meal', status: 'active', since: '09/01/2026' },
  { id: 'p-mwe-05', schoolId: 'meridian-world-school', guardian: 'Thompson family', kids: 2, plan: 'lunch', daysPerWeek: 5, cadence: 'per-month', status: 'paused', since: '08/19/2026' },
  { id: 'p-mwe-06', schoolId: 'meridian-world-school', guardian: 'Ramirez family', kids: 1, plan: 'lunch', daysPerWeek: 5, cadence: 'per-week', status: 'pending', since: '09/08/2026' },

  // ── Hill Country Christian School ──────────────────────────────────────
  { id: 'p-hcc-01', schoolId: 'hill-country-christian-school', guardian: 'Bauer family', kids: 3, plan: 'breakfast-lunch', daysPerWeek: 5, cadence: 'per-month', status: 'active', since: '08/15/2026' },
  { id: 'p-hcc-02', schoolId: 'hill-country-christian-school', guardian: 'Coleman family', kids: 2, plan: 'lunch', daysPerWeek: 5, cadence: 'per-month', status: 'active', since: '08/17/2026' },
  { id: 'p-hcc-03', schoolId: 'hill-country-christian-school', guardian: 'Delgado family', kids: 1, plan: 'lunch', daysPerWeek: 3, cadence: 'per-week', status: 'active', since: '08/25/2026' },
  { id: 'p-hcc-04', schoolId: 'hill-country-christian-school', guardian: 'Foster family', kids: 2, plan: 'breakfast-lunch', daysPerWeek: 5, cadence: 'per-week', status: 'active', since: '09/02/2026' },
  { id: 'p-hcc-05', schoolId: 'hill-country-christian-school', guardian: 'Iverson family', kids: 1, plan: 'lunch', daysPerWeek: 5, cadence: 'per-meal', status: 'pending', since: '09/09/2026' },

  // ── International School of Texas ───────────────────────────────────────
  { id: 'p-ist-01', schoolId: 'international-school-of-texas', guardian: 'Chen family', kids: 1, plan: 'breakfast-lunch', daysPerWeek: 5, cadence: 'per-month', status: 'active', since: '08/21/2026' },
  { id: 'p-ist-02', schoolId: 'international-school-of-texas', guardian: 'Moreau family', kids: 2, plan: 'lunch', daysPerWeek: 5, cadence: 'per-month', status: 'active', since: '08/24/2026' },
  { id: 'p-ist-03', schoolId: 'international-school-of-texas', guardian: 'Yamamoto family', kids: 1, plan: 'lunch', daysPerWeek: 3, cadence: 'per-week', status: 'active', since: '09/03/2026' },
  { id: 'p-ist-04', schoolId: 'international-school-of-texas', guardian: 'Schmidt family', kids: 2, plan: 'breakfast-lunch', daysPerWeek: 5, cadence: 'per-meal', status: 'paused', since: '08/28/2026' },
];

export const historyEvents: HistoryEvent[] = [
  // Meridian
  { id: 'h-mwe-01', schoolId: 'meridian-world-school', date: '09/08/2026', type: 'enrollment', detail: 'Ramirez family signed up — 1 kid, Lunch only, per week (pending first payment)' },
  { id: 'h-mwe-02', schoolId: 'meridian-world-school', date: '09/01/2026', type: 'payment', detail: 'Okafor family — monthly payment received', amount: 649.5 },
  { id: 'h-mwe-03', schoolId: 'meridian-world-school', date: '09/01/2026', type: 'plan-change', detail: 'Patel family added Breakfast to plan (now Breakfast + Lunch, 3 days)' },
  { id: 'h-mwe-04', schoolId: 'meridian-world-school', date: '08/22/2026', type: 'enrollment', detail: 'Okafor family enrolled — 3 kids, Lunch only, per month' },
  { id: 'h-mwe-05', schoolId: 'meridian-world-school', date: '08/19/2026', type: 'note', detail: 'Thompson family paused billing for September (travel)' },

  // Hill Country
  { id: 'h-hcc-01', schoolId: 'hill-country-christian-school', date: '09/09/2026', type: 'enrollment', detail: 'Iverson family signed up — 1 kid, Lunch only, per meal (pending)' },
  { id: 'h-hcc-02', schoolId: 'hill-country-christian-school', date: '09/02/2026', type: 'payment', detail: 'Bauer family — monthly payment received', amount: 1299.0 },
  { id: 'h-hcc-03', schoolId: 'hill-country-christian-school', date: '08/25/2026', type: 'enrollment', detail: 'Delgado family enrolled — 1 kid, Lunch only, 3 days, per week' },
  { id: 'h-hcc-04', schoolId: 'hill-country-christian-school', date: '08/15/2026', type: 'note', detail: 'Program launch — Hill Country Christian parent sign-ups opened' },

  // International School of Texas
  { id: 'h-ist-01', schoolId: 'international-school-of-texas', date: '09/03/2026', type: 'enrollment', detail: 'Yamamoto family enrolled — 1 kid, Lunch only, 3 days, per week' },
  { id: 'h-ist-02', schoolId: 'international-school-of-texas', date: '08/28/2026', type: 'note', detail: 'Schmidt family paused — reviewing breakfast option' },
  { id: 'h-ist-03', schoolId: 'international-school-of-texas', date: '08/24/2026', type: 'payment', detail: 'Moreau family — monthly payment received', amount: 433.0 },
  { id: 'h-ist-04', schoolId: 'international-school-of-texas', date: '08/21/2026', type: 'enrollment', detail: 'Chen family enrolled — 1 kid, Breakfast + Lunch, per month' },
];
