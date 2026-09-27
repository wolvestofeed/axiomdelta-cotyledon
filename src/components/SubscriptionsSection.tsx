'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { money, num } from '@/components/ui';
import { CADENCES, CADENCE_LABELS, type Cadence, type FlatPlanLine, type SubscriptionDef } from '@/data/subscriptions';
import type { SubscriberDef } from '@/data/subscribers';
import type { GrowPlanDef } from '@/data/grow-plan';
import type { DateRange } from '@/engine/periods';
import { flatPlanOn, subscriptionDistributions, startProblem } from '@/engine/subscriptions';
import { firstUnsown, sowDateOf, startRefusal } from '@/engine/subscription-cutoffs';
import { isoAddDays } from '@/engine/orders';
import {
  createSubscription,
  changeFlatPlan,
  skipDistribution,
  unskipDistribution,
  pauseSubscription,
  resumeSubscription,
  endSubscription,
  deleteSubscription,
} from '@/server/subscription-actions';

type Msg = { kind: 'ok' | 'err'; text: string } | null;
type Res = { ok: true } | { ok: false; error: string };

const blankLine = (plans: readonly GrowPlanDef[]): FlatPlanLine => ({ growPlanCode: plans[0]?.code ?? '', units: 1 });

/** A flat plan's lines, edited in place: a grow plan offered on the subscriber's channel and whole units. */
function LinesEditor({ lines, plans, onChange }: { lines: FlatPlanLine[]; plans: readonly GrowPlanDef[]; onChange: (next: FlatPlanLine[]) => void }) {
  return (
    <div className="flex flex-col gap-[0.3rem]">
      {lines.map((l, i) => (
        <div key={i} className="flex flex-wrap gap-2 items-center">
          <select className="farm-select" value={l.growPlanCode} onChange={(e) => onChange(lines.map((x, j) => (j === i ? { ...x, growPlanCode: e.target.value } : x)))}>
            {plans.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
          </select>
          <input type="number" min={1} step={1} className="farm-input w-20!" aria-label="Units" value={l.units} onChange={(e) => onChange(lines.map((x, j) => (j === i ? { ...x, units: Math.max(1, Math.round(Number(e.target.value))) } : x)))} />
          {lines.length > 1 && <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => onChange(lines.filter((_, j) => j !== i))}>×</button>}
        </div>
      ))}
      <div><button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => onChange([...lines, blankLine(plans.filter((p) => !lines.some((l) => l.growPlanCode === p.code)))])}>+ grow plan</button></div>
    </div>
  );
}

/**
 * A subscriber's subscriptions on Subscribers: each one's cadence, pickup point and flat plan, its
 * next distributions with their sow dates, and the edits the sow dates allow.
 */
