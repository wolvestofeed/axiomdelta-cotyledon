import { NextResponse } from 'next/server';
import { FarmAccessError, requireSubscriberAccess } from '@/server/access';
import { withWorkspace } from '@/server/workspace';
import { stripeConfigured } from '@/lib/stripe';
import { billingPortalSession } from '@/server/billing';

/**
 * POST { subscriberId } → { url }: Stripe's billing portal for the subscriber's customer, where the
 * card on file is managed and receipts are read. 503 with no Stripe keys on file.
 */
export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: 'Billing is not connected.' }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { subscriberId?: unknown } | null;
  const subscriberId = typeof body?.subscriberId === 'string' ? body.subscriberId : null;
  if (!subscriberId) return NextResponse.json({ error: 'Name the subscriber.' }, { status: 400 });
  try {
    const result = await withWorkspace(async () => {
      await requireSubscriberAccess(subscriberId);
      return billingPortalSession(subscriberId);
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ url: result.url });
  } catch (e) {
    if (e instanceof FarmAccessError) return NextResponse.json({ error: e.message }, { status: e.code === 'not_signed_in' ? 401 : 403 });
    console.error('[stripe/portal]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'The card processor did not answer.' }, { status: 502 });
  }
}
