import { PortalPending } from '@/components/PortalPending';
import { ClientPicker } from '@/components/ClientPicker';
import { getFarmAccess } from '@/server/access';
import { canUsePortal } from '@/server/client-portal';
import { PageHeader, Card, num } from '@/components/ui';
import { portalClients } from '@/server/client-portal';
import { getResolvedActiveInputs } from '@/server/scenarios';
import { loadCalendar } from '@/server/periods';
import { CADENCE_LABELS } from '@/data/subscriptions';
import { flatPlanOn, subscriptionDistributions } from '@/engine/subscriptions';
import { isoAddDays } from '@/engine/orders';
import { withWorkspace } from '@/server/workspace';
import { flatPlanRequestsFor } from '@/server/flat-plan-requests';
import { SubscriptionControl } from '@/components/SubscriptionControl';
import { FlatPlanRequestForm } from '@/components/FlatPlanRequestForm';

export const dynamic = 'force-dynamic';

const PATH = '/farm/client-portal/subscriptions';
/** Distributions shown ahead: twelve weeks covers a monthly subscription's next three. */
const WINDOW_DAYS = 84;
const AHEAD_MAX = 6;

/**
 * Subscriptions — the client's standing orders: each one's cadence, pickup point, the flat plan in
 * force today and the distributions ahead, read from the record. A linked client skips or unskips a
 * distribution and pauses or resumes a subscription here, inside the sow-date rules (Roadmap P5), and
 * asks for a flat plan change, which the farm approves or declines (Roadmap P6).
 */
export default async function SubscriptionsPage(props: Parameters<typeof SubscriptionsPageInner>[0]) {
  return withWorkspace(() => SubscriptionsPageInner(props));
}

