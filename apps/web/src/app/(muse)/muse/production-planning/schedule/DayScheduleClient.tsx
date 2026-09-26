'use client';

import { PageControls } from '../../_components/PageControls';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, Kpi, StatusBadge, num } from '../../_components/ui';

import { CrewLoadStrip, TimelineGrid, type TimelineBlock, type TimelineLane } from '../../_components/timeline/Timeline';
import { hhmm, spanOf, timeScale } from '../../_components/timeline/scale';
import { clock } from '../../_data/crews';
import { WEEKDAY_LABELS, type MenuCycleDef, type OrderDef } from '../../_data/menu-cycles';
import { TIME_STUDY_STREAM_LABELS, type TimeStudyDoc } from '../../_data/time-studies';
import { isoAddDays, orderBook, weekdayOf } from '../../_engine/orders';
import type { DateRange } from '../../_engine/periods';
import { deliveredConsumption, finishedGoodsOnHand, planHorizon } from '../../_engine/production-plan';
import { schedule, scheduleInputsForDay, type ScheduledBlock } from '../../_engine/scheduler';
import { useOperationsWorld } from '../../_state/ledger';
import { WorldNote } from '../../_components/ledger/WorldNote';
import { useScenario } from '../../_state/scenario-store';

/** The window the order book is rolled through, so a date can be picked inside it. */
const HORIZON_DAYS = 21;
const SERVICE_WEEKDAYS = [1, 2, 3, 4, 5];
const hrs = (h: number) => (Math.round(h * 10) / 10).toFixed(1);
const mins = (m: number) => `${Math.round(m)} min`;
const LANE_LABOR = 'labor-only';

const COLOR: Record<string, string> = {
  batch: 'var(--muse-forest)',
  dispatch: 'var(--muse-olive)',
  day: 'var(--muse-ink-soft)',
};

