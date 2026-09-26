import { PageHeader } from '@/app/(muse)/muse/_components/ui';
import { SignIn } from '@/app/(muse)/muse/_components/PortalSupplierSignIn';

export default function Page() {
  return (
    <>
      <PageHeader title="Sign in" purpose="Sign in to manage your catalog with Muse Kitchen." />
      <p className="muse-kpi-sub">New here? You need an invitation from Muse Kitchen.</p>
      <SignIn />
    </>
  );
}
