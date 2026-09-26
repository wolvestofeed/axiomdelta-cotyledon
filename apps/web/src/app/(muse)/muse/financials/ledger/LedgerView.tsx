'use client';

import { PageControls } from '../../_components/PageControls';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { PageHeader, Card, Kpi, CheckPill, money } from '../../_components/ui';
import { useLedgerBook, useLedgerJournal, useStatementPeriod } from '../../_state/ledger';
import { IncomeStatementCard, LedgerStatus, PeriodPicker, PlanBasisCard, dollars, signed } from '../../_components/ledger/LedgerParts';
import { RecordedSingleLink } from '../../_components/RecordedLinks';

const fromCents = (c: number) => c / 100;

const TABS = [
  { id: 'journal', label: 'Journal' },
  { id: 'trial-balance', label: 'Trial balance' },
  { id: 'income', label: 'Statement of income' },
  { id: 'basis', label: 'Posting basis' },
] as const;

type TabId = (typeof TABS)[number]['id'];
const readHash = () => window.location.hash.replace(/^#/, '');
const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

/**
 * The journal on the selected ledger (Roadmap N6): the entries of the period
 * picked, the trial balance through its end, and the statement of income. On
 * Actual each entry can name the document that evidences it; Plan entries are
 * generated from the forecast and carry none.
 *
 * Tabbed (Phase T): the status, the period picker and the KPI strip stay above
 * the bar; one panel holds the open tab. The open tab is the URL hash, so it is
 * linkable and survives a refresh. The one journal read stays here in the
 * parent: the KPI strip, the trial balance and the journal all read it.
 */
export function LedgerView({ canEdit }: { canEdit: boolean }) {
  const { book, error, pending } = useLedgerBook();
  const { granularity, period, setGranularity, setLabel } = useStatementPeriod(book);
  const { journal, pending: journalPending, error: journalError } = useLedgerJournal(period?.from ?? null, period?.to ?? null);
  const totalDebits = journal?.trialBalance.reduce((s, r) => s + r.debitCents, 0) ?? 0;
  const totalCredits = journal?.trialBalance.reduce((s, r) => s + r.creditCents, 0) ?? 0;

  // The Posting basis tab exists only when it has something to show: the Plan
  // basis card renders on Plan alone, and posting notes only when there are any.
  const hasBasis = !!book && (book.kind === 'plan' || book.notes.length > 0);
  const tabs = TABS.filter((t) => t.id !== 'basis' || hasBasis);
  const isTab = (v: string): v is TabId => tabs.some((t) => t.id === v);
  const hash = useSyncExternalStore(subscribeHash, readHash, () => '');
  const tab: TabId = isTab(hash) ? hash : 'journal';
  const pick = (id: TabId) => {
    window.history.replaceState(null, '', `#${id}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  return (
    <>
      <PageHeader
        title="Ledger"
        purpose="Trace every journal entry and prove debits equal credits."
        connects={[
          { href: '/muse/actuals', dir: 'from' },
          { href: '/muse/financials/pnl', dir: 'to' },
          { href: '/muse/financials/balance-sheet', dir: 'to' },
          { href: '/muse/financials/cash-flow', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>The journal is double-entry, on the ledger selected in the forecast bar.</li>
            <li>Entries post through the chain a batch runs: receipt, issue, labor, overhead, cook, chill, pack, finished goods, delivery.</li>
            <li>The statement of income, the cash flow and the balance sheet all derive from these same entries.</li>
            <li>Debits equal credits, and the trial balance proves it.</li>
          </ul>
        }
        status="live"
      />
      <LedgerStatus book={book} pending={pending} error={error} />
      {book && period && (
        <>
          <PageControls><PeriodPicker book={book} granularity={granularity} period={period} onGranularity={setGranularity} onLabel={setLabel} /></PageControls>
          <div className="grid gap-3 mb-4 muse-autofit-11">
            <Kpi value={<span>Balanced <CheckPill ok={period.balanced} okLabel="✓" overLabel="✗" /></span>} label="Journal integrity" sub="Every entry in the period balances" />
            <Kpi value={dollars(period.incomeStatement.revenueCents)} label="Revenue" sub={period.label} />
            <Kpi value={signed(period.incomeStatement.netIncomeCents)} label="Net income" sub="Pre-tax" />
            <Kpi value={signed(period.cashFlow.closingCashCents)} label="Closing cash" sub={period.to} />
            <Kpi value={journal ? String(journal.entries.length + journal.truncated) : '…'} label="Entries in the period" sub={journal?.truncated ? `First ${journal.entries.length} shown` : 'All shown'} />
          </div>

          <div className="muse-tabs" role="tablist" aria-label="Ledger">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" className="muse-tab" aria-selected={tab === t.id} id={`ledger-tab-${t.id}`} aria-controls={`ledger-panel-${t.id}`} onClick={() => pick(t.id)}>
                {t.label}
                {t.id === 'journal' && journal && <span className="muse-tab-count">{journal.entries.length + journal.truncated}</span>}
              </button>
            ))}
          </div>
          <div className="muse-tab-panel" role="tabpanel" id={`ledger-panel-${tab}`} aria-labelledby={`ledger-tab-${tab}`}>
            {tab === 'journal' && (
              <Card title={`Journal — ${period.label}`}>
                {journalError && <p className="muse-kpi-sub">The journal could not be read: {journalError}</p>}
                {!journal && !journalError && <p className="muse-kpi-sub">Reading the journal…</p>}
                {journal && journal.entries.length === 0 && <p className="muse-kpi-sub">No entries in the period.</p>}
                {journal && journal.entries.length > 0 && (
                  <div className="muse-scroll-x">
                    <table className="muse-table">
                      <thead>
                        <tr><th>Date</th><th>Entry</th><th>Account</th><th>Memo</th><th className="num">Debit</th><th className="num">Credit</th>{book.kind === 'actual' && <th>Evidence</th>}</tr>
                      </thead>
                      <tbody>
                        {journal.entries.map((e) =>
                          e.lines.map((line, i) => (
                            <tr key={`${e.id}-${i}`}>
                              <td>{i === 0 ? e.date : ''}</td>
                              <td>{i === 0 ? <><strong>{e.id}</strong><div className="muse-c-faint muse-fs-xs max-w-60">{e.description}</div></> : ''}</td>
                              <td className="muse-mono muse-fs-xs">{line.accountCode} {journal.accountNames[line.accountCode] ?? ''}</td>
                              <td className="muse-c-soft">{line.memo}</td>
                              <td className="num">{line.debitCents ? money(fromCents(line.debitCents), 0) : ''}</td>
                              <td className="num">{line.creditCents ? money(fromCents(line.creditCents), 0) : ''}</td>
                              {book.kind === 'actual' && (
                                <td>
                                  {i === 0 ? (
                                    <RecordedSingleLink
                                      edge={{ fromKind: 'ledger_entry', fromId: e.id, toKind: 'source', relation: 'evidenced_by' }}
                                      linked={journal.evidence[e.id] ?? null}
                                      canEdit={canEdit}
                                      ariaLabel={`Link the document evidencing entry ${e.id}`}
                                      placeholder="Search title, publisher, kind…"
                                    />
                                  ) : null}
                                </td>
                              )}
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                {journal && journal.truncated > 0 && <p className="muse-kpi-sub mt-2">{journal.truncated} more entries in the period; pick a month to read them all.</p>}
                <p className="muse-kpi-sub mt-2">
                  {book.kind === 'actual'
                    ? <>An entry&apos;s evidence is a document in the registry on <Link className="muse-link" href="/muse/sources">Sources</Link> — the same registry the emission factors cite, so the financial ledger and the carbon ledger share one evidence trail.</>
                    : 'Plan entries are generated from the forecast each time it is read; evidence is linked to recorded entries on Actual.'}
                </p>
              </Card>
            )}

            {tab === 'trial-balance' && (
              <Card title={`Trial balance at ${period.to}`}>
                {journalError && <p className="muse-kpi-sub">The journal could not be read: {journalError}</p>}
                {!journal && !journalError && <p className="muse-kpi-sub">Reading the journal…</p>}
                {journal && (
                  <>
                    <table className="muse-table">
                      <thead><tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
                      <tbody>
                        {journal.trialBalance.length === 0 && <tr><td colSpan={3} className="muse-kpi-sub">No balances.</td></tr>}
                        {journal.trialBalance.map((r) => (
                          <tr key={r.code}>
                            <td className="muse-mono muse-fs-xs">{r.code} {r.name}</td>
                            <td className="num">{r.debitCents ? money(fromCents(r.debitCents), 0) : ''}</td>
                            <td className="num">{r.creditCents ? money(fromCents(r.creditCents), 0) : ''}</td>
                          </tr>
                        ))}
                        <tr className="total"><td>Totals</td><td className="num">{dollars(totalDebits)}</td><td className="num">{dollars(totalCredits)}</td></tr>
                      </tbody>
                    </table>
                    <p className="muse-kpi-sub mt-2">
                      Debits {dollars(totalDebits)} = credits {dollars(totalCredits)}. <CheckPill ok={totalDebits === totalCredits} okLabel="In balance" overLabel="Out of balance" />
                      {journalPending ? ' · updating…' : ''}
                    </p>
                  </>
                )}
              </Card>
            )}

            {tab === 'income' && <IncomeStatementCard period={period} />}

            {tab === 'basis' && (
              <>
                <PlanBasisCard book={book} />
                {book.notes.length > 0 && (
                  <Card title="Posting notes" className="mt-4">
                    <ul className="muse-kpi-sub pl-[1.1rem]! grid! gap-[0.3rem]!">
                      {book.notes.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  </Card>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
