'use client';

import { NUTRITION_TARGETS } from '@/data/nutrition-targets';

import { Fragment, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Kpi, money, num, pct } from '@/components/ui';
import { SUBSCRIBER_PAYMENT_TERMS, PAYMENT_TERMS_LABELS, type SubscriberPaymentTerms } from '@/data/working-capital';
import { SectionSave } from '@/components/SectionSave';
import { FlatPlanForm, SequenceTable, emptySequence, valuesOf, type SequenceValues } from '@/components/FlatPlanForm';
import { useScenario } from '@/state/scenario-store';
import { useLedger } from '@/state/ledger';
import {
  createSubscriber,
  updateSubscriber,
  deleteSubscriber,
  createSubscriberPickupPoint,
  updateSubscriberPickupPoint,
  deleteSubscriberPickupPoint,
  createSubscriberService,
  updateSubscriberService,
  deleteSubscriberService,
  setVolumePick,
  deleteVolumePick,
  createPickupPointCalendarRange,
  deletePickupPointCalendarRange,
  setSubscriberRating,
} from '@/server/subscriber-actions';
import { RatingPill } from '@/components/MarkRating';
import { MARK, NOT_RATED } from '@/data/mark';
import { assignSubscriptionCycle, createSubscriptionCycle, updateSubscriptionCycle, deleteSubscriptionCycle } from '@/server/order-actions';
import {
  SUBSCRIBER_KIND_LABELS,
  SUBSCRIBER_STATUS_LABELS,
  type SubscriberDef,
  type SubscriberKind,
  type SubscriberPickupPointDef,
  type SubscriberStatus,
  type SubscriberPickupPointStatus,
  type PickupPointCalendarKind,
} from '@/data/subscribers';
import { WEEKDAY_LABELS, type SubscriptionCycleDef, type OrderDef } from '@/data/subscription-cycles';
import { pickupPointParticipation } from '@/engine/participation';
import { copyCycleToPlan, flatPlansOf, savedCycles } from '@/engine/flat-plans';
import { normalizePicks, volumeOn } from '@/engine/services';
import { FORECAST_HORIZON_OPTIONS, type ForecastHorizonYears, type ResolvedServiceForecast, type ResolvedPickupPointForecast } from '@/engine/demand';

/**
 * Subscribers (Roadmap N4a). Two kinds of edit, never mixed:
 *
 *   * the RECORD — the subscriber, its pickup points, each pickup point's services and dated
 *     volume picks, its service calendar and the subscriber's flat plan. Facts of
 *     record, written to the database, super admins only.
 *   * the OPEN FORECAST — which subscribers it includes, a service's volume picks
 *     and weekdays, and its own copy of a subscriber's flat plan. Written to the
 *     forecast's overlay only; the record never moves. Anything the forecast
 *     has not edited follows the record.
 */

type Msg = { kind: 'ok' | 'err'; text: string } | null;
type Mode = 'record' | 'forecast';

interface SubscriberForm {
  name: string; kind: SubscriberKind; channel: number; status: SubscriberStatus;
  pricePerUnit: number | ''; paymentTerms: SubscriberPaymentTerms | ''; contractStart: string; contractEnd: string; notes: string; nutritionTargets: string[];
}
interface PickupPointForm { name: string; pickupPointId: string; trayFormats: string[]; enrollment: number | ''; status: SubscriberPickupPointStatus; notes: string }
interface ServiceForm { name: string; weekdays: number[]; status: 'active' | 'inactive'; notes: string }

const emptySubscriber = (channel: number): SubscriberForm => ({ name: '', kind: channel === 1 ? 'district' : channel === 2 ? 'company' : 'marketplace', channel, status: 'prospect', pricePerUnit: '', paymentTerms: '', contractStart: '', contractEnd: '', notes: '', nutritionTargets: [] });
const emptyPickupPoint = (): PickupPointForm => ({ name: '', pickupPointId: '', trayFormats: [], enrollment: '', status: 'active', notes: '' });
const weekdayText = (w: readonly number[]) => (w.length ? [...w].sort().map((d) => WEEKDAY_LABELS[d]).join(' ') : 'no weekday');

