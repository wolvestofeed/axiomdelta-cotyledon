/**
 * Cotyledon — growing media, nutrient solutions, light fixtures and light regimes (outline §4).
 *
 * The three non-seed line kinds of a grow plan. A medium is costed per tray, a nutrient per
 * gallon of water at a concentration, and light per tray per day of the light stage. Seed is
 * the fourth kind and lives on the variety (`varieties.ts`).
 *
 * Light is a regime, not a fixture pick (science library, document B): a red-to-blue ratio, a
 * far-red share, a PPFD target, a photoperiod, and an optional UV-C pulse. The daily light
 * integral is derived. A fixture is what a grow unit carries; a regime is what a grow plan
 * asks for, and the scheduler places a sowing only on a fixture that can deliver it.
 *
 * Every price here is Vallecito's own purchase (DATED to its 2023–24 season) or a PLACEHOLDER
 * until a receipt sets it.
 */

import { tagged, type Tagged } from '@/data/tagged';

// ── Growing media ─────────────────────────────────────────────────────────

/**
 * A medium line names a row of the workspace's Media library by its key. The list below is the
 * library's seed; from the first read the workspace's rows are the source (`src/server/media.ts`),
 * and a row can be added or edited on the Media page.
 */
export type MediumKey = string;

/** The row a plan with no medium names (jar sprouts); it stays in the library. */
export const NO_MEDIUM_KEY = 'none';

export interface GrowingMediumDef {
  key: MediumKey;
  name: string;
  /** Loose fill by volume, a cut mat per tray, or none. */
  form: 'loose' | 'mat' | 'none';
  /** How much one 1020 tray takes; mats are one per tray. Scaled by the format's density factor. */
  qtyPer1020: Tagged;
  unit: 'gal' | 'each' | 'none';
  costPerUnit: Tagged;
  /** Physicochemical traits the science library records, where it does. */
  traits: { ph?: string; porosity?: string; note: string };
  /** Science library rows behind the traits and any elicitation effect. */
  rows: number[];
}

