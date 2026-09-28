/**
 * Cotyledon — orders: the document shape.
 *
 * An order is a date, subscriber, pickup point, grow plan, units and a status. A forecast order
 * derived from a subscription's distribution is DERIVED and never stored; the engine computes it
 * on read (`_engine/orders.ts`). A stored order is a typed forecast, a confirmed count, or a
 * distributed order naming its distribution record.
 */

export type OrderStatus = 'forecast' | 'confirmed' | 'distributed';
export type OrderSource = 'typed' | 'subscription' | 'sales' | 'portal';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  forecast: 'Forecast',
  confirmed: 'Confirmed',
  distributed: 'Distributed',
};

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  typed: 'Typed',
  subscription: 'Subscription',
  sales: 'Sales workspace',
  portal: 'Subscriber portal',
};

/** 0 = Sunday … 6 = Saturday, matching `Date.getUTCDay()`. */
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface OrderDef {
  id: string;
  orderDate: string;
  subscriberId: string;
  subscriberPickupPointId: string;
  /** The subscription the order is a distribution of; null on a typed order. */
  subscriptionId: string | null;
  channel: number;
  growPlanCode: string;
  units: number;
  status: OrderStatus;
  /** Null = the subscriber's contracted price, else the channel default. */
  pricePerUnitCents: number | null;
  distributionId: string | null;
  source: OrderSource;
  notes: string | null;
}
