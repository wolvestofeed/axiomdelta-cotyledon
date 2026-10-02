import { PortalPending } from '@/components/PortalPending';
import { ClientPicker } from '@/components/ClientPicker';
import { getFarmAccess } from '@/server/access';
import { canUsePortal } from '@/server/client-portal';
import { PageHeader, Card, money } from '@/components/ui';
import { portalClients } from '@/server/client-portal';
import { getResolvedActiveInputs } from '@/server/scenarios';
import { SUBSCRIBER_STATUS_LABELS } from '@/data/subscribers';
import { NUTRITION_TARGETS } from '@/data/nutrition-targets';
import { VARIETIES } from '@/data/varieties';
import { PAYMENT_TERMS_LABELS } from '@/data/working-capital';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

const PATH = '/farm/client-portal/profile';

/**
 * Profile — what the farm holds about the client: the record, the pickup points and the nutrition
 * targets their flats are composed against, and nothing else about their health (CLAUDE.md §2).
 * A goal, a named set of targets, is not part of the record; what one is, is agreed with Rob first
 * (Phase 3).
 */
export default async function ProfilePage(props: Parameters<typeof ProfilePageInner>[0]) {
  return withWorkspace(() => ProfilePageInner(props));
}

async function ProfilePageInner({ searchParams }: { searchParams: Promise<{ subscriber?: string }> }) {
  // Checked on the page as well as `(member)/layout`: a layout gate alone is not enough (CLAUDE.md §10).
  const a = await getFarmAccess();
  if (!canUsePortal(a)) return <PortalPending portal="Client Portal" email={a.email} />;
  const params = await searchParams;
  const [{ clients, subscriber }, { inputs }] = await Promise.all([portalClients(params.subscriber, a), getResolvedActiveInputs()]);
  const channel = subscriber ? inputs.phases.find((p) => p.phase === subscriber.channel) : null;
  const varietyName = (key: string) => VARIETIES.find((v) => v.key === key)?.name ?? key;
  const targets = (subscriber?.nutritionTargets ?? []).map((key) => NUTRITION_TARGETS.find((t) => t.key === key) ?? { key, name: key, kind: 'nutrient' as const, varieties: [] });

  return (
    <>
      <PageHeader
        title="Profile"
        purpose="Check what the farm holds about you: your record, your pickup points and the nutrition targets your flats are composed against."
        functions={['Your record', 'Pickup points', 'Nutrition targets']}
        status="partial"
      />
      <ClientPicker clients={clients} subscriber={subscriber} path={PATH} />

      {subscriber && (
        <>
          <div className="grid gap-4 mt-4 farm-autofit-20">
            <Card title="Your record">
              <dl className="grid gap-2">
                <div><dt className="font-semibold farm-c-ink">Name</dt><dd className="farm-c-soft">{subscriber.name}</dd></div>
                <div><dt className="font-semibold farm-c-ink">Sign-in email</dt><dd className="farm-c-soft">{subscriber.email ?? 'none on the record'}</dd></div>
                <div><dt className="font-semibold farm-c-ink">Status</dt><dd className="farm-c-soft">{SUBSCRIBER_STATUS_LABELS[subscriber.status]}{subscriber.ownUse ? ' · own use' : ''}</dd></div>
                <div><dt className="font-semibold farm-c-ink">Channel</dt><dd className="farm-c-soft">{channel?.market ?? `Channel ${subscriber.channel}`}</dd></div>
                <div>
                  <dt className="font-semibold farm-c-ink">Price per flat</dt>
                  <dd className="farm-c-soft">{subscriber.pricePerUnitCents !== null ? `${money(subscriber.pricePerUnitCents / 100)} contracted` : channel ? `${money(channel.pricePerUnit)}, the channel’s price` : 'not set'}</dd>
                </div>
                <div><dt className="font-semibold farm-c-ink">Payment terms</dt><dd className="farm-c-soft">{subscriber.paymentTerms ? PAYMENT_TERMS_LABELS[subscriber.paymentTerms] : 'No terms on file'}</dd></div>
                {(subscriber.contractStart || subscriber.contractEnd) && (
                  <div><dt className="font-semibold farm-c-ink">Contract</dt><dd className="farm-c-soft">{subscriber.contractStart ?? '—'} to {subscriber.contractEnd ?? 'open'}</dd></div>
                )}
              </dl>
            </Card>
            <Card title="Pickup points">
              {subscriber.pickupPoints.length === 0 ? (
                <p className="farm-kpi-sub">No pickup point is on your record.</p>
              ) : (
                <table className="farm-table">
                  <thead><tr><th>Pickup point</th><th>Status</th></tr></thead>
                  <tbody>
                    {subscriber.pickupPoints.map((p) => <tr key={p.id}><td>{p.name}</td><td className="capitalize!">{p.status}</td></tr>)}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card title="Nutrition targets" className="mt-4">
            {targets.length === 0 ? (
              <p className="farm-kpi-sub">No nutrition target is named on your record. The farm names them with you; the Flat Builder reads them.</p>
            ) : (
              <table className="farm-table">
                <thead><tr><th>Target</th><th>Kind</th><th>Varieties whose profile carries it</th></tr></thead>
                <tbody>
                  {targets.map((t) => (
                    <tr key={t.key}><td>{t.name}</td><td className="capitalize!">{t.kind}</td><td>{t.varieties.length === 0 ? '—' : t.varieties.map(varietyName).join(', ')}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="farm-kpi-sub mt-3">
              Your record holds your nutrition targets and nothing else about your health. A goal, a named set of targets, is not part of the record.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
