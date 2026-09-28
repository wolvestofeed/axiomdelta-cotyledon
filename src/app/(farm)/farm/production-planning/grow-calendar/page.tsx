import { PageHeader } from '@/components/ui';
import { listOrders } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { loadCalendar } from '@/server/periods';
import { GrowCalendarClient } from '@/app/(farm)/farm/production-planning/grow-calendar/GrowCalendarClient';
import { withWorkspace } from '@/server/workspace';
import { experimentSowings } from '@/server/experiments';
import { listGrowPlans } from '@/server/grow-plans';

export const dynamic = 'force-dynamic';

/** The grow calendar: sowings on the grow units across their cycle days, back-planned from distribution days. */
export default async function GrowCalendarPage() {
  return withWorkspace(() => GrowCalendarPageInner());
}

async function GrowCalendarPageInner() {
  const [orders, actuals, calendar] = await Promise.all([listOrders(), loadActuals(), loadCalendar()]);
  const today = new Date().toISOString().slice(0, 10);
  const onShelves = await experimentSowings(actuals.sowings, await listGrowPlans(), today);
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
            <li>A sowing is the whole trays its orders need, one flat the least, sown on the day its cycle ends on the distribution date; it is placed on a lit unit with room on every day of its light stages, its dark days on a dark rack where one has room.</li>
            <li>Each day reads the trays on each unit by stage, what is sown, what is in its harvest window, and the waterings the daily stream owes.</li>
            <li>A sowing no unit can hold is a finding, never squeezed onto a shelf.</li>
          </ul>
        }
        status="live"
      />
      <GrowCalendarClient
        today={today}
        orders={orders}
        closures={calendar.closures}
        sowings={actuals.sowings.map((b) => ({ sowingId: b.sowingId, growPlanCode: b.growPlanCode, productionDate: b.productionDate, goodUnits: b.goodUnits, experimentId: b.experimentId ?? null }))}
        distributions={actuals.distributions.map((d) => ({ id: d.id, distributedOn: d.distributedOn, units: d.units }))}
        experimentSowings={onShelves}
      />
    </>
  );
}
