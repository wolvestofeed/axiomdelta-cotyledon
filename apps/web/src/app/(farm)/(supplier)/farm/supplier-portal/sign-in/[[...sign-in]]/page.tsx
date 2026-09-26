import { PageHeader } from '@/app/(farm)/farm/_components/ui';
import { SignIn } from '@/app/(farm)/farm/_components/PortalSupplierSignIn';

export default function Page() {
  return (
    <>
      <PageHeader title="Sign in" purpose="Sign in to manage your catalog with MicroFarm." />
      <p className="farm-kpi-sub">New here? You need an invitation from MicroFarm.</p>
      <SignIn />
    </>
  );
}
