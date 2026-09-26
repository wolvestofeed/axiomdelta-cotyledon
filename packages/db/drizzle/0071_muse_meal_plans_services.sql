-- 0071_muse_meal_plans_services.sql
-- Impact OS — meal plans, services, dated volume and site calendars (Roadmap Phase N, step N4a).
--
-- Decisions 17–20 of the operating-model build plan (Robert, 2026-09-16):
--
--   * A SERVICE is one meal occasion — one loading and dispatch/delivery of an
--     order. A site carries its services; two services in a day are two orders.
--   * Volume is MEALS PER SERVICE, set by dated picks. From each pick the
--     volume carries forward until the next one. Before the first pick a
--     service carries no volume.
--   * Every site has its own SERVICE CALENDAR — term dates and breaks — entered
--     at customer setup. A site with no term entered serves every service
--     weekday the kitchen is open, and the page says the calendar is not on file.
--   * Every customer has its own MEAL PLAN. A channel groups revenue and limits
--     the recipes offered; it never decides what a customer is served. A meal
--     plan is either a saved menu cycle copied onto the customer in one click
--     or a recipe sequence programmed for that customer alone.
--   * MENU CYCLES are the shared list of saved sequences. They are not assigned
--     to channels. Editing one applies to the customers picked (selected or
--     all whose plan came from it); nobody else's plan moves.
--
-- A meal plan and a menu cycle are the same shape (a start date, a length, the
-- service weekdays it advances on, a recipe per day), so they share
-- `muse.menu_cycles`: a row with `customer_id` NULL is a saved menu cycle on
-- the shared list; a row with `customer_id` set is that customer's meal plan.
-- `from_cycle_id` names the saved cycle a plan was copied from, which is what
-- the apply-to picker offers. A plan with `customer_service_id` set is that
-- service's plan and wins over the customer's all-services plan on its dates.
--
-- The customer status 'forecast' is added (text, no constraint change): a
-- Forecast Customer is a master-list customer with manual mock figures, used
-- in forecasts and never on Actual.
--
-- Additive, with a backfill so nothing the model shows disappears:
--   1. every site that is not inactive gets one service — Mon–Fri — whose
--      first volume pick is the site's current forecast (enrollment ×
--      participation, else the expected count, else zero), effective from the
--      customer's contract start, else the date the site was created;
--   2. every customer that is not inactive gets a meal plan copied from the
--      active cycle on its channel that started last, naming it as the source;
--   3. the seeded cycles lose their test labels and their channel; the ghost
--      kitchen's seeded cycle — the same adult menu as corporate catering's —
--      is folded into it when the days match.
-- The old site forecast columns (service_days_per_year, enrollment,
-- participation_rate, expected_meals_per_day) and menu_cycles.channel stay
-- until the release that stops reading them has shipped (Roadmap N9).

CREATE SCHEMA IF NOT EXISTS muse;

