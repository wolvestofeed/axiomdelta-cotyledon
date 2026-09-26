/**
 * MicroFarm — pure calculation engine.
 *
 * These are deterministic functions with no I/O. Every dollar and unit the
 * UI shows comes from here, not from typed constants. The invariants in
 * docs/farm/CLAUDE.md §2 are enforced in code:
 *   - sowing size is DERIVED from the binding constraint, never typed
 *   - labor is fixed-per-sowing + variable-per-unit, never a flat rate
 *   - production runs in whole sowings only
 */

import {
  cropPlan as defaultCropPlan,
  capacityInputs as defaultCapacityInputs,
  assumptions,
  timeStudy,
  type InputLine,
} from '@/data/plan-data';
import { clock } from '@/data/crews';
import { equipmentSeed } from '@/data/capex';
import { sowingGrowUnitsFrom, isBlackoutRack, growUnitForProcess, type SowingGrowUnit } from '@/engine/equipment';
import { cropPlanStage, type CropPlanStage } from '@/engine/stage';
import { deriveGrowCapacity, growUnitsFrom, type GrowCapacity, type GrowUnit } from '@/engine/grow-capacity';
import { costCarrier, isGrowPlanCarrier } from '@/engine/grow-plan-bridge';

type CropPlan = typeof defaultCropPlan;
/**
 * The facility's capacity inputs. `growUnits` is the Phase 1 equipment list's grow units with
 * their shelves and fixtures (`grow-capacity.ts`), read from the equipment library
 * (`resolveScenarioInputs`); absent, the code seed's Phase 1 list stands in. `sowingGrowUnits`
 * is the Phase 1-era list the stage and routing code still reads until part 6.
 */
export type CapacityInputs = typeof defaultCapacityInputs & { sowingGrowUnits?: readonly SowingGrowUnit[]; growUnits?: readonly GrowUnit[] };

/** The Phase 1 grow units of the code seed — the fallback when no equipment library is in hand. */
export const defaultSowingGrowUnits: readonly SowingGrowUnit[] = sowingGrowUnitsFrom(equipmentSeed);
export const defaultGrowUnits: readonly GrowUnit[] = growUnitsFrom(equipmentSeed);

/** Floor `n` down to the nearest `step` (e.g. sowing size to nearest 25). */
export function roundDownToNearest(n: number, step: number): number {
  return Math.floor(n / step) * step;
}

// ── Crop plan costing: dollars are conserved, weight is not ───────────────────

/**
 * The four weights one unit of an input passes through, and the cost
 * rate at each. This is the control the model was missing.
 *
 * Growing CONSERVES dollars and CHANGES mass — rice and beans take on water, trim
 * and growing loss remove it — so a single extended cost divided by four
 * different weights gives four different rates. With no rate at any intermediate
 * stage, a packed unit can drift 30% while every dollar on the page stays
 * correct, which is exactly what happened here.
 *
 *   SOWN cost/lb     = SEED cost/lb / trim yield      (trim removes mass, cost stays)
 *   harvested cost/lb = SEED cost/lb / yield to harvest (water adds mass, cost stays)
 */
export interface InputCost extends InputLine {
  extCostPerSowing: number; // seedQtyPerSowing x seedUnitCost, at the crop plan's authored sowing
  costPerUnit: number; // extCostPerSowing / sowingUnits
  /** As-purchased quantity of one unit, in the line's own unit (lb or each). */
  seedPerUnit: number;
  // Weights of one unit, ounces, at each stage of the chain.
  seedOz: number;
  sownOz: number;
  harvestedOz: number;
  blackoutOz: number;
  /** What the subscriber receives from this line. */
  packedOz: number;
  // Cost rates. Null where the line is an each-unit item with no weight basis.
  seedCostPerLb: number | null;
  sownCostPerLb: number | null;
  harvestedCostPerLb: number | null;
  costPerPackedOz: number | null;
  /** True when a separate trim observation exists; otherwise SOWN equals SEED. */
  trimObserved: boolean;
  /** True when a separate blackout-stage observation exists; otherwise blackout equals harvested. */
  blackoutObserved: boolean;
}

export interface CropPlanCosting {
  lines: InputCost[];
  /** The units the quantities and the sowing figures below are written for. */
  sowingUnits: number;
  inputCostPerSowing: number;
  inputCostPerUnit: number; // before shrink
  shrinkPerUnit: number;
  totalInputCostPerUnit: number; // with shrink
  /** Weight chain for the whole unit, ounces. */
  seedOzPerUnit: number;
  sownOzPerUnit: number;
  harvestedOzPerUnit: number;
  blackoutOzPerUnit: number;
  packedOzPerUnit: number;
  /** The rate the Crop plans page was missing. Includes the shrink allowance. */
  costPerPackedOz: number;
  costPerHarvestedLb: number;
  costPerSeedLb: number;
}

const OZ_PER_LB = 16;

