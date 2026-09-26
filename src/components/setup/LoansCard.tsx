'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, money } from '@/components/ui';
import { EditableNumber } from '@/components/EditableNumber';
import { SectionSave } from '@/components/SectionSave';
import { capexRollup } from '@/engine/proforma';
import { LOAN_PURPOSE_LABELS, LOAN_STATUS_LABELS, LOAN_STATUSES, type LoanStatus } from '@/data/finance';
import { loanMonthlyPayment } from '@/engine/fixed-costs';
import { createLoan, deleteLoan } from '@/server/finance-actions';
import { openingPosition } from '@/data/working-capital';
import { useScenario } from '@/state/scenario-store';

/** The loans a forecast carries: principal, rate and term, the monthly payment, and the capex each finances. */
export function LoansCard({ className }: { className?: string }) {
  const { resolved, setLoan, isSuperAdmin } = useScenario();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setErr(null);
        after();
        router.refresh();
      } else setErr(res.error);
    });
  const [newLoan, setNewLoan] = useState('');
  const roll = useMemo(() => capexRollup(resolved), [resolved]);
  const capexFor = (purpose: string) => (purpose === 'equipment' ? roll.equipmentAll : purpose === 'leasehold' ? roll.leaseholdSubtotal : null);
  return (
      <Card title="Loans" className={className}>
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
                {resolved.loans.length === 0 ? <tr><td colSpan={isSuperAdmin ? 9 : 8} className="farm-c-soft">No loan entered.</td></tr> : null}
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
            and any gap between the two is named rather than closed.
          </p>
        </Card>
  );
}
