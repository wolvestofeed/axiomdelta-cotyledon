'use client';

import { NUTRITION_TARGETS } from '@/data/nutrition-targets';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Kpi, money, num } from '@/components/ui';
import { SUBSCRIBER_PAYMENT_TERMS, PAYMENT_TERMS_LABELS, type SubscriberPaymentTerms } from '@/data/working-capital';
import { SectionSave } from '@/components/SectionSave';
import { useScenario } from '@/state/scenario-store';
import { useLedger } from '@/state/ledger';
import {
  createSubscriber,
  updateSubscriber,
  deleteSubscriber,
  createSubscriberPickupPoint,
  updateSubscriberPickupPoint,
  deleteSubscriberPickupPoint,
} from '@/server/subscriber-actions';
import { SUBSCRIBER_STATUS_LABELS, type SubscriberDef, type SubscriberStatus, type SubscriberPickupPointStatus } from '@/data/subscribers';
import { SubscriptionsSection } from '@/components/SubscriptionsSection';
import type { DateRange } from '@/engine/periods';
import { FORECAST_HORIZON_OPTIONS, type ForecastHorizonYears } from '@/engine/demand';

/**
 * Subscribers. Two kinds of edit, never mixed:
 *
 *   * the RECORD — the subscriber, its pickup points and its subscriptions. Facts of record,
 *     written to the database, super admins only, on Actual.
 *   * the OPEN FORECAST — which subscribers it includes, its start date and how long it runs.
 *     Written to the forecast's overlay only; the record never moves.
 */

type Msg = { kind: 'ok' | 'err'; text: string } | null;
type Mode = 'record' | 'forecast';

interface SubscriberForm {
  name: string; channel: number; status: SubscriberStatus;
  pricePerUnit: number | ''; paymentTerms: SubscriberPaymentTerms | ''; contractStart: string; contractEnd: string; notes: string; nutritionTargets: string[]; ownUse: boolean;
}
interface PickupPointForm { name: string; pickupPointId: string; status: SubscriberPickupPointStatus; notes: string }

const emptySubscriber = (channel: number): SubscriberForm => ({ name: '', channel, status: 'prospect', pricePerUnit: '', paymentTerms: '', contractStart: '', contractEnd: '', notes: '', nutritionTargets: [], ownUse: false });
const emptyPickupPoint = (): PickupPointForm => ({ name: '', pickupPointId: '', status: 'active', notes: '' });

