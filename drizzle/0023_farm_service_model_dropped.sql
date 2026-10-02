-- Cotyledon: the service model dropped. Demand is the subscriptions alone (outline §4).
--
-- Services, their dated volume picks, the pickup point service calendar, the saved cycles and the
-- flat plans by rotation are gone, and with them the subscriber kind and the pickup point's
-- enrollment, participation, expected units and tray formats. An order is a date, a pickup point,
-- a subscription (or none, typed) and a grow plan, and that is its identity.

ALTER TABLE farm.orders DROP COLUMN IF EXISTS subscriber_service_id;
ALTER TABLE farm.orders DROP COLUMN IF EXISTS subscription_cycle_id;
DROP INDEX IF EXISTS farm.farm_orders_service_idx;
ALTER TABLE farm.orders DROP CONSTRAINT IF EXISTS farm_orders_source;
ALTER TABLE farm.orders ADD CONSTRAINT farm_orders_source CHECK (source IN ('typed', 'subscription', 'sales', 'portal'));
ALTER TABLE farm.orders DROP CONSTRAINT IF EXISTS farm_orders_unique_line;
CREATE UNIQUE INDEX IF NOT EXISTS farm_orders_unique_line
  ON farm.orders (workspace_id, order_date, subscriber_pickup_point_id, COALESCE(subscription_id, '00000000-0000-0000-0000-000000000000'::uuid), grow_plan_code);

DROP TABLE IF EXISTS farm.subscription_cycle_days;
DROP TABLE IF EXISTS farm.subscription_cycles;
DROP TABLE IF EXISTS farm.service_volume_picks;
DROP TABLE IF EXISTS farm.subscriber_services;
DROP TABLE IF EXISTS farm.pickup_point_calendar_ranges;

ALTER TABLE farm.subscriber_pickup_points DROP CONSTRAINT IF EXISTS farm_subscriber_pickup_points_days;
ALTER TABLE farm.subscriber_pickup_points DROP CONSTRAINT IF EXISTS farm_subscriber_pickup_points_rate;
ALTER TABLE farm.subscriber_pickup_points DROP COLUMN IF EXISTS tray_formats;
ALTER TABLE farm.subscriber_pickup_points DROP COLUMN IF EXISTS service_days_per_year;
ALTER TABLE farm.subscriber_pickup_points DROP COLUMN IF EXISTS enrollment;
ALTER TABLE farm.subscriber_pickup_points DROP COLUMN IF EXISTS participation_rate;
ALTER TABLE farm.subscriber_pickup_points DROP COLUMN IF EXISTS expected_units_per_day;

ALTER TABLE farm.subscribers DROP COLUMN IF EXISTS kind;
