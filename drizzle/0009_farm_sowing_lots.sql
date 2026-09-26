-- MicroFarm: the sowing record's lots per variety, in grams.
--
-- A sowing carries one lot per variety (the seed issued in and the harvest out, in grams, with
-- the seed lot, the output lot code and the scrap) and the medium and nutrient issued to its
-- trays. The table held no sowing record when this ran, so nothing is converted.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'farm' AND table_name = 'sowing_records' AND column_name = 'components') THEN
    ALTER TABLE farm.sowing_records RENAME COLUMN components TO lots;
  END IF;
END $$;

ALTER TABLE farm.sowing_records ADD COLUMN IF NOT EXISTS issues jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER INDEX IF EXISTS farm.farm_sowing_records_components_gin RENAME TO farm_sowing_records_lots_gin;
