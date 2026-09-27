'use client';

import { purchaseLines } from '@/engine/grow-purchase';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CheckPill, num } from '@/components/ui';
import { ReceiveForm, type ReceiveInput, type ReceivePo } from '@/components/ReceiveForm';
import { GrowSowingCloseForm } from '@/components/GrowSowingCloseForm';
import { isGrowSowing } from '@/engine/sowing-record';
import { defaultGrowUnits } from '@/engine';
import { ShipForm, type ShipOrder } from '@/components/ShipForm';
import { WEEKDAY_LABELS, type SubscriptionCycleDef, type OrderDef } from '@/data/subscription-cycles';
import type { ResolvedInputs } from '@/engine/scenario';
import { orderBook, isoAddDays, weekdayOf } from '@/engine/orders';
import { finishedGoodsOnHand, planHorizon, unitFactorFor, type Consumption } from '@/engine/production-plan';
import { stageOn, type CalendarSowing } from '@/engine/grow-calendar';
import { standardSowingRecordPrefill, finishedLotsOf, type SowingRecordDoc, type ReceiptDoc } from '@/engine/actuals';
import { rawStockOnHand, rawLotsByUseBy, openOrders } from '@/engine/net-requirements';
import type { DateRange } from '@/engine/periods';
import { standardInForce, standardLabel, type StandardVersionDoc } from '@/engine/standards';
import type { PunchDoc, StaffDoc } from '@/engine/payroll';
import { TimeClockCard } from '@/components/TimeClockCard';
import { completeRoute } from '@/server/working-capital-actions';

const SERVICE_WEEKDAYS = [1, 2, 3, 4, 5];

