'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CheckPill, money } from '../_components/ui';
import { recordSupplierBill, updateSupplierBill, recordSupplierPayment, deleteWorkingCapitalRecord } from '../_lib/working-capital-actions';
import { PAYMENT_TERMS_LABELS, type PaymentTerms } from '../_data/working-capital';
import { dueOn, receiptValueCents, threeWayMatch, type BillLine, type SupplierBillDoc, type SupplierPaymentDoc, type OrderedLine } from '../_engine/working-capital';
import type { ReceiptDoc } from '../_engine/actuals';

export interface BillRow {
  bill: SupplierBillDoc;
  status: 'matched' | 'mismatched';
  issues: string[];
  receivedCents: number;
  differenceCents: number;
  dueOn: string;
  amountCents: number;
  paidCents: number;
  openCents: number;
}

type Msg = { kind: 'ok' | 'err'; text: string } | null;
const fromCents = (c: number) => c / 100;
const toCents = (d: number) => Math.round(d * 100);
const supplierKey = (x: { supplierId: string | null; supplierName: string | null }) => x.supplierId ?? `name:${x.supplierName ?? ''}`;

interface BillForm {
  id: string | null;
  supplierKey: string;
  billNumber: string;
  billDate: string;
  receiptIds: string[];
  lines: BillLine[];
}

/** The accepted lines of the chosen receipts, one line per ingredient, unit and price. */
function linesFromReceipts(receipts: readonly ReceiptDoc[]): BillLine[] {
  const m = new Map<string, BillLine>();
  for (const r of receipts) {
    for (const l of r.lines) {
      if (l.condition === 'rejected') continue;
      const k = `${l.ingredient}|${l.unit}|${l.unitPriceCents}`;
      const row = m.get(k) ?? { ingredient: l.ingredient, qty: 0, unit: l.unit, unitPriceCents: l.unitPriceCents };
      row.qty += l.qty;
      m.set(k, row);
    }
  }
  return [...m.values()];
}

