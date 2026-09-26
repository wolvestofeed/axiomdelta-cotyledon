-- 0061_muse_time_studies.sql
-- Impact OS — time studies per recipe (Roadmap Phase O, step O2).
--
-- Decisions (Robert, 2026-09-14): Labor is a log of time studies for each recipe
-- in the library, on a re-study cadence, with trends and a quality result. A
-- study times one batch's tasks — who, how long, how many people, fixed per
-- batch or variable per portion. An admin adopts the study that is the recipe's
-- labor standard; adoption is an entry on the posting trail. No wage or pay.
--
--   * time_studies          — one row per study; adopted_at marks an adoption
--                             (the latest adoption is the recipe's standard).
--   * time_study_lines      — the task lines of a study.
--   * time_study_intervals  — the re-study interval per recipe, in days.
--
-- The plan's time study for AMK-E-001 is seeded as its first study, with no
-- study date or quality result: it was estimated, not observed.

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.time_studies (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id       uuid         NOT NULL REFERENCES muse.recipes (id) ON DELETE CASCADE,
  -- Null only on a study recorded without a date (the seeded estimate).
  studied_on      date,
  batch_size      integer      NOT NULL,
  observer        text,
  -- 'pass' | 'hold' | 'fail'; null = not recorded.
  quality_result  text,
  quality_notes   text,
  adopted_at      timestamptz,
  adopted_by      text,
  source          text         NOT NULL DEFAULT 'user_built',
  created_by      text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT muse_time_studies_batch_size CHECK (batch_size > 0),
  CONSTRAINT muse_time_studies_quality CHECK (quality_result IS NULL OR quality_result IN ('pass', 'hold', 'fail')),
  CONSTRAINT muse_time_studies_source CHECK (source IN ('seed', 'user_built'))
);
CREATE INDEX IF NOT EXISTS muse_time_studies_recipe_idx ON muse.time_studies (recipe_id, studied_on);

CREATE TABLE IF NOT EXISTS muse.time_study_lines (
  id               uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id         uuid              NOT NULL REFERENCES muse.time_studies (id) ON DELETE CASCADE,
  position         integer           NOT NULL DEFAULT 0,
  task             text              NOT NULL,
  station          text,
  staff            integer           NOT NULL DEFAULT 1,
  elapsed_minutes  double precision  NOT NULL DEFAULT 0,
  labor_minutes    double precision  NOT NULL DEFAULT 0,
  -- 'fixed' (per batch) | 'variable' (per portion)
  scales_with      text              NOT NULL,
  CONSTRAINT muse_time_study_lines_staff CHECK (staff >= 0),
  CONSTRAINT muse_time_study_lines_minutes CHECK (elapsed_minutes >= 0 AND labor_minutes >= 0),
  CONSTRAINT muse_time_study_lines_scales CHECK (scales_with IN ('fixed', 'variable'))
);
CREATE INDEX IF NOT EXISTS muse_time_study_lines_study_idx ON muse.time_study_lines (study_id, position);

CREATE TABLE IF NOT EXISTS muse.time_study_intervals (
  recipe_id      uuid         PRIMARY KEY REFERENCES muse.recipes (id) ON DELETE CASCADE,
  interval_days  integer      NOT NULL,
  updated_by     text,
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT muse_time_study_intervals_days CHECK (interval_days > 0)
);
