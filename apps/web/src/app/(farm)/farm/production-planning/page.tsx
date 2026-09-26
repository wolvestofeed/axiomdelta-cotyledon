import { PageHeader } from '../_components/ui';
import { getFarmAccess } from '../_lib/access';
import { listSubscriptionCycles, listOrders } from '../_lib/orders';
import { loadActuals } from '../_lib/actuals';
import { listPurchaseOrders } from '../_lib/supplier-catalog';
import { loadCalendar } from '../_lib/periods';
import { ProductionPlanningClient } from './ProductionPlanningClient';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

export const dynamic = 'force-dynamic';

export default async function ProductionPlanningPage() {
  return withWorkspace(() => ProductionPlanningPageInner());
}

async function ProductionPlanningPageInner() {
  const [access, cycles, orders, actuals, pos, calendar] = await Promise.all([getFarmAccess(), listSubscriptionCycles(), listOrders(), loadActuals(), listPurchaseOrders(), loadCalendar()]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Production Planning"
        purpose="Plan one crop plan run, one distribution day, or a whole period."
        functions={['Single crop plan run', 'Distribution day', 'Horizon', 'Sowing records closed']}
        connects={[
          { href: '/farm/orders', dir: 'from' },
          { href: '/farm/production-planning/schedule', dir: 'to' },
          { href: '/farm/procurement', dir: 'to' },
          { href: '/farm/actuals', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A single run takes a crop plan, a quantity and a channel through sowing sizing, the weight chain, labor, the purchase requirement and the economics.</li>
            <li>A distribution day is every order on a date, exploded across crop plans and netted against finished goods on hand.</li>
            <li>The shortfall is sized into whole sowings per crop plan and placed on the shared blackout rack.</li>
            <li>Sowing records close on the distribution day.</li>
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
        sowings={actuals.sowings.map((b) => ({ sowingId: b.sowingId, cropPlanCode: b.cropPlanCode, productionDate: b.productionDate, goodUnits: b.goodUnits, closedBy: b.closedBy }))}
        distributions={actuals.distributions.map((d) => ({ id: d.id, distributedOn: d.distributedOn, units: d.units }))}
        receipts={actuals.receipts}
        rawSowings={actuals.sowings}
        standards={actuals.standards ?? []}
        purchaseOrders={pos.map((po) => ({ id: po.id, poNumber: po.poNumber, status: po.status, orderedFor: po.orderedFor, supplierId: po.supplierId, supplierName: po.supplierName, lines: po.lines.map((l) => ({ input: l.input, qty: l.qty, unit: l.unit })) }))}
        today={today}
      />
    </>
  );
}
