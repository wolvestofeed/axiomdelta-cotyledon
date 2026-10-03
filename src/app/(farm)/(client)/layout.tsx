import type { Metadata } from 'next';
import { FARM_TAB_ICONS } from '@/assets/tab-icons';
import Link from 'next/link';
import '@/components/farm.css';
import { getFarmAccess } from '@/server/access';
import { PortalShell } from '@/components/PortalShell';
import { withWorkspace } from '@/server/workspace';

/** Every page under this layout reads the workspace at request time; nothing here is prerendered at build. */
export const dynamic = 'force-dynamic';

/**
 * The Client Portal shell (Roadmap P1b, P3): the farm's clients, with open sign-up. Its pages: orders and invoices,
 * the Flat Builder, Subscriptions, Profile, Settings, why hemp mats, and the glossary.
 * The shell itself is open so its sign-in and sign-up pages render for a signed-out visitor; the portal's
 * own pages sit in `(member)`, which requires a sign-in (Roadmap P3).
 */

export const metadata: Metadata = {
  title: 'Cotyledon — Client Portal',
  robots: { index: false, follow: false },
  icons: FARM_TAB_ICONS,
};

const LINKS = [
  { href: '/farm/client-portal', label: 'Orders and invoices' },
  { href: '/farm/client-portal/flat-builder', label: 'Flat Builder' },
  { href: '/farm/client-portal/subscriptions', label: 'Subscriptions' },
  { href: '/farm/client-portal/profile', label: 'Profile' },
  { href: '/farm/client-portal/settings', label: 'Settings' },
  { href: '/farm/client-portal/hemp-mats', label: 'Why hemp mats' },
  { href: '/farm/client-portal/glossary', label: 'Glossary' },
  { href: '/farm/client-portal/sign-up', label: 'Create an account' },
];

export default async function Layout(props: Parameters<typeof LayoutInner>[0]) {
  return withWorkspace(() => LayoutInner(props));
}

async function LayoutInner({ children }: { children: React.ReactNode }) {
  const access = await getFarmAccess();
  const base = LINKS[0].href;
  return (
    <PortalShell portal="Client Portal" links={LINKS} who={access.email ?? <Link className="farm-link" href={`${base}/sign-in`}>Sign in</Link>} external>
      {children}
    </PortalShell>
  );
}
