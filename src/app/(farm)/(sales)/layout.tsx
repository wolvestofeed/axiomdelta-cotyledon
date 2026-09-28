import type { Metadata } from 'next';
import { FARM_TAB_ICONS } from '@/assets/tab-icons';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import '@/components/farm.css';
import { getFarmAccess } from '@/server/access';
import { PortalShell } from '@/components/PortalShell';
import { withWorkspace } from '@/server/workspace';

/**
 * The sales shell (Roadmap P1, P1b). A sibling route group to `farm/`, like the Grow Room, so
 * `/farm/sales-portal` is served without the OS sidebar and scenario bar — the sales
 * representative's own surface, with internal sign-in and the time clock. Sign-in is
 * enforced by `proxy.ts` for every `/farm` path; the sales role is Roadmap P2.
 */

export const metadata: Metadata = {
  title: 'Cotyledon — Sales',
  robots: { index: false, follow: false },
  icons: FARM_TAB_ICONS,
};

const LINKS = [
  { href: '/farm/sales-portal', label: 'Sales Portal' },
  { href: '/farm/prospects', label: 'CRM' },
  { href: '/farm/subscribers', label: 'Subscribers' },
  { href: '/farm/orders', label: 'Orders' },
];

export default async function SalesLayout(props: Parameters<typeof SalesLayoutInner>[0]) {
  return withWorkspace(() => SalesLayoutInner(props));
}

async function SalesLayoutInner({ children }: { children: React.ReactNode }) {
  const access = await getFarmAccess();
  if (!access.userId) redirect('/sign-in');
  // Internal only (Roadmap P3): an external portal account never opens the Sales shell.
  if (!access.isOperator) {
    return (
      <PortalShell portal="Sales" links={[]} who={access.email ?? 'signed in'}>
        <div className="farm-card max-w-136!">
          <div className="farm-card-title">Sales access</div>
          <p className="farm-fs-md farm-c-soft leading-[1.5]">The Sales portal is for the farm&rsquo;s staff. Access is granted per named person.</p>
        </div>
      </PortalShell>
    );
  }
  return (
    <PortalShell portal="Sales" links={LINKS} who={<>{access.email ?? 'signed in'} · <Link className="farm-link" href="/farm/dashboard">Workspace</Link></>}>
      {children}
    </PortalShell>
  );
}
