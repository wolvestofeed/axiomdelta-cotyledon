# Billing — the card on file and card payments

How a client pays the farm, as built (Phase 3, S4a) and as it goes live (S4b). The architecture is the
Axiom Delta Coach template's Stripe wiring, restated for a subscriber record. Keys and the webhook
secret are placeholders until Rob states them; the application runs without them.

## What exists

| Piece | File | What it does |
|---|---|---|
| The client | `src/lib/stripe.ts` | One Stripe client per process from `STRIPE_SECRET_KEY`; `stripeConfigured()` is false with no key |
| The customer | `src/server/billing.ts`, migration `0024` | A subscriber who puts a card on file becomes a Stripe customer; the id is on `farm.subscribers.stripe_customer_id`, the customer's metadata names the workspace and the subscriber |
| Card on file | `/api/stripe/checkout`, `BillingActions.tsx` | Checkout in setup mode saves the card and returns to the Client Portal's Settings |
| The card and receipts | `/api/stripe/portal` | Stripe's billing portal for the customer |
| What Stripe reports | `/api/stripe/webhook`, `handleStripeEvent` | The signature verified first; `checkout.session.completed` confirms the customer on the record; `payment_intent.succeeded` records a subscriber payment once, the payment intent id its reference, applied to the invoice the intent's metadata names; every other event is acknowledged and left |
| The postings | `src/engine/stripe-bridge.ts` | A card payment: gross to Card Processor Clearing (1200) against Accounts Receivable (1300), the fee to Bank & Card Processing Fees (7090) against Card Processor Fees Payable (2030). A payout: the net to Cash — Operating (1010), the fees cleared from 2030, the clearing relieved of the gross. A refund or a lost dispute: Refunds & Voids (4910) against the clearing. Pure functions, balanced, tested |

The workspace's own `stripe_customer_id` is the farm paying for the software (Phase 6) and is a
different account from a subscriber's.

With no keys on file: Settings says billing is not connected and shows no buttons; the three routes
answer 503 before reading anything; the webhook verifies nothing.

## What goes live (S4b)

1. Rob states the secret key, the webhook secret and the publishable key in `.env.local`, and the
   webhook endpoint `/api/stripe/webhook` on the Stripe dashboard with the events above.
2. A distribution handed over raises a payment intent for its invoice on the subscriber's card on file,
   off-session, with `invoiceId` and `invoiceAmountCents` in its metadata; the webhook applies the
   payment to that invoice. Until then a card payment lands unapplied and is applied on Receivables.
3. The Actual ledger takes up the bridge's postings: a card payment to clearing rather than cash, a
   payout from clearing to cash with its fees, by the payment's `method` and Stripe's payout events,
   each posting keyed by the Stripe event id so a replay posts nothing.

No product or price id is needed. Each distribution is billed as it is handed over; a skipped or
paused distribution bills nothing (`outline.md` §4).
