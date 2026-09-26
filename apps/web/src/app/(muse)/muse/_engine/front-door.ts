/**
 * Impact OS — the front door's router (Roadmap P7): where a signed-in person lands, by the list their
 * email is on. Pure, so the order of the checks is testable; `(front)/muse/enter/page.tsx` reads the
 * lists and redirects.
 *
 *   1. an admin → the Admin Dashboard, whatever else they hold; admin emails open every portal
 *      (Robert, 2026-09-16);
 *   2. staff holding both the Operator and Sales work roles → a chooser, the Floor or the Sales Portal;
 *   3. Operator access → the Floor;
 *   4. the Sales work role → the Sales Portal;
 *   5. on no list → account under review. An external account linked to a customer, supplier or parent
 *      record goes to its portal once linking exists (Roadmap P5).
 */

export type FrontDoorLanding = 'admin' | 'choose' | 'floor' | 'sales' | 'review';

export const LANDING_HREF: Record<Exclude<FrontDoorLanding, 'choose' | 'review'>, string> = {
  admin: '/muse/dashboard',
  floor: '/muse/floor',
  sales: '/muse/sales-portal',
};

export interface FrontDoorPerson {
  isSuperAdmin: boolean;
  isOperator: boolean;
  /** Work roles on the staff register; empty when the sign-in matches no active person. */
  staffRoles: readonly string[];
}

export function landingFor(p: FrontDoorPerson): FrontDoorLanding {
  if (p.isSuperAdmin) return 'admin';
  const operatorRole = p.staffRoles.includes('operator');
  const salesRole = p.staffRoles.includes('sales');
  if (operatorRole && salesRole) return 'choose';
  if (salesRole) return 'sales';
  if (p.isOperator) return 'floor';
  return 'review';
}
