-- MicroFarm: a sowing's output is one count in its format.
--
-- The sowing record carried a second count, the units its trays became, from the source client's
-- servings. A tray, flat or jar is the unit a subscriber buys, so the trays packed are the output
-- and the column goes.

ALTER TABLE farm.sowing_records DROP COLUMN IF EXISTS servings_produced;
