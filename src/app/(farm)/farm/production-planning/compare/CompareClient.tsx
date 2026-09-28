'use client';

import type { GrowPlanDef } from '@/data/grow-plan';
import { PageControls } from '@/components/PageControls';
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Kpi, num } from '@/components/ui';
import { CompareTable } from '@/components/CompareTable';

import type { EquipmentLine } from '@/data/capex';
import { clock } from '@/data/crews';
import type { SubscriberDef } from '@/data/subscribers';
import { WEEKDAY_LABELS } from '@/data/orders';
import type { PackagingLibrary } from '@/data/packaging';
import type { CatalogLine } from '@/engine/catalog';
import type { FixedCostLineDef, LoanDef } from '@/data/finance';
import type { LeaseholdLine } from '@/data/capex';
import type { TimeStudyDoc } from '@/data/time-studies';
import type { PaymentTerms } from '@/data/working-capital';
import { compareDays, violationDelta, type DailyStreamOnDay } from '@/engine/compare';
import { datesBetween, isoAddDays, orderBook, weekdayOf } from '@/engine/orders';
import type { DateRange } from '@/engine/periods';
import { finishedGoodsOnHand, planHorizon } from '@/engine/production-plan';
import { resolveScenarioInputs, type FarmScenarioConfig } from '@/engine/scenario';
import { schedule, scheduleInputsForDay, type ScheduleResult } from '@/engine/scheduler';
import { cycleDaysByCode, stageDaysByCode, staffDemand, traysOnShelf } from '@/engine/staff-demand';

const HORIZON_DAYS = 21;
const SERVICE_WEEKDAYS = [1, 2, 3, 4, 5];
const PLAN_DEFAULTS = 'plan-defaults';

export interface ComparableScenario {
  id: string;
  label: string;
  config: FarmScenarioConfig;
  isActive: boolean;
  updatedAt: string;
}

