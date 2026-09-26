import type { Metadata } from 'next';
import { MUSE_TAB_ICONS } from '@/app/(muse)/muse/_assets/tab-icons';
import Link from 'next/link';
import '@/app/(muse)/muse/_components/muse.css';
import { getMuseAccess } from '@/app/(muse)/muse/_lib/access';
import { PortalShell } from '@/app/(muse)/muse/_components/PortalShell';

/**
 * The Customer portal shell (Roadmap P1b, P3): corporate, catering and special-events clients, with open sign-up.
 * The shell itself is open so its sign-in and sign-up pages render for a signed-out visitor; the portal's
 * own pages sit in `(member)`, which requires a sign-in (Roadmap P3).
 */

export const metadata: Metadata = {
  title: 'Muse Kitchen — Customer Portal',
  robots: { index: false, follow: false },
  icons: MUSE_TAB_ICONS,
};

const LINKS = [
  { href: '/muse/customer-portal', label: 'Orders and invoices' },
  { href: '/muse/customer-portal/order-builder', label: 'Order Builder' },
  { href: '/muse/customer-portal/sign-up', label: 'Create an account' },
];

export default async function Layout({ children }: { children: React.ReactNode }) {
  const access = await getMuseAccess();
  const base = LINKS[0].href;
  return (
    <PortalShell portal="Customer Portal" links={LINKS} who={access.email ?? <Link className="muse-link" href={`${base}/sign-in`}>Sign in</Link>} external>
      {children}
    </PortalShell>
  );
}
