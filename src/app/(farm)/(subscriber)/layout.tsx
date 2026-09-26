import type { Metadata } from 'next';
import { FARM_TAB_ICONS } from '@/assets/tab-icons';
import Link from 'next/link';
import '@/components/farm.css';
import { getFarmAccess } from '@/server/access';
import { PortalShell } from '@/components/PortalShell';
import { withWorkspace } from '@/server/workspace';

/**
 * The Subscriber portal shell (Roadmap P1b, P3): corporate, restaurant and special-events clients, with open sign-up.
 * The shell itself is open so its sign-in and sign-up pages render for a signed-out visitor; the portal's
 * own pages sit in `(member)`, which requires a sign-in (Roadmap P3).
 */

export const metadata: Metadata = {
  title: 'MicroFarm — Subscriber Portal',
  robots: { index: false, follow: false },
  icons: FARM_TAB_ICONS,
};

const LINKS = [
  { href: '/farm/subscriber-portal', label: 'Orders and invoices' },
  { href: '/farm/subscriber-portal/flat-builder', label: 'Flat Builder' },
  { href: '/farm/subscriber-portal/sign-up', label: 'Create an account' },
];

export default async function Layout(props: Parameters<typeof LayoutInner>[0]) {
  return withWorkspace(() => LayoutInner(props));
}

async function LayoutInner({ children }: { children: React.ReactNode }) {
  const access = await getFarmAccess();
  const base = LINKS[0].href;
  return (
    <PortalShell portal="Subscriber Portal" links={LINKS} who={access.email ?? <Link className="farm-link" href={`${base}/sign-in`}>Sign in</Link>} external>
      {children}
    </PortalShell>
  );
}
