-- Cotyledon: the grow plan (outline §4) and the grow unit.
--
-- A grow plan row is a grow plan: it names its tray format, may override its varieties' stage days,
-- and carries a note. Its lines are typed documents of four kinds (seed, medium, nutrient, light)
-- in grow_plan_lines.line. An equipment row that is a grow unit carries its shelves, the shelf
-- width its tray counts are read against, and the fixture on its shelves.

ALTER TABLE farm.grow_plans ADD COLUMN IF NOT EXISTS format     text  NOT NULL DEFAULT 'flat-1020';
ALTER TABLE farm.grow_plans ADD COLUMN IF NOT EXISTS stage_days jsonb;
ALTER TABLE farm.grow_plans ADD COLUMN IF NOT EXISTS note       text  NOT NULL DEFAULT '';

ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS shelves        integer;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS shelf_width_in double precision;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS fixture_key    text;
