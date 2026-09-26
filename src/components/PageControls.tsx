'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

import { pageControlsId, type PageControlGroup } from '@/components/page-controls-slot';

export type { PageControlGroup } from '@/components/page-controls-slot';

const noSubscribe = () => () => {};

/**
 * A page's own controls, placed on the toolbar under the scenario bar rather than in the
 * page body. The page renders them where it always did; this moves them into the group's
 * slot in `layout.tsx`. Server-rendered children pass through unchanged. Outside the OS
 * shell there is no slot and nothing renders. A control that sets one card's content, a
 * form input, a save or revert, or a data edit stays in the page.
 */
export function PageControls({ group = 'scope', children }: { group?: PageControlGroup; children: React.ReactNode }) {
  const target = useSyncExternalStore(noSubscribe, () => document.getElementById(pageControlsId(group)), () => null);
  if (!target) return null;
  return createPortal(<>{children}</>, target);
}
