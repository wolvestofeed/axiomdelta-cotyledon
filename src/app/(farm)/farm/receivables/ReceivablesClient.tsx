'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, money, num } from '@/components/ui';
import { completeRoute, issueInvoice, recordSubscriberPayment, deleteWorkingCapitalRecord } from '@/server/working-capital-actions';
import { PAYMENT_TERMS_LABELS, type SubscriberPaymentTerms } from '@/data/working-capital';
import { dueOn, type SubscriberPaymentDoc } from '@/engine/working-capital';

export interface PendingRoute {
  date: string;
  subscriberId: string;
  subscriberName: string;
  distributions: number;
  units: number;
  amountCents: number;
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  subscriberId: string;
  subscriberName: string;
  period: string;
  status: 'open' | 'issued';
  openedOn: string;
  issuedOn: string | null;
  dueOn: string | null;
  paymentTerms: SubscriberPaymentTerms | null;
  distributions: number;
  units: number;
  amountCents: number;
  paidCents: number;
  openCents: number;
  lastDistributedOn: string | null;
}

type Msg = { kind: 'ok' | 'err'; text: string } | null;
const fromCents = (c: number) => c / 100;
const toCents = (d: number) => Math.round(d * 100);

export function ReceivablesClient({
  today,
  canRecord,
  canRemove,
  pending,
  invoices,
  subscribers,
  payments,
}: {
  today: string;
  canRecord: boolean;
  canRemove: boolean;
  pending: PendingRoute[];
  invoices: InvoiceRow[];
  subscribers: { id: string; name: string; paymentTerms: SubscriberPaymentTerms | null }[];
  payments: SubscriberPaymentDoc[];
}) {
  const router = useRouter();
  const [pendingTx, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [issueDates, setIssueDates] = useState<Record<string, string>>({});
  const [paySubscriber, setPaySubscriber] = useState('');
  const [payDate, setPayDate] = useState(today);
  const [payAmount, setPayAmount] = useState<number | ''>('');
  const [payMethod, setPayMethod] = useState('');
  const [payRef, setPayRef] = useState('');
  const [applied, setApplied] = useState<Record<string, number | ''>>({});

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ kind: 'ok', text: okText });
        after?.();
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  const termsOf = (subscriberId: string) => subscribers.find((c) => c.id === subscriberId)?.paymentTerms ?? null;
  const openForSubscriber = useMemo(() => invoices.filter((i) => i.subscriberId === paySubscriber && i.openCents > 0).sort((a, b) => a.openedOn.localeCompare(b.openedOn)), [invoices, paySubscriber]);
  const appliedTotal = Object.values(applied).reduce<number>((t, v) => t + (v === '' ? 0 : toCents(v)), 0);

  function pickSubscriber(id: string) {
    setPaySubscriber(id);
    setApplied({});
  }
  /** Oldest invoice first, up to the amount received. */
  function applyOldestFirst() {
    let left = payAmount === '' ? 0 : toCents(payAmount);
    const next: Record<string, number | ''> = {};
    for (const i of openForSubscriber) {
      const take = Math.min(left, i.openCents);
      next[i.id] = take > 0 ? fromCents(take) : '';
      left -= take;
    }
    setApplied(next);
  }
  function submitPayment() {
    const applications = Object.entries(applied)
      .filter(([, v]) => v !== '' && v > 0)
      .map(([documentId, v]) => ({ documentId, amountCents: toCents(v as number) }));
    run(
      () => recordSubscriberPayment({ subscriberId: paySubscriber, receivedOn: payDate, amountCents: payAmount === '' ? 0 : toCents(payAmount), method: payMethod || null, reference: payRef || null, applications, notes: null }),
      'Recorded the payment.',
      () => {
        setPayAmount('');
        setApplied({});
        setPayRef('');
      },
    );
  }

  return (
    <>
      {msg && <div className={`farm-scenariobar-msg ${msg.kind} mt-4`} role="status">{msg.text}</div>}

      <Card title={`Routes distributed, not yet on an invoice — ${pending.length}`} className="mt-4">
        {pending.length === 0 ? (
          <p className="farm-kpi-sub">Every Subscriptions and Restaurants distribution with a subscriber is on an invoice.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead><tr><th>Distributed</th><th>Subscriber</th><th className="num">Distributions</th><th className="num">Units</th><th className="num">Revenue</th><th /></tr></thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={`${r.date}|${r.subscriberId}`}>
                    <td>{r.date}</td>
                    <td>{r.subscriberName}</td>
                    <td className="num">{r.distributions}</td>
                    <td className="num">{num(Math.round(r.units))}</td>
                    <td className="num">{money(fromCents(r.amountCents), 2)}</td>
                    <td className="num">{canRecord && <button type="button" className="farm-btn py-[0.1rem]! px-2!" disabled={pendingTx} onClick={() => run(() => completeRoute({ date: r.date, subscriberId: r.subscriberId }), `Route of ${r.date} added to ${r.subscriberName}'s invoice for ${r.date.slice(0, 7)}.`)}>Complete route</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="farm-kpi-sub mt-2">Completing a route adds its distributions to the subscriber&apos;s open invoice for the month, and opens one when there is none. Routes are also completed on the Grow Room and on Orders.</p>
      </Card>

      <Card title={`Invoices — ${invoices.length}`} className="mt-4">
        {invoices.length === 0 ? (
          <p className="farm-kpi-sub">No invoice on file.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead>
                <tr><th>Invoice</th><th>Subscriber</th><th>Month</th><th>Status</th><th className="num">Distributions</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Open</th><th>Terms · due</th><th /></tr>
              </thead>
              <tbody>
                {invoices.map((i) => {
                  const terms = i.status === 'issued' ? i.paymentTerms : termsOf(i.subscriberId);
                  const issueOn = issueDates[i.id] ?? (i.lastDistributedOn && i.lastDistributedOn > today ? i.lastDistributedOn : today);
                  return (
                    <tr key={i.id}>
                      <td><Link className="farm-link farm-mono" href={`/farm/receivables/invoices/${i.id}`}>{i.invoiceNumber}</Link></td>
                      <td>{i.subscriberName}</td>
                      <td>{i.period}</td>
                      <td>{i.status === 'open' ? 'Open — routes being added' : i.openCents === 0 ? 'Issued · paid' : `Issued ${i.issuedOn}`}</td>
                      <td className="num">{i.distributions} · {num(Math.round(i.units))} units</td>
                      <td className="num">{money(fromCents(i.amountCents), 2)}</td>
                      <td className="num">{money(fromCents(i.paidCents), 2)}</td>
                      <td className="num">{money(fromCents(i.openCents), 2)}</td>
                      <td>
                        {terms ? PAYMENT_TERMS_LABELS[terms] : 'No terms on file'}
                        {i.status === 'issued' ? ` · due ${i.dueOn}` : terms ? ` · due ${dueOn(issueOn, terms)} if issued ${issueOn}` : ''}
                      </td>
                      <td className="num">
                        {canRecord && i.status === 'open' && (
                          <span className="inline-flex gap-[0.3rem] items-center">
                            <input className="farm-input" type="date" value={issueOn} onChange={(e) => setIssueDates((m) => ({ ...m, [i.id]: e.target.value }))} />
                            <button type="button" className="farm-btn py-[0.1rem]! px-2!" disabled={pendingTx || !terms} onClick={() => run(() => issueInvoice({ invoiceId: i.id, issuedOn: issueOn }), `Issued ${i.invoiceNumber}.`)}>Issue</button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="farm-kpi-sub mt-2">An invoice is issued on or after its last distribution, with the subscriber&apos;s terms at that moment; the due date is the issue date plus the terms. A subscriber&apos;s later routes in the same month open a new invoice once one is issued.</p>
      </Card>

      {canRecord && (
        <Card title="Record a subscriber payment" className="mt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="farm-kpi-sub">Subscriber<br />
              <select className="farm-select" value={paySubscriber} onChange={(e) => pickSubscriber(e.target.value)}>
                <option value="">Choose…</option>
                {subscribers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="farm-kpi-sub">Received on<br /><input className="farm-input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></label>
            <label className="farm-kpi-sub">Amount $<br /><input className="farm-input w-32!" type="number" min={0} step={0.01} value={payAmount} onChange={(e) => setPayAmount(e.target.value === '' ? '' : Number(e.target.value))} /></label>
            <label className="farm-kpi-sub">Method<br /><input className="farm-input w-28!" value={payMethod} placeholder="ACH, check…" onChange={(e) => setPayMethod(e.target.value)} /></label>
            <label className="farm-kpi-sub">Reference<br /><input className="farm-input w-36!" value={payRef} onChange={(e) => setPayRef(e.target.value)} /></label>
            <button type="button" className="farm-btn" disabled={!paySubscriber || payAmount === ''} onClick={applyOldestFirst}>Apply oldest first</button>
          </div>
          {paySubscriber && (
            openForSubscriber.length === 0 ? (
              <p className="farm-kpi-sub mt-2">No invoice for this subscriber has a balance open; a payment recorded now is unapplied.</p>
            ) : (
              <div className="farm-scroll-x mt-3">
                <table className="farm-table">
                  <thead><tr><th>Invoice</th><th>Status</th><th className="num">Open</th><th className="num">Apply $</th></tr></thead>
                  <tbody>
                    {openForSubscriber.map((i) => (
                      <tr key={i.id}>
                        <td className="farm-mono">{i.invoiceNumber}</td>
                        <td>{i.status === 'open' ? 'Not yet issued' : `Due ${i.dueOn}`}</td>
                        <td className="num">{money(fromCents(i.openCents), 2)}</td>
                        <td className="num"><input className="farm-num-input" type="number" min={0} step={0.01} value={applied[i.id] ?? ''} onChange={(e) => setApplied((m) => ({ ...m, [i.id]: e.target.value === '' ? '' : Number(e.target.value) }))} /></td>
                      </tr>
                    ))}
                    <tr className="total"><td colSpan={3}>Applied · unapplied</td><td className="num">{money(fromCents(appliedTotal), 2)} · {money(fromCents((payAmount === '' ? 0 : toCents(payAmount)) - appliedTotal), 2)}</td></tr>
                  </tbody>
                </table>
              </div>
            )
          )}
          <div className="mt-3!">
            <button type="button" className="farm-btn primary" disabled={pendingTx || !paySubscriber || payAmount === '' || appliedTotal > toCents(payAmount)} onClick={submitPayment}>Record payment</button>
          </div>
        </Card>
      )}

      <Card title={`Subscriber payments — ${payments.length}`} className="mt-4">
        {payments.length === 0 ? (
          <p className="farm-kpi-sub">No subscriber payment on file.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead><tr><th>Received</th><th>Subscriber</th><th>Method · reference</th><th className="num">Amount</th><th>Applied to</th><th /></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.receivedOn}</td>
                    <td>{p.subscriberName}</td>
                    <td>{[p.method, p.reference].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="num">{money(fromCents(p.amountCents), 2)}</td>
                    <td>{p.applications.length === 0 ? 'Unapplied' : p.applications.map((a) => `${invoices.find((i) => i.id === a.documentId)?.invoiceNumber ?? 'invoice'} ${money(fromCents(a.amountCents), 2)}`).join(', ')}</td>
                    <td className="num">{canRemove && <button type="button" className="farm-btn py-[0.1rem]! px-[0.4rem]!" disabled={pendingTx} onClick={() => run(() => deleteWorkingCapitalRecord({ kind: 'subscriber_payment', id: p.id }), 'Removed the payment.')}>Remove</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
