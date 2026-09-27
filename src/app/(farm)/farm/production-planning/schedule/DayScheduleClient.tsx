'use client';

import { PageControls } from '@/components/PageControls';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, Kpi, StatusBadge, num } from '@/components/ui';

import { CrewLoadStrip, TimelineGrid, type TimelineBlock, type TimelineLane } from '@/components/timeline/Timeline';
import { hhmm, spanOf, timeScale } from '@/components/timeline/scale';
import { clock } from '@/data/crews';
import { WEEKDAY_LABELS, type SubscriptionCycleDef, type OrderDef } from '@/data/subscription-cycles';
import { TIME_STUDY_STREAM_LABELS, type TimeStudyDoc } from '@/data/time-studies';
import { datesBetween, isoAddDays, orderBook, weekdayOf } from '@/engine/orders';
import type { DateRange } from '@/engine/periods';
import { distributedConsumption, finishedGoodsOnHand, planHorizon } from '@/engine/production-plan';
import { schedule, scheduleInputsForDay, type ScheduledBlock } from '@/engine/scheduler';
import { cycleDaysByCode, staffDemand, traysOnShelf } from '@/engine/staff-demand';
import { useOperationsWorld } from '@/state/ledger';
import { WorldNote } from '@/components/ledger/WorldNote';
import { useScenario } from '@/state/scenario-store';

/** The window the order book is rolled through, so a date can be picked inside it. */
const HORIZON_DAYS = 21;
const SERVICE_WEEKDAYS = [1, 2, 3, 4, 5];
const hrs = (h: number) => (Math.round(h * 10) / 10).toFixed(1);
const mins = (m: number) => `${Math.round(m)} min`;
const LANE_LABOR = 'labor-only';

const COLOR: Record<string, string> = {
  sowing: 'var(--farm-forest)',
  harvest: 'var(--farm-olive)',
  day: 'var(--farm-ink-soft)',
};

