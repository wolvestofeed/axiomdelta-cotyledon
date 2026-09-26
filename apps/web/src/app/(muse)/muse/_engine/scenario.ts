/**
 * Impact OS — scenario overlay + resolver.
 *
 * A scenario is `plan-data defaults + a thin overlay of edited values`
 * (`MuseScenarioConfig`) — the same base-plus-overlay pattern CompTable uses for
 * rosters. Only the overlay is saved (as JSONB in `muse.scenarios.config`);
 * every derived dollar is recomputed by the engine from the RESOLVED inputs this
 * module produces. Nothing derived is persisted (docs/muse/CLAUDE.md §2 rule 4).
 *
 * `resolveScenarioInputs(config)` merges the overlay onto the defaults and hands
 * back inputs structurally identical to the plan-data exports, so the engine can
 * consume them unchanged as we thread the store through the pages (M3). It also
 * recomputes the two figures that DERIVE from edited leaves:
 *   - blendedLoadedWage  = avg(cookWage, leadWage) × (1 + payrollBurden)
 *   - cookedYieldPerBatch  = apQtyPerBatch × yieldToCooked   (per ingredient)
 *
 * Provenance/badging ("your input" vs SOURCED/PLACEHOLDER) is a UI concern; the
 * store tracks which leaves are edited. This resolver only moves numbers.
 */

import {
  assumptions as defaultAssumptions,
  capacityInputs as defaultCapacityInputs,
  recipe as defaultRecipe,
  recipes as seedRecipes,
  type RecipeDef,
  phases as defaultPhases,
  phaseProfiles as defaultPhaseProfiles,
} from '../_data/plan-data';
import {
  equipmentSeed,
  type EquipmentLine,
} from '../_data/capex';
import { seedPackagingLibrary, type PackagingLibrary } from '../_data/packaging';
import { crews as defaultCrews, newCrew, legacyCrew, LEGACY_SEED_CREWS, type CrewShift } from '../_data/crews';
import { productionDaysInYear, PLAN_YEAR, type DateRange } from './periods';
import { deriveCapacity, type CapacityInputs } from './index';
import { assumptionsForRecipe, recipeCostInputs, type RecipeCostInputs, type RecipeLaborStandard } from './meal-cost';
import type { TimeStudyDoc } from '../_data/time-studies';
import { batchVesselsFrom } from './equipment';
import { laborRequirement, ratedDaySlots, newCrewDefaultsFor } from './staffing';
import { seedCustomers, type CustomerDef } from '../_data/customers';
import { resolveIngredientPrice, type ResolvedIngredientPrice } from './ingredient-price';
import { equipmentPurchase as defaultEquipmentPurchase, codeSeedLoans, seedFixedCostLines, type FixedCostLineDef, type LoanDef } from '../_data/finance';
import { leaseholdSeed, type LeaseholdLine } from '../_data/capex';
import type { CatalogLine } from './catalog';
import { channelDemand, forecastHorizonOf, forecastStartOf, type ChannelDemand, type CustomerSiteOverlay, type ForecastHorizonYears, type ForecastOverlay } from './demand';
import { datedEquipment, type DatedEquipmentLine } from './equipment';
import { openingPosition as defaultOpeningPosition, type PaymentTerms } from '../_data/working-capital';
import { DEFAULT_PAY_CALENDAR, type PayCalendar } from './payroll';
import { routeResources, type ResourceOverlay, type RouteResource, type RouteStepOverlay } from './routing';
import { schedulePolicy as defaultSchedulePolicy, type CrewMode, type DispatchDirection, type PriorityRule, type SchedulePolicy } from '../_data/schedule-policy';

export type { CustomerSiteOverlay, ForecastOverlay, ResourceOverlay, RouteStepOverlay };

// ── The overlay shape (what a saved scenario stores) ────────────────────────

/** Editable global assumptions. */
export interface AssumptionsOverlay {
  labor?: Partial<{
    cookWage: number;
    leadWage: number;
    payrollBurden: number;
  }>;
  /**
   * `packaging` was a typed per-meal placeholder; it is no longer read (Robert,
   * 2026-09-16) — a recipe's packaging is its picks at the library's cost. A value
   * saved on an older forecast is ignored.
   */
  perMeal?: Partial<{ packaging: number; delivery: number }>;
  yield?: Partial<{ shrinkAllowance: number }>;
  inventory?: Partial<{ chilledHoldLife: number; daysOfCoverTarget: number }>;
  laborSplit?: Partial<{
    fixedMinutesPerBatch: number;
    variableMinutesPerPortion: number;
  }>;
}

/**
 * Editable per-ingredient fields, keyed by `<recipe code>::<ingredient name>`.
 * A bare ingredient name (scenarios saved before the library existed) applies
 * to the seed recipe.
 */
export const SEED_RECIPE_CODE = 'AMK-E-001';
export const ingredientKey = (recipeCode: string, name: string) => `${recipeCode}::${name}`;

/**
 * The assumptions to cost a given recipe at: its own labor standard and
 * packaging (Roadmap N3). Falls back to the reference recipe's for a code the
 * resolver was not given, rather than to a typed figure.
 */
export function assumptionsFor(inputs: Pick<ResolvedInputs, 'assumptions' | 'recipeAssumptions'>, recipeCode: string): ResolvedInputs['assumptions'] {
  return inputs.recipeAssumptions[recipeCode] ?? inputs.assumptions;
}
export interface IngredientOverlay {
  apUnitCost?: number;
  apQtyPerBatch?: number;
  yieldToCooked?: number;
  packSize?: number;
}

