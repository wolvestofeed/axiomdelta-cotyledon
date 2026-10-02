/**
 * Cotyledon — emission factors and resource rates (reference data).
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

import type { StatusTag } from '@/data/tagged';
import compiledFoodJson from '@/data/input-factors-compiled.json';

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
  co2LbPerMwh: 733.9,
  ch4LbPerMwh: 0.043,
  n2oLbPerMwh: 0.006,
  provenance: {
    id: 'epa-egrid:erct',
    source: 'EPA eGRID2023 Summary Tables, Table 1, subregion output emission rates, ERCT',
    sourceUrl: 'https://www.epa.gov/system/files/documents/2025-06/summary_tables_rev2.pdf',
    version: 'eGRID2023 Revision 2 (released 12 June 2025; tables produced 27 March 2025)',
    effectiveFrom: '2025-06-12',
    status: 'SOURCED',
    note: 'Total output rates, lb/MWh; the table also prints CO2e 736.6. The 771.1 / 0.049 / 0.007 row this replaced was eGRID2022 (January 2024). Read 2 October 2026.',
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

// ── Scope 3: freight by mode (EPA Hub, January 2025, Table 8) ─────────────

export type FreightMode = 'truck' | 'rail' | 'water' | 'air';

export interface FreightModeFactor {
  mode: FreightMode;
  label: string;
  /** kg CO2 per short ton-mile. */
  co2KgPerTonMile: number;
  /** g per short ton-mile. */
  ch4GPerTonMile: number;
  n2oGPerTonMile: number;
  provenance: FactorProvenance;
}

const hubFreightProvenance = (slug: string): FactorProvenance => ({
  id: `epa-hub-2025:table-8:${slug}`,
  source: 'EPA GHG Emission Factors Hub, Table 8 (Scope 3 categories 4 and 9, upstream and downstream transportation), ton-mile rows',
  sourceUrl: 'https://www.epa.gov/system/files/documents/2025-01/ghg-emission-factors-hub-2025.pdf',
  version: 'January 2025 (last modified 15 January 2025)',
  effectiveFrom: '2025-01-15',
  status: 'SOURCED',
  note: 'Per short ton-mile; combustion only (tank to wheel); for a vehicle shared with other shippers\' goods. Freight ton-miles from BTS National Transportation Statistics 2024, Table 1-50 (2022 data).',
});

/** The Hub's four freight modes. Seed by parcel ground and a mat by truck are `truck`; coir from South Asia is `water` to the port, then `truck`. */
export const freightFactorsHub: Record<FreightMode, FreightModeFactor> = {
  truck: { mode: 'truck', label: 'Medium- and heavy-duty truck', co2KgPerTonMile: 0.186, ch4GPerTonMile: 0.0016, n2oGPerTonMile: 0.0054, provenance: hubFreightProvenance('truck') },
  rail: { mode: 'rail', label: 'Rail', co2KgPerTonMile: 0.021, ch4GPerTonMile: 0.0016, n2oGPerTonMile: 0.0005, provenance: hubFreightProvenance('rail') },
  water: { mode: 'water', label: 'Waterborne craft', co2KgPerTonMile: 0.077, ch4GPerTonMile: 0.031, n2oGPerTonMile: 0.002, provenance: hubFreightProvenance('water') },
  air: { mode: 'air', label: 'Aircraft', co2KgPerTonMile: 1.086, ch4GPerTonMile: 0, n2oGPerTonMile: 0.0334, provenance: hubFreightProvenance('air') },
};

// ── Scope 3: waste (EPA WARM v15, organics and packaging) ─────────────────

export type WastePathway = 'landfill' | 'compost';

const WARM_ORGANICS_URL = 'https://www.epa.gov/sites/default/files/2020-12/documents/warm_organic_materials_v15_10-29-2020.pdf';
const WARM_PACKAGING_URL = 'https://www.epa.gov/sites/default/files/2020-12/documents/warm_containers_packaging_and_non-durable_goods_materials_v15_10-29-2020.pdf';

const warmProvenance = (slug: string, source: string, sourceUrl: string, locator: string): FactorProvenance => ({
  id: `epa-warm-v15:${slug}`,
  source,
  sourceUrl,
  version: 'WARM Version 15 (November 2020)',
  effectiveFrom: '2020-11-01',
  status: 'SOURCED',
  note: `${locator}. Net factor, MTCO2E per short ton, national-average landfill gas management. EPA now publishes WARM Version 16; its factors are not yet read.`,
});

