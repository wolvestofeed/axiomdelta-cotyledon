import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, stripeConfigured, stripeWebhookConfigured } from '@/lib/stripe';
import { handleStripeEvent } from '@/server/billing';

/**
 * Stripe's webhook. The body is verified against `STRIPE_WEBHOOK_SECRET` before anything is read; a
 * bad signature is 400, no keys on file is 503. The event is handled in `server/billing.ts`, which finds
 * the workspace through the customer's metadata; no sign-in is involved. Always 200 once verified, so
 * Stripe does not retry an event the farm chose to leave.
 */
export async function POST(req: Request) {
  if (!stripeConfigured() || !stripeWebhookConfigured()) return NextResponse.json({ error: 'Billing is not connected.' }, { status: 503 });
  const signature = req.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'No signature.' }, { status: 400 });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, process.env['STRIPE_WEBHOOK_SECRET']!);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Bad signature.' }, { status: 400 });
  }
  try {
    const outcome = await handleStripeEvent(event);
    return NextResponse.json({ received: true, ...outcome });
  } catch (e) {
    console.error('[stripe/webhook]', event.type, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'The event was not recorded.' }, { status: 500 });
  }
}
