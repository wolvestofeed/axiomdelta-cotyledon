'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CheckPill, money, num } from '../_components/ui';
import { recordPeriodBill, deleteActual } from '../_lib/actuals-actions';
import { BILL_CATEGORY_LABELS, type ActualsBundle, type BillCategory } from '../_engine/actuals';
import { lockPeriod, reopenPeriod, addClosure, removeClosure } from '../_lib/period-actions';
import { PAYMENT_TERMS_LABELS, SUPPLIER_PAYMENT_TERMS, type PaymentTerms } from '../_data/working-capital';
import { CLOSURE_KIND_LABELS, POSTING_ACTION_LABELS, type CalendarClosure, type ChainVerification, type ClosureKind, type FiscalPeriod, type PostingEntry } from '../_engine/periods';

type Msg = { kind: 'ok' | 'err'; text: string } | null;
const fromCents = (c: number) => c / 100;
const toCents = (dollars: number) => Math.round(dollars * 100);

export interface ChannelOption { phase: number; market: string; priceCents: number }

export function ActualsClient({
  period,
  canRecord,
  periodRow,
  closures,
  trail,
  chain,
  bundle,
  channels,
}: {
  period: string;
  /** Period bills, removals, the lock and the calendar stay with super admins; capture moved to the pages where the event happens. */
  canRecord: boolean;
  /** The period's lock row; null = never locked, so open. */
  periodRow: FiscalPeriod | null;
  closures: CalendarClosure[];
  /** The newest entries of the posting trail, newest first. */
  trail: PostingEntry[];
  chain: ChainVerification;
  bundle: ActualsBundle;
  channels: ChannelOption[];
}) {
  const locked = periodRow?.status === 'locked';
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [open, setOpen] = useState<'bill' | null>(null);

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ kind: 'ok', text: okText });
        setOpen(null);
        router.refresh();
      } else {
        setMsg({ kind: 'err', text: res.error });
      }
    });
  }

  function remove(kind: 'batch' | 'receipt' | 'delivery' | 'bill', id: string, label: string) {
    run(() => deleteActual({ kind, id }), `Removed ${label}.`);
  }

  // ── Period bill ───────────────────────────────────────────────────────────
  const [pPeriod, setPPeriod] = useState(period);
  const [pCategory, setPCategory] = useState<BillCategory>('lease');
  const [pAccount, setPAccount] = useState('');
  const [pAmount, setPAmount] = useState(0);
  const [pVendor, setPVendor] = useState('');
  const [pInvoice, setPInvoice] = useState('');
  const [pIncurred, setPIncurred] = useState('');
  const [pPaid, setPPaid] = useState('');
  /** No default (Roadmap K3): chosen on every bill. */
  const [pTerms, setPTerms] = useState<PaymentTerms | ''>('');

  function submitBill() {
    run(
      () =>
        recordPeriodBill({
          period: pPeriod,
          category: pCategory,
          accountCode: pCategory === 'other' ? pAccount : undefined,
          amountCents: toCents(pAmount),
          vendor: pVendor || null,
          invoiceNumber: pInvoice || null,
          incurredOn: pIncurred || null,
          paidOn: pPaid || null,
          paymentTerms: pTerms || undefined,
          notes: null,
        }),
      `Recorded ${BILL_CATEGORY_LABELS[pCategory]} for ${pPeriod}.`,
    );
  }

  const toggle = (k: typeof open) => setOpen((o) => (o === k ? null : k));

  // ── Period lock, calendar (Roadmap J1, J3, J4) ────────────────────────────
  const [lockNotes, setLockNotes] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [cLabel, setCLabel] = useState('');
  const [cKind, setCKind] = useState<ClosureKind>('holiday');
  const [cStart, setCStart] = useState('');
  const [cEnd, setCEnd] = useState('');
  const when = (iso: string) => iso.replace('T', ' ').slice(0, 16);

  return (
    <>
      {msg && (
        <div className={`muse-scenariobar-msg ${msg.kind} mt-4`} role="status">
          {msg.text}
        </div>
      )}

      <Card title={`Period ${period} — ${locked ? 'locked' : 'open'}`} className="mt-4">
        {locked ? (
          <p className="muse-kpi-sub">
            Locked{periodRow?.lockedBy ? ` by ${periodRow.lockedBy}` : ''}{periodRow?.lockedAt ? ` on ${when(periodRow.lockedAt)}` : ''}{periodRow?.notes ? ` — ${periodRow.notes}` : ''}. Nothing dated inside this period posts or is removed.
            {periodRow?.reopenedAt ? ` Previously reopened by ${periodRow.reopenedBy ?? 'a super admin'} on ${when(periodRow.reopenedAt)}.` : ''}
          </p>
        ) : (
          <p className="muse-kpi-sub">
            Open: records dated inside this period post.{periodRow?.reopenedAt ? ` Reopened by ${periodRow.reopenedBy ?? 'a super admin'} on ${when(periodRow.reopenedAt)}; last locked${periodRow.lockedBy ? ` by ${periodRow.lockedBy}` : ''}${periodRow.lockedAt ? ` on ${when(periodRow.lockedAt)}` : ''}.` : ''}
          </p>
        )}
        {canRecord && (
          <div className="flex flex-wrap gap-3 items-end mt-3!">
            {locked ? (
              <>
                <label className="muse-kpi-sub">Reason to reopen<br /><input className="muse-input w-80!" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} /></label>
                <button type="button" className="muse-btn" onClick={() => run(() => reopenPeriod({ period, reason: reopenReason }), `Reopened ${period}.`)} disabled={pending || reopenReason.trim().length < 3}>Reopen period</button>
              </>
            ) : (
              <>
                <label className="muse-kpi-sub">Note on the lock (optional)<br /><input className="muse-input w-80!" value={lockNotes} onChange={(e) => setLockNotes(e.target.value)} /></label>
                <button type="button" className="muse-btn primary" onClick={() => run(() => lockPeriod({ period, notes: lockNotes || null }), `Locked ${period}.`)} disabled={pending}>Lock period</button>
              </>
            )}
          </div>
        )}
      </Card>

      <Card title="Production calendar — closures" className="mt-4">
        {closures.length === 0 ? (
          <p className="muse-kpi-sub">No closure on file. Production days are the service weekdays.</p>
        ) : (
          <table className="muse-table">
            <thead><tr><th>Closure</th><th>Kind</th><th>From</th><th>To</th><th /></tr></thead>
            <tbody>
              {closures.map((c) => (
                <tr key={c.id}>
                  <td>{c.label}{c.notes ? <div className="muse-c-faint muse-fs-2xs">{c.notes}</div> : null}</td>
                  <td>{CLOSURE_KIND_LABELS[c.kind]}</td>
                  <td>{c.startDate}</td>
                  <td>{c.endDate}</td>
                  <td className="num">{canRecord && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => run(() => removeClosure({ id: c.id }), `Removed ${c.label}.`)} disabled={pending}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canRecord && (
          <div className="flex flex-wrap gap-3 items-end mt-3!">
            <label className="muse-kpi-sub">Label<br /><input className="muse-input w-48!" value={cLabel} onChange={(e) => setCLabel(e.target.value)} placeholder="Labor Day" /></label>
            <label className="muse-kpi-sub">Kind<br />
              <select className="muse-select" value={cKind} onChange={(e) => setCKind(e.target.value as ClosureKind)}>
                {(Object.keys(CLOSURE_KIND_LABELS) as ClosureKind[]).map((k) => <option key={k} value={k}>{CLOSURE_KIND_LABELS[k]}</option>)}
              </select>
            </label>
            <label className="muse-kpi-sub">From<br /><input className="muse-input" type="date" value={cStart} onChange={(e) => setCStart(e.target.value)} /></label>
            <label className="muse-kpi-sub">To<br /><input className="muse-input" type="date" value={cEnd} onChange={(e) => setCEnd(e.target.value)} /></label>
            <button type="button" className="muse-btn" onClick={() => run(() => addClosure({ label: cLabel, kind: cKind, startDate: cStart, endDate: cEnd, notes: null }), `Added ${cLabel}.`)} disabled={pending || !cLabel.trim() || !cStart || !cEnd || cEnd < cStart}>Add closure</button>
          </div>
        )}
        <p className="muse-kpi-sub mt-2">A closure takes its dates out of the production calendar: no derived forecast order falls on them and the production day before a delivery skips them. Orders already on file are not changed.</p>
      </Card>

      <Card title="Posting trail" className="mt-4">
        <div className="flex flex-wrap gap-3 items-center mb-2!">
          <CheckPill ok={chain.ok} okLabel={`Chain verified — ${chain.length} entr${chain.length === 1 ? 'y' : 'ies'}`} overLabel={`Chain broken at entry ${chain.brokenAt ?? '?'}`} />
          <span className="muse-kpi-sub">Append-only. Each entry&apos;s hash covers the previous entry&apos;s hash and its own fields; the database refuses updates and deletions.</span>
        </div>
        {trail.length === 0 ? (
          <p className="muse-kpi-sub">No entry yet. The first posting, lock or closure starts the chain.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th className="num">#</th><th>When (UTC)</th><th>Who</th><th>Event</th><th>Record</th><th>Period</th><th>Hash</th></tr></thead>
              <tbody>
                {trail.map((e) => (
                  <tr key={e.seq}>
                    <td className="num">{e.seq}</td>
                    <td>{when(e.occurredAt)}</td>
                    <td>{e.actorEmail ?? e.actorUserId}</td>
                    <td>{POSTING_ACTION_LABELS[e.action] ?? e.action}</td>
                    <td>{e.recordKind} · <span className="muse-mono muse-fs-xs">{e.recordId.length > 12 ? `${e.recordId.slice(0, 8)}…` : e.recordId}</span>{typeof e.detail['label'] === 'string' ? ` · ${e.detail['label']}` : typeof e.detail['batchId'] === 'string' ? ` · ${e.detail['batchId']}` : typeof e.detail['reason'] === 'string' ? ` · ${e.detail['reason']}` : ''}</td>
                    <td>{e.period}</td>
                    <td className="muse-mono muse-fs-xs">{e.hash.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Records — ${period}`} className="mt-4">
        {canRecord && !locked ? (
          <div className="flex flex-wrap gap-2 mb-3!">
            <button type="button" className={`muse-btn${open === 'bill' ? ' primary' : ''}`} onClick={() => toggle('bill')} disabled={pending}>Record a period bill</button>
          </div>
        ) : (
          <p className="muse-kpi-sub mb-3!">{locked ? 'The period is locked: no bill posts and no record is removed.' : 'Period bills are recorded by super admins.'}</p>
        )}

        {open === 'bill' && (
          <div className="muse-card mb-4!">
            <div className="muse-card-title">Record a period bill</div>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="muse-kpi-sub">Period<br /><input className="muse-input" type="month" value={pPeriod} onChange={(e) => setPPeriod(e.target.value)} /></label>
              <label className="muse-kpi-sub">Category<br />
                <select className="muse-select" value={pCategory} onChange={(e) => setPCategory(e.target.value as BillCategory)}>
                  {(Object.keys(BILL_CATEGORY_LABELS) as BillCategory[]).map((k) => <option key={k} value={k}>{BILL_CATEGORY_LABELS[k]}</option>)}
                </select>
              </label>
              {pCategory === 'other' && <label className="muse-kpi-sub">Account code<br /><input className="muse-input w-28!" value={pAccount} onChange={(e) => setPAccount(e.target.value)} placeholder="e.g. 7050" /></label>}
              <label className="muse-kpi-sub">Amount $<br /><input className="muse-input w-28!" type="number" step={0.01} value={pAmount} onChange={(e) => setPAmount(Number(e.target.value))} /></label>
              <label className="muse-kpi-sub">Vendor<br /><input className="muse-input w-48!" value={pVendor} onChange={(e) => setPVendor(e.target.value)} /></label>
              <label className="muse-kpi-sub">Invoice number<br /><input className="muse-input w-28!" value={pInvoice} onChange={(e) => setPInvoice(e.target.value)} /></label>
              <label className="muse-kpi-sub">Incurred on<br /><input className="muse-input" type="date" value={pIncurred} onChange={(e) => setPIncurred(e.target.value)} /></label>
              <label className="muse-kpi-sub">Paid on<br /><input className="muse-input" type="date" value={pPaid} onChange={(e) => setPPaid(e.target.value)} /></label>
              <label className="muse-kpi-sub">Payment terms<br />
                <select className="muse-select" value={pTerms} onChange={(e) => setPTerms(e.target.value as PaymentTerms | '')}>
                  <option value="">Choose…</option>
                  {SUPPLIER_PAYMENT_TERMS.map((t) => <option key={t} value={t}>{PAYMENT_TERMS_LABELS[t]}</option>)}
                </select>
              </label>
              <button type="button" className="muse-btn primary" onClick={submitBill} disabled={pending || pAmount === 0 || pTerms === ''}>Record bill</button>
            </div>
          </div>
        )}

        <div className="grid gap-4 muse-autofit-20">
          <div>
            <div className="muse-card-title">Batch records</div>
            <p className="muse-kpi-sub mb-[0.4rem]!">Closed on <Link className="muse-link" href="/muse/production-planning?level=day">Production Planning</Link>, on the delivery day the batch is made for.</p>
            {bundle.batches.length === 0 ? <p className="muse-kpi-sub">None this period.</p> : (
              <table className="muse-table"><tbody>
                {bundle.batches.map((b) => (
                  <tr key={b.id}><td>{b.batchId}<div className="muse-c-faint muse-fs-2xs">{b.productionDate} · {b.closedBy ?? 'unsigned'}</div></td><td className="num">{num(Math.round(b.goodPortions))} portions</td><td className="num">{canRecord && !locked && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => remove('batch', b.id, b.batchId)} disabled={pending}>Remove</button>}</td></tr>
                ))}
              </tbody></table>
            )}
          </div>
          <div>
            <div className="muse-card-title">Receipts</div>
            <p className="muse-kpi-sub mb-[0.4rem]!">Recorded on <Link className="muse-link" href="/muse/procurement">Procurement</Link>, against the purchase order.</p>
            {bundle.receipts.length === 0 ? <p className="muse-kpi-sub">None this period.</p> : (
              <table className="muse-table"><tbody>
                {bundle.receipts.map((r) => (
                  <tr key={r.id}><td>{r.supplierName ?? 'Receipt'}{r.invoiceNumber ? ` — ${r.invoiceNumber}` : ''}<div className="muse-c-faint muse-fs-2xs">{r.receivedOn} · {r.lines.length} lines</div></td><td className="num">{money(fromCents(r.invoiceTotalCents ?? 0))}</td><td className="num">{canRecord && !locked && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => remove('receipt', r.id, r.invoiceNumber ?? 'the receipt')} disabled={pending}>Remove</button>}</td></tr>
                ))}
              </tbody></table>
            )}
          </div>
          <div>
            <div className="muse-card-title">Deliveries</div>
            <p className="muse-kpi-sub mb-[0.4rem]!">Recorded on <Link className="muse-link" href="/muse/orders">Orders</Link>, on the order delivered.</p>
            {bundle.deliveries.length === 0 ? <p className="muse-kpi-sub">None this period.</p> : (
              <table className="muse-table"><tbody>
                {bundle.deliveries.map((d) => (
                  <tr key={d.id}><td>{channels.find((c) => c.phase === d.phase)?.market ?? `Channel ${d.phase}`}{d.siteName ? ` — ${d.siteName}` : ''}<div className="muse-c-faint muse-fs-2xs">{d.deliveredOn}</div></td><td className="num">{num(d.meals)} × {money(fromCents(d.pricePerMealCents))}</td><td className="num">{canRecord && !locked && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => remove('delivery', d.id, 'the delivery')} disabled={pending}>Remove</button>}</td></tr>
                ))}
              </tbody></table>
            )}
          </div>
          <div>
            <div className="muse-card-title">Period bills</div>
            {bundle.bills.length === 0 ? <p className="muse-kpi-sub">None this period.</p> : (
              <table className="muse-table"><tbody>
                {bundle.bills.map((b) => (
                  <tr key={b.id}><td>{BILL_CATEGORY_LABELS[b.category]}{b.vendor ? ` — ${b.vendor}` : ''}<div className="muse-c-faint muse-fs-2xs">{b.period} · {b.accountCode}{b.paidOn ? ` · paid ${b.paidOn}` : ' · unpaid'}</div></td><td className="num">{money(fromCents(b.amountCents))}</td><td className="num">{canRecord && !locked && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => remove('bill', b.id, 'the bill')} disabled={pending}>Remove</button>}</td></tr>
                ))}
              </tbody></table>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
