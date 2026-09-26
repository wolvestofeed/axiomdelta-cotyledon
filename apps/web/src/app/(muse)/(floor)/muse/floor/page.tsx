import { getMuseAccess } from '@/app/(muse)/muse/_lib/access';
import { getResolvedActiveInputs } from '@/app/(muse)/muse/_lib/scenarios';
import { listMenuCycles, listOrders } from '@/app/(muse)/muse/_lib/orders';
import { loadActuals } from '@/app/(muse)/muse/_lib/actuals';
import { listPurchaseOrders } from '@/app/(muse)/muse/_lib/supplier-catalog';
import { loadCalendar } from '@/app/(muse)/muse/_lib/periods';
import { routeCompletion } from '@/app/(muse)/muse/_engine/working-capital';
import { resolveCustomerSites } from '@/app/(muse)/muse/_engine/demand';
import { FloorClient } from './FloorClient';

export const dynamic = 'force-dynamic';

/**
 * The floor (Roadmap I5): today's queue only — receive against an issued
 * purchase order, close today's planned batches, ship today's confirmed
 * orders — and the raw lots on hand by earliest use-by. The Floor records, so
 * it is always the Actual world (Roadmap N6 slice 3): the order book runs on the
 * customer records' sites, services and meal plans with no forecast edit.
 * Recipe and plant figures come from the open forecast; the page states no action.
 */
export default async function FloorPage() {
  const [access, { inputs }, cycles, orders, actuals, pos, calendar] = await Promise.all([
    getMuseAccess(),
    getResolvedActiveInputs(),
    listMenuCycles(),
    listOrders(),
    loadActuals(),
    listPurchaseOrders(),
    loadCalendar(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  // Today's routes waiting to be added to invoices (Roadmap K1), by customer.
  const route = routeCompletion(actuals.deliveries, today);
  const customerName = new Map(inputs.customers.map((c) => [c.id, c.name]));

  return (
    <FloorClient
      today={today}
      staff={(actuals.staff ?? []).filter((s) => s.status === 'active').map((s) => ({ ...s, employeeRef: null, email: null, notes: null }))}
      punches={actuals.punches ?? []}
      pendingRoutes={route.groups.map((g) => ({ customerId: g.customerId, customerName: customerName.get(g.customerId) ?? 'Customer', deliveries: g.deliveryIds.length, meals: g.meals }))}
      isAdmin={access.isSuperAdmin}
      closures={calendar.closures}
      inputs={{
        recipes: inputs.recipes,
        customers: inputs.customers,
        sites: resolveCustomerSites(inputs.customers, {}, { closures: inputs.closures }),
        capacityInputs: inputs.capacityInputs,
        assumptions: inputs.assumptions,
        recipeAssumptions: inputs.recipeAssumptions,
        phases: inputs.phases,
        phaseProfiles: inputs.phaseProfiles,
      }}
      cycles={cycles}
      orders={orders}
      receipts={actuals.receipts}
      batches={actuals.batches}
      standards={actuals.standards ?? []}
      deliveries={actuals.deliveries.map((d) => ({ id: d.id, deliveredOn: d.deliveredOn, meals: d.meals }))}
      purchaseOrders={pos.map((po) => ({
        id: po.id,
        poNumber: po.poNumber,
        status: po.status,
        orderedFor: po.orderedFor,
        supplierId: po.supplierId,
        supplierName: po.supplierName,
        lines: po.lines.map((l) => ({ ingredient: l.ingredient, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })),
      }))}
    />
  );
}
