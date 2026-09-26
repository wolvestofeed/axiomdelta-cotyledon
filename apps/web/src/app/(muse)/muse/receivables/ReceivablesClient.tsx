'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, money, num } from '../_components/ui';
import { completeRoute, issueInvoice, recordCustomerPayment, deleteWorkingCapitalRecord } from '../_lib/working-capital-actions';
import { PAYMENT_TERMS_LABELS, type CustomerPaymentTerms } from '../_data/working-capital';
import { dueOn, type CustomerPaymentDoc } from '../_engine/working-capital';

export interface PendingRoute {
  date: string;
  customerId: string;
  customerName: string;
  deliveries: number;
  meals: number;
  amountCents: number;
}

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  period: string;
  status: 'open' | 'issued';
  openedOn: string;
  issuedOn: string | null;
  dueOn: string | null;
  paymentTerms: CustomerPaymentTerms | null;
  deliveries: number;
  meals: number;
  amountCents: number;
  paidCents: number;
  openCents: number;
  lastDeliveredOn: string | null;
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
  customers,
  payments,
}: {
  today: string;
  canRecord: boolean;
  canRemove: boolean;
  pending: PendingRoute[];
  invoices: InvoiceRow[];
  customers: { id: string; name: string; paymentTerms: CustomerPaymentTerms | null }[];
  payments: CustomerPaymentDoc[];
}) {
  const router = useRouter();
  const [pendingTx, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [issueDates, setIssueDates] = useState<Record<string, string>>({});
  const [payCustomer, setPayCustomer] = useState('');
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

  const termsOf = (customerId: string) => customers.find((c) => c.id === customerId)?.paymentTerms ?? null;
  const openForCustomer = useMemo(() => invoices.filter((i) => i.customerId === payCustomer && i.openCents > 0).sort((a, b) => a.openedOn.localeCompare(b.openedOn)), [invoices, payCustomer]);
  const appliedTotal = Object.values(applied).reduce<number>((t, v) => t + (v === '' ? 0 : toCents(v)), 0);

  function pickCustomer(id: string) {
    setPayCustomer(id);
    setApplied({});
  }
  /** Oldest invoice first, up to the amount received. */
  function applyOldestFirst() {
    let left = payAmount === '' ? 0 : toCents(payAmount);
    const next: Record<string, number | ''> = {};
    for (const i of openForCustomer) {
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
      () => recordCustomerPayment({ customerId: payCustomer, receivedOn: payDate, amountCents: payAmount === '' ? 0 : toCents(payAmount), method: payMethod || null, reference: payRef || null, applications, notes: null }),
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
      {msg && <div className={`muse-scenariobar-msg ${msg.kind} mt-4`} role="status">{msg.text}</div>}

      <Card title={`Routes delivered, not yet on an invoice — ${pending.length}`} className="mt-4">
        {pending.length === 0 ? (
          <p className="muse-kpi-sub">Every School lunches and Corporate catering delivery with a customer is on an invoice.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Delivered</th><th>Customer</th><th className="num">Deliveries</th><th className="num">Meals</th><th className="num">Revenue</th><th /></tr></thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={`${r.date}|${r.customerId}`}>
                    <td>{r.date}</td>
                    <td>{r.customerName}</td>
                    <td className="num">{r.deliveries}</td>
                    <td className="num">{num(Math.round(r.meals))}</td>
                    <td className="num">{money(fromCents(r.amountCents), 2)}</td>
                    <td className="num">{canRecord && <button type="button" className="muse-btn py-[0.1rem]! px-2!" disabled={pendingTx} onClick={() => run(() => completeRoute({ date: r.date, customerId: r.customerId }), `Route of ${r.date} added to ${r.customerName}'s invoice for ${r.date.slice(0, 7)}.`)}>Complete route</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muse-kpi-sub mt-2">Completing a route adds its deliveries to the customer&apos;s open invoice for the month, and opens one when there is none. Routes are also completed on the Floor and on Orders.</p>
      </Card>

      <Card title={`Invoices — ${invoices.length}`} className="mt-4">
        {invoices.length === 0 ? (
          <p className="muse-kpi-sub">No invoice on file.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead>
                <tr><th>Invoice</th><th>Customer</th><th>Month</th><th>Status</th><th className="num">Deliveries</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Open</th><th>Terms · due</th><th /></tr>
              </thead>
              <tbody>
                {invoices.map((i) => {
                  const terms = i.status === 'issued' ? i.paymentTerms : termsOf(i.customerId);
                  const issueOn = issueDates[i.id] ?? (i.lastDeliveredOn && i.lastDeliveredOn > today ? i.lastDeliveredOn : today);
                  return (
                    <tr key={i.id}>
                      <td><Link className="muse-link muse-mono" href={`/muse/receivables/invoices/${i.id}`}>{i.invoiceNumber}</Link></td>
                      <td>{i.customerName}</td>
                      <td>{i.period}</td>
                      <td>{i.status === 'open' ? 'Open — routes being added' : i.openCents === 0 ? 'Issued · paid' : `Issued ${i.issuedOn}`}</td>
                      <td className="num">{i.deliveries} · {num(Math.round(i.meals))} meals</td>
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
                            <input className="muse-input" type="date" value={issueOn} onChange={(e) => setIssueDates((m) => ({ ...m, [i.id]: e.target.value }))} />
                            <button type="button" className="muse-btn py-[0.1rem]! px-2!" disabled={pendingTx || !terms} onClick={() => run(() => issueInvoice({ invoiceId: i.id, issuedOn: issueOn }), `Issued ${i.invoiceNumber}.`)}>Issue</button>
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
        <p className="muse-kpi-sub mt-2">An invoice is issued on or after its last delivery, with the customer&apos;s terms at that moment; the due date is the issue date plus the terms. A customer&apos;s later routes in the same month open a new invoice once one is issued.</p>
      </Card>

      {canRecord && (
        <Card title="Record a customer payment" className="mt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="muse-kpi-sub">Customer<br />
              <select className="muse-select" value={payCustomer} onChange={(e) => pickCustomer(e.target.value)}>
                <option value="">Choose…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="muse-kpi-sub">Received on<br /><input className="muse-input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></label>
            <label className="muse-kpi-sub">Amount $<br /><input className="muse-input w-32!" type="number" min={0} step={0.01} value={payAmount} onChange={(e) => setPayAmount(e.target.value === '' ? '' : Number(e.target.value))} /></label>
            <label className="muse-kpi-sub">Method<br /><input className="muse-input w-28!" value={payMethod} placeholder="ACH, check…" onChange={(e) => setPayMethod(e.target.value)} /></label>
            <label className="muse-kpi-sub">Reference<br /><input className="muse-input w-36!" value={payRef} onChange={(e) => setPayRef(e.target.value)} /></label>
            <button type="button" className="muse-btn" disabled={!payCustomer || payAmount === ''} onClick={applyOldestFirst}>Apply oldest first</button>
          </div>
          {payCustomer && (
            openForCustomer.length === 0 ? (
              <p className="muse-kpi-sub mt-2">No invoice for this customer has a balance open; a payment recorded now is unapplied.</p>
            ) : (
              <div className="muse-scroll-x mt-3">
                <table className="muse-table">
                  <thead><tr><th>Invoice</th><th>Status</th><th className="num">Open</th><th className="num">Apply $</th></tr></thead>
                  <tbody>
                    {openForCustomer.map((i) => (
                      <tr key={i.id}>
                        <td className="muse-mono">{i.invoiceNumber}</td>
                        <td>{i.status === 'open' ? 'Not yet issued' : `Due ${i.dueOn}`}</td>
                        <td className="num">{money(fromCents(i.openCents), 2)}</td>
                        <td className="num"><input className="muse-num-input" type="number" min={0} step={0.01} value={applied[i.id] ?? ''} onChange={(e) => setApplied((m) => ({ ...m, [i.id]: e.target.value === '' ? '' : Number(e.target.value) }))} /></td>
                      </tr>
                    ))}
                    <tr className="total"><td colSpan={3}>Applied · unapplied</td><td className="num">{money(fromCents(appliedTotal), 2)} · {money(fromCents((payAmount === '' ? 0 : toCents(payAmount)) - appliedTotal), 2)}</td></tr>
                  </tbody>
                </table>
              </div>
            )
          )}
          <div className="mt-3!">
            <button type="button" className="muse-btn primary" disabled={pendingTx || !payCustomer || payAmount === '' || appliedTotal > toCents(payAmount)} onClick={submitPayment}>Record payment</button>
          </div>
        </Card>
      )}

      <Card title={`Customer payments — ${payments.length}`} className="mt-4">
        {payments.length === 0 ? (
          <p className="muse-kpi-sub">No customer payment on file.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Received</th><th>Customer</th><th>Method · reference</th><th className="num">Amount</th><th>Applied to</th><th /></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.receivedOn}</td>
                    <td>{p.customerName}</td>
                    <td>{[p.method, p.reference].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="num">{money(fromCents(p.amountCents), 2)}</td>
                    <td>{p.applications.length === 0 ? 'Unapplied' : p.applications.map((a) => `${invoices.find((i) => i.id === a.documentId)?.invoiceNumber ?? 'invoice'} ${money(fromCents(a.amountCents), 2)}`).join(', ')}</td>
                    <td className="num">{canRemove && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" disabled={pendingTx} onClick={() => run(() => deleteWorkingCapitalRecord({ kind: 'customer_payment', id: p.id }), 'Removed the payment.')}>Remove</button>}</td>
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
