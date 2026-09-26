'use client';

import { PageControls } from '../_components/PageControls';
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, Kpi, CheckPill, StatusBadge, money, num, pct } from '../_components/ui';
import { CropPlanSelector, useSelectedCropPlan } from '../_components/CropPlanSelector';
import { CropPlanEditor } from '../_components/CropPlanEditor';
import { PurchaseOrderGenerator } from '../_components/PurchaseOrderGenerator';
import { SowingCloseForm } from '../_components/SowingCloseForm';
import { StaffingPanel } from '../_components/StaffingPanel';
import { useScenario } from '../_state/scenario-store';
import { useOperationsWorld } from '../_state/ledger';
import { WorldNote } from '../_components/ledger/WorldNote';
import { LABOR_BASIS_LABELS } from '../_engine/unit-cost';
import { clock } from '../_data/crews';
import { WEEKDAY_LABELS, type SubscriptionCycleDef, type OrderDef } from '../_data/subscription-cycles';
import { CROP_PLAN_STATUS_LABELS } from '../_data/plan-data';
import { orderBook, isoAddDays, weekdayOf } from '../_engine/orders';
import {
  requirementsFor,
  finishedGoodsOnHand,
  planProductionDay,
  planHorizon,
  productionDateFor,
  singleCropPlanRun,
  toRequirementLines,
  distributedConsumption,
} from '../_engine/production-plan';
import { standardSowingRecordPrefill, type SowingRecordDoc, type ReceiptDoc } from '../_engine/actuals';
import { rawStockOnHand, openOrders, netRequirements, netToRequirementLines, type PoLike, type NetRequirements } from '../_engine/net-requirements';
import type { DateRange } from '../_engine/periods';
import { standardInForce, standardLabel, type StandardVersionDoc } from '../_engine/standards';
import { CHANNEL_COMMISSION_PHASE3 } from '../_engine/phase';

type Level = 'run' | 'day' | 'horizon';
const LEVELS: { id: Level; label: string }[] = [
  { id: 'run', label: '1 · Single crop plan run' },
  { id: 'day', label: '2 · Distribution day' },
  { id: 'horizon', label: '3 · Horizon' },
];
const SERVICE_WEEKDAYS = [1, 2, 3, 4, 5];
const dateLabel = (d: string) => `${WEEKDAY_LABELS[weekdayOf(d)]} ${d}`;
const nextServiceDay = (d: string) => {
  let x = isoAddDays(d, 1);
  for (let i = 0; i < 7 && !SERVICE_WEEKDAYS.includes(weekdayOf(x)); i++) x = isoAddDays(x, 1);
  return x;
};

interface SowingRow { sowingId: string; cropPlanCode: string; productionDate: string; goodUnits: number; closedBy: string | null }

