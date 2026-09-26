import { redirect } from 'next/navigation';
import { getFarmAccess } from '@/app/(farm)/farm/_lib/access';
import { PortalPending } from '@/app/(farm)/farm/_components/PortalPending';

/**
 * The Subscriber Portal's own pages (Roadmap P3). Signed out: to the portal's sign-in. Signed in and not yet linked to
 * a record: under review, no data. MicroFarm staff see the portal as it will look while it is developed.
 * Linking an external account to its record is Roadmap P5.
 */
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const access = await getFarmAccess();
  if (!access.userId) redirect('/farm/subscriber-portal/sign-in');
  if (!access.isOperator) return <PortalPending portal="Subscriber Portal" email={access.email} />;
  return <>{children}</>;
}
