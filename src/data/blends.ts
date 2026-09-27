/**
 * MicroFarm — the blends in R&D (`docs/roadmaps/phase-2-growing-domain.md` part 12).
 *
 * A blend is one grow plan with two or more seed lines (`grow-plan.ts`), developed through
 * experiments before it goes in service. These are the blends Rob chose from his two blend
 * documents: document C, *Clinical Research and Blend Optimization for Specific Microgreen
 * Varieties*, which gives each blend's seeding ratio and harvest window, and *MIXED TRAY R&D*, which
 * gives the varieties and the growing inputs and no ratio, so its blends start at equal shares.
 *
 * Each seed line's share is its share of the tray, sown at the variety's own full-tray density
 * times the share (its tray record for lentil, mung and wheat, `varieties.ts`). Every blend sits on
 * the default hemp mat with FloraGrow in the bottom water from the light stage, and on the light
 * regime nearest to what its document asks. What a grow plan cannot yet express, a staggered
 * sowing, a weighted blackout, a UV-C dose, a regime for the last days only, is kept on the blend
 * as its document states it, for the experiments to run by hand.
 */

import { VARIETY_BY_KEY } from '@/data/varieties';
import type { LightRegimeKey } from '@/data/inputs-catalog';
import { growPlanCode, seedLineFor, BLEND_CODE_PREFIX, type GrowPlanDef, type GrowPlanLine } from '@/data/grow-plan';
import { tagged } from '@/data/tagged';

export type BlendSource = 'C' | 'rd';

export const BLEND_SOURCE_LABEL: Record<BlendSource, string> = {
  C: 'Document C: Clinical Research and Blend Optimization for Specific Microgreen Varieties',
  'rd': 'MIXED TRAY R&D (Rob)',
};

export interface BlendDef {
  serial: number;
  name: string;
  source: BlendSource;
  /** What the blend is composed for, as its document states it. */
  focus: string;
  /** The varieties and their shares of the tray; null while a variety is not in the seed library. */
  seeds: { varietyKey: string; share: number }[] | null;
  /** Why a blend is not built yet. */
  held?: string;
  /** The ratio as the document gives it, or that it gives none. */
  ratioAsStated: string;
  /** The harvest window the document states, where it states one. */
  harvestAsStated: string | null;
  regime: LightRegimeKey;
  /** A PPFD typed on the light line, where the document asks for one the regime does not carry. */
  ppfd: number | null;
  /** The light the document asks for, beside the regime the plan carries. */
  lightAsStated: string;
  /** Methods the grow plan cannot yet express, as the document states them. */
  methods: string[];
}

const third = 1 / 3;
const half = 1 / 2;

