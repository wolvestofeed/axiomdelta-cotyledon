-- 0053_muse_batch_crew.sql
-- Impact OS — crew hours by person on the batch record (Roadmap I3).
--
-- Who worked the batch and for how long, as rows on the record. The two
-- labor totals the ledger reads (actual_labor_hours, actual_labor_rate) are
-- derived from these rows when they are present: hours summed, the rate
-- weighted by hours. A record with no crew rows keeps the typed totals.

ALTER TABLE muse.batch_records ADD COLUMN IF NOT EXISTS crew jsonb NOT NULL DEFAULT '[]'::jsonb;
