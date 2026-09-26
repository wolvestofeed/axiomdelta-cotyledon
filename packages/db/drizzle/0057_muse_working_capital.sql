-- 0057_muse_working_capital.sql
-- Impact OS — working capital and invoicing (Roadmap Phase K).
--
-- Decisions (Robert, 2026-09-14): one monthly invoice per customer, each
-- completed delivery route added to it as it finishes; revenue to receivables
-- at delivery; retail is paid at the time of ordering and is never invoiced.
-- Supplier bills are recorded against receipts with a three-way match of
-- purchase order, receipt and bill; a mismatched bill is flagged and is not
-- paid until rectified. Payment terms: suppliers Due on Receipt / Net 15 /
-- Net 30 / Net 60 / Net 90, customers Due on Receipt / Net 15 / Net 30, no
-- default. $200,000 opening owners' equity. An internal time clock for all
-- staff; pay periods are Monday through the second Sunday, paid the Friday five
-- days later.
--
--   * customers.payment_terms      — null = not set; an invoice is not issued without it.
--   * supplier_terms               — terms per supplier (suppliers are a compiled directory, not a table).
--   * period_bills.payment_terms   — terms on a lease / utilities / admin bill.
--   * invoices                     — one row per customer invoice; open while routes are added,
--                                    issued with its terms and due date. Totals are computed from
--                                    the deliveries that name it, never stored.
--   * deliveries.customer_id / invoice_id / route_completed_at
--   * customer_payments            — cash received, applied to invoices.
--   * supplier_bills               — the vendor's invoice against one or more receipts.
--   * supplier_payments            — cash paid, applied to bills.
--   * opening_balances             — the opening balance sheet of the actuals.
--   * staff, time_punches          — the time clock.
--
-- Money is integer cents; quantities are double precision, matching 0047/0048.

CREATE SCHEMA IF NOT EXISTS muse;

ALTER TABLE muse.customers ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE muse.customers DROP CONSTRAINT IF EXISTS muse_customers_payment_terms;
ALTER TABLE muse.customers ADD CONSTRAINT muse_customers_payment_terms
  CHECK (payment_terms IS NULL OR payment_terms IN ('due_on_receipt', 'net_15', 'net_30'));

CREATE TABLE IF NOT EXISTS muse.supplier_terms (
  supplier_id    text         PRIMARY KEY,
  supplier_name  text,
  payment_terms  text         NOT NULL,
  updated_by     text,
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT muse_supplier_terms_terms CHECK (payment_terms IN ('due_on_receipt', 'net_15', 'net_30', 'net_60', 'net_90'))
);

ALTER TABLE muse.period_bills ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE muse.period_bills DROP CONSTRAINT IF EXISTS muse_period_bills_payment_terms;
ALTER TABLE muse.period_bills ADD CONSTRAINT muse_period_bills_payment_terms
  CHECK (payment_terms IS NULL OR payment_terms IN ('due_on_receipt', 'net_15', 'net_30', 'net_60', 'net_90'));

CREATE TABLE IF NOT EXISTS muse.invoices (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- AMK-INV-YYYYMMDD-NN, dated the day the invoice was opened.
  invoice_number  text         NOT NULL UNIQUE,
  customer_id     uuid         NOT NULL REFERENCES muse.customers (id) ON DELETE RESTRICT,
  customer_name   text         NOT NULL,
  -- YYYY-MM: the service month the invoice bills.
  period          text         NOT NULL,
  -- 'open' | 'issued'
  status          text         NOT NULL DEFAULT 'open',
  opened_on       date         NOT NULL,
  -- Set at issue: the customer's terms at that moment, the issue date and the due date.
  payment_terms   text,
  issued_on       date,
  due_on          date,
  issued_by       text,
  notes           text,
  created_by      text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT muse_invoices_period_format CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT muse_invoices_status CHECK (status IN ('open', 'issued')),
  CONSTRAINT muse_invoices_terms CHECK (payment_terms IS NULL OR payment_terms IN ('due_on_receipt', 'net_15', 'net_30'))
);
CREATE INDEX IF NOT EXISTS muse_invoices_customer_idx ON muse.invoices (customer_id, period);
-- One invoice open per customer and month; routes are added to it.
CREATE UNIQUE INDEX IF NOT EXISTS muse_invoices_one_open ON muse.invoices (customer_id, period) WHERE status = 'open';

ALTER TABLE muse.deliveries ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES muse.customers (id) ON DELETE SET NULL;
ALTER TABLE muse.deliveries ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES muse.invoices (id) ON DELETE SET NULL;
ALTER TABLE muse.deliveries ADD COLUMN IF NOT EXISTS route_completed_at timestamptz;
CREATE INDEX IF NOT EXISTS muse_deliveries_invoice_idx ON muse.deliveries (invoice_id);
CREATE INDEX IF NOT EXISTS muse_deliveries_customer_idx ON muse.deliveries (customer_id);

