import { PageHeader, Card, Kpi, money } from '@/components/ui';
import { getFarmAccess } from '@/server/access';
import { listPurchaseOrders } from '@/server/supplier-catalog';
import { postSelectedLedger } from '@/server/ledgers';
import { periodWorkingCapital } from '@/engine/actuals-ledger';
import { LedgerMonthBar, pickMonth } from '@/components/ledger/LedgerMonthBar';
import { PageControls } from '@/components/PageControls';
import { periodStart } from '@/engine/actuals';
import { AGING_BUCKETS, AGING_LABELS, agingReport, billBalances, dueOn, unbilledReceipts, type OpenItem } from '@/engine/working-capital';
import { BILL_CATEGORY_LABELS } from '@/engine/actuals';
import { PayablesClient, type BillRow } from '@/app/(farm)/farm/payables/PayablesClient';
import { AdminOnlyNotice } from '@/components/AdminOnly';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

const fromCents = (c: number) => c / 100;

/**
 * Payables (Roadmap K2, K3): supplier bills recorded against the receipts
 * they cover, with the three-way match of purchase order, receipt and bill; a
 * mismatched bill is flagged and not paid until rectified. Aging by days past
 * due, days to pay for the month. Every figure is computed from the records.
 */
export default async function PayablesPage(props: Parameters<typeof PayablesPageInner>[0]) {
  return withWorkspace(() => PayablesPageInner(props));
}

