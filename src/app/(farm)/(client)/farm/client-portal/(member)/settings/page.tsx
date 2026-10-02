import { PortalPending } from '@/components/PortalPending';
import { ClientPicker } from '@/components/ClientPicker';
import { BillingActions } from '@/components/BillingActions';
import { getFarmAccess } from '@/server/access';
import { canUsePortal } from '@/server/client-portal';
import { PageHeader, Card } from '@/components/ui';
import { portalClients } from '@/server/client-portal';
import { stripeConfigured } from '@/lib/stripe';
import { withWorkspace } from '@/server/workspace';

export const dynamic = 'force-dynamic';

const PATH = '/farm/client-portal/settings';

/**
 * Settings — the client's account, their card on file and how the farm reaches them. The card on file
 * is Stripe (`server/billing.ts`): a Checkout session in setup mode saves the card against the
 * subscriber's Stripe customer, and Stripe's billing portal manages it. With no Stripe keys on file
 * the page says billing is not connected and the buttons are not shown.
 */
export default async function SettingsPage(props: Parameters<typeof SettingsPageInner>[0]) {
  return withWorkspace(() => SettingsPageInner(props));
}

async function SettingsPageInner({ searchParams }: { searchParams: Promise<{ subscriber?: string; card?: string }> }) {
  // Checked on the page as well as `(member)/layout`: a layout gate alone is not enough (CLAUDE.md §10).
  const access = await getFarmAccess();
  if (!canUsePortal(access)) return <PortalPending portal="Client Portal" email={access.email} />;
  const params = await searchParams;
  const { clients, subscriber } = await portalClients(params.subscriber, access);
  const configured = stripeConfigured();

  return (
    <>
      <PageHeader
        title="Settings"
        purpose="Manage your account, your card on file and how the farm reaches you."
        functions={['Account', 'Card on file', 'Contact']}
        status="designed"
      />
      <ClientPicker clients={clients} subscriber={subscriber} path={PATH} />

      <div className="grid gap-4 mt-4 farm-autofit-20">
        <Card title="Account">
          <dl className="grid gap-2">
            <div><dt className="font-semibold farm-c-ink">Signed in as</dt><dd className="farm-c-soft">{access.email ?? '—'}{access.name ? ` · ${access.name}` : ''}</dd></div>
            <div><dt className="font-semibold farm-c-ink">Linked record</dt><dd className="farm-c-soft">{access.subscriberId ? subscriber?.name ?? '—' : access.isOperator ? `staff preview${subscriber ? ` of ${subscriber.name}` : ''}` : 'none'}</dd></div>
          </dl>
          <p className="farm-kpi-sub mt-3">
            A sign-in is linked to the one subscriber record that carries its email, the first time it signs in. One sign-in per account, one account per record. Your name, email and password are changed where you signed in.
          </p>
        </Card>

        <Card title="Card on file">
          {params.card === 'saved' && <p className="farm-kpi-sub mb-2">Your card is on file.</p>}
          {params.card === 'canceled' && <p className="farm-kpi-sub mb-2">No card was saved.</p>}
          {!configured ? (
            <p className="farm-kpi-sub">Online billing is not connected: the farm has no card processor keys on file. Invoices are paid with the farm.</p>
          ) : subscriber ? (
            <>
              <p className="farm-kpi-sub mb-3">
                {subscriber.stripeCustomerId ? 'A card is on file with the farm’s card processor.' : 'No card is on file.'} Each distribution is billed as it is handed over; a card on file pays its invoice.
              </p>
              <BillingActions subscriberId={subscriber.id} hasCustomer={subscriber.stripeCustomerId !== null && subscriber.stripeCustomerId !== undefined} />
            </>
          ) : (
            <p className="farm-kpi-sub">No subscriber record to bill.</p>
          )}
        </Card>
      </div>

      <Card title="Contact" className="mt-4">
        <p className="farm-kpi-sub">
          The farm reaches you at the email you signed in with. Changes to a subscription, a pickup point or an invoice are made with the farm; please call the farm for faster service.
        </p>
      </Card>
    </>
  );
}
