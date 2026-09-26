'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CheckPill, num } from '@/app/(muse)/muse/_components/ui';
import { ReceiveForm, type ReceiveIngredient, type ReceivePo } from '@/app/(muse)/muse/_components/ReceiveForm';
import { BatchCloseForm } from '@/app/(muse)/muse/_components/BatchCloseForm';
import { ShipForm, type ShipOrder } from '@/app/(muse)/muse/_components/ShipForm';
import { clock } from '@/app/(muse)/muse/_data/crews';
import { WEEKDAY_LABELS, type MenuCycleDef, type OrderDef } from '@/app/(muse)/muse/_data/menu-cycles';
import type { ResolvedInputs } from '@/app/(muse)/muse/_engine/scenario';
import { orderBook, isoAddDays, weekdayOf } from '@/app/(muse)/muse/_engine/orders';
import { requirementsFor, finishedGoodsOnHand, planProductionDay, productionDateFor, portionFactorFor, type Consumption } from '@/app/(muse)/muse/_engine/production-plan';
import { standardBatchRecordPrefill, finishedLotsOf, type BatchRecordDoc, type ReceiptDoc } from '@/app/(muse)/muse/_engine/actuals';
import { rawStockOnHand, rawLotsByUseBy, openOrders } from '@/app/(muse)/muse/_engine/net-requirements';
import type { DateRange } from '@/app/(muse)/muse/_engine/periods';
import { standardInForce, standardLabel, type StandardVersionDoc } from '@/app/(muse)/muse/_engine/standards';
import type { PunchDoc, StaffDoc } from '@/app/(muse)/muse/_engine/payroll';
import { TimeClockCard } from '@/app/(muse)/muse/_components/TimeClockCard';
import { completeRoute } from '@/app/(muse)/muse/_lib/working-capital-actions';

const SERVICE_WEEKDAYS = [1, 2, 3, 4, 5];

