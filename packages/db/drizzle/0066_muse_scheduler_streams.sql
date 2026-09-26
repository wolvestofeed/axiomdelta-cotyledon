-- 0066_muse_scheduler_streams.sql
-- Impact OS — the scaffold split and the resource attributes (scheduler build plan §0, W0 step 1).
--
-- Decisions (Robert, 2026-09-15):
--   * The day is two streams. The BATCH stream ends at component chill and
--     stage; the DISPATCH stream runs first thing each delivery day from staged
--     components and is counted per portion shipped that day.
--   * One study per recipe, each line tagged `batch` or `dispatch`
--     (time_study_lines.stream). Batch lines keep the study's batch size as their
--     basis; dispatch lines are per portion shipped, a fixed dispatch line once
--     per delivery day.
--   * No second blast chill and no cold-hold labor line: both leave the
--     scaffold. The estimated seed studies are deleted where nothing adopted
--     them, so they re-seed on read on the new scaffold.
--   * Four resource attributes on the equipment row, estimated open fields like
--     the batch capacities: concurrent batches, changeover minutes, attended run,
--     may run unattended — with one basis for the four.

ALTER TABLE muse.time_study_lines ADD COLUMN IF NOT EXISTS stream text NOT NULL DEFAULT 'batch';
ALTER TABLE muse.time_study_lines DROP CONSTRAINT IF EXISTS muse_time_study_lines_stream;
ALTER TABLE muse.time_study_lines ADD CONSTRAINT muse_time_study_lines_stream CHECK (stream IN ('batch', 'dispatch'));

-- Observed lines recorded before the split carry the assembly, sealing and
-- loading tasks by name; they move to the dispatch stream.
UPDATE muse.time_study_lines SET stream = 'dispatch'
WHERE stream = 'batch' AND (task ILIKE 'Portion and assemble%' OR task ILIKE 'Seal, label%' OR task ILIKE 'Cold assembly%');

-- The estimated seeds with no adoption re-seed on read on the split scaffold (lines cascade).
DELETE FROM muse.time_studies WHERE source = 'seed' AND adopted_at IS NULL;

ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS concurrent_batches integer;
ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS changeover_minutes double precision;
ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS attended_run boolean;
ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS may_run_unattended boolean;
ALTER TABLE muse.equipment ADD COLUMN IF NOT EXISTS resource_basis text NOT NULL DEFAULT 'estimated';
ALTER TABLE muse.equipment DROP CONSTRAINT IF EXISTS muse_equipment_concurrent_batches;
ALTER TABLE muse.equipment ADD CONSTRAINT muse_equipment_concurrent_batches CHECK (concurrent_batches IS NULL OR concurrent_batches >= 1);
ALTER TABLE muse.equipment DROP CONSTRAINT IF EXISTS muse_equipment_changeover_minutes;
ALTER TABLE muse.equipment ADD CONSTRAINT muse_equipment_changeover_minutes CHECK (changeover_minutes IS NULL OR changeover_minutes >= 0);
ALTER TABLE muse.equipment DROP CONSTRAINT IF EXISTS muse_equipment_resource_basis;
ALTER TABLE muse.equipment ADD CONSTRAINT muse_equipment_resource_basis CHECK (resource_basis IN ('estimated', 'stated', 'observed'));

-- The estimated resource attributes (`_data/capex.ts` RESOURCE_SEED). A null
-- changeover on the blast chiller reads the capacity inputs' defrost-and-sanitize minutes.
UPDATE muse.equipment SET concurrent_batches = 1, attended_run = false, may_run_unattended = false
  WHERE concurrent_batches IS NULL AND item = 'Blast chiller, 200 lb capacity';
UPDATE muse.equipment SET concurrent_batches = 1, changeover_minutes = 0, attended_run = true, may_run_unattended = false
  WHERE concurrent_batches IS NULL AND item = 'Tilting braising pan / skillet, 40 gal';
UPDATE muse.equipment SET concurrent_batches = 1, changeover_minutes = 0, attended_run = false, may_run_unattended = false
  WHERE concurrent_batches IS NULL AND item IN ('Steam-jacketed tilting kettle, 100 gal', 'Steam-jacketed tilting kettle, 60 gal', 'Combi oven, full size 20-pan', 'Convection oven, double stack');
UPDATE muse.equipment SET concurrent_batches = 1, changeover_minutes = 0, attended_run = true, may_run_unattended = false
  WHERE concurrent_batches IS NULL AND item IN ('Vertical cutter mixer, 45 qt', 'Tray sealer, semi-automatic');
UPDATE muse.equipment SET attended_run = false, may_run_unattended = true
  WHERE attended_run IS NULL AND item IN ('Walk-in cooler, 12x20, with refrigeration', 'Walk-in cooler, 10x12, with refrigeration');
