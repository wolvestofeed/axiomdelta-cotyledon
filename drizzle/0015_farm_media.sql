-- MicroFarm: the Media library.
--
-- One row per growing medium a grow plan's medium line names: its form (loose fill, a cut mat
-- per tray, or none), its unit, how much one 1020 tray takes, its price per unit, its traits and
-- its science-library rows. Each figure is a tagged document (value, status, unit, note). The
-- library seeds itself from the code seed on first read, `source = 'seed'`; a row added or edited
-- in the app is `user_built`.

CREATE TABLE IF NOT EXISTS farm.media (
  workspace_id   uuid         NOT NULL DEFAULT farm.current_workspace_id() REFERENCES farm.workspaces (id) ON DELETE CASCADE,
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  key            text         NOT NULL,
  position       integer      NOT NULL DEFAULT 0,
  name           text         NOT NULL,
  form           text         NOT NULL,
  unit           text         NOT NULL,
  qty_per_1020   jsonb        NOT NULL,
  cost_per_unit  jsonb        NOT NULL,
  traits         jsonb        NOT NULL DEFAULT '{}'::jsonb,
  rows           jsonb        NOT NULL DEFAULT '[]'::jsonb,
  source         text         NOT NULL DEFAULT 'user_built',
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_media_unique_key UNIQUE (workspace_id, key),
  CONSTRAINT farm_media_form_check CHECK (form IN ('loose', 'mat', 'none')),
  CONSTRAINT farm_media_unit_check CHECK (unit IN ('gal', 'each', 'none')),
  CONSTRAINT farm_media_source_check CHECK (source IN ('seed', 'user_built'))
);

CREATE INDEX IF NOT EXISTS farm_media_workspace_idx ON farm.media (workspace_id);

ALTER TABLE farm.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm.media FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS farm_media_workspace ON farm.media;
CREATE POLICY farm_media_workspace ON farm.media
  USING (workspace_id = farm.current_workspace_id())
  WITH CHECK (workspace_id = farm.current_workspace_id());
