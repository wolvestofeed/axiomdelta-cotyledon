import { PageHeader } from '@/app/(muse)/muse/_components/ui';
import { PortalSignUp } from '@/app/(muse)/muse/_components/PortalAuth';

export default function Page() {
  return (
    <>
      <PageHeader title="Create an account" purpose="Set up your account to choose your child's school meals." />
      <p className="muse-kpi-sub">We&rsquo;ll send a verification email, and our team reviews every new account.</p>
      <PortalSignUp base="/muse/parent-portal" />
    </>
  );
}
