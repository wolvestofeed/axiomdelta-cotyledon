'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Kpi, money, num, pct } from '../_components/ui';
import { SectionSave } from '../_components/SectionSave';
import { RatingPill, RatingLegend, ratingHeader } from '../_components/MarkRating';
import { ingredientRatings, ratingFor } from '../_data/mark';
import { spendCoverage } from '../_engine/supplier-links';
import { SupplierPicker } from '../_components/SupplierPicker';
import { useLinkedSuppliers } from '../_components/useLinkedSuppliers';
import { useScenario } from '../_state/scenario-store';
import { useOperationsWorld } from '../_state/ledger';
import { WorldNote } from '../_components/ledger/WorldNote';
import { ingredientKey } from '../_engine/scenario';
import type { ResolvedIngredientPrice } from '../_engine/ingredient-price';
import { WEEKDAY_LABELS, type MenuCycleDef, type OrderDef } from '../_data/menu-cycles';
import type { BatchRecordDoc, ReceiptDoc } from '../_engine/actuals';
import { orderBook, isoAddDays, weekdayOf } from '../_engine/orders';
import { requirementsFor, planProductionDay, productionDateFor } from '../_engine/production-plan';
import { rawStockOnHand, openOrders, netRequirements } from '../_engine/net-requirements';
import { ReceiveForm, type ReceiveIngredient, type ReceivePo } from '../_components/ReceiveForm';
import type { DateRange } from '../_engine/periods';

const SERVICE_WEEKDAYS = [1, 2, 3, 4, 5];
const dateLabel = (d: string) => `${WEEKDAY_LABELS[weekdayOf(d)]} ${d}`;
const nextServiceDay = (d: string) => {
  let x = isoAddDays(d, 1);
  for (let i = 0; i < 7 && !SERVICE_WEEKDAYS.includes(weekdayOf(x)); i++) x = isoAddDays(x, 1);
  return x;
};

