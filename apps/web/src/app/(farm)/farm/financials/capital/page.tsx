'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader, Card, Kpi, money } from '../../_components/ui';
import { EditableNumber } from '../../_components/EditableNumber';
import { SectionSave } from '../../_components/SectionSave';
import { capexRollup } from '../../_engine/proforma';
import { perSqFtOf } from '../../_data/capex';
import { facility } from '../../_data/plan-data';
import {
  equipmentPurchase as defaultEquipmentPurchase,
  LOAN_PURPOSE_LABELS,
  LOAN_STATUS_LABELS,
  LOAN_STATUSES,
  FIXED_COST_STATUSES,
  FIXED_COST_STATUS_LABELS,
  FIXED_COST_TREATMENT_LABELS,
  FIXED_COST_TREATMENT_NOTES,
  type LoanStatus,
  type FixedCostStatus,
} from '../../_data/finance';
import { loanMonthlyPayment } from '../../_engine/fixed-costs';
import { createLoan, deleteLoan, createFixedCostLine, deleteFixedCostLine, createLeaseholdLine, updateLeaseholdLine, deleteLeaseholdLine } from '../../_lib/finance-actions';
import { openingPosition } from '../../_data/working-capital';
import { useScenario } from '../../_state/scenario-store';
import { useLedgerBook, useStatementPeriod } from '../../_state/ledger';
import { LedgerStatus, PeriodPicker, dollars, signed } from '../../_components/ledger/LedgerParts';

const facilitySqFtNote =
  'Every unit cost here is a placeholder, not a quote. For scale: a district facility producing 8,000 units/day was fitted out for roughly $4M inside a $17M project. This schedule is a fraction of that and should be read that way. Add 10–15% contingency to any real budget.';

