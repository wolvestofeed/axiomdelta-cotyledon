-- MicroFarm: subscriptions.
--
-- A subscription is a subscriber's standing order at one of their pickup points: a cadence
-- (weekly, every two weeks, or monthly on the same weekday of the same week of the month), the
-- first distribution date, which fixes the weekday and, for a monthly subscription, the week of
-- the month, an optional last date, and the flat plan: what each distribution carries, as dated
-- versions so a change takes effect from the next distribution not yet sown. Skipped distribution
-- dates and a pause, from a distribution date until resumed, are kept on the row. Every
-- distribution is billed as it is handed over, so a skipped or paused one bills nothing.

CREATE TABLE IF NOT EXISTS farm.subscriptions (
  workspace_id                uuid         NOT NULL DEFAULT farm.current_workspace_id() REFERENCES farm.workspaces (id) ON DELETE CASCADE,
  id                          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id               uuid         NOT NULL REFERENCES farm.subscribers (id) ON DELETE CASCADE,
  subscriber_pickup_point_id  uuid         NOT NULL REFERENCES farm.subscriber_pickup_points (id) ON DELETE CASCADE,
  cadence                     text         NOT NULL,
  start_date                  date         NOT NULL,
  end_date                    date,
  flat_plan                   jsonb        NOT NULL DEFAULT '[]'::jsonb,
  skips                       jsonb        NOT NULL DEFAULT '[]'::jsonb,
  paused_from                 date,
  notes                       text,
  created_by                  text,
  created_at                  timestamptz  NOT NULL DEFAULT now(),
  updated_at                  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT farm_subscriptions_cadence_check CHECK (cadence IN ('weekly', 'biweekly', 'monthly')),
  CONSTRAINT farm_subscriptions_dates_check CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS farm_subscriptions_workspace_idx ON farm.subscriptions (workspace_id);
CREATE INDEX IF NOT EXISTS farm_subscriptions_subscriber_idx ON farm.subscriptions (subscriber_id);

ALTER TABLE farm.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm.subscriptions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS farm_subscriptions_workspace ON farm.subscriptions;
CREATE POLICY farm_subscriptions_workspace ON farm.subscriptions
  USING (workspace_id = farm.current_workspace_id())
  WITH CHECK (workspace_id = farm.current_workspace_id());

-- An order confirmed from a subscription names it, so it replaces the distribution derived from it.
ALTER TABLE farm.orders ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES farm.subscriptions (id) ON DELETE SET NULL;
ALTER TABLE farm.orders DROP CONSTRAINT IF EXISTS farm_orders_source;
ALTER TABLE farm.orders ADD CONSTRAINT farm_orders_source CHECK (source IN ('typed', 'cycle', 'subscription', 'sales', 'portal'));
