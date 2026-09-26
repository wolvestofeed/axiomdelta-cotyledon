-- 0058_muse_equipment.sql
-- Impact OS — the equipment library (Roadmap Phase N, step N1).
--
-- The master equipment list is a definition with a real-world status, shared by
-- the Plan and the Actual ledgers (docs/muse/roadmaps/operating-model-roadmap.md):
--
--   status 'in_service' — bought and in use
--          'planned'    — planned for a build-out phase; in_service_date null = TBD
--          'no'         — considered and not selected
--          'unset'      — on the list, not selected and not needed
--
-- Capital, depreciation and financing count in_service and planned rows.
-- `key` is the stable reference the Sustainability equipment attributes, the
-- spec-sheet links and the entity links key on; it is the item name for every
-- row that existed before this table, so saved forecasts keep their attributes.
-- The rows are seeded once on first read from the capex schedule
-- (`_data/capex.ts`), split into Phase 1 and Phase 2 (Robert, 2026-09-14).
--
-- Money is integer cents; quantities are double precision, matching 0047/0048.

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.equipment (
  id               uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  key              text              NOT NULL UNIQUE,
  position         integer           NOT NULL DEFAULT 0,
  item             text              NOT NULL,
  category         text              NOT NULL,
  build_phase      integer           NOT NULL DEFAULT 1,
  status           text              NOT NULL DEFAULT 'unset',
  in_service_date  date,
  new_used         text              NOT NULL DEFAULT 'New',
  qty              double precision  NOT NULL DEFAULT 0,
  unit_cost_cents  integer           NOT NULL DEFAULT 0,
  critical         boolean           NOT NULL DEFAULT false,
  notes            text,
  -- 'seed' | 'user_built'; an edited seed row becomes user_built.
  source           text              NOT NULL DEFAULT 'user_built',
  created_by       text,
  updated_by       text,
  created_at       timestamptz       NOT NULL DEFAULT now(),
  updated_at       timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT muse_equipment_status CHECK (status IN ('in_service', 'planned', 'no', 'unset')),
  CONSTRAINT muse_equipment_build_phase CHECK (build_phase BETWEEN 1 AND 3),
  CONSTRAINT muse_equipment_new_used CHECK (new_used IN ('New', 'Used')),
  CONSTRAINT muse_equipment_qty CHECK (qty >= 0),
  CONSTRAINT muse_equipment_unit_cost CHECK (unit_cost_cents >= 0),
  CONSTRAINT muse_equipment_source CHECK (source IN ('seed', 'user_built'))
);

CREATE INDEX IF NOT EXISTS muse_equipment_status_idx ON muse.equipment (status, build_phase);
