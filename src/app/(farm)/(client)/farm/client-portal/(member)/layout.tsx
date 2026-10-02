import { redirect } from 'next/navigation';
import { getFarmAccess } from '@/server/access';
import { PortalPending } from '@/components/PortalPending';
import { canUsePortal } from '@/server/client-portal';
import { withWorkspace } from '@/server/workspace';

/**
 * The Client Portal's own pages (Roadmap P3, P5). Signed out: to the portal's sign-in. Signed in and linked to a
 * subscriber record: the client's own pages. Signed in and on no list: under review, no data. The farm's
 * staff read the portal as a client will see it.
 */
export default async function MemberLayout(props: Parameters<typeof MemberLayoutInner>[0]) {
  return withWorkspace(() => MemberLayoutInner(props));
}

async function MemberLayoutInner({ children }: { children: React.ReactNode }) {
  const access = await getFarmAccess();
  if (!access.userId) redirect('/farm/client-portal/sign-in');
  if (!canUsePortal(access)) return <PortalPending portal="Client Portal" email={access.email} />;
  return <>{children}</>;
}
