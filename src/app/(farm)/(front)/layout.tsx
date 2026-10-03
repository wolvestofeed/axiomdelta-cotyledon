import type { Metadata } from 'next';
import { FARM_TAB_ICONS } from '@/assets/tab-icons';
import '@/components/farm.css';
import { farmFontVars } from '@/components/fonts';
import { FrontDoorLandscape } from '@/components/FrontDoorLandscape';

/** Every page under this layout reads the workspace at request time; nothing here is prerendered at build. */
export const dynamic = 'force-dynamic';

/**
 * The front door (Roadmap P7): a sibling route group to `farm/`, like the portals, so `/farm`, its sign-in and
 * the router are served without the OS sidebar and scenario bar. The page is the logo mark's landscape: the sky
 * above, three bands of soil below.
 */

export const metadata: Metadata = {
  title: 'Cotyledon',
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
