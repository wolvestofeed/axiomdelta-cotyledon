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
import type { NutritionSpec, TrayFormat } from '@/data/nutrient-profile';

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
  // One blackout rack rack's load. A sowing binds to ONE unit of each grow unit
  // it passes through — a second rack is a parallel stream, never a larger
  // sowing — so no unit count multiplies this. Read from
  // the equipment library at run time (`sowingGrowUnitsFrom`); this is the
  // fallback when no library is in hand. Planned build-outs never count
  //. The former `blackoutRackUnits` input is retired.
  capacityPerUnitLb: t(200, 'PLACEHOLDER', 'lb/cycle', 'Estimated — the rated load in the item name; an open field on Equipment'),

  // Blackout rack OCCUPANCY per sowing = load + blackout + unload. Only the blackout stage is
  // an equipment rating; load and unload are handling time. The engine sums them
  // (`blackoutRackOccupancyMinutes`) and divides the blackout window by the SUM — never
  // by the blackout stage alone, which would load and unload the rack in zero
  // minutes. Sowing size does not depend on any of these: it comes off mass.
  // The rack is NOT sanitized between sowings: it is
  // sanitized at the end of a shift or day, immediately after a food spill, and
  // between foods when allergens were uncovered. Defrosting is periodic
  // maintenance to keep the unit running efficiently, never part of production.
  loadMinutes: t(
    25,
    'PLACEHOLDER',
    'min',
    'Pouring the finished sow into 2-inch hotel pans and loading the rack — an estimate. Starts the minute the sow ends.',
  ),
  blackoutMinutes: t(
    90,
    'PLACEHOLDER',
    'min',
    'The rated thermodynamic cycle: 160°F to 38°F in 90 minutes or less at rated load, industry convention — an EQUIPMENT rating. The REGULATORY limit is a different measurement: FDA Food Code 3-501.14, 135°F to 70°F within 2 h and to 41°F within 6 h total (control-point-2). This is the only element the cooling limit applies to. Replace from the equipment spec sheet.',
  ),
  unloadMinutes: t(
    10,
    'PLACEHOLDER',
    'min',
    'Out of the rack to cold hold. Seeded from the time-study task "Cold hold to harvest" (10 min elapsed, 1 staff). No published figure exists.',
  ),

  // The OPERATING DAY is how the business chooses to run the plant, not who is
  // on the schedule. Capacity comes off the equipment, the process minutes and
  // this window. Labor is DERIVED from the plan as a requirement and a proposed
  // crew register is checked against it (`_engine/staffing.ts`) — a crew never
  // caps the ceiling.
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
    'Working presumption 19:00 for the two-shift day; nothing is stated. Every rack cycle counted in the daily ceiling is loaded, blackout and unloaded inside the operating day.',
  ),

  // Headcount each blackout rack task needs at the same moment. The labor requirement
  // places these on the clock; they size the requirement, never the ceiling.
  loadStaff: t(2, 'PLACEHOLDER', 'people', 'Seeded from the time-study task "Component blackout and stage" (2 staff). The time study is an estimate, not an observation.'),
  unloadStaff: t(1, 'PLACEHOLDER', 'people', 'Seeded from the time-study task "Cold hold to harvest" (1 staff).'),

  sowingRoundingUnits: 25, // floor sowing size to the nearest 25 units
  // Annual production capacity = daily ceiling × the days the farm produces.
  // Grow decouples production from service, so the annual check — not the
  // same-day stack of every channel — is what decides whether the phase volumes
  // in the P&L are producible at all.
  productionDaysPerYear: t(
    261,
    'DERIVED',
    'days/year',
    'The production calendar (Roadmap J1): the Monday–Friday production weekdays of the plan year less the dated closures entered on Actuals. 261 is 2026 with no closure entered; the resolver recounts it from the loaded closures. Service days per channel are separate (prospect 180, corporate 250, retail 333).',
  ),
} as const;

