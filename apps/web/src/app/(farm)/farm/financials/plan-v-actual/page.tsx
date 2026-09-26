import { PageControls } from '../../_components/PageControls';
import { Fragment } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, money, num, pct } from '../../_components/ui';
import { getFarmAccess } from '../../_lib/access';
import { AdminOnlyNotice } from '../../_components/AdminOnly';
import { buildPlanVsActual, type PvaMonth } from '../../_lib/plan-v-actual';
import { servedCostPerUnitCents, sumMeasures, type PvaBreakdownRow, type PvaMeasures } from '../../_engine/plan-v-actual';
import { MARK } from '../../_data/mark';
import { getActiveScenario } from '../../_lib/scenarios';
import { forecastStartOf } from '../../_engine/demand';

export const dynamic = 'force-dynamic';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A month `YYYY-MM` or a quarter `YYYY-Qn`, and the months it covers. */
function parsePeriod(asked: string | undefined, today: string): { label: string; months: string[]; year: number } {
  const q = asked?.match(/^(\d{4})-Q([1-4])$/);
  if (q) {
    const y = Number(q[1]);
    const start = (Number(q[2]) - 1) * 3;
    return { label: asked!, year: y, months: [0, 1, 2].map((i) => `${y}-${String(start + i + 1).padStart(2, '0')}`) };
  }
  const m = asked?.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  const label = m ? asked! : today.slice(0, 7);
  return { label, year: Number(label.slice(0, 4)), months: [label] };
}

const cents = (c: number) => money(c / 100, 0);
const kg = (v: number) => `${num(v, 0)} kg`;
const t = (v: number) => `${(v / 1000).toFixed(2)} t`;

interface Row {
  label: string;
  plan: number | null;
  actual: number | null;
  rolling: number | null;
  fmt: (v: number) => string;
  note?: string;
  /** A count at the period end, not a flow. */
  level?: boolean;
}

