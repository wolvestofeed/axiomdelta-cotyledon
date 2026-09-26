/**
 * MicroFarm — emission factors and resource rates (reference data).
 *
 * Every factor here is VERSIONED STATIC REFERENCE DATA, never a live API call.
 * Each row carries the publisher, URL, version, effective date and a status
 * tag, so that every emission posting the engine produces can record exactly
 * which factor and version it used (ISO 14064-1 lineage). Factors are stored
 * in the publisher's native units; the engine (`_engine/carbon.ts`) does the
 * unit conversion and the CO2e arithmetic.
 *
 * Status tags follow docs/farm/CLAUDE.md §3. A factor tagged UNCONFIRMED was
 * cited through an aggregator or vendor page and has not yet been checked
 * against the primary publisher; it renders with that tag, not as sourced.
 *
 * Two GWP tables are carried on purpose: AR5 for the GHG inventory, AR4 where
 * the EPA AIM Act (40 CFR 84) requires it. Every posting records which one it
 * used.
 */

import { cropPlan, type StatusTag } from './plan-data';
import compiledFoodJson from './input-factors-compiled.json';

// ── Unit identities (arithmetic, not research figures) ──────────────────────

export const KG_PER_LB = 0.45359237;
export const KG_PER_OZ = KG_PER_LB / 16;

// ── Provenance envelope ────────────────────────────────────────────────────

export interface FactorProvenance {
  /** Stable id, e.g. 'epa-hub-2025:natural-gas'. Recorded on every posting. */
  id: string;
  source: string;
  sourceUrl: string;
  /** Publisher's release label, e.g. 'January 2025'. */
  version: string;
  /** ISO date the factor applies from. */
  effectiveFrom: string;
  status: StatusTag;
  note?: string;
}

// ── Global warming potentials ──────────────────────────────────────────────

export type GwpBasis = 'AR5' | 'AR4';

/** AR5 100-year GWPs for the inventory gases (EPA Hub 2025 carries AR5). */
export const gwpAR5 = {
  CH4: 28,
  N2O: 265,
  provenance: {
    id: 'ipcc-ar5:gwp100',
    source: 'IPCC AR5 100-year GWP as carried in the EPA GHG Emission Factors Hub',
    sourceUrl:
      'https://www.epa.gov/system/files/documents/2025-01/ghg-emission-factors-hub-2025.pdf',
    version: 'January 2025',
    effectiveFrom: '2025-01-01',
    status: 'SOURCED',
  } satisfies FactorProvenance,
} as const;

/**
 * AR4 exchange values for refrigerants, as used by 40 CFR 84. Only the
 * refrigerants the facility is expected to carry are listed; add a row when a
 * circuit is registered with a refrigerant not here.
 */
export const refrigerantGwpAR4: Record<string, { gwp: number; provenance: FactorProvenance }> = {
  'R-404A': {
    gwp: 3922,
    provenance: {
      id: 'cfr-40-84-a:r-404a',
      source: '40 CFR 84 Subpart A exchange values (AR4)',
      sourceUrl: 'https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-84',
      version: 'AR4',
      effectiveFrom: '2026-01-01',
      status: 'UNCONFIRMED',
      note: 'Not yet checked against the Subpart A table.',
    },
  },
};

// ── Scope 1: stationary and mobile combustion (EPA Hub, January 2025) ─────

export type FuelId = 'naturalGas' | 'propaneGas' | 'propaneLiquid' | 'gasoline' | 'diesel';
export type BillUnit = 'scf' | 'ccf' | 'therm' | 'mmbtu' | 'gal';

export interface CombustionFactor {
  fuel: FuelId;
  label: string;
  /** Native bill unit for heat content. */
  heatContentUnit: 'scf' | 'gal';
  /** MMBtu per heatContentUnit. */
  heatContentMmbtuPerUnit: number;
  co2KgPerMmbtu: number;
  ch4GPerMmbtu: number;
  n2oGPerMmbtu: number;
  provenance: FactorProvenance;
}

const hubProvenance = (slug: string, note?: string): FactorProvenance => ({
  id: `epa-hub-2025:${slug}`,
  source: 'EPA GHG Emission Factors Hub, Table 1 (stationary combustion)',
  sourceUrl:
    'https://www.epa.gov/system/files/documents/2025-01/ghg-emission-factors-hub-2025.pdf',
  version: 'January 2025',
  effectiveFrom: '2025-01-01',
  status: 'SOURCED',
  note,
});

