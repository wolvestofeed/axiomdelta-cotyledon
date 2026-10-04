-- Cotyledon: the farm schema. One consolidated migration set; no prior history to preserve.

-- ── farm_scenarios.sql ──
-- 0043_farm_scenarios.sql
-- Cotyledon — scenario spine (M1).
--
-- First use of an isolated `farm` Postgres schema, per docs/farm/CLAUDE.md
-- §8 ("farm.* Postgres schema — isolated from Staffing's public schema").
-- Nothing here references the `public` tenancy model (orgs / locations):
-- farm is a single workspace behind the Clerk viewer allowlist, so the
-- "which model is live" pointer is a singleton row, not a per-location column.
--
-- Two tables:
--
--   farm.scenarios        — a saved scenario. `config` is a JSONB overlay of
--                           edited values over the plan-data defaults
--                           (farmScenarioConfig in the farm _engine). The engine
--                           computes every dollar from defaults + this overlay;
--                           nothing derived is stored. `owner_tier` freezes the
--                           creator's tier at save time (super_admin | user).
--
--   farm.workspace_state  — singleton (id = 'default'). `active_scenario_id`
--                           is THE live master state the platform loads every
--                           session. Only a super admin's Apply moves this
--                           pointer; users save scenarios but never promote one.
--
-- Money and all figures live inside `config` as plain JSON numbers (the engine
-- rounds only at the presentation layer, matching the workbook). Reproducibility
-- of a past state = keep the scenario row; the defaults it overlays are code.

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.scenarios (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Operator free-text name for the scenario.
  label         text         NOT NULL,
  -- Provenance of the row: 'user_built' | 'seed' | 'imported'.
  source        text         NOT NULL DEFAULT 'user_built',
  -- farmScenarioConfig overlay (sectioned partial of editable inputs).
  config        jsonb        NOT NULL DEFAULT '{}'::jsonb,
  -- Clerk user id of the creator.
  owner_user_id text         NOT NULL,
  -- Creator's tier at save time: 'super_admin' | 'user'.
  owner_tier    text         NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS farm_scenarios_owner_idx
  ON farm.scenarios (owner_user_id);
CREATE INDEX IF NOT EXISTS farm_scenarios_created_idx
  ON farm.scenarios (created_at);

CREATE TABLE IF NOT EXISTS farm.workspace_state (
  -- Single row. The CHECK keeps it a singleton.
  id                 text         PRIMARY KEY DEFAULT 'default',
  active_scenario_id uuid         REFERENCES farm.scenarios (id) ON DELETE SET NULL,
  applied_at         timestamptz,
  applied_by         text,
  CONSTRAINT farm_workspace_state_singleton CHECK (id = 'default')
);

-- Seed the singleton so reads never have to create it. Active model is null
-- until a super admin applies one — the app falls back to plan-data defaults.
INSERT INTO farm.workspace_state (id) VALUES ('default')
  ON CONFLICT (id) DO NOTHING;

-- ── farm_sources.sql ──
-- 0044_farm_sources.sql
-- Cotyledon — sources registry (Sustainability S2b).
--
-- Two tables in the isolated `farm` schema:
--
--   farm.sources         — a registered document or publication: a study, an
--                          LCA, a dataset, a regulation, a rate schedule, a
--                          supplier report. The file itself is stored inline
--                          (bytea) so the platform can render it without a
--                          third-party store; `file_bytes` is NULL for
--                          URL-only sources. `sha256` de-duplicates uploads.
--
--   farm.source_figures  — a figure drawn from a source: value, unit, where in
--                          the document it sits (slide, sheet/column, table),
--                          its status tag and effective date. `provenance_id`
--                          is the factor library's stable id, so any cited
--                          number on any page resolves to a row here and from
--                          there to the document.
--
-- Nothing derived is stored. Status tags mirror the platform's provenance
-- vocabulary (SOURCED / STATED / PLACEHOLDER / DERIVED / UNCONFIRMED / DATED).

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.sources (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'study' | 'lca' | 'dataset' | 'regulation' | 'rate_schedule' | 'supplier_report' | 'other'
  kind          text         NOT NULL DEFAULT 'other',
  title         text         NOT NULL,
  authors       text,
  publisher     text,
  year          integer,
  citation      text,
  source_url    text,
  licence_note  text,
  -- Provenance status of the document as a whole.
  status        text         NOT NULL DEFAULT 'SOURCED',
  notes         text,
  -- File, when one is stored. NULL for URL-only sources.
  file_name     text,
  file_mime     text,
  file_size     integer,
  sha256        text,
  file_bytes    bytea,
  uploaded_by   text,
  uploaded_at   timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS farm_sources_sha256_idx
  ON farm.sources (sha256) WHERE sha256 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS farm_sources_url_idx
  ON farm.sources (source_url) WHERE source_url IS NOT NULL AND sha256 IS NULL;
CREATE INDEX IF NOT EXISTS farm_sources_kind_idx
  ON farm.sources (kind);

CREATE TABLE IF NOT EXISTS farm.source_figures (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      uuid         NOT NULL REFERENCES farm.sources (id) ON DELETE CASCADE,
  -- Factor-library id, e.g. 'epa-hub-2025:natural-gas'. Unique when present.
  provenance_id  text,
  label          text         NOT NULL,
  value_text     text,
  unit           text,
  -- Where in the document: 'slide 19', 'Database sheet, col BM', 'Table 1'.
  locator        text,
  status         text         NOT NULL DEFAULT 'SOURCED',
  effective_from date,
  version        text,
  note           text,
  created_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS farm_source_figures_provenance_idx
  ON farm.source_figures (provenance_id) WHERE provenance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS farm_source_figures_source_idx
  ON farm.source_figures (source_id);

-- ── farm_supplier_lca_options.sql ──
-- 0045_farm_supplier_lca_options.sql
-- Cotyledon — supplier-specific LCA options (Sustainability S4).
--
-- A figure a specific supplier supplies for a specific grow_plan input, with
-- the supplier's own document registered in farm.sources. It appears as a
-- "supplier" option in the per-input LCA basis selector beside the study
-- mean and any curated cited LCA. Boundary is stated so the engine can align
-- the figure to the study's retail-weight basis before comparison.
--
-- supplier_id is the compiled directory's operation id (public-records
-- compilation, not a database row); supplier_name is denormalised for display.

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.supplier_lca_options (
  id              uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     text              NOT NULL,
  supplier_name   text              NOT NULL,
  -- grow_plan input name, e.g. 'Ground beef, 85/15'.
  input      text              NOT NULL,
  label           text              NOT NULL,
  kg_co2e_per_kg  double precision  NOT NULL,
  unit_note       text,
  -- 'retail' | 'slaughter_gate' | 'farm_gate'
  boundary        text              NOT NULL DEFAULT 'farm_gate',
  source_id       uuid              REFERENCES farm.sources (id) ON DELETE SET NULL,
  status          text              NOT NULL DEFAULT 'STATED',
  note            text,
  created_by      text,
  created_at      timestamptz       NOT NULL DEFAULT now(),
  updated_at      timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS farm_supplier_lca_input_idx
  ON farm.supplier_lca_options (input);
CREATE INDEX IF NOT EXISTS farm_supplier_lca_supplier_idx
  ON farm.supplier_lca_options (supplier_id);

-- ── farm_entity_links.sql ──
-- 0046_farm_entity_links.sql
-- Cotyledon — links that are facts of record.
--
-- One record referring to another is stored two different ways in farm, and the
-- distinction is deliberate:
--
--   * A link that changes a MODEL INPUT is a scenario edit, held in the
--     farm.scenarios JSONB overlay (input -> supplier, pickup_point -> prospect,
--     activity input -> document). It belongs to a forecast and moves when a
--     super admin applies one.
--
--   * A link that is a FACT OF RECORD lives here. A lot was received from an
--     operation; a lot shipped to a pickup_point; a journal entry is evidenced by an
--     invoice; a role is assigned a course. These are not forecast inputs — they
--     happened, and they stay true across every scenario.
--
-- Both sides are kind-qualified free text rather than foreign keys, because the
-- "from" and "to" records live in four different places: the compiled
-- public-records supplier directory, the compiled prospect list, the typed
-- plan-data reference, and farm.sources. Only source links can be enforced
-- relationally, and they are not, so one table serves every pair.
--
-- The unique index makes a link idempotent: recording the same pair twice
-- updates the note instead of duplicating the edge.

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.entity_links (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'lot' | 'ledger_entry' | 'role' | 'supplier' | 'pickup_point' | 'course' | 'source' | …
  from_kind   text          NOT NULL,
  from_id     text          NOT NULL,
  to_kind     text          NOT NULL,
  to_id       text          NOT NULL,
  -- What the link asserts: 'received_from', 'shipped_to', 'evidenced_by',
  -- 'assigned', 'certificate'.
  relation    text          NOT NULL,
  note        text,
  created_by  text,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS farm_entity_links_edge_uniq
  ON farm.entity_links (from_kind, from_id, relation, to_kind, to_id);

CREATE INDEX IF NOT EXISTS farm_entity_links_from_idx
  ON farm.entity_links (from_kind, from_id);

CREATE INDEX IF NOT EXISTS farm_entity_links_to_idx
  ON farm.entity_links (to_kind, to_id);

-- ── farm_supplier_catalog_and_pos.sql ──
-- 0047_farm_supplier_catalog_and_pos.sql
-- Cotyledon — supplier seasonal catalogs and generated purchase orders.
--
-- Two things a supplier relationship needs that no public directory carries:
--
--   * supplier_items — what this operation actually sells, on the terms it sells
--     it: pack, price, minimum, lead time, and the months it is available. This
--     is the seasonal catalog, imported from the price sheet a grower emails.
--     Seasonality is stored as two month numbers so a window can wrap the year
--     end (October through March is start 10, end 3).
--
--   * purchase_orders / purchase_order_lines — the orders we generate. A PO is a
--     DOCUMENT: once issued it states what was ordered at what price, and must
--     not silently change when the model behind it does. So its lines are
--     written down, unlike every computed figure elsewhere in the platform.
--     That is the exception to "every dollar is computed", and it is deliberate.
--
-- Money: catalog unit price is double precision (a reference price that may
-- carry sub-cent precision, e.g. $3.4567/lb), PO line amounts are integer cents
-- (a document that must total exactly), matching the ledger convention.
--
-- supplier_id is the compiled directory's operation id (a public-records
-- compilation, not a row we own); supplier_name is denormalised so an issued PO
-- still reads correctly if the directory is later refreshed.

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.supplier_items (
  id                uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       text              NOT NULL,
  item              text              NOT NULL,
  category          text,
  -- Variety for crops, breed for livestock.
  variety           text,
  pack_size         text,
  unit              text              NOT NULL DEFAULT 'lb',
  unit_price        double precision,
  -- What the unit price is per: 'lb' | 'case' | 'each' | 'dozen' | 'cwt'.
  price_basis       text,
  min_order_qty     double precision,
  lead_time_days    integer,
  -- Availability window as month numbers 1-12; may wrap the year end.
  avail_start_month integer,
  avail_end_month   integer,
  -- Certification claimed on THIS item, which can be narrower than the
  -- operation's certification scope.
  certification     text,
  origin            text,
  sku               text,
  notes             text,
  -- The price sheet this line was imported from, registered in farm.sources.
  source_id         uuid              REFERENCES farm.sources (id) ON DELETE SET NULL,
  imported_at       timestamptz,
  created_by        text,
  created_at        timestamptz       NOT NULL DEFAULT now(),
  updated_at        timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT farm_supplier_items_month_range CHECK (
    (avail_start_month IS NULL OR avail_start_month BETWEEN 1 AND 12) AND
    (avail_end_month   IS NULL OR avail_end_month   BETWEEN 1 AND 12)
  )
);

CREATE INDEX IF NOT EXISTS farm_supplier_items_supplier_idx
  ON farm.supplier_items (supplier_id);
CREATE INDEX IF NOT EXISTS farm_supplier_items_item_idx
  ON farm.supplier_items (item);

CREATE TABLE IF NOT EXISTS farm.purchase_orders (
  id                uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  -- AMK-PO-YYYYMMDD-NN, unique across the register.
  po_number         text              NOT NULL UNIQUE,
  supplier_id       text              NOT NULL,
  supplier_name     text              NOT NULL,
  -- 'draft' | 'issued' | 'received' | 'closed' | 'cancelled'
  status            text              NOT NULL DEFAULT 'draft',
  -- The production date this order buys for.
  ordered_for       date              NOT NULL,
  subtotal_cents    integer           NOT NULL DEFAULT 0,
  notes             text,
  issued_at         timestamptz,
  received_at       timestamptz,
  closed_at         timestamptz,
  created_by        text,
  created_at        timestamptz       NOT NULL DEFAULT now(),
  updated_at        timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS farm_purchase_orders_supplier_idx
  ON farm.purchase_orders (supplier_id);
CREATE INDEX IF NOT EXISTS farm_purchase_orders_status_idx
  ON farm.purchase_orders (status);
CREATE INDEX IF NOT EXISTS farm_purchase_orders_ordered_for_idx
  ON farm.purchase_orders (ordered_for);

CREATE TABLE IF NOT EXISTS farm.purchase_order_lines (
  id                uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id             uuid              NOT NULL REFERENCES farm.purchase_orders (id) ON DELETE CASCADE,
  -- The grow_plan line this covers, so a PO traces back to what drove it.
  input        text              NOT NULL,
  -- The supplier's own catalog line, when the input matched one.
  supplier_item_id  uuid              REFERENCES farm.supplier_items (id) ON DELETE SET NULL,
  item              text              NOT NULL,
  qty               double precision  NOT NULL,
  unit              text              NOT NULL,
  pack_size         text,
  cases             integer,
  unit_price_cents  integer           NOT NULL DEFAULT 0,
  extended_cents    integer           NOT NULL DEFAULT 0,
  notes             text,
  created_at        timestamptz       NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS farm_purchase_order_lines_po_idx
  ON farm.purchase_order_lines (po_id);

-- ── farm_actuals.sql ──
-- 0048_farm_actuals.sql
-- Cotyledon — actuals: the recorded facts that replace forecast lines.
--
-- The platform is a forecaster that becomes the operating system as data arrives.
-- Every table here is a FACT OF RECORD captured when the event happens, read by
-- the same engine the forecast feeds. A period with records posts from them; a
-- period without posts from the open forecast. No page computes a dollar from a
-- typed total: the sowing record carries weights, hours and lot codes, and the
-- ledger derives the cost; the receipt carries quantities and an invoice price,
-- and the ledger derives the price variance; the distribution carries units and a
-- price, and the ledger derives revenue and cost of goods sold.
--
--   * sowing_records — the ISA-95 production performance object the ledger
--     already consumes (`sowingExecution` in the farm engine). Per-component
--     issued / harvested / blackout / packed weights, scrap with reason codes, input
--     lot codes and the CONTROL_POINT-2 cooling measurements are one JSONB document
--     because they are one physical event; a GIN index lets a recall trace ask
--     "which sowings consumed lot X".
--   * receipts — goods received against a purchase order (or without one), with
--     the lot code assigned on receipt and the invoice price. Raw materials are
--     received at standard; the invoice against standard is the purchase price
--     variance.
--   * distributions — units distributed by channel, pickup_point and date at the price
--     charged. Revenue and cost of goods sold post from these.
--   * period_bills — occupancy, utilities, admin and other period costs by
--     month. Manufacturing overhead incurred and G&A post from these.
--
-- Money is integer cents on documents (invoice totals, prices charged) and
-- double precision on physical quantities, matching 0047.

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.sowing_records (
  id                 uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Operator-visible sowing id, e.g. B-260914-01. Unique.
  sowing_id           text              NOT NULL UNIQUE,
  grow_plan_code        text              NOT NULL,
  production_date    date              NOT NULL,
  -- The grow_plan standard in force on the production date, so cost is reproducible.
  standard_version   text              NOT NULL,
  planned_units   double precision  NOT NULL,
  -- Base-unit equivalents that passed and were packed. Drives everything downstream.
  good_units      double precision  NOT NULL,
  -- blackout rack sowings the record covers (fixed labor is per sowing).
  sowings_run        integer           NOT NULL DEFAULT 1,
  -- units the units became; NULL = one unit per unit.
  servings_produced     double precision,
  -- ComponentExecution[]: consumed lots, stage weights, scrap, stage record.
  components         jsonb             NOT NULL DEFAULT '[]'::jsonb,
  actual_labor_hours double precision,
  actual_labor_rate  double precision,
  -- The production-record signature.
  closed_by          text,
  closed_at          timestamptz,
  notes              text,
  created_by         text,
  created_at         timestamptz       NOT NULL DEFAULT now(),
  updated_at         timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT farm_sowing_records_sowings_positive CHECK (sowings_run >= 1),
  CONSTRAINT farm_sowing_records_units_nonneg CHECK (good_units >= 0 AND planned_units >= 0)
);
CREATE INDEX IF NOT EXISTS farm_sowing_records_date_idx ON farm.sowing_records (production_date);
CREATE INDEX IF NOT EXISTS farm_sowing_records_components_gin ON farm.sowing_records USING gin (components);

CREATE TABLE IF NOT EXISTS farm.receipts (
  id                 uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id              uuid              REFERENCES farm.purchase_orders (id) ON DELETE SET NULL,
  supplier_id        text,
  supplier_name      text,
  received_on        date              NOT NULL,
  invoice_number     text,
  invoice_total_cents integer,
  -- [{ input, qty, unit, lotCode, unitPriceCents }]
  lines              jsonb             NOT NULL DEFAULT '[]'::jsonb,
  received_by        text,
  notes              text,
  created_by         text,
  created_at         timestamptz       NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS farm_receipts_date_idx ON farm.receipts (received_on);
CREATE INDEX IF NOT EXISTS farm_receipts_po_idx ON farm.receipts (po_id);

CREATE TABLE IF NOT EXISTS farm.distributions (
  id                 uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  distributed_on       date              NOT NULL,
  -- Sales channel: 1 prospect, 2 restaurants, 3 retail and wholesale / retail.
  phase              integer           NOT NULL,
  pickup_point_id            text,
  pickup_point_name          text,
  units              double precision  NOT NULL,
  price_per_unit_cents integer         NOT NULL,
  -- Finished-goods lot codes shipped, for the forward trace.
  lot_codes          jsonb             NOT NULL DEFAULT '[]'::jsonb,
  distributed_by       text,
  notes              text,
  created_by         text,
  created_at         timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT farm_distributions_units_nonneg CHECK (units >= 0),
  CONSTRAINT farm_distributions_phase_range CHECK (phase BETWEEN 1 AND 3)
);
CREATE INDEX IF NOT EXISTS farm_distributions_date_idx ON farm.distributions (distributed_on);
CREATE INDEX IF NOT EXISTS farm_distributions_phase_idx ON farm.distributions (phase);

CREATE TABLE IF NOT EXISTS farm.period_bills (
  id                 uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  -- YYYY-MM
  period             text              NOT NULL,
  -- 'lease' | 'utilities' | 'admin' | 'other'
  category           text              NOT NULL,
  -- Ledger account the bill posts to; set from the category unless 'other'.
  account_code       text              NOT NULL,
  amount_cents       integer           NOT NULL,
  vendor             text,
  invoice_number     text,
  incurred_on        date,
  paid_on            date,
  source_id          uuid              REFERENCES farm.sources (id) ON DELETE SET NULL,
  notes              text,
  created_by         text,
  created_at         timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT farm_period_bills_period_format CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT farm_period_bills_category CHECK (category IN ('lease', 'utilities', 'admin', 'other'))
);
CREATE INDEX IF NOT EXISTS farm_period_bills_period_idx ON farm.period_bills (period);

-- ── farm_grow_plans.sql ──
-- 0049_farm_grow_plans.sql
-- Cotyledon — the grow_plan library (Roadmap Phase H1).
--
-- Until now one grow_plan lived as a code constant and stood in for the whole item
-- master. The library makes grow_plans first-class: every grow_plan that can be
-- costed, credited, sowing-sized or planned is a row here, with a status and the
-- channels it serves. The code constant becomes the SEED (AMK-E-001, In Service)
-- inserted on first read when the table is empty; it is no longer the source.
--
--   * grow_plans       — the grow_plan header: code, name, category, status
--                     ('in_service' | 'planned' | 'developing'), the channels it
--                     serves (expansion phases 1–3; each channel carries its own
--                     menu), method, allergen statements, and the unit `spec`
--                     block (trayFormat, nutritionTarget, serving grow_unit) as JSONB.
--                     `version` and `effective_from` let a sowing record's
--                     `standard_version` name the standard in force on its date.
--   * grow_plan_lines  — one row per input line. `line` is the engine's
--                     `inputLine` document (as-purchased quantity and unit,
--                     yield with its own provenance, price with its own
--                     provenance, pack size, hot/cold, nutrition spec, served
--                     component) stored whole so the engine reads it unchanged.
--
-- A scenario still edits a line's price, quantity, yield and pack size as a
-- forecast overlay (keyed by grow_plan code + input); the library row is the
-- standard those edits are measured against.

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.grow_plans (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 text         NOT NULL UNIQUE,
  name                 text         NOT NULL,
  category             text         NOT NULL DEFAULT '',
  -- 'in_service' | 'planned' | 'developing'
  status               text         NOT NULL DEFAULT 'developing',
  -- Expansion phases served, e.g. [1] or [2, 3].
  channels             jsonb        NOT NULL DEFAULT '[]'::jsonb,
  components           text         NOT NULL DEFAULT '',
  production_method    text         NOT NULL DEFAULT '',
  allergens_present    text         NOT NULL DEFAULT '',
  allergen_free_claims text         NOT NULL DEFAULT '',
  costing_basis        text         NOT NULL DEFAULT '',
  -- The unit spec block (tagged values), as the engine reads it.
  spec                 jsonb        NOT NULL DEFAULT '{}'::jsonb,
  -- 'seed' | 'user_built'
  source               text         NOT NULL DEFAULT 'user_built',
  version              integer      NOT NULL DEFAULT 1,
  effective_from       date,
  created_by           text,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_grow_plans_status CHECK (status IN ('in_service', 'planned', 'developing'))
);
CREATE INDEX IF NOT EXISTS farm_grow_plans_status_idx ON farm.grow_plans (status);

CREATE TABLE IF NOT EXISTS farm.grow_plan_lines (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  grow_plan_id   uuid         NOT NULL REFERENCES farm.grow_plans (id) ON DELETE CASCADE,
  position    integer      NOT NULL DEFAULT 0,
  name        text         NOT NULL,
  -- inputLine document.
  line        jsonb        NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_grow_plan_lines_unique_name UNIQUE (grow_plan_id, name)
);
CREATE INDEX IF NOT EXISTS farm_grow_plan_lines_grow_plan_idx ON farm.grow_plan_lines (grow_plan_id, position);

-- ── farm_subscribers.sql ──
-- 0050_farm_subscribers.sql
-- Cotyledon — subscribers, pickup_points and the pickup_point-by-pickup_point participation
-- forecast (Roadmap Phase H2).
--
-- Demand is not a channel constant. It is the sum, over every pickup_point a subscriber
-- is served at, of that pickup_point's expected units per service day times its service
-- days. For a prospect pickup_point the expected units are enrollment × a participation
-- rate; for a corporate or retail pickup_point they are a typed expected count. Every
-- figure is a forecast until a contract or an actual unit count replaces it, and
-- the platform labels it so.
--
--   * subscribers      — a district, a company or a marketplace, on one expansion
--                      phase (channel), with an optional contracted price per
--                      unit (null = the channel's default), contract dates, and
--                      an optional link to the prospect record in the CRM.
--   * subscriber_pickup_points — where the subscriber is served. `pickup_point_id` links the row to
--                      the distribution pickup_point (Pickup Points & Routes, Logistics) so one
--                      pickup_point carries one forecast. TrayFormats drive nutrition;
--                      service days per year and the forecast drive demand.
--
-- The library seeds itself on first read from the channel constants that stood
-- in for demand until now (1,000 / 500 / 188 units a day), spread over the
-- invented distribution pickup_points and marked `source = 'seed'`, so the numbers the
-- platform showed are visible, labelled and replaceable rather than silently
-- changed.

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.subscribers (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text         NOT NULL,
  -- 'district' | 'company' | 'marketplace' | 'other'
  kind                 text         NOT NULL DEFAULT 'other',
  -- Expansion phase served: 1 prospects, 2 restaurants, 3 retail and wholesale / retail.
  channel              integer      NOT NULL,
  -- 'prospect' | 'contracted' | 'inactive'
  status               text         NOT NULL DEFAULT 'prospect',
  -- Contracted price per unit; NULL = the channel's default price.
  price_per_unit_cents integer,
  contract_start       date,
  contract_end         date,
  -- The prospect record in the Sales CRM, when there is one.
  prospect_id            text,
  notes                text,
  -- 'seed' | 'user_built'
  source               text         NOT NULL DEFAULT 'user_built',
  created_by           text,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_subscribers_channel CHECK (channel BETWEEN 1 AND 3),
  CONSTRAINT farm_subscribers_status CHECK (status IN ('prospect', 'contracted', 'inactive'))
);
CREATE INDEX IF NOT EXISTS farm_subscribers_channel_idx ON farm.subscribers (channel);

CREATE TABLE IF NOT EXISTS farm.subscriber_pickup_points (
  id                     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id            uuid         NOT NULL REFERENCES farm.subscribers (id) ON DELETE CASCADE,
  -- The distribution pickup_point this row is served at (Pickup Points & Routes id), when linked.
  pickup_point_id                text,
  name                   text         NOT NULL,
  -- e.g. ["K-5", "6-8"]
  tray_formats           jsonb        NOT NULL DEFAULT '[]'::jsonb,
  service_days_per_year  integer      NOT NULL DEFAULT 180,
  -- prospect forecast: enrollment × participation rate.
  enrollment             integer,
  participation_rate     double precision,
  -- Corporate / retail forecast, or a prospect override: a typed expected count.
  expected_units_per_day double precision,
  -- 'active' | 'planned' | 'inactive'
  status                 text         NOT NULL DEFAULT 'active',
  notes                  text,
  created_by             text,
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_subscriber_pickup_points_days CHECK (service_days_per_year BETWEEN 0 AND 366),
  CONSTRAINT farm_subscriber_pickup_points_rate CHECK (participation_rate IS NULL OR (participation_rate >= 0 AND participation_rate <= 1)),
  CONSTRAINT farm_subscriber_pickup_points_status CHECK (status IN ('active', 'planned', 'inactive'))
);
CREATE INDEX IF NOT EXISTS farm_subscriber_pickup_points_subscriber_idx ON farm.subscriber_pickup_points (subscriber_id);
CREATE INDEX IF NOT EXISTS farm_subscriber_pickup_points_pickup_point_idx ON farm.subscriber_pickup_points (pickup_point_id);

-- ── farm_orders.sql ──
-- 0051_farm_orders.sql
-- Cotyledon — orders and subscriptionCycles (Roadmap Phase H3).
--
-- An order is a date, a subscriber, a pickup_point, a channel, a grow_plan, a unit count and
-- a status. It is what production plans against and what a distribution is
-- recorded against.
--
--   * subscription_cycles      — per channel: a repeating sequence of service days that
--                        names which grow_plan every pickup_point on the channel is served
--                        on which date. `start_date` anchors day 1 to the
--                        calendar; `weekdays` are the service days (0 = Sunday …
--                        6 = Saturday) the cycle advances on. A per-pickup_point service
--                        calendar (closures, holidays) is not modelled yet.
--   * subscription_cycle_days  — one row per cycle day, naming the grow_plan served.
--   * orders           — the rows the platform stores. Status is
--                        'forecast' | 'confirmed' | 'distributed'.
--
-- A FORECAST ORDER GENERATED BY A SUBSCRIPTION_CYCLE IS NOT STORED. It is a derived
-- figure — the cycle's grow_plan on the date × the pickup_point's participation forecast —
-- and the engine computes it whenever the order book is read, so a change to a
-- pickup_point's forecast or to the cycle moves every forecast order with it and
-- nothing stale sits in a table. A row is written when a count is typed
-- (a forecast order for a retail pickup_point, `source = 'typed'`), when a subscriber
-- confirms the count (`status = 'confirmed'`), and when the units are
-- distributed (`status = 'distributed'`, `distribution_id` names the distribution record
-- in farm.distributions, which is what posts revenue). A stored row replaces the
-- derived order with the same date, pickup_point and grow_plan.
--
-- Price on an order is optional: NULL means the subscriber's contracted price,
-- else the channel default, resolved when read. units is a count; every
-- dollar is computed from it.

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.subscription_cycles (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  channel      integer      NOT NULL,
  name         text         NOT NULL,
  start_date   date         NOT NULL,
  -- Service days in one turn of the cycle.
  length_days  integer      NOT NULL DEFAULT 5,
  -- Weekdays the cycle advances on, e.g. [1,2,3,4,5].
  weekdays     jsonb        NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  -- 'active' | 'inactive'
  status       text         NOT NULL DEFAULT 'active',
  notes        text,
  -- 'seed' | 'user_built'
  source       text         NOT NULL DEFAULT 'user_built',
  created_by   text,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_subscription_cycles_channel CHECK (channel BETWEEN 1 AND 3),
  CONSTRAINT farm_subscription_cycles_length CHECK (length_days BETWEEN 1 AND 60),
  CONSTRAINT farm_subscription_cycles_status CHECK (status IN ('active', 'inactive'))
);
CREATE INDEX IF NOT EXISTS farm_subscription_cycles_channel_idx ON farm.subscription_cycles (channel);

CREATE TABLE IF NOT EXISTS farm.subscription_cycle_days (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id     uuid         NOT NULL REFERENCES farm.subscription_cycles (id) ON DELETE CASCADE,
  -- 1 .. length_days
  day          integer      NOT NULL,
  -- The library grow_plan served that day; NULL = no service (a day off the menu).
  grow_plan_code  text,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_subscription_cycle_days_day CHECK (day >= 1),
  CONSTRAINT farm_subscription_cycle_days_unique UNIQUE (cycle_id, day)
);
CREATE INDEX IF NOT EXISTS farm_subscription_cycle_days_cycle_idx ON farm.subscription_cycle_days (cycle_id, day);

CREATE TABLE IF NOT EXISTS farm.orders (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_date           date         NOT NULL,
  subscriber_id          uuid         NOT NULL REFERENCES farm.subscribers (id) ON DELETE CASCADE,
  subscriber_pickup_point_id     uuid         NOT NULL REFERENCES farm.subscriber_pickup_points (id) ON DELETE CASCADE,
  channel              integer      NOT NULL,
  grow_plan_code          text         NOT NULL,
  units                double precision NOT NULL,
  -- 'forecast' | 'confirmed' | 'distributed'
  status               text         NOT NULL DEFAULT 'forecast',
  -- NULL = the subscriber's contracted price, else the channel default.
  price_per_unit_cents integer,
  -- The distribution record, once distributed. Removing the record leaves the order.
  distribution_id          uuid         REFERENCES farm.distributions (id) ON DELETE SET NULL,
  -- The cycle the order was confirmed from, when it was.
  subscription_cycle_id        uuid         REFERENCES farm.subscription_cycles (id) ON DELETE SET NULL,
  -- 'typed' | 'cycle' | 'sales' | 'portal'
  source               text         NOT NULL DEFAULT 'typed',
  notes                text,
  created_by           text,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_orders_channel CHECK (channel BETWEEN 1 AND 3),
  CONSTRAINT farm_orders_units_nonneg CHECK (units >= 0),
  CONSTRAINT farm_orders_status CHECK (status IN ('forecast', 'confirmed', 'distributed')),
  CONSTRAINT farm_orders_source CHECK (source IN ('typed', 'cycle', 'sales', 'portal')),
  -- One stored order per date, pickup_point and grow_plan: it is the row that replaces the derived one.
  CONSTRAINT farm_orders_unique_line UNIQUE (order_date, subscriber_pickup_point_id, grow_plan_code)
);
CREATE INDEX IF NOT EXISTS farm_orders_date_idx ON farm.orders (order_date);
CREATE INDEX IF NOT EXISTS farm_orders_subscriber_idx ON farm.orders (subscriber_id, order_date);
CREATE INDEX IF NOT EXISTS farm_orders_pickup_point_idx ON farm.orders (subscriber_pickup_point_id);
CREATE INDEX IF NOT EXISTS farm_orders_distribution_idx ON farm.orders (distribution_id);

-- ── farm_distribution_handoff.sql ──
-- 0052_farm_distribution_handoff.sql
-- Cotyledon — the production record is kept (Roadmap Phase I).
--
-- Phase I makes the floor record real. Most of it rides on existing JSONB
-- documents and needs no DDL:
--
--   * receipts.lines gains, per line, the use-by date printed on the case, the
--     product temperature at the dock, the receiver's condition verdict
--     ('accepted' | 'accepted_with_note' | 'rejected') and the FTL flag copied
--     from the input line (I2). A rejected line is on the record and never
--     in stock.
--   * sowing_records.components gains, per component, the CONTROL_POINT-1 end-of-sow
--     temperature (I3). The CONTROL_POINT-2 stage record was already there.
--
-- The distribution record is the one that needs columns: the temperature at
-- hand-off and who signed for it at the pickup_point are facts of the shipping event
-- (I4), not free text.

ALTER TABLE farm.distributions ADD COLUMN IF NOT EXISTS handoff_temp_f double precision;
ALTER TABLE farm.distributions ADD COLUMN IF NOT EXISTS received_by     text;

-- ── farm_sowing_crew.sql ──
-- 0053_farm_sowing_crew.sql
-- Cotyledon — crew hours by person on the sowing record (Roadmap I3).
--
-- Who worked the sowing and for how long, as rows on the record. The two
-- labor totals the ledger reads (actual_labor_hours, actual_labor_rate) are
-- derived from these rows when they are present: hours summed, the rate
-- weighted by hours. A record with no crew rows keeps the typed totals.

ALTER TABLE farm.sowing_records ADD COLUMN IF NOT EXISTS crew jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── farm_periods.sql ──
-- 0054_farm_periods.sql
-- (Applied to Neon 2026-09-14 as written. The 'shutdown' closure kind was an
--  inherited assumption — the farm runs year-round — and 0055 removes it.)
-- Cotyledon — fiscal periods, the production calendar and the
-- posting trail (Roadmap J1, J3, J4).
--
--   * fiscal_periods     — one row per YYYY-MM that has ever been locked. The
--                          fiscal year is the calendar year.
--                          A period with no row is open. A locked period
--                          refuses every posting dated inside it; a super admin
--                          may reopen it, and both events go on the trail.
--   * calendar_closures  — dated ranges the farm does not produce or
--                          distribute: the summer shutdown, holidays. Production
--                          days are the service weekdays less these.
--   * posting_log        — the append-only, hash-chained record of who posted
--                          what from which record, and of every lock and
--                          reopen. `hash` = SHA-256 over the previous row's
--                          hash and this row's canonical fields, so any edit
--                          or removal breaks the chain from that row on. A
--                          trigger refuses UPDATE and DELETE outright.

CREATE TABLE IF NOT EXISTS farm.fiscal_periods (
  period       text PRIMARY KEY,
  status       text NOT NULL DEFAULT 'open',
  locked_at    timestamptz,
  locked_by    text,
  reopened_at  timestamptz,
  reopened_by  text,
  notes        text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('open', 'locked'))
);

CREATE TABLE IF NOT EXISTS farm.calendar_closures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label        text NOT NULL,
  kind         text NOT NULL DEFAULT 'closure',
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  notes        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (kind IN ('shutdown', 'holiday', 'closure'))
);
CREATE INDEX IF NOT EXISTS farm_calendar_closures_dates_idx ON farm.calendar_closures (start_date, end_date);

CREATE TABLE IF NOT EXISTS farm.posting_log (
  seq            bigserial PRIMARY KEY,
  occurred_at    timestamptz NOT NULL,
  actor_user_id  text NOT NULL,
  actor_email    text,
  action         text NOT NULL,
  record_kind    text NOT NULL,
  record_id      text NOT NULL,
  period         text NOT NULL,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash      text NOT NULL,
  hash           text NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS farm_posting_log_period_idx ON farm.posting_log (period);

CREATE OR REPLACE FUNCTION farm.posting_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'farm.posting_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posting_log_immutable ON farm.posting_log;
CREATE TRIGGER posting_log_immutable
  BEFORE UPDATE OR DELETE ON farm.posting_log
  FOR EACH ROW EXECUTE FUNCTION farm.posting_log_immutable();

-- ── farm_closure_kinds.sql ──
-- 0055_farm_closure_kinds.sql
-- Cotyledon — closures are major holidays; the farm runs
-- year-round. The 'shutdown' kind in 0054 was an
-- inherited assumption, never a decision. No row carries it.

ALTER TABLE farm.calendar_closures DROP CONSTRAINT IF EXISTS calendar_closures_kind_check;
ALTER TABLE farm.calendar_closures ADD CONSTRAINT calendar_closures_kind_check CHECK (kind IN ('holiday', 'closure'));

-- ── farm_standard_versions.sql ──
-- 0056_farm_standard_versions.sql
-- Cotyledon — approved standard-cost versions (Roadmap J5).
--
-- A standard is the grow_plan (its lines, yields and SEED prices as resolved on the
-- plan of record) together with the cost assumptions in force, frozen as a
-- snapshot when a super admin approves it with an effective date. Editing the
-- grow_plan library changes the library; the standard a sowing is costed at
-- changes only when a new version is approved. The ledger costs every sowing
-- at the version in force on its production date, so a reviewer can
-- reproduce the cost; a sowing dated before any approved version is costed at
-- the live library and says so.

CREATE TABLE IF NOT EXISTS farm.standard_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grow_plan_code    text NOT NULL,
  version        integer NOT NULL,
  effective_from date NOT NULL,
  approved_by    text NOT NULL,
  approved_at    timestamptz NOT NULL DEFAULT now(),
  notes          text,
  snapshot       jsonb NOT NULL,
  UNIQUE (grow_plan_code, version)
);
CREATE INDEX IF NOT EXISTS farm_standard_versions_code_date_idx ON farm.standard_versions (grow_plan_code, effective_from);

-- ── farm_working_capital.sql ──
-- 0057_farm_working_capital.sql
-- Cotyledon — working capital and invoicing (Roadmap Phase K).
--
-- Decisions: one monthly invoice per subscriber, each
-- completed distribution route added to it as it finishes; revenue to receivables
-- at distribution; retail is paid at the time of ordering and is never invoiced.
-- Supplier bills are recorded against receipts with a three-way match of
-- purchase order, receipt and bill; a mismatched bill is flagged and is not
-- paid until rectified. Payment terms: suppliers Due on Receipt / Net 15 /
-- Net 30 / Net 60 / Net 90, subscribers Due on Receipt / Net 15 / Net 30, no
-- default. Opening owners' equity in cash. An internal time clock for all
-- staff; pay periods are Monday through the second Sunday, paid the Friday five
-- days later.
--
--   * subscribers.payment_terms      — null = not set; an invoice is not issued without it.
--   * supplier_terms               — terms per supplier (suppliers are a compiled directory, not a table).
--   * period_bills.payment_terms   — terms on a lease / utilities / admin bill.
--   * invoices                     — one row per subscriber invoice; open while routes are added,
--                                    issued with its terms and due date. Totals are computed from
--                                    the distributions that name it, never stored.
--   * distributions.subscriber_id / invoice_id / route_completed_at
--   * subscriber_payments            — cash received, applied to invoices.
--   * supplier_bills               — the vendor's invoice against one or more receipts.
--   * supplier_payments            — cash paid, applied to bills.
--   * opening_balances             — the opening balance sheet of the actuals.
--   * staff, time_punches          — the time clock.
--
-- Money is integer cents; quantities are double precision, matching 0047/0048.

CREATE SCHEMA IF NOT EXISTS farm;

ALTER TABLE farm.subscribers ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE farm.subscribers DROP CONSTRAINT IF EXISTS farm_subscribers_payment_terms;
ALTER TABLE farm.subscribers ADD CONSTRAINT farm_subscribers_payment_terms
  CHECK (payment_terms IS NULL OR payment_terms IN ('due_on_receipt', 'net_15', 'net_30'));

CREATE TABLE IF NOT EXISTS farm.supplier_terms (
  supplier_id    text         PRIMARY KEY,
  supplier_name  text,
  payment_terms  text         NOT NULL,
  updated_by     text,
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_supplier_terms_terms CHECK (payment_terms IN ('due_on_receipt', 'net_15', 'net_30', 'net_60', 'net_90'))
);

ALTER TABLE farm.period_bills ADD COLUMN IF NOT EXISTS payment_terms text;
ALTER TABLE farm.period_bills DROP CONSTRAINT IF EXISTS farm_period_bills_payment_terms;
ALTER TABLE farm.period_bills ADD CONSTRAINT farm_period_bills_payment_terms
  CHECK (payment_terms IS NULL OR payment_terms IN ('due_on_receipt', 'net_15', 'net_30', 'net_60', 'net_90'));

CREATE TABLE IF NOT EXISTS farm.invoices (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- AMK-INV-YYYYMMDD-NN, dated the day the invoice was opened.
  invoice_number  text         NOT NULL UNIQUE,
  subscriber_id     uuid         NOT NULL REFERENCES farm.subscribers (id) ON DELETE RESTRICT,
  subscriber_name   text         NOT NULL,
  -- YYYY-MM: the service month the invoice bills.
  period          text         NOT NULL,
  -- 'open' | 'issued'
  status          text         NOT NULL DEFAULT 'open',
  opened_on       date         NOT NULL,
  -- Set at issue: the subscriber's terms at that moment, the issue date and the due date.
  payment_terms   text,
  issued_on       date,
  due_on          date,
  issued_by       text,
  notes           text,
  created_by      text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_invoices_period_format CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT farm_invoices_status CHECK (status IN ('open', 'issued')),
  CONSTRAINT farm_invoices_terms CHECK (payment_terms IS NULL OR payment_terms IN ('due_on_receipt', 'net_15', 'net_30'))
);
CREATE INDEX IF NOT EXISTS farm_invoices_subscriber_idx ON farm.invoices (subscriber_id, period);
-- One invoice open per subscriber and month; routes are added to it.
CREATE UNIQUE INDEX IF NOT EXISTS farm_invoices_one_open ON farm.invoices (subscriber_id, period) WHERE status = 'open';

ALTER TABLE farm.distributions ADD COLUMN IF NOT EXISTS subscriber_id uuid REFERENCES farm.subscribers (id) ON DELETE SET NULL;
ALTER TABLE farm.distributions ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES farm.invoices (id) ON DELETE SET NULL;
ALTER TABLE farm.distributions ADD COLUMN IF NOT EXISTS route_completed_at timestamptz;
CREATE INDEX IF NOT EXISTS farm_distributions_invoice_idx ON farm.distributions (invoice_id);
CREATE INDEX IF NOT EXISTS farm_distributions_subscriber_idx ON farm.distributions (subscriber_id);

-- Backfill the subscriber on distributions recorded against an order.
UPDATE farm.distributions d SET subscriber_id = o.subscriber_id
  FROM farm.orders o
  WHERE o.distribution_id = d.id AND d.subscriber_id IS NULL;

CREATE TABLE IF NOT EXISTS farm.subscriber_payments (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id    uuid         NOT NULL REFERENCES farm.subscribers (id) ON DELETE RESTRICT,
  subscriber_name  text         NOT NULL,
  received_on    date         NOT NULL,
  amount_cents   integer      NOT NULL,
  method         text,
  reference      text,
  -- [{ invoiceId, amountCents }]; the remainder is unapplied.
  applications   jsonb        NOT NULL DEFAULT '[]'::jsonb,
  notes          text,
  created_by     text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_subscriber_payments_amount CHECK (amount_cents > 0)
);
CREATE INDEX IF NOT EXISTS farm_subscriber_payments_date_idx ON farm.subscriber_payments (received_on);

CREATE TABLE IF NOT EXISTS farm.supplier_bills (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id    text,
  supplier_name  text         NOT NULL,
  bill_number    text         NOT NULL,
  bill_date      date         NOT NULL,
  payment_terms  text         NOT NULL,
  -- The receipts this bill covers; a receipt is on at most one bill.
  receipt_ids    jsonb        NOT NULL DEFAULT '[]'::jsonb,
  -- [{ input, qty, unit, unitPriceCents }] as the vendor billed them.
  lines          jsonb        NOT NULL DEFAULT '[]'::jsonb,
  notes          text,
  created_by     text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_supplier_bills_terms CHECK (payment_terms IN ('due_on_receipt', 'net_15', 'net_30', 'net_60', 'net_90'))
);
CREATE INDEX IF NOT EXISTS farm_supplier_bills_date_idx ON farm.supplier_bills (bill_date);
CREATE INDEX IF NOT EXISTS farm_supplier_bills_receipts_gin ON farm.supplier_bills USING gin (receipt_ids);

CREATE TABLE IF NOT EXISTS farm.supplier_payments (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id    text,
  supplier_name  text         NOT NULL,
  paid_on        date         NOT NULL,
  amount_cents   integer      NOT NULL,
  method         text,
  reference      text,
  -- [{ billId, amountCents }]
  applications   jsonb        NOT NULL DEFAULT '[]'::jsonb,
  notes          text,
  created_by     text,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_supplier_payments_amount CHECK (amount_cents > 0)
);
CREATE INDEX IF NOT EXISTS farm_supplier_payments_date_idx ON farm.supplier_payments (paid_on);

CREATE TABLE IF NOT EXISTS farm.opening_balances (
  id                     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of                  date         NOT NULL,
  owner_equity_cents     integer      NOT NULL,
  fixed_assets_cents     integer      NOT NULL DEFAULT 0,
  long_term_debt_cents   integer      NOT NULL DEFAULT 0,
  notes                  text,
  created_by             text,
  created_at             timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_opening_balances_nonneg CHECK (owner_equity_cents >= 0 AND fixed_assets_cents >= 0 AND long_term_debt_cents >= 0)
);

CREATE TABLE IF NOT EXISTS farm.staff (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text         NOT NULL,
  role                 text,
  -- 'hourly' | 'salaried'
  pay_type             text         NOT NULL DEFAULT 'hourly',
  hourly_wage_cents    integer,
  annual_salary_cents  integer,
  -- 'active' | 'inactive'
  status               text         NOT NULL DEFAULT 'active',
  started_on           date,
  notes                text,
  created_by           text,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_staff_pay_type CHECK (pay_type IN ('hourly', 'salaried')),
  CONSTRAINT farm_staff_status CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE IF NOT EXISTS farm.time_punches (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     uuid         NOT NULL REFERENCES farm.staff (id) ON DELETE RESTRICT,
  -- 'in' | 'break_start' | 'break_end' | 'out'
  kind         text         NOT NULL,
  punched_at   timestamptz  NOT NULL,
  -- 'clock' (the floor) | 'manual' (typed afterwards, with a reason)
  source       text         NOT NULL DEFAULT 'clock',
  reason       text,
  recorded_by  text,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_time_punches_kind CHECK (kind IN ('in', 'break_start', 'break_end', 'out')),
  CONSTRAINT farm_time_punches_source CHECK (source IN ('clock', 'manual')),
  CONSTRAINT farm_time_punches_manual_reason CHECK (source = 'clock' OR (reason IS NOT NULL AND length(trim(reason)) > 0))
);
CREATE INDEX IF NOT EXISTS farm_time_punches_staff_idx ON farm.time_punches (staff_id, punched_at);
CREATE INDEX IF NOT EXISTS farm_time_punches_at_idx ON farm.time_punches (punched_at);

-- ── farm_equipment.sql ──
-- 0058_farm_equipment.sql
-- Cotyledon — the equipment library (Roadmap Phase N, step N1).
--
-- The master equipment list is a definition with a real-world status, shared by
-- the Plan and the Actual ledgers (docs/farm/roadmaps/operating-model-roadmap.md):
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
-- (`_data/capex.ts`), split into Phase 1 and Phase 2.
--
-- Money is integer cents; quantities are double precision, matching 0047/0048.

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.equipment (
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
  CONSTRAINT farm_equipment_status CHECK (status IN ('in_service', 'planned', 'no', 'unset')),
  CONSTRAINT farm_equipment_build_phase CHECK (build_phase BETWEEN 1 AND 3),
  CONSTRAINT farm_equipment_new_used CHECK (new_used IN ('New', 'Used')),
  CONSTRAINT farm_equipment_qty CHECK (qty >= 0),
  CONSTRAINT farm_equipment_unit_cost CHECK (unit_cost_cents >= 0),
  CONSTRAINT farm_equipment_source CHECK (source IN ('seed', 'user_built'))
);

CREATE INDEX IF NOT EXISTS farm_equipment_status_idx ON farm.equipment (status, build_phase);

-- ── farm_packaging.sql ──
-- 0059_farm_packaging.sql
-- Cotyledon — the packaging library (Roadmap Phase N, step N1).
--
-- Packaging here is what a unit leaves the farm in — containers, lids,
-- labels, liners — costed per unit onto the unit. It is NOT packaging
-- equipment (tray sealer, date and lot coder, vacuum packer), which is capital
-- in farm.equipment.
--
--   * packages         — the library: channels, hot / cold, material, size,
--                        end of use and its rank, a manual unit cost, and an
--                        optional supplier catalog item whose price is the
--                        supplier-based cost (per each, or per pack ÷ units per pack).
--   * grow_plan_packages  — the packages a grow_plan picks and how many per unit. A
--                        grow_plan with none picked carries the per-unit placeholder
--.
--
-- Money in dollars as double precision, matching supplier_items.unit_price, since
-- a package's unit cost is routinely below a cent's resolution per unit.

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.packages (
  id                       uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text              NOT NULL,
  -- Channel numbers (1 Subscriptions, 2 Restaurants, 3 Retail and wholesale).
  channels                 jsonb             NOT NULL DEFAULT '[]'::jsonb,
  -- 'hot' | 'cold'; null = not set.
  temperature              text,
  material                 text,
  size_value               double precision,
  size_unit                text,
  end_of_use               text,
  -- 1 is first; null = not ranked.
  end_of_use_rank          integer,
  manual_unit_cost         double precision,
  supplier_item_id         uuid              REFERENCES farm.supplier_items (id) ON DELETE SET NULL,
  supplier_units_per_pack  double precision  NOT NULL DEFAULT 1,
  notes                    text,
  source                   text              NOT NULL DEFAULT 'user_built',
  created_by               text,
  updated_by               text,
  created_at               timestamptz       NOT NULL DEFAULT now(),
  updated_at               timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT farm_packages_temperature CHECK (temperature IS NULL OR temperature IN ('hot', 'cold')),
  CONSTRAINT farm_packages_rank CHECK (end_of_use_rank IS NULL OR end_of_use_rank >= 1),
  CONSTRAINT farm_packages_manual_cost CHECK (manual_unit_cost IS NULL OR manual_unit_cost >= 0),
  CONSTRAINT farm_packages_size CHECK (size_value IS NULL OR size_value >= 0),
  CONSTRAINT farm_packages_units_per_pack CHECK (supplier_units_per_pack > 0),
  CONSTRAINT farm_packages_source CHECK (source IN ('seed', 'user_built'))
);
CREATE INDEX IF NOT EXISTS farm_packages_supplier_item_idx ON farm.packages (supplier_item_id);

CREATE TABLE IF NOT EXISTS farm.grow_plan_packages (
  id            uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  grow_plan_id     uuid              NOT NULL REFERENCES farm.grow_plans (id) ON DELETE CASCADE,
  package_id    uuid              NOT NULL REFERENCES farm.packages (id) ON DELETE RESTRICT,
  qty_per_unit  double precision  NOT NULL DEFAULT 1,
  created_by    text,
  created_at    timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT farm_grow_plan_packages_qty CHECK (qty_per_unit > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS farm_grow_plan_packages_unique ON farm.grow_plan_packages (grow_plan_id, package_id);
CREATE INDEX IF NOT EXISTS farm_grow_plan_packages_package_idx ON farm.grow_plan_packages (package_id);

-- ── farm_hr_no_pay.sql ──
-- 0060_farm_hr_no_pay.sql
-- Cotyledon — pay out of farm (Roadmap Phase O, step O1).
--
-- Decisions: no pay or confidential employee information is
-- held in farm. Staffing holds wages, burden and benefits, closes each pay period
-- and sends its totals by account; the clock times taken on the Grow Room go to
-- Staffing. Admins view individual pay in farm read from Staffing, never stored.
--
--   * staff.staffing_employee_ref — the person's employee reference in Staffing.
--   * payroll_periods              — closed pay periods received from Staffing:
--                                    totals by account and hours, never an
--                                    individual's pay. The ledger accrues and
--                                    pays payroll from these.
--
-- Additive only. The staff wage and salary columns (hourly_wage_cents,
-- annual_salary_cents, pay_type) are no longer read or written by the code;
-- dropping them is a separate migration held for approval.

CREATE SCHEMA IF NOT EXISTS farm;

ALTER TABLE farm.staff ADD COLUMN IF NOT EXISTS staffing_employee_ref text;

CREATE TABLE IF NOT EXISTS farm.payroll_periods (
  id                   uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Staffing's reference for the closed period; one row per closed period.
  staffing_ref        text              NOT NULL UNIQUE,
  period_start         date              NOT NULL,
  period_end           date              NOT NULL,
  pay_date             date              NOT NULL,
  wages_cents          integer           NOT NULL,
  payroll_taxes_cents  integer           NOT NULL,
  workers_comp_cents   integer           NOT NULL,
  benefits_cents       integer           NOT NULL,
  regular_hours        double precision  NOT NULL DEFAULT 0,
  overtime_hours       double precision  NOT NULL DEFAULT 0,
  received_at          timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT farm_payroll_periods_dates CHECK (period_end >= period_start AND pay_date >= period_end),
  CONSTRAINT farm_payroll_periods_cents CHECK (wages_cents >= 0 AND payroll_taxes_cents >= 0 AND workers_comp_cents >= 0 AND benefits_cents >= 0)
);
CREATE INDEX IF NOT EXISTS farm_payroll_periods_pay_date_idx ON farm.payroll_periods (pay_date);

-- ── farm_time_studies.sql ──
-- 0061_farm_time_studies.sql
-- Cotyledon — time studies per grow_plan (Roadmap Phase O, step O2).
--
-- Decisions: Labor is a log of time studies for each grow_plan
-- in the library, on a re-study cadence, with trends and a quality result. A
-- study times one sowing's tasks — who, how long, how many people, fixed per
-- sowing or variable per unit. An admin adopts the study that is the grow_plan's
-- labor standard; adoption is an entry on the posting trail. No wage or pay.
--
--   * time_studies          — one row per study; adopted_at marks an adoption
--                             (the latest adoption is the grow_plan's standard).
--   * time_study_lines      — the task lines of a study.
--   * time_study_intervals  — the re-study interval per grow_plan, in days.
--
-- The plan's time study for AMK-E-001 is seeded as its first study, with no
-- study date or quality result: it was estimated, not observed.

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.time_studies (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  grow_plan_id       uuid         NOT NULL REFERENCES farm.grow_plans (id) ON DELETE CASCADE,
  -- Null only on a study recorded without a date (the seeded estimate).
  studied_on      date,
  sowing_size      integer      NOT NULL,
  observer        text,
  -- 'pass' | 'hold' | 'fail'; null = not recorded.
  quality_result  text,
  quality_notes   text,
  adopted_at      timestamptz,
  adopted_by      text,
  source          text         NOT NULL DEFAULT 'user_built',
  created_by      text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_time_studies_sowing_size CHECK (sowing_size > 0),
  CONSTRAINT farm_time_studies_quality CHECK (quality_result IS NULL OR quality_result IN ('pass', 'hold', 'fail')),
  CONSTRAINT farm_time_studies_source CHECK (source IN ('seed', 'user_built'))
);
CREATE INDEX IF NOT EXISTS farm_time_studies_grow_plan_idx ON farm.time_studies (grow_plan_id, studied_on);

CREATE TABLE IF NOT EXISTS farm.time_study_lines (
  id               uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id         uuid              NOT NULL REFERENCES farm.time_studies (id) ON DELETE CASCADE,
  position         integer           NOT NULL DEFAULT 0,
  task             text              NOT NULL,
  station          text,
  staff            integer           NOT NULL DEFAULT 1,
  elapsed_minutes  double precision  NOT NULL DEFAULT 0,
  labor_minutes    double precision  NOT NULL DEFAULT 0,
  -- 'fixed' (per sowing) | 'variable' (per unit)
  scales_with      text              NOT NULL,
  CONSTRAINT farm_time_study_lines_staff CHECK (staff >= 0),
  CONSTRAINT farm_time_study_lines_minutes CHECK (elapsed_minutes >= 0 AND labor_minutes >= 0),
  CONSTRAINT farm_time_study_lines_scales CHECK (scales_with IN ('fixed', 'variable'))
);
CREATE INDEX IF NOT EXISTS farm_time_study_lines_study_idx ON farm.time_study_lines (study_id, position);

CREATE TABLE IF NOT EXISTS farm.time_study_intervals (
  grow_plan_id      uuid         PRIMARY KEY REFERENCES farm.grow_plans (id) ON DELETE CASCADE,
  interval_days  integer      NOT NULL,
  updated_by     text,
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_time_study_intervals_days CHECK (interval_days > 0)
);

-- ── farm_staff_drop_pay.sql ──
-- 0062_farm_staff_drop_pay.sql
-- Cotyledon — drop the pay columns from the staff register
-- (Roadmap Phase O, step O1). Approved by Robert, 2026-09-15.
--
-- No pay is held in farm: Staffing holds wages, burden and benefits. Since
-- 0060 the code no longer reads or writes these columns, and the table held no
-- rows when this was written.

ALTER TABLE farm.staff DROP COLUMN IF EXISTS pay_type;
ALTER TABLE farm.staff DROP COLUMN IF EXISTS hourly_wage_cents;
ALTER TABLE farm.staff DROP COLUMN IF EXISTS annual_salary_cents;

-- ── farm_staff_email.sql ──
-- 0063_farm_staff_email.sql
-- Cotyledon — the staff register carries each person's sign-in email (Roadmap O5).
--
-- A person on the register whose email matches their sign-in, and who is active,
-- holds the operator role and sees their own record on HR.
-- Stored lowercased; one person per email. Additive.

ALTER TABLE farm.staff ADD COLUMN IF NOT EXISTS email text;

CREATE UNIQUE INDEX IF NOT EXISTS farm_staff_email_uniq ON farm.staff (email) WHERE email IS NOT NULL;

-- ── farm_time_study_basis.sql ──
-- 0064_farm_time_study_basis.sql
-- Cotyledon — a time study's basis: estimated or observed (Roadmap O2 follow-on).
--
-- Decision: every grow_plan in the library is seeded with an
-- ESTIMATED time study — a mock estimate per grow_plan step, built from the plan's
-- 14-task estimate and the stage processing standards — and "Estimated"
-- shows on the rows until the grow_plan's first observed study is recorded. An
-- observed study carries a study date, an observer and a quality result; an
-- estimated one need not. Additive: existing rows are observed unless they are
-- the undated seed, which was the plan's estimate.

ALTER TABLE farm.time_studies ADD COLUMN IF NOT EXISTS basis text NOT NULL DEFAULT 'observed';

ALTER TABLE farm.time_studies DROP CONSTRAINT IF EXISTS farm_time_studies_basis;
ALTER TABLE farm.time_studies ADD CONSTRAINT farm_time_studies_basis CHECK (basis IN ('estimated', 'observed'));

UPDATE farm.time_studies SET basis = 'estimated' WHERE source = 'seed' AND studied_on IS NULL;

-- ── farm_sowing_basis.sql ──
-- 0065_farm_sowing_basis.sql
-- Cotyledon — the sowing is the costing basis.
--
-- sowing costing: the planned cost of one full-line sowing from bulk as-purchased
-- inputs. Yield: the sowing's usable product against the raw weight. Costing
-- down: the sowing cost over the sowing's units is the unit cost, and the cost
-- to serve adds conversion labor, packaging and distribution.
--
--   * grow_plans.sowing_units  — the units a grow_plan's quantities are written
--                               for (every row so far: 100). The production
--                               sowing is derived, never typed.
--   * grow_plans.costing_basis   — dropped: the per-100-unit basis is gone.
--   * grow_plan_lines.line       — the jsonb quantity keys renamed from the per-100
--                               names to the per-sowing names.
--   * equipment.sowing_capacity_lb / sowing_capacity_basis — pounds one unit
--                               takes in one run, the sowing a grow_unit bounds;
--                               estimated until stated or observed. Open fields.
--
-- A sowing is one full Phase 1 line — one shelf, one blackout rack — and planned
-- build-outs never count toward it.

ALTER TABLE farm.grow_plans ADD COLUMN IF NOT EXISTS sowing_units integer NOT NULL DEFAULT 100;
ALTER TABLE farm.grow_plans DROP COLUMN IF EXISTS costing_basis;
ALTER TABLE farm.grow_plans DROP CONSTRAINT IF EXISTS farm_grow_plans_sowing_units;
ALTER TABLE farm.grow_plans ADD CONSTRAINT farm_grow_plans_sowing_units CHECK (sowing_units > 0);

UPDATE farm.grow_plan_lines
SET line = (line - 'seedQtyPer100' - 'harvestedYieldPer100')
  || jsonb_build_object('seedQtyPersowing', line->'seedQtyPer100', 'harvestedYieldPersowing', line->'harvestedYieldPer100')
WHERE line ? 'seedQtyPer100';

ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS sowing_capacity_lb double precision;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS sowing_capacity_basis text NOT NULL DEFAULT 'estimated';
ALTER TABLE farm.equipment DROP CONSTRAINT IF EXISTS farm_equipment_sowing_capacity;
ALTER TABLE farm.equipment ADD CONSTRAINT farm_equipment_sowing_capacity CHECK (sowing_capacity_lb IS NULL OR sowing_capacity_lb >= 0);
ALTER TABLE farm.equipment DROP CONSTRAINT IF EXISTS farm_equipment_sowing_capacity_basis;
ALTER TABLE farm.equipment ADD CONSTRAINT farm_equipment_sowing_capacity_basis CHECK (sowing_capacity_basis IN ('estimated', 'stated', 'observed'));

-- The estimated capacities of the grow_units a sowing passes through (`_data/capex.ts` SOWING_CAPACITY_SEED).
UPDATE farm.equipment SET sowing_capacity_lb = 200 WHERE sowing_capacity_lb IS NULL AND item = 'Blackout rack, 200 lb capacity';
UPDATE farm.equipment SET sowing_capacity_lb = 200 WHERE sowing_capacity_lb IS NULL AND item = 'Tilting braising pan / shelf, 40 gal';
UPDATE farm.equipment SET sowing_capacity_lb = 600 WHERE sowing_capacity_lb IS NULL AND item = 'Steam-jacketed tilting sprouting rack, 100 gal';
UPDATE farm.equipment SET sowing_capacity_lb = 360 WHERE sowing_capacity_lb IS NULL AND item = 'Steam-jacketed tilting sprouting rack, 60 gal';
UPDATE farm.equipment SET sowing_capacity_lb = 240 WHERE sowing_capacity_lb IS NULL AND item = 'Jar stand oven, full size 20-pan';
UPDATE farm.equipment SET sowing_capacity_lb = 120 WHERE sowing_capacity_lb IS NULL AND item = 'Convection oven, double stack';

-- ── farm_scheduler_streams.sql ──
-- 0066_farm_scheduler_streams.sql
-- Cotyledon — the scaffold split and the resource attributes (scheduler build plan §0, W0 step 1).
--
-- Decisions:
--   * The day is two streams. The SOWING stream ends at component blackout and
--     stage; the HARVEST stream runs first thing each distribution day from staged
--     components and is counted per unit shipped that day.
--   * One study per grow_plan, each line tagged `sowing` or `harvest`
--     (time_study_lines.stream). sowing lines keep the study's sowing size as their
--     basis; harvest lines are per unit shipped, a fixed harvest line once
--     per distribution day.
--   * No second blackout and no cold-hold labor line: both leave the
--     scaffold. The estimated seed studies are deleted where nothing adopted
--     them, so they re-seed on read on the new scaffold.
--   * Four resource attributes on the equipment row, estimated open fields like
--     the sowing capacities: concurrent sowings, changeover minutes, attended run,
--     may run unattended — with one basis for the four.

ALTER TABLE farm.time_study_lines ADD COLUMN IF NOT EXISTS stream text NOT NULL DEFAULT 'sowing';
ALTER TABLE farm.time_study_lines DROP CONSTRAINT IF EXISTS farm_time_study_lines_stream;
ALTER TABLE farm.time_study_lines ADD CONSTRAINT farm_time_study_lines_stream CHECK (stream IN ('sowing', 'harvest'));

-- Observed lines recorded before the split carry the assembly, sealing and
-- loading tasks by name; they move to the harvest stream.
UPDATE farm.time_study_lines SET stream = 'harvest'
WHERE stream = 'sowing' AND (task ILIKE 'unit and assemble%' OR task ILIKE 'Seal, label%' OR task ILIKE 'Cold assembly%');

-- The estimated seeds with no adoption re-seed on read on the split scaffold (lines cascade).
DELETE FROM farm.time_studies WHERE source = 'seed' AND adopted_at IS NULL;

ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS concurrent_sowings integer;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS changeover_minutes double precision;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS attended_run boolean;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS may_run_unattended boolean;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS resource_basis text NOT NULL DEFAULT 'estimated';
ALTER TABLE farm.equipment DROP CONSTRAINT IF EXISTS farm_equipment_concurrent_sowings;
ALTER TABLE farm.equipment ADD CONSTRAINT farm_equipment_concurrent_sowings CHECK (concurrent_sowings IS NULL OR concurrent_sowings >= 1);
ALTER TABLE farm.equipment DROP CONSTRAINT IF EXISTS farm_equipment_changeover_minutes;
ALTER TABLE farm.equipment ADD CONSTRAINT farm_equipment_changeover_minutes CHECK (changeover_minutes IS NULL OR changeover_minutes >= 0);
ALTER TABLE farm.equipment DROP CONSTRAINT IF EXISTS farm_equipment_resource_basis;
ALTER TABLE farm.equipment ADD CONSTRAINT farm_equipment_resource_basis CHECK (resource_basis IN ('estimated', 'stated', 'observed'));

-- The estimated resource attributes (`_data/capex.ts` RESOURCE_SEED). A null
-- changeover on the blackout rack reads the capacity inputs' defrost-and-sanitize minutes.
UPDATE farm.equipment SET concurrent_sowings = 1, attended_run = false, may_run_unattended = false
  WHERE concurrent_sowings IS NULL AND item = 'Blackout rack, 200 lb capacity';
UPDATE farm.equipment SET concurrent_sowings = 1, changeover_minutes = 0, attended_run = true, may_run_unattended = false
  WHERE concurrent_sowings IS NULL AND item = 'Tilting braising pan / shelf, 40 gal';
UPDATE farm.equipment SET concurrent_sowings = 1, changeover_minutes = 0, attended_run = false, may_run_unattended = false
  WHERE concurrent_sowings IS NULL AND item IN ('Steam-jacketed tilting sprouting rack, 100 gal', 'Steam-jacketed tilting sprouting rack, 60 gal', 'Jar stand oven, full size 20-pan', 'Convection oven, double stack');
UPDATE farm.equipment SET concurrent_sowings = 1, changeover_minutes = 0, attended_run = true, may_run_unattended = false
  WHERE concurrent_sowings IS NULL AND item IN ('Vertical cutter mixer, 45 qt', 'Tray sealer, semi-automatic');
UPDATE farm.equipment SET attended_run = false, may_run_unattended = true
  WHERE attended_run IS NULL AND item IN ('Walk-in cooler, 12x20, with refrigeration', 'Walk-in cooler, 10x12, with refrigeration');

-- ── farm_catalog_prices.sql ──
-- 0067_farm_catalog_prices.sql
-- Cotyledon — supplier catalog items carry candidate / approved, and their price
-- is effective-dated (Roadmap Phase N, step N1).
--
-- Two facts were conflated on the catalog row: whether we would buy from this
-- line at all, and what it costs. They separate here.
--
--   * status          — 'candidate' (a price on file from a sheet or a quote)
--                       or 'approved' (the line the plan and a purchase order
--                       may price off). Approval is a decision about the line,
--                       not a property of the sheet it arrived on, so it
--                       survives a re-import.
--   * supplier_item_prices — one price per item per effective date. The price
--                       IN FORCE on a date is the latest row on or before it,
--                       so every dollar the model reads can be resolved for the
--                       date it is read for, and last season's sheet stays
--                       readable after this season's lands.
--
-- Existing rows are backfilled to 'approved' and their single price is written
-- as the row in force from the date the sheet was imported: nothing the model
-- reads today moves. Rows imported from here on land as candidates.
--
-- unit_price / price_basis are dropped from farm.supplier_items — a price that
-- lives in two places is the thing Phase N exists to remove.

CREATE SCHEMA IF NOT EXISTS farm;

-- ── The line's real-world status ────────────────────────────────────────────

ALTER TABLE farm.supplier_items ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'candidate';
ALTER TABLE farm.supplier_items ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE farm.supplier_items ADD COLUMN IF NOT EXISTS approved_by text;

ALTER TABLE farm.supplier_items DROP CONSTRAINT IF EXISTS farm_supplier_items_status;
ALTER TABLE farm.supplier_items ADD CONSTRAINT farm_supplier_items_status CHECK (status IN ('candidate', 'approved'));

-- Every line already on file was priced off before this migration; keep it so.
UPDATE farm.supplier_items SET status = 'approved' WHERE status = 'candidate';

-- ── The price, per date ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS farm.supplier_item_prices (
  id             uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid              NOT NULL REFERENCES farm.supplier_items(id) ON DELETE CASCADE,
  -- The date this price comes into force. The price in force on any date is the
  -- latest row on or before it; there is no end date to keep in step.
  effective_from date              NOT NULL,
  -- Dollars as double precision, matching what the column replaced: a catalog
  -- price is routinely below a cent's resolution per unit.
  unit_price     double precision,
  -- What the price is per: 'lb' | 'case' | 'each' | 'dozen' | 'cwt'.
  price_basis    text,
  -- The price sheet or quote this figure came from, registered in farm.sources.
  source_id      uuid              REFERENCES farm.sources(id) ON DELETE SET NULL,
  note           text,
  created_by     text,
  created_at     timestamptz       NOT NULL DEFAULT now()
);

-- One price per item per date: a second figure for the same day is an edit of
-- the first, not a rival to it.
CREATE UNIQUE INDEX IF NOT EXISTS farm_supplier_item_prices_item_date_idx
  ON farm.supplier_item_prices (item_id, effective_from);
CREATE INDEX IF NOT EXISTS farm_supplier_item_prices_item_idx
  ON farm.supplier_item_prices (item_id, effective_from DESC);

-- Backfill: the one price each line carried, in force from the day its sheet
-- was imported (or the day the row was created, for a hand-entered line).
INSERT INTO farm.supplier_item_prices (item_id, effective_from, unit_price, price_basis, source_id, note, created_by, created_at)
SELECT
  i.id,
  COALESCE(i.imported_at, i.created_at)::date,
  i.unit_price,
  i.price_basis,
  i.source_id,
  'Carried from the catalog row when prices became effective-dated (migration 0067).',
  i.created_by,
  i.created_at
FROM farm.supplier_items i
WHERE i.unit_price IS NOT NULL
ON CONFLICT (item_id, effective_from) DO NOTHING;

ALTER TABLE farm.supplier_items DROP COLUMN IF EXISTS unit_price;
ALTER TABLE farm.supplier_items DROP COLUMN IF EXISTS price_basis;

-- ── farm_loans_fixed_costs.sql ──
-- 0068_farm_loans_fixed_costs.sql
-- Cotyledon — loans and fixed-cost lines become definitions (Roadmap Phase N, step N1).
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
--                         TYPED: a loan may be for less
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

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.loans (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable across a reseed, so a saved forecast's overlay still finds its row —
  -- the same device as farm.equipment.key.
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

ALTER TABLE farm.loans DROP CONSTRAINT IF EXISTS farm_loans_status;
ALTER TABLE farm.loans ADD CONSTRAINT farm_loans_status CHECK (status IN ('planned', 'funded'));
ALTER TABLE farm.loans DROP CONSTRAINT IF EXISTS farm_loans_purpose;
ALTER TABLE farm.loans ADD CONSTRAINT farm_loans_purpose CHECK (purpose IN ('equipment', 'leasehold', 'other'));

CREATE UNIQUE INDEX IF NOT EXISTS farm_loans_key_idx ON farm.loans (key);
CREATE INDEX IF NOT EXISTS farm_loans_position_idx ON farm.loans (position);

CREATE TABLE IF NOT EXISTS farm.fixed_cost_lines (
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

ALTER TABLE farm.fixed_cost_lines DROP CONSTRAINT IF EXISTS farm_fixed_cost_lines_status;
ALTER TABLE farm.fixed_cost_lines ADD CONSTRAINT farm_fixed_cost_lines_status CHECK (status IN ('planned', 'in_force'));
ALTER TABLE farm.fixed_cost_lines DROP CONSTRAINT IF EXISTS farm_fixed_cost_lines_treatment;
ALTER TABLE farm.fixed_cost_lines ADD CONSTRAINT farm_fixed_cost_lines_treatment
  CHECK (treatment IN ('manufacturing_overhead', 'general_admin'));

CREATE UNIQUE INDEX IF NOT EXISTS farm_fixed_cost_lines_key_idx ON farm.fixed_cost_lines (key);
CREATE INDEX IF NOT EXISTS farm_fixed_cost_lines_position_idx ON farm.fixed_cost_lines (position);

-- ── farm_leasehold.sql ──
-- 0069_farm_leasehold.sql
-- Cotyledon — the leasehold schedule becomes a definition (Roadmap Phase N, step N1).
--
-- The last capital input still typed in code. Twelve lines summing to $787,000
-- at $157.40/sq ft over the 5,000 sq ft shell — every rate an unsourced working
-- figure authored when the capex tab was built, none of them a quote. They flow
-- into total capital, the leasehold loan's principal, depreciation and the
-- monthly financing, and until now there was no screen on which to change one.
--
--   * `counted` — Robert, 2026-09-15: a line can stay ON RECORD but out of the
--     arithmetic. A scope item the landlord is covering, or one deferred to a
--     later fit-out, stays visible with its figure instead of being deleted and
--     forgotten; the rollup simply passes over it.
--   * `extended_cents` is the figure of record. Dollars per square foot are
--     DERIVED from it against the facility size, so the two cannot disagree —
--     they were two typed numbers that happened to agree before.
--
-- No backfill: the seed writes what the constant carried, so nothing moves.

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.leasehold_lines (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable across a reseed; a saved forecast's overlay keys on it.
  key            text          NOT NULL,
  item           text          NOT NULL,
  extended_cents bigint        NOT NULL DEFAULT 0,
  -- In the arithmetic, or on record only.
  counted        boolean       NOT NULL DEFAULT true,
  notes          text,
  position       integer       NOT NULL DEFAULT 0,
  -- 'seed' | 'user_built'
  source         text          NOT NULL DEFAULT 'user_built',
  created_by     text,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS farm_leasehold_lines_key_idx ON farm.leasehold_lines (key);
CREATE INDEX IF NOT EXISTS farm_leasehold_lines_position_idx ON farm.leasehold_lines (position);

-- ── farm_training.sql ──
-- 0070_farm_training.sql
-- Cotyledon — training documents, their versions, and who has completed which.
--
-- Decisions:
--   * A training document is a FAMILY with numbered versions. The file is
--     replaced from time to time and carries technical content, so a version is
--     never overwritten: each is kept on file and timestamped IN (`published_at`)
--     and OUT (`archived_at`) of active status. Publishing a new version
--     archives the current one at the same instant the new one takes effect, so
--     the record never shows two active versions or a gap between them.
--   * Every active staff member is assigned the active version, and a new hire
--     completes it during orientation.
--   * Publishing carries a checkbox, defaulted ON: everyone re-completes. A
--     technical revision pages the whole crew; a typo fix need not. Whichever
--     was chosen is recorded on the version itself (`requires_recompletion`),
--     so the reason a person was asked again is on the record, not in someone's
--     memory.
--
-- Completion is recorded against the VERSION, never the family: "read and
-- acknowledged v1" stays true after v2 publishes.
--
-- The file lives inline as bytea, like farm.sources — the platform serves it
-- through an authenticated route and no third-party store is involved.

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.training_docs (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The family key: every version of one document shares it.
  doc_key               text          NOT NULL,
  version               integer       NOT NULL DEFAULT 1,
  title                 text          NOT NULL,
  summary               text,
  -- Orientation requirement of the family, carried on each version.
  required_at_orientation boolean     NOT NULL DEFAULT true,
  -- What the publisher chose for THIS version.
  requires_recompletion boolean       NOT NULL DEFAULT true,

  -- In and out of active status. published_at null = a draft that has never
  -- been active; archived_at null on a published row = the active version.
  published_at          timestamptz,
  archived_at           timestamptz,
  -- The version that replaced this one.
  superseded_by         uuid          REFERENCES farm.training_docs(id) ON DELETE SET NULL,

  file_name             text          NOT NULL,
  file_mime             text          NOT NULL,
  file_size             integer       NOT NULL DEFAULT 0,
  sha256                text,
  file_bytes            bytea,

  notes                 text,
  uploaded_by           text,
  published_by          text,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

-- One row per family per version number.
CREATE UNIQUE INDEX IF NOT EXISTS farm_training_docs_key_version_idx ON farm.training_docs (doc_key, version);
-- At most one ACTIVE version per family, enforced by the database rather than
-- by the code that publishes.
CREATE UNIQUE INDEX IF NOT EXISTS farm_training_docs_one_active_idx
  ON farm.training_docs (doc_key) WHERE published_at IS NOT NULL AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS farm.training_assignments (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The VERSION assigned, so a completion says which text was read.
  doc_id       uuid          NOT NULL REFERENCES farm.training_docs(id) ON DELETE CASCADE,
  staff_id     uuid          NOT NULL REFERENCES farm.staff(id) ON DELETE CASCADE,
  assigned_at  timestamptz   NOT NULL DEFAULT now(),
  -- Set when the person records that they have read it.
  completed_at timestamptz,
  -- Anything the person added when completing.
  note         text,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS farm_training_assignments_doc_staff_idx
  ON farm.training_assignments (doc_id, staff_id);
CREATE INDEX IF NOT EXISTS farm_training_assignments_staff_idx ON farm.training_assignments (staff_id);

-- ── farm_flat_plans_services.sql ──
-- 0071_farm_flat_plans_services.sql
-- Cotyledon — flatPlans, services, dated volume and pickup_point calendars (Roadmap Phase N, step N4a).
--
-- Decisions 17–20 of the operating-model build plan:
--
--   * A SERVICE is one unit occasion — one loading and harvest/distribution of an
--     order. A pickup_point carries its services; two services in a day are two orders.
--   * Volume is UNITS PER SERVICE, set by dated picks. From each pick the
--     volume carries forward until the next one. Before the first pick a
--     service carries no volume.
--   * Every pickup_point has its own SERVICE CALENDAR — term dates and breaks — entered
--     at subscriber setup. A pickup_point with no term entered serves every service
--     weekday the farm is open, and the page says the calendar is not on file.
--   * Every subscriber has its own FLAT_PLAN. A channel groups revenue and limits
--     the grow_plans offered; it never decides what a subscriber is served. A unit
--     plan is either a saved subscriptionCycle copied onto the subscriber in one click
--     or a grow_plan sequence programmed for that subscriber alone.
--   * SUBSCRIPTION_CYCLES are the shared list of saved sequences. They are not assigned
--     to channels. Editing one applies to the subscribers picked (selected or
--     all whose plan came from it); nobody else's plan moves.
--
-- A flatPlan and a subscriptionCycle are the same shape (a start date, a length, the
-- service weekdays it advances on, a grow_plan per day), so they share
-- `farm.subscription_cycles`: a row with `subscriber_id` NULL is a saved subscriptionCycle on
-- the shared list; a row with `subscriber_id` set is that subscriber's flatPlan.
-- `from_cycle_id` names the saved cycle a plan was copied from, which is what
-- the apply-to picker offers. A plan with `subscriber_service_id` set is that
-- service's plan and wins over the subscriber's all-services plan on its dates.
--
-- The subscriber status 'forecast' is added (text, no constraint change): a
-- Forecast subscriber is a master-list subscriber with manual mock figures, used
-- in forecasts and never on Actual.
--
-- Additive, with a backfill so nothing the model shows disappears:
--   1. every pickup_point that is not inactive gets one service — Mon–Fri — whose
--      first volume pick is the pickup_point's current forecast (enrollment ×
--      participation, else the expected count, else zero), effective from the
--      subscriber's contract start, else the date the pickup_point was created;
--   2. every subscriber that is not inactive gets a flatPlan copied from the
--      active cycle on its channel that started last, naming it as the source;
--   3. the seeded cycles lose their test labels and their channel; the ghost
--      farm's seeded cycle — the same adult menu as restaurants's —
--      is folded into it when the days match.
-- The old pickup_point forecast columns (service_days_per_year, enrollment,
-- participation_rate, expected_units_per_day) and subscription_cycles.channel stay
-- until the release that stops reading them has shipped (Roadmap N9).

CREATE SCHEMA IF NOT EXISTS farm;

-- ── Services ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS farm.subscriber_services (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_pickup_point_id  uuid          NOT NULL REFERENCES farm.subscriber_pickup_points(id) ON DELETE CASCADE,
  name              text          NOT NULL,
  -- The weekdays the service is distributed; 0 = Sunday … 6 = Saturday.
  weekdays          jsonb         NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  -- 'active' | 'inactive'
  status            text          NOT NULL DEFAULT 'active',
  position          integer       NOT NULL DEFAULT 0,
  notes             text,
  created_by        text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS farm_subscriber_services_pickup_point_idx ON farm.subscriber_services (subscriber_pickup_point_id);

-- ── Dated volume picks ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS farm.service_volume_picks (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id        uuid          NOT NULL REFERENCES farm.subscriber_services(id) ON DELETE CASCADE,
  -- From this date the service carries `units` per service, until the next pick.
  effective_date    date          NOT NULL,
  units             double precision NOT NULL CHECK (units >= 0),
  notes             text,
  created_by        text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (service_id, effective_date)
);

-- ── pickup_point service calendars ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS farm.pickup_point_calendar_ranges (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_pickup_point_id  uuid          NOT NULL REFERENCES farm.subscriber_pickup_points(id) ON DELETE CASCADE,
  -- 'term' (the pickup_point takes units) | 'break' (it does not, inside a term)
  kind              text          NOT NULL,
  label             text,
  start_date        date          NOT NULL,
  end_date          date          NOT NULL,
  created_by        text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  CHECK (kind IN ('term', 'break')),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS farm_pickup_point_calendar_ranges_pickup_point_idx ON farm.pickup_point_calendar_ranges (subscriber_pickup_point_id, start_date);

-- ── SubscriptionCycles become the shared list; flatPlans share the shape ─────────

ALTER TABLE farm.subscription_cycles ALTER COLUMN channel DROP NOT NULL;
ALTER TABLE farm.subscription_cycles ADD COLUMN IF NOT EXISTS subscriber_id uuid REFERENCES farm.subscribers(id) ON DELETE CASCADE;
ALTER TABLE farm.subscription_cycles ADD COLUMN IF NOT EXISTS subscriber_service_id uuid REFERENCES farm.subscriber_services(id) ON DELETE CASCADE;
ALTER TABLE farm.subscription_cycles ADD COLUMN IF NOT EXISTS from_cycle_id uuid REFERENCES farm.subscription_cycles(id) ON DELETE SET NULL;
-- Null = open-ended.
ALTER TABLE farm.subscription_cycles ADD COLUMN IF NOT EXISTS end_date date;
CREATE INDEX IF NOT EXISTS farm_subscription_cycles_subscriber_idx ON farm.subscription_cycles (subscriber_id, start_date);
CREATE INDEX IF NOT EXISTS farm_subscription_cycles_from_idx ON farm.subscription_cycles (from_cycle_id);

-- ── Orders name their service ───────────────────────────────────────────────

ALTER TABLE farm.orders ADD COLUMN IF NOT EXISTS subscriber_service_id uuid REFERENCES farm.subscriber_services(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS farm_orders_service_idx ON farm.orders (subscriber_service_id);

-- ── Backfill ────────────────────────────────────────────────────────────────

-- 1. One service per pickup_point that is not inactive, carrying its current forecast.
INSERT INTO farm.subscriber_services (subscriber_pickup_point_id, name, weekdays, status, position, notes)
SELECT s.id,
       CASE WHEN c.channel = 1 THEN 'unit' ELSE 'Service 1' END,
       '[1,2,3,4,5]'::jsonb,
       'active',
       0,
       'Carried from the pickup_point forecast when services were introduced (Roadmap N4a).'
FROM farm.subscriber_pickup_points s
JOIN farm.subscribers c ON c.id = s.subscriber_id
WHERE s.status <> 'inactive'
  AND NOT EXISTS (SELECT 1 FROM farm.subscriber_services x WHERE x.subscriber_pickup_point_id = s.id);

INSERT INTO farm.service_volume_picks (service_id, effective_date, units, notes)
SELECT sv.id,
       COALESCE(c.contract_start, s.created_at::date),
       COALESCE(s.enrollment * s.participation_rate, s.expected_units_per_day, 0),
       'Carried from the pickup_point forecast when services were introduced (Roadmap N4a).'
FROM farm.subscriber_services sv
JOIN farm.subscriber_pickup_points s ON s.id = sv.subscriber_pickup_point_id
JOIN farm.subscribers c ON c.id = s.subscriber_id
WHERE NOT EXISTS (SELECT 1 FROM farm.service_volume_picks p WHERE p.service_id = sv.id);

-- 3 (before 2, so plans copy from the surviving cycle). Seeded cycles: no test
-- labels, no channel; fold the retail and wholesale's copy of the adult menu into
-- restaurants's when their days are identical.
CREATE TEMP TABLE IF NOT EXISTS _n4a_fold (ghost uuid, adult uuid) ON COMMIT DROP;

DO $$
DECLARE
  adult  uuid;
  ghost  uuid;
BEGIN
  SELECT id INTO adult FROM farm.subscription_cycles WHERE source = 'seed' AND subscriber_id IS NULL AND channel = 2 ORDER BY start_date DESC LIMIT 1;
  SELECT id INTO ghost FROM farm.subscription_cycles WHERE source = 'seed' AND subscriber_id IS NULL AND channel = 3 ORDER BY start_date DESC LIMIT 1;
  IF adult IS NOT NULL AND ghost IS NOT NULL
     AND NOT EXISTS (
       (SELECT day, grow_plan_code FROM farm.subscription_cycle_days WHERE cycle_id = adult
        EXCEPT SELECT day, grow_plan_code FROM farm.subscription_cycle_days WHERE cycle_id = ghost)
       UNION ALL
       (SELECT day, grow_plan_code FROM farm.subscription_cycle_days WHERE cycle_id = ghost
        EXCEPT SELECT day, grow_plan_code FROM farm.subscription_cycle_days WHERE cycle_id = adult)
     ) THEN
    UPDATE farm.orders SET subscription_cycle_id = adult WHERE subscription_cycle_id = ghost;
    -- Keep the channel on the surviving row until step 2 has copied plans from it.
    UPDATE farm.subscription_cycles SET channel = NULL WHERE id = ghost;
    INSERT INTO _n4a_fold VALUES (ghost, adult);
  END IF;
END $$;

-- 2. A flatPlan per subscriber that is not inactive, copied from the active
--    cycle on its channel that started last (the rule that fed the subscriber
--    until now), so every subscriber's orders read what they read before.
CREATE TEMP TABLE IF NOT EXISTS _n4a_source ON COMMIT DROP AS
SELECT DISTINCT ON (c.id)
       c.id AS subscriber_id,
       COALESCE((SELECT f.adult FROM pg_temp._n4a_fold f WHERE f.ghost = m.id), m.id) AS cycle_id,
       m.start_date, m.length_days, m.weekdays, m.name
FROM farm.subscribers c
JOIN farm.subscription_cycles m
  ON m.subscriber_id IS NULL AND m.status = 'active'
 AND (m.channel = c.channel OR (c.channel = 3 AND m.id IN (SELECT ghost FROM pg_temp._n4a_fold)))
WHERE c.status <> 'inactive'
  AND NOT EXISTS (SELECT 1 FROM farm.subscription_cycles p WHERE p.subscriber_id = c.id)
ORDER BY c.id, m.start_date DESC, m.created_at DESC;

INSERT INTO farm.subscription_cycles (subscriber_id, from_cycle_id, channel, name, start_date, length_days, weekdays, status, notes, source)
SELECT s.subscriber_id, s.cycle_id, NULL, 'FlatPlan', s.start_date, s.length_days, s.weekdays, 'active',
       'Copied from the subscriptionCycle the subscriber''s channel served when flatPlans were introduced (Roadmap N4a).', 'user_built'
FROM pg_temp._n4a_source s;

INSERT INTO farm.subscription_cycle_days (cycle_id, day, grow_plan_code)
SELECT p.id, d.day, d.grow_plan_code
FROM farm.subscription_cycles p
JOIN pg_temp._n4a_source s ON s.subscriber_id = p.subscriber_id AND p.from_cycle_id = s.cycle_id
JOIN farm.subscription_cycle_days d ON d.cycle_id = s.cycle_id
WHERE NOT EXISTS (SELECT 1 FROM farm.subscription_cycle_days x WHERE x.cycle_id = p.id);

-- Finish 3: drop the folded duplicate, then the shared cycles carry no channel
-- and no test labels.
DELETE FROM farm.subscription_cycles WHERE id IN (SELECT ghost FROM pg_temp._n4a_fold);

UPDATE farm.subscription_cycles
SET name = CASE channel WHEN 1 THEN 'Student menu — 10 days' ELSE 'Adult menu — 10 days' END,
    notes = 'Week 1 is days 1–5, week 2 is days 6–10, Monday to Friday.',
    updated_at = now()
WHERE source = 'seed' AND subscriber_id IS NULL AND length_days = 10 AND channel IS NOT NULL;

UPDATE farm.subscription_cycles SET channel = NULL WHERE subscriber_id IS NULL;

-- ── farm_sustainability_records.sql ──
-- 0072_farm_sustainability_records.sql
-- Cotyledon — utility and lab readings, and refrigerant service tickets, as records
-- (Roadmap N6 slice 4).
--
-- Decisions:
--   * Sustainability follows the Plan / Actual toggle like the operations pages.
--   * Energy and water quantities become RECORDS on Actual. Plan runs whatever is
--     loaded into the scenario; the scenario's typed quantities stay there.
--   * Refrigerant added at service is a fact: entered and shown on Actual only.
--     A forecast carries no leaks.
--   * Actual reports the calendar reporting year.
--
-- `sustainability_readings` holds one row per bill, sample or inspection. The
-- metric names the quantity; a flow (kWh, therms, gallons) sums over the bills in
-- the year, a strength result or trap fill reads the latest on or before the
-- year's end, a pump-out is a dated event with no quantity. `period_start` and
-- `read_on` bound the bill; a sample or inspection sets `read_on` only.
--
-- `refrigerant_service` holds one row per addition at service, keyed by the
-- equipment library's stable `key` (the same key the equipment attributes use).
-- The technician's ticket is a registered source.
--
-- Additive only: no existing column changes.

CREATE SCHEMA IF NOT EXISTS farm;

CREATE TABLE IF NOT EXISTS farm.sustainability_readings (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- electricity_kwh | electricity_renewable_kwh | natural_gas_therms | propane_gal
  -- | fleet_gasoline_gal | fleet_diesel_gal | water_metered_gal
  -- | wastewater_billed_mgal | bod_mg_l | tss_mg_l | cod_mg_l | fog_mg_l
  -- | grease_trap_fill | grease_trap_pump_out
  metric        text          NOT NULL,
  period_start  date,
  read_on       date          NOT NULL,
  quantity      double precision,
  source_id     uuid          REFERENCES farm.sources(id) ON DELETE SET NULL,
  notes         text,
  recorded_by   text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS farm_sustainability_readings_metric_idx ON farm.sustainability_readings (metric, read_on);

CREATE TABLE IF NOT EXISTS farm.refrigerant_service (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_key  text          NOT NULL,
  serviced_on    date          NOT NULL,
  lb_added       double precision NOT NULL,
  source_id      uuid          REFERENCES farm.sources(id) ON DELETE SET NULL,
  technician     text,
  notes          text,
  recorded_by    text,
  created_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS farm_refrigerant_service_key_idx ON farm.refrigerant_service (equipment_key, serviced_on);

-- ── farm_subscriber_rating_rating.sql ──
-- 0073_farm_subscriber_rating_rating.sql
-- Cotyledon — the RATING rating Cotyledon assigns a subscriber (Roadmap N7).
--
-- Decision: Cotyledon assigns RATING ratings — the subscriber
-- does not rate itself. A rating is one, two or three stars, in review, or not
-- rated (the default), with the date it was assigned. Plan v Actual tallies the
-- subscribers in the plan and the subscribers served on record by their rating.
--
-- Additive only: three nullable columns; a subscriber with none reads not rated.

ALTER TABLE farm.subscribers ADD COLUMN IF NOT EXISTS rating_status text;
ALTER TABLE farm.subscribers ADD COLUMN IF NOT EXISTS rating_stars integer;
ALTER TABLE farm.subscribers ADD COLUMN IF NOT EXISTS rating_rated_on date;

-- ── farm_staff_roles.sql ──
-- 0074_farm_staff_roles.sql
-- Cotyledon — work roles on the staff register, and the role each punch was worked in
-- (Roadmap P2).
--
-- Decisions:
--   * Staff may hold more than one role at any time. The work roles are operator
--     (production and harvest — the Grow Room) and sales (the Sales portal). Admin is a
--     sign-in list, not a work role.
--   * farm reports the hours worked by role; payroll does the rest. No class code is
--     held here.
--
-- `staff.roles` is the set a person may clock in under; every existing person keeps
-- operator. `time_punches.role` is the role of the shift the punch belongs to, taken
-- at clock-in; a punch written before this reads as operator.
--
-- Additive only.

ALTER TABLE farm.staff ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{operator}';
ALTER TABLE farm.time_punches ADD COLUMN IF NOT EXISTS role text;

-- ── farm_blast_blackout_racks_phase_1.sql ──
-- 0075_farm_blast_blackout_racks_phase_1.sql
-- Cotyledon — both blackout racks on Phase 1 (facility-design roadmap §2 decision 6, Q4b).
--
-- Decision: both 200 lb blackout racks are Phase 1. This is a
-- concurrency decision, not a capacity one — a sowing binds to ONE rack, and two
-- racks are two parallel streams, never one larger sowing (§2 decision 7). The
-- engine fix that stops multiplying a grow_unit's capacity by its unit count ships
-- with this migration, so the second rack adds a line in service and nothing
-- else: sowing sizes do not move.
--
-- The code seed (`_data/capex.ts`) now writes one row, qty 2, on build phase 1.
-- Seed rows already in the table are merged to match: the Phase 1 row takes the
-- second unit, and the seed's "(Phase 2)" row is removed — unless a refrigerant
-- service ticket names it, in which case it stays on the list at phase 1 with no
-- quantity (rows with no quantity sort last and count for nothing). A row an
-- admin re-keyed or added by hand (source <> 'seed') is not touched.
--
-- Data only; no schema change. Idempotent: a second run finds no "(Phase 2)" row.

UPDATE farm.equipment AS p1
SET qty = p1.qty + p2.qty
FROM farm.equipment AS p2
WHERE p1.key = 'Blackout rack, 200 lb capacity'
  AND p1.source = 'seed'
  AND p2.key = 'Blackout rack, 200 lb capacity (Phase 2)'
  AND p2.source = 'seed';

DELETE FROM farm.equipment
WHERE key = 'Blackout rack, 200 lb capacity (Phase 2)'
  AND source = 'seed'
  AND NOT EXISTS (
    SELECT 1 FROM farm.refrigerant_service r WHERE r.equipment_key = 'Blackout rack, 200 lb capacity (Phase 2)'
  );

UPDATE farm.equipment
SET build_phase = 1,
    qty = 0,
    notes = coalesce(notes || ' ', '') || 'Merged into the Phase 1 row on 2026-09-17 (both racks Phase 1); kept because a refrigerant service ticket names this key.'
WHERE key = 'Blackout rack, 200 lb capacity (Phase 2)'
  AND source = 'seed';

UPDATE farm.equipment
SET build_phase = 1
WHERE key = 'Blackout rack, 200 lb capacity'
  AND source = 'seed';

-- ── farm_facility_footprints.sql ──
-- 0076_farm_facility_footprints.sql
-- Cotyledon — footprint and clearance as open fields on the equipment library
-- (facility-design roadmap, step Q1).
--
-- The equipment list is the input; the square footage is the output. Each row
-- carries its plan footprint (width along the front × depth, inches), the
-- installation clearances a manufacturer publishes (null where the zone's
-- circulation factor applies instead), the facility zone it works in, whether
-- it sits under a Type I hood, and where the dimensions came from. A row with
-- no incremental floor (bench-mounted, on shelving, overhead, a vehicle) has
-- null width and depth and a source note saying why.
--
--   footprint_basis  'sourced'   — off a named model's spec sheet
--                    'estimated' — category-typical dimensions (a placeholder)
--                    'stated'    — supplied by the operator
--                    'observed'  — measured
--
-- Seeded by item name so a line split across build phases carries the same
-- footprint on both rows (`_data/facility-design.ts` FOOTPRINT_SEED). Rows an
-- admin has already given a footprint or a source note are not touched.

ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS footprint_width_in double precision;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS footprint_depth_in double precision;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS clearance_front_in double precision;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS clearance_rear_in double precision;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS clearance_side_in double precision;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS footprint_basis text NOT NULL DEFAULT 'estimated';
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS zone text;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS under_hood boolean NOT NULL DEFAULT false;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS footprint_source text;

ALTER TABLE farm.equipment DROP CONSTRAINT IF EXISTS farm_equipment_footprint;
ALTER TABLE farm.equipment ADD CONSTRAINT farm_equipment_footprint CHECK (
  (footprint_width_in IS NULL OR footprint_width_in >= 0) AND (footprint_depth_in IS NULL OR footprint_depth_in >= 0)
  AND (clearance_front_in IS NULL OR clearance_front_in >= 0) AND (clearance_rear_in IS NULL OR clearance_rear_in >= 0)
  AND (clearance_side_in IS NULL OR clearance_side_in >= 0)
);
ALTER TABLE farm.equipment DROP CONSTRAINT IF EXISTS farm_equipment_footprint_basis;
ALTER TABLE farm.equipment ADD CONSTRAINT farm_equipment_footprint_basis CHECK (footprint_basis IN ('sourced', 'estimated', 'stated', 'observed'));
ALTER TABLE farm.equipment DROP CONSTRAINT IF EXISTS farm_equipment_zone;
ALTER TABLE farm.equipment ADD CONSTRAINT farm_equipment_zone CHECK (zone IS NULL OR zone IN ('Hot line', 'A la carte', 'Prep', 'Packaging', 'Grow', 'Cold storage', 'Walk-in', 'Warewash', 'harvest'));

-- The seed, by item name (FOOTPRINT_SEED). A walk-in's width is its door wall.
UPDATE farm.equipment SET footprint_width_in = 42.625, footprint_depth_in = 44, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Hot line', under_hood = true, footprint_source = 'Rational ijar_stand Pro 20-full, 42-5/8 x 44 in total'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Jar stand oven, full size 20-pan';
UPDATE farm.equipment SET footprint_width_in = 51, footprint_depth_in = 44, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Hot line', under_hood = true, footprint_source = 'Cleveland KEL-100-T, 51 x 44 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Steam-jacketed tilting sprouting rack, 100 gal';
UPDATE farm.equipment SET footprint_width_in = 48, footprint_depth_in = 44, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Hot line', under_hood = true, footprint_source = 'Cleveland SGL-40-TR, 48 x 44 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Tilting braising pan / shelf, 40 gal';
UPDATE farm.equipment SET footprint_width_in = 40.25, footprint_depth_in = 41.125, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Hot line', under_hood = true, footprint_source = 'Vulcan VC44ED, 40-1/4 x 41-1/8 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Convection oven, double stack';
UPDATE farm.equipment SET footprint_width_in = 49.375, footprint_depth_in = 47.25, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Hot line', under_hood = true, footprint_source = 'Cleveland KGL-60-T, 49-3/8 x 47-1/4 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Steam-jacketed tilting sprouting rack, 60 gal';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Bench-mounted on a prep table; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Buffalo chopper / food processor';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Bench-mounted on a prep table; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Commercial slicer';
UPDATE farm.equipment SET footprint_width_in = 78, footprint_depth_in = 30, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Prep', under_hood = false, footprint_source = 'Average of a 3-comp (90 in) and a 2-comp (66 in) at 30 in deep'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Prep sinks, 3-comp and 2-comp';
UPDATE farm.equipment SET footprint_width_in = 96, footprint_depth_in = 30, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Prep', under_hood = false, footprint_source = 'Standard 96 x 30 in work table'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Stainless prep tables, 8 ft';
UPDATE farm.equipment SET footprint_width_in = 36.125, footprint_depth_in = 34, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Prep', under_hood = false, footprint_source = 'Hobart HCM450, 36-1/8 x 34 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Vertical cutter mixer, 45 qt';
UPDATE farm.equipment SET footprint_width_in = 36.5, footprint_depth_in = 58.9, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Prep', under_hood = false, footprint_source = 'Hobart HL800, 36.5 x 58.9 in including bowl-lift travel'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Planetary mixer, 80 qt';
UPDATE farm.equipment SET footprint_width_in = 41, footprint_depth_in = 35, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Grow', under_hood = false, footprint_source = 'Traulsen TBC13 (supersedes RBC200), 41 x 35 in, 200 lb rated'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Blackout rack, 200 lb capacity';
UPDATE farm.equipment SET footprint_width_in = 48, footprint_depth_in = 51.36, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Grow', under_hood = false, footprint_source = 'Cres Cor R-171-SUA-20E mobile blackout rack, 17.12 sq ft plan area; width and depth to be confirmed against the sheet'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Casing handling, blackout carts';
UPDATE farm.equipment SET footprint_width_in = 48, footprint_depth_in = 22, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Grow', under_hood = false, footprint_source = 'Cleveland MFS Metering Filling Station, 48 x 22 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Grow pump fill station';
UPDATE farm.equipment SET footprint_width_in = 98, footprint_depth_in = 93, clearance_front_in = 60, clearance_rear_in = 24, clearance_side_in = 24, footprint_basis = 'sourced', zone = 'Grow', under_hood = false, footprint_source = 'Cleveland P-TC-220 vertical tumble blackout_rack, 98 x 93 in. Published clearances 60 in front, 24 in rear, 12 in one side and 36 in the electrical side (carried as 24 in each side)'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Tumble blackout rack / ice water bath system';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Mounts on the sealer or its conveyor; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Date and lot coder, inkjet';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Bench-mounted; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Label printer / applicator';
UPDATE farm.equipment SET footprint_width_in = 96, footprint_depth_in = 30, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Packaging', under_hood = false, footprint_source = 'Standard 96 x 30 in work table'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Packaging tables, stainless';
UPDATE farm.equipment SET footprint_width_in = 50.39, footprint_depth_in = 42.83, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Packaging', under_hood = false, footprint_source = 'Ilpra FoodPack Synergy, 1280 x 1088 mm'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Tray sealer, semi-automatic';
UPDATE farm.equipment SET footprint_width_in = 75, footprint_depth_in = 41, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Packaging', under_hood = false, footprint_source = 'VacMaster VP800 double chamber, 75 x 41 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Vacuum packaging machine, chamber';
UPDATE farm.equipment SET footprint_width_in = 28, footprint_depth_in = 33, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Cold storage', under_hood = false, footprint_source = 'Standard mobile holding rack, 28 x 33 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Mobile refrigerated holding rack';
UPDATE farm.equipment SET footprint_width_in = 54, footprint_depth_in = 34, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Cold storage', under_hood = false, footprint_source = 'Standard 2-section reach-in, 54 x 34 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Reach-in refrigerator, 2-door';
UPDATE farm.equipment SET footprint_width_in = 144, footprint_depth_in = 240, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Walk-in', under_hood = false, footprint_source = 'Nominal 12 x 20 ft from the item name; door on the 12 ft wall'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Walk-in cooler, 12x20, with refrigeration';
UPDATE farm.equipment SET footprint_width_in = 120, footprint_depth_in = 144, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Walk-in', under_hood = false, footprint_source = 'Nominal 10 x 12 ft from the item name; door on the 10 ft wall'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Walk-in freezer, 10x12, with refrigeration';
UPDATE farm.equipment SET footprint_width_in = 120, footprint_depth_in = 144, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Walk-in', under_hood = false, footprint_source = 'Nominal 10 x 12 ft from the item name; door on the 10 ft wall'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Walk-in cooler, 10x12, with refrigeration';
UPDATE farm.equipment SET footprint_width_in = 96, footprint_depth_in = 120, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Walk-in', under_hood = false, footprint_source = 'Nominal 8 x 10 ft from the item name; door on the 8 ft wall'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Walk-in freezer, 8x10, with refrigeration';
UPDATE farm.equipment SET footprint_width_in = 12, footprint_depth_in = 8, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Warewash', under_hood = false, footprint_source = 'Lot of 6: five wall-hung hand sinks and one 24 x 24 in mop sink, averaged to 0.67 sq ft each'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Hand sinks and mop sink';
UPDATE farm.equipment SET footprint_width_in = 120, footprint_depth_in = 30, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Warewash', under_hood = false, footprint_source = '3-comp with two drainboards, 120 x 30 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Pot sink, 3-comp with disposer';
UPDATE farm.equipment SET footprint_width_in = 84, footprint_depth_in = 26.6875, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', zone = 'Warewash', under_hood = false, footprint_source = 'Champion 80 PRO-HD, 84 x 26-11/16 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Rack conveyor dishwasher + booster';
UPDATE farm.equipment SET footprint_width_in = 36, footprint_depth_in = 24, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'Warewash', under_hood = false, footprint_source = 'Standard sanitation cart, 36 x 24 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Sanitation cart, chemical dispensing';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Lives in dry storage; that room is sized by program allowance'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Wire shelving and dunnage racks';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Stored on the shelving above; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Sheet pans, hotel pans, cambros, smallwares';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Bench and dock-mounted; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Scales, receiving and unit';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'No floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Thermometers, dataloggers, calibration kit';
UPDATE farm.equipment SET footprint_width_in = 30, footprint_depth_in = 24, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'harvest', under_hood = false, footprint_source = 'Standard insulated transport cart, 30 x 24 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Insulated transport carts';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Vehicle. Dock and parking, not enclosed building area'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Refrigerated distribution van';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'IT closet; inside the support program'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Network, temperature monitoring, cameras';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Bench-mounted; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Terminals, tablets, label printers';
UPDATE farm.equipment SET footprint_width_in = 32, footprint_depth_in = 36, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'harvest', under_hood = false, footprint_source = 'Full-height insulated holding rack, 32 x 36 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Hot holding racks, insulated';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Lot; stored on shelving in wares storage'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'restaurant transport, chafing, beverage';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Vehicle. Dock and parking, not enclosed building area'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Refrigerated distribution van, second';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Lot; stored on shelving in wares storage'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Buffet and action station equipment';
UPDATE farm.equipment SET footprint_width_in = 32, footprint_depth_in = 36, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'A la carte', under_hood = true, footprint_source = 'Double-vat floor fryer with filtration, 32 x 36 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Fry station, double vat';
UPDATE farm.equipment SET footprint_width_in = 36, footprint_depth_in = 32, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'A la carte', under_hood = true, footprint_source = '36 in griddle on an equipment stand'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Griddle / plancha, 36 in';
UPDATE farm.equipment SET footprint_width_in = 36, footprint_depth_in = 32, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'A la carte', under_hood = true, footprint_source = '36 in charbroiler on a stand; salamander wall-mounted'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Charbroiler and salamander';
UPDATE farm.equipment SET footprint_width_in = 48, footprint_depth_in = 32, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'A la carte', under_hood = false, footprint_source = 'Undercounter / worktop refrigeration, 48 x 32 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'A la carte line refrigeration units';
UPDATE farm.equipment SET footprint_width_in = 60, footprint_depth_in = 24, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = 'A la carte', under_hood = false, footprint_source = 'Heated pass shelf unit, 60 x 24 in'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Heated expo and pickup shelving';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Overhead; no floor. Drives hood linear feet through the units under it'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'Hood extension for the line';
UPDATE farm.equipment SET footprint_width_in = NULL, footprint_depth_in = NULL, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'estimated', zone = NULL, under_hood = false, footprint_source = 'Bench and wall-mounted; no incremental floor'
  WHERE footprint_width_in IS NULL AND footprint_source IS NULL AND item = 'POS and distribution integration hardware';

-- ── farm_facility_layouts.sql ──
-- 0077_farm_facility_layouts.sql
-- Cotyledon — the floor layout (facility-design roadmap, step Q6).
--
-- A layout is a drawing, not a ledger entry: the shell, the rooms drawn in it
-- and where each unit of the equipment library stands, in feet from the
-- shell's top-left corner. One drawing per scenario and build phase
-- (`scenario_key` is the scenario id, or 'plan-data' when no plan of record
-- is set). Versions are never overwritten: a save inserts the next version and
-- the page reads the latest. Nothing in the Plan or Actual ledger reads it;
-- the conformance checks and the measured-against-derived comparison do.

CREATE TABLE IF NOT EXISTS farm.facility_layouts (
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
  CONSTRAINT farm_facility_layouts_phase CHECK (build_phase BETWEEN 1 AND 3),
  CONSTRAINT farm_facility_layouts_shell CHECK (shell_width_ft > 0 AND shell_depth_ft > 0),
  CONSTRAINT farm_facility_layouts_version UNIQUE (scenario_key, build_phase, version)
);

CREATE INDEX IF NOT EXISTS farm_facility_layouts_key_idx ON farm.facility_layouts (scenario_key, build_phase, version DESC);

-- ── farm_pot_sink_no_disposer.sql ──
-- 0078_farm_pot_sink_no_disposer.sql
-- Cotyledon — the pot sink carries no disposer.
--
-- Austin City Code §25-12-153 (UPC §616.0) prohibits food waste disposal units
-- in commercial farms unless approved under §301.3. The seeded Phase 1 row
-- "Pot sink, 3-comp with disposer" becomes "Pot sink, 3-comp with drainboards":
-- two drainboards, scrap handled by hand to the refrigerated waste room the
-- support program already carries. Footprint, cost and phase are unchanged.
-- The key follows the item so the code seed and the row agree; nothing
-- references a sink by key. Data only; idempotent; a hand-edited row is left.

UPDATE farm.equipment
SET key = 'Pot sink, 3-comp with drainboards',
    item = 'Pot sink, 3-comp with drainboards',
    notes = 'Two drainboards; scrap goes by hand to the refrigerated waste room. No disposer: Austin City Code §25-12-153 (UPC §616.0).'
WHERE key = 'Pot sink, 3-comp with disposer'
  AND source = 'seed'
  AND NOT EXISTS (SELECT 1 FROM farm.equipment e WHERE e.key = 'Pot sink, 3-comp with drainboards');

-- ── farm_equipment_spec_sheets.sql ──
-- 0079_farm_equipment_spec_sheets.sql
-- Cotyledon — footprints re-sourced to spec sheets; manufacturer, model and spec sheet on the row.
--
-- Every row with floor now reads its width, depth and published clearances off
-- a named representative model's spec sheet (facility-design roadmap §5,
-- re-sourced 2026-09-17), and carries the manufacturer, the model and the
-- sheet's link. The three columns are shown on the Facility page's Footprints
-- tab, not on Equipment. Rows an admin has stated or measured are left alone.
-- Data plus three nullable columns; idempotent.

ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS manufacturer text;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS spec_sheet_url text;

UPDATE farm.equipment SET footprint_width_in = 42.625, footprint_depth_in = 44, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Rational ijar_stand Pro 20-full, 42-5/8 x 44 in total', manufacturer = 'Rational', model = 'ijar_stand Pro 20-full', spec_sheet_url = 'https://www.webstaurantstore.com/documents/specsheets/pro_20-full.pdf'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Jar stand oven, full size 20-pan';
UPDATE farm.equipment SET footprint_width_in = 51, footprint_depth_in = 44, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Cleveland KEL-100-T, 51 x 44 in', manufacturer = 'Cleveland', model = 'KEL-100-T', spec_sheet_url = 'https://www.clevelandrange.com/product/kel100t-electric-steam-sprouting_racks-quad-leg-tilting/'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Steam-jacketed tilting sprouting rack, 100 gal';
UPDATE farm.equipment SET footprint_width_in = 48, footprint_depth_in = 44, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Cleveland SGL-40-TR, 48 x 44 in', manufacturer = 'Cleveland', model = 'SGL-40-TR', spec_sheet_url = 'https://www.clevelandrange.com/wp-content/uploads/2025/02/KE004046-93-SGL-30-40TR.pdf'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Tilting braising pan / shelf, 40 gal';
UPDATE farm.equipment SET footprint_width_in = 40.25, footprint_depth_in = 41.125, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Vulcan VC44ED, 40-1/4 x 41-1/8 in', manufacturer = 'Vulcan', model = 'VC44ED', spec_sheet_url = 'https://www.vulcanequipment.com/pickup_points/default/files/webdam_asset/85620879.pdf'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Convection oven, double stack';
UPDATE farm.equipment SET footprint_width_in = 49.375, footprint_depth_in = 47.25, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Cleveland KGL-60-T, 49-3/8 x 47-1/4 in', manufacturer = 'Cleveland', model = 'KGL-60-T', spec_sheet_url = 'https://www.clevelandrange.com/wp-content/uploads/2025/02/KE004046-73-KGL-40-60-80-T.pdf'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Steam-jacketed tilting sprouting rack, 60 gal';
UPDATE farm.equipment SET footprint_width_in = 94, footprint_depth_in = 27, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Advance Tabco 94-3-54-24RL (103 x 27 in) and 94-2-36-24RL (85 x 27 in), one of each, averaged to 94 x 27 in', manufacturer = 'Advance Tabco', model = '94-3-54-24RL / 94-2-36-24RL', spec_sheet_url = 'https://www.webstaurantstore.com/advance-tabco-94-3-54-24rl-spec-line-three-compartment-pot-sink-with-two-drainboards-103/1099435424B.html'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Prep sinks, 3-comp and 2-comp';
UPDATE farm.equipment SET footprint_width_in = 96, footprint_depth_in = 30, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Advance Tabco TTS-308, 96 x 30 in', manufacturer = 'Advance Tabco', model = 'TTS-308', spec_sheet_url = 'https://www.gofoodservice.com/p/advance-tabco-tts-308'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Stainless prep tables, 8 ft';
UPDATE farm.equipment SET footprint_width_in = 36.125, footprint_depth_in = 34, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Hobart HCM450, 36-1/8 x 34 in', manufacturer = 'Hobart', model = 'HCM450', spec_sheet_url = 'https://www.hobartcorp.com/pickup_points/default/files/webdam-assets/HCM450%20Cutter%20Mixer%20Spec%20Sheet%20F7734%20(04-23).pdf'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Vertical cutter mixer, 45 qt';
UPDATE farm.equipment SET footprint_width_in = 27.25, footprint_depth_in = 46, clearance_front_in = 14.1875, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Hobart HL800, 27-1/4 x 46 in; the bowl swings out to 60-3/16 in, carried as 14-3/16 in front clearance', manufacturer = 'Hobart', model = 'HL800', spec_sheet_url = 'https://www.hobartcorp.com/pickup_points/default/files/webdam-assets/HL800%20Legacy%20PLUS%20Spec%20Sheet%20F40113%20(07-21).pdf'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Planetary mixer, 80 qt';
UPDATE farm.equipment SET footprint_width_in = 41, footprint_depth_in = 35, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Traulsen TBC13 (supersedes RBC200), 41 x 35 in, 200 lb rated', manufacturer = 'Traulsen', model = 'TBC13', spec_sheet_url = 'https://www.hobart.ca/wp-content/uploads/2024/03/TBC13-Blast-blackout_rack-Reach-In-Spec-Sheet-TR36053-10-23.pdf'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Blackout rack, 200 lb capacity';
UPDATE farm.equipment SET footprint_width_in = 62, footprint_depth_in = 35.5, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Cres Cor R-171-SUA-20E blackoutTemp two-door mobile refrigerated rack, 62 x 35-1/2 in', manufacturer = 'Cres Cor', model = 'R-171-SUA-20E', spec_sheet_url = 'https://www.crescor.com/product/r171sua20e/'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Casing handling, blackout carts';
UPDATE farm.equipment SET footprint_width_in = 48, footprint_depth_in = 22, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Cleveland MFS Metering Filling Station, 48 x 22 in', manufacturer = 'Cleveland', model = 'MFS', spec_sheet_url = 'https://www.clevelandrange.com/product/fam_lfgsem/mfs-metering-filling-station/'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Grow pump fill station';
UPDATE farm.equipment SET footprint_width_in = 98, footprint_depth_in = 93, clearance_front_in = 60, clearance_rear_in = 24, clearance_side_in = 24, footprint_basis = 'sourced', footprint_source = 'Cleveland P-TC-220 vertical tumble blackout_rack, 98 x 93 in. Published clearances 60 in front, 24 in rear, 12 in one side and 36 in the electrical side (carried as 24 in each side)', manufacturer = 'Cleveland', model = 'P-TC-220', spec_sheet_url = 'https://www.clevelandrange.com/wp-content/uploads/2026/06/Tumble_blackout_rack.pdf'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Tumble blackout rack / ice water bath system';
UPDATE farm.equipment SET footprint_width_in = 96, footprint_depth_in = 30, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Advance Tabco TTS-308, 96 x 30 in', manufacturer = 'Advance Tabco', model = 'TTS-308', spec_sheet_url = 'https://www.gofoodservice.com/p/advance-tabco-tts-308'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Packaging tables, stainless';
UPDATE farm.equipment SET footprint_width_in = 50.39, footprint_depth_in = 42.83, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Ilpra FoodPack Synergy, 1280 x 1088 mm', manufacturer = 'Ilpra', model = 'FoodPack Synergy', spec_sheet_url = 'https://ilpra.com/packaging_machine/foodpack-synergy/'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Tray sealer, semi-automatic';
UPDATE farm.equipment SET footprint_width_in = 75, footprint_depth_in = 41, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'VacMaster VP800 double chamber, 75 x 41 in', manufacturer = 'VacMaster', model = 'VP800', spec_sheet_url = 'https://alfaco.com/product/vacmaster-vp800-double-chamber-vacuum-sealer/'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Vacuum packaging machine, chamber';
UPDATE farm.equipment SET footprint_width_in = 28.3125, footprint_depth_in = 37.375, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Cres Cor R-171-SUA-10E blackoutTemp single-door mobile refrigerated rack, 28-5/16 x 37-3/8 in', manufacturer = 'Cres Cor', model = 'R-171-SUA-10E', spec_sheet_url = 'https://www.katom.com/546-R171SUA10E.html'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Mobile refrigerated holding rack';
UPDATE farm.equipment SET footprint_width_in = 54.125, footprint_depth_in = 29.5, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'True T-49-HC two-section reach-in, 54-1/8 x 29-1/2 in', manufacturer = 'True', model = 'T-49-HC', spec_sheet_url = 'https://www.truemfg.com/product/t-49-hc/'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Reach-in refrigerator, 2-door';
UPDATE farm.equipment SET footprint_width_in = 144, footprint_depth_in = 240, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Nominal 12 x 20 ft from the item name; door on the 12 ft wall', manufacturer = NULL, model = NULL, spec_sheet_url = NULL
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Walk-in cooler, 12x20, with refrigeration';
UPDATE farm.equipment SET footprint_width_in = 120, footprint_depth_in = 144, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Nominal 10 x 12 ft from the item name; door on the 10 ft wall', manufacturer = NULL, model = NULL, spec_sheet_url = NULL
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Walk-in freezer, 10x12, with refrigeration';
UPDATE farm.equipment SET footprint_width_in = 120, footprint_depth_in = 144, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Nominal 10 x 12 ft from the item name; door on the 10 ft wall', manufacturer = NULL, model = NULL, spec_sheet_url = NULL
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Walk-in cooler, 10x12, with refrigeration';
UPDATE farm.equipment SET footprint_width_in = 96, footprint_depth_in = 120, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Nominal 8 x 10 ft from the item name; door on the 8 ft wall', manufacturer = NULL, model = NULL, spec_sheet_url = NULL
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Walk-in freezer, 8x10, with refrigeration';
UPDATE farm.equipment SET footprint_width_in = 17.25, footprint_depth_in = 15.25, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Lot of 6: five Advance Tabco 7-PS-60 wall-hung hand sinks, 17-1/4 x 15-1/4 in each (the unit carried), and one 9-OP-40 floor mop sink, 25 x 21 in', manufacturer = 'Advance Tabco', model = '7-PS-60 / 9-OP-40', spec_sheet_url = 'https://www.webstaurantstore.com/advance-tabco-7-ps-60-hand-sink-with-splash-mount-faucet-17-1-4-x-15-1-4/1097PS60.html'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Hand sinks and mop sink';
UPDATE farm.equipment SET footprint_width_in = 127, footprint_depth_in = 31, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Advance Tabco 94-43-72-24RL, three 24 x 24 in compartments and two 24 in drainboards, 127 x 31 in', manufacturer = 'Advance Tabco', model = '94-43-72-24RL', spec_sheet_url = 'https://www.webstaurantstore.com/advance-tabco-94-43-72-24rl-spec-line-three-compartment-pot-sink-with-two-drainboards-127/10994437224B.html'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Pot sink, 3-comp with drainboards';
UPDATE farm.equipment SET footprint_width_in = 84, footprint_depth_in = 26.6875, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Champion 80 PRO-HD, 84 x 26-11/16 in', manufacturer = 'Champion', model = '80 PRO-HD', spec_sheet_url = 'https://www.championindustries.com/80-PRO-Heavy-Duty-Prewash-Rack-Conveyor'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Rack conveyor dishwasher + booster';
UPDATE farm.equipment SET footprint_width_in = 48.25, footprint_depth_in = 22, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Rubbermaid FG9T7200 high-capacity janitor cart, 48-1/4 x 22 in', manufacturer = 'Rubbermaid Commercial', model = 'FG9T7200', spec_sheet_url = 'https://www.katom.com/007-FG9T7200BLA.html'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Sanitation cart, chemical dispensing';
UPDATE farm.equipment SET footprint_width_in = 18, footprint_depth_in = 25, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Cambro UPC400 Ultra Pan Carrier, front loading, 18 x 25 in', manufacturer = 'Cambro', model = 'UPC400', spec_sheet_url = 'https://www.webstaurantstore.com/cambro-upc400110-ultra-pan-carrier-black-front-loading-insulated-food-pan-carrier/214UPC400BK.html'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Insulated transport carts';
UPDATE farm.equipment SET footprint_width_in = 28.75, footprint_depth_in = 32.75, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Cres Cor H-137-UA-12D insulated holding rack, 28-3/4 x 32-3/4 in', manufacturer = 'Cres Cor', model = 'H-137-UA-12D', spec_sheet_url = 'https://www.webstaurantstore.com/cres-cor-h-137-ua-12d-insulated-holding-rack-solid-dutch-doors-120v/265H137UA12D.html'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Hot holding racks, insulated';
UPDATE farm.equipment SET footprint_width_in = 31.25, footprint_depth_in = 34.375, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Pitco SG14-2FD Solstice two-vat floor fryer with filter drawer, 31-1/4 x 34-3/8 in', manufacturer = 'Pitco', model = 'SG14-2FD', spec_sheet_url = 'https://www.pitco.com/wp-content/uploads/2022/02/L10-294-R2-SG14-with-Options.pdf'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Fry station, double vat';
UPDATE farm.equipment SET footprint_width_in = 36, footprint_depth_in = 31.5, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Vulcan MSA36 heavy-duty countertop griddle on an equipment stand, 36 x 31-1/2 in', manufacturer = 'Vulcan', model = 'MSA36', spec_sheet_url = 'https://www.vulcanequipment.com/griddles/36-msa-series-flat-top-gas-griddle'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Griddle / plancha, 36 in';
UPDATE farm.equipment SET footprint_width_in = 36, footprint_depth_in = 27.25, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Vulcan VCCB36 radiant charbroiler on a stand, 36 x 27-1/4 in; salamander wall-mounted above', manufacturer = 'Vulcan', model = 'VCCB36', spec_sheet_url = 'https://www.katom.com/207-VCCB36NG.html'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Charbroiler and salamander';
UPDATE farm.equipment SET footprint_width_in = 48.375, footprint_depth_in = 31.125, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'True TWT-48-HC two-section worktop refrigerator, 48-3/8 x 31-1/8 in', manufacturer = 'True', model = 'TWT-48-HC', spec_sheet_url = 'https://www.truemfg.com/wp-content/uploads/true-media/spec-sheets/TWT-48-HC.pdf'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'A la carte line refrigeration units';
UPDATE farm.equipment SET footprint_width_in = 60, footprint_depth_in = 19.5, clearance_front_in = NULL, clearance_rear_in = NULL, clearance_side_in = NULL, footprint_basis = 'sourced', footprint_source = 'Hatco GRS-60-I Glo-Ray free-standing heated shelf, 60 x 19-1/2 in', manufacturer = 'Hatco', model = 'GRS-60-I', spec_sheet_url = 'https://www.hatcocorp.com/cms/SPECSHEETS/000000004171201-00014-20161121.PDF'
  WHERE source = 'seed' AND footprint_basis IN ('estimated', 'sourced') AND item = 'Heated expo and pickup shelving';
