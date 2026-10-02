-- Cotyledon: grow plans by name.
--
-- The library tables and every column that names a plan take the grow plan's name:
-- `crop_plans`, `crop_plan_lines` and `crop_plan_packages` become `grow_plans`, `grow_plan_lines`
-- and `grow_plan_packages`; `crop_plan_id` becomes `grow_plan_id` and `crop_plan_code` becomes
-- `grow_plan_code` wherever they stand; every index, constraint and policy named for the old
-- tables is renamed to match. The plan header's columns that no grow plan uses are
-- dropped (category, components, production method, spec, sowing units); the allergens present
-- and the allergen-free claims stay and are read onto the grow plan. Nothing is rewritten: rows
-- keep their values.

ALTER TABLE IF EXISTS farm.crop_plans RENAME TO grow_plans;
ALTER TABLE IF EXISTS farm.crop_plan_lines RENAME TO grow_plan_lines;
ALTER TABLE IF EXISTS farm.crop_plan_packages RENAME TO grow_plan_packages;

DO $$
DECLARE
  r record;
BEGIN
  -- Columns named for the plan, on every farm table.
  FOR r IN
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'farm' AND column_name IN ('crop_plan_id', 'crop_plan_code')
  LOOP
    EXECUTE format('ALTER TABLE farm.%I RENAME COLUMN %I TO %I', r.table_name, r.column_name, replace(r.column_name, 'crop_plan', 'grow_plan'));
  END LOOP;

  -- Constraints (primary keys, unique, foreign keys, checks, not-null).
  FOR r IN
    SELECT c.conname, t.relname AS table_name FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
     WHERE c.connamespace = 'farm'::regnamespace AND c.conname LIKE '%crop_plan%'
  LOOP
    EXECUTE format('ALTER TABLE farm.%I RENAME CONSTRAINT %I TO %I', r.table_name, r.conname, replace(r.conname, 'crop_plan', 'grow_plan'));
  END LOOP;

  -- Indexes not already renamed with their constraint.
  FOR r IN
    SELECT indexname FROM pg_indexes WHERE schemaname = 'farm' AND indexname LIKE '%crop_plan%'
  LOOP
    EXECUTE format('ALTER INDEX farm.%I RENAME TO %I', r.indexname, replace(r.indexname, 'crop_plan', 'grow_plan'));
  END LOOP;

  -- Row-level security policies.
  FOR r IN
    SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'farm' AND policyname LIKE '%crop_plan%'
  LOOP
    EXECUTE format('ALTER POLICY %I ON farm.%I RENAME TO %I', r.policyname, r.tablename, replace(r.policyname, 'crop_plan', 'grow_plan'));
  END LOOP;
END $$;

ALTER TABLE farm.grow_plans DROP COLUMN IF EXISTS category;
ALTER TABLE farm.grow_plans DROP COLUMN IF EXISTS components;
ALTER TABLE farm.grow_plans DROP COLUMN IF EXISTS production_method;
ALTER TABLE farm.grow_plans DROP COLUMN IF EXISTS spec;
ALTER TABLE farm.grow_plans DROP COLUMN IF EXISTS sowing_units;