/** Editable per-phase market fields (keyed by phase number). */
export interface PhaseOverlay {
  pricePerMeal?: number;
  /** @deprecated Demand is derived from customer sites since 2026-09-13; ignored. */
  mealsPerDay?: number;
  /** @deprecated Demand is derived from customer sites since 2026-09-13; ignored. */
  operatingDays?: number;
  /** @deprecated Roadmap N6 slice 3: the channel allocation is retired; ignored. */
  allocationShare?: number;
}

/** Editable per-phase portion/premium knobs (keyed by phase number). */
export interface PhaseProfileOverlay {
  portionFactor?: number;
  premiumFactor?: number;
}

export interface CapacityOverlay {
  /** @deprecated Retired 2026-09-17: a batch binds to one cabinet and a second cabinet is a parallel stream, so no unit count multiplies capacity (Robert). Ignored. */
  blastChillerUnits?: number;
  capacityPerUnitLb?: number;
  /** Chiller occupancy elements — the engine sums them; only `chillMinutes` faces the cooling clock. */
  loadMinutes?: number;
  chillMinutes?: number;
  unloadMinutes?: number;
  /** @deprecated Retired 2026-09-15: the chiller is not sanitized between batches, and defrosting is maintenance (Robert). Ignored. */
  sanitizeMinutes?: number;
  /** The operating day the plant runs, minutes from midnight. */
  operatingOpenMin?: number;
  operatingCloseMin?: number;
  /** @deprecated Retired 2026-09-14: the first load is read from each recipe's cook times. Ignored. */
  firstLoadAfterOpenMin?: number;
  /** Headcount each chiller task needs at once — sizes the labor requirement, never the ceiling. */
  loadStaff?: number;
  unloadStaff?: number;
  /** @deprecated Retired 2026-09-15 with `sanitizeMinutes`. Ignored. */
  sanitizeStaff?: number;
  /** Typed production days per year; absent = counted from the production calendar. */
  productionDaysPerYear?: number;
  /** @deprecated Saved before 2026-09-14 as a clock time. Ignored except as the start of a legacy typed chill window. */
  firstLoadMin?: number;
  /** @deprecated Saved before 2026-09-14; a window from the first load, resolved onto `operatingCloseMin`. */
  chillWindowOverrideHours?: number;
  /** @deprecated Saved before 2026-09-13; resolves onto `chillMinutes` when that key is absent. */
  cycleTimeMinutes?: number;
  /** @deprecated Saved before 2026-09-13; resolves like `chillWindowOverrideHours`. */
  chillWindowHours?: number;
}

/**
 * Editable crew fields (keyed by crew id). An id not in the seed register is a
 * crew ADDED in this scenario; `removed` takes a seeded crew out of it. Both
 * exist because "what if there were two morning crews" is a question the
 * platform has to be able to ask.
 */
export interface CrewOverlay {
  label?: string;
  startMin?: number;
  endMin?: number;
  headcount?: number;
  removed?: boolean;
}

/** Annual fuel and electricity activity. Zero until a bill is entered. */
export interface EnergyActivity {
  naturalGasTherms: number;
  propaneGal: number;
  fleetGasolineGal: number;
  fleetDieselGal: number;
  electricityKwh: number;
  /** Share of kWh under bundled renewable supply or certificates, 0–1. */
  renewableShare: number;
}

/** Monthly water and wastewater activity plus the latest sample. Zero until entered. */
export interface WaterActivity {
  meteredGalPerMonth: number;
  billedWastewaterMGalPerMonth: number;
  bodMgL: number;
  tssMgL: number;
  codMgL: number;
  fogMgL: number;
  /** ISO date of the last grease-trap pump-out; empty until entered. */
  greaseTrapLastPumpOut: string;
  /** Grease and solids as a fraction of the trap's wetted height, 0–1. */
  greaseTrapFill: number;
}

export type EquipmentFuel = 'electric' | 'natural_gas' | 'propane' | 'none';

/** Energy and refrigerant attributes per equipment line (keyed by the equipment library row's `key`). */
export interface EquipmentAttrs {
  fuel?: EquipmentFuel;
  ratedKw?: number;
  refrigerant?: string;
  /** Factory charge per unit, lb. A line with refrigerant and charge on file is a circuit. */
  chargeLbPerUnit?: number;
  installedOn?: string;
  energyStar?: boolean;
}

export interface ServiceAdd {
  date: string;
  lbAdded: number;
}

/**
 * Editable sustainability choices and activity inputs. `ingredientBasis` maps
 * ingredient name → LCA option id. Activity sections are partial overlays on
 * zero defaults; a typed value is the operator's own input.
 */
/** Inventory settings: baseline year, reporting year, materiality, and the recorded baseline. */
export interface AuditSettings {
  baselineYear: number | null;
  reportingYear: number;
  /** Restatement materiality threshold as a fraction (band 3–5%). */
  materialityThreshold: number;
  /** Recorded baseline total, kg CO2e, and the factor fingerprint it was computed with. */
  baselineTotalKg: number | null;
  baselineFingerprint: string | null;
  baselineRecordedOn: string | null;
}

