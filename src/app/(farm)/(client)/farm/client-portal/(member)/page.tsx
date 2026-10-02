import { PortalPending } from '@/components/PortalPending';
import { getFarmAccess } from '@/server/access';
import { canUsePortal } from '@/server/client-portal';
import Link from 'next/link';
import { PageHeader, Card, Kpi, money, num } from '@/components/ui';
import { portalClients } from '@/server/client-portal';
import { ClientPicker } from '@/components/ClientPicker';
import { listOrders } from '@/server/orders';
import { loadActuals } from '@/server/actuals';
import { getResolvedActiveInputs } from '@/server/scenarios';
import { invoiceBalances } from '@/engine/working-capital';
import { SUBSCRIBER_STATUS_LABELS } from '@/data/subscribers';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

/**
 * Client Portal — the farm's clients: order history, invoices and payments; the Flat Builder,
 * Subscriptions, Profile and Settings are its other pages. Until an external account is linked to
 * its record (Roadmap P5) the subscriber is picked here by the farm's staff (`server/client-portal.ts`).
 */
export default async function SubscriberPortalPage(props: Parameters<typeof SubscriberPortalPageInner>[0]) {
  return withWorkspace(() => SubscriberPortalPageInner(props));
}

async function SubscriberPortalPageInner({ searchParams }: { searchParams: Promise<{ subscriber?: string }> }) {
  // Checked on the page as well as `(member)/layout`: a layout gate alone is not enough (CLAUDE.md §10).
  const a = await getFarmAccess();
  if (!canUsePortal(a)) return <PortalPending portal="Client Portal" email={a.email} />;
  const params = await searchParams;
  const [{ clients, subscriber }, orders, actuals, { inputs }] = await Promise.all([portalClients(params.subscriber, a), listOrders(), loadActuals(), getResolvedActiveInputs()]);
  const channelName = (c: number) => inputs.phases.find((p) => p.phase === c)?.market ?? `Channel ${c}`;
  const mine = subscriber ? orders.filter((o) => o.subscriberId === subscriber.id).sort((a, b) => b.orderDate.localeCompare(a.orderDate)) : [];
  const invoices = subscriber ? invoiceBalances((actuals.invoices ?? []).filter((i) => i.subscriberId === subscriber.id), actuals.distributions, actuals.subscriberPayments ?? []) : [];
  const payments = subscriber ? (actuals.subscriberPayments ?? []).filter((p) => p.subscriberId === subscriber.id).sort((a, b) => b.receivedOn.localeCompare(a.receivedOn)) : [];
  const openCents = invoices.reduce((t, b) => t + b.openCents, 0);

  return (
    <>
      <PageHeader
        title="Client Portal"
        purpose="Place an order, check past orders, and pay invoices."
        status="designed"
      />

      <ClientPicker clients={clients} subscriber={subscriber} path="/farm/client-portal" />
      {subscriber && <p className="farm-kpi-sub mt-2">{channelName(subscriber.channel)} · {SUBSCRIBER_STATUS_LABELS[subscriber.status]} · <Link className="farm-link" href={`/farm/client-portal/flat-builder?subscriber=${subscriber.id}`}>Build an order</Link></p>}

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
                  <thead><tr><th>Date</th><th>Grow plan</th><th className="num">Units</th><th>Status</th></tr></thead>
                  <tbody>
                    {mine.map((o) => (
                      <tr key={o.id}><td>{o.orderDate}</td><td>{inputs.growPlans.find((r) => r.code === o.growPlanCode)?.name ?? o.growPlanCode}</td><td className="num">{num(o.units)}</td><td className="capitalize!">{o.status}</td></tr>
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
