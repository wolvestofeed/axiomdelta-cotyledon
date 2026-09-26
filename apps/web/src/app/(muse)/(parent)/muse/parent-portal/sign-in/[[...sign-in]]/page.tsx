import { PageHeader } from '@/app/(muse)/muse/_components/ui';
import { PortalSignIn } from '@/app/(muse)/muse/_components/PortalAuth';

export default function Page() {
  return (
    <>
      <PageHeader title="Sign in" purpose="Sign in to choose your child's meal plan, flag allergies and see your payments." />
      <PortalSignIn base="/muse/parent-portal" />
    </>
  );
}
