import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BrandLine, Card, money, num } from '../../../_components/ui';
import { loadActuals } from '../../../_lib/actuals';
import { invoiceBalances, distributionRevenueCents } from '../../../_engine/working-capital';
import { PAYMENT_TERMS_LABELS } from '../../../_data/working-capital';
import { getResolvedActiveInputs } from '../../../_lib/scenarios';
import { getFarmAccess } from '../../../_lib/access';
import { AdminOnlyNotice } from '../../../_components/AdminOnly';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

export const dynamic = 'force-dynamic';

const fromCents = (c: number) => c / 100;

/**
 * One subscriber invoice as a document: the distributions its completed routes
 * added, what it bills, what has been applied against it. Computed from the
 * records on every read; nothing on it is stored as a total.
 */
export default async function InvoicePage(props: Parameters<typeof InvoicePageInner>[0]) {
  return withWorkspace(() => InvoicePageInner(props));
}

async function InvoicePageInner({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice area="The invoice" />;
  const { id } = await params;
  const [bundle, { inputs }] = await Promise.all([loadActuals(), getResolvedActiveInputs()]);
  const b = invoiceBalances(bundle.invoices ?? [], bundle.distributions, bundle.subscriberPayments ?? []).find((x) => x.invoice.id === id);
  if (!b) notFound();
  const inv = b.invoice;
  const payments = (bundle.subscriberPayments ?? []).filter((p) => p.applications.some((a) => a.documentId === id));

  return (
    <>
      <p className="farm-kpi-sub mb-3!"><Link className="farm-link" href="/farm/receivables">Receivables</Link></p>
      <div className="farm-card">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <BrandLine />
            <h1 className="farm-page-title farm-mono farm-fs-lg">{inv.invoiceNumber}</h1>
            <p className="farm-kpi-sub">Bill to <strong className="farm-c-ink">{inv.subscriberName}</strong> · service month {inv.period}</p>
          </div>
          <table className="farm-table w-auto!">
            <tbody>
              <tr><td>Status</td><td className="num">{inv.status === 'open' ? 'Open — routes being added' : 'Issued'}</td></tr>
              <tr><td>Opened</td><td className="num">{inv.openedOn}</td></tr>
              <tr><td>Issued</td><td className="num">{inv.issuedOn ?? '—'}</td></tr>
              <tr><td>Terms</td><td className="num">{inv.paymentTerms ? PAYMENT_TERMS_LABELS[inv.paymentTerms] : '—'}</td></tr>
              <tr><td>Due</td><td className="num">{inv.dueOn ?? '—'}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="farm-scroll-x mt-3">
          <table className="farm-table">
            <thead><tr><th>Distributed</th><th>Pickup point</th><th>Channel</th><th className="num">Units</th><th className="num">Price</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {b.distributions.map((d) => (
                <tr key={d.id}>
                  <td>{d.distributedOn}</td>
                  <td>{d.pickupPointName ?? '—'}</td>
                  <td>{inputs.phases.find((p) => p.phase === d.phase)?.market ?? `Channel ${d.phase}`}</td>
                  <td className="num">{num(d.units)}</td>
                  <td className="num">{money(fromCents(d.pricePerUnitCents), 2)}</td>
                  <td className="num">{money(fromCents(distributionRevenueCents(d)), 2)}</td>
                </tr>
              ))}
              <tr className="total"><td colSpan={3}>Total</td><td className="num">{num(b.units)}</td><td /><td className="num">{money(fromCents(b.amountCents), 2)}</td></tr>
              <tr><td colSpan={5}>Payments applied</td><td className="num">({money(fromCents(b.paidCents), 2)})</td></tr>
              <tr className="total"><td colSpan={5}>Balance</td><td className="num">{money(fromCents(b.openCents), 2)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <Card title="Payments applied" className="mt-4">
        {payments.length === 0 ? (
          <p className="farm-kpi-sub">No payment is applied to this invoice.</p>
        ) : (
          <table className="farm-table">
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}><td>{p.receivedOn}</td><td>{[p.method, p.reference].filter(Boolean).join(' · ') || '—'}</td><td className="num">{money(fromCents(p.applications.filter((a) => a.documentId === id).reduce((t, a) => t + a.amountCents, 0)), 2)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="farm-kpi-sub mt-2">The document is computed from the distribution and payment records each time it is read. Sending it to the subscriber by email is not connected.</p>
      </Card>
    </>
  );
}
