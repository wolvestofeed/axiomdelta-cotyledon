import type { Metadata } from 'next';
import { MUSE_TAB_ICONS } from '@/app/(muse)/muse/_assets/tab-icons';
import Link from 'next/link';
import '@/app/(muse)/muse/_components/muse.css';
import { getMuseAccess } from '@/app/(muse)/muse/_lib/access';
import { PortalShell } from '@/app/(muse)/muse/_components/PortalShell';

/**
 * The Parent portal shell (Roadmap P1b, P3): parents, with open sign-up.
 * The shell itself is open so its sign-in and sign-up pages render for a signed-out visitor; the portal's
 * own pages sit in `(member)`, which requires a sign-in (Roadmap P3).
 */

export const metadata: Metadata = {
  title: 'Muse Kitchen — Parent Portal',
  robots: { index: false, follow: false },
  icons: MUSE_TAB_ICONS,
};

const LINKS = [
  { href: '/muse/parent-portal', label: 'Meal plans' },
  { href: '/muse/parent-portal/sign-up', label: 'Create an account' },
];

export default async function Layout({ children }: { children: React.ReactNode }) {
  const access = await getMuseAccess();
  const base = LINKS[0].href;
  return (
    <PortalShell portal="Parent Portal" links={LINKS} who={access.email ?? <Link className="muse-link" href={`${base}/sign-in`}>Sign in</Link>} external>
      {children}
    </PortalShell>
  );
}
