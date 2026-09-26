-- 0075_muse_blast_chillers_phase_1.sql
-- Impact OS — both blast chillers on Phase 1 (facility-design roadmap §2 decision 6, Q4b).
--
-- Decision (Robert, 2026-09-17): both 200 lb blast chillers are Phase 1. This is a
-- concurrency decision, not a capacity one — a batch binds to ONE cabinet, and two
-- cabinets are two parallel streams, never one larger batch (§2 decision 7). The
-- engine fix that stops multiplying a vessel's capacity by its unit count ships
-- with this migration, so the second cabinet adds a line in service and nothing
-- else: batch sizes do not move.
--
-- The code seed (`_data/capex.ts`) now writes one row, qty 2, on build phase 1.
-- Seed rows already in the table are merged to match: the Phase 1 row takes the
-- second unit, and the seed's "(Phase 2)" row is removed — unless a refrigerant
-- service ticket names it, in which case it stays on the list at phase 1 with no
-- quantity (rows with no quantity sort last and count for nothing). A row an
-- admin re-keyed or added by hand (source <> 'seed') is not touched.
--
-- Data only; no schema change. Idempotent: a second run finds no "(Phase 2)" row.

UPDATE muse.equipment AS p1
SET qty = p1.qty + p2.qty
FROM muse.equipment AS p2
WHERE p1.key = 'Blast chiller, 200 lb capacity'
  AND p1.source = 'seed'
  AND p2.key = 'Blast chiller, 200 lb capacity (Phase 2)'
  AND p2.source = 'seed';

DELETE FROM muse.equipment
WHERE key = 'Blast chiller, 200 lb capacity (Phase 2)'
  AND source = 'seed'
  AND NOT EXISTS (
    SELECT 1 FROM muse.refrigerant_service r WHERE r.equipment_key = 'Blast chiller, 200 lb capacity (Phase 2)'
  );

UPDATE muse.equipment
SET build_phase = 1,
    qty = 0,
    notes = coalesce(notes || ' ', '') || 'Merged into the Phase 1 row on 2026-09-17 (both cabinets Phase 1); kept because a refrigerant service ticket names this key.'
WHERE key = 'Blast chiller, 200 lb capacity (Phase 2)'
  AND source = 'seed';

UPDATE muse.equipment
SET build_phase = 1
WHERE key = 'Blast chiller, 200 lb capacity'
  AND source = 'seed';
