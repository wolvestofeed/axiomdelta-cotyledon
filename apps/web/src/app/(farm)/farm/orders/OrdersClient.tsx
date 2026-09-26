'use client';

import { PageControls } from '../_components/PageControls';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Kpi, StatusBadge, money, num } from '../_components/ui';
import { useScenario } from '../_state/scenario-store';
import { useOperationsWorld } from '../_state/ledger';
import { WorldNote } from '../_components/ledger/WorldNote';
import { CROP_PLAN_STATUS_LABELS } from '../_data/plan-data';
import {
  ORDER_STATUS_LABELS,
  ORDER_SOURCE_LABELS,
  WEEKDAY_LABELS,
  type SubscriptionCycleDef,
  type OrderDef,
} from '../_data/subscription-cycles';
import { FlatPlanForm, SequenceTable, emptySequence, valuesOf, type SequenceValues } from '../_components/FlatPlanForm';
import { plansFromCycle, savedCycles } from '../_engine/flat-plans';
import { recordsActuals } from '../_data/subscribers';
import {
  orderBook,
  summarizeBook,
  distributionDay,
  bookRevenueCents,
  pickupPointActualVsForecast,
  isoAddDays,
  weekdayOf,
  cycleDayOn,
  type BookOrder,
} from '../_engine/orders';
import {
  createSubscriptionCycle,
  updateSubscriptionCycle,
  assignSubscriptionCycle,
  deleteSubscriptionCycle,
  createOrder,
  updateOrder,
  deleteOrder,
} from '../_lib/order-actions';
import { ShipForm, type ShipOrder, type FinishedLot } from '../_components/ShipForm';
import { completeRoute } from '../_lib/working-capital-actions';
import { INVOICED_CHANNELS } from '../_data/working-capital';
import type { DateRange } from '../_engine/periods';

type Msg = { kind: 'ok' | 'err'; text: string } | null;
const fromCents = (c: number) => c / 100;
const toCents = (d: number) => Math.round(d * 100);

interface OrderForm {
  orderDate: string; subscriberId: string; subscriberPickupPointId: string; subscriberServiceId: string | null; cropPlanCode: string; units: number;
  status: 'forecast' | 'confirmed'; price: number | ''; notes: string; subscriptionCycleId: string | null; source: 'typed' | 'cycle';
}

