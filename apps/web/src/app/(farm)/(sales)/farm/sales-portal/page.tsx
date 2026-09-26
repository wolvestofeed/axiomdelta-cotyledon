import Link from 'next/link';
import { PageHeader, Card, Kpi, num } from '@/app/(farm)/farm/_components/ui';
import { PROSPECT_STATUSES } from '@/app/(farm)/farm/_data/prospects';
import { pipelineStats, prospectRecords } from '@/app/(farm)/farm/_engine/prospects';
import { listSubscribers } from '@/app/(farm)/farm/_lib/subscribers';
import { listOrders } from '@/app/(farm)/farm/_lib/orders';
import { getResolvedActiveInputs } from '@/app/(farm)/farm/_lib/scenarios';
import { SUBSCRIBER_STATUS_LABELS } from '@/app/(farm)/farm/_data/subscribers';
import { getFarmAccess } from '@/app/(farm)/farm/_lib/access';
import { loadTimeClock } from '@/app/(farm)/farm/_lib/working-capital';
import { TimeClockCard } from '@/app/(farm)/farm/_components/TimeClockCard';
import { withWorkspace } from '@/app/(farm)/farm/_lib/workspace';

export const dynamic = 'force-dynamic';

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Sales Portal — the sales representative's dashboard and landing page. A basic page while the portal is developed: the prospect pipeline by
 * stage from the CRM, the subscribers on file by status and channel, and the orders
 * on file coming up. Its own shell, like the Grow Room; not gated beyond
 * sign-in while it is built.
 */
export default async function SalesPortalPage() {
  return withWorkspace(() => SalesPortalPageInner());
}

async function SalesPortalPageInner() {
  // Checked on the page as well as the shell: a layout gate alone is not enough (CLAUDE.md §10).
  if (!(await getFarmAccess()).isOperator) return null;
  const today = new Date().toISOString().slice(0, 10);
  const [subscribers, orders, { inputs }, access, clock] = await Promise.all([listSubscribers(), listOrders(), getResolvedActiveInputs(), getFarmAccess(), loadTimeClock()]);
  // The signed-in person's own clock only (their staff record, matched by sign-in email).
  const me = access.staffId ? clock.staff.filter((s) => s.id === access.staffId && s.status === 'active').map((s) => ({ ...s, employeeRef: null, notes: null })) : [];
  const holdsSales = me.some((s) => s.roles.includes('sales'));
  const myPunches = access.staffId ? clock.punches.filter((p) => p.staffId === access.staffId) : [];
  const pipe = pipelineStats(prospectRecords);
  const channelName = (c: number) => inputs.phases.find((p) => p.phase === c)?.market ?? `Channel ${c}`;
  const nameOf = new Map(subscribers.map((c) => [c.id, c.name]));
  const upcoming = orders
    .filter((o) => o.status !== 'forecast' && o.orderDate >= today && o.orderDate <= addDays(today, 14))
    .sort((a, b) => a.orderDate.localeCompare(b.orderDate));
  const byStatus = Object.entries(SUBSCRIBER_STATUS_LABELS).map(([k, label]) => ({ label, n: subscribers.filter((c) => c.status === k).length }));

  return (
    <>
      <PageHeader
        title="Sales Portal"
        purpose="Check the prospect pipeline, subscribers on file and upcoming orders."
        status="partial"
      />

      {me.length > 0 && holdsSales ? (
        <div className="mb-4"><TimeClockCard staff={me} punches={myPunches} title="Your time clock — sales" role="sales" /></div>
      ) : me.length > 0 ? (
        <Card title="Your time clock" className="mb-4"><p className="farm-kpi-sub">You do not hold the sales work role on the staff register, so hours cannot be clocked here. An admin adds it on HR.</p></Card>
      ) : (
        <Card title="Your time clock" className="mb-4"><p className="farm-kpi-sub">Your sign-in{access.email ? ` (${access.email})` : ''} is not the email of an active person on the staff register, so there is no clock to punch. An admin adds the email on the register.</p></Card>
      )}

      <div className="grid gap-3 farm-autofit-10">
        <Kpi value={num(pipe.total)} label="Prospect prospects" sub="In the CRM directory" />
        {PROSPECT_STATUSES.map((s) => (
          <Kpi key={s} value={num(pipe.byStatus[s] ?? 0)} label={s} />
        ))}
      </div>

      <div className="grid gap-4 mt-4 farm-autofit-20">
        <Card title="Subscribers on file">
          <table className="farm-table">
            <tbody>
              {byStatus.map((r) => (
                <tr key={r.label}><td>{r.label}</td><td className="num">{num(r.n)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="farm-kpi-sub mt-2">By channel: {inputs.phases.map((p) => `${p.market} ${num(subscribers.filter((c) => c.channel === p.phase && c.status !== 'inactive').length)}`).join(' · ')}. Managed on <Link className="farm-link" href="/farm/subscribers">Subscribers</Link>.</p>
        </Card>

        <Card title="Where to go">
          <ul className="farm-kpi-sub pl-[1.1rem]! grid! gap-[0.35rem]!">
            <li><Link className="farm-link" href="/farm/sales">CRM</Link> — the prospect directory, needs, communications, quotes of service and scope of work.</li>
            <li><Link className="farm-link" href="/farm/subscribers">Subscribers</Link> — subscriber records, pickup points, services and flat plans.</li>
            <li><Link className="farm-link" href="/farm/orders">Orders</Link> — the order book: forecast, confirmed and distributed orders.</li>
            <li><Link className="farm-link" href="/farm/subscriber-portal/flat-builder">Flat Builder</Link> — the client-facing order form on the Subscriber Portal.</li>
          </ul>
        </Card>
      </div>

      <Card title={`Orders on file, the next two weeks — ${today} to ${addDays(today, 14)}`} className="mt-4">
        {upcoming.length === 0 ? (
          <p className="farm-kpi-sub">No confirmed or distributed order is on file in the next two weeks.</p>
        ) : (
          <div className="farm-scroll-x">
            <table className="farm-table">
              <thead><tr><th>Date</th><th>Subscriber</th><th>Channel</th><th>Crop plan</th><th className="num">Units</th><th>Status</th></tr></thead>
              <tbody>
                {upcoming.map((o) => (
                  <tr key={o.id}>
                    <td>{o.orderDate}</td>
                    <td>{nameOf.get(o.subscriberId) ?? '—'}</td>
                    <td>{channelName(o.channel)}</td>
                    <td>{o.cropPlanCode}</td>
                    <td className="num">{num(o.units)}</td>
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
