-- Cotyledon: every time study is approved, and records what the studied sowing consumed.
--
-- Adoption becomes approval: a plan's labor standard is the average of its approved studies, not
-- the one adopted last, so `adopted_at` and `adopted_by` become `approved_at` and `approved_by`.
-- A study also records the water and supplements applied to the sowing it timed: `consumption`
-- holds the day's waterings by method (fluid ounces per tray per watering, waterings, trays) and
-- the supplements applied (ml, the trays they went on). No study had been adopted when this ran.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'farm' AND table_name = 'time_studies' AND column_name = 'adopted_at') THEN
    ALTER TABLE farm.time_studies RENAME COLUMN adopted_at TO approved_at;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'farm' AND table_name = 'time_studies' AND column_name = 'adopted_by') THEN
    ALTER TABLE farm.time_studies RENAME COLUMN adopted_by TO approved_by;
  END IF;
END $$;

ALTER TABLE farm.time_studies ADD COLUMN IF NOT EXISTS consumption jsonb NOT NULL DEFAULT '{"water": [], "supplements": []}'::jsonb;
