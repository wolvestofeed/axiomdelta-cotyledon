import type { Metadata } from 'next';
import { FARM_TAB_ICONS } from '@/app/(farm)/farm/_assets/tab-icons';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import '@/app/(farm)/farm/_components/farm.css';
import { getFarmAccess } from '@/app/(farm)/farm/_lib/access';
import { PortalShell } from '@/app/(farm)/farm/_components/PortalShell';

/**
 * The sales shell (Roadmap P1, P1b). A sibling route group to `farm/`, like the Grow Room, so
 * `/farm/sales-portal` is served without the OS sidebar and scenario bar — the sales
 * representative's own surface, with internal sign-in and the time clock. Sign-in is
 * enforced by `proxy.ts` for every `/farm` path; the sales role is Roadmap P2.
 */

export const metadata: Metadata = {
  title: 'MicroFarm — Sales',
  robots: { index: false, follow: false },
  icons: FARM_TAB_ICONS,
};

const LINKS = [
  { href: '/farm/sales-portal', label: 'Sales Portal' },
  { href: '/farm/prospects', label: 'CRM' },
  { href: '/farm/subscribers', label: 'Subscribers' },
  { href: '/farm/orders', label: 'Orders' },
];

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const access = await getFarmAccess();
  if (!access.userId) redirect('/sign-in');
  // Internal only (Roadmap P3): an external portal account never opens the Sales shell.
  if (!access.isOperator) {
    return (
      <PortalShell portal="Sales" links={[]} who={access.email ?? 'signed in'}>
        <div className="farm-card max-w-136!">
          <div className="farm-card-title">Sales access</div>
          <p className="farm-fs-md farm-c-soft leading-[1.5]">The Sales portal is for MicroFarm staff. Access is granted per named person.</p>
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