export const GROWING_MEDIA: readonly GrowingMediumDef[] = [
  {
    key: 'coco-coir',
    name: 'Coconut coir (cocopeat)',
    form: 'loose',
    qtyPer1020: tagged(0.66, 'PLACEHOLDER', 'gal', 'About one inch of expanded coir in a 1020; no fill volume observed'),
    unit: 'gal',
    costPerUnit: tagged(23.19 / 18.5, 'DATED', '$/gal', 'Mother Earth 5 kg compressed coco bale, $23.19, expands to about 18.5 gal (Vallecito, Jan 2024)'),
    traits: { ph: '5.5 to 7.0', porosity: '90 to 95%', note: 'High cation exchange capacity, low bulk density, naturally antifungal; more fresh and dry weight than field soil mixes.' },
    rows: [65],
  },
  {
    key: 'jute-mat',
    name: 'Jute fiber mat',
    form: 'mat',
    qtyPer1020: tagged(1, 'STATED', 'each', 'One cut mat per tray'),
    unit: 'each',
    costPerUnit: tagged(1.5, 'PLACEHOLDER', '$/each', 'No receipt yet'),
    traits: { note: 'Soil-free, lighter than coir, compostable. A resistive substrate that raised antioxidants in green and red basil.' },
    rows: [8],
  },
  {
    key: 'hemp-mat',
    name: 'Hemp fiber mat',
    form: 'mat',
    qtyPer1020: tagged(1, 'STATED', 'each', 'One pre-cut mat per 1020 tray'),
    unit: 'each',
    costPerUnit: tagged(241 / 140, 'STATED', '$/each', '$241 for 140 mats, no shipping, from Bootstrap Farmer, Paris TX (Rob)'),
    traits: {
      ph: 'Neutral',
      note: 'Needle-punched hemp fiber, no binders or chemical treatment; salt-free, so no buffering or rinsing. Holds up to 1,050% of its weight in water; 400, 600 and 1,300 g/m² grades set the retention. Raised potassium in basil and dill. The default medium.',
    },
    rows: [94, 97, 103],
  },
  {
    key: 'vermiculite',
    name: 'Vermiculite',
    form: 'loose',
    qtyPer1020: tagged(0.66, 'PLACEHOLDER', 'gal', 'About one inch in a 1020'),
    unit: 'gal',
    costPerUnit: tagged(2.27, 'PLACEHOLDER', '$/gal', 'No receipt yet'),
    traits: { note: 'Hydrous phyllosilicate, sterile, aerating. Raised antioxidants in basil with jute; blends with peat prevent damping-off.' },
    rows: [8, 2],
  },
  {
    key: 'peat-vermiculite',
    name: 'Peat and vermiculite blend',
    form: 'loose',
    qtyPer1020: tagged(0.66, 'PLACEHOLDER', 'gal', ''),
    unit: 'gal',
    costPerUnit: tagged(1.89, 'PLACEHOLDER', '$/gal', 'No receipt yet'),
    traits: { note: 'Moisture retention from peat, aeration from vermiculite. Peat extraction is the sustainability cost the alternatives avoid.' },
    rows: [2, 8],
  },
  {
    key: 'hydro-pad',
    name: 'Hydroponic pad',
    form: 'mat',
    qtyPer1020: tagged(1, 'STATED', 'each', 'One pad per tray'),
    unit: 'each',
    costPerUnit: tagged(2, 'PLACEHOLDER', '$/each', 'No receipt yet'),
    traits: { note: 'Sterile inert mat; nutrients ride in the water, so EC, pH and sulfur can be set. The lowest pathogen vector of the media.' },
    rows: [65, 21],
  },
  {
    key: 'none',
    name: 'No medium (jar sprouts)',
    form: 'none',
    qtyPer1020: tagged(0, 'STATED', 'none', 'Sprouts grow in the jar on rinse water alone'),
    unit: 'none',
    costPerUnit: tagged(0, 'STATED', '$', ''),
    traits: { note: '' },
    rows: [],
  },
];

// ── Nutrient solutions and supplements ──────────────────────────────────────

/**
 * A nutrient line names a row of the workspace's Nutrients & Supplements library by its key. The
 * list below is the library's seed; from the first read the workspace's rows are the source
 * (`src/server/nutrients.ts`), and a row can be added or edited on the Nutrients & Supplements page.
 */
export type NutrientKey = string;

/** The row a nutrient line with no solution names: plain water, nothing added. Never deleted. */
export const WATER_ONLY_KEY = 'none';

export interface NutrientSolutionDef {
  key: NutrientKey;
  name: string;
  /** Milliliters of concentrate per gallon of water at the default strength. */
  mlPerGal: Tagged;
  costPerMl: Tagged;
  /** Target solution strength and acidity for hydroponic plans; null where the solution is not managed to a target. */
  ecTarget: Tagged | null;
  phTarget: Tagged | null;
  /** What the solution is meant to elicit, with its rows, where the science names one. */
  elicits: { effect: string; rows: number[] } | null;
  note: string;
}