let localSeq = 0;
const localId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(localSeq++).toString(36)}`;

export function SubscribersClient({
  canEdit,
  today,
  cycles,
  orders,
  distributionPickupPoints,
  actualUnitsByPickupPointId,
  actualUnitsByPickupPointName,
}: {
  canEdit: boolean;
  today: string;
  /** Saved subscription cycles and every subscriber's flat plans, as on the record. */
  cycles: SubscriptionCycleDef[];
  /** Stored orders, for participation: confirmed and distributed only are counted. */
  orders: OrderDef[];
  distributionPickupPoints: { id: string; name: string }[];
  actualUnitsByPickupPointId: Record<string, number>;
  actualUnitsByPickupPointName: Record<string, number>;
}) {
  const { resolved, setForecast } = useScenario();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  // The bar's Plan / Actual toggle picks where volume and flat-plan edits go (Roadmap N6 slice 3).
  const { kind: ledgerKind } = useLedger();
  const mode: Mode = ledgerKind === 'plan' ? 'forecast' : 'record';
  const [subscriberForm, setSubscriberForm] = useState<{ mode: 'create' | 'edit'; id?: string; form: SubscriberForm } | null>(null);
  const [pickupPointForm, setPickupPointForm] = useState<{ mode: 'create' | 'edit'; subscriberId: string; id?: string; form: PickupPointForm } | null>(null);
  const [serviceForm, setServiceForm] = useState<{ mode: 'create' | 'edit'; pickupPointId: string; id?: string; form: ServiceForm } | null>(null);
  const [pickForm, setPickForm] = useState<{ serviceId: string; effectiveDate: string; units: number | '' } | null>(null);
  const [rangeForm, setRangeForm] = useState<{ pickupPointId: string; kind: PickupPointCalendarKind; label: string; startDate: string; endDate: string } | null>(null);
  const [planForm, setPlanForm] = useState<{ subscriberId: string; id?: string; initial: SequenceValues } | null>(null);
  const [assignForm, setAssignForm] = useState<{ subscriberId: string; cycleId: string; startDate: string; subscriberServiceId: string } | null>(null);

  const demand = resolved.demand;
  const forecast = resolved.forecast;
  const byChannel = resolved.phases.map((p) => ({ phase: p.phase, market: p.market, price: p.pricePerUnit, row: demand.byChannel[p.phase] }));
  const pickupPointById = useMemo(() => new Map(demand.pickupPoints.map((s) => [s.id, s])), [demand.pickupPoints]);
  const growPlanNames = useMemo(() => Object.fromEntries(resolved.growPlans.map((r) => [r.code, r.name])), [resolved.growPlans]);
  const saved = useMemo(() => savedCycles(cycles), [cycles]);
  const cycleName = useMemo(() => new Map(cycles.map((c) => [c.id, c.name])), [cycles]);
  const recordMode = mode === 'record' && canEdit;

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ kind: 'ok', text: okText });
        setSubscriberForm(null);
        setPickupPointForm(null);
        setServiceForm(null);
        setPickForm(null);
        setRangeForm(null);
        setPlanForm(null);
        setAssignForm(null);
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }
  const note = (text: string) => setMsg({ kind: 'ok', text });

  // ── Record forms ──────────────────────────────────────────────────────────
  const openEditSubscriber = (c: SubscriberDef) =>
    setSubscriberForm({ mode: 'edit', id: c.id, form: { name: c.name, kind: c.kind, channel: c.channel, status: c.status, pricePerUnit: c.pricePerUnitCents === null ? '' : c.pricePerUnitCents / 100, paymentTerms: c.paymentTerms ?? '', contractStart: c.contractStart ?? '', contractEnd: c.contractEnd ?? '', notes: c.notes ?? '', nutritionTargets: [...(c.nutritionTargets ?? [])] } });
  function submitSubscriber() {
    if (!subscriberForm) return;
    const f = subscriberForm.form;
    const payload = { name: f.name, kind: f.kind, channel: f.channel, status: f.status, pricePerUnitCents: f.pricePerUnit === '' ? null : Math.round(f.pricePerUnit * 100), paymentTerms: f.paymentTerms || null, contractStart: f.contractStart || null, contractEnd: f.contractEnd || null, prospectId: null, notes: f.notes || null, nutritionTargets: f.nutritionTargets };
    run(() => (subscriberForm.mode === 'edit' ? updateSubscriber({ ...payload, id: subscriberForm.id }) : createSubscriber(payload)), `Saved ${f.name}.`);
  }
  function submitPickupPoint() {
    if (!pickupPointForm) return;
    const f = pickupPointForm.form;
    const payload = { subscriberId: pickupPointForm.subscriberId, pickupPointId: f.pickupPointId || null, name: f.name, trayFormats: f.trayFormats, enrollment: f.enrollment === '' ? null : f.enrollment, status: f.status, notes: f.notes || null };
    run(() => (pickupPointForm.mode === 'edit' ? updateSubscriberPickupPoint({ ...payload, id: pickupPointForm.id }) : createSubscriberPickupPoint(payload)), `Saved pickup point ${f.name}.`);
  }
  function submitService() {
    if (!serviceForm) return;
    const f = serviceForm.form;
    const payload = { name: f.name, weekdays: f.weekdays, status: f.status, notes: f.notes || null };
    run(() => (serviceForm.mode === 'edit' ? updateSubscriberService({ ...payload, id: serviceForm.id }) : createSubscriberService({ ...payload, subscriberPickupPointId: serviceForm.pickupPointId })), `Saved service ${f.name}.`);
  }

  // ── Forecast edits (the overlay) ──────────────────────────────────────────
  const setIncluded = (subscriberId: string, included: boolean) =>
    setForecast((d) => {
      const all = (d.subscribers ??= {});
      if (included) delete all[subscriberId];
      else all[subscriberId] = { included: false };
    });
  const forecastPicks = (sv: ResolvedServiceForecast) => normalizePicks(sv.picks);
  const setForecastPicks = (serviceId: string, picks: { effectiveDate: string; units: number }[] | undefined) =>
    setForecast((d) => {
      const all = (d.services ??= {});
      const row = (all[serviceId] ??= {});
      row.picks = picks;
    });
  const setForecastWeekdays = (serviceId: string, weekdays: number[] | undefined) =>
    setForecast((d) => {
      const all = (d.services ??= {});
      const row = (all[serviceId] ??= {});
      row.weekdays = weekdays;
    });
  const forecastPlansOf = (subscriberId: string): SubscriptionCycleDef[] | null => forecast.flatPlans?.[subscriberId] ?? null;
  const setForecastPlans = (subscriberId: string, plans: SubscriptionCycleDef[] | undefined) =>
    setForecast((d) => {
      const all = (d.flatPlans ??= {});
      if (plans === undefined) delete all[subscriberId];
      else all[subscriberId] = plans;
      if (Object.keys(all).length === 0) delete d.flatPlans;
    });

  function submitPick() {
    if (!pickForm || pickForm.units === '') return;
    const { serviceId, effectiveDate, units } = pickForm;
    if (recordMode) {
      run(() => setVolumePick({ serviceId, effectiveDate, units }), `From ${effectiveDate}: ${num(units)} units per service.`);
      return;
    }
    const sv = demand.pickupPoints.flatMap((s) => s.services).find((x) => x.id === serviceId);
    if (!sv) return;
    setForecastPicks(serviceId, [...forecastPicks(sv).filter((p) => p.effectiveDate !== effectiveDate), { effectiveDate, units }]);
    setPickForm(null);
    note(`In this forecast, from ${effectiveDate}: ${num(units)} units per service.`);
  }

  function submitPlan(v: SequenceValues) {
    if (!planForm) return;
    const subscriber = resolved.subscribers.find((c) => c.id === planForm.subscriberId);
    if (!subscriber) return;
    if (recordMode) {
      const payload = { ...v, subscriberId: subscriber.id };
      const id = planForm.id;
      run(async () => (id ? updateSubscriptionCycle({ ...payload, id }) : createSubscriptionCycle(payload)), `Saved ${subscriber.name}'s flat plan.`);
      return;
    }
    const current = forecastPlansOf(subscriber.id) ?? [];
    const base = current.find((p) => p.id === planForm.id);
    const next: SubscriptionCycleDef = {
      id: base?.id ?? localId('FPLAN'),
      channel: null,
      subscriberId: subscriber.id,
      fromCycleId: base?.fromCycleId ?? null,
      source: 'user_built',
      ...v,
    };
    setForecastPlans(subscriber.id, [...current.filter((p) => p.id !== next.id), next]);
    setPlanForm(null);
    note(`${subscriber.name}'s flat plan edited in this forecast.`);
  }

  function submitAssign() {
    if (!assignForm) return;
    const cycle = saved.find((c) => c.id === assignForm.cycleId);
    const subscriber = resolved.subscribers.find((c) => c.id === assignForm.subscriberId);
    if (!cycle || !subscriber) return;
    const subscriberServiceId = assignForm.subscriberServiceId || null;
    if (recordMode) {
      run(() => assignSubscriptionCycle({ cycleId: cycle.id, subscriberIds: [subscriber.id], subscriberServiceId, startDate: assignForm.startDate }), `${cycle.name} copied onto ${subscriber.name}'s flat plan.`);
      return;
    }
    const current = forecastPlansOf(subscriber.id) ?? [];
    setForecastPlans(subscriber.id, [...current, copyCycleToPlan(cycle, subscriber.id, localId('FPLAN'), { startDate: assignForm.startDate, subscriberServiceId })]);
    setAssignForm(null);
    note(`${cycle.name} copied onto ${subscriber.name}'s flat plan in this forecast.`);
  }

  const actualFor = (s: SubscriberPickupPointDef) => (s.pickupPointId ? actualUnitsByPickupPointId[s.pickupPointId] : undefined) ?? actualUnitsByPickupPointName[s.name] ?? 0;
  const statusBadge = (c: SubscriberDef) =>
    c.source !== 'seed' ? null : c.status === 'contracted' ? (
      <span className="farm-badge stated ml-2!" title={c.notes ?? ''}>Stated</span>
    ) : (
      <span className="farm-badge placeholder ml-2!" title={c.notes ?? ''}>Placeholder seed</span>
    );

  // ── Rendering ─────────────────────────────────────────────────────────────
  function renderPlans(c: SubscriberDef, included: boolean) {
    const recordPlans = flatPlansOf(cycles, c.id);
    const forecastPlans = forecastPlansOf(c.id);
    const shown = mode === 'forecast' && forecastPlans ? forecastPlans : recordPlans;
    const editable = recordMode || (mode === 'forecast' && forecastPlans !== null);
    const services = c.pickupPoints.flatMap((s) => s.services.map((sv) => ({ id: sv.id, label: c.pickupPoints.length > 1 ? `${s.name} · ${sv.name}` : sv.name })));
    const serviceLabel = (id: string | null) => (id ? services.find((x) => x.id === id)?.label ?? 'a removed service' : 'every service');
    return (
      <div className="mt-[0.6rem]!">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="farm-kpi-sub">
            <span className="farm-c-ink font-semibold">Flat plan</span>
            {mode === 'forecast' && (forecastPlans ? ' · this forecast’s own copy' : ' · as on the record')}
          </span>
          {included && (
            <span className="inline-flex gap-[0.3rem]">
              {mode === 'forecast' && !forecastPlans && (
                <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => { setForecastPlans(c.id, structuredClone(recordPlans)); note(`${c.name}'s flat plan copied into this forecast; the record is unchanged.`); }}>Edit in this forecast</button>
              )}
              {mode === 'forecast' && forecastPlans && (
                <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => { setForecastPlans(c.id, undefined); note(`${c.name} follows the record's flat plan again.`); }}>Use the record’s plan</button>
              )}
              {editable && (
                <>
                  <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending || saved.length === 0} onClick={() => setAssignForm({ subscriberId: c.id, cycleId: saved[0]?.id ?? '', startDate: saved[0]?.startDate ?? today, subscriberServiceId: '' })}>Assign a saved cycle</button>
                  <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setPlanForm({ subscriberId: c.id, initial: emptySequence(today, `${c.name} flat plan`) })}>Program a sequence</button>
                </>
              )}
            </span>
          )}
        </div>
        {shown.length === 0 && <p className="farm-kpi-sub">No flat plan. This subscriber&rsquo;s services generate no forecast orders until one is assigned or programmed.</p>}
        {shown.map((p) => (
          <div key={p.id} className="farm-scroll-x mt-[0.35rem]!">
            <div className="farm-kpi-sub">
              {p.name} · {p.fromCycleId ? `copied from ${cycleName.get(p.fromCycleId) ?? 'a removed cycle'}` : 'programmed for this subscriber'} · serves {serviceLabel(p.subscriberServiceId)} · from {p.startDate}{p.endDate ? ` to ${p.endDate}` : ''} · {p.lengthDays}-day sequence on {weekdayText(p.weekdays)} · {p.status}
              {editable && (
                <span className="inline-flex gap-[0.3rem] ml-[0.6rem]!">
                  <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setPlanForm({ subscriberId: c.id, id: p.id, initial: valuesOf(p) })}>Edit</button>
                  <button
                    type="button"
                    className="farm-btn py-[0.1rem]! px-[0.4rem]!"
                    disabled={pending}
                    onClick={() => (recordMode ? run(() => deleteSubscriptionCycle({ id: p.id }), `Removed a flat plan from ${c.name}.`) : setForecastPlans(c.id, (forecastPlans ?? []).filter((x) => x.id !== p.id)))}
                  >
                    Remove
                  </button>
                </span>
              )}
            </div>
            <SequenceTable plan={p} growPlanNames={growPlanNames} />
          </div>
        ))}
        {assignForm?.subscriberId === c.id && (
          <div className="mt-2! flex flex-wrap gap-3 items-end">
            <label className="farm-kpi-sub">Saved cycle<br />
              <select className="farm-select" value={assignForm.cycleId} onChange={(e) => setAssignForm({ ...assignForm, cycleId: e.target.value })}>
                {saved.map((cy) => <option key={cy.id} value={cy.id}>{cy.name}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub">Starts<br /><input className="farm-input" type="date" value={assignForm.startDate} onChange={(e) => e.target.value && setAssignForm({ ...assignForm, startDate: e.target.value })} /></label>
            {services.length > 1 && (
              <label className="farm-kpi-sub">Serves<br />
                <select className="farm-select" value={assignForm.subscriberServiceId} onChange={(e) => setAssignForm({ ...assignForm, subscriberServiceId: e.target.value })}>
                  <option value="">Every service</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.label} only</option>)}
                </select>
              </label>
            )}
            <button type="button" className="farm-btn primary" disabled={pending || !assignForm.cycleId} onClick={submitAssign}>Assign</button>
            <button type="button" className="farm-btn" disabled={pending} onClick={() => setAssignForm(null)}>Cancel</button>
            <span className="farm-kpi-sub">A copy: later edits to the saved cycle reach this plan only when applied to it.</span>
          </div>
        )}
        {planForm?.subscriberId === c.id && (
          <FlatPlanForm
            key={planForm.id ?? 'new'}
            title={`${planForm.id ? 'Edit' : 'Program'} ${c.name}'s flat plan${recordMode ? '' : ' — this forecast'}`}
            initial={planForm.initial}
            growPlans={resolved.growPlans}
            channel={c.channel}
            services={services.length > 1 ? services : []}
            pending={pending}
            onSave={submitPlan}
            onCancel={() => setPlanForm(null)}
          />
        )}
      </div>
    );
  }

  function renderCalendar(s: SubscriberPickupPointDef, r: ResolvedPickupPointForecast | undefined) {
    const calendar = s.calendar;
    return (
      <div className="farm-kpi-sub mt-[0.35rem]!">
        <span className="farm-c-ink">Service calendar</span>
        {' · '}
        {calendar.length === 0
          ? 'no term dates on file — the pickup point takes units on every service weekday the farm is open'
          : calendar.map((x) => `${x.kind === 'term' ? 'Term' : 'Break'}${x.label ? ` “${x.label}”` : ''} ${x.startDate} to ${x.endDate}`).join(' · ')}
        {r && !r.calendarOnFile && calendar.length > 0 ? ' · breaks only, no term: every other service weekday counts' : ''}
        {canEdit && (
          <span className="inline-flex gap-[0.3rem] ml-[0.6rem]! flex-wrap">
            {calendar.map((x) => (
              <button key={x.id} type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => run(() => deletePickupPointCalendarRange({ id: x.id }), `Removed ${x.kind} ${x.startDate} to ${x.endDate}.`)}>× {x.kind} {x.startDate}</button>
            ))}
            <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setRangeForm({ pickupPointId: s.id, kind: calendar.some((x) => x.kind === 'term') ? 'break' : 'term', label: '', startDate: today, endDate: today })}>Add dates</button>
          </span>
        )}
        {rangeForm?.pickupPointId === s.id && (
          <div className="mt-[0.4rem]! flex flex-wrap gap-3 items-end">
            <label>Kind<br />
              <select className="farm-select" value={rangeForm.kind} onChange={(e) => setRangeForm({ ...rangeForm, kind: e.target.value as PickupPointCalendarKind })}>
                <option value="term">Term — takes units</option><option value="break">Break — no units</option>
              </select>
            </label>
            <label>Label<br /><input className="farm-input w-56!" value={rangeForm.label} onChange={(e) => setRangeForm({ ...rangeForm, label: e.target.value })} /></label>
            <label>From<br /><input className="farm-input" type="date" value={rangeForm.startDate} onChange={(e) => e.target.value && setRangeForm({ ...rangeForm, startDate: e.target.value })} /></label>
            <label>To<br /><input className="farm-input" type="date" value={rangeForm.endDate} onChange={(e) => e.target.value && setRangeForm({ ...rangeForm, endDate: e.target.value })} /></label>
            <button type="button" className="farm-btn primary" disabled={pending || rangeForm.endDate < rangeForm.startDate} onClick={() => run(() => createPickupPointCalendarRange({ subscriberPickupPointId: s.id, kind: rangeForm.kind, label: rangeForm.label || null, startDate: rangeForm.startDate, endDate: rangeForm.endDate }), `Added a ${rangeForm.kind} to ${s.name}.`)}>Save</button>
            <button type="button" className="farm-btn" disabled={pending} onClick={() => setRangeForm(null)}>Cancel</button>
          </div>
        )}
      </div>
    );
  }

  function renderServices(c: SubscriberDef, s: SubscriberPickupPointDef, r: ResolvedPickupPointForecast | undefined, included: boolean) {
    return (
      <div className="farm-scroll-x mt-[0.4rem]!">
        <table className="farm-table">
          <thead>
            <tr>
              <th>Service</th><th>Runs on</th><th className="num">Units / service at {forecast.startDate}</th><th>Volume changes</th><th className="num">Service dates, year</th><th className="num">Units, year</th><th />
            </tr>
          </thead>
          <tbody>
            {s.services.map((sv) => {
              const rs = r?.services.find((x) => x.id === sv.id);
              const picks = rs ? forecastPicks(rs) : normalizePicks(sv.picks);
              const shownPicks = mode === 'record' ? normalizePicks(sv.picks) : picks;
              const recordPicks = new Map(sv.picks.map((p) => [p.effectiveDate, p]));
              const weekdays = mode === 'record' ? sv.weekdays : rs?.weekdays ?? sv.weekdays;
              const overlay = forecast.services?.[sv.id];
              return (
                <Fragment key={sv.id}>
                  <tr>
                    <td>
                      {sv.name}
                      <div className="farm-c-faint farm-fs-xs">{sv.status}{mode === 'forecast' && rs?.edited ? ' · edited in this forecast' : ''}</div>
                    </td>
                    <td>
                      {mode === 'forecast' && included ? (
                        <span className="inline-flex gap-[0.35rem] flex-wrap">
                          {WEEKDAY_LABELS.map((w, i) => (
                            <label key={w} className="inline-flex! gap-[0.15rem]! items-center! farm-fs-xs">
                              <input type="checkbox" checked={weekdays.includes(i)} onChange={(e) => { const next = e.target.checked ? [...weekdays, i].sort() : weekdays.filter((x) => x !== i); setForecastWeekdays(sv.id, JSON.stringify(next) === JSON.stringify([...sv.weekdays].sort()) ? undefined : next); }} />{w}
                            </label>
                          ))}
                        </span>
                      ) : (
                        weekdayText(weekdays)
                      )}
                    </td>
                    <td className="num">{num(volumeOn(shownPicks, forecast.startDate))}</td>
                    <td>
                      {shownPicks.length === 0 && <span className="farm-kpi-sub">none — no volume</span>}
                      {shownPicks.map((p) => {
                        const rec = recordPicks.get(p.effectiveDate);
                        return (
                          <div key={p.effectiveDate} className="farm-fs-sm">
                            from {p.effectiveDate}: {num(p.units)}
                            {recordMode && rec && <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]! ml-[0.35rem]!" disabled={pending} onClick={() => run(() => deleteVolumePick({ id: rec.id }), `Removed the change from ${p.effectiveDate}.`)}>×</button>}
                            {mode === 'forecast' && included && <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]! ml-[0.35rem]!" onClick={() => setForecastPicks(sv.id, shownPicks.filter((x) => x.effectiveDate !== p.effectiveDate))}>×</button>}
                          </div>
                        );
                      })}
                    </td>
                    <td className="num">{mode === 'forecast' || !overlay ? num(rs?.serviceDates ?? 0) : '—'}</td>
                    <td className="num">{mode === 'forecast' || !overlay ? num(Math.round(rs?.annualUnits ?? 0)) : '—'}</td>
                    <td className="num">
                      <span className="inline-flex gap-[0.3rem]">
                        {(recordMode || (mode === 'forecast' && included)) && (
                          <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setPickForm({ serviceId: sv.id, effectiveDate: forecast.startDate, units: '' })}>Change volume</button>
                        )}
                        {mode === 'forecast' && overlay && (
                          <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setForecast((d) => { if (d.services) delete d.services[sv.id]; })}>Use the record</button>
                        )}
                        {canEdit && (
                          <>
                            <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setServiceForm({ mode: 'edit', pickupPointId: s.id, id: sv.id, form: { name: sv.name, weekdays: sv.weekdays, status: sv.status, notes: sv.notes ?? '' } })}>Edit</button>
                            <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => run(() => deleteSubscriberService({ id: sv.id }), `Removed service ${sv.name}.`)}>×</button>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                  {pickForm?.serviceId === sv.id && (
                    <tr>
                      <td colSpan={7}>
                        <div className="flex flex-wrap gap-3 items-end">
                          <label className="farm-kpi-sub">From<br /><input className="farm-input" type="date" value={pickForm.effectiveDate} onChange={(e) => e.target.value && setPickForm({ ...pickForm, effectiveDate: e.target.value })} /></label>
                          <label className="farm-kpi-sub">Units per service<br /><input className="farm-input w-26!" type="number" min={0} value={pickForm.units} onChange={(e) => setPickForm({ ...pickForm, units: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} /></label>
                          <button type="button" className="farm-btn primary" disabled={pending || pickForm.units === ''} onClick={submitPick}>Save</button>
                          <button type="button" className="farm-btn" disabled={pending} onClick={() => setPickForm(null)}>Cancel</button>
                          <span className="farm-kpi-sub">The volume carries forward from this date until the next change{recordMode ? '' : '. Written to this forecast only'}.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {s.services.length === 0 && <tr><td colSpan={7} className="farm-kpi-sub">No services. The pickup point generates no orders until one is added.</td></tr>}
            {serviceForm?.pickupPointId === s.id && (
              <tr>
                <td colSpan={7}>
                  <div className="flex flex-wrap gap-3 items-end">
                    <label className="farm-kpi-sub">Service name<br /><input className="farm-input w-56!" value={serviceForm.form.name} onChange={(e) => setServiceForm({ ...serviceForm, form: { ...serviceForm.form, name: e.target.value } })} /></label>
                    <div className="farm-kpi-sub">Runs on<br />
                      <span className="inline-flex gap-2 mt-[0.2rem]!">
                        {WEEKDAY_LABELS.map((w, i) => (
                          <label key={w} className="inline-flex! gap-[0.2rem]! items-center!">
                            <input type="checkbox" checked={serviceForm.form.weekdays.includes(i)} onChange={(e) => setServiceForm({ ...serviceForm, form: { ...serviceForm.form, weekdays: e.target.checked ? [...serviceForm.form.weekdays, i].sort() : serviceForm.form.weekdays.filter((x) => x !== i) } })} />{w}
                          </label>
                        ))}
                      </span>
                    </div>
                    <label className="farm-kpi-sub">Status<br />
                      <select className="farm-select" value={serviceForm.form.status} onChange={(e) => setServiceForm({ ...serviceForm, form: { ...serviceForm.form, status: e.target.value as 'active' | 'inactive' } })}>
                        <option value="active">active</option><option value="inactive">inactive</option>
                      </select>
                    </label>
                    <label className="farm-kpi-sub flex-1! min-w-48!">Notes<br /><input className="farm-input w-full!" value={serviceForm.form.notes} onChange={(e) => setServiceForm({ ...serviceForm, form: { ...serviceForm.form, notes: e.target.value } })} /></label>
                    <button type="button" className="farm-btn primary" disabled={pending || !serviceForm.form.name.trim() || serviceForm.form.weekdays.length === 0} onClick={submitService}>Save</button>
                    <button type="button" className="farm-btn" disabled={pending} onClick={() => setServiceForm(null)}>Cancel</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {canEdit && <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]! mt-[0.3rem]!" disabled={pending} onClick={() => setServiceForm({ mode: 'create', pickupPointId: s.id, form: { name: '', weekdays: [1, 2, 3, 4, 5], status: 'active', notes: '' } })}>Add service</button>}
        <span className="farm-kpi-sub ml-[0.6rem]!">
          {r ? `${num(r.serviceDates)} service dates · ${num(Math.round(r.annualUnits))} units in the year from ${forecast.startDate}` : 'Not in this forecast'} · actual to date {num(Math.round(actualFor(s)))}
        </span>
      </div>
    );
  }

  return (
    <>
      {msg && <div className={`farm-scenariobar-msg ${msg.kind} mt-4`} role="status">{msg.text}</div>}

      <Card title="Editing" className="mt-4">
        <div className="flex flex-wrap gap-4 items-end">
          <span className="farm-kpi-sub">{mode === 'forecast' ? 'Plan: volume and flat-plan edits go to the open forecast.' : 'Actual: volume and flat-plan edits go to the subscriber record.'} Switch with Plan / Actual in the forecast bar. Subscribers, pickupPoints, services and calendars are the master list in both.</span>
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
            ? 'Changes here are facts of record: the subscriber, its pickup points, their services and dated volume, each pickup point’s calendar and the subscriber’s flat plan. Real operations run on them.'
            : 'Changes here stay in the open forecast: which subscribers it includes, service volume and weekdays, and its own copy of a flat plan. The record does not move; anything not edited here follows it.'}
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
              sub={`${num(Math.round(c.row?.unitsPerDay ?? 0))} per service date · ${c.row?.subscribers ?? 0} subscriber${(c.row?.subscribers ?? 0) === 1 ? '' : 's'}, ${c.row?.pickupPoints.length ?? 0} pickup point${(c.row?.pickupPoints.length ?? 0) === 1 ? '' : 's'} · ${num(contracted)} contracted, ${num(units - contracted)} planned`}
            />
          );
        })}
        <Kpi
          value={num(Math.round(demand.totalAnnualUnits))}
          label="Units in the year, all channels"
          sub={`${demand.window.from} to ${demand.window.to} · ${num(Math.round(demand.contractedAnnualUnits))} contracted · what the allocation sliders act on`}
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
                      <span className="ml-2!"><RatingPill rating={c.rating ?? NOT_RATED} /></span>
                      {canEdit && (
                        <select
                          className="farm-select ml-[0.4rem]! farm-fs-xs py-[0.05rem]! px-[0.3rem]!"
                          aria-label={`${MARK.label} rating MicroFarm assigns ${c.name}`}
                          value={c.rating?.status === 'rated' ? String(c.rating.stars) : c.rating?.status ?? 'not_rated'}
                          disabled={pending}
                          onChange={(e) => {
                            const v = e.target.value;
                            const stars = v === '1' || v === '2' || v === '3' ? (Number(v) as 1 | 2 | 3) : null;
                            run(() => setSubscriberRating({ id: c.id, status: stars ? 'rated' : v, stars, ratedOn: v === 'not_rated' ? null : today }), `${c.name}: ${MARK.label} rating set.`);
                          }}
                        >
                          <option value="not_rated">Not yet rated</option>
                          <option value="in_review">In review</option>
                          <option value="1">1 star</option>
                          <option value="2">2 stars</option>
                          <option value="3">3 stars</option>
                        </select>
                      )}
                      <span className="farm-kpi-sub ml-[0.6rem]!">
                        {SUBSCRIBER_KIND_LABELS[c.kind]} · {SUBSCRIBER_STATUS_LABELS[c.status]} ·{' '}
                        {c.pricePerUnitCents === null ? `channel price ${money(ch.price)}` : `${money(c.pricePerUnitCents / 100)} contracted`}
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
                      {canEdit && (
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
                    const part = pickupPointParticipation(s.id, s.enrollment, orders);
                    return (
                      <div key={s.id} className="mt-[0.6rem]! pl-[0.6rem] border-l-2 border-l-[color:var(--farm-line,#ddd)]">
                        <div className="farm-kpi-sub">
                          <span className="farm-c-ink font-semibold">{s.name}</span>
                          {' · '}{s.status}{s.trayFormats.length ? ` · grades ${s.trayFormats.join(', ')}` : ''}{s.pickupPointId ? ` · distribution pickup point ${s.pickupPointId}` : ''}
                          {' · '}enrollment {s.enrollment === null ? 'not entered' : num(s.enrollment)}
                          {' · '}participation{' '}
                          {part.participation !== null
                            ? `${pct(part.participation)} (${num(Math.round(part.unitsPerService ?? 0))} units per service over ${num(part.services)} confirmed or distributed service${part.services === 1 ? '' : 's'})`
                            : part.services === 0
                              ? 'no confirmed or distributed orders yet'
                              : `${num(Math.round(part.unitsPerService ?? 0))} units per service — enter enrollment to calculate`}
                          {canEdit && (
                            <span className="inline-flex gap-[0.3rem] ml-[0.6rem]!">
                              <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => setPickupPointForm({ mode: 'edit', subscriberId: c.id, id: s.id, form: { name: s.name, pickupPointId: s.pickupPointId ?? '', trayFormats: s.trayFormats, enrollment: s.enrollment ?? '', status: s.status, notes: s.notes ?? '' } })}>Edit pickup point</button>
                              <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => run(() => deleteSubscriberPickupPoint({ id: s.id }), `Removed pickup point ${s.name}.`)}>×</button>
                            </span>
                          )}
                        </div>
                        {renderCalendar(s, r)}
                        {renderServices(c, s, r, included)}
                      </div>
                    );
                  })}
                  {c.pickupPoints.length === 0 && <p className="farm-kpi-sub">No pickup points. This subscriber adds no demand until a pickup point is added.</p>}
                  {renderPlans(c, included)}
                </div>
              );
            })}
            {canEdit && (
              <button type="button" className="farm-btn" onClick={() => setSubscriberForm({ mode: 'create', form: emptySubscriber(ch.phase) })} disabled={pending}>Add subscriber on {ch.market}</button>
            )}
          </Card>
        );
      })}

      {subscriberForm && (
        <Card title={subscriberForm.mode === 'edit' ? 'Edit subscriber' : 'Add subscriber'} className="mt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="farm-kpi-sub">Name<br /><input className="farm-input w-56!" value={subscriberForm.form.name} onChange={(e) => setSubscriberForm({ ...subscriberForm, form: { ...subscriberForm.form, name: e.target.value } })} /></label>
            <label className="farm-kpi-sub">Kind<br />
              <select className="farm-select" value={subscriberForm.form.kind} onChange={(e) => setSubscriberForm({ ...subscriberForm, form: { ...subscriberForm.form, kind: e.target.value as SubscriberKind } })}>
                {(Object.keys(SUBSCRIBER_KIND_LABELS) as SubscriberKind[]).map((k) => <option key={k} value={k}>{SUBSCRIBER_KIND_LABELS[k]}</option>)}
              </select>
            </label>
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
            <div className="farm-kpi-sub">Tray formats<br />
              <span className="inline-flex gap-[0.6rem] mt-[0.2rem]!">
                {['K-5', '6-8', '9-12'].map((g) => (
                  <label key={g} className="inline-flex! gap-1! items-center!">
                    <input type="checkbox" checked={pickupPointForm.form.trayFormats.includes(g)} onChange={(e) => setPickupPointForm({ ...pickupPointForm, form: { ...pickupPointForm.form, trayFormats: e.target.checked ? [...pickupPointForm.form.trayFormats, g] : pickupPointForm.form.trayFormats.filter((x) => x !== g) } })} />{g}
                  </label>
                ))}
              </span>
            </div>
            <label className="farm-kpi-sub">Enrollment<br /><input className="farm-input w-26!" type="number" min={0} value={pickupPointForm.form.enrollment} onChange={(e) => setPickupPointForm({ ...pickupPointForm, form: { ...pickupPointForm.form, enrollment: e.target.value === '' ? '' : Math.max(0, Math.round(Number(e.target.value))) } })} /></label>
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
            Enrollment is entered when a prospect account is set up. Participation is calculated from it: the units per service on
            confirmed and distributed orders, against enrollment. It is a sales figure; demand runs on units per service.
            {pickupPointForm.mode === 'create' ? ' A new pickup point starts with one service and no volume. Enter its service calendar, its services’ weekdays and units per service after saving.' : ''}
          </p>
        </Card>
      )}

      <p className="farm-kpi-sub mt-4">
        Demand on <Link className="farm-link" href="/farm/financials/pnl">P&amp;L</Link> and{' '}
        <Link className="farm-link" href="/farm/production-planning">Production Planning</Link> is the units per service on every date each service runs.
        Saved subscription cycles are on <Link className="farm-link" href="/farm/orders">Orders</Link>. Actual units to date come from distribution records on{' '}
        <Link className="farm-link" href="/farm/actuals">Actuals</Link>.
      </p>
    </>
  );
}
