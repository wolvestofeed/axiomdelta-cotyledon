import type { Metadata } from 'next';
import { FARM_TAB_ICONS } from '@/app/(farm)/farm/_assets/tab-icons';
import '@/app/(farm)/farm/_components/farm.css';
import { farmFontVars } from '@/app/(farm)/farm/_components/fonts';
import { FrontDoorLandscape } from '@/app/(farm)/farm/_components/FrontDoorLandscape';

/**
 * The front door (Roadmap P7): a sibling route group to `farm/`, like the portals, so `/farm`, its sign-in and
 * the router are served without the OS sidebar and scenario bar. The page is the logo mark's landscape: the sky
 * above, three bands of soil below.
 */

export const metadata: Metadata = {
  title: 'MicroFarm',
  robots: { index: false, follow: false },
  icons: FARM_TAB_ICONS,
};

export default function FrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`farm-root farm-front ${farmFontVars}`}>
      <FrontDoorLandscape />
      <main className="farm-front-main">{children}</main>
    </div>
  );
}