export function SubscriptionsSection({
  subscriber,
  growPlans,
  unitPriceCents,
  closures,
  today,
  canEdit,
}: {
  subscriber: SubscriberDef;
  growPlans: readonly GrowPlanDef[];
  /** The subscriber's price per unit, else the channel's. */
  unitPriceCents: number;
  closures: readonly DateRange[];
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const offered = useMemo(() => growPlans.filter((p) => p.status === 'in_service' && p.channels.includes(subscriber.channel)), [growPlans, subscriber.channel]);
  const rules = useMemo(() => ({ plans: growPlans, closures }), [growPlans, closures]);
  const names = useMemo(() => new Map(growPlans.map((p) => [p.code, p.name])), [growPlans]);
  const subs = subscriber.subscriptions ?? [];
  const pickupName = (id: string) => subscriber.pickupPoints.find((p) => p.id === id)?.name ?? 'pickup point removed';
  const linesText = (lines: readonly FlatPlanLine[]) => (lines.length ? lines.map((l) => `${l.growPlanCode} ${names.get(l.growPlanCode) ?? ''} × ${num(l.units)}`).join(', ') : 'nothing');
  const perDistribution = (lines: readonly FlatPlanLine[]) => lines.reduce((t, l) => t + l.units, 0) * unitPriceCents;

  const [adding, setAdding] = useState<null | { pickupPointId: string; cadence: Cadence; startDate: string; endDate: string; lines: FlatPlanLine[]; notes: string }>(null);
  const [editing, setEditing] = useState<null | { id: string; lines: FlatPlanLine[] }>(null);
  const [ending, setEnding] = useState<null | { id: string; endDate: string }>(null);

  function run(fn: () => Promise<Res & Record<string, unknown>>, okText: (r: Record<string, unknown>) => string, after?: () => void) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        setMsg({ kind: 'ok', text: okText(r) });
        after?.();
        router.refresh();
      } else setMsg({ kind: 'err', text: r.error });
    });
  }

  const addProblem = adding ? startProblem(adding.cadence, adding.startDate) ?? startRefusal(adding.startDate, adding.lines, today, rules) : null;

  return (
    <div className="mt-[0.6rem]!">
      <div className="farm-kpi-sub farm-c-ink font-semibold">Subscriptions</div>
      {msg && <div className={`farm-scenariobar-msg ${msg.kind} my-[0.4rem]!`} role="status">{msg.text}</div>}
      {subs.length === 0 && <p className="farm-kpi-sub">No subscription on file.</p>}
      {subs.map((s: SubscriptionDef) => {
        const upcoming = subscriptionDistributions(s, today, isoAddDays(today, 120), closures).slice(0, 5);
        const current = flatPlanOn(s, upcoming[0]?.date ?? today);
        const ended = s.endDate !== null && s.endDate < today;
        return (
          <div key={s.id} className="mt-[0.4rem]! pl-[0.6rem] border-l-2 border-l-[color:var(--farm-line,#ddd)]">
            <div className="farm-kpi-sub">
              <span className="farm-c-ink">{CADENCE_LABELS[s.cadence]}</span> at {pickupName(s.subscriberPickupPointId)}, from {s.startDate}{s.endDate ? ` to ${s.endDate}` : ''}
              {' · '}{s.pausedFrom ? `paused from ${s.pausedFrom}` : ended ? 'ended' : 'running'}
              {' · '}{linesText(current)}, {money(perDistribution(current) / 100)} a distribution
            </div>
            {s.flatPlan.length > 1 && (
              <div className="farm-kpi-sub">Flat plan by date: {s.flatPlan.map((v) => `from ${v.from}, ${linesText(v.lines)}`).join('; ')}</div>
            )}
            {s.notes && <div className="farm-kpi-sub">{s.notes}</div>}
            {upcoming.length > 0 && (
              <div className="farm-scroll-x mt-[0.3rem]!">
                <table className="farm-table compact">
                  <thead><tr><th>Distribution</th><th>Sow date</th><th>Carries</th><th /></tr></thead>
                  <tbody>
                    {upcoming.map((d) => {
                      const sow = sowDateOf(d.lines, d.date, rules);
                      const sown = sow !== null && sow <= today;
                      return (
                        <tr key={d.date}>
                          <td>{d.date}</td>
                          <td>{sow ?? '—'}{sown ? ' (sown)' : ''}</td>
                          <td>{d.skipped ? 'skipped' : d.paused ? 'paused' : d.closed ? 'farm closed' : `${linesText(d.lines)}, ${money(perDistribution(d.lines) / 100)}`}</td>
                          <td>
                            {canEdit && !sown && !d.paused && !d.closed && (d.skipped
                              ? <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => run(() => unskipDistribution({ id: s.id, date: d.date }), () => `${d.date} is back on.`)}>Unskip</button>
                              : <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => run(() => skipDistribution({ id: s.id, date: d.date }), () => `${d.date} skipped; nothing is sown or billed for it.`)}>Skip</button>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {canEdit && (
              <div className="flex flex-wrap gap-[0.3rem] mt-[0.3rem]!">
                <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setEditing({ id: s.id, lines: current.length ? current.map((l) => ({ ...l })) : [blankLine(offered)] })}>Change flat plan</button>
                {s.pausedFrom
                  ? <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => run(() => resumeSubscription({ id: s.id }), (r) => `Resumed; distributions run again from ${String(r.from ?? 'the next one')}.`)}>Resume</button>
                  : <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => run(() => pauseSubscription({ id: s.id }), (r) => `Paused from ${String(r.from)}, the first distribution not yet sown.`)}>Pause</button>}
                <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setEnding({ id: s.id, endDate: s.endDate ?? '' })}>Last date</button>
                <button type="button" className="farm-btn ghost py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => run(() => deleteSubscription({ id: s.id }), () => 'Subscription removed.')}>Remove</button>
              </div>
            )}
            {editing?.id === s.id && (
              <div className="mt-[0.4rem]!">
                <LinesEditor lines={editing.lines} plans={offered} onChange={(lines) => setEditing({ id: s.id, lines })} />
                <p className="farm-kpi-sub mt-[0.3rem]!">Takes effect from {firstUnsown(s, today, rules, editing.lines) ?? 'no distribution in the next year'}, the first distribution these lines can still be sown for; {money(perDistribution(editing.lines) / 100)} a distribution.</p>
                <div className="flex gap-[0.3rem] mt-[0.3rem]!">
                  <button type="button" className="farm-btn primary" disabled={pending} onClick={() => run(() => changeFlatPlan({ id: s.id, lines: editing.lines }), (r) => `Flat plan changed from ${String(r.from)}.`, () => setEditing(null))}>Save flat plan</button>
                  <button type="button" className="farm-btn ghost" onClick={() => setEditing(null)}>Cancel</button>
                </div>
              </div>
            )}
            {ending?.id === s.id && (
              <div className="flex flex-wrap gap-[0.3rem] items-end mt-[0.4rem]!">
                <label className="farm-kpi-sub">Last date<br /><input type="date" className="farm-input" value={ending.endDate} onChange={(e) => setEnding({ id: s.id, endDate: e.target.value })} /></label>
                <button type="button" className="farm-btn primary" disabled={pending} onClick={() => run(() => endSubscription({ id: s.id, endDate: ending.endDate || null }), () => (ending.endDate ? `Last date ${ending.endDate}.` : 'Open-ended.'), () => setEnding(null))}>{ending.endDate ? 'Set last date' : 'Clear last date'}</button>
                <button type="button" className="farm-btn ghost" onClick={() => setEnding(null)}>Cancel</button>
              </div>
            )}
          </div>
        );
      })}

      {canEdit && !adding && (
        <button type="button" className="farm-btn mt-[0.4rem]!" disabled={pending || subscriber.pickupPoints.length === 0 || offered.length === 0} onClick={() => setAdding({ pickupPointId: subscriber.pickupPoints[0]?.id ?? '', cadence: 'biweekly', startDate: isoAddDays(today, 14), endDate: '', lines: [blankLine(offered)], notes: '' })}>Add subscription</button>
      )}
      {canEdit && subscriber.pickupPoints.length === 0 && <p className="farm-kpi-sub">A subscription is at one of the subscriber&rsquo;s pickup points; add one first.</p>}
      {canEdit && subscriber.pickupPoints.length > 0 && offered.length === 0 && <p className="farm-kpi-sub">No grow plan in service is offered on this subscriber&rsquo;s channel.</p>}
      {adding && (
        <div className="mt-[0.4rem]! farm-card">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="farm-kpi-sub">Pickup point<br />
              <select className="farm-select" value={adding.pickupPointId} onChange={(e) => setAdding({ ...adding, pickupPointId: e.target.value })}>
                {subscriber.pickupPoints.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub">Cadence<br />
              <select className="farm-select" value={adding.cadence} onChange={(e) => setAdding({ ...adding, cadence: e.target.value as Cadence })}>
                {CADENCES.map((c) => <option key={c} value={c}>{CADENCE_LABELS[c]}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub">First distribution<br /><input type="date" className="farm-input" value={adding.startDate} onChange={(e) => setAdding({ ...adding, startDate: e.target.value })} /></label>
            <label className="farm-kpi-sub">Last date (optional)<br /><input type="date" className="farm-input" value={adding.endDate} onChange={(e) => setAdding({ ...adding, endDate: e.target.value })} /></label>
          </div>
          <div className="farm-kpi-sub mt-[0.4rem]!">Flat plan, each distribution</div>
          <LinesEditor lines={adding.lines} plans={offered} onChange={(lines) => setAdding({ ...adding, lines })} />
          <label className="farm-kpi-sub block mt-[0.4rem]!">Note<br /><input className="farm-input w-full!" value={adding.notes} onChange={(e) => setAdding({ ...adding, notes: e.target.value })} /></label>
          <p className="farm-kpi-sub mt-[0.3rem]!">
            {addProblem ?? `First sow date ${sowDateOf(adding.lines, adding.startDate, rules) ?? '—'}; ${money(perDistribution(adding.lines) / 100)} a distribution, billed as each is handed over.`}
          </p>
          <div className="flex gap-[0.3rem] mt-[0.3rem]!">
            <button type="button" className="farm-btn primary" disabled={pending || addProblem !== null} onClick={() => run(() => createSubscription({ subscriberId: subscriber.id, subscriberPickupPointId: adding.pickupPointId, cadence: adding.cadence, startDate: adding.startDate, endDate: adding.endDate || null, lines: adding.lines, notes: adding.notes }), () => 'Subscription started.', () => setAdding(null))}>Start subscription</button>
            <button type="button" className="farm-btn ghost" onClick={() => setAdding(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
