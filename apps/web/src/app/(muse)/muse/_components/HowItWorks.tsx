'use client';

import { useId, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * "How this page works" — the collapsed panel that holds a page's rules and
 * method (page-headers build plan §2). Collapsed on every server render, so
 * the markup matches; whether it is open is remembered per route in
 * localStorage as a convenience only (decision D3), read as an external-store
 * snapshot so no state is set inside an effect. The panel is a button and a
 * region rather than a native <details>, because print cannot open a closed
 * <details> and the plan prints the panel expanded.
 */

const EVENT = 'muse-hiw';
const keyFor = (route: string) => `muse.hiw.${route}`;

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
};

function readOpen(route: string): boolean {
  try {
    return window.localStorage.getItem(keyFor(route)) === '1';
  } catch {
    return false;
  }
}

function writeOpen(route: string, open: boolean): void {
  try {
    if (open) window.localStorage.setItem(keyFor(route), '1');
    else window.localStorage.removeItem(keyFor(route));
  } catch {
    /* a private window, or storage blocked: the panel still toggles for this render */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function HowItWorks({ children }: { children: ReactNode }) {
  const route = usePathname() ?? '';
  const id = useId();
  const open = useSyncExternalStore(subscribe, () => readOpen(route), () => false);
  return (
    <div className={`muse-hiw ${open ? 'open' : ''}`}>
      <button type="button" className="muse-hiw-toggle" aria-expanded={open} aria-controls={id} onClick={() => writeOpen(route, !open)}>
        <span className="muse-hiw-label">How this page works</span>
        <span className="muse-hiw-affordance" aria-hidden="true">{open ? 'Hide' : 'Show'}</span>
      </button>
      <div className="muse-hiw-body" id={id} role="region" aria-label="How this page works" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
