-- 0044_muse_sources.sql
-- Impact OS — sources registry (Sustainability S2b).
--
-- Two tables in the isolated `muse` schema:
--
--   muse.sources         — a registered document or publication: a study, an
--                          LCA, a dataset, a regulation, a rate schedule, a
--                          supplier report. The file itself is stored inline
--                          (bytea) so the platform can render it without a
--                          third-party store; `file_bytes` is NULL for
--                          URL-only sources. `sha256` de-duplicates uploads.
--
--   muse.source_figures  — a figure drawn from a source: value, unit, where in
--                          the document it sits (slide, sheet/column, table),
--                          its status tag and effective date. `provenance_id`
--                          is the factor library's stable id, so any cited
--                          number on any page resolves to a row here and from
--                          there to the document.
--
-- Nothing derived is stored. Status tags mirror the platform's provenance
-- vocabulary (SOURCED / STATED / PLACEHOLDER / DERIVED / UNCONFIRMED / DATED).

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.sources (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'study' | 'lca' | 'dataset' | 'regulation' | 'rate_schedule' | 'supplier_report' | 'other'
  kind          text         NOT NULL DEFAULT 'other',
  title         text         NOT NULL,
  authors       text,
  publisher     text,
  year          integer,
  citation      text,
  source_url    text,
  licence_note  text,
  -- Provenance status of the document as a whole.
  status        text         NOT NULL DEFAULT 'SOURCED',
  notes         text,
  -- File, when one is stored. NULL for URL-only sources.
  file_name     text,
  file_mime     text,
  file_size     integer,
  sha256        text,
  file_bytes    bytea,
  uploaded_by   text,
  uploaded_at   timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS muse_sources_sha256_idx
  ON muse.sources (sha256) WHERE sha256 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS muse_sources_url_idx
  ON muse.sources (source_url) WHERE source_url IS NOT NULL AND sha256 IS NULL;
CREATE INDEX IF NOT EXISTS muse_sources_kind_idx
  ON muse.sources (kind);

CREATE TABLE IF NOT EXISTS muse.source_figures (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id      uuid         NOT NULL REFERENCES muse.sources (id) ON DELETE CASCADE,
  -- Factor-library id, e.g. 'epa-hub-2025:natural-gas'. Unique when present.
  provenance_id  text,
  label          text         NOT NULL,
  value_text     text,
  unit           text,
  -- Where in the document: 'slide 19', 'Database sheet, col BM', 'Table 1'.
  locator        text,
  status         text         NOT NULL DEFAULT 'SOURCED',
  effective_from date,
  version        text,
  note           text,
  created_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS muse_source_figures_provenance_idx
  ON muse.source_figures (provenance_id) WHERE provenance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS muse_source_figures_source_idx
  ON muse.source_figures (source_id);
