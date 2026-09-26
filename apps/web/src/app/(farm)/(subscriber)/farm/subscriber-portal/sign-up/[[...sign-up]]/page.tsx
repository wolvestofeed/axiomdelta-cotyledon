import { PageHeader } from '@/app/(farm)/farm/_components/ui';
import { PortalSignUp } from '@/app/(farm)/farm/_components/PortalAuth';

export default function Page() {
  return (
    <>
      <PageHeader title="Create an account" purpose="Order units for your office, restaurant or special event." />
      <p className="farm-kpi-sub">We&rsquo;ll send a verification email, and our team reviews every new account before your first order.</p>
      <PortalSignUp base="/farm/subscriber-portal" />
    </>
  );
}