export function DayScheduleClient({
  today,
  cycles,
  orders: recordedOrders,
  closures,
  batches: recordedBatches,
  deliveries: recordedDeliveries,
  studies,
}: {
  today: string;
  cycles: MenuCycleDef[];
  orders: OrderDef[];
  closures: DateRange[];
  batches: { batchId: string; recipeCode: string; productionDate: string; goodPortions: number }[];
  deliveries: { id: string; deliveredOn: string; meals: number }[];
  studies: TimeStudyDoc[];
}) {
  const { resolved } = useScenario();
  // Plan runs the open forecast's own world; Actual the real kitchen (Roadmap N6 slice 3).
  const world = useOperationsWorld({ orders: recordedOrders, batches: recordedBatches, deliveries: recordedDeliveries });
  const { orders, batches, deliveries } = world;
  const A = resolved.assumptions;
  const C = resolved.capacityInputs;
  const [arrows, setArrows] = useState(true);

  const to = isoAddDays(today, HORIZON_DAYS - 1);
  const pfByChannel = useMemo(() => Object.fromEntries(resolved.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>, [resolved.phaseProfiles]);
  const book = useMemo(
    () =>
      orderBook({
        sites: world.sites,
        customers: resolved.customers,
        cycles,
        orders,
        from: today,
        to,
        channelPriceCents: Object.fromEntries(resolved.phases.map((p) => [p.phase, Math.round(p.pricePerMeal * 100)])) as Record<number, number>,
        recipeNames: Object.fromEntries(resolved.recipes.map((r) => [r.code, r.name])),
        closures,
      }),
    [world.sites, resolved.customers, resolved.phases, resolved.recipes, cycles, orders, today, to, closures],
  );
  const consumption = useMemo(() => deliveredConsumption(orders, deliveries, resolved.recipes, pfByChannel), [orders, deliveries, resolved.recipes, pfByChannel]);
  const openingLots = useMemo(() => finishedGoodsOnHand({ batches, consumed: consumption, holdLifeDays: A.inventory.chilledHoldLife.value, asOf: today }).lots.filter((l) => l.remaining > 0), [batches, consumption, A, today]);
  const horizon = useMemo(
    () =>
      planHorizon({
        closures,
        from: today,
        to,
        book,
        recipes: resolved.recipes,
        capacityInputs: C,
        assumptions: A,
        recipeAssumptions: resolved.recipeAssumptions,
        portionFactorByChannel: pfByChannel,
        openingLots,
        holdLifeDays: A.inventory.chilledHoldLife.value,
        productionWeekdays: SERVICE_WEEKDAYS,
        channels: resolved.phases.map((p) => p.phase),
      }),
    [closures, today, to, book, resolved.recipes, resolved.phases, C, A, pfByChannel, openingLots],
  );

  const dates = useMemo(
    () => [...new Set([...horizon.productionDays.map((d) => d.productionDate), ...horizon.deliveryDays.map((d) => d.date)])].sort(),
    [horizon.productionDays, horizon.deliveryDays],
  );
  // The day is view state: the `date` parameter, so the Calendar can link to one.
  const params = useSearchParams();
  const [date, setDate] = useState<string | null>(null);
  const wanted = date ?? params.get('date');
  const day = wanted && dates.includes(wanted) ? wanted : dates[0] ?? today;

  const inputs = useMemo(() => {
    const production = horizon.productionDays.find((d) => d.productionDate === day);
    const delivery = horizon.deliveryDays.find((d) => d.date === day);
    return scheduleInputsForDay({
      productionRuns: production?.runs.map((r) => ({ recipeCode: r.recipeCode, batchesScheduled: r.batchesScheduled, produced: r.produced })) ?? [],
      shipments: delivery?.byRecipe.map((r) => ({ recipeCode: r.recipeCode, filledBase: r.filledBase })) ?? [],
      recipes: resolved.recipes,
      studies,
      equipment: resolved.equipment,
      routing: resolved.routing,
    });
  }, [horizon.productionDays, horizon.deliveryDays, day, resolved.recipes, resolved.equipment, resolved.routing, studies]);

  const result = useMemo(
    () => schedule({ date: day, batches: inputs.batches, dispatches: inputs.dispatches, resources: resolved.resources, crews: resolved.crews, capacityInputs: C, policy: resolved.schedulePolicy }),
    [day, inputs, resolved.resources, resolved.crews, resolved.schedulePolicy, C],
  );

  // ── The Gantt: one lane per resource, one for the labor-only steps ──────────
  const flagged = useMemo(() => new Set(result.violations.flatMap((v) => ('blockId' in v ? [v.blockId] : []))), [result.violations]);
  const scale = useMemo(() => {
    const s = spanOf(result.blocks, { startMin: result.openMin, endMin: result.closeMin });
    return timeScale(s.startMin, s.endMin, 'hour');
  }, [result]);
  const recipeName = (code: string | null) => (code ? resolved.recipes.find((r) => r.code === code)?.name ?? code : '');
  const blockLabel = (b: ScheduledBlock) => `${b.orderId ?? 'Day'} · ${b.task}`;
  const lanes: TimelineLane[] = useMemo(() => {
    const keys = [...new Set(result.blocks.map((b) => b.resourceKey ?? LANE_LABOR))];
    const ordered = [...keys.filter((k) => k !== LANE_LABOR).sort(), ...(keys.includes(LANE_LABOR) ? [LANE_LABOR] : [])];
    return ordered.map((key) => {
      const rows = result.blocks.filter((b) => (b.resourceKey ?? LANE_LABOR) === key);
      const resource = resolved.resources.find((r) => r.key === key);
      const util = result.metrics.utilizationByResource[key];
      return {
        id: key,
        label: key === LANE_LABOR ? 'No unit — labor only' : resource?.item ?? key,
        sub: key === LANE_LABOR ? `${rows.length} steps` : `${num(resource?.units ?? 1)} × ${num(resource?.concurrentBatches.value ?? 1)} at once${util === undefined ? '' : ` · ${num(util * 100, 0)}% used`}`,
        blocks: rows.map(
          (b): TimelineBlock => ({
            id: b.id,
            startMin: b.startMin,
            endMin: b.endMin,
            label: blockLabel(b),
            color: COLOR[b.stream] ?? 'var(--muse-forest)',
            muted: b.kind === 'chill-stage',
            flagged: flagged.has(b.id),
            title: `${blockLabel(b)} — ${clock(b.startMin)}–${clock(b.endMin)}, ${b.staff} ${b.staff === 1 ? 'person' : 'people'}, ${mins(b.laborMinutes)} labor${b.ccp ? `, ${b.ccp}` : ''}`,
          }),
        ),
      };
    });
  }, [result, resolved.resources, flagged]);

  const arrowPairs = useMemo(() => {
    const pairs: { fromId: string; toId: string }[] = [];
    for (const b of result.blocks) {
      if (!b.orderId || !b.stepId) continue;
      const route = inputs.routes.find((r) => r.recipeCode === b.recipeCode);
      const step = route?.steps.find((s) => s.id === b.stepId);
      for (const a of step?.after ?? []) {
        const from = result.blocks.find((x) => x.orderId === b.orderId && x.stepId === a && (x.kind === 'step' || x.kind === 'cabinet-unload'));
        if (from) pairs.push({ fromId: from.id, toId: b.id });
      }
    }
    return pairs;
  }, [result.blocks, inputs.routes]);

  // ── The crew strip: 15-minute buckets of demand against the people proposed ─
  const BUCKET = 15;
  const buckets = useMemo(() => {
    const out: { startMin: number; endMin: number; required: number; scheduled: number }[] = [];
    for (let t = scale.startMin; t < scale.endMin; t += BUCKET) {
      const required = result.blocks.reduce((n, b) => {
        if (b.staff <= 0 || b.laborMinutes <= 0) return n;
        const end = b.startMin + b.laborMinutes / b.staff;
        return b.startMin < t + BUCKET && end > t ? n + b.staff : n;
      }, 0);
      const scheduled = resolved.crews.reduce((n, c) => (c.startMin.value < t + BUCKET && c.endMin.value > t ? n + c.headcount.value : n), 0);
      out.push({ startMin: t, endMin: t + BUCKET, required, scheduled });
    }
    return out;
  }, [result.blocks, resolved.crews, scale]);
  const shortBuckets = buckets.filter((b) => b.required > b.scheduled);

  const blocksByStart = useMemo(() => [...result.blocks].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin), [result.blocks]);
  const M = result.metrics;
  const P = resolved.schedulePolicy;
  const dayLabel = `${WEEKDAY_LABELS[weekdayOf(day)]} ${day}`;

  return (
    <>
      <WorldNote isPlan={world.isPlan} />
      <PageControls>
        <label className="muse-kpi-sub inline-flex items-center gap-2">
          Day
          <select className="muse-select" value={day} aria-label="Day to place" onChange={(e) => setDate(e.target.value)}>
            {dates.length === 0 && <option value={today}>{today} — no orders</option>}
            {dates.map((d) => (
              <option key={d} value={d}>
                {WEEKDAY_LABELS[weekdayOf(d)]} {d}
              </option>
            ))}
          </select>
        </label>
      </PageControls>
      <PageControls group="view">
        <button type="button" className="muse-btn ghost" aria-pressed={arrows} onClick={() => setArrows(!arrows)}>
          {arrows ? 'Hide precedence' : 'Show precedence'}
        </button>
      </PageControls>
      <div className="flex flex-wrap gap-3 items-end mb-3!">
        <span className="muse-kpi-sub muse-c-soft">
          {P.crewMode.value === 'constrained' ? 'Constrained: staffed steps wait for free crew' : 'Requirement: crews are checked, never limit placement'} · dispatch{' '}
          {P.dispatchDirection.value} from {clock(P.deliveryTimeMin.value)} <StatusBadge status={P.deliveryTimeMin.status} title={P.deliveryTimeMin.note} />
        </span>
      </div>

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={`${num(M.batchesPlaced)}`} label="Batches placed" sub={M.batchesUnplaced > 0 ? `${num(M.batchesUnplaced)} unplaced · ${num(M.portionsPlaced)} portions` : `${num(M.portionsPlaced)} portions`} />
        <Kpi value={num(M.portionsShipped)} label="Portions shipped" sub={`${num(M.dispatchesPlaced)} dispatch ${M.dispatchesPlaced === 1 ? 'order' : 'orders'}${M.dispatchesUnplaced ? `, ${num(M.dispatchesUnplaced)} unplaced` : ''}`} />
        <Kpi value={M.firstStartMin === null ? '—' : `${clock(M.firstStartMin)}–${clock(M.lastEndMin ?? 0)}`} label="The day on the clock" sub={`${hrs(M.makespanMin / 60)} h from first start to last end`} />
        <Kpi value={`${hrs(M.laborHours)} h`} label="Labor the day needs" sub={`${hrs(M.batchLaborHours)} h batch · ${hrs(M.dispatchLaborHours)} h dispatch · ${hrs(M.closedownHours)} h closedown`} />
        <Kpi value={M.bindingResourceKey ? `${num((M.utilizationByResource[M.bindingResourceKey] ?? 0) * 100, 0)}%` : '—'} label="Binding resource" sub={M.bindingResourceKey ? resolved.resources.find((r) => r.key === M.bindingResourceKey)?.item ?? M.bindingResourceKey : 'Nothing ran on a unit'} />
        <Kpi value={resolved.crews.length ? `${hrs(M.idleCrewHours)} h` : 'None'} label={resolved.crews.length ? 'Idle crew hours' : 'Crews proposed'} sub={resolved.crews.length ? `${hrs(M.crewHours)} h scheduled against ${hrs(M.laborHours + M.closedownHours)} h of work` : <Link className="muse-link" href="/muse/capacity">Propose a crew on Capacity</Link>} />
      </div>

      <Card title={`The day placed — ${dayLabel}`} className="mt-4">
        {result.blocks.length === 0 ? (
          <p className="muse-kpi-sub">Nothing to place on this day: the order book has no batches to cook and no portions to ship.</p>
        ) : (
          <TimelineGrid scale={scale} lanes={lanes} arrows={arrows ? arrowPairs : []} />
        )}
        <p className="muse-kpi-sub mt-2">
          One lane per Phase 1 unit, plus the steps that need no unit. Batch-stream blocks are dark, dispatch lighter, closedown grey; the dashed block is the chill stage, which runs
          unattended. A block outlined in the accent is named in a violation below. Precedence lines are the route&rsquo;s finish-to-start edges, derived from each recipe&rsquo;s labor
          standard and editable per step in the scenario. The table below is the same placement.
        </p>
      </Card>

      <Card title="Crew load — people the placed work needs, against the people proposed" className="mt-4">
        <CrewLoadStrip scale={scale} buckets={buckets} />
        <p className="muse-kpi-sub mt-2">
          Fifteen-minute buckets. The bar is the demand of the work placed in the bucket; the line is the headcount the proposed crews have on the floor. A bucket where the demand is
          higher is drawn in the accent{resolved.crews.length === 0 ? '; no crew is proposed, so the line sits at zero and every bucket with work shows short' : ''}.
        </p>
        <div className="muse-scroll-x mt-3">
          <table className="muse-table compact">
            <thead>
              <tr><th>Interval</th><th className="num">People needed</th><th className="num">People scheduled</th><th className="num">Short by</th></tr>
            </thead>
            <tbody>
              {shortBuckets.length === 0 && (
                <tr><td colSpan={4} className="muse-c-soft">{resolved.crews.length === 0 ? 'No crew is proposed, so nothing is checked.' : 'Every bucket has the people the placed work needs.'}</td></tr>
              )}
              {shortBuckets.map((b) => (
                <tr key={b.startMin}>
                  <td>{hhmm(b.startMin)}–{hhmm(b.endMin)}</td>
                  <td className="num">{num(b.required)}</td>
                  <td className="num">{num(b.scheduled)}</td>
                  <td className="num">{num(b.required - b.scheduled)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`What the plan breaks — ${num(result.violations.length)} ${result.violations.length === 1 ? 'finding' : 'findings'}`} className="mt-4">
        {result.violations.length === 0 ? (
          <p className="muse-kpi-sub">Nothing: every step has a free unit, the cooling clock holds, no chill completes unattended, the dispatch meets its delivery time and the day closes on time.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table compact">
              <thead><tr><th>Finding</th><th>Detail</th></tr></thead>
              <tbody>
                {result.violations.map((v, i) => (
                  <tr key={`${v.kind}-${i}`}>
                    <td className="whitespace-nowrap! font-medium!">{v.kind}</td>
                    <td>{v.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muse-kpi-sub mt-2">
          Findings are facts about this placement: the limit and what the plan does against it. Nothing is moved to make them go away.
        </p>
      </Card>

      <Card title="Every block placed" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table compact">
            <thead>
              <tr><th className="num">Start</th><th className="num">End</th><th>Order</th><th>Task</th><th>Stream</th><th>Unit</th><th className="num">People</th><th className="num">Labor min</th><th>CCP</th></tr>
            </thead>
            <tbody>
              {blocksByStart.length === 0 && <tr><td colSpan={9} className="muse-c-soft">Nothing placed.</td></tr>}
              {blocksByStart.map((b) => (
                <tr key={b.id} className={`${flagged.has(b.id) ? 'bg-[color:var(--muse-accent-wash)]!' : ''}`}>
                  <td className="num">{clock(b.startMin)}</td>
                  <td className="num">{clock(b.endMin)}</td>
                  <td>{b.orderId ?? '—'}{b.recipeCode ? <div className="muse-c-faint muse-fs-xs">{recipeName(b.recipeCode)}</div> : null}</td>
                  <td>{b.task}</td>
                  <td className="muse-c-soft">{b.stream === 'day' ? 'Day' : TIME_STUDY_STREAM_LABELS[b.stream]}</td>
                  <td className="muse-c-soft">{b.resourceKey ?? '—'}</td>
                  <td className="num">{num(b.staff)}</td>
                  <td className="num">{num(b.laborMinutes, 1)}</td>
                  <td>{b.ccp ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">
          Labor minutes are the recipe&rsquo;s time study; at the cabinet they are the study&rsquo;s chill line, split across the load and the unload. The cabinet&rsquo;s minutes and people
          come from <Link className="muse-link" href="/muse/capacity">Capacity</Link>; the routes and the units from{' '}
          <Link className="muse-link" href="/muse/time-studies">Time Studies</Link> and <Link className="muse-link" href="/muse/equipment">Equipment</Link>. Two weeks of staff demand for
          CompTable are on <Link className="muse-link" href="/muse/schedule">Schedule</Link>.
        </p>
      </Card>
    </>
  );
}
