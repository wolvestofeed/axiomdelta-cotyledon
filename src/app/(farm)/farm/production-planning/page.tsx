import { PageHeader } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { listSubscriptionCycles, listOrders } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { listPurchaseOrders } from '@/server/supplier-catalog';
import { loadCalendar } from '@/server/periods';
import { ProductionPlanningClient } from '@/app/(farm)/farm/production-planning/ProductionPlanningClient';
import { withWorkspace } from '@/server/workspace';

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
        purpose="Plan one grow plan run, one distribution day, or a whole period."
        functions={['Single run', 'Distribution day', 'Horizon', 'Sowings on the grow units', 'Purchase requirement']}
        connects={[
          { href: '/farm/orders', dir: 'from' },
          { href: '/farm/production-planning/schedule', dir: 'to' },
          { href: '/farm/procurement', dir: 'to' },
          { href: '/farm/actuals', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A single run takes a grow plan, a quantity in trays and a channel through the sowing one grow unit takes, the seed-to-harvest chain, labor on the three streams, the purchase requirement and the economics.</li>
            <li>A distribution day is every order on a date, each back-planned to its plan&rsquo;s sow date, exploded into trays and netted against finished goods on hand.</li>
            <li>The shortfall is sized into whole sowings per plan, each placed on a grow unit whose fixture delivers its light line and which has room for the whole cycle.</li>
            <li>A sowing dated today is closed in the Grow Room; closed records are listed here.</li>
            <li>The horizon rolls the order book through the shelves for a period, reads each day beside the stock, and feeds the channel allocation.</li>
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
