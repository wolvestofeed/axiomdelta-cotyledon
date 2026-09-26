import type { Metadata } from 'next';
import { MUSE_TAB_ICONS } from '@/app/(muse)/muse/_assets/tab-icons';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import '@/app/(muse)/muse/_components/muse.css';
import { getMuseAccess } from '@/app/(muse)/muse/_lib/access';
import { PortalShell } from '@/app/(muse)/muse/_components/PortalShell';

/**
 * The sales shell (Roadmap P1, P1b). A sibling route group to `muse/`, like the Floor, so
 * `/muse/sales-portal` is served without the OS sidebar and scenario bar — the sales
 * representative's own surface, with internal sign-in and the time clock. Sign-in is
 * enforced by `proxy.ts` for every `/muse` path; the sales role is Roadmap P2.
 */

export const metadata: Metadata = {
  title: 'Muse Kitchen Impact OS — Sales',
  robots: { index: false, follow: false },
  icons: MUSE_TAB_ICONS,
};

const LINKS = [
  { href: '/muse/sales-portal', label: 'Sales Portal' },
  { href: '/muse/sales', label: 'CRM' },
  { href: '/muse/customers', label: 'Customers' },
  { href: '/muse/orders', label: 'Orders' },
];

export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const access = await getMuseAccess();
  if (!access.userId) redirect('/sign-in');
  // Internal only (Roadmap P3): an external portal account never opens the Sales shell.
  if (!access.isOperator) {
    return (
      <PortalShell portal="Sales" links={[]} who={access.email ?? 'signed in'}>
        <div className="muse-card max-w-136!">
          <div className="muse-card-title">Sales access</div>
          <p className="muse-fs-md muse-c-soft leading-[1.5]">The Sales portal is for Muse Kitchen staff. Access is granted per named person.</p>
        </div>
      </PortalShell>
    );
  }
  return (
    <PortalShell portal="Sales" links={LINKS} who={<>{access.email ?? 'signed in'} · <Link className="muse-link" href="/muse/dashboard">Workspace</Link></>}>
      {children}
    </PortalShell>
  );
}
