/**
 * MicroFarm — pure calculation engine.
 *
 * These are deterministic functions with no I/O. Every dollar and unit the
 * UI shows comes from here, not from typed constants. The invariants in
 * docs/farm/CLAUDE.md §2 are enforced in code:
 *   - sowing size is DERIVED from the binding constraint, never typed
 *   - labor is fixed-per-sowing + variable-per-unit, never a flat rate
 *   - production sows the whole trays its orders need, one flat the least
 */

import { costPlan } from '@/engine/grow-costing';
import { capacityInputs as defaultCapacityInputs, assumptions } from '@/data/plan-data';
import { seedLineHarvest, type GrowPlanDef } from '@/data/grow-plan';
import { VARIETY_BY_KEY } from '@/data/varieties';
import { GRAMS_PER_OZ } from '@/data/tray-formats';
import type { GrowLineCost } from '@/engine/grow-costing';
import { equipmentSeed } from '@/data/capex';
import { deriveGrowCapacity, growUnitsFrom, sowingsFor, type GrowCapacity, type GrowUnit } from '@/engine/grow-capacity';
type GrowPlan = GrowPlanDef;
/**
 * The facility's capacity inputs. `growUnits` is the Phase 1 equipment list's grow units with
 * their shelves and fixtures (`grow-capacity.ts`), read from the equipment library
 * (`resolveScenarioInputs`); absent, the code seed's Phase 1 list stands in.
 */
export type CapacityInputs = typeof defaultCapacityInputs & { growUnits?: readonly GrowUnit[] };

/** The Phase 1 grow units of the code seed — the fallback when no equipment library is in hand. */
export const defaultGrowUnits: readonly GrowUnit[] = growUnitsFrom(equipmentSeed);

/** Floor `n` down to the nearest `step` (e.g. sowing size to nearest 25). */
export function roundDownToNearest(n: number, step: number): number {
  return Math.floor(n / step) * step;
}

// ── The cost card per unit ──────────────────────────────────────────────────

/**
 * One line of the cost card at a channel's unit: what it costs per unit, and on a seed line the
 * weights it carries (seed issued, harvested, packed as harvested on a live tray). The medium,
 * nutrient and light lines carry cost and no mass.
 */
export interface CostedLine extends GrowLineCost {
  costPerUnit: number;
  seedOz: number;
  harvestedOz: number;
  packedOz: number;
}

export interface UnitCosting {
  lines: CostedLine[];
  /** Line costs and the consumables, per unit, before shrink. */
  inputCostPerUnit: number;
  shrinkPerUnit: number;
  totalInputCostPerUnit: number; // with shrink
  /** Weight chain for the whole unit, ounces. */
  seedOzPerUnit: number;
  harvestedOzPerUnit: number;
  packedOzPerUnit: number;
  /** Cost per packed ounce, the shrink allowance included. */
  costPerPackedOz: number;
}

const OZ_PER_LB = 16;

/**
 * A grow plan's cost card per unit (`grow-costing.ts`): one tray is the unit, scaled by the
 * channel's unit factor; the seed lines carry the weight chain (seed grams → harvest grams, packed
 * as harvested on a live tray), the other lines and the consumables carry cost and no mass; the
 * shrink allowance on top.
 */