export function ProductionPlanningClient({
  canEdit,
  canRecord,
  showFinancials,
  closures,
  cycles,
  orders: recordedOrders,
  sowings: recordedSowings,
  distributions: recordedDistributions,
  receipts: recordedReceipts,
  rawSowings: recordedRawSowings,
  standards,
  purchaseOrders: recordedPurchaseOrders,
  today,
}: {
  canEdit: boolean;
  /** Operators close sowing records; editing the plan stays with super admins. */
  canRecord: boolean;
  /** Run economics and the channel allocation are admin-only (Roadmap O5). */
  showFinancials: boolean;
  /** Farm closures (Roadmap J1): no production and no derived order on those dates. */
  closures: DateRange[];
  cycles: SubscriptionCycleDef[];
  orders: OrderDef[];
  sowings: SowingRow[];
  distributions: { id: string; distributedOn: string; units: number }[];
  receipts: ReceiptDoc[];
  /** The full sowing records, for the raw issues they carry. */
  rawSowings: SowingRecordDoc[];
  /** Approved standard-cost versions (Roadmap J5); the close prefills from the one in force on the production date. */
  standards: StandardVersionDoc[];
  purchaseOrders: PoLike[];
  today: string;
}) {
  const { resolved, library } = useScenario();
  // Plan runs the open forecast's own world; Actual the real farm (Roadmap N6 slice 3).
  const world = useOperationsWorld({ orders: recordedOrders, sowings: recordedSowings, distributions: recordedDistributions, receipts: recordedReceipts, rawSowings: recordedRawSowings, purchaseOrders: recordedPurchaseOrders });
  const { orders, sowings, distributions, receipts, rawSowings, purchaseOrders } = world;
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
  const shelfLife = A.inventory.blackoutShelfLife.value;
  const shrink = A.yield.shrinkAllowance.value;
  const channels = useMemo(() => resolved.phases.map((p) => ({ phase: p.phase, market: p.market, pricePerUnit: p.pricePerUnit, priceCents: Math.round(p.pricePerUnit * 100), unitsPerDay: p.unitsPerDay })), [resolved.phases]);
  const pfByChannel = useMemo(() => Object.fromEntries(resolved.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>, [resolved.phaseProfiles]);
  const premiumByChannel = useMemo(() => Object.fromEntries(resolved.phaseProfiles.map((p) => [p.phase, p.premiumFactor.value])) as Record<number, number>, [resolved.phaseProfiles]);
  const cropPlanNames = useMemo(() => Object.fromEntries(resolved.cropPlans.map((r) => [r.code, r.name])), [resolved.cropPlans]);
  const channelPriceCents = useMemo(() => Object.fromEntries(channels.map((c) => [c.phase, c.priceCents])) as Record<number, number>, [channels]);
  const channelLabel = (ch: number) => channels.find((c) => c.phase === ch)?.market ?? `Channel ${ch}`;
  const bookFor = useCallback(
    (from: string, to: string) => orderBook({ pickupPoints: world.pickupPoints, subscribers: resolved.subscribers, cycles, orders, from, to, channelPriceCents, cropPlanNames, closures }),
    [world.pickupPoints, resolved.subscribers, cycles, orders, channelPriceCents, cropPlanNames, closures],
  );
  const consumption = useMemo(() => distributedConsumption(orders, distributions, resolved.cropPlans, pfByChannel), [orders, distributions, resolved.cropPlans, pfByChannel]);
  const sowingCountByDate = useMemo(() => sowings.reduce<Record<string, number>>((m, b) => { m[b.productionDate] = (m[b.productionDate] ?? 0) + 1; return m; }, {}), [sowings]);

  // ── Level 1: single crop plan run ────────────────────────────────────────────
  const { cropPlan: runCropPlan } = useSelectedCropPlan();
  const [runChannel, setRunChannel] = useState<number>(() => runCropPlan.channels[0] ?? 1);
  const [runUnits, setRunUnits] = useState<number>(() => Math.round(channels.find((c) => c.phase === (runCropPlan.channels[0] ?? 1))?.unitsPerDay ?? 0));
  const [runPrice, setRunPrice] = useState<number | ''>('');
  const [runOpening, setRunOpening] = useState(0);
  const [editor, setEditor] = useState(false);
  const runChannelPrice = channels.find((c) => c.phase === runChannel)?.pricePerUnit ?? 0;
  const runOwnUnit = runCropPlan.channels.includes(runChannel);
  const run = useMemo(
    () =>
      singleCropPlanRun({
        cropPlan: runCropPlan,
        units: runUnits,
        unitFactor: runOwnUnit ? 1 : pfByChannel[runChannel] ?? 1,
        premiumFactor: runOwnUnit ? 1 : premiumByChannel[runChannel] ?? 1,
        pricePerUnit: runPrice === '' ? runChannelPrice : runPrice,
        commissionShare: runChannel === 3 ? CHANNEL_COMMISSION_PHASE3 : 0,
        openingInventory: runOpening,
        capacityInputs: resolved.capacityInputs,
        // The run is costed at its own crop plan's labor standard and packaging (Roadmap N3).
        assumptions: resolved.cropPlanAssumptions[runCropPlan.code] ?? A,
      }),
    [runCropPlan, runUnits, runChannel, runPrice, runOpening, runChannelPrice, runOwnUnit, pfByChannel, premiumByChannel, resolved.capacityInputs, resolved.cropPlanAssumptions, A],
  );
  const runRequirement = useMemo(() => toRequirementLines(run.purchase.lines), [run.purchase.lines]);

  // ── Level 2: distribution day ─────────────────────────────────────────────────
  const [dayDate, setDayDate] = useState(() => nextServiceDay(today));
  const productionDate = productionDateFor(dayDate, SERVICE_WEEKDAYS, closures);
  const dayBook = useMemo(() => bookFor(dayDate, dayDate), [bookFor, dayDate]);
  const requirements = useMemo(() => requirementsFor(dayBook, resolved.cropPlans, pfByChannel), [dayBook, resolved.cropPlans, pfByChannel]);
  const stock = useMemo(() => finishedGoodsOnHand({ sowings, consumed: consumption, shelfLifeDays: shelfLife, asOf: productionDate }), [sowings, consumption, shelfLife, productionDate]);
  const [onHandOverride, setOnHandOverride] = useState<Record<string, number>>({});
  const onHand = useMemo(() => {
    const m: Record<string, number> = { ...stock.byCropPlan };
    for (const [k, v] of Object.entries(onHandOverride)) m[k] = v;
    return m;
  }, [stock.byCropPlan, onHandOverride]);
  const day = useMemo(
    () => planProductionDay({ productionDate, requirements, onHand, cropPlans: resolved.cropPlans, capacityInputs: resolved.capacityInputs, assumptions: A, cropPlanAssumptions: resolved.cropPlanAssumptions, crews: resolved.crews }),
    [productionDate, requirements, onHand, resolved.cropPlans, resolved.capacityInputs, A, resolved.cropPlanAssumptions, resolved.crews],
  );
  const [closing, setClosing] = useState<{ seq: number; cropPlanCode: string; units: number } | null>(null);
  const closingCropPlan = closing ? resolved.cropPlans.find((r) => r.code === closing.cropPlanCode) : undefined;
  const closingPrefill = useMemo(() => {
    if (!closing || !closingCropPlan) return null;
    const std = standardInForce(standards, closing.cropPlanCode, productionDate);
    return standardSowingRecordPrefill(
      productionDate,
      (sowingCountByDate[productionDate] ?? 0) + 1,
      closing.units,
      std?.snapshot.cropPlan ?? closingCropPlan,
      std ? std.snapshot.assumptions.yield.shrinkAllowance.value : shrink,
      std ? standardLabel(std) : undefined,
    );
  }, [closing, closingCropPlan, productionDate, sowingCountByDate, shrink, standards]);
  const recordedToday = useMemo(() => sowings.filter((b) => b.productionDate === productionDate), [sowings, productionDate]);
  // Raw stock on the production morning and what is on order: the net requirement is what is bought.
  const onOrder = useMemo(() => openOrders({ purchaseOrders, receipts }), [purchaseOrders, receipts]);
  const dayStock = useMemo(() => rawStockOnHand({ receipts, sowings: rawSowings, asOf: productionDate }), [receipts, rawSowings, productionDate]);
  const dayNet = useMemo(() => netRequirements({ days: [{ productionDate, lines: day.purchase.lines }], stock: dayStock, onOrder }), [productionDate, day.purchase.lines, dayStock, onOrder]);
  const dayUnits = dayBook.reduce((s, o) => s + o.units, 0);
  const dayByChannel = channels.map((c) => ({ ...c, units: dayBook.filter((o) => o.channel === c.phase).reduce((s, o) => s + o.units, 0) }));

  // ── Level 3: horizon ──────────────────────────────────────────────────────
  const [hFrom, setHFrom] = useState(today);
  const [hTo, setHTo] = useState(isoAddDays(today, 27));
  const hBook = useMemo(() => bookFor(hFrom, hTo), [bookFor, hFrom, hTo]);
  const openingLots = useMemo(() => finishedGoodsOnHand({ sowings, consumed: consumption, shelfLifeDays: shelfLife, asOf: hFrom }).lots.filter((l) => l.remaining > 0), [sowings, consumption, shelfLife, hFrom]);
  const horizon = useMemo(
    () =>
      planHorizon({
        closures,
        crews: resolved.crews,
        from: hFrom,
        to: hTo,
        book: hBook,
        cropPlans: resolved.cropPlans,
        capacityInputs: resolved.capacityInputs,
        assumptions: A,
        cropPlanAssumptions: resolved.cropPlanAssumptions,
        unitFactorByChannel: pfByChannel,
        openingLots,
        shelfLifeDays: shelfLife,
        productionWeekdays: SERVICE_WEEKDAYS,
        channels: channels.map((c) => c.phase),
      }),
    [closures, hFrom, hTo, hBook, resolved.cropPlans, resolved.capacityInputs, A, pfByChannel, openingLots, shelfLife, channels, resolved.crews],
  );
  const hStock = useMemo(() => rawStockOnHand({ receipts, sowings: rawSowings, asOf: hFrom }), [receipts, rawSowings, hFrom]);
  const hNet = useMemo(
    () => netRequirements({ days: horizon.productionDays.map((p) => ({ productionDate: p.productionDate, lines: p.purchase.lines })), stock: hStock, onOrder }),
    [horizon.productionDays, hStock, onOrder],
  );
  const needByOf = (n: NetRequirements) => Object.fromEntries(n.lines.filter((l) => l.needBy).map((l) => [l.input, l.needBy as string]));

  return (
    <>
      <WorldNote isPlan={world.isPlan} />
      <PageControls group="view">
        {LEVELS.map((l) => (
          <button key={l.id} type="button" className={`farm-btn${level === l.id ? ' primary' : ' ghost'}`} aria-pressed={level === l.id} onClick={() => setLevel(l.id)}>{l.label}</button>
        ))}
      </PageControls>

      {level === 'run' && (
        <>
          <Card title="The run — a crop plan, a quantity, a channel">
            <PageControls><CropPlanSelector /></PageControls>
            <div className="flex flex-wrap gap-3 items-end">
              <span className="farm-kpi-sub">{CROP_PLAN_STATUS_LABELS[runCropPlan.status]}{runCropPlan.channels.length ? ` · authored for ${runCropPlan.channels.map((c) => channelLabel(c)).join(', ')}` : ' · listed on no channel'}</span>
              {canEdit && <button type="button" className="farm-btn" onClick={() => setEditor((e) => !e)}>{editor ? 'Close editor' : 'Add New Crop plan'}</button>}
              <label className="farm-kpi-sub">Units<br /><input className="farm-input w-28!" type="number" min={0} step={1} value={runUnits} onChange={(e) => setRunUnits(Math.max(0, Number(e.target.value) || 0))} /></label>
              <label className="farm-kpi-sub">Channel<br />
                <select className="farm-select" value={runChannel} onChange={(e) => { const ch = Number(e.target.value); setRunChannel(ch); setRunPrice(''); }}>
                  {channels.map((c) => <option key={c.phase} value={c.phase}>{channelLabel(c.phase)}{runCropPlan.channels.includes(c.phase) ? '' : ' · not listed'}</option>)}
                </select>
              </label>
              <label className="farm-kpi-sub">Price / unit $ (blank = channel {money(runChannelPrice)})<br /><input className="farm-input w-28!" type="number" min={0} step={0.01} value={runPrice} onChange={(e) => setRunPrice(e.target.value === '' ? '' : Number(e.target.value))} /></label>
              <label className="farm-kpi-sub">Opening finished inventory (base units)<br /><input className="farm-input w-28!" type="number" min={0} step={25} value={runOpening} onChange={(e) => setRunOpening(Math.max(0, Number(e.target.value) || 0))} /></label>
            </div>
            <p className="farm-kpi-sub mt-2">
              A cropPlan saved from the editor is a library cropPlan from that moment and runs here at once.{' '}
              {runOwnUnit
                ? `${runCropPlan.code} is authored for ${channelLabel(runChannel)} and runs at its own unit${runCropPlan.spec.upgradeMultiplier ? ` (protein and vegetable lines × ${runCropPlan.spec.upgradeMultiplier.value} over the student cropPlan, ${runCropPlan.spec.upgradeMultiplier.status.toLowerCase()})` : ''}.`
                : `${runCropPlan.code} is not authored for ${channelLabel(runChannel)}, so the channel's ${pfByChannel[runChannel] ?? 1}× unit factor and ${premiumByChannel[runChannel] ?? 1}× input premium (Unit Economics) apply.`}
            </p>
            {editor && <div className="mt-3"><CropPlanEditor mode="create" library={library} channels={channels.map((c) => ({ phase: c.phase, market: c.market }))} onDone={() => setEditor(false)} /></div>}
          </Card>

          <div className="grid gap-3 mt-4 farm-autofit-11">
            <Kpi value={num(run.sowings)} label="Sowings (whole only)" sub={`${num(run.produced)} base units for ${num(run.baseUnits)} needed`} />
            <Kpi value={num(run.cap.sowingSize)} label="Sowing size (derived)" sub={`${run.cap.canopyMassPerUnit.toFixed(3)} lb blackout / unit`} />
            <Kpi value={<span>{num(run.cyclesRequired)} of {num(run.cyclesAvailable)} <CheckPill ok={run.fits} okLabel="fits" overLabel="over" /></span>} label="Blackout rack cycles" sub="One sowing is one cycle by construction" />
            <Kpi value={`${num(Math.round(run.blackoutLb))} lb`} label="Canopy mass for the run" sub={`${num(Math.round(run.harvestedLb))} lb harvested · hot components only enter the rack`} />
            <Kpi value={money(run.inputCostPerUnit)} label="Input cost / unit" sub={`${money(run.laborPerUnit)} run labor / unit (time study)`} />
            {showFinancials && <Kpi value={money(run.contributionPerUnit)} label="Contribution / unit" sub="Before fixed overhead" />}
          </div>

          <div className="grid gap-4 mt-4 farm-autofit-20">
            <Card title="The run in pounds — four weights, one production">
              <table className="farm-table">
                <thead><tr><th>Stage</th><th className="num">Pounds</th><th className="num">Oz / unit</th></tr></thead>
                <tbody>
                  <tr><td>As purchased</td><td className="num">{num(Math.round(run.purchasedLb))}</td><td className="num">{((run.purchasedLb * 16) / Math.max(1, run.produced)).toFixed(2)}</td></tr>
                  <tr><td>Harvested</td><td className="num">{num(Math.round(run.harvestedLb))}</td><td className="num">{((run.harvestedLb * 16) / Math.max(1, run.produced)).toFixed(2)}</td></tr>
                  <tr><td>Blackouted (hot components)</td><td className="num">{num(Math.round(run.blackoutLb))}</td><td className="num">{((run.blackoutLb * 16) / Math.max(1, run.produced)).toFixed(2)}</td></tr>
                  <tr className="total"><td>Packed, at {money(run.costPerPackedOz, 4)} per packed oz</td><td className="num">{num(Math.round(run.packedLb))}</td><td className="num">{((run.packedLb * 16) / Math.max(1, run.produced)).toFixed(2)}</td></tr>
                </tbody>
              </table>
              <table className="farm-table mt-3">
                <tbody>
                  <tr><td>Purchase order, case-rounded, incl. the {(shrink * 100).toFixed(0)}% normal-spoilage allowance</td><td className="num">{money(run.purchase.total)}</td></tr>
                  <tr><td>CropPlan standard for {num(run.produced)} units, incl. the same allowance</td><td className="num">{money(run.inputCostStandard)}</td></tr>
                  <tr className="total"><td>Difference held in raw materials (case rounding, not a price variance)</td><td className="num">{money(run.carriedForward)}</td></tr>
                  <tr><td>Closing finished inventory after the {num(run.units)} units ship</td><td className="num">{num(run.closing)} base units</td></tr>
                </tbody>
              </table>
            </Card>

            {showFinancials && (
            <Card title={`Economics of ${num(run.units)} units on ${channelLabel(runChannel)}`}>
              <table className="farm-table">
                <tbody>
                  <tr><td>Revenue at {money(runPrice === '' ? runChannelPrice : runPrice)}</td><td className="num">{money(run.revenue)}</td></tr>
                  <tr><td>Input cost sold ({money(run.inputCostPerUnit)} / unit)</td><td className="num">({money(run.inputCostSold)})</td></tr>
                  <tr><td>Direct labor for the run — {run.laborHours.toFixed(1)} h at {money(A.labor.blendedLoadedWage.value)}/h (time study, fixed + variable)</td><td className="num">({money(run.laborCost)})</td></tr>
                  <tr><td>Packaging ({money(run.packagingPerUnit)} / unit)</td><td className="num">({money(run.packaging)})</td></tr>
                  <tr><td>Distribution ({money(run.distributionPerUnit)} / unit)</td><td className="num">({money(run.distribution)})</td></tr>
                  {run.commission > 0 && <tr><td>Marketplace commission ({pct(CHANNEL_COMMISSION_PHASE3, 0)} of price)</td><td className="num">({money(run.commission)})</td></tr>}
                  <tr className="total"><td>Contribution before fixed overhead</td><td className="num">{money(run.contribution)}</td></tr>
                  <tr><td>Per unit</td><td className="num">{money(run.contributionPerUnit)}</td></tr>
                </tbody>
              </table>
              <p className="farm-kpi-sub mt-2">
                Labor here is the run&rsquo;s own hours on {runCropPlan.code}&rsquo;s own labor standard ({LABOR_BASIS_LABELS[resolved.laborStandards[runCropPlan.code]?.basis ?? 'none'].toLowerCase()}) — {num(run.sowings)} × {num(resolved.laborStandards[runCropPlan.code]?.fixedMinutesPerSowing ?? 0, 0)} fixed minutes plus {num(run.produced)} × {(resolved.laborStandards[runCropPlan.code]?.variableMinutesPerUnit ?? 0).toFixed(3)} variable minutes — priced at the loaded wage. The cost of a unit on Unit Economics and on CropPlans uses the same standard at one full sowing. Fixed overhead is on <Link className="farm-link" href="/farm/financials/unit-economics">Unit Economics</Link>.
              </p>
            </Card>
            )}
          </div>

          <PurchaseOrderGenerator canEdit={canEdit && world.recording} requirement={runRequirement} unitsProduced={run.produced} title={`Purchase orders — ${runCropPlan.code}, ${num(run.produced)} units`} />
        </>
      )}

      {level === 'day' && (
        <>
          <Card title="Distribution day">
            <PageControls><label className="farm-kpi-sub inline-flex items-center gap-2">Distribution date<input className="farm-input" type="date" value={dayDate} onChange={(e) => { if (e.target.value) { setDayDate(e.target.value); setClosing(null); setOnHandOverride({}); } }} /></label></PageControls>
            <div className="flex flex-wrap gap-3 items-end">
              <span className="farm-kpi-sub">Distributed {dateLabel(dayDate)} · produced <strong className="farm-c-ink">{dateLabel(productionDate)}</strong> · {num(Math.round(dayUnits))} units in {dayBook.length} order{dayBook.length === 1 ? '' : 's'}</span>
            </div>
            <p className="farm-kpi-sub mt-2">
              Nothing is served on the day it is harvested: the units distributed on this date are made on the last production weekday before it, blackouted and held. Orders come from <Link className="farm-link" href="/farm/orders">Orders</Link>: forecast orders from each subscriber&rsquo;s flat plan and its services&rsquo; units per service, plus the confirmed and typed orders on file. Units are exploded into base units — at the cropPlan&rsquo;s own unit when it is authored for the channel, else at the channel&rsquo;s unit factor — netted against finished goods on hand on the production morning, and sized into whole sowings per cropPlan.
            </p>
          </Card>

          <div className="grid gap-3 mt-4 farm-autofit-11">
            <Kpi value={num(Math.round(dayUnits))} label="Units ordered" sub={dayByChannel.filter((c) => c.units > 0).map((c) => `${num(Math.round(c.units))} ${c.market}`).join(' · ') || 'no orders on this date'} />
            <Kpi value={num(Math.round(day.totalRequired))} label="Base units required" sub={`${day.runs.length} crop plan${day.runs.length === 1 ? '' : 's'}`} />
            <Kpi value={<span>{num(day.cyclesRequired)} of {num(day.cyclesAvailable)} <CheckPill ok={day.fits} okLabel="fits" overLabel="does not fit" /></span>} label="Blackout rack cycles" sub={`${clock(day.blackoutWindow.startMin)}–${clock(day.blackoutWindow.endMin)} window ÷ ${day.blackoutWindow.occupancyMinutes} min occupancy`} />
            <Kpi value={num(day.runs.reduce((s, r) => s + r.sowingsScheduled, 0))} label="Sowings to run" sub={`${num(Math.round(day.totalProduced))} base units produced${day.totalShortfall > 0 ? ` · ${num(Math.round(day.totalShortfall))} short` : ''}`} />
            <Kpi value={`${num(Math.round(day.blackoutLb))} lb`} label="Canopy mass" sub={`${num(Math.round(day.blackoutCeilingLb))} lb the racks take in the day`} />
            <Kpi value={`${day.laborHours.toFixed(1)} h`} label="Direct labor" sub={`${money(day.laborCost)} at the loaded wage`} />
          </div>

          <Card title={`Production requirements — ${dateLabel(productionDate)}`} className="mt-4">
            {day.runs.length === 0 && <p className="farm-kpi-sub">No orders on {dateLabel(dayDate)}. A service with units per service and a flat plan on Subscribers put forecast orders here.</p>}
            {day.runs.length > 0 && (
              <div className="farm-scroll-x">
                <table className="farm-table">
                  <thead>
                    <tr><th>Crop plan</th><th className="num">Units</th><th className="num">Required (base)</th><th className="num">On hand</th><th className="num">Net</th><th className="num">Sowing size</th><th className="num">Sowings</th><th className="num">Produced</th><th className="num">Closing</th><th className="num">Food at standard</th></tr>
                  </thead>
                  <tbody>
                    {day.runs.map((r) => {
                      const req = requirements.find((q) => q.cropPlanCode === r.cropPlanCode);
                      const overridden = onHandOverride[r.cropPlanCode] !== undefined;
                      return (
                        <tr key={r.cropPlanCode}>
                          <td>{r.cropPlanCode}<div className="farm-c-faint farm-fs-xs">{r.cropPlanName}</div></td>
                          <td className="num">{num(Math.round(req?.units ?? 0))}<div className="farm-c-faint farm-fs-2xs">{(req?.byChannel ?? []).map((c) => `${channelLabel(c.channel)} ${num(Math.round(c.units))}${c.unitFactor !== 1 ? ` × ${c.unitFactor}` : ''}`).join(' · ')}</div></td>
                          <td className="num">{num(Math.round(r.required))}</td>
                          <td className="num">
                            <input className="farm-num-input" type="number" min={0} step={1} value={Math.round(r.onHand)} onChange={(e) => setOnHandOverride((m) => ({ ...m, [r.cropPlanCode]: Math.max(0, Number(e.target.value) || 0) }))} aria-label={`${r.cropPlanCode} on hand`} />
                            <div className="farm-fs-2xs"><StatusBadge status={overridden ? 'STATED' : 'DERIVED'} title={overridden ? 'Typed for this view; not saved.' : `From ${stock.lots.filter((l) => l.cropPlanCode === r.cropPlanCode && l.remaining > 0 && l.expires >= productionDate).length} closed sowing record(s) inside shelf life, less distributed orders.`} />{overridden && <button type="button" className="farm-btn py-0! px-[0.3rem]! ml-[0.3rem]! farm-fs-2xs" onClick={() => setOnHandOverride((m) => { const n = { ...m }; delete n[r.cropPlanCode]; return n; })}>records</button>}</div>
                          </td>
                          <td className="num">{num(Math.round(r.net))}</td>
                          <td className="num">{num(r.sowingSize)}</td>
                          <td className="num">{num(r.sowingsScheduled)}{r.sowingsScheduled < r.sowingsNeeded ? <div className="farm-c-over farm-fs-2xs">{num(r.sowingsNeeded)} needed</div> : null}</td>
                          <td className="num">{num(Math.round(r.produced))}{r.shortfall > 0 ? <div className="farm-c-over farm-fs-2xs">{num(Math.round(r.shortfall))} short</div> : null}</td>
                          <td className="num">{num(Math.round(r.closing))}</td>
                          <td className="num">{money(r.inputCostStandard)}</td>
                        </tr>
                      );
                    })}
                    <tr className="total"><td>All crop plans</td><td className="num">{num(Math.round(dayUnits))}</td><td className="num">{num(Math.round(day.totalRequired))}</td><td className="num">—</td><td className="num">{num(Math.round(day.runs.reduce((s, r) => s + r.net, 0)))}</td><td className="num">—</td><td className="num">{num(day.runs.reduce((s, r) => s + r.sowingsScheduled, 0))}</td><td className="num">{num(Math.round(day.totalProduced))}</td><td className="num">{num(Math.round(day.runs.reduce((s, r) => s + r.closing, 0)))}</td><td className="num">{money(day.inputCostStandard)}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
            {Object.keys(stock.expiredByCropPlan).length > 0 && (
              <p className="farm-kpi-sub mt-2 farm-c-placeholder">
                Past shelf life on {productionDate}, unconsumed: {Object.entries(stock.expiredByCropPlan).map(([k, v]) => `${num(Math.round(v))} ${k}`).join(', ')}. Not counted as on hand.
              </p>
            )}
            <p className="farm-kpi-sub mt-2">
              On hand is what the closed sowing records say is inside the {shelfLife}-day shelf life on the production morning, less what distributed orders drew, oldest lot first. No record, no stock: the platform does not assume inventory it has not seen. Overshoot on whole sowings is the closing stock; the horizon carries it to the next distribution date.
            </p>
          </Card>

          <Card title="The blackout rack, in order" className="mt-4">
            {day.schedule.length === 0 ? <p className="farm-kpi-sub">Nothing to blackout.</p> : (
              <div className="farm-scroll-x">
                <table className="farm-table">
                  <thead><tr><th className="num">#</th><th>Crop plan</th><th className="num">Units</th><th className="num">Load</th><th className="num">Unload</th><th className="num">Rack free</th><th>Fits</th><th /></tr></thead>
                  <tbody>
                    {day.schedule.map((b) => (
                      <tr key={b.seq}>
                        <td className="num">{b.seq}</td>
                        <td>{b.cropPlanCode}<div className="farm-c-faint farm-fs-xs">{b.cropPlanName}</div></td>
                        <td className="num">{num(b.units)}</td>
                        <td className="num">{clock(b.loadMin)}</td>
                        <td className="num">{clock(b.unloadMin)}</td>
                        <td className="num">{clock(b.freeMin)}</td>
                        <td><CheckPill ok={b.fits} okLabel="in the window" overLabel="past the window" /></td>
                        <td className="num">{canRecordHere && b.fits && <button type="button" className="farm-btn py-[0.1rem]! px-2!" onClick={() => setClosing({ seq: b.seq, cropPlanCode: b.cropPlanCode, units: b.units })}>Close sowing record</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="farm-kpi-sub mt-2">
              Sowings are placed one cycle apart from the first load, largest requirement first; each takes the rack for {day.blackoutWindow.occupancyMinutes} minutes (load, blackout, unload). A sowing past the window is not made that day — it is the named shortfall above, not a plan that slips to 14:00.
            </p>
          </Card>

          <Card title={`Labor the day requires, and the proposed crews checked against it — ${dateLabel(productionDate)}`} className="mt-4">
            <StaffingPanel labor={day.labor} staffing={day.staffing} crews={resolved.crews} />
            <p className="farm-kpi-sub mt-2">
              The requirement comes off the sowings placed on the blackoutRack above. Crews are proposed on <Link className="farm-link" href="/farm/capacity">Capacity</Link>; a gap is a finding here and never takes a cycle away from the day.
            </p>
          </Card>

          {closing && closingPrefill && world.recording && (
            <div className="mt-4">
              <SowingCloseForm prefill={closingPrefill} sowingCountByDate={sowingCountByDate} standardSowingSize={closing.units} cropPlanName={closingCropPlan?.name} rawLots={dayStock.lots} onDone={() => setClosing(null)} onCancel={() => setClosing(null)} />
            </div>
          )}

          {recordedToday.length > 0 && (
            <Card title={`Sowing records closed for ${dateLabel(productionDate)}`} className="mt-4">
              <table className="farm-table"><tbody>
                {recordedToday.map((b) => <tr key={b.sowingId}><td>{b.sowingId}<div className="farm-c-faint farm-fs-2xs">{b.cropPlanCode} · {b.closedBy ?? 'unsigned'}</div></td><td className="num">{num(Math.round(b.goodUnits))} good units</td></tr>)}
              </tbody></table>
              <p className="farm-kpi-sub mt-2">Listed with the period on <Link className="farm-link" href="/farm/actuals">Actuals</Link>, where the ledger posts from them.</p>
            </Card>
          )}

          <NetCard title="Purchase requirement — the net, one order across crop plans" net={dayNet} stock={dayStock} gross={day.purchase.total} shrink={shrink} runs={day.runs.filter((r) => r.produced > 0).length} onOrderDrafts={onOrder.draftsByInput} />
          <PurchaseOrderGenerator canEdit={canEdit && world.recording} requirement={netToRequirementLines(dayNet)} unitsProduced={day.totalProduced} defaultDate={productionDate} title={`Purchase orders by supplier — ${dateLabel(productionDate)}`} needBy={needByOf(dayNet)} today={today} summary={`${money(dayNet.netTotal)} net to buy for ${num(Math.round(day.totalProduced))} units`} />
        </>
      )}

      {level === 'horizon' && (
        <>
          <Card title="Horizon">
            <PageControls>
              <label className="farm-kpi-sub inline-flex items-center gap-2">From<input className="farm-input" type="date" value={hFrom} onChange={(e) => e.target.value && setHFrom(e.target.value)} /></label>
              <label className="farm-kpi-sub inline-flex items-center gap-2">To<input className="farm-input" type="date" value={hTo} onChange={(e) => e.target.value && setHTo(e.target.value)} /></label>
            </PageControls>
            <div className="flex flex-wrap gap-3 items-end">
              <span className="farm-kpi-sub">{horizon.distributionDays.length} distribution date{horizon.distributionDays.length === 1 ? '' : 's'} · {horizon.productionDays.length} production day{horizon.productionDays.length === 1 ? '' : 's'} · opening stock {num(Math.round(openingLots.reduce((s, l) => s + l.remaining, 0)))} base units from records</span>
            </div>
            <p className="farm-kpi-sub mt-2">
              The order book for the period, rolled through production: each production weekday makes the next distribution date&rsquo;s orders net of stock, whole sowings overshoot into stock inside the {shelfLife}-day shelf life, and a distribution date draws its orders from stock oldest first. What the racks cannot make is an unfilled order, shared equally across the channels on that cropPlan — the same rule as equal distribution on the annual allocation.
            </p>
          </Card>

          <div className="grid gap-3 mt-4 farm-autofit-11">
            <Kpi value={num(Math.round(horizon.totals.orderedUnits))} label="Units ordered" sub={`${num(Math.round(horizon.totals.orderedBase))} base units`} />
            <Kpi value={num(Math.round(horizon.totals.filledUnits))} label="Units filled" sub={horizon.totals.orderedUnits > 0 ? `${pct(horizon.totals.filledUnits / horizon.totals.orderedUnits)} of ordered` : '—'} />
            <Kpi value={num(horizon.totals.sowings)} label="Sowings" sub={`${num(Math.round(horizon.totals.producedBase))} base units produced`} />
            <Kpi value={pct(horizon.totals.utilisation)} label="Blackout rack cycles used" sub={`${num(horizon.totals.cyclesUsed)} of ${num(horizon.totals.cyclesAvailable)} on production days`} />
            <Kpi value={<CheckPill ok={horizon.totals.daysThatDoNotFit === 0} okLabel="every day fits" overLabel={`${horizon.totals.daysThatDoNotFit} day${horizon.totals.daysThatDoNotFit === 1 ? '' : 's'} over`} />} label="Capacity" sub="Sowings against the plant's cycles" />
            <Kpi value={num(Math.round(horizon.totals.expiredBase))} label="Expired past shelf life" sub={`${num(Math.round(horizon.totals.closingStockBase))} base units in stock at the end`} />
          </div>

          {showFinancials && (
            <>
          <Card title="By channel — ordered against filled over the horizon" className="mt-4">
            <div className="farm-scroll-x">
              <table className="farm-table">
                <thead><tr><th>Channel</th><th className="num">Units ordered</th><th className="num">Units filled</th><th className="num">Share filled</th></tr></thead>
                <tbody>
                  {horizon.byChannel.map((c) => (
                    <tr key={c.channel}>
                      <td>{channelLabel(c.channel)}</td>
                      <td className="num">{num(Math.round(c.orderedUnits))}</td>
                      <td className="num">{num(Math.round(c.filledUnits))}</td>
                      <td className="num">{pct(c.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="farm-kpi-sub mt-2">
              What the order book asked for and what the lines in service could make over these dates. The same run over the forecast&rsquo;s horizon is the <Link className="farm-link" href="/farm/financials/pnl">Plan ledger</Link>.
            </p>
          </Card>
            </>
          )}

          <div className="grid gap-4 mt-4 farm-autofit-22">
            <Card title="Production days">
              {horizon.productionDays.length === 0 ? <p className="farm-kpi-sub">No orders in the period.</p> : (
                <div className="farm-scroll-x">
                  <table className="farm-table">
                    <thead><tr><th>Made on</th><th>For</th><th>Sowings by crop plan</th><th className="num">Cycles</th><th>Fits</th></tr></thead>
                    <tbody>
                      {horizon.productionDays.map((p) => (
                        <tr key={p.productionDate}>
                          <td>{dateLabel(p.productionDate)}</td>
                          <td className="farm-fs-xs">{p.distributionDates.map((d) => dateLabel(d)).join(', ')}</td>
                          <td className="farm-fs-xs">{p.runs.filter((r) => r.sowingsNeeded > 0).map((r) => `${r.cropPlanCode} × ${r.sowingsScheduled}${r.sowingsScheduled < r.sowingsNeeded ? ` of ${r.sowingsNeeded}` : ''}`).join(' · ') || 'stock covers it'}</td>
                          <td className="num">{num(p.runs.reduce((s, r) => s + r.sowingsScheduled, 0))} / {num(p.cyclesAvailable)}</td>
                          <td><CheckPill ok={p.fits} okLabel="fits" overLabel="over" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card title="Distribution days">
              {horizon.distributionDays.length === 0 ? <p className="farm-kpi-sub">No orders in the period.</p> : (
                <div className="farm-scroll-x">
                  <table className="farm-table">
                    <thead><tr><th>Date</th><th className="num">Units ordered</th><th className="num">Base ordered</th><th className="num">Filled</th><th className="num">Unfilled</th></tr></thead>
                    <tbody>
                      {horizon.distributionDays.map((d) => (
                        <tr key={d.date}>
                          <td>{dateLabel(d.date)}</td>
                          <td className="num">{num(Math.round(d.orderedUnits))}</td>
                          <td className="num">{num(Math.round(d.orderedBase))}</td>
                          <td className="num">{num(Math.round(d.filledBase))}</td>
                          <td className="num">{d.unfilledBase > 0.5 ? <span className="farm-c-over">{num(Math.round(d.unfilledBase))}</span> : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <NetCard title={`Purchase requirement — the net over the horizon, ${horizon.productionDays.length} production day${horizon.productionDays.length === 1 ? '' : 's'}`} net={hNet} stock={hStock} gross={horizon.productionDays.reduce((s, p) => s + p.purchase.total, 0)} shrink={shrink} runs={horizon.productionDays.reduce((s, p) => s + p.runs.filter((r) => r.produced > 0).length, 0)} onOrderDrafts={onOrder.draftsByInput} />
          <PurchaseOrderGenerator canEdit={canEdit && world.recording} requirement={netToRequirementLines(hNet)} unitsProduced={horizon.totals.producedBase} defaultDate={hNet.toBuy.map((l) => l.needBy).filter((d): d is string => Boolean(d)).sort()[0] ?? hFrom} title="Purchase orders by supplier — the horizon" needBy={needByOf(hNet)} today={today} summary={`${money(hNet.netTotal)} net to buy for ${num(Math.round(horizon.totals.producedBase))} base units`} />

          {horizon.byCropPlan.length > 0 && (
            <Card title="By crop plan over the horizon" className="mt-4">
              <div className="farm-scroll-x">
                <table className="farm-table">
                  <thead><tr><th>Crop plan</th><th className="num">Base ordered</th><th className="num">Produced</th><th className="num">Sowings</th></tr></thead>
                  <tbody>
                    {horizon.byCropPlan.map((r) => <tr key={r.cropPlanCode}><td>{r.cropPlanCode}<div className="farm-c-faint farm-fs-xs">{r.cropPlanName}</div></td><td className="num">{num(Math.round(r.orderedBase))}</td><td className="num">{num(Math.round(r.producedBase))}</td><td className="num">{num(r.sowings)}</td></tr>)}
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
  const stockValue = Object.values(stock.byInput).reduce((s, l) => s + l.valueCents, 0) / 100;
  const drafts = net.lines.filter((l) => (onOrderDrafts[l.input] ?? 0) > 0).length;
  return (
    <Card title={title} className="mt-4">
      <div className="grid gap-3 farm-autofit-11 mb-3!">
        <Kpi value={money(gross)} label="Gross at the crop plan standard" sub={`Case-rounded, incl. the ${(shrink * 100).toFixed(0)}% allowance, ${runs} crop plan run${runs === 1 ? '' : 's'}`} />
        <Kpi value={money(net.lines.reduce((s, l) => s + l.onHandApplied * l.seedUnitCost, 0))} label="Covered by stock on hand" sub={`${Object.keys(stock.byInput).length} input${Object.keys(stock.byInput).length === 1 ? '' : 's'} on hand from receipts, ${money(stockValue)} at invoice`} />
        <Kpi value={money(net.lines.reduce((s, l) => s + l.onOrderApplied * l.seedUnitCost, 0))} label="Covered by orders arriving in time" sub={drafts > 0 ? `${drafts} line${drafts === 1 ? '' : 's'} also on a draft order, not counted` : 'Issued orders less receipts against them'} />
        <Kpi value={money(net.netTotal)} label="Net to buy" sub={`${net.toBuy.length} line${net.toBuy.length === 1 ? '' : 's'}, case-rounded on the net`} />
      </div>
      {net.lines.length === 0 ? <p className="farm-kpi-sub">Nothing to make, nothing to buy.</p> : (
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead><tr><th>Input</th><th className="num">Gross</th><th className="num">On hand</th><th className="num">On order</th><th className="num">Net</th><th className="num">Pack</th><th className="num">Cases</th><th className="num">Extended</th><th>Need by</th></tr></thead>
            <tbody>
              {net.lines.map((l) => (
                <tr key={`${l.input}|${l.unit}`}>
                  <td>{l.input}</td>
                  <td className="num">{num(l.gross, 2)} {l.unit}</td>
                  <td className="num">{num(l.onHandApplied, 2)}{l.onHand > l.onHandApplied + 1e-9 ? <div className="farm-c-faint farm-fs-2xs">of {num(l.onHand, 2)}</div> : null}</td>
                  <td className="num">{num(l.onOrderApplied, 2)}{l.onOrder > l.onOrderApplied + 1e-9 ? <div className="farm-c-faint farm-fs-2xs">{num(l.onOrder - l.onOrderApplied, 2)} arrives later</div> : null}</td>
                  <td className="num">{num(l.net, 2)}</td>
                  <td className="num">{l.packSize}</td>
                  <td className="num">{l.casesToOrder}</td>
                  <td className="num">{money(l.extendedCost)}</td>
                  <td className="farm-fs-xs">{l.needBy ?? '—'}</td>
                </tr>
              ))}
              <tr className="total"><td colSpan={7}>Net, case-rounded</td><td className="num">{money(net.netTotal)}</td><td /></tr>
            </tbody>
          </table>
        </div>
      )}
      {Object.keys(stock.unmatchedIssues).length > 0 && (
        <p className="farm-kpi-sub mt-2 farm-c-placeholder">
          Issues on closed sowings with no receipt to draw from: {Object.entries(stock.unmatchedIssues).map(([k, v]) => `${num(v, 1)} ${k}`).join(', ')}. Stock is not assumed for them.
        </p>
      )}
      <p className="farm-kpi-sub mt-2">
        Stock on hand is receipts less issues on closed sowing records, oldest lot first, as of the production morning. On order is issued purchase orders less the receipts booked against them, applied only where the order&rsquo;s production date is on or before the day. The net is what is bought; the generator below reads it by supplier, with the catalog lead time giving each line an order-by date.
      </p>
    </Card>
  );
}