export const combustionFactors: Record<FuelId, CombustionFactor> = {
  naturalGas: {
    fuel: 'naturalGas',
    label: 'Natural gas',
    heatContentUnit: 'scf',
    heatContentMmbtuPerUnit: 0.001026,
    co2KgPerMmbtu: 53.06,
    ch4GPerMmbtu: 1.0,
    n2oGPerMmbtu: 0.1,
    provenance: hubProvenance('natural-gas'),
  },
  propaneGas: {
    fuel: 'propaneGas',
    label: 'Propane (gas)',
    heatContentUnit: 'scf',
    heatContentMmbtuPerUnit: 0.002516,
    co2KgPerMmbtu: 61.46,
    ch4GPerMmbtu: 3.0,
    n2oGPerMmbtu: 0.6,
    provenance: hubProvenance('propane-gas'),
  },
  propaneLiquid: {
    fuel: 'propaneLiquid',
    label: 'Propane (liquid)',
    heatContentUnit: 'gal',
    heatContentMmbtuPerUnit: 0.091,
    co2KgPerMmbtu: 62.87,
    ch4GPerMmbtu: 3.0,
    n2oGPerMmbtu: 0.6,
    provenance: hubProvenance('propane-liquid'),
  },
  gasoline: {
    fuel: 'gasoline',
    label: 'Motor gasoline',
    heatContentUnit: 'gal',
    heatContentMmbtuPerUnit: 0.125,
    co2KgPerMmbtu: 70.22,
    ch4GPerMmbtu: 3.0,
    n2oGPerMmbtu: 0.6,
    provenance: hubProvenance(
      'gasoline',
      'CH4 and N2O are the stationary-combustion values; vehicle use needs the per-mile mobile table.',
    ),
  },
  diesel: {
    fuel: 'diesel',
    label: 'Distillate fuel oil No. 2 (diesel)',
    heatContentUnit: 'gal',
    heatContentMmbtuPerUnit: 0.138,
    co2KgPerMmbtu: 73.96,
    ch4GPerMmbtu: 3.0,
    n2oGPerMmbtu: 0.6,
    provenance: hubProvenance(
      'diesel',
      'CH4 and N2O are the stationary-combustion values; vehicle use needs the per-mile mobile table.',
    ),
  },
};

// ── Scope 2: grid electricity (EPA eGRID, ERCT subregion) ─────────────────

export interface GridFactor {
  subregion: string;
  label: string;
  co2LbPerMwh: number;
  ch4LbPerMwh: number;
  n2oLbPerMwh: number;
  provenance: FactorProvenance;
}

export const gridFactorERCT: GridFactor = {
  subregion: 'ERCT',
  label: 'ERCOT All (eGRID subregion ERCT)',
  co2LbPerMwh: 771.1,
  ch4LbPerMwh: 0.05,
  n2oLbPerMwh: 0.01,
  provenance: {
    id: 'epa-egrid:erct',
    source: 'EPA eGRID, ERCT subregion output emission rates',
    sourceUrl: 'https://www.epa.gov/egrid',
    version: 'data year not yet pinned',
    effectiveFrom: '2024-01-01',
    status: 'UNCONFIRMED',
    note: 'Values cited through aggregators; pin the eGRID data year and release on epa.gov/egrid.',
  },
};

// ── Scope 3: freight (EPA SmartWay average) ────────────────────────────────

export const freightFactorSmartWay = {
  gCo2PerTonMile: 161.8,
  provenance: {
    id: 'epa-smartway:avg-truck',
    source: 'EPA SmartWay truck carrier average, weight-based',
    sourceUrl:
      'https://www.epa.gov/smartway/smartway-high-performers-truck-carriers-carbon-metrics',
    version: '2021 carrier benchmarking',
    effectiveFrom: '2021-01-01',
    status: 'SOURCED',
    note: 'A network average benchmark, not a facility- or carrier-specific factor.',
  } satisfies FactorProvenance,
} as const;

// ── Scope 3: waste (EPA WARM v15, organics) ───────────────────────────────

export type WastePathway = 'landfill' | 'compost';

