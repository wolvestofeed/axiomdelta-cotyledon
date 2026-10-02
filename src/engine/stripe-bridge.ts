/**
 * Cotyledon — the card processor's postings, pure (ported from the Coach template's `stripe-bridge.ts`
 * and restated on the farm's chart of accounts, `accounting-policy.md`).
 *
 * What Stripe reports becomes balanced journal lines:
 *   - a card payment of an invoice: the gross to Card Processor Clearing (1200) against the
 *     receivable (1300); the fee to Bank & Card Processing Fees (7090) against Card Processor Fees
 *     Payable (2030), cleared on payout;
 *   - a payout: the net to Cash — Operating (1010) and the accrued fees out of 2030, against the
 *     clearing (1200) for the gross;
 *   - a refund, or a dispute lost: Refunds & Voids (4910) against the clearing (1200).
 *
 * Idempotency is the caller's: a posting's reference is the Stripe event id, and a replayed event
 * finds its posting and does nothing. These functions build the lines; nothing here touches a database,
 * and the Actual ledger takes them up when live keys exist (Phase 3, S4).
 */

export const ACCT_CASH_OPERATING = '1010';
export const ACCT_CARD_CLEARING = '1200';
export const ACCT_RECEIVABLE = '1300';
export const ACCT_CARD_FEES_PAYABLE = '2030';
export const ACCT_REFUNDS = '4910';
export const ACCT_CARD_FEES_EXPENSE = '7090';

export interface JournalLineSpec {
  accountCode: string;
  debitCents: number;
  creditCents: number;
  memo: string;
}

const int = (n: number, what: string): number => {
  if (!Number.isInteger(n) || n < 0) throw new Error(`${what} is a whole number of cents, zero or more`);
  return n;
};

/** A card payment of an invoice: gross to clearing against the receivable, the fee accrued. */
export function cardPaymentLines({ grossCents, feeCents }: { grossCents: number; feeCents: number }): JournalLineSpec[] {
  int(grossCents, 'The gross'); int(feeCents, 'The fee');
  if (feeCents > grossCents) throw new Error('The fee is more than the gross');
  const lines: JournalLineSpec[] = [
    { accountCode: ACCT_CARD_CLEARING, debitCents: grossCents, creditCents: 0, memo: 'Card payment, held by the processor until payout' },
    { accountCode: ACCT_RECEIVABLE, debitCents: 0, creditCents: grossCents, memo: 'Invoice paid by card' },
  ];
  if (feeCents > 0) {
    lines.push(
      { accountCode: ACCT_CARD_FEES_EXPENSE, debitCents: feeCents, creditCents: 0, memo: 'Processing fee' },
      { accountCode: ACCT_CARD_FEES_PAYABLE, debitCents: 0, creditCents: feeCents, memo: 'Fee accrued, cleared on payout' },
    );
  }
  return lines;
}

/** A payout: the net deposited, the accrued fees cleared, the clearing relieved of the gross. */
export function payoutLines({ grossCents, netCents }: { grossCents: number; netCents: number }): JournalLineSpec[] {
  int(grossCents, 'The gross'); int(netCents, 'The net');
  if (netCents > grossCents) throw new Error('The net is more than the gross');
  const feeCents = grossCents - netCents;
  const lines: JournalLineSpec[] = [{ accountCode: ACCT_CASH_OPERATING, debitCents: netCents, creditCents: 0, memo: 'Payout deposited' }];
  if (feeCents > 0) lines.push({ accountCode: ACCT_CARD_FEES_PAYABLE, debitCents: feeCents, creditCents: 0, memo: 'Accrued fees cleared by this payout' });
  lines.push({ accountCode: ACCT_CARD_CLEARING, debitCents: 0, creditCents: grossCents, memo: 'Clearing relieved by this payout' });
  return lines;
}

/** A refund, or a dispute lost: contra-revenue against the clearing. */
export function refundLines({ refundCents, memo = 'Refund' }: { refundCents: number; memo?: string }): JournalLineSpec[] {
  int(refundCents, 'The refund');
  return [
    { accountCode: ACCT_REFUNDS, debitCents: refundCents, creditCents: 0, memo },
    { accountCode: ACCT_CARD_CLEARING, debitCents: 0, creditCents: refundCents, memo },
  ];
}

/** Debits equal credits. */
export function balanced(lines: readonly JournalLineSpec[]): boolean {
  return lines.reduce((s, l) => s + l.debitCents, 0) === lines.reduce((s, l) => s + l.creditCents, 0);
}