export function SubscribersClient({
  canEdit,
  today,
  distributionPickupPoints,
  actualUnitsByPickupPointId,
  actualUnitsByPickupPointName,
  closures,
}: {
  canEdit: boolean;
  today: string;
  distributionPickupPoints: { id: string; name: string }[];
  actualUnitsByPickupPointId: Record<string, number>;
  actualUnitsByPickupPointName: Record<string, number>;
  /** Farm closures: no distribution falls on one, and sow dates move off them. */
  closures: DateRange[];
}) {
  const { resolved, setForecast } = useScenario();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  // The bar's Plan / Actual toggle picks where edits go: the record is edited on Actual.
  const { kind: ledgerKind } = useLedger();
  const mode: Mode = ledgerKind === 'plan' ? 'forecast' : 'record';
  const [subscriberForm, setSubscriberForm] = useState<{ mode: 'create' | 'edit'; id?: string; form: SubscriberForm } | null>(null);
  const [pickupPointForm, setPickupPointForm] = useState<{ mode: 'create' | 'edit'; subscriberId: string; id?: string; form: PickupPointForm } | null>(null);

  const demand = resolved.demand;
  const forecast = resolved.forecast;
  const byChannel = resolved.phases.map((p) => ({ phase: p.phase, market: p.market, price: p.pricePerUnit, row: demand.byChannel[p.phase] }));
  const pickupPointById = useMemo(() => new Map(demand.pickupPoints.map((s) => [s.id, s])), [demand.pickupPoints]);
  const recordMode = mode === 'record' && canEdit;

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ kind: 'ok', text: okText });
        setSubscriberForm(null);
        setPickupPointForm(null);
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  // ── Record forms ──────────────────────────────────────────────────────────
  const openEditSubscriber = (c: SubscriberDef) =>
    setSubscriberForm({ mode: 'edit', id: c.id, form: { name: c.name, channel: c.channel, status: c.status, pricePerUnit: c.pricePerUnitCents === null ? '' : c.pricePerUnitCents / 100, paymentTerms: c.paymentTerms ?? '', contractStart: c.contractStart ?? '', contractEnd: c.contractEnd ?? '', notes: c.notes ?? '', nutritionTargets: [...(c.nutritionTargets ?? [])], ownUse: c.ownUse === true } });
  function submitSubscriber() {
    if (!subscriberForm) return;
    const f = subscriberForm.form;
    const payload = { name: f.name, channel: f.channel, status: f.status, pricePerUnitCents: f.pricePerUnit === '' ? null : Math.round(f.pricePerUnit * 100), paymentTerms: f.paymentTerms || null, contractStart: f.contractStart || null, contractEnd: f.contractEnd || null, prospectId: null, notes: f.notes || null, nutritionTargets: f.nutritionTargets, ownUse: f.ownUse };
    run(() => (subscriberForm.mode === 'edit' ? updateSubscriber({ ...payload, id: subscriberForm.id }) : createSubscriber(payload)), `Saved ${f.name}.`);
  }
  function submitPickupPoint() {
    if (!pickupPointForm) return;
    const f = pickupPointForm.form;
    const payload = { subscriberId: pickupPointForm.subscriberId, pickupPointId: f.pickupPointId || null, name: f.name, status: f.status, notes: f.notes || null };
    run(() => (pickupPointForm.mode === 'edit' ? updateSubscriberPickupPoint({ ...payload, id: pickupPointForm.id }) : createSubscriberPickupPoint(payload)), `Saved pickup point ${f.name}.`);
  }

  // ── Forecast edits (the overlay) ──────────────────────────────────────────
  const setIncluded = (subscriberId: string, included: boolean) =>
    setForecast((d) => {
      const all = (d.subscribers ??= {});
      if (included) delete all[subscriberId];
      else all[subscriberId] = { included: false };
    });

  const actualFor = (s: SubscriberDef['pickupPoints'][number]) => (s.pickupPointId ? actualUnitsByPickupPointId[s.pickupPointId] : undefined) ?? actualUnitsByPickupPointName[s.name] ?? 0;
  const statusBadge = (c: SubscriberDef) =>
    c.source !== 'seed' ? null : c.status === 'contracted' ? (
      <span className="farm-badge stated ml-2!" title={c.notes ?? ''}>Stated</span>
    ) : (
      <span className="farm-badge placeholder ml-2!" title={c.notes ?? ''}>Placeholder seed</span>
    );

  return (
    <>
      {msg && <div className={`farm-scenariobar-msg ${msg.kind} mt-4`} role="status">{msg.text}</div>}

      <Card title="Editing" className="mt-4">
        <div className="flex flex-wrap gap-4 items-end">
          <span className="farm-kpi-sub">{mode === 'forecast' ? 'Plan: which subscribers the open forecast includes, and when it starts.' : 'Actual: the subscriber record, its pickup points and its subscriptions.'} Switch with Plan / Actual in the forecast bar.</span>
          {mode === 'forecast' && (
            <label className="farm-kpi-sub">Forecast starts<br />
              <input className="farm-input" type="date" value={forecast.startDate} onChange={(e) => e.target.value && setForecast((d) => { d.startDate = e.target.value; })} />
            </label>
          )}
          {mode === 'forecast' && (
            <label className="farm-kpi-sub">Timeline runs<br />
              <select className="farm-select" value={forecast.horizonYears} onChange={(e) => setForecast((d) => { d.horizonYears = Number(e.target.value) as ForecastHorizonYears; })}>
                {FORECAST_HORIZON_OPTIONS.map((y) => <option key={y} value={y}>{y} year{y === 1 ? '' : 's'} from the start</option>)}
              </select>
            </label>
          )}
        </div>
        <p className="farm-kpi-sub mt-2">
          {mode === 'record'
            ? 'Changes here are facts of record: the subscriber, its pickup points and its subscriptions. Real operations run on them.'
            : 'Changes here stay in the open forecast: which subscribers it includes and the window it runs. The record does not move.'}
        </p>
        <SectionSave sections={['forecast']} title="the forecast's subscribers" />
      </Card>

      <div className="grid gap-3 mt-4 farm-autofit-11">
        {byChannel.map((c) => {
          const units = Math.round(c.row?.annualUnits ?? 0);
          const contracted = Math.round(c.row?.contractedAnnualUnits ?? 0);
          return (
            <Kpi
              key={c.phase}
              value={num(units)}
              label={`${c.market}, units in the year`}
              sub={`${num(Math.round(c.row?.unitsPerDay ?? 0))} per distribution date · ${c.row?.subscribers ?? 0} subscriber${(c.row?.subscribers ?? 0) === 1 ? '' : 's'}, ${c.row?.pickupPoints.length ?? 0} pickup point${(c.row?.pickupPoints.length ?? 0) === 1 ? '' : 's'} · ${num(contracted)} contracted, ${num(units - contracted)} planned`}
            />
          );
        })}
        <Kpi
          value={num(Math.round(demand.totalAnnualUnits))}
          label="Units in the year, all channels"
          sub={`${demand.window.from} to ${demand.window.to} · ${num(Math.round(demand.contractedAnnualUnits))} contracted`}
        />
      </div>

      {byChannel.map((ch) => {
        const subscribers = resolved.subscribers.filter((c) => c.channel === ch.phase);
        return (
          <Card key={ch.phase} title={ch.market} className="mt-4">
            {subscribers.length === 0 && <p className="farm-kpi-sub">No subscribers on this channel.</p>}
            {subscribers.map((c) => {
              const included = c.status !== 'inactive' && forecast.subscribers?.[c.id]?.included !== false;
              return (
                <div key={c.id} className={`mb-6! ${(mode === 'forecast' && !included ? 'opacity-[0.6]' : 'opacity-[1]')}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="font-semibold">{c.name}</span>
                      <span className="farm-kpi-sub ml-[0.6rem]!">
                        {SUBSCRIBER_STATUS_LABELS[c.status]} ·{' '}
                        {c.ownUse ? 'own use: to Owner Draws at cost, not sold' : c.pricePerUnitCents === null ? `channel price ${money(ch.price)}` : `${money(c.pricePerUnitCents / 100)} contracted`}
                        {' · '}{c.paymentTerms ? PAYMENT_TERMS_LABELS[c.paymentTerms] : 'no payment terms on file'}
                        {c.contractStart ? ` · ${c.contractStart}${c.contractEnd ? ` to ${c.contractEnd}` : ''}` : ''}
                      </span>
                      {statusBadge(c)}
                    </div>
                    <div className="flex gap-[0.4rem] items-center">
                      {mode === 'forecast' && c.status !== 'inactive' && (
                        <label className="farm-kpi-sub inline-flex! gap-1! items-center!">
                          <input type="checkbox" checked={included} onChange={(e) => setIncluded(c.id, e.target.checked)} />In this forecast
                        </label>
                      )}
                      {recordMode && (
                        <>
                          <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setPickupPointForm({ mode: 'create', subscriberId: c.id, form: emptyPickupPoint() })} disabled={pending}>Add pickup point</button>
                          <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => openEditSubscriber(c)} disabled={pending}>Edit</button>
                          <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => run(() => deleteSubscriber({ id: c.id }), `Removed ${c.name}.`)} disabled={pending}>Remove</button>
                        </>
                      )}
                    </div>
                  </div>
                  {c.notes && <p className="farm-kpi-sub mt-[0.2rem]!">{c.notes}</p>}
                  {c.pickupPoints.map((s) => {
                    const r = pickupPointById.get(s.id);
                    return (
                      <div key={s.id} className="mt-[0.6rem]! pl-[0.6rem] border-l-2 border-l-[color:var(--farm-line,#ddd)]">
                        <div className="farm-kpi-sub">
                          <span className="farm-c-ink font-semibold">{s.name}</span>
                          {' · '}{s.status}{s.pickupPointId ? ` · distribution pickup point ${s.pickupPointId}` : ''}
                          {' · '}{r ? `${num(r.serviceDates)} distribution dates · ${num(Math.round(r.annualUnits))} units in the year from ${forecast.startDate}` : 'not in this forecast'}
                          {' · '}actual to date {num(Math.round(actualFor(s)))}
                          {recordMode && (
                            <span className="inline-flex gap-[0.3rem] ml-[0.6rem]!">
                              <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setPickupPointForm({ mode: 'edit', subscriberId: c.id, id: s.id, form: { name: s.name, pickupPointId: s.pickupPointId ?? '', status: s.status, notes: s.notes ?? '' } })}>Edit pickup point</button>
                              <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => run(() => deleteSubscriberPickupPoint({ id: s.id }), `Removed pickup point ${s.name}.`)}>×</button>
                            </span>
                          )}
                        </div>
                        {s.notes && <p className="farm-kpi-sub mt-[0.2rem]!">{s.notes}</p>}
                      </div>
                    );
                  })}
                  {c.pickupPoints.length === 0 && <p className="farm-kpi-sub">No pickup points. This subscriber adds no demand until a pickup point and a subscription are added.</p>}
                  <SubscriptionsSection subscriber={c} growPlans={resolved.growPlans} unitPriceCents={c.pricePerUnitCents ?? Math.round(ch.price * 100)} closures={closures} today={today} canEdit={recordMode} />
                </div>
              );
            })}
            {recordMode && (
              <button type="button" className="farm-btn" onClick={() => setSubscriberForm({ mode: 'create', form: emptySubscriber(ch.phase) })} disabled={pending}>Add subscriber on {ch.market}</button>
            )}
          </Card>
        );
      })}

      {subscriberForm && (
        <Card title={subscriberForm.mode === 'edit' ? 'Edit subscriber' : 'Add subscriber'} className="mt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="farm-kpi-sub">Name<br /><input className="farm-input w-56!" value={subscriberForm.form.name} onChange={(e) => setSubscriberForm({ ...subscriberForm, form: { ...subscriberForm.form, name: e.target.value } })} /></label>
            <label className="farm-kpi-sub">Channel<br />
              <select className="farm-select" value={subscriberForm.form.channel} onChange={(e) => setSubscriberForm({ ...subscriberForm, form: { ...subscriberForm.form, channel: Number(e.target.value) } })}>
                {byChannel.map((c) => <option key={c.phase} value={c.phase}>{c.market}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub">Status<br />
              <select className="farm-select" value={subscriberForm.form.status} onChange={(e) => setSubscriberForm({ ...subscriberForm, form: { ...subscriberForm.form, status: e.target.value as SubscriberStatus } })}>
                {(Object.keys(SUBSCRIBER_STATUS_LABELS) as SubscriberStatus[]).map((k) => <option key={k} value={k}>{SUBSCRIBER_STATUS_LABELS[k]}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub inline-flex! gap-[0.3rem]! items-center!" title="The owner's own trays: they flow through production and leave finished goods at cost to Owner Draws, with no revenue and no invoice.">
              <input type="checkbox" checked={subscriberForm.form.ownUse} onChange={(e) => setSubscriberForm({ ...subscriberForm, form: { ...subscriberForm.form, ownUse: e.target.checked } })} />Own use: to Owner Draws at cost
            </label>
            <label className="farm-kpi-sub">Price / unit $ (blank = channel)<br /><input className="farm-input w-26!" type="number" min={0} step={0.01} value={subscriberForm.form.pricePerUnit} onChange={(e) => setSubscriberForm({ ...subscriberForm, form: { ...subscriberForm.form, pricePerUnit: e.target.value === '' ? '' : Number(e.target.value) } })} /></label>
            <label className="farm-kpi-sub">Payment terms<br />
              <select className="farm-select" value={subscriberForm.form.paymentTerms} onChange={(e) => setSubscriberForm({ ...subscriberForm, form: { ...subscriberForm.form, paymentTerms: e.target.value as SubscriberPaymentTerms | '' } })}>
                <option value="">No terms on file</option>
                {SUBSCRIBER_PAYMENT_TERMS.map((t) => <option key={t} value={t}>{PAYMENT_TERMS_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub">Contract start<br /><input className="farm-input" type="date" value={subscriberForm.form.contractStart} onChange={(e) => setSubscriberForm({ ...subscriberForm, form: { ...subscriberForm.form, contractStart: e.target.value } })} /></label>
            <label className="farm-kpi-sub">Contract end<br /><input className="farm-input" type="date" value={subscriberForm.form.contractEnd} onChange={(e) => setSubscriberForm({ ...subscriberForm, form: { ...subscriberForm.form, contractEnd: e.target.value } })} /></label>
            <label className="farm-kpi-sub flex-1! min-w-56!">Notes<br /><input className="farm-input w-full!" value={subscriberForm.form.notes} onChange={(e) => setSubscriberForm({ ...subscriberForm, form: { ...subscriberForm.form, notes: e.target.value } })} /></label>
            <div className="farm-kpi-sub w-full!">Nutrition targets — the nutrients and compounds the varieties carry; the Flat Builder scores the flat against them<br />
              <span className="inline-flex flex-wrap gap-x-3 gap-y-1 mt-1!">
                {NUTRITION_TARGETS.map((t) => (
                  <label key={t.key} className="inline-flex! gap-1! items-center!">
                    <input type="checkbox" checked={subscriberForm.form.nutritionTargets.includes(t.key)} onChange={(e) => setSubscriberForm({ ...subscriberForm, form: { ...subscriberForm.form, nutritionTargets: e.target.checked ? [...subscriberForm.form.nutritionTargets, t.key] : subscriberForm.form.nutritionTargets.filter((k) => k !== t.key) } })} />
                    {t.name}
                  </label>
                ))}
              </span>
            </div>
            <button type="button" className="farm-btn primary" onClick={submitSubscriber} disabled={pending || !subscriberForm.form.name.trim()}>Save</button>
            <button type="button" className="farm-btn" onClick={() => setSubscriberForm(null)} disabled={pending}>Cancel</button>
          </div>
          <p className="farm-kpi-sub mt-2">
            A Forecast Subscriber carries figures entered for planning, is used in forecasts and is never on Actual: no stored order or distribution is recorded against it.
          </p>
        </Card>
      )}

      {pickupPointForm && (
        <Card title={pickupPointForm.mode === 'edit' ? 'Edit pickup point' : 'Add pickup point'} className="mt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="farm-kpi-sub">Pickup point name<br /><input className="farm-input w-56!" value={pickupPointForm.form.name} onChange={(e) => setPickupPointForm({ ...pickupPointForm, form: { ...pickupPointForm.form, name: e.target.value } })} /></label>
            <label className="farm-kpi-sub">Distribution pickup point<br />
              <select className="farm-select" value={pickupPointForm.form.pickupPointId} onChange={(e) => { const ds = distributionPickupPoints.find((d) => d.id === e.target.value); setPickupPointForm({ ...pickupPointForm, form: { ...pickupPointForm.form, pickupPointId: e.target.value, name: pickupPointForm.form.name || ds?.name || '' } }); }}>
                <option value="">Not linked</option>
                {distributionPickupPoints.map((d) => <option key={d.id} value={d.id}>{d.id} — {d.name}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub">Status<br />
              <select className="farm-select" value={pickupPointForm.form.status} onChange={(e) => setPickupPointForm({ ...pickupPointForm, form: { ...pickupPointForm.form, status: e.target.value as SubscriberPickupPointStatus } })}>
                {(['active', 'planned', 'inactive'] as SubscriberPickupPointStatus[]).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub flex-1! min-w-56!">Notes<br /><input className="farm-input w-full!" value={pickupPointForm.form.notes} onChange={(e) => setPickupPointForm({ ...pickupPointForm, form: { ...pickupPointForm.form, notes: e.target.value } })} /></label>
            <button type="button" className="farm-btn primary" onClick={submitPickupPoint} disabled={pending || !pickupPointForm.form.name.trim()}>Save</button>
            <button type="button" className="farm-btn" onClick={() => setPickupPointForm(null)} disabled={pending}>Cancel</button>
          </div>
          <p className="farm-kpi-sub mt-2">
            A pickup point is where the subscriber collects: the house, a shared pickup spot, or their own address on a route. It carries demand once a subscription names it.
          </p>
        </Card>
      )}

      <p className="farm-kpi-sub mt-4">
        Demand on <Link className="farm-link" href="/farm/financials/pnl">P&amp;L</Link> and{' '}
        <Link className="farm-link" href="/farm/production-planning">Production Planning</Link> is what the subscriptions carry on each distribution date.
        The order book is on <Link className="farm-link" href="/farm/orders">Orders</Link>. Actual units to date come from distribution records on{' '}
        <Link className="farm-link" href="/farm/actuals">Actuals</Link>.
      </p>
    </>
  );
}
