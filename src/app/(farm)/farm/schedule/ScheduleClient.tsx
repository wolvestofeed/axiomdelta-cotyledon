'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Kpi, num } from '@/components/ui';

import { WEEKDAY_LABELS, type SubscriptionCycleDef, type OrderDef } from '@/data/subscription-cycles';
import { TIME_STUDY_STREAM_LABELS, type TimeStudyDoc } from '@/data/time-studies';
import { orderBook, isoAddDays, weekdayOf } from '@/engine/orders';
import { distributedConsumption, finishedGoodsOnHand, planHorizon } from '@/engine/production-plan';
import { staffDemand , traysOnShelf, cycleDaysByCode } from '@/engine/staff-demand';
import type { DateRange } from '@/engine/periods';
import { useOperationsWorld } from '@/state/ledger';
import { WorldNote } from '@/components/ledger/WorldNote';
import { useScenario } from '@/state/scenario-store';

const SERVICE_WEEKDAYS = [1, 2, 3, 4, 5];
/** The demand window sent to Staffing. */
const DEMAND_DAYS = 14;
/** Distributions this far past the window are made on production days inside it. */
const DISTRIBUTION_LOOKAHEAD_DAYS = 7;

const hours = (h: number) => num(h, 1);

export function ScheduleClient({
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
  sowings: { sowingId: string; cropPlanCode: string; productionDate: string; goodUnits: number }[];
  distributions: { id: string; distributedOn: string; units: number }[];
  studies: TimeStudyDoc[];
}) {
  const { resolved } = useScenario();
  // Plan runs the open forecast's own world; Actual the real farm (Roadmap N6 slice 3).
  const world = useOperationsWorld({ orders: recordedOrders, sowings: recordedSowings, distributions: recordedDistributions });
  const { orders, sowings, distributions } = world;
  const A = resolved.assumptions;
  const C = resolved.capacityInputs;
  const shelfLife = A.inventory.blackoutShelfLife.value;

  // ── Staff demand: the next two weeks of production, from the order book ───
  const from = today;
  const to = isoAddDays(today, DEMAND_DAYS - 1);
  const bookTo = isoAddDays(to, DISTRIBUTION_LOOKAHEAD_DAYS);
  const pfByChannel = useMemo(() => Object.fromEntries(resolved.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>, [resolved.phaseProfiles]);
  const book = useMemo(
    () =>
      orderBook({
        pickupPoints: world.pickupPoints,
        subscribers: resolved.subscribers,
        cycles,
        orders,
        from,
        to: bookTo,
        channelPriceCents: Object.fromEntries(resolved.phases.map((p) => [p.phase, Math.round(p.pricePerUnit * 100)])) as Record<number, number>,
        cropPlanNames: Object.fromEntries(resolved.cropPlans.map((r) => [r.code, r.name])),
        closures,
      }),
    [world.pickupPoints, resolved.subscribers, resolved.phases, resolved.cropPlans, cycles, orders, from, bookTo, closures],
  );
  const consumption = useMemo(() => distributedConsumption(orders, distributions, resolved.cropPlans, pfByChannel), [orders, distributions, resolved.cropPlans, pfByChannel]);
  const openingLots = useMemo(() => finishedGoodsOnHand({ sowings, consumed: consumption, shelfLifeDays: shelfLife, asOf: from, cropPlans: resolved.cropPlans }).lots.filter((l) => l.remaining > 0), [sowings, consumption, shelfLife, from, resolved.cropPlans]);
  const horizon = useMemo(
    () =>
      planHorizon({
        closures,
        from,
        to: bookTo,
        book,
        cropPlans: resolved.cropPlans,
        capacityInputs: C,
        assumptions: A,
        cropPlanAssumptions: resolved.cropPlanAssumptions,
        unitFactorByChannel: pfByChannel,
        openingLots,
        shelfLifeDays: shelfLife,
        productionWeekdays: SERVICE_WEEKDAYS,
        channels: resolved.phases.map((p) => p.phase),
      }),
    [closures, from, bookTo, book, resolved.cropPlans, C, A, pfByChannel, openingLots, shelfLife, resolved.phases],
  );
  const harvest = useMemo(
    () => horizon.distributionDays.map((d) => ({ date: d.date, shipments: d.byCropPlan.map((r) => ({ cropPlanCode: r.cropPlanCode, cropPlanName: r.cropPlanName, units: r.filledBase })) })),
    [horizon.distributionDays],
  );
  const shelf = useMemo(() => traysOnShelf(horizon.productionDays, cycleDaysByCode(resolved.cropPlans), from, to), [horizon.productionDays, resolved.cropPlans, from, to]);
  const demand = useMemo(() => staffDemand({ from, to, days: horizon.productionDays, harvest, shelf, studies }), [from, to, horizon.productionDays, harvest, shelf, studies]);
  const busiest = demand.days.reduce<(typeof demand.days)[number] | null>((m, d) => (!m || d.staffHours > m.staffHours ? d : m), null);
  const [open, setOpen] = useState<string | null>(null);
  const cropPlanName = (code: string) => resolved.cropPlans.find((r) => r.code === code)?.name ?? code;

  return (
    <>
      <WorldNote isPlan={world.isPlan} />
      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={num(demand.productionDays)} label="Production days with sowings" sub={`${from} to ${to}; ${num(demand.distributionDays)} distribution days`} />
        <Kpi value={hours(demand.staffHours)} label="Staff-hours required" sub={demand.estimatedCropPlans.length ? `From each crop plan's labor standard; ${num(demand.estimatedCropPlans.length)} on an estimate` : "From each crop plan's labor standard"} />
        <Kpi value={busiest && busiest.staffHours > 0 ? hours(busiest.staffHours) : '—'} label="Busiest day, staff-hours" sub={busiest && busiest.staffHours > 0 ? `${WEEKDAY_LABELS[weekdayOf(busiest.date)]} ${busiest.date}` : undefined} />
        <Kpi value={num(demand.uncoveredCropPlans.length)} label="Crop plans with no time study" sub="Their sowings and shipments carry no staff demand" />
      </div>
      {demand.uncoveredCropPlans.length > 0 && (
        <p className="farm-kpi-sub mt-2">
          Sowings or shipments of {demand.uncoveredCropPlans.map((c) => `${c} ${cropPlanName(c)}`).join(', ')} are in the window with no time study at all, so no staff demand is counted for them. A study is adopted on <Link className="farm-link" href="/farm/time-studies">Time Studies</Link>.
        </p>
      )}

      {demand.estimatedCropPlans.length > 0 && (
        <p className="farm-kpi-sub mt-2">
          {demand.estimatedCropPlans.map((c) => `${c} ${cropPlanName(c)}`).join(', ')} {demand.estimatedCropPlans.length === 1 ? 'is' : 'are'} staffed from an estimated time study: no observed study has been adopted yet. The estimate stands until one is recorded and adopted on <Link className="farm-link" href="/farm/time-studies">Time Studies</Link>.
        </p>
      )}

      <Card title={`Staff demand — ${from} to ${to}`} className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              {open ? (
                <tr>
                  <th>Task</th>
                  <th>Stream</th>
                  <th>Station</th>
                  <th className="num">People</th>
                  <th className="num">Staff-hours</th>
                  <th>Crop plans</th>
                </tr>
              ) : (
                <tr><th colSpan={6}>Day</th></tr>
              )}
            </thead>
            <tbody>
              {demand.days.length === 0 && (
                <tr><td colSpan={6} className="farm-c-soft">No production or distribution day in the window: the order book has no distributions to make.</td></tr>
              )}
              {demand.days.map((d) => {
                const isOpen = open === d.date;
                return (
                  <Fragment key={d.date}>
                    <tr className={`farm-group-row${isOpen ? ' is-open' : ''}`}>
                      <td colSpan={6} className="p-0!">
                        <button type="button" className="farm-group-row-btn" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : d.date)}>
                          <span className="font-semibold farm-c-accent-hi">
                            {WEEKDAY_LABELS[weekdayOf(d.date)]} {d.date}
                            <span className="farm-c-soft font-normal ml-[0.6rem]! farm-fs-xs">
                              {num(d.sowings)} {d.sowings === 1 ? 'sowing' : 'sowings'} · {num(d.units)} units produced · {num(d.unitsShipped)} shipped
                            </span>
                          </span>
                          <span className="inline-flex gap-4 items-baseline">
                            <span className="farm-mono farm-fs-xs">{hours(d.staffHours)} staff-hours</span>
                            <span className="farm-c-soft farm-fs-xs min-w-10 text-right">{isOpen ? 'Close' : 'Open'}</span>
                          </span>
                        </button>
                      </td>
                    </tr>
                    {isOpen && d.lines.length === 0 && (
                      <tr><td colSpan={6} className="farm-c-soft">No staff demand counted for this day.</td></tr>
                    )}
                    {isOpen &&
                      d.lines.map((l) => (
                        <tr key={`${d.date}:${l.stream}:${l.task}:${l.station ?? ''}`}>
                          <td className="font-medium!">{l.task}</td>
                          <td className="farm-c-soft">{TIME_STUDY_STREAM_LABELS[l.stream]}</td>
                          <td className="farm-c-soft">{l.station ?? '—'}</td>
                          <td className="num">{num(l.headcount)}</td>
                          <td className="num">{num(l.hours, 2)}</td>
                          <td className="farm-c-soft">{l.cropPlanCodes.join(', ')}</td>
                        </tr>
                      ))}
                    {isOpen && d.uncovered.length > 0 && (
                      <tr>
                        <td colSpan={6} className="farm-c-soft">
                          No time study: {d.uncovered.map((u) => `${u.cropPlanCode} (${num(u.sowings)} ${u.sowings === 1 ? 'sowing' : 'sowings'}, ${num(u.units)} units produced, ${num(u.unitsShipped)} shipped)`).join('; ')}.
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          Production and distribution days come from the order book rolled through production, the same plan as <Link className="farm-link" href="/farm/production-planning">Production Planning</Link>. Sowing lines fall on the production day: a fixed line counts once per sowing, a per-unit line scales with the units produced. Harvest lines fall on the distribution day: a per-unit line scales with the units shipped, a fixed line counts once that day. People is the most any cropPlan&rsquo;s study names for the task; tasks are not yet placed on the clock, so the day&rsquo;s peak headcount is not stated. No positions and no pay.
        </p>
      </Card>

      <Card title="Staffing" className="mt-4">
        <table className="farm-table">
          <tbody>
            <tr>
              <td className="font-medium!">Staff demand prepared</td>
              <td className="farm-c-soft">{num(demand.productionDays)} production days, {hours(demand.staffHours)} staff-hours, people and hours by task and station. Not sent: the Staffing connection is designed, not live.</td>
            </tr>
            <tr>
              <td className="font-medium!">Published schedule</td>
              <td className="farm-c-soft">None received. Staffing publishes the adjusted schedule to staff and sends it back every two weeks; it is shown here against the demand once the connection is live.</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <p className="farm-kpi-sub mt-4">
        One day placed on the clock — harvest against the distribution time, the sowing stream growing to the blackoutRack, closedown at the close, by unit and with the crew load — is the{' '}
        <Link className="farm-link" href="/farm/production-planning/schedule">Day Schedule</Link> under Production. The operating day and the proposed crews are edited on{' '}
        <Link className="farm-link" href="/farm/capacity">Capacity</Link>; a dated production day with its own sowings and findings is on{' '}
        <Link className="farm-link" href="/farm/production-planning">Production Planning</Link>.
      </p>
    </>
  );
}
