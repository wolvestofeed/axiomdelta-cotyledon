import { PageHeader } from '@/components/ui';
import { listSubscriptionCycles, listOrders } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { loadCalendar } from '@/server/periods';
import { listTimeStudies } from '@/server/time-studies';
import { CalendarClient } from '@/app/(farm)/farm/production-planning/calendar/CalendarClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** The calendar (scheduler build plan W4): the horizon month by month. */
export default async function CalendarPage() {
  return withWorkspace(() => CalendarPageInner());
}

async function CalendarPageInner() {
  const [cycles, orders, actuals, calendar, library] = await Promise.all([listSubscriptionCycles(), listOrders(), loadActuals(), loadCalendar(), listTimeStudies()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Calendar"
        purpose="Scan the month for days that don't fit, then open one."
        functions={['Sowings', 'Sowing starts used', 'Units shipped', 'Units expired', 'Findings']}
        connects={[
          { href: '/farm/orders', dir: 'from' },
          { href: '/farm/production-planning/schedule', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The order book is rolled through production, month by month.</li>
            <li>Each day carries its sowings, trays sown, the sowing starts used of those the grow units allow, shipped against ordered, stock past shelf life and findings raised.</li>
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
        sowings={actuals.sowings.map((b) => ({ sowingId: b.sowingId, growPlanCode: b.growPlanCode, productionDate: b.productionDate, goodUnits: b.goodUnits, experimentId: b.experimentId ?? null }))}
        distributions={actuals.distributions.map((d) => ({ id: d.id, distributedOn: d.distributedOn, units: d.units }))}
        studies={library.studies}
      />
    </>
  );
}
