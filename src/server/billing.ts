import 'server-only';
import { and, eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { farmSubscribers, farmSubscriberPayments } from '@/db';
import { db } from '@/lib/db';
import { getStripe, stripeReturnBase } from '@/lib/stripe';
import { withWorkspaceId } from '@/server/workspace';
import { appendPosting } from '@/server/posting-log';
import { periodOf } from '@/engine/actuals';

/**
 * Cotyledon — billing through the card processor (server-only). The architecture is the Axiom Delta
 * Coach template's (`member/api/stripe/*`, `api/webhook/stripe`), restated for a subscriber record:
 *
 *   - a subscriber who puts a card on file becomes a Stripe customer, the id on the record (0024),
 *     the customer's metadata naming the workspace and the subscriber so a webhook can find them;
 *   - Checkout in setup mode saves the card; the billing portal manages it and shows receipts;
 *   - a card payment Stripe reports is recorded as a subscriber payment with the payment intent id as
 *     its reference, once: a replayed event finds the payment and does nothing. Applying it to an
 *     invoice is done on Receivables until a distribution is billed as it is handed over (S4), when
 *     the payment intent's metadata names the invoice.
 *
 * Every function here runs in a workspace scope: the routes open it from the sign-in, the webhook
 * from the customer's metadata.
 */

export type BillingResult = { ok: true; url: string } | { ok: false; error: string; status: number };

async function subscriberRow(subscriberId: string) {
  const rows = await db
    .select({ id: farmSubscribers.id, name: farmSubscribers.name, stripeCustomerId: farmSubscribers.stripeCustomerId, workspaceId: farmSubscribers.workspaceId })
    .from(farmSubscribers)
    .where(eq(farmSubscribers.id, subscriberId))
    .limit(1);
  return rows[0] ?? null;
}

/** The subscriber's Stripe customer, created on first need with the workspace and subscriber in its metadata. */
export async function ensureStripeCustomer(subscriberId: string): Promise<{ customerId: string } | { error: string }> {
  const s = await subscriberRow(subscriberId);
  if (!s) return { error: 'Subscriber not found.' };
  if (s.stripeCustomerId) return { customerId: s.stripeCustomerId };
  const customer = await getStripe().customers.create({ name: s.name, metadata: { workspaceId: s.workspaceId, subscriberId: s.id } });
  await db.update(farmSubscribers).set({ stripeCustomerId: customer.id, updatedAt: new Date() }).where(eq(farmSubscribers.id, s.id));
  return { customerId: customer.id };
}

/** A Checkout session in setup mode: the client saves a card, and returns to Settings. */
export async function checkoutSetupSession(subscriberId: string): Promise<BillingResult> {
  const c = await ensureStripeCustomer(subscriberId);
  if ('error' in c) return { ok: false, error: c.error, status: 404 };
  const base = stripeReturnBase();
  const session = await getStripe().checkout.sessions.create({
    mode: 'setup',
    customer: c.customerId,
    currency: 'usd',
    success_url: `${base}/farm/client-portal/settings?subscriber=${subscriberId}&card=saved`,
    cancel_url: `${base}/farm/client-portal/settings?subscriber=${subscriberId}&card=canceled`,
    metadata: { subscriberId },
  });
  if (!session.url) return { ok: false, error: 'The card processor returned no page.', status: 502 };
  return { ok: true, url: session.url };
}

/** Stripe's billing portal for the subscriber's customer: the card on file and the receipts. */
export async function billingPortalSession(subscriberId: string): Promise<BillingResult> {
  const s = await subscriberRow(subscriberId);
  if (!s) return { ok: false, error: 'Subscriber not found.', status: 404 };
  if (!s.stripeCustomerId) return { ok: false, error: 'No card is on file.', status: 400 };
  const session = await getStripe().billingPortal.sessions.create({
    customer: s.stripeCustomerId,
    return_url: `${stripeReturnBase()}/farm/client-portal/settings?subscriber=${subscriberId}`,
  });
  return { ok: true, url: session.url };
}

/** The workspace and subscriber a Stripe customer belongs to, from the metadata set at creation. */
async function ownerOfCustomer(customerId: string): Promise<{ workspaceId: string; subscriberId: string } | null> {
  const c = await getStripe().customers.retrieve(customerId);
  if (c.deleted) return null;
  const { workspaceId, subscriberId } = c.metadata;
  return workspaceId && subscriberId ? { workspaceId, subscriberId } : null;
}

export type WebhookOutcome = { handled: boolean; action: string };

/**
 * One Stripe event. `checkout.session.completed` in setup mode confirms the customer on the record;
 * `payment_intent.succeeded` records the payment once; everything else is acknowledged and left,
 * named in the outcome so the log says what arrived.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      const subscriberId = session.metadata?.['subscriberId'];
      if (!customerId || !subscriberId) return { handled: false, action: 'checkout without a customer or subscriber' };
      const owner = await ownerOfCustomer(customerId);
      if (!owner) return { handled: false, action: 'checkout for a customer with no owner' };
      await withWorkspaceId(owner.workspaceId, async () => {
        await db
          .update(farmSubscribers)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() })
          .where(and(eq(farmSubscribers.id, subscriberId), eq(farmSubscribers.stripeCustomerId, customerId)));
      });
      return { handled: true, action: 'card on file confirmed' };
    }
    case 'payment_intent.succeeded': {
      const pi = event.data.object;
      const customerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id;
      if (!customerId) return { handled: false, action: 'payment with no customer' };
      const owner = await ownerOfCustomer(customerId);
      if (!owner) return { handled: false, action: 'payment for a customer with no owner' };
      const invoiceId = pi.metadata?.['invoiceId'];
      const invoiceAmount = Number(pi.metadata?.['invoiceAmountCents'] ?? pi.amount_received);
      const receivedOn = new Date(pi.created * 1000).toISOString().slice(0, 10);
      const recorded = await withWorkspaceId(owner.workspaceId, async () => {
        const existing = await db.select({ id: farmSubscriberPayments.id }).from(farmSubscriberPayments).where(eq(farmSubscriberPayments.reference, pi.id)).limit(1);
        if (existing[0]) return false;
        const s = await subscriberRow(owner.subscriberId);
        if (!s) return false;
        await db.transaction(async (tx) => {
          const rows = await tx
            .insert(farmSubscriberPayments)
            .values({
              subscriberId: s.id,
              subscriberName: s.name,
              receivedOn,
              amountCents: pi.amount_received,
              method: 'card',
              reference: pi.id,
              applications: invoiceId ? [{ documentId: invoiceId, amountCents: Math.min(invoiceAmount, pi.amount_received) }] : [],
              notes: `Stripe event ${event.id}`,
              createdBy: 'stripe',
            })
            .returning({ id: farmSubscriberPayments.id });
          const row = rows[0];
          if (row) {
            await appendPosting(tx, {
              actorUserId: 'stripe',
              actorEmail: null,
              action: 'record_subscriber_payment',
              recordKind: 'subscriber_payment',
              recordId: row.id,
              period: periodOf(receivedOn),
              detail: { subscriberName: s.name, receivedOn, amountCents: pi.amount_received, reference: pi.id, stripeEventId: event.id },
            });
          }
        });
        return true;
      });
      return { handled: recorded, action: recorded ? 'card payment recorded' : 'card payment already recorded' };
    }
    default:
      return { handled: false, action: `${event.type} acknowledged` };
  }
}