export function PayablesClient({
  today,
  canRecord,
  canRemove,
  receipts,
  unbilledReceiptIds,
  purchaseOrders,
  bills,
  payments,
  supplierTerms,
}: {
  today: string;
  canRecord: boolean;
  canRemove: boolean;
  receipts: ReceiptDoc[];
  unbilledReceiptIds: string[];
  purchaseOrders: { id: string; poNumber: string; lines: OrderedLine[] }[];
  bills: BillRow[];
  payments: SupplierPaymentDoc[];
  supplierTerms: Record<string, PaymentTerms>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [form, setForm] = useState<BillForm | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [paySupplier, setPaySupplier] = useState('');
  const [payDate, setPayDate] = useState(today);
  const [payMethod, setPayMethod] = useState('');
  const [payRef, setPayRef] = useState('');
  const [applied, setApplied] = useState<Record<string, number | ''>>({});

  const poNumber = (id: string | null) => (id ? purchaseOrders.find((p) => p.id === id)?.poNumber ?? 'order' : '—');
  const unbilled = receipts.filter((r) => unbilledReceiptIds.includes(r.id)).sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: (res: unknown) => string, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg({ kind: 'ok', text: okText(res) });
        after?.();
        router.refresh();
      } else setMsg({ kind: 'err', text: res.error });
    });
  }

  // ── The bill form ─────────────────────────────────────────────────────────
  const available = useMemo(() => {
    if (!form) return [];
    const onThisBill = form.id ? bills.find((b) => b.bill.id === form.id)?.bill.receiptIds ?? [] : [];
    return receipts.filter((r) => (unbilledReceiptIds.includes(r.id) || onThisBill.includes(r.id)) && supplierKey(r) === form.supplierKey);
  }, [form, bills, receipts, unbilledReceiptIds]);
  const chosen = useMemo(() => (form ? receipts.filter((r) => form.receiptIds.includes(r.id)) : []), [form, receipts]);
  const preview = useMemo(() => (form && chosen.length ? threeWayMatch({ lines: form.lines }, chosen, purchaseOrders) : null), [form, chosen, purchaseOrders]);
  const formSupplier = chosen[0] ?? available[0];
  const formTerms = formSupplier?.supplierId ? supplierTerms[formSupplier.supplierId] : undefined;

  function openForReceipt(r: ReceiptDoc) {
    setForm({ id: null, supplierKey: supplierKey(r), billNumber: '', billDate: today, receiptIds: [r.id], lines: linesFromReceipts([r]) });
  }
  function openForBill(b: SupplierBillDoc) {
    setForm({ id: b.id, supplierKey: supplierKey(b), billNumber: b.billNumber, billDate: b.billDate, receiptIds: [...b.receiptIds], lines: b.lines.map((l) => ({ ...l })) });
  }
  function toggleReceipt(id: string) {
    if (!form) return;
    const ids = form.receiptIds.includes(id) ? form.receiptIds.filter((x) => x !== id) : [...form.receiptIds, id];
    setForm({ ...form, receiptIds: ids, lines: linesFromReceipts(receipts.filter((r) => ids.includes(r.id))) });
  }
  const setLine = (i: number, patch: Partial<BillLine>) => form && setForm({ ...form, lines: form.lines.map((l, li) => (li === i ? { ...l, ...patch } : l)) });
  function submitBill() {
    if (!form || !formSupplier) return;
    const payload = { supplierId: formSupplier.supplierId, supplierName: formSupplier.supplierName ?? 'Supplier', billNumber: form.billNumber, billDate: form.billDate, receiptIds: form.receiptIds, lines: form.lines, notes: null };
    run(
      () => (form.id ? updateSupplierBill({ ...payload, id: form.id }) : recordSupplierBill(payload)),
      (res) => {
        const r = res as { status?: string; issues?: string[] };
        return r.status === 'mismatched' ? `Recorded bill ${form.billNumber} — flagged: ${r.issues?.length ?? 0} issue${r.issues?.length === 1 ? '' : 's'}; it is not paid until rectified.` : `Recorded bill ${form.billNumber} — matched.`;
      },
      () => setForm(null),
    );
  }

  // ── Supplier payment ──────────────────────────────────────────────────────
  const suppliersWithOpen = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bills) if (b.openCents > 0) m.set(supplierKey(b.bill), b.bill.supplierName);
    return [...m.entries()];
  }, [bills]);
  const billsForSupplier = bills.filter((b) => supplierKey(b.bill) === paySupplier && b.openCents > 0).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const appliedTotal = Object.values(applied).reduce<number>((t, v) => t + (v === '' ? 0 : toCents(v)), 0);
  function submitPayment() {
    const first = billsForSupplier[0]?.bill;
    if (!first) return;
    const applications = Object.entries(applied)
      .filter(([, v]) => v !== '' && v > 0)
      .map(([documentId, v]) => ({ documentId, amountCents: toCents(v as number) }));
    run(
      () => recordSupplierPayment({ supplierId: first.supplierId, supplierName: first.supplierName, paidOn: payDate, amountCents: appliedTotal, method: payMethod || null, reference: payRef || null, applications, notes: null }),
      () => `Recorded the payment to ${first.supplierName}.`,
      () => {
        setApplied({});
        setPayRef('');
      },
    );
  }

  return (
    <>
      {msg && <div className={`muse-scenariobar-msg ${msg.kind} mt-4`} role="status">{msg.text}</div>}

      <Card title={`Receipts with no bill — ${unbilled.length}`} className="mt-4">
        {unbilled.length === 0 ? (
          <p className="muse-kpi-sub">Every receipt with accepted lines is on a bill.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Received</th><th>Supplier</th><th>Purchase order</th><th className="num">Lines</th><th className="num">Received value</th><th>Supplier terms</th><th /></tr></thead>
              <tbody>
                {unbilled.map((r) => {
                  const terms = r.supplierId ? supplierTerms[r.supplierId] : undefined;
                  return (
                    <tr key={r.id}>
                      <td>{r.receivedOn}</td>
                      <td>{r.supplierId ? <Link className="muse-link" href={`/muse/suppliers/${encodeURIComponent(r.supplierId)}`}>{r.supplierName ?? r.supplierId}</Link> : r.supplierName ?? '—'}</td>
                      <td className="muse-mono">{poNumber(r.poId)}</td>
                      <td className="num">{r.lines.filter((l) => l.condition !== 'rejected').length}</td>
                      <td className="num">{money(fromCents(receiptValueCents(r)), 2)}</td>
                      <td>{terms ? PAYMENT_TERMS_LABELS[terms] : 'No terms on file'}</td>
                      <td className="num">{canRecord && <button type="button" className="muse-btn py-[0.1rem]! px-2!" onClick={() => openForReceipt(r)}>Record bill</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {form && (
        <Card title={form.id ? `Rectify bill ${form.billNumber}` : 'Record a supplier bill'} className="mt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="muse-kpi-sub">Supplier<br /><strong className="muse-c-ink">{formSupplier?.supplierName ?? '—'}</strong></div>
            <label className="muse-kpi-sub">Bill number<br /><input className="muse-input w-36!" value={form.billNumber} onChange={(e) => setForm({ ...form, billNumber: e.target.value })} /></label>
            <label className="muse-kpi-sub">Bill date<br /><input className="muse-input" type="date" value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} /></label>
            <div className="muse-kpi-sub">Terms · due<br />{formTerms ? `${PAYMENT_TERMS_LABELS[formTerms]} · ${dueOn(form.billDate, formTerms)}` : <>No terms on file{formSupplier?.supplierId ? <> — set on <Link className="muse-link" href={`/muse/suppliers/${encodeURIComponent(formSupplier.supplierId)}`}>the supplier&apos;s page</Link></> : ''}</>}</div>
          </div>
          <div className="muse-kpi-sub mt-3">Receipts the bill covers</div>
          <div className="flex flex-wrap gap-y-[0.4rem] gap-x-4 mt-1!">
            {available.map((r) => (
              <label key={r.id} className="muse-kpi-sub inline-flex! gap-[0.3rem]! items-center!">
                <input type="checkbox" checked={form.receiptIds.includes(r.id)} onChange={() => toggleReceipt(r.id)} />
                {r.receivedOn} · {poNumber(r.poId)} · {money(fromCents(receiptValueCents(r)), 2)}
              </label>
            ))}
          </div>
          <div className="muse-scroll-x mt-3">
            <table className="muse-table">
              <thead><tr><th>Ingredient</th><th className="num">Qty billed</th><th>Unit</th><th className="num">$ / unit billed</th><th className="num">Extended</th><th /></tr></thead>
              <tbody>
                {form.lines.map((l, i) => (
                  <tr key={i}>
                    <td><input className="muse-input w-48!" value={l.ingredient} onChange={(e) => setLine(i, { ingredient: e.target.value })} /></td>
                    <td className="num"><input className="muse-num-input" type="number" min={0} step={0.001} value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
                    <td>{l.unit}</td>
                    <td className="num"><input className="muse-num-input" type="number" min={0} step={0.01} value={fromCents(l.unitPriceCents)} onChange={(e) => setLine(i, { unitPriceCents: toCents(Number(e.target.value)) })} /></td>
                    <td className="num">{money(fromCents(Math.round(l.qty * l.unitPriceCents)), 2)}</td>
                    <td><button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => setForm({ ...form, lines: form.lines.filter((_, li) => li !== i) })}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview && (
            <div className="mt-3">
              <span className="muse-kpi-sub">Three-way match: <CheckPill ok={preview.status === 'matched'} okLabel="Matched" overLabel="Mismatched" /> · billed {money(fromCents(preview.billedCents), 2)} against {money(fromCents(preview.receivedCents), 2)} received</span>
              {preview.issues.length > 0 && <ul className="muse-kpi-sub pl-[1.1rem]! mt-[0.3rem]!">{preview.issues.map((x) => <li key={x}>{x}</li>)}</ul>}
            </div>
          )}
          <div className="flex gap-2 mt-3!">
            <button type="button" className="muse-btn primary" disabled={pending || !form.billNumber.trim() || form.receiptIds.length === 0 || form.lines.length === 0 || !formTerms} onClick={submitBill}>{form.id ? 'Save rectified bill' : 'Record bill'}</button>
            <button type="button" className="muse-btn" onClick={() => setForm(null)} disabled={pending}>Cancel</button>
          </div>
          <p className="muse-kpi-sub mt-2">Lines start as the receipts&apos; accepted lines; type what the supplier&apos;s bill says. A bill that does not match is recorded and flagged. A quantity or price received differently from the order is corrected on the receipt with its override reason, not here.</p>
        </Card>
      )}

      <Card title={`Supplier bills — ${bills.length}`} className="mt-4">
        {bills.length === 0 ? (
          <p className="muse-kpi-sub">No supplier bill on file.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Bill</th><th>Supplier</th><th>Date</th><th>Terms · due</th><th>Match</th><th className="num">Billed</th><th className="num">Paid</th><th className="num">Open</th><th /></tr></thead>
              <tbody>
                {bills.flatMap((b) => [
                    <tr key={b.bill.id}>
                      <td className="muse-mono">{b.bill.billNumber}</td>
                      <td>{b.bill.supplierName}</td>
                      <td>{b.bill.billDate}</td>
                      <td>{PAYMENT_TERMS_LABELS[b.bill.paymentTerms]} · {b.dueOn}</td>
                      <td>
                        <CheckPill ok={b.status === 'matched'} okLabel="Matched" overLabel={`Mismatched · ${b.issues.length}`} />
                        {b.issues.length > 0 && <button type="button" className="muse-btn py-0! px-[0.4rem]! ml-[0.3rem]!" onClick={() => setExpanded((x) => (x === b.bill.id ? null : b.bill.id))}>{expanded === b.bill.id ? 'Hide' : 'Issues'}</button>}
                      </td>
                      <td className="num">{money(fromCents(b.amountCents), 2)}</td>
                      <td className="num">{money(fromCents(b.paidCents), 2)}</td>
                      <td className="num">{money(fromCents(b.openCents), 2)}</td>
                      <td className="num">
                        {canRecord && b.paidCents === 0 && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" onClick={() => openForBill(b.bill)}>Rectify</button>}
                        {canRemove && b.paidCents === 0 && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]! ml-[0.3rem]!" disabled={pending} onClick={() => run(() => deleteWorkingCapitalRecord({ kind: 'supplier_bill', id: b.bill.id }), () => `Removed bill ${b.bill.billNumber}.`)}>Remove</button>}
                      </td>
                    </tr>,
                    ...(expanded === b.bill.id
                      ? [<tr key={`${b.bill.id}-issues`}><td colSpan={9}><ul className="muse-kpi-sub pl-[1.1rem]!">{b.issues.map((x) => <li key={x}>{x}</li>)}</ul></td></tr>]
                      : []),
                ])}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canRecord && (
        <Card title="Pay supplier bills" className="mt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="muse-kpi-sub">Supplier<br />
              <select className="muse-select" value={paySupplier} onChange={(e) => { setPaySupplier(e.target.value); setApplied({}); }}>
                <option value="">Choose…</option>
                {suppliersWithOpen.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
              </select>
            </label>
            <label className="muse-kpi-sub">Paid on<br /><input className="muse-input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></label>
            <label className="muse-kpi-sub">Method<br /><input className="muse-input w-28!" value={payMethod} placeholder="ACH, check…" onChange={(e) => setPayMethod(e.target.value)} /></label>
            <label className="muse-kpi-sub">Reference<br /><input className="muse-input w-36!" value={payRef} onChange={(e) => setPayRef(e.target.value)} /></label>
          </div>
          {paySupplier && (
            <div className="muse-scroll-x mt-3">
              <table className="muse-table">
                <thead><tr><th>Bill</th><th>Due</th><th>Match</th><th className="num">Open</th><th className="num">Pay $</th></tr></thead>
                <tbody>
                  {billsForSupplier.map((b) => (
                    <tr key={b.bill.id}>
                      <td className="muse-mono">{b.bill.billNumber}</td>
                      <td>{b.dueOn}</td>
                      <td>{b.status === 'matched' ? 'Matched' : 'Mismatched — not paid until rectified'}</td>
                      <td className="num">{money(fromCents(b.openCents), 2)}</td>
                      <td className="num">{b.status === 'matched' ? <input className="muse-num-input" type="number" min={0} step={0.01} value={applied[b.bill.id] ?? ''} onChange={(e) => setApplied((m) => ({ ...m, [b.bill.id]: e.target.value === '' ? '' : Number(e.target.value) }))} /> : '—'}</td>
                    </tr>
                  ))}
                  <tr className="total"><td colSpan={4}>Payment</td><td className="num">{money(fromCents(appliedTotal), 2)}</td></tr>
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3!">
            <button type="button" className="muse-btn primary" disabled={pending || !paySupplier || appliedTotal <= 0} onClick={submitPayment}>Record payment</button>
          </div>
        </Card>
      )}

      <Card title={`Supplier payments — ${payments.length}`} className="mt-4">
        {payments.length === 0 ? (
          <p className="muse-kpi-sub">No supplier payment on file.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Paid</th><th>Supplier</th><th>Method · reference</th><th className="num">Amount</th><th>Bills</th><th /></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.paidOn}</td>
                    <td>{p.supplierName}</td>
                    <td>{[p.method, p.reference].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="num">{money(fromCents(p.amountCents), 2)}</td>
                    <td>{p.applications.map((a) => `${bills.find((b) => b.bill.id === a.documentId)?.bill.billNumber ?? 'bill'} ${money(fromCents(a.amountCents), 2)}`).join(', ')}</td>
                    <td className="num">{canRemove && <button type="button" className="muse-btn py-[0.1rem]! px-[0.4rem]!" disabled={pending} onClick={() => run(() => deleteWorkingCapitalRecord({ kind: 'supplier_payment', id: p.id }), () => 'Removed the payment.')}>Remove</button>}</td>
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