// Non-blackout-rack capacities, shown for comparison only (blackout rack treated as binding).
export const otherCapacities = {
  jarStandOvenPanPositions: t(40, 'PLACEHOLDER', 'pans'),
  tiltingShelfGal: t(80, 'PLACEHOLDER', 'gal'),
  sproutingRackGal: t(160, 'PLACEHOLDER', 'gal', '100 gal + 60 gal'),
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Crop plan — Texas Ranch Beef & Bean Bowl (AMK-E-001)
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
  /** How this line credits toward the NSLP nutrient profile. */
  nutrition?: NutritionSpec;
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
  trayFormat: Tagged<TrayFormat>;
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

export const cropPlan: CropPlanDef = {
  code: 'AMK-E-001',
  name: 'Texas Ranch Beef & Bean Bowl',
  category: 'Hot entree, subscription',
  status: 'in_service',
  channels: [1],
  components:
    'Seasoned grass-fed beef and pinto beans, cilantro-lime brown rice, roasted seasonal vegetables, salsa roja, corn tortilla',
  productionMethod:
    'Grow. Components harvested, blackouted, assembled cold, reheated at pickup point.',
  allergensPresent: 'Milk (cheese, packed as a separate component)',
  allergenFreeClaims: 'No peanut, tree nut, wheat, egg, soy, fish, shellfish, sesame',
  sowingUnits: 100,
  /**
   * The unit SPEC. A prospect entree's served weight is not a preference — it is
   * whatever weight distributes its nutrition contribution for its tray format. The
   * spec is the anchor; as-purchased quantities are derived from it through the
   * yield chain, not authored against it.
   */
  spec: {
    trayFormat: t<TrayFormat>(
      '9-12',
      'DERIVED',
      'tray format',
      'Inferred from what the authored quantities credit: 2.75 oz eq M/MA and exactly 2.00 oz eq grains after USDA round-down, which is the 9-12 daily minimum for both. The same bowl over-distributes for K-5 and 6-8. Confirm against the district contract before this is treated as fixed.',
    ),
    nutritionTarget: {
      mmaOzEq: t(2, 'SOURCED', 'oz eq', '7 CFR 210.10(c) grades 9-12 unit daily minimum, meats/meat alternates'),
      grainsOzEq: t(2, 'SOURCED', 'oz eq', '7 CFR 210.10(c) grades 9-12 unit daily minimum, grains'),
    },
    /**
     * The entree does not carry the whole vegetable requirement; sides and the
     * fruit and milk components complete the reimbursable unit. Recorded so the
     * gap is explicit rather than assumed away.
     */
    carriesVegetableRequirement: t(
      false,
      'STATED',
      'boolean',
      'The bowl credits about 0.375 cup of vegetable against a 1 cup grades 9-12 daily minimum. The balance comes from sides that are not part of this crop plan.',
    ),
    servingGrowUnitCapacityOz: t(
      16,
      'PLACEHOLDER',
      'oz',
      'Bowl capacity. This is the hard physical bound on packed weight and the cheapest check on any unit change — a packaging spec, not a model output. Replace with the quoted bowl.',
    ),
    packingUtensil: t(
      'not specified',
      'PLACEHOLDER',
      'utensil',
      'A standardized crop plan states the serving utensil by size (scoop number, ladle or spoodle ounces). Required for the production record and for unit control on the line.',
    ),
  },
  inputs: <InputLine[]>[
    {
      name: 'Ground beef, 85/15',
      component: 'Beef and bean base',
      spec: 'Grass-fed, grass-finished, regenerative Central TX ranch',
      seedQtyPerSowing: 9.375,
      unit: 'lb',
      yieldToHarvest: 0.75,
      harvestedYieldPerSowing: 7.0312,
      seedUnitCost: 7.5,
      packSize: 25,
      isHotComponent: true,
      status: 'SOURCED',
      source:
        'USDA Q2 2026 grass-fed 80–89% lean avg $10.67/lb retail. $7.50 is a direct-from-ranch volume target.',
      yieldStatus: 'SOURCED',
      yieldSource:
        'USDA Food Buying Guide §1 Meats/Meat Alternates: ground beef, raw, no more than 15% fat — 1 lb SEED = 0.75 lb harvested, drained, lean meat.',
      nutrition: {
        component: 'MMA',
        status: 'SOURCED',
        source:
          'USDA Food Buying Guide / FNS Nutrition Meats & Meat Alternates: harvested lean meat without bone credits 1 oz = 1 oz eq.',
      },
    },
    {
      name: 'Pinto beans, dry',
      component: 'Beef and bean base',
      spec: 'Certified organic',
      seedQtyPerSowing: 6.25,
      unit: 'lb',
      yieldToHarvest: 1.9792,
      harvestedYieldPerSowing: 12.37,
      seedUnitCost: 1.8,
      packSize: 25,
      isHotComponent: true,
      status: 'SOURCED',
      source: 'WebstaurantStore organic dried pinto, 25 lb at $44.99 = $1.80/lb',
      yieldStatus: 'SOURCED',
      yieldSource:
        'USDA Food Buying Guide §1: dry pinto beans, 1 lb SEED = 21 servings of 1/4 cup harvested, drained = 5.25 cups; USDA FoodData Central 171 g per cup harvested → 1.979 lb harvested per lb dry. NOTE: this is the DRAINED yield. If the beef-and-bean base is held with its growing liquid the wet yield is nearer 2.4, which raises canopy mass and lowers sowing size to 550. Resolve by weighing a drained sowing.',
      nutrition: {
        component: 'MMA',
        legumeElection: 'MMA',
        vegSubgroup: 'BEANS_PEAS_LENTILS',
        cupWeightG: 171,
        status: 'SOURCED',
        source:
          'Harvested dry beans credit 1/4 cup = 1 oz eq M/MA (FBG §1). Cup weight 171 g per USDA FoodData Central, pinto beans, mature seeds, harvested, boiled. 7 CFR 210.10(c)(2)(ii)(C) allows either M/MA or the beans/peas/lentils vegetable subgroup, not both in the same dish; this line elects M/MA.',
      },
    },
    {
      name: 'Brown rice, long grain',
      component: 'Cilantro-lime rice',
      spec: 'Certified organic',
      seedQtyPerSowing: 9.375,
      unit: 'lb',
      yieldToHarvest: 2.8946,
      harvestedYieldPerSowing: 27.1369,
      seedUnitCost: 1.55,
      packSize: 25,
      isHotComponent: true,
      status: 'PLACEHOLDER',
      source: 'Placeholder, quote required',
      yieldStatus: 'SOURCED',
      yieldSource:
        'USDA Food Buying Guide §4 Grains: brown rice, long grain, dry — 1 lb dry = about 6-1/2 cups harvested; USDA FoodData Central 202 g per cup harvested long-grain brown rice → 2.895 lb harvested per lb dry.',
      nutrition: {
        component: 'GRAINS',
        grainGroup: 'H',
        cupWeightG: 202,
        status: 'SOURCED',
        source:
          'Exhibit A Group H: 1/2 cup harvested cereal grain = 1 oz eq. Cup weight 202 g per USDA FoodData Central, rice, brown, long-grain, harvested.',
      },
    },
    {
      name: 'Seasonal vegetables',
      component: 'Roasted vegetables',
      spec: 'Organic, Central TX seasonal: squash, peppers, onion',
      foodTraceabilityList: 'Peppers (fresh)',
      seedQtyPerSowing: 15.625,
      unit: 'lb',
      yieldToHarvest: 0.82,
      harvestedYieldPerSowing: 12.8125,
      seedUnitCost: 2.2,
      packSize: 40,
      isHotComponent: true,
      status: 'PLACEHOLDER',
      source: 'Placeholder. Central TX produce is the constrained side of local supply.',
      yieldStatus: 'PLACEHOLDER',
      yieldSource:
        'Working figure for a roasted squash/pepper/onion blend. USDA FBG carries per-vegetable yields (mature onion 1 lb SEED = 0.78 lb harvested) but not a blend; 0.82 is unsourced until the blend is fixed and a pan is weighed.',
      nutrition: {
        component: 'VEG',
        vegSubgroup: 'OTHER',
        cupWeightG: 175,
        status: 'PLACEHOLDER',
        source:
          'Working figure for a roasted squash/pepper/onion blend (component cup weights run 136-210 g harvested). The SUBGROUP is also unresolved: red peppers and winter squash are red/orange, summer squash and green peppers are other, so the blend splits across two subgroups once it is fixed. Both the density and the split are placeholders until the blend is specified and a pan is weighed.',
      },
    },
    {
      name: 'Tomato, crushed',
      component: 'Salsa roja',
      spec: 'Certified organic',
      seedQtyPerSowing: 6.25,
      unit: 'lb',
      yieldToHarvest: 0.95,
      harvestedYieldPerSowing: 5.9375,
      seedUnitCost: 1.4,
      packSize: 30,
      isHotComponent: true,
      status: 'PLACEHOLDER',
      source: 'Placeholder, quote required',
      yieldStatus: 'PLACEHOLDER',
      yieldSource:
        'Working figure. Canned crushed tomato is already processed, so loss in the salsa is evaporation only; 0.95 is unsourced and depends on how far the salsa is reduced.',
      nutrition: {
        component: 'VEG',
        vegSubgroup: 'RED_ORANGE',
        cupWeightG: 242,
        status: 'UNCONFIRMED',
        source:
          'Canned crushed tomato, approx. 242 g per cup. Credited as the volume served; the whole-food equivalency allowance applies to tomato paste and puree, not to crushed tomato, so it is not claimed here.',
      },
    },
    {
      name: 'Onion, yellow',
      component: 'Salsa roja',
      spec: 'Certified organic',
      seedQtyPerSowing: 1.875,
      unit: 'lb',
      yieldToHarvest: 0.78,
      harvestedYieldPerSowing: 1.4625,
      seedUnitCost: 1.1,
      packSize: 50,
      isHotComponent: true,
      status: 'PLACEHOLDER',
      source: 'Placeholder, quote required',
      yieldStatus: 'SOURCED',
      yieldSource:
        'USDA Food Buying Guide §2 Vegetables: onions, mature, fresh — 1 lb SEED = 0.78 lb harvested onion.',
      nutrition: {
        component: 'VEG',
        vegSubgroup: 'OTHER',
        cupWeightG: 210,
        status: 'SOURCED',
        source: 'USDA FoodData Central, onions, harvested, boiled, drained — 210 g per cup.',
      },
    },
    {
      name: 'Garlic, peeled',
      component: 'Salsa roja',
      spec: 'Certified organic',
      seedQtyPerSowing: 0.1875,
      unit: 'lb',
      yieldToHarvest: 0.85,
      harvestedYieldPerSowing: 0.1594,
      seedUnitCost: 6,
      packSize: 5,
      isHotComponent: true,
      status: 'PLACEHOLDER',
      source: 'Placeholder, quote required',
      yieldStatus: 'PLACEHOLDER',
      yieldSource:
        'Working figure for peeled garlic harvested into the base. Unsourced; the quantity is small enough that it does not move canopy mass.',
      nutrition: {
        component: 'NONE',
        status: 'STATED',
        source:
          'Quantity is far below the 1/8-cup minimum creditable serving; carried as a seasoning, not a credited vegetable.',
      },
    },
    {
      name: 'Corn tortilla, 6 in',
      component: 'Corn tortilla',
      spec: 'Organic masa, nixtamalized',
      seedQtyPerSowing: 100,
      unit: 'each',
      yieldToHarvest: 1,
      harvestedYieldPerSowing: 100,
      seedUnitCost: 0.13,
      packSize: 120,
      isHotComponent: false, // cold-packed; excluded from canopy mass per unit
      status: 'PLACEHOLDER',
      source: 'Placeholder, local tortilleria',
      unitMassOz: 0.88,
      yieldStatus: 'SOURCED',
      yieldSource:
        'No growing loss — packed cold, not blackouted. Unit mass 0.88 oz (25 g) per USDA FoodData Central, corn tortilla, 6-inch, ready to bake or fry.',
      nutrition: {
        component: 'GRAINS',
        grainGroup: 'B',
        unitWeightG: 25,
        status: 'SOURCED',
        source:
          'Exhibit A Group B: tortillas (wheat or corn) credit 28 g = 1 oz eq. Unit mass 25 g (0.88 oz) per USDA FoodData Central, corn tortilla, 6-inch.',
      },
    },
    {
      name: 'Cheddar, shredded',
      component: 'Cheddar',
      spec: 'Organic, pasture-raised dairy. PACKED SEPARATELY.',
      seedQtyPerSowing: 3.125,
      unit: 'lb',
      yieldToHarvest: 1,
      harvestedYieldPerSowing: 3.125,
      seedUnitCost: 5.4,
      packSize: 5,
      isHotComponent: false, // separate cold component; base bowl stays dairy-free
      status: 'PLACEHOLDER',
      source: 'Separate component so the base bowl remains dairy-free',
      yieldStatus: 'STATED',
      yieldSource:
        'No growing loss — packed cold as a separate component, excluded from canopy mass.',
      nutrition: {
        component: 'MMA',
        status: 'SOURCED',
        source: 'FBG §1: natural or processed cheese credits 1 oz = 1 oz eq M/MA.',
      },
    },
    {
      name: 'Chili-cumin spice blend',
      component: 'Beef and bean base',
      spec: 'Organic, house blend',
      seedQtyPerSowing: 0.3125,
      unit: 'lb',
      yieldToHarvest: 1,
      harvestedYieldPerSowing: 0.3125,
      seedUnitCost: 8,
      packSize: 5,
      isHotComponent: true,
      status: 'PLACEHOLDER',
      source: 'Placeholder',
      yieldStatus: 'STATED',
      yieldSource:
        'Dry seasoning carried into the harvested mass; no yield loss applied.',
      nutrition: {
        component: 'NONE',
        status: 'STATED',
        source: 'Seasoning; does not credit toward a unit component.',
      },
    },
    {
      name: 'Sea salt',
      component: 'Beef and bean base',
      spec: 'Unrefined',
      seedQtyPerSowing: 0.25,
      unit: 'lb',
      yieldToHarvest: 1,
      harvestedYieldPerSowing: 0.25,
      seedUnitCost: 0.9,
      packSize: 25,
      isHotComponent: true,
      status: 'PLACEHOLDER',
      source: 'Placeholder',
      yieldStatus: 'STATED',
      yieldSource:
        'Dry seasoning carried into the harvested mass; no yield loss applied.',
      nutrition: {
        component: 'NONE',
        status: 'STATED',
        source: 'Seasoning; does not credit toward a unit component.',
      },
    },
    {
      name: 'Sunflower oil, high oleic',
      component: 'Roasted vegetables',
      spec: 'Organic, expeller pressed',
      seedQtyPerSowing: 0.9375,
      unit: 'lb',
      yieldToHarvest: 1,
      harvestedYieldPerSowing: 0.9375,
      seedUnitCost: 3.2,
      packSize: 35,
      isHotComponent: true,
      status: 'PLACEHOLDER',
      source: 'Placeholder',
      yieldStatus: 'STATED',
      yieldSource:
        'Growing fat carried into the harvested mass; no yield loss applied.',
      nutrition: {
        component: 'NONE',
        status: 'STATED',
        source: 'Growing fat; does not credit toward a unit component.',
      },
    },
  ],
};

/**
 * The SERVED COMPONENTS of the crop plan. The component, not the input line, is
 * the unit of growing, blackouting, lot coding, nutrition and work-in-process
 * costing. Hot components are blackouted and drive sowing size; cold components
 * are packed without a blackout cycle and never enter the rack.
 */
export interface ComponentSpec {
  name: string;
  isHot: boolean;
  sowMethod: string;
  /** Stage of the WIP chain this component's cost passes through. */
  wipPath: readonly ('SOW' | 'BLACKOUT' | 'PACK')[];
  status: StatusTag;
  note: string;
}

export const componentSpecs: ComponentSpec[] = [
  {
    name: 'Beef and bean base',
    isHot: true,
    sowMethod: 'Sprouting rack',
    wipPath: ['SOW', 'BLACKOUT', 'PACK'],
    status: 'STATED',
    note: 'Beef, pinto beans and seasoning harvested together and blackouted as one mass.',
  },
  {
    name: 'Cilantro-lime rice',
    isHot: true,
    sowMethod: 'Jar stand',
    wipPath: ['SOW', 'BLACKOUT', 'PACK'],
    status: 'STATED',
    note: 'Largest single harvested mass in the bowl at 4.34 oz per unit.',
  },
  {
    name: 'Roasted vegetables',
    isHot: true,
    sowMethod: 'Jar stand',
    wipPath: ['SOW', 'BLACKOUT', 'PACK'],
    status: 'STATED',
    note: 'Roasting oil is allocated to this component; the allocation is a working choice and moves component mass if the oil is used elsewhere.',
  },
  {
    name: 'Salsa roja',
    isHot: true,
    sowMethod: 'Sprouting rack',
    wipPath: ['SOW', 'BLACKOUT', 'PACK'],
    status: 'STATED',
    note: 'Credits as one served component. Scored input by input every line falls under the 1/8-cup minimum and the salsa credits as nothing.',
  },
  {
    name: 'Corn tortilla',
    isHot: false,
    sowMethod: 'None — packed as received',
    wipPath: ['PACK'],
    status: 'STATED',
    note: 'Cold-packed. Never enters the blackout rack, so it carries no blackout-stage cost.',
  },
  {
    name: 'Cheddar',
    isHot: false,
    sowMethod: 'None — packed as received',
    wipPath: ['PACK'],
    status: 'STATED',
    note: 'Cold-packed as a separate component so the base bowl stays dairy-free. The 18 lb per 575-unit sowing that separates harvested mass from canopy mass IS this cheese — it is not a blackout loss.',
  },
];

/**
 * The SEED crop plan list. The library (`farm.crop plans`, Roadmap Phase H1) is the
 * source; this list is inserted on first read when the library is empty and is
 * the fallback wherever no library has been loaded (tests, engine defaults).
 */
export const cropPlans: CropPlanDef[] = [cropPlan];

// ─────────────────────────────────────────────────────────────────────────
// Time study — one standard production sowing, 14 tasks
// ─────────────────────────────────────────────────────────────────────────

export interface LaborTask {
  task: string;
  station: string;
  staff: number;
  elapsedMin: number;
  laborMinutes: number;
  controlPoint: string | null;
  scalesWith: 'fixed' | 'variable';
}

export const timeStudy = {
  estimatedAtSowingSize: 500, // re-basing warning: estimated at 500; the derived sowing on the Phase 1 line is 275
  tasks: <LaborTask[]>[
    { task: 'Receiving, verification, put-away', station: 'Dock, walk-in', staff: 2, elapsedMin: 30, laborMinutes: 60, controlPoint: null, scalesWith: 'fixed' },
    { task: 'Dry goods scaling and mise en place', station: 'Prep bench', staff: 2, elapsedMin: 25, laborMinutes: 50, controlPoint: null, scalesWith: 'variable' },
    { task: 'Bean sow (soaked prior day)', station: '100 gal steam sprouting rack', staff: 1, elapsedMin: 20, laborMinutes: 20, controlPoint: null, scalesWith: 'fixed' },
    { task: 'Rice sow', station: 'Jar stand oven', staff: 1, elapsedMin: 15, laborMinutes: 15, controlPoint: null, scalesWith: 'fixed' },
    { task: 'Beef browning and seasoning', station: 'Tilt shelf', staff: 2, elapsedMin: 45, laborMinutes: 90, controlPoint: 'control-point-1', scalesWith: 'variable' },
    { task: 'Vegetable wash, trim, cut', station: 'Prep bench, VCM', staff: 3, elapsedMin: 60, laborMinutes: 180, controlPoint: null, scalesWith: 'variable' },
    { task: 'Vegetable roasting', station: 'Jar stand oven', staff: 1, elapsedMin: 15, laborMinutes: 15, controlPoint: null, scalesWith: 'fixed' },
    { task: 'Salsa roja production', station: 'Sprouting rack, immersion blender', staff: 1, elapsedMin: 30, laborMinutes: 30, controlPoint: null, scalesWith: 'fixed' },
    { task: 'Component blackout and stage', station: 'Blackout rack', staff: 2, elapsedMin: 25, laborMinutes: 50, controlPoint: 'control-point-2', scalesWith: 'variable' },
    { task: 'Unit and assemble bowls', station: 'Assembly line', staff: 4, elapsedMin: 75, laborMinutes: 300, controlPoint: null, scalesWith: 'variable' },
    { task: 'Seal, label, date and lot code', station: 'Tray sealer', staff: 2, elapsedMin: 30, laborMinutes: 60, controlPoint: null, scalesWith: 'variable' },
    { task: 'Final blackout and temp logging', station: 'Blackout rack', staff: 1, elapsedMin: 20, laborMinutes: 20, controlPoint: 'control-point-2', scalesWith: 'variable' },
    { task: 'Cold hold to harvest', station: 'Walk-in', staff: 1, elapsedMin: 10, laborMinutes: 10, controlPoint: 'control-point-3', scalesWith: 'fixed' },
    // Line turnaround between sowings: two people, fifteen minutes. End-of-day
    // closedown (two people, 30 minutes) is a day task on no study, placed once at the close of the
    // operating day (`schedulePolicy`).
    { task: 'Line turnaround and sanitation', station: 'Production line', staff: 2, elapsedMin: 15, laborMinutes: 30, controlPoint: null, scalesWith: 'fixed' },
  ],
} as const;

// ─────────────────────────────────────────────────────────────────────────
// Food safety — CCPs, allergen matrix
// ─────────────────────────────────────────────────────────────────────────

export interface CONTROL_POINT {
  id: string;
  step: string;
  hazard: string;
  criticalLimit: string;
  monitoring: string;
  correctiveAction: string;
  verification: string;
  record: string;
}

export const controlPoints: CONTROL_POINT[] = [
  { id: 'control-point-1', step: 'Growing — ground beef', hazard: 'Biological: pathogens survive', criticalLimit: '155°F for 17 seconds, minimum internal', monitoring: 'Internal temp, calibrated probe, 3 locations per sowing, sow lead', correctiveAction: 'Continue growing to limit; if limit unverified, hold and evaluate or discard', verification: 'Daily probe calibration; supervisor reviews logs daily', record: 'Sow temperature log' },
  { id: 'control-point-2', step: 'Cooling — all harvested components', hazard: 'Biological: growth and toxin formation', criticalLimit: '135°F to 70°F within 2 hours, then 70°F to 41°F within 4 more (6 hours total)', monitoring: 'Product temp at 0, 2 and 6 hours, blackout rack probe, every sowing, production lead', correctiveAction: 'If 2-hour check fails, reheat to 165°F and re-cool once, or discard', verification: 'The production lead verifies the cooling log live at each 2-hour and 6-hour check; supervisor reviews daily; blackout rack verified weekly. Any blackout completing while no crew is scheduled runs on a continuous datalogger with alarm to a named on-call responder.', record: 'Cooling log' },
  { id: 'control-point-3', step: 'Cold storage', hazard: 'Biological: growth', criticalLimit: '41°F or below', monitoring: 'Walk-in air and product temp, twice daily plus continuous datalogger, shift lead', correctiveAction: 'Evaluate time above 41°F; discard if beyond limit', verification: 'Datalogger reviewed at each shift start, downloaded weekly. Whenever no crew is scheduled the building is empty, so the alarm reaches a phone.', record: 'Storage temp log' },
  { id: 'control-point-4', step: 'Transport to pickup point', hazard: 'Biological: growth', criticalLimit: '41°F or below on arrival', monitoring: 'Product temp at load and at distribution, every route, driver and receiver', correctiveAction: 'Reject and replace load; investigate vehicle', verification: 'Route temp records reviewed weekly', record: 'Distribution temp log' },
  { id: 'control-point-5', step: 'Reheat at satellite pickup point', hazard: 'Biological: survival', criticalLimit: '165°F for 15 seconds within 2 hours', monitoring: 'Internal temp, 2 locations per pan, every service, pickup point lead', correctiveAction: 'Continue heating; discard if the 2-hour window is exceeded', verification: 'Pickup point audit monthly', record: 'Pickup point reheat log' },
];

export interface AllergenRow {
  component: string;
  milk: boolean;
  egg: boolean;
  wheat: boolean;
  soy: boolean;
  peanut: boolean;
  treeNut: boolean;
  fishShellfishSesame: boolean;
}

export const allergenMatrix: AllergenRow[] = [
  { component: 'Beef and bean base', milk: false, egg: false, wheat: false, soy: false, peanut: false, treeNut: false, fishShellfishSesame: false },
  { component: 'Cilantro-lime brown rice', milk: false, egg: false, wheat: false, soy: false, peanut: false, treeNut: false, fishShellfishSesame: false },
  { component: 'Roasted seasonal vegetables', milk: false, egg: false, wheat: false, soy: false, peanut: false, treeNut: false, fishShellfishSesame: false },
  { component: 'Salsa roja', milk: false, egg: false, wheat: false, soy: false, peanut: false, treeNut: false, fishShellfishSesame: false },
  { component: 'Corn tortilla', milk: false, egg: false, wheat: false, soy: false, peanut: false, treeNut: false, fishShellfishSesame: false },
  { component: 'Cheddar (separate component)', milk: true, egg: false, wheat: false, soy: false, peanut: false, treeNut: false, fishShellfishSesame: false },
];

// ─────────────────────────────────────────────────────────────────────────
// Staffing
// ─────────────────────────────────────────────────────────────────────────

// No shift pattern, crew count or daily timeline is stored here. The operating
// day is a capacity input (`capacityInputs.operatingOpenMin` / `operatingCloseMin`);
// the day's labor is DERIVED from the production plan (`_engine/staffing.ts`);
// crews are a proposed answer in the scenario (`_data/crews.ts`).

// Plan role titles — position titles stand in for employee names (no real person
// appears). No pay is held here (Roadmap O1): Staffing holds the roster, wages
// and burden. Training assigns courses and certificates to these roles until
// Staffing's roster is connected.
export interface RosterPosition {
  title: string;
  headcount: number;
  shift: string;
  onFloor?: boolean; // works production-floor hours (default true)
}

export const roster: RosterPosition[] = [
  // The COO / GM does not work floor hours; the Culinary Director takes one of
  // the two Lead Sous roles and works the floor.
  { title: 'COO / General Manager', headcount: 1, shift: 'Leadership (off-floor)', onFloor: false },
  { title: 'Culinary Director (Lead Chef)', headcount: 1, shift: 'Shift 1 & 2 (working lead)', onFloor: true },
  { title: 'Production Lead / Sous', headcount: 1, shift: 'Shift 1 & 2' },
  { title: 'Line Sow', headcount: 6, shift: 'Shift 1 & 2' },
  { title: 'Prep Sow', headcount: 3, shift: 'Overlap' },
];

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
   * the default: the same share for every channel, set by what the blackout rack can
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
