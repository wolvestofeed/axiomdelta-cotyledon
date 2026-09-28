/**
 * Cotyledon — source-of-truth reference data.
 *
 * Every figure here traces to the facility operating model. Source-company
 * identifiers are scrubbed: the grow plan code is AMK-E-001, and no company,
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
    sowWage: t(20, 'PLACEHOLDER', '$/hr', 'The Grower, the next production hire: not stated; Staffing\'s rate replaces it'),
    leadWage: t(28, 'PLACEHOLDER', '$/hr', 'Rob\'s own time on the sow, daily and harvest streams: not stated; Staffing\'s rate replaces it'),
    payrollBurden: t(
      0.22,
      'PLACEHOLDER',
      '% of wage',
      'Total employer burden as a share of wages; not stated',
    ),
    blendedLoadedWage: t(
      29.28,
      'DERIVED',
      '$/hr',
      'Average of the two placeholder wages, loaded at the placeholder burden; the labor rate every stream is costed at until Staffing\'s rates arrive',
    ),
  },
  perUnit: {
    packaging: t(0, 'DERIVED', '$/unit', 'Per grow plan: the sum of the packages it picks, at the packaging library\'s cost. Zero where nothing is picked or no cost is entered.'),
    distribution: t(0.35, 'PLACEHOLDER', '$/unit', 'Own-fleet assumption for phases 1 and 2'),
    // No per-unit overhead constant lives here. Fixed cost is never in the cost of a
    // unit; its per-unit figure is a period metric (`fixedCostPerUnitByMonth`), and the GAAP absorption rate
    // (`manufacturingOverheadBudget` ÷ normal capacity) are both computed in
    // `_engine/fixed-costs.ts` from the capex schedule and the monthly fixed
    // costs — a stored per-unit figure was a derived value typed as an input.
  },
  yield: {
    shrinkAllowance: t(0.03, 'PLACEHOLDER', '% of seed, medium and nutrient cost', 'Seed sorted out before sowing and medium bought and never packed. Not stated for the farm; the working figure until closed sowings observe it'),
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
      'Allocation base for fixed manufacturing overhead. Units is the single-product base; labor hours becomes the base once the menu carries more than one grow plan.',
    ),
  },
  /**
   * The labor and overhead standards (`accounting-policy.md` §5): they stand in for an
   * actual cost until one is recorded, and are revised at reasonably regular intervals.
   */
  standardCost: {
    revisionIntervalMonths: t(
      12,
      'STATED',
      'months',
      'Interval at which standards are re-set. ASC 330-10-30-13 requires revision at reasonably regular intervals to reflect current conditions.',
    ),
    normalSpoilageBasis: t(
      'shrinkAllowance',
      'STATED',
      'reference',
      'The 3% shrink allowance IS the normal spoilage allowance and is inventoriable. Scrap beyond it is abnormal spoilage and is a period charge under ASC 330-10-30-7.',
    ),
  },
  // Roadmap N3 (2026-09-16): NOT the cost basis of any grow plan. The resolver
  // writes each grow plan's OWN labor standard over these — from its approved studies,
  // else its estimated study — and every page reads the grow plan's. These values
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
// The operating day and the production calendar
// ─────────────────────────────────────────────────────────────────────────

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
// Library status
// ─────────────────────────────────────────────────────────────────────────

/** Library status. Production Planning plans `in_service`; the others run singly. */
export type GrowPlanStatus = 'in_service' | 'planned' | 'developing';

export const GROW_PLAN_STATUS_LABELS: Record<GrowPlanStatus, string> = {
  in_service: 'In Service',
  planned: 'Planned',
  developing: 'Developing',
};

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

// Phase 1 operations: all planned volume is Subscriptions, from the subscribers' subscriptions.
// Restaurants and the retail and wholesale stay defined as channels, with no planned volume until
// they are booked. No channel carries a volume of its own: the resolver sums the subscribers'.
export const phases: readonly PhaseRow[] = [
  // Prices per 1020 flat: $30 on Subscriptions, stated by Rob; Restaurants and Retail and wholesale at $30, a PLACEHOLDER until quoted.
  { phase: 1, market: 'Subscriptions', character: 'Weekly, every-two-weeks and monthly flats, Saturday pickup at the house', pricePerUnit: 30, unitsPerDay: 0, operatingDays: 0 },
  { phase: 2, market: 'Restaurants', character: 'Weekly cut and live trays, year-round', pricePerUnit: 30, unitsPerDay: 0, operatingDays: 0 },
  { phase: 3, market: 'Retail and wholesale', character: 'Retail corner and wholesale accounts', pricePerUnit: 30, unitsPerDay: 0, operatingDays: 0 },
];

/** Per-channel unit profile. Both factors are one: a channel neither resizes the tray nor premiums its inputs. */
export interface PhaseProfile {
  phase: number;
  unitFactor: Tagged;
  premiumFactor: Tagged;
}

// A unit is a tray in the plan's format on every channel (outline §4): no channel multiplies it.
const ONE_TRAY = 'A unit is a tray in the plan\'s format; the same tray on every channel';
export const phaseProfiles: PhaseProfile[] = [
  { phase: 1, unitFactor: t(1.0, 'STATED', '×', ONE_TRAY), premiumFactor: t(1.0, 'STATED', '×', ONE_TRAY) },
  { phase: 2, unitFactor: t(1.0, 'STATED', '×', ONE_TRAY), premiumFactor: t(1.0, 'STATED', '×', ONE_TRAY) },
  { phase: 3, unitFactor: t(1.0, 'STATED', '×', ONE_TRAY), premiumFactor: t(1.0, 'STATED', '×', ONE_TRAY) },
];