export function costCropPlan(
  cropPlan: CropPlan = defaultCropPlan,
  shrinkAllowance: number = assumptions.yield.shrinkAllowance.value,
  unitFactor = 1,
): CropPlanCosting {
  if (isGrowPlanCarrier(cropPlan)) return costGrowCarrier(cropPlan, shrinkAllowance, unitFactor);
  const basis = cropPlan.sowingUnits;
  const lines: InputCost[] = cropPlan.inputs.map((ing) => {
    const extCostPerSowing = ing.seedQtyPerSowing * ing.seedUnitCost * unitFactor;
    const costPerUnit = extCostPerSowing / basis;

    const trimYield = ing.trimYield ?? 1;
    const blackoutYield = ing.blackoutYield ?? 1;

    let seedOz: number;
    let harvestedOz: number;
    if (ing.unit === 'each') {
      const mass = ing.unitMassOz ?? 0;
      seedOz = (ing.seedQtyPerSowing / basis) * mass * unitFactor;
      harvestedOz = (ing.harvestedYieldPerSowing / basis) * mass * unitFactor;
    } else {
      seedOz = (ing.seedQtyPerSowing / basis) * OZ_PER_LB * unitFactor;
      harvestedOz = (ing.harvestedYieldPerSowing / basis) * OZ_PER_LB * unitFactor;
    }
    const sownOz = seedOz * trimYield;
    const blackoutOz = ing.isHotComponent ? harvestedOz * blackoutYield : harvestedOz;
    const packedOz = ing.isHotComponent ? blackoutOz : harvestedOz;

    const rate = (oz: number) => (oz > 0 ? costPerUnit / (oz / OZ_PER_LB) : null);

    return {
      ...ing,
      extCostPerSowing,
      costPerUnit,
      seedPerUnit: (ing.seedQtyPerSowing / basis) * unitFactor,
      seedOz,
      sownOz,
      harvestedOz,
      blackoutOz,
      packedOz,
      seedCostPerLb: ing.unit === 'lb' ? ing.seedUnitCost : rate(seedOz),
      sownCostPerLb: rate(sownOz),
      harvestedCostPerLb: rate(harvestedOz),
      costPerPackedOz: packedOz > 0 ? costPerUnit / packedOz : null,
      trimObserved: ing.trimYield !== undefined,
      blackoutObserved: ing.blackoutYield !== undefined,
    };
  });

  const inputCostPerSowing = lines.reduce((s, l) => s + l.extCostPerSowing, 0);
  const inputCostPerUnit = inputCostPerSowing / basis;
  const shrinkPerUnit = inputCostPerUnit * shrinkAllowance;
  const totalInputCostPerUnit = inputCostPerUnit + shrinkPerUnit;

  const sumOz = (pick: (l: InputCost) => number) => lines.reduce((s, l) => s + pick(l), 0);
  const seedOzPerUnit = sumOz((l) => l.seedOz);
  const harvestedOzPerUnit = sumOz((l) => l.harvestedOz);
  const packedOzPerUnit = sumOz((l) => l.packedOz);

  return {
    lines,
    sowingUnits: basis,
    inputCostPerSowing,
    inputCostPerUnit,
    shrinkPerUnit,
    totalInputCostPerUnit,
    seedOzPerUnit,
    sownOzPerUnit: sumOz((l) => l.sownOz),
    harvestedOzPerUnit,
    blackoutOzPerUnit: sumOz((l) => (l.isHotComponent ? l.blackoutOz : 0)),
    packedOzPerUnit,
    costPerPackedOz: packedOzPerUnit > 0 ? totalInputCostPerUnit / packedOzPerUnit : 0,
    costPerHarvestedLb:
      harvestedOzPerUnit > 0 ? totalInputCostPerUnit / (harvestedOzPerUnit / OZ_PER_LB) : 0,
    costPerSeedLb: seedOzPerUnit > 0 ? totalInputCostPerUnit / (seedOzPerUnit / OZ_PER_LB) : 0,
  };
}

/**
 * A grow plan costed on its four line kinds (`grow-costing.ts`), rendered in the crop plan
 * costing's shape: one tray is the unit, the seed lines carry the weight chain (seed grams →
 * harvest grams, packed as harvested on a live tray), and the medium, nutrient, light and
 * consumable lines carry cost and no mass.
 */
function costGrowCarrier(cropPlan: CropPlan & { plan: import('@/data/grow-plan').GrowPlanDef }, shrinkAllowance: number, unitFactor: number): CropPlanCosting {
  const g = costCarrier(cropPlan);
  const rate = (costPerUnit: number, oz: number) => (oz > 0 ? costPerUnit / (oz / OZ_PER_LB) : null);
  const lines: InputCost[] = cropPlan.inputs.map((ing, i) => {
    const gl = g.lines[i];
    const costPerUnit = (gl?.costPerTray ?? 0) * unitFactor;
    const seedOz = ing.unit === 'lb' ? ing.seedQtyPerSowing * OZ_PER_LB * unitFactor : 0;
    const harvestedOz = ing.unit === 'lb' ? ing.harvestedYieldPerSowing * OZ_PER_LB * unitFactor : 0;
    return {
      ...ing,
      extCostPerSowing: costPerUnit,
      costPerUnit,
      seedPerUnit: ing.seedQtyPerSowing * unitFactor,
      seedOz,
      sownOz: seedOz,
      harvestedOz,
      blackoutOz: harvestedOz,
      packedOz: harvestedOz,
      seedCostPerLb: ing.unit === 'lb' ? ing.seedUnitCost : rate(costPerUnit, seedOz),
      sownCostPerLb: rate(costPerUnit, seedOz),
      harvestedCostPerLb: rate(costPerUnit, harvestedOz),
      costPerPackedOz: harvestedOz > 0 ? costPerUnit / harvestedOz : null,
      trimObserved: false,
      blackoutObserved: false,
    };
  });
  const consumables = g.perTray.consumables * unitFactor;
  const inputCostPerUnit = lines.reduce((t, l) => t + l.costPerUnit, 0) + consumables;
  const shrinkPerUnit = inputCostPerUnit * shrinkAllowance;
  const totalInputCostPerUnit = inputCostPerUnit + shrinkPerUnit;
  const seedOzPerUnit = lines.reduce((t, l) => t + l.seedOz, 0);
  const harvestedOzPerUnit = lines.reduce((t, l) => t + l.harvestedOz, 0);
  return {
    lines,
    sowingUnits: 1,
    inputCostPerSowing: inputCostPerUnit,
    inputCostPerUnit,
    shrinkPerUnit,
    totalInputCostPerUnit,
    seedOzPerUnit,
    sownOzPerUnit: seedOzPerUnit,
    harvestedOzPerUnit,
    blackoutOzPerUnit: harvestedOzPerUnit,
    packedOzPerUnit: harvestedOzPerUnit,
    costPerPackedOz: harvestedOzPerUnit > 0 ? totalInputCostPerUnit / harvestedOzPerUnit : 0,
    costPerHarvestedLb: harvestedOzPerUnit > 0 ? totalInputCostPerUnit / (harvestedOzPerUnit / OZ_PER_LB) : 0,
    costPerSeedLb: seedOzPerUnit > 0 ? totalInputCostPerUnit / (seedOzPerUnit / OZ_PER_LB) : 0,
  };
}

// ── Served components: the unit of growing, blackout, lot coding and costing ─

export interface ComponentCosting {
  name: string;
  isHot: boolean;
  /** Stage weights for one unit of this component, ounces. */
  seedOz: number;
  sownOz: number;
  harvestedOz: number;
  blackoutOz: number;
  packedOz: number;
  costPerUnit: number;
  seedCostPerLb: number | null;
  harvestedCostPerLb: number | null;
  costPerPackedOz: number | null;
  lines: InputCost[];
}

