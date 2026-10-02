import { NextResponse } from 'next/server';
import { FarmAccessError, requireSubscriberAccess } from '@/server/access';
import { withWorkspace } from '@/server/workspace';
import { stripeConfigured } from '@/lib/stripe';
import { checkoutSetupSession } from '@/server/billing';

/**
 * POST { subscriberId } → { url }: a Checkout session in setup mode that saves a card against the
 * subscriber's Stripe customer (Client Portal, Settings). The caller is the record's own linked
 * client, or a super admin previewing (Roadmap P5). 503 with no Stripe keys on file.
 */
export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: 'Billing is not connected.' }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { subscriberId?: unknown } | null;
  const subscriberId = typeof body?.subscriberId === 'string' ? body.subscriberId : null;
  if (!subscriberId) return NextResponse.json({ error: 'Name the subscriber.' }, { status: 400 });
  try {
    const result = await withWorkspace(async () => {
      await requireSubscriberAccess(subscriberId);
      return checkoutSetupSession(subscriberId);
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ url: result.url });
  } catch (e) {
    if (e instanceof FarmAccessError) return NextResponse.json({ error: e.message }, { status: e.code === 'not_signed_in' ? 401 : 403 });
    console.error('[stripe/checkout]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'The card processor did not answer.' }, { status: 502 });
  }
}
