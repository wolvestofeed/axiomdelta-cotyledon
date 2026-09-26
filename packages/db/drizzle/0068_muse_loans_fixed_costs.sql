-- 0068_muse_loans_fixed_costs.sql
-- Impact OS — loans and fixed-cost lines become definitions (Roadmap Phase N, step N1).
--
-- Two constant blocks leave `_data/capex.ts`:
--
--   financeParams      — one equipment loan and one leasehold loan, their
--                        principals DERIVED from the capex totals, their APR and
--                        term typed in code and editable only as a scenario
--                        overlay.
--   monthlyFixedCosts  — lease, utilities and admin as three fixed numbers.
--
-- They become rows, each carrying its real-world status, so one list holds what
-- is signed and what is planned:
--
--   * loans             — planned (a start date) or funded. The principal is
--                         TYPED (Robert, 2026-09-15): a loan may be for less
--                         than the capex it finances, or carry a deposit, and a
--                         principal that silently tracked an equipment edit
--                         could not express either. The capex total for the same
--                         purpose is shown beside it so any gap is visible.
--   * fixed_cost_lines  — planned (a start date) or in force (a signed lease, an
--                         open utility account). `treatment` is the accounting
--                         fact, separate from the label: lease and utilities are
--                         manufacturing overhead and absorb into inventory;
--                         admin is G&A and ASC 330-10-30-8 keeps it out. A new
--                         line states its own treatment rather than being
--                         inferred from its name.
--
-- Money in cents: these are stated commitments, not computed rates.
--
-- No backfill — both tables seed from the values the constants carried, written
-- by `_lib/seed-writes.ts` on first read, so the figures the model shows do not
-- move when this lands.

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.loans (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable across a reseed, so a saved forecast's overlay still finds its row —
  -- the same device as muse.equipment.key.
  key             text          NOT NULL,
  label           text          NOT NULL,
  -- What the borrowing is against: 'equipment' | 'leasehold' | 'other'. The
  -- capex total for the same purpose is reported beside the principal.
  purpose         text          NOT NULL DEFAULT 'other',
  -- 'planned' (not drawn; the start date is when it would be) | 'funded'.
  status          text          NOT NULL DEFAULT 'planned',
  principal_cents bigint        NOT NULL DEFAULT 0,
  -- Annual percentage rate as a fraction: 0.09 is 9%.
  apr             double precision NOT NULL DEFAULT 0,
  term_months     integer       NOT NULL DEFAULT 0,
  start_date      date          NOT NULL,
  notes           text,
  position        integer       NOT NULL DEFAULT 0,
  -- 'seed' | 'user_built'
  source          text          NOT NULL DEFAULT 'user_built',
  created_by      text,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE muse.loans DROP CONSTRAINT IF EXISTS muse_loans_status;
ALTER TABLE muse.loans ADD CONSTRAINT muse_loans_status CHECK (status IN ('planned', 'funded'));
ALTER TABLE muse.loans DROP CONSTRAINT IF EXISTS muse_loans_purpose;
ALTER TABLE muse.loans ADD CONSTRAINT muse_loans_purpose CHECK (purpose IN ('equipment', 'leasehold', 'other'));

CREATE UNIQUE INDEX IF NOT EXISTS muse_loans_key_idx ON muse.loans (key);
CREATE INDEX IF NOT EXISTS muse_loans_position_idx ON muse.loans (position);

CREATE TABLE IF NOT EXISTS muse.fixed_cost_lines (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable across a reseed; a saved forecast's overlay keys on it.
  key                 text          NOT NULL,
  label               text          NOT NULL,
  -- The operator's own grouping: 'lease' | 'utilities' | 'admin' | anything else.
  category            text          NOT NULL DEFAULT 'other',
  -- The accounting fact, never inferred from the label:
  -- 'manufacturing_overhead' absorbs into inventory on normal capacity
  -- (ASC 330-10-30-1/-3); 'general_admin' is a period cost (ASC 330-10-30-8).
  treatment           text          NOT NULL DEFAULT 'general_admin',
  -- 'planned' (a start date) | 'in_force' (signed lease, open account).
  status              text          NOT NULL DEFAULT 'planned',
  monthly_amount_cents bigint       NOT NULL DEFAULT 0,
  start_date          date,
  end_date            date,
  notes               text,
  position            integer       NOT NULL DEFAULT 0,
  source              text          NOT NULL DEFAULT 'user_built',
  created_by          text,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE muse.fixed_cost_lines DROP CONSTRAINT IF EXISTS muse_fixed_cost_lines_status;
ALTER TABLE muse.fixed_cost_lines ADD CONSTRAINT muse_fixed_cost_lines_status CHECK (status IN ('planned', 'in_force'));
ALTER TABLE muse.fixed_cost_lines DROP CONSTRAINT IF EXISTS muse_fixed_cost_lines_treatment;
ALTER TABLE muse.fixed_cost_lines ADD CONSTRAINT muse_fixed_cost_lines_treatment
  CHECK (treatment IN ('manufacturing_overhead', 'general_admin'));

CREATE UNIQUE INDEX IF NOT EXISTS muse_fixed_cost_lines_key_idx ON muse.fixed_cost_lines (key);
CREATE INDEX IF NOT EXISTS muse_fixed_cost_lines_position_idx ON muse.fixed_cost_lines (position);
