import type { Metadata } from 'next';
import { MUSE_TAB_ICONS } from '@/app/(muse)/muse/_assets/tab-icons';
import '@/app/(muse)/muse/_components/muse.css';
import { museFontVars } from '@/app/(muse)/muse/_components/fonts';
import { FrontDoorLandscape } from '@/app/(muse)/muse/_components/FrontDoorLandscape';

/**
 * The front door (Roadmap P7): a sibling route group to `muse/`, like the portals, so `/muse`, its sign-in and
 * the router are served without the OS sidebar and scenario bar. The page is the logo mark's landscape: the sky
 * above, three bands of soil below.
 */

export const metadata: Metadata = {
  title: 'Muse Kitchen Impact OS',
  robots: { index: false, follow: false },
  icons: MUSE_TAB_ICONS,
};

export default function FrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`muse-root muse-front ${museFontVars}`}>
      <FrontDoorLandscape />
      <main className="muse-front-main">{children}</main>
    </div>
  );
}