export const NUTRIENT_SOLUTIONS: readonly NutrientSolutionDef[] = [
  {
    key: 'floragrow-npk',
    name: 'FloraGrow NPK',
    mlPerGal: tagged(9.5, 'PLACEHOLDER', 'ml/gal', 'Label mid-strength; no per-variety strength observed'),
    costPerMl: tagged(175 / 3785, 'DATED', '$/ml', 'Vallecito capex line: FloraGrow NPK $175 per gallon set (2023)'),
    ecTarget: tagged(1.2, 'PLACEHOLDER', 'mS/cm', ''),
    phTarget: tagged(6.0, 'PLACEHOLDER', 'pH', ''),
    elicits: null,
    note: 'General hydroponic feed in bottom water during the light stage on the varieties that take it.',
  },
  {
    key: 'kelp',
    name: 'Liquid kelp',
    mlPerGal: tagged(7.6, 'PLACEHOLDER', 'ml/gal', ''),
    costPerMl: tagged(0.03, 'PLACEHOLDER', '$/ml', 'No receipt yet'),
    ecTarget: null,
    phTarget: null,
    elicits: null,
    note: 'Organic seaweed extract, micronutrients and growth hormones.',
  },
  {
    key: 'sulfur-supplement',
    name: 'Sulfur supplement (brassicas)',
    mlPerGal: tagged(3.8, 'PLACEHOLDER', 'ml/gal', 'No rate observed'),
    costPerMl: tagged(0.02, 'PLACEHOLDER', '$/ml', 'No receipt yet'),
    ecTarget: tagged(1.4, 'PLACEHOLDER', 'mS/cm', ''),
    phTarget: tagged(6.0, 'PLACEHOLDER', 'pH', ''),
    elicits: { effect: 'Raises glucosinolate biosynthesis in Brassicaceae microgreens grown hydroponically.', rows: [21] },
    note: 'For broccoli, cabbage and radish plans on the hydroponic pad.',
  },
  {
    key: 'none',
    name: 'Water only',
    mlPerGal: tagged(0, 'STATED', 'ml/gal', ''),
    costPerMl: tagged(0, 'STATED', '$/ml', ''),
    ecTarget: null,
    phTarget: null,
    elicits: null,
    note: '',
  },
];

// ── Light fixtures: what a grow unit carries ──────────────────────────────

export interface LightFixtureDef {
  key: string;
  name: string;
  /** Watts per fixture. */
  watts: Tagged;
  /** Fixtures on one 48-inch shelf of four 1020 flats, as the shelf is lit by default. */
  perShelf: Tagged;
  /** PPFD at tray height at the hanging height used, from the fixture's map. */
  ppfdAtTray: Tagged;
  /** What the fixture can deliver: ratio range, far-red, UV-C. */
  delivers: { rbRatioMin: number; rbRatioMax: number; farRed: boolean; uvc: boolean };
  fixtureCost: Tagged;
  fixtureLifeHours: Tagged;
  note: string;
}

export const LIGHT_FIXTURES: readonly LightFixtureDef[] = [
  {
    key: 'mars-hydro-vg80',
    name: 'Mars Hydro VG80 full-spectrum',
    watts: tagged(80, 'STATED', 'W', 'Vallecito time study: 80 W at 120 V'),
    perShelf: tagged(2, 'STATED', 'per shelf', 'Rob: two 4-foot Mars lights on each shelf of a lit rack'),
    ppfdAtTray: tagged(250, 'DATED', 'µmol/m²/s', 'Mars Hydro VG80 PPFD map, 2023, center reading at the hanging height used; the map is in the Vallecito admin folder'),
    delivers: { rbRatioMin: 3, rbRatioMax: 5, farRed: false, uvc: false },
    fixtureCost: tagged(42.5, 'DATED', '$', 'Vallecito: $85 per pair'),
    fixtureLifeHours: tagged(50000, 'SOURCED', 'h', 'Manufacturer rated life'),
    note: 'The fixture Vallecito grew under and Rob grows under now, two on each shelf. A fixed white spectrum.',
  },
  {
    key: 'barrina-t5-6000k',
    name: 'Barrina T5 LED 20 W, 6000 K',
    watts: tagged(20, 'PLACEHOLDER', 'W', 'One tube, 20 W by the fixture name; Rob to confirm the wattage'),
    perShelf: tagged(3, 'STATED', 'per shelf', 'Rob: three Barrina on a shelf, lower wattage than the Mars'),
    ppfdAtTray: tagged(120, 'PLACEHOLDER', 'µmol/m²/s', 'No map on file'),
    delivers: { rbRatioMin: 2, rbRatioMax: 3, farRed: false, uvc: false },
    fixtureCost: tagged(45 / 6, 'DATED', '$', 'Vallecito: 6-pack $45'),
    fixtureLifeHours: tagged(50000, 'PLACEHOLDER', 'h', ''),
    note: 'Cool-white T5 tube, three to a shelf.',
  },
];

