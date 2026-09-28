'use client';

import type { TimeStudyDoc } from '@/data/time-studies';
import { PageControls } from '@/components/PageControls';
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card, Kpi, CheckPill, StatusBadge, money, num, pct } from '@/components/ui';
import { GrowPlanSelector, useSelectedGrowPlan } from '@/components/GrowPlanSelector';
import { GrowPlanEditor } from '@/components/GrowPlanEditor';
import { PurchaseOrderGenerator } from '@/components/PurchaseOrderGenerator';
import { StaffingPanel } from '@/components/StaffingPanel';
import { useScenario } from '@/state/scenario-store';
import { useOperationsWorld } from '@/state/ledger';
import { WorldNote } from '@/components/ledger/WorldNote';
import { LABOR_BASIS_LABELS } from '@/engine/unit-cost';
import { WEEKDAY_LABELS, type SubscriptionCycleDef, type OrderDef } from '@/data/subscription-cycles';
import { GROW_PLAN_STATUS_LABELS } from '@/data/plan-data';
import { STAGE_BY_KEY } from '@/data/stage-schedule';
import { orderBook, isoAddDays, weekdayOf } from '@/engine/orders';
import {
  requirementsFor,
  finishedGoodsOnHand,
  planHorizon,
  singleGrowPlanRun,
  toRequirementLines,
  distributedConsumption,
  type FinishedLot,
  type HorizonProductionDay,
} from '@/engine/production-plan';
import { stageOn, type CalendarSowing } from '@/engine/grow-calendar';

import { GRAMS_PER_LB, costPlan } from '@/engine/grow-costing';
import type { SowingRecordDoc, ReceiptDoc } from '@/engine/actuals';
import { rawStockOnHand, openOrders, netRequirements, netToRequirementLines, type PoLike, type NetRequirements } from '@/engine/net-requirements';
import type { DateRange } from '@/engine/periods';
import { CHANNEL_COMMISSION_PHASE3 } from '@/engine/phase';

