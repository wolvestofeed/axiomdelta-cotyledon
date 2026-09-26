import { PortalPending } from '@/app/(muse)/muse/_components/PortalPending';
import { getMuseAccess } from '@/app/(muse)/muse/_lib/access';
import Link from 'next/link';
import { PageHeader, Card, Kpi, money, num } from '@/app/(muse)/muse/_components/ui';
import { listCustomers } from '@/app/(muse)/muse/_lib/customers';
import { listOrders } from '@/app/(muse)/muse/_lib/orders';
import { loadActuals } from '@/app/(muse)/muse/_lib/actuals';
import { getResolvedActiveInputs } from '@/app/(muse)/muse/_lib/scenarios';
import { invoiceBalances } from '@/app/(muse)/muse/_engine/working-capital';
import { CUSTOMER_STATUS_LABELS } from '@/app/(muse)/muse/_data/customers';

export const dynamic = 'force-dynamic';

/**
 * Customer Portal (Robert, 2026-09-16) — for corporate and catering clients, special
 * events included: order history, invoices and payments, and the Order Builder. A
 * basic page while the portal is developed: a client login is not built, so the
 * customer is picked here, and nothing is gated beyond sign-in.
 */
export default async function CustomerPortalPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  // Checked on the page as well as `(member)/layout`: a layout gate alone is not enough (CLAUDE.md §10).
  {
    const a = await getMuseAccess();
    if (!a.isOperator) return <PortalPending portal="Customer Portal" email={a.email} />;
  }
  const [params, customers, orders, actuals, { inputs }] = await Promise.all([searchParams, listCustomers(), listOrders(), loadActuals(), getResolvedActiveInputs()]);
  const clients = customers.filter((c) => c.status !== 'inactive' && c.channel !== 1).sort((a, b) => a.name.localeCompare(b.name));
  const customer = clients.find((c) => c.id === params.customer) ?? clients[0] ?? null;
  const channelName = (c: number) => inputs.phases.find((p) => p.phase === c)?.market ?? `Channel ${c}`;
  const mine = customer ? orders.filter((o) => o.customerId === customer.id).sort((a, b) => b.orderDate.localeCompare(a.orderDate)) : [];
  const invoices = customer ? invoiceBalances((actuals.invoices ?? []).filter((i) => i.customerId === customer.id), actuals.deliveries, actuals.customerPayments ?? []) : [];
  const payments = customer ? (actuals.customerPayments ?? []).filter((p) => p.customerId === customer.id).sort((a, b) => b.receivedOn.localeCompare(a.receivedOn)) : [];
  const openCents = invoices.reduce((t, b) => t + b.openCents, 0);

  return (
    <>
      <PageHeader
        title="Customer Portal"
        purpose="Place an order, check past orders, and pay invoices."
        status="designed"
      />

      <Card title="Customer">
        {clients.length === 0 ? (
          <p className="muse-kpi-sub">No corporate, catering or marketplace customer is on file yet. <Link className="muse-link" href="/muse/customer-portal/sign-up">Create an account</Link>.</p>
        ) : (
          <div className="muse-kpi-sub flex! flex-wrap! gap-y-[0.4rem]! gap-x-[0.9rem]!">
            {clients.map((c) => (
              c.id === customer?.id
                ? <strong key={c.id} className="muse-c-ink">{c.name}</strong>
                : <Link key={c.id} className="muse-link" href={`/muse/customer-portal?customer=${c.id}`}>{c.name}</Link>
            ))}
          </div>
        )}
        {customer && <p className="muse-kpi-sub mt-2">{channelName(customer.channel)} · {CUSTOMER_STATUS_LABELS[customer.status]} · <Link className="muse-link" href={`/muse/customer-portal/order-builder?customer=${customer.id}`}>Build an order</Link></p>}
      </Card>

      {customer && (
        <>
          <div className="grid gap-3 mt-4 muse-autofit-11">
            <Kpi value={num(mine.length)} label="Orders on file" sub={`${num(mine.filter((o) => o.status === 'delivered').length)} delivered`} />
            <Kpi value={num(invoices.length)} label="Invoices" sub={`${num(invoices.filter((b) => b.invoice.status === 'issued').length)} issued`} />
            <Kpi value={money(openCents / 100)} label="Open on invoices" />
            <Kpi value={num(payments.length)} label="Payments received" />
          </div>

          <Card title="Order history" className="mt-4">
            {mine.length === 0 ? (
              <p className="muse-kpi-sub">No order is on file for {customer.name}.</p>
            ) : (
              <div className="muse-scroll-x">
                <table className="muse-table">
                  <thead><tr><th>Date</th><th>Recipe</th><th className="num">Meals</th><th>Status</th></tr></thead>
                  <tbody>
                    {mine.map((o) => (
                      <tr key={o.id}><td>{o.orderDate}</td><td>{inputs.recipes.find((r) => r.code === o.recipeCode)?.name ?? o.recipeCode}</td><td className="num">{num(o.meals)}</td><td className="capitalize!">{o.status}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-4 mt-4 muse-autofit-20">
            <Card title="Invoices">
              {invoices.length === 0 ? (
                <p className="muse-kpi-sub">No invoice is on file.</p>
              ) : (
                <table className="muse-table">
                  <thead><tr><th>Invoice</th><th>Period</th><th className="num">Amount</th><th className="num">Open</th><th>Due</th></tr></thead>
                  <tbody>
                    {invoices.map((b) => (
                      <tr key={b.invoice.id}><td>{b.invoice.invoiceNumber}</td><td>{b.invoice.period}</td><td className="num">{money(b.amountCents / 100)}</td><td className="num">{money(b.openCents / 100)}</td><td>{b.invoice.dueOn ?? (b.invoice.status === 'open' ? 'not issued' : '—')}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card title="Payments">
              {payments.length === 0 ? (
                <p className="muse-kpi-sub">No payment is on file.</p>
              ) : (
                <table className="muse-table">
                  <thead><tr><th>Received</th><th className="num">Amount</th><th>Reference</th></tr></thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}><td>{p.receivedOn}</td><td className="num">{money(p.amountCents / 100)}</td><td>{p.reference ?? '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="muse-kpi-sub mt-2">Paying an invoice online is not connected.</p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
