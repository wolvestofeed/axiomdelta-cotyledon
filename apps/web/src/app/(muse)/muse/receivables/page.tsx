import Link from 'next/link';
import { PageHeader, Card, Kpi, money, num } from '../_components/ui';
import { getMuseAccess } from '../_lib/access';
import { postSelectedLedger } from '../_lib/ledgers';
import { periodWorkingCapital } from '../_engine/actuals-ledger';
import { LedgerMonthBar, pickMonth } from '../_components/ledger/LedgerMonthBar';
import { PageControls } from '../_components/PageControls';
import { AGING_BUCKETS, AGING_LABELS, agingReport, daysInPeriod, deliveryRevenueCents, invoiceBalances } from '../_engine/working-capital';
import { INVOICED_CHANNELS, PAYMENT_TERMS_LABELS } from '../_data/working-capital';
import { ReceivablesClient, type PendingRoute, type InvoiceRow } from './ReceivablesClient';
import { AdminOnlyNotice } from '../_components/AdminOnly';

export const dynamic = 'force-dynamic';

const fromCents = (c: number) => c / 100;

/**
 * Receivables (Roadmap K1, K3): the monthly invoice per customer, built route
 * by route; payments applied; aging of issued invoices by days past due; days
 * to collect for the month. Every figure is computed from the delivery,
 * invoice and payment records.
 */
