'use client';

import { purchaseLines } from '@/engine/grow-purchase';
import { costPlan } from '@/engine/grow-costing';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Kpi, money, num, pct } from '@/components/ui';
import { SectionSave } from '@/components/SectionSave';
import { spendCoverage } from '@/engine/supplier-links';
import { SupplierPicker } from '@/components/SupplierPicker';
import { useLinkedSuppliers } from '@/components/useLinkedSuppliers';
import { useScenario } from '@/state/scenario-store';
import { useOperationsWorld } from '@/state/ledger';
import { WorldNote } from '@/components/ledger/WorldNote';
import { inputKey } from '@/engine/scenario';
import type { ResolvedInputPrice } from '@/engine/input-price';
import { WEEKDAY_LABELS, type OrderDef } from '@/data/orders';
import type { SowingRecordDoc, ReceiptDoc } from '@/engine/actuals';
import { orderBook, isoAddDays, weekdayOf } from '@/engine/orders';
import { planHorizon } from '@/engine/production-plan';
import { rawStockOnHand, openOrders, netRequirements } from '@/engine/net-requirements';
import { ReceiveForm, type ReceiveInput, type ReceivePo } from '@/components/ReceiveForm';
import type { DateRange } from '@/engine/periods';

/** How far ahead the next distribution is looked for. */
const LOOKAHEAD_DAYS = 60;
const dateLabel = (d: string) => `${WEEKDAY_LABELS[weekdayOf(d)]} ${d}`;

/** Where a line's price came from, in a few words. */
function basisLabel(p: ResolvedInputPrice | undefined): string {
  if (p?.basis === 'catalog') return `catalog, from ${p.effectiveFrom}`;
  if (p?.basis === 'lastPaid') return `last paid, ${p.effectiveFrom}`;
  return 'grow plan figure';
}

