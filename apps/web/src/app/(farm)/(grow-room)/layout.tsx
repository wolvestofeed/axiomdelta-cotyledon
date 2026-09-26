import type { Metadata } from 'next';
import { FARM_TAB_ICONS } from '@/app/(farm)/farm/_assets/tab-icons';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import logo from '@/app/(farm)/farm/_assets/farm-icon-512.png';
import '@/app/(farm)/farm/_components/farm.css';
import { farmFontVars } from '@/app/(farm)/farm/_components/fonts';
import { getFarmAccess } from '@/app/(farm)/farm/_lib/access';
import { BRAND_LINE } from '@/app/(farm)/farm/_components/ui';

/**
 * The floor shell (Roadmap I5). A sibling route group to `farm/`, so
 * `/farm/grow-room` is served without the OS sidebar and scenario bar — a
 * full-screen recording surface. Sign-in is enforced by `proxy.ts` for every
 * `/farm` path; this layout gates on the operator role, which every admin holds
 * (Roadmap O5), and links back to the workspace.
 */

export const metadata: Metadata = {
  title: 'MicroFarm — Grow Room',
  robots: { index: false, follow: false },
  icons: FARM_TAB_ICONS,
};

export default async function FloorLayout({ children }: { children: React.ReactNode }) {
  const access = await getFarmAccess();

  if (!access.userId) redirect('/sign-in');

  if (!access.isOperator) {
    return (
      <div className={`farm-root ${farmFontVars}`}>
        <div className="max-w-136 my-[12vh]! mx-auto! py-0 px-6">
          <div className="farm-brand-name farm-c-ink">
            MicroFarm
          </div>
          <div className="farm-card mt-5!">
            <div className="farm-card-title">Floor access</div>
            <p className="farm-fs-md farm-c-soft leading-[1.5]">
              Your account{access.email ? ` (${access.email})` : ''} is signed in but does not hold the
              operator role. Access is granted per named person.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`farm-root ${farmFontVars}`}>
      <div className="farm-floor-shell farm-floor">
        <div className="farm-floor-top">
          <span className="farm-floor-brand" aria-label="MicroFarm">
            <Image src={logo} alt="" className="farm-brand-icon" priority sizes="4rem" />
            <span>
              <span className="farm-brand-wordmark">MicroFarm</span>
              <span className="farm-brand-tagline">MicroFarm</span>
            </span>
          </span>
          <span className="farm-brand-sub">Grow Room</span>
          <span className="farm-kpi-sub ml-auto!">
            {access.email ?? 'operator'}
            {' '}· <Link className="farm-link" href="/farm/dashboard">Workspace</Link>
          </span>
        </div>
        <div className="farm-floor-content">{children}</div>
        <footer className="farm-footer">{BRAND_LINE}</footer>
      </div>
    </div>
  );
}