/** Today's delivered routes not yet on an invoice (Roadmap K1). Completing one adds it to the customer's invoice for the month. */
function RouteCard({ today, routes }: { today: string; routes: { customerId: string; customerName: string; deliveries: number; meals: number }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  return (
    <Card title={`Routes — ${routes.length} delivered today, not yet on an invoice`} className="mt-4">
      {msg && <div className={`muse-scenariobar-msg ${msg.kind} mb-[0.6rem]!`} role="status">{msg.text}</div>}
      {routes.length === 0 ? (
        <p className="muse-kpi-sub">No School lunches or Corporate catering delivery today is waiting for its route to be completed.</p>
      ) : (
        <div className="muse-floor-queue">
          {routes.map((r) => (
            <div key={r.customerId} className="muse-floor-row">
              <div>
                <div className="muse-floor-row-title">{r.customerName}</div>
                <div className="muse-floor-row-sub">{r.deliveries} deliver{r.deliveries === 1 ? 'y' : 'ies'} · {num(Math.round(r.meals))} meals</div>
              </div>
              <button type="button" className="muse-btn" disabled={pending} onClick={() => start(async () => {
                const res = await completeRoute({ date: today, customerId: r.customerId });
                setMsg(res.ok ? { kind: 'ok', text: `Route completed: added to ${r.customerName}'s invoice for ${today.slice(0, 7)}.` } : { kind: 'err', text: res.error });
                if (res.ok) router.refresh();
              })}>Complete route</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
const dateLabel = (d: string) => `${WEEKDAY_LABELS[weekdayOf(d)]} ${d}`;

/** The delivery date whose production day is `today`, if today is one. */
function deliveryDateProducedOn(today: string, closures: readonly DateRange[]): string | null {
  for (let i = 1; i <= 7; i++) {
    const d = isoAddDays(today, i);
    if (productionDateFor(d, SERVICE_WEEKDAYS, closures) === today) return d;
  }
  return null;
}

type FloorInputs = Pick<ResolvedInputs, 'recipes' | 'customers' | 'capacityInputs' | 'assumptions' | 'recipeAssumptions' | 'phases' | 'phaseProfiles'> & {
  sites: ResolvedInputs['demand']['sites'];
};

export function FloorClient({
  today,
  staff,
  punches,
  pendingRoutes,
  isAdmin,
  closures,
  inputs,
  cycles,
  orders,
  receipts,
  batches,
  standards,
  deliveries,
  purchaseOrders,
}: {
  today: string;
  /** Active staff on the register, for the time clock (Roadmap K5). */
  staff: StaffDoc[];
  punches: PunchDoc[];
  /** Today's delivered orders not yet on an invoice, by customer (Roadmap K1). */
  pendingRoutes: { customerId: string; customerName: string; deliveries: number; meals: number }[];
  /** The Actuals link is shown to admins only (Roadmap O5). */
  isAdmin: boolean;
  closures: DateRange[];
  inputs: FloorInputs;
  cycles: MenuCycleDef[];
  orders: OrderDef[];
  receipts: ReceiptDoc[];
  batches: BatchRecordDoc[];
  standards: StandardVersionDoc[];
  deliveries: { id: string; deliveredOn: string; meals: number }[];
  purchaseOrders: ReceivePo[];
}) {
  const [receivingPoId, setReceivingPoId] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ seq: number; recipeCode: string; portions: number } | null>(null);
  const [shipping, setShipping] = useState<ShipOrder | null>(null);
  const [withinDays, setWithinDays] = useState<number | 'all'>(7);

  const A = inputs.assumptions;
  const shrink = A.yield.shrinkAllowance.value;
  const holdLife = A.inventory.chilledHoldLife.value;
  const recipeNames = useMemo(() => Object.fromEntries(inputs.recipes.map((r) => [r.code, r.name])), [inputs.recipes]);
  const channelPriceCents = useMemo(() => Object.fromEntries(inputs.phases.map((p) => [p.phase, Math.round(p.pricePerMeal * 100)])) as Record<number, number>, [inputs.phases]);
  const pfByChannel = useMemo(() => Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>, [inputs.phaseProfiles]);
  const bookFor = (from: string, to: string) => orderBook({ sites: inputs.sites, customers: inputs.customers, cycles, orders, from, to, channelPriceCents, recipeNames, closures });

  // ── Receive: issued purchase orders with a line still outstanding ──────────
  const onOrder = useMemo(() => openOrders({ purchaseOrders, receipts }), [purchaseOrders, receipts]);
  const toReceive = useMemo(
    () => purchaseOrders.filter((po) => po.status === 'issued' && onOrder.lines.some((l) => l.poNumber === po.poNumber)).sort((a, b) => a.orderedFor.localeCompare(b.orderedFor) || a.poNumber.localeCompare(b.poNumber)),
    [purchaseOrders, onOrder.lines],
  );
  const receiveIngredients = useMemo<ReceiveIngredient[]>(() => {
    const seen = new Map<string, ReceiveIngredient>();
    for (const r of inputs.recipes) {
      for (const l of r.ingredients) {
        const row = seen.get(l.name) ?? { name: l.name, unit: l.unit, standardUnitPriceCents: Math.round(l.apUnitCost * 100), onFoodTraceabilityList: false };
        if (l.foodTraceabilityList) row.onFoodTraceabilityList = true;
        seen.set(l.name, row);
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [inputs.recipes]);

  // ── Close: today's planned batches, from the delivery day produced today ──
  const deliveryDate = useMemo(() => deliveryDateProducedOn(today, closures), [today, closures]);
  const deliveryById = useMemo(() => new Map(deliveries.map((d) => [d.id, d])), [deliveries]);
  const consumption = useMemo<Consumption[]>(
    () =>
      orders
        .filter((o) => o.status === 'delivered')
        .map((o) => {
          const d = o.deliveryId ? deliveryById.get(o.deliveryId) : undefined;
          const pf = portionFactorFor(inputs.recipes.find((r) => r.code === o.recipeCode), o.channel, pfByChannel);
          return { recipeCode: o.recipeCode, date: d?.deliveredOn ?? o.orderDate, basePortions: (d?.meals ?? o.meals) * pf };
        }),
    [orders, deliveryById, pfByChannel, inputs.recipes],
  );
  const day = useMemo(() => {
    if (!deliveryDate) return null;
    const book = bookFor(deliveryDate, deliveryDate);
    const requirements = requirementsFor(book, inputs.recipes, pfByChannel);
    const stock = finishedGoodsOnHand({ batches, consumed: consumption, holdLifeDays: holdLife, asOf: today });
    return planProductionDay({ productionDate: today, requirements, onHand: stock.byRecipe, recipes: inputs.recipes, capacityInputs: inputs.capacityInputs, assumptions: A, recipeAssumptions: inputs.recipeAssumptions });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryDate, inputs, cycles, orders, batches, consumption, holdLife, today, pfByChannel, A]);
  const closedToday = useMemo(() => batches.filter((b) => b.productionDate === today), [batches, today]);
  const batchCountByDate = useMemo(() => batches.reduce<Record<string, number>>((m, b) => { m[b.productionDate] = (m[b.productionDate] ?? 0) + 1; return m; }, {}), [batches]);
  const rawStock = useMemo(() => rawStockOnHand({ receipts, batches, asOf: today }), [receipts, batches, today]);
  const closingRecipe = closing ? inputs.recipes.find((r) => r.code === closing.recipeCode) : undefined;
  const closingPrefill = useMemo(() => {
    if (!closing || !closingRecipe) return null;
    const std = standardInForce(standards, closing.recipeCode, today);
    return standardBatchRecordPrefill(
      today,
      (batchCountByDate[today] ?? 0) + 1,
      closing.portions,
      std?.snapshot.recipe ?? closingRecipe,
      std ? std.snapshot.assumptions.yield.shrinkAllowance.value : shrink,
      std ? standardLabel(std) : undefined,
    );
  }, [closing, closingRecipe, today, batchCountByDate, shrink, standards]);

  // ── Ship: today's confirmed orders ────────────────────────────────────────
  const toShip = useMemo(() => bookFor(today, today).filter((o) => o.basis === 'record' && o.status === 'confirmed' && o.id), [inputs, cycles, orders, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const finishedLots = useMemo(() => finishedLotsOf(batches), [batches]);

  // ── Lots by use-by ────────────────────────────────────────────────────────
  const lots = useMemo(() => rawLotsByUseBy(rawStock), [rawStock]);
  const shownLots = withinDays === 'all' ? lots : lots.filter((l) => l.daysToUseBy !== null && l.daysToUseBy <= withinDays);

  return (
    <>
      <header className="mb-4!">
        <h1 className="muse-page-title">{dateLabel(today)}</h1>
        <p className="muse-page-lede">
          Today&apos;s queue: receive what comes off the truck against its purchase order, close each batch as it is packed, ship each confirmed order as it leaves. What is typed here is the record the books post from.
        </p>
      </header>

      <TimeClockCard staff={staff} punches={punches} />

      <Card title={`Receive — ${toReceive.length} issued order${toReceive.length === 1 ? '' : 's'} with lines outstanding`} className="mt-4">
        {toReceive.length === 0 ? (
          <p className="muse-kpi-sub">Nothing on order is still to receive.</p>
        ) : (
          <div className="muse-floor-queue">
            {toReceive.map((po) => {
              const outstanding = onOrder.lines.filter((l) => l.poNumber === po.poNumber);
              return (
                <div key={po.id} className="muse-floor-row">
                  <div>
                    <div className="muse-floor-row-title">{po.poNumber} · {po.supplierName}</div>
                    <div className="muse-floor-row-sub">for {dateLabel(po.orderedFor)} · {outstanding.length} of {po.lines.length} line{po.lines.length === 1 ? '' : 's'} still to receive</div>
                  </div>
                  <button type="button" className={`muse-btn${receivingPoId === po.id ? ' primary' : ''}`} onClick={() => setReceivingPoId((id) => (id === po.id ? null : po.id))}>Receive</button>
                </div>
              );
            })}
          </div>
        )}
        {receivingPoId && (
          <div className="mt-3">
            <ReceiveForm key={receivingPoId} purchaseOrders={toReceive} ingredients={receiveIngredients} today={today} initialPoId={receivingPoId} onDone={() => setReceivingPoId(null)} onCancel={() => setReceivingPoId(null)} />
          </div>
        )}
      </Card>

      <Card title={day ? `Close — ${day.schedule.length} batch${day.schedule.length === 1 ? '' : 'es'} planned today, for ${dateLabel(deliveryDate!)}` : 'Close — no production day'} className="mt-4">
        {!day ? (
          <p className="muse-kpi-sub">No delivery day is produced on {dateLabel(today)}.</p>
        ) : day.schedule.length === 0 ? (
          <p className="muse-kpi-sub">Nothing to make today: on hand covers {dateLabel(deliveryDate!)}.</p>
        ) : (
          <div className="muse-floor-queue">
            {day.schedule.map((b) => {
              const closed = closedToday.length >= b.seq;
              return (
                <div key={b.seq} className={`muse-floor-row${closed ? ' done' : ''}`}>
                  <div>
                    <div className="muse-floor-row-title">{b.seq} · {b.recipeCode} {b.recipeName} · {num(b.portions)} portions</div>
                    <div className="muse-floor-row-sub">chiller {clock(b.loadMin)} – {clock(b.unloadMin)} · <CheckPill ok={b.fits} okLabel="in the window" overLabel="past the window" /></div>
                  </div>
                  {b.fits && !closed && <button type="button" className={`muse-btn${closing?.seq === b.seq ? ' primary' : ''}`} onClick={() => setClosing((c) => (c?.seq === b.seq ? null : { seq: b.seq, recipeCode: b.recipeCode, portions: b.portions }))}>Close batch record</button>}
                  {closed && <span className="muse-kpi-sub">closed</span>}
                </div>
              );
            })}
          </div>
        )}
        {closing && closingPrefill && (
          <div className="mt-3">
            <BatchCloseForm prefill={closingPrefill} batchCountByDate={batchCountByDate} standardBatchSize={closing.portions} recipeName={closingRecipe?.name} rawLots={rawStock.lots} onDone={() => setClosing(null)} onCancel={() => setClosing(null)} />
          </div>
        )}
        {closedToday.length > 0 && (
          <p className="muse-kpi-sub mt-2">Closed today: {closedToday.map((b) => `${b.batchId} (${num(Math.round(b.goodPortions))} portions)`).join(', ')}.</p>
        )}
      </Card>

      <Card title={`Ship — ${toShip.length} confirmed order${toShip.length === 1 ? '' : 's'} for today`} className="mt-4">
        {toShip.length === 0 ? (
          <p className="muse-kpi-sub">No confirmed order is dated {dateLabel(today)}.</p>
        ) : (
          <div className="muse-floor-queue">
            {toShip.map((o) => (
              <div key={o.key} className="muse-floor-row">
                <div>
                  <div className="muse-floor-row-title">{o.customerName} · {o.siteName}</div>
                  <div className="muse-floor-row-sub">{o.recipeCode} {o.recipeName} · {num(Math.round(o.meals))} meals ordered</div>
                </div>
                <button type="button" className={`muse-btn${shipping?.id === o.id ? ' primary' : ''}`} onClick={() => setShipping((s) => (s?.id === o.id ? null : { id: o.id!, orderDate: o.orderDate, customerName: o.customerName, siteName: o.siteName, recipeCode: o.recipeCode, recipeName: o.recipeName, meals: o.meals, pricePerMealCents: o.pricePerMealCents }))}>Ship</button>
              </div>
            ))}
          </div>
        )}
        {shipping && (
          <div className="mt-3">
            <ShipForm key={shipping.id} order={shipping} finishedLots={finishedLots} today={today} onDone={() => setShipping(null)} onCancel={() => setShipping(null)} />
          </div>
        )}
      </Card>

      <RouteCard today={today} routes={pendingRoutes} />

      <Card title="Raw lots on hand, by use-by" className="mt-4">
        <div className="flex flex-wrap gap-3 items-end mb-3!">
          <label className="muse-kpi-sub">Use-by within<br />
            <select className="muse-select" value={withinDays} onChange={(e) => setWithinDays(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              {[3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} days</option>)}
              <option value="all">every lot on hand</option>
            </select>
          </label>
          <span className="muse-kpi-sub">{lots.length} lot{lots.length === 1 ? '' : 's'} on hand as of {today} · {lots.filter((l) => l.useBy === null).length} without a date on the case</span>
        </div>
        {shownLots.length === 0 ? (
          <p className="muse-kpi-sub">No lot on hand {withinDays === 'all' ? '' : `is dated within ${withinDays} days`}.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Ingredient</th><th>Lot code</th><th>Received</th><th>Use by</th><th className="num">Days</th><th className="num">Remaining</th></tr></thead>
              <tbody>
                {shownLots.map((l) => (
                  <tr key={`${l.receiptId}-${l.lotCode}-${l.ingredient}`}>
                    <td>{l.ingredient}{l.onFoodTraceabilityList ? <div className="muse-fs-2xs muse-c-faint">Food Traceability List</div> : null}</td>
                    <td className="muse-mono">{l.lotCode}</td>
                    <td>{l.receivedOn}</td>
                    <td>{l.useBy ?? '—'}</td>
                    <td className="num">{l.daysToUseBy === null ? '—' : l.daysToUseBy}</td>
                    <td className="num">{num(l.remaining, 2)} {l.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muse-kpi-sub mt-2">Ordered by the date printed on the case, earliest first; a negative day count is past that date. Lots with no date follow, by receipt date.</p>
      </Card>

      <p className="muse-kpi-sub mt-4">
        {isAdmin ? <>The full record is on <Link className="muse-link" href="/muse/actuals">Actuals</Link>; the plan these batches come from is on </> : <>The plan these batches come from is on </>}
        <Link className="muse-link" href="/muse/production-planning?level=day">Production Planning</Link>.
      </p>
    </>
  );
}
