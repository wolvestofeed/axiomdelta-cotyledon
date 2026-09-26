import { PageHeader } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { SetupClient } from '@/app/(farm)/farm/grow-units/SetupClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

export default async function EquipmentPage() {
  return withWorkspace(() => EquipmentPageInner());
}

async function EquipmentPageInner() {
  const access = await getFarmAccess();
  return (
    <>
      <PageHeader
        title="Equipment"
        purpose="Set up the home grow room or a rented commercial facility: equipment, costs, build-out and loans."
        functions={['Home', 'Commercial', 'Grow racks', 'Equipment library', 'Fixed costs']}
        connects={[
          { href: '/farm/financials/capital', dir: 'to' },
          { href: '/farm/capacity', dir: 'to' },
          { href: '/farm/sustainability/facility', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Home is the grow room: the racks, the home equipment and the home running costs.</li>
            <li>Commercial is a rented facility: floor area, equipment, build-out, loans, rent, utilities and business costs. Nothing on it counts until a forecast fills it in.</li>
            <li>In-service and planned rows count toward capital and financing. No and &ndash; rows do not. A blank service date means TBD.</li>
            <li>Only Phase 1 units set capacity.</li>
          </ul>
        }
        status="live"
      />
      <SetupClient canEdit={access.isSuperAdmin} />
    </>
  );
}
