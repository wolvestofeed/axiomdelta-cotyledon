import Stripe from 'stripe';

/**
 * Cotyledon — the Stripe client, ported from the Axiom Delta Coach template's `lib/stripe.ts`.
 *
 * One client per process, built on first use from `STRIPE_SECRET_KEY`. With no key the architecture
 * still runs: `stripeConfigured()` is false, the Settings page says billing is not connected, and the
 * `/api/stripe` routes refuse with 503. Test keys until Rob states live ones; no price or product id is
 * needed, since each distribution is billed as it is handed over (Phase 3, S4) rather than on a plan.
 */

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env['STRIPE_SECRET_KEY']);
}

export function stripeWebhookConfigured(): boolean {
  return Boolean(process.env['STRIPE_WEBHOOK_SECRET']);
}

export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env['STRIPE_SECRET_KEY'];
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set.');
  client = new Stripe(key, { typescript: true });
  return client;
}

/** Where Stripe sends the client back: Checkout's success and cancel, the billing portal's return. */
export function stripeReturnBase(): string {
  return process.env['NEXT_PUBLIC_BASE_URL'] || 'http://localhost:3000';
}
