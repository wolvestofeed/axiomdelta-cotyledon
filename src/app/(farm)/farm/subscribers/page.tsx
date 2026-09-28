import { PageHeader } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { loadActuals } from '@/server/actuals';
import { pickupPoints as seedPickupPoints } from '@/data/seed-invented';
import { SubscribersClient } from '@/app/(farm)/farm/subscribers/SubscribersClient';
import { withWorkspace } from '@/server/workspace';
import { loadCalendar } from '@/server/periods';

export const dynamic = 'force-dynamic';

export default async function SubscribersPage() {
  return withWorkspace(() => SubscribersPageInner());
}

async function SubscribersPageInner() {
  const [access, actuals, calendar] = await Promise.all([getFarmAccess(), loadActuals(), loadCalendar()]);
  const today = new Date().toISOString().slice(0, 10);

  // Actual units distributed to date, by distribution-pickup-point id and by pickup point name, so a
  // forecast can be read against what was actually served.
  const actualById: Record<string, number> = {};
  const actualByName: Record<string, number> = {};
  for (const d of actuals.distributions) {
    if (d.pickupPointId) actualById[d.pickupPointId] = (actualById[d.pickupPointId] ?? 0) + d.units;
    if (d.pickupPointName) actualByName[d.pickupPointName] = (actualByName[d.pickupPointName] ?? 0) + d.units;
  }

  return (
    <>
      <PageHeader
        title="Subscribers"
        purpose="Set who is served, where, when and on what, since all demand starts here."
        functions={['Subscriptions', 'Pickup points', 'Editing']}
        connects={[
          { href: '/farm/prospects', dir: 'from' },
          { href: '/farm/orders', dir: 'to' },
          { href: '/farm/production-planning', dir: 'to' },
          { href: '/farm/receivables', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A subscription is a subscriber&rsquo;s standing order at one pickup point: weekly, every two weeks, or monthly on the same weekday of the same week of the month, from its first distribution. Each distribution carries the flat plan in force on its date and is billed as it is handed over.</li>
            <li>A distribution is skipped only before its sow date, the earliest of its grow plans&rsquo; sow dates; a pause and a flat plan change start at the first distribution not yet sown.</li>
            <li>Demand on every other page is the subscriptions run across the calendar. Nothing is projected on its own.</li>
            <li>The subscriber record drives real operations and is edited on Actual. The open forecast keeps its own edits, which subscribers it includes and its window, and never changes the record.</li>
            <li>A flat plan offers the grow plans in service on the subscriber&rsquo;s channel; a distribution&rsquo;s price is the subscriber&rsquo;s contracted price, or the channel&rsquo;s.</li>
          </ul>
        }
        status="live"
      />
      <SubscribersClient
        canEdit={access.isSuperAdmin}
        today={today}
        distributionPickupPoints={seedPickupPoints.map((s) => ({ id: s.id, name: s.name }))}
        actualUnitsByPickupPointId={actualById}
        actualUnitsByPickupPointName={actualByName}
        closures={calendar.closures}
      />
    </>
  );
}
