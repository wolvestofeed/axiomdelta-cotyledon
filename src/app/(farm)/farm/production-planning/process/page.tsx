import { PageHeader } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { listTimeStudies } from '@/server/time-studies';
import { ProcessClient } from '@/app/(farm)/farm/production-planning/process/ProcessClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/** The process map (scheduler build plan W3): a crop plan's route, edited step by step in the forecast. */
export default async function ProcessPage() {
  return withWorkspace(() => ProcessPageInner());
}

async function ProcessPageInner() {
  const [access, library] = await Promise.all([getFarmAccess(), listTimeStudies()]);
  return (
    <>
      <PageHeader
        title="Process"
        purpose="Follow a crop plan's route step by step, and edit any step for this forecast."
        functions={['Sowing stream', 'Harvest stream', 'The route', 'Labor standard', 'Findings']}
        connects={[
          { href: '/farm/time-studies', dir: 'from' },
          { href: '/farm/grow-units', dir: 'from' },
          { href: '/farm/production-planning/schedule', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The sowing stream sows: receiving, scaling, a prep and a sow per hot component, the blackout rack, the line turnaround.</li>
            <li>The harvest stream ships what a sowing already blackout and staged.</li>
            <li>Steps are the labor standard in precedence order. Columns are precedence depth, so steps in one column may run alongside each other. Lines are finish-to-start.</li>
            <li>Every step is derived from the crop plan&rsquo;s time study, its stage map and the Phase 1 equipment list.</li>
            <li>Every figure can be edited for this forecast, which moves the map and the Day Schedule with it.</li>
          </ul>
        }
        status="live"
      />
      <ProcessClient studies={library.studies} canEdit={access.isSuperAdmin} />
    </>
  );
}