export const warmFoodWaste: Record<WastePathway, { mtco2ePerShortTon: number; provenance: FactorProvenance }> = {
  landfill: {
    mtco2ePerShortTon: 0.68,
    provenance: {
      id: 'epa-warm-v15:food-waste-landfill',
      source: 'EPA WARM v15, organic materials documentation',
      sourceUrl:
        'https://www.epa.gov/pickup-points/default/files/2020-12/documents/warm_organic_materials_v15_10-29-2020.pdf',
      version: 'v15 (2020-10)',
      effectiveFrom: '2020-10-29',
      status: 'UNCONFIRMED',
      note: 'Not yet checked against the v15 PDF; a second extract repeated 0.68 for every category, which weakens it.',
    },
  },
  compost: {
    mtco2ePerShortTon: -0.18,
    provenance: {
      id: 'epa-warm-v15:food-waste-compost',
      source: 'EPA WARM v15, organic materials documentation',
      sourceUrl:
        'https://www.epa.gov/pickup-points/default/files/2020-12/documents/warm_organic_materials_v15_10-29-2020.pdf',
      version: 'v15 (2020-10)',
      effectiveFrom: '2020-10-29',
      status: 'UNCONFIRMED',
      note: 'Not yet checked against the v15 PDF.',
    },
  },
};

// ── Scope 3: purchased food (Poore & Nemecek 2018, Data S2 workbook) ──────

export type FoodStage =
  | 'lucBurn'
  | 'lucCStock'
  | 'feed'
  | 'farm'
  | 'processing'
  | 'transportStorage'
  | 'packaging'
  | 'retail'
  | 'loss';

export const FOOD_STAGE_LABEL: Record<FoodStage, string> = {
  lucBurn: 'Land-use change, burning',
  lucCStock: 'Land-use change, carbon stock',
  feed: 'Feed',
  farm: 'Farm',
  processing: 'Processing',
  transportStorage: 'Transport and storage',
  packaging: 'Packaging',
  retail: 'Retail',
  loss: 'Losses',
};

export interface FoodFactor {
  /** Food category key (slug of the study's product name), e.g. 'rice'. */
  category: string;
  label: string;
  kgCo2ePerKg: number;
  /** The study's nine stages; they sum to `kgCo2ePerKg`. */
  stages: Record<FoodStage, number>;
  /** Additional retail-weight impacts from the same rows. */
  landM2yPerKg: number;
  eutrKgPo4ePerKg: number;
  waterLPerKg: number;
  /** Observations behind the mean. */
  n: number;
  provenance: FactorProvenance;
}

interface CompiledInputFactors {
  generatedAt: string;
  note: string;
  source: {
    name: string;
    citation: string;
    doi: string;
    workbook: string;
    observationsUsed: number;
    products: number;
  };
  products: {
    num: number;
    product: string;
    category: string;
    n: number;
    countries: number;
    ghgKgCo2ePerKg: number;
    landM2yPerKg: number;
    eutrKgPo4ePerKg: number;
    waterLPerKg: number;
    ghgStagesKgCo2ePerKg: Record<FoodStage, number>;
  }[];
}

const compiledFood = compiledFoodJson as unknown as CompiledInputFactors;

export const foodFactorSource: FactorProvenance = {
  id: 'poore-nemecek-2018:data-s2',
  source: `${compiledFood.source.name}, ${compiledFood.source.citation}; ${compiledFood.source.workbook}`,
  sourceUrl: compiledFood.source.doi,
  version: `Data S2 v0, compiled ${compiledFood.generatedAt.slice(0, 10)}`,
  effectiveFrom: '2018-06-01',
  status: 'SOURCED',
  note: 'Observation-weighted means per product, computed from the study workbook (pnpm farm:input-factors). Retail-weight basis, losses included.',
};

/**
 * The study's 43 top-level products. Generated from the workbook by
 * `scripts/generate-farm-input-factors.py`; never hand-edited.
 */
export const inputFactors: FoodFactor[] = compiledFood.products.map((p) => ({
  category: p.category,
  label: p.product,
  kgCo2ePerKg: p.ghgKgCo2ePerKg,
  stages: p.ghgStagesKgCo2ePerKg,
  landM2yPerKg: p.landM2yPerKg,
  eutrKgPo4ePerKg: p.eutrKgPo4ePerKg,
  waterLPerKg: p.waterLPerKg,
  n: p.n,
  provenance: { ...foodFactorSource, id: `${foodFactorSource.id}:${p.category}` },
}));

