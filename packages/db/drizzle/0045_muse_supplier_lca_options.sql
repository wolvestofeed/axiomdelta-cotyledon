-- 0045_muse_supplier_lca_options.sql
-- Impact OS — supplier-specific LCA options (Sustainability S4).
--
-- A figure a specific supplier supplies for a specific recipe ingredient, with
-- the supplier's own document registered in muse.sources. It appears as a
-- "supplier" option in the per-ingredient LCA basis selector beside the study
-- mean and any curated cited LCA. Boundary is stated so the engine can align
-- the figure to the study's retail-weight basis before comparison.
--
-- supplier_id is the compiled directory's operation id (public-records
-- compilation, not a database row); supplier_name is denormalised for display.

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.supplier_lca_options (
  id              uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     text              NOT NULL,
  supplier_name   text              NOT NULL,
  -- Recipe ingredient name, e.g. 'Ground beef, 85/15'.
  ingredient      text              NOT NULL,
  label           text              NOT NULL,
  kg_co2e_per_kg  double precision  NOT NULL,
  unit_note       text,
  -- 'retail' | 'slaughter_gate' | 'farm_gate'
  boundary        text              NOT NULL DEFAULT 'farm_gate',
  source_id       uuid              REFERENCES muse.sources (id) ON DELETE SET NULL,
  status          text              NOT NULL DEFAULT 'STATED',
  note            text,
  created_by      text,
  created_at      timestamptz       NOT NULL DEFAULT now(),
  updated_at      timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS muse_supplier_lca_ingredient_idx
  ON muse.supplier_lca_options (ingredient);
CREATE INDEX IF NOT EXISTS muse_supplier_lca_supplier_idx
  ON muse.supplier_lca_options (supplier_id);