/** Roll the costed lines up into the components that are actually harvested and packed. */
export function componentCosting(
  cropPlan: CropPlan = defaultCropPlan,
  shrinkAllowance: number = assumptions.yield.shrinkAllowance.value,
  unitFactor = 1,
): ComponentCosting[] {
  const costed = costCropPlan(cropPlan, shrinkAllowance, unitFactor).lines;
  const order: string[] = [];
  const groups = new Map<string, InputCost[]>();
  for (const l of costed) {
    if (!groups.has(l.component)) {
      groups.set(l.component, []);
      order.push(l.component);
    }
    groups.get(l.component)!.push(l);
  }
  return order.map((name) => {
    const ls = groups.get(name)!;
    const s = (pick: (l: InputCost) => number) => ls.reduce((a, l) => a + pick(l), 0);
    const seedOz = s((l) => l.seedOz);
    const harvestedOz = s((l) => l.harvestedOz);
    const packedOz = s((l) => l.packedOz);
    const costPerUnit = s((l) => l.costPerUnit);
    const perLb = (oz: number) => (oz > 0 ? costPerUnit / (oz / OZ_PER_LB) : null);
    return {
      name,
      isHot: ls.some((l) => l.isHotComponent),
      seedOz,
      sownOz: s((l) => l.sownOz),
      harvestedOz,
      blackoutOz: s((l) => l.blackoutOz),
      packedOz,
      costPerUnit,
      seedCostPerLb: perLb(seedOz),
      harvestedCostPerLb: perLb(harvestedOz),
      costPerPackedOz: packedOz > 0 ? costPerUnit / packedOz : null,
      lines: ls,
    };
  });
}

// ── Spec-first derivation: the direction the chain is supposed to run ───────

export interface SpecDerivedLine {
  name: string;
  unit: 'lb' | 'each';
  /** SEED quantity for the authored sowing the packed spec requires. */
  requiredSeedPerSowing: number;
  /** SEED quantity for the authored sowing currently authored. */
  authoredSeedPerSowing: number;
  /** requiredSeedPerSowing / authoredSeedPerSowing - 1. Positive means the crop plan is short. */
  drift: number;
}

export interface SpecReconciliation {
  /** Scale factor the packed spec implies against the authored quantities. */
  unitFactorRequired: number;
  bindingComponent: 'MMA' | 'GRAINS';
  authoredPackedOz: number;
  specPackedOz: number;
  lines: SpecDerivedLine[];
  /** Packed weight exceeds the serving grow unit it is packed into. */
  exceedsGrowUnit: boolean;
  growUnitCapacityOz: number | null;
}

/**
 * Run the chain the way it is supposed to run: packed spec first, as-purchased
 * quantities derived from it.
 *
 * The scale factor comes from the nutrition engine — the smallest factor at which
 * the unit still meets its tray format's daily minimums — and is applied back
 * through the yield chain to an SEED requirement per line. Authored quantities are
 * then reconciled against it, so drift is reported rather than absorbed.
 */
export function reconcileToSpec(
  cropPlan: CropPlan = defaultCropPlan,
  unitFactorRequired: number,
  bindingComponent: 'MMA' | 'GRAINS',
): SpecReconciliation {
  const authored = costCropPlan(cropPlan);
  const lines: SpecDerivedLine[] = cropPlan.inputs.map((ing) => ({
    name: ing.name,
    unit: ing.unit,
    requiredSeedPerSowing: ing.seedQtyPerSowing * unitFactorRequired,
    authoredSeedPerSowing: ing.seedQtyPerSowing,
    drift: unitFactorRequired - 1,
  }));
  const growUnit = cropPlan.spec?.servingGrowUnitCapacityOz?.value ?? null;
  const specPackedOz = authored.packedOzPerUnit * unitFactorRequired;
  return {
    unitFactorRequired,
    bindingComponent,
    authoredPackedOz: authored.packedOzPerUnit,
    specPackedOz,
    lines,
    exceedsGrowUnit: growUnit !== null && authored.packedOzPerUnit > growUnit,
    growUnitCapacityOz: growUnit,
  };
}

// ── Fixed overhead absorption on NORMAL CAPACITY (ASC 330-10-30-3) ──────────

export interface NormalCapacity {
  /** Units the facility is expected to achieve in a normal year, net of planned downtime. */
  unitsPerYear: number;
  /** Operating days behind that figure, by phase. */
  byPhase: Array<{ phase: number; unitsPerDay: number; operatingDays: number; units: number }>;
  plannedMaintenanceDownRate: number;
  /** The planned channel volume, units, before the plant bound and downtime. */
  grossUnitsPerYear: number;
  /** The planned volume in base-unit equivalents (units × unit factor). */
  plannedBase: number;
  /** What the plant can make in a year, base units; null when not supplied. */
  plantAnnualCapacityBase: number | null;
  /** Share of the planned volume the plant can make (1 when it fits or no bound is supplied). */
  producibleShare: number;
  /** True when the plant, not the plan, sets normal capacity. */
  boundByPlant: boolean;
}

/**
 * Normal capacity per ASC 330-10-20: "the production expected to be achieved over
 * a number of periods or seasons under normal circumstances, taking into account
 * the loss of capacity resulting from planned maintenance." For a prospect-unit
 * facility this is the 180-day prospect calendar plus whatever the other channels
 * run, net of planned downtime — NOT the theoretical daily ceiling. Production
 * cannot be expected beyond what the plant can make, so when the plant's annual
 * capacity is supplied the planned volume is bound by it before downtime.
 */
export function normalCapacity(
  phaseRows: readonly { phase: number; unitsPerDay: number; operatingDays: number; unitFactor?: number }[],
  plannedMaintenanceDownRate: number = assumptions.overhead.plannedMaintenanceDownRate.value,
  plantAnnualCapacityBase: number | null = null,
): NormalCapacity {
  const byPhase = phaseRows.map((p) => ({
    phase: p.phase,
    unitsPerDay: p.unitsPerDay,
    operatingDays: p.operatingDays,
    units: p.unitsPerDay * p.operatingDays,
  }));
  const gross = byPhase.reduce((s, p) => s + p.units, 0);
  const plannedBase = phaseRows.reduce((s, p) => s + p.unitsPerDay * p.operatingDays * (p.unitFactor ?? 1), 0);
  const producibleShare =
    plantAnnualCapacityBase === null || plannedBase <= 0 ? 1 : Math.min(1, Math.max(0, plantAnnualCapacityBase / plannedBase));
  return {
    unitsPerYear: gross * producibleShare * (1 - plannedMaintenanceDownRate),
    byPhase,
    plannedMaintenanceDownRate,
    grossUnitsPerYear: gross,
    plannedBase,
    plantAnnualCapacityBase,
    producibleShare,
    boundByPlant: producibleShare < 1,
  };
}

