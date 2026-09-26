import { PageHeader } from '../_components/ui';
import { getMuseAccess } from '../_lib/access';
import { listTimeStudies } from '../_lib/time-studies';
import { TimeStudiesClient } from './TimeStudiesClient';

export const dynamic = 'force-dynamic';

/** Time Studies (Roadmap O2): time studies for every recipe in the library. No wage or pay. */
export default async function TimeStudiesPage() {
  const [access, library] = await Promise.all([getMuseAccess(), listTimeStudies()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Time Studies"
        purpose="Time each recipe's batch tasks and adopt the one that sets its labor standard."
        functions={['Time study log', 'Trend', 'Labor hours', 'Labor cost', 'Re-study interval']}
        connects={[
          { href: '/muse/production-planning/process', dir: 'to' },
          { href: '/muse/schedule', dir: 'to' },
          { href: '/muse/production-planning/schedule', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A study times one batch&rsquo;s tasks: the station, how many people, the elapsed and labor minutes, and a quality result.</li>
            <li>Task minutes are fixed per batch or scale per portion.</li>
            <li>An admin adopts one study as the recipe&rsquo;s labor standard. Until then the estimated study stands in.</li>
            <li>Each recipe is re-studied on its own interval. The trends show how a meal&rsquo;s labor moves over time.</li>
            <li>Labor hours and cost are shown per batch and per day, never an individual&rsquo;s wage or pay.</li>
          </ul>
        }
        status="live"
      />
      <TimeStudiesClient library={library} canEdit={access.isSuperAdmin} today={today} />
    </>
  );
}