export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  if (!(await getMuseAccess()).isSuperAdmin) return <AdminOnlyNotice area="Receivables" />;
  const [access, selected, params] = await Promise.all([getMuseAccess(), postSelectedLedger(), searchParams]);
  const { inputs, bundle } = selected;
  const isPlan = selected.kind === 'plan';
  const now = new Date().toISOString().slice(0, 10);
  const period = pickMonth(selected, params.period, now);
  const month = selected.ledger.months.find((m) => m.label === period)!;
  // On Actual, balances and aging read today; on Plan, the end of the month picked.
  const today = isPlan ? month.to : now;
  const balances = invoiceBalances(bundle.invoices ?? [], bundle.deliveries, bundle.customerPayments ?? []);
  const nameOf = new Map(inputs.customers.map((c) => [c.id, c.name]));

  const pendingMap = new Map<string, PendingRoute>();
  let noCustomer = 0;
  for (const d of bundle.deliveries) {
    if (!INVOICED_CHANNELS.includes(d.phase) || d.invoiceId) continue;
    if (!d.customerId) {
      noCustomer++;
      continue;
    }
    const key = `${d.deliveredOn}|${d.customerId}`;
    const row = pendingMap.get(key) ?? { date: d.deliveredOn, customerId: d.customerId, customerName: nameOf.get(d.customerId) ?? 'Customer', deliveries: 0, meals: 0, amountCents: 0 };
    row.deliveries++;
    row.meals += d.meals;
    row.amountCents += deliveryRevenueCents(d);
    pendingMap.set(key, row);
  }
  const pending = [...pendingMap.values()].sort((a, b) => a.date.localeCompare(b.date) || a.customerName.localeCompare(b.customerName));

  const invoices: InvoiceRow[] = balances.map((b) => ({
    id: b.invoice.id,
    invoiceNumber: b.invoice.invoiceNumber,
    customerId: b.invoice.customerId,
    customerName: b.invoice.customerName,
    period: b.invoice.period,
    status: b.invoice.status,
    openedOn: b.invoice.openedOn,
    issuedOn: b.invoice.issuedOn,
    dueOn: b.invoice.dueOn,
    paymentTerms: b.invoice.paymentTerms,
    deliveries: b.deliveries.length,
    meals: b.meals,
    amountCents: b.amountCents,
    paidCents: b.paidCents,
    openCents: b.openCents,
    lastDeliveredOn: b.lastDeliveredOn,
  }));

  const issued = balances.filter((b) => b.invoice.status === 'issued');
  const aging = agingReport(
    issued.map((b) => ({ id: b.invoice.id, party: b.invoice.customerName, document: b.invoice.invoiceNumber, date: b.invoice.issuedOn ?? b.invoice.openedOn, dueOn: b.invoice.dueOn, amountCents: b.amountCents, openCents: b.openCents })),
    today,
  );
  const notIssuedCents = balances.filter((b) => b.invoice.status === 'open').reduce((t, b) => t + b.amountCents, 0);
  const pendingCents = pending.reduce((t, r) => t + r.amountCents, 0);
  const noTerms = inputs.customers.filter((c) => INVOICED_CHANNELS.includes(c.channel) && c.status !== 'inactive' && c.paymentTerms === null);
  const wc = periodWorkingCapital(selected.ledger.entries, period, month.balanceSheet.currentPortionOfLongTermDebtCents, false);
  const monthBilledCents = selected.ledger.periods.find((p) => p.period === period)?.receivables.billedCents ?? 0;

  return (
    <>
      <PageHeader
        title="Receivables"
        purpose="Invoice customers monthly, apply payments, and track what is owed."
        functions={['Receivables on the books', 'Open on issued invoices', 'Aging of issued invoices', 'Days to collect']}
        connects={[
          { href: '/muse/orders', dir: 'from' },
          { href: '/muse/customers', dir: 'from' },
          { href: '/muse/financials/balance-sheet', dir: 'to' },
          { href: '/muse/financials/cash-flow', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>School lunches and Corporate catering are invoiced once a month.</li>
            <li>Each completed delivery route joins its customer&rsquo;s invoice for the month as it finishes.</li>
            <li>The invoice is issued with the customer&rsquo;s payment terms, which set its due date.</li>
            <li>Revenue is in receivables from the moment of delivery.</li>
            <li>Ghost kitchen orders are paid at the time of ordering and are never invoiced.</li>
          </ul>
        }
        status="live"
      />

      <PageControls><LedgerMonthBar selected={selected} period={period} basePath="/muse/receivables" /></PageControls>

      <div className="grid gap-3 muse-autofit-11">
        <Kpi value={money(fromCents(wc.receivableCents), 0)} label="Receivables on the books" sub={`at ${period} end, cumulative`} />
        <Kpi value={money(fromCents(aging.totalCents), 0)} label="Open on issued invoices" sub={`${money(fromCents(aging.totals.not_due), 0)} not yet due`} />
        <Kpi value={money(fromCents(notIssuedCents), 0)} label="On invoices not yet issued" sub={`${invoices.filter((i) => i.status === 'open').length} open invoice${invoices.filter((i) => i.status === 'open').length === 1 ? '' : 's'}`} />
        <Kpi value={money(fromCents(pendingCents), 0)} label="Delivered, route not completed" sub={`${pending.length} route${pending.length === 1 ? '' : 's'} by date and customer`} />
        <Kpi value={wc.daysToCollect === null ? '—' : `${wc.daysToCollect.toFixed(1)} days`} label={`Days to collect, ${period}`} sub="Receivables ÷ the month's billings × its calendar days" />
      </div>

      {(noTerms.length > 0 || noCustomer > 0) && (
        <Card title="Records an invoice cannot be issued from" className="mt-4">
          <ul className="muse-kpi-sub pl-[1.1rem]! grid! gap-[0.3rem]!">
            {noTerms.map((c) => <li key={c.id}>{c.name}: no payment terms on file. Terms are set on <Link className="muse-link" href="/muse/customers">Customers</Link>.</li>)}
            {noCustomer > 0 && <li>{noCustomer} School lunches or Corporate catering deliver{noCustomer === 1 ? 'y was' : 'ies were'} recorded without a customer (not against an order), so no invoice can carry {noCustomer === 1 ? 'it' : 'them'}.</li>}
          </ul>
        </Card>
      )}

      <ReceivablesClient
        today={today}
        canRecord={!isPlan && access.isOperator}
        canRemove={!isPlan && access.isSuperAdmin}
        pending={pending}
        invoices={invoices}
        customers={inputs.customers.filter((c) => INVOICED_CHANNELS.includes(c.channel)).map((c) => ({ id: c.id, name: c.name, paymentTerms: c.paymentTerms }))}
        payments={bundle.customerPayments ?? []}
      />

      <Card title={`Aging of issued invoices — as of ${today}`} className="mt-4">
        {aging.rows.length === 0 ? (
          <p className="muse-kpi-sub">No issued invoice has a balance open.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead>
                <tr><th>Customer</th>{AGING_BUCKETS.filter((b) => b !== 'no_terms').map((b) => <th key={b} className="num">{AGING_LABELS[b]}</th>)}<th className="num">Open</th></tr>
              </thead>
              <tbody>
                {aging.rows.map((r) => (
                  <tr key={r.party}><td>{r.party}</td>{AGING_BUCKETS.filter((b) => b !== 'no_terms').map((b) => <td key={b} className="num">{r.buckets[b] ? money(fromCents(r.buckets[b]), 2) : '—'}</td>)}<td className="num">{money(fromCents(r.totalCents), 2)}</td></tr>
                ))}
                <tr className="total"><td>All customers</td>{AGING_BUCKETS.filter((b) => b !== 'no_terms').map((b) => <td key={b} className="num">{money(fromCents(aging.totals[b]), 2)}</td>)}<td className="num">{money(fromCents(aging.totalCents), 2)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="muse-kpi-sub mt-2">
          Groups count calendar days past each invoice&apos;s due date. Customer terms on file: {inputs.customers.filter((c) => c.paymentTerms).map((c) => `${c.name} ${PAYMENT_TERMS_LABELS[c.paymentTerms!]}`).join(' · ') || 'none'}.
          {' '}Days to collect for {period} use the month&apos;s billings to receivables ({money(fromCents(monthBilledCents), 0)}) and the {num(daysInPeriod(period))} calendar days in it.
        </p>
      </Card>
    </>
  );
}
