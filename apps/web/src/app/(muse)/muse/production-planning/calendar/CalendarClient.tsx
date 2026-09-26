'use client';

import { PageControls } from '../../_components/PageControls';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, Kpi, num } from '../../_components/ui';
import { MonthGrid, type MonthDay } from '../../_components/timeline/MonthGrid';
import { WEEKDAY_LABELS, type MenuCycleDef, type OrderDef } from '../../_data/menu-cycles';
import type { TimeStudyDoc } from '../../_data/time-studies';
import { isoAddDays, orderBook, weekdayOf } from '../../_engine/orders';
import type { DateRange } from '../../_engine/periods';
import { deliveredConsumption, finishedGoodsOnHand, planHorizon, type HorizonDay } from '../../_engine/production-plan';
import { schedule, scheduleInputsForDay } from '../../_engine/scheduler';
import { useOperationsWorld } from '../../_state/ledger';
import { WorldNote } from '../../_components/ledger/WorldNote';
import { useScenario } from '../../_state/scenario-store';

const SERVICE_WEEKDAYS = [1, 2, 3, 4, 5];
const monthOf = (iso: string) => iso.slice(0, 7);
const monthLabel = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][(mm ?? 1) - 1]} ${y}`;
};
const addMonths = (m: string, n: number) => {
  const [y, mm] = m.split('-').map(Number);
  const total = (y ?? 0) * 12 + ((mm ?? 1) - 1) + n;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
};

export function CalendarClient({
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
  const router = useRouter();
  const A = resolved.assumptions;
  const C = resolved.capacityInputs;
  const [month, setMonth] = useState(monthOf(today));
  const [selected, setSelected] = useState<string | null>(null);

  const monthDays = useMemo(() => {
    const out: string[] = [];
    let d = `${month}-01`;
    while (monthOf(d) === month) {
      out.push(d);
      d = isoAddDays(d, 1);
    }
    return out;
  }, [month]);
  const last = monthDays[monthDays.length - 1]!;
  const horizonTo = last > today ? last : today;

  const pfByChannel = useMemo(() => Object.fromEntries(resolved.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>, [resolved.phaseProfiles]);
  const book = useMemo(
    () =>
      orderBook({
        sites: world.sites,
        customers: resolved.customers,
        cycles,
        orders,
        from: today,
        to: horizonTo,
        channelPriceCents: Object.fromEntries(resolved.phases.map((p) => [p.phase, Math.round(p.pricePerMeal * 100)])) as Record<number, number>,
        recipeNames: Object.fromEntries(resolved.recipes.map((r) => [r.code, r.name])),
        closures,
      }),
    [world.sites, resolved.customers, resolved.phases, resolved.recipes, cycles, orders, today, horizonTo, closures],
  );
  const consumption = useMemo(() => deliveredConsumption(orders, deliveries, resolved.recipes, pfByChannel), [orders, deliveries, resolved.recipes, pfByChannel]);
  const openingLots = useMemo(() => finishedGoodsOnHand({ batches, consumed: consumption, holdLifeDays: A.inventory.chilledHoldLife.value, asOf: today }).lots.filter((l) => l.remaining > 0), [batches, consumption, A, today]);
  const horizon = useMemo(
    () =>
      planHorizon({
        closures,
        from: today,
        to: horizonTo,
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
    [closures, today, horizonTo, book, resolved.recipes, resolved.phases, C, A, pfByChannel, openingLots],
  );

  /** Findings per day: the same scheduler the Day Schedule runs, over each day with work. */
  const findings = useMemo(() => {
    const out: Record<string, number> = {};
    for (const row of horizon.byDate) {
      if (row.batches === 0 && row.filledBase === 0) continue;
      const production = horizon.productionDays.find((p) => p.productionDate === row.date);
      const delivery = horizon.deliveryDays.find((d) => d.date === row.date);
      const inputs = scheduleInputsForDay({
        productionRuns: production?.runs.map((r) => ({ recipeCode: r.recipeCode, batchesScheduled: r.batchesScheduled, produced: r.produced })) ?? [],
        shipments: delivery?.byRecipe.map((r) => ({ recipeCode: r.recipeCode, filledBase: r.filledBase })) ?? [],
        recipes: resolved.recipes,
        studies,
        equipment: resolved.equipment,
        routing: resolved.routing,
      });
      out[row.date] = schedule({
        date: row.date,
        batches: inputs.batches,
        dispatches: inputs.dispatches,
        resources: resolved.resources,
        crews: resolved.crews,
        capacityInputs: C,
        policy: resolved.schedulePolicy,
      }).violations.length;
    }
    return out;
  }, [horizon, resolved.recipes, resolved.equipment, resolved.routing, resolved.resources, resolved.crews, resolved.schedulePolicy, studies, C]);

  const rowByDate = useMemo(() => new Map(horizon.byDate.map((r) => [r.date, r])), [horizon.byDate]);
  const days: MonthDay[] = monthDays.map((date) => {
    const row = rowByDate.get(date);
    const count = findings[date] ?? 0;
    const lines: string[] = [];
    if (row) {
      if (row.batches > 0) lines.push(`${num(row.batches)} ${row.batches === 1 ? 'batch' : 'batches'} · ${num(row.portionsProduced)}`);
      if (row.orderedBase > 0) lines.push(`${num(row.filledBase)} of ${num(row.orderedBase)} shipped`);
      if (row.expiredBase > 0) lines.push(`${num(row.expiredBase)} expired`);
      if (count > 0) lines.push(`${num(count)} ${count === 1 ? 'finding' : 'findings'}`);
    }
    return {
      date,
      lines,
      utilisation: row && row.cyclesAvailable > 0 ? row.utilisation : undefined,
      flagged: Boolean(row && (!row.fits || row.expiredBase > 0 || count > 0)),
      muted: date < today,
      selected: date === selected,
    };
  });

  const inMonth = horizon.byDate.filter((r) => monthOf(r.date) === month);
  const totals = inMonth.reduce(
    (t, r) => ({
      batches: t.batches + r.batches,
      portions: t.portions + r.portionsProduced,
      ordered: t.ordered + r.orderedBase,
      filled: t.filled + r.filledBase,
      expired: t.expired + r.expiredBase,
      used: t.used + r.cyclesUsed,
      available: t.available + r.cyclesAvailable,
      findings: t.findings + (findings[r.date] ?? 0),
      doNotFit: t.doNotFit + (r.fits ? 0 : 1),
    }),
    { batches: 0, portions: 0, ordered: 0, filled: 0, expired: 0, used: 0, available: 0, findings: 0, doNotFit: 0 },
  );

  const pick = (date: string) => {
    setSelected(date);
    if (rowByDate.has(date)) router.push(`/muse/production-planning/schedule?date=${date}`);
  };

  return (
    <>
      <WorldNote isPlan={world.isPlan} />
      <PageControls>
        <button type="button" className="muse-btn ghost" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
        <span className="font-semibold muse-c-ink min-w-32 text-center">{monthLabel(month)}</span>
        <button type="button" className="muse-btn ghost" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>›</button>
        {month !== monthOf(today) && <button type="button" className="muse-btn ghost" onClick={() => setMonth(monthOf(today))}>This month</button>}
      </PageControls>

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={num(totals.batches)} label="Batches in the month" sub={`${num(totals.portions)} portions made`} />
        <Kpi value={totals.available > 0 ? `${num((totals.used / totals.available) * 100, 0)}%` : '—'} label="Cycles used" sub={`${num(totals.used)} of ${num(totals.available)} the plant has on production days`} />
        <Kpi value={num(totals.filled)} label="Portions shipped" sub={totals.ordered > 0 ? `of ${num(totals.ordered)} ordered` : 'Nothing ordered in the month'} />
        <Kpi value={num(totals.expired)} label="Portions expired" sub="Stock that reached the end of its hold life" />
        <Kpi value={num(totals.findings)} label="Findings across the month" sub={totals.doNotFit > 0 ? `${num(totals.doNotFit)} days do not fit the plant` : 'Every day fits the plant'} />
      </div>

      <Card title={monthLabel(month)} className="mt-4">
        <MonthGrid days={days} onPick={pick} selectedDate={selected} />
        <p className="muse-kpi-sub mt-2">
          The horizon runs from today to the end of the month shown, so days before today are dimmed and carry no plan. A cell reads batches and portions made, what shipped against what
          was ordered, stock that expired, and findings from placing that day. The bar is the share of the plant&rsquo;s cycles the day used. A day outlined in the accent does not fit,
          expired stock, or raised a finding. Picking a day with a plan opens it on the{' '}
          <Link className="muse-link" href="/muse/production-planning/schedule">Day Schedule</Link>.
        </p>
      </Card>

      <Card title="The month, day by day" className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table compact">
            <thead>
              <tr><th>Day</th><th className="num">Batches</th><th className="num">Portions made</th><th className="num">Cycles</th><th className="num">Used</th><th className="num">Ordered</th><th className="num">Shipped</th><th className="num">Expired</th><th className="num">Closing stock</th><th className="num">Findings</th><th>Fits</th></tr>
            </thead>
            <tbody>
              {inMonth.length === 0 && <tr><td colSpan={11} className="muse-c-soft">No day of this month is in the horizon: the order book has nothing to make or ship.</td></tr>}
              {inMonth.map((r: HorizonDay) => (
                <tr key={r.date} className={`${r.date === selected ? 'bg-[color:var(--muse-accent-wash)]!' : ''}`}>
                  <td className="whitespace-nowrap!">
                    <button type="button" className="muse-link bg-none! border-0! p-0! [font:inherit]! cursor-pointer!" onClick={() => pick(r.date)}>
                      {WEEKDAY_LABELS[weekdayOf(r.date)]} {r.date}
                    </button>
                  </td>
                  <td className="num">{num(r.batches)}</td>
                  <td className="num">{num(r.portionsProduced)}</td>
                  <td className="num">{num(r.cyclesAvailable)}</td>
                  <td className="num">{r.cyclesAvailable > 0 ? `${num(r.utilisation * 100, 0)}%` : '—'}</td>
                  <td className="num">{num(r.orderedBase)}</td>
                  <td className="num">{num(r.filledBase)}</td>
                  <td className="num">{num(r.expiredBase)}</td>
                  <td className="num">{num(r.closingStockBase)}</td>
                  <td className="num">{num(findings[r.date] ?? 0)}</td>
                  <td>{r.fits ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">
          Production days make the next delivery date&rsquo;s orders in whole batches; overshoot is stock while it is inside hold life and waste the moment it is not. Findings are the
          day&rsquo;s placement against the plant, the crews and the limits — the same run as the Day Schedule. The plan itself is on{' '}
          <Link className="muse-link" href="/muse/production-planning">Production Planning</Link>, and the lots on <Link className="muse-link" href="/muse/inventory">Inventory</Link>.
        </p>
      </Card>
    </>
  );
}
