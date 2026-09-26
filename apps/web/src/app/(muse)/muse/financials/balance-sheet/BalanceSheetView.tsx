'use client';

import { PageControls } from '../../_components/PageControls';
import Link from 'next/link';
import { PageHeader, Kpi, CheckPill } from '../../_components/ui';
import { useLedgerBook, useStatementPeriod } from '../../_state/ledger';
import { BalanceSheetCards, LedgerStatus, PeriodPicker, dollars, signed } from '../../_components/ledger/LedgerParts';

/** The classified balance sheet at the end of the period picked, on the selected ledger (Roadmap N6). */
export function BalanceSheetView() {
  const { book, error, pending } = useLedgerBook();
  const { granularity, period, setGranularity, setLabel } = useStatementPeriod(book);
  const c = period?.balanceSheet;
  const balanced = c ? c.totalAssetsCents === c.totalLiabilitiesCents + c.totalEquityCents : false;

  return (
    <>
      <PageHeader
        title="Balance Sheet"
        purpose="Read the business’s position at each period end."
        functions={['Assets', 'Liabilities', 'Equity', 'Balance check']}
        howItWorks={
          <ul>
            <li>The statement is classified, at the end of the period picked, on the ledger selected in the forecast bar.</li>
            <li>It is built from the same journal as the statement of income and the cash flow.</li>
            <li>Inventory is carried at standard cost by stage.</li>
            <li>Fixed assets are at cost less accumulated depreciation.</li>
          </ul>
        }
        status="live"
      />
      <LedgerStatus book={book} pending={pending} error={error} />
      {book && period && c && (
        <>
          <PageControls><PeriodPicker book={book} granularity={granularity} period={period} onGranularity={setGranularity} onLabel={setLabel} /></PageControls>
          <div className="grid gap-3 mb-4 muse-autofit-11">
            <Kpi value={dollars(c.totalAssetsCents)} label="Total assets" sub={`${dollars(c.inventoryCents)} inventory at standard`} />
            <Kpi value={dollars(c.totalLiabilitiesCents)} label="Total liabilities" sub={`${dollars(c.longTermDebtCents + c.currentPortionOfLongTermDebtCents)} long-term debt`} />
            <Kpi value={signed(c.totalEquityCents)} label="Total equity" sub={`${signed(c.retainedEarningsCents)} retained earnings`} />
            <Kpi value={<span>A = L + E <CheckPill ok={balanced} okLabel="✓" overLabel="✗" /></span>} label="Balance check" sub={`At ${period.to}`} />
          </div>
          <BalanceSheetCards period={period} />
        </>
      )}
      <p className="muse-kpi-sub mt-4">
        Built from the same journal as the <Link className="muse-link" href="/muse/financials/ledger">Ledger</Link>, the{' '}
        <Link className="muse-link" href="/muse/financials/pnl">Profit &amp; Loss</Link> and the{' '}
        <Link className="muse-link" href="/muse/financials/cash-flow">Cash Flow</Link>.
      </p>
    </>
  );
}
