import type { Metadata } from 'next';
import { FARM_TAB_ICONS } from '@/app/(farm)/farm/_assets/tab-icons';
import Link from 'next/link';
import '@/app/(farm)/farm/_components/farm.css';
import { getFarmAccess } from '@/app/(farm)/farm/_lib/access';
import { PortalShell } from '@/app/(farm)/farm/_components/PortalShell';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

/**
 * The Supplier portal shell (Roadmap P1b, P3): suppliers, by invitation from MicroFarm — no open sign-up.
 * The shell itself is open so its sign-in and sign-up pages render for a signed-out visitor; the portal's
 * own pages sit in `(member)`, which requires a sign-in (Roadmap P3).
 */

export const metadata: Metadata = {
  title: 'MicroFarm — Supplier Portal',
  robots: { index: false, follow: false },
  icons: FARM_TAB_ICONS,
};

const LINKS = [
  { href: '/farm/supplier-portal', label: 'Submissions' },
  { href: '/farm/supplier-portal/welcome', label: 'Accept an invitation' },
];

export default async function Layout(props: Parameters<typeof LayoutInner>[0]) {
  return withWorkspace(() => LayoutInner(props));
}

async function LayoutInner({ children }: { children: React.ReactNode }) {
  const access = await getFarmAccess();
  const base = LINKS[0].href;
  return (
    <PortalShell portal="Supplier Portal" links={LINKS} who={access.email ?? <Link className="farm-link" href={`${base}/sign-in`}>Sign in</Link>} external>
      {children}
    </PortalShell>
  );
}
