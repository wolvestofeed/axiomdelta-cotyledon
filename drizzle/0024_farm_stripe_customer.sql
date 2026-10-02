-- Cotyledon: the subscriber's Stripe customer.
--
-- A subscriber who puts a card on file in the Client Portal is a Stripe customer; the id is kept on
-- the record so a distribution can be billed as it is handed over and a card payment can be matched
-- to its subscriber when Stripe reports it. The workspace's own stripe_customer_id is the farm paying
-- for the software and is a different account.

ALTER TABLE farm.subscribers ADD COLUMN IF NOT EXISTS stripe_customer_id text;
CREATE UNIQUE INDEX IF NOT EXISTS farm_subscribers_stripe_customer_idx ON farm.subscribers (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
