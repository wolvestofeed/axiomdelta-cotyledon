import 'server-only';
import { asc } from 'drizzle-orm';
import { farmOrders } from '@/db';
import { db } from '@/lib/db';
import type { OrderDef, OrderSource, OrderStatus } from '@/data/orders';

/**
 * Cotyledon — orders, read layer (server-only). Orders are never seeded: a forecast order is
 * derived on read from the subscriptions, and every stored order is a fact somebody typed,
 * confirmed or distributed.
 */

const iso = (d: string | Date | null): string | null =>
  d === null ? null : typeof d === 'string' ? d : d.toISOString().slice(0, 10);

const ORDER_STATUSES: OrderStatus[] = ['forecast', 'confirmed', 'distributed'];
const ORDER_SOURCES: OrderSource[] = ['typed', 'subscription', 'sales', 'portal'];

/** Every stored order, oldest date first. */
export async function listOrders(): Promise<OrderDef[]> {
  const rows = await db.select().from(farmOrders).orderBy(asc(farmOrders.orderDate), asc(farmOrders.createdAt));
  return rows.map((r) => ({
    id: r.id,
    orderDate: iso(r.orderDate)!,
    subscriberId: r.subscriberId,
    subscriberPickupPointId: r.subscriberPickupPointId,
    subscriptionId: r.subscriptionId ?? null,
    channel: r.channel,
    growPlanCode: r.growPlanCode,
    units: r.units,
    status: ORDER_STATUSES.includes(r.status as OrderStatus) ? (r.status as OrderStatus) : 'forecast',
    pricePerUnitCents: r.pricePerUnitCents,
    distributionId: r.distributionId,
    source: ORDER_SOURCES.includes(r.source as OrderSource) ? (r.source as OrderSource) : 'typed',
    notes: r.notes,
  }));
}
