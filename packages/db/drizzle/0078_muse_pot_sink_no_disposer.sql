-- 0078_muse_pot_sink_no_disposer.sql
-- Impact OS — the pot sink carries no disposer.
--
-- Austin City Code §25-12-153 (UPC §616.0) prohibits food waste disposal units
-- in commercial kitchens unless approved under §301.3. The seeded Phase 1 row
-- "Pot sink, 3-comp with disposer" becomes "Pot sink, 3-comp with drainboards":
-- two drainboards, scrap handled by hand to the refrigerated waste room the
-- support program already carries. Footprint, cost and phase are unchanged.
-- The key follows the item so the code seed and the row agree; nothing
-- references a sink by key. Data only; idempotent; a hand-edited row is left.

UPDATE muse.equipment
SET key = 'Pot sink, 3-comp with drainboards',
    item = 'Pot sink, 3-comp with drainboards',
    notes = 'Two drainboards; scrap goes by hand to the refrigerated waste room. No disposer: Austin City Code §25-12-153 (UPC §616.0).'
WHERE key = 'Pot sink, 3-comp with disposer'
  AND source = 'seed'
  AND NOT EXISTS (SELECT 1 FROM muse.equipment e WHERE e.key = 'Pot sink, 3-comp with drainboards');
