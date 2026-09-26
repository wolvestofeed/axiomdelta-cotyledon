'use client';

import { useState } from 'react';
import { Card, num } from '../../_components/ui';
import {
  CONFORMANCE_REGISTER,
  CONFORMANCE_STATUS_LABELS,
  CONFORMANCE_STATUS_MEANING,
  COOK_CHILL_RULE,
  LEGAL_BASIS,
  SPACE_STANDARDS,
  STANDARD_CORRECTIONS,
  TWO_STREAM_RULE,
  ZONE_ADJACENCY,
  type ConformanceItem,
  type ConformanceStatus,
} from '../../_data/facility-conformance';

const STATUSES: ConformanceStatus[] = ['CODE', 'SCHEME', 'GUIDANCE', 'CONVENTION'];
const statusClass: Record<ConformanceStatus, string> = {
  CODE: 'muse-c-sourced font-semibold',
  SCHEME: 'muse-c-stated font-semibold',
  GUIDANCE: 'muse-c-placeholder font-semibold',
  CONVENTION: 'muse-c-faint font-semibold',
};

function Register({ items, shown }: { items: readonly ConformanceItem[]; shown: Set<ConformanceStatus> }) {
  const rows = items.filter((c) => shown.has(c.status));
  return (
    <div className="muse-scroll-x">
      <table className="muse-table compact">
        <thead><tr><th>#</th><th>Requirement</th><th>Status</th><th>Authority</th><th>Spatial consequence</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} className="muse-c-soft">No items with the selected status.</td></tr>}
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="muse-mono muse-fs-xs whitespace-nowrap!">{c.id}</td>
              <td className="min-w-72! max-w-112! muse-fs-sm">{c.requirement}</td>
              <td className="whitespace-nowrap!">
                <span className={statusClass[c.status]}>{CONFORMANCE_STATUS_LABELS[c.status]}</span>
                {c.qualifier && <div className="muse-c-faint muse-fs-xs">{c.qualifier}</div>}
                {c.check && <div className="muse-c-faint muse-fs-xs">Layout check</div>}
              </td>
              <td className="muse-c-soft muse-fs-xs min-w-48! max-w-72!">{c.authority}</td>
              <td className="muse-fs-sm min-w-64! max-w-104!">{c.consequence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Conformance: the register the layout is drawn against and a plan review
 * submission answers (facility-design roadmap §4, §10). Every item carries
 * what it is, so a mandatory requirement is never confused with a convention.
 * Findings cite a limit and a measured figure; none says what to do.
 */
export function FacilityConformanceTab() {
  const [shown, setShown] = useState<Set<ConformanceStatus>>(() => new Set(STATUSES));
  const toggle = (s: ConformanceStatus) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  const count = (items: readonly ConformanceItem[], s: ConformanceStatus) => items.filter((c) => c.status === s).length;

  return (
    <>
      <Card title="What law actually applies">
        <p className="muse-fs-base leading-[1.55]">{LEGAL_BASIS.summary}</p>
        <p className="mt-2 muse-c-soft muse-fs-sm leading-[1.5]!">{LEGAL_BASIS.note}</p>
        <div className="muse-scroll-x mt-3">
          <table className="muse-table compact">
            <thead><tr><th>Texas rule</th><th>Requirement</th><th>Note</th></tr></thead>
            <tbody>{LEGAL_BASIS.texasRules.map((r) => <tr key={r.rule}><td className="whitespace-nowrap! font-medium!">{r.rule}</td><td className="muse-fs-sm">{r.requirement}</td><td className="muse-c-soft muse-fs-sm">{r.note}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="mt-3 muse-c-soft muse-fs-sm leading-[1.5]!">{LEGAL_BASIS.haccpHooks}</p>
        <p className="mt-2 muse-c-soft muse-fs-sm leading-[1.5]!"><span className="font-semibold muse-c-ink">Plan review. </span>{LEGAL_BASIS.planReview}</p>
      </Card>

      <Card title="Cook-chill: Food Code 3-502.12(D), no variance needed" className="mt-4">
        <p className="muse-fs-base leading-[1.55]">{COOK_CHILL_RULE.summary}</p>
        <div className="muse-scroll-x mt-3">
          <table className="muse-table compact">
            <thead><tr><th>Path</th><th>Requirement</th><th>Shelf life</th><th>Status</th></tr></thead>
            <tbody>
              {COOK_CHILL_RULE.paths.map((p) => (
                <tr key={p.path} className={`${p.current ? 'font-semibold!' : ''}`}>
                  <td className="muse-mono">{p.path}</td>
                  <td className="muse-fs-sm">{p.requirement}</td>
                  <td>{p.shelfLife}</td>
                  <td className={`${p.current ? 'muse-c-accent-hi' : 'muse-c-soft'}`}>{p.current ? 'Current capability' : p.path === '(a)' ? 'Potential room on the Design and Build plan' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">{COOK_CHILL_RULE.statusNote}</p>
      </Card>

      <Card title="Status filter" className="mt-4">
        <div className="flex flex-wrap gap-[0.4rem] items-center">
          {STATUSES.map((s) => {
            const on = shown.has(s);
            return (
              <button key={s} type="button" className={`muse-btn ${on ? 'bg-[color:var(--muse-ink)]! text-[var(--muse-surface)]! border-[color:var(--muse-ink)]!' : ''}`} aria-pressed={on} onClick={() => toggle(s)} title={CONFORMANCE_STATUS_MEANING[s]}>
                {CONFORMANCE_STATUS_LABELS[s]} ({num(count(SPACE_STANDARDS, s) + count(CONFORMANCE_REGISTER, s))})
              </button>
            );
          })}
        </div>
        <ul className="mt-3 m-0! pl-[1.1rem]! muse-fs-sm leading-[1.5]! muse-c-soft">
          {STATUSES.map((s) => <li key={s}><span className={statusClass[s]}>{CONFORMANCE_STATUS_LABELS[s]}</span> — {CONFORMANCE_STATUS_MEANING[s]}</li>)}
        </ul>
      </Card>

      <Card title="The space standards behind the method" className="mt-4">
        <Register items={SPACE_STANDARDS} shown={shown} />
        <ul className="mt-3 m-0! pl-[1.1rem]! muse-fs-sm leading-[1.5]!">{STANDARD_CORRECTIONS.map((c) => <li key={c}>{c}</li>)}</ul>
      </Card>

      <Card title="The conformance register, C-01 to C-35" className="mt-4">
        <Register items={CONFORMANCE_REGISTER} shown={shown} />
        <p className="muse-kpi-sub mt-2">Items marked &ldquo;Layout check&rdquo; are measured on the drawing under Layout; the rest are answered on the finish schedule, the fixture specification or the submission.</p>
      </Card>

      <Card title="Zones and their adjacencies" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table compact">
            <thead><tr><th>Zone, in flow order</th><th>Adjacent to</th><th>Separated from</th><th>Items</th></tr></thead>
            <tbody>{ZONE_ADJACENCY.map((z) => <tr key={z.zone}><td className="font-medium!">{z.zone}</td><td className="muse-fs-sm">{z.adjacentTo}</td><td className="muse-fs-sm">{z.separatedFrom}</td><td className="muse-c-soft muse-fs-xs whitespace-nowrap!">{z.items}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="mt-3 muse-fs-base leading-[1.55]!"><span className="font-semibold">The two-stream hot line. </span>{TWO_STREAM_RULE}</p>
      </Card>
    </>
  );
}