// ── Light regimes: what a grow plan asks for ──────────────────────────────

export type LightRegimeKey = 'yield' | 'balanced' | 'nutrition-forward' | 'biofortify-far-red' | 'continuous';

export interface LightRegimeDef {
  key: LightRegimeKey;
  name: string;
  /** Red to blue, as a ratio (5 means 5:1). Null for a fixed white spectrum. */
  rbRatio: Tagged<number | null>;
  /** Share of total photon flux that is far-red, 0 to 1. */
  farRedShare: Tagged;
  /** Target intensity at tray height. A variety's own PPFD range overrides it. */
  ppfdTarget: Tagged;
  photoperiodHours: Tagged;
  /** A brief UV-C exposure once per cycle, minutes; zero for none. */
  uvcMinutes: Tagged;
  /** What the regime is for, with its rows. */
  intent: string;
  rows: number[];
}

export const LIGHT_REGIMES: readonly LightRegimeDef[] = [
  {
    key: 'yield',
    name: 'Yield',
    rbRatio: tagged(7, 'SOURCED', 'R:B', 'Red-dominant, 5 to 9'),
    farRedShare: tagged(0, 'SOURCED', 'share', ''),
    ppfdTarget: tagged(150, 'PLACEHOLDER', 'µmol/m²/s', 'Moderate; species override'),
    photoperiodHours: tagged(16, 'STATED', 'h/day', ''),
    uvcMinutes: tagged(0, 'STATED', 'min', ''),
    intent: 'Most fresh weight and dry matter; phytochemicals diluted.',
    rows: [68],
  },
  {
    key: 'balanced',
    name: 'Balanced 5:1',
    rbRatio: tagged(5, 'SOURCED', 'R:B', 'The cited balance for broccoli: height, weight, glucosinolates and antioxidants together'),
    farRedShare: tagged(0, 'SOURCED', 'share', ''),
    ppfdTarget: tagged(100, 'PLACEHOLDER', 'µmol/m²/s', 'Species override; broccoli 50 to 70'),
    photoperiodHours: tagged(16, 'STATED', 'h/day', ''),
    uvcMinutes: tagged(0, 'STATED', 'min', ''),
    intent: 'Weight and nutrition together. The default for most plans.',
    rows: [68],
  },
  {
    key: 'nutrition-forward',
    name: 'Nutrition-forward blue',
    rbRatio: tagged(1 / 3, 'SOURCED', 'R:B', '25:75, the mix that raised bioavailable iron 15 to 20% in broccoli; 100% blue gave radish and broccoli +16.3% antioxidant activity'),
    farRedShare: tagged(0, 'SOURCED', 'share', ''),
    ppfdTarget: tagged(100, 'PLACEHOLDER', 'µmol/m²/s', 'Species override'),
    photoperiodHours: tagged(16, 'STATED', 'h/day', ''),
    uvcMinutes: tagged(0, 'STATED', 'min', ''),
    intent: 'Phenolics, anthocyanins, antioxidant capacity and iron at some cost in weight; compact growth.',
    rows: [68, 70],
  },
  {
    key: 'biofortify-far-red',
    name: 'Biofortify: low light plus far-red',
    rbRatio: tagged(5, 'PLACEHOLDER', 'R:B', 'The study\'s base spectrum; ratio not the variable'),
    farRedShare: tagged(0.2, 'SOURCED', 'share', '20% of total photon flux'),
    ppfdTarget: tagged(60, 'SOURCED', 'µmol/m²/s', '50 to 75'),
    photoperiodHours: tagged(16, 'STATED', 'h/day', ''),
    uvcMinutes: tagged(0, 'STATED', 'min', ''),
    intent: 'Vitamin C and glucosinolates in broccoli, with longer stems and more fresh weight.',
    rows: [73],
  },
  {
    key: 'continuous',
    name: 'Continuous light',
    rbRatio: tagged(5, 'PLACEHOLDER', 'R:B', 'Any quality; the study saw the effect regardless of spectrum'),
    farRedShare: tagged(0, 'STATED', 'share', ''),
    ppfdTarget: tagged(180, 'SOURCED', 'µmol/m²/s', 'DLI 15.6 mol/m²/day over 24 h'),
    photoperiodHours: tagged(24, 'SOURCED', 'h/day', ''),
    uvcMinutes: tagged(0, 'STATED', 'min', ''),
    intent: 'Highest dry mass and a mild oxidative stress that raises antioxidant enzymes, in arugula, broccoli, mizuna and radish.',
    rows: [75],
  },
];

