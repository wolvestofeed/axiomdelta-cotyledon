import { PageHeader } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { PackagingClient } from '@/app/(farm)/farm/packaging/PackagingClient';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

export default async function PackagingPage() {
  return withWorkspace(() => PackagingPageInner());
}

async function PackagingPageInner() {
  const access = await getFarmAccess();
  return (
    <>
      <PageHeader
        title="Packaging"
        purpose="Keep the library of packages units leave the farm in, with costs."
        functions={['Packaging library', 'Cost on file', 'Crop plans with packages']}
        connects={[
          { href: '/farm/crop-plans', dir: 'to' },
          { href: '/farm/grow-units', dir: 'both' },
        ]}
        howItWorks={
          <ul>
            <li>Containers, lids, labels and liners are packaging.</li>
            <li>Tray sealers, coders and vacuum packers are capital on Equipment, not packaging here.</li>
            <li>Each package carries a manual cost and a supplier-based cost.</li>
            <li>Crop plans pick their packages from this library.</li>
          </ul>
        }
        status="live"
      />
      <PackagingClient canEdit={access.isSuperAdmin} />
    </>
  );
}
