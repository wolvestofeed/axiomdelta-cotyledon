import { PageHeader } from '../_components/ui';
import { getMuseAccess } from '../_lib/access';
import { listMenuCycles, listOrders } from '../_lib/orders';
import { loadActuals } from '../_lib/actuals';
import { listPurchaseOrders } from '../_lib/supplier-catalog';
import { loadCalendar } from '../_lib/periods';
import { ProductionPlanningClient } from './ProductionPlanningClient';

export const dynamic = 'force-dynamic';

export default async function ProductionPlanningPage() {
  const [access, cycles, orders, actuals, pos, calendar] = await Promise.all([getMuseAccess(), listMenuCycles(), listOrders(), loadActuals(), listPurchaseOrders(), loadCalendar()]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Production Planning"
        purpose="Plan one recipe run, one delivery day, or a whole period."
        functions={['Single recipe run', 'Delivery day', 'Horizon', 'Batch records closed']}
        connects={[
          { href: '/muse/orders', dir: 'from' },
          { href: '/muse/production-planning/schedule', dir: 'to' },
          { href: '/muse/procurement', dir: 'to' },
          { href: '/muse/actuals', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A single run takes a recipe, a quantity and a channel through batch sizing, the weight chain, labor, the purchase requirement and the economics.</li>
            <li>A delivery day is every order on a date, exploded across recipes and netted against finished goods on hand.</li>
            <li>The shortfall is sized into whole batches per recipe and placed on the shared chiller.</li>
            <li>Batch records close on the delivery day.</li>
            <li>The horizon rolls the order book through production for a period and feeds the channel allocation.</li>
          </ul>
        }
        status="live"
      />
      <ProductionPlanningClient
        canEdit={access.isSuperAdmin}
        canRecord={access.isOperator}
        showFinancials={access.isSuperAdmin}
        closures={calendar.closures}
        cycles={cycles}
        orders={orders}
        batches={actuals.batches.map((b) => ({ batchId: b.batchId, recipeCode: b.recipeCode, productionDate: b.productionDate, goodPortions: b.goodPortions, closedBy: b.closedBy }))}
        deliveries={actuals.deliveries.map((d) => ({ id: d.id, deliveredOn: d.deliveredOn, meals: d.meals }))}
        receipts={actuals.receipts}
        rawBatches={actuals.batches}
        standards={actuals.standards ?? []}
        purchaseOrders={pos.map((po) => ({ id: po.id, poNumber: po.poNumber, status: po.status, orderedFor: po.orderedFor, supplierId: po.supplierId, supplierName: po.supplierName, lines: po.lines.map((l) => ({ ingredient: l.ingredient, qty: l.qty, unit: l.unit })) }))}
        today={today}
      />
    </>
  );
}