-- ── Services ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS muse.customer_services (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_site_id  uuid          NOT NULL REFERENCES muse.customer_sites(id) ON DELETE CASCADE,
  name              text          NOT NULL,
  -- The weekdays the service is delivered; 0 = Sunday … 6 = Saturday.
  weekdays          jsonb         NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,
  -- 'active' | 'inactive'
  status            text          NOT NULL DEFAULT 'active',
  position          integer       NOT NULL DEFAULT 0,
  notes             text,
  created_by        text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS muse_customer_services_site_idx ON muse.customer_services (customer_site_id);

-- ── Dated volume picks ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS muse.service_volume_picks (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id        uuid          NOT NULL REFERENCES muse.customer_services(id) ON DELETE CASCADE,
  -- From this date the service carries `meals` per service, until the next pick.
  effective_date    date          NOT NULL,
  meals             double precision NOT NULL CHECK (meals >= 0),
  notes             text,
  created_by        text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (service_id, effective_date)
);

-- ── Site service calendars ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS muse.site_calendar_ranges (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_site_id  uuid          NOT NULL REFERENCES muse.customer_sites(id) ON DELETE CASCADE,
  -- 'term' (the site takes meals) | 'break' (it does not, inside a term)
  kind              text          NOT NULL,
  label             text,
  start_date        date          NOT NULL,
  end_date          date          NOT NULL,
  created_by        text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  CHECK (kind IN ('term', 'break')),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS muse_site_calendar_ranges_site_idx ON muse.site_calendar_ranges (customer_site_id, start_date);

-- ── Menu cycles become the shared list; meal plans share the shape ─────────

ALTER TABLE muse.menu_cycles ALTER COLUMN channel DROP NOT NULL;
ALTER TABLE muse.menu_cycles ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES muse.customers(id) ON DELETE CASCADE;
ALTER TABLE muse.menu_cycles ADD COLUMN IF NOT EXISTS customer_service_id uuid REFERENCES muse.customer_services(id) ON DELETE CASCADE;
ALTER TABLE muse.menu_cycles ADD COLUMN IF NOT EXISTS from_cycle_id uuid REFERENCES muse.menu_cycles(id) ON DELETE SET NULL;
-- Null = open-ended.
ALTER TABLE muse.menu_cycles ADD COLUMN IF NOT EXISTS end_date date;
CREATE INDEX IF NOT EXISTS muse_menu_cycles_customer_idx ON muse.menu_cycles (customer_id, start_date);
CREATE INDEX IF NOT EXISTS muse_menu_cycles_from_idx ON muse.menu_cycles (from_cycle_id);

-- ── Orders name their service ───────────────────────────────────────────────

ALTER TABLE muse.orders ADD COLUMN IF NOT EXISTS customer_service_id uuid REFERENCES muse.customer_services(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS muse_orders_service_idx ON muse.orders (customer_service_id);

-- ── Backfill ────────────────────────────────────────────────────────────────

-- 1. One service per site that is not inactive, carrying its current forecast.
INSERT INTO muse.customer_services (customer_site_id, name, weekdays, status, position, notes)
SELECT s.id,
       CASE WHEN c.channel = 1 THEN 'Lunch' ELSE 'Service 1' END,
       '[1,2,3,4,5]'::jsonb,
       'active',
       0,
       'Carried from the site forecast when services were introduced (Roadmap N4a).'
FROM muse.customer_sites s
JOIN muse.customers c ON c.id = s.customer_id
WHERE s.status <> 'inactive'
  AND NOT EXISTS (SELECT 1 FROM muse.customer_services x WHERE x.customer_site_id = s.id);

INSERT INTO muse.service_volume_picks (service_id, effective_date, meals, notes)
SELECT sv.id,
       COALESCE(c.contract_start, s.created_at::date),
       COALESCE(s.enrollment * s.participation_rate, s.expected_meals_per_day, 0),
       'Carried from the site forecast when services were introduced (Roadmap N4a).'
FROM muse.customer_services sv
JOIN muse.customer_sites s ON s.id = sv.customer_site_id
JOIN muse.customers c ON c.id = s.customer_id
WHERE NOT EXISTS (SELECT 1 FROM muse.service_volume_picks p WHERE p.service_id = sv.id);

-- 3 (before 2, so plans copy from the surviving cycle). Seeded cycles: no test
-- labels, no channel; fold the ghost kitchen's copy of the adult menu into
-- corporate catering's when their days are identical.
CREATE TEMP TABLE IF NOT EXISTS _n4a_fold (ghost uuid, adult uuid) ON COMMIT DROP;

DO $$
DECLARE
  adult  uuid;
  ghost  uuid;
BEGIN
  SELECT id INTO adult FROM muse.menu_cycles WHERE source = 'seed' AND customer_id IS NULL AND channel = 2 ORDER BY start_date DESC LIMIT 1;
  SELECT id INTO ghost FROM muse.menu_cycles WHERE source = 'seed' AND customer_id IS NULL AND channel = 3 ORDER BY start_date DESC LIMIT 1;
  IF adult IS NOT NULL AND ghost IS NOT NULL
     AND NOT EXISTS (
       (SELECT day, recipe_code FROM muse.menu_cycle_days WHERE cycle_id = adult
        EXCEPT SELECT day, recipe_code FROM muse.menu_cycle_days WHERE cycle_id = ghost)
       UNION ALL
       (SELECT day, recipe_code FROM muse.menu_cycle_days WHERE cycle_id = ghost
        EXCEPT SELECT day, recipe_code FROM muse.menu_cycle_days WHERE cycle_id = adult)
     ) THEN
    UPDATE muse.orders SET menu_cycle_id = adult WHERE menu_cycle_id = ghost;
    -- Keep the channel on the surviving row until step 2 has copied plans from it.
    UPDATE muse.menu_cycles SET channel = NULL WHERE id = ghost;
    INSERT INTO _n4a_fold VALUES (ghost, adult);
  END IF;
END $$;

-- 2. A meal plan per customer that is not inactive, copied from the active
--    cycle on its channel that started last (the rule that fed the customer
--    until now), so every customer's orders read what they read before.
CREATE TEMP TABLE IF NOT EXISTS _n4a_source ON COMMIT DROP AS
SELECT DISTINCT ON (c.id)
       c.id AS customer_id,
       COALESCE((SELECT f.adult FROM pg_temp._n4a_fold f WHERE f.ghost = m.id), m.id) AS cycle_id,
       m.start_date, m.length_days, m.weekdays, m.name
FROM muse.customers c
JOIN muse.menu_cycles m
  ON m.customer_id IS NULL AND m.status = 'active'
 AND (m.channel = c.channel OR (c.channel = 3 AND m.id IN (SELECT ghost FROM pg_temp._n4a_fold)))
WHERE c.status <> 'inactive'
  AND NOT EXISTS (SELECT 1 FROM muse.menu_cycles p WHERE p.customer_id = c.id)
ORDER BY c.id, m.start_date DESC, m.created_at DESC;

INSERT INTO muse.menu_cycles (customer_id, from_cycle_id, channel, name, start_date, length_days, weekdays, status, notes, source)
SELECT s.customer_id, s.cycle_id, NULL, 'Meal plan', s.start_date, s.length_days, s.weekdays, 'active',
       'Copied from the menu cycle the customer''s channel served when meal plans were introduced (Roadmap N4a).', 'user_built'
FROM pg_temp._n4a_source s;

INSERT INTO muse.menu_cycle_days (cycle_id, day, recipe_code)
SELECT p.id, d.day, d.recipe_code
FROM muse.menu_cycles p
JOIN pg_temp._n4a_source s ON s.customer_id = p.customer_id AND p.from_cycle_id = s.cycle_id
JOIN muse.menu_cycle_days d ON d.cycle_id = s.cycle_id
WHERE NOT EXISTS (SELECT 1 FROM muse.menu_cycle_days x WHERE x.cycle_id = p.id);

-- Finish 3: drop the folded duplicate, then the shared cycles carry no channel
-- and no test labels.
DELETE FROM muse.menu_cycles WHERE id IN (SELECT ghost FROM pg_temp._n4a_fold);

UPDATE muse.menu_cycles
SET name = CASE channel WHEN 1 THEN 'Student menu — 10 days' ELSE 'Adult menu — 10 days' END,
    notes = 'Week 1 is days 1–5, week 2 is days 6–10, Monday to Friday.',
    updated_at = now()
WHERE source = 'seed' AND customer_id IS NULL AND length_days = 10 AND channel IS NOT NULL;

UPDATE muse.menu_cycles SET channel = NULL WHERE customer_id IS NULL;
