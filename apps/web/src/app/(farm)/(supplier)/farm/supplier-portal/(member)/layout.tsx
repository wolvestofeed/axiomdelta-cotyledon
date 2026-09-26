import { redirect } from 'next/navigation';
import { getFarmAccess } from '@/app/(farm)/farm/_lib/access';
import { PortalPending } from '@/app/(farm)/farm/_components/PortalPending';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

/**
 * The Supplier Portal's own pages (Roadmap P3). Signed out: to the portal's sign-in. Signed in and not yet linked to
 * a record: under review, no data. MicroFarm staff see the portal as it will look while it is developed.
 * Linking an external account to its record is Roadmap P5.
 */
export default async function MemberLayout(props: Parameters<typeof MemberLayoutInner>[0]) {
  return withWorkspace(() => MemberLayoutInner(props));
}

async function MemberLayoutInner({ children }: { children: React.ReactNode }) {
  const access = await getFarmAccess();
  if (!access.userId) redirect('/farm/supplier-portal/sign-in');
  if (!access.isOperator) return <PortalPending portal="Supplier Portal" email={access.email} />;
  return <>{children}</>;
}
