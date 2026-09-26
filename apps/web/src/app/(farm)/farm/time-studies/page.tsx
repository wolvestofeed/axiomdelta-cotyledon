import { PageHeader } from '../_components/ui';
import { getFarmAccess } from '../_lib/access';
import { listTimeStudies } from '../_lib/time-studies';
import { TimeStudiesClient } from './TimeStudiesClient';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

export const dynamic = 'force-dynamic';

/** Time Studies (Roadmap O2): time studies for every crop plan in the library. No wage or pay. */
export default async function TimeStudiesPage() {
  return withWorkspace(() => TimeStudiesPageInner());
}

async function TimeStudiesPageInner() {
  const [access, library] = await Promise.all([getFarmAccess(), listTimeStudies()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Time Studies"
        purpose="Time each crop plan's sowing tasks and adopt the one that sets its labor standard."
        functions={['Time study log', 'Trend', 'Labor hours', 'Labor cost', 'Re-study interval']}
        connects={[
          { href: '/farm/production-planning/process', dir: 'to' },
          { href: '/farm/schedule', dir: 'to' },
          { href: '/farm/production-planning/schedule', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A study times one sowing&rsquo;s tasks: the station, how many people, the elapsed and labor minutes, and a quality result.</li>
            <li>Task minutes are fixed per sowing or scale per unit.</li>
            <li>An admin adopts one study as the crop plan&rsquo;s labor standard. Until then the estimated study stands in.</li>
            <li>Each crop plan is re-studied on its own interval. The trends show how a unit&rsquo;s labor moves over time.</li>
            <li>Labor hours and cost are shown per sowing and per day, never an individual&rsquo;s wage or pay.</li>
          </ul>
        }
        status="live"
      />
      <TimeStudiesClient library={library} canEdit={access.isSuperAdmin} today={today} />
    </>
  );
}
