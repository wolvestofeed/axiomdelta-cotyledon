/**
 * MicroFarm — per-phase economics (unit + premium + price).
 *
 * Pure, no I/O, and deliberately free of any `@mf/ledger` import so it can be
 * used from a client component (the Unit Economics calculator) without dragging
 * the ledger into the browser bundle. Accepts per-phase overrides so an
 * interactive calculator can recompute from edited inputs; with no overrides it
 * uses the plan-data defaults.
 */

import { costPerUnit, costCropPlan, deriveCapacity, packedUnitOz } from './index';
import { assumptionsFor, resolveScenarioInputs, type ResolvedInputs } from './scenario';

export const CHANNEL_COMMISSION_PHASE3 = 0.25; // marketplace commission, Phase 3 only

export interface PhaseOverride {
  pricePerUnit?: number;
  unitFactor?: number;
  premiumFactor?: number;
}
export type PhaseOverrides = Record<number, PhaseOverride | undefined>;

export interface PhaseEconomics {
  phase: number;
  market: string;
  unitFactor: number;
  premiumFactor: number;
  /** DERIVED packed weight (harvested yields × unit factor), oz. Never typed. */
  packedUnitOz: number;
  inputCostPerUnit: number;
  /** The cost of a unit: food + labor + packaging. No distribution, commission or fixed cost. */
  costPerUnit: number;
  /** Distribution per unit: a selling cost after the cost of a unit. */
  distributionPerUnit: number;
  /** Cost of a unit + distribution. The marketplace commission is `channelCost`. */
  variablePerUnit: number;
  canopyMassPerUnit: number;
  sowingSize: number;
  maxUnitsPerDay: number;
  pricePerUnit: number;
  channelCost: number;
  contribution: number;
  contribPct: number;
}

/**
 * One crop plan's economics at every channel's price and unit (Roadmap N9): the
 * crop plan named, on its own labor standard and packaging picks — never another
 * crop plan's.
 */
export function phaseEconomics(
  inputs: ResolvedInputs = resolveScenarioInputs(),
  overrides: PhaseOverrides = {},
  cropPlan: ResolvedInputs['cropPlan'] = inputs.cropPlan,
): PhaseEconomics[] {
  // The cost of a unit is food + labor + packaging (operating-model-roadmap §3.5).
  // Fixed cost is a period expense and never enters it.
  const a = assumptionsFor(inputs, cropPlan.code);
  const base = costPerUnit(cropPlan, a, inputs.capacityInputs);
  const distributionPerUnit = a.perUnit.distribution.value;
  const baseFood = costCropPlan(cropPlan, a.yield.shrinkAllowance.value).totalInputCostPerUnit;

  return inputs.phaseProfiles.map((profile) => {
    const meta = inputs.phases.find((p) => p.phase === profile.phase)!;
    const ov = overrides[profile.phase] ?? {};
    const unitFactor = ov.unitFactor ?? profile.unitFactor.value;
    const premiumFactor = ov.premiumFactor ?? profile.premiumFactor.value;
    const pricePerUnit = ov.pricePerUnit ?? meta.pricePerUnit;

    const inputCostPerUnit = baseFood * unitFactor * premiumFactor;
    const unitCost = inputCostPerUnit + base.directLabor + base.packaging;
    const variablePerUnit = unitCost + distributionPerUnit;

    const cap = deriveCapacity(cropPlan, inputs.capacityInputs, unitFactor);
    const channelCost = profile.phase === 3 ? pricePerUnit * CHANNEL_COMMISSION_PHASE3 : 0;
    // Contribution before fixed cost: price less the cost of a unit and the selling costs.
    const contribution = pricePerUnit - variablePerUnit - channelCost;

    return {
      phase: profile.phase,
      market: meta.market,
      unitFactor,
      premiumFactor,
      packedUnitOz: packedUnitOz(cropPlan, unitFactor).totalOz,
      inputCostPerUnit,
      costPerUnit: unitCost,
      distributionPerUnit,
      variablePerUnit,
      canopyMassPerUnit: cap.canopyMassPerUnit,
      sowingSize: cap.sowingSize,
      maxUnitsPerDay: cap.maxUnitsPerDay,
      pricePerUnit,
      channelCost,
      contribution,
      contribPct: pricePerUnit ? contribution / pricePerUnit : 0,
    };
  });
}


export interface ChannelCropPlanEconomics {
  phase: number;
  market: string;
  pricePerUnit: number;
  /** In-service crop plans offered on the channel. */
  cropPlans: { code: string; name: string; costPerUnit: number; contribution: number }[];
  /** Means across those crop plans; null with none offered. */
  costPerUnit: number | null;
  contribution: number | null;
}

/** Each channel on the crop plans it offers (Roadmap N9): each crop plan at the channel's price and unit, and the mean. */
export function channelCropPlanEconomics(inputs: ResolvedInputs, overrides: PhaseOverrides = {}): ChannelCropPlanEconomics[] {
  const active = inputs.cropPlans.filter((r) => r.status === 'in_service');
  return inputs.phaseProfiles.map((profile) => {
    const meta = inputs.phases.find((p) => p.phase === profile.phase)!;
    const offered = active.filter((r) => (r.channels ?? []).includes(profile.phase));
    const rows = offered.map((r) => {
      const e = phaseEconomics(inputs, overrides, r as ResolvedInputs['cropPlan']).find((x) => x.phase === profile.phase)!;
      return { code: r.code, name: r.name, costPerUnit: e.costPerUnit, contribution: e.contribution };
    });
    const mean = (pick: (x: (typeof rows)[number]) => number) => (rows.length > 0 ? rows.reduce((t, x) => t + pick(x), 0) / rows.length : null);
    return { phase: profile.phase, market: meta.market, pricePerUnit: overrides[profile.phase]?.pricePerUnit ?? meta.pricePerUnit, cropPlans: rows, costPerUnit: mean((x) => x.costPerUnit), contribution: mean((x) => x.contribution) };
  });
}
