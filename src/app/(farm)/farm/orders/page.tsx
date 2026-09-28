import { PageHeader } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { listOrders } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { finishedLotsOf } from '@/engine/actuals';
import { loadCalendar } from '@/server/periods';
import { OrdersClient } from '@/app/(farm)/farm/orders/OrdersClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  return withWorkspace(() => OrdersPageInner());
}

async function OrdersPageInner() {
  const [access, orders, actuals, calendar] = await Promise.all([getFarmAccess(), listOrders(), loadActuals(), loadCalendar()]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Orders"
        purpose="See every order by date and subscriber, forecast or on file."
        functions={['Order book', 'Distribution day', 'Pickup points']}
        connects={[
          { href: '/farm/subscribers', dir: 'from' },
          { href: '/farm/production-planning', dir: 'to' },
          { href: '/farm/inventory', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A forecast order is a distribution a subscription carries: one order per flat plan line on each date the cadence falls on.</li>
            <li>Forecast orders are computed from Subscribers each time the page is read, never stored.</li>
            <li>A typed count, a confirmed count or a distributed order is a row on file, and each replaces the forecast order it stands for.</li>
            <li>A subscriber&rsquo;s distribution day is every order on that date for that subscriber.</li>
          </ul>
        }
        status="live"
      />
      <OrdersClient
        canEdit={access.isSuperAdmin}
        canRecord={access.isOperator}
        closures={calendar.closures}
        orders={orders}
        distributions={actuals.distributions.map((d) => ({ id: d.id, distributedOn: d.distributedOn, units: d.units, pricePerUnitCents: d.pricePerUnitCents, phase: d.phase, subscriberId: d.subscriberId ?? null, invoiceId: d.invoiceId ?? null }))}
        finishedLots={finishedLotsOf(actuals.sowings)}
        today={today}
      />
    </>
  );
}
