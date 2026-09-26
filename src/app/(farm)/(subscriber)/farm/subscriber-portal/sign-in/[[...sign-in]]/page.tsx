import { PageHeader } from '@/components/ui';
import { PortalSignIn } from '@/components/PortalAuth';

export default function Page() {
  return (
    <>
      <PageHeader title="Sign in" purpose="Sign in to build orders and see your order history, invoices and payments." />
      <PortalSignIn base="/farm/subscriber-portal" />
    </>
  );
}
