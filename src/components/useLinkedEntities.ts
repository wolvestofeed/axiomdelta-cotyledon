'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LeanEntity } from '@/engine/entity-links';

/**
 * Hydrate lean records for the `kind:id` refs a page has in play, keyed by ref.
 * Fetches only refs not already asked for, so a page with fifty rows and three
 * distinct links makes one request. The directories stay server-side.
 *
 * Refs the directory cannot resolve are remembered as asked-for, not retried —
 * otherwise a stale id in a saved forecast would re-request on every render.
 */
export function useLinkedEntities(refs: string[]): Record<string, LeanEntity> {
  const [cache, setCache] = useState<Record<string, LeanEntity>>({});
  const asked = useRef<Set<string>>(new Set());
  const wanted = useMemo(
    () => [...new Set(refs)].filter((r) => r && !asked.current.has(r)).sort().join(','),
    [refs],
  );

  useEffect(() => {
    if (!wanted) return;
    for (const r of wanted.split(',')) asked.current.add(r);
    let cancelled = false;
    fetch(`/farm/directory/search?refs=${encodeURIComponent(wanted)}`)
      .then((r) => (r.ok ? r.json() : { byRef: {} }))
      .then((j: { byRef: Record<string, LeanEntity> }) => {
        if (!cancelled) setCache((c) => ({ ...c, ...j.byRef }));
      })
      .catch(() => {
        // Let a transient failure be retried on the next change of refs.
        if (!cancelled) for (const r of wanted.split(',')) asked.current.delete(r);
      });
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  return cache;
}

/** One ref, for the single-link forms. */
export function useLinkedEntity(ref: string | undefined): LeanEntity | null {
  const refs = useMemo(() => (ref ? [ref] : []), [ref]);
  const byRef = useLinkedEntities(refs);
  return ref ? byRef[ref] ?? null : null;
}
