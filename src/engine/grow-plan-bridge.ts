/**
 * MicroFarm — the grow plan under the engine's crop plan shape. Pure.
 *
 * The library stores grow plans (`_data/grow-plan.ts`). The engine modules that Phase 2 has not
 * yet moved onto them (the stage and routing code, the scheduler, the production plan, crediting,
 * produce safety, the carbon and agent modules) read `CropPlanDef.inputs`. This module renders a
 * grow plan as that shape, one input line per grow line, so those modules keep running on the
 * same library until their part replaces them; the costing and the capacity read the grow plan
 * itself (`grow-costing.ts`, `grow-capacity.ts`) through the carrier this module recognises.
 * The projection goes when part 10 finishes the rename.
 */

import type { CropPlanDef, InputLine, CropPlanSpec } from '@/data/plan-data';
import { tagged } from '@/data/tagged';
import { lineLabel, type GrowPlanDef } from '@/data/grow-plan';
import { VARIETY_BY_KEY, type VarietyDef } from '@/data/varieties';
import { costGrowPlan, defaultGrowCostContext, fixtureFor, type GrowCostContext, type GrowPlanCosting } from '@/engine/grow-costing';

/** A crop plan that carries the grow plan it was projected from. */
export type GrowPlanCarrier = CropPlanDef & { plan: GrowPlanDef };

export function isGrowPlanCarrier(x: unknown): x is GrowPlanCarrier {
  return typeof x === 'object' && x !== null && 'plan' in x && typeof (x as { plan?: unknown }).plan === 'object' && (x as { plan: { lines?: unknown } }).plan !== null && Array.isArray((x as { plan: { lines?: unknown } }).plan.lines);
}

/** The spec block the legacy shape requires; no figure in it is read for a grow plan. */
function emptySpec(): CropPlanSpec {
  return {
    trayFormat: tagged('9-12', 'STATED', 'tray format', 'Not read for a grow plan'),
    nutritionTarget: { mmaOzEq: tagged(0, 'STATED', 'oz eq', 'Not read for a grow plan'), grainsOzEq: tagged(0, 'STATED', 'oz eq', 'Not read for a grow plan') },
    carriesVegetableRequirement: tagged<boolean>(false, 'STATED', 'boolean', 'Not read for a grow plan'),
    servingGrowUnitCapacityOz: tagged(0, 'STATED', 'oz', 'Not read for a grow plan'),
    packingUtensil: tagged<string>('', 'STATED', 'utensil', 'Not read for a grow plan'),
  };
}

/**
 * The grow plan as the legacy engine reads it: one input line per grow line, quantities for one
 * tray (`sowingUnits: 1`). A seed line is a pound line whose yield is harvest grams over seed
 * grams; a medium, nutrient or light line is an each line whose quantity is what one tray takes
 * and whose yield is zero (its mass is not the tray's). Every line is hot and rolls up into its
 * variety, so the stage and lot code read the variety as the component.
 */
export function projectCropPlan(plan: GrowPlanDef, costing: GrowPlanCosting = costGrowPlan(plan, contextFor(plan)), varieties: Readonly<Record<string, VarietyDef>> = VARIETY_BY_KEY): GrowPlanCarrier {
  const lead = costing.lines.find((l) => l.line.kind === 'seed');
  const leadName = lead?.label ?? plan.name;
  const inputs: InputLine[] = costing.lines.map((c): InputLine => {
    if (c.line.kind === 'seed') {
      const v = varieties[c.line.varietyKey];
      const seedLb = c.quantity / 453.59237;
      const yieldToHarvest = c.quantity > 0 && v ? (v.harvestGramsPer1020.value * (costing.format.kind === 'sprout' ? 1 : costing.format.densityFactor.value) * c.line.share) / c.quantity : 0;
      return {
        name: c.label,
        spec: `${c.quantity} g per ${costing.format.name}`,
        seedQtyPerSowing: seedLb,
        unit: 'lb',
        yieldToHarvest,
        harvestedYieldPerSowing: seedLb * yieldToHarvest,
        seedUnitCost: c.unitCost,
        packSize: 1,
        isHotComponent: true,
        status: c.status,
        source: c.source,
        yieldStatus: v?.harvestGramsPer1020.status ?? 'PLACEHOLDER',
        yieldSource: v?.harvestGramsPer1020.note ?? 'No harvest weight on file',
        component: c.label,
        varietyKey: c.line.varietyKey,
      };
    }
    return {
      name: lineLabel(c.line, varieties),
      spec: c.basis,
      seedQtyPerSowing: c.quantity,
      unit: 'each',
      yieldToHarvest: 0,
      harvestedYieldPerSowing: 0,
      seedUnitCost: c.unitCost,
      packSize: 1,
      isHotComponent: true,
      status: c.status,
      source: c.source,
      yieldStatus: 'STATED',
      yieldSource: 'A growing input adds no mass to the tray',
      component: leadName,
    };
  });
  return {
    code: plan.code,
    name: plan.name,
    category: costing.format.name,
    status: plan.status,
    channels: [...plan.channels],
    components: costing.lines.filter((l) => l.line.kind === 'seed').map((l) => l.label).join(', '),
    productionMethod: plan.note,
    allergensPresent: '',
    allergenFreeClaims: '',
    sowingUnits: 1,
    spec: emptySpec(),
    inputs,
    plan,
  };
}

/**
 * The cost context a carrier is costed in: the plan's fixture, and any price standing on a
 * projected seed line over the variety record (a scenario what-if or a catalog price applied
 * by the resolver).
 */
export function contextFor(plan: GrowPlanDef, carrier?: CropPlanDef, over: Partial<GrowCostContext> = {}): GrowCostContext {
  const seedPricePerLb: Record<string, number> = {};
  if (carrier) {
    for (const l of carrier.inputs) {
      if (!l.varietyKey) continue;
      const v = VARIETY_BY_KEY[l.varietyKey];
      if (v && Math.abs(l.seedUnitCost - v.seedPricePerLb.value) > 1e-9) seedPricePerLb[l.varietyKey] = l.seedUnitCost;
    }
  }
  return defaultGrowCostContext({ fixture: fixtureFor(plan), seedPricePerLb, ...over });
}

/** Cost a carrier's grow plan with the prices its projected lines carry. */
export function costCarrier(carrier: GrowPlanCarrier, over: Partial<GrowCostContext> = {}): GrowPlanCosting {
  return costGrowPlan(carrier.plan, contextFor(carrier.plan, carrier, over));
}
