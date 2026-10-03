import type { Metadata } from 'next';
import { FARM_TAB_ICONS } from '@/assets/tab-icons';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import logo from '@/assets/cotyledon-header.png';
import '@/components/farm.css';
import { farmFontVars } from '@/components/fonts';
import { getFarmAccess } from '@/server/access';
import { BRAND_LINE } from '@/components/ui';
import { withWorkspace } from '@/server/workspace';

/** Every page under this layout reads the workspace at request time; nothing here is prerendered at build. */
export const dynamic = 'force-dynamic';

/**
 * The floor shell (Roadmap I5). A sibling route group to `farm/`, so
 * `/farm/grow-room` is served without the OS sidebar and scenario bar — a
 * full-screen recording surface. Sign-in is enforced by `proxy.ts` for every
 * `/farm` path; this layout gates on the operator role, which every admin holds
 * (Roadmap O5), and links back to the workspace.
 */

export const metadata: Metadata = {
  title: 'Cotyledon — Grow Room',
  robots: { index: false, follow: false },
  icons: FARM_TAB_ICONS,
};

export default async function FloorLayout(props: Parameters<typeof FloorLayoutInner>[0]) {
  return withWorkspace(() => FloorLayoutInner(props));
}

async function FloorLayoutInner({ children }: { children: React.ReactNode }) {
  const access = await getFarmAccess();

  if (!access.userId) redirect('/sign-in');

  if (!access.isOperator) {
    return (
      <div className={`farm-root ${farmFontVars}`}>
        <div className="max-w-136 my-[12vh]! mx-auto! py-0 px-6">
          <div className="farm-brand-name farm-c-ink">
            Cotyledon
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
          <span className="farm-floor-brand">
            <Image src={logo} alt="Cotyledon, powered by Ember OS" className="farm-floor-logo" priority sizes="10rem" />
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