function rowsFor(p: PvaMeasures, a: PvaMeasures, r: PvaMeasures, cash: { plan: number; actual: number; rolling: number }): { group: string; rows: Row[] }[] {
  const served = (m: PvaMeasures) => servedCostPerUnitCents(m);
  const share = (part: number, whole: number) => (whole > 0 ? part / whole : null);
  return [
    {
      group: 'Operations',
      rows: [
        { label: 'Units distributed', plan: p.units, actual: a.units, rolling: r.units, fmt: (v) => num(v) },
        { label: 'Orders', plan: p.orders, actual: a.orders, rolling: r.orders, fmt: (v) => num(v), note: 'Plan: the timeline’s orders. Actual: confirmed and distributed orders on file.' },
        { label: 'Sowings', plan: p.sowings, actual: a.sowings, rolling: r.sowings, fmt: (v) => num(v) },
        { label: 'New subscribers', plan: p.newSubscribers, actual: a.newSubscribers, rolling: r.newSubscribers, fmt: (v) => num(v), note: 'A subscriber is new in the month of its first order.' },
        { label: 'Labor hours', plan: p.laborHours, actual: a.laborHours, rolling: r.laborHours, fmt: (v) => num(v, 1) },
      ],
    },
    {
      group: 'Financial',
      rows: [
        { label: 'Cash at the period end', plan: cash.plan, actual: cash.actual, rolling: cash.rolling, fmt: cents, level: true, note: 'Rolling opens from the actual cash balance on the as-of date and rolls the plan’s cash forward from the next day.' },
        { label: 'Revenue', plan: p.revenueCents, actual: a.revenueCents, rolling: r.revenueCents, fmt: cents },
        { label: 'Input cost', plan: p.inputCostCents, actual: a.inputCostCents, rolling: r.inputCostCents, fmt: cents, note: 'Materials issued to the sowings made in the period.' },
        { label: 'Labor cost', plan: p.laborCostCents, actual: a.laborCostCents, rolling: r.laborCostCents, fmt: cents, note: 'Direct labor charged to the sowings.' },
        { label: 'Served cost per unit', plan: served(p), actual: served(a), rolling: served(r), fmt: (v) => money(v / 100, 2), note: 'Food, labor and packaging over the units made, plus selling and distribution over the units distributed.' },
      ],
    },
    {
      group: 'Sustainability',
      rows: [
        { label: 'Waste', plan: p.wasteKg, actual: a.wasteKg, rolling: r.wasteKg, fmt: kg, note: 'Shrink on production and finished units past shelf life unshipped.' },
        { label: 'Water', plan: p.waterGal, actual: a.waterGal, rolling: r.waterGal, fmt: (v) => `${num(v)} gal`, note: 'Plan: the forecast’s annual volume spread by the units it makes each month. Actual: the bills ending in the month.' },
        { label: 'Electricity', plan: p.electricityKwh, actual: a.electricityKwh, rolling: r.electricityKwh, fmt: (v) => `${num(v)} kWh`, note: 'Plan spread by the units made each month, as water.' },
        { label: 'Natural gas', plan: p.naturalGasTherms, actual: a.naturalGasTherms, rolling: r.naturalGasTherms, fmt: (v) => `${num(v, 1)} therms` },
        { label: 'Propane and fleet fuel', plan: p.fuelGal, actual: a.fuelGal, rolling: r.fuelGal, fmt: (v) => `${num(v, 1)} gal` },
        { label: 'Emissions, total', plan: p.emissionsKg.total, actual: a.emissionsKg.total, rolling: r.emissionsKg.total, fmt: t, note: 'Reference food basis, Scope 2 location-based.' },
        { label: 'Scope 1', plan: p.emissionsKg.scope1, actual: a.emissionsKg.scope1, rolling: r.emissionsKg.scope1, fmt: t },
        { label: 'Scope 2', plan: p.emissionsKg.scope2, actual: a.emissionsKg.scope2, rolling: r.emissionsKg.scope2, fmt: t },
        { label: 'Scope 3', plan: p.emissionsKg.scope3, actual: a.emissionsKg.scope3, rolling: r.emissionsKg.scope3, fmt: t },
        { label: 'Scope 3 food on a named supplier', plan: share(p.food.onNamedSupplierKg, p.food.referenceKg), actual: share(a.food.onNamedSupplierKg, a.food.referenceKg), rolling: share(r.food.onNamedSupplierKg, r.food.referenceKg), fmt: (v) => pct(v, 0), note: 'Share of purchased-food emissions on inputs received from a named supplier. Definition to be confirmed.' },
        { label: 'Scope 3 food on supplier data', plan: share(p.food.onSupplierDataKg, p.food.referenceKg), actual: share(a.food.onSupplierDataKg, a.food.referenceKg), rolling: share(r.food.onSupplierDataKg, r.food.referenceKg), fmt: (v) => pct(v, 0), note: 'Share of purchased-food emissions whose selected basis is the supplier’s own figure. Definition to be confirmed.' },
      ],
    },
    {
      group: `${MARK.label} ratings`,
      rows: [
        ...([3, 2, 1] as const).map((s): Row => ({ label: `Subscribers, ${s}-star`, plan: p.subscribersByStars[s], actual: a.subscribersByStars[s], rolling: r.subscribersByStars[s], fmt: (v) => num(v), level: true, note: s === 3 ? 'Plan: the plan’s subscribers ordering in the period. Actual: subscribers distributed to. At the period end.' : undefined })),
        ...([3, 2, 1] as const).map((s): Row => ({ label: `Suppliers, ${s}-star`, plan: p.suppliersByStars[s], actual: a.suppliersByStars[s], rolling: r.suppliersByStars[s], fmt: (v) => num(v), level: true, note: s === 3 ? 'Suppliers on the period’s receipts.' : undefined })),
      ],
    },
  ];
}

function diffCell(r: Row) {
  return diffOf(r, r.actual);
}

function diffOf(r: Row, value: number | null) {
  if (r.plan === null || value === null) return <td className="num farm-c-faint">—</td>;
  const d = value - r.plan;
  const rel = r.plan !== 0 ? d / Math.abs(r.plan) : null;
  return (
    <td className="num">
      {d === 0 ? '0' : `${d > 0 ? '+' : '−'}${r.fmt(Math.abs(d))}`}
      {rel !== null && d !== 0 && <div className="farm-c-faint farm-fs-2xs">{`${rel > 0 ? '+' : '−'}${pct(Math.abs(rel), 1)}`}</div>}
    </td>
  );
}

