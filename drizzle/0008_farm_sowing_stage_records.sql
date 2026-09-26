-- MicroFarm: the sowing record on the grow model (outline §4 Sowing).
--
-- A sowing names its tray format, the trays sown and packed, the grow unit the trays sat on, the
-- day they were packed, and the stage records the control points ask for: seed treatment, the
-- spent sprout irrigation water test, grow-room readings, the harvest check. A record written
-- before this carries nulls and is read as a Phase 1-era record.

ALTER TABLE farm.sowing_records ADD COLUMN IF NOT EXISTS format        text;
ALTER TABLE farm.sowing_records ADD COLUMN IF NOT EXISTS trays_sown    double precision;
ALTER TABLE farm.sowing_records ADD COLUMN IF NOT EXISTS trays_packed  double precision;
ALTER TABLE farm.sowing_records ADD COLUMN IF NOT EXISTS grow_unit_key text;
ALTER TABLE farm.sowing_records ADD COLUMN IF NOT EXISTS packed_on     date;
ALTER TABLE farm.sowing_records ADD COLUMN IF NOT EXISTS stage_records jsonb;