export interface WasteSettings {
  /** Share of food waste composted, 0–1; the rest is landfilled. */
  compostShare: number;
}

export interface SustainabilityOverlay {
  ingredientBasis?: Record<string, string>;
  /**
   * Activity-input key -> registered source id: the document a typed figure came
   * from (utility invoice, lab report, service ticket, spec sheet). Keys are the
   * stable strings in `docKey` (`_engine/entity-links.ts`), so a saved forecast
   * keeps its evidence trail. This is the persistent activity ledger in
   * miniature — a row and the document behind it.
   */
  documents?: Record<string, string>;
  audit?: Partial<AuditSettings>;
  waste?: Partial<WasteSettings>;
  /** Ingredient name → compiled-directory supplier id the line is sourced from. */
  ingredientSupplier?: Record<string, string>;
  energy?: Partial<EnergyActivity>;
  water?: Partial<WaterActivity>;
  equipment?: Record<string, EquipmentAttrs>;
}

export const ENERGY_DEFAULTS: EnergyActivity = {
  naturalGasTherms: 0,
  propaneGal: 0,
  fleetGasolineGal: 0,
  fleetDieselGal: 0,
  electricityKwh: 0,
  renewableShare: 0,
};

export const AUDIT_DEFAULTS: AuditSettings = {
  baselineYear: null,
  reportingYear: new Date().getFullYear(),
  materialityThreshold: 0.05,
  baselineTotalKg: null,
  baselineFingerprint: null,
  baselineRecordedOn: null,
};

export const WASTE_DEFAULTS: WasteSettings = { compostShare: 0 };

export const WATER_DEFAULTS: WaterActivity = {
  meteredGalPerMonth: 0,
  billedWastewaterMGalPerMonth: 0,
  bodMgL: 0,
  tssMgL: 0,
  codMgL: 0,
  fogMgL: 0,
  greaseTrapLastPumpOut: '',
  greaseTrapFill: 0,
};

/**
 * Editable per-site fields, keyed by the delivery-site id. `schoolId` makes the
 * site a record in the compiled school directory rather than a name with a
 * county: the site is then placed at the school's own geocode, so outbound
 * logistics stops running on a county centroid.
 */
export interface SiteOverlay {
  schoolId?: string;
  dailyForecastPortions?: number;
}

/**
 * Per-prospect links from the Sales workspace, keyed by school prospect id. The
 * site is where the prospect would be served from; the recipes are what was
 * quoted, which is what makes the quote's food cost computable.
 */
export interface SalesOverlay {
  siteId?: string;
  recipeCodes?: string[];
}

export interface CapexOverlay {
  /**
   * Used-equipment purchase factor. The loan terms that used to sit beside it
   * moved to the loan rows themselves (Roadmap N1); a scenario saved before
   * that still carries them here and they are mapped onto the seeded loans.
   */
  financeParams?: Partial<{
    usedDiscount: number;
    /** @deprecated Legacy: mapped onto the equipment loan. */
    equipmentApr: number;
    /** @deprecated Legacy: mapped onto the equipment loan. */
    equipmentTermMonths: number;
    /** @deprecated Legacy: mapped onto the leasehold loan. */
    leaseholdApr: number;
    /** @deprecated Legacy: mapped onto the leasehold loan. */
    leaseholdTermMonths: number;
  }>;
  /** @deprecated Legacy: mapped onto the seeded fixed-cost lines by category. */
  monthlyFixedCosts?: Partial<{ lease: number; utilities: number; admin: number }>;
  /** Per-loan edits, keyed by the loan's stable key (Roadmap N1). */
  loans?: Record<string, Partial<{ principalCents: number; apr: number; termMonths: number; startDate: string; status: 'planned' | 'funded' }>>;
  /** Per-line edits, keyed by the fixed-cost line's stable key (Roadmap N1). */
  fixedCostLines?: Record<string, Partial<{ monthlyAmountCents: number; status: 'planned' | 'in_force'; startDate: string | null; endDate: string | null }>>;
  /** Per-line leasehold edits, keyed by the line's stable key (Roadmap N1). */
  leasehold?: Record<string, Partial<{ extended: number; counted: boolean }>>;
  /** Opening owners' equity, dollars (Roadmap K6). */
  openingOwnerEquity?: number;
  /** ISO date the equipment and leasehold loans start (Roadmap K4). */
  loanStartDate?: string;
}

/** Editable schedule policy (scheduler build plan §0, §3.5). */
export interface SchedulePolicyOverlay {
  deliveryTimeMin?: number;
  closedownStaff?: number;
  closedownMinutes?: number;
  allowUnattendedChill?: boolean;
  priorityRule?: PriorityRule;
  crewMode?: CrewMode;
  dispatchDirection?: DispatchDirection;
}

/**
 * The full scenario overlay. Every field is optional; an absent field means
 * "use the plan-data default". This is the object saved to
 * `muse.scenarios.config` and held as the live draft in the client store.
 */
