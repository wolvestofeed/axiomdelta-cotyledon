/**
 * Impact OS — USDA NSLP meal pattern and crediting constants.
 *
 * These are the external constraints the recipe is authored against. The plated
 * portion is not a preference: it is the weight that delivers a stated crediting
 * contribution for a stated grade group. Everything here is effective-dated,
 * because the pattern changes on a school-year boundary and a batch record has
 * to name the pattern in force on its production date.
 *
 * Sources are cited per row. 7 CFR 210.10(c) is the pattern; the Food Buying
 * Guide and Exhibit A are the conversion tables.
 */

import type { StatusTag } from './tagged';

export type GradeGroup = 'K-5' | '6-8' | '9-12';

export type MealComponent = 'MMA' | 'GRAINS' | 'VEG' | 'FRUIT' | 'MILK';

export type VegSubgroup =
  | 'DARK_GREEN'
  | 'RED_ORANGE'
  | 'BEANS_PEAS_LENTILS'
  | 'STARCHY'
  | 'OTHER'
  | 'ADDITIONAL';

/** Exhibit A grain groups. A–G are weight-based; H and I have their own rules. */
export type GrainGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

export interface ComponentRequirement {
  /** Daily minimum. Hard — enforced at review. */
  dailyMin: number;
  /** Weekly minimum over a 5-day week. Hard. */
  weeklyMin: number;
  /**
   * Weekly maximum as printed in 7 CFR 210.10(c). NOT enforced: USDA SP 10-2012
   * (v.9), 2015-08-03 — "the weekly maximums for these food components are not
   * enforced and State agencies determine compliance based on the required daily
   * and weekly minimum quantities." Carried as an advisory bound.
   */
  weeklyMaxAdvisory: number | null;
  unit: 'oz eq' | 'cup';
}

export interface LunchPattern {
  /** School years this pattern applies to, ISO dates. */
  effectiveFrom: string;
  effectiveTo: string | null;
  gradeGroup: GradeGroup;
  mma: ComponentRequirement;
  grains: ComponentRequirement;
  vegetables: ComponentRequirement;
  fruit: ComponentRequirement;
  milk: ComponentRequirement;
  /** Weekly vegetable subgroup minimums, cups. No daily minimum applies. */
  vegSubgroupWeeklyMin: Record<Exclude<VegSubgroup, 'ADDITIONAL'> | 'ADDITIONAL', number>;
  citation: string;
}

const CITATION_210_10 =
  '7 CFR 210.10(c); USDA FNS NSLP meal pattern. Component quantities unchanged by the 2024 final rule (89 FR 31962).';

/**
 * NSLP lunch pattern. Component quantities have been stable since SY 2012-13 and
 * were not changed by the 2024 final rule — only the nutrient specifications
 * (added sugars, sodium) change on 2027-07-01, so one row covers both school
 * years for component purposes.
 */
