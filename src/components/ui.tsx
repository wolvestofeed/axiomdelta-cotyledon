import * as React from 'react';
import type { StatusTag, Tagged } from '@/data/plan-data';
import Link from 'next/link';
import { MODULES, type ModuleStatus } from '@/components/nav';
import { HowItWorks } from '@/components/HowItWorks';

// ── Formatters ──────────────────────────────────────────────────────────
export const money = (n: number, dp = 2) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dp, maximumFractionDigits: dp });
export const num = (n: number, dp = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const pct = (n: number, dp = 1) => `${(n * 100).toFixed(dp)}%`;

// ── Status badge (provenance of a figure) ─────────────────────────────────
const STATUS_LABEL: Record<StatusTag, string> = {
  SOURCED: 'Sourced',
  STATED: 'Stated',
  PLACEHOLDER: 'Placeholder',
  DERIVED: 'Derived',
  UNCONFIRMED: 'Unconfirmed',
  DATED: 'Dated',
};

export function StatusBadge({ status, title }: { status: StatusTag; title?: string }) {
  return (
    <span className={`farm-badge ${status.toLowerCase()}`} title={title ?? STATUS_LABEL[status]}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** A tagged figure rendered inline with its provenance badge. */
export function TaggedValue({
  t,
  render,
}: {
  t: Tagged;
  render?: (v: number) => string;
}) {
  const text = render ? render(t.value) : num(t.value, 0);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular-nums">
        {text}
        {t.unit ? <span className="farm-c-faint"> {t.unit}</span> : null}
      </span>
      <StatusBadge status={t.status} title={t.note} />
    </span>
  );
}

// ── Cards / KPIs ──────────────────────────────────────────────────────────
export function Card({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`farm-card ${className}`}>
      {title ? <div className="farm-card-title">{title}</div> : null}
      {children}
    </div>
  );
}

export function Kpi({
  value,
  label,
  sub,
}: {
  value: React.ReactNode;
  label: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="farm-card farm-lift">
      <div className="farm-kpi-value">{value}</div>
      <div className="farm-kpi-label">{label}</div>
      {sub ? <div className="farm-kpi-sub">{sub}</div> : null}
    </div>
  );
}

// ── Preview banner — consistent, intentional framing for modules whose data
// is still illustrative. Honest (says the data is illustrative) but deliberate.
export function PreviewBanner({ children }: { children?: React.ReactNode }) {
  return (
    <div className="farm-preview-banner">
      <span className="farm-preview-tag">Preview</span>
      <span>
        {children ??
          'Layout and logic are built; the figures below are illustrative until live data connects.'}
      </span>
    </div>
  );
}

// ── Page header ─────────────────────────────────────────────────────────
/** The application and its platform, as they run on the footer and on documents (invoices, exports) — never on a page header. */
export const BRAND_LINE = 'Cotyledon, powered by Ember OS';

export function BrandLine() {
  return <div className="farm-brandline">{BRAND_LINE}</div>;
}

/** A workflow link in the header: the page it points at, and which way the work flows. */
export interface HeaderConnect {
  href: string;
  dir: 'from' | 'to' | 'both';
  /** Only for a target outside the nav (Staffing); nav pages take their label from `nav.ts`. */
  label?: string;
}

const CONNECT_WORD: Record<HeaderConnect['dir'], string> = { from: 'From', to: 'To', both: 'With' };
const connectLabel = (c: HeaderConnect): string => MODULES.find((m) => m.href === c.href)?.label ?? c.label ?? c.href;

/** The purpose line's budget (page-headers build plan §2): one sentence, at most this many characters. */
export const PURPOSE_MAX_CHARS = 140;
const LEDE_MAX_WORDS = 60;

/**
 * The page header (page-headers build plan §2). Four slots beyond the title:
 * `purpose` (one line, always visible, starts with a verb), `functions` ("On
 * this page": the page's own tab and card names), `connects` (the pages that
 * feed it or depend on it) and `howItWorks` (the rules, collapsed). `lede` is
 * the paragraph the slots replace; it still renders so pages migrate one at a
 * time, and a long one warns in development.
 */
export function PageHeader({
  title,
  lede,
  status,
  right,
  purpose,
  functions,
  connects,
  howItWorks,
}: {
  title: string;
  /** @deprecated Use `purpose`, `functions`, `connects` and `howItWorks`. */
  lede?: React.ReactNode;
  status?: ModuleStatus;
  right?: React.ReactNode;
  purpose?: string;
  functions?: string[];
  connects?: HeaderConnect[];
  howItWorks?: React.ReactNode;
}) {
  if (process.env.NODE_ENV !== 'production') {
    if (typeof lede === 'string' && lede.split(/\s+/).length > LEDE_MAX_WORDS) console.warn(`PageHeader "${title}": the lede runs ${lede.split(/\s+/).length} words; move the rules into howItWorks (page-headers build plan).`);
    if (purpose && purpose.length > PURPOSE_MAX_CHARS) console.warn(`PageHeader "${title}": the purpose line runs ${purpose.length} characters; the budget is ${PURPOSE_MAX_CHARS}.`);
  }
  const groups = (['from', 'to', 'both'] as const).map((dir) => ({ dir, items: (connects ?? []).filter((c) => c.dir === dir) })).filter((g) => g.items.length > 0);
  return (
    <header className="mb-6 farm-page-header">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="farm-page-title">{title}</h1>
            {status ? <ModuleStatusPill status={status} /> : null}
          </div>
          {purpose ? <p className="farm-page-purpose">{purpose}</p> : null}
          {lede ? <p className="farm-page-lede">{lede}</p> : null}
          {functions && functions.length > 0 ? (
            <ul className="farm-page-on" aria-label="On this page">
              {functions.map((f) => (
                <li key={f} className="farm-chip">{f}</li>
              ))}
            </ul>
          ) : null}
          {groups.length > 0 ? (
            <nav className="farm-page-connects" aria-label="Related pages">
              {groups.map((g) => (
                <span key={g.dir}>
                  <span className="farm-connect-dir">{CONNECT_WORD[g.dir]}</span>
                  {g.items.map((c, i) => (
                    <React.Fragment key={c.href}>
                      {i > 0 ? <span aria-hidden="true"> · </span> : null}
                      <Link href={c.href}>{connectLabel(c)}</Link>
                    </React.Fragment>
                  ))}
                </span>
              ))}
            </nav>
          ) : null}
          {howItWorks ? <HowItWorks>{howItWorks}</HowItWorks> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
    </header>
  );
}

const MODULE_STATUS_LABEL: Record<ModuleStatus, string> = {
  live: 'Live',
  partial: 'Partial',
  designed: 'Preview',
};

export function ModuleStatusPill({ status }: { status: ModuleStatus }) {
  return (
    <span className="farm-modstatus">
      <span className={`farm-dot ${status}`} />
      {MODULE_STATUS_LABEL[status]}
    </span>
  );
}

// ── Check pill (OK / OVER) ─────────────────────────────────────────────────
export function CheckPill({ ok, okLabel = 'OK', overLabel = 'OVER' }: { ok: boolean; okLabel?: string; overLabel?: string }) {
  return <span className={`farm-pill ${ok ? 'ok' : 'over'}`}>{ok ? okLabel : overLabel}</span>;
}

// ── Notice ──────────────────────────────────────────────────────────────
export function Notice({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="farm-notice">
      {title ? <div className="farm-notice-title">{title}</div> : null}
      <div>{children}</div>
    </div>
  );
}
