'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import { Card } from '@/components/ui';
import { EXTERNAL_SECTIONS, MODULES } from '@/components/nav';
import {
  EMPTY_FILTER,
  REPORT_SECTIONS,
  REPORT_SORT_LABELS,
  REPORT_THEMES,
  REPORT_THEME_LABELS,
  REPORT_WORLD_LABELS,
  filterReports,
  noteViewed,
  reportDef,
  sortReports,
  type ReportData,
  type ReportDef,
  type ReportFilter,
  type ReportSort,
  type ReportTable,
  type ReportTheme,
} from '@/engine/reports';
import { noteReportViewed } from '@/server/report-actions';

export interface ReportItem {
  def: ReportDef;
  data: ReportData;
}

const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const readHash = () => window.location.hash.replace(/^#/, '');
const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

/**
 * The Reports library (Roadmap Phase E). One tab per section of the main menu, in the
 * menu's order; the controls — search, lens, sort — stay above the bar and apply inside
 * the open tab. Each report opens at summary level and its detail rows open on the
 * toggle. Opening a report's detail is a view: it goes to the top of the most recently
 * viewed list beside the library, which the server holds in a cookie for this reader.
 */
export function ReportsClient({ reports, recent: initialRecent, isAdmin }: { reports: ReportItem[]; recent: string[]; isAdmin: boolean }) {
  const sections = useMemo(() => REPORT_SECTIONS.filter((s) => reports.some((r) => r.def.section === s)), [reports]);
  const bySlug = useMemo(() => new Map(sections.map((s) => [slug(s), s])), [sections]);
  const hash = useSyncExternalStore(subscribeHash, readHash, () => '');
  const section = bySlug.get(hash) ?? sections[0] ?? '';
  const pickSection = (s: string) => {
    window.history.replaceState(null, '', `#${slug(s)}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  const [filter, setFilter] = useState<ReportFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<ReportSort>('menu');
  const [recent, setRecent] = useState<string[]>(initialRecent);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();
  // A jump from the recently viewed list scrolls once the target's section has rendered.
  const jumpRef = useRef<string | null>(null);

  const view = (id: string) => {
    setRecent((r) => noteViewed(r, id));
    startTransition(() => {
      void noteReportViewed(id);
    });
  };
  const toggle = (id: string) => {
    const next = !open[id];
    setOpen((o) => ({ ...o, [id]: next }));
    if (next) view(id);
  };
  const jump = (id: string) => {
    const def = reportDef(id);
    if (!def) return;
    setFilter(EMPTY_FILTER);
    if (def.section !== section) pickSection(def.section);
    setOpen((o) => ({ ...o, [id]: true }));
    view(id);
    jumpRef.current = id;
  };
  useEffect(() => {
    const id = jumpRef.current;
    if (!id) return;
    jumpRef.current = null;
    document.getElementById(`report-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  const filtered = useMemo(() => sortReports(filterReports(reports, filter), sort, recent), [reports, filter, sort, recent]);
  const inSection = filtered.filter((r) => r.def.section === section);
  const countIn = (s: string) => filtered.filter((r) => r.def.section === s).length;
  const active = filter.q.trim() !== '' || filter.theme !== 'all' || filter.withDataOnly;
  const isExternal = (s: string) => EXTERNAL_SECTIONS.includes(s);
  const firstExternal = sections.find(isExternal);

  return (
    <div className="grid gap-4 items-start grid-cols-1 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="min-w-0">
        <div className="farm-card mb-3! flex flex-wrap items-end gap-3">
          <label className="farm-field grow basis-56">
            <span>Search the library</span>
            <input className="farm-input" type="search" value={filter.q} placeholder="Title, section, lens…" aria-label="Search reports" onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
          </label>
          <label className="farm-field">
            <span>Lens</span>
            <select className="farm-select" value={filter.theme} aria-label="Filter by lens" onChange={(e) => setFilter({ ...filter, theme: e.target.value as ReportTheme | 'all' })}>
              <option value="all">All lenses</option>
              {REPORT_THEMES.map((t) => (
                <option key={t} value={t}>{REPORT_THEME_LABELS[t]}</option>
              ))}
            </select>
          </label>
          <label className="farm-field">
            <span>Sort</span>
            <select className="farm-select" value={sort} aria-label="Sort reports" onChange={(e) => setSort(e.target.value as ReportSort)}>
              {(Object.keys(REPORT_SORT_LABELS) as ReportSort[]).map((s) => (
                <option key={s} value={s}>{REPORT_SORT_LABELS[s]}</option>
              ))}
            </select>
          </label>
          <label className="farm-fs-sm farm-c-soft flex items-center gap-2 pb-[0.45rem]">
            <input type="checkbox" checked={filter.withDataOnly} onChange={(e) => setFilter({ ...filter, withDataOnly: e.target.checked })} />
            Only reports with something on record
          </label>
          {active && (
            <button type="button" className="farm-btn ghost" onClick={() => setFilter(EMPTY_FILTER)}>Clear</button>
          )}
        </div>

        <div className="farm-tabs farm-tabs-wrap" role="tablist" aria-label="Report sections">
          {sections.map((s) => (
            <button key={s} type="button" role="tab" className={`farm-tab ${s === firstExternal ? 'ml-4!' : ''}`} aria-selected={section === s} id={`reports-tab-${slug(s)}`} aria-controls={`reports-panel-${slug(s)}`} onClick={() => pickSection(s)}>
              {s}
              <span className="farm-tab-count">{active ? `${countIn(s)} / ${reports.filter((r) => r.def.section === s).length}` : reports.filter((r) => r.def.section === s).length}</span>
            </button>
          ))}
        </div>
        <div className="farm-tab-panel" role="tabpanel" id={`reports-panel-${slug(section)}`} aria-labelledby={`reports-tab-${slug(section)}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="farm-card-title m-0!">{section}</div>
              <div className="farm-fs-xs farm-c-faint mt-1">
                {inSection.length === 0 ? 'No report in this section matches the filter.' : `${inSection.length} report${inSection.length === 1 ? '' : 's'}`}
                {' · '}
                {MODULES.filter((m) => m.section === section && (isAdmin || !m.adminOnly)).map((m, i) => (
                  <span key={m.href}>{i > 0 ? ', ' : ''}<Link className="farm-link" href={m.href}>{m.label}</Link></span>
                ))}
              </div>
            </div>
            <a className="farm-btn" href={`/farm/reports/export?section=${encodeURIComponent(section)}`}>Export this section — XLSX</a>
          </div>
          {inSection.map(({ def, data }) => (
            <ReportCard key={def.id} def={def} data={data} open={!!open[def.id]} onToggle={() => toggle(def.id)} />
          ))}
        </div>
      </div>

      <aside className="xl:sticky xl:top-4">
        <Card title="Most recently viewed">
          {recent.length === 0 ? (
            <p className="farm-kpi-sub">Nothing viewed yet. Opening a report&rsquo;s detail lists it here, most recent first, up to five.</p>
          ) : (
            <ol className="m-0! pl-[1.1rem] grid gap-[0.45rem]">
              {recent.map((id) => {
                const def = reportDef(id);
                if (!def || (def.adminOnly && !isAdmin)) return null;
                return (
                  <li key={id} className="farm-fs-sm">
                    <button type="button" className="farm-link text-left bg-transparent border-0 p-0 cursor-pointer font-[inherit]" onClick={() => jump(id)}>{def.title}</button>
                    <div className="farm-fs-2xs farm-c-faint">{def.section}</div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
        <Card title="Lenses" className="mt-3">
          <ul className="m-0! pl-[1.1rem] grid gap-[0.3rem] farm-fs-xs farm-c-soft">
            {REPORT_THEMES.map((t) => (
              <li key={t}>
                <button type="button" className={`farm-link text-left bg-transparent border-0 p-0 cursor-pointer font-[inherit] ${filter.theme === t ? 'farm-c-accent-hi' : ''}`} onClick={() => setFilter({ ...filter, theme: filter.theme === t ? 'all' : t })}>
                  {REPORT_THEME_LABELS[t]}
                </button>
                {' '}
                <span className="farm-c-faint">{reports.filter((r) => r.def.themes.includes(t)).length}</span>
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}

function ReportCard({ def, data, open, onToggle }: { def: ReportDef; data: ReportData; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div id={`report-${def.id}`} ref={ref} className="farm-card scroll-mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="farm-card-title m-0!">{def.title}</div>
          <p className="farm-fs-xs farm-c-soft mt-1! mb-0! leading-[1.45]">{def.blurb}</p>
          <div className="farm-fs-2xs farm-c-faint mt-1 flex flex-wrap gap-x-3 gap-y-1">
            <span>{def.themes.map((t) => REPORT_THEME_LABELS[t]).join(' · ')}</span>
            <span>{REPORT_WORLD_LABELS[def.world]}</span>
            <Link className="farm-link" href={def.sourceHref}>{MODULES.find((m) => m.href === def.sourceHref)?.label ?? 'Module page'}</Link>
            <a className="farm-link" href={`/farm/reports/export?report=${encodeURIComponent(def.id)}`}>Export — XLSX</a>
          </div>
        </div>
        {data.detail && data.detailCount > 0 && (
          <button type="button" className="farm-btn ghost" aria-expanded={open} aria-controls={`report-detail-${def.id}`} onClick={onToggle}>
            {open ? 'Close detail' : `Open detail`}
            <span className="farm-tab-count">{data.detailCount}</span>
          </button>
        )}
      </div>
      {data.empty && <p className="farm-kpi-sub mt-2 farm-c-placeholder">{data.empty}</p>}
      <div className="mt-3">
        <Table t={data.summary} />
      </div>
      {open && data.detail && (
        <div id={`report-detail-${def.id}`} className="mt-3">
          <div className="farm-fs-2xs farm-c-faint uppercase tracking-[0.06em] mb-1">Detail</div>
          <Table t={data.detail} />
        </div>
      )}
      <p className="farm-fs-xs farm-c-faint mt-3! mb-0! leading-[1.4]">{data.basis}</p>
    </div>
  );
}

function Table({ t }: { t: ReportTable }) {
  if (t.rows.length === 0) return <p className="farm-kpi-sub">No rows.</p>;
  return (
    <div className="farm-scroll-x">
      <table className="farm-table compact">
        <thead>
          <tr>
            {t.columns.map((c, i) => (
              <th key={i} className={c.num ? 'num' : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i} className={r.tone === 'total' ? 'total' : r.tone === 'faint' ? 'farm-c-faint' : undefined}>
              {r.cells.map((c, j) => (
                <td key={j} className={`${t.columns[j]?.num ? 'num' : ''} ${r.tone === 'over' && j === 0 ? 'farm-c-over' : ''}`.trim() || undefined}>{c === null ? '—' : c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
