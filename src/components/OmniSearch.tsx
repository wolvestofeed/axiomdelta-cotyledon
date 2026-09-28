'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ENTITY_KIND_PLURAL,
  LINK_SURFACES,
  type EntityKind,
  type LeanEntity,
} from '@/engine/entity-links';

/**
 * The umbrella: one search across every directory — suppliers, prospects, sources,
 * grow plans, equipment, pickup points, courses, lots. A hit lands on the record, and offers
 * the surfaces that can link to it, which is what makes the platform read as one
 * system rather than a set of pages that each own a list.
 *
 * The directories stay server-side; this only ever holds the rows it is showing.
 */
export function OmniSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<LeanEntity[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      setSearching(true);
      fetch(`/farm/directory/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((j: { results: LeanEntity[] }) => {
          if (!cancelled) {
            setResults(j.results);
            setOpen(true);
          }
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
  }, [q]);

  // Close on a click outside or on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Group by kind, keeping the order the route returned.
  const groups: { kind: EntityKind; rows: LeanEntity[] }[] = [];
  for (const r of results) {
    const g = groups.find((x) => x.kind === r.kind);
    if (g) g.rows.push(r);
    else groups.push({ kind: r.kind, rows: [r] });
  }

  const close = () => {
    setOpen(false);
    setExpanded(null);
  };

  return (
    <div className="farm-omni" ref={boxRef}>
      <input
        className="farm-omni-input"
        type="search"
        value={q}
        placeholder="Search…" title="Search suppliers, prospects, sources, grow plans, equipment"
        aria-label="Search every directory"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
      />
      {open && q.trim().length >= 2 ? (
        <div className="farm-omni-panel">
          {searching && results.length === 0 ? (
            <div className="farm-omni-empty">Searching…</div>
          ) : results.length === 0 ? (
            <div className="farm-omni-empty">Nothing in any directory matches “{q.trim()}”.</div>
          ) : (
            groups.map((g) => (
              <div key={g.kind}>
                <div className="farm-omni-group">{ENTITY_KIND_PLURAL[g.kind]}</div>
                {g.rows.map((r) => {
                  const key = `${r.kind}:${r.id}`;
                  const surfaces = LINK_SURFACES[r.kind];
                  return (
                    <div key={key} className="farm-omni-row">
                      <div className="farm-omni-main">
                        {r.href ? (
                          <Link className="farm-omni-name" href={r.href} onClick={close}>{r.name}</Link>
                        ) : (
                          <span className="farm-omni-name">{r.name}</span>
                        )}
                        {surfaces.length > 0 ? (
                          <button
                            type="button"
                            className="farm-btn farm-fs-2xs py-[0.1rem]! px-[0.4rem]!"
                            aria-expanded={expanded === key}
                            onClick={() => setExpanded(expanded === key ? null : key)}
                          >
                            Link to…
                          </button>
                        ) : null}
                      </div>
                      <div className="farm-omni-sub">
                        {r.subtitle}
                        {r.pills.map((p) => (
                          <span key={p.label}> · {p.label}</span>
                        ))}
                      </div>
                      {expanded === key ? (
                        <ul className="farm-omni-surfaces">
                          {surfaces.map((sfc) => (
                            <li key={sfc.href}>
                              <Link className="farm-link" href={sfc.href} onClick={close}>{sfc.label}</Link>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <div className="farm-omni-foot">
            Searches the supplier, prospect, source, growPlan, equipment, pickupPoint, course and lot
            directories. Records are read-only here; “Link to…” opens the surface that sets the link.
          </div>
        </div>
      ) : null}
    </div>
  );
}