function mergeRows(lists: PvaBreakdownRow[][]): Map<string, PvaBreakdownRow> {
  const out = new Map<string, PvaBreakdownRow>();
  for (const list of lists) {
    for (const r of list) {
      const cur = out.get(r.key) ?? { key: r.key, units: 0, revenueCents: 0, inputCostCents: 0, orders: 0 };
      cur.units += r.units;
      cur.revenueCents += r.revenueCents;
      cur.inputCostCents += r.inputCostCents;
      cur.orders += r.orders;
      out.set(r.key, cur);
    }
  }
  return out;
}

function Breakdown({ title, months, by, nameOf }: { title: string; months: PvaMonth[]; by: 'cropPlan' | 'channel' | 'subscriber'; nameOf: (key: string) => string }) {
  const plan = mergeRows(months.map((m) => m.plan.breakdown[by]));
  const actual = mergeRows(months.map((m) => m.actual.breakdown[by]));
  const keys = [...new Set([...plan.keys(), ...actual.keys()])].sort((a, b) => (actual.get(b)?.units ?? 0) + (plan.get(b)?.units ?? 0) - (actual.get(a)?.units ?? 0) - (plan.get(a)?.units ?? 0));
  const cell = (p: number, a: number, f: (v: number) => string) => (
    <>
      <td className="num">{f(p)}</td>
      <td className="num">{f(a)}</td>
      <td className="num farm-c-soft">{a - p === 0 ? '0' : `${a - p > 0 ? '+' : '−'}${f(Math.abs(a - p))}`}</td>
    </>
  );
  return (
    <Card title={title} className="mt-4">
      {keys.length === 0 ? (
        <p className="farm-kpi-sub">Nothing distributed or ordered on either side in the period.</p>
      ) : (
        <div className="farm-scroll-x">
          <table className="farm-table compact">
            <thead>
              <tr><th rowSpan={2}>{by === 'cropPlan' ? 'Crop plan' : by === 'channel' ? 'Channel' : 'Subscriber'}</th><th colSpan={3} className="num">Units</th><th colSpan={3} className="num">Revenue</th><th colSpan={3} className="num">Input cost</th><th colSpan={3} className="num">Orders</th></tr>
              <tr>{[0, 1, 2, 3].map((i) => <Fragment key={i}><th className="num">Plan</th><th className="num">Actual</th><th className="num">Diff</th></Fragment>)}</tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const p = plan.get(k) ?? { units: 0, revenueCents: 0, inputCostCents: 0, orders: 0 };
                const a = actual.get(k) ?? { units: 0, revenueCents: 0, inputCostCents: 0, orders: 0 };
                return (
                  <tr key={k}>
                    <td className="font-medium!">{nameOf(k)}</td>
                    {cell(p.units, a.units, (v) => num(v))}
                    {cell(p.revenueCents, a.revenueCents, cents)}
                    {cell(p.inputCostCents, a.inputCostCents, cents)}
                    {cell(p.orders, a.orders, (v) => num(v))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * Plan v Actual (Roadmap N7): the plan of record in force at each month end against
 * the records, month or quarter. A quarter sums its months, each against its own plan.
 */
export default async function PlanVsActualPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice area="Plan v Actual" />;
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  // With no month asked for, open on this month — or the plan of record's first month when it starts later.
  const planStart = forecastStartOf((await getActiveScenario())?.config.forecast);
  const period = parsePeriod(params.period, planStart > today ? planStart : today);
  const report = await buildPlanVsActual(period.months);
  const plan = sumMeasures(report.months.map((m) => m.plan.measures));
  const actual = sumMeasures(report.months.map((m) => m.actual.measures));
  const rolling = sumMeasures(report.months.map((m) => m.rolling.measures));
  const lastMonth = report.months[report.months.length - 1];
  const groups = rowsFor(plan, actual, rolling, lastMonth.closingCashCents);
  const unmapped = [...new Set(report.months.flatMap((m) => [...m.plan.cropPlansWithUnmappedLines, ...m.actual.cropPlansWithUnmappedLines]))].sort();
  const noSowing = [...new Set(report.months.flatMap((m) => [...m.plan.cropPlansDistributedWithNoSowing, ...m.actual.cropPlansDistributedWithNoSowing]))];
  const y = period.year;

  return (
    <>
      <PageHeader
        title="Plan v Actual"
        purpose="Compare each month’s records with the plan of record in force at month end."
        functions={['Totals', 'By crop plan', 'By channel', 'By subscriber', 'Rolling forecast']}
        connects={[
          { href: '/farm/actuals', dir: 'from' },
          { href: '/farm/financials/pnl', dir: 'from' },
        ]}
        howItWorks={
          <ul>
            <li>Each month&rsquo;s records are set against the plan of record in force at that month&rsquo;s end.</li>
            <li>Both sides are computed the same way: the plan through its own timeline and Plan ledger, the records through the Actual ledger.</li>
            <li>A quarter is the sum of its months, each against the plan in force at its own month end.</li>
          </ul>
        }
        status="live"
      />

      <PageControls>
        <span className="farm-fs-xs farm-c-soft inline-flex flex-wrap items-center gap-x-[0.45rem]">
          <Link className="farm-link" href={`/farm/financials/plan-v-actual?period=${y - 1}-12`}>{y - 1}</Link>
          <strong className="farm-c-ink">{y}</strong>
          <Link className="farm-link" href={`/farm/financials/plan-v-actual?period=${y + 1}-01`}>{y + 1}</Link>
        </span>
        <span className="farm-fs-xs farm-c-soft inline-flex flex-wrap items-center gap-x-[0.45rem]">
          <span className="farm-kpi-sub">Month</span>
          {MONTHS.map((label, i) => {
            const key = `${y}-${String(i + 1).padStart(2, '0')}`;
            return key === period.label ? <strong key={key} className="farm-c-ink">{label}</strong> : <Link key={key} className="farm-link" href={`/farm/financials/plan-v-actual?period=${key}`}>{label}</Link>;
          })}
        </span>
        <span className="farm-fs-xs farm-c-soft inline-flex flex-wrap items-center gap-x-[0.45rem]">
          <span className="farm-kpi-sub">Quarter</span>
          {[1, 2, 3, 4].map((n) => {
            const key = `${y}-Q${n}`;
            return key === period.label ? <strong key={key} className="farm-c-ink">Q{n}</strong> : <Link key={key} className="farm-link" href={`/farm/financials/plan-v-actual?period=${key}`}>Q{n}</Link>;
          })}
        </span>
      </PageControls>
      <div className="mb-4 border! border-[color:var(--farm-line)]! bg-[color:var(--farm-surface-2)]! rounded-[0.6rem]! py-[0.7rem]! px-[1.1rem]! farm-fs-sm farm-c-soft">
        <div>
          Plan of record in force:{' '}
          {report.months.map((m, i) => (
            <span key={m.period}>
              {i > 0 ? ' · ' : ''}
              {m.period} <strong className="farm-c-ink">{m.planInForce.label ?? 'plan defaults'}</strong>
              {m.planInForce.basis === 'current' ? ' (no change on the trail by then; the plan of record set now)' : m.planInForce.frozen ? ` (set ${m.planInForce.appliedAt?.slice(0, 10)}, on the master records as they stood then)` : ` (set ${m.planInForce.appliedAt?.slice(0, 10)}, before master records were saved with the plan; read on the master records as they stand now)`}
              {m.outsidePlanWindow ? ' — outside the plan’s timeline, so its side reads zero' : ''}
            </span>
          ))}
        </div>
      </div>

      {unmapped.length > 0 && (
        <div className="mb-4 border! border-[color:var(--farm-line)]! bg-[color:var(--farm-surface-2)]! rounded-[0.6rem]! py-[0.6rem]! px-[1.1rem]! farm-fs-sm farm-c-soft" role="status">
          CropPlans served in the period with inputs that have no mapping to a food study product: {unmapped.join(', ')}. Those inputs carry no food emissions and no mass, so Scope 3 and waste read low on both sides until they are mapped on <Link className="farm-link" href="/farm/sustainability/inputs">Inputs</Link>.
        </div>
      )}

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={`${num(actual.units)} / ${num(plan.units)}`} label="Units, actual / plan" sub={period.label} />
        <Kpi value={`${cents(actual.revenueCents)} / ${cents(plan.revenueCents)}`} label="Revenue, actual / plan" />
        <Kpi value={servedCostPerUnitCents(actual) === null ? '—' : money(servedCostPerUnitCents(actual)! / 100, 2)} label="Served cost per unit, actual" sub={servedCostPerUnitCents(plan) === null ? 'Plan: nothing made' : `Plan ${money(servedCostPerUnitCents(plan)! / 100, 2)}`} />
        <Kpi value={`${t(actual.emissionsKg.total)} / ${t(plan.emissionsKg.total)}`} label="Emissions, actual / plan" />
        <Kpi value={`${num(rolling.units)} · ${cents(rolling.revenueCents)}`} label="Rolling forecast — units · revenue" sub={`Records through ${report.asOf}, then ${report.rollingPlanLabel ?? 'plan defaults'} as planned`} />
      </div>

      <Card title={`Totals — ${period.label}`} className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead><tr><th>Figure</th><th className="num">Plan</th><th className="num">Actual</th><th className="num">Actual − plan</th><th className="num">Rolling</th><th className="num">Rolling − plan</th><th>Basis</th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.group}>
                  <tr className="farm-group-row"><td colSpan={7} className="font-semibold!">{g.group}</td></tr>
                  {g.rows.map((r) => (
                    <tr key={`${g.group}-${r.label}`}>
                      <td className="font-medium!">{r.label}</td>
                      <td className="num">{r.plan === null ? '—' : r.fmt(r.plan)}</td>
                      <td className="num">{r.actual === null ? '—' : r.fmt(r.actual)}</td>
                      {diffCell(r)}
                      <td className="num">{r.rolling === null ? '—' : r.fmt(r.rolling)}</td>
                      {diffOf(r, r.rolling)}
                      <td className="farm-c-soft farm-fs-xs">{r.note ?? ''}{r.level && period.months.length > 1 ? ' Read at the last month.' : ''}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="farm-kpi-sub mt-2">
          The rolling forecast is budget-based: the records through {report.asOf}, and the plan of record set now ({report.rollingPlanLabel ?? 'plan defaults'}) as planned for the days after it; nothing is re-estimated, and the plan of record itself does not change. A month wholly before today is the records, a month wholly after it is the plan, and this month is both, split at today.
          {' '}Difference is actual less plan. A rating is assigned by MicroFarm on Subscribers; a supplier with no rating on file is not counted. {report.trailEntries === 0 ? 'No change of the plan of record is on the trail yet, so every month reads the plan of record set now.' : `${report.trailEntries} change${report.trailEntries === 1 ? '' : 's'} of the plan of record on the trail.`}
        </p>
      </Card>

      <Breakdown title="By crop plan" months={report.months} by="cropPlan" nameOf={(k) => k} />
      <Breakdown title="By channel" months={report.months} by="channel" nameOf={(k) => report.channelNames[k] ?? `Channel ${k}`} />
      <Breakdown title="By subscriber" months={report.months} by="subscriber" nameOf={(k) => report.subscriberNames[k] ?? k} />
      <p className="farm-kpi-sub mt-2">
        Input cost by row is each cropPlan&rsquo;s input cost per unit made in the month × its units distributed, so the rows follow the units.
        {noSowing.length > 0 && ` Distributed with no sowing of their own in the month, so no input cost on their rows: ${noSowing.join(', ')}.`}
        {' '}Sowings by cropPlan are on <Link className="farm-link" href="/farm/production-planning/calendar">Calendar</Link>.
      </p>
    </>
  );
}
