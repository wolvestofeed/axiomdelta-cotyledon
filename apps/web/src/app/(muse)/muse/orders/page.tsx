import { PageHeader } from '../_components/ui';
import { getMuseAccess } from '../_lib/access';
import { listMenuCycles, listOrders } from '../_lib/orders';
import { loadActuals } from '../_lib/actuals';
import { finishedLotsOf } from '../_engine/actuals';
import { loadCalendar } from '../_lib/periods';
import { OrdersClient } from './OrdersClient';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const [access, cycles, orders, actuals, calendar] = await Promise.all([getMuseAccess(), listMenuCycles(), listOrders(), loadActuals(), loadCalendar()]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Orders"
        purpose="See every order by date and customer, forecast or on file."
        functions={['Order book', 'Delivery day', 'Saved menu cycles', 'Sites']}
        connects={[
          { href: '/muse/customers', dir: 'from' },
          { href: '/muse/production-planning', dir: 'to' },
          { href: '/muse/inventory', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Every customer has its own meal plan: a saved menu cycle copied onto it, or a sequence programmed for it alone.</li>
            <li>A forecast order is the plan&rsquo;s recipe on a date times the service&rsquo;s meals per service, on each date the service runs.</li>
            <li>Forecast orders are computed from Customers each time the page is read, never stored.</li>
            <li>A typed count, a confirmed count or a delivered order is a row on file, and each replaces the forecast order it stands for.</li>
            <li>A school&rsquo;s delivery day is every order on that date for that customer.</li>
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
        deliveries={actuals.deliveries.map((d) => ({ id: d.id, deliveredOn: d.deliveredOn, meals: d.meals, pricePerMealCents: d.pricePerMealCents, phase: d.phase, customerId: d.customerId ?? null, invoiceId: d.invoiceId ?? null }))}
        finishedLots={finishedLotsOf(actuals.batches)}
        today={today}
      />
    </>
  );
}
