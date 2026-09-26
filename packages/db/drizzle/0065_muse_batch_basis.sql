-- 0065_muse_batch_basis.sql
-- Impact OS — the batch is the costing basis (Robert, 2026-09-15).
--
-- Batch costing: the planned cost of one full-line batch from bulk as-purchased
-- inputs. Yield: the batch's usable product against the raw weight. Costing
-- down: the batch cost over the batch's portions is the unit cost, and the cost
-- to serve adds conversion labor, packaging and distribution.
--
--   * recipes.batch_portions  — the portions a recipe's quantities are written
--                               for (every row so far: 100). The production
--                               batch is derived, never typed.
--   * recipes.costing_basis   — dropped: the per-100-portion basis is gone.
--   * recipe_lines.line       — the jsonb quantity keys renamed from the per-100
--                               names to the per-batch names.
--   * equipment.batch_capacity_lb / batch_capacity_basis — pounds one unit
--                               takes in one run, the batch a vessel bounds;
--                               estimated until stated or observed. Open fields.
--
-- A batch is one full Phase 1 line — one skillet, one chiller — and planned
-- build-outs never count toward it.

ALTER TABLE muse.recipes ADD COLUMN IF NOT EXISTS batch_portions integer NOT NULL DEFAULT 100;
ALTER TABLE muse.recipes DROP COLUMN IF EXISTS costing_basis;
ALTER TABLE muse.recipes DROP CONSTRAINT IF EXISTS muse_recipes_batch_portions;
ALTER TABLE muse.recipes ADD CONSTRAINT muse_recipes_batch_portions CHECK (batch_portions > 0);

UPDATE muse.recipe_lines
SET line = (line - 'apQtyPer100' - 'cookedYieldPer100')
  || jsonb_build_object('apQtyPerBatch', line->'apQtyPer100', 'cookedYieldPerBatch', line->'cookedYieldPer100')
WHERE line ? 'apQtyPer100';

ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS batch_capacity_lb double precision;
ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS batch_capacity_basis text NOT NULL DEFAULT 'estimated';
ALTER TABLE muse.equipment DROP CONSTRAINT IF EXISTS muse_equipment_batch_capacity;
ALTER TABLE muse.equipment ADD CONSTRAINT muse_equipment_batch_capacity CHECK (batch_capacity_lb IS NULL OR batch_capacity_lb >= 0);
ALTER TABLE muse.equipment DROP CONSTRAINT IF EXISTS muse_equipment_batch_capacity_basis;
ALTER TABLE muse.equipment ADD CONSTRAINT muse_equipment_batch_capacity_basis CHECK (batch_capacity_basis IN ('estimated', 'stated', 'observed'));

-- The estimated capacities of the vessels a batch passes through (`_data/capex.ts` BATCH_CAPACITY_SEED).
UPDATE muse.equipment SET batch_capacity_lb = 200 WHERE batch_capacity_lb IS NULL AND item = 'Blast chiller, 200 lb capacity';
UPDATE muse.equipment SET batch_capacity_lb = 200 WHERE batch_capacity_lb IS NULL AND item = 'Tilting braising pan / skillet, 40 gal';
UPDATE muse.equipment SET batch_capacity_lb = 600 WHERE batch_capacity_lb IS NULL AND item = 'Steam-jacketed tilting kettle, 100 gal';
UPDATE muse.equipment SET batch_capacity_lb = 360 WHERE batch_capacity_lb IS NULL AND item = 'Steam-jacketed tilting kettle, 60 gal';
UPDATE muse.equipment SET batch_capacity_lb = 240 WHERE batch_capacity_lb IS NULL AND item = 'Combi oven, full size 20-pan';
UPDATE muse.equipment SET batch_capacity_lb = 120 WHERE batch_capacity_lb IS NULL AND item = 'Convection oven, double stack';
