'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { PageHeader, Card, Kpi, money } from '@/components/ui';
import { EditableNumber } from '@/components/EditableNumber';
import { capexRollup } from '@/engine/proforma';
import { equipmentPurchase as defaultEquipmentPurchase } from '@/data/finance';
import { BuildOutCard } from '@/components/setup/BuildOutCard';
import { LoansCard } from '@/components/setup/LoansCard';
import { FixedCostsCard } from '@/components/setup/FixedCostsCard';
import { useScenario } from '@/state/scenario-store';
import { useLedgerBook, useStatementPeriod } from '@/state/ledger';
import { LedgerStatus, PeriodPicker, dollars, signed } from '@/components/ledger/LedgerParts';

export default function CapitalPage() {
  const { resolved, setCapexFinance } = useScenario();
  const fp = resolved.equipmentPurchase;
  const roll = useMemo(() => capexRollup(resolved), [resolved]);
  const { book, error: bookError, pending: bookPending } = useLedgerBook();
  const { granularity, period, setGranularity, setLabel } = useStatementPeriod(book);

  return (
    <>
      <PageHeader
        title="Capital & Financing"
        purpose="Total the capital the equipment and any build-out require, and the loans and fixed costs that carry them."
        functions={['Total capital expenditure', 'Equipment by category', 'Loans', 'Monthly fixed costs', 'Monthly financing']}
        connects={[
          { href: '/farm/grow-units', dir: 'from' },
          { href: '/farm/financials/pnl', dir: 'to' },
          { href: '/farm/financials/balance-sheet', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Capital is the equipment counted in the forecast, home and commercial, plus any build-out of a rented facility.</li>
            <li>The home grow room and a commercial facility are set up on <Link className="farm-link" href="/farm/grow-units">Equipment</Link>; the same loans and fixed costs are edited here.</li>
            <li>Editing a loan or a fixed-cost line recomputes the monthly figures.</li>
            <li>The monthly figures feed the fixed-cost base on the Profit &amp; Loss.</li>
          </ul>
        }
        status="live"
      />

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={money(roll.totalCapex, 0)} label="Total capital expenditure" sub="Equipment + build-out" />
        <Kpi value={money(roll.phase1Capex, 0)} label="Required for Phase 1 only" sub="Phase 1 equipment + build-out" />
        <Kpi value={money(roll.totalMonthlyFinancing, 0)} label="Monthly financing" sub="The loans\u2019 monthly payments" />
        <Kpi value={money(roll.equipmentAll, 0)} label="Equipment, all phases" sub={money(roll.leaseholdSubtotal, 0) + ' build-out'} />
      </div>

      <Card title="Capital and debt — on the ledger selected in the forecast bar" className="mt-4">
        <LedgerStatus book={book} pending={bookPending} error={bookError} />
        {book && period && (
          <>
            <PeriodPicker book={book} granularity={granularity} period={period} onGranularity={setGranularity} onLabel={setLabel} />
            <div className="grid gap-4 farm-autofit-20">
              <table className="farm-table">
                <tbody>
                  <tr><td colSpan={2} className="font-semibold!">In {period.label}</td></tr>
                  {period.cashFlowIndirect.investing.map((r) => <tr key={`${r.code}-${r.label}`}><td>{r.label}</td><td className="num">{signed(r.cents)}</td></tr>)}
                  {period.cashFlowIndirect.financing.map((r) => <tr key={`${r.code}-${r.label}`}><td>{r.label}</td><td className="num">{signed(r.cents)}</td></tr>)}
                  {period.cashFlowIndirect.investing.length + period.cashFlowIndirect.financing.length === 0 && <tr><td className="farm-c-soft">No capital bought and no financing in the period</td><td className="num">—</td></tr>}
                  <tr><td>Interest expensed</td><td className="num">{dollars(period.fixedExpense.interestCents)}</td></tr>
                </tbody>
              </table>
              <table className="farm-table">
                <tbody>
                  <tr><td colSpan={2} className="font-semibold!">At {period.to}</td></tr>
                  <tr><td>Fixed assets at cost</td><td className="num">{signed(period.balanceSheet.fixedAssetsAtCostCents)}</td></tr>
                  <tr><td>Less accumulated depreciation</td><td className="num">{signed(period.balanceSheet.accumulatedDepreciationCents)}</td></tr>
                  <tr className="total"><td>Net fixed assets</td><td className="num">{signed(period.balanceSheet.netFixedAssetsCents)}</td></tr>
                  <tr><td>Long-term debt, current unit presented</td><td className="num">{signed(period.balanceSheet.currentUnitOfLongTermDebtCents)}</td></tr>
                  <tr><td>Long-term debt, non-current</td><td className="num">{signed(period.balanceSheet.longTermDebtCents)}</td></tr>
                  <tr className="total"><td>Cash</td><td className="num">{signed(period.cashFlow.closingCashCents)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="farm-kpi-sub mt-2">
              {book.kind === 'plan'
                ? 'On Plan, equipment is bought on its in-service date in the forecast, counted leasehold at the start, and each loan is drawn on its start date and repaid on its schedule. The schedules below are the definitions it reads.'
                : 'On Actual, only capital purchases, loan draws and payments on record post.'}
            </p>
          </>
        )}
      </Card>

      <div className="grid gap-4 mt-4 farm-autofit-20">
        <Card title="Equipment by category">
          <table className="farm-table">
            <tbody>
              {roll.byCategory.map((c) => (
                <tr key={c.category}><td>{c.category}</td><td className="num">{money(c.subtotal, 0)}</td></tr>
              ))}
              <tr className="total"><td>Equipment subtotal — all phases</td><td className="num">{money(roll.equipmentAll, 0)}</td></tr>
              <tr><td className="farm-c-soft">Phase 1</td><td className="num">{money(roll.equipmentPhase1, 0)}</td></tr>
              <tr><td className="farm-c-soft">Phase 2 add</td><td className="num">{money(roll.equipmentPhase2Add, 0)}</td></tr>
              <tr><td className="farm-c-soft">Phase 3 add</td><td className="num">{money(roll.equipmentPhase3Add, 0)}</td></tr>
            </tbody>
          </table>
          <p className="farm-kpi-sub mt-2">
            The in-service and planned rows of the <Link className="farm-link" href="/farm/grow-units">equipment library</Link>, where every line&rsquo;s quantity, unit cost, status and service date are entered.
          </p>
        </Card>

        <BuildOutCard />
      </div>

      <LoansCard className="mt-4" />

      <FixedCostsCard className="mt-4" />

      <Card title="Equipment purchase" className="mt-4">
        <table className="farm-table">
          <tbody>
            <tr>
              <td>Used-equipment discount — what a used line costs against new</td>
              <td className="num">
                <EditableNumber value={fp.usedDiscount * 100} defaultValue={defaultEquipmentPurchase.usedDiscount * 100} onChange={(v) => setCapexFinance('usedDiscount', v / 100)} step={5} suffix="%" ariaLabel="Used equipment discount percent" showBadge={false} />
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

    </>
  );
}
