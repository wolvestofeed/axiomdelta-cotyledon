import { PageHeader } from '../_components/ui';
import { getFarmAccess } from '../_lib/access';
import { EquipmentClient } from './EquipmentClient';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

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
        purpose="Keep the master list of every unit in service, planned or considered."
        functions={['Equipment library', 'In service', 'Phase 1', 'Phase 2', 'Phase 3']}
        connects={[
          { href: '/farm/financials/capital', dir: 'to' },
          { href: '/farm/capacity', dir: 'to' },
          { href: '/farm/sustainability/facility', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Quantity, unit cost, status and service date are entered here. Capital, depreciation and financing on Capital &amp; Financing read from it.</li>
            <li>In-service and planned rows count toward capital and financing. No and &ndash; rows do not.</li>
            <li>Only Phase 1 units set capacity. Grow unit sizes are estimates until stated.</li>
            <li>A blank service date means TBD.</li>
          </ul>
        }
        status="live"
      />
      <EquipmentClient canEdit={access.isSuperAdmin} />
    </>
  );
}