export function OrdersClient({
  canEdit,
  canRecord,
  closures,
  cycles,
  orders: recordedOrders,
  distributions: recordedDistributions,
  finishedLots,
  today,
}: {
  canEdit: boolean;
  /** Operators record distributions; editing orders and cycles stays with super admins. */
  canRecord: boolean;
  closures: DateRange[];
  cycles: SubscriptionCycleDef[];
  orders: OrderDef[];
  distributions: { id: string; distributedOn: string; units: number; pricePerUnitCents: number; phase: number; subscriberId: string | null; invoiceId: string | null }[];
  /** Output lots from closed sowing records, for the ship form's lot picker. */
  finishedLots: FinishedLot[];
  today: string;
}) {
  const { resolved } = useScenario();
  // Plan runs the open forecast's own world; Actual the real farm (Roadmap N6 slice 3).
  const world = useOperationsWorld({ orders: recordedOrders, distributions: recordedDistributions });
  const { orders, distributions } = world;
  /** Orders, confirmations, distributions and routes are recorded on Actual only. */
  const canEditOrders = canEdit && world.recording;
  const canRecordHere = canRecord && world.recording;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(isoAddDays(today, 13));
  const [channelFilter, setChannelFilter] = useState<number | 'all'>('all');
  const [cycleForm, setCycleForm] = useState<{ mode: 'create' | 'edit'; id?: string; initial: SequenceValues } | null>(null);
  /** The apply-to picker on a saved cycle edit: 'none', 'all', or the plan ids picked. */
  const [applyTo, setApplyTo] = useState<'none' | 'all' | Set<string>>('none');
  const [assigning, setAssigning] = useState<{ cycleId: string; subscriberIds: Set<string>; startDate: string } | null>(null);
  const [orderForm, setOrderForm] = useState<{ mode: 'create' | 'edit'; id?: string; form: OrderForm } | null>(null);
  const [shipping, setShipping] = useState<ShipOrder | null>(null);
  const [dayDate, setDayDate] = useState(today);
  const [daySubscriber, setDaySubscriber] = useState<string>('all');

  const channels = resolved.phases.map((p) => ({ phase: p.phase, market: p.market, priceCents: Math.round(p.pricePerUnit * 100) }));
  const cropPlanNames = useMemo(() => Object.fromEntries(resolved.cropPlans.map((r) => [r.code, r.name])), [resolved.cropPlans]);
  const channelPriceCents = useMemo(() => Object.fromEntries(channels.map((c) => [c.phase, c.priceCents])), [channels]);
  const distributionById = useMemo(() => new Map(distributions.map((d) => [d.id, d])), [distributions]);

  const book = useMemo(
    () => orderBook({ pickupPoints: world.pickupPoints, subscribers: resolved.subscribers, cycles, orders, from, to, channelPriceCents, cropPlanNames, closures }),
    [world.pickupPoints, resolved.subscribers, cycles, orders, from, to, channelPriceCents, cropPlanNames, closures],
  );
  const shown = useMemo(() => (channelFilter === 'all' ? book : book.filter((o) => o.channel === channelFilter)), [book, channelFilter]);
  const pickupPointRows = useMemo(() => pickupPointActualVsForecast(shown, new Map(distributions.map((d) => [d.id, d.units]))), [shown, distributions]);
  const summary = useMemo(() => summarizeBook(book, channels.map((c) => c.phase)), [book, channels]);
  const dates = useMemo(() => [...new Set(shown.map((o) => o.orderDate))], [shown]);
  const day = useMemo(() => distributionDay(book, dayDate, daySubscriber === 'all' ? null : daySubscriber), [book, dayDate, daySubscriber]);
  const whatIf = world.pickupPoints.some((s) => s.edited);

  function run<R extends { ok: true }>(fn: () => Promise<R | { ok: false; error: string }>, okText: string | ((res: R) => string)) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ kind: 'ok', text: typeof okText === 'function' ? okText(res) : okText });
        setCycleForm(null);
        setOrderForm(null);
        setShipping(null);
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  // ── Saved subscription cycles ─────────────────────────────────────────────────────
  const saved = useMemo(() => savedCycles(cycles), [cycles]);
  const subscriberName = useMemo(() => new Map(resolved.subscribers.map((c) => [c.id, c.name])), [resolved.subscribers]);
  const openEditCycle = (c: SubscriptionCycleDef) => {
    setApplyTo('none');
    setCycleForm({ mode: 'edit', id: c.id, initial: valuesOf(c) });
  };
  function submitCycle(v: SequenceValues) {
    if (!cycleForm) return;
    const payload = { ...v, subscriberId: null, subscriberServiceId: null };
    if (cycleForm.mode === 'create') {
      run(() => createSubscriptionCycle(payload), `Saved subscription cycle ${v.name}.`);
      return;
    }
    const plans = plansFromCycle(cycles, cycleForm.id!);
    const applyToPlanIds = applyTo === 'none' ? [] : applyTo === 'all' ? plans.map((p) => p.id) : [...applyTo];
    run(() => updateSubscriptionCycle({ ...payload, id: cycleForm.id, applyToPlanIds }), (res) => `Saved ${v.name}; applied to ${res.applied} subscriber flat plan${res.applied === 1 ? '' : 's'}.`);
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  // Stored orders are facts of record: a Forecast Subscriber takes none.
  const subscribersWithPickupPoints = resolved.subscribers.filter((c) => c.status !== 'inactive' && recordsActuals(c.status) && c.pickupPoints.length > 0);
  const emptyOrder = (): OrderForm => {
    const c = subscribersWithPickupPoints[0];
    return { orderDate: today, subscriberId: c?.id ?? '', subscriberPickupPointId: c?.pickupPoints[0]?.id ?? '', subscriberServiceId: c?.pickupPoints[0]?.services[0]?.id ?? null, cropPlanCode: resolved.cropPlan.code, units: 0, status: 'forecast', price: '', notes: '', subscriptionCycleId: null, source: 'typed' };
  };
  const confirmDerived = (o: BookOrder) =>
    setOrderForm({ mode: 'create', form: { orderDate: o.orderDate, subscriberId: o.subscriberId, subscriberPickupPointId: o.subscriberPickupPointId, subscriberServiceId: o.subscriberServiceId, cropPlanCode: o.cropPlanCode, units: Math.round(o.units), status: 'confirmed', price: '', notes: '', subscriptionCycleId: o.subscriptionCycleId, source: 'cycle' } });
  const openEditOrder = (o: BookOrder) => {
    const row = orders.find((x) => x.id === o.id);
    setOrderForm({ mode: 'edit', id: o.id ?? undefined, form: { orderDate: o.orderDate, subscriberId: o.subscriberId, subscriberPickupPointId: o.subscriberPickupPointId, subscriberServiceId: o.subscriberServiceId, cropPlanCode: o.cropPlanCode, units: o.units, status: o.status === 'confirmed' ? 'confirmed' : 'forecast', price: row?.pricePerUnitCents == null ? '' : fromCents(row.pricePerUnitCents), notes: o.notes ?? '', subscriptionCycleId: o.subscriptionCycleId, source: o.source === 'cycle' ? 'cycle' : 'typed' } });
  };
  function submitOrder() {
    if (!orderForm) return;
    const f = orderForm.form;
    const price = f.price === '' ? null : toCents(f.price);
    if (orderForm.mode === 'edit') {
      run(() => updateOrder({ id: orderForm.id, orderDate: f.orderDate, cropPlanCode: f.cropPlanCode, units: f.units, status: f.status, pricePerUnitCents: price, notes: f.notes || null }), 'Saved the order.');
    } else {
      run(() => createOrder({ orderDate: f.orderDate, subscriberId: f.subscriberId, subscriberPickupPointId: f.subscriberPickupPointId, subscriberServiceId: f.subscriberServiceId, cropPlanCode: f.cropPlanCode, units: f.units, status: f.status, pricePerUnitCents: price, subscriptionCycleId: f.subscriptionCycleId, source: f.source, notes: f.notes || null }), `${ORDER_STATUS_LABELS[f.status]} order on file.`);
    }
  }
  const setStatus = (o: BookOrder, status: 'forecast' | 'confirmed') => {
    const row = orders.find((x) => x.id === o.id);
    if (!row) return;
    run(() => updateOrder({ id: row.id, orderDate: row.orderDate, cropPlanCode: row.cropPlanCode, units: row.units, status, pricePerUnitCents: row.pricePerUnitCents, notes: row.notes }), `Order ${status}.`);
  };
  const openDistribute = (o: BookOrder) => {
    if (!o.id) return;
    setShipping({ id: o.id, orderDate: o.orderDate, subscriberName: o.subscriberName, pickupPointName: o.pickupPointName, cropPlanCode: o.cropPlanCode, cropPlanName: o.cropPlanName, units: o.units, pricePerUnitCents: o.pricePerUnitCents });
  };

  const statusCell = (o: BookOrder) => {
    if (o.basis === 'derived') return <><span>{ORDER_STATUS_LABELS.forecast}</span> <StatusBadge status="DERIVED" title="The subscriber's flat plan crop plan × the service's units per service. Not stored." /></>;
    const d = o.distributionId ? distributionById.get(o.distributionId) : undefined;
    return (
      <>
        <span>{ORDER_STATUS_LABELS[o.status]}</span> <StatusBadge status="STATED" title={`${ORDER_SOURCE_LABELS[o.source]}; on file.`} />
        {o.status === 'distributed' && (
          <div className="farm-c-faint farm-fs-2xs">
            {d ? <>{num(d.units)} distributed {d.distributedOn} · <Link className="farm-link" href="/farm/actuals">record</Link></> : 'distribution record removed'}
          </div>
        )}
      </>
    );
  };

  const channelLabel = (ch: number) => channels.find((c) => c.phase === ch)?.market ?? `Channel ${ch}`;
  const dateLabel = (d: string) => `${WEEKDAY_LABELS[weekdayOf(d)]} ${d}`;

  return (
    <>
      <WorldNote isPlan={world.isPlan} />
      {msg && <div className={`farm-scenariobar-msg ${msg.kind} mt-4`} role="status">{msg.text}</div>}

      <PageControls>
        <label className="farm-kpi-sub inline-flex items-center gap-2">From<input className="farm-input" type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <label className="farm-kpi-sub inline-flex items-center gap-2">To<input className="farm-input" type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        <label className="farm-kpi-sub inline-flex items-center gap-2">Channel
          <select className="farm-select" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All channels</option>
            {channels.map((c) => <option key={c.phase} value={c.phase}>{channelLabel(c.phase)}</option>)}
          </select>
        </label>
      </PageControls>
      <p className="farm-kpi-sub mt-4">{dates.length} date{dates.length === 1 ? '' : 's'} with orders from {from} to {to} · {shown.length} order{shown.length === 1 ? '' : 's'}{whatIf ? ' · forecast orders follow the open forecast’s edits on Subscribers' : ''}</p>

      <div className="grid gap-3 mt-4 farm-autofit-11">
        {channels.map((c) => {
          const s = summary[c.phase];
          return (
            <Kpi
              key={c.phase}
              value={num(Math.round(s?.totalUnits ?? 0))}
              label={`${channelLabel(c.phase)}, units in range`}
              sub={`${num(Math.round(s?.derivedForecastUnits ?? 0))} forecast (derived) · ${num(Math.round(s?.typedForecastUnits ?? 0))} forecast (typed) · ${num(Math.round(s?.confirmedUnits ?? 0))} confirmed · ${num(Math.round(s?.distributedUnits ?? 0))} distributed · ${s?.serviceDates ?? 0} service date${(s?.serviceDates ?? 0) === 1 ? '' : 's'}`}
            />
          );
        })}
        <Kpi value={money(fromCents(bookRevenueCents(shown)), 0)} label="Revenue at the prices in force" sub="Order price, else the subscriber's contract, else the channel default. Computed from units; nothing stored." />
      </div>

      <Card title="Saved subscription cycles" className="mt-4">
        <p className="farm-kpi-sub">
          A saved cycle is a cropPlan sequence on the shared list. It serves nobody until it is assigned: assigning copies it
          onto a subscriber as that subscriber&rsquo;s flat plan. A channel never decides what a subscriber is served. Flat plans,
          and a sequence programmed for one subscriber, are on <Link className="farm-link" href="/farm/subscribers">Subscribers</Link>.
        </p>
        {canEdit && <button type="button" className="farm-btn" onClick={() => { setApplyTo('none'); setCycleForm({ mode: 'create', initial: emptySequence(today) }); }} disabled={pending}>Add subscription cycle</button>}
        {saved.length === 0 && <p className="farm-kpi-sub mt-2">No saved subscription cycles.</p>}
        {saved.map((cy) => {
          const todayDay = cycleDayOn(cy, today);
          const plans = plansFromCycle(cycles, cy.id);
          const onCycle = [...new Set(plans.map((p) => p.subscriberId!))].map((id) => subscriberName.get(id) ?? 'Subscriber removed');
          return (
            <div key={cy.id} className="farm-scroll-x mt-[0.9rem]!">
              <div className="farm-kpi-sub">
                <span className="farm-c-ink font-semibold">{cy.name}</span> · from {cy.startDate}{cy.endDate ? ` to ${cy.endDate}` : ''} · {cy.lengthDays}-day sequence on {cy.weekdays.map((w) => WEEKDAY_LABELS[w]).join(' ')} · {cy.status}
                {todayDay !== null ? ` · today is day ${todayDay}` : ''}
                {' · '}{onCycle.length ? `copied to ${onCycle.join(', ')}` : 'assigned to no subscriber'}
                {canEdit && (
                  <span className="inline-flex gap-[0.3rem] ml-[0.6rem]!">
                    <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setAssigning({ cycleId: cy.id, subscriberIds: new Set(), startDate: cy.startDate })} disabled={pending}>Assign to subscribers</button>
                    <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => openEditCycle(cy)} disabled={pending}>Edit</button>
                    <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => run(() => deleteSubscriptionCycle({ id: cy.id }), `Removed ${cy.name}. Flat plans copied from it keep their sequence.`)} disabled={pending}>Remove</button>
                  </span>
                )}
              </div>
              <SequenceTable plan={cy} cropPlanNames={cropPlanNames} />
              {assigning?.cycleId === cy.id && (
                <div className="mt-2! flex flex-wrap gap-3 items-end">
                  <div className="farm-kpi-sub">Subscribers<br />
                    <span className="inline-flex flex-wrap gap-[0.6rem] mt-[0.2rem]!">
                      {resolved.subscribers.filter((c) => c.status !== 'inactive').map((c) => (
                        <label key={c.id} className="inline-flex! gap-1! items-center!">
                          <input type="checkbox" checked={assigning.subscriberIds.has(c.id)} onChange={(e) => { const next = new Set(assigning.subscriberIds); if (e.target.checked) next.add(c.id); else next.delete(c.id); setAssigning({ ...assigning, subscriberIds: next }); }} />
                          {c.name} · {channelLabel(c.channel)}
                        </label>
                      ))}
                    </span>
                  </div>
                  <label className="farm-kpi-sub">Plan starts<br /><input className="farm-input" type="date" value={assigning.startDate} onChange={(e) => e.target.value && setAssigning({ ...assigning, startDate: e.target.value })} /></label>
                  <button type="button" className="farm-btn primary" disabled={pending || assigning.subscriberIds.size === 0} onClick={() => run(async () => { const res = await assignSubscriptionCycle({ cycleId: cy.id, subscriberIds: [...assigning.subscriberIds], startDate: assigning.startDate }); if (res.ok) setAssigning(null); return res; }, `${cy.name} copied to ${assigning.subscriberIds.size} subscriber${assigning.subscriberIds.size === 1 ? '' : 's'}.`)}>Assign</button>
                  <button type="button" className="farm-btn" onClick={() => setAssigning(null)} disabled={pending}>Cancel</button>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {cycleForm && (() => {
        const plans = cycleForm.mode === 'edit' ? plansFromCycle(cycles, cycleForm.id!) : [];
        return (
          <FlatPlanForm
            key={cycleForm.id ?? 'new'}
            title={cycleForm.mode === 'edit' ? 'Edit subscription cycle' : 'Add subscription cycle'}
            initial={cycleForm.initial}
            cropPlans={resolved.cropPlans}
            pending={pending}
            onSave={submitCycle}
            onCancel={() => setCycleForm(null)}
          >
            {plans.length > 0 && (
              <div className="farm-kpi-sub mt-3!">
                Apply this edit to subscriber flat plans copied from this cycle
                <div className="flex flex-wrap gap-[0.9rem] mt-[0.3rem]!">
                  <label className="inline-flex! gap-1! items-center!"><input type="radio" checked={applyTo === 'none'} onChange={() => setApplyTo('none')} />This cycle only</label>
                  <label className="inline-flex! gap-1! items-center!"><input type="radio" checked={applyTo === 'all'} onChange={() => setApplyTo('all')} />Apply to all ({plans.length})</label>
                  <label className="inline-flex! gap-1! items-center!"><input type="radio" checked={applyTo instanceof Set} onChange={() => setApplyTo(new Set())} />Apply to selection</label>
                </div>
                {applyTo instanceof Set && (
                  <div className="flex flex-wrap gap-[0.9rem] mt-[0.3rem]!">
                    {plans.map((p) => (
                      <label key={p.id} className="inline-flex! gap-1! items-center!">
                        <input type="checkbox" checked={applyTo.has(p.id)} onChange={(e) => { const next = new Set(applyTo); if (e.target.checked) next.add(p.id); else next.delete(p.id); setApplyTo(next); }} />
                        {subscriberName.get(p.subscriberId!) ?? 'Subscriber removed'} · {p.name} from {p.startDate}
                      </label>
                    ))}
                  </div>
                )}
                <div className="mt-[0.3rem]!">A plan not picked keeps its sequence. Each plan keeps its own start and end date.</div>
              </div>
            )}
          </FlatPlanForm>
        );
      })()}

      <Card title="Order book" className="mt-4">
        {canEditOrders && <button type="button" className="farm-btn" onClick={() => setOrderForm({ mode: 'create', form: emptyOrder() })} disabled={pending || subscribersWithPickupPoints.length === 0}>Add order</button>}
        {shown.length === 0 && <p className="farm-kpi-sub mt-2">No orders in this range. A forecast order needs a service with units per service and a flat plan on Subscribers.</p>}
        {dates.map((d) => {
          const rows = shown.filter((o) => o.orderDate === d);
          const units = rows.reduce((a, o) => a + o.units, 0);
          return (
            <div key={d} className="farm-scroll-x mt-[0.9rem]!">
              <div className="farm-kpi-sub"><span className="farm-c-ink font-semibold">{dateLabel(d)}</span> · {num(Math.round(units))} units · {rows.length} order{rows.length === 1 ? '' : 's'}</div>
              <table className="farm-table mt-[0.3rem]!">
                <thead><tr><th>Subscriber</th><th>Pickup point · service</th><th>Crop plan</th><th className="num">Units</th><th className="num">Price</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.key}>
                      <td>{o.subscriberName}<div className="farm-c-faint farm-fs-2xs">{channelLabel(o.channel)}</div></td>
                      <td>{o.pickupPointName}<div className="farm-c-faint farm-fs-2xs">{o.serviceName ?? 'no service named'}{o.distributionPickupPointId ? ` · distribution pickup point ${o.distributionPickupPointId}` : ''}</div></td>
                      <td>{o.cropPlanCode}<div className="farm-c-faint farm-fs-2xs">{o.cropPlanName}</div></td>
                      <td className="num">{num(Math.round(o.units))}</td>
                      <td className="num">{money(fromCents(o.pricePerUnitCents))}<div className="farm-c-faint farm-fs-2xs">{o.priceBasis === 'order' ? 'on the order' : o.priceBasis === 'contract' ? 'contracted' : 'channel default'}</div></td>
                      <td>{statusCell(o)}</td>
                      <td className="num">
                        {(canEditOrders || canRecordHere) && (
                          <span className="inline-flex gap-[0.3rem]">
                            {canEditOrders && o.basis === 'derived' && <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => confirmDerived(o)} disabled={pending}>Confirm count</button>}
                            {canEditOrders && o.basis === 'record' && o.status === 'forecast' && <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setStatus(o, 'confirmed')} disabled={pending}>Confirm</button>}
                            {canRecordHere && o.basis === 'record' && o.status === 'confirmed' && <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => openDistribute(o)} disabled={pending}>Distribute</button>}
                            {canEditOrders && o.basis === 'record' && o.status !== 'distributed' && <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => openEditOrder(o)} disabled={pending}>Edit</button>}
                            {canEditOrders && o.basis === 'record' && <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => run(() => deleteOrder({ id: o.id }), 'Removed the order.')} disabled={pending}>×</button>}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </Card>

      {orderForm && (
        <Card title={orderForm.mode === 'edit' ? 'Edit order' : orderForm.form.status === 'confirmed' ? 'Confirm the count' : 'Add order'} className="mt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="farm-kpi-sub">Date<br /><input className="farm-input" type="date" value={orderForm.form.orderDate} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, orderDate: e.target.value } })} /></label>
            <label className="farm-kpi-sub">Subscriber<br />
              <select className="farm-select" value={orderForm.form.subscriberId} disabled={orderForm.mode === 'edit' || orderForm.form.source === 'cycle'} onChange={(e) => { const c = subscribersWithPickupPoints.find((x) => x.id === e.target.value); setOrderForm({ ...orderForm, form: { ...orderForm.form, subscriberId: e.target.value, subscriberPickupPointId: c?.pickupPoints[0]?.id ?? '', subscriberServiceId: c?.pickupPoints[0]?.services[0]?.id ?? null } }); }}>
                {(orderForm.mode === 'edit' ? resolved.subscribers : subscribersWithPickupPoints).map((c) => <option key={c.id} value={c.id}>{c.name} · {channelLabel(c.channel)}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub">Pickup point<br />
              <select className="farm-select" value={orderForm.form.subscriberPickupPointId} disabled={orderForm.mode === 'edit' || orderForm.form.source === 'cycle'} onChange={(e) => { const pickupPoint = resolved.subscribers.find((c) => c.id === orderForm.form.subscriberId)?.pickupPoints.find((x) => x.id === e.target.value); setOrderForm({ ...orderForm, form: { ...orderForm.form, subscriberPickupPointId: e.target.value, subscriberServiceId: pickupPoint?.services[0]?.id ?? null } }); }}>
                {(resolved.subscribers.find((c) => c.id === orderForm.form.subscriberId)?.pickupPoints ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub">Service<br />
              <select className="farm-select" value={orderForm.form.subscriberServiceId ?? ''} disabled={orderForm.mode === 'edit' || orderForm.form.source === 'cycle'} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, subscriberServiceId: e.target.value || null } })}>
                {(resolved.subscribers.find((c) => c.id === orderForm.form.subscriberId)?.pickupPoints.find((x) => x.id === orderForm.form.subscriberPickupPointId)?.services ?? []).map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub">Crop plan<br />
              <select className="farm-select" value={orderForm.form.cropPlanCode} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, cropPlanCode: e.target.value } })}>
                {resolved.cropPlans.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.name} · {CROP_PLAN_STATUS_LABELS[r.status]}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub">Units<br /><input className="farm-input w-26!" type="number" min={0} value={orderForm.form.units} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, units: Number(e.target.value) } })} /></label>
            <label className="farm-kpi-sub">Status<br />
              <select className="farm-select" value={orderForm.form.status} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, status: e.target.value as 'forecast' | 'confirmed' } })}>
                <option value="forecast">Forecast (typed)</option><option value="confirmed">Confirmed</option>
              </select>
            </label>
            <label className="farm-kpi-sub">Price / unit $ (blank = contract or channel)<br /><input className="farm-input w-26!" type="number" min={0} step={0.01} value={orderForm.form.price} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, price: e.target.value === '' ? '' : Number(e.target.value) } })} /></label>
            <label className="farm-kpi-sub flex-1! min-w-56!">Notes<br /><input className="farm-input w-full!" value={orderForm.form.notes} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, notes: e.target.value } })} /></label>
            <button type="button" className="farm-btn primary" onClick={submitOrder} disabled={pending || !orderForm.form.subscriberPickupPointId || !orderForm.form.cropPlanCode}>Save</button>
            <button type="button" className="farm-btn" onClick={() => setOrderForm(null)} disabled={pending}>Cancel</button>
          </div>
          {orderForm.form.source === 'cycle' && <p className="farm-kpi-sub mt-2">Confirming writes a row that replaces the forecast order for this pickup point, service, date and crop plan. The volume on Subscribers is unchanged.</p>}
        </Card>
      )}

      {shipping && world.recording && (
        <div className="mt-4">
          <ShipForm order={shipping} finishedLots={finishedLots} today={today} onDone={() => setShipping(null)} onCancel={() => setShipping(null)} />
          <p className="farm-kpi-sub -mt-2!">The distribution record posts revenue and cost of goods sold through the ledger; the order keeps the count that was ordered, so the difference stays visible.</p>
        </div>
      )}

      <Card title="Distribution day — every order on a date" className="mt-4">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="farm-kpi-sub">Date<br /><input className="farm-input" type="date" value={dayDate} onChange={(e) => e.target.value && setDayDate(e.target.value)} /></label>
          <label className="farm-kpi-sub">Subscriber<br />
            <select className="farm-select" value={daySubscriber} onChange={(e) => setDaySubscriber(e.target.value)}>
              <option value="all">All subscribers</option>
              {resolved.subscribers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <span className="farm-kpi-sub">{dateLabel(dayDate)} · {num(Math.round(day.totalUnits))} units · {day.orders.length} order{day.orders.length === 1 ? '' : 's'} · {money(fromCents(bookRevenueCents(day.orders)), 0)} at the prices in force</span>
          {(() => {
            // Roadmap K1: distributed, invoiced-channel distributions on the date not yet on an invoice.
            const waiting = distributions.filter((d) => d.distributedOn === dayDate && INVOICED_CHANNELS.includes(d.phase) && d.subscriberId && !d.invoiceId && (daySubscriber === 'all' || d.subscriberId === daySubscriber));
            if (!canRecordHere || waiting.length === 0) return null;
            return (
              <button type="button" className="farm-btn" disabled={pending} onClick={() => run(() => completeRoute({ date: dayDate, subscriberId: daySubscriber === 'all' ? null : daySubscriber }), `Route of ${dayDate} completed: ${waiting.length} distribute${waiting.length === 1 ? 'y' : 'ies'} added to the month's invoice${daySubscriber === 'all' ? 's' : ''}.`)}>
                Complete route — {waiting.length} distribute{waiting.length === 1 ? 'y' : 'ies'} to invoice
              </button>
            );
          })()}
        </div>
        {day.orders.length > 0 && (
          <div className="grid gap-4 mt-3 farm-autofit-18">
            <div className="farm-scroll-x">
              <table className="farm-table">
                <thead><tr><th>Pickup point</th><th className="num">Units</th></tr></thead>
                <tbody>{day.byPickupPoint.map((s) => <tr key={s.subscriberPickupPointId}><td>{s.pickupPointName}<div className="farm-c-faint farm-fs-2xs">{s.subscriberName}</div></td><td className="num">{num(Math.round(s.units))}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="farm-scroll-x">
              <table className="farm-table">
                <thead><tr><th>Crop plan</th><th className="num">Units</th><th className="num">Orders</th></tr></thead>
                <tbody>{day.byCropPlan.map((r) => <tr key={r.cropPlanCode}><td>{r.cropPlanCode}<div className="farm-c-faint farm-fs-2xs">{r.cropPlanName}</div></td><td className="num">{num(Math.round(r.units))}</td><td className="num">{r.orders}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
        {day.orders.length === 0 && <p className="farm-kpi-sub mt-2">No orders on this date{dayDate < from || dayDate > to ? ' — it is outside the range above' : ''}.</p>}
        <p className="farm-kpi-sub mt-2">
          The units by cropPlan on a date are what <Link className="farm-link" href="/farm/production-planning">Production Planning</Link> explodes into production requirements. Services, volume and flat plans are edited on <Link className="farm-link" href="/farm/subscribers">Subscribers</Link>; distribution records are on <Link className="farm-link" href="/farm/actuals">Actuals</Link>.
        </p>
      </Card>

      <Card title={`Pickup points — forecast, confirmed, distributed · ${dateLabel(from)} to ${dateLabel(to)}`} className="mt-4">
        {pickupPointRows.length === 0 ? (
          <p className="farm-kpi-sub">No pickup point has an order in the range.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead>
                <tr>
                  <th>Pickup point</th><th className="num">Service dates</th><th className="num">Forecast</th><th className="num">Confirmed</th><th className="num">Distributed orders</th><th className="num">Ordered</th><th className="num">Distributed</th><th className="num">Distributed − ordered</th>
                </tr>
              </thead>
              <tbody>
                {pickupPointRows.map((r) => (
                  <tr key={r.subscriberPickupPointId}>
                    <td>{r.pickupPointName}<div className="farm-c-faint farm-fs-2xs">{r.subscriberName} · {channelLabel(r.channel)}</div></td>
                    <td className="num">{r.serviceDates}</td>
                    <td className="num">{num(Math.round(r.forecastUnits))}</td>
                    <td className="num">{num(Math.round(r.confirmedUnits))}</td>
                    <td className="num">{r.distributedOrders}</td>
                    <td className="num">{r.distributedOrders ? num(Math.round(r.orderedOnDistributed)) : '—'}</td>
                    <td className="num">{r.distributedOrders ? num(Math.round(r.distributedUnits)) : '—'}</td>
                    <td className="num">{r.distributedOrders ? `${r.distributedLessOrdered > 0 ? '+' : ''}${num(Math.round(r.distributedLessOrdered))}` : '—'}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>All pickup points</td>
                  <td className="num">—</td>
                  <td className="num">{num(Math.round(pickupPointRows.reduce((s, r) => s + r.forecastUnits, 0)))}</td>
                  <td className="num">{num(Math.round(pickupPointRows.reduce((s, r) => s + r.confirmedUnits, 0)))}</td>
                  <td className="num">{pickupPointRows.reduce((s, r) => s + r.distributedOrders, 0)}</td>
                  <td className="num">{num(Math.round(pickupPointRows.reduce((s, r) => s + r.orderedOnDistributed, 0)))}</td>
                  <td className="num">{num(Math.round(pickupPointRows.reduce((s, r) => s + r.distributedUnits, 0)))}</td>
                  <td className="num">{num(Math.round(pickupPointRows.reduce((s, r) => s + r.distributedLessOrdered, 0)))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="farm-kpi-sub mt-2">
          Forecast is the units on derived and typed forecast orders in the range; confirmed is the count the subscriber confirmed and not yet distributed; distributed is the units on the distribution record each distributed order names, beside the count that was ordered. The channel filter above applies.
        </p>
      </Card>
    </>
  );
}
