import Link from 'next/link';
import { PageHeader, Card, Kpi, money, num } from '../_components/ui';
import { getFarmAccess } from '../_lib/access';
import { postSelectedLedger } from '../_lib/ledgers';
import { periodWorkingCapital } from '../_engine/actuals-ledger';
import { LedgerMonthBar, pickMonth } from '../_components/ledger/LedgerMonthBar';
import { PageControls } from '../_components/PageControls';
import { AGING_BUCKETS, AGING_LABELS, agingReport, daysInPeriod, distributionRevenueCents, invoiceBalances } from '../_engine/working-capital';
import { INVOICED_CHANNELS, PAYMENT_TERMS_LABELS } from '../_data/working-capital';
import { ReceivablesClient, type PendingRoute, type InvoiceRow } from './ReceivablesClient';
import { AdminOnlyNotice } from '../_components/AdminOnly';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

export const dynamic = 'force-dynamic';

const fromCents = (c: number) => c / 100;

/**
 * Receivables (Roadmap K1, K3): the monthly invoice per subscriber, built route
 * by route; payments applied; aging of issued invoices by days past due; days
 * to collect for the month. Every figure is computed from the distribution,
 * invoice and payment records.
 */
export default async function ReceivablesPage(props: Parameters<typeof ReceivablesPageInner>[0]) {
  return withWorkspace(() => ReceivablesPageInner(props));
}

