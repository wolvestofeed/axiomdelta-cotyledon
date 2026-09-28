/**
 * Cotyledon — the grow plan library's seed: one single-variety plan per variety, built from the
 * variety records (`singleVarietyPlan`), so every figure on a seed plan is the variety's own with
 * its own tag. Microgreens are planned on the 1020 flat, the reference format; sprouts in the pint
 * jar. The blends in R&D (`blends.ts`) join them in the library seed as developing plans.
 *
 * The library (`farm.grow_plans`) is the source from first read; `librarySeed` is what is inserted
 * where a code is missing, and `growPlanSeed`, the in-service plans, is the fallback wherever no
 * library has been loaded.
 */

import { VARIETIES } from '@/data/varieties';
import { singleVarietyPlan, type GrowPlanDef } from '@/data/grow-plan';
import { blendSeed } from '@/data/blends';

export const growPlanSeed: GrowPlanDef[] = VARIETIES.map((v) => singleVarietyPlan(v));

export const GROW_PLAN_SEED_CODES: readonly string[] = growPlanSeed.map((p) => p.code);

/** What the library is seeded with: the single-variety plans and the blends in R&D. */
export const librarySeed: GrowPlanDef[] = [...growPlanSeed, ...blendSeed];