export interface MuseScenarioConfig {
  assumptions?: AssumptionsOverlay;
  capacity?: CapacityOverlay;
  /** Keyed by `<recipe code>::<ingredient name>` (a bare name = the seed recipe). */
  ingredients?: Record<string, IngredientOverlay>;
  /** Keyed by phase number. */
  phases?: Record<number, PhaseOverlay>;
  /** Keyed by phase number. */
  phaseProfiles?: Record<number, PhaseProfileOverlay>;
  /** Keyed by crew id. */
  crews?: Record<string, CrewOverlay>;
  capex?: CapexOverlay;
  sustainability?: SustainabilityOverlay;
  /** Keyed by delivery-site id. */
  sites?: Record<string, SiteOverlay>;
  /** Keyed by school prospect id. */
  sales?: Record<string, SalesOverlay>;
  /** @deprecated Roadmap N4a: replaced by `forecast`. Ignored on read. */
  customerSites?: Record<string, CustomerSiteOverlay>;
  /** What the forecast is built from beyond the master list: included customers, service edits, meal plans, equipment dates (Roadmap N4a). */
  forecast?: ForecastOverlay;
  /** Route step edits, keyed by `<recipe code>::<step id>` (`routeKey`). */
  routing?: Record<string, RouteStepOverlay>;
  /** Resource attribute edits, keyed by equipment library key. */
  resources?: Record<string, ResourceOverlay>;
  schedulePolicy?: SchedulePolicyOverlay;
}

/** The top-level sections, for dirty-tracking and per-section reset/save. */
export type ScenarioSection = keyof MuseScenarioConfig;
export const SCENARIO_SECTIONS: ScenarioSection[] = [
  'assumptions',
  'capacity',
  'ingredients',
  'phases',
  'phaseProfiles',
  'crews',
  'capex',
  'sustainability',
  'sites',
  'sales',
  'customerSites',
  'forecast',
  'routing',
  'resources',
  'schedulePolicy',
];

// ── Resolved inputs (defaults + overlay), engine-shaped ─────────────────────

export interface ResolvedInputs {
  assumptions: typeof defaultAssumptions;
  /** The plant's capacity inputs, with the Phase 1 vessels read from the equipment library. */
  capacityInputs: CapacityInputs;
  /**
   * The reference recipe — the first In Service recipe in the library — with
   * the scenario's ingredient edits applied. Single-recipe surfaces (the
   * planning loop, the ledger, capacity) read it until orders carry a recipe
   * each (Roadmap Phase H3/H4).
   */
  recipe: RecipeDef;
  /** Every library recipe with the scenario's ingredient edits applied. */
  recipes: RecipeDef[];
  phases: typeof defaultPhases;
  phaseProfiles: typeof defaultPhaseProfiles;
  /** Proposed crews: checked against the labor requirement, never an input to capacity. */
  crews: CrewShift[];
  /** The used-equipment purchase factor. */
  equipmentPurchase: typeof defaultEquipmentPurchase;
  /** The loans the plan carries (Roadmap N1). */
  loans: LoanDef[];
  /** The monthly fixed costs the plan carries (Roadmap N1). */
  fixedCostLines: FixedCostLineDef[];
  /** The leasehold schedule (Roadmap N1). A line that is not `counted` is on record only. */
  leasehold: LeaseholdLine[];
  /** Each recipe's own labor standard — observed, estimated, or a gap (Roadmap N3). */
  laborStandards: Record<string, RecipeLaborStandard>;
  /** Each recipe's labor standard and packaging, as the cost of its meal reads them (Roadmap N3). */
  recipeCosts: Record<string, RecipeCostInputs>;
  /**
   * The assumptions each recipe is costed at: the shared ones with that recipe's
   * labor standard and packaging written in. Read through `assumptionsFor`.
   * `assumptions` above is the REFERENCE recipe's, so `recipe` and `assumptions`
   * always describe the same recipe.
   */
  recipeAssumptions: Record<string, typeof defaultAssumptions>;
  /** The equipment library: every row with its real-world status (Roadmap N1). */
  equipment: EquipmentLine[];
  /** The packaging library, supplier catalog prices and recipe picks (Roadmap N1). */
  packaging: PackagingLibrary;
  /** Opening owners' equity (dollars) and the date the loans start (Roadmap K4, K6). */
  openingPosition: { ownerEquity: number; loanStartDate: string };
  /** Payment terms on file per supplier id (Roadmap K3). A supplier with none is absent. */
  supplierTerms: Record<string, PaymentTerms>;
  /**
   * What each ingredient costs and where the figure came from, keyed by
   * `ingredientKey(recipeCode, name)` (Roadmap N1, decision 7). Every line has
   * an entry — a line still on its recipe figure carries the reason why.
   */
  ingredientPrices: Record<string, ResolvedIngredientPrice>;
  /** The biweekly pay calendar (Roadmap K5). */
  payCalendar: PayCalendar;
  /** Kitchen closures from the production calendar (Roadmap J1). */
  closures: DateRange[];
  /** Delivery-site links and overrides, keyed by site id. */
  sites: Record<string, SiteOverlay>;
  /** Prospect links, keyed by school prospect id. */
  sales: Record<string, SalesOverlay>;
  /** The customer library (facts of record), before what-if edits. */
  customers: CustomerDef[];
  /** Demand from sites and services with the forecast's edits applied, over the forecast's first year. */
  demand: ChannelDemand;
  /** The forecast's own edits (Roadmap N4a), defaults filled where a reader needs them. */
  forecast: ForecastOverlay & { startDate: string; horizonYears: ForecastHorizonYears };
  /** Each equipment line with the date it counts from in this forecast (decision 20). */
  datedEquipment: DatedEquipmentLine[];
  /** The Phase 1 units as scheduling resources, each attribute tagged. */
  resources: RouteResource[];
  /** Route step edits, keyed by `<recipe code>::<step id>`; routes derive from studies with `deriveRoute`. */
  routing: Record<string, RouteStepOverlay>;
  schedulePolicy: SchedulePolicy;
  /** Sustainability selections and activity inputs, defaults filled. */
  sustainability: {
    ingredientBasis: Record<string, string>;
    ingredientSupplier: Record<string, string>;
    /** Activity-input key -> source id. */
    documents: Record<string, string>;
    audit: AuditSettings;
    waste: WasteSettings;
    energy: EnergyActivity;
    water: WaterActivity;
    equipment: Record<string, EquipmentAttrs>;
  };
}