async function ReceivablesPageInner({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice area="Receivables" />;
  const [access, selected, params] = await Promise.all([getFarmAccess(), postSelectedLedger(), searchParams]);
  const { inputs, bundle } = selected;
  const isPlan = selected.kind === 'plan';
  const now = new Date().toISOString().slice(0, 10);
  const period = pickMonth(selected, params.period, now);
  const month = selected.ledger.months.find((m) => m.label === period)!;
  // On Actual, balances and aging read today; on Plan, the end of the month picked.
  const today = isPlan ? month.to : now;
  const balances = invoiceBalances(bundle.invoices ?? [], bundle.distributions, bundle.subscriberPayments ?? []);
  const nameOf = new Map(inputs.subscribers.map((c) => [c.id, c.name]));

  const pendingMap = new Map<string, PendingRoute>();
  let noSubscriber = 0;
  for (const d of bundle.distributions) {
    if (!INVOICED_CHANNELS.includes(d.phase) || d.invoiceId) continue;
    if (!d.subscriberId) {
      noSubscriber++;
      continue;
    }
    const key = `${d.distributedOn}|${d.subscriberId}`;
    const row = pendingMap.get(key) ?? { date: d.distributedOn, subscriberId: d.subscriberId, subscriberName: nameOf.get(d.subscriberId) ?? 'Subscriber', distributions: 0, units: 0, amountCents: 0 };
    row.distributions++;
    row.units += d.units;
    row.amountCents += distributionRevenueCents(d);
    pendingMap.set(key, row);
  }
  const pending = [...pendingMap.values()].sort((a, b) => a.date.localeCompare(b.date) || a.subscriberName.localeCompare(b.subscriberName));

  const invoices: InvoiceRow[] = balances.map((b) => ({
    id: b.invoice.id,
    invoiceNumber: b.invoice.invoiceNumber,
    subscriberId: b.invoice.subscriberId,
    subscriberName: b.invoice.subscriberName,
    period: b.invoice.period,
    status: b.invoice.status,
    openedOn: b.invoice.openedOn,
    issuedOn: b.invoice.issuedOn,
    dueOn: b.invoice.dueOn,
    paymentTerms: b.invoice.paymentTerms,
    distributions: b.distributions.length,
    units: b.units,
    amountCents: b.amountCents,
    paidCents: b.paidCents,
    openCents: b.openCents,
    lastDistributedOn: b.lastDistributedOn,
  }));

  const issued = balances.filter((b) => b.invoice.status === 'issued');
  const aging = agingReport(
    issued.map((b) => ({ id: b.invoice.id, party: b.invoice.subscriberName, document: b.invoice.invoiceNumber, date: b.invoice.issuedOn ?? b.invoice.openedOn, dueOn: b.invoice.dueOn, amountCents: b.amountCents, openCents: b.openCents })),
    today,
  );
  const notIssuedCents = balances.filter((b) => b.invoice.status === 'open').reduce((t, b) => t + b.amountCents, 0);
  const pendingCents = pending.reduce((t, r) => t + r.amountCents, 0);
  const noTerms = inputs.subscribers.filter((c) => INVOICED_CHANNELS.includes(c.channel) && c.status !== 'inactive' && c.paymentTerms === null);
  const wc = periodWorkingCapital(selected.ledger.entries, period, month.balanceSheet.currentUnitOfLongTermDebtCents, false);
  const monthBilledCents = selected.ledger.periods.find((p) => p.period === period)?.receivables.billedCents ?? 0;

  return (
    <>
      <PageHeader
        title="Receivables"
        purpose="Invoice subscribers monthly, apply payments, and track what is owed."
        functions={['Receivables on the books', 'Open on issued invoices', 'Aging of issued invoices', 'Days to collect']}
        connects={[
          { href: '/farm/orders', dir: 'from' },
          { href: '/farm/subscribers', dir: 'from' },
          { href: '/farm/financials/balance-sheet', dir: 'to' },
          { href: '/farm/financials/cash-flow', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>Subscriptions and Restaurants are invoiced once a month.</li>
            <li>Each completed distribution route joins its subscriber&rsquo;s invoice for the month as it finishes.</li>
            <li>The invoice is issued with the subscriber&rsquo;s payment terms, which set its due date.</li>
            <li>Revenue is in receivables from the moment of distribution.</li>
            <li>Retail and wholesale orders are paid at the time of ordering and are never invoiced.</li>
          </ul>
        }
        status="live"
      />

      <PageControls><LedgerMonthBar selected={selected} period={period} basePath="/farm/receivables" /></PageControls>

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={money(fromCents(wc.receivableCents), 0)} label="Receivables on the books" sub={`at ${period} end, cumulative`} />
        <Kpi value={money(fromCents(aging.totalCents), 0)} label="Open on issued invoices" sub={`${money(fromCents(aging.totals.not_due), 0)} not yet due`} />
        <Kpi value={money(fromCents(notIssuedCents), 0)} label="On invoices not yet issued" sub={`${invoices.filter((i) => i.status === 'open').length} open invoice${invoices.filter((i) => i.status === 'open').length === 1 ? '' : 's'}`} />
        <Kpi value={money(fromCents(pendingCents), 0)} label="Distributed, route not completed" sub={`${pending.length} route${pending.length === 1 ? '' : 's'} by date and subscriber`} />
        <Kpi value={wc.daysToCollect === null ? '—' : `${wc.daysToCollect.toFixed(1)} days`} label={`Days to collect, ${period}`} sub="Receivables ÷ the month's billings × its calendar days" />
      </div>

      {(noTerms.length > 0 || noSubscriber > 0) && (
        <Card title="Records an invoice cannot be issued from" className="mt-4">
          <ul className="farm-kpi-sub pl-[1.1rem]! grid! gap-[0.3rem]!">
            {noTerms.map((c) => <li key={c.id}>{c.name}: no payment terms on file. Terms are set on <Link className="farm-link" href="/farm/subscribers">Subscribers</Link>.</li>)}
            {noSubscriber > 0 && <li>{noSubscriber} Subscriptions or Restaurants distribute{noSubscriber === 1 ? 'y was' : 'ies were'} recorded without a subscriber (not against an order), so no invoice can carry {noSubscriber === 1 ? 'it' : 'them'}.</li>}
          </ul>
        </Card>
      )}

      <ReceivablesClient
        today={today}
        canRecord={!isPlan && access.isOperator}
        canRemove={!isPlan && access.isSuperAdmin}
        pending={pending}
        invoices={invoices}
        subscribers={inputs.subscribers.filter((c) => INVOICED_CHANNELS.includes(c.channel)).map((c) => ({ id: c.id, name: c.name, paymentTerms: c.paymentTerms }))}
        payments={bundle.subscriberPayments ?? []}
      />

      <Card title={`Aging of issued invoices — as of ${today}`} className="mt-4">
        {aging.rows.length === 0 ? (
          <p className="farm-kpi-sub">No issued invoice has a balance open.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead>
                <tr><th>Subscriber</th>{AGING_BUCKETS.filter((b) => b !== 'no_terms').map((b) => <th key={b} className="num">{AGING_LABELS[b]}</th>)}<th className="num">Open</th></tr>
              </thead>
              <tbody>
                {aging.rows.map((r) => (
                  <tr key={r.party}><td>{r.party}</td>{AGING_BUCKETS.filter((b) => b !== 'no_terms').map((b) => <td key={b} className="num">{r.buckets[b] ? money(fromCents(r.buckets[b]), 2) : '—'}</td>)}<td className="num">{money(fromCents(r.totalCents), 2)}</td></tr>
                ))}
                <tr className="total"><td>All subscribers</td>{AGING_BUCKETS.filter((b) => b !== 'no_terms').map((b) => <td key={b} className="num">{money(fromCents(aging.totals[b]), 2)}</td>)}<td className="num">{money(fromCents(aging.totalCents), 2)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="farm-kpi-sub mt-2">
          Groups count calendar days past each invoice&apos;s due date. Subscriber terms on file: {inputs.subscribers.filter((c) => c.paymentTerms).map((c) => `${c.name} ${PAYMENT_TERMS_LABELS[c.paymentTerms!]}`).join(' · ') || 'none'}.
          {' '}Days to collect for {period} use the month&apos;s billings to receivables ({money(fromCents(monthBilledCents), 0)}) and the {num(daysInPeriod(period))} calendar days in it.
        </p>
      </Card>
    </>
  );
}
