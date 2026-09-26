'use client';

import { PageControls } from '../_components/PageControls';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Kpi, StatusBadge, money, num } from '../_components/ui';
import { useScenario } from '../_state/scenario-store';
import { useOperationsWorld } from '../_state/ledger';
import { WorldNote } from '../_components/ledger/WorldNote';
import { RECIPE_STATUS_LABELS } from '../_data/plan-data';
import {
  ORDER_STATUS_LABELS,
  ORDER_SOURCE_LABELS,
  WEEKDAY_LABELS,
  type MenuCycleDef,
  type OrderDef,
} from '../_data/menu-cycles';
import { MealPlanForm, SequenceTable, emptySequence, valuesOf, type SequenceValues } from '../_components/MealPlanForm';
import { plansFromCycle, savedCycles } from '../_engine/meal-plans';
import { recordsActuals } from '../_data/customers';
import {
  orderBook,
  summarizeBook,
  deliveryDay,
  bookRevenueCents,
  siteActualVsForecast,
  isoAddDays,
  weekdayOf,
  cycleDayOn,
  type BookOrder,
} from '../_engine/orders';
import {
  createMenuCycle,
  updateMenuCycle,
  assignMenuCycle,
  deleteMenuCycle,
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
  orderDate: string; customerId: string; customerSiteId: string; customerServiceId: string | null; recipeCode: string; meals: number;
  status: 'forecast' | 'confirmed'; price: number | ''; notes: string; menuCycleId: string | null; source: 'typed' | 'cycle';
}

