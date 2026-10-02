/**
 * Cotyledon — the card processor's postings are balanced on the farm's accounts, and the client runs
 * unconfigured (Phase 3, S4: the architecture before the keys).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { ACCT_CARD_CLEARING, ACCT_CARD_FEES_PAYABLE, ACCT_CASH_OPERATING, ACCT_RECEIVABLE, ACCT_REFUNDS, balanced, cardPaymentLines, payoutLines, refundLines } from '@/engine/stripe-bridge';
import { stripeConfigured, stripeReturnBase, stripeWebhookConfigured } from '@/lib/stripe';

const sum = (lines: { accountCode: string; debitCents: number; creditCents: number }[], code: string) =>
  lines.filter((l) => l.accountCode === code).reduce((s, l) => s + l.debitCents - l.creditCents, 0);

describe('stripe bridge — a card payment', () => {
  it('parks the gross in clearing against the receivable and accrues the fee', () => {
    const lines = cardPaymentLines({ grossCents: 3000, feeCents: 117 });
    expect(balanced(lines)).toBe(true);
    expect(sum(lines, ACCT_CARD_CLEARING)).toBe(3000);
    expect(sum(lines, ACCT_RECEIVABLE)).toBe(-3000);
    expect(sum(lines, ACCT_CARD_FEES_PAYABLE)).toBe(-117);
  });

  it('with no fee carries two lines; a fee over the gross and a fraction of a cent are refused', () => {
    expect(cardPaymentLines({ grossCents: 3000, feeCents: 0 })).toHaveLength(2);
    expect(() => cardPaymentLines({ grossCents: 100, feeCents: 101 })).toThrow();
    expect(() => cardPaymentLines({ grossCents: 10.5, feeCents: 0 })).toThrow();
  });
});

describe('stripe bridge — a payout and a refund', () => {
  it('deposits the net, clears the fees accrued and relieves the clearing of the gross', () => {
    const lines = payoutLines({ grossCents: 6000, netCents: 5766 });
    expect(balanced(lines)).toBe(true);
    expect(sum(lines, ACCT_CASH_OPERATING)).toBe(5766);
    expect(sum(lines, ACCT_CARD_FEES_PAYABLE)).toBe(234);
    expect(sum(lines, ACCT_CARD_CLEARING)).toBe(-6000);
    expect(() => payoutLines({ grossCents: 100, netCents: 101 })).toThrow();
  });

  it('a card payment accrued and then paid out leaves nothing in clearing or fees payable', () => {
    const all = [...cardPaymentLines({ grossCents: 3000, feeCents: 117 }), ...payoutLines({ grossCents: 3000, netCents: 2883 })];
    expect(sum(all, ACCT_CARD_CLEARING)).toBe(0);
    expect(sum(all, ACCT_CARD_FEES_PAYABLE)).toBe(0);
    expect(sum(all, ACCT_CASH_OPERATING)).toBe(2883);
  });

  it('a refund is contra-revenue against the clearing', () => {
    const lines = refundLines({ refundCents: 3000 });
    expect(balanced(lines)).toBe(true);
    expect(sum(lines, ACCT_REFUNDS)).toBe(3000);
    expect(sum(lines, ACCT_CARD_CLEARING)).toBe(-3000);
  });
});

describe('stripe client — unconfigured', () => {
  const saved = { key: process.env['STRIPE_SECRET_KEY'], secret: process.env['STRIPE_WEBHOOK_SECRET'], base: process.env['NEXT_PUBLIC_BASE_URL'] };
  afterEach(() => {
    if (saved.key === undefined) delete process.env['STRIPE_SECRET_KEY']; else process.env['STRIPE_SECRET_KEY'] = saved.key;
    if (saved.secret === undefined) delete process.env['STRIPE_WEBHOOK_SECRET']; else process.env['STRIPE_WEBHOOK_SECRET'] = saved.secret;
    if (saved.base === undefined) delete process.env['NEXT_PUBLIC_BASE_URL']; else process.env['NEXT_PUBLIC_BASE_URL'] = saved.base;
  });

  it('reports no keys, and returns the client to localhost', () => {
    delete process.env['STRIPE_SECRET_KEY'];
    delete process.env['STRIPE_WEBHOOK_SECRET'];
    delete process.env['NEXT_PUBLIC_BASE_URL'];
    expect(stripeConfigured()).toBe(false);
    expect(stripeWebhookConfigured()).toBe(false);
    expect(stripeReturnBase()).toBe('http://localhost:3000');
  });

  it('reports keys when they are set', () => {
    process.env['STRIPE_SECRET_KEY'] = 'sk_test_x';
    process.env['STRIPE_WEBHOOK_SECRET'] = 'whsec_x';
    process.env['NEXT_PUBLIC_BASE_URL'] = 'https://example.test';
    expect(stripeConfigured()).toBe(true);
    expect(stripeWebhookConfigured()).toBe(true);
    expect(stripeReturnBase()).toBe('https://example.test');
  });
});
