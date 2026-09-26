-- MicroFarm: a subscriber's named nutrition targets (outline §4), keys from src/data/nutrition-targets.ts.
-- The Flat Builder scores the subscriber's flat against them; nothing else about a subscriber's
-- health is held here.

ALTER TABLE farm.subscribers ADD COLUMN IF NOT EXISTS nutrition_targets jsonb NOT NULL DEFAULT '[]'::jsonb;