export interface OverheadAbsorption {
  annualFixedOverhead: number;
  normalCapacityUnits: number;
  /** The predetermined rate. This is what absorbs into inventory. */
  ratePerUnit: number;
  actualUnits: number;
  absorbed: number;
  /**
   * Positive = under-absorbed (actual below normal capacity): a period charge,
   * never capitalised. Negative = over-absorbed: reduces the period's cost.
   */
  volumeVariance: number;
  /** Share of normal capacity actually used. */
  capacityUtilisation: number;
}

/**
 * Absorb fixed manufacturing overhead at a predetermined rate set on normal
 * capacity, and report the volume variance. A stored per-unit constant absorbs
 * 100% of fixed overhead at every volume, which is what ASC 330-10-30-3 forbids:
 * in a low-volume period the unabsorbed remainder belongs in the period, not in
 * the bowl.
 */
export function absorbOverhead(
  annualFixedOverhead: number,
  capacity: NormalCapacity,
  actualUnits: number,
): OverheadAbsorption {
  const ratePerUnit = capacity.unitsPerYear > 0 ? annualFixedOverhead / capacity.unitsPerYear : 0;
  const absorbed = ratePerUnit * actualUnits;
  return {
    annualFixedOverhead,
    normalCapacityUnits: capacity.unitsPerYear,
    ratePerUnit,
    actualUnits,
    absorbed,
    volumeVariance: annualFixedOverhead - absorbed,
    capacityUtilisation: capacity.unitsPerYear > 0 ? actualUnits / capacity.unitsPerYear : 0,
  };
}

// ── Capacity & the derived sowing size ───────────────────────────────────────

/**
 * Canopy mass per unit = sum of harvested yields of HOT components only, over
 * the authored sowing. Tortilla and cheese are cold-packed and excluded. This is
 * what the blackout rack bounds the sowing on, and it differs per crop plan.
 */
export function canopyMassPerUnit(
  cropPlan: CropPlan = defaultCropPlan,
  unitFactor = 1,
): number {
  const hotHarvestedYieldPerSowing = cropPlan.inputs
    .filter((i) => i.isHotComponent)
    .reduce((s, i) => s + i.harvestedYieldPerSowing, 0);
  return (hotHarvestedYieldPerSowing / cropPlan.sowingUnits) * unitFactor;
}

/** Harvested pounds per unit of one served component (each-units by their unit mass). */
export function harvestedLbPerUnitOfComponent(cropPlan: CropPlan, component: string, unitFactor = 1): number {
  const lb = cropPlan.inputs
    .filter((i) => i.component === component)
    .reduce((s, i) => s + (i.unit === 'each' ? (i.harvestedYieldPerSowing * (i.unitMassOz ?? 0)) / 16 : i.harvestedYieldPerSowing), 0);
  return (lb / cropPlan.sowingUnits) * unitFactor;
}

/**
 * Packed unit weight, DERIVED from the crop plan's harvested yields.
 *
 * This is never typed. The weight a subscriber receives is the sum of the HARVESTED
 * component weights — dry beans and dry rice take on water and finish at roughly
 * twice and nearly three times their as-purchased weight, so the as-purchased
 * column is not the packed bowl and must never be presented as it.
 */
export interface PackedUnit {
  /** Blast-blackout hot components. Drives sowing size. */
  hotOz: number;
  /** Cold-packed components sold by weight (cheese). */
  coldOz: number;
  /** Each-unit components (tortilla), at their stated unit mass. */
  eachOz: number;
  /** What the subscriber receives. */
  totalOz: number;
  /** As-purchased weight per unit — a procurement figure, NOT the packed weight. */
  seedOz: number;
}

export function packedUnitOz(
  cropPlan: CropPlan = defaultCropPlan,
  unitFactor = 1,
): PackedUnit {
  // One derivation, not two: the weight chain is `costCropPlan`'s; this is the
  // hot / cold / each split of its packed column.
  const { lines } = costCropPlan(cropPlan, 0, unitFactor);
  let hotOz = 0;
  let coldOz = 0;
  let eachOz = 0;
  let seedOz = 0;
  for (const l of lines) {
    seedOz += l.seedOz;
    if (l.unit === 'each') eachOz += l.packedOz;
    else if (l.isHotComponent) hotOz += l.packedOz;
    else coldOz += l.packedOz;
  }
  return { hotOz, coldOz, eachOz, totalOz: hotOz + coldOz + eachOz, seedOz };
}

// ── Cooling: the regulatory clock and the equipment rating are different things

/** FDA Food Code 3-501.14(A)(1): harvested TCS food from 135°F to 70°F within 2 hours. */
export const FOOD_CODE_COOLING_STAGE_ONE_MIN = 120;
/** FDA Food Code 3-501.14(A)(2): 135°F to 41°F within 6 hours total. */
export const FOOD_CODE_COOLING_TOTAL_MIN = 360;

export interface CoolingConformance {
  stageOneLimitMin: number; // 135°F → 70°F
  totalLimitMin: number; // 135°F → 41°F
  modelledBlackoutMin: number;
  stageOneOk: boolean;
  totalOk: boolean;
  /** Headroom against the 2-hour stage; negative when the blackout stage exceeds it. */
  marginMin: number;
}

/**
 * Does the modelled BLACKOUT STAGE comply with the Food Code's two-stage cooling
 * limit (control-point-2)? Only the blackout stage is on the cooling clock — the product is
 * not in the cooling window while the rack is being loaded, unloaded or
 * sanitised, so occupancy is never tested here (that would be a category
 * error). The check is conservative: the whole rated 160°F→38°F cycle is held
 * against each stage's limit, and the product passes 70°F before the cycle ends.
 */
export function coolingConformance(
  blackoutMinutes: number = defaultCapacityInputs.blackoutMinutes.value,
): CoolingConformance {
  return {
    stageOneLimitMin: FOOD_CODE_COOLING_STAGE_ONE_MIN,
    totalLimitMin: FOOD_CODE_COOLING_TOTAL_MIN,
    modelledBlackoutMin: blackoutMinutes,
    stageOneOk: blackoutMinutes <= FOOD_CODE_COOLING_STAGE_ONE_MIN,
    totalOk: blackoutMinutes <= FOOD_CODE_COOLING_TOTAL_MIN,
    marginMin: FOOD_CODE_COOLING_STAGE_ONE_MIN - blackoutMinutes,
  };
}

// ── Blackout rack occupancy and the plant's blackout window ──────────────────────────

/**
 * Minutes the rack is unavailable per sowing: load + blackout + unload. The
 * blackout stage is the equipment rating; load and unload are handling time.
 * Cycles per day divide the window by THIS, never by the blackout stage alone.
 * The rack is not sanitized between sowings, and defrosting is maintenance,
 * not production.
 */