export function costPlanPerUnit(
  plan: GrowPlanDef,
  shrinkAllowance: number = assumptions.yield.shrinkAllowance.value,
  unitFactor = 1,
): UnitCosting {
  const g = costPlan(plan);
  const lines: CostedLine[] = g.lines.map((l) => {
    const seed = l.line.kind === 'seed';
    const v = seed ? VARIETY_BY_KEY[(l.line as { varietyKey: string }).varietyKey] : undefined;
    const seedOz = seed ? (l.quantity / GRAMS_PER_OZ) * unitFactor : 0;
    const harvestedOz = l.line.kind === 'seed' && v ? (seedLineHarvest(l.line, plan.format).value / GRAMS_PER_OZ) * unitFactor : 0;
    return { ...l, costPerUnit: l.costPerTray * unitFactor, seedOz, harvestedOz, packedOz: harvestedOz };
  });
  const inputCostPerUnit = lines.reduce((t, l) => t + l.costPerUnit, 0) + g.perTray.consumables * unitFactor;
  const shrinkPerUnit = inputCostPerUnit * shrinkAllowance;
  const totalInputCostPerUnit = inputCostPerUnit + shrinkPerUnit;
  const seedOzPerUnit = lines.reduce((t, l) => t + l.seedOz, 0);
  const harvestedOzPerUnit = lines.reduce((t, l) => t + l.harvestedOz, 0);
  return {
    lines,
    inputCostPerUnit,
    shrinkPerUnit,
    totalInputCostPerUnit,
    seedOzPerUnit,
    harvestedOzPerUnit,
    packedOzPerUnit: harvestedOzPerUnit,
    costPerPackedOz: harvestedOzPerUnit > 0 ? totalInputCostPerUnit / harvestedOzPerUnit : 0,
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

/** Canopy mass per unit, pounds: the harvest weight of one tray at the unit factor. The sowing is sized off the grow unit, never off this. */
export function canopyMassPerUnit(plan: GrowPlanDef, unitFactor = 1): number {
  return costPlanPerUnit(plan, 0, unitFactor).harvestedOzPerUnit / OZ_PER_LB;
}

/** Packed unit weight, derived from the harvest weight: a live tray packs what it harvests. */
export interface PackedUnit {
  /** What the subscriber receives. */
  totalOz: number;
  /** Seed issued per unit — a procurement figure, not the packed weight. */
  seedOz: number;
}

export function packedUnitOz(plan: GrowPlanDef, unitFactor = 1): PackedUnit {
  const c = costPlanPerUnit(plan, 0, unitFactor);
  return { totalOz: c.packedOzPerUnit, seedOz: c.seedOzPerUnit };
}

export interface CapacityProfile {
  canopyMassPerUnit: number;
  unitsPerCycleRaw: number;
  /** DERIVED: the most trays one grow unit takes of the plan's format in a sowing; zero on a plan that is not a grow plan. */
  sowingSize: number;
  /** DERIVED: the grow units that take the plan — each can start one sowing a day. */
  cyclesPerDay: number;
  /** DERIVED: sowing size × the sowings a day. The sustained ceiling over the cycle is on `grow`. */
  maxUnitsPerDay: number;
  /** Set on a grow plan: the sowing in trays, the units that take it, the cycle and the sustained ceiling. */
  grow?: GrowCapacity;
}

export function deriveCapacity(
  growPlan: GrowPlan,
  cap: CapacityInputs = defaultCapacityInputs,
  unitFactor = 1,
): CapacityProfile {
  return deriveGrowProfile(growPlan, cap, unitFactor);
}

/**
 * A grow plan's capacity in the grow plan profile's shape (outline §5 rule 1): the most one grow
 * unit takes of the plan's format in a sowing (`grow-capacity.ts`), never off mass; a sowing itself
 * is the trays its orders need. Each grow
 * unit that takes the plan can start one sowing a day, so the sowings a day are the units. The
 * sustained ceiling, trays across the units over the cycle, is on `grow`; the horizon's shelf
 * ledger holds each sowing for its cycle.
 */
function deriveGrowProfile(growPlan: GrowPlan, cap: CapacityInputs, unitFactor: number): CapacityProfile {
  const grow = deriveGrowCapacity(growPlan, cap.growUnits ?? defaultGrowUnits);
  return {
    canopyMassPerUnit: canopyMassPerUnit(growPlan, unitFactor),
    unitsPerCycleRaw: grow.sowingTrays,
    sowingSize: grow.sowingTrays,
    cyclesPerDay: grow.unitCount,
    maxUnitsPerDay: grow.sowingTrays * grow.unitCount,
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
  /** Sowings of the whole trays the shortfall needs, split only past what one unit takes. */
  sowingsToRun: number;
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
  // The whole trays the shortfall needs, split only past what one unit takes.
  const sowings = sowingsFor(shortfall, input.sowingSize);
  const sowingsToRun = sowings.length;
  const unitsProduced = sowings.reduce((t, n) => t + n, 0);
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

// What a plan buys lives with the grow lines (`grow-purchase.ts`).
export { buildPurchaseOrder, purchaseOrderForRun, purchaseLines, type PurchaseOrder, type PurchaseOrderLine, type PurchaseLine } from '@/engine/grow-purchase';

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
 * Direct labor is the grow plan's time study at its derived sowing size: the fixed
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
  growPlan: GrowPlan,
  a: typeof assumptions = assumptions,
  cap: CapacityInputs = defaultCapacityInputs,
  laborMinutesPerUnit?: number,
): CostPerUnit {
  const food = costPlanPerUnit(growPlan, a.yield.shrinkAllowance.value).totalInputCostPerUnit;
  const sowingSize = deriveCapacity(growPlan, cap).sowingSize;
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
  /** The derived sowing, trays: what one grow unit takes. */
  sowingUnits: number;
  seedLb: number;
  harvestedLb: number;
  packedLb: number;
  /** The sowing's lines and consumables at their prices, before shrink. */
  sowingInputCost: number;
  shrinkAllowance: number;
  sowingInputCostWithShrink: number;
  unitInputCost: number;
}

export function sowingCosting(
  plan: GrowPlanDef,
  cap: CapacityInputs = defaultCapacityInputs,
  shrinkAllowance: number = assumptions.yield.shrinkAllowance.value,
  unitFactor = 1,
): SowingCosting {
  const c = costPlanPerUnit(plan, shrinkAllowance, unitFactor);
  const sowing = deriveCapacity(plan, cap, unitFactor).sowingSize;
  const lb = (ozPerUnit: number) => (ozPerUnit * sowing) / OZ_PER_LB;
  const sowingInputCost = c.inputCostPerUnit * sowing;
  return {
    sowingUnits: sowing,
    seedLb: lb(c.seedOzPerUnit),
    harvestedLb: lb(c.harvestedOzPerUnit),
    packedLb: lb(c.packedOzPerUnit),
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
  growPlan: GrowPlan,
  a: typeof assumptions = assumptions,
  cap: CapacityInputs = defaultCapacityInputs,
  laborMinutesPerUnit?: number,
): CostToServe {
  const unit = costPerUnit(growPlan, a, cap, laborMinutesPerUnit);
  const distribution = a.perUnit.distribution.value;
  return { ...unit, distribution, costToServe: unit.total + distribution };
}
