import { PageControls } from '@/components/PageControls';
import Link from 'next/link';
import { PageHeader, Card, Kpi, CheckPill, money, num } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { postLedger } from '@/server/ledgers';
import { loadCalendar, loadPostingLog } from '@/server/periods';
import { periodRow, productionDaysIn, verifyPostingChain } from '@/engine/periods';
import { periodWorkingCapital } from '@/engine/actuals-ledger';
import { periodsIn } from '@/engine/actuals';
import { ActualsClient } from '@/app/(farm)/farm/actuals/ActualsClient';
import { OpeningBalanceForm } from '@/components/OpeningBalanceForm';
import { capexRollup } from '@/engine/fixed-costs';
import { AdminOnlyNotice } from '@/components/AdminOnly';
import { withWorkspace } from '@/server/workspace';
import { listGrowPlans } from '@/server/grow-plans';
import { listTimeStudies } from '@/server/time-studies';
import { listNutrients } from '@/server/nutrients';
import { measuredRows } from '@/engine/measured-consumption';
import { MeasuredConsumptionCard } from '@/app/(farm)/farm/actuals/MeasuredConsumptionCard';

export const dynamic = 'force-dynamic';

const fromCents = (c: number) => c / 100;
const signed = (c: number) => (c < 0 ? `(${money(fromCents(-c), 0)})` : money(fromCents(c), 0));

export default async function ActualsPage(props: Parameters<typeof ActualsPageInner>[0]) {
  return withWorkspace(() => ActualsPageInner(props));
}

