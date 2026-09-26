import { PageHeader } from '@/components/ui';
import { listSubscriptionCycles, listOrders } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { loadCalendar } from '@/server/periods';
import { listTimeStudies } from '@/server/time-studies';
import { ScheduleClient } from '@/app/(farm)/farm/schedule/ScheduleClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** Schedule (Roadmap O3): two weeks of production staff demand on the three labor streams, and the operating day. */
export default async function SchedulePage() {
  return withWorkspace(() => SchedulePageInner());
}

async function SchedulePageInner() {
  const [cycles, orders, actuals, calendar, library] = await Promise.all([listSubscriptionCycles(), listOrders(), loadActuals(), loadCalendar(), listTimeStudies()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Schedule"
        purpose="Build two weeks of production staff demand and send it to Staffing."
        functions={['Staff demand', 'Staff-hours required', 'Busiest day', 'Staffing']}
        connects={[
          { href: '/farm/production-planning', dir: 'from' },
          { href: '/farm/time-studies', dir: 'from' },
          { href: '/dashboard', dir: 'both', label: 'Staffing' },
          { href: '/farm/production-planning/schedule', dir: 'both' },
        ]}
        howItWorks={
          <ul>
            <li>Each scheduled sowing is staffed from its labor standard: the adopted time study, or its estimated study until one is adopted.</li>
            <li>Demand is shown as people and staff-hours by task and station per day.</li>
            <li>An admin adjusts and publishes the schedule in Staffing, and the published schedule returns every two weeks.</li>
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
        sowings={actuals.sowings.map((b) => ({ sowingId: b.sowingId, cropPlanCode: b.cropPlanCode, productionDate: b.productionDate, goodUnits: b.goodUnits }))}
        distributions={actuals.distributions.map((d) => ({ id: d.id, distributedOn: d.distributedOn, units: d.units }))}
        studies={library.studies}
      />
    </>
  );
}