export function blackoutRackOccupancyMinutes(cap: CapacityInputs = defaultCapacityInputs): number {
  return cap.loadMinutes.value + cap.blackoutMinutes.value + cap.unloadMinutes.value;
}

export interface BlackoutWindow {
  /** The operating day the plant runs — a scenario input, not a staffing fact. */
  openMin: number;
  closeMin: number;
  /** Minutes from opening to the first load; null when the crop plan has no sow time on file. */
  firstLoadAfterOpenMin: number | null;
  /** `stage`: the crop plan's sow times; `none`: no component has a sow time on file. */
  firstLoadBasis: 'stage' | 'none';
  /** First load: opening plus the minutes the sows need before it. */
  startMin: number;
  /** The operating day's close. Every counted cycle is unloaded by then. */
  endMin: number;
  minutes: number;
  occupancyMinutes: number;
  /** Whole occupancy blocks that fit in the window — the closed-form cycles per day. */
  cycles: number;
  /**
   * One more sowing could be LOADED before close, with its blackout and unload
   * running past it. Reported, never counted in `cycles`: that cycle
   * runs the plant outside its operating day. Whether anyone is there to unload
   * it is a staffing finding (`_engine/staffing.ts`), not a capacity fact.
   */
  loadBeforeCloseExtraCycle: boolean;
}

/**
 * The blackout window is a property of the PLANT: the operating day the business
 * chooses to run, less the minutes before the first harvested component can go in.
 * No crew, headcount or shift enters it. Labor is a requirement derived from
 * the plan placed on this window, and proposed crews are checked against that
 * requirement — a gap there is a finding on the schedule, not a smaller plant.
 */
export function plantBlackoutWindow(
  cap: CapacityInputs = defaultCapacityInputs,
  first: { minutes: number | null; basis: BlackoutWindow['firstLoadBasis'] } = firstLoadAfterOpen(defaultCropPlan),
): BlackoutWindow {
  const openMin = cap.operatingOpenMin.value;
  const closeMin = cap.operatingCloseMin.value;
  const firstLoadAfterOpenMin = first.minutes;
  const firstLoadBasis = first.basis;
  // No sow time on file: there is no first load to place, so the window is empty.
  const startMin = firstLoadAfterOpenMin === null ? closeMin : openMin + firstLoadAfterOpenMin;
  const endMin = closeMin;
  const occupancyMinutes = blackoutRackOccupancyMinutes(cap);
  const minutes = Math.max(0, endMin - startMin);
  const cycles = occupancyMinutes > 0 ? Math.floor(minutes / occupancyMinutes) : 0;
  const nextStart = startMin + cycles * occupancyMinutes;
  return {
    openMin,
    closeMin,
    firstLoadAfterOpenMin,
    firstLoadBasis,
    startMin,
    endMin,
    minutes,
    occupancyMinutes,
    cycles,
    loadBeforeCloseExtraCycle: minutes > 0 && nextStart + cap.loadMinutes.value <= closeMin,
  };
}

export interface CapacityProfile {
  lbPerCycle: number;
  canopyMassPerUnit: number;
  unitsPerCycleRaw: number;
  /** Every Phase 1 grow unit's bound on the sowing — one unit each — tightest first. */
  bounds: SowingBound[];
  /** The grow unit that sets the sowing; null when no grow unit list is in hand. */
  binding: SowingBound | null;
  sowingSize: number; // DERIVED, floored to nearest step — off mass, never off time
  loadMinutes: number;
  blackoutMinutes: number;
  unloadMinutes: number;
  occupancyMinutes: number; // DERIVED: the three above
  blackoutWindow: BlackoutWindow; // DERIVED from the operating day and the crop plan's sow-to-blackout time
  cyclesPerDay: number; // DERIVED: floor(window ÷ occupancy) — one rack's serial stream
  /**
   * DERIVED: sowing size × cycles — the ONE-STREAM ceiling, one rack run
   * serially. With N racks in service the plant's ceiling is a placement
   * result (`planProductionDay` with `lines`, the scheduler), never N × this.
   */
  maxUnitsPerDay: number;
  cooling: CoolingConformance; // the blackout stage against FDA Food Code 3-501.14
  stage: CropPlanStage; // the crop plan's components against the stage processing standards
  /** Set on a grow plan: the sowing in trays, the units that take it, the cycle and the sustained ceiling. */
  grow?: GrowCapacity;
}

/**
 * Minutes from opening to a crop plan's first blackout rack load: its sow-to-blackout time
 * read from the crop plan's sow times, gaps listed on `stage`. The crew starts
 * growing at opening. With no sow time on file there is no first load.
 */
export function firstLoadAfterOpen(
  cropPlan: CropPlan = defaultCropPlan,
): { minutes: number | null; basis: BlackoutWindow['firstLoadBasis']; stage: CropPlanStage } {
  const stage = cropPlanStage(cropPlan);
  return { minutes: stage.sowToBlackoutMinutes, basis: stage.sowToBlackoutMinutes === null ? 'none' : 'stage', stage };
}

/**
 * One grow unit's bound on the sowing: the pounds one run takes over the pounds a
 * unit of what it sows weighs. The blackout rack bounds on the whole blackout
 * unit; a growing grow unit on the component it sows.
 */
export interface SowingBound {
  growUnit: SowingGrowUnit;
  /** The served component the grow unit sows; null for the blackout rack (every hot component). */
  component: string | null;
  lbPerUnit: number;
  /** Units one run of the grow unit makes, before rounding. */
  units: number;
}

/**
 * The sowing a crop plan runs in is bounded by ONE unit of each grow unit it passes
 * through — one blackout rack on the blackout unit, one growing grow unit on the
 * component it sows — the tightest bound wins, floored to the rounding step
 *. A second rack or shelf is a parallel stream the
 * production plan places as its own sowing, not a larger sowing. Grow unit
 * capacities come from the equipment library and are estimated until stated;
 * planned build-outs never count.
 */
export function sowingBounds(cropPlan: CropPlan, growUnits: readonly SowingGrowUnit[], unitFactor = 1): SowingBound[] {
  const bounds: SowingBound[] = [];
  const blackoutRack = growUnits.find((v) => isBlackoutRack(v.item));
  if (blackoutRack) {
    const lbPerUnit = canopyMassPerUnit(cropPlan, unitFactor);
    bounds.push({ growUnit: blackoutRack, component: null, lbPerUnit, units: lbPerUnit > 0 ? blackoutRack.capacityLb / lbPerUnit : Infinity });
  }
  for (const c of cropPlanStage(cropPlan).components) {
    if (!c.process) continue;
    const growUnit = growUnitForProcess(c.process.equipment, growUnits);
    if (!growUnit) continue;
    const lbPerUnit = harvestedLbPerUnitOfComponent(cropPlan, c.component, unitFactor);
    if (lbPerUnit <= 0) continue;
    bounds.push({ growUnit, component: c.component, lbPerUnit, units: growUnit.capacityLb / lbPerUnit });
  }
  return bounds.sort((a, b) => a.units - b.units);
}