async function ActualsPageInner({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice area="Actuals" />;
  // Actuals is where facts are recorded: it always reads the Actual ledger, with the Plan
  // ledger's own month beside it (Roadmap N6) — not a twelfth of a year.
  const [actual, plan, access, calendar, trail, params, library, studyLibrary, nutrients] = await Promise.all([
    postLedger('actual'),
    postLedger('plan'),
    getFarmAccess(),
    loadCalendar(),
    loadPostingLog(),
    searchParams,
    listGrowPlans(),
    listTimeStudies(),
    listNutrients(),
  ]);
  const measured = measuredRows(library, studyLibrary.studies);
  const nutrientNames = Object.fromEntries(nutrients.map((n) => [n.key, n.name]));
  const { inputs, bundle } = actual;
  const label = actual.view.label;
  const basis = actual.view.basis;
  const chain = await verifyPostingChain(trail);

  const periods = periodsIn(bundle);
  const currentPeriod = new Date().toISOString().slice(0, 7);
  const asked = params.period && /^\d{4}-\d{2}$/.test(params.period) ? params.period : (periods[periods.length - 1] ?? currentPeriod);
  const month = actual.ledger.months.find((m) => m.label === asked) ?? actual.ledger.months.at(-1)!;
  const period = month.label;
  const opening = (bundle.openingBalances ?? [])[0] ?? null;
  const wc = periodWorkingCapital(actual.ledger.entries, period, month.balanceSheet.currentUnitOfLongTermDebtCents, (bundle.openingBalances ?? []).some((o) => o.asOf <= month.to));
  const p = actual.ledger.periods.find((x) => x.period === period) ?? null;
  const s = { incomeStatement: month.incomeStatement, balanceSheet: month.balanceSheet, cashCents: month.cashFlow.closingCashCents, balanced: month.balanced };
  const planMonth = plan.ledger.months.find((m) => m.label === period) ?? null;
  const lockRow = periodRow(period, calendar.periods);
  const days = productionDaysIn(period, calendar.closures);

  const is = s.incomeStatement;
  // Fixed cost per unit for the recorded month (operating-model-roadmap §3.5): the month's
  // fixed expense over its units distributed. A period metric, never in the cost of a unit.
  const fixed = month.fixedExpense;
  const pis = planMonth?.incomeStatement ?? null;
  const row = (labelText: string, actualCents: number, planCents: number | null) => (
    <tr key={labelText}>
      <td>{labelText}</td>
      <td className="num">{signed(actualCents)}</td>
      <td className="num">{planCents === null ? '—' : signed(planCents)}</td>
      <td className="num">{planCents === null ? '—' : signed(actualCents - planCents)}</td>
    </tr>
  );

  return (
    <>
      <PageHeader
        title="Actuals"
        purpose="Record period bills and watch the period's records post to the statements."
        functions={['Units produced and distributed', 'Statement of income', 'Posting trail', 'Records', 'Measured on approved time studies']}
        connects={[
          { href: '/farm/procurement', dir: 'from' },
          { href: '/farm/production-planning', dir: 'from' },
          { href: '/farm/orders', dir: 'from' },
          { href: '/farm/financials/pnl', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Each event is recorded where it happens: receipts on Procurement, sowing closes on Production Planning, distributions on Orders. Only period bills are recorded here.</li>
            <li>Records post to the statements through the same chain the forecast uses.</li>
            <li>A period with records shows what happened. A period without shows nothing here and the forecast on the other pages.</li>
            <li>What the approved time studies measured (labor, water and supplements per tray) is listed per grow plan beside what the plan was costed at before them.</li>
          </ul>
        }
        status="live"
      />

      <PageControls>
        <span className="farm-fs-xs farm-c-soft inline-flex flex-wrap items-center gap-x-[0.45rem]">
          <span className="farm-kpi-sub">Period</span>
          {!periods.includes(period) && <strong className="farm-c-ink">{period}</strong>}
          {periods.map((pp) => (
            pp === period ? <strong key={pp} className="farm-c-ink">{pp}</strong> : <Link key={pp} className="farm-link" href={`/farm/actuals?period=${pp}`}>{pp}</Link>
          ))}
        </span>
      </PageControls>
      <div
        className="mb-4 border! border-[color:var(--farm-line)]! bg-[color:var(--farm-surface-2)]! rounded-[0.6rem]! py-[0.7rem]! px-[1.1rem]! farm-fs-sm farm-c-soft"
      >
        Period <strong className="farm-c-ink">{period}</strong>
        {' '}· standards from the {basis === 'forecast' ? 'open forecast' : 'plan of record'}: <strong className="farm-c-ink">{label ?? 'Plan defaults'}</strong>.
        {' '}· <strong className="farm-c-ink">{lockRow?.status === 'locked' ? 'Locked' : 'Open'}</strong>
        {lockRow?.status === 'locked' && lockRow.lockedAt ? ` by ${lockRow.lockedBy ?? 'a super admin'} on ${lockRow.lockedAt.slice(0, 10)}` : ''}
        {' '}· {days.days.length} production day{days.days.length === 1 ? '' : 's'}{days.closed.length > 0 ? ` (${days.closed.length} closed)` : ''}
      </div>

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={num(Math.round(p?.servingsProduced ?? 0))} label="Servings produced" sub={`${p?.sowings.length ?? 0} sowing record${(p?.sowings.length ?? 0) === 1 ? '' : 's'} closed`} />
        <Kpi value={num(Math.round(p?.unitsDistributed ?? 0))} label="Units distributed" sub={planMonth ? `${num(Math.round(planMonth.unitsDistributed))} on the Plan ledger` : 'Outside the plan’s window'} />
        <Kpi value={fixed.perUnitCents === null ? '—' : money(fixed.perUnitCents / 100)} label="Fixed cost per unit" sub={`${money(fromCents(fixed.totalCents), 0)} fixed expense over ${num(Math.round(month.unitsDistributed))} units distributed — a period metric`} />
        <Kpi value={money(fromCents(is.revenueCents), 0)} label="Revenue, actual" sub={pis ? `${money(fromCents(pis.revenueCents), 0)} on the Plan ledger` : 'Outside the plan’s window'} />
        <Kpi value={signed(is.netIncomeCents)} label="Net income, actual" sub={pis ? `${signed(pis.netIncomeCents)} on the Plan ledger` : 'Outside the plan’s window'} />
        <Kpi value={<span>Journal <CheckPill ok={s.balanced} okLabel="balances" overLabel="out of balance" /></span>} label="Integrity" sub={p ? `${p.entries.length} entries this period` : 'No records this period'} />
      </div>

      <div className="grid gap-4 mt-4 farm-autofit-22">
        <Card title={`Statement of income — ${period}, actual against the Plan ledger`}>
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead>
                <tr><th>Line</th><th className="num">Actual</th><th className="num">Plan</th><th className="num">Difference</th></tr>
              </thead>
              <tbody>
                {row('Revenue', is.revenueCents, pis?.revenueCents ?? null)}
                {row('Cost of goods sold at standard', -is.costOfGoodsSoldCents, pis ? -pis.costOfGoodsSoldCents : null)}
                {is.manufacturingVariances.map((v) => (
                  <tr key={v.code}><td className="pl-5!">{v.label}</td><td className="num">{signed(-v.cents)}</td><td className="num">—</td><td className="num">{signed(-v.cents)}</td></tr>
                ))}
                {row('Gross margin', is.grossMarginCents, pis?.grossMarginCents ?? null)}
                {[...is.sellingAndDistribution, ...is.generalAndAdministrative, ...is.otherOperating].map((v) => (
                  <tr key={v.code}><td>{v.label}</td><td className="num">{signed(-v.cents)}</td><td className="num">—</td><td className="num">{signed(-v.cents)}</td></tr>
                ))}
                {row('Operating income', is.operatingIncomeCents, pis?.operatingIncomeCents ?? null)}
                {row('Net income, pre-tax', is.netIncomeCents, pis?.netIncomeCents ?? null)}
              </tbody>
            </table>
          </div>
          <p className="farm-kpi-sub mt-2">
            The Plan column is the same month on the Plan ledger — the saved open forecast run day by day and posted
            through the same functions — {planMonth ? '' : `and ${period} is outside its window (${plan.ledger.from} to ${plan.ledger.to}), so it reads —`}. The
            full comparison by period, grow plan, channel and subscriber is Roadmap N7.
          </p>
        </Card>

        <Card title={`Position at ${period} end — cumulative over recorded periods`}>
          <table className="farm-table">
            <tbody>
              <tr><td>Cash</td><td className="num">{signed(s.cashCents)}</td></tr>
              {wc.processorClearingCents !== 0 && <tr><td>Retail and wholesale orders captured, not yet deposited</td><td className="num">{signed(wc.processorClearingCents)}</td></tr>}
              <tr><td>Inventory at standard, by stage</td><td className="num">{signed(s.balanceSheet.inventoryCents)}</td></tr>
              {s.balanceSheet.currentAssets.filter((r) => r.code >= '1400' && r.code < '1500').map((r) => (
                <tr key={r.code}><td className="pl-5!">{r.label}</td><td className="num">{signed(r.cents)}</td></tr>
              ))}
              {s.balanceSheet.currentAssets.filter((r) => r.code === '1300').map((r) => (
                <tr key={r.code}><td>{r.label}</td><td className="num">{signed(r.cents)}</td></tr>
              ))}
              {s.balanceSheet.currentLiabilities.map((r) => (
                <tr key={r.code}><td>{r.label}</td><td className="num">{signed(r.cents)}</td></tr>
              ))}
              <tr className="total"><td>Retained earnings to date</td><td className="num">{signed(s.balanceSheet.retainedEarningsCents)}</td></tr>
            </tbody>
          </table>
          {p && (
            <table className="farm-table mt-3">
              <tbody>
                <tr><td>Standard cost per unit relieved</td><td className="num">{money(fromCents(p.standardCostPerUnitCents), 4)}</td></tr>
                <tr><td>Overhead applied / incurred</td><td className="num">{money(fromCents(p.overhead.appliedCents), 0)} / {money(fromCents(p.overhead.incurredCents), 0)}</td></tr>
                <tr><td>{p.overhead.volumeVarianceCents >= 0 ? 'Under-absorbed — period charge' : 'Over-absorbed — period credit'}</td><td className="num">{money(fromCents(Math.abs(p.overhead.volumeVarianceCents)), 0)}</td></tr>
                <tr><td>Lease + utilities: budget accrued / billed</td><td className="num">{money(fromCents(p.overhead.budgetCents), 0)} / {money(fromCents(p.overhead.billedCents), 0)}</td></tr>
                <tr><td>Overhead spending variance</td><td className="num">{signed(p.overhead.spendingVarianceCents)}</td></tr>
                {p.overhead.accruedUnbilledCents > 0 && <tr><td>Accrued, not yet billed</td><td className="num">{money(fromCents(p.overhead.accruedUnbilledCents), 0)}</td></tr>}
                <tr><td>Mass balance</td><td className="num"><CheckPill ok={p.massBalanceFailures.length === 0} okLabel="Reconciled" overLabel={`${p.massBalanceFailures.length} failure${p.massBalanceFailures.length === 1 ? '' : 's'}`} /></td></tr>
                <tr><td>Input lots not recorded</td><td className="num">{p.traceabilityGaps}</td></tr>
              </tbody>
            </table>
          )}
          {p && p.notes.length > 0 && (
            <ul className="farm-kpi-sub mt-2 pl-[1.1rem]! grid! gap-[0.3rem]!">
              {p.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          )}
          <table className="farm-table mt-3">
            <tbody>
              <tr><td>Receivables · days to collect</td><td className="num">{signed(wc.receivableCents)} · {wc.daysToCollect === null ? '—' : `${wc.daysToCollect.toFixed(1)} d`}</td></tr>
              <tr><td>Trade payables · days to pay</td><td className="num">{signed(wc.payableCents)} · {wc.daysToPay === null ? '—' : `${wc.daysToPay.toFixed(1)} d`}</td></tr>
              <tr><td className="pl-5!">Of which received, not invoiced</td><td className="num">{signed(wc.goodsReceivedNotInvoicedCents)}</td></tr>
              <tr><td>Accrued payroll — wages, taxes, workers&apos; comp, benefits</td><td className="num">{signed(wc.accruedPayrollCents)}</td></tr>
              {s.balanceSheet.currentUnitOfLongTermDebtCents > 0 && <tr><td>Current unit of long-term debt (presented)</td><td className="num">{signed(s.balanceSheet.currentUnitOfLongTermDebtCents)}</td></tr>}
              <tr><td>Long-term debt, less its current unit</td><td className="num">{signed(s.balanceSheet.longTermDebtCents)}</td></tr>
              {s.balanceSheet.contributedEquity.map((r) => <tr key={r.code}><td>{r.label}</td><td className="num">{signed(r.cents)}</td></tr>)}
              {p?.payroll && <tr><td>Payroll no sowing charged ({period})</td><td className="num">{signed(p.payroll.unassignedCents)}</td></tr>}
            </tbody>
          </table>
          <p className="farm-kpi-sub mt-2">
            {wc.openingRecorded ? 'The position opens from the opening balance recorded below.' : 'No opening balance is recorded, so the position starts from nil.'}{' '}
            Receivables and payables stay open until a payment record applies to them; payroll posts from Staffing&apos;s closed pay periods — none are received until the connection is live — and is taken as paid on each pay date through today; loan payments are not yet recorded against the debt.
            Days to collect and to pay use the period-end balance over the period&apos;s flow, in calendar days.
          </p>
        </Card>
      </div>

      <OpeningBalanceForm
        canRecord={access.isSuperAdmin}
        opening={opening}
        defaults={{
          asOf: inputs.openingPosition.loanStartDate,
          ownerEquityCents: Math.round(inputs.openingPosition.ownerEquity * 100),
          fixedAssetsCents: Math.round(capexRollup(inputs).totalCapex * 100),
          longTermDebtCents: Math.round(capexRollup(inputs).totalCapex * 100),
        }}
      />

      <ActualsClient
        period={period}
        canRecord={access.isSuperAdmin}
        periodRow={lockRow}
        closures={calendar.closures}
        trail={trail.slice(-60).reverse()}
        chain={chain}
        bundle={{
          sowings: bundle.sowings.filter((b) => b.productionDate.startsWith(period)),
          receipts: bundle.receipts.filter((r) => r.receivedOn.startsWith(period)),
          distributions: bundle.distributions.filter((d) => d.distributedOn.startsWith(period)),
          bills: bundle.bills.filter((b) => b.period === period),
        }}
        channels={inputs.phases.map((ph) => ({ phase: ph.phase, market: ph.market, priceCents: Math.round(ph.pricePerUnit * 100) }))}
      />

      <MeasuredConsumptionCard rows={measured} names={nutrientNames} />

      <p className="farm-kpi-sub mt-4">
        A locked period refuses every posting dated inside it; a super admin can reopen it, and both events are entries on the posting trail. Fiscal periods are calendar months; the fiscal year is the calendar year.
        Records post through the production chain on <Link className="farm-link" href="/farm/financials/ledger">Ledger</Link>.
        Goods are received on <Link className="farm-link" href="/farm/procurement">Procurement</Link> against the purchase order,
        a sowing record is closed on <Link className="farm-link" href="/farm/production-planning?level=day">Production Planning</Link> where the run is planned,
        and a distribution is recorded on <Link className="farm-link" href="/farm/orders">Orders</Link> on the order it fills — by operators.
        The forecast the actuals are compared with is the one open in the forecast bar. Period bills are recorded by super admins.
      </p>
    </>
  );
}
