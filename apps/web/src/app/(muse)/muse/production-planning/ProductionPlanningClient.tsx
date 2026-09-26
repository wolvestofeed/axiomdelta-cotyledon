'use client';

import { PageControls } from '../_components/PageControls';
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, Kpi, CheckPill, StatusBadge, money, num, pct } from '../_components/ui';
import { RecipeSelector, useSelectedRecipe } from '../_components/RecipeSelector';
import { RecipeEditor } from '../_components/RecipeEditor';
import { PurchaseOrderGenerator } from '../_components/PurchaseOrderGenerator';
import { BatchCloseForm } from '../_components/BatchCloseForm';
import { StaffingPanel } from '../_components/StaffingPanel';
import { useScenario } from '../_state/scenario-store';
import { useOperationsWorld } from '../_state/ledger';
import { WorldNote } from '../_components/ledger/WorldNote';
import { LABOR_BASIS_LABELS } from '../_engine/meal-cost';
import { clock } from '../_data/crews';
import { WEEKDAY_LABELS, type MenuCycleDef, type OrderDef } from '../_data/menu-cycles';
import { RECIPE_STATUS_LABELS } from '../_data/plan-data';
import { orderBook, isoAddDays, weekdayOf } from '../_engine/orders';
import {
  requirementsFor,
  finishedGoodsOnHand,
  planProductionDay,
  planHorizon,
  productionDateFor,
  singleRecipeRun,
  toRequirementLines,
  deliveredConsumption,
} from '../_engine/production-plan';
import { standardBatchRecordPrefill, type BatchRecordDoc, type ReceiptDoc } from '../_engine/actuals';
import { rawStockOnHand, openOrders, netRequirements, netToRequirementLines, type PoLike, type NetRequirements } from '../_engine/net-requirements';
import type { DateRange } from '../_engine/periods';
import { standardInForce, standardLabel, type StandardVersionDoc } from '../_engine/standards';
import { CHANNEL_COMMISSION_PHASE3 } from '../_engine/phase';

type Level = 'run' | 'day' | 'horizon';
const LEVELS: { id: Level; label: string }[] = [
  { id: 'run', label: '1 · Single recipe run' },
  { id: 'day', label: '2 · Delivery day' },
  { id: 'horizon', label: '3 · Horizon' },
];
const SERVICE_WEEKDAYS = [1, 2, 3, 4, 5];
const dateLabel = (d: string) => `${WEEKDAY_LABELS[weekdayOf(d)]} ${d}`;
const nextServiceDay = (d: string) => {
  let x = isoAddDays(d, 1);
  for (let i = 0; i < 7 && !SERVICE_WEEKDAYS.includes(weekdayOf(x)); i++) x = isoAddDays(x, 1);
  return x;
};

interface BatchRow { batchId: string; recipeCode: string; productionDate: string; goodPortions: number; closedBy: string | null }

