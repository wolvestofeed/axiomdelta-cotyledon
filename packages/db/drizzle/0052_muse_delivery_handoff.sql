-- 0052_muse_delivery_handoff.sql
-- Impact OS — the production record is kept (Roadmap Phase I).
--
-- Phase I makes the floor record real. Most of it rides on existing JSONB
-- documents and needs no DDL:
--
--   * receipts.lines gains, per line, the use-by date printed on the case, the
--     product temperature at the dock, the receiver's condition verdict
--     ('accepted' | 'accepted_with_note' | 'rejected') and the FTL flag copied
--     from the ingredient line (I2). A rejected line is on the record and never
--     in stock.
--   * batch_records.components gains, per component, the CCP-1 end-of-cook
--     temperature (I3). The CCP-2 cooling record was already there.
--
-- The delivery record is the one that needs columns: the temperature at
-- hand-off and who signed for it at the site are facts of the shipping event
-- (I4), not free text.

ALTER TABLE muse.deliveries ADD COLUMN IF NOT EXISTS handoff_temp_f double precision;
ALTER TABLE muse.deliveries ADD COLUMN IF NOT EXISTS received_by     text;
