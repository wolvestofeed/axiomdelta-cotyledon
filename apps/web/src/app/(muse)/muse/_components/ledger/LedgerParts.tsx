'use client';

import Link from 'next/link';
import { Card, CheckPill, money, num } from '../ui';
import { periodsOf, type Granularity, type LedgerBookView } from '../../_engine/ledger-view';
import type { StatementPeriod } from '../../_engine/ledger-statements';

/**
 * The pieces every statement page shares (Roadmap N6): the ledger it is reading,
 * the period picker, and the three statements for one period.
 */

const fromCents = (c: number) => c / 100;
export const signed = (c: number) => (c < 0 ? `(${money(fromCents(-c), 0)})` : money(fromCents(c), 0));
export const dollars = (c: number) => money(fromCents(c), 0);
const GRANULARITY_LABELS: Record<Granularity, string> = { month: 'Month', quarter: 'Quarter', year: 'Year' };

/** What the page is reading, and whether it is still posting. */
export function LedgerStatus({ book, pending, error }: { book: LedgerBookView | null; pending: boolean; error: string | null }) {
  if (error) return <div className="mb-4 border! border-[color:var(--muse-line)]! bg-[color:var(--muse-surface-2)]! rounded-[0.6rem]! py-[0.7rem]! px-[1.1rem]! muse-fs-sm muse-c-soft" role="alert">The ledger could not be posted: {error}</div>;
  if (!book) return <div className="mb-4 border! border-[color:var(--muse-line)]! bg-[color:var(--muse-surface-2)]! rounded-[0.6rem]! py-[0.7rem]! px-[1.1rem]! muse-fs-sm muse-c-soft">Posting the ledger…</div>;
  return (
    <div className="mb-4 border! border-[color:var(--muse-line)]! bg-[color:var(--muse-surface-2)]! rounded-[0.6rem]! py-[0.7rem]! px-[1.1rem]! muse-fs-sm muse-c-soft" role="status">
      {book.kind === 'plan' ? (
        <>
          <strong className="muse-c-ink">Plan</strong> — {book.forecastLabel ? <>the forecast <strong className="muse-c-ink">{book.forecastLabel}</strong></> : 'plan defaults'}, unsaved edits included · {book.from} to {book.to}
          {book.horizonYears ? ` · ${book.horizonYears}-year timeline` : ''}
        </>
      ) : (
        <>
          <strong className="muse-c-ink">Actual</strong> — recorded documents only · {book.from} to {book.to}
          {book.empty ? ' · nothing is on record yet, so every figure reads zero for the period named' : ''}
        </>
      )}
      {' · '}
      {num(book.entryCount)} entries · <CheckPill ok={book.balanced} okLabel="balanced and tied" overLabel="does not balance" />
      {pending ? ' · updating…' : ` · posted in ${num(book.computedMs)} ms`}
    </div>
  );
}

/** Month, quarter or year, and which one. */
export function PeriodPicker({
  book,
  granularity,
  period,
  onGranularity,
  onLabel,
}: {
  book: LedgerBookView;
  granularity: Granularity;
  period: StatementPeriod | null;
  onGranularity: (g: Granularity) => void;
  onLabel: (label: string) => void;
}) {
  const list = periodsOf(book, granularity);
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1 items-center">
      <span className="muse-kpi-sub inline-flex items-center gap-2">
        Period
        <span className="inline-flex gap-[0.3rem]">
          {(['month', 'quarter', 'year'] as Granularity[]).map((g) => (
            <button
              key={g}
              type="button"
              className={`muse-btn py-[0.1rem]! px-[0.55rem]! ${granularity === g ? 'bg-[color:var(--muse-ink)]! text-[var(--muse-surface)]! border-[color:var(--muse-ink)]!' : ''}`}
              aria-pressed={granularity === g}
              onClick={() => onGranularity(g)}
            >
              {GRANULARITY_LABELS[g]}
            </button>
          ))}
        </span>
      </span>
      <label className="muse-kpi-sub inline-flex items-center gap-2">
        {GRANULARITY_LABELS[granularity]}
        <select className="muse-select" value={period?.label ?? ''} onChange={(e) => onLabel(e.target.value)}>
          {list.map((p) => (
            <option key={p.label} value={p.label}>{p.label}</option>
          ))}
        </select>
      </label>
      {period && <span className="muse-kpi-sub">{period.from} to {period.to}</span>}
    </span>
  );
}

