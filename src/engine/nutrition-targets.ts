/**
 * Cotyledon — a flat plan scored against nutrition targets (outline §4). Pure.
 *
 * A subscriber names targets; a flat plan is the grow plans in it. Each target is covered when a
 * plan on the flat carries a variety whose profile names it. The score is facts: which targets
 * are covered, by which varieties on which plans, with the stated benefits and the science rows
 * behind each; which targets are not, and which library plans carry them. No target is weighted
 * and nothing is ranked as better; the Flat Builder shows the facts and the subscriber chooses.
 */

import { NUTRITION_TARGETS, TARGET_BY_KEY, benefitsFor, type NutritionTargetDef } from '@/data/nutrition-targets';
import { claimsForVariety, type ScienceClaim } from '@/data/science-library';
import { VARIETY_BY_KEY, type StatedBenefit, type VarietyDef } from '@/data/varieties';
import { planVarieties, type GrowPlanDef } from '@/data/grow-plan';

export interface TargetCoverage {
  target: NutritionTargetDef;
  covered: boolean;
  /** The varieties on the flat that carry the target, with the plans they sit on and the benefits behind them. */
  by: { variety: VarietyDef; planCodes: string[]; benefits: StatedBenefit[] }[];
  /** Library plans, not on the flat, whose varieties carry the target. */
  carriedBy: { code: string; name: string; varieties: string[] }[];
}

export interface FlatScore {
  targets: TargetCoverage[];
  covered: number;
  uncovered: number;
  /** Covered over named; 1 with no target named. */
  share: number;
  /** Every claim in the library on the varieties of the flat, for the portal to cite. */
  claims: ScienceClaim[];
}

/** Which targets a flat of plans covers, and what else in the library would cover the rest. */
export function scoreFlat(targetKeys: readonly string[], flat: readonly GrowPlanDef[], library: readonly GrowPlanDef[] = [], varieties: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY): FlatScore {
  const named = targetKeys.map((k) => TARGET_BY_KEY[k]).filter((t): t is NutritionTargetDef => t !== undefined);
  const onFlat = new Map<string, { variety: VarietyDef; planCodes: string[] }>();
  for (const plan of flat) {
    for (const v of planVarieties(plan, varieties)) {
      const row = onFlat.get(v.key) ?? { variety: v, planCodes: [] };
      if (!row.planCodes.includes(plan.code)) row.planCodes.push(plan.code);
      onFlat.set(v.key, row);
    }
  }
  const flatCodes = new Set(flat.map((p) => p.code));
  const targets: TargetCoverage[] = named.map((target) => {
    const by = target.varieties
      .map((k) => onFlat.get(k))
      .filter((x): x is { variety: VarietyDef; planCodes: string[] } => x !== undefined)
      .map((x) => ({ variety: x.variety, planCodes: x.planCodes, benefits: benefitsFor(x.variety, target) }));
    const carriedBy = library
      .filter((p) => !flatCodes.has(p.code) && planVarieties(p, varieties).some((v) => target.varieties.includes(v.key)))
      .map((p) => ({ code: p.code, name: p.name, varieties: planVarieties(p, varieties).filter((v) => target.varieties.includes(v.key)).map((v) => v.name) }));
    return { target, covered: by.length > 0, by, carriedBy };
  });
  const covered = targets.filter((t) => t.covered).length;
  const claims = [...new Map([...onFlat.keys()].flatMap((k) => claimsForVariety(k)).map((c) => [c.id, c])).values()];
  return { targets, covered, uncovered: targets.length - covered, share: targets.length > 0 ? covered / targets.length : 1, claims };
}

/** The catalog keys among those a request names, in catalog order; a key not in the catalog is dropped. */
export function targetKeysIn(keys: readonly string[]): string[] {
  const named = new Set(keys);
  return NUTRITION_TARGETS.filter((t) => named.has(t.key)).map((t) => t.key);
}

/** The targets a single plan carries, for the plan's own card. */
export function targetsOfPlan(plan: GrowPlanDef, varieties: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY): NutritionTargetDef[] {
  const keys = new Set(planVarieties(plan, varieties).map((v) => v.key));
  return NUTRITION_TARGETS.filter((t) => t.varieties.some((k) => keys.has(k)));
}
