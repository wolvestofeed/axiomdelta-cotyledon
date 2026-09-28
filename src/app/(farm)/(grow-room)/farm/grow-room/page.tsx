import { getFarmAccess } from '@/server/access';
import { getResolvedActiveInputs } from '@/server/scenarios';
import { listOrders } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { listPurchaseOrders } from '@/server/supplier-catalog';
import { loadCalendar } from '@/server/periods';
import { routeCompletion } from '@/engine/working-capital';
import { recordPickupPoints } from '@/engine/demand';
import { GrowRoomClient } from '@/app/(farm)/(grow-room)/farm/grow-room/GrowRoomClient';
import { withWorkspace } from '@/server/workspace';
import { listExperiments } from '@/server/experiments';
import { experimentsOnShelves, recordOf } from '@/engine/experiments';

export const dynamic = 'force-dynamic';

/**
 * The floor (Roadmap I5): today's queue only — receive against an issued
 * purchase order, close today's planned sowings, ship today's confirmed
 * orders — and the raw lots on hand by earliest use-by. The Grow Room records, so
 * it is always the Actual world (Roadmap N6 slice 3): the order book runs on the
 * subscriber records' pickup points, services and flat plans with no forecast edit.
 * Grow plan and plant figures come from the open forecast; the page states no action.
 */
export default async function FloorPage() {
  return withWorkspace(() => FloorPageInner());
}

async function FloorPageInner() {
  const [access, { inputs }, orders, actuals, pos, calendar] = await Promise.all([
    getFarmAccess(),
    getResolvedActiveInputs(),
    listOrders(),
    loadActuals(),
    listPurchaseOrders(),
    loadCalendar(),
  ]);
  const experiments = await listExperiments();
  const today = new Date().toISOString().slice(0, 10);
  // Today's routes waiting to be added to invoices (Roadmap K1), by subscriber.
  const route = routeCompletion(actuals.distributions, today, null, new Set(inputs.subscribers.filter((c) => c.ownUse).map((c) => c.id)));
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
        growPlans: inputs.growPlans,
        subscribers: inputs.subscribers,
        pickupPoints: recordPickupPoints(inputs.subscribers, { closures: inputs.closures }),
        capacityInputs: inputs.capacityInputs,
        assumptions: inputs.assumptions,
        growPlanAssumptions: inputs.growPlanAssumptions,
        phases: inputs.phases,
        phaseProfiles: inputs.phaseProfiles,
      }}
      orders={orders}
      receipts={actuals.receipts}
      sowings={actuals.sowings}
      standards={actuals.standards ?? []}
      distributions={actuals.distributions.map((d) => ({ id: d.id, distributedOn: d.distributedOn, units: d.units }))}
      experimentSowings={experimentsOnShelves(experiments, actuals.sowings, inputs.growPlans, today)}
      experimentsToday={experiments.filter((e) => e.sowDate === today && !recordOf(e, actuals.sowings)).map((e) => ({ title: e.title, growPlanCode: e.growPlanCode, trays: e.trays }))}
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
