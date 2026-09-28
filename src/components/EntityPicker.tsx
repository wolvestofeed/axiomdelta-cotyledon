'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ENTITY_KIND_LABEL,
  type EntityKind,
  type LeanEntity,
} from '@/engine/entity-links';

/**
 * The one link control. Searches the server-side directory for the kinds it is
 * given, resolves a hit to a lean record, and hands the caller the id — which
 * the caller stores as a scenario edit or a database row.
 *
 * The browser only ever holds the lean records for the ids in play; the
 * directory itself stays on the server.
 */
export function EntityPicker({
  kinds,
  linked,
  canEdit,
  label,
  ariaLabel,
  placeholder,
  compact = false,
  emptyText = 'Not linked',
  addLabel,
  onLink,
  busyHint,
}: {
  /** Directories to search, in priority order. */
  kinds: EntityKind[];
  linked: LeanEntity | null;
  canEdit: boolean;
  /** What is being linked, for the empty state ("No supplier linked"). */
  label?: string;
  ariaLabel: string;
  placeholder?: string;
  /** Name only, no pills or subtitle — for dense table cells. */
  compact?: boolean;
  /** What to show when nothing is linked; an empty string shows nothing. */
  emptyText?: string;
  /** Overrides the button text — for a control that adds to a list rather than replacing one link. */
  addLabel?: string;
  onLink: (id: string | undefined) => void;
  /** Shown while a persisted link is being written. */
  busyHint?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<LeanEntity[]>([]);
  const [searching, setSearching] = useState(false);
  const shown = open && q.trim().length >= 2 ? results : [];
  const kindLabel = label ?? (kinds.length === 1 ? ENTITY_KIND_LABEL[kinds[0]].toLowerCase() : 'record');

  useEffect(() => {
    if (!open || q.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setSearching(true);
      fetch(`/farm/directory/search?q=${encodeURIComponent(q.trim())}&kinds=${kinds.join(',')}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((j: { results: LeanEntity[] }) => {
          if (!cancelled) setResults(j.results);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // `kinds` is a literal array at every call pickup point; join it so the effect is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open, kinds.join(',')]);

  function choose(id: string) {
    onLink(id);
    setOpen(false);
    setQ('');
  }

  return (
    <div className="farm-fs-xs">
      {linked ? (
        <div>
          <div className="font-medium">
            {linked.href ? (
              <Link className="farm-link" href={linked.href}>{linked.name}</Link>
            ) : (
              linked.name
            )}
          </div>
          {compact ? null : (
            <>
              {linked.subtitle ? (
                <div className="farm-c-faint farm-fs-2xs">{linked.subtitle}</div>
              ) : null}
              {linked.pills.length > 0 ? (
                <div className="flex gap-[0.3rem] flex-wrap mt-[0.2rem]! items-center">
                  {linked.pills.map((p) => (
                    <span key={p.label} className={p.tone === 'ok' ? 'farm-pill ok' : 'farm-pill'}>
                      {p.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : emptyText ? (
        <span className="farm-c-faint">{emptyText}</span>
      ) : null}

      {canEdit ? (
        <div className="mt-[0.3rem]!">
          {open ? (
            <div>
              <input
                className="farm-input farm-fs-xs min-w-56!"
                placeholder={placeholder ?? 'Search…'}
                value={q}
                autoFocus
                onChange={(e) => setQ(e.target.value)}
                aria-label={ariaLabel}
              />
              <button
                type="button"
                className="farm-btn ml-[0.3rem]! farm-fs-xs"
                onClick={() => {
                  setOpen(false);
                  setQ('');
                }}
              >
                Close
              </button>
              {searching ? <div className="farm-kpi-sub">Searching…</div> : null}
              {shown.length > 0 ? (
                <ul
                  className="list-none mt-[0.3rem]! mr-0! mb-0! ml-0! p-0 max-h-48 overflow-y-auto border border-[color:var(--farm-line)] rounded-[0.4rem] bg-[color:var(--farm-surface)]"
                >
                  {shown.map((r) => (
                    <li key={`${r.kind}:${r.id}`}>
                      <button
                        type="button"
                        className="farm-nav-link w-full! text-left! farm-c-ink bg-none! border-0! rounded-[0]! py-[0.35rem]! px-2! cursor-pointer! [font:inherit]! farm-fs-xs"
                        onClick={() => choose(r.id)}
                      >
                        <span className="font-medium">{r.name}</span>
                        <span className="farm-c-faint">
                          {kinds.length > 1 ? ` · ${ENTITY_KIND_LABEL[r.kind].toLowerCase()}` : ''}
                          {r.subtitle ? ` · ${r.subtitle}` : ''}
                          {r.pills.length > 0 ? ` · ${r.pills.map((p) => p.label).join(' · ')}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : q.trim().length >= 2 && !searching ? (
                <div className="farm-kpi-sub">No match in the directory.</div>
              ) : null}
            </div>
          ) : (
            <span className="inline-flex gap-[0.3rem] items-center">
              <button type="button" className="farm-btn farm-fs-xs" disabled={busyHint} onClick={() => setOpen(true)}>
                {addLabel ?? (linked ? 'Change' : `Link ${kindLabel}`)}
              </button>
              {linked ? (
                <button type="button" className="farm-btn farm-fs-xs" disabled={busyHint} onClick={() => onLink(undefined)}>
                  Unlink
                </button>
              ) : null}
              {busyHint ? <span className="farm-kpi-sub">Saving…</span> : null}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
