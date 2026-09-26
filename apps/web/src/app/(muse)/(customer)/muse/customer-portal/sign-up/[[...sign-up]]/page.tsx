import { PageHeader } from '@/app/(muse)/muse/_components/ui';
import { PortalSignUp } from '@/app/(muse)/muse/_components/PortalAuth';

export default function Page() {
  return (
    <>
      <PageHeader title="Create an account" purpose="Order meals for your office, catering or special event." />
      <p className="muse-kpi-sub">We&rsquo;ll send a verification email, and our team reviews every new account before your first order.</p>
      <PortalSignUp base="/muse/customer-portal" />
    </>
  );
}
