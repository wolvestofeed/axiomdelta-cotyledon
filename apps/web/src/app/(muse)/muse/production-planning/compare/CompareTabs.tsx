'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

/**
 * Compare in two modes (agentic-assistance build plan decision 1): Day, the
 * same day placed under two forecasts; Recipe, two recipes costed under one
 * forecast. Tabs by decision, not a length conversion (tabbed-layout plan §1,
 * decision 4 as amended). The open tab is the URL hash; the Recipe tab is
 * admin-only and is not rendered for an operator, so an operator never sees an
 * empty tab (§6 rule 6).
 */

type TabId = 'day' | 'recipe';

const readHash = () => window.location.hash.replace(/^#/, '');
const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function CompareTabs({ day, recipe }: { day: ReactNode; recipe: ReactNode | null }) {
  const tabs: { id: TabId; label: string }[] = [{ id: 'day', label: 'Day' }, ...(recipe ? [{ id: 'recipe' as const, label: 'Recipe' }] : [])];
  const hash = useSyncExternalStore(subscribeHash, readHash, () => '');
  const tab: TabId = tabs.some((t) => t.id === hash) ? (hash as TabId) : 'day';
  const pick = (id: TabId) => {
    window.history.replaceState(null, '', `#${id}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  return (
    <>
      <div className="muse-tabs" role="tablist" aria-label="Compare">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" className="muse-tab" aria-selected={tab === t.id} id={`compare-tab-${t.id}`} aria-controls={`compare-panel-${t.id}`} onClick={() => pick(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="muse-tab-panel" role="tabpanel" id={`compare-panel-${tab}`} aria-labelledby={`compare-tab-${tab}`}>
        {tab === 'day' ? day : recipe}
      </div>
    </>
  );
}
