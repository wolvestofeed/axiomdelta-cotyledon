/**
 * MicroFarm — the front door's router (Roadmap P7): where a signed-in person lands, by the list their
 * email is on. Pure, so the order of the checks is testable; `(front)/farm/enter/page.tsx` reads the
 * lists and redirects.
 *
 *   1. an admin → the Admin Dashboard, whatever else they hold; admin emails open every portal
 *     ;
 *   2. staff holding both the Operator and Sales work roles → a chooser, the Grow Room or the Sales Portal;
 *   3. Operator access → the Grow Room;
 *   4. the Sales work role → the Sales Portal;
 *   5. on no list → account under review. An external account linked to a subscriber or supplier
 *      record goes to its portal once linking exists (Roadmap P5).
 */

export type FrontDoorLanding = 'admin' | 'choose' | 'growRoom' | 'sales' | 'review';

export const LANDING_HREF: Record<Exclude<FrontDoorLanding, 'choose' | 'review'>, string> = {
  admin: '/farm/dashboard',
  growRoom: '/farm/grow-room',
  sales: '/farm/sales-portal',
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
  if (p.isOperator) return 'growRoom';
  return 'review';
}
