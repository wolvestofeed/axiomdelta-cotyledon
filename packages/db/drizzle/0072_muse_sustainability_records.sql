-- 0072_muse_sustainability_records.sql
-- Impact OS — utility and lab readings, and refrigerant service tickets, as records
-- (Roadmap N6 slice 4).
--
-- Decisions (Robert, 2026-09-16):
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

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.sustainability_readings (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- electricity_kwh | electricity_renewable_kwh | natural_gas_therms | propane_gal
  -- | fleet_gasoline_gal | fleet_diesel_gal | water_metered_gal
  -- | wastewater_billed_mgal | bod_mg_l | tss_mg_l | cod_mg_l | fog_mg_l
  -- | grease_trap_fill | grease_trap_pump_out
  metric        text          NOT NULL,
  period_start  date,
  read_on       date          NOT NULL,
  quantity      double precision,
  source_id     uuid          REFERENCES muse.sources(id) ON DELETE SET NULL,
  notes         text,
  recorded_by   text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS muse_sustainability_readings_metric_idx ON muse.sustainability_readings (metric, read_on);

CREATE TABLE IF NOT EXISTS muse.refrigerant_service (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_key  text          NOT NULL,
  serviced_on    date          NOT NULL,
  lb_added       double precision NOT NULL,
  source_id      uuid          REFERENCES muse.sources(id) ON DELETE SET NULL,
  technician     text,
  notes          text,
  recorded_by    text,
  created_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS muse_refrigerant_service_key_idx ON muse.refrigerant_service (equipment_key, serviced_on);
