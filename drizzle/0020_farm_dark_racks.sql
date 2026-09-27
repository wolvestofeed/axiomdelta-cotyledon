-- MicroFarm: dark racks.
--
-- A grow unit marked dark stages only holds a tray sowing through its sow day, germination and
-- blackout; the trays then move to a lit unit whose fixture delivers the plan's light for the light
-- stage and the harvest window. A unit not marked takes a sowing's whole cycle, as before.

ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS dark_stages_only boolean NOT NULL DEFAULT false;