export function DayScheduleClient({
  today,
  cycles,
  orders: recordedOrders,
  closures,
  sowings: recordedSowings,
  distributions: recordedDistributions,
  studies,
}: {
  today: string;
  cycles: SubscriptionCycleDef[];
  orders: OrderDef[];
  closures: DateRange[];
  sowings: { sowingId: string; growPlanCode: string; productionDate: string; goodUnits: number }[];
  distributions: { id: string; distributedOn: string; units: number }[];
  studies: TimeStudyDoc[];
}) {
  const { resolved } = useScenario();
  // Plan runs the open forecast's own world; Actual the real farm (Roadmap N6 slice 3).
  const world = useOperationsWorld({ orders: recordedOrders, sowings: recordedSowings, distributions: recordedDistributions });
  const { orders, sowings, distributions } = world;
  const A = resolved.assumptions;
  const C = resolved.capacityInputs;
  const [arrows, setArrows] = useState(true);

  const to = isoAddDays(today, HORIZON_DAYS - 1);
  const pfByChannel = useMemo(() => Object.fromEntries(resolved.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>, [resolved.phaseProfiles]);
  const book = useMemo(
    () =>
      orderBook({
        pickupPoints: world.pickupPoints,
        subscribers: resolved.subscribers,
        cycles,
        orders,
        from: today,
        to,
        channelPriceCents: Object.fromEntries(resolved.phases.map((p) => [p.phase, Math.round(p.pricePerUnit * 100)])) as Record<number, number>,
        growPlanNames: Object.fromEntries(resolved.growPlans.map((r) => [r.code, r.name])),
        closures,
      }),
    [world.pickupPoints, resolved.subscribers, resolved.phases, resolved.growPlans, cycles, orders, today, to, closures],
  );
  const consumption = useMemo(() => distributedConsumption(orders, distributions, resolved.growPlans, pfByChannel), [orders, distributions, resolved.growPlans, pfByChannel]);
  const openingLots = useMemo(() => finishedGoodsOnHand({ sowings, consumed: consumption, shelfLifeDays: A.inventory.blackoutShelfLife.value, asOf: today, growPlans: resolved.growPlans }).lots.filter((l) => l.remaining > 0), [sowings, consumption, A, today, resolved.growPlans]);
  const horizon = useMemo(
    () =>
      planHorizon({
        closures,
        from: today,
        to,
        book,
        growPlans: resolved.growPlans,
        capacityInputs: C,
        assumptions: A,
        growPlanAssumptions: resolved.growPlanAssumptions,
        unitFactorByChannel: pfByChannel,
        openingLots,
        shelfLifeDays: A.inventory.blackoutShelfLife.value,
        productionWeekdays: SERVICE_WEEKDAYS,
        channels: resolved.phases.map((p) => p.phase),
      }),
    [closures, today, to, book, resolved.growPlans, resolved.phases, C, A, pfByChannel, openingLots],
  );

  // Every day of the window: trays on the shelves are watered on days nothing is sown or harvested.
  const dates = useMemo(() => datesBetween(today, to), [today, to]);
  // The day is view state: the `date` parameter, so the Calendar can link to one.
  const params = useSearchParams();
  const [date, setDate] = useState<string | null>(null);
  const wanted = date ?? params.get('date');
  const day = wanted && dates.includes(wanted) ? wanted : today;

  const inputs = useMemo(() => {
    const production = horizon.productionDays.find((d) => d.productionDate === day);
    const distribution = horizon.distributionDays.find((d) => d.date === day);
    return scheduleInputsForDay({
      productionRuns: production?.runs.map((r) => ({ growPlanCode: r.growPlanCode, sowingsScheduled: r.sowingsScheduled, produced: r.produced })) ?? [],
      shipments: distribution?.byGrowPlan.map((r) => ({ growPlanCode: r.growPlanCode, filledBase: r.filledBase })) ?? [],
      growPlans: resolved.growPlans,
      studies,
      equipment: resolved.equipment,
      routing: resolved.routing,
    });
  }, [horizon.productionDays, horizon.distributionDays, day, resolved.growPlans, resolved.equipment, resolved.routing, studies]);

  // The daily stream: the trays on the shelves that day on each plan's daily lines, beside the clock.
  const shelf = useMemo(() => traysOnShelf(horizon.productionDays, cycleDaysByCode(resolved.growPlans), day, day)[0] ?? null, [horizon.productionDays, resolved.growPlans, day]);
  const daily = useMemo(() => (shelf ? staffDemand({ from: day, to: day, days: [], shelf: [shelf], studies }).days[0] ?? null : null), [shelf, studies, day]);
  const dailyLines = daily?.lines.filter((l) => l.stream === 'daily') ?? [];
  const dailyHours = daily?.dailyStaffHours ?? 0;
  const traysOnTheShelves = shelf?.trays.reduce((t, x) => t + x.trays, 0) ?? 0;

  const result = useMemo(
    () => schedule({ date: day, sowings: inputs.sowings, dispatches: inputs.dispatches, resources: resolved.resources, crews: resolved.crews, capacityInputs: C, policy: resolved.schedulePolicy }),
    [day, inputs, resolved.resources, resolved.crews, resolved.schedulePolicy, C],
  );

  // ── The Gantt: one lane per resource, one for the labor-only steps ──────────
  const flagged = useMemo(() => new Set(result.violations.flatMap((v) => ('blockId' in v ? [v.blockId] : []))), [result.violations]);
  const scale = useMemo(() => {
    const s = spanOf(result.blocks, { startMin: result.openMin, endMin: result.closeMin });
    return timeScale(s.startMin, s.endMin, 'hour');
  }, [result]);
  const growPlanName = (code: string | null) => (code ? resolved.growPlans.find((r) => r.code === code)?.name ?? code : '');
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
        sub: key === LANE_LABOR ? `${rows.length} steps` : `${num(resource?.units ?? 1)} × ${num(resource?.concurrentSowings.value ?? 1)} at once${util === undefined ? '' : ` · ${num(util * 100, 0)}% used`}`,
        blocks: rows.map(
          (b): TimelineBlock => ({
            id: b.id,
            startMin: b.startMin,
            endMin: b.endMin,
            label: blockLabel(b),
            color: COLOR[b.stream] ?? 'var(--farm-forest)',
            flagged: flagged.has(b.id),
            title: `${blockLabel(b)} — ${clock(b.startMin)}–${clock(b.endMin)}, ${b.staff} ${b.staff === 1 ? 'person' : 'people'}, ${mins(b.laborMinutes)} labor${b.controlPoint ? `, ${b.controlPoint}` : ''}`,
          }),
        ),
      };
    });
  }, [result, resolved.resources, flagged]);

  const arrowPairs = useMemo(() => {
    const pairs: { fromId: string; toId: string }[] = [];
    for (const b of result.blocks) {
      if (!b.orderId || !b.stepId) continue;
      const route = inputs.routes.find((r) => r.growPlanCode === b.growPlanCode);
      const step = route?.steps.find((s) => s.id === b.stepId);
      for (const a of step?.after ?? []) {
        const from = result.blocks.find((x) => x.orderId === b.orderId && x.stepId === a && x.kind === 'step');
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
        <label className="farm-kpi-sub inline-flex items-center gap-2">
          Day
          <select className="farm-select" value={day} aria-label="Day to place" onChange={(e) => setDate(e.target.value)}>
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
        <button type="button" className="farm-btn ghost" aria-pressed={arrows} onClick={() => setArrows(!arrows)}>
          {arrows ? 'Hide precedence' : 'Show precedence'}
        </button>
      </PageControls>
      <div className="flex flex-wrap gap-3 items-end mb-3!">
        <span className="farm-kpi-sub farm-c-soft">
          {P.crewMode.value === 'constrained' ? 'Constrained: staffed steps wait for free crew' : 'Requirement: crews are checked, never limit placement'} · harvest{' '}
          {P.harvestDirection.value} from {clock(P.distributionTimeMin.value)} <StatusBadge status={P.distributionTimeMin.status} title={P.distributionTimeMin.note} />
        </span>
      </div>

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={`${num(M.sowingsPlaced)}`} label="Sowings placed" sub={M.sowingsUnplaced > 0 ? `${num(M.sowingsUnplaced)} unplaced · ${num(M.unitsPlaced)} trays` : `${num(M.unitsPlaced)} trays`} />
        <Kpi value={num(M.unitsShipped)} label="Trays harvested" sub={`${num(M.dispatchesPlaced)} ${M.dispatchesPlaced === 1 ? 'plan' : 'plans'} to the distribution${M.dispatchesUnplaced ? `, ${num(M.dispatchesUnplaced)} unplaced` : ''}`} />
        <Kpi value={num(traysOnTheShelves)} label="Trays on the shelves" sub={`${hrs(dailyHours)} h of daily stream, off the clock`} />
        <Kpi value={M.firstStartMin === null ? '—' : `${clock(M.firstStartMin)}–${clock(M.lastEndMin ?? 0)}`} label="The day on the clock" sub={`${hrs(M.makespanMin / 60)} h from first start to last end`} />
        <Kpi value={`${hrs(M.laborHours + dailyHours)} h`} label="Labor the day needs" sub={`${hrs(M.sowingLaborHours)} h sowing · ${hrs(dailyHours)} h daily · ${hrs(M.harvestLaborHours)} h harvest · ${hrs(M.closedownHours)} h closedown`} />
        <Kpi value={M.bindingResourceKey ? `${num((M.utilizationByResource[M.bindingResourceKey] ?? 0) * 100, 0)}%` : '—'} label="Binding resource" sub={M.bindingResourceKey ? resolved.resources.find((r) => r.key === M.bindingResourceKey)?.item ?? M.bindingResourceKey : 'Nothing ran on a unit'} />
        <Kpi value={resolved.crews.length ? `${hrs(M.idleCrewHours)} h` : 'None'} label={resolved.crews.length ? 'Idle crew hours' : 'Crews proposed'} sub={resolved.crews.length ? `${hrs(M.crewHours)} h scheduled against ${hrs(M.laborHours + M.closedownHours)} h of placed work` : <Link className="farm-link" href="/farm/capacity">Propose a crew on Capacity</Link>} />
      </div>

      <Card title={`The day placed — ${dayLabel}`} className="mt-4">
        {result.blocks.length === 0 ? (
          <p className="farm-kpi-sub">Nothing to place on this day: the order book sows nothing and harvests nothing.{traysOnTheShelves > 0 ? ' The trays on the shelves take the daily stream below.' : ''}</p>
        ) : (
          <TimelineGrid scale={scale} lanes={lanes} arrows={arrows ? arrowPairs : []} />
        )}
        <p className="farm-kpi-sub mt-2">
          One lane per unit the work runs on, plus one for the steps that need none. Sowing-stream blocks are dark, harvest lighter, closedown grey. A block outlined in the accent is
          named in a finding below. Precedence lines are the route&rsquo;s finish-to-start edges, derived from each plan&rsquo;s labor standard and editable per step in the scenario. The
          table below is the same placement; the daily stream is not on the clock.
        </p>
      </Card>

      <Card title="Crew load — people the placed work needs, against the people proposed" className="mt-4">
        <CrewLoadStrip scale={scale} buckets={buckets} />
        <p className="farm-kpi-sub mt-2">
          Fifteen-minute buckets. The bar is the demand of the work placed in the bucket; the line is the headcount the proposed crews have on the floor. A bucket where the demand is
          higher is drawn in the accent{resolved.crews.length === 0 ? '; no crew is proposed, so the line sits at zero and every bucket with work shows short' : ''}.
        </p>
        <div className="farm-scroll-x mt-3">
          <table className="farm-table compact">
            <thead>
              <tr><th>Interval</th><th className="num">People needed</th><th className="num">People scheduled</th><th className="num">Short by</th></tr>
            </thead>
            <tbody>
              {shortBuckets.length === 0 && (
                <tr><td colSpan={4} className="farm-c-soft">{resolved.crews.length === 0 ? 'No crew is proposed, so nothing is checked.' : 'Every bucket has the people the placed work needs.'}</td></tr>
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

      <Card title={`Daily stream — ${num(traysOnTheShelves)} trays on the shelves`} className="mt-4">
        {dailyLines.length === 0 ? (
          <p className="farm-kpi-sub">No trays are on the shelves on this day.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table compact">
              <thead>
                <tr><th>Task</th><th>Station</th><th>Plans</th><th className="num">People at once</th><th className="num">Staff-minutes</th></tr>
              </thead>
              <tbody>
                {dailyLines.map((l) => (
                  <tr key={`${l.task}|${l.station ?? ''}`}>
                    <td>{l.task}</td>
                    <td className="farm-c-soft">{l.station ?? '—'}</td>
                    <td className="farm-c-soft">{l.growPlanCodes.join(', ')}</td>
                    <td className="num">{num(l.headcount)}</td>
                    <td className="num">{num(l.hours * 60, 1)}</td>
                  </tr>
                ))}
                <tr className="font-semibold!">
                  <td colSpan={4}>Daily stream, {hrs(dailyHours)} h</td>
                  <td className="num">{num(dailyHours * 60, 1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {shelf && (
          <p className="farm-kpi-sub mt-2">
            On the shelves: {shelf.trays.map((t) => `${t.growPlanCode} ${num(t.trays)} ${t.trays === 1 ? 'tray' : 'trays'}`).join(' · ')}.
            {daily && daily.estimatedGrowPlans.length > 0 ? ` On the estimated study until an observed one is approved: ${daily.estimatedGrowPlans.join(', ')}.` : ''}
          </p>
        )}
        <p className="farm-kpi-sub mt-2">
          A daily line is one day&rsquo;s minutes per tray from the plan&rsquo;s labor standard times the trays on the shelves that day; a fixed daily line is once a day per plan. The
          hours count in the day&rsquo;s labor above and carry no clock time, so the crew load and the findings cover only the placed work. The trays are the horizon&rsquo;s sowings
          through each plan&rsquo;s cycle days, as on <Link className="farm-link" href="/farm/schedule">Schedule</Link>.
        </p>
      </Card>

      <Card title={`What the plan breaks — ${num(result.violations.length)} ${result.violations.length === 1 ? 'finding' : 'findings'}`} className="mt-4">
        {result.violations.length === 0 ? (
          <p className="farm-kpi-sub">Nothing: every step has a free unit, the harvest meets its distribution time and the day closes on time.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table compact">
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
        <p className="farm-kpi-sub mt-2">
          Findings are facts about this placement: the limit and what the plan does against it. Nothing is moved to make them go away.
        </p>
      </Card>

      <Card title="Every block placed" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              <tr><th className="num">Start</th><th className="num">End</th><th>Order</th><th>Task</th><th>Stream</th><th>Unit</th><th className="num">People</th><th className="num">Labor min</th><th>CONTROL POINT</th></tr>
            </thead>
            <tbody>
              {blocksByStart.length === 0 && <tr><td colSpan={9} className="farm-c-soft">Nothing placed.</td></tr>}
              {blocksByStart.map((b) => (
                <tr key={b.id} className={`${flagged.has(b.id) ? 'bg-[color:var(--farm-accent-wash)]!' : ''}`}>
                  <td className="num">{clock(b.startMin)}</td>
                  <td className="num">{clock(b.endMin)}</td>
                  <td>{b.orderId ?? '—'}{b.growPlanCode ? <div className="farm-c-faint farm-fs-xs">{growPlanName(b.growPlanCode)}</div> : null}</td>
                  <td>{b.task}</td>
                  <td className="farm-c-soft">{b.stream === 'day' ? 'Day' : TIME_STUDY_STREAM_LABELS[b.stream]}</td>
                  <td className="farm-c-soft">{b.resourceKey ?? '—'}</td>
                  <td className="num">{num(b.staff)}</td>
                  <td className="num">{num(b.laborMinutes, 1)}</td>
                  <td>{b.controlPoint ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          Labor minutes are the plan&rsquo;s time study: its sowing lines per tray sown, its harvest lines per tray shipped. The routes come from{' '}
          <Link className="farm-link" href="/farm/time-studies">Time Studies</Link>, the units from <Link className="farm-link" href="/farm/grow-units">Grow Units</Link> and the crews
          from <Link className="farm-link" href="/farm/capacity">Capacity</Link>. Two weeks of staff demand for Staffing are on <Link className="farm-link" href="/farm/schedule">Schedule</Link>.
        </p>
      </Card>
    </>
  );
}
