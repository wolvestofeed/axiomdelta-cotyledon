import { PageHeader } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { listTimeStudies } from '@/server/time-studies';
import { ProcessClient } from '@/app/(farm)/farm/production-planning/process/ProcessClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** The process map (scheduler build plan W3): a grow plan's route, edited step by step in the forecast. */
export default async function ProcessPage() {
  return withWorkspace(() => ProcessPageInner());
}

async function ProcessPageInner() {
  const [access, library] = await Promise.all([getFarmAccess(), listTimeStudies()]);
  return (
    <>
      <PageHeader
        title="Process"
        purpose="Follow a grow plan's route and stage schedule step by step, and edit any step for this forecast."
        functions={['Sowing stream', 'Stage schedule', 'Daily stream', 'Harvest stream', 'The route']}
        connects={[
          { href: '/farm/time-studies', dir: 'from' },
          { href: '/farm/grow-units', dir: 'from' },
          { href: '/farm/production-planning/schedule', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The sowing stream is the sow day: receiving, seed sorting, prep and the sow, per tray sown.</li>
            <li>The stage schedule is the cycle the sowing runs on its grow unit, day by day from the sow date. The daily stream beside it is the watering and inspection every tray on the shelves takes each day.</li>
            <li>The harvest stream is the distribution day: the harvest station, the pack and the clean, per tray shipped.</li>
            <li>Steps are the labor standard in precedence order. Columns are precedence depth, so steps in one column may run alongside each other. Lines are finish-to-start.</li>
            <li>Every step is derived from the plan&rsquo;s time study and the grow units.</li>
            <li>Every figure can be edited for this forecast, which moves the map and the Day Schedule with it.</li>
          </ul>
        }
        status="live"
      />
      <ProcessClient studies={library.studies} canEdit={access.isSuperAdmin} />
    </>
  );
}
