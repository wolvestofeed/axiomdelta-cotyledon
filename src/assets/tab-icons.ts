import type { Metadata } from 'next';
import icon32 from '@/assets/farm-icon-32.png';
import icon180 from '@/assets/farm-icon-180.png';

/**
 * The browser-tab icon for every Farm page: the mark at 32 px, and at 180 px for the Apple touch icon. Each
 * Farm route-group layout sets it, so it replaces Staffing's root `favicon.ico` on Farm pages only.
 */
export const FARM_TAB_ICONS: Metadata['icons'] = {
  icon: [{ url: icon32.src, sizes: '32x32', type: 'image/png' }],
  apple: [{ url: icon180.src, sizes: '180x180', type: 'image/png' }],
};
