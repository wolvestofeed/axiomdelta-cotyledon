import { PageHeader } from '@/components/ui';
import { SignIn } from '@/components/PortalSupplierSignIn';

export default function Page() {
  return (
    <>
      <PageHeader title="Sign in" purpose="Sign in to manage your catalog with MicroFarm." />
      <p className="farm-kpi-sub">New here? You need an invitation from MicroFarm.</p>
      <SignIn />
    </>
  );
}
