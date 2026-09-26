/**
 * Impact OS — pure calculation engine.
 *
 * These are deterministic functions with no I/O. Every dollar and portion the
 * UI shows comes from here, not from typed constants. The invariants in
 * docs/muse/CLAUDE.md §2 are enforced in code:
 *   - batch size is DERIVED from the binding constraint, never typed
 *   - labor is fixed-per-batch + variable-per-portion, never a flat rate
 *   - production runs in whole batches only
 */

import {
  recipe as defaultRecipe,
  capacityInputs as defaultCapacityInputs,
  assumptions,
  timeStudy,
  type IngredientLine,
} from '../_data/plan-data';
import { clock } from '../_data/crews';
import { equipmentSeed } from '../_data/capex';
import { batchVesselsFrom, isBlastChiller, vesselForProcess, type BatchVessel } from './equipment';
import { recipeThermal, type RecipeThermal } from './thermal';

type Recipe = typeof defaultRecipe;
/**
 * The plant's capacity inputs. `batchVessels` is the Phase 1 equipment list's
 * vessels with their batch capacities, read from the equipment library
 * (`resolveScenarioInputs`); absent, the code seed's Phase 1 list stands in.
 */
export type CapacityInputs = typeof defaultCapacityInputs & { batchVessels?: readonly BatchVessel[] };

/** The Phase 1 vessels of the code seed — the fallback when no equipment library is in hand. */
export const defaultBatchVessels: readonly BatchVessel[] = batchVesselsFrom(equipmentSeed);

/** Floor `n` down to the nearest `step` (e.g. batch size to nearest 25). */
export function roundDownToNearest(n: number, step: number): number {
  return Math.floor(n / step) * step;
}

// ── Recipe costing: dollars are conserved, weight is not ───────────────────

/**
 * The four weights one portion of an ingredient passes through, and the cost
 * rate at each. This is the control the model was missing.
 *
 * Cooking CONSERVES dollars and CHANGES mass — rice and beans take on water, trim
 * and cooking loss remove it — so a single extended cost divided by four
 * different weights gives four different rates. With no rate at any intermediate
 * stage, a plated portion can drift 30% while every dollar on the page stays
 * correct, which is exactly what happened here.
 *
 *   EP cost/lb     = AP cost/lb / trim yield      (trim removes mass, cost stays)
 *   cooked cost/lb = AP cost/lb / yield to cooked (water adds mass, cost stays)
 */
export interface IngredientCost extends IngredientLine {
  extCostPerBatch: number; // apQtyPerBatch x apUnitCost, at the recipe's authored batch
  costPerPortion: number; // extCostPerBatch / batchPortions
  /** As-purchased quantity of one portion, in the line's own unit (lb or each). */
  apPerPortion: number;
  // Weights of one portion, ounces, at each stage of the chain.
  apOz: number;
  epOz: number;
  cookedOz: number;
  chilledOz: number;
  /** What the customer receives from this line. */
  platedOz: number;
  // Cost rates. Null where the line is an each-unit item with no weight basis.
  apCostPerLb: number | null;
  epCostPerLb: number | null;
  cookedCostPerLb: number | null;
  costPerPlatedOz: number | null;
  /** True when a separate trim observation exists; otherwise EP equals AP. */
  trimObserved: boolean;
  /** True when a separate chill-stage observation exists; otherwise chilled equals cooked. */
  chillObserved: boolean;
}

export interface RecipeCosting {
  lines: IngredientCost[];
  /** The portions the quantities and the batch figures below are written for. */
  batchPortions: number;
  foodCostPerBatch: number;
  foodCostPerPortion: number; // before shrink
  shrinkPerPortion: number;
  totalFoodCostPerPortion: number; // with shrink
  /** Weight chain for the whole portion, ounces. */
  apOzPerPortion: number;
  epOzPerPortion: number;
  cookedOzPerPortion: number;
  chilledOzPerPortion: number;
  platedOzPerPortion: number;
  /** The rate the Recipes page was missing. Includes the shrink allowance. */
  costPerPlatedOz: number;
  costPerCookedLb: number;
  costPerApLb: number;
}

const OZ_PER_LB = 16;

