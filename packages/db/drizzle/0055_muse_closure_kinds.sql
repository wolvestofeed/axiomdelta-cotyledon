-- 0055_muse_closure_kinds.sql
-- Impact OS — closures are major holidays; the kitchen runs
-- year-round (Robert, 2026-09-14). The 'shutdown' kind in 0054 was an
-- inherited assumption, never a decision. No row carries it.

ALTER TABLE muse.calendar_closures DROP CONSTRAINT IF EXISTS calendar_closures_kind_check;
ALTER TABLE muse.calendar_closures ADD CONSTRAINT calendar_closures_kind_check CHECK (kind IN ('holiday', 'closure'));
