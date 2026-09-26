-- 0056_muse_standard_versions.sql
-- Impact OS — approved standard-cost versions (Roadmap J5).
--
-- A standard is the recipe (its lines, yields and AP prices as resolved on the
-- plan of record) together with the cost assumptions in force, frozen as a
-- snapshot when a super admin approves it with an effective date. Editing the
-- recipe library changes the library; the standard a batch is costed at
-- changes only when a new version is approved. The ledger costs every batch
-- at the version in force on its production date, so a reviewer can
-- reproduce the cost; a batch dated before any approved version is costed at
-- the live library and says so.

CREATE TABLE IF NOT EXISTS muse.standard_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_code    text NOT NULL,
  version        integer NOT NULL,
  effective_from date NOT NULL,
  approved_by    text NOT NULL,
  approved_at    timestamptz NOT NULL DEFAULT now(),
  notes          text,
  snapshot       jsonb NOT NULL,
  UNIQUE (recipe_code, version)
);
CREATE INDEX IF NOT EXISTS muse_standard_versions_code_date_idx ON muse.standard_versions (recipe_code, effective_from);
