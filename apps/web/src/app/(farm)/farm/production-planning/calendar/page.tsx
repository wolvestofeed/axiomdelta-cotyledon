import { PageHeader } from '../../_components/ui';
import { listSubscriptionCycles, listOrders } from '../../_lib/orders';
import { loadActuals } from '../../_lib/actuals';
import { loadCalendar } from '../../_lib/periods';
import { listTimeStudies } from '../../_lib/time-studies';
import { CalendarClient } from './CalendarClient';

export const dynamic = 'force-dynamic';

/** The calendar (scheduler build plan W4): the horizon month by month. */
export default async function CalendarPage() {
  const [cycles, orders, actuals, calendar, library] = await Promise.all([listSubscriptionCycles(), listOrders(), loadActuals(), loadCalendar(), listTimeStudies()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Calendar"
        purpose="Scan the month for days that don't fit, then open one."
        functions={['Sowings', 'Cycles used', 'Units shipped', 'Units expired', 'Findings']}
        connects={[
          { href: '/farm/orders', dir: 'from' },
          { href: '/farm/production-planning/schedule', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The order book is rolled through production, month by month.</li>
            <li>Each day carries sowings harvested, units made, cycles used, shipped against ordered, stock past shelf life and findings raised.</li>
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
        sowings={actuals.sowings.map((b) => ({ sowingId: b.sowingId, cropPlanCode: b.cropPlanCode, productionDate: b.productionDate, goodUnits: b.goodUnits }))}
        distributions={actuals.distributions.map((d) => ({ id: d.id, distributedOn: d.distributedOn, units: d.units }))}
        studies={library.studies}
      />
    </>
  );
}
