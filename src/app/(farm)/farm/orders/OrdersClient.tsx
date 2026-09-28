'use client';

import { CADENCE_LABELS } from '@/data/subscriptions';

import { PageControls } from '@/components/PageControls';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Kpi, StatusBadge, money, num } from '@/components/ui';
import { useScenario } from '@/state/scenario-store';
import { useOperationsWorld } from '@/state/ledger';
import { WorldNote } from '@/components/ledger/WorldNote';
import { GROW_PLAN_STATUS_LABELS } from '@/data/plan-data';
import { ORDER_STATUS_LABELS, ORDER_SOURCE_LABELS, WEEKDAY_LABELS, type OrderDef } from '@/data/orders';
import { recordsActuals } from '@/data/subscribers';
import {
  orderBook,
  summarizeBook,
  distributionDay,
  bookRevenueCents,
  pickupPointActualVsForecast,
  isoAddDays,
  weekdayOf,
  type BookOrder,
} from '@/engine/orders';
import { createOrder, updateOrder, deleteOrder } from '@/server/order-actions';
import { ShipForm, type ShipOrder, type FinishedLot } from '@/components/ShipForm';
import { completeRoute } from '@/server/working-capital-actions';
import { INVOICED_CHANNELS } from '@/data/working-capital';
import type { DateRange } from '@/engine/periods';

type Msg = { kind: 'ok' | 'err'; text: string } | null;
const fromCents = (c: number) => c / 100;
const toCents = (d: number) => Math.round(d * 100);

interface OrderForm {
  orderDate: string; subscriberId: string; subscriberPickupPointId: string; subscriptionId: string | null; growPlanCode: string; units: number;
  status: 'forecast' | 'confirmed'; price: number | ''; notes: string; source: 'typed' | 'subscription';
}

