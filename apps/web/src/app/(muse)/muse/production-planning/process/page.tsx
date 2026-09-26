import { PageHeader } from '../../_components/ui';
import { getMuseAccess } from '../../_lib/access';
import { listTimeStudies } from '../../_lib/time-studies';
import { ProcessClient } from './ProcessClient';

export const dynamic = 'force-dynamic';

/** The process map (scheduler build plan W3): a recipe's route, edited step by step in the forecast. */
export default async function ProcessPage() {
  const [access, library] = await Promise.all([getMuseAccess(), listTimeStudies()]);
  return (
    <>
      <PageHeader
        title="Process"
        purpose="Follow a recipe's route step by step, and edit any step for this forecast."
        functions={['Batch stream', 'Dispatch stream', 'The route', 'Labor standard', 'Findings']}
        connects={[
          { href: '/muse/time-studies', dir: 'from' },
          { href: '/muse/equipment', dir: 'from' },
          { href: '/muse/production-planning/schedule', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The batch stream cooks: receiving, scaling, a prep and a cook per hot component, the blast chiller, the line turnaround.</li>
            <li>The dispatch stream ships what a batch already chilled and staged.</li>
            <li>Steps are the labor standard in precedence order. Columns are precedence depth, so steps in one column may run alongside each other. Lines are finish-to-start.</li>
            <li>Every step is derived from the recipe&rsquo;s time study, its thermal map and the Phase 1 equipment list.</li>
            <li>Every figure can be edited for this forecast, which moves the map and the Day Schedule with it.</li>
          </ul>
        }
        status="live"
      />
      <ProcessClient studies={library.studies} canEdit={access.isSuperAdmin} />
    </>
  );
}
