'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Kpi, num } from '../_components/ui';

import { WEEKDAY_LABELS, type MenuCycleDef, type OrderDef } from '../_data/menu-cycles';
import { TIME_STUDY_STREAM_LABELS, type TimeStudyDoc } from '../_data/time-studies';
import { orderBook, isoAddDays, weekdayOf } from '../_engine/orders';
import { deliveredConsumption, finishedGoodsOnHand, planHorizon } from '../_engine/production-plan';
import { staffDemand } from '../_engine/staff-demand';
import type { DateRange } from '../_engine/periods';
import { useOperationsWorld } from '../_state/ledger';
import { WorldNote } from '../_components/ledger/WorldNote';
import { useScenario } from '../_state/scenario-store';

const SERVICE_WEEKDAYS = [1, 2, 3, 4, 5];
/** The demand window sent to CompTable. */
const DEMAND_DAYS = 14;
/** Deliveries this far past the window are made on production days inside it. */
const DELIVERY_LOOKAHEAD_DAYS = 7;

const hours = (h: number) => num(h, 1);

export function ScheduleClient({
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
  const holdLife = A.inventory.chilledHoldLife.value;

  // ── Staff demand: the next two weeks of production, from the order book ───
  const from = today;
  const to = isoAddDays(today, DEMAND_DAYS - 1);
  const bookTo = isoAddDays(to, DELIVERY_LOOKAHEAD_DAYS);
  const pfByChannel = useMemo(() => Object.fromEntries(resolved.phaseProfiles.map((p) => [p.phase, p.portionFactor.value])) as Record<number, number>, [resolved.phaseProfiles]);
  const book = useMemo(
    () =>
      orderBook({
        sites: world.sites,
        customers: resolved.customers,
        cycles,
        orders,
        from,
        to: bookTo,
        channelPriceCents: Object.fromEntries(resolved.phases.map((p) => [p.phase, Math.round(p.pricePerMeal * 100)])) as Record<number, number>,
        recipeNames: Object.fromEntries(resolved.recipes.map((r) => [r.code, r.name])),
        closures,
      }),
    [world.sites, resolved.customers, resolved.phases, resolved.recipes, cycles, orders, from, bookTo, closures],
  );
  const consumption = useMemo(() => deliveredConsumption(orders, deliveries, resolved.recipes, pfByChannel), [orders, deliveries, resolved.recipes, pfByChannel]);
  const openingLots = useMemo(() => finishedGoodsOnHand({ batches, consumed: consumption, holdLifeDays: holdLife, asOf: from }).lots.filter((l) => l.remaining > 0), [batches, consumption, holdLife, from]);
  const horizon = useMemo(
    () =>
      planHorizon({
        closures,
        from,
        to: bookTo,
        book,
        recipes: resolved.recipes,
        capacityInputs: C,
        assumptions: A,
        recipeAssumptions: resolved.recipeAssumptions,
        portionFactorByChannel: pfByChannel,
        openingLots,
        holdLifeDays: holdLife,
        productionWeekdays: SERVICE_WEEKDAYS,
        channels: resolved.phases.map((p) => p.phase),
      }),
    [closures, from, bookTo, book, resolved.recipes, C, A, pfByChannel, openingLots, holdLife, resolved.phases],
  );
  const dispatch = useMemo(
    () => horizon.deliveryDays.map((d) => ({ date: d.date, shipments: d.byRecipe.map((r) => ({ recipeCode: r.recipeCode, recipeName: r.recipeName, portions: r.filledBase })) })),
    [horizon.deliveryDays],
  );
  const demand = useMemo(() => staffDemand({ from, to, days: horizon.productionDays, dispatch, studies }), [from, to, horizon.productionDays, dispatch, studies]);
  const busiest = demand.days.reduce<(typeof demand.days)[number] | null>((m, d) => (!m || d.staffHours > m.staffHours ? d : m), null);
  const [open, setOpen] = useState<string | null>(null);
  const recipeName = (code: string) => resolved.recipes.find((r) => r.code === code)?.name ?? code;

  return (
    <>
      <WorldNote isPlan={world.isPlan} />
      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={num(demand.productionDays)} label="Production days with batches" sub={`${from} to ${to}; ${num(demand.deliveryDays)} delivery days`} />
        <Kpi value={hours(demand.staffHours)} label="Staff-hours required" sub={demand.estimatedRecipes.length ? `From each recipe's labor standard; ${num(demand.estimatedRecipes.length)} on an estimate` : "From each recipe's labor standard"} />
        <Kpi value={busiest && busiest.staffHours > 0 ? hours(busiest.staffHours) : '—'} label="Busiest day, staff-hours" sub={busiest && busiest.staffHours > 0 ? `${WEEKDAY_LABELS[weekdayOf(busiest.date)]} ${busiest.date}` : undefined} />
        <Kpi value={num(demand.uncoveredRecipes.length)} label="Recipes with no time study" sub="Their batches and shipments carry no staff demand" />
      </div>
      {demand.uncoveredRecipes.length > 0 && (
        <p className="muse-kpi-sub mt-2">
          Batches or shipments of {demand.uncoveredRecipes.map((c) => `${c} ${recipeName(c)}`).join(', ')} are in the window with no time study at all, so no staff demand is counted for them. A study is adopted on <Link className="muse-link" href="/muse/time-studies">Time Studies</Link>.
        </p>
      )}

      {demand.estimatedRecipes.length > 0 && (
        <p className="muse-kpi-sub mt-2">
          {demand.estimatedRecipes.map((c) => `${c} ${recipeName(c)}`).join(', ')} {demand.estimatedRecipes.length === 1 ? 'is' : 'are'} staffed from an estimated time study: no observed study has been adopted yet. The estimate stands until one is recorded and adopted on <Link className="muse-link" href="/muse/time-studies">Time Studies</Link>.
        </p>
      )}

      <Card title={`Staff demand — ${from} to ${to}`} className="mt-4">
        <div className="muse-scroll-x">
          <table className="muse-table compact">
            <thead>
              {open ? (
                <tr>
                  <th>Task</th>
                  <th>Stream</th>
                  <th>Station</th>
                  <th className="num">People</th>
                  <th className="num">Staff-hours</th>
                  <th>Recipes</th>
                </tr>
              ) : (
                <tr><th colSpan={6}>Day</th></tr>
              )}
            </thead>
            <tbody>
              {demand.days.length === 0 && (
                <tr><td colSpan={6} className="muse-c-soft">No production or delivery day in the window: the order book has no deliveries to make.</td></tr>
              )}
              {demand.days.map((d) => {
                const isOpen = open === d.date;
                return (
                  <Fragment key={d.date}>
                    <tr className={`muse-group-row${isOpen ? ' is-open' : ''}`}>
                      <td colSpan={6} className="p-0!">
                        <button type="button" className="muse-group-row-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : d.date)}>
                          <span className="font-semibold muse-c-accent-hi">
                            {WEEKDAY_LABELS[weekdayOf(d.date)]} {d.date}
                            <span className="muse-c-soft font-normal ml-[0.6rem]! muse-fs-xs">
                              {num(d.batches)} {d.batches === 1 ? 'batch' : 'batches'} · {num(d.portions)} portions produced · {num(d.portionsShipped)} shipped
                            </span>
                          </span>
                          <span className="inline-flex gap-4 items-baseline">
                            <span className="muse-mono muse-fs-xs">{hours(d.staffHours)} staff-hours</span>
                            <span className="muse-c-soft muse-fs-xs min-w-10 text-right">{isOpen ? 'Close' : 'Open'}</span>
                          </span>
                        </button>
                      </td>
                    </tr>
                    {isOpen && d.lines.length === 0 && (
                      <tr><td colSpan={6} className="muse-c-soft">No staff demand counted for this day.</td></tr>
                    )}
                    {isOpen &&
                      d.lines.map((l) => (
                        <tr key={`${d.date}:${l.stream}:${l.task}:${l.station ?? ''}`}>
                          <td className="font-medium!">{l.task}</td>
                          <td className="muse-c-soft">{TIME_STUDY_STREAM_LABELS[l.stream]}</td>
                          <td className="muse-c-soft">{l.station ?? '—'}</td>
                          <td className="num">{num(l.headcount)}</td>
                          <td className="num">{num(l.hours, 2)}</td>
                          <td className="muse-c-soft">{l.recipeCodes.join(', ')}</td>
                        </tr>
                      ))}
                    {isOpen && d.uncovered.length > 0 && (
                      <tr>
                        <td colSpan={6} className="muse-c-soft">
                          No time study: {d.uncovered.map((u) => `${u.recipeCode} (${num(u.batches)} ${u.batches === 1 ? 'batch' : 'batches'}, ${num(u.portions)} portions produced, ${num(u.portionsShipped)} shipped)`).join('; ')}.
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muse-kpi-sub mt-2">
          Production and delivery days come from the order book rolled through production, the same plan as <Link className="muse-link" href="/muse/production-planning">Production Planning</Link>. Batch lines fall on the production day: a fixed line counts once per batch, a per-portion line scales with the portions produced. Dispatch lines fall on the delivery day: a per-portion line scales with the portions shipped, a fixed line counts once that day. People is the most any recipe&rsquo;s study names for the task; tasks are not yet placed on the clock, so the day&rsquo;s peak headcount is not stated. No positions and no pay.
        </p>
      </Card>

      <Card title="CompTable" className="mt-4">
        <table className="muse-table">
          <tbody>
            <tr>
              <td className="font-medium!">Staff demand prepared</td>
              <td className="muse-c-soft">{num(demand.productionDays)} production days, {hours(demand.staffHours)} staff-hours, people and hours by task and station. Not sent: the CompTable connection is designed, not live.</td>
            </tr>
            <tr>
              <td className="font-medium!">Published schedule</td>
              <td className="muse-c-soft">None received. CompTable publishes the adjusted schedule to staff and sends it back every two weeks; it is shown here against the demand once the connection is live.</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <p className="muse-kpi-sub mt-4">
        One day placed on the clock — dispatch against the delivery time, the batch stream cooking to the chiller, closedown at the close, by unit and with the crew load — is the{' '}
        <Link className="muse-link" href="/muse/production-planning/schedule">Day Schedule</Link> under Production. The operating day and the proposed crews are edited on{' '}
        <Link className="muse-link" href="/muse/capacity">Capacity</Link>; a dated production day with its own batches and findings is on{' '}
        <Link className="muse-link" href="/muse/production-planning">Production Planning</Link>.
      </p>
    </>
  );
}
