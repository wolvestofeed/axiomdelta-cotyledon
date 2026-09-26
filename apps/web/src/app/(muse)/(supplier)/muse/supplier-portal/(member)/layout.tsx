import { redirect } from 'next/navigation';
import { getMuseAccess } from '@/app/(muse)/muse/_lib/access';
import { PortalPending } from '@/app/(muse)/muse/_components/PortalPending';

/**
 * The Supplier Portal's own pages (Roadmap P3). Signed out: to the portal's sign-in. Signed in and not yet linked to
 * a record: under review, no data. Muse Kitchen staff see the portal as it will look while it is developed.
 * Linking an external account to its record is Roadmap P5.
 */
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const access = await getMuseAccess();
  if (!access.userId) redirect('/muse/supplier-portal/sign-in');
  if (!access.isOperator) return <PortalPending portal="Supplier Portal" email={access.email} />;
  return <>{children}</>;
}