/** Food waste by pathway. WARM does not differentiate end-of-life by food type: every food row carries the same four pathway factors. */
export const warmFoodWaste: Record<WastePathway, { mtco2ePerShortTon: number; provenance: FactorProvenance }> = {
  landfill: {
    mtco2ePerShortTon: 0.5,
    provenance: warmProvenance('food-waste-landfill', 'EPA WARM v15, Organic Materials Chapters: food waste, landfilling', WARM_ORGANICS_URL, 'Exhibit 1-10 (summary) and Exhibit 1-46 (transport 0.02, landfill CH4 0.62, avoided energy −0.06, carbon storage −0.09)'),
  },
  compost: {
    mtco2ePerShortTon: -0.12,
    provenance: warmProvenance('food-waste-compost', 'EPA WARM v15, Organic Materials Chapters: food waste, composting', WARM_ORGANICS_URL, 'Exhibit 1-10 (summary) and Exhibit 1-43 (transport and turning 0.03, fugitive 0.12, fertilizer offset −0.03, soil carbon storage −0.24)'),
  },
};

/** Yard trimmings by pathway: the row a spent growing mat with its roots is read against until a mat-specific factor exists. */
export const warmYardTrimmings: Record<WastePathway, { mtco2ePerShortTon: number; provenance: FactorProvenance }> = {
  landfill: {
    mtco2ePerShortTon: -0.2,
    provenance: warmProvenance('yard-trimmings-landfill', 'EPA WARM v15, Organic Materials Chapters: yard trimmings, landfilling', WARM_ORGANICS_URL, 'Exhibit 2-4 (summary) and Exhibit 2-8 (transport 0.02, landfill CH4 0.34, avoided energy −0.03, carbon storage −0.54)'),
  },
  compost: {
    mtco2ePerShortTon: -0.05,
    provenance: warmProvenance('yard-trimmings-compost', 'EPA WARM v15, Organic Materials Chapters: yard trimmings, composting', WARM_ORGANICS_URL, 'Exhibit 2-4 (summary) and Exhibit 2-5 (transport 0.02, fugitive 0.17, soil carbon storage −0.24)'),
  },
};

export type PackagingPathway = 'recycling' | 'landfill' | 'combustion';

