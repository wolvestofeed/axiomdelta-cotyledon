-- 0043_muse_scenarios.sql
-- Impact OS — scenario spine (M1).
--
-- First use of an isolated `muse` Postgres schema, per docs/muse/CLAUDE.md
-- §8 ("muse.* Postgres schema — isolated from CompTable's public schema").
-- Nothing here references the `public` tenancy model (orgs / locations):
-- Muse is a single workspace behind the Clerk viewer allowlist, so the
-- "which model is live" pointer is a singleton row, not a per-location column.
--
-- Two tables:
--
--   muse.scenarios        — a saved scenario. `config` is a JSONB overlay of
--                           edited values over the plan-data defaults
--                           (MuseScenarioConfig in the Muse _engine). The engine
--                           computes every dollar from defaults + this overlay;
--                           nothing derived is stored. `owner_tier` freezes the
--                           creator's tier at save time (super_admin | user).
--
--   muse.workspace_state  — singleton (id = 'default'). `active_scenario_id`
--                           is THE live master state the platform loads every
--                           session. Only a super admin's Apply moves this
--                           pointer; users save scenarios but never promote one.
--
-- Money and all figures live inside `config` as plain JSON numbers (the engine
-- rounds only at the presentation layer, matching the workbook). Reproducibility
-- of a past state = keep the scenario row; the defaults it overlays are code.

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.scenarios (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Operator free-text name for the scenario.
  label         text         NOT NULL,
  -- Provenance of the row: 'user_built' | 'seed' | 'imported'.
  source        text         NOT NULL DEFAULT 'user_built',
  -- MuseScenarioConfig overlay (sectioned partial of editable inputs).
  config        jsonb        NOT NULL DEFAULT '{}'::jsonb,
  -- Clerk user id of the creator.
  owner_user_id text         NOT NULL,
  -- Creator's tier at save time: 'super_admin' | 'user'.
  owner_tier    text         NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS muse_scenarios_owner_idx
  ON muse.scenarios (owner_user_id);
CREATE INDEX IF NOT EXISTS muse_scenarios_created_idx
  ON muse.scenarios (created_at);

CREATE TABLE IF NOT EXISTS muse.workspace_state (
  -- Single row. The CHECK keeps it a singleton.
  id                 text         PRIMARY KEY DEFAULT 'default',
  active_scenario_id uuid         REFERENCES muse.scenarios (id) ON DELETE SET NULL,
  applied_at         timestamptz,
  applied_by         text,
  CONSTRAINT muse_workspace_state_singleton CHECK (id = 'default')
);

-- Seed the singleton so reads never have to create it. Active model is null
-- until a super admin applies one — the app falls back to plan-data defaults.
INSERT INTO muse.workspace_state (id) VALUES ('default')
  ON CONFLICT (id) DO NOTHING;
