-- 0054_muse_periods.sql
-- (Applied to Neon 2026-09-14 as written. The 'shutdown' closure kind was an
--  inherited assumption — the kitchen runs year-round — and 0055 removes it.)
-- Impact OS — fiscal periods, the production calendar and the
-- posting trail (Roadmap J1, J3, J4).
--
--   * fiscal_periods     — one row per YYYY-MM that has ever been locked. The
--                          fiscal year is the calendar year (Robert, 2026-09-14).
--                          A period with no row is open. A locked period
--                          refuses every posting dated inside it; a super admin
--                          may reopen it, and both events go on the trail.
--   * calendar_closures  — dated ranges the kitchen does not produce or
--                          deliver: the summer shutdown, holidays. Production
--                          days are the service weekdays less these.
--   * posting_log        — the append-only, hash-chained record of who posted
--                          what from which record, and of every lock and
--                          reopen. `hash` = SHA-256 over the previous row's
--                          hash and this row's canonical fields, so any edit
--                          or removal breaks the chain from that row on. A
--                          trigger refuses UPDATE and DELETE outright.

CREATE TABLE IF NOT EXISTS muse.fiscal_periods (
  period       text PRIMARY KEY,
  status       text NOT NULL DEFAULT 'open',
  locked_at    timestamptz,
  locked_by    text,
  reopened_at  timestamptz,
  reopened_by  text,
  notes        text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('open', 'locked'))
);

CREATE TABLE IF NOT EXISTS muse.calendar_closures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label        text NOT NULL,
  kind         text NOT NULL DEFAULT 'closure',
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  notes        text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (kind IN ('shutdown', 'holiday', 'closure'))
);
CREATE INDEX IF NOT EXISTS muse_calendar_closures_dates_idx ON muse.calendar_closures (start_date, end_date);

CREATE TABLE IF NOT EXISTS muse.posting_log (
  seq            bigserial PRIMARY KEY,
  occurred_at    timestamptz NOT NULL,
  actor_user_id  text NOT NULL,
  actor_email    text,
  action         text NOT NULL,
  record_kind    text NOT NULL,
  record_id      text NOT NULL,
  period         text NOT NULL,
  detail         jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash      text NOT NULL,
  hash           text NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS muse_posting_log_period_idx ON muse.posting_log (period);

CREATE OR REPLACE FUNCTION muse.posting_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'muse.posting_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posting_log_immutable ON muse.posting_log;
CREATE TRIGGER posting_log_immutable
  BEFORE UPDATE OR DELETE ON muse.posting_log
  FOR EACH ROW EXECUTE FUNCTION muse.posting_log_immutable();
