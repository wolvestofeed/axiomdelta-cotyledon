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

import { capacityInputs as defaultCapacityInputs, assumptions, type InputLine, type CropPlanDef } from '@/data/plan-data';
import { equipmentSeed } from '@/data/capex';
import { sowingGrowUnitsFrom, type SowingGrowUnit } from '@/engine/equipment';
import { deriveGrowCapacity, growUnitsFrom, type GrowCapacity, type GrowUnit } from '@/engine/grow-capacity';
import { costCarrier, isGrowPlanCarrier } from '@/engine/grow-plan-bridge';

type CropPlan = CropPlanDef;
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
  cropPlan: CropPlan,
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
  cropPlan: CropPlan,
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
  cropPlan: CropPlan,
  unitFactor = 1,
): number {
  const hotHarvestedYieldPerSowing = cropPlan.inputs
    .filter((i) => i.isHotComponent)
    .reduce((s, i) => s + i.harvestedYieldPerSowing, 0);
  return (hotHarvestedYieldPerSowing / cropPlan.sowingUnits) * unitFactor;
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
  cropPlan: CropPlan,
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

// ── The day a sowing is placed in ────────────────────────────────────────────

/** The operating day as a sowing reads it; on a grow plan the whole day, one sowing per grow unit. */
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

export interface CapacityProfile {
  lbPerCycle: number;
  canopyMassPerUnit: number;
  unitsPerCycleRaw: number;
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
  /** Set on a grow plan: the sowing in trays, the units that take it, the cycle and the sustained ceiling. */
  grow?: GrowCapacity;
}

export function deriveCapacity(
  cropPlan: CropPlan,
  cap: CapacityInputs = defaultCapacityInputs,
  unitFactor = 1,
): CapacityProfile {
  if (isGrowPlanCarrier(cropPlan)) return deriveGrowProfile(cropPlan, cap, unitFactor);
  // A plan that is not a grow plan takes no grow unit: a sowing of zero.
  const openMin = cap.operatingOpenMin.value;
  const closeMin = cap.operatingCloseMin.value;
  const day = Math.max(0, closeMin - openMin);
  const blackoutWindow: BlackoutWindow = { openMin, closeMin, firstLoadAfterOpenMin: null, firstLoadBasis: 'none', startMin: closeMin, endMin: closeMin, minutes: 0, occupancyMinutes: day, cycles: 0, loadBeforeCloseExtraCycle: false };
  return { lbPerCycle: 0, canopyMassPerUnit: canopyMassPerUnit(cropPlan, unitFactor), unitsPerCycleRaw: 0, sowingSize: 0, loadMinutes: 0, blackoutMinutes: 0, unloadMinutes: 0, occupancyMinutes: day, blackoutWindow, cyclesPerDay: 0, maxUnitsPerDay: 0 };
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
    sowingSize: grow.sowingTrays,
    loadMinutes: 0,
    blackoutMinutes: 0,
    unloadMinutes: 0,
    occupancyMinutes: blackoutWindow.occupancyMinutes,
    blackoutWindow,
    cyclesPerDay,
    maxUnitsPerDay: grow.sowingTrays * cyclesPerDay,
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
  cropPlan: CropPlan,
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
  cropPlan: CropPlan,
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
  cropPlan: CropPlan,
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
  cropPlan: CropPlan,
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
  cropPlan: CropPlan,
  a: typeof assumptions = assumptions,
  cap: CapacityInputs = defaultCapacityInputs,
  laborMinutesPerUnit?: number,
): CostToServe {
  const unit = costPerUnit(cropPlan, a, cap, laborMinutesPerUnit);
  const distribution = a.perUnit.distribution.value;
  return { ...unit, distribution, costToServe: unit.total + distribution };
}
