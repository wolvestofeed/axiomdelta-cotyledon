-- 0070_muse_training.sql
-- Impact OS — training documents, their versions, and who has completed which.
--
-- Decisions (Robert, 2026-09-15):
--   * A training document is a FAMILY with numbered versions. The file is
--     replaced from time to time and carries technical content, so a version is
--     never overwritten: each is kept on file and timestamped IN (`published_at`)
--     and OUT (`archived_at`) of active status. Publishing a new version
--     archives the current one at the same instant the new one takes effect, so
--     the record never shows two active versions or a gap between them.
--   * Every active staff member is assigned the active version, and a new hire
--     completes it during orientation.
--   * Publishing carries a checkbox, defaulted ON: everyone re-completes. A
--     technical revision pages the whole crew; a typo fix need not. Whichever
--     was chosen is recorded on the version itself (`requires_recompletion`),
--     so the reason a person was asked again is on the record, not in someone's
--     memory.
--
-- Completion is recorded against the VERSION, never the family: "read and
-- acknowledged v1" stays true after v2 publishes.
--
-- The file lives inline as bytea, like muse.sources — the platform serves it
-- through an authenticated route and no third-party store is involved.

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.training_docs (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The family key: every version of one document shares it.
  doc_key               text          NOT NULL,
  version               integer       NOT NULL DEFAULT 1,
  title                 text          NOT NULL,
  summary               text,
  -- Orientation requirement of the family, carried on each version.
  required_at_orientation boolean     NOT NULL DEFAULT true,
  -- What the publisher chose for THIS version.
  requires_recompletion boolean       NOT NULL DEFAULT true,

  -- In and out of active status. published_at null = a draft that has never
  -- been active; archived_at null on a published row = the active version.
  published_at          timestamptz,
  archived_at           timestamptz,
  -- The version that replaced this one.
  superseded_by         uuid          REFERENCES muse.training_docs(id) ON DELETE SET NULL,

  file_name             text          NOT NULL,
  file_mime             text          NOT NULL,
  file_size             integer       NOT NULL DEFAULT 0,
  sha256                text,
  file_bytes            bytea,

  notes                 text,
  uploaded_by           text,
  published_by          text,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

-- One row per family per version number.
CREATE UNIQUE INDEX IF NOT EXISTS muse_training_docs_key_version_idx ON muse.training_docs (doc_key, version);
-- At most one ACTIVE version per family, enforced by the database rather than
-- by the code that publishes.
CREATE UNIQUE INDEX IF NOT EXISTS muse_training_docs_one_active_idx
  ON muse.training_docs (doc_key) WHERE published_at IS NOT NULL AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS muse.training_assignments (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The VERSION assigned, so a completion says which text was read.
  doc_id       uuid          NOT NULL REFERENCES muse.training_docs(id) ON DELETE CASCADE,
  staff_id     uuid          NOT NULL REFERENCES muse.staff(id) ON DELETE CASCADE,
  assigned_at  timestamptz   NOT NULL DEFAULT now(),
  -- Set when the person records that they have read it.
  completed_at timestamptz,
  -- Anything the person added when completing.
  note         text,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS muse_training_assignments_doc_staff_idx
  ON muse.training_assignments (doc_id, staff_id);
CREATE INDEX IF NOT EXISTS muse_training_assignments_staff_idx ON muse.training_assignments (staff_id);
