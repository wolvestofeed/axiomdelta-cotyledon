-- 0047_muse_supplier_catalog_and_pos.sql
-- Impact OS — supplier seasonal catalogs and generated purchase orders.
--
-- Two things a supplier relationship needs that no public directory carries:
--
--   * supplier_items — what this operation actually sells, on the terms it sells
--     it: pack, price, minimum, lead time, and the months it is available. This
--     is the seasonal catalog, imported from the price sheet a grower emails.
--     Seasonality is stored as two month numbers so a window can wrap the year
--     end (October through March is start 10, end 3).
--
--   * purchase_orders / purchase_order_lines — the orders we generate. A PO is a
--     DOCUMENT: once issued it states what was ordered at what price, and must
--     not silently change when the model behind it does. So its lines are
--     written down, unlike every computed figure elsewhere in the platform.
--     That is the exception to "every dollar is computed", and it is deliberate.
--
-- Money: catalog unit price is double precision (a reference price that may
-- carry sub-cent precision, e.g. $3.4567/lb), PO line amounts are integer cents
-- (a document that must total exactly), matching the ledger convention.
--
-- supplier_id is the compiled directory's operation id (a public-records
-- compilation, not a row we own); supplier_name is denormalised so an issued PO
-- still reads correctly if the directory is later refreshed.

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.supplier_items (
  id                uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       text              NOT NULL,
  item              text              NOT NULL,
  category          text,
  -- Variety for crops, breed for livestock.
  variety           text,
  pack_size         text,
  unit              text              NOT NULL DEFAULT 'lb',
  unit_price        double precision,
  -- What the unit price is per: 'lb' | 'case' | 'each' | 'dozen' | 'cwt'.
  price_basis       text,
  min_order_qty     double precision,
  lead_time_days    integer,
  -- Availability window as month numbers 1-12; may wrap the year end.
  avail_start_month integer,
  avail_end_month   integer,
  -- Certification claimed on THIS item, which can be narrower than the
  -- operation's certification scope.
  certification     text,
  origin            text,
  sku               text,
  notes             text,
  -- The price sheet this line was imported from, registered in muse.sources.
  source_id         uuid              REFERENCES muse.sources (id) ON DELETE SET NULL,
  imported_at       timestamptz,
  created_by        text,
  created_at        timestamptz       NOT NULL DEFAULT now(),
  updated_at        timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT muse_supplier_items_month_range CHECK (
    (avail_start_month IS NULL OR avail_start_month BETWEEN 1 AND 12) AND
    (avail_end_month   IS NULL OR avail_end_month   BETWEEN 1 AND 12)
  )
);

CREATE INDEX IF NOT EXISTS muse_supplier_items_supplier_idx
  ON muse.supplier_items (supplier_id);
CREATE INDEX IF NOT EXISTS muse_supplier_items_item_idx
  ON muse.supplier_items (item);

CREATE TABLE IF NOT EXISTS muse.purchase_orders (
  id                uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  -- AMK-PO-YYYYMMDD-NN, unique across the register.
  po_number         text              NOT NULL UNIQUE,
  supplier_id       text              NOT NULL,
  supplier_name     text              NOT NULL,
  -- 'draft' | 'issued' | 'received' | 'closed' | 'cancelled'
  status            text              NOT NULL DEFAULT 'draft',
  -- The production date this order buys for.
  ordered_for       date              NOT NULL,
  subtotal_cents    integer           NOT NULL DEFAULT 0,
  notes             text,
  issued_at         timestamptz,
  received_at       timestamptz,
  closed_at         timestamptz,
  created_by        text,
  created_at        timestamptz       NOT NULL DEFAULT now(),
  updated_at        timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS muse_purchase_orders_supplier_idx
  ON muse.purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS muse_purchase_orders_status_idx
  ON muse.purchase_orders (status);
CREATE INDEX IF NOT EXISTS muse_purchase_orders_ordered_for_idx
  ON muse.purchase_orders (ordered_for);

CREATE TABLE IF NOT EXISTS muse.purchase_order_lines (
  id                uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id             uuid              NOT NULL REFERENCES muse.purchase_orders (id) ON DELETE CASCADE,
  -- The recipe line this covers, so a PO traces back to what drove it.
  ingredient        text              NOT NULL,
  -- The supplier's own catalog line, when the ingredient matched one.
  supplier_item_id  uuid              REFERENCES muse.supplier_items (id) ON DELETE SET NULL,
  item              text              NOT NULL,
  qty               double precision  NOT NULL,
  unit              text              NOT NULL,
  pack_size         text,
  cases             integer,
  unit_price_cents  integer           NOT NULL DEFAULT 0,
  extended_cents    integer           NOT NULL DEFAULT 0,
  notes             text,
  created_at        timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS muse_purchase_order_lines_po_idx
  ON muse.purchase_order_lines (po_id);
