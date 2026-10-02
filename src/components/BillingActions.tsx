'use client';

import { useState } from 'react';

/**
 * The Client Portal's card on file (Settings): a Checkout session in setup mode saves a card against
 * the subscriber's Stripe customer; Stripe's billing portal manages the card and shows receipts. Both
 * are server routes under `/api/stripe`; each answers with the URL to go to, or a refusal.
 */
export function BillingActions({ subscriberId, hasCustomer }: { subscriberId: string; hasCustomer: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(path: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscriberId }) });
      const data = (await res.json()) as { url?: string; error?: string };
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? 'The card processor did not answer.');
    } catch {
      setError('The card processor did not answer.');
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button type="button" className="farm-btn primary" disabled={busy} onClick={() => go('/api/stripe/checkout')}>
        {hasCustomer ? 'Put another card on file' : 'Put a card on file'}
      </button>
      {hasCustomer && (
        <button type="button" className="farm-btn" disabled={busy} onClick={() => go('/api/stripe/portal')}>
          Manage your card and receipts
        </button>
      )}
      {error && <span className="farm-kpi-sub">{error}</span>}
    </div>
  );
}