export function OrdersClient({
  canEdit,
  canRecord,
  closures,
  cycles,
  orders: recordedOrders,
  deliveries: recordedDeliveries,
  finishedLots,
  today,
}: {
  canEdit: boolean;
  /** Operators record deliveries; editing orders and cycles stays with super admins. */
  canRecord: boolean;
  closures: DateRange[];
  cycles: MenuCycleDef[];
  orders: OrderDef[];
  deliveries: { id: string; deliveredOn: string; meals: number; pricePerMealCents: number; phase: number; customerId: string | null; invoiceId: string | null }[];
  /** Output lots from closed batch records, for the ship form's lot picker. */
  finishedLots: FinishedLot[];
  today: string;
}) {
  const { resolved } = useScenario();
  // Plan runs the open forecast's own world; Actual the real kitchen (Roadmap N6 slice 3).
  const world = useOperationsWorld({ orders: recordedOrders, deliveries: recordedDeliveries });
  const { orders, deliveries } = world;
  /** Orders, confirmations, deliveries and routes are recorded on Actual only. */
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
  const [assigning, setAssigning] = useState<{ cycleId: string; customerIds: Set<string>; startDate: string } | null>(null);
  const [orderForm, setOrderForm] = useState<{ mode: 'create' | 'edit'; id?: string; form: OrderForm } | null>(null);
  const [shipping, setShipping] = useState<ShipOrder | null>(null);
  const [dayDate, setDayDate] = useState(today);
  const [dayCustomer, setDayCustomer] = useState<string>('all');

  const channels = resolved.phases.map((p) => ({ phase: p.phase, market: p.market, priceCents: Math.round(p.pricePerMeal * 100) }));
  const recipeNames = useMemo(() => Object.fromEntries(resolved.recipes.map((r) => [r.code, r.name])), [resolved.recipes]);
  const channelPriceCents = useMemo(() => Object.fromEntries(channels.map((c) => [c.phase, c.priceCents])), [channels]);
  const deliveryById = useMemo(() => new Map(deliveries.map((d) => [d.id, d])), [deliveries]);

  const book = useMemo(
    () => orderBook({ sites: world.sites, customers: resolved.customers, cycles, orders, from, to, channelPriceCents, recipeNames, closures }),
    [world.sites, resolved.customers, cycles, orders, from, to, channelPriceCents, recipeNames, closures],
  );
  const shown = useMemo(() => (channelFilter === 'all' ? book : book.filter((o) => o.channel === channelFilter)), [book, channelFilter]);
  const siteRows = useMemo(() => siteActualVsForecast(shown, new Map(deliveries.map((d) => [d.id, d.meals]))), [shown, deliveries]);
  const summary = useMemo(() => summarizeBook(book, channels.map((c) => c.phase)), [book, channels]);
  const dates = useMemo(() => [...new Set(shown.map((o) => o.orderDate))], [shown]);
  const day = useMemo(() => deliveryDay(book, dayDate, dayCustomer === 'all' ? null : dayCustomer), [book, dayDate, dayCustomer]);
  const whatIf = world.sites.some((s) => s.edited);

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

  // ── Saved menu cycles ─────────────────────────────────────────────────────
  const saved = useMemo(() => savedCycles(cycles), [cycles]);
  const customerName = useMemo(() => new Map(resolved.customers.map((c) => [c.id, c.name])), [resolved.customers]);
  const openEditCycle = (c: MenuCycleDef) => {
    setApplyTo('none');
    setCycleForm({ mode: 'edit', id: c.id, initial: valuesOf(c) });
  };
  function submitCycle(v: SequenceValues) {
    if (!cycleForm) return;
    const payload = { ...v, customerId: null, customerServiceId: null };
    if (cycleForm.mode === 'create') {
      run(() => createMenuCycle(payload), `Saved menu cycle ${v.name}.`);
      return;
    }
    const plans = plansFromCycle(cycles, cycleForm.id!);
    const applyToPlanIds = applyTo === 'none' ? [] : applyTo === 'all' ? plans.map((p) => p.id) : [...applyTo];
    run(() => updateMenuCycle({ ...payload, id: cycleForm.id, applyToPlanIds }), (res) => `Saved ${v.name}; applied to ${res.applied} customer meal plan${res.applied === 1 ? '' : 's'}.`);
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  // Stored orders are facts of record: a Forecast Customer takes none.
  const customersWithSites = resolved.customers.filter((c) => c.status !== 'inactive' && recordsActuals(c.status) && c.sites.length > 0);
  const emptyOrder = (): OrderForm => {
    const c = customersWithSites[0];
    return { orderDate: today, customerId: c?.id ?? '', customerSiteId: c?.sites[0]?.id ?? '', customerServiceId: c?.sites[0]?.services[0]?.id ?? null, recipeCode: resolved.recipe.code, meals: 0, status: 'forecast', price: '', notes: '', menuCycleId: null, source: 'typed' };
  };
  const confirmDerived = (o: BookOrder) =>
    setOrderForm({ mode: 'create', form: { orderDate: o.orderDate, customerId: o.customerId, customerSiteId: o.customerSiteId, customerServiceId: o.customerServiceId, recipeCode: o.recipeCode, meals: Math.round(o.meals), status: 'confirmed', price: '', notes: '', menuCycleId: o.menuCycleId, source: 'cycle' } });
  const openEditOrder = (o: BookOrder) => {
    const row = orders.find((x) => x.id === o.id);
    setOrderForm({ mode: 'edit', id: o.id ?? undefined, form: { orderDate: o.orderDate, customerId: o.customerId, customerSiteId: o.customerSiteId, customerServiceId: o.customerServiceId, recipeCode: o.recipeCode, meals: o.meals, status: o.status === 'confirmed' ? 'confirmed' : 'forecast', price: row?.pricePerMealCents == null ? '' : fromCents(row.pricePerMealCents), notes: o.notes ?? '', menuCycleId: o.menuCycleId, source: o.source === 'cycle' ? 'cycle' : 'typed' } });
  };
  function submitOrder() {
    if (!orderForm) return;
    const f = orderForm.form;
    const price = f.price === '' ? null : toCents(f.price);
    if (orderForm.mode === 'edit') {
      run(() => updateOrder({ id: orderForm.id, orderDate: f.orderDate, recipeCode: f.recipeCode, meals: f.meals, status: f.status, pricePerMealCents: price, notes: f.notes || null }), 'Saved the order.');
    } else {
      run(() => createOrder({ orderDate: f.orderDate, customerId: f.customerId, customerSiteId: f.customerSiteId, customerServiceId: f.customerServiceId, recipeCode: f.recipeCode, meals: f.meals, status: f.status, pricePerMealCents: price, menuCycleId: f.menuCycleId, source: f.source, notes: f.notes || null }), `${ORDER_STATUS_LABELS[f.status]} order on file.`);
    }
  }
  const setStatus = (o: BookOrder, status: 'forecast' | 'confirmed') => {
    const row = orders.find((x) => x.id === o.id);
    if (!row) return;
    run(() => updateOrder({ id: row.id, orderDate: row.orderDate, recipeCode: row.recipeCode, meals: row.meals, status, pricePerMealCents: row.pricePerMealCents, notes: row.notes }), `Order ${status}.`);
  };
  const openDeliver = (o: BookOrder) => {
    if (!o.id) return;
    setShipping({ id: o.id, orderDate: o.orderDate, customerName: o.customerName, siteName: o.siteName, recipeCode: o.recipeCode, recipeName: o.recipeName, meals: o.meals, pricePerMealCents: o.pricePerMealCents });
  };

  const statusCell = (o: BookOrder) => {
    if (o.basis === 'derived') return <><span>{ORDER_STATUS_LABELS.forecast}</span> <StatusBadge status="DERIVED" title="The customer's meal plan recipe × the service's meals per service. Not stored." /></>;
    const d = o.deliveryId ? deliveryById.get(o.deliveryId) : undefined;
    return (
      <>
        <span>{ORDER_STATUS_LABELS[o.status]}</span> <StatusBadge status="STATED" title={`${ORDER_SOURCE_LABELS[o.source]}; on file.`} />
        {o.status === 'delivered' && (
          <div className="muse-c-faint muse-fs-2xs">
            {d ? <>{num(d.meals)} delivered {d.deliveredOn} · <Link className="muse-link" href="/muse/actuals">record</Link></> : 'delivery record removed'}
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
      {msg && <div className={`muse-scenariobar-msg ${msg.kind} mt-4`} role="status">{msg.text}</div>}

      <PageControls>
        <label className="muse-kpi-sub inline-flex items-center gap-2">From<input className="muse-input" type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <label className="muse-kpi-sub inline-flex items-center gap-2">To<input className="muse-input" type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        <label className="muse-kpi-sub inline-flex items-center gap-2">Channel
          <select className="muse-select" value={channelFilter} onChange={(e) => setChannelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All channels</option>
            {channels.map((c) => <option key={c.phase} value={c.phase}>{channelLabel(c.phase)}</option>)}
          </select>
        </label>
      </PageControls>
      <p className="muse-kpi-sub mt-4">{dates.length} date{dates.length === 1 ? '' : 's'} with orders from {from} to {to} · {shown.length} order{shown.length === 1 ? '' : 's'}{whatIf ? ' · forecast orders follow the open forecast’s edits on Customers' : ''}</p>

      <div className="grid gap-3 mt-4 muse-autofit-11">
        {channels.map((c) => {
          const s = summary[c.phase];
          return (
            <Kpi
              key={c.phase}
              value={num(Math.round(s?.totalMeals ?? 0))}
              label={`${channelLabel(c.phase)}, meals in range`}
              sub={`${num(Math.round(s?.derivedForecastMeals ?? 0))} forecast (derived) · ${num(Math.round(s?.typedForecastMeals ?? 0))} forecast (typed) · ${num(Math.round(s?.confirmedMeals ?? 0))} confirmed · ${num(Math.round(s?.deliveredMeals ?? 0))} delivered · ${s?.serviceDates ?? 0} service date${(s?.serviceDates ?? 0) === 1 ? '' : 's'}`}
            />
          );
        })}
        <Kpi value={money(fromCents(bookRevenueCents(shown)), 0)} label="Revenue at the prices in force" sub="Order price, else the customer's contract, else the channel default. Computed from meals; nothing stored." />
      </div>

      <Card title="Saved menu cycles" className="mt-4">
        <p className="muse-kpi-sub">
          A saved cycle is a recipe sequence on the shared list. It serves nobody until it is assigned: assigning copies it
          onto a customer as that customer&rsquo;s meal plan. A channel never decides what a customer is served. Meal plans,
          and a sequence programmed for one customer, are on <Link className="muse-link" href="/muse/customers">Customers</Link>.
        </p>
        {canEdit && <button type="button" className="muse-btn" onClick={() => { setApplyTo('none'); setCycleForm({ mode: 'create', initial: emptySequence(today) }); }} disabled={pending}>Add menu cycle</button>}
        {saved.length === 0 && <p className="muse-kpi-sub mt-2">No saved menu cycles.</p>}
        {saved.map((cy) => {
          const todayDay = cycleDayOn(cy, today);
          const plans = plansFromCycle(cycles, cy.id);
          const onCycle = [...new Set(plans.map((p) => p.customerId!))].map((id) => customerName.get(id) ?? 'Customer removed');
          return (
            <div key={cy.id} className="muse-scroll-x mt-[0.9rem]!">
              <div className="muse-kpi-sub">
                <span className="muse-c-ink font-semibold">{cy.name}</span> · from {cy.startDate}{cy.endDate ? ` to ${cy.endDate}` : ''} · {cy.lengthDays}-day sequence on {cy.weekdays.map((w) => WEEKDAY_LABELS[w]).join(' ')} · {cy.status}
                {todayDay !== null ? ` · today is day ${todayDay}` : ''}
                {' · '}{onCycle.length ? `copied to ${onCycle.join(', ')}` : 'assigned to no customer'}
                {canEdit && (
                  <span className="inline-flex gap-[0.3rem] ml-[0.6rem]!">
                    <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setAssigning({ cycleId: cy.id, customerIds: new Set(), startDate: cy.startDate })} disabled={pending}>Assign to customers</button>
                    <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => openEditCycle(cy)} disabled={pending}>Edit</button>
                    <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => run(() => deleteMenuCycle({ id: cy.id }), `Removed ${cy.name}. Meal plans copied from it keep their sequence.`)} disabled={pending}>Remove</button>
                  </span>
                )}
              </div>
              <SequenceTable plan={cy} recipeNames={recipeNames} />
              {assigning?.cycleId === cy.id && (
                <div className="mt-2! flex flex-wrap gap-3 items-end">
                  <div className="muse-kpi-sub">Customers<br />
                    <span className="inline-flex flex-wrap gap-[0.6rem] mt-[0.2rem]!">
                      {resolved.customers.filter((c) => c.status !== 'inactive').map((c) => (
                        <label key={c.id} className="inline-flex! gap-1! items-center!">
                          <input type="checkbox" checked={assigning.customerIds.has(c.id)} onChange={(e) => { const next = new Set(assigning.customerIds); if (e.target.checked) next.add(c.id); else next.delete(c.id); setAssigning({ ...assigning, customerIds: next }); }} />
                          {c.name} · {channelLabel(c.channel)}
                        </label>
                      ))}
                    </span>
                  </div>
                  <label className="muse-kpi-sub">Plan starts<br /><input className="muse-input" type="date" value={assigning.startDate} onChange={(e) => e.target.value && setAssigning({ ...assigning, startDate: e.target.value })} /></label>
                  <button type="button" className="muse-btn primary" disabled={pending || assigning.customerIds.size === 0} onClick={() => run(async () => { const res = await assignMenuCycle({ cycleId: cy.id, customerIds: [...assigning.customerIds], startDate: assigning.startDate }); if (res.ok) setAssigning(null); return res; }, `${cy.name} copied to ${assigning.customerIds.size} customer${assigning.customerIds.size === 1 ? '' : 's'}.`)}>Assign</button>
                  <button type="button" className="muse-btn" onClick={() => setAssigning(null)} disabled={pending}>Cancel</button>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {cycleForm && (() => {
        const plans = cycleForm.mode === 'edit' ? plansFromCycle(cycles, cycleForm.id!) : [];
        return (
          <MealPlanForm
            key={cycleForm.id ?? 'new'}
            title={cycleForm.mode === 'edit' ? 'Edit menu cycle' : 'Add menu cycle'}
            initial={cycleForm.initial}
            recipes={resolved.recipes}
            pending={pending}
            onSave={submitCycle}
            onCancel={() => setCycleForm(null)}
          >
            {plans.length > 0 && (
              <div className="muse-kpi-sub mt-3!">
                Apply this edit to customer meal plans copied from this cycle
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
                        {customerName.get(p.customerId!) ?? 'Customer removed'} · {p.name} from {p.startDate}
                      </label>
                    ))}
                  </div>
                )}
                <div className="mt-[0.3rem]!">A plan not picked keeps its sequence. Each plan keeps its own start and end date.</div>
              </div>
            )}
          </MealPlanForm>
        );
      })()}

      <Card title="Order book" className="mt-4">
        {canEditOrders && <button type="button" className="muse-btn" onClick={() => setOrderForm({ mode: 'create', form: emptyOrder() })} disabled={pending || customersWithSites.length === 0}>Add order</button>}
        {shown.length === 0 && <p className="muse-kpi-sub mt-2">No orders in this range. A forecast order needs a service with meals per service and a meal plan on Customers.</p>}
        {dates.map((d) => {
          const rows = shown.filter((o) => o.orderDate === d);
          const meals = rows.reduce((a, o) => a + o.meals, 0);
          return (
            <div key={d} className="muse-scroll-x mt-[0.9rem]!">
              <div className="muse-kpi-sub"><span className="muse-c-ink font-semibold">{dateLabel(d)}</span> · {num(Math.round(meals))} meals · {rows.length} order{rows.length === 1 ? '' : 's'}</div>
              <table className="muse-table mt-[0.3rem]!">
                <thead><tr><th>Customer</th><th>Site · service</th><th>Recipe</th><th className="num">Meals</th><th className="num">Price</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.key}>
                      <td>{o.customerName}<div className="muse-c-faint muse-fs-2xs">{channelLabel(o.channel)}</div></td>
                      <td>{o.siteName}<div className="muse-c-faint muse-fs-2xs">{o.serviceName ?? 'no service named'}{o.deliverySiteId ? ` · delivery site ${o.deliverySiteId}` : ''}</div></td>
                      <td>{o.recipeCode}<div className="muse-c-faint muse-fs-2xs">{o.recipeName}</div></td>
                      <td className="num">{num(Math.round(o.meals))}</td>
                      <td className="num">{money(fromCents(o.pricePerMealCents))}<div className="muse-c-faint muse-fs-2xs">{o.priceBasis === 'order' ? 'on the order' : o.priceBasis === 'contract' ? 'contracted' : 'channel default'}</div></td>
                      <td>{statusCell(o)}</td>
                      <td className="num">
                        {(canEditOrders || canRecordHere) && (
                          <span className="inline-flex gap-[0.3rem]">
                            {canEditOrders && o.basis === 'derived' && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => confirmDerived(o)} disabled={pending}>Confirm count</button>}
                            {canEditOrders && o.basis === 'record' && o.status === 'forecast' && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setStatus(o, 'confirmed')} disabled={pending}>Confirm</button>}
                            {canRecordHere && o.basis === 'record' && o.status === 'confirmed' && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => openDeliver(o)} disabled={pending}>Deliver</button>}
                            {canEditOrders && o.basis === 'record' && o.status !== 'delivered' && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => openEditOrder(o)} disabled={pending}>Edit</button>}
                            {canEditOrders && o.basis === 'record' && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => run(() => deleteOrder({ id: o.id }), 'Removed the order.')} disabled={pending}>×</button>}
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
            <label className="muse-kpi-sub">Date<br /><input className="muse-input" type="date" value={orderForm.form.orderDate} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, orderDate: e.target.value } })} /></label>
            <label className="muse-kpi-sub">Customer<br />
              <select className="muse-select" value={orderForm.form.customerId} disabled={orderForm.mode === 'edit' || orderForm.form.source === 'cycle'} onChange={(e) => { const c = customersWithSites.find((x) => x.id === e.target.value); setOrderForm({ ...orderForm, form: { ...orderForm.form, customerId: e.target.value, customerSiteId: c?.sites[0]?.id ?? '', customerServiceId: c?.sites[0]?.services[0]?.id ?? null } }); }}>
                {(orderForm.mode === 'edit' ? resolved.customers : customersWithSites).map((c) => <option key={c.id} value={c.id}>{c.name} · {channelLabel(c.channel)}</option>)}
              </select>
            </label>
            <label className="muse-kpi-sub">Site<br />
              <select className="muse-select" value={orderForm.form.customerSiteId} disabled={orderForm.mode === 'edit' || orderForm.form.source === 'cycle'} onChange={(e) => { const site = resolved.customers.find((c) => c.id === orderForm.form.customerId)?.sites.find((x) => x.id === e.target.value); setOrderForm({ ...orderForm, form: { ...orderForm.form, customerSiteId: e.target.value, customerServiceId: site?.services[0]?.id ?? null } }); }}>
                {(resolved.customers.find((c) => c.id === orderForm.form.customerId)?.sites ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="muse-kpi-sub">Service<br />
              <select className="muse-select" value={orderForm.form.customerServiceId ?? ''} disabled={orderForm.mode === 'edit' || orderForm.form.source === 'cycle'} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, customerServiceId: e.target.value || null } })}>
                {(resolved.customers.find((c) => c.id === orderForm.form.customerId)?.sites.find((x) => x.id === orderForm.form.customerSiteId)?.services ?? []).map((sv) => <option key={sv.id} value={sv.id}>{sv.name}</option>)}
              </select>
            </label>
            <label className="muse-kpi-sub">Recipe<br />
              <select className="muse-select" value={orderForm.form.recipeCode} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, recipeCode: e.target.value } })}>
                {resolved.recipes.map((r) => <option key={r.code} value={r.code}>{r.code} — {r.name} · {RECIPE_STATUS_LABELS[r.status]}</option>)}
              </select>
            </label>
            <label className="muse-kpi-sub">Meals<br /><input className="muse-input w-26!" type="number" min={0} value={orderForm.form.meals} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, meals: Number(e.target.value) } })} /></label>
            <label className="muse-kpi-sub">Status<br />
              <select className="muse-select" value={orderForm.form.status} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, status: e.target.value as 'forecast' | 'confirmed' } })}>
                <option value="forecast">Forecast (typed)</option><option value="confirmed">Confirmed</option>
              </select>
            </label>
            <label className="muse-kpi-sub">Price / meal $ (blank = contract or channel)<br /><input className="muse-input w-26!" type="number" min={0} step={0.01} value={orderForm.form.price} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, price: e.target.value === '' ? '' : Number(e.target.value) } })} /></label>
            <label className="muse-kpi-sub flex-1! min-w-56!">Notes<br /><input className="muse-input w-full!" value={orderForm.form.notes} onChange={(e) => setOrderForm({ ...orderForm, form: { ...orderForm.form, notes: e.target.value } })} /></label>
            <button type="button" className="muse-btn primary" onClick={submitOrder} disabled={pending || !orderForm.form.customerSiteId || !orderForm.form.recipeCode}>Save</button>
            <button type="button" className="muse-btn" onClick={() => setOrderForm(null)} disabled={pending}>Cancel</button>
          </div>
          {orderForm.form.source === 'cycle' && <p className="muse-kpi-sub mt-2">Confirming writes a row that replaces the forecast order for this site, service, date and recipe. The volume on Customers is unchanged.</p>}
        </Card>
      )}

      {shipping && world.recording && (
        <div className="mt-4">
          <ShipForm order={shipping} finishedLots={finishedLots} today={today} onDone={() => setShipping(null)} onCancel={() => setShipping(null)} />
          <p className="muse-kpi-sub -mt-2!">The delivery record posts revenue and cost of goods sold through the ledger; the order keeps the count that was ordered, so the difference stays visible.</p>
        </div>
      )}

      <Card title="Delivery day — every order on a date" className="mt-4">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="muse-kpi-sub">Date<br /><input className="muse-input" type="date" value={dayDate} onChange={(e) => e.target.value && setDayDate(e.target.value)} /></label>
          <label className="muse-kpi-sub">Customer<br />
            <select className="muse-select" value={dayCustomer} onChange={(e) => setDayCustomer(e.target.value)}>
              <option value="all">All customers</option>
              {resolved.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <span className="muse-kpi-sub">{dateLabel(dayDate)} · {num(Math.round(day.totalMeals))} meals · {day.orders.length} order{day.orders.length === 1 ? '' : 's'} · {money(fromCents(bookRevenueCents(day.orders)), 0)} at the prices in force</span>
          {(() => {
            // Roadmap K1: delivered, invoiced-channel deliveries on the date not yet on an invoice.
            const waiting = deliveries.filter((d) => d.deliveredOn === dayDate && INVOICED_CHANNELS.includes(d.phase) && d.customerId && !d.invoiceId && (dayCustomer === 'all' || d.customerId === dayCustomer));
            if (!canRecordHere || waiting.length === 0) return null;
            return (
              <button type="button" className="muse-btn" disabled={pending} onClick={() => run(() => completeRoute({ date: dayDate, customerId: dayCustomer === 'all' ? null : dayCustomer }), `Route of ${dayDate} completed: ${waiting.length} deliver${waiting.length === 1 ? 'y' : 'ies'} added to the month's invoice${dayCustomer === 'all' ? 's' : ''}.`)}>
                Complete route — {waiting.length} deliver{waiting.length === 1 ? 'y' : 'ies'} to invoice
              </button>
            );
          })()}
        </div>
        {day.orders.length > 0 && (
          <div className="grid gap-4 mt-3 muse-autofit-18">
            <div className="muse-scroll-x">
              <table className="muse-table">
                <thead><tr><th>Site</th><th className="num">Meals</th></tr></thead>
                <tbody>{day.bySite.map((s) => <tr key={s.customerSiteId}><td>{s.siteName}<div className="muse-c-faint muse-fs-2xs">{s.customerName}</div></td><td className="num">{num(Math.round(s.meals))}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="muse-scroll-x">
              <table className="muse-table">
                <thead><tr><th>Recipe</th><th className="num">Meals</th><th className="num">Orders</th></tr></thead>
                <tbody>{day.byRecipe.map((r) => <tr key={r.recipeCode}><td>{r.recipeCode}<div className="muse-c-faint muse-fs-2xs">{r.recipeName}</div></td><td className="num">{num(Math.round(r.meals))}</td><td className="num">{r.orders}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
        {day.orders.length === 0 && <p className="muse-kpi-sub mt-2">No orders on this date{dayDate < from || dayDate > to ? ' — it is outside the range above' : ''}.</p>}
        <p className="muse-kpi-sub mt-2">
          The meals by recipe on a date are what <Link className="muse-link" href="/muse/production-planning">Production Planning</Link> explodes into production requirements. Services, volume and meal plans are edited on <Link className="muse-link" href="/muse/customers">Customers</Link>; delivery records are on <Link className="muse-link" href="/muse/actuals">Actuals</Link>.
        </p>
      </Card>

      <Card title={`Sites — forecast, confirmed, delivered · ${dateLabel(from)} to ${dateLabel(to)}`} className="mt-4">
        {siteRows.length === 0 ? (
          <p className="muse-kpi-sub">No site has an order in the range.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead>
                <tr>
                  <th>Site</th><th className="num">Service dates</th><th className="num">Forecast</th><th className="num">Confirmed</th><th className="num">Delivered orders</th><th className="num">Ordered</th><th className="num">Delivered</th><th className="num">Delivered − ordered</th>
                </tr>
              </thead>
              <tbody>
                {siteRows.map((r) => (
                  <tr key={r.customerSiteId}>
                    <td>{r.siteName}<div className="muse-c-faint muse-fs-2xs">{r.customerName} · {channelLabel(r.channel)}</div></td>
                    <td className="num">{r.serviceDates}</td>
                    <td className="num">{num(Math.round(r.forecastMeals))}</td>
                    <td className="num">{num(Math.round(r.confirmedMeals))}</td>
                    <td className="num">{r.deliveredOrders}</td>
                    <td className="num">{r.deliveredOrders ? num(Math.round(r.orderedOnDelivered)) : '—'}</td>
                    <td className="num">{r.deliveredOrders ? num(Math.round(r.deliveredMeals)) : '—'}</td>
                    <td className="num">{r.deliveredOrders ? `${r.deliveredLessOrdered > 0 ? '+' : ''}${num(Math.round(r.deliveredLessOrdered))}` : '—'}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td>All sites</td>
                  <td className="num">—</td>
                  <td className="num">{num(Math.round(siteRows.reduce((s, r) => s + r.forecastMeals, 0)))}</td>
                  <td className="num">{num(Math.round(siteRows.reduce((s, r) => s + r.confirmedMeals, 0)))}</td>
                  <td className="num">{siteRows.reduce((s, r) => s + r.deliveredOrders, 0)}</td>
                  <td className="num">{num(Math.round(siteRows.reduce((s, r) => s + r.orderedOnDelivered, 0)))}</td>
                  <td className="num">{num(Math.round(siteRows.reduce((s, r) => s + r.deliveredMeals, 0)))}</td>
                  <td className="num">{num(Math.round(siteRows.reduce((s, r) => s + r.deliveredLessOrdered, 0)))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="muse-kpi-sub mt-2">
          Forecast is the meals on derived and typed forecast orders in the range; confirmed is the count the customer confirmed and not yet delivered; delivered is the meals on the delivery record each delivered order names, beside the count that was ordered. The channel filter above applies.
        </p>
      </Card>
    </>
  );
}
