/**
 * MicroFarm — source-of-truth reference data.
 *
 * Every figure here traces to the facility operating model. Source-company
 * identifiers are scrubbed: the crop plan code is AMK-E-001, and no company,
 * incubator, standards-partner, or personal name appears anywhere.
 *
 * Numbers are stored as inputs (and their status tag). Derived values — cost
 * per unit, sowing size, the planning loop, labor, the purchase order — are
 * NOT stored here; they are computed by `_engine/*` from these inputs. See
 * docs/farm/CLAUDE.md §2 (engine invariants) and §3 (status tags).
 */

import { tagged, type StatusTag, type Tagged } from '@/data/tagged';

export type { StatusTag, Tagged };

const t = tagged;

// ─────────────────────────────────────────────────────────────────────────
// Global assumptions — every input driver
// ─────────────────────────────────────────────────────────────────────────

export const assumptions = {
  labor: {
    sowWage: t(20, 'PLACEHOLDER', '$/hr', 'Austin market placeholder; replace with quote'),
    leadWage: t(28, 'PLACEHOLDER', '$/hr', 'Austin market placeholder; replace with quote'),
    payrollBurden: t(
      0.22,
      'PLACEHOLDER',
      '% of wage',
      'Total employer burden as a share of wages',
    ),
    blendedLoadedWage: t(
      29.28,
      'DERIVED',
      '$/hr',
      'Average of the two roles, loaded at the payroll burden',
    ),
  },
  perUnit: {
    packaging: t(0, 'DERIVED', '$/unit', 'Per crop plan: the sum of the packages it picks, at the packaging library\'s cost. Zero where nothing is picked or no cost is entered.'),
    distribution: t(0.35, 'PLACEHOLDER', '$/unit', 'Own-fleet assumption for phases 1 and 2'),
    // No per-unit overhead constant lives here. Fixed cost is never in the cost of a
    // unit; its per-unit figure is a period metric (`fixedCostPerUnitByMonth`), and the GAAP absorption rate
    // (`manufacturingOverheadBudget` ÷ normal capacity) are both computed in
    // `_engine/fixed-costs.ts` from the capex schedule and the monthly fixed
    // costs — a stored per-unit figure was a derived value typed as an input.
  },
  yield: {
    shrinkAllowance: t(0.03, 'STATED', '% of input cost', 'Trim loss, over-packing, spoilage'),
  },
  inventory: {
    blackoutShelfLife: t(
      30,
      'STATED',
      'days',
      'Slush-state, high-barrier packaging; 14-day alternative. The plan of record overlays 7 — the current capability on the Phase 1 equipment under Food Code 3-502.12(D)(c); 30 is the 34°F hold-room path, a potential room on the Facility Design and Build plan (2026-09-17).',
    ),
    daysOfCoverTarget: t(5, 'STATED', 'days', 'Finished inventory the plan aims to hold'),
  },
  /**
   * Absorption policy. ASC 330-10-30-3 and IAS 2.13 allocate FIXED production
   * overhead on NORMAL CAPACITY, not on actual volume: unabsorbed overhead in a
   * low-volume period is a period charge, and in an abnormally high period the
   * per-unit rate falls so inventory is never carried above cost. The rate is
   * therefore computed from a budget and a capacity, never stored per unit.
   */
  overhead: {
    plannedMaintenanceDownRate: t(
      0.03,
      'PLACEHOLDER',
      '% of operating days',
      'Capacity lost to planned maintenance and sanitation downtime; 3% is the working figure. ASC 330-10-20 defines normal capacity net of planned maintenance.',
    ),
    absorptionBase: t(
      'units',
      'STATED',
      'base',
      'Allocation base for fixed manufacturing overhead. Units is the single-product base; labor hours becomes the base once the menu carries more than one crop plan.',
    ),
  },
  /**
   * Standard-cost policy. ASC 330-10-30-12/13 permits standard costs only where
   * they approximate cost on a recognised basis and are revised at reasonably
   * regular intervals; material variances prorate across inventory and COGS
   * rather than being written wholly to COGS.
   */
  standardCost: {
    revisionIntervalMonths: t(
      12,
      'STATED',
      'months',
      'Interval at which standards are re-set. ASC 330-10-30-13 requires revision at reasonably regular intervals to reflect current conditions.',
    ),
    varianceProrationThreshold: t(
      0.05,
      'STATED',
      '% of standard COGS',
      'Net variance above this share prorates across ending raw materials, WIP, finished goods and COGS; at or below it the whole net variance goes to COGS.',
    ),
    normalSpoilageBasis: t(
      'shrinkAllowance',
      'STATED',
      'reference',
      'The 3% shrink allowance IS the normal spoilage allowance and is inventoriable. Scrap beyond it is abnormal spoilage and is a period charge under ASC 330-10-30-7.',
    ),
  },
  // Roadmap N3 (2026-09-16): NOT the cost basis of any crop plan. The resolver
  // writes each crop plan's OWN labor standard over these — from its adopted study,
  // else its estimated study — and every page reads the crop plan's. These values
  // survive only as the fallback for an engine call made without the resolver
  // (a bare `costPerUnit()` in a test), and retire in N9 with the other
  // plan-data reads (conformance C2).
  laborSplit: {
    fixedMinutesPerSowing: t(
      180,
      'DERIVED',
      'min/sowing',
      'Bare-engine fallback only (Roadmap N3): the plan study for AMK-E-001. Receiving, sprouting rack and jar stand loads, salsa, cold hold, line turnaround. Does not scale.',
    ),
    variableMinutesPerUnit: t(
      1.5,
      'DERIVED',
      'min/unit',
      'The 750 variable minutes in the time study ÷ the 500-unit sowing the study was estimated at. Asserted against `timeStudy` by test — dividing by the derived 550 understated it by 9.1%.',
    ),
    /** The daily stream (outline §5 rule 3) on one unit: per tray per day over the cycle. Zero on the bare-engine fallback; each plan's own standard writes it. */
    dailyMinutesPerUnit: t(0, 'DERIVED', 'min/unit', 'Bare-engine fallback: no daily stream. Each plan\'s labor standard writes its own (`unit-cost.ts`).'),
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Facility & the capacity constraint chain (sowing size is DERIVED from this)
// ─────────────────────────────────────────────────────────────────────────

export const facility = {
  sizeSqFt: t(5000, 'STATED', 'sq ft', 'Leased raw shell, Austin'),
  leaseTermYears: t(7, 'STATED', 'years'),
} as const;

export const capacityInputs = {
  // The OPERATING DAY is how the business chooses to run the facility, not who is
  // on the schedule. Capacity comes off the grow units; labor is DERIVED from the
  // plan as a requirement and a proposed crew register is checked against it
  // (`staffing.ts`) — a crew never caps the ceiling.
  operatingOpenMin: t(
    420,
    'PLACEHOLDER',
    'min from midnight',
    'No operating day has been decided; research decides it. Working presumption 07:00 for the two-shift day. At opening the farm runs one shift on smaller demand.',
  ),
  operatingCloseMin: t(
    1140,
    'PLACEHOLDER',
    'min from midnight',
    'Working presumption 19:00 for the two-shift day; nothing is stated.',
  ),

  // The days the farm sows in a year.
  productionDaysPerYear: t(
    261,
    'DERIVED',
    'days/year',
    'The production calendar (Roadmap J1): the Monday–Friday production weekdays of the plan year less the dated closures entered on Actuals. 261 is 2026 with no closure entered; the resolver recounts it from the loaded closures. Service days per channel are separate (prospect 180, corporate 250, retail 333).',
  ),
} as const;

// ─────────────────────────────────────────────────────────────────────────
// The crop plan shape a grow plan is projected into (`grow-plan-bridge.ts`)
// ─────────────────────────────────────────────────────────────────────────

export interface InputLine {
  name: string;
  spec: string;
  seedQtyPerSowing: number; // as-purchased quantity for the crop plan's authored sowing (`CropPlanDef.sowingUnits`)
  unit: 'lb' | 'each';
  yieldToHarvest: number; // multiplier
  harvestedYieldPerSowing: number; // seedQtyPerSowing × yieldToHarvest, for the same authored sowing — asserted by test, never typed loose
  seedUnitCost: number;
  packSize: number; // case/pack size for the purchase-order calculator
  isHotComponent: boolean; // hot components are blackouted → drive canopy mass/unit
  /** Each-unit items (tortilla) carry no lb weight; this is their mass for the packed-weight math. */
  unitMassOz?: number;
  /** Provenance of the PRICE (`seedUnitCost`). */
  status: StatusTag;
  source: string;
  /**
   * FDA Food Traceability List category this line falls under (21 CFR 1.1990),
   * when it does. Set explicitly per line — never inferred from the name. A
   * line in scope puts every receipt, sowing and shipment that touches it under
   * FSMA 204 record-keeping; an absent field means the line is out of scope
   * (cheddar is a hard cheese; crushed tomato is canned).
   */
  foodTraceabilityList?: string;
  /**
   * Provenance of the YIELD (`yieldToHarvest`) — separate from the price. A line can
   * have a quoted price and a guessed yield, or the reverse; one tag cannot carry both.
   */
  yieldStatus: StatusTag;
  yieldSource: string;
  /**
   * SEED -> SOWN trim yield, when the trim step has been observed SEPARATELY from
   * growing. USDA Food Buying Guide factors are already SEED -> harvested-and-drained
   * and therefore include trim, so `yieldToHarvest` is the composite. Setting this
   * splits the composite: sowYield = yieldToHarvest / trimYield. Left undefined
   * where no separate trim observation exists — the engine does not invent one.
   */
  trimYield?: number;
  /**
   * Harvested -> blackout yield. Blackouting drives off some moisture, but no
   * blackout-stage weight loss has been observed for this crop plan, so this is left
   * undefined (treated as 1.0) rather than guessed. The stage exists in the cost
   * chain so an observation can be recorded against it.
   */
  blackoutYield?: number;
  /**
   * The SERVED COMPONENT this line rolls up into. The component — not the
   * input line — is the unit of growing, blackouting, lot coding and
   * nutrition. USDA credits what is served, and a salsa is served as a salsa,
   * not as separate tomato and onion lines; nutrition each line alone drops
   * every line under the 1/8-cup minimum and understates the unit.
   */
  component: string;
  /** Set on a line projected from a grow plan's seed line (`_engine/grow-plan-bridge.ts`): the variety it stands for. */
  varietyKey?: string;
}

/** Library status. Production Planning plans `in_service`; the others run singly. */
export type CropPlanStatus = 'in_service' | 'planned' | 'developing';

export const CROP_PLAN_STATUS_LABELS: Record<CropPlanStatus, string> = {
  in_service: 'In Service',
  planned: 'Planned',
  developing: 'Developing',
};

/** The unit spec block a crop plan carries. */
export interface CropPlanSpec {
  trayFormat: Tagged<string>;
  nutritionTarget: { mmaOzEq: Tagged; grainsOzEq: Tagged };
  carriesVegetableRequirement: Tagged<boolean>;
  servingGrowUnitCapacityOz: Tagged;
  packingUtensil: Tagged<string>;
  /**
   * For an adult (corporate / retail) variant derived from a student crop plan.
   * The protein serving leads: `proteinTargetOz` is the packed protein the
   * adult unit serves (crop plan development per unit; a default by unit type
   * when not known), `upgradeMultiplier` is the DERIVED factor on the protein
   * lines that reaches it, `vegetableMultiplier` scales the vegetable lines.
   * Grains and sides are the student crop plan's. Absent on a crop plan authored at
   * its own unit.
   */
  proteinTargetOz?: Tagged;
  upgradeMultiplier?: Tagged;
  vegetableMultiplier?: Tagged;
}

/**
 * A crop plan as the engine reads it — a library row, or the seed below. Every
 * crop plan that can be costed, credited, sowing-sized or planned has this shape.
 */
export interface CropPlanDef {
  code: string;
  name: string;
  category: string;
  status: CropPlanStatus;
  /** Expansion phases served; each channel carries its own menu. */
  channels: number[];
  components: string;
  productionMethod: string;
  allergensPresent: string;
  allergenFreeClaims: string;
  /**
   * The units the input quantities are written for — the crop plan as
   * authored. The production SOWING is not this: it is what one unit of each
   * Phase 1 grow unit takes (`deriveCapacity`), and every quantity scales to it.
   * Sowing costing runs at the derived sowing; the unit cost comes down from it.
   */
  sowingUnits: number;
  spec: CropPlanSpec;
  inputs: InputLine[];
}

// ─────────────────────────────────────────────────────────────────────────
// Staffing
// ─────────────────────────────────────────────────────────────────────────

// No shift pattern, crew count or daily timeline is stored here. The operating
// day is a capacity input (`capacityInputs.operatingOpenMin` / `operatingCloseMin`);
// the day's labor is DERIVED from the production plan (`_engine/staffing.ts`);
// crews are a proposed answer in the scenario (`_data/crews.ts`).

// Payroll burden split rates — PLACEHOLDERS the sowing ledger splits standard
// labor with until Staffing's rates arrive.
export const compDefaults = {
  fica: 0.0765, // employer Social Security 6.2% + Medicare 1.45% (fixed federal)
  futa: 0.006, // federal unemployment
  suta: 0.015, // Texas state unemployment (estimate, pending verification)
  workersComp: 0.0325, // food-production class rate (estimate, pending quote)
  totalBurden: 0.22, // total employer burden
  additionalBenefitsPerEmployeeMonth: 0, // extra benefit on top of the surplus allocation
  weeksPerYear: 52,
};

export interface PhaseRow {
  phase: number;
  market: string;
  character: string;
  /** The channel's default price per unit; a subscriber may carry its own. */
  pricePerUnit: number;
  /**
   * DERIVED by the resolver from subscribers and pickup points (Roadmap Phase H2): the
   * sum of each pickup point's expected units per service day, and the units-weighted
   * service days. The values typed here are only the SEED the placeholder
   * subscribers are built from when the subscriber library is empty.
   */
  unitsPerDay: number;
  operatingDays: number;
  /**
   * Share of this channel's demand that is produced and sold, 0–1. `null` means
   * the default: the same share for every channel, set by what the grow units can
   * make against total demand (equal distribution). A typed value is the
   * operator's allocation. The engine reports over-allocation; it does not
   * refuse it.
   */
}

// Phase 1 operations: all planned volume is Subscriptions.
// Restaurants and the retail and wholesale stay defined as channels — their
// prices, units and menus — with no planned volume until they are booked.
export const phases: readonly PhaseRow[] = [
  // Prices per 1020 flat: Vallecito's $20 subscription and $25 retail (DATED, 2023); the restaurant price is a PLACEHOLDER until quoted.
  { phase: 1, market: 'Subscriptions', character: 'Bi-weekly and monthly flats, pickup or route', pricePerUnit: 20, unitsPerDay: 1000, operatingDays: 180 },
  { phase: 2, market: 'Restaurants', character: 'Weekly cut and live trays, year-round', pricePerUnit: 15, unitsPerDay: 0, operatingDays: 250 },
  { phase: 3, market: 'Retail and wholesale', character: 'Retail corner and wholesale accounts', pricePerUnit: 25, unitsPerDay: 0, operatingDays: 333 },
];

// Per-phase cost & unit profile. Same crop plan across all three phases for
// now; unit size scales the input cost AND the canopy mass per unit
// (which drives sowing size), so a bigger subscriber unit yields fewer units
// per sowing. `premiumFactor` is a separate knob (input premium) held at
// 1.0 until per-phase menus are costed. Future path: a costing engine that
// carries distinct per-phase crop plans.
export interface PhaseProfile {
  phase: number;
  unitFactor: Tagged; // multiplies unit size vs the base prospect unit
  premiumFactor: Tagged; // multiplies input cost (premium proteins, etc.)
}

export const phaseProfiles: PhaseProfile[] = [
  {
    phase: 1,
    unitFactor: t(1.0, 'STATED', '×', 'Base prospect unit, fundamental menu; the packed weight derives from the harvested yields'),
    premiumFactor: t(1.0, 'STATED', '×', 'Base crop plan'),
  },
  {
    phase: 2,
    unitFactor: t(1.5, 'STATED', '×', '+50% unit for restaurants'),
    premiumFactor: t(1.0, 'STATED', '×', 'Same crop plan for now; premium menu is a future build'),
  },
  {
    phase: 3,
    unitFactor: t(1.5, 'STATED', '×', '+50% unit for retail and wholesale / retail'),
    premiumFactor: t(1.0, 'STATED', '×', 'Same crop plan for now; premium menu is a future build'),
  },
];