export default function CapitalPage() {
  const { resolved, setCapexFinance, setLoan, setFixedCostLine, setLeasehold, isSuperAdmin } = useScenario();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [newLoan, setNewLoan] = useState('');
  const [newLine, setNewLine] = useState('');
  const [newLeasehold, setNewLeasehold] = useState('');
  const sqFt = facility.sizeSqFt.value;

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setErr(null);
        after();
        router.refresh();
      } else setErr(res.error);
    });
  const fp = resolved.equipmentPurchase;
  const roll = useMemo(() => capexRollup(resolved), [resolved]);
  // The capex each loan finances, so a typed principal can be read against it.
  const capexFor = (purpose: string) =>
    purpose === 'equipment' ? roll.equipmentAll : purpose === 'leasehold' ? roll.leaseholdSubtotal : null;
  const fixedMonthly = resolved.fixedCostLines.reduce((s, l) => s + l.monthlyAmountCents / 100, 0);
  const { book, error: bookError, pending: bookPending } = useLedgerBook();
  const { granularity, period, setGranularity, setLabel } = useStatementPeriod(book);

  return (
    <>
      <PageHeader
        title="Capital & Financing"
        purpose="Size the fit-out, set the loans that fund it, and set monthly fixed costs."
        functions={['Total capital expenditure', 'Equipment by category', 'Loans', 'Monthly fixed costs', 'Monthly financing']}
        connects={[
          { href: '/farm/grow-units', dir: 'from' },
          { href: '/farm/financials/pnl', dir: 'to' },
          { href: '/farm/financials/balance-sheet', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The capital fits out a 5,000 sq ft leased shell. The loans finance it.</li>
            <li>Every unit cost is a placeholder pending quotes.</li>
            <li>Editing a loan or a fixed-cost line recomputes the monthly figures.</li>
            <li>The monthly figures feed the fixed-cost base on the Profit &amp; Loss.</li>
          </ul>
        }
        status="live"
      />

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={money(roll.totalCapex, 0)} label="Total capital expenditure" sub="Equipment + leasehold" />
        <Kpi value={money(roll.phase1Capex, 0)} label="Required for Phase 1 only" sub="Phase 1 equipment + leasehold" />
        <Kpi value={money(roll.totalMonthlyFinancing, 0)} label="Monthly financing" sub="Equipment lease + leasehold amortisation" />
        <Kpi value={money(roll.equipmentAll, 0)} label="Equipment, all phases" sub={money(roll.leaseholdSubtotal, 0) + ' leasehold'} />
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
              <tr><td className="farm-c-soft">Phase 1 only (prospects)</td><td className="num">{money(roll.equipmentPhase1, 0)}</td></tr>
              <tr><td className="farm-c-soft">Phase 2 add (corporate)</td><td className="num">{money(roll.equipmentPhase2Add, 0)}</td></tr>
              <tr><td className="farm-c-soft">Phase 3 add (retail and wholesale)</td><td className="num">{money(roll.equipmentPhase3Add, 0)}</td></tr>
            </tbody>
          </table>
          <p className="farm-kpi-sub mt-2">
            The in-service and planned rows of the <Link className="farm-link" href="/farm/grow-units">equipment library</Link>, where every line&rsquo;s quantity, unit cost, status and service date are entered. {facilitySqFtNote}
          </p>
        </Card>

        <Card title="Leasehold improvements — raw shell">
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead>
                <tr><th>Item</th><th className="num">$/sq ft</th><th className="num">Extended</th><th>In the rollup</th>{isSuperAdmin ? <th /> : null}</tr>
              </thead>
              <tbody>
                {resolved.leasehold.map((l) => (
                  <tr key={l.key} className={`${l.counted ? '' : 'farm-c-faint'}`}>
                    <td>
                      {l.item}
                      {l.note ? <div className="farm-kpi-sub farm-fs-2xs">{l.note}</div> : null}
                    </td>
                    <td className="num">{money(perSqFtOf(l.extended, sqFt))}</td>
                    <td className="num">
                      <EditableNumber
                        value={l.extended}
                        onChange={(v) => setLeasehold(l.key, { extended: v })}
                        step={1000}
                        prefix="$"
                        ariaLabel={`${l.item} extended cost`}
                        showBadge={false}
                      />
                    </td>
                    <td>
                      <label className="inline-flex! items-center! gap-[0.35rem]! farm-fs-xs">
                        <input
                          type="checkbox"
                          checked={l.counted}
                          onChange={(e) => setLeasehold(l.key, { counted: e.target.checked })}
                          aria-label={`Count ${l.item} in the capital rollup`}
                        />
                        {l.counted ? 'Counted' : 'On record only'}
                      </label>
                    </td>
                    {isSuperAdmin ? (
                      <td>
                        {l.id ? (
                          <button
                            type="button"
                            className="farm-btn farm-fs-2xs"
                            disabled={pending}
                            onClick={() => run(() => deleteLeaseholdLine(l.id!), () => {})}
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
                <tr className="total">
                  <td>Leasehold subtotal — in the rollup</td>
                  <td className="num">{money(perSqFtOf(roll.leaseholdSubtotal, sqFt))}</td>
                  <td className="num">{money(roll.leaseholdSubtotal, 0)}</td>
                  <td />
                  {isSuperAdmin ? <td /> : null}
                </tr>
                {roll.leaseholdOnRecordOnly > 0 ? (
                  <tr>
                    <td className="farm-c-soft">On record, not counted</td>
                    <td className="num farm-c-soft">{money(perSqFtOf(roll.leaseholdOnRecordOnly, sqFt))}</td>
                    <td className="num farm-c-soft">{money(roll.leaseholdOnRecordOnly, 0)}</td>
                    <td />
                    {isSuperAdmin ? <td /> : null}
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {isSuperAdmin ? (
            <div className="flex gap-2 items-center mt-[0.7rem]! flex-wrap">
              <input
                className="farm-input w-64!"
                value={newLeasehold}
                placeholder="Name another scope item"
                onChange={(e) => setNewLeasehold(e.target.value)}
                aria-label="New leasehold line name"
              />
              <button
                type="button"
                className="farm-btn"
                disabled={pending || newLeasehold.trim() === ''}
                onClick={() => run(() => createLeaseholdLine({ item: newLeasehold, extendedCents: 0, counted: true }), () => setNewLeasehold(''))}
              >
                Add a line
              </button>
            </div>
          ) : null}
          <p className="farm-kpi-sub mt-2">
            Extended cost is the figure of record; dollars per square foot are derived from it against
            the {sqFt.toLocaleString()} sq ft shell. Not one of these rates is a quote — they were
            working figures written the day the capital schedule was first drawn up. A line set to
            &ldquo;on record only&rdquo; keeps its figure and stays out of the subtotal, total capital,
            depreciation and the leasehold loan.
          </p>
        </Card>

      </div>

      <Card title="Loans" className="mt-4">
        <div className="mb-3!">
          <SectionSave sections={['capex']} title="the loans and fixed costs" />
        </div>
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr>
                <th>Loan</th><th>Status</th><th className="num">Principal</th><th className="num">APR</th>
                <th className="num">Term</th><th>Starts</th><th className="num">Monthly</th><th className="num">Capex it finances</th>{isSuperAdmin ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {resolved.loans.map((l) => {
                const capex = capexFor(l.purpose);
                const principal = l.principalCents / 100;
                const gap = capex === null ? null : principal - capex;
                return (
                  <tr key={l.key}>
                    <td className="font-medium!">
                      {l.label}
                      <div className="farm-kpi-sub farm-fs-2xs">{LOAN_PURPOSE_LABELS[l.purpose]}</div>
                    </td>
                    <td>
                      <select
                        className="farm-input farm-fs-xs"
                        value={l.status}
                        onChange={(e) => setLoan(l.key, { status: e.target.value as LoanStatus })}
                        aria-label={`${l.label} status`}
                      >
                        {LOAN_STATUSES.map((k) => <option key={k} value={k}>{LOAN_STATUS_LABELS[k]}</option>)}
                      </select>
                    </td>
                    <td className="num">
                      <EditableNumber
                        value={principal}
                        onChange={(v) => setLoan(l.key, { principalCents: Math.round(v * 100) })}
                        step={1000}
                        prefix="$"
                        ariaLabel={`${l.label} principal`}
                        showBadge={false}
                      />
                    </td>
                    <td className="num">
                      <EditableNumber value={l.apr * 100} onChange={(v) => setLoan(l.key, { apr: v / 100 })} step={0.25} suffix="%" ariaLabel={`${l.label} APR`} showBadge={false} />
                    </td>
                    <td className="num">
                      <EditableNumber value={l.termMonths} onChange={(v) => setLoan(l.key, { termMonths: v })} step={12} min={1} suffix="mo" ariaLabel={`${l.label} term months`} showBadge={false} />
                    </td>
                    <td className="farm-mono farm-fs-xs">{l.startDate}</td>
                    <td className="num">{money(loanMonthlyPayment(l), 0)}</td>
                    <td className="num">
                      {capex === null ? '—' : money(capex, 0)}
                      {gap !== null && Math.abs(gap) >= 1 ? (
                        <div className="farm-kpi-sub farm-fs-2xs">
                          {gap > 0 ? `${money(gap, 0)} more than the schedule` : `${money(-gap, 0)} of it unfinanced`}
                        </div>
                      ) : null}
                    </td>
                    {isSuperAdmin ? (
                      <td>
                        {l.id ? (
                          <button
                            type="button"
                            className="farm-btn farm-fs-2xs"
                            disabled={pending}
                            onClick={() => run(() => deleteLoan(l.id!), () => {})}
                          >
                            Remove
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              <tr className="total">
                <td colSpan={6}>Total monthly financing — flows into the fixed-cost base on the P&amp;L</td>
                <td className="num">{money(roll.totalMonthlyFinancing, 0)}</td>
                <td className="num">{money(roll.totalCapex, 0)}</td>
                {isSuperAdmin ? <td /> : null}
              </tr>
            </tbody>
          </table>
        </div>
        {isSuperAdmin ? (
          <div className="flex gap-2 items-center mt-[0.7rem]! flex-wrap">
            <input
              className="farm-input w-64!"
              value={newLoan}
              placeholder="Name another loan"
              onChange={(e) => setNewLoan(e.target.value)}
              aria-label="New loan name"
            />
            <button
              type="button"
              className="farm-btn"
              disabled={pending || newLoan.trim() === ''}
              onClick={() =>
                run(
                  () => createLoan({ label: newLoan, purpose: 'other', status: 'planned', principalCents: 0, apr: 0, termMonths: 0, startDate: openingPosition.loanStartDate.value }),
                  () => setNewLoan(''),
                )
              }
            >
              Add a loan
            </button>
            {err ? <span className="farm-kpi-sub farm-c-over">{err}</span> : null}
          </div>
        ) : null}
        <p className="farm-kpi-sub mt-2">
          A loan&rsquo;s principal is typed, not read off the schedule: a loan may be for less than the
          capital it finances, or carry a deposit. The capex column is the schedule as it stands today,
          and any gap between the two is named rather than closed. Terms are placeholders until a
          lender quotes them.
        </p>
      </Card>

      <Card title="Monthly fixed costs" className="mt-4">
        <div className="farm-scroll-x">
          <table className="farm-table">
            <thead>
              <tr><th>Line</th><th>Status</th><th>Treatment</th><th className="num">Monthly</th><th className="num">Annual</th>{isSuperAdmin ? <th /> : null}</tr>
            </thead>
            <tbody>
              {resolved.fixedCostLines.map((l) => (
                <tr key={l.key}>
                  <td className="font-medium!">
                    {l.label}
                    {l.notes ? <div className="farm-kpi-sub farm-fs-2xs">{l.notes}</div> : null}
                  </td>
                  <td>
                    <select
                      className="farm-input farm-fs-xs"
                      value={l.status}
                      onChange={(e) => setFixedCostLine(l.key, { status: e.target.value as FixedCostStatus })}
                      aria-label={`${l.label} status`}
                    >
                      {FIXED_COST_STATUSES.map((k) => <option key={k} value={k}>{FIXED_COST_STATUS_LABELS[k]}</option>)}
                    </select>
                  </td>
                  <td title={FIXED_COST_TREATMENT_NOTES[l.treatment]} className="farm-c-soft farm-fs-sm">
                    {FIXED_COST_TREATMENT_LABELS[l.treatment]}
                  </td>
                  <td className="num">
                    <EditableNumber
                      value={l.monthlyAmountCents / 100}
                      onChange={(v) => setFixedCostLine(l.key, { monthlyAmountCents: Math.round(v * 100) })}
                      step={100}
                      prefix="$"
                      ariaLabel={`${l.label} monthly amount`}
                      showBadge={false}
                    />
                  </td>
                  <td className="num">{money((l.monthlyAmountCents / 100) * 12, 0)}</td>
                  {isSuperAdmin ? (
                    <td>
                      {l.id ? (
                        <button
                          type="button"
                          className="farm-btn farm-fs-2xs"
                          disabled={pending}
                          onClick={() => run(() => deleteFixedCostLine(l.id!), () => {})}
                        >
                          Remove
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
              <tr className="total"><td colSpan={3}>Total monthly, before financing</td><td className="num">{money(fixedMonthly, 0)}</td><td className="num">{money(fixedMonthly * 12, 0)}</td>{isSuperAdmin ? <td /> : null}</tr>
            </tbody>
          </table>
        </div>
        {isSuperAdmin ? (
          <div className="flex gap-2 items-center mt-[0.7rem]! flex-wrap">
            <input
              className="farm-input w-64!"
              value={newLine}
              placeholder="Name another fixed cost"
              onChange={(e) => setNewLine(e.target.value)}
              aria-label="New fixed cost name"
            />
            <button
              type="button"
              className="farm-btn"
              disabled={pending || newLine.trim() === ''}
              onClick={() =>
                run(
                  // A new line is G&A until someone states otherwise: the
                  // treatment that keeps it OUT of inventory is the safe default.
                  () => createFixedCostLine({ label: newLine, category: 'other', treatment: 'general_admin', status: 'planned', monthlyAmountCents: 0 }),
                  () => setNewLine(''),
                )
              }
            >
              Add a fixed cost
            </button>
          </div>
        ) : null}
        <p className="farm-kpi-sub mt-2">
          Treatment is the accounting fact, not the label: manufacturing overhead absorbs into
          inventory on normal capacity (ASC 330-10-30-1/-3), and general &amp; administrative is a
          period cost that ASC 330-10-30-8 keeps out of it. Every figure here is a placeholder until a
          signed lease or an open account replaces it, at which point the line moves to In force.
        </p>
      </Card>

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
