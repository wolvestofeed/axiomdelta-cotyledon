'use client';

import { useEffect, useState } from 'react';
import type { LeanSupplier } from '../_engine/supplier-links';

/**
 * Hydrate lean records for the supplier ids linked in the draft. Fetches only
 * ids not yet held; the full directory never reaches the browser.
 */
export function useLinkedSuppliers(links: Record<string, string>): Record<string, LeanSupplier> {
  const [cache, setCache] = useState<Record<string, LeanSupplier>>({});
  const wanted = [...new Set(Object.values(links))].filter((id) => !cache[id]).sort().join(',');

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    fetch(`/farm/suppliers/search?ids=${encodeURIComponent(wanted)}`)
      .then((r) => (r.ok ? r.json() : { byId: {} }))
      .then((j: { byId: Record<string, LeanSupplier> }) => {
        if (!cancelled) setCache((c) => ({ ...c, ...j.byId }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  return cache;
}
