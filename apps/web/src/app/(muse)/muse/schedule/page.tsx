import { PageHeader } from '../_components/ui';
import { listMenuCycles, listOrders } from '../_lib/orders';
import { loadActuals } from '../_lib/actuals';
import { loadCalendar } from '../_lib/periods';
import { listTimeStudies } from '../_lib/time-studies';
import { ScheduleClient } from './ScheduleClient';

export const dynamic = 'force-dynamic';

/** Schedule (Roadmap O3): two weeks of production staff demand, and the operating day with the chiller tasks. */
export default async function SchedulePage() {
  const [cycles, orders, actuals, calendar, library] = await Promise.all([listMenuCycles(), listOrders(), loadActuals(), loadCalendar(), listTimeStudies()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Schedule"
        purpose="Build two weeks of production staff demand and send it to CompTable."
        functions={['Staff demand', 'Staff-hours required', 'Busiest day', 'CompTable']}
        connects={[
          { href: '/muse/production-planning', dir: 'from' },
          { href: '/muse/time-studies', dir: 'from' },
          { href: '/dashboard', dir: 'both', label: 'CompTable' },
          { href: '/muse/production-planning/schedule', dir: 'both' },
        ]}
        howItWorks={
          <ul>
            <li>Each scheduled batch is staffed from its labor standard: the adopted time study, or its estimated study until one is adopted.</li>
            <li>Demand is shown as people and staff-hours by task and station per day.</li>
            <li>An admin adjusts and publishes the schedule in CompTable, and the published schedule returns every two weeks.</li>
            <li>No shift pattern or staff count has been decided.</li>
          </ul>
        }
        status="partial"
      />
      <ScheduleClient
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
