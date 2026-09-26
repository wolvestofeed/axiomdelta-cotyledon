-- 0067_muse_catalog_prices.sql
-- Impact OS — supplier catalog items carry candidate / approved, and their price
-- is effective-dated (Roadmap Phase N, step N1).
--
-- Two facts were conflated on the catalog row: whether we would buy from this
-- line at all, and what it costs. They separate here.
--
--   * status          — 'candidate' (a price on file from a sheet or a quote)
--                       or 'approved' (the line the plan and a purchase order
--                       may price off). Approval is a decision about the line,
--                       not a property of the sheet it arrived on, so it
--                       survives a re-import.
--   * supplier_item_prices — one price per item per effective date. The price
--                       IN FORCE on a date is the latest row on or before it,
--                       so every dollar the model reads can be resolved for the
--                       date it is read for, and last season's sheet stays
--                       readable after this season's lands.
--
-- Existing rows are backfilled to 'approved' and their single price is written
-- as the row in force from the date the sheet was imported: nothing the model
-- reads today moves. Rows imported from here on land as candidates.
--
-- unit_price / price_basis are dropped from muse.supplier_items — a price that
-- lives in two places is the thing Phase N exists to remove.

CREATE SCHEMA IF NOT EXISTS muse;

-- ── The line's real-world status ────────────────────────────────────────────

ALTER TABLE muse.supplier_items ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'candidate';
ALTER TABLE muse.supplier_items ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE muse.supplier_items ADD COLUMN IF NOT EXISTS approved_by text;

ALTER TABLE muse.supplier_items DROP CONSTRAINT IF EXISTS muse_supplier_items_status;
ALTER TABLE muse.supplier_items ADD CONSTRAINT muse_supplier_items_status CHECK (status IN ('candidate', 'approved'));

-- Every line already on file was priced off before this migration; keep it so.
UPDATE muse.supplier_items SET status = 'approved' WHERE status = 'candidate';

-- ── The price, per date ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS muse.supplier_item_prices (
  id             uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid              NOT NULL REFERENCES muse.supplier_items(id) ON DELETE CASCADE,
  -- The date this price comes into force. The price in force on any date is the
  -- latest row on or before it; there is no end date to keep in step.
  effective_from date              NOT NULL,
  -- Dollars as double precision, matching what the column replaced: a catalog
  -- price is routinely below a cent's resolution per unit.
  unit_price     double precision,
  -- What the price is per: 'lb' | 'case' | 'each' | 'dozen' | 'cwt'.
  price_basis    text,
  -- The price sheet or quote this figure came from, registered in muse.sources.
  source_id      uuid              REFERENCES muse.sources(id) ON DELETE SET NULL,
  note           text,
  created_by     text,
  created_at     timestamptz       NOT NULL DEFAULT now()
);

-- One price per item per date: a second figure for the same day is an edit of
-- the first, not a rival to it.
CREATE UNIQUE INDEX IF NOT EXISTS muse_supplier_item_prices_item_date_idx
  ON muse.supplier_item_prices (item_id, effective_from);
CREATE INDEX IF NOT EXISTS muse_supplier_item_prices_item_idx
  ON muse.supplier_item_prices (item_id, effective_from DESC);

-- Backfill: the one price each line carried, in force from the day its sheet
-- was imported (or the day the row was created, for a hand-entered line).
INSERT INTO muse.supplier_item_prices (item_id, effective_from, unit_price, price_basis, source_id, note, created_by, created_at)
SELECT
  i.id,
  COALESCE(i.imported_at, i.created_at)::date,
  i.unit_price,
  i.price_basis,
  i.source_id,
  'Carried from the catalog row when prices became effective-dated (migration 0067).',
  i.created_by,
  i.created_at
FROM muse.supplier_items i
WHERE i.unit_price IS NOT NULL
ON CONFLICT (item_id, effective_from) DO NOTHING;

ALTER TABLE muse.supplier_items DROP COLUMN IF EXISTS unit_price;
ALTER TABLE muse.supplier_items DROP COLUMN IF EXISTS price_basis;
