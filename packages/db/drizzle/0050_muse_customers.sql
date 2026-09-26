-- 0050_muse_customers.sql
-- Impact OS — customers, sites and the site-by-site participation
-- forecast (Roadmap Phase H2).
--
-- Demand is not a channel constant. It is the sum, over every site a customer
-- is served at, of that site's expected meals per service day times its service
-- days. For a school site the expected meals are enrollment × a participation
-- rate; for a corporate or retail site they are a typed expected count. Every
-- figure is a forecast until a contract or an actual meal count replaces it, and
-- the platform labels it so.
--
--   * customers      — a district, a company or a marketplace, on one expansion
--                      phase (channel), with an optional contracted price per
--                      meal (null = the channel's default), contract dates, and
--                      an optional link to the prospect record in the CRM.
--   * customer_sites — where the customer is served. `site_id` links the row to
--                      the delivery site (Sites & Delivery, Logistics) so one
--                      site carries one forecast. Grade groups drive crediting;
--                      service days per year and the forecast drive demand.
--
-- The library seeds itself on first read from the channel constants that stood
-- in for demand until now (1,000 / 500 / 188 meals a day), spread over the
-- invented delivery sites and marked `source = 'seed'`, so the numbers the
-- platform showed are visible, labelled and replaceable rather than silently
-- changed.

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.customers (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text         NOT NULL,
  -- 'district' | 'company' | 'marketplace' | 'other'
  kind                 text         NOT NULL DEFAULT 'other',
  -- Expansion phase served: 1 schools, 2 corporate catering, 3 ghost kitchen / retail.
  channel              integer      NOT NULL,
  -- 'prospect' | 'contracted' | 'inactive'
  status               text         NOT NULL DEFAULT 'prospect',
  -- Contracted price per meal; NULL = the channel's default price.
  price_per_meal_cents integer,
  contract_start       date,
  contract_end         date,
  -- The prospect record in the Sales CRM, when there is one.
  school_id            text,
  notes                text,
  -- 'seed' | 'user_built'
  source               text         NOT NULL DEFAULT 'user_built',
  created_by           text,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT muse_customers_channel CHECK (channel BETWEEN 1 AND 3),
  CONSTRAINT muse_customers_status CHECK (status IN ('prospect', 'contracted', 'inactive'))
);
CREATE INDEX IF NOT EXISTS muse_customers_channel_idx ON muse.customers (channel);

CREATE TABLE IF NOT EXISTS muse.customer_sites (
  id                     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id            uuid         NOT NULL REFERENCES muse.customers (id) ON DELETE CASCADE,
  -- The delivery site this row is served at (Sites & Delivery id), when linked.
  site_id                text,
  name                   text         NOT NULL,
  -- e.g. ["K-5", "6-8"]
  grade_groups           jsonb        NOT NULL DEFAULT '[]'::jsonb,
  service_days_per_year  integer      NOT NULL DEFAULT 180,
  -- School forecast: enrollment × participation rate.
  enrollment             integer,
  participation_rate     double precision,
  -- Corporate / retail forecast, or a school override: a typed expected count.
  expected_meals_per_day double precision,
  -- 'active' | 'planned' | 'inactive'
  status                 text         NOT NULL DEFAULT 'active',
  notes                  text,
  created_by             text,
  created_at             timestamptz  NOT NULL DEFAULT now(),
  updated_at             timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT muse_customer_sites_days CHECK (service_days_per_year BETWEEN 0 AND 366),
  CONSTRAINT muse_customer_sites_rate CHECK (participation_rate IS NULL OR (participation_rate >= 0 AND participation_rate <= 1)),
  CONSTRAINT muse_customer_sites_status CHECK (status IN ('active', 'planned', 'inactive'))
);
CREATE INDEX IF NOT EXISTS muse_customer_sites_customer_idx ON muse.customer_sites (customer_id);
CREATE INDEX IF NOT EXISTS muse_customer_sites_site_idx ON muse.customer_sites (site_id);