export const LUNCH_PATTERNS: readonly LunchPattern[] = [
  {
    effectiveFrom: '2012-07-01',
    effectiveTo: null,
    gradeGroup: 'K-5',
    mma: { dailyMin: 1, weeklyMin: 8, weeklyMaxAdvisory: 10, unit: 'oz eq' },
    grains: { dailyMin: 1, weeklyMin: 8, weeklyMaxAdvisory: 9, unit: 'oz eq' },
    vegetables: { dailyMin: 0.75, weeklyMin: 3.75, weeklyMaxAdvisory: null, unit: 'cup' },
    fruit: { dailyMin: 0.5, weeklyMin: 2.5, weeklyMaxAdvisory: null, unit: 'cup' },
    milk: { dailyMin: 1, weeklyMin: 5, weeklyMaxAdvisory: null, unit: 'cup' },
    vegSubgroupWeeklyMin: {
      DARK_GREEN: 0.5,
      RED_ORANGE: 0.75,
      BEANS_PEAS_LENTILS: 0.5,
      STARCHY: 0.5,
      OTHER: 0.5,
      ADDITIONAL: 1,
    },
    citation: CITATION_210_10,
  },
  {
    effectiveFrom: '2012-07-01',
    effectiveTo: null,
    gradeGroup: '6-8',
    mma: { dailyMin: 1, weeklyMin: 9, weeklyMaxAdvisory: 10, unit: 'oz eq' },
    grains: { dailyMin: 1, weeklyMin: 8, weeklyMaxAdvisory: 10, unit: 'oz eq' },
    vegetables: { dailyMin: 0.75, weeklyMin: 3.75, weeklyMaxAdvisory: null, unit: 'cup' },
    fruit: { dailyMin: 0.5, weeklyMin: 2.5, weeklyMaxAdvisory: null, unit: 'cup' },
    milk: { dailyMin: 1, weeklyMin: 5, weeklyMaxAdvisory: null, unit: 'cup' },
    vegSubgroupWeeklyMin: {
      DARK_GREEN: 0.5,
      RED_ORANGE: 0.75,
      BEANS_PEAS_LENTILS: 0.5,
      STARCHY: 0.5,
      OTHER: 0.5,
      ADDITIONAL: 1,
    },
    citation: CITATION_210_10,
  },
  {
    effectiveFrom: '2012-07-01',
    effectiveTo: null,
    gradeGroup: '9-12',
    mma: { dailyMin: 2, weeklyMin: 10, weeklyMaxAdvisory: 12, unit: 'oz eq' },
    grains: { dailyMin: 2, weeklyMin: 10, weeklyMaxAdvisory: 12, unit: 'oz eq' },
    vegetables: { dailyMin: 1, weeklyMin: 5, weeklyMaxAdvisory: null, unit: 'cup' },
    fruit: { dailyMin: 1, weeklyMin: 5, weeklyMaxAdvisory: null, unit: 'cup' },
    milk: { dailyMin: 1, weeklyMin: 5, weeklyMaxAdvisory: null, unit: 'cup' },
    vegSubgroupWeeklyMin: {
      DARK_GREEN: 0.5,
      RED_ORANGE: 1.25,
      BEANS_PEAS_LENTILS: 0.5,
      STARCHY: 0.5,
      OTHER: 0.75,
      ADDITIONAL: 1.5,
    },
    citation: CITATION_210_10,
  },
] as const;

export function lunchPattern(grade: GradeGroup, onDate = '2026-09-01'): LunchPattern {
  const row = LUNCH_PATTERNS.find(
    (p) =>
      p.gradeGroup === grade &&
      p.effectiveFrom <= onDate &&
      (p.effectiveTo === null || p.effectiveTo >= onDate),
  );
  if (!row) throw new Error(`No NSLP lunch pattern for ${grade} effective ${onDate}`);
  return row;
}

// ── Exhibit A — grams of food per 1 oz eq of grain ──────────────────────────

/**
 * Exhibit A: Grain Requirements for Child Nutrition Programs. Groups A–G are a
 * served-weight basis. Group H (cereal grains, rice, pasta) credits at 1/2 cup
 * cooked OR 1 oz (28 g) dry per oz eq. Group I is RTE cereal by volume.
 */
export const EXHIBIT_A_GRAMS_PER_OZ_EQ: Record<Exclude<GrainGroup, 'H' | 'I'>, number> = {
  A: 22,
  B: 28,
  C: 34,
  D: 55,
  E: 69,
  F: 82,
  G: 125,
};

/** Group H: 1/2 cup cooked = 1 oz eq. Expressed as cups cooked per oz eq. */
export const GROUP_H_CUPS_COOKED_PER_OZ_EQ = 0.5;
/** Group H alternative: 1 oz (28 g) dry = 1 oz eq. */
export const GROUP_H_GRAMS_DRY_PER_OZ_EQ = 28;

// ── Meat / meat alternate conversions ───────────────────────────────────────

/** Cooked lean meat, poultry or fish without bone: 1 oz = 1 oz eq. */
export const MMA_OZ_PER_OZ_EQ_COOKED_MEAT = 1;
/** Natural or processed cheese: 1 oz = 1 oz eq. */
export const MMA_OZ_PER_OZ_EQ_CHEESE = 1;
/** Cooked dry beans, peas and lentils: 1/4 cup = 1 oz eq. */
export const MMA_CUPS_PER_OZ_EQ_COOKED_LEGUME = 0.25;

/**
 * 7 CFR 210.10(c)(2)(ii)(C): "Cooked dry beans, peas, and lentils may be counted
 * as either a vegetable or as a meat alternate but not as both in the same dish."
 * A legume line therefore carries a single election.
 */