/** Today's distributed routes not yet on an invoice (Roadmap K1). Completing one adds it to the subscriber's invoice for the month. */
function RouteCard({ today, routes }: { today: string; routes: { subscriberId: string; subscriberName: string; distributions: number; units: number }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  return (
    <Card title={`Routes — ${routes.length} distributed today, not yet on an invoice`} className="mt-4">
      {msg && <div className={`farm-scenariobar-msg ${msg.kind} mb-[0.6rem]!`} role="status">{msg.text}</div>}
      {routes.length === 0 ? (
        <p className="farm-kpi-sub">No Subscriptions or Restaurants distribution today is waiting for its route to be completed.</p>
      ) : (
        <div className="farm-floor-queue">
          {routes.map((r) => (
            <div key={r.subscriberId} className="farm-floor-row">
              <div>
                <div className="farm-floor-row-title">{r.subscriberName}</div>
                <div className="farm-floor-row-sub">{r.distributions} distribute{r.distributions === 1 ? 'y' : 'ies'} · {num(Math.round(r.units))} units</div>
              </div>
              <button type="button" className="farm-btn" disabled={pending} onClick={() => start(async () => {
                const res = await completeRoute({ date: today, subscriberId: r.subscriberId });
                setMsg(res.ok ? { kind: 'ok', text: `Route completed: added to ${r.subscriberName}'s invoice for ${today.slice(0, 7)}.` } : { kind: 'err', text: res.error });
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

type FloorInputs = Pick<ResolvedInputs, 'growPlans' | 'subscribers' | 'capacityInputs' | 'assumptions' | 'growPlanAssumptions' | 'phases' | 'phaseProfiles'> & {
  pickupPoints: ResolvedInputs['demand']['pickupPoints'];
};

export function GrowRoomClient({
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
  sowings,
  standards,
  distributions,
  purchaseOrders,
}: {
  today: string;
  /** Active staff on the register, for the time clock (Roadmap K5). */
  staff: StaffDoc[];
  punches: PunchDoc[];
  /** Today's distributed orders not yet on an invoice, by subscriber (Roadmap K1). */
  pendingRoutes: { subscriberId: string; subscriberName: string; distributions: number; units: number }[];
  /** The Actuals link is shown to admins only (Roadmap O5). */
  isAdmin: boolean;
  closures: DateRange[];
  inputs: FloorInputs;
  cycles: SubscriptionCycleDef[];
  orders: OrderDef[];
  receipts: ReceiptDoc[];
  sowings: SowingRecordDoc[];
  standards: StandardVersionDoc[];
  distributions: { id: string; distributedOn: string; units: number }[];
  purchaseOrders: ReceivePo[];
}) {
  const [receivingPoId, setReceivingPoId] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ seq: number; growPlanCode: string; units: number; growUnitKey?: string | null } | null>(null);
  const [shipping, setShipping] = useState<ShipOrder | null>(null);
  const [withinDays, setWithinDays] = useState<number | 'all'>(7);

  const A = inputs.assumptions;
  const shrink = A.yield.shrinkAllowance.value;
  const shelfLife = A.inventory.blackoutShelfLife.value;
  const growPlanNames = useMemo(() => Object.fromEntries(inputs.growPlans.map((r) => [r.code, r.name])), [inputs.growPlans]);
  const channelPriceCents = useMemo(() => Object.fromEntries(inputs.phases.map((p) => [p.phase, Math.round(p.pricePerUnit * 100)])) as Record<number, number>, [inputs.phases]);
  const pfByChannel = useMemo(() => Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>, [inputs.phaseProfiles]);
  const bookFor = (from: string, to: string) => orderBook({ pickupPoints: inputs.pickupPoints, subscribers: inputs.subscribers, cycles, orders, from, to, channelPriceCents, growPlanNames, closures });

  // ── Receive: issued purchase orders with a line still outstanding ──────────
  const onOrder = useMemo(() => openOrders({ purchaseOrders, receipts }), [purchaseOrders, receipts]);
  const toReceive = useMemo(
    () => purchaseOrders.filter((po) => po.status === 'issued' && onOrder.lines.some((l) => l.poNumber === po.poNumber)).sort((a, b) => a.orderedFor.localeCompare(b.orderedFor) || a.poNumber.localeCompare(b.poNumber)),
    [purchaseOrders, onOrder.lines],
  );
  const receiveInputs = useMemo<ReceiveInput[]>(() => {
    const seen = new Map<string, ReceiveInput>();
    for (const r of inputs.growPlans) {
      for (const l of purchaseLines(r)) {
        if (l.kind === 'light') continue;
        const row = seen.get(l.name) ?? { name: l.name, unit: l.unit, standardUnitPriceCents: Math.round(l.unitCost * 100), onFoodTraceabilityList: false };
        seen.set(l.name, row);
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [inputs.growPlans]);

  const distributionById = useMemo(() => new Map(distributions.map((d) => [d.id, d])), [distributions]);
  const consumption = useMemo<Consumption[]>(
    () =>
      orders
        .filter((o) => o.status === 'distributed')
        .map((o) => {
          const d = o.distributionId ? distributionById.get(o.distributionId) : undefined;
          const pf = unitFactorFor(inputs.growPlans.find((r) => r.code === o.growPlanCode), o.channel, pfByChannel);
          return { growPlanCode: o.growPlanCode, date: d?.distributedOn ?? o.orderDate, baseUnits: (d?.units ?? o.units) * pf };
        }),
    [orders, distributionById, pfByChannel, inputs.growPlans],
  );
  const closedToday = useMemo(() => sowings.filter((b) => b.productionDate === today), [sowings, today]);
  // ── Sow: the grow calendar's sowings dated today, back-planned from the order book ──
  const growQueue = useMemo<CalendarSowing[]>(() => {
    const to = isoAddDays(today, 28);
    const stock = finishedGoodsOnHand({ sowings, consumed: consumption, shelfLifeDays: shelfLife, asOf: today, growPlans: inputs.growPlans });
    const openingSowings = sowings
      .filter((b) => b.goodUnits > 0)
      .map((b) => ({ growPlanCode: b.growPlanCode, sowDate: b.productionDate, trays: b.goodUnits }))
      .filter((b) => { const r = inputs.growPlans.find((x) => x.code === b.growPlanCode); return r !== undefined && stageOn(r, b.sowDate, today).stage !== 'off'; });
    const h = planHorizon({ from: today, to, book: bookFor(today, to), growPlans: inputs.growPlans, capacityInputs: inputs.capacityInputs, assumptions: A, growPlanAssumptions: inputs.growPlanAssumptions, unitFactorByChannel: pfByChannel, openingLots: stock.lots.filter((l) => l.remaining > 0), openingSowings, shelfLifeDays: shelfLife, productionWeekdays: SERVICE_WEEKDAYS, closures });
    return h.growCalendar.sowings.filter((x) => x.sowDate === today && x.distributionDate !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, cycles, orders, sowings, consumption, shelfLife, today, pfByChannel, A, closures]);
  const sowingCountByDate = useMemo(() => sowings.reduce<Record<string, number>>((m, b) => { m[b.productionDate] = (m[b.productionDate] ?? 0) + 1; return m; }, {}), [sowings]);
  const rawStock = useMemo(() => rawStockOnHand({ receipts, sowings, asOf: today }), [receipts, sowings, today]);
  const closingGrowPlan = closing ? inputs.growPlans.find((r) => r.code === closing.growPlanCode) : undefined;
  const closingPrefill = useMemo(() => {
    if (!closing || !closingGrowPlan) return null;
    const std = standardInForce(standards, closing.growPlanCode, today);
    const prefill = standardSowingRecordPrefill(
      today,
      (sowingCountByDate[today] ?? 0) + 1,
      closing.units,
      std?.snapshot.growPlan ?? closingGrowPlan,
      std ? std.snapshot.assumptions.yield.shrinkAllowance.value : shrink,
      std ? standardLabel(std) : undefined,
    );
    return closing.growUnitKey !== undefined ? { ...prefill, growUnitKey: closing.growUnitKey } : prefill;
  }, [closing, closingGrowPlan, today, sowingCountByDate, shrink, standards]);

  // ── Ship: today's confirmed orders ────────────────────────────────────────
  const toShip = useMemo(() => bookFor(today, today).filter((o) => o.basis === 'record' && o.status === 'confirmed' && o.id), [inputs, cycles, orders, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const finishedLots = useMemo(() => finishedLotsOf(sowings), [sowings]);

  // ── Lots by use-by ────────────────────────────────────────────────────────
  const lots = useMemo(() => rawLotsByUseBy(rawStock), [rawStock]);
  const shownLots = withinDays === 'all' ? lots : lots.filter((l) => l.daysToUseBy !== null && l.daysToUseBy <= withinDays);

  return (
    <>
      <header className="mb-4!">
        <h1 className="farm-page-title">{dateLabel(today)}</h1>
        <p className="farm-page-lede">
          Today&apos;s queue: receive what comes off the truck against its purchase order, close each sowing as it is packed, ship each confirmed order as it leaves. What is typed here is the record the books post from.
        </p>
      </header>

      <TimeClockCard staff={staff} punches={punches} />

      <Card title={`Receive — ${toReceive.length} issued order${toReceive.length === 1 ? '' : 's'} with lines outstanding`} className="mt-4">
        {toReceive.length === 0 ? (
          <p className="farm-kpi-sub">Nothing on order is still to receive.</p>
        ) : (
          <div className="farm-floor-queue">
            {toReceive.map((po) => {
              const outstanding = onOrder.lines.filter((l) => l.poNumber === po.poNumber);
              return (
                <div key={po.id} className="farm-floor-row">
                  <div>
                    <div className="farm-floor-row-title">{po.poNumber} · {po.supplierName}</div>
                    <div className="farm-floor-row-sub">for {dateLabel(po.orderedFor)} · {outstanding.length} of {po.lines.length} line{po.lines.length === 1 ? '' : 's'} still to receive</div>
                  </div>
                  <button type="button" className={`farm-btn${receivingPoId === po.id ? ' primary' : ''}`} onClick={() => setReceivingPoId((id) => (id === po.id ? null : po.id))}>Receive</button>
                </div>
              );
            })}
          </div>
        )}
        {receivingPoId && (
          <div className="mt-3">
            <ReceiveForm key={receivingPoId} purchaseOrders={toReceive} inputs={receiveInputs} today={today} initialPoId={receivingPoId} onDone={() => setReceivingPoId(null)} onCancel={() => setReceivingPoId(null)} />
          </div>
        )}
      </Card>

      <Card title={`Sow — ${growQueue.length} sowing${growQueue.length === 1 ? '' : 's'} dated today on the grow calendar`} className="mt-4">
        {growQueue.length === 0 ? (
          <p className="farm-kpi-sub">No sowing is back-planned to {dateLabel(today)}: nothing on the order book needs sowing today. The month is on the <Link className="farm-link" href="/farm/production-planning/grow-calendar">Grow Calendar</Link>.</p>
        ) : (
          <div className="farm-floor-queue">
            {growQueue.map((x, i) => {
              const closed = closedToday.some((b) => b.growPlanCode === x.growPlanCode && i < closedToday.filter((b) => b.growPlanCode === x.growPlanCode).length);
              return (
                <div key={x.id} className={`farm-floor-row${closed ? ' done' : ''}`}>
                  <div>
                    <div className="farm-floor-row-title">{i + 1} · {x.growPlanCode} {x.growPlanName} · {num(x.trays)} trays</div>
                    <div className="farm-floor-row-sub">for {dateLabel(x.distributionDate!)} · harvest window {x.harvestFrom} to {x.harvestTo} · {x.placed ? `on the ${x.unitItem?.toLowerCase() ?? 'grow unit'}` : 'no room on any grow unit'} · <CheckPill ok={x.placed} okLabel="placed" overLabel="no room" /></div>
                  </div>
                  {!closed && <button type="button" className={`farm-btn${closing?.seq === i + 1 ? ' primary' : ''}`} onClick={() => setClosing((c) => (c?.seq === i + 1 ? null : { seq: i + 1, growPlanCode: x.growPlanCode, units: x.trays, growUnitKey: x.unitKey }))}>Close sowing record</button>}
                  {closed && <span className="farm-kpi-sub">closed</span>}
                </div>
              );
            })}
          </div>
        )}
        {closing && closingPrefill && (
          <div className="mt-3">
            {closingGrowPlan && isGrowSowing(closingPrefill) && (
              <GrowSowingCloseForm prefill={closingPrefill} plan={closingGrowPlan} sowingCountByDate={sowingCountByDate} growUnits={inputs.capacityInputs.growUnits ?? defaultGrowUnits} planName={closingGrowPlan.name} onDone={() => setClosing(null)} onCancel={() => setClosing(null)} />
            )}
          </div>
        )}
        {closedToday.length > 0 && (
          <p className="farm-kpi-sub mt-2">Closed today: {closedToday.map((b) => `${b.sowingId} (${num(Math.round(b.goodUnits))} ${isGrowSowing(b) ? 'trays' : 'units'})`).join(', ')}.</p>
        )}
      </Card>

      <Card title={`Ship — ${toShip.length} confirmed order${toShip.length === 1 ? '' : 's'} for today`} className="mt-4">
        {toShip.length === 0 ? (
          <p className="farm-kpi-sub">No confirmed order is dated {dateLabel(today)}.</p>
        ) : (
          <div className="farm-floor-queue">
            {toShip.map((o) => (
              <div key={o.key} className="farm-floor-row">
                <div>
                  <div className="farm-floor-row-title">{o.subscriberName} · {o.pickupPointName}</div>
                  <div className="farm-floor-row-sub">{o.growPlanCode} {o.growPlanName} · {num(Math.round(o.units))} units ordered</div>
                </div>
                <button type="button" className={`farm-btn${shipping?.id === o.id ? ' primary' : ''}`} onClick={() => setShipping((s) => (s?.id === o.id ? null : { id: o.id!, orderDate: o.orderDate, subscriberName: o.subscriberName, pickupPointName: o.pickupPointName, growPlanCode: o.growPlanCode, growPlanName: o.growPlanName, units: o.units, pricePerUnitCents: o.pricePerUnitCents }))}>Ship</button>
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
          <label className="farm-kpi-sub">Use-by within<br />
            <select className="farm-select" value={withinDays} onChange={(e) => setWithinDays(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              {[3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} days</option>)}
              <option value="all">every lot on hand</option>
            </select>
          </label>
          <span className="farm-kpi-sub">{lots.length} lot{lots.length === 1 ? '' : 's'} on hand as of {today} · {lots.filter((l) => l.useBy === null).length} without a date on the case</span>
        </div>
        {shownLots.length === 0 ? (
          <p className="farm-kpi-sub">No lot on hand {withinDays === 'all' ? '' : `is dated within ${withinDays} days`}.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead><tr><th>Input</th><th>Lot code</th><th>Received</th><th>Use by</th><th className="num">Days</th><th className="num">Remaining</th></tr></thead>
              <tbody>
                {shownLots.map((l) => (
                  <tr key={`${l.receiptId}-${l.lotCode}-${l.input}`}>
                    <td>{l.input}{l.onFoodTraceabilityList ? <div className="farm-fs-2xs farm-c-faint">Food Traceability List</div> : null}</td>
                    <td className="farm-mono">{l.lotCode}</td>
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
        <p className="farm-kpi-sub mt-2">Ordered by the date printed on the case, earliest first; a negative day count is past that date. Lots with no date follow, by receipt date.</p>
      </Card>

      <p className="farm-kpi-sub mt-4">
        {isAdmin ? <>The full record is on <Link className="farm-link" href="/farm/actuals">Actuals</Link>; the plan these sowings come from is on </> : <>The plan these sowings come from is on </>}
        <Link className="farm-link" href="/farm/production-planning?level=day">Production Planning</Link>.
      </p>
    </>
  );
}
