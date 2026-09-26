-- 0049_muse_recipes.sql
-- Impact OS — the recipe library (Roadmap Phase H1).
--
-- Until now one recipe lived as a code constant and stood in for the whole item
-- master. The library makes recipes first-class: every recipe that can be
-- costed, credited, batch-sized or planned is a row here, with a status and the
-- channels it serves. The code constant becomes the SEED (AMK-E-001, In Service)
-- inserted on first read when the table is empty; it is no longer the source.
--
--   * recipes       — the recipe header: code, name, category, status
--                     ('in_service' | 'planned' | 'developing'), the channels it
--                     serves (expansion phases 1–3; each channel carries its own
--                     menu), method, allergen statements, and the portion `spec`
--                     block (grade group, credit target, serving vessel) as JSONB.
--                     `version` and `effective_from` let a batch record's
--                     `standard_version` name the standard in force on its date.
--   * recipe_lines  — one row per ingredient line. `line` is the engine's
--                     `IngredientLine` document (as-purchased quantity and unit,
--                     yield with its own provenance, price with its own
--                     provenance, pack size, hot/cold, crediting spec, served
--                     component) stored whole so the engine reads it unchanged.
--
-- A scenario still edits a line's price, quantity, yield and pack size as a
-- forecast overlay (keyed by recipe code + ingredient); the library row is the
-- standard those edits are measured against.

CREATE SCHEMA IF NOT EXISTS muse;

CREATE TABLE IF NOT EXISTS muse.recipes (
  id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 text         NOT NULL UNIQUE,
  name                 text         NOT NULL,
  category             text         NOT NULL DEFAULT '',
  -- 'in_service' | 'planned' | 'developing'
  status               text         NOT NULL DEFAULT 'developing',
  -- Expansion phases served, e.g. [1] or [2, 3].
  channels             jsonb        NOT NULL DEFAULT '[]'::jsonb,
  components           text         NOT NULL DEFAULT '',
  production_method    text         NOT NULL DEFAULT '',
  allergens_present    text         NOT NULL DEFAULT '',
  allergen_free_claims text         NOT NULL DEFAULT '',
  costing_basis        text         NOT NULL DEFAULT '',
  -- The portion spec block (tagged values), as the engine reads it.
  spec                 jsonb        NOT NULL DEFAULT '{}'::jsonb,
  -- 'seed' | 'user_built'
  source               text         NOT NULL DEFAULT 'user_built',
  version              integer      NOT NULL DEFAULT 1,
  effective_from       date,
  created_by           text,
  created_at           timestamptz  NOT NULL DEFAULT now(),
  updated_at           timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT muse_recipes_status CHECK (status IN ('in_service', 'planned', 'developing'))
);
CREATE INDEX IF NOT EXISTS muse_recipes_status_idx ON muse.recipes (status);

CREATE TABLE IF NOT EXISTS muse.recipe_lines (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   uuid         NOT NULL REFERENCES muse.recipes (id) ON DELETE CASCADE,
  position    integer      NOT NULL DEFAULT 0,
  name        text         NOT NULL,
  -- IngredientLine document.
  line        jsonb        NOT NULL,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT muse_recipe_lines_unique_name UNIQUE (recipe_id, name)
);
CREATE INDEX IF NOT EXISTS muse_recipe_lines_recipe_idx ON muse.recipe_lines (recipe_id, position);
