import { PageHeader } from '../_components/ui';
import { getFarmAccess } from '../_lib/access';
import { listSubscriptionCycles, listOrders } from '../_lib/orders';
import { loadActuals } from '../_lib/actuals';
import { listPurchaseOrders } from '../_lib/supplier-catalog';
import { loadCalendar } from '../_lib/periods';
import { ProcurementClient } from './ProcurementClient';

export const dynamic = 'force-dynamic';

export default async function ProcurementPage() {
  const [access, cycles, orders, actuals, pos, calendar] = await Promise.all([getFarmAccess(), listSubscriptionCycles(), listOrders(), loadActuals(), listPurchaseOrders(), loadCalendar()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Procurement"
        purpose="See stock on hand and on order, and what the next run needs bought."
        functions={['Raw stock', 'Open purchase orders', 'Net to buy', 'Issued purchase orders', 'Supply position']}
        connects={[
          { href: '/farm/production-planning', dir: 'from' },
          { href: '/farm/inventory', dir: 'to' },
          { href: '/farm/payables', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Raw stock on hand is receipts less what closed sowings issued, oldest lot first.</li>
            <li>On order is issued purchase orders less the receipts against them.</li>
            <li>To buy is the next run&rsquo;s gross requirement less on hand and on order.</li>
            <li>Every input in the library is here with its supplier link, which purchase orders group by.</li>
          </ul>
        }
        status="live"
      />
      <ProcurementClient
        canEdit={access.isSuperAdmin}
        canRecord={access.isOperator}
        closures={calendar.closures}
        cycles={cycles}
        orders={orders}
        receipts={actuals.receipts}
        sowings={actuals.sowings}
        purchaseOrders={pos.map((po) => ({ id: po.id, poNumber: po.poNumber, status: po.status, orderedFor: po.orderedFor, supplierId: po.supplierId, supplierName: po.supplierName, lines: po.lines.map((l) => ({ input: l.input, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })) }))}
        today={today}
      />
    </>
  );
}
