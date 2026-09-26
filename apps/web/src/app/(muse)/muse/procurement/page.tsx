import { PageHeader } from '../_components/ui';
import { getMuseAccess } from '../_lib/access';
import { listMenuCycles, listOrders } from '../_lib/orders';
import { loadActuals } from '../_lib/actuals';
import { listPurchaseOrders } from '../_lib/supplier-catalog';
import { loadCalendar } from '../_lib/periods';
import { ProcurementClient } from './ProcurementClient';

export const dynamic = 'force-dynamic';

export default async function ProcurementPage() {
  const [access, cycles, orders, actuals, pos, calendar] = await Promise.all([getMuseAccess(), listMenuCycles(), listOrders(), loadActuals(), listPurchaseOrders(), loadCalendar()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Procurement"
        purpose="See stock on hand and on order, and what the next run needs bought."
        functions={['Raw stock', 'Open purchase orders', 'Net to buy', 'Issued purchase orders', 'Supply position']}
        connects={[
          { href: '/muse/production-planning', dir: 'from' },
          { href: '/muse/inventory', dir: 'to' },
          { href: '/muse/payables', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Raw stock on hand is receipts less what closed batches issued, oldest lot first.</li>
            <li>On order is issued purchase orders less the receipts against them.</li>
            <li>To buy is the next run&rsquo;s gross requirement less on hand and on order.</li>
            <li>Every ingredient in the library is here with its supplier link, which purchase orders group by.</li>
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
        batches={actuals.batches}
        purchaseOrders={pos.map((po) => ({ id: po.id, poNumber: po.poNumber, status: po.status, orderedFor: po.orderedFor, supplierId: po.supplierId, supplierName: po.supplierName, lines: po.lines.map((l) => ({ ingredient: l.ingredient, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })) }))}
        today={today}
      />
    </>
  );
}