export const LEGUME_ELECTION_RULE =
  '7 CFR 210.10(c)(2)(ii)(C) — cooked dry beans, peas and lentils count as either a vegetable or a meat alternate, not both in the same dish.';

// ── Rounding ────────────────────────────────────────────────────────────────

/**
 * USDA crediting rounds DOWN to the nearest 1/4 oz eq, never to nearest.
 * 1.49 -> 1.25, 1.27 -> 1.25, 1.24 -> 1.00.
 */
export function roundDownToQuarterOzEq(ozEq: number): number {
  return Math.floor(ozEq * 4) / 4;
}

/** Fruit and vegetable minimum creditable serving: 1/8 cup. */
export const MIN_CREDITABLE_CUP = 0.125;

/** Volume credit rounds down to the nearest 1/8 cup. */
export function roundDownToEighthCup(cups: number): number {
  return Math.floor(cups * 8) / 8;
}

// ── Unit helpers ────────────────────────────────────────────────────────────

export const GRAMS_PER_OZ = 28.349523125;
export const OZ_PER_LB = 16;

export const ozToGrams = (oz: number) => oz * GRAMS_PER_OZ;
export const gramsToOz = (g: number) => g / GRAMS_PER_OZ;

/**
 * Volume of a cooked food from its weight, given the weight of one cup. This is
 * the conversion that turns a cook-chill batch weight into a crediting volume;
 * without a sourced cup weight a food cannot be credited by volume at all, which
 * is why `cupWeightG` is required on every volume-credited line.
 */
export function ozToCups(oz: number, cupWeightG: number): number {
  return ozToGrams(oz) / cupWeightG;
}

// ── Production records ──────────────────────────────────────────────────────

/**
 * 7 CFR 210.10(a)(3) states the demonstrative standard — records must show "how
 * the meals offered contribute to the required meal components and food
 * quantities for each age/grade group every day" — and does not enumerate fields.
 * The element list below is the operational standard from the FNS Menu Planner
 * for School Meals Ch. 4 and state agency guidance, which is what Administrative
 * Reviews test against. It is guidance-derived, not codified.
 */
export const PRODUCTION_RECORD_ELEMENTS = {
  beforeService: [
    'Site name, school year, date',
    'Grade group(s) served',
    'Meal type',
    'Offer versus Serve status and the grades it applies to',
    'Complete daily menu including milk types, condiments and non-creditable items',
    'Recipe name and number, or product name and product code',
    'Planned portion size per grade group with the unit of measure',
    'Meal component contribution per portion (oz eq for M/MA and grains; cups for fruit, vegetables, milk)',
    'Planned servings and planned quantity in purchase units',
    'Planned reimbursable meal counts by grade group, and non-reimbursable counts',
  ],
  duringService: ['Food temperatures at required holding temperatures'],
  afterService: [
    'Substitutions made',
    'Total servings prepared and total servings served',
    'Leftover quantity per item and its intended use',
    'Milk counts by type',
    'Total reimbursable and non-reimbursable meals served',
    'Signature and date of the person in charge of the site',
  ],
  /** 7 CFR 210.9(b)(17) — three years after the final claim for reimbursement. */
  retentionYears: 3,
  citation:
    '7 CFR 210.10(a)(3) production and menu records; retention 7 CFR 210.9(b)(17). Element list from FNS Menu Planner for School Meals Ch. 4 (guidance, not codified).',
} as const;

// ── Crediting spec carried by an ingredient line ────────────────────────────

/**
 * How one ingredient line credits. It lives on the line because crediting is a
 * property of the food, not of the recipe that uses it. Volume-credited foods
 * (vegetables, legumes, Group H grains) require a sourced cooked cup weight —
 * without one the engine refuses to credit the line rather than guessing a
 * density.
 */
export interface CreditingSpec {
  component: 'MMA' | 'GRAINS' | 'VEG' | 'FRUIT' | 'NONE';
  vegSubgroup?: Exclude<VegSubgroup, 'ADDITIONAL'>;
  grainGroup?: GrainGroup;
  /** Grams per cup of the COOKED food. */
  cupWeightG?: number;
  /** Grams per each-unit, for `unit: 'each'` lines. */
  unitWeightG?: number;
  /** Legumes only — one election, per 7 CFR 210.10(c)(2)(ii)(C). */
  legumeElection?: 'MMA' | 'VEG';
  status: StatusTag;
  source: string;
}