export function costRecipe(
  recipe: Recipe = defaultRecipe,
  shrinkAllowance: number = assumptions.yield.shrinkAllowance.value,
  portionFactor = 1,
): RecipeCosting {
  const basis = recipe.batchPortions;
  const lines: IngredientCost[] = recipe.ingredients.map((ing) => {
    const extCostPerBatch = ing.apQtyPerBatch * ing.apUnitCost * portionFactor;
    const costPerPortion = extCostPerBatch / basis;

    const trimYield = ing.trimYield ?? 1;
    const chillYield = ing.chillYield ?? 1;

    let apOz: number;
    let cookedOz: number;
    if (ing.unit === 'each') {
      const mass = ing.unitMassOz ?? 0;
      apOz = (ing.apQtyPerBatch / basis) * mass * portionFactor;
      cookedOz = (ing.cookedYieldPerBatch / basis) * mass * portionFactor;
    } else {
      apOz = (ing.apQtyPerBatch / basis) * OZ_PER_LB * portionFactor;
      cookedOz = (ing.cookedYieldPerBatch / basis) * OZ_PER_LB * portionFactor;
    }
    const epOz = apOz * trimYield;
    const chilledOz = ing.isHotComponent ? cookedOz * chillYield : cookedOz;
    const platedOz = ing.isHotComponent ? chilledOz : cookedOz;

    const rate = (oz: number) => (oz > 0 ? costPerPortion / (oz / OZ_PER_LB) : null);

    return {
      ...ing,
      extCostPerBatch,
      costPerPortion,
      apPerPortion: (ing.apQtyPerBatch / basis) * portionFactor,
      apOz,
      epOz,
      cookedOz,
      chilledOz,
      platedOz,
      apCostPerLb: ing.unit === 'lb' ? ing.apUnitCost : rate(apOz),
      epCostPerLb: rate(epOz),
      cookedCostPerLb: rate(cookedOz),
      costPerPlatedOz: platedOz > 0 ? costPerPortion / platedOz : null,
      trimObserved: ing.trimYield !== undefined,
      chillObserved: ing.chillYield !== undefined,
    };
  });

  const foodCostPerBatch = lines.reduce((s, l) => s + l.extCostPerBatch, 0);
  const foodCostPerPortion = foodCostPerBatch / basis;
  const shrinkPerPortion = foodCostPerPortion * shrinkAllowance;
  const totalFoodCostPerPortion = foodCostPerPortion + shrinkPerPortion;

  const sumOz = (pick: (l: IngredientCost) => number) => lines.reduce((s, l) => s + pick(l), 0);
  const apOzPerPortion = sumOz((l) => l.apOz);
  const cookedOzPerPortion = sumOz((l) => l.cookedOz);
  const platedOzPerPortion = sumOz((l) => l.platedOz);

  return {
    lines,
    batchPortions: basis,
    foodCostPerBatch,
    foodCostPerPortion,
    shrinkPerPortion,
    totalFoodCostPerPortion,
    apOzPerPortion,
    epOzPerPortion: sumOz((l) => l.epOz),
    cookedOzPerPortion,
    chilledOzPerPortion: sumOz((l) => (l.isHotComponent ? l.chilledOz : 0)),
    platedOzPerPortion,
    costPerPlatedOz: platedOzPerPortion > 0 ? totalFoodCostPerPortion / platedOzPerPortion : 0,
    costPerCookedLb:
      cookedOzPerPortion > 0 ? totalFoodCostPerPortion / (cookedOzPerPortion / OZ_PER_LB) : 0,
    costPerApLb: apOzPerPortion > 0 ? totalFoodCostPerPortion / (apOzPerPortion / OZ_PER_LB) : 0,
  };
}

// ── Served components: the unit of cooking, chilling, lot coding and costing ─

export interface ComponentCosting {
  name: string;
  isHot: boolean;
  /** Stage weights for one portion of this component, ounces. */
  apOz: number;
  epOz: number;
  cookedOz: number;
  chilledOz: number;
  platedOz: number;
  costPerPortion: number;
  apCostPerLb: number | null;
  cookedCostPerLb: number | null;
  costPerPlatedOz: number | null;
  lines: IngredientCost[];
}

/** Roll the costed lines up into the components that are actually cooked and packed. */
export function componentCosting(
  recipe: Recipe = defaultRecipe,
  shrinkAllowance: number = assumptions.yield.shrinkAllowance.value,
  portionFactor = 1,
): ComponentCosting[] {
  const costed = costRecipe(recipe, shrinkAllowance, portionFactor).lines;
  const order: string[] = [];
  const groups = new Map<string, IngredientCost[]>();
  for (const l of costed) {
    if (!groups.has(l.component)) {
      groups.set(l.component, []);
      order.push(l.component);
    }
    groups.get(l.component)!.push(l);
  }
  return order.map((name) => {
    const ls = groups.get(name)!;
    const s = (pick: (l: IngredientCost) => number) => ls.reduce((a, l) => a + pick(l), 0);
    const apOz = s((l) => l.apOz);
    const cookedOz = s((l) => l.cookedOz);
    const platedOz = s((l) => l.platedOz);
    const costPerPortion = s((l) => l.costPerPortion);
    const perLb = (oz: number) => (oz > 0 ? costPerPortion / (oz / OZ_PER_LB) : null);
    return {
      name,
      isHot: ls.some((l) => l.isHotComponent),
      apOz,
      epOz: s((l) => l.epOz),
      cookedOz,
      chilledOz: s((l) => l.chilledOz),
      platedOz,
      costPerPortion,
      apCostPerLb: perLb(apOz),
      cookedCostPerLb: perLb(cookedOz),
      costPerPlatedOz: platedOz > 0 ? costPerPortion / platedOz : null,
      lines: ls,
    };
  });
}

// ── Spec-first derivation: the direction the chain is supposed to run ───────

export interface SpecDerivedLine {
  name: string;
  unit: 'lb' | 'each';
  /** AP quantity for the authored batch the plated spec requires. */
  requiredApPerBatch: number;
  /** AP quantity for the authored batch currently authored. */
  authoredApPerBatch: number;
  /** requiredApPerBatch / authoredApPerBatch - 1. Positive means the recipe is short. */
  drift: number;
}

export interface SpecReconciliation {
  /** Scale factor the plated spec implies against the authored quantities. */
  portionFactorRequired: number;
  bindingComponent: 'MMA' | 'GRAINS';
  authoredPlatedOz: number;
  specPlatedOz: number;
  lines: SpecDerivedLine[];
  /** Plated weight exceeds the serving vessel it is packed into. */
  exceedsVessel: boolean;
  vesselCapacityOz: number | null;
}

