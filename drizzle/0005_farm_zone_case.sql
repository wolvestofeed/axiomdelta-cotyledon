-- MicroFarm: the equipment zone check names the harvest zone as the code spells it.
--
-- The vocabulary swap that folded the migrations wrote the renamed zone in lower case; the zone
-- catalog (src/data/facility-design.ts) and every seed row spell it 'Harvest', so the seed insert
-- failed the check on the first live run.

ALTER TABLE farm.equipment DROP CONSTRAINT IF EXISTS farm_equipment_zone;
ALTER TABLE farm.equipment ADD CONSTRAINT farm_equipment_zone CHECK (zone IS NULL OR zone IN ('Hot line', 'A la carte', 'Prep', 'Packaging', 'Grow', 'Cold storage', 'Walk-in', 'Warewash', 'Harvest'));