export function deriveCapacity(
  cropPlan: CropPlan = defaultCropPlan,
  cap: CapacityInputs = defaultCapacityInputs,
  unitFactor = 1,
): CapacityProfile {
  if (isGrowPlanCarrier(cropPlan)) return deriveGrowProfile(cropPlan, cap, unitFactor);
  const growUnits = cap.sowingGrowUnits ?? defaultSowingGrowUnits;
  const blackoutRack = growUnits.find((v) => isBlackoutRack(v.item));
  // One rack's load: a sowing binds to one unit.
  const lbPerCycle = blackoutRack ? blackoutRack.capacityLb : cap.capacityPerUnitLb.value;
  const massPerUnit = canopyMassPerUnit(cropPlan, unitFactor);
  const unitsPerCycleRaw = lbPerCycle / massPerUnit;
  const bounds = blackoutRack ? sowingBounds(cropPlan, growUnits, unitFactor) : [];
  const tightest = bounds.length ? Math.min(unitsPerCycleRaw, bounds[0]!.units) : unitsPerCycleRaw;
  const sowingSize = roundDownToNearest(tightest, cap.sowingRoundingUnits);
  const first = firstLoadAfterOpen(cropPlan);
  const blackoutWindow = plantBlackoutWindow(cap, first);
  const cyclesPerDay = blackoutWindow.cycles;
  return {
    lbPerCycle,
    canopyMassPerUnit: massPerUnit,
    unitsPerCycleRaw,
    bounds,
    binding: bounds[0] ?? null,
    sowingSize,
    loadMinutes: cap.loadMinutes.value,
    blackoutMinutes: cap.blackoutMinutes.value,
    unloadMinutes: cap.unloadMinutes.value,
    occupancyMinutes: blackoutWindow.occupancyMinutes,
    blackoutWindow,
    cyclesPerDay,
    maxUnitsPerDay: sowingSize * cyclesPerDay,
    cooling: coolingConformance(cap.blackoutMinutes.value),
    stage: first.stage,
  };
}

/**
 * A grow plan's capacity in the crop plan profile's shape (outline §5 rule 1): the sowing is the
 * trays one grow unit takes of the plan's format (`grow-capacity.ts`), never off mass. No rack
 * minutes enter it: the day is the operating day, and each grow unit that takes the plan can
 * start one sowing in it, so the sowings a day are the units. The sustained ceiling, trays across
 * the units over the cycle, is on `grow`; the horizon's shelf ledger holds each sowing for its cycle.
 */
function deriveGrowProfile(cropPlan: CropPlan & { plan: import('@/data/grow-plan').GrowPlanDef }, cap: CapacityInputs, unitFactor: number): CapacityProfile {
  const grow = deriveGrowCapacity(cropPlan.plan, cap.growUnits ?? defaultGrowUnits);
  const first = firstLoadAfterOpen(cropPlan);
  const openMin = cap.operatingOpenMin.value;
  const closeMin = cap.operatingCloseMin.value;
  const day = Math.max(0, closeMin - openMin);
  const blackoutWindow: BlackoutWindow = { openMin, closeMin, firstLoadAfterOpenMin: 0, firstLoadBasis: 'stage', startMin: openMin, endMin: closeMin, minutes: day, occupancyMinutes: day, cycles: grow.unitCount, loadBeforeCloseExtraCycle: false };
  const cyclesPerDay = grow.unitCount;
  const massPerUnit = canopyMassPerUnit(cropPlan, unitFactor);
  return {
    lbPerCycle: (grow.sowingTrays * massPerUnit),
    canopyMassPerUnit: massPerUnit,
    unitsPerCycleRaw: grow.sowingTrays,
    bounds: [],
    binding: null,
    sowingSize: grow.sowingTrays,
    loadMinutes: 0,
    blackoutMinutes: 0,
    unloadMinutes: 0,
    occupancyMinutes: blackoutWindow.occupancyMinutes,
    blackoutWindow,
    cyclesPerDay,
    maxUnitsPerDay: grow.sowingTrays * cyclesPerDay,
    cooling: coolingConformance(0),
    stage: first.stage,
    grow,
  };
}

// ── The planning loop ───────────────────────────────────────────────────────

export interface PlanningInput {
  forecastUnits: number;
  openingInventory: number;
  daysOfCoverTarget: number;
  shelfLifeDays: number;
  sowingSize: number;
  cyclesAvailable: number;
}

export interface PlanningResult {
  targetInventory: number;
  projectedInventory: number;
  shortfall: number;
  sowingsToRun: number; // whole sowings only
  unitsProduced: number;
  closingInventory: number;
  daysOfCover: number;
  overproductionCarriedForward: number;
  shelfLifeCheck: 'OK' | 'OVER';
  cyclesRequired: number;
  capacityCheck: 'OK' | 'OVER_CAPACITY';
}

export function runPlanningLoop(input: PlanningInput): PlanningResult {
  const targetInventory = input.forecastUnits * input.daysOfCoverTarget;
  const projectedInventory = input.openingInventory - input.forecastUnits;
  const shortfall = Math.max(0, targetInventory - projectedInventory);
  const sowingsToRun = Math.ceil(shortfall / input.sowingSize); // whole sowings only
  const unitsProduced = sowingsToRun * input.sowingSize;
  const closingInventory = projectedInventory + unitsProduced;
  const daysOfCover = closingInventory / input.forecastUnits;
  const cyclesRequired = sowingsToRun; // one sowing is sized to one cycle by construction
  return {
    targetInventory,
    projectedInventory,
    shortfall,
    sowingsToRun,
    unitsProduced,
    closingInventory,
    daysOfCover,
    overproductionCarriedForward: Math.max(0, closingInventory - targetInventory),
    shelfLifeCheck: daysOfCover > input.shelfLifeDays ? 'OVER' : 'OK',
    cyclesRequired,
    capacityCheck: cyclesRequired > input.cyclesAvailable ? 'OVER_CAPACITY' : 'OK',
  };
}

// ── Labor: fixed per sowing + variable per unit ───────────────────────────

