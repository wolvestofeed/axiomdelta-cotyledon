import { PageHeader } from '../_components/ui';
import { getMuseAccess } from '../_lib/access';
import { PackagingClient } from './PackagingClient';

export const dynamic = 'force-dynamic';

export default async function PackagingPage() {
  const access = await getMuseAccess();
  return (
    <>
      <PageHeader
        title="Packaging"
        purpose="Keep the library of packages meals leave the kitchen in, with costs."
        functions={['Packaging library', 'Cost on file', 'Recipes with packages']}
        connects={[
          { href: '/muse/recipes', dir: 'to' },
          { href: '/muse/equipment', dir: 'both' },
        ]}
        howItWorks={
          <ul>
            <li>Containers, lids, labels and liners are packaging.</li>
            <li>Tray sealers, coders and vacuum packers are capital on Equipment, not packaging here.</li>
            <li>Each package carries a manual cost and a supplier-based cost.</li>
            <li>Recipes pick their packages from this library.</li>
          </ul>
        }
        status="live"
      />
      <PackagingClient canEdit={access.isSuperAdmin} />
    </>
  );
}
