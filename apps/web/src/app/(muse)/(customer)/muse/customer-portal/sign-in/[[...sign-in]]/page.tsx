import { PageHeader } from '@/app/(muse)/muse/_components/ui';
import { PortalSignIn } from '@/app/(muse)/muse/_components/PortalAuth';

export default function Page() {
  return (
    <>
      <PageHeader title="Sign in" purpose="Sign in to build orders and see your order history, invoices and payments." />
      <PortalSignIn base="/muse/customer-portal" />
    </>
  );
}