export interface LaborResult {
  fixedLaborHours: number;
  variableLaborHours: number;
  totalLaborHours: number;
  directLaborCost: number;
  laborCostPerUnit: number;
}

export function laborForDay(
  sowings: number,
  units: number,
  a: typeof assumptions = assumptions,
): LaborResult {
  const fixedLaborHours = (sowings * a.laborSplit.fixedMinutesPerSowing.value) / 60;
  const variableLaborHours = (units * (a.laborSplit.variableMinutesPerUnit.value + (a.laborSplit.dailyMinutesPerUnit?.value ?? 0))) / 60;
  const totalLaborHours = fixedLaborHours + variableLaborHours;
  const directLaborCost = totalLaborHours * a.labor.blendedLoadedWage.value;
  return {
    fixedLaborHours,
    variableLaborHours,
    totalLaborHours,
    directLaborCost,
    laborCostPerUnit: units > 0 ? directLaborCost / units : 0,
  };
}

/** Fixed share of a full sowing's labor — the reason a partial sowing is expensive. */
export function fixedLaborShareOfFullSowing(
  sowingSize: number,
  a: typeof assumptions = assumptions,
): number {
  const fixed = a.laborSplit.fixedMinutesPerSowing.value;
  const variable = sowingSize * a.laborSplit.variableMinutesPerUnit.value;
  return fixed / (fixed + variable);
}

// ── Purchase order — driven by UNITS PRODUCED, not the forecast ──────────

export interface PurchaseOrderLine {
  name: string;
  unit: string;
  /** SEED quantity for the crop plan's authored sowing. */
  seedPerSowing: number;
  requiredForProduction: number; // seedPerSowing × units / sowingUnits
  packSize: number;
  casesToOrder: number; // ceil(required / packSize)
  seedUnitCost: number;
  extendedCost: number; // cases × packSize × unitCost (what you actually spend)
}

export interface PurchaseOrder {
  lines: PurchaseOrderLine[];
  total: number;
}

export function buildPurchaseOrder(
  unitsProduced: number,
  cropPlan: CropPlan = defaultCropPlan,
): PurchaseOrder {
  const lines: PurchaseOrderLine[] = cropPlan.inputs.map((ing) => {
    const requiredForProduction = (ing.seedQtyPerSowing * unitsProduced) / cropPlan.sowingUnits;
    const casesToOrder = Math.ceil(requiredForProduction / ing.packSize);
    const extendedCost = casesToOrder * ing.packSize * ing.seedUnitCost;
    return {
      name: ing.name,
      unit: ing.unit,
      seedPerSowing: ing.seedQtyPerSowing,
      requiredForProduction,
      packSize: ing.packSize,
      casesToOrder,
      seedUnitCost: ing.seedUnitCost,
      extendedCost,
    };
  });
  return { lines, total: lines.reduce((s, l) => s + l.extendedCost, 0) };
}

/**
 * The purchase order for a production run INCLUDING the normal-spoilage
 * allowance. The shrink allowance is trim, over-packing and spoilage — pounds
 * that are bought and never packed — so the run buys `units × (1 + shrink)`
 * units' worth of inputs. This is what keeps raw-material inventory from
 * being relieved by more dollars than were ever received.
 */
export function purchaseOrderForRun(
  unitsProduced: number,
  cropPlan: CropPlan = defaultCropPlan,
  shrinkAllowance: number = assumptions.yield.shrinkAllowance.value,
): PurchaseOrder {
  return buildPurchaseOrder(unitsProduced * (1 + shrinkAllowance), cropPlan);
}

// ── Cost per unit build-up + contribution by phase ──────────────────────────

/**
 * The cost of a unit: food +
 * direct labor + packaging, and nothing else. Distribution and the marketplace
 * commission are selling costs deducted after it to reach contribution. Fixed
 * cost — lease, utilities, depreciation, admin, interest — is a period expense
 * and never enters it; fixed cost per unit is a side metric computed per period
 * (`fixedCostPerUnitByMonth`). The inventory absorption rate the ledger values
 * finished goods at (ASC 330) is a separate figure and is not this one either.
 *
 * Direct labor is the crop plan's time study at its derived sowing size: the fixed
 * minutes spread over the sowing plus the variable minutes per unit, at the
 * loaded labor rate (a placeholder until Staffing's loaded rates arrive). The
 * flat wage ÷ units-per-labor-hour rate was an invented figure and is deleted
 *.
 */
export interface CostPerUnit {
  food: number;
  directLabor: number;
  packaging: number;
  total: number;
}

export function costPerUnit(
  cropPlan: CropPlan = defaultCropPlan,
  a: typeof assumptions = assumptions,
  cap: CapacityInputs = defaultCapacityInputs,
  laborMinutesPerUnit?: number,
): CostPerUnit {
  const food = costCropPlan(cropPlan, a.yield.shrinkAllowance.value).totalInputCostPerUnit;
  const sowingSize = deriveCapacity(cropPlan, cap).sowingSize;
  const minutesPerUnit =
    laborMinutesPerUnit ??
    (sowingSize > 0 ? a.laborSplit.fixedMinutesPerSowing.value / sowingSize : 0) +
      a.laborSplit.variableMinutesPerUnit.value +
      (a.laborSplit.dailyMinutesPerUnit?.value ?? 0);
  const directLabor = (minutesPerUnit / 60) * a.labor.blendedLoadedWage.value;
  const packaging = a.perUnit.packaging.value;
  return { food, directLabor, packaging, total: food + directLabor + packaging };
}

// ── Sowing costing → yield → costing down to the unit ────────────────────────

/**
 * The costing rule of the farm, written once:
 *
 *   1. SOWING COSTING — the planned cost of one full-line sowing from bulk
 *      as-purchased inputs, at the derived sowing size.
 *   2. YIELD — the sowing's harvested, blackout and packed pounds against the pounds
 *      purchased: the usable product from the raw weight, stage by stage.
 *   3. COSTING DOWN — the sowing cost over the sowing's units is the unit food
 *      cost; the cost to serve adds conversion labor, packaging and
 *      distribution per unit. Storage is a fixed cost and is not in it.
 *
 * The cost of a unit the ledger carries (`costPerUnit`: food, labor, packaging)
 * is the standard; distribution is a selling cost there (accounting-policy §5).
 * Cost to serve is the management figure that includes it.
 */
