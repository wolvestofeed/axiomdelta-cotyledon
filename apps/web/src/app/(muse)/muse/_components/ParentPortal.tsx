'use client';

/**
 * Parent Admin (PREVIEW / MOCK). Pick a signed-active parent-pay school and
 * see its parent roster, payment-plan breakdown, and history log. All records
 * are synthetic; amounts are illustrative (School-meals per-meal price).
 */

import { useMemo, useState } from 'react';
import { money, num } from './ui';
import {
  billed,
  summarizeSchool,
  mealsPerWeek,
  PLAN_LABEL,
  CADENCE_LABEL,
  type ParentAccount,
  type HistoryEvent,
} from '../_engine/parent-portal';

interface SchoolLite {
  id: string;
  name: string;
  parentPay: string;
  studentsRaw: string;
}

interface Props {
  schools: SchoolLite[];
  parents: ParentAccount[];
  history: HistoryEvent[];
  pricePerMeal: number;
}

export default function ParentPortal({ schools, parents, history, pricePerMeal }: Props) {
  const [schoolId, setSchoolId] = useState<string>(schools[0]?.id ?? '');
  const [tab, setTab] = useState<'parents' | 'plans' | 'history'>('parents');

  const school = schools.find((s) => s.id === schoolId) ?? schools[0] ?? null;
  const roster = useMemo(() => parents.filter((p) => p.schoolId === schoolId), [parents, schoolId]);
  const log = useMemo(
    () =>
      history
        .filter((h) => h.schoolId === schoolId)
        .slice()
        .sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [history, schoolId],
  );
  const summary = useMemo(() => summarizeSchool(roster, pricePerMeal), [roster, pricePerMeal]);

  if (!school) {
    return (
      <div className="muse-card mt-4">
        <p className="muse-kpi-sub">No signed-active parent-pay schools with parent accounts yet.</p>
      </div>
    );
  }

  return (
    <>
      {/* School selector */}
      <div className="muse-card mt-4 flex! flex-wrap! gap-3! items-end!">
        <label className="muse-fs-sm">
          <div className="muse-kpi-label">School (signed-active, parent-pay)</div>
          <select value={school.id} onChange={(e) => setSchoolId(e.target.value)} className="py-[0.4rem]! px-[0.6rem]! border! border-[color:var(--muse-line)]! rounded-[0.4rem]! bg-[color:var(--muse-surface)]! muse-c-ink muse-fs-sm min-w-88!">
            {schools.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <div className="ml-auto! text-right muse-c-soft muse-fs-xs pb-[0.15rem]">
          {school.studentsRaw} students · Parent-pay: {school.parentPay}
        </div>
      </div>

      {/* Headline KPIs */}
      <div className="grid gap-3 mt-4 muse-autofit-11">
        <Kpi value={num(summary.activeParents)} label="Active parent accounts" sub={`${num(summary.totalParents)} total incl. pending / paused`} />
        <Kpi value={num(summary.kids)} label="Enrolled children" sub="Across active accounts" />
        <Kpi value={num(summary.mealsPerWeek)} label="Meals / week" sub="Active accounts, all children" />
        <Kpi value={money(summary.monthlyBilled, 0)} label="Est. monthly billed" sub="Normalized across cadences" />
      </div>

      <div className="muse-card mt-4">
        {/* Tab bar */}
        <div
          className="flex items-center gap-2 mt-[-1.1rem]! mr-[-1.2rem]! mb-4! ml-[-1.2rem]! py-[0.6rem] px-[0.9rem] bg-[linear-gradient(135deg,var(--muse-forest)_0%,var(--muse-forest-soft)_55%,var(--muse-olive)_150%)] [border-top-left-radius:0.6rem] [border-top-right-radius:0.6rem]"
        >
          <TabButton active={tab === 'parents'} onClick={() => setTab('parents')}>Parents</TabButton>
          <TabButton active={tab === 'plans'} onClick={() => setTab('plans')}>Payment plans</TabButton>
          <TabButton active={tab === 'history'} onClick={() => setTab('history')}>History</TabButton>
        </div>

        {tab === 'parents' && (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead>
                <tr>
                  <th>Parent / guardian</th><th className="num">Children</th><th>Meal plan</th>
                  <th className="num">Meals / wk</th><th>Billing cadence</th><th className="num">Amount</th><th>Status</th><th>Since</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((p) => {
                  const b = billed(p, pricePerMeal);
                  return (
                    <tr key={p.id}>
                      <td className="font-medium!">{p.guardian}</td>
                      <td className="num">{p.kids}</td>
                      <td>{PLAN_LABEL[p.plan]} <span className="muse-c-faint muse-fs-xs">· {p.daysPerWeek} days</span></td>
                      <td className="num">{num(mealsPerWeek(p))}</td>
                      <td>{CADENCE_LABEL[p.cadence]}</td>
                      <td className="num">{money(b.amount, 2)} <span className="muse-c-faint muse-fs-xs">/ {b.unit}</span></td>
                      <td><ParentStatusPill status={p.status} /></td>
                      <td className="muse-c-soft muse-fs-xs">{p.since}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'plans' && (
          <div className="flex flex-wrap gap-6">
            <div className="flex-[1_1_16rem] min-w-56">
              <div className="muse-card-title">Meal plan mix (active)</div>
              <Bar label={PLAN_LABEL['breakfast-lunch']} count={summary.byPlan['breakfast-lunch']} total={summary.activeParents} />
              <Bar label={PLAN_LABEL['lunch']} count={summary.byPlan['lunch']} total={summary.activeParents} />
              <div className="muse-card-title mt-[1.1rem]!">Billing cadence (active)</div>
              <Bar label={CADENCE_LABEL['per-meal']} count={summary.byCadence['per-meal']} total={summary.activeParents} />
              <Bar label={CADENCE_LABEL['per-week']} count={summary.byCadence['per-week']} total={summary.activeParents} />
              <Bar label={CADENCE_LABEL['per-month']} count={summary.byCadence['per-month']} total={summary.activeParents} />
            </div>
            <div className="flex-[1_1_20rem] min-w-68">
              <div className="muse-card-title">What each active account is signed up for</div>
              <div className="muse-scroll-x">
                <table className="muse-table">
                  <thead><tr><th>Guardian</th><th>Plan</th><th className="num">Monthly equiv.</th></tr></thead>
                  <tbody>
                    {roster.filter((p) => p.status === 'active').map((p) => {
                      const b = billed(p, pricePerMeal);
                      const monthly = p.cadence === 'per-month' ? b.amount : mealsPerWeek(p) * pricePerMeal * 4.33;
                      return (
                        <tr key={p.id}>
                          <td>{p.guardian}</td>
                          <td className="muse-fs-xs muse-c-soft">
                            {p.kids} × {PLAN_LABEL[p.plan]}, {p.daysPerWeek} days · {CADENCE_LABEL[p.cadence]}
                          </td>
                          <td className="num">{money(monthly, 0)}</td>
                        </tr>
                      );
                    })}
                    <tr className="total"><td>Total</td><td></td><td className="num">{money(summary.monthlyBilled, 0)}</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="muse-kpi-sub mt-2">
                Monthly equivalent normalizes per-meal and per-week plans to a month (4.33 weeks) at
                ${pricePerMeal}/meal. Illustrative — not a bill.
              </p>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <ul className="list-none p-0 m-0! border-l-2 border-l-[color:var(--muse-line)]">
            {log.map((e) => (
              <li key={e.id} className="relative pt-0 pr-0 pb-4 pl-4">
                <span className="absolute left-[-5px] top-[0.35rem] w-[8px] h-[8px] rounded-full" style={{ background: eventColor(e.type) }} />
                <div className="flex gap-[0.6rem] items-baseline flex-wrap">
                  <span className="muse-fs-xs muse-c-faint min-w-22">{e.date}</span>
                  <EventPill type={e.type} />
                  {e.amount != null && <span className="font-semibold tabular-nums">{money(e.amount, 2)}</span>}
                </div>
                <div className="muse-fs-sm muse-c-ink mt-[0.2rem]!">{e.detail}</div>
              </li>
            ))}
            {log.length === 0 && <li className="muse-c-faint pl-4">No history for this school.</li>}
          </ul>
        )}
      </div>
    </>
  );
}

// ── bits ─────────────────────────────────────────────────────────────────────
function Kpi({ value, label, sub }: { value: React.ReactNode; label: string; sub?: string }) {
  return (
    <div className="muse-card">
      <div className="muse-kpi-value">{value}</div>
      <div className="muse-kpi-label">{label}</div>
      {sub ? <div className="muse-kpi-sub">{sub}</div> : null}
    </div>
  );
}

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="mb-2!">
      <div className="flex justify-between muse-fs-xs muse-c-soft">
        <span>{label}</span><span>{count}</span>
      </div>
      <div className="h-[6px] bg-[color:var(--muse-line)] rounded-full overflow-hidden">
        <div className="h-full bg-[color:var(--muse-forest-soft)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const PARENT_STATUS_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  active: { bg: '#ecf6ef', fg: '#2f7343', border: '#bfe0c8' },
  pending: { bg: '#fdf1dd', fg: '#8a5a12', border: '#efd9a8' },
  paused: { bg: '#f0efe9', fg: '#6b6f68', border: '#ddd8ca' },
};

function ParentStatusPill({ status }: { status: string }) {
  const c = PARENT_STATUS_COLORS[status] ?? PARENT_STATUS_COLORS.paused;
  return (
    <span className="inline-block py-[0.1rem] px-2 rounded-full muse-fs-xs font-semibold capitalize" style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}>
      {status}
    </span>
  );
}

const EVENT_LABEL: Record<string, string> = {
  enrollment: 'Enrollment',
  payment: 'Payment',
  'plan-change': 'Plan change',
  note: 'Note',
};
function eventColor(type: string): string {
  if (type === 'payment') return 'var(--muse-sourced)';
  if (type === 'enrollment') return 'var(--muse-accent)';
  if (type === 'plan-change') return 'var(--muse-placeholder)';
  return 'var(--muse-ink-faint)';
}
function EventPill({ type }: { type: string }) {
  return (
    <span className="muse-fs-2xs font-semibold uppercase tracking-[0.06em]" style={{ color: eventColor(type) }}>
      {EVENT_LABEL[type] ?? type}
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`py-[0.4rem]! px-[1.15rem]! rounded-[0.45rem]! muse-fs-sm tracking-[0.01em]! cursor-pointer! [transition:background_120ms_ease,color_120ms_ease]! ${(active ? 'border! border-[color:transparent]!' : 'border! border-[color:rgba(255,255,255,0.45)]!')} ${(active ? 'bg-[color:var(--muse-ink-strong)]!' : 'bg-[color:rgba(255,255,255,0.12)]!')} ${(active ? 'muse-c-forest' : 'text-[rgba(255,255,255,0.92)]!')} ${(active ? 'font-bold!' : 'font-semibold!')}`} style={{ boxShadow: active ? '0 1px 3px rgba(0,0,0,0.28)' : 'none' }}>
      {children}
    </button>
  );
}
