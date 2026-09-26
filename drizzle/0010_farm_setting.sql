-- MicroFarm: home and commercial.
--
-- Equipment and fixed-cost lines name where they belong: the home grow room, or a rented
-- commercial facility. Existing rows are commercial unless they are the grow room's; the seed
-- sync (`pnpm farm:sync-setup`) brings seed rows in line with the code seed.

ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS setting text NOT NULL DEFAULT 'commercial';
ALTER TABLE farm.fixed_cost_lines ADD COLUMN IF NOT EXISTS setting text NOT NULL DEFAULT 'commercial';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'farm_equipment_setting_check') THEN
    ALTER TABLE farm.equipment ADD CONSTRAINT farm_equipment_setting_check CHECK (setting IN ('home', 'commercial'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'farm_fixed_cost_lines_setting_check') THEN
    ALTER TABLE farm.fixed_cost_lines ADD CONSTRAINT farm_fixed_cost_lines_setting_check CHECK (setting IN ('home', 'commercial'));
  END IF;
END $$;