async function SubscriptionsPageInner({ searchParams }: { searchParams: Promise<{ subscriber?: string }> }) {
  // Checked on the page as well as `(member)/layout`: a layout gate alone is not enough (CLAUDE.md §10).
  const a = await getFarmAccess();
  if (!canUsePortal(a)) return <PortalPending portal="Client Portal" email={a.email} />;
  const params = await searchParams;
  const [{ clients, subscriber }, { inputs }, calendar] = await Promise.all([portalClients(params.subscriber, a), getResolvedActiveInputs(), loadCalendar()]);
  const requests = subscriber ? await flatPlanRequestsFor(subscriber.id) : [];
  // The client acts on their own record; a super admin may act here too, previewing. Operators read only.
  const canAct = a.subscriberId !== null || a.isSuperAdmin;
  const offered = subscriber ? inputs.growPlans.filter((r) => r.status === 'in_service' && (r.channels ?? []).includes(subscriber.channel)).map((r) => ({ code: r.code, name: r.name })) : [];
  const today = new Date().toISOString().slice(0, 10);
  const planName = (code: string) => inputs.growPlans.find((r) => r.code === code)?.name ?? code;
  const subs = subscriber?.subscriptions ?? [];

  return (
    <>
      <PageHeader
        title="Subscriptions"
        purpose="See each standing order you hold: its cadence, its pickup point, the flats it carries and the distributions ahead."
        functions={['Your subscriptions', 'Flat plan in force', 'Distributions ahead']}
        status="partial"
      />
      <ClientPicker clients={clients} subscriber={subscriber} path={PATH} />

      {subscriber && subs.length === 0 && (
        <Card title="Your subscriptions" className="mt-4">
          <p className="farm-kpi-sub">No subscription is on file for {subscriber.name}.</p>
        </Card>
      )}

      {subscriber && subs.map((sub) => {
        const pickup = subscriber.pickupPoints.find((p) => p.id === sub.subscriberPickupPointId);
        const lines = flatPlanOn(sub, today);
        const ended = sub.endDate !== null && sub.endDate < today;
        const state = ended ? `Ended ${sub.endDate}` : sub.pausedFrom !== null && sub.pausedFrom <= today ? `Paused from ${sub.pausedFrom}` : sub.pausedFrom !== null ? `Pauses from ${sub.pausedFrom}` : 'Running';
        const ahead = ended ? [] : subscriptionDistributions(sub, today, isoAddDays(today, WINDOW_DAYS), calendar.closures).slice(0, AHEAD_MAX);
        return (
          <Card key={sub.id} title={`${CADENCE_LABELS[sub.cadence]} · ${pickup?.name ?? 'pickup point not on file'}`} className="mt-4">
            <p className="farm-kpi-sub flex! flex-wrap! gap-2! items-center!">
              <span>{state} · from {sub.startDate}{sub.endDate ? ` to ${sub.endDate}` : ''}{sub.skips.length > 0 ? ` · ${num(sub.skips.length)} skipped` : ''}</span>
              {canAct && !ended && (sub.pausedFrom !== null ? <SubscriptionControl kind="resume" id={sub.id} /> : <SubscriptionControl kind="pause" id={sub.id} />)}
            </p>
            <div className="grid gap-4 mt-3 farm-autofit-20">
              <div>
                <div className="farm-card-title">Flat plan in force</div>
                {lines.length === 0 ? (
                  <p className="farm-kpi-sub">No flat plan is in force today.</p>
                ) : (
                  <table className="farm-table">
                    <thead><tr><th>Grow plan</th><th className="num">Units</th></tr></thead>
                    <tbody>
                      {lines.map((l) => <tr key={l.growPlanCode}><td>{planName(l.growPlanCode)}</td><td className="num">{num(l.units)}</td></tr>)}
                    </tbody>
                  </table>
                )}
                {canAct && !ended && (
                  <div className="mt-2">
                    <FlatPlanRequestForm subscriptionId={sub.id} current={lines} offered={offered} pendingRequestId={requests.find((q) => q.subscriptionId === sub.id && q.status === 'pending')?.id ?? null} />
                  </div>
                )}
                {requests.filter((q) => q.subscriptionId === sub.id && q.status !== 'pending').slice(0, 3).map((q) => (
                  <p key={q.id} className="farm-kpi-sub mt-2">
                    {q.requestedAt.slice(0, 10)}: asked for {q.lines.map((l) => `${num(l.units)} × ${planName(l.growPlanCode)}`).join(', ')} —{' '}
                    {q.status === 'approved' ? `approved, from ${q.effectiveFrom ?? 'the next distribution'}` : q.status === 'declined' ? `declined${q.decisionNote ? `: ${q.decisionNote}` : ''}` : 'withdrawn'}
                  </p>
                ))}
              </div>
              <div>
                <div className="farm-card-title">Distributions ahead</div>
                {ahead.length === 0 ? (
                  <p className="farm-kpi-sub">None in the next {WINDOW_DAYS / 7} weeks.</p>
                ) : (
                  <table className="farm-table">
                    <thead><tr><th>Date</th><th>Carries</th><th>Status</th>{canAct && <th></th>}</tr></thead>
                    <tbody>
                      {ahead.map((d) => (
                        <tr key={d.date}>
                          <td>{d.date}</td>
                          <td>{d.lines.length === 0 ? '—' : d.lines.map((l) => `${num(l.units)} × ${planName(l.growPlanCode)}`).join(', ')}</td>
                          <td>{d.skipped ? 'Skipped' : d.paused ? 'Paused' : d.closed ? 'Farm closed' : d.carried ? 'On' : 'Nothing to carry'}</td>
                          {canAct && <td>{d.paused || d.closed ? null : d.skipped ? <SubscriptionControl kind="unskip" id={sub.id} date={d.date} /> : <SubscriptionControl kind="skip" id={sub.id} date={d.date} />}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      {subscriber && (
        <p className="farm-kpi-sub mt-4">
          A distribution is skipped only before its sow date, and a pause or a change of flat plan starts at the first distribution not yet sown.
          {canAct ? ' Skips and pauses take effect at once; a flat plan change is a request the farm reviews.' : ' Skips, pauses and flat plan changes are made by the client in this portal, or with the farm.'}
        </p>
      )}
    </>
  );
}