/**
 * Run the chain the way it is supposed to run: plated spec first, as-purchased
 * quantities derived from it.
 *
 * The scale factor comes from the crediting engine — the smallest factor at which
 * the portion still meets its grade group's daily minimums — and is applied back
 * through the yield chain to an AP requirement per line. Authored quantities are
 * then reconciled against it, so drift is reported rather than absorbed.
 */
export function reconcileToSpec(
  recipe: Recipe = defaultRecipe,
  portionFactorRequired: number,
  bindingComponent: 'MMA' | 'GRAINS',
): SpecReconciliation {
  const authored = costRecipe(recipe);
  const lines: SpecDerivedLine[] = recipe.ingredients.map((ing) => ({
    name: ing.name,
    unit: ing.unit,
    requiredApPerBatch: ing.apQtyPerBatch * portionFactorRequired,
    authoredApPerBatch: ing.apQtyPerBatch,
    drift: portionFactorRequired - 1,
  }));
  const vessel = recipe.spec?.servingVesselCapacityOz?.value ?? null;
  const specPlatedOz = authored.platedOzPerPortion * portionFactorRequired;
  return {
    portionFactorRequired,
    bindingComponent,
    authoredPlatedOz: authored.platedOzPerPortion,
    specPlatedOz,
    lines,
    exceedsVessel: vessel !== null && authored.platedOzPerPortion > vessel,
    vesselCapacityOz: vessel,
  };
}

// ── Fixed overhead absorption on NORMAL CAPACITY (ASC 330-10-30-3) ──────────

export interface NormalCapacity {
  /** Meals the facility is expected to achieve in a normal year, net of planned downtime. */
  mealsPerYear: number;
  /** Operating days behind that figure, by phase. */
  byPhase: Array<{ phase: number; mealsPerDay: number; operatingDays: number; meals: number }>;
  plannedMaintenanceDownRate: number;
  /** The planned channel volume, meals, before the plant bound and downtime. */
  grossMealsPerYear: number;
  /** The planned volume in base-portion equivalents (meals × portion factor). */
  plannedBase: number;
  /** What the plant can make in a year, base portions; null when not supplied. */
  plantAnnualCapacityBase: number | null;
  /** Share of the planned volume the plant can make (1 when it fits or no bound is supplied). */
  producibleShare: number;
  /** True when the plant, not the plan, sets normal capacity. */
  boundByPlant: boolean;
}

/**
 * Normal capacity per ASC 330-10-20: "the production expected to be achieved over
 * a number of periods or seasons under normal circumstances, taking into account
 * the loss of capacity resulting from planned maintenance." For a school-meal
 * commissary this is the 180-day school calendar plus whatever the other channels
 * run, net of planned downtime — NOT the theoretical daily ceiling. Production
 * cannot be expected beyond what the plant can make, so when the plant's annual
 * capacity is supplied the planned volume is bound by it before downtime.
 */
export function normalCapacity(
  phaseRows: readonly { phase: number; mealsPerDay: number; operatingDays: number; portionFactor?: number }[],
  plannedMaintenanceDownRate: number = assumptions.overhead.plannedMaintenanceDownRate.value,
  plantAnnualCapacityBase: number | null = null,
): NormalCapacity {
  const byPhase = phaseRows.map((p) => ({
    phase: p.phase,
    mealsPerDay: p.mealsPerDay,
    operatingDays: p.operatingDays,
    meals: p.mealsPerDay * p.operatingDays,
  }));
  const gross = byPhase.reduce((s, p) => s + p.meals, 0);
  const plannedBase = phaseRows.reduce((s, p) => s + p.mealsPerDay * p.operatingDays * (p.portionFactor ?? 1), 0);
  const producibleShare =
    plantAnnualCapacityBase === null || plannedBase <= 0 ? 1 : Math.min(1, Math.max(0, plantAnnualCapacityBase / plannedBase));
  return {
    mealsPerYear: gross * producibleShare * (1 - plannedMaintenanceDownRate),
    byPhase,
    plannedMaintenanceDownRate,
    grossMealsPerYear: gross,
    plannedBase,
    plantAnnualCapacityBase,
    producibleShare,
    boundByPlant: producibleShare < 1,
  };
}