async function PayablesPageInner({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  if (!(await getFarmAccess()).isSuperAdmin) return <AdminOnlyNotice area="Payables" />;
  const [access, selected, pos, params] = await Promise.all([getFarmAccess(), postSelectedLedger(), listPurchaseOrders(), searchParams]);
  const { inputs, bundle } = selected;
  const isPlan = selected.kind === 'plan';
  const now = new Date().toISOString().slice(0, 10);
  const period = pickMonth(selected, params.period, now);
  const month = selected.ledger.months.find((m) => m.label === period)!;
  // On Actual, balances and aging read today; on Plan, the end of the month picked.
  const today = isPlan ? month.to : now;
  const purchaseOrders = selected.kind === 'plan'
    ? selected.timeline.documents.purchaseOrders.map((p) => ({ id: p.id, poNumber: p.id, lines: p.lines.map((l) => ({ input: l.input, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })) }))
    : pos.map((p) => ({ id: p.id, poNumber: p.poNumber, lines: p.lines.map((l) => ({ input: l.input, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })) }));
  const bills = bundle.supplierBills ?? [];
  const balances = billBalances(bills, bundle.receipts, purchaseOrders, bundle.supplierPayments ?? []);
  const unbilled = unbilledReceipts(bundle.receipts, bills);

  const rows: BillRow[] = balances.map((b) => ({
    bill: b.bill,
    status: b.match.status,
    issues: b.match.issues,
    receivedCents: b.match.receivedCents,
    differenceCents: b.match.differenceCents,
    dueOn: b.dueOn,
    amountCents: b.amountCents,
    paidCents: b.paidCents,
    openCents: b.openCents,
  }));

  const periodBillItems: OpenItem[] = bundle.bills
    .filter((b) => !b.paidOn)
    .map((b) => {
      const date = b.incurredOn ?? periodStart(b.period);
      return { id: b.id, party: b.vendor ?? BILL_CATEGORY_LABELS[b.category], document: b.invoiceNumber ?? b.category, date, dueOn: dueOn(date, b.paymentTerms ?? null), amountCents: b.amountCents, openCents: b.amountCents };
    });
  const aging = agingReport([...balances.map((b) => ({ id: b.bill.id, party: b.bill.supplierName, document: b.bill.billNumber, date: b.bill.billDate, dueOn: b.dueOn, amountCents: b.amountCents, openCents: b.openCents })), ...periodBillItems], today);
  const mismatched = rows.filter((r) => r.status === 'mismatched');
  const wc = periodWorkingCapital(selected.ledger.entries, period, month.balanceSheet.currentUnitOfLongTermDebtCents, false);

  return (
    <>
      <PageHeader
        title="Payables"
        purpose="Match supplier bills to receipts, pay what matches, and track what is owed."
        functions={['Trade payables', 'Open on bills', 'Bills flagged', 'Receipts with no bill', 'Aging of open bills']}
        connects={[
          { href: '/farm/grow-room', dir: 'from' },
          { href: '/farm/procurement', dir: 'from' },
          { href: '/farm/financials/balance-sheet', dir: 'to' },
          { href: '/farm/financials/cash-flow', dir: 'to' },
        ]}
        howItWorks={
          <ul>
            <li>A receipt waits as goods received, not invoiced, until the supplier&rsquo;s bill is recorded against it.</li>
            <li>A bill must equal its receipts, input by input, in quantity and value.</li>
            <li>Anything received short, over or at a changed price carries its override reason on the receipt.</li>
            <li>A bill that does not match is flagged and is not paid until it is rectified.</li>
            <li>Each bill takes its supplier&rsquo;s payment terms, which set its due date.</li>
          </ul>
        }
        status="live"
      />

      <PageControls><LedgerMonthBar selected={selected} period={period} basePath="/farm/payables" /></PageControls>

      <div className="grid gap-3 farm-autofit-11">
        <Kpi value={money(fromCents(wc.payableCents), 0)} label="Trade payables on the books" sub={`${money(fromCents(wc.goodsReceivedNotInvoicedCents), 0)} received, not invoiced`} />
        <Kpi value={money(fromCents(aging.totalCents), 0)} label="Open on bills" sub={`${money(fromCents(aging.totals.not_due), 0)} not yet due`} />
        <Kpi value={String(mismatched.length)} label="Bills flagged — not matched" sub={mismatched.length ? `${money(fromCents(mismatched.reduce((t, r) => t + r.openCents, 0)), 0)} held from payment` : 'Every bill matches'} />
        <Kpi value={String(unbilled.length)} label="Receipts with no bill" sub="Goods received, not invoiced" />
        <Kpi value={wc.daysToPay === null ? '—' : `${wc.daysToPay.toFixed(1)} days`} label={`Days to pay, ${period}`} sub="Trade payables ÷ the month's trade purchases × its calendar days" />
      </div>

      <PayablesClient
        today={today}
        canRecord={!isPlan && access.isOperator}
        canRemove={!isPlan && access.isSuperAdmin}
        receipts={bundle.receipts}
        unbilledReceiptIds={unbilled.map((r) => r.id)}
        purchaseOrders={purchaseOrders}
        bills={rows}
        payments={bundle.supplierPayments ?? []}
        supplierTerms={inputs.supplierTerms}
      />

      <Card title={`Aging of open bills — as of ${today}`} className="mt-4">
        {aging.rows.length === 0 ? (
          <p className="farm-kpi-sub">No bill has a balance open.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead><tr><th>Supplier or vendor</th>{AGING_BUCKETS.map((b) => <th key={b} className="num">{AGING_LABELS[b]}</th>)}<th className="num">Open</th></tr></thead>
              <tbody>
                {aging.rows.map((r) => (
                  <tr key={r.party}><td>{r.party}</td>{AGING_BUCKETS.map((b) => <td key={b} className="num">{r.buckets[b] ? money(fromCents(r.buckets[b]), 2) : '—'}</td>)}<td className="num">{money(fromCents(r.totalCents), 2)}</td></tr>
                ))}
                <tr className="total"><td>All</td>{AGING_BUCKETS.map((b) => <td key={b} className="num">{money(fromCents(aging.totals[b]), 2)}</td>)}<td className="num">{money(fromCents(aging.totalCents), 2)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="farm-kpi-sub mt-2">
          Supplier bills and unpaid period bills (lease, utilities, admin), in calendar days past each due date. A period bill recorded before terms were on bills has no due date and is counted as having no terms on file.
        </p>
      </Card>
    </>
  );
}
