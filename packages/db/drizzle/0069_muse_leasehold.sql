-- 0069_muse_leasehold.sql
-- Impact OS — the leasehold schedule becomes a definition (Roadmap Phase N, step N1).
--
-- The last capital input still typed in code. Twelve lines summing to $787,000
-- at $157.40/sq ft over the 5,000 sq ft shell — every rate an unsourced working
-- figure authored when the capex tab was built, none of them a quote. They flow
-- into total capital, the leasehold loan's principal, depreciation and the
-- monthly financing, and until now there was no screen on which to change one.
--
--   * `counted` — Robert, 2026-09-15: a line can stay ON RECORD but out of the
--     arithmetic. A scope item the landlord is covering, or one deferred to a
--     later fit-out, stays visible with its figure instead of being deleted and
--     forgotten; the rollup simply passes over it.
--   * `extended_cents` is the figure of record. Dollars per square foot are
--     DERIVED from it against the facility size, so the two cannot disagree —
--     they were two typed numbers that happened to agree before.
--
-- No backfill: the seed writes what the constant carried, so nothing moves.

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.leasehold_lines (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable across a reseed; a saved forecast's overlay keys on it.
  key            text          NOT NULL,
  item           text          NOT NULL,
  extended_cents bigint        NOT NULL DEFAULT 0,
  -- In the arithmetic, or on record only.
  counted        boolean       NOT NULL DEFAULT true,
  notes          text,
  position       integer       NOT NULL DEFAULT 0,
  -- 'seed' | 'user_built'
  source         text          NOT NULL DEFAULT 'user_built',
  created_by     text,
  created_at     timestamptz   NOT NULL DEFAULT now(),
  updated_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS muse_leasehold_lines_key_idx ON muse.leasehold_lines (key);
CREATE INDEX IF NOT EXISTS muse_leasehold_lines_position_idx ON muse.leasehold_lines (position);
