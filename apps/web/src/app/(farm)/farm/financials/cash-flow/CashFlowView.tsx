'use client';

import { PageControls } from '../../_components/PageControls';
import Link from 'next/link';
import { PageHeader, Kpi, CheckPill } from '../../_components/ui';
import { useLedgerBook, useStatementPeriod } from '../../_state/ledger';
import { CashFlowCards, LedgerStatus, PeriodPicker, signed } from '../../_components/ledger/LedgerParts';

/** Cash flow for the period picked, direct and indirect, on the selected ledger (Roadmap N6). */
export function CashFlowView() {
  const { book, error, pending } = useLedgerBook();
  const { granularity, period, setGranularity, setLabel } = useStatementPeriod(book);

  return (
    <>
      <PageHeader
        title="Cash Flow"
        purpose="See where cash moved, by the direct and indirect methods."
        functions={['Statement of cash flows', 'Direct method', 'Method check', 'Closing cash']}
        connects={[
          { href: '/farm/financials/ledger', dir: 'from' },
          { href: '/farm/receivables', dir: 'from' },
          { href: '/farm/payables', dir: 'from' },
          { href: '/farm/financials/capital', dir: 'from' },
        ]}
        howItWorks={
          <ul>
            <li>The statement covers the period picked, on the ledger selected in the forecast bar.</li>
            <li>The indirect method starts from net income and adds back what did not move cash.</li>
            <li>The direct method groups every cash entry by its counter-account.</li>
            <li>The two methods tie, and the check is shown.</li>
          </ul>
        }
        status="live"
      />
      <LedgerStatus book={book} pending={pending} error={error} />
      {book && period && (
        <>
          <PageControls><PeriodPicker book={book} granularity={granularity} period={period} onGranularity={setGranularity} onLabel={setLabel} /></PageControls>
          <div className="grid gap-3 mb-4 farm-autofit-11">
            <Kpi value={signed(period.cashFlow.openingCashCents)} label="Opening cash" sub={period.from} />
            <Kpi value={signed(period.cashFlowIndirect.operatingCents)} label="Cash from operations" sub="Net income, depreciation added back, working capital" />
            <Kpi value={signed(period.cashFlowIndirect.investingCents)} label="Cash from investing" sub="Capital bought for cash" />
            <Kpi value={signed(period.cashFlowIndirect.financingCents)} label="Cash from financing" sub="Equity, debt drawn and repaid" />
            <Kpi value={signed(period.cashFlow.closingCashCents)} label="Closing cash" sub={period.to} />
            <Kpi value={<span>Direct = indirect <CheckPill ok={period.cashFlowTies} okLabel="✓" overLabel="✗" /></span>} label="Method check" sub="Both methods give the same net change" />
          </div>
          <CashFlowCards period={period} />
        </>
      )}
      <p className="farm-kpi-sub mt-4">
        Same journal as the <Link className="farm-link" href="/farm/financials/ledger">Ledger</Link>, the{' '}
        <Link className="farm-link" href="/farm/financials/pnl">Profit &amp; Loss</Link> and the{' '}
        <Link className="farm-link" href="/farm/financials/balance-sheet">Balance Sheet</Link>. Interest is inside net income; principal is a financing outflow.
      </p>
    </>
  );
}
