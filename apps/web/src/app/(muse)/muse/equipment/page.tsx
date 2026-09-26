import { PageHeader } from '../_components/ui';
import { getMuseAccess } from '../_lib/access';
import { EquipmentClient } from './EquipmentClient';

export const dynamic = 'force-dynamic';

export default async function EquipmentPage() {
  const access = await getMuseAccess();
  return (
    <>
      <PageHeader
        title="Equipment"
        purpose="Keep the master list of every unit in service, planned or considered."
        functions={['Equipment library', 'In service', 'Phase 1', 'Phase 2', 'Phase 3']}
        connects={[
          { href: '/muse/financials/capital', dir: 'to' },
          { href: '/muse/capacity', dir: 'to' },
          { href: '/muse/sustainability/facility', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Quantity, unit cost, status and service date are entered here. Capital, depreciation and financing on Capital &amp; Financing read from it.</li>
            <li>In-service and planned rows count toward capital and financing. No and &ndash; rows do not.</li>
            <li>Only Phase 1 units set capacity. Vessel sizes are estimates until stated.</li>
            <li>A blank service date means TBD.</li>
          </ul>
        }
        status="live"
      />
      <EquipmentClient canEdit={access.isSuperAdmin} />
    </>
  );
}