export interface SowingCosting {
  /** The derived sowing, units — one unit of each Phase 1 grow unit. */
  sowingUnits: number;
  /** The units the crop plan's quantities are written for. */
  authoredUnits: number;
  /** Sowing ÷ authored: what every authored quantity is multiplied by. */
  scale: number;
  seedLb: number;
  sownLb: number;
  harvestedLb: number;
  blackoutLb: number;
  packedLb: number;
  /** Harvested pounds over purchased pounds. */
  yieldHarvestedOverSeed: number;
  /** Packed pounds over purchased pounds. */
  yieldPackedOverSeed: number;
  /** Bulk inputs at as-purchased prices, for the sowing. */
  sowingInputCost: number;
  shrinkAllowance: number;
  sowingInputCostWithShrink: number;
  unitInputCost: number;
}

export function sowingCosting(
  cropPlan: CropPlan = defaultCropPlan,
  cap: CapacityInputs = defaultCapacityInputs,
  shrinkAllowance: number = assumptions.yield.shrinkAllowance.value,
  unitFactor = 1,
): SowingCosting {
  const c = costCropPlan(cropPlan, shrinkAllowance, unitFactor);
  const sowing = deriveCapacity(cropPlan, cap, unitFactor).sowingSize;
  const lb = (ozPerUnit: number) => (ozPerUnit * sowing) / OZ_PER_LB;
  const seedLb = lb(c.seedOzPerUnit);
  const harvestedLb = lb(c.harvestedOzPerUnit);
  const packedLb = lb(c.packedOzPerUnit);
  const sowingInputCost = c.inputCostPerUnit * sowing;
  return {
    sowingUnits: sowing,
    authoredUnits: cropPlan.sowingUnits,
    scale: cropPlan.sowingUnits > 0 ? sowing / cropPlan.sowingUnits : 0,
    seedLb,
    sownLb: lb(c.sownOzPerUnit),
    harvestedLb,
    blackoutLb: lb(c.blackoutOzPerUnit),
    packedLb,
    yieldHarvestedOverSeed: seedLb > 0 ? harvestedLb / seedLb : 0,
    yieldPackedOverSeed: seedLb > 0 ? packedLb / seedLb : 0,
    sowingInputCost,
    shrinkAllowance,
    sowingInputCostWithShrink: sowingInputCost * (1 + shrinkAllowance),
    unitInputCost: c.totalInputCostPerUnit,
  };
}

export interface CostToServe extends CostPerUnit {
  /** Distribution to the pickup points, per unit (`perUnit.distribution`). */
  distribution: number;
  /** Food + conversion labor + packaging + distribution. Storage excluded. */
  costToServe: number;
}

export function costToServe(
  cropPlan: CropPlan = defaultCropPlan,
  a: typeof assumptions = assumptions,
  cap: CapacityInputs = defaultCapacityInputs,
  laborMinutesPerUnit?: number,
): CostToServe {
  const unit = costPerUnit(cropPlan, a, cap, laborMinutesPerUnit);
  const distribution = a.perUnit.distribution.value;
  return { ...unit, distribution, costToServe: unit.total + distribution };
}

// ── Validation warnings — surfaced, never silently resolved ─────────────────

export interface ValidationWarning {
  id: string;
  title: string;
  detail: string;
}

export function validationWarnings(
  cropPlan: CropPlan = defaultCropPlan,
  a: typeof assumptions = assumptions,
  study: typeof timeStudy = timeStudy,
  cap: CapacityInputs = defaultCapacityInputs,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // 1. Stored harvested yields must equal as-purchased x yield factor. A typed
  //    harvested yield that drifts from its inputs silently moves sowing size.
  const drift = cropPlan.inputs.filter(
    (i) => Math.abs(i.seedQtyPerSowing * i.yieldToHarvest - i.harvestedYieldPerSowing) > 0.001,
  );
  if (drift.length > 0) {
    warnings.push({
      id: 'yield-integrity',
      title: 'Stored harvested yield does not equal SEED x yield factor',
      detail: `${drift.map((d) => d.name).join(', ')}. Canopy mass per unit, and therefore sowing size, derives from the harvested column. Recompute it from the inputs.`,
    });
  }

  // 2. The time study is estimated at one sowing size and the model runs at another.
  const capacity = deriveCapacity(cropPlan, cap);
  const derived = capacity.sowingSize;
  if (!isGrowPlanCarrier(cropPlan) && derived !== study.estimatedAtSowingSize) {
    warnings.push({
      id: 'time-study-rebasing',
      title: 'Time-study re-basing',
      detail: `Task minutes were estimated at a ${study.estimatedAtSowingSize}-unit sowing; the derived sowing is ${derived}. The variable rate is held on the ${study.estimatedAtSowingSize} basis so the minutes are not flattered, but the study is an estimate, not an observation. Re-observe at the real sowing size.`,
    });
  }

  // 3. (Retired, Roadmap N3.) This checked that the TYPED variable rate stayed
  //    tied to the plan's single study. Labor is now each crop plan's own standard,
  //    derived from its own study, so there is no typed rate for it to drift
  //    from — and against a crop plan's resolved assumptions it would fire on every
  //    crop plan that is not AMK-E-001.

  // 5. The blackout stage against the Food Code cooling limit (control-point-2). A scenario
  //    may set a blackout the Code forbids; the engine says so rather than
  //    refusing the edit.
  const cooling = capacity.cooling;
  if (!cooling.stageOneOk || !cooling.totalOk) {
    warnings.push({
      id: 'ccp2-cooling-limit',
      title: 'Modelled blackout stage exceeds the Food Code cooling limit',
      detail: `The blackout stage is ${cooling.modelledBlackoutMin} min. FDA Food Code 3-501.14 allows ${cooling.stageOneLimitMin} min for 135°F to 70°F${cooling.stageOneOk ? '' : ' (exceeded)'} and ${cooling.totalLimitMin} min for 135°F to 41°F${cooling.totalOk ? '' : ' (exceeded)'}. control-point-2's critical limit is not met by this scenario.`,
    });
  }

  // 6. The operating day against the rack. Staffing is not checked here —
  //    crews are a proposed answer checked against the labor requirement in
  //    `_engine/staffing.ts`, never an input to the ceiling.
  const w = capacity.blackoutWindow;
  if (w.cycles === 0) {
    warnings.push({
      id: 'plant-window-no-cycle',
      title: 'No whole blackout rack cycle fits the operating day',
      detail:
        w.firstLoadBasis === 'none'
          ? `No component of ${cropPlan.code} has a sow time on file, so there is no first blackout rack load to place and the daily ceiling is 0.`
          : `The first load is ${clock(w.startMin)} and the operating day closes ${clock(w.endMin)}: ${w.minutes} min against a ${w.occupancyMinutes}-min occupancy, so the daily ceiling is 0.`,
    });
  }

  return warnings;
}