/**
 * Crop plan input → study product. Keyed by `crop plan.inputs[].name`.
 * `category: null` means the input has no product in the study and is
 * excluded from the food footprint with the reason shown. Inputs bought
 * by the piece need a mass per piece; that mass carries its own status tag.
 */
export interface CropPlanFoodMapping {
  category: string | null;
  massKgPerEach?: number;
  massStatus?: StatusTag;
  note?: string;
}

const tortillaLine = (() => {
  const l = cropPlan.inputs.find((i) => i.name === 'Corn tortilla, 6 in');
  if (!l || l.unitMassOz === undefined) throw new Error('Corn tortilla line must carry unitMassOz');
  return { unitMassOz: l.unitMassOz, yieldStatus: l.yieldStatus };
})();

export const cropPlanFoodCategoryMap: Record<string, CropPlanFoodMapping> = {
  'Ground beef, 85/15': { category: 'bovine-meat-beef-herd' },
  'Pinto beans, dry': { category: 'beans-pulses' },
  'Brown rice, long grain': { category: 'rice' },
  'Seasonal vegetables': { category: 'other-vegetables', note: 'Squash, peppers, onion mix mapped to the study\'s "Other Vegetables".' },
  'Tomato, crushed': { category: 'tomatoes' },
  'Onion, yellow': { category: 'onions-and-leeks' },
  'Garlic, peeled': { category: 'onions-and-leeks', note: 'Allium; the study has no garlic product.' },
  'Corn tortilla, 6 in': {
    category: 'maize-unit',
    // One constant, not two: the mass per piece is the crop plan line's `unitMassOz`
    // (USDA FoodData Central, generic 6-inch corn tortilla) and carries that
    // line's tag. The actual product has not been weighed.
    massKgPerEach: tortillaLine.unitMassOz * KG_PER_OZ,
    massStatus: tortillaLine.yieldStatus,
    note: 'Mass per 6-inch tortilla is the crop plan line\'s unit mass (USDA FoodData Central, generic product); the actual product has not been weighed.',
  },
  'Cheddar, shredded': { category: 'cheese' },
  'Chili-cumin spice blend': { category: null, note: 'No spice product in the study; small mass.' },
  'Sea salt': { category: null, note: 'Mineral, not a food LCA product in the study.' },
  'Sunflower oil, high oleic': { category: 'sunflower-oil' },
};

// ── Scope 1: refrigerant leak-repair rules (EPA AIM Act, 40 CFR 84 Subpart C)

export const aimActRules = {
  /** Applicability: appliances with at least this charge... */
  applicabilityMinChargeLb: 15,
  /** ...of a refrigerant with a GWP above this. */
  applicabilityMinGwp: 53,
  /** Commercial refrigeration annualized leak-rate trigger. */
  commercialRefrigerationTriggerRate: 0.2,
  /** Repair window after a trigger, in days. */
  repairWindowDays: 30,
  /** Chronic-leak threshold: refrigerant added in a calendar year as a share of full charge. */
  chronicLeakShareOfCharge: 1.25,
  /** Chronic-leak report due date (month, day) in the following year. */
  chronicReportDue: { month: 3, day: 1 },
  provenance: {
    id: 'cfr-40-84-c:leak-repair',
    source: 'EPA AIM Act leak repair provisions, 40 CFR 84 Subpart C',
    sourceUrl: 'https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-84/subpart-C',
    version: 'effective 2026-01-01',
    effectiveFrom: '2026-01-01',
    status: 'UNCONFIRMED',
    note: 'Thresholds cited through vendor pages; verify against the eCFR text.',
  } satisfies FactorProvenance,
} as const;

export const greenBlackoutCriteria = {
  maxAggregateLeakRate: 0.15,
  maxGwpNewEquipment: 150,
  provenance: {
    id: 'epa-greenchill:certification',
    source: 'EPA GreenBlackout store certification criteria',
    sourceUrl: 'https://www.epa.gov/greenchill',
    version: 'as reported 2025',
    effectiveFrom: '2025-01-01',
    status: 'UNCONFIRMED',
    note: 'Criteria cited through an industry report; verify on epa.gov/greenchill.',
  } satisfies FactorProvenance,
} as const;

// ── Water and effluent (City of Austin pretreatment surcharge) ─────────────

