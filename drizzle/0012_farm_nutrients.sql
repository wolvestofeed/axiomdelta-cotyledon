-- Cotyledon: the Nutrients & Supplements library.
--
-- One row per nutrient solution or supplement a grow plan's nutrient line names: its strength in
-- ml per gallon, its cost per ml, the EC and pH it is managed to, what it is meant to elicit with
-- its science-library rows, and a note. Each figure is a tagged document (value, status, unit,
-- note). The library seeds itself from the code seed on first read, `source = 'seed'`; a row added
-- or edited in the app is `user_built`.

CREATE TABLE IF NOT EXISTS farm.nutrients (
  workspace_id  uuid         NOT NULL DEFAULT farm.current_workspace_id() REFERENCES farm.workspaces (id) ON DELETE CASCADE,
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text         NOT NULL,
  position      integer      NOT NULL DEFAULT 0,
  name          text         NOT NULL,
  ml_per_gal    jsonb        NOT NULL,
  cost_per_ml   jsonb        NOT NULL,
  ec_target     jsonb,
  ph_target     jsonb,
  elicits       jsonb,
  note          text         NOT NULL DEFAULT '',
  source        text         NOT NULL DEFAULT 'user_built',
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_nutrients_unique_key UNIQUE (workspace_id, key),
  CONSTRAINT farm_nutrients_source_check CHECK (source IN ('seed', 'user_built'))
);

CREATE INDEX IF NOT EXISTS farm_nutrients_workspace_idx ON farm.nutrients (workspace_id);

ALTER TABLE farm.nutrients ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm.nutrients FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS farm_nutrients_workspace ON farm.nutrients;
CREATE POLICY farm_nutrients_workspace ON farm.nutrients
  USING (workspace_id = farm.current_workspace_id())
  WITH CHECK (workspace_id = farm.current_workspace_id());
