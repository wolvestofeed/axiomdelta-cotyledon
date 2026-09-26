import { PageHeader } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { listTimeStudies } from '@/server/time-studies';
import { TimeStudiesClient } from '@/app/(farm)/farm/time-studies/TimeStudiesClient';
import { withWorkspace } from '@/server/workspace';

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
        purpose="Time each grow plan's tasks and what its sowing consumes, and approve each study into its standard."
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
            <li>An admin approves each observed study. The plan&rsquo;s labor standard, and its water and supplements per tray, are the average of its approved studies weighted by the trays each timed; until the first approval the estimated study stands in.</li>
            <li>A study records the water applied each day by method (fluid ounces per tray per watering, the waterings, the trays) and the supplements applied from the Nutrients &amp; Supplements library. The measured figures are on Actuals.</li>
            <li>Approving a study approves a standard version effective that day: sowings from then are costed at the new average; trays already sown keep the standard they were sown at, and the difference is a variance.</li>
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
