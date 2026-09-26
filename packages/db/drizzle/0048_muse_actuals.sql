-- 0048_muse_actuals.sql
-- Impact OS — actuals: the recorded facts that replace forecast lines.
--
-- The platform is a forecaster that becomes the operating system as data arrives.
-- Every table here is a FACT OF RECORD captured when the event happens, read by
-- the same engine the forecast feeds. A period with records posts from them; a
-- period without posts from the open forecast. No page computes a dollar from a
-- typed total: the batch record carries weights, hours and lot codes, and the
-- ledger derives the cost; the receipt carries quantities and an invoice price,
-- and the ledger derives the price variance; the delivery carries meals and a
-- price, and the ledger derives revenue and cost of goods sold.
--
--   * batch_records — the ISA-95 production performance object the ledger
--     already consumes (`BatchExecution` in the Muse engine). Per-component
--     issued / cooked / chilled / packed weights, scrap with reason codes, input
--     lot codes and the CCP-2 cooling measurements are one JSONB document
--     because they are one physical event; a GIN index lets a recall trace ask
--     "which batches consumed lot X".
--   * receipts — goods received against a purchase order (or without one), with
--     the lot code assigned on receipt and the invoice price. Raw materials are
--     received at standard; the invoice against standard is the purchase price
--     variance.
--   * deliveries — meals delivered by channel, site and date at the price
--     charged. Revenue and cost of goods sold post from these.
--   * period_bills — occupancy, utilities, admin and other period costs by
--     month. Manufacturing overhead incurred and G&A post from these.
--
-- Money is integer cents on documents (invoice totals, prices charged) and
-- double precision on physical quantities, matching 0047.

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.batch_records (
  id                 uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Operator-visible batch id, e.g. B-260914-01. Unique.
  batch_id           text              NOT NULL UNIQUE,
  recipe_code        text              NOT NULL,
  production_date    date              NOT NULL,
  -- The recipe standard in force on the production date, so cost is reproducible.
  standard_version   text              NOT NULL,
  planned_portions   double precision  NOT NULL,
  -- Base-portion equivalents that passed and were packed. Drives everything downstream.
  good_portions      double precision  NOT NULL,
  -- Chiller batches the record covers (fixed labor is per batch).
  batches_run        integer           NOT NULL DEFAULT 1,
  -- Meals the portions became; NULL = one meal per portion.
  meals_produced     double precision,
  -- ComponentExecution[]: consumed lots, stage weights, scrap, cooling record.
  components         jsonb             NOT NULL DEFAULT '[]'::jsonb,
  actual_labor_hours double precision,
  actual_labor_rate  double precision,
  -- The production-record signature.
  closed_by          text,
  closed_at          timestamptz,
  notes              text,
  created_by         text,
  created_at         timestamptz       NOT NULL DEFAULT now(),
  updated_at         timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT muse_batch_records_batches_positive CHECK (batches_run >= 1),
  CONSTRAINT muse_batch_records_portions_nonneg CHECK (good_portions >= 0 AND planned_portions >= 0)
);
CREATE INDEX IF NOT EXISTS muse_batch_records_date_idx ON muse.batch_records (production_date);
CREATE INDEX IF NOT EXISTS muse_batch_records_components_gin ON muse.batch_records USING gin (components);

CREATE TABLE IF NOT EXISTS muse.receipts (
  id                 uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id              uuid              REFERENCES muse.purchase_orders (id) ON DELETE SET NULL,
  supplier_id        text,
  supplier_name      text,
  received_on        date              NOT NULL,
  invoice_number     text,
  invoice_total_cents integer,
  -- [{ ingredient, qty, unit, lotCode, unitPriceCents }]
  lines              jsonb             NOT NULL DEFAULT '[]'::jsonb,
  received_by        text,
  notes              text,
  created_by         text,
  created_at         timestamptz       NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS muse_receipts_date_idx ON muse.receipts (received_on);
CREATE INDEX IF NOT EXISTS muse_receipts_po_idx ON muse.receipts (po_id);

CREATE TABLE IF NOT EXISTS muse.deliveries (
  id                 uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  delivered_on       date              NOT NULL,
  -- Sales channel: 1 school, 2 corporate catering, 3 ghost kitchen / retail.
  phase              integer           NOT NULL,
  site_id            text,
  site_name          text,
  meals              double precision  NOT NULL,
  price_per_meal_cents integer         NOT NULL,
  -- Finished-goods lot codes shipped, for the forward trace.
  lot_codes          jsonb             NOT NULL DEFAULT '[]'::jsonb,
  delivered_by       text,
  notes              text,
  created_by         text,
  created_at         timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT muse_deliveries_meals_nonneg CHECK (meals >= 0),
  CONSTRAINT muse_deliveries_phase_range CHECK (phase BETWEEN 1 AND 3)
);
CREATE INDEX IF NOT EXISTS muse_deliveries_date_idx ON muse.deliveries (delivered_on);
CREATE INDEX IF NOT EXISTS muse_deliveries_phase_idx ON muse.deliveries (phase);

CREATE TABLE IF NOT EXISTS muse.period_bills (
  id                 uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  -- YYYY-MM
  period             text              NOT NULL,
  -- 'lease' | 'utilities' | 'admin' | 'other'
  category           text              NOT NULL,
  -- Ledger account the bill posts to; set from the category unless 'other'.
  account_code       text              NOT NULL,
  amount_cents       integer           NOT NULL,
  vendor             text,
  invoice_number     text,
  incurred_on        date,
  paid_on            date,
  source_id          uuid              REFERENCES muse.sources (id) ON DELETE SET NULL,
  notes              text,
  created_by         text,
  created_at         timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT muse_period_bills_period_format CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT muse_period_bills_category CHECK (category IN ('lease', 'utilities', 'admin', 'other'))
);
CREATE INDEX IF NOT EXISTS muse_period_bills_period_idx ON muse.period_bills (period);
