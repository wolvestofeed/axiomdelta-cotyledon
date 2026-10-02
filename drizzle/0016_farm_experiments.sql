-- Cotyledon: experiments in R&D.
--
-- An experiment is a titled run of a developing grow plan: the plan, the sow date and the trays.
-- From its sow date it takes its place on the grow units like any sowing. It closes through the
-- grow form into a sowing record that names it (`sowing_records.experiment_id`); an experiment is
-- closed when a record names it, so it carries no status of its own.

CREATE TABLE IF NOT EXISTS farm.experiments (
  workspace_id    uuid              NOT NULL DEFAULT farm.current_workspace_id() REFERENCES farm.workspaces (id) ON DELETE CASCADE,
  id              uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text              NOT NULL,
  grow_plan_code  text              NOT NULL,
  sow_date        date              NOT NULL,
  trays           double precision  NOT NULL,
  note            text,
  created_by      text,
  created_at      timestamptz       NOT NULL DEFAULT now(),
  updated_at      timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT farm_experiments_trays_check CHECK (trays > 0)
);

CREATE INDEX IF NOT EXISTS farm_experiments_workspace_idx ON farm.experiments (workspace_id);
CREATE INDEX IF NOT EXISTS farm_experiments_plan_idx ON farm.experiments (grow_plan_code);

ALTER TABLE farm.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm.experiments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS farm_experiments_workspace ON farm.experiments;
CREATE POLICY farm_experiments_workspace ON farm.experiments
  USING (workspace_id = farm.current_workspace_id())
  WITH CHECK (workspace_id = farm.current_workspace_id());

ALTER TABLE farm.sowing_records ADD COLUMN IF NOT EXISTS experiment_id uuid REFERENCES farm.experiments (id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS farm_sowing_records_experiment_idx ON farm.sowing_records (experiment_id) WHERE experiment_id IS NOT NULL;