export const BLENDS: readonly BlendDef[] = [
  {
    serial: 1,
    name: 'Cardiometabolic Vanguard',
    source: 'C',
    focus: 'Lipid modulation, glycemic control, detoxification',
    seeds: [{ varietyKey: 'broccoli', share: 0.3 }, { varietyKey: 'red-cabbage', share: 0.3 }, { varietyKey: 'fenugreek', share: 0.25 }, { varietyKey: 'chia', share: 0.15 }],
    ratioAsStated: 'Broccoli 30 : Red cabbage 30 : Fenugreek 25 : Chia 15',
    harvestAsStated: '10 to 14 days',
    regime: 'balanced',
    ppfd: null,
    lightAsStated: 'No spectrum named; the 5:1 baseline',
    methods: ['Pre-germinate the broccoli and cabbage on the substrate for 24 to 36 hours before sowing the chia and fenugreek; the chia mucilage then holds moisture for the brassicas through blackout.'],
  },
  {
    serial: 2,
    name: 'Porphyrin-Betalain Cascade',
    source: 'C',
    focus: 'Antioxidant maximization, free-radical scavenging',
    seeds: [{ varietyKey: 'radish', share: 0.4 }, { varietyKey: 'amaranth', share: 0.35 }, { varietyKey: 'borage', share: 0.25 }],
    ratioAsStated: 'Rambo radish 40 : Amaranth 35 : Borage 25',
    harvestAsStated: '12 to 16 days',
    regime: 'nutrition-forward',
    ppfd: null,
    lightAsStated: 'Blue-dominant, red to blue 1:1 or 2:1; the plan carries nutrition-forward blue, 25:75, bluer than asked',
    methods: ['Sow the amaranth first and let it establish 48 to 72 hours under high humidity before sowing the radish and borage.'],
  },
  {
    serial: 3,
    name: 'Macronutrient Base',
    source: 'C',
    focus: 'Protein density, essential fatty acids, biomass',
    seeds: [{ varietyKey: 'pea', share: 0.35 }, { varietyKey: 'sunflower', share: 0.35 }, { varietyKey: 'wheat', share: 0.15 }, { varietyKey: 'red-lentil', share: 0.15 }],
    ratioAsStated: 'Pea 35 : Sunflower 35 : Wheat 15 : Lentil 15',
    harvestAsStated: '10 to 12 days',
    regime: 'yield',
    ppfd: null,
    lightAsStated: 'Red-dominant, 5:1 or higher, for sunflower and pea biomass',
    methods: ['Soak all seed 8 to 12 hours, sanitizing the sunflower during the soak (mild peracetic acid or food-grade hydrogen peroxide).', 'Harvest before the sunflower\'s first true leaves and before the wheat turns fibrous.'],
  },
  {
    serial: 4,
    name: 'Culinary Aromatic Matrix',
    source: 'C',
    focus: 'Gastronomic complexity, sensory texture',
    seeds: [{ varietyKey: 'borage', share: 0.3 }, { varietyKey: 'fenugreek', share: 0.3 }, { varietyKey: 'broccoli', share: 0.2 }, { varietyKey: 'mung-bean', share: 0.2 }],
    ratioAsStated: 'Borage 30 : Fenugreek 30 : Broccoli 20 : Mung 20',
    harvestAsStated: '14 to 18 days',
    regime: 'balanced',
    ppfd: null,
    lightAsStated: 'No spectrum named; the 5:1 baseline',
    methods: ['A weighted, unperforated top tray through the first 72 hours of blackout, to thicken the hypocotyls and shed the borage and fenugreek hulls.'],
  },
  {
    serial: 5,
    name: 'Rapid-Canopy Sprouting',
    source: 'C',
    focus: 'High turnover, highly digestible nutrients',
    seeds: [{ varietyKey: 'mung-bean', share: 0.4 }, { varietyKey: 'red-lentil', share: 0.3 }, { varietyKey: 'radish', share: 0.2 }, { varietyKey: 'chia', share: 0.1 }],
    ratioAsStated: 'Mung 40 : Lentil 30 : Rambo radish 20 : Chia 10',
    harvestAsStated: '7 to 9 days',
    regime: 'balanced',
    ppfd: null,
    lightAsStated: 'No spectrum named; the 5:1 baseline',
    methods: ['Constant horizontal airflow across the canopy against the dense, high-moisture legume stand.'],
  },
  {
    serial: 6,
    name: 'Cellular Defense',
    source: 'rd',
    focus: 'Sulforaphane and phenols',
    seeds: [{ varietyKey: 'broccoli', share: third }, { varietyKey: 'red-cabbage', share: third }, { varietyKey: 'radish', share: third }],
    ratioAsStated: 'No ratio given; equal shares. The document names Sango radish; Rambo purple radish is grown',
    harvestAsStated: '10 to 14 days',
    regime: 'biofortify-far-red',
    ppfd: null,
    lightAsStated: '50 to 70 µmol/m²·s with 20% far-red',
    methods: [],
  },
  {
    serial: 7,
    name: 'Cardio-Lipid Shield',
    source: 'rd',
    focus: 'Cardiovascular support',
    seeds: null,
    held: 'Buckwheat is not in the seed library: it needs a supplier, a price per pound and grams per 1020 before this blend is built.',
    ratioAsStated: 'Red cabbage and buckwheat; no ratio given. The cabbage seeded slightly denser to compete for light',
    harvestAsStated: '12 to 16 days',
    regime: 'nutrition-forward',
    ppfd: null,
    lightAsStated: '25:75 red to blue for the last 3 to 4 days',
    methods: ['The 25:75 spectrum for the last 3 to 4 days of the cycle only.'],
  },
  {
    serial: 8,
    name: 'Plant-Powered Muscle Builder',
    source: 'rd',
    focus: 'Protein and fiber',
    seeds: [{ varietyKey: 'red-lentil', share: third }, { varietyKey: 'mung-bean', share: third }, { varietyKey: 'pea', share: third }],
    ratioAsStated: 'No ratio given; equal shares',
    harvestAsStated: null,
    regime: 'balanced',
    ppfd: 175,
    lightAsStated: '5:1 red to blue at 150 to 200 µmol/m²·s; the plan types 175',
    methods: ['A longer soak before sowing.'],
  },
  {
    serial: 9,
    name: 'Trace Mineral Matrix',
    source: 'rd',
    focus: 'Iron, zinc and copper',
    seeds: [{ varietyKey: 'broccoli', share: third }, { varietyKey: 'pea', share: third }, { varietyKey: 'mung-bean', share: third }],
    ratioAsStated: 'No ratio given; equal shares',
    harvestAsStated: null,
    regime: 'nutrition-forward',
    ppfd: null,
    lightAsStated: '25:75 red to blue, red and blue diodes only, no green',
    methods: ['No green light: red and blue diodes only.'],
  },
  {
    serial: 10,
    name: 'Skeletal Fortifier',
    source: 'rd',
    focus: 'Calcium and bone health',
    seeds: [{ varietyKey: 'sunflower', share: half }, { varietyKey: 'red-cabbage', share: half }],
    ratioAsStated: 'No ratio given; equal shares. The sunflower sown at a slightly lower density than usual',
    harvestAsStated: null,
    regime: 'balanced',
    ppfd: null,
    lightAsStated: 'No spectrum named; the 5:1 baseline',
    methods: ['The document names a cocopeat substrate for calcium and magnesium uptake; the plan carries the default hemp mat.'],
  },
  {
    serial: 11,
    name: 'Ocular & Vision Support',
    source: 'rd',
    focus: 'Carotenoids',
    seeds: [{ varietyKey: 'radish', share: half }, { varietyKey: 'red-lentil', share: half }],
    ratioAsStated: 'No ratio given; equal shares. The document names Sango radish; Rambo purple radish is grown',
    harvestAsStated: null,
    regime: 'balanced',
    ppfd: null,
    lightAsStated: 'No spectrum named; the 5:1 baseline, with a UV-C dose',
    methods: ['A brief UV-C dose, about 10 minutes, a few days before harvest.'],
  },
  {
    serial: 12,
    name: 'Vitamin C & Antioxidant Surge',
    source: 'rd',
    focus: 'Vitamin C and antioxidants',
    seeds: [{ varietyKey: 'mung-bean', share: third }, { varietyKey: 'pea', share: third }, { varietyKey: 'radish', share: third }],
    ratioAsStated: 'No ratio given; equal shares. The document names bean (mung) and Sango radish; Rambo purple radish is grown',
    harvestAsStated: '10 to 12 days',
    regime: 'balanced',
    ppfd: null,
    lightAsStated: 'Continuous 24-hour light for the last 48 hours before harvest',
    methods: ['Continuous 24-hour light for the last 48 hours before harvest only.'],
  },
];

