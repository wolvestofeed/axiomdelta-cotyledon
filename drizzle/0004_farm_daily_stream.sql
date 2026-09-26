-- MicroFarm: the daily labor stream (outline §5 rule 3).
--
-- A time study's lines run on three streams: per sowing on the sow day, per tray per day while
-- the tray is on its grow unit, per unit on the distribution day. A study records the cycle days
-- its daily lines multiply by; a Phase 1-era two-stream study carries zero.

ALTER TABLE farm.time_studies ADD COLUMN IF NOT EXISTS cycle_days integer NOT NULL DEFAULT 0;

ALTER TABLE farm.time_study_lines DROP CONSTRAINT IF EXISTS farm_time_study_lines_stream;
ALTER TABLE farm.time_study_lines ADD CONSTRAINT farm_time_study_lines_stream CHECK (stream IN ('sowing', 'daily', 'harvest'));
