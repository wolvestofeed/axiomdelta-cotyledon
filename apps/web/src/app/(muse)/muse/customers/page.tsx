import { PageHeader } from '../_components/ui';
import { getMuseAccess } from '../_lib/access';
import { loadActuals } from '../_lib/actuals';
import { listMenuCycles, listOrders } from '../_lib/orders';
import { sites as seedSites } from '../_data/seed-invented';
import { CustomersClient } from './CustomersClient';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const [access, actuals, cycles, orders] = await Promise.all([getMuseAccess(), loadActuals(), listMenuCycles(), listOrders()]);
  const today = new Date().toISOString().slice(0, 10);

  // Actual meals delivered to date, by delivery-site id and by site name, so a
  // forecast can be read against what was actually served.
  const actualById: Record<string, number> = {};
  const actualByName: Record<string, number> = {};
  for (const d of actuals.deliveries) {
    if (d.siteId) actualById[d.siteId] = (actualById[d.siteId] ?? 0) + d.meals;
    if (d.siteName) actualByName[d.siteName] = (actualByName[d.siteName] ?? 0) + d.meals;
  }

  return (
    <>
      <PageHeader
        title="Customers"
        purpose="Set who is served, where, when and on what, since all demand starts here."
        functions={['Service calendar', 'Services', 'Meals per service', 'Meal plan', 'Editing']}
        connects={[
          { href: '/muse/sales', dir: 'from' },
          { href: '/muse/orders', dir: 'to' },
          { href: '/muse/production-planning', dir: 'to' },
          { href: '/muse/receivables', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Each site has its own service calendar. One service is one loading and one dispatch.</li>
            <li>Meals per service change on the dates entered.</li>
            <li>Each customer has its own meal plan.</li>
            <li>Demand on every other page is these figures run across the calendar. Nothing is projected on its own.</li>
            <li>The customer record drives real operations. The open forecast keeps its own edits and never changes the record.</li>
            <li>An order&rsquo;s recipes and packages come from the libraries for the customer&rsquo;s channel; its price is the customer&rsquo;s contracted price, or the channel&rsquo;s.</li>
          </ul>
        }
        status="live"
      />
      <CustomersClient
        canEdit={access.isSuperAdmin}
        today={today}
        cycles={cycles}
        orders={orders}
        deliverySites={seedSites.map((s) => ({ id: s.id, name: s.name }))}
        actualMealsBySiteId={actualById}
        actualMealsBySiteName={actualByName}
      />
    </>
  );
}
