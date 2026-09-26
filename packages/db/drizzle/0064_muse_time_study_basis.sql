-- 0064_muse_time_study_basis.sql
-- Impact OS — a time study's basis: estimated or observed (Roadmap O2 follow-on).
--
-- Decision (Robert, 2026-09-15): every recipe in the library is seeded with an
-- ESTIMATED time study — a mock estimate per recipe step, built from the plan's
-- 14-task estimate and the thermal processing standards — and "Estimated"
-- shows on the rows until the recipe's first observed study is recorded. An
-- observed study carries a study date, an observer and a quality result; an
-- estimated one need not. Additive: existing rows are observed unless they are
-- the undated seed, which was the plan's estimate.

ALTER TABLE muse.time_studies ADD COLUMN IF NOT EXISTS basis text NOT NULL DEFAULT 'observed';

ALTER TABLE muse.time_studies DROP CONSTRAINT IF EXISTS muse_time_studies_basis;
ALTER TABLE muse.time_studies ADD CONSTRAINT muse_time_studies_basis CHECK (basis IN ('estimated', 'observed'));

UPDATE muse.time_studies SET basis = 'estimated' WHERE source = 'seed' AND studied_on IS NULL;
