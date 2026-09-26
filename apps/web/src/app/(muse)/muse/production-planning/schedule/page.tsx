import { PageHeader } from '../../_components/ui';
import { listMenuCycles, listOrders } from '../../_lib/orders';
import { loadActuals } from '../../_lib/actuals';
import { loadCalendar } from '../../_lib/periods';
import { listTimeStudies } from '../../_lib/time-studies';
import { DayScheduleClient } from './DayScheduleClient';

export const dynamic = 'force-dynamic';

/** The day schedule (scheduler build plan W2): one operating day placed on the clock. */
export default async function DaySchedulePage() {
  const [cycles, orders, actuals, calendar, library] = await Promise.all([listMenuCycles(), listOrders(), loadActuals(), loadCalendar(), listTimeStudies()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Day Schedule"
        purpose="Place one operating day on the clock and see what it breaks."
        functions={['The day placed', 'Crew load', 'Findings', 'Every block placed']}
        connects={[
          { href: '/muse/production-planning/calendar', dir: 'from' },
          { href: '/muse/production-planning/process', dir: 'from' },
          { href: '/muse/production-planning/compare', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Dispatch ships to the delivery time from components already chilled and staged.</li>
            <li>The batch stream cooks the next batches, its cooks finishing together at the blast chiller. Closedown is placed once at the close.</li>
            <li>Lanes are the Phase 1 units the work runs on. The strip below is crew demand against the people proposed.</li>
            <li>Breaks are reported, never repaired.</li>
            <li>Change the order book, the crews, a route or the policy and the day re-places.</li>
          </ul>
        }
        status="live"
      />
      <DayScheduleClient
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