/** Packaging materials by pathway, for tray sets, labels, bags and inserts at end of life. */
export const warmPackaging: Record<'mixedPaper' | 'mixedPlastics', { label: string; mtco2ePerShortTon: Record<PackagingPathway, number>; provenance: FactorProvenance }> = {
  mixedPaper: {
    label: 'Mixed paper (general)',
    mtco2ePerShortTon: { recycling: -3.55, landfill: 0.07, combustion: -0.49 },
    provenance: warmProvenance('mixed-paper', 'EPA WARM v15, Containers, Packaging and Non-Durable Goods Chapters: mixed paper (general)', WARM_PACKAGING_URL, 'Exhibit 3-7'),
  },
  mixedPlastics: {
    label: 'Mixed plastics',
    mtco2ePerShortTon: { recycling: -0.93, landfill: 0.02, combustion: 1.26 },
    provenance: warmProvenance('mixed-plastics', 'EPA WARM v15, Containers, Packaging and Non-Durable Goods Chapters: mixed plastics', WARM_PACKAGING_URL, 'Exhibit 5-3'),
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
 * Grow plan line → study product. Keyed by the line's input name. `category: null` means the line
 * has no product in the study and is excluded from the food footprint with the reason shown. Lines
 * bought by the piece need a mass per piece; that mass carries its own status tag. Empty until the
 * seed, medium, nutrient and light lines are mapped (Phase 5): every line reads as not yet mapped.
 */
export interface GrowPlanFoodMapping {
  category: string | null;
  massKgPerEach?: number;
  massStatus?: StatusTag;
  note?: string;
}

export const growPlanFoodCategoryMap: Record<string, GrowPlanFoodMapping> = {};

// ── Growing media: GWP per cubic metre used (ZHAW 2015) ───────────────────

export const GAL_PER_M3 = 264.172;

export interface MediumVolumeFactor {
  key: string;
  label: string;
  /** kg CO2e per m³ of the product, used once; IPCC 2013 GWP. */
  kgCo2ePerM3: number;
  /** The bulk density the study divided by, kg/m³. */
  bulkDensityKgPerM3: number;
  /** Media library keys this row is the reference basis for; empty where no library row names it. */
  mediumKeys: string[];
  provenance: FactorProvenance;
}

const zhawProvenance = (slug: string, note: string): FactorProvenance => ({
  id: `zhaw-2015:gwp-m3:${slug}`,
  source: 'Eymann, Mathis, Stucki & Amrein (2015), Torf und Torfersatzprodukte im Vergleich, ZHAW IUNR, Wädenswil; Tabelle A 1 (p. 111), Tab. 1 (p. 4), Abbildung 5-9 (p. 70)',
  sourceUrl: 'https://www.zhaw.ch/storage/lsfm/institute-zentren/iunr/oekobilanzierung/eymann-2015-lca-torf.pdf',
  version: 'Version 22.02.2016 (dated 22 December 2015); IPCC 2013 GWP',
  effectiveFrom: '2015-12-22',
  status: 'SOURCED',
  note: `${note} Functional unit: 1 m³ of the component used once in a Swiss substrate plant: production, transport to Switzerland, mixing, distribution and use-phase decomposition; disposal excluded. The transport legs are Europe's (Baltic peat, South Asian coir by ship to Europe), not Texas's. Read 2 October 2026.`,
});

/**
 * The loose media's reference basis, per cubic metre. A mat is not here: the study covers
 * loose substrate components, and no mat EPD is on file.
 */
export const mediaFactorsZhaw: readonly MediumVolumeFactor[] = [
  { key: 'peat', label: 'Peat (Schwarztorf and Weisstorf)', kgCo2ePerM3: 254, bulkDensityKgPerM3: 200, mediumKeys: ['peat-vermiculite'], provenance: zhawProvenance('peat', '12% extraction, 23% transport, 64% decomposition of organic matter to CO2 in use; 98.5% fossil CO2. Applies to the peat share of a peat blend only.') },
  { key: 'green-compost', label: 'Green-waste compost', kgCo2ePerM3: 177, bulkDensityKgPerM3: 684, mediumKeys: [], provenance: zhawProvenance('green-compost', '') },
  { key: 'coir-fibre', label: 'Coir fibre (Kokosfasern)', kgCo2ePerM3: 84.7, bulkDensityKgPerM3: 200, mediumKeys: [], provenance: zhawProvenance('coir-fibre', '39% cultivation, 34% processing, 22% ship transport; the report rates coir fibre lower than peat on climate but higher on pollutant emissions to water.') },
  { key: 'cocopeat', label: 'Coir pith (cocopeat)', kgCo2ePerM3: 40.5, bulkDensityKgPerM3: 250, mediumKeys: ['coco-coir'], provenance: zhawProvenance('cocopeat', '13% cultivation, 34% processing, 32% ship transport; economic allocation of 7% to the husk. The compressed coco bale the Media library prices is coir pith.') },
  { key: 'bark-compost', label: 'Bark compost', kgCo2ePerM3: 33.1, bulkDensityKgPerM3: 600, mediumKeys: [], provenance: zhawProvenance('bark-compost', '') },
  { key: 'rice-husks', label: 'Rice husks', kgCo2ePerM3: 29.4, bulkDensityKgPerM3: 110, mediumKeys: [], provenance: zhawProvenance('rice-husks', '') },
  { key: 'wood-fibre', label: 'Wood fibre', kgCo2ePerM3: 9.95, bulkDensityKgPerM3: 130, mediumKeys: [], provenance: zhawProvenance('wood-fibre', '') },
];

// ── Capital goods: steel products (EPD Hub declarations) and LED luminaires ──

export interface SteelProductEpd {
  key: string;
  label: string;
  /** What the declared product is; none is steel stock and none is stainless. */
  product: string;
  steel: 'galvanized' | 'powder-coated';
  /** GWP-total, modules A1–A3, kg CO2e per kg of product. */
  kgCo2ePerKg: number;
  /** Reference service life in years; null where the declaration leaves it blank. */
  referenceServiceLifeYears: number | null;
  provenance: FactorProvenance;
}

const epdProvenance = (id: string, source: string, sourceUrl: string, version: string, effectiveFrom: string, note: string): FactorProvenance => ({
  id, source, sourceUrl, version, effectiveFrom, status: 'SOURCED',
  note: `${note} EPD Hub programme, EN 15804+A2, EF 3.1, declared unit 1 kg of product. A finished-product declaration, read as the range for a steel wire rack until a rack's own declaration or its material is on file. Read 2 October 2026.`,
});

/**
 * The three declarations document E cites for steel. They bracket 2.78 to 3.62 kg CO2e per kg of coated
 * carbon steel. The racks are lightweight stainless steel six-shelf 2x4 ft wire units (Rob, STATED), and
 * none of these is stainless, so none is the rack's factor: a stainless steel declaration is still to be
 * found, and stainless carries a higher A1–A3 figure than coated carbon steel.
 */
export const steelProductEpds: readonly SteelProductEpd[] = [
  { key: 'galvanized-duct', label: 'Galvanized spiral duct (Econox)', product: 'Spiral-seam round ventilation duct, Sendzimir galvanized steel Z275', steel: 'galvanized', kgCo2ePerKg: 2.78, referenceServiceLifeYears: 50,
    provenance: epdProvenance('epd-hub-4076:spiral-duct', 'EPD Hub HUB-4076, Econox Holding, Circular ventilation duct; core environmental impact indicators, GWP-total A1–A3', 'https://www.ventilatieland.nl/static/uploads/pictures/original/other/sk22277_Environmental_product_declaration_EN.pdf', 'Published 14 October 2025, valid to 13 October 2030', '2025-10-14', 'GWP-fossil 2.78; A1 2.75, A2 0.024, A3 0.004. 50 years of durability stated.') },
  { key: 'powder-coated-storage', label: 'Powder-coated steel storage hardware (Elfa)', product: 'Shelving frame sides, uprights, angled shelves, rods and brackets, 97% steel sheet and 3% powder coating, averaged across the range', steel: 'powder-coated', kgCo2ePerKg: 3.15, referenceServiceLifeYears: null,
    provenance: epdProvenance('epd-hub-3520:elfa-storage', 'EPD Hub HUB-3520, Elfa International AB, Elfa Storage: solid surface products, drawer system, closet rods and accessories; GWP-total A1–A3', 'https://www.xlbygg.se/media/attachments/806/00d/80600da6bcc48f432c478f9e2767727b.pdf', 'Published 29 June 2025, valid to 28 June 2030', '2025-06-29', 'GWP-fossil 3.23; variation across the range −8% to +2%. No reference service life declared; the end-of-life scenario assumes about 20 years. The closest declared product to a wire rack.') },
  { key: 'powder-coated-enclosure', label: 'Powder-coated steel utility enclosure (Polaria)', product: 'Steel bathroom and utility enclosures with a nanoceramic surface treatment, representative model Solo 400x500', steel: 'powder-coated', kgCo2ePerKg: 3.54, referenceServiceLifeYears: 50,
    provenance: epdProvenance('epd-hub-5481:polaria-enclosure', 'EPD Hub HUB-5481, Polaria Oy, the Solo, SIK and DUO steel enclosure range; environmental data summary, GWP-total A1–A3', 'https://www.rskdatabasen.se/infodocs/EPD/EPD_1061_8824003.pdf', 'Published 28 May 2026, valid to 28 May 2031', '2026-05-28', 'GWP-fossil 3.62 in the summary (the 3.62 document E quotes); the core table prints A1–A3 GWP-total 2.60 and GWP-fossil 2.73, which do not agree with the summary; the discrepancy is in the declaration. 50 years declared.') },
];

export interface LedEmbodiedFactor {
  key: string;
  label: string;
  watts: number;
  lifeHours: number;
  /** Raw materials plus manufacturing, kg CO2e for one lamp or luminaire. */
  embodiedKgCo2e: number;
  /** Share of life-cycle GWP that was the electricity used. */
  useShareOfGwp: number;
  provenance: FactorProvenance;
}

/**
 * What an LED fixture's manufacture adds, from the two luminaire studies document E cites. Over the
 * fixture's life the electricity dominates; these rows are the amortized embodied line of a fixture
 * until a manufacturer's declaration exists.
 */
export const ledEmbodiedFactors: readonly LedEmbodiedFactor[] = [
  { key: 'pnnl-led-2012', label: 'LED lamp, 12.5 W, 2012 (PNNL)', watts: 12.5, lifeHours: 25000, embodiedKgCo2e: 16.45, useShareOfGwp: 0.935,
    provenance: { id: 'pnnl-21443:led-2012', source: 'Scholand & Dillon (2012), Life-Cycle Assessment of Energy and Environmental Impacts of LED Lighting Products, Part 2: LED Manufacturing and Performance, PNNL-21443, U.S. DOE; Table 7-3', sourceUrl: 'https://www.pnnl.gov/main/publications/external/technical_reports/pnnl-21443.pdf', version: 'May 2012', effectiveFrom: '2012-05-01', status: 'DERIVED', note: 'Per 20 million lumen-hours: raw materials 12.752, manufacturing 3.450, energy in use 234.756, total 251.025 kg CO2e. One lamp gives 20.3 Mlm-h over 25,000 h, so its embodied share is (12.752 + 3.450) × 20.3 ÷ 20 = 16.45 kg (arithmetic on the table). Use is 93.5% of GWP. Read 2 October 2026.' } },
  { key: 'pnnl-led-2017', label: 'LED lamp, 6.1 W, 2017 projection (PNNL)', watts: 6.1, lifeHours: 40000, embodiedKgCo2e: 14.68, useShareOfGwp: 0.927,
    provenance: { id: 'pnnl-21443:led-2017', source: 'Scholand & Dillon (2012), PNNL-21443, Part 2; Table 7-4 (2017 projection)', sourceUrl: 'https://www.pnnl.gov/main/publications/external/technical_reports/pnnl-21443.pdf', version: 'May 2012', effectiveFrom: '2012-05-01', status: 'DERIVED', note: 'Per 20 Mlm-h: raw materials 6.995, manufacturing 1.900, energy in use 113.837, total 122.772 kg CO2e; one lamp gives 33.0 Mlm-h over 40,000 h, so (6.995 + 1.900) × 33.0 ÷ 20 = 14.68 kg. A projection the study made in 2012, not a measured lamp.' } },
  { key: 'ferreira-linear-luminaire', label: 'Linear LED luminaire, 47 W (Ferreira et al. 2021)', watts: 47, lifeHours: 70000, embodiedKgCo2e: 9.2, useShareOfGwp: 0.989,
    provenance: { id: 'ferreira-2021:led-luminaire-nl', source: 'Ferreira, Knoche, Verma & Corchero (2021), Life Cycle Assessment of a modular LED luminaire and quantified environmental benefits of replaceable components, Journal of Cleaner Production 317, 128575; Table 7', sourceUrl: 'https://upcommons.upc.edu/bitstreams/7a8f3095-d7c1-4f9f-affb-7484099d6e76/download', version: 'Author manuscript, 1 October 2021; DOI 10.1016/j.jclepro.2021.128575', effectiveFrom: '2021-10-01', status: 'DERIVED', note: 'Luminaire production 3.41E+03 kg CO2e for the functional unit of 369 luminaires: 9.2 kg each (arithmetic on the table). Use 98.9% of GWP over 70,000 h (L80). Read 2 October 2026.' } },
];

// ── Eutrophication: the CML generic factors (Guinée et al. 2001, Handbook on LCA, Part 2b) ──

export interface EutrophicationFactor {
  substance: string;
  cas: string | null;
  /** kg PO4(3-)-equivalent per kg emitted; generic across air, water and soil. */
  kgPo4ePerKg: number;
  provenance: FactorProvenance;
}

const cmlProvenance = (slug: string): FactorProvenance => ({
  id: `cml-2001:ep:${slug}`,
  source: 'Guinée et al. (2001), Handbook on Life Cycle Assessment, Part 2b: Operational annex, CML Leiden; Table 4.3.11.1, generic EP factors (after Heijungs et al. 1992)',
  sourceUrl: 'https://www.universiteitleiden.nl/binaries/content/assets/science/cml/publicaties_pdf/new-dutch-lca-guide/part2b.pdf',
  version: 'May 2001; the basis of CML 2001 and the CML-IA baseline',
  effectiveFrom: '2001-05-01',
  status: 'SOURCED',
  note: 'Generic factors, not medium-specific. The CML-IA August 2016 file was not read; it is distributed as a zip. Read 2 October 2026.',
});

/** The substances a nutrient discharge or a spent rinse water sample would be characterized by. */
export const eutrophicationFactorsCml: readonly EutrophicationFactor[] = [
  { substance: 'Ammonia (NH3)', cas: '7664-41-7', kgPo4ePerKg: 0.35, provenance: cmlProvenance('ammonia') },
  { substance: 'Ammonium (NH4+)', cas: null, kgPo4ePerKg: 0.33, provenance: cmlProvenance('ammonium') },
  { substance: 'Nitrate (NO3-)', cas: null, kgPo4ePerKg: 0.1, provenance: cmlProvenance('nitrate') },
  { substance: 'Nitrogen (N)', cas: null, kgPo4ePerKg: 0.42, provenance: cmlProvenance('nitrogen') },
  { substance: 'Nitrogen oxides (NOx)', cas: null, kgPo4ePerKg: 0.13, provenance: cmlProvenance('nox') },
  { substance: 'Phosphate (PO4 3-)', cas: null, kgPo4ePerKg: 1, provenance: cmlProvenance('phosphate') },
  { substance: 'Phosphorus (P)', cas: null, kgPo4ePerKg: 3.06, provenance: cmlProvenance('phosphorus') },
  { substance: 'Chemical oxygen demand (COD)', cas: null, kgPo4ePerKg: 0.022, provenance: cmlProvenance('cod') },
];

// ── A cited indoor microgreens LCA, carried as a comparison, never as the facility's figure ──

/**
 * Parkes et al. (2022): a building-integrated broccoli microgreen system in Lisbon, cradle to gate,
 * per kg fresh weight delivered. Its lines are shown beside the facility's own computed shares so a
 * reader can see whether the farm's profile resembles the literature's (Phase 5 decision 9). Nothing
 * here is an input to any posting.
 */
export const citedMicrogreensLca = {
  study: 'Parkes, Cubillos Tovar, Dourado, Domingos & Teixeira (2022), Life Cycle Assessment of a Prospective Technology for Building-Integrated Production of Broccoli Microgreens, Atmosphere 13(8), 1317',
  functionalUnit: '1 kg fresh-weight broccoli microgreens delivered to a retailer, averaged over 12 months; cradle to gate; the 2016 Dutch midpoint (H) impact method the paper names',
  system: 'LED tube grow lights, 5 a tier, 14 h a day for 7 days; coconut-fibre substrate at 3.0 kg per kg fresh weight; seed at 0.07 kg per kg fresh weight (Agribalyse cauliflower seed proxy); Portuguese grid 2018 (ecoinvent 3.8); infrastructure over a 10-year life',
  /** Circular Supply scenario: on campus, composting. */
  circular: {
    totalKgCo2ePerKg: 18.6,
    infrastructureKgPerKg: 2.07,
    infrastructureShareMax: 0.113,
    electricityKgPerKg: 10.01,
    electricityShare: 0.54,
    electricityLedKgPerKg: 4.39,
    electricityClimateAndEquipmentKgPerKg: 5.6,
    seedsKgPerKg: 4.04,
    seedsShare: 0.22,
    substrateKgPerKg: 2.06,
    nutrientsKgPerKg: 0.02,
    waterKgPerKg: 0.1,
    consumablesKgPerKg: 0.27,
  },
  /** Linear Supply scenario: off site, 10 km refrigerated delivery, municipal waste. */
  linear: {
    totalKgCo2ePerKg: 22.2,
    electricityShare: 0.45,
    seedsShare: 0.18,
    substrateKgPerKg: 4.91,
    packagingAndDeliveryKgPerKg: 0.786,
  },
  provenance: {
    id: 'parkes-2022:atmosphere-13-1317',
    source: 'Parkes et al. (2022), Atmosphere 13(8), 1317; Sections 2.1, 2.3, 2.4, 3.1.1 (Figure 2) and 4',
    sourceUrl: 'https://www.mdpi.com/2073-4433/13/8/1317',
    version: 'Published 18 August 2022, CC BY; DOI 10.3390/atmos13081317',
    effectiveFrom: '2022-08-18',
    status: 'SOURCED',
    note: 'Another system: Lisbon, a Portuguese grid, coconut fibre, LED tubes at 5.6 kW a tier. A comparison line, not a factor. Read 2 October 2026.',
  } satisfies FactorProvenance,
} as const;

// ── Scope 1: refrigerant leak-repair rules (EPA AIM Act, 40 CFR 84 Subpart C)

export const aimActRules = {
  /** Applicability: appliances with at least this charge... */
  applicabilityMinChargeLb: 15,
  /** ...of a refrigerant with a GWP above this. */
  applicabilityMinGwp: 53,
  /** Annualized leak-rate triggers by appliance type (§ 84.106(c)(2)). */
  commercialRefrigerationTriggerRate: 0.2,
  industrialProcessTriggerRate: 0.3,
  comfortCoolingTriggerRate: 0.1,
  /** Repair window after a trigger, in days; 120 where an industrial process shutdown is required (§ 84.106(d)). */
  repairWindowDays: 30,
  repairWindowDaysWithShutdown: 120,
  /** Chronic-leak threshold: refrigerant added in a calendar year as a share of full charge. */
  chronicLeakShareOfCharge: 1.25,
  /** Chronic-leak report due date (month, day) in the following year. */
  chronicReportDue: { month: 3, day: 1 },
  provenance: {
    id: 'cfr-40-84-c:leak-repair',
    source: 'EPA AIM Act leak repair provisions, 40 CFR 84 Subpart C, § 84.106',
    sourceUrl: 'https://www.ecfr.gov/current/title-40/chapter-I/subchapter-C/part-84/subpart-C',
    version: 'eCFR current text, read 2 October 2026; leak-repair requirements effective 2026-01-01',
    effectiveFrom: '2026-01-01',
    status: 'SOURCED',
    note: 'Applicability § 84.106(a): a full charge of 15 lb or more of a regulated substance or a substitute with a GWP above 53. Triggers § 84.106(c)(2). Repair § 84.106(d), verification tests § 84.106(e). Chronic leak § 84.106(j): 125% or more of the full charge in a calendar year, reported by 1 March following. § 84.108 is automatic leak detection, not these rules.',
  } satisfies FactorProvenance,
} as const;

// ── Utility rebates (Austin Energy commercial programme) ──────────────────

export interface RebateLine {
  category: string;
  rebate: string;
  condition: string;
}

/**
 * Inventory of published incentives a grow facility's loads could meet, not a recommendation: lighting,
 * the motors and drives of climate control and cold storage, and controls. Two readings of the
 * programme page are on file; the ranges span both.
 */
export const austinEnergyRebates: { lines: RebateLine[]; bonus: string; provenance: FactorProvenance } = {
  lines: [
    { category: 'Lighting retrofits', rebate: '$420–$900 per kW saved', condition: 'The $900 tier for Small Business Bundle participants' },
    { category: 'Variable frequency drives', rebate: '$480–$625 per kW saved', condition: 'Motor loads on HVAC or exhaust' },
    { category: 'EC motors', rebate: '$420–$550 per kW saved', condition: 'Ventilation and cooling retrofits; walk-in evaporator fans and condensers' },
    { category: 'Smart thermostats', rebate: '$50 per device', condition: 'Qualifying commercial devices' },
  ],
  bonus: '+30% for locally owned small businesses, 501(c)(3) organisations and houses of worship on Tier 1 or Tier 2 rates',
  provenance: {
    id: 'austin-energy:commercial-rebates',
    source: 'Austin Energy commercial rebates and incentives',
    sourceUrl: 'https://austinenergy.com/energy-efficiency/rebates-incentives/commercial',
    version: 'programme year not yet confirmed',
    effectiveFrom: '2025-01-01',
    status: 'DATED',
    note: 'The commercial programme; the home grow room is on a residential rate and its programme is not yet read. Confirm the current programme year.',
  },
};

// ── Registry — every provenance record in one place, for the audit surface ─

export const factorRegistry: FactorProvenance[] = [
  gwpAR5.provenance,
  ...Object.values(refrigerantGwpAR4).map((r) => r.provenance),
  ...Object.values(combustionFactors).map((f) => f.provenance),
  gridFactorERCT.provenance,
  freightFactorSmartWay.provenance,
  ...Object.values(freightFactorsHub).map((f) => f.provenance),
  warmFoodWaste.landfill.provenance,
  warmFoodWaste.compost.provenance,
  warmYardTrimmings.landfill.provenance,
  warmYardTrimmings.compost.provenance,
  warmPackaging.mixedPaper.provenance,
  warmPackaging.mixedPlastics.provenance,
  ...mediaFactorsZhaw.map((m) => m.provenance),
  ...steelProductEpds.map((e) => e.provenance),
  ...ledEmbodiedFactors.map((l) => l.provenance),
  ...eutrophicationFactorsCml.map((e) => e.provenance),
  citedMicrogreensLca.provenance,
  foodFactorSource,
  ...inputFactors.map((f) => f.provenance),
  aimActRules.provenance,
  austinEnergyRebates.provenance,
];
