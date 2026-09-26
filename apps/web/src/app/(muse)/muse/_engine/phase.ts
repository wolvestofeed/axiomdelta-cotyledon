/**
 * Impact OS — per-phase economics (portion + premium + price).
 *
 * Pure, no I/O, and deliberately free of any `@ct/ledger` import so it can be
 * used from a client component (the Unit Economics calculator) without dragging
 * the ledger into the browser bundle. Accepts per-phase overrides so an
 * interactive calculator can recompute from edited inputs; with no overrides it
 * uses the plan-data defaults.
 */

import { costPerMeal, costRecipe, deriveCapacity, platedPortionOz } from './index';
import { assumptionsFor, resolveScenarioInputs, type ResolvedInputs } from './scenario';

export const CHANNEL_COMMISSION_PHASE3 = 0.25; // marketplace commission, Phase 3 only

export interface PhaseOverride {
  pricePerMeal?: number;
  portionFactor?: number;
  premiumFactor?: number;
}
export type PhaseOverrides = Record<number, PhaseOverride | undefined>;

export interface PhaseEconomics {
  phase: number;
  market: string;
  portionFactor: number;
  premiumFactor: number;
  /** DERIVED plated weight (cooked yields × portion factor), oz. Never typed. */
  platedPortionOz: number;
  foodCostPerPortion: number;
  /** The cost of a meal: food + labor + packaging. No delivery, commission or fixed cost. */
  costPerMeal: number;
  /** Delivery per meal: a selling cost after the cost of a meal. */
  deliveryPerMeal: number;
  /** Cost of a meal + delivery. The marketplace commission is `channelCost`. */
  variablePerMeal: number;
  chilledMassPerPortion: number;
  batchSize: number;
  maxPortionsPerDay: number;
  pricePerMeal: number;
  channelCost: number;
  contribution: number;
  contribPct: number;
}

/**
 * One recipe's economics at every channel's price and portion (Roadmap N9): the
 * recipe named, on its own labor standard and packaging picks — never another
 * recipe's.
 */
export function phaseEconomics(
  inputs: ResolvedInputs = resolveScenarioInputs(),
  overrides: PhaseOverrides = {},
  recipe: ResolvedInputs['recipe'] = inputs.recipe,
): PhaseEconomics[] {
  // The cost of a meal is food + labor + packaging (operating-model-roadmap §3.5).
  // Fixed cost is a period expense and never enters it.
  const a = assumptionsFor(inputs, recipe.code);
  const base = costPerMeal(recipe, a, inputs.capacityInputs);
  const deliveryPerMeal = a.perMeal.delivery.value;
  const baseFood = costRecipe(recipe, a.yield.shrinkAllowance.value).totalFoodCostPerPortion;

  return inputs.phaseProfiles.map((profile) => {
    const meta = inputs.phases.find((p) => p.phase === profile.phase)!;
    const ov = overrides[profile.phase] ?? {};
    const portionFactor = ov.portionFactor ?? profile.portionFactor.value;
    const premiumFactor = ov.premiumFactor ?? profile.premiumFactor.value;
    const pricePerMeal = ov.pricePerMeal ?? meta.pricePerMeal;

    const foodCostPerPortion = baseFood * portionFactor * premiumFactor;
    const mealCost = foodCostPerPortion + base.directLabor + base.packaging;
    const variablePerMeal = mealCost + deliveryPerMeal;

    const cap = deriveCapacity(recipe, inputs.capacityInputs, portionFactor);
    const channelCost = profile.phase === 3 ? pricePerMeal * CHANNEL_COMMISSION_PHASE3 : 0;
    // Contribution before fixed cost: price less the cost of a meal and the selling costs.
    const contribution = pricePerMeal - variablePerMeal - channelCost;

    return {
      phase: profile.phase,
      market: meta.market,
      portionFactor,
      premiumFactor,
      platedPortionOz: platedPortionOz(recipe, portionFactor).totalOz,
      foodCostPerPortion,
      costPerMeal: mealCost,
      deliveryPerMeal,
      variablePerMeal,
      chilledMassPerPortion: cap.chilledMassPerPortion,
      batchSize: cap.batchSize,
      maxPortionsPerDay: cap.maxPortionsPerDay,
      pricePerMeal,
      channelCost,
      contribution,
      contribPct: pricePerMeal ? contribution / pricePerMeal : 0,
    };
  });
}


export interface ChannelRecipeEconomics {
  phase: number;
  market: string;
  pricePerMeal: number;
  /** In-service recipes offered on the channel. */
  recipes: { code: string; name: string; costPerMeal: number; contribution: number }[];
  /** Means across those recipes; null with none offered. */
  costPerMeal: number | null;
  contribution: number | null;
}

/** Each channel on the recipes it offers (Roadmap N9): each recipe at the channel's price and portion, and the mean. */
export function channelRecipeEconomics(inputs: ResolvedInputs, overrides: PhaseOverrides = {}): ChannelRecipeEconomics[] {
  const active = inputs.recipes.filter((r) => r.status === 'in_service');
  return inputs.phaseProfiles.map((profile) => {
    const meta = inputs.phases.find((p) => p.phase === profile.phase)!;
    const offered = active.filter((r) => (r.channels ?? []).includes(profile.phase));
    const rows = offered.map((r) => {
      const e = phaseEconomics(inputs, overrides, r as ResolvedInputs['recipe']).find((x) => x.phase === profile.phase)!;
      return { code: r.code, name: r.name, costPerMeal: e.costPerMeal, contribution: e.contribution };
    });
    const mean = (pick: (x: (typeof rows)[number]) => number) => (rows.length > 0 ? rows.reduce((t, x) => t + pick(x), 0) / rows.length : null);
    return { phase: profile.phase, market: meta.market, pricePerMeal: overrides[profile.phase]?.pricePerMeal ?? meta.pricePerMeal, recipes: rows, costPerMeal: mean((x) => x.costPerMeal), contribution: mean((x) => x.contribution) };
  });
}