export function CompareClient({
  today,
  scenarios,
  library,
  subscribers,
  closures,
  supplierTerms,
  equipment,
  packaging,
  catalog,
  loans,
  fixedCostLines,
  leasehold,
  studies,
}: {
  today: string;
  scenarios: ComparableScenario[];
  library: GrowPlanDef[];
  subscribers: SubscriberDef[];
  closures: DateRange[];
  supplierTerms: Record<string, PaymentTerms>;
  equipment: EquipmentLine[];
  packaging: PackagingLibrary;
  catalog: Record<string, CatalogLine[]>;
  loans: LoanDef[];
  fixedCostLines: FixedCostLineDef[];
  leasehold: LeaseholdLine[];
  studies: TimeStudyDoc[];
}) {
  const options = useMemo(
    () => [{ id: PLAN_DEFAULTS, label: 'Plan-data defaults', config: {} as FarmScenarioConfig, isActive: false, updatedAt: '' }, ...scenarios],
    [scenarios],
  );
  const [aId, setAId] = useState(() => scenarios.find((s) => s.isActive)?.id ?? PLAN_DEFAULTS);
  const [bId, setBId] = useState(() => scenarios.find((s) => !s.isActive)?.id ?? PLAN_DEFAULTS);
  const [date, setDate] = useState<string | null>(null);

  /** One side: its own resolved inputs, its own horizon, its own placed day. */
  const side = useMemo(
    () => (id: string) => {
      const chosen = options.find((s) => s.id === id) ?? options[0]!;
      const resolved = resolveScenarioInputs(chosen.config, library, subscribers, closures, supplierTerms, equipment, packaging, catalog, undefined, loans, fixedCostLines, leasehold, studies);
      const to = isoAddDays(today, HORIZON_DAYS - 1);
      const pf = Object.fromEntries(resolved.phaseProfiles.map((p) => [p.phase, p.unitFactor.value])) as Record<number, number>;
      // Compare runs two forecasts: the Plan world, whatever the bar selects (Roadmap N6 slice 3) —
      // no stored order and no recorded stock.
      const book = orderBook({
        pickupPoints: resolved.demand.pickupPoints,
        subscribers: resolved.subscribers,
        orders: [],
        from: today,
        to,
        channelPriceCents: Object.fromEntries(resolved.phases.map((p) => [p.phase, Math.round(p.pricePerUnit * 100)])) as Record<number, number>,
        growPlanNames: Object.fromEntries(resolved.growPlans.map((r) => [r.code, r.name])),
        closures,
      });
      const openingLots: ReturnType<typeof finishedGoodsOnHand>['lots'] = [];
      const horizon = planHorizon({
        closures,
        from: today,
        to,
        book,
        growPlans: resolved.growPlans,
        capacityInputs: resolved.capacityInputs,
        assumptions: resolved.assumptions,
        growPlanAssumptions: resolved.growPlanAssumptions,
        unitFactorByChannel: pf,
        openingLots,
        productionWeekdays: SERVICE_WEEKDAYS,
        channels: resolved.phases.map((p) => p.phase),
      });
      return { label: chosen.label, resolved, horizon };
    },
    [options, library, subscribers, closures, supplierTerms, equipment, packaging, catalog, loans, fixedCostLines, leasehold, studies, today],
  );

  const A = useMemo(() => side(aId), [side, aId]);
  const B = useMemo(() => side(bId), [side, bId]);

  // Every day of the window: trays on the shelves are watered on days nothing is sown or harvested.
  const dates = useMemo(() => datesBetween(today, isoAddDays(today, HORIZON_DAYS - 1)), [today]);
  const day = date && dates.includes(date) ? date : today;

  const place = useCallback(
    (s: ReturnType<typeof side>): ScheduleResult => {
      const production = s.horizon.productionDays.find((p) => p.productionDate === day);
      const distribution = s.horizon.distributionDays.find((d) => d.date === day);
      const inputs = scheduleInputsForDay({
        productionRuns: production?.runs.map((r) => ({ growPlanCode: r.growPlanCode, sowingsScheduled: r.sowingsScheduled, produced: r.produced })) ?? [],
        shipments: distribution?.byGrowPlan.map((r) => ({ growPlanCode: r.growPlanCode, filledBase: r.filledBase })) ?? [],
        growPlans: s.resolved.growPlans,
        studies,
        equipment: s.resolved.equipment,
        routing: s.resolved.routing,
      });
      return schedule({
        date: day,
        sowings: inputs.sowings,
        dispatches: inputs.dispatches,
        resources: s.resolved.resources,
        crews: s.resolved.crews,
        capacityInputs: s.resolved.capacityInputs,
        policy: s.resolved.schedulePolicy,
      });
    },
    [day, studies],
  );
  const resultA = useMemo(() => place(A), [place, A]);
  const resultB = useMemo(() => place(B), [place, B]);

  /** A side's daily stream on the day: the trays on the shelves on each plan's daily lines, as the Day Schedule reads it. */
  const dailyOn = useCallback(
    (s: ReturnType<typeof side>): DailyStreamOnDay => {
      const shelf = traysOnShelf(s.horizon.productionDays, cycleDaysByCode(s.resolved.growPlans), day, day)[0];
      if (!shelf) return { traysOnShelf: 0, minutes: 0 };
      const d = staffDemand({ from: day, to: day, days: [], shelf: [shelf], studies, stageDays: stageDaysByCode(s.resolved.growPlans) }).days[0];
      return { traysOnShelf: shelf.trays.reduce((t, x) => t + x.trays, 0), minutes: (d?.dailyStaffHours ?? 0) * 60 };
    },
    [day, studies],
  );
  const dailyA = useMemo(() => dailyOn(A), [dailyOn, A]);
  const dailyB = useMemo(() => dailyOn(B), [dailyOn, B]);

  const comparison = useMemo(() => compareDays({ label: A.label, result: resultA, daily: dailyA }, { label: B.label, result: resultB, daily: dailyB }), [A.label, B.label, resultA, resultB, dailyA, dailyB]);
  const findingDelta = useMemo(() => violationDelta(resultA, resultB), [resultA, resultB]);
  const sameScenario = aId === bId;

  return (
    <>
      <PageControls>
        <label className="farm-kpi-sub inline-flex items-center gap-2">
          A
          <select className="farm-select" value={aId} aria-label="Forecast A" onChange={(e) => setAId(e.target.value)}>
            {options.map((s) => (
              <option key={s.id} value={s.id}>{s.label}{s.isActive ? ' · plan of record' : ''}</option>
            ))}
          </select>
        </label>
        <label className="farm-kpi-sub inline-flex items-center gap-2">
          B
          <select className="farm-select" value={bId} aria-label="Forecast B" onChange={(e) => setBId(e.target.value)}>
            {options.map((s) => (
              <option key={s.id} value={s.id}>{s.label}{s.isActive ? ' · plan of record' : ''}</option>
            ))}
          </select>
        </label>
        <label className="farm-kpi-sub inline-flex items-center gap-2">
          Day
          <select className="farm-select" value={day} aria-label="Day to place" onChange={(e) => setDate(e.target.value)}>
            {dates.map((d) => (
              <option key={d} value={d}>{WEEKDAY_LABELS[weekdayOf(d)]} {d}</option>
            ))}
          </select>
        </label>
      </PageControls>

      {sameScenario && <p className="farm-kpi-sub mb-3!">Both sides are the same forecast, so every row reads the same. Pick a different one on either side.</p>}

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={num(resultA.metrics.unitsPlaced)} label={`${A.label} — trays sown`} sub={`${num(resultA.metrics.sowingsPlaced)} sowings · ${num(dailyA.traysOnShelf)} trays on the shelves · ${num(resultA.violations.length)} findings`} />
        <Kpi value={num(resultB.metrics.unitsPlaced)} label={`${B.label} — trays sown`} sub={`${num(resultB.metrics.sowingsPlaced)} sowings · ${num(dailyB.traysOnShelf)} trays on the shelves · ${num(resultB.violations.length)} findings`} />
        <Kpi value={`${clock(resultA.openMin)}–${clock(resultA.closeMin)}`} label="Operating day, A" sub={`Makespan ${num(resultA.metrics.makespanMin)} min`} />
        <Kpi value={`${clock(resultB.openMin)}–${clock(resultB.closeMin)}`} label="Operating day, B" sub={`Makespan ${num(resultB.metrics.makespanMin)} min`} />
      </div>

      <Card title={`${A.label} against ${B.label} — ${WEEKDAY_LABELS[weekdayOf(day)]} ${day}`} className="mt-4">
        <CompareTable rows={comparison.rows} labelA={A.label} labelB={B.label} />
        <p className="farm-kpi-sub mt-2">
          {comparison.identical
            ? 'The two forecasts place this day identically.'
            : 'Each side resolves its own forecast and places the same date with the same scheduler. A bold Δ is a row where more or less is plainly better for trays sown and crew time used; the rest are facts, not scores.'}{' '}
          The daily stream is each side&rsquo;s trays on the shelves on their plans&rsquo; daily lines, beside the clock as on the Day Schedule. Labor is minutes, not dollars: the scheduler
          carries no wage, and pay is held in Staffing.
        </p>
      </Card>

      <Card title="Findings the two days differ on" className="mt-4">
        {findingDelta.length === 0 ? (
          <p className="farm-kpi-sub">Both days raise the same findings{resultA.violations.length === 0 ? ', and neither raises any' : ''}.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table compact">
              <thead><tr><th>Finding</th><th className="num">{A.label}</th><th className="num">{B.label}</th></tr></thead>
              <tbody>
                {findingDelta.map((f) => (
                  <tr key={f.kind}>
                    <td className="font-medium!">{f.kind}</td>
                    <td className="num">{num(f.a)}</td>
                    <td className="num">{num(f.b)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="farm-kpi-sub mt-2">
          A finding is what a placement breaks: a unit over capacity, a crew short, a distribution time missed, a step outside the operating day. Each day is placed on the{' '}
          <Link className="farm-link" href="/farm/production-planning/schedule">Day Schedule</Link>, and the month either forecast makes is on{' '}
          <Link className="farm-link" href="/farm/production-planning/calendar">Calendar</Link>. Forecasts are saved from any page&rsquo;s section save, and the plan of record is set in the forecast bar.
        </p>
      </Card>
    </>
  );
}
