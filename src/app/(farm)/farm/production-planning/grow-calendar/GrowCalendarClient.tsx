'use client';

import { PageControls } from '@/components/PageControls';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Kpi, num } from '@/components/ui';
import { MonthGrid, type MonthDay } from '@/components/timeline/MonthGrid';
import { WEEKDAY_LABELS, type SubscriptionCycleDef, type OrderDef } from '@/data/subscription-cycles';
import { STAGE_BY_KEY, type StageKey } from '@/data/stage-schedule';
import { isoAddDays, orderBook, weekdayOf } from '@/engine/orders';
import type { DateRange } from '@/engine/periods';
import { distributedConsumption, finishedGoodsOnHand, planHorizon } from '@/engine/production-plan';
import { stageOn, type CalendarSowing } from '@/engine/grow-calendar';
import { useOperationsWorld } from '@/state/ledger';
import { WorldNote } from '@/components/ledger/WorldNote';
import { useScenario } from '@/state/scenario-store';

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
const STAGE_ORDER: StageKey[] = ['soak', 'sow', 'germination', 'blackout', 'light', 'harvest-window'];

export function GrowCalendarClient({
  today,
  cycles,
  orders: recordedOrders,
  closures,
  sowings: recordedSowings,
  distributions: recordedDistributions,
  experimentSowings,
}: {
  today: string;
  cycles: SubscriptionCycleDef[];
  orders: OrderDef[];
  closures: DateRange[];
  sowings: { sowingId: string; growPlanCode: string; productionDate: string; goodUnits: number }[];
  distributions: { id: string; distributedOn: string; units: number }[];
  /** Open experiments in R&D, on the grow units from their sow dates. */
  experimentSowings: { growPlanCode: string; sowDate: string; trays: number; experiment: string }[];
}) {
  const { resolved } = useScenario();
  const world = useOperationsWorld({ orders: recordedOrders, sowings: recordedSowings, distributions: recordedDistributions });
  const { orders, sowings, distributions } = world;
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

  const pfByChannel = useMemo(() => Object.fromEntries(resolved.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>, [resolved.phaseProfiles]);
  const book = useMemo(
    () =>
      orderBook({
        pickupPoints: world.pickupPoints,
        subscribers: resolved.subscribers,
        cycles,
        orders,
        from: today,
        to: horizonTo,
        channelPriceCents: Object.fromEntries(resolved.phases.map((p) => [p.phase, Math.round(p.pricePerUnit * 100)])) as Record<number, number>,
        growPlanNames: Object.fromEntries(resolved.growPlans.map((r) => [r.code, r.name])),
        closures,
      }),
    [world.pickupPoints, resolved.subscribers, resolved.phases, resolved.growPlans, cycles, orders, today, horizonTo, closures],
  );
  const consumption = useMemo(() => distributedConsumption(orders, distributions, resolved.growPlans, pfByChannel), [orders, distributions, resolved.growPlans, pfByChannel]);
  const openingLots = useMemo(() => finishedGoodsOnHand({ sowings, consumed: consumption, shelfLifeDays: A.inventory.blackoutShelfLife.value, asOf: today, growPlans: resolved.growPlans }).lots.filter((l) => l.remaining > 0), [sowings, consumption, A, today, resolved.growPlans]);
  // Recorded sowings still inside their cycle, and open experiments, are on the shelves when the window opens.
  const openingSowings = useMemo(
    () => [
      ...sowings
        .filter((b) => b.goodUnits > 0)
        .map((b) => ({ growPlanCode: b.growPlanCode, sowDate: b.productionDate, trays: b.goodUnits }))
        .filter((b) => {
          const r = resolved.growPlans.find((x) => x.code === b.growPlanCode);
          return r !== undefined && stageOn(r, b.sowDate, today).stage !== 'off';
        }),
      ...experimentSowings,
    ],
    [sowings, resolved.growPlans, today, experimentSowings],
  );
  const horizon = useMemo(
    () =>
      planHorizon({
        closures,
        from: today,
        to: horizonTo,
        book,
        growPlans: resolved.growPlans,
        capacityInputs: C,
        assumptions: A,
        growPlanAssumptions: resolved.growPlanAssumptions,
        unitFactorByChannel: pfByChannel,
        openingLots,
        openingSowings,
        shelfLifeDays: A.inventory.blackoutShelfLife.value,
        productionWeekdays: SERVICE_WEEKDAYS,
        channels: resolved.phases.map((p) => p.phase),
      }),
    [closures, today, horizonTo, book, resolved.growPlans, resolved.phases, resolved.growPlanAssumptions, C, A, pfByChannel, openingLots, openingSowings],
  );
  const cal = horizon.growCalendar;
  const dayByDate = useMemo(() => new Map((cal?.days ?? []).map((d) => [d.date, d])), [cal]);

  const days: MonthDay[] = monthDays.map((date) => {
    const d = dayByDate.get(date);
    const lines: string[] = [];
    let flagged = false;
    if (d) {
      if (d.traysOnShelf > 0) lines.push(`${num(d.traysOnShelf)} on shelf`);
      if (d.traysSown > 0) lines.push(`sow ${num(d.traysSown)}`);
      if (d.traysHarvestable > 0) lines.push(`harvest ${num(d.traysHarvestable)}`);
      const w = d.waterings.mist + d.waterings.bottom + d.waterings.rinse;
      if (w > 0) lines.push(`${num(w)} waterings`);
      if (d.unplacedTrays > 0) {
        lines.push(`${num(d.unplacedTrays)} no room`);
        flagged = true;
      }
    }
    const capacity = d ? d.byUnit.reduce((t, u) => t + u.capacity, 0) : 0;
    return { date, lines, utilisation: d && capacity > 0 ? d.traysOnShelf / capacity : undefined, flagged, muted: date < today, selected: date === selected };
  });

  const inMonth = (cal?.days ?? []).filter((d) => monthOf(d.date) === month);
  const peak = inMonth.reduce((m, d) => Math.max(m, d.traysOnShelf), 0);
  const sownInMonth = inMonth.reduce((t, d) => t + d.traysSown, 0);
  const sowingsInMonth = inMonth.reduce((t, d) => t + d.sowingsStarted, 0);
  const noRoom = (cal?.sowings ?? []).filter((s) => !s.placed && monthOf(s.sowDate) === month);
  const selectedDay = selected ? dayByDate.get(selected) : undefined;
  const sowingsShown = useMemo(() => (cal?.sowings ?? []).filter((s) => s.harvestTo >= `${month}-01` && s.sowDate <= last).sort((a, b) => a.sowDate.localeCompare(b.sowDate) || a.growPlanCode.localeCompare(b.growPlanCode)), [cal, month, last]);
  const planOf = (s: CalendarSowing) => {
    const r = resolved.growPlans.find((x) => x.code === s.growPlanCode);
    return r ?? null;
  };

  return (
    <>
      <WorldNote isPlan={world.isPlan} />
      <PageControls>
        <button type="button" className="farm-btn ghost" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
        <span className="font-semibold farm-c-ink min-w-32 text-center">{monthLabel(month)}</span>
        <button type="button" className="farm-btn ghost" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>›</button>
        {month !== monthOf(today) && <button type="button" className="farm-btn ghost" onClick={() => setMonth(monthOf(today))}>This month</button>}
      </PageControls>

      {!cal && (
        <Card title="No grow plan in the library">
          <p className="farm-kpi-sub">The calendar places grow plans; the library holds none. Add one on <Link className="farm-link" href="/farm/grow-plans">Grow plans</Link>.</p>
        </Card>
      )}

      {cal && (
        <>
          <div className="grid gap-3 farm-autofit-11">
            <Kpi value={num(peak)} label="Most trays on the shelves" sub="on one day of the month" />
            <Kpi value={num(sowingsInMonth)} label="Sowings started" sub={`${num(sownInMonth)} trays sown`} />
            <Kpi value={num(noRoom.length)} label="Sowings with no room" sub={noRoom.length ? 'no grow unit holds them for their cycle' : 'every sowing has a unit'} />
            {cal.utilisation.map((u) => (
              <Kpi key={u.unitKey} value={u.available > 0 ? `${num(u.share * 100, 0)}%` : '—'} label={u.item} sub={`${num(u.used)} of ${num(u.available)} tray-days over the window`} />
            ))}
          </div>

          <Card title={monthLabel(month)} className="mt-4">
            <MonthGrid days={days} onPick={setSelected} selectedDate={selected} />
            <p className="farm-kpi-sub mt-2">
              A cell reads the trays on the shelves, the trays sown, the trays inside their harvest window, the waterings owed, and any trays with no room. The bar is the share of the
              units&rsquo; trays in use. Pick a day to see it by stage and by unit.
            </p>
          </Card>

          {selectedDay && (
            <Card title={`${WEEKDAY_LABELS[weekdayOf(selectedDay.date)]} ${selectedDay.date}`} className="mt-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="farm-kpi-sub mb-1">By stage</div>
                  <table className="farm-table compact">
                    <thead><tr><th>Stage</th><th className="num">Trays</th><th>Watering</th></tr></thead>
                    <tbody>
                      {STAGE_ORDER.filter((k) => (selectedDay.traysByStage[k] ?? 0) > 0).map((k) => (
                        <tr key={k}><td>{STAGE_BY_KEY[k].name}</td><td className="num">{num(selectedDay.traysByStage[k] ?? 0)}</td><td>{STAGE_BY_KEY[k].watering === 'none' ? '—' : `${STAGE_BY_KEY[k].watering}, ${STAGE_BY_KEY[k].wateringsPerDay} a day`}</td></tr>
                      ))}
                      {STAGE_ORDER.every((k) => (selectedDay.traysByStage[k] ?? 0) === 0) && <tr><td colSpan={3} className="farm-c-soft">Nothing on the shelves.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div>
                  <div className="farm-kpi-sub mb-1">By grow unit</div>
                  <table className="farm-table compact">
                    <thead><tr><th>Unit</th><th className="num">Trays</th><th className="num">Holds</th></tr></thead>
                    <tbody>
                      {selectedDay.byUnit.map((u) => <tr key={u.unitKey}><td>{u.item}</td><td className="num">{num(u.trays)}</td><td className="num">{num(u.capacity)}</td></tr>)}
                    </tbody>
                  </table>
                  <p className="farm-kpi-sub mt-2">Waterings owed: {num(selectedDay.waterings.mist)} mist, {num(selectedDay.waterings.bottom)} bottom, {num(selectedDay.waterings.rinse)} rinse.</p>
                </div>
              </div>
            </Card>
          )}

          <Card title="Sowings across the month" className="mt-4">
            <div className="farm-scroll-x">
              <table className="farm-table compact">
                <thead>
                  <tr><th>Plan</th><th>Sow</th><th>Harvest window</th><th>For</th><th className="num">Trays</th><th>Unit</th><th>Today</th></tr>
                </thead>
                <tbody>
                  {sowingsShown.length === 0 && <tr><td colSpan={7} className="farm-c-soft">No sowing touches this month: the order book has nothing to grow.</td></tr>}
                  {sowingsShown.map((s) => {
                    const plan = planOf(s);
                    const st = plan ? stageOn(plan, s.sowDate, today) : null;
                    return (
                      <tr key={s.id} className={s.placed ? '' : 'farm-c-accent'}>
                        <td>{s.growPlanCode} · {s.growPlanName}</td>
                        <td className="whitespace-nowrap!">{s.sowDate}</td>
                        <td className="whitespace-nowrap!">{s.harvestFrom} to {s.harvestTo}</td>
                        <td className="whitespace-nowrap!">{s.experiment ? `experiment: ${s.experiment}` : s.distributionDate ?? 'recorded'}</td>
                        <td className="num">{num(s.trays)}</td>
                        <td>{s.placed ? s.unitItem : 'no room on any unit'}</td>
                        <td>{st && st.stage !== 'off' ? `${STAGE_BY_KEY[st.stage].name}, day ${st.dayOfCycle}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="farm-kpi-sub mt-2">
              The sow date is the distribution date less the plan&rsquo;s days to harvest, on a production day. A sowing is what one unit takes in trays of the format; it holds its shelf for
              the whole cycle. The plan itself is on <Link className="farm-link" href="/farm/production-planning">Production Planning</Link>; the daily labor it owes is on{' '}
              <Link className="farm-link" href="/farm/schedule">Schedule</Link>.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