export const DEFAULT_LIGHT_REGIME: LightRegimeKey = 'balanced';

/** Sanitizer per tray: Vallecito's 2023 allocation. */
export const SANITIZER_PER_TRAY: Tagged = tagged(0.05, 'DATED', '$', 'Vallecito 2023 time study: sanitization allocated per flat');

/** Austin Energy residential rate placeholder; Vallecito paid LPEA $0.1256/kWh. */
export const ENERGY_RATE_PER_KWH: Tagged = tagged(0.13, 'PLACEHOLDER', '$/kWh', 'Austin Energy blended residential; Vallecito paid $0.1256 at LPEA (DATED)');

/** Daily light integral, mol/m²/day, from intensity and hours. */
export function dailyLightIntegral(ppfd: number, hours: number): number {
  return (ppfd * hours * 3600) / 1_000_000;
}


/** 1020 flats on a 48-inch shelf: what a shelf's lights are shared across. */
export const TRAYS_PER_SHELF_1020 = 4;

/**
 * Energy and fixture cost of one 1020 tray for one day under a regime: the shelf's fixtures, at
 * their count on a shelf and their full watts (the fixtures Rob runs are not dimmed), times the
 * regime's hours, times the rate, shared across the four 1020 flats on the shelf, plus the
 * fixtures' amortized cost (outline §4).
 */
export function lightCostPerTrayDay(fixture: LightFixtureDef, regime: LightRegimeDef, ratePerKwh: number = ENERGY_RATE_PER_KWH.value, perShelf: number = fixture.perShelf.value): number {
  const hours = regime.photoperiodHours.value;
  const kwhPerShelfDay = ((fixture.watts.value * perShelf) / 1000) * hours;
  const energy = (kwhPerShelfDay * ratePerKwh) / TRAYS_PER_SHELF_1020;
  const fixtureDaysOfLife = fixture.fixtureLifeHours.value / hours;
  const amortized = (fixture.fixtureCost.value * perShelf) / fixtureDaysOfLife / TRAYS_PER_SHELF_1020;
  return energy + amortized;
}

export const MEDIUM_BY_KEY = Object.fromEntries(GROWING_MEDIA.map((m) => [m.key, m])) as Readonly<Record<string, GrowingMediumDef>>;
export const NUTRIENT_BY_KEY = Object.fromEntries(NUTRIENT_SOLUTIONS.map((n) => [n.key, n])) as Readonly<Record<string, NutrientSolutionDef>>;
export const FIXTURE_BY_KEY = Object.fromEntries(LIGHT_FIXTURES.map((l) => [l.key, l])) as Readonly<Record<string, LightFixtureDef>>;
export const REGIME_BY_KEY = Object.fromEntries(LIGHT_REGIMES.map((r) => [r.key, r])) as Readonly<Record<LightRegimeKey, LightRegimeDef>>;
