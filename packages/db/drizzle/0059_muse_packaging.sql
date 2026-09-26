-- 0059_muse_packaging.sql
-- Impact OS — the packaging library (Roadmap Phase N, step N1).
--
-- Packaging here is what a meal leaves the kitchen in — containers, lids,
-- labels, liners — costed per unit onto the meal. It is NOT packaging
-- equipment (tray sealer, date and lot coder, vacuum packer), which is capital
-- in muse.equipment.
--
--   * packages         — the library: channels, hot / cold, material, size,
--                        end of use and its rank, a manual unit cost, and an
--                        optional supplier catalog item whose price is the
--                        supplier-based cost (per each, or per pack ÷ units per pack).
--   * recipe_packages  — the packages a recipe picks and how many per meal. A
--                        recipe with none picked carries the per-meal placeholder
--                        ($0.48, Robert 2026-09-14).
--
-- Money in dollars as double precision, matching supplier_items.unit_price, since
-- a package's unit cost is routinely below a cent's resolution per unit.

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.packages (
  id                       uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text              NOT NULL,
  -- Channel numbers (1 School lunches, 2 Corporate catering, 3 Ghost kitchen).
  channels                 jsonb             NOT NULL DEFAULT '[]'::jsonb,
  -- 'hot' | 'cold'; null = not set.
  temperature              text,
  material                 text,
  size_value               double precision,
  size_unit                text,
  end_of_use               text,
  -- 1 is first; null = not ranked.
  end_of_use_rank          integer,
  manual_unit_cost         double precision,
  supplier_item_id         uuid              REFERENCES muse.supplier_items (id) ON DELETE SET NULL,
  supplier_units_per_pack  double precision  NOT NULL DEFAULT 1,
  notes                    text,
  source                   text              NOT NULL DEFAULT 'user_built',
  created_by               text,
  updated_by               text,
  created_at               timestamptz       NOT NULL DEFAULT now(),
  updated_at               timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT muse_packages_temperature CHECK (temperature IS NULL OR temperature IN ('hot', 'cold')),
  CONSTRAINT muse_packages_rank CHECK (end_of_use_rank IS NULL OR end_of_use_rank >= 1),
  CONSTRAINT muse_packages_manual_cost CHECK (manual_unit_cost IS NULL OR manual_unit_cost >= 0),
  CONSTRAINT muse_packages_size CHECK (size_value IS NULL OR size_value >= 0),
  CONSTRAINT muse_packages_units_per_pack CHECK (supplier_units_per_pack > 0),
  CONSTRAINT muse_packages_source CHECK (source IN ('seed', 'user_built'))
);
CREATE INDEX IF NOT EXISTS muse_packages_supplier_item_idx ON muse.packages (supplier_item_id);

CREATE TABLE IF NOT EXISTS muse.recipe_packages (
  id            uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id     uuid              NOT NULL REFERENCES muse.recipes (id) ON DELETE CASCADE,
  package_id    uuid              NOT NULL REFERENCES muse.packages (id) ON DELETE RESTRICT,
  qty_per_meal  double precision  NOT NULL DEFAULT 1,
  created_by    text,
  created_at    timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT muse_recipe_packages_qty CHECK (qty_per_meal > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS muse_recipe_packages_unique ON muse.recipe_packages (recipe_id, package_id);
CREATE INDEX IF NOT EXISTS muse_recipe_packages_package_idx ON muse.recipe_packages (package_id);
