-- Cotyledon: lights shelf by shelf.
--
-- A rack's lights are set per shelf: each shelf a fixture and how many of it, so one rack can carry
-- different lights on different shelves. Null keeps every shelf on the row's fixture at the count a
-- shelf its record states (two Mars VG80, three Barrina T5).

ALTER TABLE farm.equipment ADD COLUMN IF NOT EXISTS shelf_lights jsonb;
