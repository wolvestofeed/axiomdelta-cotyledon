import { PageHeader } from '../../_components/ui';
import { listMenuCycles, listOrders } from '../../_lib/orders';
import { loadActuals } from '../../_lib/actuals';
import { loadCalendar } from '../../_lib/periods';
import { listTimeStudies } from '../../_lib/time-studies';
import { CalendarClient } from './CalendarClient';

export const dynamic = 'force-dynamic';

/** The calendar (scheduler build plan W4): the horizon month by month. */
export default async function CalendarPage() {
  const [cycles, orders, actuals, calendar, library] = await Promise.all([listMenuCycles(), listOrders(), loadActuals(), loadCalendar(), listTimeStudies()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Calendar"
        purpose="Scan the month for days that don't fit, then open one."
        functions={['Batches', 'Cycles used', 'Portions shipped', 'Portions expired', 'Findings']}
        connects={[
          { href: '/muse/orders', dir: 'from' },
          { href: '/muse/production-planning/schedule', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The order book is rolled through production, month by month.</li>
            <li>Each day carries batches cooked, portions made, cycles used, shipped against ordered, stock past hold life and findings raised.</li>
            <li>A day that doesn&rsquo;t fit, or breaks a limit, is outlined.</li>
            <li>Pick a day to open it on the Day Schedule.</li>
          </ul>
        }
        status="live"
      />
      <CalendarClient
        today={today}
        cycles={cycles}
        orders={orders}
        closures={calendar.closures}
        batches={actuals.batches.map((b) => ({ batchId: b.batchId, recipeCode: b.recipeCode, productionDate: b.productionDate, goodPortions: b.goodPortions }))}
        deliveries={actuals.deliveries.map((d) => ({ id: d.id, deliveredOn: d.deliveredOn, meals: d.meals }))}
        studies={library.studies}
      />
    </>
  );
}
