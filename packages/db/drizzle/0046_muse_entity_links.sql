-- 0046_muse_entity_links.sql
-- Impact OS — links that are facts of record.
--
-- One record referring to another is stored two different ways in Muse, and the
-- distinction is deliberate:
--
--   * A link that changes a MODEL INPUT is a scenario edit, held in the
--     muse.scenarios JSONB overlay (ingredient -> supplier, site -> school,
--     activity input -> document). It belongs to a forecast and moves when a
--     super admin applies one.
--
--   * A link that is a FACT OF RECORD lives here. A lot was received from an
--     operation; a lot shipped to a site; a journal entry is evidenced by an
--     invoice; a role is assigned a course. These are not forecast inputs — they
--     happened, and they stay true across every scenario.
--
-- Both sides are kind-qualified free text rather than foreign keys, because the
-- "from" and "to" records live in four different places: the compiled
-- public-records supplier directory, the compiled school list, the typed
-- plan-data reference, and muse.sources. Only source links can be enforced
-- relationally, and they are not, so one table serves every pair.
--
-- The unique index makes a link idempotent: recording the same pair twice
-- updates the note instead of duplicating the edge.

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.entity_links (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'lot' | 'ledger_entry' | 'role' | 'supplier' | 'site' | 'course' | 'source' | …
  from_kind   text          NOT NULL,
  from_id     text          NOT NULL,
  to_kind     text          NOT NULL,
  to_id       text          NOT NULL,
  -- What the link asserts: 'received_from', 'shipped_to', 'evidenced_by',
  -- 'assigned', 'certificate'.
  relation    text          NOT NULL,
  note        text,
  created_by  text,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS muse_entity_links_edge_uniq
  ON muse.entity_links (from_kind, from_id, relation, to_kind, to_id);

CREATE INDEX IF NOT EXISTS muse_entity_links_from_idx
  ON muse.entity_links (from_kind, from_id);

CREATE INDEX IF NOT EXISTS muse_entity_links_to_idx
  ON muse.entity_links (to_kind, to_id);