export const blendCode = (b: Pick<BlendDef, 'serial'>): string => growPlanCode(BLEND_CODE_PREFIX, b.serial);

/** A blend as its grow plan: developing, on the 1020 flat, the hemp mat, FloraGrow from the light stage, its regime. */
export function blendPlan(b: BlendDef): GrowPlanDef | null {
  if (!b.seeds) return null;
  const lines: GrowPlanLine[] = [
    ...b.seeds.map((s) => seedLineFor(VARIETY_BY_KEY[s.varietyKey]!, 'flat-1020', s.share)),
    { kind: 'medium', mediumKey: 'hemp-mat', qtyPerTray: null },
    { kind: 'nutrient', nutrientKey: 'floragrow-npk', mlPerGal: null, startsAt: 'light' },
    { kind: 'light', regimeKey: b.regime, ppfd: b.ppfd === null ? null : tagged(b.ppfd, 'STATED', 'µmol/m²/s', b.lightAsStated), startsAt: 'light' },
  ];
  return {
    code: blendCode(b),
    name: b.name,
    status: 'developing',
    channels: [],
    format: 'flat-1020',
    lines,
    stageDays: null,
    note: [`${BLEND_SOURCE_LABEL[b.source]}. ${b.focus}.`, `Ratio: ${b.ratioAsStated}.`, b.harvestAsStated ? `Harvest as stated: ${b.harvestAsStated}.` : '', `Light as stated: ${b.lightAsStated}.`, ...b.methods].filter(Boolean).join(' '),
    allergensPresent: '',
    allergenFreeClaims: '',
  };
}

/** The blends that are built, as grow plans. */
export const blendSeed: GrowPlanDef[] = BLENDS.map(blendPlan).filter((p): p is GrowPlanDef => p !== null);
