/**
 * MicroFarm — prospect participation.
 *
 * A sales figure, and nothing else reads it: demand, orders and the ledger run
 * on units per service. Enrollment is entered on the pickup point when the prospect
 * account is set up. Participation is calculated from the orders on record that
 * are confirmed or distributed — never planned forecast orders: the units per
 * service they carry, against enrollment.
 */

import type { OrderDef } from '@/data/subscription-cycles';

export interface PickupPointParticipation {
  subscriberPickupPointId: string;
  enrollment: number | null;
  /** Confirmed and distributed orders counted. */
  orders: number;
  /** Distinct date-and-service occasions those orders fall on. */
  services: number;
  units: number;
  /** Units ÷ services; null with no order counted. */
  unitsPerService: number | null;
  /** Units per service ÷ enrollment; null with no enrollment or no order counted. */
  participation: number | null;
}

export function pickupPointParticipation(subscriberPickupPointId: string, enrollment: number | null, orders: readonly OrderDef[]): PickupPointParticipation {
  const counted = orders.filter((o) => o.subscriberPickupPointId === subscriberPickupPointId && (o.status === 'confirmed' || o.status === 'distributed'));
  const occasions = new Set(counted.map((o) => `${o.orderDate}|${o.subscriberServiceId ?? ''}`));
  const units = counted.reduce((s, o) => s + o.units, 0);
  const unitsPerService = occasions.size > 0 ? units / occasions.size : null;
  return {
    subscriberPickupPointId,
    enrollment,
    orders: counted.length,
    services: occasions.size,
    units,
    unitsPerService,
    participation: unitsPerService !== null && enrollment !== null && enrollment > 0 ? unitsPerService / enrollment : null,
  };
}
