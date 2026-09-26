/**
 * Impact OS — school participation (Robert, 2026-09-16; folded into Roadmap N4b).
 *
 * A sales figure, and nothing else reads it: demand, orders and the ledger run
 * on meals per service. Enrollment is entered on the site when the school
 * account is set up. Participation is calculated from the orders on record that
 * are confirmed or delivered — never planned forecast orders: the meals per
 * service they carry, against enrollment.
 */

import type { OrderDef } from '../_data/menu-cycles';

export interface SiteParticipation {
  customerSiteId: string;
  enrollment: number | null;
  /** Confirmed and delivered orders counted. */
  orders: number;
  /** Distinct date-and-service occasions those orders fall on. */
  services: number;
  meals: number;
  /** Meals ÷ services; null with no order counted. */
  mealsPerService: number | null;
  /** Meals per service ÷ enrollment; null with no enrollment or no order counted. */
  participation: number | null;
}

export function siteParticipation(customerSiteId: string, enrollment: number | null, orders: readonly OrderDef[]): SiteParticipation {
  const counted = orders.filter((o) => o.customerSiteId === customerSiteId && (o.status === 'confirmed' || o.status === 'delivered'));
  const occasions = new Set(counted.map((o) => `${o.orderDate}|${o.customerServiceId ?? ''}`));
  const meals = counted.reduce((s, o) => s + o.meals, 0);
  const mealsPerService = occasions.size > 0 ? meals / occasions.size : null;
  return {
    customerSiteId,
    enrollment,
    orders: counted.length,
    services: occasions.size,
    meals,
    mealsPerService,
    participation: mealsPerService !== null && enrollment !== null && enrollment > 0 ? mealsPerService / enrollment : null,
  };
}
