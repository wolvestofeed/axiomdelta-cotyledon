import Link from 'next/link';
import { PageHeader, Card, Kpi, num } from '@/app/(muse)/muse/_components/ui';
import { SCHOOL_STATUSES } from '@/app/(muse)/muse/_data/schools';
import { pipelineStats, schoolRecords } from '@/app/(muse)/muse/_engine/schools';
import { listCustomers } from '@/app/(muse)/muse/_lib/customers';
import { listOrders } from '@/app/(muse)/muse/_lib/orders';
import { getResolvedActiveInputs } from '@/app/(muse)/muse/_lib/scenarios';
import { CUSTOMER_STATUS_LABELS } from '@/app/(muse)/muse/_data/customers';
import { getMuseAccess } from '@/app/(muse)/muse/_lib/access';
import { loadTimeClock } from '@/app/(muse)/muse/_lib/working-capital';
import { TimeClockCard } from '@/app/(muse)/muse/_components/TimeClockCard';

export const dynamic = 'force-dynamic';

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Sales Portal — the sales representative's dashboard and landing page (Robert,
 * 2026-09-16). A basic page while the portal is developed: the school pipeline by
 * stage from the CRM, the customers on file by status and channel, and the orders
 * on file coming up. Its own shell, like the Floor (Robert, 2026-09-16); not gated beyond
 * sign-in while it is built.
 */
export default async function SalesPortalPage() {
  // Checked on the page as well as the shell: a layout gate alone is not enough (CLAUDE.md §10).
  if (!(await getMuseAccess()).isOperator) return null;
  const today = new Date().toISOString().slice(0, 10);
  const [customers, orders, { inputs }, access, clock] = await Promise.all([listCustomers(), listOrders(), getResolvedActiveInputs(), getMuseAccess(), loadTimeClock()]);
  // The signed-in person's own clock only (their staff record, matched by sign-in email).
  const me = access.staffId ? clock.staff.filter((s) => s.id === access.staffId && s.status === 'active').map((s) => ({ ...s, employeeRef: null, notes: null })) : [];
  const holdsSales = me.some((s) => s.roles.includes('sales'));
  const myPunches = access.staffId ? clock.punches.filter((p) => p.staffId === access.staffId) : [];
  const pipe = pipelineStats(schoolRecords);
  const channelName = (c: number) => inputs.phases.find((p) => p.phase === c)?.market ?? `Channel ${c}`;
  const nameOf = new Map(customers.map((c) => [c.id, c.name]));
  const upcoming = orders
    .filter((o) => o.status !== 'forecast' && o.orderDate >= today && o.orderDate <= addDays(today, 14))
    .sort((a, b) => a.orderDate.localeCompare(b.orderDate));
  const byStatus = Object.entries(CUSTOMER_STATUS_LABELS).map(([k, label]) => ({ label, n: customers.filter((c) => c.status === k).length }));

  return (
    <>
      <PageHeader
        title="Sales Portal"
        purpose="Check the school pipeline, customers on file and upcoming orders."
        status="partial"
      />

      {me.length > 0 && holdsSales ? (
        <div className="mb-4"><TimeClockCard staff={me} punches={myPunches} title="Your time clock — sales" role="sales" /></div>
      ) : me.length > 0 ? (
        <Card title="Your time clock" className="mb-4"><p className="muse-kpi-sub">You do not hold the sales work role on the staff register, so hours cannot be clocked here. An admin adds it on HR.</p></Card>
      ) : (
        <Card title="Your time clock" className="mb-4"><p className="muse-kpi-sub">Your sign-in{access.email ? ` (${access.email})` : ''} is not the email of an active person on the staff register, so there is no clock to punch. An admin adds the email on the register.</p></Card>
      )}

      <div className="grid gap-3 muse-autofit-10">
        <Kpi value={num(pipe.total)} label="School prospects" sub="In the CRM directory" />
        {SCHOOL_STATUSES.map((s) => (
          <Kpi key={s} value={num(pipe.byStatus[s] ?? 0)} label={s} />
        ))}
      </div>

      <div className="grid gap-4 mt-4 muse-autofit-20">
        <Card title="Customers on file">
          <table className="muse-table">
            <tbody>
              {byStatus.map((r) => (
                <tr key={r.label}><td>{r.label}</td><td className="num">{num(r.n)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="muse-kpi-sub mt-2">By channel: {inputs.phases.map((p) => `${p.market} ${num(customers.filter((c) => c.channel === p.phase && c.status !== 'inactive').length)}`).join(' · ')}. Managed on <Link className="muse-link" href="/muse/customers">Customers</Link>.</p>
        </Card>

        <Card title="Where to go">
          <ul className="muse-kpi-sub pl-[1.1rem]! grid! gap-[0.35rem]!">
            <li><Link className="muse-link" href="/muse/sales">CRM</Link> — the school directory, needs, communications, quotes of service and scope of work.</li>
            <li><Link className="muse-link" href="/muse/customers">Customers</Link> — customer records, sites, services and meal plans.</li>
            <li><Link className="muse-link" href="/muse/orders">Orders</Link> — the order book: forecast, confirmed and delivered orders.</li>
            <li><Link className="muse-link" href="/muse/customer-portal/order-builder">Order Builder</Link> — the client-facing order form on the Customer Portal.</li>
          </ul>
        </Card>
      </div>

      <Card title={`Orders on file, the next two weeks — ${today} to ${addDays(today, 14)}`} className="mt-4">
        {upcoming.length === 0 ? (
          <p className="muse-kpi-sub">No confirmed or delivered order is on file in the next two weeks.</p>
        ) : (
          <div className="muse-scroll-x">
            <table className="muse-table">
              <thead><tr><th>Date</th><th>Customer</th><th>Channel</th><th>Recipe</th><th className="num">Meals</th><th>Status</th></tr></thead>
              <tbody>
                {upcoming.map((o) => (
                  <tr key={o.id}>
                    <td>{o.orderDate}</td>
                    <td>{nameOf.get(o.customerId) ?? '—'}</td>
                    <td>{channelName(o.channel)}</td>
                    <td>{o.recipeCode}</td>
                    <td className="num">{num(o.meals)}</td>
                    <td className="capitalize!">{o.status}</td>
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