export interface OverheadAbsorption {
  annualFixedOverhead: number;
  normalCapacityMeals: number;
  /** The predetermined rate. This is what absorbs into inventory. */
  ratePerMeal: number;
  actualMeals: number;
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
 * capacity, and report the volume variance. A stored per-meal constant absorbs
 * 100% of fixed overhead at every volume, which is what ASC 330-10-30-3 forbids:
 * in a low-volume period the unabsorbed remainder belongs in the period, not in
 * the bowl.
 */
export function absorbOverhead(
  annualFixedOverhead: number,
  capacity: NormalCapacity,
  actualMeals: number,
): OverheadAbsorption {
  const ratePerMeal = capacity.mealsPerYear > 0 ? annualFixedOverhead / capacity.mealsPerYear : 0;
  const absorbed = ratePerMeal * actualMeals;
  return {
    annualFixedOverhead,
    normalCapacityMeals: capacity.mealsPerYear,
    ratePerMeal,
    actualMeals,
    absorbed,
    volumeVariance: annualFixedOverhead - absorbed,
    capacityUtilisation: capacity.mealsPerYear > 0 ? actualMeals / capacity.mealsPerYear : 0,
  };
}

// ── Capacity & the derived batch size ───────────────────────────────────────

/**
 * Chilled mass per portion = sum of cooked yields of HOT components only, over
 * the authored batch. Tortilla and cheese are cold-packed and excluded. This is
 * what the chiller bounds the batch on, and it differs per recipe.
 */
export function chilledMassPerPortion(
  recipe: Recipe = defaultRecipe,
  portionFactor = 1,
): number {
  const hotCookedYieldPerBatch = recipe.ingredients
    .filter((i) => i.isHotComponent)
    .reduce((s, i) => s + i.cookedYieldPerBatch, 0);
  return (hotCookedYieldPerBatch / recipe.batchPortions) * portionFactor;
}

/** Cooked pounds per portion of one served component (each-units by their unit mass). */
export function cookedLbPerPortionOfComponent(recipe: Recipe, component: string, portionFactor = 1): number {
  const lb = recipe.ingredients
    .filter((i) => i.component === component)
    .reduce((s, i) => s + (i.unit === 'each' ? (i.cookedYieldPerBatch * (i.unitMassOz ?? 0)) / 16 : i.cookedYieldPerBatch), 0);
  return (lb / recipe.batchPortions) * portionFactor;
}

/**
 * Plated portion weight, DERIVED from the recipe's cooked yields.
 *
 * This is never typed. The weight a customer receives is the sum of the COOKED
 * component weights — dry beans and dry rice take on water and finish at roughly
 * twice and nearly three times their as-purchased weight, so the as-purchased
 * column is not the plated bowl and must never be presented as it.
 */
export interface PlatedPortion {
  /** Blast-chilled hot components. Drives batch size. */
  hotOz: number;
  /** Cold-packed components sold by weight (cheese). */
  coldOz: number;
  /** Each-unit components (tortilla), at their stated unit mass. */
  eachOz: number;
  /** What the customer receives. */
  totalOz: number;
  /** As-purchased weight per portion — a procurement figure, NOT the plated weight. */
  apOz: number;
}

export function platedPortionOz(
  recipe: Recipe = defaultRecipe,
  portionFactor = 1,
): PlatedPortion {
  // One derivation, not two: the weight chain is `costRecipe`'s; this is the
  // hot / cold / each split of its plated column.
  const { lines } = costRecipe(recipe, 0, portionFactor);
  let hotOz = 0;
  let coldOz = 0;
  let eachOz = 0;
  let apOz = 0;
  for (const l of lines) {
    apOz += l.apOz;
    if (l.unit === 'each') eachOz += l.platedOz;
    else if (l.isHotComponent) hotOz += l.platedOz;
    else coldOz += l.platedOz;
  }
  return { hotOz, coldOz, eachOz, totalOz: hotOz + coldOz + eachOz, apOz };
}

// ── Cooling: the regulatory clock and the equipment rating are different things

/** FDA Food Code 3-501.14(A)(1): cooked TCS food from 135°F to 70°F within 2 hours. */
export const FOOD_CODE_COOLING_STAGE_ONE_MIN = 120;
/** FDA Food Code 3-501.14(A)(2): 135°F to 41°F within 6 hours total. */
export const FOOD_CODE_COOLING_TOTAL_MIN = 360;

export interface CoolingConformance {
  stageOneLimitMin: number; // 135°F → 70°F
  totalLimitMin: number; // 135°F → 41°F
  modelledChillMin: number;
  stageOneOk: boolean;
  totalOk: boolean;
  /** Headroom against the 2-hour stage; negative when the chill stage exceeds it. */
  marginMin: number;
}

/**
 * Does the modelled CHILL STAGE comply with the Food Code's two-stage cooling
 * limit (CCP-2)? Only the chill stage is on the cooling clock — the product is
 * not in the cooling window while the cabinet is being loaded, unloaded or
 * sanitised, so occupancy is never tested here (that would be a category
 * error). The check is conservative: the whole rated 160°F→38°F cycle is held
 * against each stage's limit, and the product passes 70°F before the cycle ends.
 */
export function coolingConformance(
  chillMinutes: number = defaultCapacityInputs.chillMinutes.value,
): CoolingConformance {
  return {
    stageOneLimitMin: FOOD_CODE_COOLING_STAGE_ONE_MIN,
    totalLimitMin: FOOD_CODE_COOLING_TOTAL_MIN,
    modelledChillMin: chillMinutes,
    stageOneOk: chillMinutes <= FOOD_CODE_COOLING_STAGE_ONE_MIN,
    totalOk: chillMinutes <= FOOD_CODE_COOLING_TOTAL_MIN,
    marginMin: FOOD_CODE_COOLING_STAGE_ONE_MIN - chillMinutes,
  };
}

// ── Chiller occupancy and the plant's chill window ──────────────────────────

/**
 * Minutes the cabinet is unavailable per batch: load + chill + unload. The
 * chill stage is the equipment rating; load and unload are handling time.
 * Cycles per day divide the window by THIS, never by the chill stage alone.
 * The cabinet is not sanitized between batches, and defrosting is maintenance,
 * not production (Robert, 2026-09-15).
 */
export function chillerOccupancyMinutes(cap: CapacityInputs = defaultCapacityInputs): number {
  return cap.loadMinutes.value + cap.chillMinutes.value + cap.unloadMinutes.value;
}

export interface ChillWindow {
  /** The operating day the plant runs — a scenario input, not a staffing fact. */
  openMin: number;
  closeMin: number;
  /** Minutes from opening to the first load; null when the recipe has no cook time on file. */
  firstLoadAfterOpenMin: number | null;
  /** `thermal`: the recipe's cook times; `none`: no component has a cook time on file. */
  firstLoadBasis: 'thermal' | 'none';
  /** First load: opening plus the minutes the cooks need before it. */
  startMin: number;
  /** The operating day's close. Every counted cycle is unloaded by then. */
  endMin: number;
  minutes: number;
  occupancyMinutes: number;
  /** Whole occupancy blocks that fit in the window — the closed-form cycles per day. */
  cycles: number;
  /**
   * One more batch could be LOADED before close, with its chill and unload
   * running past it. Reported, never counted in `cycles`: that cycle
   * runs the plant outside its operating day. Whether anyone is there to unload
   * it is a staffing finding (`_engine/staffing.ts`), not a capacity fact.
   */
  loadBeforeCloseExtraCycle: boolean;
}

/**
 * The chill window is a property of the PLANT: the operating day the business
 * chooses to run, less the minutes before the first cooked component can go in.
 * No crew, headcount or shift enters it. Labor is a requirement derived from
 * the plan placed on this window, and proposed crews are checked against that
 * requirement — a gap there is a finding on the schedule, not a smaller plant.
 */
export function plantChillWindow(
  cap: CapacityInputs = defaultCapacityInputs,
  first: { minutes: number | null; basis: ChillWindow['firstLoadBasis'] } = firstLoadAfterOpen(defaultRecipe),
): ChillWindow {
  const openMin = cap.operatingOpenMin.value;
  const closeMin = cap.operatingCloseMin.value;
  const firstLoadAfterOpenMin = first.minutes;
  const firstLoadBasis = first.basis;
  // No cook time on file: there is no first load to place, so the window is empty.
  const startMin = firstLoadAfterOpenMin === null ? closeMin : openMin + firstLoadAfterOpenMin;
  const endMin = closeMin;
  const occupancyMinutes = chillerOccupancyMinutes(cap);
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
  chilledMassPerPortion: number;
  portionsPerCycleRaw: number;
  /** Every Phase 1 vessel's bound on the batch — one unit each — tightest first. */
  bounds: BatchBound[];
  /** The vessel that sets the batch; null when no vessel list is in hand. */
  binding: BatchBound | null;
  batchSize: number; // DERIVED, floored to nearest step — off mass, never off time
  loadMinutes: number;
  chillMinutes: number;
  unloadMinutes: number;
  occupancyMinutes: number; // DERIVED: the three above
  chillWindow: ChillWindow; // DERIVED from the operating day and the recipe's cook-to-chill time
  cyclesPerDay: number; // DERIVED: floor(window ÷ occupancy) — one cabinet's serial stream
  /**
   * DERIVED: batch size × cycles — the ONE-STREAM ceiling, one cabinet run
   * serially. With N cabinets in service the plant's ceiling is a placement
   * result (`planProductionDay` with `lines`, the scheduler), never N × this.
   */
  maxPortionsPerDay: number;
  cooling: CoolingConformance; // the chill stage against FDA Food Code 3-501.14
  thermal: RecipeThermal; // the recipe's components against the thermal processing standards
}

/**
 * Minutes from opening to a recipe's first chiller load: its cook-to-chill time
 * read from the recipe's cook times, gaps listed on `thermal`. The crew starts
 * cooking at opening. With no cook time on file there is no first load.
 */
export function firstLoadAfterOpen(
  recipe: Recipe = defaultRecipe,
): { minutes: number | null; basis: ChillWindow['firstLoadBasis']; thermal: RecipeThermal } {
  const thermal = recipeThermal(recipe);
  return { minutes: thermal.cookToChillMinutes, basis: thermal.cookToChillMinutes === null ? 'none' : 'thermal', thermal };
}

/**
 * One vessel's bound on the batch: the pounds one run takes over the pounds a
 * portion of what it cooks weighs. The chiller bounds on the whole chilled
 * portion; a cooking vessel on the component it cooks.
 */
export interface BatchBound {
  vessel: BatchVessel;
  /** The served component the vessel cooks; null for the chiller (every hot component). */
  component: string | null;
  lbPerPortion: number;
  /** Portions one run of the vessel makes, before rounding. */
  portions: number;
}

/**
 * The batch a recipe runs in is bounded by ONE unit of each vessel it passes
 * through — one chiller on the chilled portion, one cooking vessel on the
 * component it cooks — the tightest bound wins, floored to the rounding step
 * (Robert, 2026-09-15; one unit, never the sum of the units on the list,
 * Robert, 2026-09-17). A second cabinet or skillet is a parallel stream the
 * production plan places as its own batch, not a larger batch. Vessel
 * capacities come from the equipment library and are estimated until stated;
 * planned build-outs never count.
 */
export function batchBounds(recipe: Recipe, vessels: readonly BatchVessel[], portionFactor = 1): BatchBound[] {
  const bounds: BatchBound[] = [];
  const chiller = vessels.find((v) => isBlastChiller(v.item));
  if (chiller) {
    const lbPerPortion = chilledMassPerPortion(recipe, portionFactor);
    bounds.push({ vessel: chiller, component: null, lbPerPortion, portions: lbPerPortion > 0 ? chiller.capacityLb / lbPerPortion : Infinity });
  }
  for (const c of recipeThermal(recipe).components) {
    if (!c.process) continue;
    const vessel = vesselForProcess(c.process.equipment, vessels);
    if (!vessel) continue;
    const lbPerPortion = cookedLbPerPortionOfComponent(recipe, c.component, portionFactor);
    if (lbPerPortion <= 0) continue;
    bounds.push({ vessel, component: c.component, lbPerPortion, portions: vessel.capacityLb / lbPerPortion });
  }
  return bounds.sort((a, b) => a.portions - b.portions);
}

export function deriveCapacity(
  recipe: Recipe = defaultRecipe,
  cap: CapacityInputs = defaultCapacityInputs,
  portionFactor = 1,
): CapacityProfile {
  const vessels = cap.batchVessels ?? defaultBatchVessels;
  const chiller = vessels.find((v) => isBlastChiller(v.item));
  // One cabinet's load: a batch binds to one unit (Robert, 2026-09-17).
  const lbPerCycle = chiller ? chiller.capacityLb : cap.capacityPerUnitLb.value;
  const massPerPortion = chilledMassPerPortion(recipe, portionFactor);
  const portionsPerCycleRaw = lbPerCycle / massPerPortion;
  const bounds = chiller ? batchBounds(recipe, vessels, portionFactor) : [];
  const tightest = bounds.length ? Math.min(portionsPerCycleRaw, bounds[0]!.portions) : portionsPerCycleRaw;
  const batchSize = roundDownToNearest(tightest, cap.batchRoundingPortions);
  const first = firstLoadAfterOpen(recipe);
  const chillWindow = plantChillWindow(cap, first);
  const cyclesPerDay = chillWindow.cycles;
  return {
    lbPerCycle,
    chilledMassPerPortion: massPerPortion,
    portionsPerCycleRaw,
    bounds,
    binding: bounds[0] ?? null,
    batchSize,
    loadMinutes: cap.loadMinutes.value,
    chillMinutes: cap.chillMinutes.value,
    unloadMinutes: cap.unloadMinutes.value,
    occupancyMinutes: chillWindow.occupancyMinutes,
    chillWindow,
    cyclesPerDay,
    maxPortionsPerDay: batchSize * cyclesPerDay,
    cooling: coolingConformance(cap.chillMinutes.value),
    thermal: first.thermal,
  };
}

// ── The planning loop ───────────────────────────────────────────────────────

export interface PlanningInput {
  forecastPortions: number;
  openingInventory: number;
  daysOfCoverTarget: number;
  holdLifeDays: number;
  batchSize: number;
  cyclesAvailable: number;
}

export interface PlanningResult {
  targetInventory: number;
  projectedInventory: number;
  shortfall: number;
  batchesToRun: number; // whole batches only
  portionsProduced: number;
  closingInventory: number;
  daysOfCover: number;
  overproductionCarriedForward: number;
  holdLifeCheck: 'OK' | 'OVER';
  cyclesRequired: number;
  capacityCheck: 'OK' | 'OVER_CAPACITY';
}

export function runPlanningLoop(input: PlanningInput): PlanningResult {
  const targetInventory = input.forecastPortions * input.daysOfCoverTarget;
  const projectedInventory = input.openingInventory - input.forecastPortions;
  const shortfall = Math.max(0, targetInventory - projectedInventory);
  const batchesToRun = Math.ceil(shortfall / input.batchSize); // whole batches only
  const portionsProduced = batchesToRun * input.batchSize;
  const closingInventory = projectedInventory + portionsProduced;
  const daysOfCover = closingInventory / input.forecastPortions;
  const cyclesRequired = batchesToRun; // one batch is sized to one cycle by construction
  return {
    targetInventory,
    projectedInventory,
    shortfall,
    batchesToRun,
    portionsProduced,
    closingInventory,
    daysOfCover,
    overproductionCarriedForward: Math.max(0, closingInventory - targetInventory),
    holdLifeCheck: daysOfCover > input.holdLifeDays ? 'OVER' : 'OK',
    cyclesRequired,
    capacityCheck: cyclesRequired > input.cyclesAvailable ? 'OVER_CAPACITY' : 'OK',
  };
}

// ── Labor: fixed per batch + variable per portion ───────────────────────────

export interface LaborResult {
  fixedLaborHours: number;
  variableLaborHours: number;
  totalLaborHours: number;
  directLaborCost: number;
  laborCostPerPortion: number;
}

export function laborForDay(
  batches: number,
  portions: number,
  a: typeof assumptions = assumptions,
): LaborResult {
  const fixedLaborHours = (batches * a.laborSplit.fixedMinutesPerBatch.value) / 60;
  const variableLaborHours = (portions * a.laborSplit.variableMinutesPerPortion.value) / 60;
  const totalLaborHours = fixedLaborHours + variableLaborHours;
  const directLaborCost = totalLaborHours * a.labor.blendedLoadedWage.value;
  return {
    fixedLaborHours,
    variableLaborHours,
    totalLaborHours,
    directLaborCost,
    laborCostPerPortion: portions > 0 ? directLaborCost / portions : 0,
  };
}

/** Fixed share of a full batch's labor — the reason a partial batch is expensive. */
export function fixedLaborShareOfFullBatch(
  batchSize: number,
  a: typeof assumptions = assumptions,
): number {
  const fixed = a.laborSplit.fixedMinutesPerBatch.value;
  const variable = batchSize * a.laborSplit.variableMinutesPerPortion.value;
  return fixed / (fixed + variable);
}

// ── Purchase order — driven by PORTIONS PRODUCED, not the forecast ──────────

export interface PurchaseOrderLine {
  name: string;
  unit: string;
  /** AP quantity for the recipe's authored batch. */
  apPerBatch: number;
  requiredForProduction: number; // apPerBatch × portions / batchPortions
  packSize: number;
  casesToOrder: number; // ceil(required / packSize)
  apUnitCost: number;
  extendedCost: number; // cases × packSize × unitCost (what you actually spend)
}

export interface PurchaseOrder {
  lines: PurchaseOrderLine[];
  total: number;
}

export function buildPurchaseOrder(
  portionsProduced: number,
  recipe: Recipe = defaultRecipe,
): PurchaseOrder {
  const lines: PurchaseOrderLine[] = recipe.ingredients.map((ing) => {
    const requiredForProduction = (ing.apQtyPerBatch * portionsProduced) / recipe.batchPortions;
    const casesToOrder = Math.ceil(requiredForProduction / ing.packSize);
    const extendedCost = casesToOrder * ing.packSize * ing.apUnitCost;
    return {
      name: ing.name,
      unit: ing.unit,
      apPerBatch: ing.apQtyPerBatch,
      requiredForProduction,
      packSize: ing.packSize,
      casesToOrder,
      apUnitCost: ing.apUnitCost,
      extendedCost,
    };
  });
  return { lines, total: lines.reduce((s, l) => s + l.extendedCost, 0) };
}

/**
 * The purchase order for a production run INCLUDING the normal-spoilage
 * allowance. The shrink allowance is trim, over-portioning and spoilage — pounds
 * that are bought and never plated — so the run buys `portions × (1 + shrink)`
 * portions' worth of ingredients. This is what keeps raw-material inventory from
 * being relieved by more dollars than were ever received.
 */
export function purchaseOrderForRun(
  portionsProduced: number,
  recipe: Recipe = defaultRecipe,
  shrinkAllowance: number = assumptions.yield.shrinkAllowance.value,
): PurchaseOrder {
  return buildPurchaseOrder(portionsProduced * (1 + shrinkAllowance), recipe);
}

// ── Cost per meal build-up + contribution by phase ──────────────────────────

/**
 * The cost of a meal (Robert, 2026-09-14; operating-model-roadmap §3.5): food +
 * direct labor + packaging, and nothing else. Delivery and the marketplace
 * commission are selling costs deducted after it to reach contribution. Fixed
 * cost — lease, utilities, depreciation, admin, interest — is a period expense
 * and never enters it; fixed cost per meal is a side metric computed per period
 * (`fixedCostPerMealByMonth`). The inventory absorption rate the ledger values
 * finished goods at (ASC 330) is a separate figure and is not this one either.
 *
 * Direct labor is the recipe's time study at its derived batch size: the fixed
 * minutes spread over the batch plus the variable minutes per portion, at the
 * loaded labor rate (a placeholder until CompTable's loaded rates arrive). The
 * flat wage ÷ meals-per-labor-hour rate was an invented figure and is deleted
 * (Robert, 2026-09-15).
 */
export interface CostPerMeal {
  food: number;
  directLabor: number;
  packaging: number;
  total: number;
}

export function costPerMeal(
  recipe: Recipe = defaultRecipe,
  a: typeof assumptions = assumptions,
  cap: CapacityInputs = defaultCapacityInputs,
  laborMinutesPerMeal?: number,
): CostPerMeal {
  const food = costRecipe(recipe, a.yield.shrinkAllowance.value).totalFoodCostPerPortion;
  const batchSize = deriveCapacity(recipe, cap).batchSize;
  const minutesPerMeal =
    laborMinutesPerMeal ??
    (batchSize > 0 ? a.laborSplit.fixedMinutesPerBatch.value / batchSize : 0) +
      a.laborSplit.variableMinutesPerPortion.value;
  const directLabor = (minutesPerMeal / 60) * a.labor.blendedLoadedWage.value;
  const packaging = a.perMeal.packaging.value;
  return { food, directLabor, packaging, total: food + directLabor + packaging };
}

// ── Batch costing → yield → costing down to the unit ────────────────────────

/**
 * The costing rule of the kitchen (Robert, 2026-09-15), written once:
 *
 *   1. BATCH COSTING — the planned cost of one full-line batch from bulk
 *      as-purchased inputs, at the derived batch size.
 *   2. YIELD — the batch's cooked, chilled and plated pounds against the pounds
 *      purchased: the usable product from the raw weight, stage by stage.
 *   3. COSTING DOWN — the batch cost over the batch's portions is the unit food
 *      cost; the cost to serve adds conversion labor, packaging and
 *      distribution per portion. Storage is a fixed cost and is not in it.
 *
 * The cost of a meal the ledger carries (`costPerMeal`: food, labor, packaging)
 * is the standard; distribution is a selling cost there (accounting-policy §5).
 * Cost to serve is the management figure that includes it.
 */
export interface BatchCosting {
  /** The derived batch, portions — one unit of each Phase 1 vessel. */
  batchPortions: number;
  /** The portions the recipe's quantities are written for. */
  authoredPortions: number;
  /** Batch ÷ authored: what every authored quantity is multiplied by. */
  scale: number;
  apLb: number;
  epLb: number;
  cookedLb: number;
  chilledLb: number;
  platedLb: number;
  /** Cooked pounds over purchased pounds. */
  yieldCookedOverAp: number;
  /** Plated pounds over purchased pounds. */
  yieldPlatedOverAp: number;
  /** Bulk inputs at as-purchased prices, for the batch. */
  batchFoodCost: number;
  shrinkAllowance: number;
  batchFoodCostWithShrink: number;
  unitFoodCost: number;
}

export function batchCosting(
  recipe: Recipe = defaultRecipe,
  cap: CapacityInputs = defaultCapacityInputs,
  shrinkAllowance: number = assumptions.yield.shrinkAllowance.value,
  portionFactor = 1,
): BatchCosting {
  const c = costRecipe(recipe, shrinkAllowance, portionFactor);
  const batch = deriveCapacity(recipe, cap, portionFactor).batchSize;
  const lb = (ozPerPortion: number) => (ozPerPortion * batch) / OZ_PER_LB;
  const apLb = lb(c.apOzPerPortion);
  const cookedLb = lb(c.cookedOzPerPortion);
  const platedLb = lb(c.platedOzPerPortion);
  const batchFoodCost = c.foodCostPerPortion * batch;
  return {
    batchPortions: batch,
    authoredPortions: recipe.batchPortions,
    scale: recipe.batchPortions > 0 ? batch / recipe.batchPortions : 0,
    apLb,
    epLb: lb(c.epOzPerPortion),
    cookedLb,
    chilledLb: lb(c.chilledOzPerPortion),
    platedLb,
    yieldCookedOverAp: apLb > 0 ? cookedLb / apLb : 0,
    yieldPlatedOverAp: apLb > 0 ? platedLb / apLb : 0,
    batchFoodCost,
    shrinkAllowance,
    batchFoodCostWithShrink: batchFoodCost * (1 + shrinkAllowance),
    unitFoodCost: c.totalFoodCostPerPortion,
  };
}

export interface CostToServe extends CostPerMeal {
  /** Distribution to the sites, per meal (`perMeal.delivery`). */
  distribution: number;
  /** Food + conversion labor + packaging + distribution. Storage excluded (Robert, 2026-09-15). */
  costToServe: number;
}

export function costToServe(
  recipe: Recipe = defaultRecipe,
  a: typeof assumptions = assumptions,
  cap: CapacityInputs = defaultCapacityInputs,
  laborMinutesPerMeal?: number,
): CostToServe {
  const meal = costPerMeal(recipe, a, cap, laborMinutesPerMeal);
  const distribution = a.perMeal.delivery.value;
  return { ...meal, distribution, costToServe: meal.total + distribution };
}

// ── Validation warnings — surfaced, never silently resolved ─────────────────

export interface ValidationWarning {
  id: string;
  title: string;
  detail: string;
}

export function validationWarnings(
  recipe: Recipe = defaultRecipe,
  a: typeof assumptions = assumptions,
  study: typeof timeStudy = timeStudy,
  cap: CapacityInputs = defaultCapacityInputs,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // 1. Stored cooked yields must equal as-purchased x yield factor. A typed
  //    cooked yield that drifts from its inputs silently moves batch size.
  const drift = recipe.ingredients.filter(
    (i) => Math.abs(i.apQtyPerBatch * i.yieldToCooked - i.cookedYieldPerBatch) > 0.001,
  );
  if (drift.length > 0) {
    warnings.push({
      id: 'yield-integrity',
      title: 'Stored cooked yield does not equal AP x yield factor',
      detail: `${drift.map((d) => d.name).join(', ')}. Chilled mass per portion, and therefore batch size, derives from the cooked column. Recompute it from the inputs.`,
    });
  }

  // 2. The time study is estimated at one batch size and the model runs at another.
  const capacity = deriveCapacity(recipe, cap);
  const derived = capacity.batchSize;
  if (derived !== study.estimatedAtBatchSize) {
    warnings.push({
      id: 'time-study-rebasing',
      title: 'Time-study re-basing',
      detail: `Task minutes were estimated at a ${study.estimatedAtBatchSize}-portion batch; the derived batch is ${derived}. The variable rate is held on the ${study.estimatedAtBatchSize} basis so the minutes are not flattered, but the study is an estimate, not an observation. Re-observe at the real batch size.`,
    });
  }

  // 3. (Retired, Roadmap N3.) This checked that the TYPED variable rate stayed
  //    tied to the plan's single study. Labor is now each recipe's own standard,
  //    derived from its own study, so there is no typed rate for it to drift
  //    from — and against a recipe's resolved assumptions it would fire on every
  //    recipe that is not AMK-E-001.

  // 5. The chill stage against the Food Code cooling limit (CCP-2). A scenario
  //    may set a chill the Code forbids; the engine says so rather than
  //    refusing the edit.
  const cooling = capacity.cooling;
  if (!cooling.stageOneOk || !cooling.totalOk) {
    warnings.push({
      id: 'ccp2-cooling-limit',
      title: 'Modelled chill stage exceeds the Food Code cooling limit',
      detail: `The chill stage is ${cooling.modelledChillMin} min. FDA Food Code 3-501.14 allows ${cooling.stageOneLimitMin} min for 135°F to 70°F${cooling.stageOneOk ? '' : ' (exceeded)'} and ${cooling.totalLimitMin} min for 135°F to 41°F${cooling.totalOk ? '' : ' (exceeded)'}. CCP-2's critical limit is not met by this scenario.`,
    });
  }

  // 6. The operating day against the cabinet. Staffing is not checked here —
  //    crews are a proposed answer checked against the labor requirement in
  //    `_engine/staffing.ts`, never an input to the ceiling.
  const w = capacity.chillWindow;
  if (w.cycles === 0) {
    warnings.push({
      id: 'plant-window-no-cycle',
      title: 'No whole chiller cycle fits the operating day',
      detail:
        w.firstLoadBasis === 'none'
          ? `No component of ${recipe.code} has a cook time on file, so there is no first chiller load to place and the daily ceiling is 0.`
          : `The first load is ${clock(w.startMin)} and the operating day closes ${clock(w.endMin)}: ${w.minutes} min against a ${w.occupancyMinutes}-min occupancy, so the daily ceiling is 0.`,
    });
  }

  return warnings;
}
