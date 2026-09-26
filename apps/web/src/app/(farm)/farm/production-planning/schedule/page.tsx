import { PageHeader } from '../../_components/ui';
import { listSubscriptionCycles, listOrders } from '../../_lib/orders';
import { loadActuals } from '../../_lib/actuals';
import { loadCalendar } from '../../_lib/periods';
import { listTimeStudies } from '../../_lib/time-studies';
import { DayScheduleClient } from './DayScheduleClient';

export const dynamic = 'force-dynamic';

/** The day schedule (scheduler build plan W2): one operating day placed on the clock. */
export default async function DaySchedulePage() {
  const [cycles, orders, actuals, calendar, library] = await Promise.all([listSubscriptionCycles(), listOrders(), loadActuals(), loadCalendar(), listTimeStudies()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Day Schedule"
        purpose="Place one operating day on the clock and see what it breaks."
        functions={['The day placed', 'Crew load', 'Findings', 'Every block placed']}
        connects={[
          { href: '/farm/production-planning/calendar', dir: 'from' },
          { href: '/farm/production-planning/process', dir: 'from' },
          { href: '/farm/production-planning/compare', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Harvest ships to the distribution time from components already blackout and staged.</li>
            <li>The sowing stream sows the next sowings, its sows finishing together at the blackout rack. Closedown is placed once at the close.</li>
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
        sowings={actuals.sowings.map((b) => ({ sowingId: b.sowingId, cropPlanCode: b.cropPlanCode, productionDate: b.productionDate, goodUnits: b.goodUnits }))}
        distributions={actuals.distributions.map((d) => ({ id: d.id, distributedOn: d.distributedOn, units: d.units }))}
        studies={library.studies}
      />
    </>
  );
}
