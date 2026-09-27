'use client';

import { PageControls } from '@/components/PageControls';
import Link from 'next/link';
import { PageHeader, Card, Kpi, num, pct } from '@/components/ui';
import { useLedgerBook, useStatementPeriod } from '@/state/ledger';
import { IncomeStatementCard, LedgerStatus, PeriodPicker, PlanBasisCard, dollars, signed } from '@/components/ledger/LedgerParts';

/**
 * Profit & Loss on the selected ledger (Roadmap N6): Plan — the open forecast's
 * timeline posted through the Plan ledger, unsaved edits included — or Actual,
 * the recorded documents. The same layout either way.
 */
export default function PnlPage() {
  const { book, error, pending } = useLedgerBook();
  const { granularity, period, setGranularity, setLabel } = useStatementPeriod(book);
  const is = period?.incomeStatement;
  const months = book && period ? book.months.filter((m) => m.from >= period.from && m.to <= period.to) : [];

  return (
    <>
      <PageHeader
        title="Profit & Loss"
        purpose="Read revenue, cost of goods and margin by month, quarter or year."
        functions={['Statement of income', 'Gross margin', 'Operating income', 'Month by month']}
        connects={[
          { href: '/farm/financials/ledger', dir: 'from' },
          { href: '/farm/financials/unit-economics', dir: 'from' },
          { href: '/farm/financials/capital', dir: 'from' },
          { href: '/farm/financials/plan-v-actual', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Plan or Actual follows the ledger selected in the forecast bar. Actual posts what was recorded.</li>
            <li>Plan runs the open forecast day by day, its subscribers, services, flat plans and the lines in service, and posts what the business would record.</li>
            <li>Cost of goods sold is the cost of the sowings relieved, as materials, labor and overhead, with the overhead variances and abnormal spoilage beneath it.</li>
            <li>Fixed cost never enters the cost of a unit.</li>
            <li>Manufacturing overhead is absorbed at normal capacity, and the unabsorbed remainder is a period charge.</li>
            <li>General and administrative cost is a period expense.</li>
          </ul>
        }
        status="live"
      />

      <LedgerStatus book={book} pending={pending} error={error} />

      {book && period && is && (
        <>
          <PageControls><PeriodPicker book={book} granularity={granularity} period={period} onGranularity={setGranularity} onLabel={setLabel} /></PageControls>

          <div className="grid gap-3 farm-autofit-11">
            <Kpi value={dollars(is.revenueCents)} label="Revenue" sub={`${num(Math.round(period.unitsDistributed))} units distributed`} />
            <Kpi value={dollars(is.grossMarginCents)} label="Gross margin" sub={is.revenueCents ? `${pct(is.grossMarginCents / is.revenueCents)} of revenue` : 'No revenue in the period'} />
            <Kpi value={signed(is.operatingIncomeCents)} label="Operating income" sub={is.revenueCents ? `${pct(is.operatingIncomeCents / is.revenueCents)} of revenue` : '—'} />
            <Kpi value={signed(is.netIncomeCents)} label="Net income, pre-tax" sub="After interest" />
            <Kpi value={num(Math.round(period.servingsProduced))} label="Servings produced" sub="Sowing records in the period" />
          </div>

          <div className="grid gap-4 mt-4 farm-autofit-22">
            <IncomeStatementCard period={period}>
              <p className="farm-kpi-sub mt-2">
                Cost of goods sold is what the units distributed cost, oldest sowing first: materials by lot at the price paid with
                packaging, direct labor as recorded (the approved standard where no crew is recorded), and overhead, variable at its standard
                per tray and fixed at the normal-capacity rate. A variance in brackets is unfavourable.
                Principal repaid on the loans is financing, not expense: see <Link className="farm-link" href="/farm/financials/cash-flow">Cash Flow</Link>.
              </p>
            </IncomeStatementCard>

            {months.length > 1 && (
              <Card title={`Month by month — ${period.label}`}>
                <div className="farm-scroll-x">
                  <table className="farm-table">
                    <thead>
                      <tr><th>Month</th><th className="num">Units</th><th className="num">Revenue</th><th className="num">Gross margin</th><th className="num">Operating income</th><th className="num">Net income</th></tr>
                    </thead>
                    <tbody>
                      {months.map((m) => (
                        <tr key={m.label}>
                          <td>{m.label}</td>
                          <td className="num">{num(Math.round(m.unitsDistributed))}</td>
                          <td className="num">{dollars(m.incomeStatement.revenueCents)}</td>
                          <td className="num">{signed(m.incomeStatement.grossMarginCents)}</td>
                          <td className="num">{signed(m.incomeStatement.operatingIncomeCents)}</td>
                          <td className="num">{signed(m.incomeStatement.netIncomeCents)}</td>
                        </tr>
                      ))}
                      <tr className="total">
                        <td>{period.label}</td>
                        <td className="num">{num(Math.round(period.unitsDistributed))}</td>
                        <td className="num">{dollars(is.revenueCents)}</td>
                        <td className="num">{signed(is.grossMarginCents)}</td>
                        <td className="num">{signed(is.operatingIncomeCents)}</td>
                        <td className="num">{signed(is.netIncomeCents)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>

          <PlanBasisCard book={book} />
        </>
      )}

      <p className="farm-kpi-sub mt-4">
        Same journal as the <Link className="farm-link" href="/farm/financials/ledger">Ledger</Link>,{' '}
        <Link className="farm-link" href="/farm/financials/cash-flow">Cash Flow</Link> and{' '}
        <Link className="farm-link" href="/farm/financials/balance-sheet">Balance Sheet</Link>. Per-unit economics are on{' '}
        <Link className="farm-link" href="/farm/financials/unit-economics">Unit Economics</Link>.
      </p>
    </>
  );
}
