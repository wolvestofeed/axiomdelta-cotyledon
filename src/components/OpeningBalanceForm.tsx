'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, money } from '@/components/ui';
import { recordOpeningBalance, deleteWorkingCapitalRecord } from '@/server/working-capital-actions';
import { openingCashCents, type OpeningBalanceDoc } from '@/engine/actuals';

/**
 * The opening balance sheet of the actuals (Roadmap K6): owners' equity, the
 * fit-out at cost and the debt that financed it, as of a date. Opening cash is
 * what the three leave — equity plus financing less the fit-out. One is kept;
 * recording it and removing it are super admin, and both are on the trail.
 */
export function OpeningBalanceForm({
  canRecord,
  opening,
  defaults,
}: {
  canRecord: boolean;
  opening: OpeningBalanceDoc | null;
  /** The plan's figures, offered as the starting values: $200,000 owners' equity, the capex schedule, the loan start. */
  defaults: { asOf: string; ownerEquityCents: number; fixedAssetsCents: number; longTermDebtCents: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [asOf, setAsOf] = useState(defaults.asOf);
  const [equity, setEquity] = useState(defaults.ownerEquityCents / 100);
  const [assets, setAssets] = useState(defaults.fixedAssetsCents / 100);
  const [debt, setDebt] = useState(defaults.longTermDebtCents / 100);

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, text: string) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ kind: 'ok', text });
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  const cents = (d: number) => Math.round(d * 100);
  const cash = openingCashCents({ ownerEquityCents: cents(equity), fixedAssetsCents: cents(assets), longTermDebtCents: cents(debt) });

  return (
    <Card title="Opening balance sheet" className="mt-4">
      {msg && <div className={`farm-scenariobar-msg ${msg.kind} mb-[0.6rem]!`} role="status">{msg.text}</div>}
      {opening ? (
        <>
          <table className="farm-table">
            <tbody>
              <tr><td>As of</td><td className="num">{opening.asOf}</td></tr>
              <tr><td>Cash</td><td className="num">{money(openingCashCents(opening) / 100, 0)}</td></tr>
              <tr><td>Fixed assets at cost</td><td className="num">{money(opening.fixedAssetsCents / 100, 0)}</td></tr>
              <tr><td>Long-term debt</td><td className="num">{money(opening.longTermDebtCents / 100, 0)}</td></tr>
              <tr className="total"><td>Owners&apos; equity</td><td className="num">{money(opening.ownerEquityCents / 100, 0)}</td></tr>
            </tbody>
          </table>
          {canRecord && <button type="button" className="farm-btn mt-3" disabled={pending} onClick={() => run(() => deleteWorkingCapitalRecord({ kind: 'opening_balance', id: opening.id }), 'Removed the opening balance.')}>Remove</button>}
        </>
      ) : canRecord ? (
        <>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="farm-kpi-sub">As of<br /><input className="farm-input" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>
            <label className="farm-kpi-sub">Owners&apos; equity $<br /><input className="farm-input w-36!" type="number" min={0} step={1000} value={equity} onChange={(e) => setEquity(Number(e.target.value))} /></label>
            <label className="farm-kpi-sub">Fit-out at cost $<br /><input className="farm-input w-36!" type="number" min={0} step={1000} value={assets} onChange={(e) => setAssets(Number(e.target.value))} /></label>
            <label className="farm-kpi-sub">Long-term debt $<br /><input className="farm-input w-36!" type="number" min={0} step={1000} value={debt} onChange={(e) => setDebt(Number(e.target.value))} /></label>
            <span className="farm-kpi-sub">Opening cash {money(cash / 100, 0)}</span>
            <button type="button" className="farm-btn primary" disabled={pending || cash < 0} onClick={() => run(() => recordOpeningBalance({ asOf, ownerEquityCents: cents(equity), fixedAssetsCents: cents(assets), longTermDebtCents: cents(debt), notes: null }), 'Recorded the opening balance.')}>Record opening balance</button>
          </div>
          <p className="farm-kpi-sub mt-2">The values start at the plan&apos;s: owners&apos; equity, the capex schedule and its financing. Type what the books open with.</p>
        </>
      ) : (
        <p className="farm-kpi-sub">No opening balance is recorded; the actuals position starts from nil.</p>
      )}
    </Card>
  );
}