export function ProcurementClient({
  canEdit,
  canRecord,
  closures,
  cycles,
  orders: recordedOrders,
  receipts: recordedReceipts,
  batches: recordedBatches,
  purchaseOrders: recordedPurchaseOrders,
  today,
}: {
  canEdit: boolean;
  /** Operators receive goods against a purchase order; the supplier links stay with super admins. */
  canRecord: boolean;
  closures: DateRange[];
  cycles: MenuCycleDef[];
  orders: OrderDef[];
  receipts: ReceiptDoc[];
  batches: BatchRecordDoc[];
  purchaseOrders: ReceivePo[];
  today: string;
}) {
  const { resolved, setSustainability } = useScenario();
  // Plan runs the open forecast's own world; Actual the real kitchen (Roadmap N6 slice 3).
  const world = useOperationsWorld({ orders: recordedOrders, receipts: recordedReceipts, batches: recordedBatches, purchaseOrders: recordedPurchaseOrders });
  const { orders, receipts, batches, purchaseOrders } = world;
  const [deliveryDate, setDeliveryDate] = useState(() => nextServiceDay(today));
  const [receivingPoId, setReceivingPoId] = useState<string | null>(null);
  const productionDate = productionDateFor(deliveryDate, SERVICE_WEEKDAYS, closures);

  const links = resolved.sustainability.ingredientSupplier;
  const suppliers = useLinkedSuppliers(links);
  const setLink = (name: string, id: string | undefined) =>
    setSustainability((d) => {
      const m = (d.ingredientSupplier ??= {});
      if (id === undefined) delete m[name];
      else m[name] = id;
      if (Object.keys(m).length === 0) delete d.ingredientSupplier;
    });

  // The next run: the order book on the delivery date, exploded and netted.
  const channelPriceCents = useMemo(() => Object.fromEntries(resolved.phases.map((p) => [p.phase, Math.round(p.pricePerMeal * 100)])) as Record<number, number>, [resolved.phases]);
  const pfByChannel = useMemo(() => Object.fromEntries(resolved.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>, [resolved.phaseProfiles]);
  const book = useMemo(() => orderBook({ sites: world.sites, customers: resolved.customers, cycles, orders, from: deliveryDate, to: deliveryDate, channelPriceCents, closures }), [world.sites, resolved.customers, cycles, orders, deliveryDate, channelPriceCents, closures]);
  const day = useMemo(() => planProductionDay({ productionDate, requirements: requirementsFor(book, resolved.recipes, pfByChannel), onHand: {}, recipes: resolved.recipes, capacityInputs: resolved.capacityInputs, assumptions: resolved.assumptions, recipeAssumptions: resolved.recipeAssumptions }), [productionDate, book, resolved.recipes, pfByChannel, resolved.capacityInputs, resolved.assumptions, resolved.recipeAssumptions]);
  const stock = useMemo(() => rawStockOnHand({ receipts, batches, asOf: productionDate }), [receipts, batches, productionDate]);
  const onOrder = useMemo(() => openOrders({ purchaseOrders, receipts }), [purchaseOrders, receipts]);
  const net = useMemo(() => netRequirements({ days: [{ productionDate, lines: day.purchase.lines }], stock, onOrder }), [productionDate, day.purchase.lines, stock, onOrder]);
  const netBy = useMemo(() => new Map(net.lines.map((l) => [l.ingredient, l])), [net.lines]);

  // Every distinct ingredient across the library, in service first.
  const ingredients = useMemo(() => {
    const seen = new Map<string, { name: string; unit: string; apUnitCost: number; inService: boolean; recipes: number; price: ResolvedIngredientPrice | undefined }>();
    for (const r of [...resolved.recipes].sort((a, b) => (a.status === 'in_service' ? 0 : 1) - (b.status === 'in_service' ? 0 : 1))) {
      for (const l of r.ingredients) {
        const row = seen.get(l.name) ?? {
          name: l.name,
          unit: l.unit,
          apUnitCost: l.apUnitCost,
          inService: r.status === 'in_service',
          recipes: 0,
          // The first recipe to carry the line sets the price shown; the
          // resolver gives every recipe's copy the same catalog answer.
          price: resolved.ingredientPrices[ingredientKey(r.code, l.name)],
        };
        row.recipes += 1;
        seen.set(l.name, row);
      }
    }
    return [...seen.values()].sort((a, b) => Number(b.inService) - Number(a.inService) || a.name.localeCompare(b.name));
  }, [resolved.recipes, resolved.ingredientPrices]);

  const receiveIngredients = useMemo<ReceiveIngredient[]>(() => {
    const seen = new Map<string, ReceiveIngredient>();
    for (const r of resolved.recipes) {
      for (const l of r.ingredients) {
        const row = seen.get(l.name) ?? { name: l.name, unit: l.unit, standardUnitPriceCents: Math.round(l.apUnitCost * 100), onFoodTraceabilityList: false };
        if (l.foodTraceabilityList) row.onFoodTraceabilityList = true;
        seen.set(l.name, row);
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [resolved.recipes]);
  const issuedPos = useMemo(() => purchaseOrders.filter((po) => po.status === 'issued').sort((a, b) => a.orderedFor.localeCompare(b.orderedFor) || a.poNumber.localeCompare(b.poNumber)), [purchaseOrders]);
  const receivedAgainst = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of receipts) if (r.poId) m[r.poId] = (m[r.poId] ?? 0) + 1;
    return m;
  }, [receipts]);

  const cover = spendCoverage(day.purchase.lines.map((l) => ({ name: l.name, extendedCost: l.extendedCost })), links, suppliers);
  const stockValue = Object.values(stock.byIngredient).reduce((s, l) => s + l.valueCents, 0) / 100;
  const onOrderLines = onOrder.lines.length;
  const openPos = new Set(onOrder.lines.map((l) => l.poNumber)).size;

  return (
    <>
      <WorldNote isPlan={world.isPlan} />
      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={money(stockValue)} label="Raw stock on hand, at invoice" sub={`${Object.keys(stock.byIngredient).length} ingredient${Object.keys(stock.byIngredient).length === 1 ? '' : 's'} with a lot on hand as of ${productionDate}`} />
        <Kpi value={num(openPos)} label="Open purchase orders" sub={`${onOrderLines} line${onOrderLines === 1 ? '' : 's'} still to receive`} />
        <Kpi value={money(day.purchase.total)} label="Next run, gross at standard" sub={`${num(Math.round(day.totalProduced))} base portions on ${dateLabel(productionDate)}`} />
        <Kpi value={money(net.netTotal)} label="Next run, net to buy" sub={`${net.toBuy.length} line${net.toBuy.length === 1 ? '' : 's'} after stock and open orders`} />
      </div>
      <div className="grid gap-3 mt-3 muse-autofit-11">
        <Kpi value={`${cover.linesLinked} / ${cover.linesTotal}`} label="Next run lines linked to a supplier" sub={pct(cover.linkedShare, 0) + ' of spend'} />
        <Kpi value={pct(cover.certifiedShare, 0)} label="Spend with a certification on file" sub="USDA organic, linked lines" />
        <Kpi value={pct(cover.ratedShare, 0)} label={`Spend with an ${ratingHeader()}`} sub="Rated suppliers, linked lines" />
      </div>

      <Card title="Issued purchase orders — receive on the order" className="mt-4">
        {issuedPos.length === 0 ? (
          <p className="muse-kpi-sub">No issued purchase order is open. Orders are raised on Production Planning and issued on the supplier&apos;s page.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
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
                      <td className="num">{canRecord && world.recording && <button type="button" className={`muse-btn${receivingPoId === po.id ? ' primary' : ''} py-[0.1rem]! px-2!`} onClick={() => setReceivingPoId((id) => (id === po.id ? null : po.id))}>Receive</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {receivingPoId && world.recording && (
          <div className="mt-3">
            <ReceiveForm key={receivingPoId} purchaseOrders={issuedPos} ingredients={receiveIngredients} today={today} initialPoId={receivingPoId} onDone={() => setReceivingPoId(null)} onCancel={() => setReceivingPoId(null)} />
          </div>
        )}
        <p className="muse-kpi-sub mt-2">
          A receipt records what came off the truck against the order: quantity, the supplier&apos;s lot code, the use-by date, the temperature at the dock and the condition. A receipt that covers every line marks the order received; a rejected line stays on the record and never enters stock.
        </p>
      </Card>

      <Card title="Supply position by ingredient" className="mt-4">
        <div className="flex flex-wrap gap-3 items-end mb-3!">
          <label className="muse-kpi-sub">Next delivery date<br /><input className="muse-input" type="date" value={deliveryDate} onChange={(e) => e.target.value && setDeliveryDate(e.target.value)} /></label>
          <span className="muse-kpi-sub">produced {dateLabel(productionDate)} · {day.runs.filter((r) => r.produced > 0).map((r) => `${r.recipeCode} × ${r.batchesScheduled}`).join(' · ') || 'no run'}</span>
          <SectionSave sections={['sustainability']} title="the supplier links" />
        </div>
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead>
              <tr>
                <th>Ingredient</th><th>{ratingHeader()}</th><th>Supplier</th><th className="num">Price</th><th className="num">On hand</th><th className="num">On order</th><th className="num">Next run gross</th><th className="num">Net</th><th className="num">Cases</th><th className="num">Net extended</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ing) => {
                const st = stock.byIngredient[ing.name];
                const n = netBy.get(ing.name);
                return (
                  <tr key={ing.name} className={`${ing.inService ? '' : 'muse-c-faint'}`}>
                    <td className="font-medium!">{ing.name}<div className="muse-c-faint muse-fs-2xs font-normal">{ing.recipes} recipe{ing.recipes === 1 ? '' : 's'}{ing.inService ? '' : ' · not in service'}</div></td>
                    <td><RatingPill rating={ratingFor(ingredientRatings, ing.name)} /></td>
                    <td>
                      <SupplierPicker ingredient={ing.name} linked={links[ing.name] ? suppliers[links[ing.name]] ?? null : null} canEdit={canEdit && world.forecastEditing} onLink={(id) => setLink(ing.name, id)} />
                    </td>
                    <td className="num">
                      {money(ing.apUnitCost, ing.apUnitCost < 1 ? 4 : 2)} / {ing.unit}
                      <div className="muse-c-faint muse-fs-2xs" title={ing.price?.gap ?? undefined}>
                        {ing.price?.basis === 'catalog' ? `catalog, from ${ing.price.effectiveFrom}` : 'recipe figure'}
                      </div>
                    </td>
                    <td className="num">{st ? `${num(st.onHand, 2)} ${st.unit}` : '—'}{st ? <div className="muse-c-faint muse-fs-2xs">{st.lots} lot{st.lots === 1 ? '' : 's'} · {money(st.valueCents / 100)}</div> : null}</td>
                    <td className="num">{(onOrder.byIngredient[ing.name] ?? 0) > 0 ? `${num(onOrder.byIngredient[ing.name], 2)} ${ing.unit}` : '—'}{(onOrder.draftsByIngredient[ing.name] ?? 0) > 0 ? <div className="muse-c-faint muse-fs-2xs">{num(onOrder.draftsByIngredient[ing.name], 2)} on a draft</div> : null}</td>
                    <td className="num">{n ? `${num(n.gross, 2)} ${n.unit}` : '—'}</td>
                    <td className="num">{n ? num(n.net, 2) : '—'}</td>
                    <td className="num">{n ? n.casesToOrder : '—'}</td>
                    <td className="num">{n ? money(n.extendedCost) : '—'}</td>
                  </tr>
                );
              })}
              <tr className="total"><td colSpan={9}>Next run, net to buy</td><td className="num">{money(net.netTotal)}</td></tr>
            </tbody>
          </table>
        </div>
        <RatingLegend />
        {Object.keys(stock.unmatchedIssues).length > 0 && (
          <p className="muse-kpi-sub mt-2 muse-c-placeholder">
            Issues on closed batches with no receipt to draw from: {Object.entries(stock.unmatchedIssues).map(([k, v]) => `${num(v, 1)} ${k}`).join(', ')}. Stock is not assumed for them.
          </p>
        )}
        <p className="muse-kpi-sub mt-2">
          A line prices off its linked supplier&apos;s APPROVED catalog line, at the price in force
          today; where it does not, the row says &ldquo;recipe figure&rdquo; and carries the reason on
          hover — no supplier linked, no catalog on file, a candidate line, or a price stated per a
          different unit than the line is bought in. Purchase orders are raised from the net on <Link className="muse-link" href="/muse/production-planning?level=day">Production Planning</Link>, for a delivery day or the horizon, one per supplier with the catalog lead time giving each line an order-by date; they move to issued, received and closed on each supplier&apos;s page, and a receipt recorded here, on the order, that covers every line marks the order received. A line&apos;s supplier is set here, on <Link className="muse-link" href="/muse/recipes">Recipes</Link>, or on <Link className="muse-link" href="/muse/sustainability/ingredients">Ingredients (Scope 3)</Link> — all three write the same link, which is part of the scenario. Certifications and lead times live in <Link className="muse-link" href="/muse/suppliers">Suppliers</Link>.
        </p>
      </Card>
    </>
  );
}