export const austinWaterEffluent = {
  limits: {
    bodMgL: 200,
    tssMgL: 200,
    codMgL: 450,
    fogMgL: 200,
  },
  /** Branch selector: COD ≤ ratio × BOD uses the BOD formula, else the COD formula. */
  codToBodRatioThreshold: 2.25,
  /** lb per gallon of water. */
  lbPerGallon: 8.34,
  unitCharges: {
    bodPerLb: 0.8211,
    tssPerLb: 0.77,
    codPerLb: 0.3644,
  },
  greaseTrap: {
    maxIntervalDays: 90,
    pumpOutFillFraction: 0.5,
  },
  provenance: {
    limits: {
      id: 'austin-water:pretreatment-limits',
      source: 'Austin Water Pretreatment Surcharge Program; Austin City Code Chapter 15-10',
      sourceUrl: 'https://www.austintexas.gov/water/pretreatment-surcharge-program',
      version: 'as published',
      effectiveFrom: '2025-01-01',
      status: 'SOURCED',
    } satisfies FactorProvenance,
    unitCharges: {
      id: 'austin-water:surcharge-unit-charges',
      source: 'Austin Water Pretreatment Surcharge Program rate schedule',
      sourceUrl: 'https://www.austintexas.gov/water/pretreatment-surcharge-program',
      version: 'fiscal year not yet confirmed',
      effectiveFrom: '2025-01-01',
      status: 'DATED',
      note: 'Confirm the current fiscal-year schedule.',
    } satisfies FactorProvenance,
    greaseTrap: {
      id: 'austin-water:grease-trap',
      source: 'Austin Water grease trap maintenance requirements',
      sourceUrl: 'https://www.austintexas.gov/water/grease-trap-maintenance',
      version: 'as published',
      effectiveFrom: '2025-01-01',
      status: 'SOURCED',
    } satisfies FactorProvenance,
  },
} as const;

// ── Utility rebates (Austin Energy commercial programme) ──────────────────

export interface RebateLine {
  category: string;
  rebate: string;
  condition: string;
}

/** Inventory of published incentives, not a recommendation. Two readings are on file; this is the first. */
export const austinEnergyRebates: { lines: RebateLine[]; bonus: string; provenance: FactorProvenance } = {
  lines: [
    { category: 'Commercial farm appliances', rebate: 'Varies by unit; e.g. up to $1,525 conveyor dishwasher, $2,000 steam cooker', condition: 'ENERGY STAR certified (except pre-rinse spray valves)' },
    { category: 'Variable frequency drives', rebate: '$480–$625 per kW saved', condition: 'Motor loads on HVAC or exhaust' },
    { category: 'EC motors', rebate: '$420–$550 per kW saved', condition: 'Walk-in evaporator fans, condensers' },
    { category: 'Heat pump water heaters', rebate: '$800–$1,000 per unit', condition: 'Qualified high-efficiency models' },
    { category: 'Energy recovery ventilators', rebate: '$420–$550 per kW saved', condition: 'Hood exhaust heat recovery' },
  ],
  bonus: '+30% for locally owned small businesses, 501(c)(3) organisations and houses of worship on Tier 1 or Tier 2 rates',
  provenance: {
    id: 'austin-energy:commercial-rebates',
    source: 'Austin Energy commercial rebates and incentives',
    sourceUrl: 'https://austinenergy.com/energy-efficiency/rebates-incentives/commercial',
    version: 'programme year not yet confirmed',
    effectiveFrom: '2025-01-01',
    status: 'DATED',
    note: 'A second reading gives single values at the top of these ranges and adds cooling towers, lighting and smart thermostats; confirm the current programme year.',
  },
};

// ── Registry — every provenance record in one place, for the audit surface ─

export const factorRegistry: FactorProvenance[] = [
  gwpAR5.provenance,
  ...Object.values(refrigerantGwpAR4).map((r) => r.provenance),
  ...Object.values(combustionFactors).map((f) => f.provenance),
  gridFactorERCT.provenance,
  freightFactorSmartWay.provenance,
  warmFoodWaste.landfill.provenance,
  warmFoodWaste.compost.provenance,
  foodFactorSource,
  ...inputFactors.map((f) => f.provenance),
  aimActRules.provenance,
  greenBlackoutCriteria.provenance,
  austinWaterEffluent.provenance.limits,
  austinWaterEffluent.provenance.unitCharges,
  austinWaterEffluent.provenance.greaseTrap,
  austinEnergyRebates.provenance,
];