type Level = 'run' | 'day' | 'horizon';
const LEVELS: { id: Level; label: string }[] = [
  { id: 'run', label: '1 · Single grow plan run' },
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
const grams = (lb: number) => lb * GRAMS_PER_LB;

/** A closed sowing record; an experiment's (`experimentId`) is research, never stock. */
interface SowingRow { sowingId: string; growPlanCode: string; productionDate: string; goodUnits: number; closedBy: string | null; experimentId: string | null }

export function ProductionPlanningClient({
  canEdit,
  showFinancials,
  closures,
  cycles,
  orders: recordedOrders,
  sowings: recordedSowings,
  distributions: recordedDistributions,
  receipts: recordedReceipts,
  rawSowings: recordedRawSowings,
  purchaseOrders: recordedPurchaseOrders,
  studies,
  experimentSowings,
  today,
}: {
  canEdit: boolean;
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
  purchaseOrders: PoLike[];
  /** The time studies a grow plan's sow-day labor is read from. */
  studies: TimeStudyDoc[];
  /** Open experiments in R&D, on the grow units from their sow dates. */
  experimentSowings: { growPlanCode: string; sowDate: string; trays: number; experiment: string }[];
  today: string;
}) {
  const { resolved, library } = useScenario();
  // Plan runs the open forecast's own world; Actual the real farm (Roadmap N6 slice 3).
  const world = useOperationsWorld({ orders: recordedOrders, sowings: recordedSowings, distributions: recordedDistributions, receipts: recordedReceipts, rawSowings: recordedRawSowings, purchaseOrders: recordedPurchaseOrders });
  const { orders, sowings, distributions, receipts, rawSowings, purchaseOrders } = world;
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
  const growPlanNames = useMemo(() => Object.fromEntries(resolved.growPlans.map((r) => [r.code, r.name])), [resolved.growPlans]);
  const channelPriceCents = useMemo(() => Object.fromEntries(channels.map((c) => [c.phase, c.priceCents])) as Record<number, number>, [channels]);
  const channelLabel = (ch: number) => channels.find((c) => c.phase === ch)?.market ?? `Channel ${ch}`;
  const bookFor = useCallback(
    (from: string, to: string) => orderBook({ pickupPoints: world.pickupPoints, subscribers: resolved.subscribers, cycles, orders, from, to, channelPriceCents, growPlanNames, closures }),
    [world.pickupPoints, resolved.subscribers, cycles, orders, channelPriceCents, growPlanNames, closures],
  );
  const consumption = useMemo(() => distributedConsumption(orders, distributions, resolved.growPlans, pfByChannel), [orders, distributions, resolved.growPlans, pfByChannel]);
  const planOf = useCallback((code: string) => {
    const r = resolved.growPlans.find((x) => x.code === code);
    return r ?? null;
  }, [resolved.growPlans]);
  // Recorded sowings still inside their cycle, and open experiments, are on the shelves when a window opens.
  const openingSowings = useMemo(
    () => [
      ...sowings
        .filter((b) => b.goodUnits > 0)
        .map((b) => ({ growPlanCode: b.growPlanCode, sowDate: b.productionDate, trays: b.goodUnits }))
        .filter((b) => {
          const plan = planOf(b.growPlanCode);
          return plan !== null && stageOn(plan, b.sowDate, today).stage !== 'off';
        }),
      // Open experiments are the farm's own record, so they follow the recorded sowings: Actual only.
      ...(world.isPlan ? [] : experimentSowings),
    ],
    [sowings, planOf, today, experimentSowings, world.isPlan],
  );
  const stageToday = (s: CalendarSowing) => {
    const plan = planOf(s.growPlanCode);
    const st = plan ? stageOn(plan, s.sowDate, today) : null;
    return st && st.stage !== 'off' ? `${STAGE_BY_KEY[st.stage].name}, day ${st.dayOfCycle}` : '—';
  };

  // ── Level 1: single grow plan run ────────────────────────────────────────────
  const { growPlan: runGrowPlan } = useSelectedGrowPlan();
  const [runChannel, setRunChannel] = useState<number>(() => runGrowPlan.channels[0] ?? 1);
  const [runUnits, setRunUnits] = useState<number>(() => Math.round(channels.find((c) => c.phase === (runGrowPlan.channels[0] ?? 1))?.unitsPerDay ?? 0));
  const [runPrice, setRunPrice] = useState<number | ''>('');
  const [runOpening, setRunOpening] = useState(0);
  const [editor, setEditor] = useState(false);
  const runChannelPrice = channels.find((c) => c.phase === runChannel)?.pricePerUnit ?? 0;
  const runOwnUnit = runGrowPlan.channels.includes(runChannel);
  const run = useMemo(
    () =>
      singleGrowPlanRun({
        growPlan: runGrowPlan,
        units: runUnits,
        unitFactor: runOwnUnit ? 1 : pfByChannel[runChannel] ?? 1,
        premiumFactor: runOwnUnit ? 1 : premiumByChannel[runChannel] ?? 1,
        pricePerUnit: runPrice === '' ? runChannelPrice : runPrice,
        commissionShare: runChannel === 3 ? CHANNEL_COMMISSION_PHASE3 : 0,
        openingInventory: runOpening,
        capacityInputs: resolved.capacityInputs,
        // The run is costed at its own grow plan's labor standard and packaging (Roadmap N3).
        assumptions: resolved.growPlanAssumptions[runGrowPlan.code] ?? A,
      }),
    [runGrowPlan, runUnits, runChannel, runPrice, runOpening, runChannelPrice, runOwnUnit, pfByChannel, premiumByChannel, resolved.capacityInputs, resolved.growPlanAssumptions, A],
  );
  const runRequirement = useMemo(() => toRequirementLines(run.purchase.lines), [run.purchase.lines]);
  // A grow plan's run: the sowing in trays of one grow unit, the cycle, and the cost per tray by line kind.
  const runGrow = useMemo(() => (run.cap.grow ? { grow: run.cap.grow, costing: costPlan(runGrowPlan) } : null), [runGrowPlan, run.cap.grow]);
  const runLabor = resolved.laborStandards[runGrowPlan.code];
  const runAssumptions = resolved.growPlanAssumptions[runGrowPlan.code] ?? A;

  // ── Level 2: distribution day ─────────────────────────────────────────────────
  const [dayDate, setDayDate] = useState(() => nextServiceDay(today));
  const dayBook = useMemo(() => bookFor(dayDate, dayDate), [bookFor, dayDate]);
  const requirements = useMemo(() => requirementsFor(dayBook, resolved.growPlans, pfByChannel), [dayBook, resolved.growPlans, pfByChannel]);
  const [onHandOverride, setOnHandOverride] = useState<Record<string, number>>({});
  // Raw stock on the first sow day and what is on order: the net requirement is what is bought.
  const onOrder = useMemo(() => openOrders({ purchaseOrders, receipts }), [purchaseOrders, receipts]);
  const dayUnits = dayBook.reduce((s, o) => s + o.units, 0);
  const dayByChannel = channels.map((c) => ({ ...c, units: dayBook.filter((o) => o.channel === c.phase).reduce((s, o) => s + o.units, 0) }));

  // The day on the grow model: each order back-planned to its plan's sow date, the sowings placed on
  // the grow units for their cycle — the horizon over this one distribution date.
  const dayLots = useMemo(() => {
    const lots: FinishedLot[] = finishedGoodsOnHand({ sowings, consumed: consumption, shelfLifeDays: shelfLife, asOf: dayDate, growPlans: resolved.growPlans }).lots.filter((l) => l.remaining > 0 && onHandOverride[l.growPlanCode] === undefined);
    // A typed on-hand figure stands in for the records of its plan as one lot inside shelf life.
    for (const [code, qty] of Object.entries(onHandOverride)) {
      const produced = isoAddDays(dayDate, -1);
      lots.push({ sowingId: `typed-${code}`, growPlanCode: code, produced, expires: isoAddDays(produced, shelfLife), qtyProduced: qty, remaining: qty });
    }
    return lots;
  }, [sowings, consumption, shelfLife, dayDate, onHandOverride, resolved.growPlans]);
  const dayHorizon = useMemo(
    () =>
      planHorizon({
            closures,
            crews: resolved.crews,
            studies,
            from: dayDate,
            to: dayDate,
            book: dayBook,
            growPlans: resolved.growPlans,
            capacityInputs: resolved.capacityInputs,
            assumptions: A,
            growPlanAssumptions: resolved.growPlanAssumptions,
            unitFactorByChannel: pfByChannel,
            openingLots: dayLots,
            openingSowings,
            shelfLifeDays: shelfLife,
            productionWeekdays: SERVICE_WEEKDAYS,
            channels: channels.map((c) => c.phase),
          }),
    [closures, resolved.crews, dayDate, dayBook, resolved.growPlans, resolved.capacityInputs, A, resolved.growPlanAssumptions, pfByChannel, dayLots, openingSowings, shelfLife, channels, studies],
  );
  const dayRuns = useMemo(() => dayHorizon.productionDays.flatMap((p) => p.runs.map((r) => ({ ...r, sowDate: p.productionDate }))), [dayHorizon]);
  const daySowings = useMemo(() => (dayHorizon.growCalendar?.sowings ?? []).filter((s) => s.distributionDate === dayDate).sort((a, b) => a.sowDate.localeCompare(b.sowDate) || a.growPlanCode.localeCompare(b.growPlanCode)), [dayHorizon, dayDate]);
  const sowDates = useMemo(() => dayHorizon.productionDays.map((p) => p.productionDate), [dayHorizon]);
  const firstSowDate = sowDates[0] ?? dayDate;
  const dayNoRoom = daySowings.filter((s) => !s.placed).reduce((s, x) => s + x.trays, 0);
  const dayDist = dayHorizon.distributionDays[0];
  const dayStockAsOf = firstSowDate;
  const dayStock = useMemo(() => rawStockOnHand({ receipts, sowings: rawSowings, asOf: dayStockAsOf }), [receipts, rawSowings, dayStockAsOf]);
  const dayNet = useMemo(
    () =>
      netRequirements({
        days: dayHorizon.productionDays.map((p) => ({ productionDate: p.productionDate, lines: p.purchase.lines })),
        stock: dayStock,
        onOrder,
      }),
    [dayHorizon, dayStock, onOrder],
  );
  const dayGross = dayHorizon.productionDays.reduce((s, p) => s + p.purchase.total, 0);
  const dayRunsMade = dayRuns.filter((r) => r.produced > 0).length;
  const dayProduced = dayHorizon.totals.producedBase;
  const recordedForDay = useMemo(() => sowings.filter((b) => sowDates.includes(b.productionDate)), [sowings, sowDates]);
  const dayTitleDates = sowDates.length ? sowDates.map(dateLabel).join(', ') : dateLabel(dayDate);

  // ── Level 3: horizon ──────────────────────────────────────────────────────
  const [hFrom, setHFrom] = useState(today);
  const [hTo, setHTo] = useState(isoAddDays(today, 27));
  const hBook = useMemo(() => bookFor(hFrom, hTo), [bookFor, hFrom, hTo]);
  const openingLots = useMemo(() => finishedGoodsOnHand({ sowings, consumed: consumption, shelfLifeDays: shelfLife, asOf: hFrom, growPlans: resolved.growPlans }).lots.filter((l) => l.remaining > 0), [sowings, consumption, shelfLife, hFrom, resolved.growPlans]);
  const horizon = useMemo(
    () =>
      planHorizon({
        closures,
        crews: resolved.crews,
        studies,
        from: hFrom,
        to: hTo,
        book: hBook,
        growPlans: resolved.growPlans,
        capacityInputs: resolved.capacityInputs,
        assumptions: A,
        growPlanAssumptions: resolved.growPlanAssumptions,
        unitFactorByChannel: pfByChannel,
        openingLots,
        openingSowings,
        shelfLifeDays: shelfLife,
        productionWeekdays: SERVICE_WEEKDAYS,
        channels: channels.map((c) => c.phase),
      }),
    [closures, hFrom, hTo, hBook, resolved.growPlans, resolved.capacityInputs, A, pfByChannel, openingLots, openingSowings, shelfLife, channels, resolved.crews, resolved.growPlanAssumptions, studies],
  );
  const hStock = useMemo(() => rawStockOnHand({ receipts, sowings: rawSowings, asOf: hFrom }), [receipts, rawSowings, hFrom]);
  const hNet = useMemo(
    () => netRequirements({ days: horizon.productionDays.map((p) => ({ productionDate: p.productionDate, lines: p.purchase.lines })), stock: hStock, onOrder }),
    [horizon.productionDays, hStock, onOrder],
  );
  const needByOf = (n: NetRequirements) => Object.fromEntries(n.lines.filter((l) => l.needBy).map((l) => [l.input, l.needBy as string]));
  const cal = horizon.growCalendar;
  const hNoRoom = cal.sowings.filter((s) => !s.placed);
  const hPeak = cal.days.reduce((m, d) => Math.max(m, d.traysOnShelf), 0);
  // One row per date of the window: the shelves (the calendar) beside the stock (the horizon's rows).
  const hByDate = useMemo(() => {
    const stockOn = new Map(horizon.byDate.map((r) => [r.date, r]));
    return cal.days.map((d) => ({ ...d, stock: stockOn.get(d.date) }));
  }, [cal, horizon.byDate]);
  const traysSown = (p: HorizonProductionDay) => p.runs.reduce((s, r) => s + r.produced, 0);

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
          <Card title="The run — a grow plan, a quantity, a channel">
            <PageControls><GrowPlanSelector /></PageControls>
            <div className="flex flex-wrap gap-3 items-end">
              <span className="farm-kpi-sub">{GROW_PLAN_STATUS_LABELS[runGrowPlan.status]}{runGrowPlan.channels.length ? ` · authored for ${runGrowPlan.channels.map((c) => channelLabel(c)).join(', ')}` : ' · listed on no channel'}</span>
              {canEdit && <button type="button" className="farm-btn" onClick={() => setEditor((e) => !e)}>{editor ? 'Close editor' : 'Add New Grow plan'}</button>}
              <label className="farm-kpi-sub">{runGrow ? `Units (trays of the ${runGrow.costing.format.name})` : 'Units'}<br /><input className="farm-input w-28!" type="number" min={0} step={1} value={runUnits} onChange={(e) => setRunUnits(Math.max(0, Number(e.target.value) || 0))} /></label>
              <label className="farm-kpi-sub">Channel<br />
                <select className="farm-select" value={runChannel} onChange={(e) => { const ch = Number(e.target.value); setRunChannel(ch); setRunPrice(''); }}>
                  {channels.map((c) => <option key={c.phase} value={c.phase}>{channelLabel(c.phase)}{runGrowPlan.channels.includes(c.phase) ? '' : ' · not listed'}</option>)}
                </select>
              </label>
              <label className="farm-kpi-sub">Price / unit $ (blank = channel {money(runChannelPrice)})<br /><input className="farm-input w-28!" type="number" min={0} step={0.01} value={runPrice} onChange={(e) => setRunPrice(e.target.value === '' ? '' : Number(e.target.value))} /></label>
              <label className="farm-kpi-sub">Opening finished inventory (trays)<br /><input className="farm-input w-28!" type="number" min={0} step={1} value={runOpening} onChange={(e) => setRunOpening(Math.max(0, Number(e.target.value) || 0))} /></label>
            </div>
            <p className="farm-kpi-sub mt-2">
              A grow plan saved from the editor is a library grow plan from that moment and runs here at once.{' '}
              {runOwnUnit
                ? `${runGrowPlan.code} is authored for ${channelLabel(runChannel)} and runs at its own unit.`
                : `${runGrowPlan.code} is not authored for ${channelLabel(runChannel)}, so the channel's ${pfByChannel[runChannel] ?? 1}× unit factor and ${premiumByChannel[runChannel] ?? 1}× input premium (Unit Economics) apply.`}
            </p>
            {editor && <div className="mt-3"><GrowPlanEditor mode="create" library={library} channels={channels.map((c) => ({ phase: c.phase, market: c.market }))} onDone={() => setEditor(false)} /></div>}
          </Card>

          {runGrow && (
            <div className="grid gap-3 mt-4 farm-autofit-11">
              <Kpi value={num(run.sowings)} label="Sowings (whole only)" sub={`${num(run.produced)} trays for ${num(run.baseUnits)} needed`} />
              <Kpi value={`${num(runGrow.grow.sowingTrays)} trays`} label="Sowing — what one grow unit takes" sub={runGrow.grow.binding ? `one ${runGrow.grow.binding.unit.item.toLowerCase()}` : 'no grow unit takes this plan'} />
              <Kpi value={<span>{num(run.sowings)} of {num(runGrow.grow.unitCount)} <CheckPill ok={run.sowings <= runGrow.grow.unitCount} okLabel="at once" overLabel="over" /></span>} label="Grow units the run takes" sub={run.sowings <= runGrow.grow.unitCount ? `each sowing holds its unit for the ${num(runGrow.grow.cycleDays)}-day cycle` : `${num(run.sowings - runGrow.grow.unitCount)} sowing${run.sowings - runGrow.grow.unitCount === 1 ? '' : 's'} past the units wait a ${num(runGrow.grow.cycleDays)}-day cycle`} />
              <Kpi value={`${num(Math.round(grams(run.harvestedLb)))} g`} label="Harvest for the run" sub={`${num(Math.round(grams(run.purchasedLb)))} g seed sown · ${num(runGrow.costing.harvestGramsPerTray, 0)} g a tray from the variety record`} />
              <Kpi value={money(run.inputCostPerUnit)} label="Input cost / tray" sub={`${money(run.laborPerUnit)} run labor / tray on the three streams`} />
              {showFinancials && <Kpi value={money(run.contributionPerUnit)} label="Contribution / tray" sub="Before fixed overhead" />}
            </div>
          )}

          <div className="grid gap-4 mt-4 farm-autofit-20">
            {runGrow && (
              <Card title="The run in grams — seed to harvest, and by line kind">
                <table className="farm-table">
                  <thead><tr><th>Stage</th><th className="num">Grams</th><th className="num">g / tray</th></tr></thead>
                  <tbody>
                    <tr><td>Seed sown</td><td className="num">{num(Math.round(grams(run.purchasedLb)))}</td><td className="num">{num(runGrow.costing.seedGramsPerTray, 1)}</td></tr>
                    <tr><td>Harvested ({num(runGrow.costing.yieldToHarvest, 2)}× the seed, from the variety record until a closed sowing observes it)</td><td className="num">{num(Math.round(grams(run.harvestedLb)))}</td><td className="num">{num(runGrow.costing.harvestGramsPerTray, 1)}</td></tr>
                    <tr className="total"><td>Packed as harvested, at {money(run.costPerPackedOz, 4)} per oz</td><td className="num">{num(Math.round(grams(run.packedLb)))}</td><td className="num">{num(runGrow.costing.harvestGramsPerTray, 1)}</td></tr>
                  </tbody>
                </table>
                <table className="farm-table mt-3">
                  <thead><tr><th>Line kind</th><th className="num">$ / tray</th><th className="num">For {num(run.produced)} trays</th></tr></thead>
                  <tbody>
                    {(['seed', 'medium', 'nutrient', 'light', 'consumables'] as const).map((k) => (
                      <tr key={k}><td>{k === 'consumables' ? 'Consumables (tray set, sanitizer)' : `${k[0]!.toUpperCase()}${k.slice(1)}`}</td><td className="num">{money(runGrow.costing.perTray[k], 4)}</td><td className="num">{money(runGrow.costing.perTray[k] * run.produced)}</td></tr>
                    ))}
                    <tr className="total"><td>Inputs, before the {(shrink * 100).toFixed(0)}% shrink allowance</td><td className="num">{money(runGrow.costing.perTray.total, 4)}</td><td className="num">{money(runGrow.costing.perTray.total * run.produced)}</td></tr>
                  </tbody>
                </table>
                <table className="farm-table mt-3">
                  <tbody>
                    <tr><td>Purchase order, pack-rounded, incl. the {(shrink * 100).toFixed(0)}% shrink allowance</td><td className="num">{money(run.purchase.total)}</td></tr>
                    <tr><td>Plan standard for {num(run.produced)} trays, incl. the same allowance</td><td className="num">{money(run.inputCostStandard)}</td></tr>
                    <tr className="total"><td>Difference held in raw materials (pack rounding)</td><td className="num">{money(run.carriedForward)}</td></tr>
                    <tr><td>Closing finished inventory after the {num(run.units)} trays ship</td><td className="num">{num(run.closing)} trays</td></tr>
                  </tbody>
                </table>
              </Card>
            )}

            {showFinancials && (
            <Card title={`Economics of ${num(run.units)} trays on ${channelLabel(runChannel)}`}>
              <table className="farm-table">
                <tbody>
                  <tr><td>Revenue at {money(runPrice === '' ? runChannelPrice : runPrice)}</td><td className="num">{money(run.revenue)}</td></tr>
                  <tr><td>Input cost sold ({money(run.inputCostPerUnit)} / tray)</td><td className="num">({money(run.inputCostSold)})</td></tr>
                  <tr><td>Direct labor for the run — {run.laborHours.toFixed(1)} h at {money(A.labor.blendedLoadedWage.value)}/h ({'sowing, daily and harvest streams'})</td><td className="num">({money(run.laborCost)})</td></tr>
                  <tr><td>Packaging ({money(run.packagingPerUnit)} / tray)</td><td className="num">({money(run.packaging)})</td></tr>
                  <tr><td>Distribution ({money(run.distributionPerUnit)} / tray)</td><td className="num">({money(run.distribution)})</td></tr>
                  {run.commission > 0 && <tr><td>Marketplace commission ({pct(CHANNEL_COMMISSION_PHASE3, 0)} of price)</td><td className="num">({money(run.commission)})</td></tr>}
                  <tr className="total"><td>Contribution before fixed overhead</td><td className="num">{money(run.contribution)}</td></tr>
                  <tr><td>Per tray</td><td className="num">{money(run.contributionPerUnit)}</td></tr>
                </tbody>
              </table>
              {runGrow && (
                <p className="farm-kpi-sub mt-2">
                  Labor here is the run&rsquo;s own hours on {runGrowPlan.code}&rsquo;s labor standard ({LABOR_BASIS_LABELS[runLabor?.basis ?? 'none'].toLowerCase()}): {num(run.sowings)} × {num(runAssumptions.laborSplit.fixedMinutesPerSowing.value, 0)} minutes a sowing on the sow day, plus {num(run.produced)} × {(runAssumptions.laborSplit.dailyMinutesPerUnit?.value ?? 0).toFixed(1)} minutes a tray over the days on the shelf, plus {num(run.produced)} × {runAssumptions.laborSplit.variableMinutesPerUnit.value.toFixed(1)} minutes a tray on the harvest day — priced at the loaded wage. The cost of a tray on Unit Economics and on Grow plans uses the same standard at one full sowing. Fixed overhead is on <Link className="farm-link" href="/farm/financials/unit-economics">Unit Economics</Link>.
                </p>
              )}
            </Card>
            )}
          </div>

          <PurchaseOrderGenerator canEdit={canEdit && world.recording} requirement={runRequirement} unitsProduced={run.produced} title={`Purchase orders — ${runGrowPlan.code}, ${num(run.produced)} trays`} />
        </>
      )}

      {level === 'day' && (
        <>
          <Card title="Distribution day">
            <PageControls><label className="farm-kpi-sub inline-flex items-center gap-2">Distribution date<input className="farm-input" type="date" value={dayDate} onChange={(e) => { if (e.target.value) { setDayDate(e.target.value); setOnHandOverride({}); } }} /></label></PageControls>
            <div className="flex flex-wrap gap-3 items-end">
              <span className="farm-kpi-sub">Distributed {dateLabel(dayDate)} · sown <strong className="farm-c-ink">{sowDates.length ? sowDates.map(dateLabel).join(', ') : 'nothing'}</strong> · {num(Math.round(dayUnits))} units in {dayBook.length} order{dayBook.length === 1 ? '' : 's'}</span>
            </div>
            <p className="farm-kpi-sub mt-2">
              A live tray is distributed inside its harvest window: each order on this date is back-planned to its plan&rsquo;s sow date, the distribution date less the plan&rsquo;s days to harvest, on a production day. Orders come from <Link className="farm-link" href="/farm/orders">Orders</Link>: forecast orders from each subscriber&rsquo;s flat plan and its services&rsquo; units per service, plus the confirmed and typed orders on file. Units are trays of the plan&rsquo;s format, netted against finished goods on hand, sized into whole sowings of what one grow unit takes, and each sowing is placed on a unit with room for its whole cycle. The month view is the <Link className="farm-link" href="/farm/production-planning/grow-calendar">Grow Calendar</Link>.
            </p>
          </Card>

          <div className="grid gap-3 mt-4 farm-autofit-11">
            <Kpi value={num(Math.round(dayUnits))} label="Units ordered" sub={dayByChannel.filter((c) => c.units > 0).map((c) => `${num(Math.round(c.units))} ${c.market}`).join(' · ') || 'no orders on this date'} />
            <Kpi value={num(Math.round(dayHorizon.totals.orderedBase))} label="Trays required" sub={`${dayRuns.length} plan${dayRuns.length === 1 ? '' : 's'} · ${num(Math.round(dayDist?.filledBase ?? 0))} filled from stock and the sowings`} />
            <Kpi value={num(dayHorizon.totals.sowings)} label="Sowings to run" sub={`${num(Math.round(dayHorizon.totals.producedBase))} trays sown${(dayDist?.unfilledBase ?? 0) > 0.5 ? ` · ${num(Math.round(dayDist!.unfilledBase))} unfilled` : ''}`} />
            <Kpi value={num(sowDates.length)} label="Sow days" sub={sowDates.length ? `${sowDates[0]} to ${sowDates[sowDates.length - 1]}` : 'no sowing for this date'} />
            <Kpi value={<span>{num(dayNoRoom)} <CheckPill ok={dayNoRoom === 0} okLabel="every sowing placed" overLabel="no room" /></span>} label="Trays with no room" sub={dayNoRoom > 0 ? `${daySowings.filter((s) => !s.placed).length} sowing${daySowings.filter((s) => !s.placed).length === 1 ? '' : 's'} no grow unit holds for the cycle` : 'each sowing holds a grow unit for its cycle'} />
            <Kpi value={`${dayHorizon.productionDays.reduce((s, p) => s + p.laborHours, 0).toFixed(1)} h`} label="Direct labor" sub={`${money(dayHorizon.productionDays.reduce((s, p) => s + p.laborCost, 0))} at the loaded wage, on the three streams`} />
          </div>

          <Card title={`Production requirements — for ${dateLabel(dayDate)}`} className="mt-4">
            {dayRuns.length === 0 && <p className="farm-kpi-sub">No orders on {dateLabel(dayDate)}. A service with units per service and a flat plan on Subscribers put forecast orders here.</p>}
            {dayRuns.length > 0 && (
              <div className="farm-scroll-x">
                <table className="farm-table">
                  <thead>
                    <tr><th>Plan</th><th>Sow date</th><th className="num">Units</th><th className="num">Required (trays)</th><th className="num">On hand</th><th className="num">Net</th><th className="num">Sowing (trays)</th><th className="num">Sowings</th><th className="num">Sown</th><th className="num">Closing</th><th className="num">Inputs at the plan&rsquo;s price</th></tr>
                  </thead>
                  <tbody>
                    {dayRuns.map((r) => {
                      const req = requirements.find((q) => q.growPlanCode === r.growPlanCode);
                      const overridden = onHandOverride[r.growPlanCode] !== undefined;
                      const lotsOf = dayLots.filter((l) => l.growPlanCode === r.growPlanCode && !l.sowingId.startsWith('typed-')).length;
                      return (
                        <tr key={`${r.sowDate}|${r.growPlanCode}`}>
                          <td>{r.growPlanCode}<div className="farm-c-faint farm-fs-xs">{r.growPlanName}</div></td>
                          <td className="whitespace-nowrap!">{dateLabel(r.sowDate)}</td>
                          <td className="num">{num(Math.round(req?.units ?? 0))}<div className="farm-c-faint farm-fs-2xs">{(req?.byChannel ?? []).map((c) => `${channelLabel(c.channel)} ${num(Math.round(c.units))}${c.unitFactor !== 1 ? ` × ${c.unitFactor}` : ''}`).join(' · ')}</div></td>
                          <td className="num">{num(Math.round(r.required))}</td>
                          <td className="num">
                            <input className="farm-num-input" type="number" min={0} step={1} value={Math.round(r.onHand)} onChange={(e) => setOnHandOverride((m) => ({ ...m, [r.growPlanCode]: Math.max(0, Number(e.target.value) || 0) }))} aria-label={`${r.growPlanCode} on hand`} />
                            <div className="farm-fs-2xs"><StatusBadge status={overridden ? 'STATED' : 'DERIVED'} title={overridden ? 'Typed for this view; not saved.' : `From ${lotsOf} closed sowing record(s) inside shelf life on the distribution date, less distributed orders.`} />{overridden && <button type="button" className="farm-btn py-0! px-[0.3rem]! ml-[0.3rem]! farm-fs-2xs" onClick={() => setOnHandOverride((m) => { const n = { ...m }; delete n[r.growPlanCode]; return n; })}>records</button>}</div>
                          </td>
                          <td className="num">{num(Math.round(r.net))}</td>
                          <td className="num">{num(r.sowingSize)}{r.sowingSize === 0 && <div className="farm-c-over farm-fs-2xs">no unit takes it</div>}</td>
                          <td className="num">{num(r.sowingsScheduled)}{r.sowingsScheduled < r.sowingsNeeded ? <div className="farm-c-over farm-fs-2xs">{num(r.sowingsNeeded)} needed</div> : null}</td>
                          <td className="num">{num(Math.round(r.produced))}{r.shortfall > 0 ? <div className="farm-c-over farm-fs-2xs">{num(Math.round(r.shortfall))} short</div> : null}</td>
                          <td className="num">{num(Math.round(r.closing))}</td>
                          <td className="num">{money(r.inputCostStandard)}</td>
                        </tr>
                      );
                    })}
                    <tr className="total"><td>All plans</td><td /><td className="num">{num(Math.round(dayUnits))}</td><td className="num">{num(Math.round(dayHorizon.totals.orderedBase))}</td><td className="num">—</td><td className="num">{num(Math.round(dayRuns.reduce((s, r) => s + r.net, 0)))}</td><td className="num">—</td><td className="num">{num(dayHorizon.totals.sowings)}</td><td className="num">{num(Math.round(dayHorizon.totals.producedBase))}</td><td className="num">{num(Math.round(dayRuns.reduce((s, r) => s + r.closing, 0)))}</td><td className="num">{money(dayHorizon.productionDays.reduce((s, p) => s + p.inputCostStandard, 0))}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="farm-kpi-sub mt-2">
              On hand is what the closed sowing records say is inside the {shelfLife}-day shelf life on the distribution date, less what distributed orders drew, oldest lot first. No record, no stock: the platform does not assume inventory it has not seen. A sowing is what one grow unit takes in trays of the plan&rsquo;s format; overshoot on whole sowings is the closing stock, and the horizon carries it to the next distribution date.
            </p>
          </Card>

          <Card title="Sowings on the grow units" className="mt-4">
            {daySowings.length === 0 ? <p className="farm-kpi-sub">Nothing to sow: stock covers the date, or it has no orders.</p> : (
              <div className="farm-scroll-x">
                <table className="farm-table">
                  <thead><tr><th>Plan</th><th>Sow</th><th>Harvest window</th><th className="num">Trays</th><th>Grow unit</th><th>Today</th></tr></thead>
                  <tbody>
                    {daySowings.map((s) => (
                      <tr key={s.id} className={s.placed ? '' : 'farm-c-accent'}>
                        <td>{s.growPlanCode}<div className="farm-c-faint farm-fs-xs">{s.growPlanName}</div></td>
                        <td className="whitespace-nowrap!">{dateLabel(s.sowDate)}</td>
                        <td className="whitespace-nowrap!">{s.harvestFrom} to {s.harvestTo}</td>
                        <td className="num">{num(s.trays)}</td>
                        <td>{s.placed ? (s.darkUnitItem ? `${s.darkUnitItem}, then ${s.unitItem}` : s.unitItem) : <span className="farm-c-over">no room on any unit for the {num(s.cycleDays)}-day cycle</span>}</td>
                        <td>{stageToday(s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="farm-kpi-sub mt-2">
              A sowing goes on a lit unit that has room on every day of the cycle, its dark days on a dark rack where one has room, largest unit first; a sowing no unit holds is the shortfall above, never squeezed onto a shelf. A sowing dated today is in the <Link className="farm-link" href="/farm/grow-room">Grow Room</Link>&rsquo;s Sow queue, where it is closed with the grow form; the harvest window is when its trays are distributed.
            </p>
          </Card>

          <Card title="Labor the sow days require, and the proposed crews checked against it" className="mt-4">
            {dayHorizon.productionDays.length === 0 ? <p className="farm-kpi-sub">No sowing, no labor.</p> : (
              <>
                <div className="farm-scroll-x">
                  <table className="farm-table">
                    <thead><tr><th>Sow day</th><th className="num">Sowings</th><th className="num">Trays</th><th className="num">Labor hours</th><th className="num">Labor cost</th><th>Crews</th></tr></thead>
                    <tbody>
                      {dayHorizon.productionDays.map((p) => (
                        <tr key={p.productionDate}>
                          <td className="whitespace-nowrap!">{dateLabel(p.productionDate)}</td>
                          <td className="num">{num(p.runs.reduce((s, r) => s + r.sowingsScheduled, 0))}</td>
                          <td className="num">{num(Math.round(traysSown(p)))}</td>
                          <td className="num">{p.laborHours.toFixed(1)}</td>
                          <td className="num">{money(p.laborCost)}</td>
                          <td>{p.staffing.checked ? <CheckPill ok={p.staffing.findings.length === 0} okLabel="staffed" overLabel={`${p.staffing.findings.length} finding${p.staffing.findings.length === 1 ? '' : 's'}`} /> : 'no crew proposed'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {dayHorizon.productionDays.map((p) => (
                  <div key={p.productionDate} className="mt-3">
                    <div className="farm-kpi-sub mb-1">{dateLabel(p.productionDate)}</div>
                    <StaffingPanel labor={p.labor} staffing={p.staffing} />
                  </div>
                ))}
              </>
            )}
            <p className="farm-kpi-sub mt-2">
              The sow day&rsquo;s hours are the sowing stream and, with the harvest stream and the days on the shelf, the plan&rsquo;s labor standard for the trays sown. Crews are proposed on <Link className="farm-link" href="/farm/capacity">Capacity</Link>; a gap is a finding here and never takes a shelf away from the day. The daily stream across every day on the shelves is on <Link className="farm-link" href="/farm/schedule">Schedule</Link>.
            </p>
          </Card>

          {recordedForDay.length > 0 && (
            <Card title={`Sowing records closed for ${dayTitleDates}`} className="mt-4">
              <table className="farm-table"><tbody>
                {recordedForDay.map((b) => <tr key={b.sowingId}><td>{b.sowingId}<div className="farm-c-faint farm-fs-2xs">{b.growPlanCode} · {b.productionDate} · {b.closedBy ?? 'unsigned'}</div></td><td className="num">{num(Math.round(b.goodUnits))} trays</td></tr>)}
              </tbody></table>
              <p className="farm-kpi-sub mt-2">Listed with the period on <Link className="farm-link" href="/farm/actuals">Actuals</Link>, where the ledger posts from them.</p>
            </Card>
          )}

          <NetCard title={'Purchase requirement — the net, one order across plans and sow days'} net={dayNet} stock={dayStock} gross={dayGross} shrink={shrink} runs={dayRunsMade} onOrderDrafts={onOrder.draftsByInput} />
          <PurchaseOrderGenerator canEdit={canEdit && world.recording} requirement={netToRequirementLines(dayNet)} unitsProduced={dayProduced} defaultDate={dayStockAsOf} title={`Purchase orders by supplier — ${dayTitleDates}`} needBy={needByOf(dayNet)} today={today} summary={`${money(dayNet.netTotal)} net to buy for ${num(Math.round(dayProduced))} trays`} />
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
              <span className="farm-kpi-sub">{horizon.distributionDays.length} distribution date{horizon.distributionDays.length === 1 ? '' : 's'} · {horizon.productionDays.length} sow day{horizon.productionDays.length === 1 ? '' : 's'} · opening stock {num(Math.round(openingLots.reduce((s, l) => s + l.remaining, 0)))} trays from records{openingSowings.length ? ` · ${num(openingSowings.reduce((s, x) => s + x.trays, 0))} trays on the shelves from records and experiments` : ''}</span>
            </div>
            <p className="farm-kpi-sub mt-2">
              The order book for the period, rolled through the shelves: each order is sown on its plan&rsquo;s sow date, the sowing holds its grow unit for the plan&rsquo;s cycle, whole sowings overshoot into stock inside the {shelfLife}-day shelf life, and a distribution date draws its orders from stock oldest first. A sowing no unit can hold is an unfilled order, shared equally across the channels on that plan — the same rule as equal distribution on the annual allocation.
            </p>
          </Card>

          <div className="grid gap-3 mt-4 farm-autofit-11">
            <Kpi value={num(Math.round(horizon.totals.orderedUnits))} label="Units ordered" sub={`${num(Math.round(horizon.totals.orderedBase))} trays`} />
            <Kpi value={num(Math.round(horizon.totals.filledUnits))} label="Units filled" sub={horizon.totals.orderedUnits > 0 ? `${pct(horizon.totals.filledUnits / horizon.totals.orderedUnits)} of ordered` : '—'} />
            <Kpi value={num(horizon.totals.sowings)} label="Sowings" sub={`${num(Math.round(horizon.totals.producedBase))} trays sown · ${num(hPeak)} on the shelves at the peak`} />
            {cal.utilisation.map((u) => (
              <Kpi key={u.unitKey} value={u.available > 0 ? pct(u.share) : '—'} label={`${u.item} in use`} sub={`${num(u.used)} of ${num(u.available)} tray-days over the window`} />
            ))}
            <Kpi value={<CheckPill ok={hNoRoom.length === 0} okLabel="every sowing placed" overLabel={`${hNoRoom.length} sowing${hNoRoom.length === 1 ? '' : 's'} with no room`} />} label="Capacity" sub={hNoRoom.length ? `${num(hNoRoom.reduce((s, x) => s + x.trays, 0))} trays no grow unit holds for the cycle` : 'each sowing holds a grow unit for its cycle'} />
            <Kpi value={num(Math.round(horizon.totals.expiredBase))} label="Expired past shelf life" sub={`${num(Math.round(horizon.totals.closingStockBase))} trays in stock at the end`} />
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
              What the order book asked for and what the grow units could make over these dates. The same run over the forecast&rsquo;s horizon is the <Link className="farm-link" href="/farm/financials/pnl">Plan ledger</Link>.
            </p>
          </Card>
            </>
          )}

          <div className="grid gap-4 mt-4 farm-autofit-22">
            <Card title={'Sow days'}>
              {horizon.productionDays.length === 0 ? <p className="farm-kpi-sub">No orders in the period.</p> : (
                <div className="farm-scroll-x">
                  <table className="farm-table">
                    <thead><tr><th>Sown on</th><th>For</th><th>Sowings by plan</th><th className="num">Trays</th><th>Placed</th></tr></thead>
                    <tbody>
                      {horizon.productionDays.map((p) => (
                        <tr key={p.productionDate}>
                          <td>{dateLabel(p.productionDate)}</td>
                          <td className="farm-fs-xs">{p.distributionDates.map((d) => dateLabel(d)).join(', ')}</td>
                          <td className="farm-fs-xs">{p.runs.filter((r) => r.sowingsNeeded > 0).map((r) => `${r.growPlanCode} × ${r.sowingsScheduled}${r.sowingsScheduled < r.sowingsNeeded ? ` of ${r.sowingsNeeded}` : ''}`).join(' · ') || 'stock covers it'}</td>
                          <td className="num">{num(Math.round(traysSown(p)))}</td>
                          <td><CheckPill ok={p.fits} okLabel="on the shelves" overLabel="no room" /></td>
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
                    <thead><tr><th>Date</th><th className="num">Units ordered</th><th className="num">{'Trays ordered'}</th><th className="num">Filled</th><th className="num">Unfilled</th></tr></thead>
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

          <Card title="By date — the shelves beside the stock" className="mt-4">
            <div className="farm-scroll-x">
              <table className="farm-table compact">
                <thead>
                  <tr><th>Date</th><th className="num">Sown</th><th className="num">On the shelves</th><th className="num">In harvest window</th><th className="num">Waterings</th><th className="num">No room</th><th className="num">Ordered</th><th className="num">Filled</th><th className="num">Unfilled</th><th className="num">Expired</th><th className="num">Stock at close</th></tr>
                </thead>
                <tbody>
                  {hByDate.map((d) => {
                    const w = d.waterings.mist + d.waterings.bottom + d.waterings.rinse;
                    const dash = (n: number) => (n > 0.5 ? num(Math.round(n)) : '—');
                    return (
                      <tr key={d.date} className={d.date === today ? 'font-semibold' : ''}>
                        <td className="whitespace-nowrap!">{dateLabel(d.date)}</td>
                        <td className="num">{dash(d.traysSown)}</td>
                        <td className="num">{dash(d.traysOnShelf)}</td>
                        <td className="num">{dash(d.traysHarvestable)}</td>
                        <td className="num">{dash(w)}</td>
                        <td className="num">{d.unplacedTrays > 0 ? <span className="farm-c-over">{num(d.unplacedTrays)}</span> : '—'}</td>
                        <td className="num">{dash(d.stock?.orderedBase ?? 0)}</td>
                        <td className="num">{dash(d.stock?.filledBase ?? 0)}</td>
                        <td className="num">{(d.stock?.unfilledBase ?? 0) > 0.5 ? <span className="farm-c-over">{num(Math.round(d.stock!.unfilledBase))}</span> : '—'}</td>
                        <td className="num">{dash(d.stock?.expiredBase ?? 0)}</td>
                        <td className="num">{dash(d.stock?.closingStockBase ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="farm-kpi-sub mt-2">
              The shelves are the grow calendar: trays sown that day, trays on the grow units by their stage, trays inside their harvest window, the waterings the daily stream owes, and trays with no room. The stock is the horizon&rsquo;s roll: what the date ordered, what stock filled, what expired unconsumed and what is left at the close. The month view with each day by stage and by unit is the <Link className="farm-link" href="/farm/production-planning/grow-calendar">Grow Calendar</Link>.
            </p>
          </Card>

          <NetCard title={`Purchase requirement — the net over the horizon, ${horizon.productionDays.length} sow day${horizon.productionDays.length === 1 ? '' : 's'}`} net={hNet} stock={hStock} gross={horizon.productionDays.reduce((s, p) => s + p.purchase.total, 0)} shrink={shrink} runs={horizon.productionDays.reduce((s, p) => s + p.runs.filter((r) => r.produced > 0).length, 0)} onOrderDrafts={onOrder.draftsByInput} />
          <PurchaseOrderGenerator canEdit={canEdit && world.recording} requirement={netToRequirementLines(hNet)} unitsProduced={horizon.totals.producedBase} defaultDate={hNet.toBuy.map((l) => l.needBy).filter((d): d is string => Boolean(d)).sort()[0] ?? hFrom} title="Purchase orders by supplier — the horizon" needBy={needByOf(hNet)} today={today} summary={`${money(hNet.netTotal)} net to buy for ${num(Math.round(horizon.totals.producedBase))} trays`} />

          {horizon.byGrowPlan.length > 0 && (
            <Card title={'By plan over the horizon'} className="mt-4">
              <div className="farm-scroll-x">
                <table className="farm-table">
                  <thead><tr><th>{'Plan'}</th><th className="num">{'Trays ordered'}</th><th className="num">{'Trays sown'}</th><th className="num">Sowings</th></tr></thead>
                  <tbody>
                    {horizon.byGrowPlan.map((r) => <tr key={r.growPlanCode}><td>{r.growPlanCode}<div className="farm-c-faint farm-fs-xs">{r.growPlanName}</div></td><td className="num">{num(Math.round(r.orderedBase))}</td><td className="num">{num(Math.round(r.producedBase))}</td><td className="num">{num(r.sowings)}</td></tr>)}
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

/** The net requirement table: gross, stock applied, on order applied, net, packs. */
function NetCard({ title, net, stock, gross, shrink, runs, onOrderDrafts }: { title: string; net: NetRequirements; stock: ReturnType<typeof rawStockOnHand>; gross: number; shrink: number; runs: number; onOrderDrafts: Record<string, number> }) {
  const stockValue = Object.values(stock.byInput).reduce((s, l) => s + l.valueCents, 0) / 100;
  const drafts = net.lines.filter((l) => (onOrderDrafts[l.input] ?? 0) > 0).length;
  const runWord = 'plan sowing';
  return (
    <Card title={title} className="mt-4">
      <div className="grid gap-3 farm-autofit-11 mb-3!">
        <Kpi value={money(gross)} label="Gross at the plan standard" sub={`Pack-rounded, incl. the ${(shrink * 100).toFixed(0)}% allowance, ${runs} ${runWord}${runs === 1 ? '' : 's'}`} />
        <Kpi value={money(net.lines.reduce((s, l) => s + l.onHandApplied * l.unitCost, 0))} label="Covered by stock on hand" sub={`${Object.keys(stock.byInput).length} input${Object.keys(stock.byInput).length === 1 ? '' : 's'} on hand from receipts, ${money(stockValue)} at invoice`} />
        <Kpi value={money(net.lines.reduce((s, l) => s + l.onOrderApplied * l.unitCost, 0))} label="Covered by orders arriving in time" sub={drafts > 0 ? `${drafts} line${drafts === 1 ? '' : 's'} also on a draft order, not counted` : 'Issued orders less receipts against them'} />
        <Kpi value={money(net.netTotal)} label="Net to buy" sub={`${net.toBuy.length} line${net.toBuy.length === 1 ? '' : 's'}, pack-rounded on the net`} />
      </div>
      {net.lines.length === 0 ? <p className="farm-kpi-sub">Nothing to make, nothing to buy.</p> : (
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead><tr><th>Input</th><th className="num">Gross</th><th className="num">On hand</th><th className="num">On order</th><th className="num">Net</th><th className="num">Pack</th><th className="num">Packs</th><th className="num">Extended</th><th>Need by</th></tr></thead>
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
              <tr className="total"><td colSpan={7}>Net, pack-rounded</td><td className="num">{money(net.netTotal)}</td><td /></tr>
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
        Stock on hand is receipts less issues on closed sowing records, oldest lot first, as of the first sow day. On order is issued purchase orders less the receipts booked against them, applied only where the order&rsquo;s sow date is on or before the day. The net is what is bought; the generator below reads it by supplier, with the catalog lead time giving each line an order-by date.
      </p>
    </Card>
  );
}