-- Backfill the customer on deliveries recorded against an order.
UPDATE muse.deliveries d SET customer_id = o.customer_id
  FROM muse.orders o
  WHERE o.delivery_id = d.id AND d.customer_id IS NULL;

CREATE TABLE IF NOT EXISTS muse.customer_payments (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid         NOT NULL REFERENCES muse.customers (id) ON DELETE RESTRICT,
  customer_name  text         NOT NULL,
  received_on    date         NOT NULL,
  amount_cents   integer      NOT NULL,
  method         text,
  reference      text,
  -- [{ invoiceId, amountCents }]; the remainder is unapplied.
  applications   jsonb        NOT NULL DEFAULT '[]'::jsonb,
  notes          text,
  created_by     text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT muse_customer_payments_amount CHECK (amount_cents > 0)
);
CREATE INDEX IF NOT EXISTS muse_customer_payments_date_idx ON muse.customer_payments (received_on);

CREATE TABLE IF NOT EXISTS muse.supplier_bills (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id    text,
  supplier_name  text         NOT NULL,
  bill_number    text         NOT NULL,
  bill_date      date         NOT NULL,
  payment_terms  text         NOT NULL,
  -- The receipts this bill covers; a receipt is on at most one bill.
  receipt_ids    jsonb        NOT NULL DEFAULT '[]'::jsonb,
  -- [{ ingredient, qty, unit, unitPriceCents }] as the vendor billed them.
  lines          jsonb        NOT NULL DEFAULT '[]'::jsonb,
  notes          text,
  created_by     text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT muse_supplier_bills_terms CHECK (payment_terms IN ('due_on_receipt', 'net_15', 'net_30', 'net_60', 'net_90'))
);
CREATE INDEX IF NOT EXISTS muse_supplier_bills_date_idx ON muse.supplier_bills (bill_date);
CREATE INDEX IF NOT EXISTS muse_supplier_bills_receipts_gin ON muse.supplier_bills USING gin (receipt_ids);

CREATE TABLE IF NOT EXISTS muse.supplier_payments (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id    text,
  supplier_name  text         NOT NULL,
  paid_on        date         NOT NULL,
  amount_cents   integer      NOT NULL,
  method         text,
  reference      text,
  -- [{ billId, amountCents }]
  applications   jsonb        NOT NULL DEFAULT '[]'::jsonb,
  notes          text,
  created_by     text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT muse_supplier_payments_amount CHECK (amount_cents > 0)
);
CREATE INDEX IF NOT EXISTS muse_supplier_payments_date_idx ON muse.supplier_payments (paid_on);

CREATE TABLE IF NOT EXISTS muse.opening_balances (
  id                     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of                  date         NOT NULL,
  owner_equity_cents     integer      NOT NULL,
  fixed_assets_cents     integer      NOT NULL DEFAULT 0,
  long_term_debt_cents   integer      NOT NULL DEFAULT 0,
  notes                  text,
  created_by             text,
  created_at             timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT muse_opening_balances_nonneg CHECK (owner_equity_cents >= 0 AND fixed_assets_cents >= 0 AND long_term_debt_cents >= 0)
);

CREATE TABLE IF NOT EXISTS muse.staff (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text         NOT NULL,
  role                 text,
  -- 'hourly' | 'salaried'
  pay_type             text         NOT NULL DEFAULT 'hourly',
  hourly_wage_cents    integer,
  annual_salary_cents  integer,
  -- 'active' | 'inactive'
  status               text         NOT NULL DEFAULT 'active',
  started_on           date,
  notes                text,
  created_by           text,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT muse_staff_pay_type CHECK (pay_type IN ('hourly', 'salaried')),
  CONSTRAINT muse_staff_status CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE IF NOT EXISTS muse.time_punches (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     uuid         NOT NULL REFERENCES muse.staff (id) ON DELETE RESTRICT,
  -- 'in' | 'break_start' | 'break_end' | 'out'
  kind         text         NOT NULL,
  punched_at   timestamptz  NOT NULL,
  -- 'clock' (the floor) | 'manual' (typed afterwards, with a reason)
  source       text         NOT NULL DEFAULT 'clock',
  reason       text,
  recorded_by  text,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT muse_time_punches_kind CHECK (kind IN ('in', 'break_start', 'break_end', 'out')),
  CONSTRAINT muse_time_punches_source CHECK (source IN ('clock', 'manual')),
  CONSTRAINT muse_time_punches_manual_reason CHECK (source = 'clock' OR (reason IS NOT NULL AND length(trim(reason)) > 0))
);
CREATE INDEX IF NOT EXISTS muse_time_punches_staff_idx ON muse.time_punches (staff_id, punched_at);
CREATE INDEX IF NOT EXISTS muse_time_punches_at_idx ON muse.time_punches (punched_at);