export function IncomeStatementCard({ period, title = 'Statement of income — absorption basis', children }: { period: StatementPeriod; title?: string; children?: React.ReactNode }) {
  const is = period.incomeStatement;
  return (
    <Card title={title}>
      <table className="muse-table">
        <tbody>
          {is.revenue.map((r) => (
            <tr key={r.code}><td>{r.label}</td><td className="num">{dollars(r.cents)}</td></tr>
          ))}
          <tr className="total"><td>Revenue</td><td className="num">{dollars(is.revenueCents)}</td></tr>
          <tr><td>Cost of goods sold at standard</td><td className="num">({dollars(is.costOfGoodsSoldCents)})</td></tr>
          <tr className="total"><td>Gross margin at standard</td><td className="num">{dollars(is.grossMarginAtStandardCents)}</td></tr>
          {is.manufacturingVariances.map((r) => (
            <tr key={r.code}><td className="pl-5!">{r.label}</td><td className="num">{r.cents < 0 ? dollars(-r.cents) : `(${dollars(r.cents)})`}</td></tr>
          ))}
          {is.periodProductionCosts.map((r) => (
            <tr key={r.code}><td className="pl-5!">{r.label}</td><td className="num">{r.cents < 0 ? dollars(-r.cents) : `(${dollars(r.cents)})`}</td></tr>
          ))}
          <tr className="total"><td>Gross margin</td><td className="num">{dollars(is.grossMarginCents)}</td></tr>
          {is.sellingAndDistribution.map((r) => (
            <tr key={r.code}><td>Selling &amp; distribution — {r.code === '7900' ? 'delivery to sites' : r.label.toLowerCase()}</td><td className="num">({dollars(r.cents)})</td></tr>
          ))}
          {is.generalAndAdministrative.map((r) => (
            <tr key={r.code}><td>General &amp; administrative — {r.label.toLowerCase()}</td><td className="num">({dollars(r.cents)})</td></tr>
          ))}
          {is.otherOperating.map((r) => (
            <tr key={r.code}><td>{r.label}</td><td className="num">({dollars(r.cents)})</td></tr>
          ))}
          <tr className="total"><td>Operating income</td><td className="num">{signed(is.operatingIncomeCents)}</td></tr>
          {is.financing.map((r) => (
            <tr key={r.code}><td>{r.label}</td><td className="num">({dollars(r.cents)})</td></tr>
          ))}
          <tr className="total"><td>Net income, pre-tax</td><td className="num">{signed(is.netIncomeCents)}</td></tr>
        </tbody>
      </table>
      {children}
    </Card>
  );
}

