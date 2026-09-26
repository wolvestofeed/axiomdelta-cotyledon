-- 0077_muse_facility_layouts.sql
-- Impact OS — the floor layout (facility-design roadmap, step Q6).
--
-- A layout is a drawing, not a ledger entry: the shell, the rooms drawn in it
-- and where each unit of the equipment library stands, in feet from the
-- shell's top-left corner. One drawing per scenario and build phase
-- (`scenario_key` is the scenario id, or 'plan-data' when no plan of record
-- is set). Versions are never overwritten: a save inserts the next version and
-- the page reads the latest. Nothing in the Plan or Actual ledger reads it;
-- the conformance checks and the measured-against-derived comparison do.

CREATE TABLE IF NOT EXISTS muse.facility_layouts (
  id              uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_key    text              NOT NULL,
  build_phase     integer           NOT NULL,
  version         integer           NOT NULL DEFAULT 1,
  label           text              NOT NULL DEFAULT '',
  shell_width_ft  double precision  NOT NULL,
  shell_depth_ft  double precision  NOT NULL,
  -- { rooms: LayoutRoom[], units: LayoutUnit[] } — see _engine/facility-layout.ts
  layout          jsonb             NOT NULL DEFAULT '{}'::jsonb,
  created_by      text,
  created_at      timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT muse_facility_layouts_phase CHECK (build_phase BETWEEN 1 AND 3),
  CONSTRAINT muse_facility_layouts_shell CHECK (shell_width_ft > 0 AND shell_depth_ft > 0),
  CONSTRAINT muse_facility_layouts_version UNIQUE (scenario_key, build_phase, version)
);

CREATE INDEX IF NOT EXISTS muse_facility_layouts_key_idx ON muse.facility_layouts (scenario_key, build_phase, version DESC);
