-- MicroFarm: workspaces. One workspace per farm, one Clerk organization per workspace.
--
-- Every farm table carries workspace_id and is protected by row-level security keyed on
-- the session setting app.workspace_id, which the app sets inside a transaction at every
-- entry point (apps/web/src/app/(farm)/farm/_lib/workspace.ts). A query with no workspace
-- in scope sees no rows and can insert none: isolation fails closed at the database.

CREATE TABLE IF NOT EXISTS farm.workspaces (
  id                 uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The Clerk organization this workspace is. One org, one farm.
  clerk_org_id       text         NOT NULL UNIQUE,
  name               text         NOT NULL,
  slug               text,
  time_zone          text         NOT NULL DEFAULT 'America/Chicago',
  -- The farm's subscription to the software (Phase 6).
  stripe_customer_id text,
  plan               text         NOT NULL DEFAULT 'founding',
  status             text         NOT NULL DEFAULT 'active',
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now()
);

-- The workspace in scope for this transaction, or NULL when none is set.
CREATE OR REPLACE FUNCTION farm.current_workspace_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('app.workspace_id', true), '')::uuid
  $$;

-- ── workspace_id on every table, indexed, defaulted from the scope, and policed ──

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scenarios', 'workspace_state', 'sources', 'source_figures', 'supplier_lca_options', 'entity_links',
    'supplier_items', 'supplier_item_prices', 'loans', 'fixed_cost_lines', 'leasehold_lines', 'training_docs',
    'training_assignments', 'purchase_orders', 'purchase_order_lines', 'sowing_records', 'receipts',
    'distributions', 'period_bills', 'fiscal_periods', 'calendar_closures', 'posting_log', 'standard_versions',
    'crop_plans', 'crop_plan_lines', 'subscribers', 'subscriber_pickup_points', 'subscriber_services',
    'service_volume_picks', 'pickup_point_calendar_ranges', 'subscription_cycles', 'subscription_cycle_days',
    'orders', 'supplier_terms', 'invoices', 'subscriber_payments', 'supplier_bills', 'supplier_payments',
    'opening_balances', 'staff', 'time_punches', 'equipment', 'facility_layouts', 'packages',
    'crop_plan_packages', 'payroll_periods', 'time_studies', 'time_study_lines', 'time_study_intervals',
    'sustainability_readings', 'refrigerant_service'
  ] LOOP
    -- Rows from before workspaces existed are the Phase 0 seed, which the app re-seeds per workspace on
    -- first read; no workspace exists yet for them to belong to, so they go before the column arrives.
    EXECUTE format('DELETE FROM farm.%I', t);
    EXECUTE format(
      'ALTER TABLE farm.%I ADD COLUMN IF NOT EXISTS workspace_id uuid NOT NULL DEFAULT farm.current_workspace_id() REFERENCES farm.workspaces (id) ON DELETE CASCADE',
      t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS farm_%s_workspace_idx ON farm.%I (workspace_id)', t, t);
    EXECUTE format('ALTER TABLE farm.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE farm.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS farm_%s_workspace ON farm.%I', t, t);
    EXECUTE format(
      'CREATE POLICY farm_%s_workspace ON farm.%I USING (workspace_id = farm.current_workspace_id()) WITH CHECK (workspace_id = farm.current_workspace_id())',
      t, t);
  END LOOP;
END $$;

-- ── Keys that were global become per workspace ──

-- Singletons keyed by a fixed id: one row per workspace.
ALTER TABLE farm.workspace_state DROP CONSTRAINT IF EXISTS workspace_state_pkey;
ALTER TABLE farm.workspace_state ADD PRIMARY KEY (workspace_id, id);

ALTER TABLE farm.fiscal_periods DROP CONSTRAINT IF EXISTS fiscal_periods_pkey;
ALTER TABLE farm.fiscal_periods ADD PRIMARY KEY (workspace_id, period);

ALTER TABLE farm.supplier_terms DROP CONSTRAINT IF EXISTS supplier_terms_pkey;
ALTER TABLE farm.supplier_terms ADD PRIMARY KEY (workspace_id, supplier_id);

-- User-visible keys: unique within a workspace.
ALTER TABLE farm.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_po_number_key;
ALTER TABLE farm.purchase_orders ADD CONSTRAINT purchase_orders_po_number_key UNIQUE (workspace_id, po_number);

ALTER TABLE farm.sowing_records DROP CONSTRAINT IF EXISTS sowing_records_sowing_id_key;
ALTER TABLE farm.sowing_records ADD CONSTRAINT sowing_records_sowing_id_key UNIQUE (workspace_id, sowing_id);

ALTER TABLE farm.crop_plans DROP CONSTRAINT IF EXISTS crop_plans_code_key;
ALTER TABLE farm.crop_plans ADD CONSTRAINT crop_plans_code_key UNIQUE (workspace_id, code);

ALTER TABLE farm.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
ALTER TABLE farm.invoices ADD CONSTRAINT invoices_invoice_number_key UNIQUE (workspace_id, invoice_number);

ALTER TABLE farm.equipment DROP CONSTRAINT IF EXISTS equipment_key_key;
ALTER TABLE farm.equipment ADD CONSTRAINT equipment_key_key UNIQUE (workspace_id, key);

ALTER TABLE farm.payroll_periods DROP CONSTRAINT IF EXISTS payroll_periods_staffing_ref_key;
ALTER TABLE farm.payroll_periods ADD CONSTRAINT payroll_periods_staffing_ref_key UNIQUE (workspace_id, staffing_ref);

ALTER TABLE farm.standard_versions DROP CONSTRAINT IF EXISTS standard_versions_crop_plan_code_version_key;
ALTER TABLE farm.standard_versions ADD CONSTRAINT standard_versions_crop_plan_code_version_key UNIQUE (workspace_id, crop_plan_code, version);

ALTER TABLE farm.facility_layouts DROP CONSTRAINT IF EXISTS farm_facility_layouts_version;
ALTER TABLE farm.facility_layouts ADD CONSTRAINT farm_facility_layouts_version UNIQUE (workspace_id, scenario_key, build_phase, version);

DROP INDEX IF EXISTS farm.farm_sources_sha256_idx;
CREATE UNIQUE INDEX farm_sources_sha256_idx ON farm.sources (workspace_id, sha256) WHERE sha256 IS NOT NULL;
DROP INDEX IF EXISTS farm.farm_sources_url_idx;
CREATE UNIQUE INDEX farm_sources_url_idx ON farm.sources (workspace_id, source_url) WHERE source_url IS NOT NULL AND sha256 IS NULL;
DROP INDEX IF EXISTS farm.farm_source_figures_provenance_idx;
CREATE UNIQUE INDEX farm_source_figures_provenance_idx ON farm.source_figures (workspace_id, provenance_id) WHERE provenance_id IS NOT NULL;
DROP INDEX IF EXISTS farm.farm_entity_links_edge_uniq;
CREATE UNIQUE INDEX farm_entity_links_edge_uniq ON farm.entity_links (workspace_id, from_kind, from_id, relation, to_kind, to_id);
DROP INDEX IF EXISTS farm.farm_staff_email_uniq;
CREATE UNIQUE INDEX farm_staff_email_uniq ON farm.staff (workspace_id, email) WHERE email IS NOT NULL;
DROP INDEX IF EXISTS farm.farm_loans_key_idx;
CREATE UNIQUE INDEX farm_loans_key_idx ON farm.loans (workspace_id, key);
DROP INDEX IF EXISTS farm.farm_fixed_cost_lines_key_idx;
CREATE UNIQUE INDEX farm_fixed_cost_lines_key_idx ON farm.fixed_cost_lines (workspace_id, key);
DROP INDEX IF EXISTS farm.farm_leasehold_lines_key_idx;
CREATE UNIQUE INDEX farm_leasehold_lines_key_idx ON farm.leasehold_lines (workspace_id, key);
DROP INDEX IF EXISTS farm.farm_training_docs_key_version_idx;
CREATE UNIQUE INDEX farm_training_docs_key_version_idx ON farm.training_docs (workspace_id, doc_key, version);
DROP INDEX IF EXISTS farm.farm_training_docs_one_active_idx;
CREATE UNIQUE INDEX farm_training_docs_one_active_idx ON farm.training_docs (workspace_id, doc_key) WHERE published_at IS NOT NULL AND archived_at IS NULL;
