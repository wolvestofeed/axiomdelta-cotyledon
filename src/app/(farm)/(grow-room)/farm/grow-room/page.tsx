import { getFarmAccess } from '@/server/access';
import { getResolvedActiveInputs } from '@/server/scenarios';
import { listSubscriptionCycles, listOrders } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { listPurchaseOrders } from '@/server/supplier-catalog';
import { loadCalendar } from '@/server/periods';
import { routeCompletion } from '@/engine/working-capital';
import { resolveSubscriberPickupPoints } from '@/engine/demand';
import { GrowRoomClient } from '@/app/(farm)/(grow-room)/farm/grow-room/GrowRoomClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/**
 * The floor (Roadmap I5): today's queue only — receive against an issued
 * purchase order, close today's planned sowings, ship today's confirmed
 * orders — and the raw lots on hand by earliest use-by. The Grow Room records, so
 * it is always the Actual world (Roadmap N6 slice 3): the order book runs on the
 * subscriber records' pickup points, services and flat plans with no forecast edit.
 * Crop plan and plant figures come from the open forecast; the page states no action.
 */
export default async function FloorPage() {
  return withWorkspace(() => FloorPageInner());
}

async function FloorPageInner() {
  const [access, { inputs }, cycles, orders, actuals, pos, calendar] = await Promise.all([
    getFarmAccess(),
    getResolvedActiveInputs(),
    listSubscriptionCycles(),
    listOrders(),
    loadActuals(),
    listPurchaseOrders(),
    loadCalendar(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  // Today's routes waiting to be added to invoices (Roadmap K1), by subscriber.
  const route = routeCompletion(actuals.distributions, today);
  const subscriberName = new Map(inputs.subscribers.map((c) => [c.id, c.name]));

  return (
    <GrowRoomClient
      today={today}
      staff={(actuals.staff ?? []).filter((s) => s.status === 'active').map((s) => ({ ...s, employeeRef: null, email: null, notes: null }))}
      punches={actuals.punches ?? []}
      pendingRoutes={route.groups.map((g) => ({ subscriberId: g.subscriberId, subscriberName: subscriberName.get(g.subscriberId) ?? 'Subscriber', distributions: g.distributionIds.length, units: g.units }))}
      isAdmin={access.isSuperAdmin}
      closures={calendar.closures}
      inputs={{
        cropPlans: inputs.cropPlans,
        subscribers: inputs.subscribers,
        pickupPoints: resolveSubscriberPickupPoints(inputs.subscribers, {}, { closures: inputs.closures }),
        capacityInputs: inputs.capacityInputs,
        assumptions: inputs.assumptions,
        cropPlanAssumptions: inputs.cropPlanAssumptions,
        phases: inputs.phases,
        phaseProfiles: inputs.phaseProfiles,
      }}
      cycles={cycles}
      orders={orders}
      receipts={actuals.receipts}
      sowings={actuals.sowings}
      standards={actuals.standards ?? []}
      distributions={actuals.distributions.map((d) => ({ id: d.id, distributedOn: d.distributedOn, units: d.units }))}
      purchaseOrders={pos.map((po) => ({
        id: po.id,
        poNumber: po.poNumber,
        status: po.status,
        orderedFor: po.orderedFor,
        supplierId: po.supplierId,
        supplierName: po.supplierName,
        lines: po.lines.map((l) => ({ input: l.input, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })),
      }))}
    />
  );
}
