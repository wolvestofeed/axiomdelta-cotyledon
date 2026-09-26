import { PageHeader } from '@/components/ui';
import { listSubscriptionCycles, listOrders } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { loadCalendar } from '@/server/periods';
import { listTimeStudies } from '@/server/time-studies';
import { DayScheduleClient } from '@/app/(farm)/farm/production-planning/schedule/DayScheduleClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** The day schedule (scheduler build plan W2): one operating day placed on the clock. */
export default async function DaySchedulePage() {
  return withWorkspace(() => DaySchedulePageInner());
}

async function DaySchedulePageInner() {
  const [cycles, orders, actuals, calendar, library] = await Promise.all([listSubscriptionCycles(), listOrders(), loadActuals(), loadCalendar(), listTimeStudies()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Day Schedule"
        purpose="Place one operating day on the clock and see what it breaks."
        functions={['The day placed', 'Crew load', 'Daily stream', 'Findings', 'Every block placed']}
        connects={[
          { href: '/farm/production-planning/calendar', dir: 'from' },
          { href: '/farm/production-planning/process', dir: 'from' },
          { href: '/farm/production-planning/compare', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A sow day places the sowing stream from opening: receiving, prep and sowing, per tray of the sowings the grow units take that day.</li>
            <li>A distribution day places the harvest stream backward from the distribution time, per tray the day ships. Closedown is placed once at the close.</li>
            <li>The daily stream, the watering and inspection of every tray on the shelves, is listed beside the day with its hours and has no clock time.</li>
            <li>Lanes are the units the work runs on, with one lane for the steps that need none. The strip below is crew demand for the placed work against the people proposed.</li>
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
