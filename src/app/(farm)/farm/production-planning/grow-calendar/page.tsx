import { PageHeader } from '@/components/ui';
import { listSubscriptionCycles, listOrders } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { loadCalendar } from '@/server/periods';
import { GrowCalendarClient } from '@/app/(farm)/farm/production-planning/grow-calendar/GrowCalendarClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** The grow calendar: sowings on the grow units across their cycle days, back-planned from distribution days. */
export default async function GrowCalendarPage() {
  return withWorkspace(() => GrowCalendarPageInner());
}

async function GrowCalendarPageInner() {
  const [cycles, orders, actuals, calendar] = await Promise.all([listSubscriptionCycles(), listOrders(), loadActuals(), loadCalendar()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Grow Calendar"
        purpose="See what is on the shelves each day and where a sowing has no room."
        functions={['Trays on shelf', 'Sowings', 'Harvest windows', 'Waterings', 'Grow units']}
        connects={[
          { href: '/farm/orders', dir: 'from' },
          { href: '/farm/production-planning', dir: 'from' },
          { href: '/farm/schedule', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Each order is back-planned to a sow date: the distribution date less the plan&rsquo;s days to harvest, on a production day inside the harvest window.</li>
            <li>A sowing is what one grow unit takes in trays of the plan&rsquo;s format, placed on a unit whose fixture delivers the plan&rsquo;s light line and which has room on every day of the cycle.</li>
            <li>Each day reads the trays on each unit by stage, what is sown, what is in its harvest window, and the waterings the daily stream owes.</li>
            <li>A sowing no unit can hold is a finding, never squeezed onto a shelf.</li>
          </ul>
        }
        status="live"
      />
      <GrowCalendarClient
        today={today}
        cycles={cycles}
        orders={orders}
        closures={calendar.closures}
        sowings={actuals.sowings.map((b) => ({ sowingId: b.sowingId, cropPlanCode: b.cropPlanCode, productionDate: b.productionDate, goodUnits: b.goodUnits }))}
        distributions={actuals.distributions.map((d) => ({ id: d.id, distributedOn: d.distributedOn, units: d.units }))}
      />
    </>
  );
}
