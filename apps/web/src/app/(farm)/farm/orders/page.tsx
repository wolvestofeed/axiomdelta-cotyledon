import { PageHeader } from '../_components/ui';
import { getFarmAccess } from '../_lib/access';
import { listSubscriptionCycles, listOrders } from '../_lib/orders';
import { loadActuals } from '../_lib/actuals';
import { finishedLotsOf } from '../_engine/actuals';
import { loadCalendar } from '../_lib/periods';
import { OrdersClient } from './OrdersClient';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  return withWorkspace(() => OrdersPageInner());
}

async function OrdersPageInner() {
  const [access, cycles, orders, actuals, calendar] = await Promise.all([getFarmAccess(), listSubscriptionCycles(), listOrders(), loadActuals(), loadCalendar()]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Orders"
        purpose="See every order by date and subscriber, forecast or on file."
        functions={['Order book', 'Distribution day', 'Saved subscription cycles', 'Pickup points']}
        connects={[
          { href: '/farm/subscribers', dir: 'from' },
          { href: '/farm/production-planning', dir: 'to' },
          { href: '/farm/inventory', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Every subscriber has its own flat plan: a saved subscription cycle copied onto it, or a sequence programmed for it alone.</li>
            <li>A forecast order is the plan&rsquo;s crop plan on a date times the service&rsquo;s units per service, on each date the service runs.</li>
            <li>Forecast orders are computed from Subscribers each time the page is read, never stored.</li>
            <li>A typed count, a confirmed count or a distributed order is a row on file, and each replaces the forecast order it stands for.</li>
            <li>A prospect&rsquo;s distribution day is every order on that date for that subscriber.</li>
          </ul>
        }
        status="live"
      />
      <OrdersClient
        canEdit={access.isSuperAdmin}
        canRecord={access.isOperator}
        closures={calendar.closures}
        cycles={cycles}
        orders={orders}
        distributions={actuals.distributions.map((d) => ({ id: d.id, distributedOn: d.distributedOn, units: d.units, pricePerUnitCents: d.pricePerUnitCents, phase: d.phase, subscriberId: d.subscriberId ?? null, invoiceId: d.invoiceId ?? null }))}
        finishedLots={finishedLotsOf(actuals.sowings)}
        today={today}
      />
    </>
  );
}