export function OrdersClient({
  canEdit,
  canRecord,
  closures,
  orders: recordedOrders,
  distributions: recordedDistributions,
  finishedLots,
  today,
}: {
  canEdit: boolean;
  /** Operators record distributions; editing orders stays with super admins. */
  canRecord: boolean;
  closures: DateRange[];
  orders: OrderDef[];
  distributions: { id: string; distributedOn: string; units: number; pricePerUnitCents: number; phase: number; subscriberId: string | null; invoiceId: string | null }[];
  /** Output lots from closed sowing records, for the ship form's lot picker. */
  finishedLots: FinishedLot[];
  today: string;
}) {
  const { resolved } = useScenario();
  const cadenceOf = useMemo(() => new Map(resolved.subscribers.flatMap((c) => (c.subscriptions ?? []).map((x) => [x.id, CADENCE_LABELS[x.cadence]] as const))), [resolved.subscribers]);
  // Plan runs the open forecast's own world; Actual the real farm.
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
  const [orderForm, setOrderForm] = useState<{ mode: 'create' | 'edit'; id?: string; form: OrderForm } | null>(null);
  const [shipping, setShipping] = useState<ShipOrder | null>(null);
  const [dayDate, setDayDate] = useState(today);
  const [daySubscriber, setDaySubscriber] = useState<string>('all');

  const channels = resolved.phases.map((p) => ({ phase: p.phase, market: p.market, priceCents: Math.round(p.pricePerUnit * 100) }));
  const growPlanNames = useMemo(() => Object.fromEntries(resolved.growPlans.map((r) => [r.code, r.name])), [resolved.growPlans]);
  const channelPriceCents = useMemo(() => Object.fromEntries(channels.map((c) => [c.phase, c.priceCents])), [channels]);
  const distributionById = useMemo(() => new Map(distributions.map((d) => [d.id, d])), [distributions]);

  const book = useMemo(
    () => orderBook({ pickupPoints: world.pickupPoints, subscribers: resolved.subscribers, orders, from, to, channelPriceCents, growPlanNames, closures }),
    [world.pickupPoints, resolved.subscribers, orders, from, to, channelPriceCents, growPlanNames, closures],
  );
  const shown = useMemo(() => (channelFilter === 'all' ? book : book.filter((o) => o.channel === channelFilter)), [book, channelFilter]);
  const pickupPointRows = useMemo(() => pickupPointActualVsForecast(shown, new Map(distributions.map((d) => [d.id, d.units]))), [shown, distributions]);
  const summary = useMemo(() => summarizeBook(book, channels.map((c) => c.phase)), [book, channels]);
  const dates = useMemo(() => [...new Set(shown.map((o) => o.orderDate))], [shown]);
  const day = useMemo(() => distributionDay(book, dayDate, daySubscriber === 'all' ? null : daySubscriber), [book, dayDate, daySubscriber]);

  function run<R extends { ok: true }>(fn: () => Promise<R | { ok: false; error: string }>, okText: string | ((res: R) => string)) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ kind: 'ok', text: typeof okText === 'function' ? okText(res) : okText });
        setOrderForm(null);
        setShipping(null);
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  // Stored orders are facts of record: a Forecast Subscriber takes none.
  const subscribersWithPickupPoints = resolved.subscribers.filter((c) => c.status !== 'inactive' && recordsActuals(c.status) && c.pickupPoints.length > 0);
  const emptyOrder = (): OrderForm => {
    const c = subscribersWithPickupPoints[0];
    return { orderDate: today, subscriberId: c?.id ?? '', subscriberPickupPointId: c?.pickupPoints[0]?.id ?? '', subscriptionId: null, growPlanCode: resolved.growPlan.code, units: 0, status: 'forecast', price: '', notes: '', source: 'typed' };
  };
  const confirmDerived = (o: BookOrder) =>
    setOrderForm({ mode: 'create', form: { orderDate: o.orderDate, subscriberId: o.subscriberId, subscriberPickupPointId: o.subscriberPickupPointId, subscriptionId: o.subscriptionId, growPlanCode: o.growPlanCode, units: Math.round(o.units), status: 'confirmed', price: '', notes: '', source: o.subscriptionId ? 'subscription' : 'typed' } });
  const openEditOrder = (o: BookOrder) => {
    const row = orders.find((x) => x.id === o.id);
    setOrderForm({ mode: 'edit', id: o.id ?? undefined, form: { orderDate: o.orderDate, subscriberId: o.subscriberId, subscriberPickupPointId: o.subscriberPickupPointId, subscriptionId: o.subscriptionId, growPlanCode: o.growPlanCode, units: o.units, status: o.status === 'confirmed' ? 'confirmed' : 'forecast', price: row?.pricePerUnitCents == null ? '' : fromCents(row.pricePerUnitCents), notes: o.notes ?? '', source: o.source === 'subscription' ? 'subscription' : 'typed' } });
  };
  function submitOrder() {
    if (!orderForm) return;
    const f = orderForm.form;
    const price = f.price === '' ? null : toCents(f.price);
    if (orderForm.mode === 'edit') {
      run(() => updateOrder({ id: orderForm.id, orderDate: f.orderDate, growPlanCode: f.growPlanCode, units: f.units, status: f.status, pricePerUnitCents: price, notes: f.notes || null }), 'Saved the order.');
    } else {
      run(() => createOrder({ orderDate: f.orderDate, subscriberId: f.subscriberId, subscriberPickupPointId: f.subscriberPickupPointId, subscriptionId: f.subscriptionId, growPlanCode: f.growPlanCode, units: f.units, status: f.status, pricePerUnitCents: price, source: f.source, notes: f.notes || null }), `${ORDER_STATUS_LABELS[f.status]} order on file.`);
    }
  }
  const setStatus = (o: BookOrder, status: 'forecast' | 'confirmed') => {
    const row = orders.find((x) => x.id === o.id);
    if (!row) return;
    run(() => updateOrder({ id: row.id, orderDate: row.orderDate, growPlanCode: row.growPlanCode, units: row.units, status, pricePerUnitCents: row.pricePerUnitCents, notes: row.notes }), `Order ${status}.`);
  };
  const openDistribute = (o: BookOrder) => {
    if (!o.id) return;
    setShipping({ id: o.id, orderDate: o.orderDate, subscriberName: o.subscriberName, pickupPointName: o.pickupPointName, growPlanCode: o.growPlanCode, growPlanName: o.growPlanName, units: o.units, pricePerUnitCents: o.pricePerUnitCents });
  };

  const statusCell = (o: BookOrder) => {
    if (o.basis === 'derived') return <><span>{ORDER_STATUS_LABELS.forecast}</span> <StatusBadge status="DERIVED" title="A distribution the subscription carries: its flat plan line on this date. Not stored." /></>;
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
  const streamLabel = (o: BookOrder) => (o.subscriptionId ? `${cadenceOf.get(o.subscriptionId) ?? 'Subscription'} subscription` : 'typed order');

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
      <p className="farm-kpi-sub mt-4">{dates.length} date{dates.length === 1 ? '' : 's'} with orders from {from} to {to} · {shown.length} order{shown.length === 1 ? '' : 's'}</p>

      <div className="grid gap-3 mt-4 farm-autofit-11">
        {channels.map((c) => {
          const s = summary[c.phase];
          return (
            <Kpi
              key={c.phase}
              value={num(Math.round(s?.totalUnits ?? 0))}
              label={`${channelLabel(c.phase)}, units in range`}
              sub={`${num(Math.round(s?.derivedForecastUnits ?? 0))} forecast (derived) · ${num(Math.round(s?.typedForecastUnits ?? 0))} forecast (typed) · ${num(Math.round(s?.confirmedUnits ?? 0))} confirmed · ${num(Math.round(s?.distributedUnits ?? 0))} distributed · ${s?.serviceDates ?? 0} distribution date${(s?.serviceDates ?? 0) === 1 ? '' : 's'}`}
            />
          );
        })}
        <Kpi value={money(fromCents(bookRevenueCents(shown)), 0)} label="Revenue at the prices in force" sub="Order price, else the subscriber's contract, else the channel default; own use at nothing. Computed from units; nothing stored." />
      </div>

      <Card title="Order book" className="mt-4">
        {canEditOrders && <button type="button" className="farm-btn" onClick={() => setOrderForm({ mode: 'create', form: emptyOrder() })} disabled={pending || subscribersWithPickupPoints.length === 0}>Add order</button>}
        {shown.length === 0 && <p className="farm-kpi-sub mt-2">No orders in this range. A forecast order is a distribution a subscription carries; subscriptions are on Subscribers.</p>}
        {dates.map((d) => {
          const rows = shown.filter((o) => o.orderDate === d);
          const units = rows.reduce((a, o) => a + o.units, 0);
          return (
            <div key={d} className="farm-scroll-x mt-[0.9rem]!">
              <div className="farm-kpi-sub"><span className="farm-c-ink font-semibold">{dateLabel(d)}</span> · {num(Math.round(units))} units · {rows.length} order{rows.length === 1 ? '' : 's'}</div>
              <table className="farm-table mt-[0.3rem]!">
                <thead><tr><th>Subscriber</th><th>Pickup point · subscription</th><th>Grow plan</th><th className="num">Units</th><th className="num">Price</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.key}>
                      <td>{o.subscriberName}<div className="farm-c-faint farm-fs-2xs">{channelLabel(o.channel)}</div></td>
                      <td>{o.pickupPointName}<div className="farm-c-faint farm-fs-2xs">{streamLabel(o)}{o.distributionPickupPointId ? ` · distribution pickup point ${o.distributionPickupPointId}` : ''}</div></td>
                      <td>{o.growPlanCode}<div className="farm-c-faint farm-fs-2xs">{o.growPlanName}</div></td>
                      <td className="num">{num(Math.round(o.units))}</td>
                      <td className="num">{money(fromCents(o.pricePerUnitCents))}<div className="farm-c-faint farm-fs-2xs">{o.priceBasis === 'own-use' ? 'own use, not sold' : o.priceBasis === 'order' ? 'on the order' : o.priceBasis === 'contract' ? 'contracted' : 'channel default'}</div></td>
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
              <select className="farm-select" value={orderForm.form.subscriberId} disabled={orderForm.mode === 'edit' || orderForm.form.source !== 'typed'} onChange={(e) => { const c = subscribersWithPickupPoints.find((x) => x.id === e.target.value); setOrderForm({ ...orderForm, form: { ...orderForm.form, subscriberId: e.target.value, subscriberPickupPointId: c?.pickupPoints[0]?.id ?? '' } }); }}>
                {(orderForm.mode === 'edit' ? resolved.subscribers : subscribersWithPickupPoints).map((c) => <option key={c.id} value={c.id}>{c.name} · {channelLabel(c.channel)}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub">Pickup point<br />
              <select className="farm-select" value={orderForm.form.subscriberPickupPointId} disabled={orderForm.mode === 'edit' || orderForm.form.source !== 'typed'} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, subscriberPickupPointId: e.target.value } })}>
                {(resolved.subscribers.find((c) => c.id === orderForm.form.subscriberId)?.pickupPoints ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub">Grow plan<br />
              <select className="farm-select" value={orderForm.form.growPlanCode} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, growPlanCode: e.target.value } })}>
                {resolved.growPlans.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.name} · {GROW_PLAN_STATUS_LABELS[r.status]}</option>)}
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
            <button type="button" className="farm-btn primary" onClick={submitOrder} disabled={pending || !orderForm.form.subscriberPickupPointId || !orderForm.form.growPlanCode}>Save</button>
            <button type="button" className="farm-btn" onClick={() => setOrderForm(null)} disabled={pending}>Cancel</button>
          </div>
          {orderForm.form.source !== 'typed' && <p className="farm-kpi-sub mt-2">Confirming writes a row that replaces the distribution the subscription carries for this pickup point, date and grow plan. The subscription is unchanged.</p>}
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
            // Distributed, invoiced-channel distributions on the date not yet on an invoice.
            const waiting = distributions.filter((d) => d.distributedOn === dayDate && INVOICED_CHANNELS.includes(d.phase) && d.subscriberId && !d.invoiceId && (daySubscriber === 'all' || d.subscriberId === daySubscriber));
            if (!canRecordHere || waiting.length === 0) return null;
            return (
              <button type="button" className="farm-btn" disabled={pending} onClick={() => run(() => completeRoute({ date: dayDate, subscriberId: daySubscriber === 'all' ? null : daySubscriber }), `Route of ${dayDate} completed: ${waiting.length} distribution${waiting.length === 1 ? '' : 's'} added to the month's invoice${daySubscriber === 'all' ? 's' : ''}.`)}>
                Complete route — {waiting.length} distribution{waiting.length === 1 ? '' : 's'} to invoice
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
                <thead><tr><th>Grow plan</th><th className="num">Units</th><th className="num">Orders</th></tr></thead>
                <tbody>{day.byGrowPlan.map((r) => <tr key={r.growPlanCode}><td>{r.growPlanCode}<div className="farm-c-faint farm-fs-2xs">{r.growPlanName}</div></td><td className="num">{num(Math.round(r.units))}</td><td className="num">{r.orders}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
        {day.orders.length === 0 && <p className="farm-kpi-sub mt-2">No orders on this date{dayDate < from || dayDate > to ? ' — it is outside the range above' : ''}.</p>}
        <p className="farm-kpi-sub mt-2">
          The units by grow plan on a date are what <Link className="farm-link" href="/farm/production-planning">Production Planning</Link> explodes into production requirements. Subscriptions are edited on <Link className="farm-link" href="/farm/subscribers">Subscribers</Link>; distribution records are on <Link className="farm-link" href="/farm/actuals">Actuals</Link>.
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
                  <th>Pickup point</th><th className="num">Distribution dates</th><th className="num">Forecast</th><th className="num">Confirmed</th><th className="num">Distributed orders</th><th className="num">Ordered</th><th className="num">Distributed</th><th className="num">Distributed − ordered</th>
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
