import { PageHeader } from '../../_components/ui';
import { AdminOnlyNotice } from '../../_components/AdminOnly';
import { getFarmAccess } from '../../_lib/access';
import { getScenarioView } from '../../_lib/scenarios';
import { listFacilityLayouts, PLAN_DATA_KEY } from '../../_lib/facility';
import { FacilityClient } from './FacilityClient';

export const dynamic = 'force-dynamic';

/**
 * Facility (Roadmap Phase Q). Admins only: the page returns the notice before
 * it reads anything. The equipment library is the input; everything on the
 * page is derived from it, the open forecast's phasing included.
 */
export default async function FacilityPage() {
  if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice area="Facility" note="The Facility Design and Build plan, the space requirement, the conformance register and the floor layout are held for the admins." />;
  const view = await getScenarioView();
  const scenarioKey = view.id ?? PLAN_DATA_KEY;
  const layouts = await listFacilityLayouts(scenarioKey);
  return (
    <>
      <PageHeader
        title="Facility"
        purpose="Size the building the equipment list requires, by build phase."
        functions={['Design & Build plan', 'Footprints', 'Space', 'Conformance', 'Layout']}
        connects={[
          { href: '/farm/grow-units', dir: 'from' },
          { href: '/farm/sustainability/energy', dir: 'to' },
          { href: '/farm/sustainability/inputs', dir: 'to' },
          { href: '/farm/sustainability/inventory', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Everything here is derived from the equipment library&rsquo;s own rows and its build-phase split.</li>
            <li>Design &amp; Build plan holds the approved configuration and the potential rooms.</li>
            <li>Footprints holds each unit&rsquo;s plan area and clearances.</li>
            <li>Space derives the production floor, the support program and the building gross by phase.</li>
            <li>Conformance is the register the layout is drawn against, and Layout is the drawing.</li>
            <li>Normalizers are the denominators the sustainability pages divide by.</li>
          </ul>
        }
        status="live"
      />
      <FacilityClient canEdit scenarioKey={scenarioKey} scenarioLabel={view.label ?? 'Plan-data defaults'} basis={view.basis} layouts={layouts} />
    </>
  );
}