export function ProcurementClient({
  canEdit,
  canRecord,
  closures,
  orders: recordedOrders,
  receipts: recordedReceipts,
  sowings: recordedSowings,
  purchaseOrders: recordedPurchaseOrders,
  today,
}: {
  canEdit: boolean;
  /** Operators receive goods against a purchase order; the supplier links stay with super admins. */
  canRecord: boolean;
  closures: DateRange[];
  orders: OrderDef[];
  receipts: ReceiptDoc[];
  sowings: SowingRecordDoc[];
  purchaseOrders: ReceivePo[];
  today: string;
}) {
  const { resolved, setSustainability } = useScenario();
  // Plan runs the open forecast's own world; Actual the real farm (Roadmap N6 slice 3).
  const world = useOperationsWorld({ orders: recordedOrders, receipts: recordedReceipts, sowings: recordedSowings, purchaseOrders: recordedPurchaseOrders });
  const { orders, receipts, sowings, purchaseOrders } = world;
  const [receivingPoId, setReceivingPoId] = useState<string | null>(null);

  const links = resolved.sustainability.inputSupplier;
  const suppliers = useLinkedSuppliers(links);
  const setLink = (name: string, id: string | undefined) =>
    setSustainability((d) => {
      const m = (d.inputSupplier ??= {});
      if (id === undefined) delete m[name];
      else m[name] = id;
      if (Object.keys(m).length === 0) delete d.inputSupplier;
    });

  // The next run: the order book on the next distribution date with any order, each plan's trays sown on
  // its own sow date (outline §5 rule 1), exploded through the lines and netted. The date can be moved.
  const channelPriceCents = useMemo(() => Object.fromEntries(resolved.phases.map((p) => [p.phase, Math.round(p.pricePerUnit * 100)])) as Record<number, number>, [resolved.phases]);
  const pfByChannel = useMemo(() => Object.fromEntries(resolved.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>, [resolved.phaseProfiles]);
  const ahead = useMemo(() => orderBook({ pickupPoints: world.pickupPoints, subscribers: resolved.subscribers, orders, from: isoAddDays(today, 1), to: isoAddDays(today, LOOKAHEAD_DAYS), channelPriceCents, closures }), [world.pickupPoints, resolved.subscribers, orders, today, channelPriceCents, closures]);
  const nextDistribution = useMemo(() => ahead.map((o) => o.orderDate).sort()[0] ?? isoAddDays(today, 1), [ahead, today]);
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const distributionDate = chosenDate ?? nextDistribution;
  const book = useMemo(() => (ahead.some((o) => o.orderDate === distributionDate) ? ahead.filter((o) => o.orderDate === distributionDate) : orderBook({ pickupPoints: world.pickupPoints, subscribers: resolved.subscribers, orders, from: distributionDate, to: distributionDate, channelPriceCents, closures })), [ahead, distributionDate, world.pickupPoints, resolved.subscribers, orders, channelPriceCents, closures]);
  const horizon = useMemo(
    () => planHorizon({ from: today, to: distributionDate, book, growPlans: resolved.growPlans, capacityInputs: resolved.capacityInputs, assumptions: resolved.assumptions, growPlanAssumptions: resolved.growPlanAssumptions, unitFactorByChannel: pfByChannel, openingLots: [], channels: resolved.phases.map((p) => p.phase), closures }),
    [today, distributionDate, book, resolved.growPlans, resolved.capacityInputs, resolved.assumptions, resolved.growPlanAssumptions, resolved.phases, pfByChannel, closures],
  );
  const sowDays = useMemo(() => horizon.productionDays.filter((d) => d.runs.some((r) => r.produced > 0)), [horizon]);
  const productionDate = sowDays.map((d) => d.productionDate).sort()[0] ?? distributionDate;
  const day = useMemo(() => ({ runs: sowDays.flatMap((d) => d.runs.filter((r) => r.produced > 0).map((r) => ({ ...r, sowDate: d.productionDate }))), totalProduced: sowDays.reduce((t, d) => t + d.totalProduced, 0), purchase: { total: sowDays.reduce((t, d) => t + d.purchase.total, 0), lines: sowDays.flatMap((d) => d.purchase.lines) } }), [sowDays]);
  const stock = useMemo(() => rawStockOnHand({ receipts, sowings, asOf: productionDate }), [receipts, sowings, productionDate]);
  const onOrder = useMemo(() => openOrders({ purchaseOrders, receipts }), [purchaseOrders, receipts]);
  const net = useMemo(() => netRequirements({ days: sowDays.map((d) => ({ productionDate: d.productionDate, lines: d.purchase.lines })), stock, onOrder }), [sowDays, stock, onOrder]);
  const netBy = useMemo(() => new Map(net.lines.map((l) => [l.input, l])), [net.lines]);

  // Every distinct input across the library, in service first.
  const inputs = useMemo(() => {
    const seen = new Map<string, { name: string; unit: string; unitCost: number; planCost: number; inService: boolean; growPlans: number; price: ResolvedInputPrice | undefined; planPrice: ResolvedInputPrice | undefined }>();
    for (const r of [...resolved.growPlans].sort((a, b) => (a.status === 'in_service' ? 0 : 1) - (b.status === 'in_service' ? 0 : 1))) {
      const planLines = purchaseLines(r);
      for (const l of purchaseLines(r, costPlan(r), 'order')) {
        const row = seen.get(l.name) ?? {
          name: l.name,
          unit: l.unit,
          // What a purchase order pays; the plan's price beside it where it differs.
          unitCost: l.unitCost,
          planCost: planLines.find((p) => p.name === l.name)?.unitCost ?? l.unitCost,
          inService: r.status === 'in_service',
          growPlans: 0,
          // The first grow plan to carry the line sets the price shown; the
          // resolver gives every grow plan's copy the same answer.
          price: resolved.orderLinePrices[inputKey(r.code, l.name)],
          planPrice: resolved.inputPrices[inputKey(r.code, l.name)],
        };
        row.growPlans += 1;
        seen.set(l.name, row);
      }
    }
    return [...seen.values()].sort((a, b) => Number(b.inService) - Number(a.inService) || a.name.localeCompare(b.name));
  }, [resolved.growPlans, resolved.inputPrices, resolved.orderLinePrices]);

  const receiveInputs = useMemo<ReceiveInput[]>(() => {
    const seen = new Map<string, ReceiveInput>();
    for (const r of resolved.growPlans) {
      for (const l of purchaseLines(r)) {
        if (l.kind === 'light') continue;
        const row = seen.get(l.name) ?? { name: l.name, unit: l.unit, standardUnitPriceCents: Math.round(l.unitCost * 100), onFoodTraceabilityList: false };
        seen.set(l.name, row);
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [resolved.growPlans]);
  const issuedPos = useMemo(() => purchaseOrders.filter((po) => po.status === 'issued').sort((a, b) => a.orderedFor.localeCompare(b.orderedFor) || a.poNumber.localeCompare(b.poNumber)), [purchaseOrders]);
  const receivedAgainst = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of receipts) if (r.poId) m[r.poId] = (m[r.poId] ?? 0) + 1;
    return m;
  }, [receipts]);

  const cover = spendCoverage(day.purchase.lines.map((l) => ({ name: l.name, extendedCost: l.extendedCost })), links, suppliers);
  const stockValue = Object.values(stock.byInput).reduce((s, l) => s + l.valueCents, 0) / 100;
  const onOrderLines = onOrder.lines.length;
  const openPos = new Set(onOrder.lines.map((l) => l.poNumber)).size;

  return (
    <>
      <WorldNote isPlan={world.isPlan} />
      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={money(stockValue)} label="Raw stock on hand, at invoice" sub={`${Object.keys(stock.byInput).length} input${Object.keys(stock.byInput).length === 1 ? '' : 's'} with a lot on hand as of ${productionDate}`} />
        <Kpi value={num(openPos)} label="Open purchase orders" sub={`${onOrderLines} line${onOrderLines === 1 ? '' : 's'} still to receive`} />
        <Kpi value={money(day.purchase.total)} label="Next run, gross at the order's price" sub={`${num(Math.round(day.totalProduced))} base units, sown from ${dateLabel(productionDate)} for ${dateLabel(distributionDate)}`} />
        <Kpi value={money(net.netTotal)} label="Next run, net to buy" sub={`${net.toBuy.length} line${net.toBuy.length === 1 ? '' : 's'} after stock and open orders`} />
      </div>
      <div className="grid gap-3 mt-3 farm-autofit-11">
        <Kpi value={`${cover.linesLinked} / ${cover.linesTotal}`} label="Next run lines linked to a supplier" sub={pct(cover.linkedShare, 0) + ' of spend'} />
        <Kpi value={pct(cover.certifiedShare, 0)} label="Spend with a certification on file" sub="USDA organic, linked lines" />
      </div>

      <Card title="Issued purchase orders — receive on the order" className="mt-4">
        {issuedPos.length === 0 ? (
          <p className="farm-kpi-sub">No issued purchase order is open. Orders are raised on Production Planning and issued on the supplier&apos;s page.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead>
                <tr><th>Purchase order</th><th>Supplier</th><th>Ordered for</th><th className="num">Lines</th><th className="num">Still to receive</th><th className="num">Receipts on file</th><th /></tr>
              </thead>
              <tbody>
                {issuedPos.map((po) => {
                  const outstanding = onOrder.lines.filter((l) => l.poNumber === po.poNumber).length;
                  return (
                    <tr key={po.id}>
                      <td className="font-medium!">{po.poNumber}</td>
                      <td>{po.supplierName}</td>
                      <td>{dateLabel(po.orderedFor)}</td>
                      <td className="num">{po.lines.length}</td>
                      <td className="num">{outstanding}</td>
                      <td className="num">{receivedAgainst[po.id] ?? 0}</td>
                      <td className="num">{canRecord && world.recording && <button type="button" className={`farm-btn${receivingPoId === po.id ? ' primary' : ''} py-[0.1rem]! px-2!`} onClick={() => setReceivingPoId((id) => (id === po.id ? null : po.id))}>Receive</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {receivingPoId && world.recording && (
          <div className="mt-3">
            <ReceiveForm key={receivingPoId} purchaseOrders={issuedPos} inputs={receiveInputs} today={today} initialPoId={receivingPoId} onDone={() => setReceivingPoId(null)} onCancel={() => setReceivingPoId(null)} />
          </div>
        )}
        <p className="farm-kpi-sub mt-2">
          A receipt records what came off the truck against the order: quantity, the supplier&apos;s lot code, the use-by date, the temperature at the dock and the condition. A receipt that covers every line marks the order received; a rejected line stays on the record and never enters stock.
        </p>
      </Card>

      <Card title="Supply position by input" className="mt-4">
        <div className="flex flex-wrap gap-3 items-end mb-3!">
          <label className="farm-kpi-sub">Distribution date<br /><input className="farm-input" type="date" value={distributionDate} onChange={(e) => e.target.value && setChosenDate(e.target.value)} /></label>
          <span className="farm-kpi-sub">{day.runs.map((r) => `${r.growPlanCode} × ${r.sowingsScheduled} sown ${dateLabel(r.sowDate)}`).join(' · ') || 'no sowing for this date'}</span>
          <SectionSave sections={['sustainability']} title="the supplier links" />
        </div>
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr>
                <th>Input</th><th>Supplier</th><th className="num">Order price</th><th className="num">On hand</th><th className="num">On order</th><th className="num">Next run gross</th><th className="num">Net</th><th className="num">Cases</th><th className="num">Net extended</th>
              </tr>
            </thead>
            <tbody>
              {inputs.map((ing) => {
                const st = stock.byInput[ing.name];
                const n = netBy.get(ing.name);
                return (
                  <tr key={ing.name} className={`${ing.inService ? '' : 'farm-c-faint'}`}>
                    <td className="font-medium!">{ing.name}<div className="farm-c-faint farm-fs-2xs font-normal">{ing.growPlans} grow plan{ing.growPlans === 1 ? '' : 's'}{ing.inService ? '' : ' · not in service'}</div></td>
                    <td>
                      <SupplierPicker input={ing.name} linked={links[ing.name] ? suppliers[links[ing.name]] ?? null : null} canEdit={canEdit && world.forecastEditing} onLink={(id) => setLink(ing.name, id)} />
                    </td>
                    <td className="num">
                      {money(ing.unitCost, ing.unitCost < 1 ? 4 : 2)} / {ing.unit}
                      <div className="farm-c-faint farm-fs-2xs" title={ing.price?.gap ?? undefined}>
                        {basisLabel(ing.price)}
                      </div>
                      {Math.abs(ing.planCost - ing.unitCost) > 1e-9 && (
                        <div className="farm-c-faint farm-fs-2xs">plan {money(ing.planCost, ing.planCost < 1 ? 4 : 2)} · {basisLabel(ing.planPrice)}</div>
                      )}
                    </td>
                    <td className="num">{st ? `${num(st.onHand, 2)} ${st.unit}` : '—'}{st ? <div className="farm-c-faint farm-fs-2xs">{st.lots} lot{st.lots === 1 ? '' : 's'} · {money(st.valueCents / 100)}</div> : null}</td>
                    <td className="num">{(onOrder.byInput[ing.name] ?? 0) > 0 ? `${num(onOrder.byInput[ing.name], 2)} ${ing.unit}` : '—'}{(onOrder.draftsByInput[ing.name] ?? 0) > 0 ? <div className="farm-c-faint farm-fs-2xs">{num(onOrder.draftsByInput[ing.name], 2)} on a draft</div> : null}</td>
                    <td className="num">{n ? `${num(n.gross, 2)} ${n.unit}` : '—'}</td>
                    <td className="num">{n ? num(n.net, 2) : '—'}</td>
                    <td className="num">{n ? n.casesToOrder : '—'}</td>
                    <td className="num">{n ? money(n.extendedCost) : '—'}</td>
                  </tr>
                );
              })}
              <tr className="total"><td colSpan={8}>Next run, net to buy</td><td className="num">{money(net.netTotal)}</td></tr>
            </tbody>
          </table>
        </div>
        {Object.keys(stock.unmatchedIssues).length > 0 && (
          <p className="farm-kpi-sub mt-2 farm-c-placeholder">
            Issues on closed sowings with no receipt to draw from: {Object.entries(stock.unmatchedIssues).map(([k, v]) => `${num(v, 1)} ${k}`).join(', ')}. Stock is not assumed for them.
          </p>
        )}
        <p className="farm-kpi-sub mt-2">
          A purchase order prices each line at its linked supplier&apos;s APPROVED catalog line, at the price in force
          today; a seed line with no catalog price takes the last price paid for its variety. The plan prices a seed line at the
          last price paid first, and the row shows that price beside the order&apos;s where the two differ. Where neither applies,
          the row says &ldquo;grow plan figure&rdquo; and carries the reason on
          hover — no supplier linked, no catalog on file, a candidate line, or a price stated per a
          different unit than the line is bought in. Purchase orders are raised from the net on <Link className="farm-link" href="/farm/production-planning?level=day">Production Planning</Link>, for a distribution day or the horizon, one per supplier with the catalog lead time giving each line an order-by date; they move to issued, received and closed on each supplier&apos;s page, and a receipt recorded here, on the order, that covers every line marks the order received. A line&apos;s supplier is set here, on <Link className="farm-link" href="/farm/grow-plans">Grow plans</Link>, or on <Link className="farm-link" href="/farm/sustainability/inputs">Inputs (Scope 3)</Link> — all three write the same link, which is part of the scenario. Certifications and lead times live in <Link className="farm-link" href="/farm/suppliers">Suppliers</Link>.
        </p>
      </Card>
    </>
  );
}