export function ProductionPlanningClient({
  canEdit,
  canRecord,
  showFinancials,
  closures,
  cycles,
  orders: recordedOrders,
  batches: recordedBatches,
  deliveries: recordedDeliveries,
  receipts: recordedReceipts,
  rawBatches: recordedRawBatches,
  standards,
  purchaseOrders: recordedPurchaseOrders,
  today,
}: {
  canEdit: boolean;
  /** Operators close batch records; editing the plan stays with super admins. */
  canRecord: boolean;
  /** Run economics and the channel allocation are admin-only (Roadmap O5). */
  showFinancials: boolean;
  /** Kitchen closures (Roadmap J1): no production and no derived order on those dates. */
  closures: DateRange[];
  cycles: MenuCycleDef[];
  orders: OrderDef[];
  batches: BatchRow[];
  deliveries: { id: string; deliveredOn: string; meals: number }[];
  receipts: ReceiptDoc[];
  /** The full batch records, for the raw issues they carry. */
  rawBatches: BatchRecordDoc[];
  /** Approved standard-cost versions (Roadmap J5); the close prefills from the one in force on the production date. */
  standards: StandardVersionDoc[];
  purchaseOrders: PoLike[];
  today: string;
}) {
  const { resolved, library } = useScenario();
  // Plan runs the open forecast's own world; Actual the real kitchen (Roadmap N6 slice 3).
  const world = useOperationsWorld({ orders: recordedOrders, batches: recordedBatches, deliveries: recordedDeliveries, receipts: recordedReceipts, rawBatches: recordedRawBatches, purchaseOrders: recordedPurchaseOrders });
  const { orders, batches, deliveries, receipts, rawBatches, purchaseOrders } = world;
  const canRecordHere = canRecord && world.recording;
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const level: Level = (['run', 'day', 'horizon'] as Level[]).find((l) => l === params.get('level')) ?? 'day';
  const setLevel = useCallback(
    (l: Level) => {
      const next = new URLSearchParams(params.toString());
      next.set('level', l);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, router, pathname],
  );

  // ── Shared ────────────────────────────────────────────────────────────────
  const A = resolved.assumptions;
  const holdLife = A.inventory.chilledHoldLife.value;
  const shrink = A.yield.shrinkAllowance.value;
  const channels = useMemo(() => resolved.phases.map((p) => ({ phase: p.phase, market: p.market, pricePerMeal: p.pricePerMeal, priceCents: Math.round(p.pricePerMeal * 100), mealsPerDay: p.mealsPerDay })), [resolved.phases]);
  const pfByChannel = useMemo(() => Object.fromEntries(resolved.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>, [resolved.phaseProfiles]);
  const premiumByChannel = useMemo(() => Object.fromEntries(resolved.phaseProfiles.map((p) => [p.phase, p.premiumFactor.value])) as Record<number, number>, [resolved.phaseProfiles]);
  const recipeNames = useMemo(() => Object.fromEntries(resolved.recipes.map((r) => [r.code, r.name])), [resolved.recipes]);
  const channelPriceCents = useMemo(() => Object.fromEntries(channels.map((c) => [c.phase, c.priceCents])) as Record<number, number>, [channels]);
  const channelLabel = (ch: number) => channels.find((c) => c.phase === ch)?.market ?? `Channel ${ch}`;
  const bookFor = useCallback(
    (from: string, to: string) => orderBook({ sites: world.sites, customers: resolved.customers, cycles, orders, from, to, channelPriceCents, recipeNames, closures }),
    [world.sites, resolved.customers, cycles, orders, channelPriceCents, recipeNames, closures],
  );
  const consumption = useMemo(() => deliveredConsumption(orders, deliveries, resolved.recipes, pfByChannel), [orders, deliveries, resolved.recipes, pfByChannel]);
  const batchCountByDate = useMemo(() => batches.reduce<Record<string, number>>((m, b) => { m[b.productionDate] = (m[b.productionDate] ?? 0) + 1; return m; }, {}), [batches]);

  // ── Level 1: single recipe run ────────────────────────────────────────────
  const { recipe: runRecipe } = useSelectedRecipe();
  const [runChannel, setRunChannel] = useState<number>(() => runRecipe.channels[0] ?? 1);
  const [runMeals, setRunMeals] = useState<number>(() => Math.round(channels.find((c) => c.phase === (runRecipe.channels[0] ?? 1))?.mealsPerDay ?? 0));
  const [runPrice, setRunPrice] = useState<number | ''>('');
  const [runOpening, setRunOpening] = useState(0);
  const [editor, setEditor] = useState(false);
  const runChannelPrice = channels.find((c) => c.phase === runChannel)?.pricePerMeal ?? 0;
  const runOwnPortion = runRecipe.channels.includes(runChannel);
  const run = useMemo(
    () =>
      singleRecipeRun({
        recipe: runRecipe,
        meals: runMeals,
        portionFactor: runOwnPortion ? 1 : pfByChannel[runChannel] ?? 1,
        premiumFactor: runOwnPortion ? 1 : premiumByChannel[runChannel] ?? 1,
        pricePerMeal: runPrice === '' ? runChannelPrice : runPrice,
        commissionShare: runChannel === 3 ? CHANNEL_COMMISSION_PHASE3 : 0,
        openingInventory: runOpening,
        capacityInputs: resolved.capacityInputs,
        // The run is costed at its own recipe's labor standard and packaging (Roadmap N3).
        assumptions: resolved.recipeAssumptions[runRecipe.code] ?? A,
      }),
    [runRecipe, runMeals, runChannel, runPrice, runOpening, runChannelPrice, runOwnPortion, pfByChannel, premiumByChannel, resolved.capacityInputs, resolved.recipeAssumptions, A],
  );
  const runRequirement = useMemo(() => toRequirementLines(run.purchase.lines), [run.purchase.lines]);

  // ── Level 2: delivery day ─────────────────────────────────────────────────
  const [dayDate, setDayDate] = useState(() => nextServiceDay(today));
  const productionDate = productionDateFor(dayDate, SERVICE_WEEKDAYS, closures);
  const dayBook = useMemo(() => bookFor(dayDate, dayDate), [bookFor, dayDate]);
  const requirements = useMemo(() => requirementsFor(dayBook, resolved.recipes, pfByChannel), [dayBook, resolved.recipes, pfByChannel]);
  const stock = useMemo(() => finishedGoodsOnHand({ batches, consumed: consumption, holdLifeDays: holdLife, asOf: productionDate }), [batches, consumption, holdLife, productionDate]);
  const [onHandOverride, setOnHandOverride] = useState<Record<string, number>>({});
  const onHand = useMemo(() => {
    const m: Record<string, number> = { ...stock.byRecipe };
    for (const [k, v] of Object.entries(onHandOverride)) m[k] = v;
    return m;
  }, [stock.byRecipe, onHandOverride]);
  const day = useMemo(
    () => planProductionDay({ productionDate, requirements, onHand, recipes: resolved.recipes, capacityInputs: resolved.capacityInputs, assumptions: A, recipeAssumptions: resolved.recipeAssumptions, crews: resolved.crews }),
    [productionDate, requirements, onHand, resolved.recipes, resolved.capacityInputs, A, resolved.recipeAssumptions, resolved.crews],
  );
  const [closing, setClosing] = useState<{ seq: number; recipeCode: string; portions: number } | null>(null);
  const closingRecipe = closing ? resolved.recipes.find((r) => r.code === closing.recipeCode) : undefined;
  const closingPrefill = useMemo(() => {
    if (!closing || !closingRecipe) return null;
    const std = standardInForce(standards, closing.recipeCode, productionDate);
    return standardBatchRecordPrefill(
      productionDate,
      (batchCountByDate[productionDate] ?? 0) + 1,
      closing.portions,
      std?.snapshot.recipe ?? closingRecipe,
      std ? std.snapshot.assumptions.yield.shrinkAllowance.value : shrink,
      std ? standardLabel(std) : undefined,
    );
  }, [closing, closingRecipe, productionDate, batchCountByDate, shrink, standards]);
  const recordedToday = useMemo(() => batches.filter((b) => b.productionDate === productionDate), [batches, productionDate]);
  // Raw stock on the production morning and what is on order: the net requirement is what is bought.
  const onOrder = useMemo(() => openOrders({ purchaseOrders, receipts }), [purchaseOrders, receipts]);
  const dayStock = useMemo(() => rawStockOnHand({ receipts, batches: rawBatches, asOf: productionDate }), [receipts, rawBatches, productionDate]);
  const dayNet = useMemo(() => netRequirements({ days: [{ productionDate, lines: day.purchase.lines }], stock: dayStock, onOrder }), [productionDate, day.purchase.lines, dayStock, onOrder]);
  const dayMeals = dayBook.reduce((s, o) => s + o.meals, 0);
  const dayByChannel = channels.map((c) => ({ ...c, meals: dayBook.filter((o) => o.channel === c.phase).reduce((s, o) => s + o.meals, 0) }));

  // ── Level 3: horizon ──────────────────────────────────────────────────────
  const [hFrom, setHFrom] = useState(today);
  const [hTo, setHTo] = useState(isoAddDays(today, 27));
  const hBook = useMemo(() => bookFor(hFrom, hTo), [bookFor, hFrom, hTo]);
  const openingLots = useMemo(() => finishedGoodsOnHand({ batches, consumed: consumption, holdLifeDays: holdLife, asOf: hFrom }).lots.filter((l) => l.remaining > 0), [batches, consumption, holdLife, hFrom]);
  const horizon = useMemo(
    () =>
      planHorizon({
        closures,
        crews: resolved.crews,
        from: hFrom,
        to: hTo,
        book: hBook,
        recipes: resolved.recipes,
        capacityInputs: resolved.capacityInputs,
        assumptions: A,
        recipeAssumptions: resolved.recipeAssumptions,
        portionFactorByChannel: pfByChannel,
        openingLots,
        holdLifeDays: holdLife,
        productionWeekdays: SERVICE_WEEKDAYS,
        channels: channels.map((c) => c.phase),
      }),
    [closures, hFrom, hTo, hBook, resolved.recipes, resolved.capacityInputs, A, pfByChannel, openingLots, holdLife, channels, resolved.crews],
  );
  const hStock = useMemo(() => rawStockOnHand({ receipts, batches: rawBatches, asOf: hFrom }), [receipts, rawBatches, hFrom]);
  const hNet = useMemo(
    () => netRequirements({ days: horizon.productionDays.map((p) => ({ productionDate: p.productionDate, lines: p.purchase.lines })), stock: hStock, onOrder }),
    [horizon.productionDays, hStock, onOrder],
  );
  const needByOf = (n: NetRequirements) => Object.fromEntries(n.lines.filter((l) => l.needBy).map((l) => [l.ingredient, l.needBy as string]));

  return (
    <>
      <WorldNote isPlan={world.isPlan} />
      <PageControls group="view">
        {LEVELS.map((l) => (
          <button key={l.id} type="button" className={`muse-btn${level === l.id ? ' primary' : ' ghost'}`} aria-pressed={level === l.id} onClick={() => setLevel(l.id)}>{l.label}</button>
        ))}
      </PageControls>

      {level === 'run' && (
        <>
          <Card title="The run — a recipe, a quantity, a channel">
            <PageControls><RecipeSelector /></PageControls>
            <div className="flex flex-wrap gap-3 items-end">
              <span className="muse-kpi-sub">{RECIPE_STATUS_LABELS[runRecipe.status]}{runRecipe.channels.length ? ` · authored for ${runRecipe.channels.map((c) => channelLabel(c)).join(', ')}` : ' · listed on no channel'}</span>
              {canEdit && <button type="button" className="muse-btn" onClick={() => setEditor((e) => !e)}>{editor ? 'Close editor' : 'Add New Recipe'}</button>}
              <label className="muse-kpi-sub">Meals<br /><input className="muse-input w-28!" type="number" min={0} step={1} value={runMeals} onChange={(e) => setRunMeals(Math.max(0, Number(e.target.value) || 0))} /></label>
              <label className="muse-kpi-sub">Channel<br />
                <select className="muse-select" value={runChannel} onChange={(e) => { const ch = Number(e.target.value); setRunChannel(ch); setRunPrice(''); }}>
                  {channels.map((c) => <option key={c.phase} value={c.phase}>{channelLabel(c.phase)}{runRecipe.channels.includes(c.phase) ? '' : ' · not listed'}</option>)}
                </select>
              </label>
              <label className="muse-kpi-sub">Price / meal $ (blank = channel {money(runChannelPrice)})<br /><input className="muse-input w-28!" type="number" min={0} step={0.01} value={runPrice} onChange={(e) => setRunPrice(e.target.value === '' ? '' : Number(e.target.value))} /></label>
              <label className="muse-kpi-sub">Opening finished inventory (base portions)<br /><input className="muse-input w-28!" type="number" min={0} step={25} value={runOpening} onChange={(e) => setRunOpening(Math.max(0, Number(e.target.value) || 0))} /></label>
            </div>
            <p className="muse-kpi-sub mt-2">
              A recipe saved from the editor is a library recipe from that moment and runs here at once.{' '}
              {runOwnPortion
                ? `${runRecipe.code} is authored for ${channelLabel(runChannel)} and runs at its own portion${runRecipe.spec.upgradeMultiplier ? ` (protein and vegetable lines × ${runRecipe.spec.upgradeMultiplier.value} over the student recipe, ${runRecipe.spec.upgradeMultiplier.status.toLowerCase()})` : ''}.`
                : `${runRecipe.code} is not authored for ${channelLabel(runChannel)}, so the channel's ${pfByChannel[runChannel] ?? 1}× portion factor and ${premiumByChannel[runChannel] ?? 1}× ingredient premium (Unit Economics) apply.`}
            </p>
            {editor && <div className="mt-3"><RecipeEditor mode="create" library={library} channels={channels.map((c) => ({ phase: c.phase, market: c.market }))} onDone={() => setEditor(false)} /></div>}
          </Card>

          <div className="grid gap-3 mt-4 muse-autofit-11">
            <Kpi value={num(run.batches)} label="Batches (whole only)" sub={`${num(run.produced)} base portions for ${num(run.basePortions)} needed`} />
            <Kpi value={num(run.cap.batchSize)} label="Batch size (derived)" sub={`${run.cap.chilledMassPerPortion.toFixed(3)} lb chilled / portion`} />
            <Kpi value={<span>{num(run.cyclesRequired)} of {num(run.cyclesAvailable)} <CheckPill ok={run.fits} okLabel="fits" overLabel="over" /></span>} label="Chiller cycles" sub="One batch is one cycle by construction" />
            <Kpi value={`${num(Math.round(run.chilledLb))} lb`} label="Chilled mass for the run" sub={`${num(Math.round(run.cookedLb))} lb cooked · hot components only enter the cabinet`} />
            <Kpi value={money(run.foodCostPerMeal)} label="Food cost / meal" sub={`${money(run.laborPerPortion)} run labor / portion (time study)`} />
            {showFinancials && <Kpi value={money(run.contributionPerMeal)} label="Contribution / meal" sub="Before fixed overhead" />}
          </div>

          <div className="grid gap-4 mt-4 muse-autofit-20">
            <Card title="The run in pounds — four weights, one production">
              <table className="muse-table">
                <thead><tr><th>Stage</th><th className="num">Pounds</th><th className="num">Oz / portion</th></tr></thead>
                <tbody>
                  <tr><td>As purchased</td><td className="num">{num(Math.round(run.purchasedLb))}</td><td className="num">{((run.purchasedLb * 16) / Math.max(1, run.produced)).toFixed(2)}</td></tr>
                  <tr><td>Cooked</td><td className="num">{num(Math.round(run.cookedLb))}</td><td className="num">{((run.cookedLb * 16) / Math.max(1, run.produced)).toFixed(2)}</td></tr>
                  <tr><td>Blast chilled (hot components)</td><td className="num">{num(Math.round(run.chilledLb))}</td><td className="num">{((run.chilledLb * 16) / Math.max(1, run.produced)).toFixed(2)}</td></tr>
                  <tr className="total"><td>Plated, at {money(run.costPerPlatedOz, 4)} per plated oz</td><td className="num">{num(Math.round(run.packedLb))}</td><td className="num">{((run.packedLb * 16) / Math.max(1, run.produced)).toFixed(2)}</td></tr>
                </tbody>
              </table>
              <table className="muse-table mt-3">
                <tbody>
                  <tr><td>Purchase order, case-rounded, incl. the {(shrink * 100).toFixed(0)}% normal-spoilage allowance</td><td className="num">{money(run.purchase.total)}</td></tr>
                  <tr><td>Recipe standard for {num(run.produced)} portions, incl. the same allowance</td><td className="num">{money(run.foodCostStandard)}</td></tr>
                  <tr className="total"><td>Difference held in raw materials (case rounding, not a price variance)</td><td className="num">{money(run.carriedForward)}</td></tr>
                  <tr><td>Closing finished inventory after the {num(run.meals)} meals ship</td><td className="num">{num(run.closing)} base portions</td></tr>
                </tbody>
              </table>
            </Card>

            {showFinancials && (
            <Card title={`Economics of ${num(run.meals)} meals on ${channelLabel(runChannel)}`}>
              <table className="muse-table">
                <tbody>
                  <tr><td>Revenue at {money(runPrice === '' ? runChannelPrice : runPrice)}</td><td className="num">{money(run.revenue)}</td></tr>
                  <tr><td>Food cost sold ({money(run.foodCostPerMeal)} / meal)</td><td className="num">({money(run.foodCostSold)})</td></tr>
                  <tr><td>Direct labor for the run — {run.laborHours.toFixed(1)} h at {money(A.labor.blendedLoadedWage.value)}/h (time study, fixed + variable)</td><td className="num">({money(run.laborCost)})</td></tr>
                  <tr><td>Packaging ({money(run.packagingPerMeal)} / meal)</td><td className="num">({money(run.packaging)})</td></tr>
                  <tr><td>Delivery ({money(run.deliveryPerMeal)} / meal)</td><td className="num">({money(run.delivery)})</td></tr>
                  {run.commission > 0 && <tr><td>Marketplace commission ({pct(CHANNEL_COMMISSION_PHASE3, 0)} of price)</td><td className="num">({money(run.commission)})</td></tr>}
                  <tr className="total"><td>Contribution before fixed overhead</td><td className="num">{money(run.contribution)}</td></tr>
                  <tr><td>Per meal</td><td className="num">{money(run.contributionPerMeal)}</td></tr>
                </tbody>
              </table>
              <p className="muse-kpi-sub mt-2">
                Labor here is the run&rsquo;s own hours on {runRecipe.code}&rsquo;s own labor standard ({LABOR_BASIS_LABELS[resolved.laborStandards[runRecipe.code]?.basis ?? 'none'].toLowerCase()}) — {num(run.batches)} × {num(resolved.laborStandards[runRecipe.code]?.fixedMinutesPerBatch ?? 0, 0)} fixed minutes plus {num(run.produced)} × {(resolved.laborStandards[runRecipe.code]?.variableMinutesPerPortion ?? 0).toFixed(3)} variable minutes — priced at the loaded wage. The cost of a meal on Unit Economics and on Recipes uses the same standard at one full batch. Fixed overhead is on <Link className="muse-link" href="/muse/financials/unit-economics">Unit Economics</Link>.
              </p>
            </Card>
            )}
          </div>

          <PurchaseOrderGenerator canEdit={canEdit && world.recording} requirement={runRequirement} portionsProduced={run.produced} title={`Purchase orders — ${runRecipe.code}, ${num(run.produced)} portions`} />
        </>
      )}

      {level === 'day' && (
        <>
          <Card title="Delivery day">
            <PageControls><label className="muse-kpi-sub inline-flex items-center gap-2">Delivery date<input className="muse-input" type="date" value={dayDate} onChange={(e) => { if (e.target.value) { setDayDate(e.target.value); setClosing(null); setOnHandOverride({}); } }} /></label></PageControls>
            <div className="flex flex-wrap gap-3 items-end">
              <span className="muse-kpi-sub">Delivered {dateLabel(dayDate)} · produced <strong className="muse-c-ink">{dateLabel(productionDate)}</strong> · {num(Math.round(dayMeals))} meals in {dayBook.length} order{dayBook.length === 1 ? '' : 's'}</span>
            </div>
            <p className="muse-kpi-sub mt-2">
              Nothing is served on the day it is cooked: the meals delivered on this date are made on the last production weekday before it, blast chilled and held. Orders come from <Link className="muse-link" href="/muse/orders">Orders</Link>: forecast orders from each customer&rsquo;s meal plan and its services&rsquo; meals per service, plus the confirmed and typed orders on file. Meals are exploded into base portions — at the recipe&rsquo;s own portion when it is authored for the channel, else at the channel&rsquo;s portion factor — netted against finished goods on hand on the production morning, and sized into whole batches per recipe.
            </p>
          </Card>

          <div className="grid gap-3 mt-4 muse-autofit-11">
            <Kpi value={num(Math.round(dayMeals))} label="Meals ordered" sub={dayByChannel.filter((c) => c.meals > 0).map((c) => `${num(Math.round(c.meals))} ${c.market}`).join(' · ') || 'no orders on this date'} />
            <Kpi value={num(Math.round(day.totalRequired))} label="Base portions required" sub={`${day.runs.length} recipe${day.runs.length === 1 ? '' : 's'}`} />
            <Kpi value={<span>{num(day.cyclesRequired)} of {num(day.cyclesAvailable)} <CheckPill ok={day.fits} okLabel="fits" overLabel="does not fit" /></span>} label="Chiller cycles" sub={`${clock(day.chillWindow.startMin)}–${clock(day.chillWindow.endMin)} window ÷ ${day.chillWindow.occupancyMinutes} min occupancy`} />
            <Kpi value={num(day.runs.reduce((s, r) => s + r.batchesScheduled, 0))} label="Batches to run" sub={`${num(Math.round(day.totalProduced))} base portions produced${day.totalShortfall > 0 ? ` · ${num(Math.round(day.totalShortfall))} short` : ''}`} />
            <Kpi value={`${num(Math.round(day.chilledLb))} lb`} label="Chilled mass" sub={`${num(Math.round(day.chilledCeilingLb))} lb the cabinets take in the day`} />
            <Kpi value={`${day.laborHours.toFixed(1)} h`} label="Direct labor" sub={`${money(day.laborCost)} at the loaded wage`} />
          </div>

          <Card title={`Production requirements — ${dateLabel(productionDate)}`} className="mt-4">
            {day.runs.length === 0 && <p className="muse-kpi-sub">No orders on {dateLabel(dayDate)}. A service with meals per service and a meal plan on Customers put forecast orders here.</p>}
            {day.runs.length > 0 && (
              <div className="muse-scroll-x">
                <table className="muse-table">
                  <thead>
                    <tr><th>Recipe</th><th className="num">Meals</th><th className="num">Required (base)</th><th className="num">On hand</th><th className="num">Net</th><th className="num">Batch size</th><th className="num">Batches</th><th className="num">Produced</th><th className="num">Closing</th><th className="num">Food at standard</th></tr>
                  </thead>
                  <tbody>
                    {day.runs.map((r) => {
                      const req = requirements.find((q) => q.recipeCode === r.recipeCode);
                      const overridden = onHandOverride[r.recipeCode] !== undefined;
                      return (
                        <tr key={r.recipeCode}>
                          <td>{r.recipeCode}<div className="muse-c-faint muse-fs-xs">{r.recipeName}</div></td>
                          <td className="num">{num(Math.round(req?.meals ?? 0))}<div className="muse-c-faint muse-fs-2xs">{(req?.byChannel ?? []).map((c) => `${channelLabel(c.channel)} ${num(Math.round(c.meals))}${c.portionFactor !== 1 ? ` × ${c.portionFactor}` : ''}`).join(' · ')}</div></td>
                          <td className="num">{num(Math.round(r.required))}</td>
                          <td className="num">
                            <input className="muse-num-input" type="number" min={0} step={1} value={Math.round(r.onHand)} onChange={(e) => setOnHandOverride((m) => ({ ...m, [r.recipeCode]: Math.max(0, Number(e.target.value) || 0) }))} aria-label={`${r.recipeCode} on hand`} />
                            <div className="muse-fs-2xs"><StatusBadge status={overridden ? 'STATED' : 'DERIVED'} title={overridden ? 'Typed for this view; not saved.' : `From ${stock.lots.filter((l) => l.recipeCode === r.recipeCode && l.remaining > 0 && l.expires >= productionDate).length} closed batch record(s) inside hold life, less delivered orders.`} />{overridden && <button type="button" className="muse-btn py-0! px-[0.3rem]! ml-[0.3rem]! muse-fs-2xs" onClick={() => setOnHandOverride((m) => { const n = { ...m }; delete n[r.recipeCode]; return n; })}>records</button>}</div>
                          </td>
                          <td className="num">{num(Math.round(r.net))}</td>
                          <td className="num">{num(r.batchSize)}</td>
                          <td className="num">{num(r.batchesScheduled)}{r.batchesScheduled < r.batchesNeeded ? <div className="muse-c-over muse-fs-2xs">{num(r.batchesNeeded)} needed</div> : null}</td>
                          <td className="num">{num(Math.round(r.produced))}{r.shortfall > 0 ? <div className="muse-c-over muse-fs-2xs">{num(Math.round(r.shortfall))} short</div> : null}</td>
                          <td className="num">{num(Math.round(r.closing))}</td>
                          <td className="num">{money(r.foodCostStandard)}</td>
                        </tr>
                      );
                    })}
                    <tr className="total"><td>All recipes</td><td className="num">{num(Math.round(dayMeals))}</td><td className="num">{num(Math.round(day.totalRequired))}</td><td className="num">—</td><td className="num">{num(Math.round(day.runs.reduce((s, r) => s + r.net, 0)))}</td><td className="num">—</td><td className="num">{num(day.runs.reduce((s, r) => s + r.batchesScheduled, 0))}</td><td className="num">{num(Math.round(day.totalProduced))}</td><td className="num">{num(Math.round(day.runs.reduce((s, r) => s + r.closing, 0)))}</td><td className="num">{money(day.foodCostStandard)}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
            {Object.keys(stock.expiredByRecipe).length > 0 && (
              <p className="muse-kpi-sub mt-2 muse-c-placeholder">
                Past hold life on {productionDate}, unconsumed: {Object.entries(stock.expiredByRecipe).map(([k, v]) => `${num(Math.round(v))} ${k}`).join(', ')}. Not counted as on hand.
              </p>
            )}
            <p className="muse-kpi-sub mt-2">
              On hand is what the closed batch records say is inside the {holdLife}-day hold life on the production morning, less what delivered orders drew, oldest lot first. No record, no stock: the platform does not assume inventory it has not seen. Overshoot on whole batches is the closing stock; the horizon carries it to the next delivery date.
            </p>
          </Card>

          <Card title="The chiller, in order" className="mt-4">
            {day.schedule.length === 0 ? <p className="muse-kpi-sub">Nothing to chill.</p> : (
              <div className="muse-scroll-x">
                <table className="muse-table">
                  <thead><tr><th className="num">#</th><th>Recipe</th><th className="num">Portions</th><th className="num">Load</th><th className="num">Unload</th><th className="num">Cabinet free</th><th>Fits</th><th /></tr></thead>
                  <tbody>
                    {day.schedule.map((b) => (
                      <tr key={b.seq}>
                        <td className="num">{b.seq}</td>
                        <td>{b.recipeCode}<div className="muse-c-faint muse-fs-xs">{b.recipeName}</div></td>
                        <td className="num">{num(b.portions)}</td>
                        <td className="num">{clock(b.loadMin)}</td>
                        <td className="num">{clock(b.unloadMin)}</td>
                        <td className="num">{clock(b.freeMin)}</td>
                        <td><CheckPill ok={b.fits} okLabel="in the window" overLabel="past the window" /></td>
                        <td className="num">{canRecordHere && b.fits && <button type="button" className="muse-btn py-[0.1rem]! px-2!" onClick={() => setClosing({ seq: b.seq, recipeCode: b.recipeCode, portions: b.portions })}>Close batch record</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="muse-kpi-sub mt-2">
              Batches are placed one cycle apart from the first load, largest requirement first; each takes the cabinet for {day.chillWindow.occupancyMinutes} minutes (load, chill, unload). A batch past the window is not made that day — it is the named shortfall above, not a plan that slips to 14:00.
            </p>
          </Card>

          <Card title={`Labor the day requires, and the proposed crews checked against it — ${dateLabel(productionDate)}`} className="mt-4">
            <StaffingPanel labor={day.labor} staffing={day.staffing} crews={resolved.crews} />
            <p className="muse-kpi-sub mt-2">
              The requirement comes off the batches placed on the chiller above. Crews are proposed on <Link className="muse-link" href="/muse/capacity">Capacity</Link>; a gap is a finding here and never takes a cycle away from the day.
            </p>
          </Card>

          {closing && closingPrefill && world.recording && (
            <div className="mt-4">
              <BatchCloseForm prefill={closingPrefill} batchCountByDate={batchCountByDate} standardBatchSize={closing.portions} recipeName={closingRecipe?.name} rawLots={dayStock.lots} onDone={() => setClosing(null)} onCancel={() => setClosing(null)} />
            </div>
          )}

          {recordedToday.length > 0 && (
            <Card title={`Batch records closed for ${dateLabel(productionDate)}`} className="mt-4">
              <table className="muse-table"><tbody>
                {recordedToday.map((b) => <tr key={b.batchId}><td>{b.batchId}<div className="muse-c-faint muse-fs-2xs">{b.recipeCode} · {b.closedBy ?? 'unsigned'}</div></td><td className="num">{num(Math.round(b.goodPortions))} good portions</td></tr>)}
              </tbody></table>
              <p className="muse-kpi-sub mt-2">Listed with the period on <Link className="muse-link" href="/muse/actuals">Actuals</Link>, where the ledger posts from them.</p>
            </Card>
          )}

          <NetCard title="Purchase requirement — the net, one order across recipes" net={dayNet} stock={dayStock} gross={day.purchase.total} shrink={shrink} runs={day.runs.filter((r) => r.produced > 0).length} onOrderDrafts={onOrder.draftsByIngredient} />
          <PurchaseOrderGenerator canEdit={canEdit && world.recording} requirement={netToRequirementLines(dayNet)} portionsProduced={day.totalProduced} defaultDate={productionDate} title={`Purchase orders by supplier — ${dateLabel(productionDate)}`} needBy={needByOf(dayNet)} today={today} summary={`${money(dayNet.netTotal)} net to buy for ${num(Math.round(day.totalProduced))} portions`} />
        </>
      )}

      {level === 'horizon' && (
        <>
          <Card title="Horizon">
            <PageControls>
              <label className="muse-kpi-sub inline-flex items-center gap-2">From<input className="muse-input" type="date" value={hFrom} onChange={(e) => e.target.value && setHFrom(e.target.value)} /></label>
              <label className="muse-kpi-sub inline-flex items-center gap-2">To<input className="muse-input" type="date" value={hTo} onChange={(e) => e.target.value && setHTo(e.target.value)} /></label>
            </PageControls>
            <div className="flex flex-wrap gap-3 items-end">
              <span className="muse-kpi-sub">{horizon.deliveryDays.length} delivery date{horizon.deliveryDays.length === 1 ? '' : 's'} · {horizon.productionDays.length} production day{horizon.productionDays.length === 1 ? '' : 's'} · opening stock {num(Math.round(openingLots.reduce((s, l) => s + l.remaining, 0)))} base portions from records</span>
            </div>
            <p className="muse-kpi-sub mt-2">
              The order book for the period, rolled through production: each production weekday makes the next delivery date&rsquo;s orders net of stock, whole batches overshoot into stock inside the {holdLife}-day hold life, and a delivery date draws its orders from stock oldest first. What the cabinets cannot make is an unfilled order, shared equally across the channels on that recipe — the same rule as equal distribution on the annual allocation.
            </p>
          </Card>

          <div className="grid gap-3 mt-4 muse-autofit-11">
            <Kpi value={num(Math.round(horizon.totals.orderedMeals))} label="Meals ordered" sub={`${num(Math.round(horizon.totals.orderedBase))} base portions`} />
            <Kpi value={num(Math.round(horizon.totals.filledMeals))} label="Meals filled" sub={horizon.totals.orderedMeals > 0 ? `${pct(horizon.totals.filledMeals / horizon.totals.orderedMeals)} of ordered` : '—'} />
            <Kpi value={num(horizon.totals.batches)} label="Batches" sub={`${num(Math.round(horizon.totals.producedBase))} base portions produced`} />
            <Kpi value={pct(horizon.totals.utilisation)} label="Chiller cycles used" sub={`${num(horizon.totals.cyclesUsed)} of ${num(horizon.totals.cyclesAvailable)} on production days`} />
            <Kpi value={<CheckPill ok={horizon.totals.daysThatDoNotFit === 0} okLabel="every day fits" overLabel={`${horizon.totals.daysThatDoNotFit} day${horizon.totals.daysThatDoNotFit === 1 ? '' : 's'} over`} />} label="Capacity" sub="Batches against the plant's cycles" />
            <Kpi value={num(Math.round(horizon.totals.expiredBase))} label="Expired past hold life" sub={`${num(Math.round(horizon.totals.closingStockBase))} base portions in stock at the end`} />
          </div>

          {showFinancials && (
            <>
          <Card title="By channel — ordered against filled over the horizon" className="mt-4">
            <div className="muse-scroll-x">
              <table className="muse-table">
                <thead><tr><th>Channel</th><th className="num">Meals ordered</th><th className="num">Meals filled</th><th className="num">Share filled</th></tr></thead>
                <tbody>
                  {horizon.byChannel.map((c) => (
                    <tr key={c.channel}>
                      <td>{channelLabel(c.channel)}</td>
                      <td className="num">{num(Math.round(c.orderedMeals))}</td>
                      <td className="num">{num(Math.round(c.filledMeals))}</td>
                      <td className="num">{pct(c.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muse-kpi-sub mt-2">
              What the order book asked for and what the lines in service could make over these dates. The same run over the forecast&rsquo;s horizon is the <Link className="muse-link" href="/muse/financials/pnl">Plan ledger</Link>.
            </p>
          </Card>
            </>
          )}

          <div className="grid gap-4 mt-4 muse-autofit-22">
            <Card title="Production days">
              {horizon.productionDays.length === 0 ? <p className="muse-kpi-sub">No orders in the period.</p> : (
                <div className="muse-scroll-x">
                  <table className="muse-table">
                    <thead><tr><th>Made on</th><th>For</th><th>Batches by recipe</th><th className="num">Cycles</th><th>Fits</th></tr></thead>
                    <tbody>
                      {horizon.productionDays.map((p) => (
                        <tr key={p.productionDate}>
                          <td>{dateLabel(p.productionDate)}</td>
                          <td className="muse-fs-xs">{p.deliveryDates.map((d) => dateLabel(d)).join(', ')}</td>
                          <td className="muse-fs-xs">{p.runs.filter((r) => r.batchesNeeded > 0).map((r) => `${r.recipeCode} × ${r.batchesScheduled}${r.batchesScheduled < r.batchesNeeded ? ` of ${r.batchesNeeded}` : ''}`).join(' · ') || 'stock covers it'}</td>
                          <td className="num">{num(p.runs.reduce((s, r) => s + r.batchesScheduled, 0))} / {num(p.cyclesAvailable)}</td>
                          <td><CheckPill ok={p.fits} okLabel="fits" overLabel="over" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card title="Delivery days">
              {horizon.deliveryDays.length === 0 ? <p className="muse-kpi-sub">No orders in the period.</p> : (
                <div className="muse-scroll-x">
                  <table className="muse-table">
                    <thead><tr><th>Date</th><th className="num">Meals ordered</th><th className="num">Base ordered</th><th className="num">Filled</th><th className="num">Unfilled</th></tr></thead>
                    <tbody>
                      {horizon.deliveryDays.map((d) => (
                        <tr key={d.date}>
                          <td>{dateLabel(d.date)}</td>
                          <td className="num">{num(Math.round(d.orderedMeals))}</td>
                          <td className="num">{num(Math.round(d.orderedBase))}</td>
                          <td className="num">{num(Math.round(d.filledBase))}</td>
                          <td className="num">{d.unfilledBase > 0.5 ? <span className="muse-c-over">{num(Math.round(d.unfilledBase))}</span> : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <NetCard title={`Purchase requirement — the net over the horizon, ${horizon.productionDays.length} production day${horizon.productionDays.length === 1 ? '' : 's'}`} net={hNet} stock={hStock} gross={horizon.productionDays.reduce((s, p) => s + p.purchase.total, 0)} shrink={shrink} runs={horizon.productionDays.reduce((s, p) => s + p.runs.filter((r) => r.produced > 0).length, 0)} onOrderDrafts={onOrder.draftsByIngredient} />
          <PurchaseOrderGenerator canEdit={canEdit && world.recording} requirement={netToRequirementLines(hNet)} portionsProduced={horizon.totals.producedBase} defaultDate={hNet.toBuy.map((l) => l.needBy).filter((d): d is string => Boolean(d)).sort()[0] ?? hFrom} title="Purchase orders by supplier — the horizon" needBy={needByOf(hNet)} today={today} summary={`${money(hNet.netTotal)} net to buy for ${num(Math.round(horizon.totals.producedBase))} base portions`} />

          {horizon.byRecipe.length > 0 && (
            <Card title="By recipe over the horizon" className="mt-4">
              <div className="muse-scroll-x">
                <table className="muse-table">
                  <thead><tr><th>Recipe</th><th className="num">Base ordered</th><th className="num">Produced</th><th className="num">Batches</th></tr></thead>
                  <tbody>
                    {horizon.byRecipe.map((r) => <tr key={r.recipeCode}><td>{r.recipeCode}<div className="muse-c-faint muse-fs-xs">{r.recipeName}</div></td><td className="num">{num(Math.round(r.orderedBase))}</td><td className="num">{num(Math.round(r.producedBase))}</td><td className="num">{num(r.batches)}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}


/** The net requirement table: gross at standard, stock applied, on order applied, net, cases. */
function NetCard({ title, net, stock, gross, shrink, runs, onOrderDrafts }: { title: string; net: NetRequirements; stock: ReturnType<typeof rawStockOnHand>; gross: number; shrink: number; runs: number; onOrderDrafts: Record<string, number> }) {
  const stockValue = Object.values(stock.byIngredient).reduce((s, l) => s + l.valueCents, 0) / 100;
  const drafts = net.lines.filter((l) => (onOrderDrafts[l.ingredient] ?? 0) > 0).length;
  return (
    <Card title={title} className="mt-4">
      <div className="grid gap-3 muse-autofit-11 mb-3!">
        <Kpi value={money(gross)} label="Gross at the recipe standard" sub={`Case-rounded, incl. the ${(shrink * 100).toFixed(0)}% allowance, ${runs} recipe run${runs === 1 ? '' : 's'}`} />
        <Kpi value={money(net.lines.reduce((s, l) => s + l.onHandApplied * l.apUnitCost, 0))} label="Covered by stock on hand" sub={`${Object.keys(stock.byIngredient).length} ingredient${Object.keys(stock.byIngredient).length === 1 ? '' : 's'} on hand from receipts, ${money(stockValue)} at invoice`} />
        <Kpi value={money(net.lines.reduce((s, l) => s + l.onOrderApplied * l.apUnitCost, 0))} label="Covered by orders arriving in time" sub={drafts > 0 ? `${drafts} line${drafts === 1 ? '' : 's'} also on a draft order, not counted` : 'Issued orders less receipts against them'} />
        <Kpi value={money(net.netTotal)} label="Net to buy" sub={`${net.toBuy.length} line${net.toBuy.length === 1 ? '' : 's'}, case-rounded on the net`} />
      </div>
      {net.lines.length === 0 ? <p className="muse-kpi-sub">Nothing to make, nothing to buy.</p> : (
        <div className="muse-scroll-x">
          <table className="muse-table">
            <thead><tr><th>Ingredient</th><th className="num">Gross</th><th className="num">On hand</th><th className="num">On order</th><th className="num">Net</th><th className="num">Pack</th><th className="num">Cases</th><th className="num">Extended</th><th>Need by</th></tr></thead>
            <tbody>
              {net.lines.map((l) => (
                <tr key={`${l.ingredient}|${l.unit}`}>
                  <td>{l.ingredient}</td>
                  <td className="num">{num(l.gross, 2)} {l.unit}</td>
                  <td className="num">{num(l.onHandApplied, 2)}{l.onHand > l.onHandApplied + 1e-9 ? <div className="muse-c-faint muse-fs-2xs">of {num(l.onHand, 2)}</div> : null}</td>
                  <td className="num">{num(l.onOrderApplied, 2)}{l.onOrder > l.onOrderApplied + 1e-9 ? <div className="muse-c-faint muse-fs-2xs">{num(l.onOrder - l.onOrderApplied, 2)} arrives later</div> : null}</td>
                  <td className="num">{num(l.net, 2)}</td>
                  <td className="num">{l.packSize}</td>
                  <td className="num">{l.casesToOrder}</td>
                  <td className="num">{money(l.extendedCost)}</td>
                  <td className="muse-fs-xs">{l.needBy ?? '—'}</td>
                </tr>
              ))}
              <tr className="total"><td colSpan={7}>Net, case-rounded</td><td className="num">{money(net.netTotal)}</td><td /></tr>
            </tbody>
          </table>
        </div>
      )}
      {Object.keys(stock.unmatchedIssues).length > 0 && (
        <p className="muse-kpi-sub mt-2 muse-c-placeholder">
          Issues on closed batches with no receipt to draw from: {Object.entries(stock.unmatchedIssues).map(([k, v]) => `${num(v, 1)} ${k}`).join(', ')}. Stock is not assumed for them.
        </p>
      )}
      <p className="muse-kpi-sub mt-2">
        Stock on hand is receipts less issues on closed batch records, oldest lot first, as of the production morning. On order is issued purchase orders less the receipts booked against them, applied only where the order&rsquo;s production date is on or before the day. The net is what is bought; the generator below reads it by supplier, with the catalog lead time giving each line an order-by date.
      </p>
    </Card>
  );
}
