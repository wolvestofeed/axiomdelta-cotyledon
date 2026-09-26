import { PortalPending } from '@/app/(farm)/farm/_components/PortalPending';
import { getFarmAccess } from '@/app/(farm)/farm/_lib/access';
import Link from 'next/link';
import { PageHeader, Card, Kpi, money, num } from '@/app/(farm)/farm/_components/ui';
import { listSubscribers } from '@/app/(farm)/farm/_lib/subscribers';
import { listOrders } from '@/app/(farm)/farm/_lib/orders';
import { loadActuals } from '@/app/(farm)/farm/_lib/actuals';
import { getResolvedActiveInputs } from '@/app/(farm)/farm/_lib/scenarios';
import { invoiceBalances } from '@/app/(farm)/farm/_engine/working-capital';
import { SUBSCRIBER_STATUS_LABELS } from '@/app/(farm)/farm/_data/subscribers';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

export const dynamic = 'force-dynamic';

/**
 * Subscriber Portal — for corporate and restaurant clients, special
 * events included: order history, invoices and payments, and the Flat Builder. A
 * basic page while the portal is developed: a client login is not built, so the
 * subscriber is picked here, and nothing is gated beyond sign-in.
 */
export default async function SubscriberPortalPage(props: Parameters<typeof SubscriberPortalPageInner>[0]) {
  return withWorkspace(() => SubscriberPortalPageInner(props));
}

async function SubscriberPortalPageInner({ searchParams }: { searchParams: Promise<{ subscriber?: string }> }) {
  // Checked on the page as well as `(member)/layout`: a layout gate alone is not enough (CLAUDE.md §10).
  {
    const a = await getFarmAccess();
    if (!a.isOperator) return <PortalPending portal="Subscriber Portal" email={a.email} />;
  }
  const [params, subscribers, orders, actuals, { inputs }] = await Promise.all([searchParams, listSubscribers(), listOrders(), loadActuals(), getResolvedActiveInputs()]);
  const clients = subscribers.filter((c) => c.status !== 'inactive' && c.channel !== 1).sort((a, b) => a.name.localeCompare(b.name));
  const subscriber = clients.find((c) => c.id === params.subscriber) ?? clients[0] ?? null;
  const channelName = (c: number) => inputs.phases.find((p) => p.phase === c)?.market ?? `Channel ${c}`;
  const mine = subscriber ? orders.filter((o) => o.subscriberId === subscriber.id).sort((a, b) => b.orderDate.localeCompare(a.orderDate)) : [];
  const invoices = subscriber ? invoiceBalances((actuals.invoices ?? []).filter((i) => i.subscriberId === subscriber.id), actuals.distributions, actuals.subscriberPayments ?? []) : [];
  const payments = subscriber ? (actuals.subscriberPayments ?? []).filter((p) => p.subscriberId === subscriber.id).sort((a, b) => b.receivedOn.localeCompare(a.receivedOn)) : [];
  const openCents = invoices.reduce((t, b) => t + b.openCents, 0);

  return (
    <>
      <PageHeader
        title="Subscriber Portal"
        purpose="Place an order, check past orders, and pay invoices."
        status="designed"
      />

      <Card title="Subscriber">
        {clients.length === 0 ? (
          <p className="farm-kpi-sub">No corporate, restaurant or marketplace subscriber is on file yet. <Link className="farm-link" href="/farm/subscriber-portal/sign-up">Create an account</Link>.</p>
        ) : (
          <div className="farm-kpi-sub flex! flex-wrap! gap-y-[0.4rem]! gap-x-[0.9rem]!">
            {clients.map((c) => (
              c.id === subscriber?.id
                ? <strong key={c.id} className="farm-c-ink">{c.name}</strong>
                : <Link key={c.id} className="farm-link" href={`/farm/subscriber-portal?subscriber=${c.id}`}>{c.name}</Link>
            ))}
          </div>
        )}
        {subscriber && <p className="farm-kpi-sub mt-2">{channelName(subscriber.channel)} · {SUBSCRIBER_STATUS_LABELS[subscriber.status]} · <Link className="farm-link" href={`/farm/subscriber-portal/flat-builder?subscriber=${subscriber.id}`}>Build an order</Link></p>}
      </Card>

      {subscriber && (
        <>
          <div className="grid gap-3 mt-4 farm-autofit-11">
            <Kpi value={num(mine.length)} label="Orders on file" sub={`${num(mine.filter((o) => o.status === 'distributed').length)} distributed`} />
            <Kpi value={num(invoices.length)} label="Invoices" sub={`${num(invoices.filter((b) => b.invoice.status === 'issued').length)} issued`} />
            <Kpi value={money(openCents / 100)} label="Open on invoices" />
            <Kpi value={num(payments.length)} label="Payments received" />
          </div>

          <Card title="Order history" className="mt-4">
            {mine.length === 0 ? (
              <p className="farm-kpi-sub">No order is on file for {subscriber.name}.</p>
            ) : (
              <div className="farm-scroll-x">
                <table className="farm-table">
                  <thead><tr><th>Date</th><th>Crop plan</th><th className="num">Units</th><th>Status</th></tr></thead>
                  <tbody>
                    {mine.map((o) => (
                      <tr key={o.id}><td>{o.orderDate}</td><td>{inputs.cropPlans.find((r) => r.code === o.cropPlanCode)?.name ?? o.cropPlanCode}</td><td className="num">{num(o.units)}</td><td className="capitalize!">{o.status}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-4 mt-4 farm-autofit-20">
            <Card title="Invoices">
              {invoices.length === 0 ? (
                <p className="farm-kpi-sub">No invoice is on file.</p>
              ) : (
                <table className="farm-table">
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
                <p className="farm-kpi-sub">No payment is on file.</p>
              ) : (
                <table className="farm-table">
                  <thead><tr><th>Received</th><th className="num">Amount</th><th>Reference</th></tr></thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}><td>{p.receivedOn}</td><td className="num">{money(p.amountCents / 100)}</td><td>{p.reference ?? '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="farm-kpi-sub mt-2">Paying an invoice online is not connected.</p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
