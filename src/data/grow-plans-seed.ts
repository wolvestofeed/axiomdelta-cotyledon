/**
 * MicroFarm — the grow plan library's seed: one single-variety plan per variety, built from the
 * variety records (`singleVarietyPlan`), so every figure on a seed plan is the variety's own with
 * its own tag. Microgreens are planned on the 1020 flat, the reference format; sprouts in the pint
 * jar. Mixed trays are composed to nutrition targets and are added when the targets exist (Phase 2
 * part 7).
 *
 * The library (`farm.crop_plans`) is the source from first read; this list is inserted when the
 * library is empty and is the fallback wherever no library has been loaded.
 */

import { VARIETIES } from '@/data/varieties';
import { singleVarietyPlan, type GrowPlanDef } from '@/data/grow-plan';

export const growPlanSeed: GrowPlanDef[] = VARIETIES.map((v) => singleVarietyPlan(v));

export const GROW_PLAN_SEED_CODES: readonly string[] = growPlanSeed.map((p) => p.code);