/** Overwrite `.value` on a cloned Tagged leaf when the overlay supplies one. */
function put<T>(target: { value: T }, override: T | undefined): void {
  if (override !== undefined) target.value = override;
}

/**
 * Merge an overlay onto the plan-data defaults and return engine-shaped inputs.
 * The clones are widened by `structuredClone`; the `as` casts restore the
 * plan-data types so the engine consumes the result unchanged. Status tags are
 * left intact — the resolver only moves numbers.
 */
export function resolveScenarioInputs(
  config: MuseScenarioConfig = {},
  /** The recipe library. Omitted = the seed list (tests, engine defaults). */
  library: readonly RecipeDef[] = seedRecipes,
  /** The customer library. Omitted = the seed placeholders built from the channel constants. */
  customers: readonly CustomerDef[] = seedCustomers(),
  /** Kitchen closures from the production calendar (Roadmap J1). Omitted = none entered. */
  closures: readonly DateRange[] = [],
  /** Payment terms on file per supplier id (Roadmap K3). Omitted = none on file. */
  supplierTerms: Readonly<Record<string, PaymentTerms>> = {},
  /** The equipment library (Roadmap N1). Omitted or empty = the seed. */
  equipment: readonly EquipmentLine[] = equipmentSeed,
  /** The packaging library, catalog prices and recipe picks (Roadmap N1). Omitted = the seed packages, no picks. */
  packaging: PackagingLibrary = seedPackagingLibrary(),
  /** Supplier catalog lines keyed by supplier id (Roadmap N1). Omitted = no catalog on file. */
  catalog: Readonly<Record<string, readonly CatalogLine[]>> = {},
  /** The date prices are read for. Omitted = today. */
  pricesAsOf: string = new Date().toISOString().slice(0, 10),
  /** The loans the plan carries (Roadmap N1). Omitted = the seed. */
  loans: readonly LoanDef[] = codeSeedLoans(),
  /** The monthly fixed-cost lines (Roadmap N1). Omitted = the seed. */
  fixedCostLines: readonly FixedCostLineDef[] = seedFixedCostLines(),
  /** The leasehold schedule (Roadmap N1). Omitted = the seed. */
  leasehold: readonly LeaseholdLine[] = leaseholdSeed,
  /**
   * The time-study library (Roadmap N3). Omitted = not loaded, and each recipe's
   * labor comes from its estimate built in code — the same estimate the database
   * is seeded with. A loaded library with no study for a recipe is a labor gap.
   */
  timeStudies: readonly TimeStudyDoc[] | null = null,
): ResolvedInputs {
  // Assumptions ------------------------------------------------------------
  const assumptions = structuredClone(defaultAssumptions) as unknown as {
    labor: {
      cookWage: { value: number };
      leadWage: { value: number };
      payrollBurden: { value: number };
      blendedLoadedWage: { value: number };
    };
    perMeal: {
      packaging: { value: number };
      delivery: { value: number };
    };
    yield: { shrinkAllowance: { value: number } };
    inventory: {
      chilledHoldLife: { value: number };
      daysOfCoverTarget: { value: number };
    };
    laborSplit: {
      fixedMinutesPerBatch: { value: number };
      variableMinutesPerPortion: { value: number };
    };
  };

  const a = config.assumptions ?? {};
  put(assumptions.labor.cookWage, a.labor?.cookWage);
  put(assumptions.labor.leadWage, a.labor?.leadWage);
  put(assumptions.labor.payrollBurden, a.labor?.payrollBurden);
  // Derived: blended loaded wage recomputes from the two wages + burden.
  assumptions.labor.blendedLoadedWage.value =
    ((assumptions.labor.cookWage.value + assumptions.labor.leadWage.value) / 2) *
    (1 + assumptions.labor.payrollBurden.value);

  // Packaging is never typed on a scenario (Robert, 2026-09-16): each recipe's is
  // the sum of its picked packages at the library's cost, written in below.
  put(assumptions.perMeal.delivery, a.perMeal?.delivery);
  put(assumptions.yield.shrinkAllowance, a.yield?.shrinkAllowance);
  put(assumptions.inventory.chilledHoldLife, a.inventory?.chilledHoldLife);
  put(assumptions.inventory.daysOfCoverTarget, a.inventory?.daysOfCoverTarget);
  // Labor minutes are never typed (Roadmap N3): each recipe's come from its own
  // labor standard, written in below. A `laborSplit` saved on an older forecast
  // is ignored, as a legacy phase `mealsPerDay` is — the time study is the source.

  // Capacity: the plant ---------------------------------------------------
  const capacityInputs = structuredClone(defaultCapacityInputs) as unknown as {
    capacityPerUnitLb: { value: number };
    loadMinutes: { value: number };
    chillMinutes: { value: number };
    unloadMinutes: { value: number };
    operatingOpenMin: { value: number };
    operatingCloseMin: { value: number };
    loadStaff: { value: number };
    unloadStaff: { value: number };
    productionDaysPerYear: { value: number };
    batchRoundingPortions: number;
  };
  const c = config.capacity ?? {};
  // `c.blastChillerUnits` on an older forecast is ignored: one cabinet is the batch.
  put(capacityInputs.capacityPerUnitLb, c.capacityPerUnitLb);
  put(capacityInputs.loadMinutes, c.loadMinutes);
  // Legacy keys from scenarios saved before the occupancy decomposition.
  put(capacityInputs.chillMinutes, c.chillMinutes ?? c.cycleTimeMinutes);
  put(capacityInputs.unloadMinutes, c.unloadMinutes);
  put(capacityInputs.operatingOpenMin, c.operatingOpenMin);
  // Legacy: a chill window typed in hours ran from a clock-time first load
  // (12:00 unless the scenario typed one); its end becomes the close.
  const legacyWindowHours = c.chillWindowOverrideHours ?? c.chillWindowHours;
  put(
    capacityInputs.operatingCloseMin,
    c.operatingCloseMin ??
      (legacyWindowHours !== undefined && legacyWindowHours !== null
        ? (c.firstLoadMin ?? 720) + legacyWindowHours * 60
        : undefined),
  );
  put(capacityInputs.loadStaff, c.loadStaff);
  put(capacityInputs.unloadStaff, c.unloadStaff);
  // Production days come off the production calendar unless a scenario types them.
  capacityInputs.productionDaysPerYear.value = c.productionDaysPerYear ?? productionDaysInYear(PLAN_YEAR, closures);

  // Recipes (per-ingredient, per recipe) ------------------------------------
  //
  // The price of a line has three possible sources, in this order: a what-if
  // the operator typed on this scenario, the supplier catalog (decision 7), and
  // the recipe line's own figure, which stands only until a catalog price is on
  // file. Whichever wins, the line's status tag says so and
  // `ingredientPrices` carries the reason the catalog did not price it.
  const ingOverlay = config.ingredients ?? {};
  const ingredientSupplier = config.sustainability?.ingredientSupplier ?? {};
  const ingredientPrices: Record<string, ResolvedIngredientPrice> = {};
  const source = library.length > 0 ? library : seedRecipes;
  const recipes: RecipeDef[] = source.map((r) => {
    const rec = structuredClone(r) as RecipeDef;
    for (const ing of rec.ingredients) {
      const supplierId = ingredientSupplier[ing.name] ?? null;
      const priced = resolveIngredientPrice({
        ingredient: ing.name,
        unit: ing.unit,
        recipeUnitCost: ing.apUnitCost,
        supplierId,
        catalog: (supplierId ? catalog[supplierId] : undefined) ?? [],
        asOf: pricesAsOf,
      });
      ingredientPrices[ingredientKey(rec.code, ing.name)] = priced;
      if (priced.basis === 'catalog') {
        ing.apUnitCost = priced.unitPrice;
        ing.status = 'SOURCED';
        ing.source = `Supplier catalog: ${priced.item}, in force from ${priced.effectiveFrom}.`;
      }
      const o =
        ingOverlay[ingredientKey(rec.code, ing.name)] ??
        (rec.code === SEED_RECIPE_CODE ? ingOverlay[ing.name] : undefined);
      if (!o) continue;
      if (o.apUnitCost !== undefined) {
        ing.apUnitCost = o.apUnitCost;
        // A typed what-if outranks the catalog, and stops claiming its source.
        if (priced.basis === 'catalog') {
          ing.status = 'STATED';
          ing.source = `Typed on this scenario, over the catalog price of ${priced.unitPrice} from ${priced.effectiveFrom}.`;
        }
        ingredientPrices[ingredientKey(rec.code, ing.name)] = {
          ...priced,
          unitPrice: o.apUnitCost,
          basis: 'recipe',
          gap: priced.basis === 'catalog' ? 'A price typed on this scenario stands over the catalog.' : priced.gap,
        };
      }
      if (o.apQtyPerBatch !== undefined) ing.apQtyPerBatch = o.apQtyPerBatch;
      if (o.yieldToCooked !== undefined) ing.yieldToCooked = o.yieldToCooked;
      if (o.packSize !== undefined) ing.packSize = o.packSize;
      // Derived: cooked yield recomputes when AP qty or yield factor changes.
      ing.cookedYieldPerBatch = ing.apQtyPerBatch * ing.yieldToCooked;
    }
    return rec;
  });
  const recipe = recipes.find((r) => r.status === 'in_service') ?? recipes[0] ?? (structuredClone(defaultRecipe) as RecipeDef);

  // Crews: a proposed staffing answer ---------------------------------------
  // No crew is seeded. A scenario that edits one of the retired invented seed
  // crews (`shift-1`, `shift-2`) gets that whole pattern back, as PLACEHOLDER,
  // so it still shows what its author saw.
  const crewOverlay = config.crews ?? {};
  const crews: CrewShift[] = [];
  const typedCapacity = capacityInputs as unknown as ResolvedInputs['capacityInputs'];
  const addDefaults = newCrewDefaultsFor(laborRequirement(ratedDaySlots(deriveCapacity(recipe, typedCapacity)), typedCapacity));
  for (const seed of defaultCrews) {
    const o = crewOverlay[seed.id];
    if (o?.removed) continue;
    const crew = structuredClone(seed);
    if (o) {
      if (o.label !== undefined) crew.label = o.label;
      put(crew.startMin, o.startMin);
      put(crew.endMin, o.endMin);
      put(crew.headcount, o.headcount);
    }
    crews.push(crew);
  }
  const legacyIds = Object.keys(LEGACY_SEED_CREWS);
  if (Object.keys(crewOverlay).some((id) => legacyIds.includes(id))) {
    for (const id of legacyIds) {
      const o = crewOverlay[id] ?? {};
      if (!o.removed) crews.push(legacyCrew(id, o));
    }
  }
  for (const [id, o] of Object.entries(crewOverlay)) {
    if (o.removed || legacyIds.includes(id) || defaultCrews.some((seed) => seed.id === id)) continue;
    crews.push(newCrew(id, o, addDefaults));
  }

  // Phases -----------------------------------------------------------------
  const phases = structuredClone(defaultPhases) as unknown as Array<{
    phase: number;
    pricePerMeal: number;
    mealsPerDay: number;
    operatingDays: number;
  }> &
    Record<number, unknown>;
  const phaseOverlay = config.phases ?? {};
  // Demand is DERIVED from customers and sites; the channel rows carry the
  // sum so every consumer of mealsPerDay × operatingDays reads it unchanged.
  const customerList = customers.length > 0 ? customers : seedCustomers();
  const forecast = { ...structuredClone(config.forecast ?? {}), startDate: forecastStartOf(config.forecast), horizonYears: forecastHorizonOf(config.forecast) };
  const demand = channelDemand(customerList, forecast, phases.map((p) => p.phase), { closures });
  for (const p of phases) {
    const d = demand.byChannel[p.phase];
    if (d) {
      p.mealsPerDay = d.mealsPerDay;
      p.operatingDays = d.operatingDays;
    }
    const o = phaseOverlay[p.phase];
    if (!o) continue;
    if (o.pricePerMeal !== undefined) p.pricePerMeal = o.pricePerMeal;
    }

  // Phase profiles ---------------------------------------------------------
  const phaseProfiles = structuredClone(
    defaultPhaseProfiles,
  ) as unknown as Array<{
    phase: number;
    portionFactor: { value: number };
    premiumFactor: { value: number };
  }>;
  const profileOverlay = config.phaseProfiles ?? {};
  for (const p of phaseProfiles) {
    const o = profileOverlay[p.phase];
    if (!o) continue;
    put(p.portionFactor, o.portionFactor);
    put(p.premiumFactor, o.premiumFactor);
  }

  // Capex, loans and fixed-cost lines ---------------------------------------
  const equipmentPurchase = structuredClone(defaultEquipmentPurchase);
  const fp = config.capex?.financeParams ?? {};
  if (fp.usedDiscount !== undefined) equipmentPurchase.usedDiscount = fp.usedDiscount;

  // Loans, then the scenario's edits. A scenario saved before the loan rows
  // existed carries its terms under `financeParams`; they are mapped onto the
  // loan for the same purpose so the forecast still reads as its author saw it.
  const loanOverlay = config.capex?.loans ?? {};
  const resolvedLoans: LoanDef[] = loans.map((seed) => {
    const l = structuredClone(seed) as LoanDef;
    if (l.purpose === 'equipment') {
      if (fp.equipmentApr !== undefined) l.apr = fp.equipmentApr;
      if (fp.equipmentTermMonths !== undefined) l.termMonths = fp.equipmentTermMonths;
    }
    if (l.purpose === 'leasehold') {
      if (fp.leaseholdApr !== undefined) l.apr = fp.leaseholdApr;
      if (fp.leaseholdTermMonths !== undefined) l.termMonths = fp.leaseholdTermMonths;
    }
    const o = loanOverlay[l.key];
    if (o) {
      if (o.principalCents !== undefined) l.principalCents = o.principalCents;
      if (o.apr !== undefined) l.apr = o.apr;
      if (o.termMonths !== undefined) l.termMonths = o.termMonths;
      if (o.startDate !== undefined) l.startDate = o.startDate;
      if (o.status !== undefined) l.status = o.status;
    }
    return l;
  });

  const leaseholdOverlay = config.capex?.leasehold ?? {};
  const resolvedLeasehold: LeaseholdLine[] = (leasehold.length > 0 ? leasehold : leaseholdSeed).map((seed) => {
    const l = structuredClone(seed) as LeaseholdLine;
    const o = leaseholdOverlay[l.key];
    if (o) {
      if (o.extended !== undefined) l.extended = o.extended;
      if (o.counted !== undefined) l.counted = o.counted;
    }
    return l;
  });

  const lineOverlay = config.capex?.fixedCostLines ?? {};
  const mfc = config.capex?.monthlyFixedCosts ?? {};
  const resolvedFixedCostLines: FixedCostLineDef[] = (fixedCostLines.length > 0 ? fixedCostLines : seedFixedCostLines()).map((seed) => {
    const l = structuredClone(seed) as FixedCostLineDef;
    // Legacy: three dollar figures typed against the three seeded categories.
    const legacy = mfc[l.category as 'lease' | 'utilities' | 'admin'];
    if (legacy !== undefined) l.monthlyAmountCents = Math.round(legacy * 100);
    const o = lineOverlay[l.key];
    if (o) {
      if (o.monthlyAmountCents !== undefined) l.monthlyAmountCents = o.monthlyAmountCents;
      if (o.status !== undefined) l.status = o.status;
      if (o.startDate !== undefined) l.startDate = o.startDate;
      if (o.endDate !== undefined) l.endDate = o.endDate;
    }
    return l;
  });

  // The scheduler's inputs ----------------------------------------------------
  const equipmentList = equipment.length > 0 ? equipment : equipmentSeed;
  const resources = routeResources(equipmentList, config.resources ?? {});
  const schedulePolicy = structuredClone(defaultSchedulePolicy);
  const sp = config.schedulePolicy ?? {};
  put(schedulePolicy.deliveryTimeMin, sp.deliveryTimeMin);
  put(schedulePolicy.closedownStaff, sp.closedownStaff);
  put(schedulePolicy.closedownMinutes, sp.closedownMinutes);
  put(schedulePolicy.allowUnattendedChill, sp.allowUnattendedChill);
  put(schedulePolicy.priorityRule, sp.priorityRule);
  put(schedulePolicy.crewMode, sp.crewMode);
  put(schedulePolicy.dispatchDirection, sp.dispatchDirection);

  // Each recipe's own cost inputs (Roadmap N3). The batch it is costed at is its
  // derived batch on the resolved plant, vessels included — the same batch the
  // Recipes page and production planning use.
  const finalCapacity = {
    ...(capacityInputs as unknown as typeof defaultCapacityInputs),
    batchVessels: batchVesselsFrom(equipment.length > 0 ? equipment : equipmentSeed),
  } as unknown as CapacityInputs;
  const sharedAssumptions = assumptions as unknown as ResolvedInputs['assumptions'];
  const recipeCosts: Record<string, RecipeCostInputs> = {};
  const laborStandards: Record<string, RecipeLaborStandard> = {};
  const recipeAssumptions: Record<string, ResolvedInputs['assumptions']> = {};
  const costPool = recipes.some((r) => r.code === recipe.code) ? recipes : [...recipes, recipe];
  for (const r of costPool) {
    const batch = deriveCapacity(r, finalCapacity).batchSize;
    const inputs = recipeCostInputs(r, timeStudies, batch, packaging);
    recipeCosts[r.code] = inputs;
    laborStandards[r.code] = inputs.labor;
    recipeAssumptions[r.code] = assumptionsForRecipe(sharedAssumptions, inputs);
  }

  return {
    assumptions: recipeAssumptions[recipe.code] ?? sharedAssumptions,
    capacityInputs: finalCapacity as unknown as ResolvedInputs['capacityInputs'],
    recipe,
    recipes,
    laborStandards,
    recipeCosts,
    recipeAssumptions,
    phases: phases as unknown as ResolvedInputs['phases'],
    phaseProfiles: phaseProfiles as unknown as ResolvedInputs['phaseProfiles'],
    crews,
    equipmentPurchase,
    loans: resolvedLoans,
    fixedCostLines: resolvedFixedCostLines,
    leasehold: resolvedLeasehold,
    equipment: structuredClone(equipment.length > 0 ? [...equipment] : equipmentSeed),
    packaging: structuredClone(packaging),
    openingPosition: {
      ownerEquity: config.capex?.openingOwnerEquity ?? defaultOpeningPosition.ownerEquity.value,
      loanStartDate: config.capex?.loanStartDate ?? defaultOpeningPosition.loanStartDate.value,
    },
    supplierTerms: { ...supplierTerms },
    ingredientPrices,
    payCalendar: { ...DEFAULT_PAY_CALENDAR },
    closures: closures.map((c) => ({ startDate: c.startDate, endDate: c.endDate })),
    sites: structuredClone(config.sites ?? {}),
    sales: structuredClone(config.sales ?? {}),
    customers: structuredClone(customerList) as CustomerDef[],
    demand,
    forecast,
    datedEquipment: datedEquipment(equipment.length > 0 ? equipment : equipmentSeed, forecast.startDate, forecast.equipment ?? {}),
    resources,
    routing: structuredClone(config.routing ?? {}),
    schedulePolicy,
    sustainability: {
      ingredientBasis: { ...(config.sustainability?.ingredientBasis ?? {}) },
      ingredientSupplier: { ...(config.sustainability?.ingredientSupplier ?? {}) },
      documents: { ...(config.sustainability?.documents ?? {}) },
      audit: { ...AUDIT_DEFAULTS, ...(config.sustainability?.audit ?? {}) },
      waste: { ...WASTE_DEFAULTS, ...(config.sustainability?.waste ?? {}) },
      energy: { ...ENERGY_DEFAULTS, ...(config.sustainability?.energy ?? {}) },
      water: { ...WATER_DEFAULTS, ...(config.sustainability?.water ?? {}) },
      equipment: structuredClone(config.sustainability?.equipment ?? {}),
    },
  };
}

/** True when the overlay carries no edits (identical to plan-data defaults). */
export function isEmptyConfig(config: MuseScenarioConfig | undefined): boolean {
  if (!config) return true;
  return SCENARIO_SECTIONS.every((s) => {
    const v = config[s];
    return v === undefined || Object.keys(v).length === 0;
  });
}
