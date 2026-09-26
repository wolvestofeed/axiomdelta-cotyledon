import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BrandLine, Card, money, num } from '../../../_components/ui';
import { loadActuals } from '../../../_lib/actuals';
import { invoiceBalances, deliveryRevenueCents } from '../../../_engine/working-capital';
import { PAYMENT_TERMS_LABELS } from '../../../_data/working-capital';
import { getResolvedActiveInputs } from '../../../_lib/scenarios';
import { getMuseAccess } from '../../../_lib/access';
import { AdminOnlyNotice } from '../../../_components/AdminOnly';

export const dynamic = 'force-dynamic';

const fromCents = (c: number) => c / 100;

/**
 * One customer invoice as a document: the deliveries its completed routes
 * added, what it bills, what has been applied against it. Computed from the
 * records on every read; nothing on it is stored as a total.
 */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getMuseAccess()).isSuperAdmin) return <AdminOnlyNotice area="The invoice" />;
  const { id } = await params;
  const [bundle, { inputs }] = await Promise.all([loadActuals(), getResolvedActiveInputs()]);
  const b = invoiceBalances(bundle.invoices ?? [], bundle.deliveries, bundle.customerPayments ?? []).find((x) => x.invoice.id === id);
  if (!b) notFound();
  const inv = b.invoice;
  const payments = (bundle.customerPayments ?? []).filter((p) => p.applications.some((a) => a.documentId === id));

  return (
    <>
      <p className="muse-kpi-sub mb-3!"><Link className="muse-link" href="/muse/receivables">Receivables</Link></p>
      <div className="muse-card">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <BrandLine />
            <h1 className="muse-page-title muse-mono muse-fs-lg">{inv.invoiceNumber}</h1>
            <p className="muse-kpi-sub">Bill to <strong className="muse-c-ink">{inv.customerName}</strong> · service month {inv.period}</p>
          </div>
          <table className="muse-table w-auto!">
            <tbody>
              <tr><td>Status</td><td className="num">{inv.status === 'open' ? 'Open — routes being added' : 'Issued'}</td></tr>
              <tr><td>Opened</td><td className="num">{inv.openedOn}</td></tr>
              <tr><td>Issued</td><td className="num">{inv.issuedOn ?? '—'}</td></tr>
              <tr><td>Terms</td><td className="num">{inv.paymentTerms ? PAYMENT_TERMS_LABELS[inv.paymentTerms] : '—'}</td></tr>
              <tr><td>Due</td><td className="num">{inv.dueOn ?? '—'}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="muse-scroll-x mt-3">
          <table className="muse-table">
            <thead><tr><th>Delivered</th><th>Site</th><th>Channel</th><th className="num">Meals</th><th className="num">Price</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {b.deliveries.map((d) => (
                <tr key={d.id}>
                  <td>{d.deliveredOn}</td>
                  <td>{d.siteName ?? '—'}</td>
                  <td>{inputs.phases.find((p) => p.phase === d.phase)?.market ?? `Channel ${d.phase}`}</td>
                  <td className="num">{num(d.meals)}</td>
                  <td className="num">{money(fromCents(d.pricePerMealCents), 2)}</td>
                  <td className="num">{money(fromCents(deliveryRevenueCents(d)), 2)}</td>
                </tr>
              ))}
              <tr className="total"><td colSpan={3}>Total</td><td className="num">{num(b.meals)}</td><td /><td className="num">{money(fromCents(b.amountCents), 2)}</td></tr>
              <tr><td colSpan={5}>Payments applied</td><td className="num">({money(fromCents(b.paidCents), 2)})</td></tr>
              <tr className="total"><td colSpan={5}>Balance</td><td className="num">{money(fromCents(b.openCents), 2)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <Card title="Payments applied" className="mt-4">
        {payments.length === 0 ? (
          <p className="muse-kpi-sub">No payment is applied to this invoice.</p>
        ) : (
          <table className="muse-table">
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}><td>{p.receivedOn}</td><td>{[p.method, p.reference].filter(Boolean).join(' · ') || '—'}</td><td className="num">{money(fromCents(p.applications.filter((a) => a.documentId === id).reduce((t, a) => t + a.amountCents, 0)), 2)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muse-kpi-sub mt-2">The document is computed from the delivery and payment records each time it is read. Sending it to the customer by email is not connected.</p>
      </Card>
    </>
  );
}
