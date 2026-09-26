import type { Metadata } from 'next';
import { MUSE_TAB_ICONS } from '@/app/(muse)/muse/_assets/tab-icons';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import logo from '@/app/(muse)/muse/_assets/muse-kitchen-icon-512.png';
import '@/app/(muse)/muse/_components/muse.css';
import { museFontVars } from '@/app/(muse)/muse/_components/fonts';
import { getMuseAccess } from '@/app/(muse)/muse/_lib/access';
import { BRAND_LINE } from '@/app/(muse)/muse/_components/ui';

/**
 * The floor shell (Roadmap I5). A sibling route group to `muse/`, so
 * `/muse/floor` is served without the OS sidebar and scenario bar — a
 * full-screen recording surface. Sign-in is enforced by `proxy.ts` for every
 * `/muse` path; this layout gates on the operator role, which every admin holds
 * (Roadmap O5), and links back to the workspace.
 */

export const metadata: Metadata = {
  title: 'Muse Kitchen Impact OS — Floor',
  robots: { index: false, follow: false },
  icons: MUSE_TAB_ICONS,
};

export default async function FloorLayout({ children }: { children: React.ReactNode }) {
  const access = await getMuseAccess();

  if (!access.userId) redirect('/sign-in');

  if (!access.isOperator) {
    return (
      <div className={`muse-root ${museFontVars}`}>
        <div className="max-w-136 my-[12vh]! mx-auto! py-0 px-6">
          <div className="muse-brand-name muse-c-ink">
            Muse Kitchen Impact OS
          </div>
          <div className="muse-card mt-5!">
            <div className="muse-card-title">Floor access</div>
            <p className="muse-fs-md muse-c-soft leading-[1.5]">
              Your account{access.email ? ` (${access.email})` : ''} is signed in but does not hold the
              operator role. Access is granted per named person.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`muse-root ${museFontVars}`}>
      <div className="muse-floor-shell muse-floor">
        <div className="muse-floor-top">
          <span className="muse-floor-brand" aria-label="Muse Kitchen Impact OS">
            <Image src={logo} alt="" className="muse-brand-icon" priority sizes="4rem" />
            <span>
              <span className="muse-brand-wordmark">Muse Kitchen</span>
              <span className="muse-brand-tagline">Impact OS</span>
            </span>
          </span>
          <span className="muse-brand-sub">Floor</span>
          <span className="muse-kpi-sub ml-auto!">
            {access.email ?? 'operator'}
            {' '}· <Link className="muse-link" href="/muse/dashboard">Workspace</Link>
          </span>
        </div>
        <div className="muse-floor-content">{children}</div>
        <footer className="muse-footer">{BRAND_LINE}</footer>
      </div>
    </div>
  );
}