export function BalanceSheetCards({ period }: { period: StatementPeriod }) {
  const c = period.balanceSheet;
  const inventoryRows = c.currentAssets.filter((r) => r.code >= '1400' && r.code < '1500');
  const otherCurrent = c.currentAssets.filter((r) => !(r.code >= '1400' && r.code < '1500'));
  return (
    <div className="grid gap-4 muse-autofit-20">
      <Card title={`Assets at ${period.to}`}>
        <table className="muse-table">
          <tbody>
            <tr><td colSpan={2} className="font-semibold!">Current assets</td></tr>
            {otherCurrent.map((r) => (
              <tr key={r.code}><td>{r.label}</td><td className="num">{signed(r.cents)}</td></tr>
            ))}
            {inventoryRows.map((r) => (
              <tr key={r.code}><td className="pl-5!">{r.label}</td><td className="num">{signed(r.cents)}</td></tr>
            ))}
            {inventoryRows.length > 0 && (
              <tr><td className="muse-c-soft">Inventory at standard cost, total</td><td className="num muse-c-soft">{signed(c.inventoryCents)}</td></tr>
            )}
            <tr className="total"><td>Total current assets</td><td className="num">{signed(c.currentAssetsCents)}</td></tr>
            <tr><td colSpan={2} className="font-semibold! pt-3!">Non-current assets</td></tr>
            <tr><td>Fixed assets at cost</td><td className="num">{signed(c.fixedAssetsAtCostCents)}</td></tr>
            <tr><td>Less accumulated depreciation</td><td className="num">{signed(c.accumulatedDepreciationCents)}</td></tr>
            <tr className="total"><td>Net fixed assets</td><td className="num">{signed(c.netFixedAssetsCents)}</td></tr>
            <tr className="total"><td>Total assets</td><td className="num">{signed(c.totalAssetsCents)}</td></tr>
          </tbody>
        </table>
      </Card>
      <div className="grid gap-4 grid-cols-[1fr]! [align-content:start]!">
        <Card title="Liabilities">
          <table className="muse-table">
            <tbody>
              <tr><td colSpan={2} className="font-semibold!">Current liabilities</td></tr>
              {c.currentLiabilities.length === 0 ? (
                <tr><td className="muse-c-soft">Nothing open at the period end</td><td className="num">—</td></tr>
              ) : (
                c.currentLiabilities.map((r) => (
                  <tr key={`${r.code}-${r.label}`}><td>{r.label}</td><td className="num">{signed(r.cents)}</td></tr>
                ))
              )}
              <tr className="total"><td>Total current liabilities</td><td className="num">{signed(c.currentLiabilitiesCents)}</td></tr>
              <tr><td colSpan={2} className="font-semibold! pt-3!">Non-current liabilities</td></tr>
              <tr><td>Long-term debt, less its current portion</td><td className="num">{signed(c.longTermDebtCents)}</td></tr>
              <tr className="total"><td>Total liabilities</td><td className="num">{signed(c.totalLiabilitiesCents)}</td></tr>
            </tbody>
          </table>
          <p className="muse-kpi-sub mt-2">
            The current portion — {dollars(c.currentPortionOfLongTermDebtCents)} of principal the loan schedules fall due for in the twelve months after {period.to} — is presented among current liabilities; no entry moves it.
          </p>
        </Card>
        <Card title="Equity">
          <table className="muse-table">
            <tbody>
              {c.contributedEquity.map((r) => (
                <tr key={r.code}><td>{r.label}</td><td className="num">{signed(r.cents)}</td></tr>
              ))}
              <tr><td>Retained earnings</td><td className="num">{signed(c.retainedEarningsCents)}</td></tr>
              <tr className="total"><td>Total equity</td><td className="num">{signed(c.totalEquityCents)}</td></tr>
              <tr className="total"><td>Total liabilities and equity</td><td className="num">{signed(c.totalLiabilitiesCents + c.totalEquityCents)}</td></tr>
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

export function CashFlowCards({ period }: { period: StatementPeriod }) {
  const cf = period.cashFlow;
  const ind = period.cashFlowIndirect;
  return (
    <div className="grid gap-4 muse-autofit-22">
      <Card title="Statement of cash flows — indirect method">
        <table className="muse-table">
          <tbody>
            <tr><td colSpan={2} className="font-semibold!">Operating activities</td></tr>
            <tr><td>Net income</td><td className="num">{signed(ind.netIncomeCents)}</td></tr>
            <tr><td>Depreciation (non-cash, in manufacturing overhead)</td><td className="num">{signed(ind.depreciationCents)}</td></tr>
            {ind.workingCapital.map((r) => (
              <tr key={r.code}><td>{r.label}</td><td className="num">{signed(r.cents)}</td></tr>
            ))}
            <tr className="total"><td>Cash from operating activities</td><td className="num">{signed(ind.operatingCents)}</td></tr>
            <tr><td colSpan={2} className="font-semibold! pt-3!">Investing activities</td></tr>
            {ind.investing.length === 0 ? (
              <tr><td className="muse-c-soft">No cash investing activity</td><td className="num">—</td></tr>
            ) : (
              ind.investing.map((r) => (
                <tr key={`${r.code}-${r.label}`}><td>{r.label}</td><td className="num">{signed(r.cents)}</td></tr>
              ))
            )}
            <tr className="total"><td>Cash from investing activities</td><td className="num">{signed(ind.investingCents)}</td></tr>
            <tr><td colSpan={2} className="font-semibold! pt-3!">Financing activities</td></tr>
            {ind.financing.length === 0 ? (
              <tr><td className="muse-c-soft">No financing activity</td><td className="num">—</td></tr>
            ) : (
              ind.financing.map((r) => (
                <tr key={`${r.code}-${r.label}`}><td>{r.label}</td><td className="num">{signed(r.cents)}</td></tr>
              ))
            )}
            <tr className="total"><td>Cash from financing activities</td><td className="num">{signed(ind.financingCents)}</td></tr>
            <tr className="total"><td>Net change in cash</td><td className="num">{signed(ind.netChangeCents)}</td></tr>
            <tr><td>Opening cash</td><td className="num">{signed(cf.openingCashCents)}</td></tr>
            <tr className="total"><td>Closing cash</td><td className="num">{signed(cf.closingCashCents)}</td></tr>
          </tbody>
        </table>
        {ind.nonCashFinancingCents !== 0 && (
          <p className="muse-kpi-sub mt-2">
            Non-cash investing and financing: {dollars(ind.nonCashFinancingCents)} of fixed assets were capitalised and financed by long-term debt in the same entry.
          </p>
        )}
      </Card>
      <Card title="Direct method — cash by counter-account">
        <table className="muse-table">
          <tbody>
            <tr><td colSpan={2} className="font-semibold!">Cash in</td></tr>
            {cf.inflows.length === 0 && <tr><td className="muse-c-soft">None</td><td className="num">—</td></tr>}
            {cf.inflows.map((r) => (
              <tr key={r.label}><td>{r.label}</td><td className="num">{dollars(r.amountCents)}</td></tr>
            ))}
            <tr className="total"><td>Total cash in</td><td className="num">{dollars(cf.inflows.reduce((s, r) => s + r.amountCents, 0))}</td></tr>
            <tr><td colSpan={2} className="font-semibold! pt-3!">Cash out</td></tr>
            {cf.outflows.length === 0 && <tr><td className="muse-c-soft">None</td><td className="num">—</td></tr>}
            {cf.outflows.map((r) => (
              <tr key={r.label}><td>{r.label}</td><td className="num">({dollars(r.amountCents)})</td></tr>
            ))}
            <tr className="total"><td>Total cash out</td><td className="num">({dollars(cf.outflows.reduce((s, r) => s + r.amountCents, 0))})</td></tr>
            <tr className="total"><td>Net change in cash</td><td className="num">{signed(cf.netChangeCents)}</td></tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/** The timeline's named gaps and the absorption behind the Plan ledger. */
export function PlanBasisCard({ book }: { book: LedgerBookView }) {
  if (book.kind !== 'plan') return null;
  const a = book.absorption;
  return (
    <Card title="What the Plan ledger ran on" className="mt-4">
      {a && (
        <table className="muse-table">
          <tbody>
            <tr><td>Budgeted manufacturing overhead a year — lease and utilities lines, depreciation on dated capital</td><td className="num">{money(a.annualFixedOverhead, 0)}</td></tr>
            <tr><td>Normal capacity — this forecast&rsquo;s own production a year, net of planned downtime</td><td className="num">{num(Math.round(a.normalCapacityMeals))} meals</td></tr>
            <tr className="total"><td>Absorption rate</td><td className="num">{money(a.ratePerMeal, 4)} / meal</td></tr>
          </tbody>
        </table>
      )}
      {book.gaps.length > 0 ? (
        <>
          <p className="muse-kpi-sub mt-3">What the definitions do not say, and what the timeline did about it:</p>
          <ul className="muse-kpi-sub mt-1 pl-[1.1rem]! grid! gap-[0.3rem]!">
            {book.gaps.map((g) => (
              <li key={g.kind}>{g.message} <span className="muse-c-faint">({num(g.count)})</span></li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muse-kpi-sub mt-3">No gaps: every document the timeline generated had its terms and links on file.</p>
      )}
      <p className="muse-kpi-sub mt-2">
        Volume is the services on <Link className="muse-link" href="/muse/customers">Customers</Link> run across the calendar, made on the lines in service on each date (<Link className="muse-link" href="/muse/equipment">Equipment</Link>). The timeline length and start date are set on the forecast.
      </p>
    </Card>
  );
}
