-- 0073_muse_customer_erra_rating.sql
-- Impact OS — the ERRA rating Muse Kitchen assigns a customer (Roadmap N7).
--
-- Decision (Robert, 2026-09-16): Muse Kitchen assigns ERRA ratings — the customer
-- does not rate itself. A rating is one, two or three stars, in review, or not
-- rated (the default), with the date it was assigned. Plan v Actual tallies the
-- customers in the plan and the customers served on record by their rating.
--
-- Additive only: three nullable columns; a customer with none reads not rated.

ALTER TABLE muse.customers ADD COLUMN IF NOT EXISTS erra_status text;
ALTER TABLE muse.customers ADD COLUMN IF NOT EXISTS erra_stars integer;
ALTER TABLE muse.customers ADD COLUMN IF NOT EXISTS erra_rated_on date;
