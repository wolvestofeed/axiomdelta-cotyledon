import type { Metadata } from 'next';
import { MUSE_TAB_ICONS } from '@/app/(muse)/muse/_assets/tab-icons';
import Link from 'next/link';
import '@/app/(muse)/muse/_components/muse.css';
import { getMuseAccess } from '@/app/(muse)/muse/_lib/access';
import { PortalShell } from '@/app/(muse)/muse/_components/PortalShell';

/**
 * The Supplier portal shell (Roadmap P1b, P3): suppliers, by invitation from Muse Kitchen — no open sign-up.
 * The shell itself is open so its sign-in and sign-up pages render for a signed-out visitor; the portal's
 * own pages sit in `(member)`, which requires a sign-in (Roadmap P3).
 */

export const metadata: Metadata = {
  title: 'Muse Kitchen — Supplier Portal',
  robots: { index: false, follow: false },
  icons: MUSE_TAB_ICONS,
};

const LINKS = [
  { href: '/muse/supplier-portal', label: 'Submissions' },
  { href: '/muse/supplier-portal/welcome', label: 'Accept an invitation' },
];

export default async function Layout({ children }: { children: React.ReactNode }) {
  const access = await getMuseAccess();
  const base = LINKS[0].href;
  return (
    <PortalShell portal="Supplier Portal" links={LINKS} who={access.email ?? <Link className="muse-link" href={`${base}/sign-in`}>Sign in</Link>} external>
      {children}
    </PortalShell>
  );
}
