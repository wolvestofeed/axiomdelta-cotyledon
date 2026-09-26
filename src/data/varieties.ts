/**
 * MicroFarm — the variety library (outline §4). The master record and the cost basis.
 *
 * A variety carries its seed source and provenance, its price per pound (the rolling cost from
 * receipts replaces this seed figure once receipts exist), its seeding density per tray
 * format, its soak and stage days, its light and media responses, and its nutrient profile:
 * compounds, nutrients and stated benefits, each citing a row of the science library. Every
 * figure is tagged. Vallecito's twelve varieties seed the library; the prices are True Leaf
 * Market's 5-pound tier as Vallecito bought it in January 2024 (DATED), the densities are
 * what Vallecito sowed (STATED) beside the supplier's rate, the stage days are the supplier's
 * ranges read at Vallecito's practice (DATED), and yields are PLACEHOLDER until closed sowings
 * observe them.
 */

import { tagged, type Tagged } from '@/data/tagged';
import type { StageDays } from '@/data/stage-schedule';
import type { MediumKey, LightRegimeKey } from '@/data/inputs-catalog';
import type { Evidence } from '@/data/science-library';

export type VarietyFamily = 'Brassicaceae' | 'Asteraceae' | 'Fabaceae' | 'Boraginaceae' | 'Amaranthaceae' | 'Lamiaceae' | 'Poaceae';

export type VarietyKind = 'microgreen' | 'sprout' | 'both';

export interface StatedBenefit {
  statement: string;
  evidence: Evidence;
  rows: number[];
}

export interface NutrientProfile {
  /** Bioactive compounds the variety is known for. */
  compounds: string[];
  /** Nutrients the variety is a significant source of (Vallecito nutrient matrix and the library). */
  nutrients: string[];
  benefits: StatedBenefit[];
  /** Glossary keys the profile links to. */
  glossary: string[];
}

export interface LightResponse {
  /** The regime the plan defaults to for this variety. */
  defaultRegime: LightRegimeKey;
  /** The variety's own PPFD range at tray height, where studied; null means the regime's target stands. */
  ppfdRange: { min: number; max: number; rows: number[] } | null;
  /** What the studied responses say. */
  notes: { text: string; rows: number[] }[];
}

export interface MediaResponse {
  defaultMedium: MediumKey;
  notes: { text: string; rows: number[] }[];
}

export interface VarietyDef {
  key: string;
  /** The short code a grow plan's code starts with (`grow-plan.ts`): `BROC-01` is the first broccoli plan. */
  code: string;
  name: string;
  latinName: string;
  family: VarietyFamily;
  kind: VarietyKind;
  /** `code` is the supplier's short code on the library and on lot codes; `sku` the supplier's own item number. */
  supplier: { name: string; code: string; sku: string | null; organic: boolean; heirloom: boolean; nonGmo: boolean; origin: string | null };
  /** The seed price per pound this record opens with; receipts replace it as the rolling cost. */
  seedPricePerLb: Tagged;
  /** Grams sown per 1020 flat, or per pint jar for a sprout. */
  seedGramsPer1020: Tagged;
  /** The supplier's published rate, for the record. */
  supplierRate: string;
  soakHours: Tagged;
  /** Days per stage. Zero where the variety skips a stage. */
  stageDays: Tagged<StageDays>;
  /** Harvest grams per 1020 flat when cut; the observed yield replaces it. */
  harvestGramsPer1020: Tagged;
  flavor: string;
  color: string;
  light: LightResponse;
  media: MediaResponse;
  profile: NutrientProfile;
}

const TL = 'True Leaf Market, 5 lb tier, Vallecito purchase Jan 2024';
const microDays = (germination: number, blackout: number, light: number, window: number): StageDays => ({ soak: 0, sow: 1, germination, blackout, light, 'harvest-window': window });
const sproutDays = (rinseDays: number): StageDays => ({ soak: 1, sow: 0, germination: rinseDays, blackout: 0, light: 0, 'harvest-window': 1 });

export const VARIETIES: readonly VarietyDef[] = [
  {
    key: 'broccoli',
    code: 'BROC',
    name: 'Di Cicco broccoli',
    latinName: 'Brassica oleracea var. italica',
    family: 'Brassicaceae',
    kind: 'both',
    supplier: { name: 'True Leaf Market', code: 'TLM', sku: '45262', organic: true, heirloom: true, nonGmo: true, origin: null },
    seedPricePerLb: tagged(20.37, 'DATED', '$/lb', TL),
    seedGramsPer1020: tagged(40, 'STATED', 'g', 'Vallecito sowed 1.4 oz; the supplier rates 1 oz, On The Grow 15 to 25 g for brassicas'),
    supplierRate: '1 oz per 1020',
    soakHours: tagged(0, 'DATED', 'h', 'No soak'),
    stageDays: tagged(microDays(3, 3, 4, 3), 'DATED', 'days', 'Germination 2 to 3, blackout 2 to 4, harvest 8 to 12 (supplier); Vallecito ran a 4-day light cycle'),
    harvestGramsPer1020: tagged(250, 'PLACEHOLDER', 'g', 'No harvest weight observed'),
    flavor: 'Fresh, mild broccoli',
    color: 'Thin white stem, green top',
    light: {
      defaultRegime: 'balanced',
      ppfdRange: { min: 50, max: 70, rows: [73] },
      notes: [
        { text: 'Above 100 µmol growth slows and reactive oxygen species damage tissue.', rows: [73, 11] },
        { text: '5:1 red-to-blue balances height, weight, glucosinolates and antioxidants; 25:75 raises bioavailable iron 15 to 20%.', rows: [68] },
        { text: '20% far-red at 50 to 75 µmol sharply raises vitamin C and glucosinolates.', rows: [73] },
        { text: 'Continuous light raises weight and antioxidant enzymes.', rows: [75] },
      ],
    },
    media: { defaultMedium: 'coco-coir', notes: [{ text: 'Sulfur in hydroponic water raises glucosinolates.', rows: [21] }] },
    profile: {
      compounds: ['glucoraphanin', 'sulforaphane', 'phenolics'],
      nutrients: ['iron', 'manganese', 'vitamin C', 'vitamin K', 'sulforaphane'],
      benefits: [
        { statement: 'Broccoli sprouts hold 10 to 100 times the glucoraphanin of mature broccoli, peaking at three days.', evidence: 'human', rows: [23, 25] },
        { statement: 'Broccoli microgreens accumulate the most iron and manganese of a six-species panel.', evidence: 'human', rows: [14] },
        { statement: 'Sulforaphane from fresh sprouts activates the Nrf2 pathway, the body\'s own antioxidant and detoxification switch.', evidence: 'review', rows: [19, 21, 22] },
        { statement: 'In adults with type 2 diabetes, 10 g a day of broccoli sprout powder for four weeks lowered fasting insulin and insulin resistance.', evidence: 'human', rows: [38] },
        { statement: 'A meta-analysis of broccoli sprout trials found blood pressure reduced by 10.9 over 6.95 mmHg.', evidence: 'meta-analysis', rows: [37] },
        { statement: 'In 44 young men with autism, 18 weeks of sulforaphane-rich extract improved behavior scores; the gains reversed after stopping.', evidence: 'human', rows: [43] },
      ],
      glossary: ['glucoraphanin', 'sulforaphane', 'myrosinase', 'nrf2', 'phase-ii-enzyme'],
    },
  },
  {
    key: 'radish',
    code: 'RAD',
    name: 'Rambo purple radish',
    latinName: 'Raphanus sativus',
    family: 'Brassicaceae',
    kind: 'microgreen',
    supplier: { name: 'True Leaf Market', code: 'TLM', sku: '19221', organic: true, heirloom: true, nonGmo: true, origin: null },
    seedPricePerLb: tagged(25.14, 'DATED', '$/lb', TL),
    seedGramsPer1020: tagged(57, 'STATED', 'g', 'Vallecito sowed 2 oz; the supplier rates 1 oz'),
    supplierRate: '1 oz per 1020',
    soakHours: tagged(0, 'DATED', 'h', 'No soak'),
    stageDays: tagged(microDays(3, 2, 4, 3), 'DATED', 'days', 'Germination 2 to 3, blackout 1 to 2, harvest 6 to 10 (supplier)'),
    harvestGramsPer1020: tagged(300, 'PLACEHOLDER', 'g', 'No harvest weight observed'),
    flavor: 'Nutty, spicy, fresh',
    color: 'Spectacular purple',
    light: {
      defaultRegime: 'nutrition-forward',
      ppfdRange: null,
      notes: [
        { text: '100% blue gave radish and broccoli a 16.3% rise in total antioxidant activity.', rows: [68] },
        { text: 'Continuous light raises weight and antioxidant enzymes.', rows: [75] },
      ],
    },
    media: { defaultMedium: 'coco-coir', notes: [{ text: 'Soilless media gave Sango radish superior shoot height and width.', rows: [66] }] },
    profile: {
      compounds: ['anthocyanins', 'glucosinolates', 'lutein', 'beta-carotene'],
      nutrients: ['vitamin A', 'vitamin B', 'vitamin C', 'vitamin E', 'vitamin K', 'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'amino acids'],
      benefits: [
        { statement: 'Purple radish carries anthocyanins, the pigment that is also an antioxidant.', evidence: 'human', rows: [9] },
        { statement: 'Sango radish accumulates lutein and beta-carotene, the carotenoids of eye health.', evidence: 'human', rows: [15] },
        { statement: 'Radish microgreens reach 76.82% DPPH and 88.49% ABTS free-radical inhibition.', evidence: 'human', rows: [66] },
        { statement: 'Vitamins A, B, C, E and K, calcium, iron, magnesium, phosphorus, potassium, zinc and essential amino acids.', evidence: 'supplier', rows: [59] },
      ],
      glossary: ['anthocyanin', 'carotenoid', 'lutein', 'glucosinolate'],
    },
  },
  {
    key: 'sunflower',
    code: 'SUN',
    name: 'Black oil sunflower',
    latinName: 'Helianthus annuus',
    family: 'Asteraceae',
    kind: 'microgreen',
    supplier: { name: 'True Leaf Market', code: 'TLM', sku: '48555', organic: false, heirloom: false, nonGmo: true, origin: null },
    seedPricePerLb: tagged(7.37, 'DATED', '$/lb', TL),
    seedGramsPer1020: tagged(142, 'STATED', 'g', 'Vallecito sowed 5 oz; On The Grow 125 to 150 g'),
    supplierRate: '125 to 150 g per 1020 (On The Grow)',
    soakHours: tagged(7, 'DATED', 'h', '6 to 8 hours in cold water'),
    stageDays: tagged(microDays(3, 2, 4, 3), 'DATED', 'days', 'Harvest 7 to 10 (supplier); Vallecito 4-day light cycle'),
    harvestGramsPer1020: tagged(400, 'PLACEHOLDER', 'g', 'No harvest weight observed'),
    flavor: 'Nutty, sweet, savory, oily',
    color: 'Even green shoots',
    light: { defaultRegime: 'balanced', ppfdRange: null, notes: [] },
    media: { defaultMedium: 'coco-coir', notes: [{ text: 'Soil-based media such as coir preferred by the supplier.', rows: [59] }] },
    profile: {
      compounds: ['fumaric acid', 'phenolic acids'],
      nutrients: ['calcium', 'potassium', 'protein', 'iron', 'phosphorus', 'magnesium', 'vitamin A', 'vitamin C', 'B complex', 'vitamin E'],
      benefits: [
        { statement: 'Sunflower accumulates the most calcium of a six-species panel and 67.55 mg vitamin C per 100 g.', evidence: 'human', rows: [14] },
        { statement: 'Fumaric acid peaks in sunflower among the organic acids.', evidence: 'human', rows: [14] },
        { statement: 'About 20% protein, with vitamins A, B complex, D and E, calcium, iron, magnesium, potassium and phosphorus.', evidence: 'supplier', rows: [59] },
      ],
      glossary: ['macro-mineral', 'organic-acid'],
    },
  },
  {
    key: 'pea',
    code: 'PEA',
    name: 'Speckled pea',
    latinName: 'Pisum sativum',
    family: 'Fabaceae',
    kind: 'microgreen',
    supplier: { name: 'True Leaf Market', code: 'TLM', sku: null, organic: true, heirloom: true, nonGmo: true, origin: null },
    seedPricePerLb: tagged(3.26, 'DATED', '$/lb', TL),
    seedGramsPer1020: tagged(227, 'STATED', 'g', 'Vallecito sowed 8 oz; the supplier rates 5 to 8 oz, On The Grow 200 to 260 g'),
    supplierRate: '5 to 8 oz per 1020',
    soakHours: tagged(5, 'DATED', 'h', '4 to 6 hours in cold water'),
    stageDays: tagged(microDays(3, 4, 4, 4), 'DATED', 'days', 'Germination 2 to 3, blackout 3 to 5, harvest 8 to 14 (supplier)'),
    harvestGramsPer1020: tagged(450, 'PLACEHOLDER', 'g', 'No harvest weight observed'),
    flavor: 'Sweet, fresh pea',
    color: 'Green',
    light: { defaultRegime: 'balanced', ppfdRange: null, notes: [{ text: 'Blue light maximizes total phenolics in pea.', rows: [70] }] },
    media: { defaultMedium: 'coco-coir', notes: [{ text: 'Soil preferred by the supplier; hydroponic is harder.', rows: [59] }] },
    profile: {
      compounds: ['flavonoids', 'organic acids'],
      nutrients: ['phosphorus', 'copper', 'vitamin C', 'protein', 'fiber', 'omega-3', 'vitamin A', 'vitamin E', 'B vitamins'],
      benefits: [
        { statement: 'Pea accumulates the most phosphorus and copper of a six-species panel and 70.76 mg vitamin C per 100 g.', evidence: 'human', rows: [14] },
        { statement: 'Vitamins A, C, E, B1, B2, B3 and B6, protein, fiber and omega-3.', evidence: 'supplier', rows: [59] },
      ],
      glossary: ['trace-mineral', 'ascorbic-acid'],
    },
  },
  {
    key: 'fenugreek',
    code: 'FEN',
    name: 'Fenugreek',
    latinName: 'Trigonella foenum-graecum',
    family: 'Fabaceae',
    kind: 'both',
    supplier: { name: 'True Leaf Market', code: 'TLM', sku: '16764', organic: true, heirloom: true, nonGmo: true, origin: null },
    seedPricePerLb: tagged(8.22, 'DATED', '$/lb', TL),
    seedGramsPer1020: tagged(57, 'STATED', 'g', 'Vallecito sowed 2 oz'),
    supplierRate: '10 to 15 g per 1020 (Vallecito research)',
    soakHours: tagged(10, 'STATED', 'h', '8 to 12 hours (Vallecito research database)'),
    stageDays: tagged(microDays(3, 2, 4, 3), 'STATED', 'days', 'Blackout 2 to 3, harvest 7 to 10 (Vallecito research database)'),
    harvestGramsPer1020: tagged(250, 'PLACEHOLDER', 'g', 'No harvest weight observed'),
    flavor: 'Bitter, maple, nutty',
    color: 'Green',
    light: { defaultRegime: 'balanced', ppfdRange: null, notes: [] },
    media: { defaultMedium: 'coco-coir', notes: [] },
    profile: {
      compounds: ['saponins'],
      nutrients: ['iron', 'protein', 'fiber', 'magnesium', 'vitamin B6'],
      benefits: [
        { statement: 'Fenugreek microgreens are rich in iron.', evidence: 'human', rows: [57] },
        { statement: 'Iron, protein and fiber; soaking and sprouting improve its digestion.', evidence: 'supplier', rows: [59] },
      ],
      glossary: ['trace-mineral', 'dietary-fiber'],
    },
  },
  {
    key: 'borage',
    code: 'BOR',
    name: 'Borage',
    latinName: 'Borago officinalis',
    family: 'Boraginaceae',
    kind: 'microgreen',
    supplier: { name: 'True Leaf Market', code: 'TLM', sku: '41571', organic: false, heirloom: true, nonGmo: true, origin: null },
    seedPricePerLb: tagged(25.69, 'DATED', '$/lb', TL),
    seedGramsPer1020: tagged(57, 'STATED', 'g', 'Vallecito sowed 2 oz'),
    supplierRate: '10 to 15 g per 1020 (Vallecito research)',
    soakHours: tagged(0, 'DATED', 'h', 'No soak'),
    stageDays: tagged(microDays(3, 3, 6, 4), 'DATED', 'days', 'Days to maturity 10 to 20 (supplier)'),
    harvestGramsPer1020: tagged(200, 'PLACEHOLDER', 'g', 'No harvest weight observed'),
    flavor: 'Strong cucumber and melon, light bitter finish',
    color: 'Green, slightly furry',
    light: { defaultRegime: 'balanced', ppfdRange: null, notes: [] },
    media: { defaultMedium: 'coco-coir', notes: [] },
    profile: {
      compounds: ['gamma-linolenic acid'],
      nutrients: ['vitamin C', 'vitamin B', 'vitamin K', 'folate', 'fiber', 'iron', 'calcium', 'magnesium'],
      benefits: [{ statement: 'Vitamins B, C and K, folic acid and fiber.', evidence: 'supplier', rows: [59] }],
      glossary: ['essential-fatty-acid'],
    },
  },
  {
    key: 'amaranth',
    code: 'AMA',
    name: 'Red garnet amaranth',
    latinName: 'Amaranthus tricolor',
    family: 'Amaranthaceae',
    kind: 'microgreen',
    supplier: { name: 'True Leaf Market', code: 'TLM', sku: null, organic: true, heirloom: true, nonGmo: true, origin: null },
    seedPricePerLb: tagged(21.08, 'DATED', '$/lb', TL),
    seedGramsPer1020: tagged(28, 'STATED', 'g', 'Vallecito sowed 1 oz; On The Grow 15 to 20 g for small seed'),
    supplierRate: '1 oz per 1020',
    soakHours: tagged(0, 'DATED', 'h', 'No soak'),
    stageDays: tagged(microDays(3, 3, 4, 3), 'DATED', 'days', 'Germination 2 to 3, blackout 2 to 4, harvest 8 to 12 (supplier)'),
    harvestGramsPer1020: tagged(150, 'PLACEHOLDER', 'g', 'No harvest weight observed'),
    flavor: 'Mild, sweet',
    color: 'The most vibrant red and pink of any microgreen',
    light: { defaultRegime: 'nutrition-forward', ppfdRange: null, notes: [] },
    media: { defaultMedium: 'coco-coir', notes: [] },
    profile: {
      compounds: ['carotenoids', 'betalains'],
      nutrients: ['vitamin K', 'vitamin E', 'vitamin C', 'protein', 'lysine', 'calcium', 'iron', 'manganese', 'zinc', 'copper'],
      benefits: [
        { statement: 'Garnet amaranth carries high concentrations of carotenoids.', evidence: 'supplier', rows: [59] },
        { statement: 'Vitamins K, E and C, protein, calcium, iron and beta-carotene.', evidence: 'supplier', rows: [59] },
      ],
      glossary: ['carotenoid', 'beta-carotene'],
    },
  },
  {
    key: 'red-cabbage',
    code: 'CAB',
    name: 'Red Acre cabbage',
    latinName: 'Brassica oleracea var. capitata',
    family: 'Brassicaceae',
    kind: 'microgreen',
    supplier: { name: 'True Leaf Market', code: 'TLM', sku: null, organic: true, heirloom: true, nonGmo: true, origin: null },
    seedPricePerLb: tagged(13.36, 'DATED', '$/lb', TL),
    seedGramsPer1020: tagged(28, 'STATED', 'g', 'Vallecito sowed 1 oz'),
    supplierRate: '1 oz per 1020',
    soakHours: tagged(0, 'DATED', 'h', 'No soak'),
    stageDays: tagged(microDays(3, 3, 4, 3), 'DATED', 'days', 'As broccoli'),
    harvestGramsPer1020: tagged(250, 'PLACEHOLDER', 'g', 'No harvest weight observed'),
    flavor: 'Mild cabbage, sweet',
    color: 'Purple stems, green leaves',
    light: {
      defaultRegime: 'nutrition-forward',
      ppfdRange: null,
      notes: [
        { text: 'Blue-rich light raises anthocyanins and phenolics in brassicas.', rows: [68] },
        { text: 'Continuous light raises weight and antioxidant enzymes.', rows: [75] },
      ],
    },
    media: { defaultMedium: 'coco-coir', notes: [{ text: 'Sulfur in hydroponic water raises glucosinolates.', rows: [21] }] },
    profile: {
      compounds: ['anthocyanins', 'glucosinolates', 'polyphenols'],
      nutrients: ['vitamin C', 'calcium', 'magnesium', 'beta-carotene', 'vitamin E', 'vitamin K'],
      benefits: [
        { statement: 'Red cabbage microgreens carry 0.246 mg anthocyanins per 100 g, the highest of the panel.', evidence: 'human', rows: [9] },
        { statement: 'In mice on a high-fat diet, 1.09% red cabbage microgreens lowered LDL 34% and liver triglycerides 23%.', evidence: 'animal', rows: [31] },
        { statement: 'Two cups a day for two weeks was well tolerated by healthy adults and improved gastrointestinal inflammation symptoms.', evidence: 'human', rows: [36] },
        { statement: 'Among microgreens, red cabbage has the highest concentration of vitamin C.', evidence: 'supplier', rows: [59] },
      ],
      glossary: ['anthocyanin', 'ldl-and-hdl', 'glucosinolate'],
    },
  },
  {
    key: 'chia',
    code: 'CHIA',
    name: 'Chia',
    latinName: 'Salvia hispanica',
    family: 'Lamiaceae',
    kind: 'microgreen',
    supplier: { name: 'True Leaf Market', code: 'TLM', sku: null, organic: true, heirloom: false, nonGmo: true, origin: null },
    seedPricePerLb: tagged(10.86, 'DATED', '$/lb', TL),
    seedGramsPer1020: tagged(28, 'STATED', 'g', 'Vallecito sowed 1 oz'),
    supplierRate: '1 oz per 1020',
    soakHours: tagged(0, 'DATED', 'h', 'No soak: the seed gels'),
    stageDays: tagged(microDays(3, 3, 5, 3), 'DATED', 'days', 'Germination 2 to 3, blackout 2 to 4, harvest 8 to 12 (supplier); Vallecito research 10 to 14'),
    harvestGramsPer1020: tagged(150, 'PLACEHOLDER', 'g', 'No harvest weight observed'),
    flavor: 'Mild bitterness',
    color: 'Green',
    light: { defaultRegime: 'balanced', ppfdRange: null, notes: [] },
    media: { defaultMedium: 'jute-mat', notes: [{ text: 'A mat suits a gelling seed sown on the surface.', rows: [] }] },
    profile: {
      compounds: ['omega-3 fatty acids', 'antioxidants'],
      nutrients: ['omega-3', 'fiber', 'protein', 'calcium', 'iron', 'magnesium'],
      benefits: [{ statement: 'Omega oils, antioxidants, amino acids and protein.', evidence: 'supplier', rows: [59] }],
      glossary: ['essential-fatty-acid', 'dietary-fiber'],
    },
  },
  {
    key: 'mung-bean',
    code: 'MUNG',
    name: 'Mung bean',
    latinName: 'Vigna radiata',
    family: 'Fabaceae',
    kind: 'sprout',
    supplier: { name: 'True Leaf Market', code: 'TLM', sku: null, organic: true, heirloom: true, nonGmo: true, origin: null },
    seedPricePerLb: tagged(5.97, 'DATED', '$/lb', TL),
    seedGramsPer1020: tagged(128, 'STATED', 'g', 'Per pint jar: Vallecito 4.5 oz seed'),
    supplierRate: '4 Tbsp per cup; 1 part seed to 2 parts sprouts',
    soakHours: tagged(5, 'DATED', 'h', '4 to 6 hours'),
    stageDays: tagged(sproutDays(3), 'DATED', 'days', '2 to 4 days to harvest, rinsed 2 to 3 times a day'),
    harvestGramsPer1020: tagged(256, 'DATED', 'g', 'Supplier yield ratio: one part seed to two parts sprouts'),
    flavor: 'Mild, nutty, creamy, earthy',
    color: 'White tail and flesh as the green shell sheds',
    light: { defaultRegime: 'balanced', ppfdRange: null, notes: [{ text: 'Sprouts grow in the dark; no light line.', rows: [] }] },
    media: { defaultMedium: 'none', notes: [] },
    profile: {
      compounds: ['dietary fiber', 'flavonoids'],
      nutrients: ['protein', 'calcium', 'iron', 'vitamin C', 'potassium', 'phosphorus', 'magnesium', 'zinc', 'B vitamins'],
      benefits: [
        { statement: 'Mung bean microgreens hold more vitamin C than mung bean sprouts and about twice the fiber, with more calcium, magnesium, iron and zinc.', evidence: 'human', rows: [10] },
        { statement: 'Sprouting degrades the antinutrients of the dry bean, so its minerals absorb better.', evidence: 'review', rows: [3] },
        { statement: 'Protein, fiber, potassium, phosphorus, magnesium, zinc and vitamins B1, B2, B3 and B5.', evidence: 'supplier', rows: [59] },
      ],
      glossary: ['sprout', 'antinutrient', 'bioavailability'],
    },
  },
  {
    key: 'red-lentil',
    code: 'LEN',
    name: 'Red lentil',
    latinName: 'Lens culinaris',
    family: 'Fabaceae',
    kind: 'sprout',
    supplier: { name: 'True Leaf Market', code: 'TLM', sku: null, organic: true, heirloom: false, nonGmo: true, origin: null },
    seedPricePerLb: tagged(5.23, 'DATED', '$/lb', TL),
    seedGramsPer1020: tagged(50, 'STATED', 'g', 'Per pint jar: a quarter cup'),
    supplierRate: '1/4 cup per quart jar',
    soakHours: tagged(6, 'DATED', 'h', '4 to 8 hours'),
    stageDays: tagged(sproutDays(3), 'DATED', 'days', '2 to 4 days to harvest, rinsed 2 to 3 times a day'),
    harvestGramsPer1020: tagged(100, 'PLACEHOLDER', 'g', 'No yield observed'),
    flavor: 'Smooth, creamy, peppery',
    color: 'Orange seed, white shoot',
    light: { defaultRegime: 'balanced', ppfdRange: null, notes: [{ text: 'Sprouts grow in the dark; no light line.', rows: [] }] },
    media: { defaultMedium: 'none', notes: [] },
    profile: {
      compounds: ['carotenoids', 'chlorophyll'],
      nutrients: ['protein', 'folate', 'potassium', 'magnesium', 'calcium', 'phosphorus', 'vitamin A', 'vitamin C', 'omega-3', 'omega-6'],
      benefits: [
        { statement: 'Sprouted lentils are a good source of protein and folate.', evidence: 'human', rows: [58] },
        { statement: 'Lentil microgreens carry the highest protein of the common microgreens, 6.47 g per 100 g, with 112.62 mg chlorophyll and 28.37 mg carotenoids.', evidence: 'human', rows: [9] },
      ],
      glossary: ['macronutrient', 'chlorophyll'],
    },
  },
  {
    key: 'wheat',
    code: 'WHT',
    name: 'Hard red winter wheat',
    latinName: 'Triticum aestivum',
    family: 'Poaceae',
    kind: 'sprout',
    supplier: { name: 'True Leaf Market', code: 'TLM', sku: null, organic: true, heirloom: false, nonGmo: true, origin: null },
    seedPricePerLb: tagged(5.23, 'DATED', '$/lb', TL),
    seedGramsPer1020: tagged(60, 'STATED', 'g', 'Per pint jar'),
    supplierRate: 'Tray, sack or jar; 8-hour soak',
    soakHours: tagged(8, 'DATED', 'h', ''),
    stageDays: tagged(sproutDays(4), 'DATED', 'days', '4 to 5 days to maturity'),
    harvestGramsPer1020: tagged(120, 'PLACEHOLDER', 'g', 'No yield observed'),
    flavor: 'Fresh and sweet',
    color: 'Tan seed, white shoot',
    light: { defaultRegime: 'balanced', ppfdRange: null, notes: [{ text: 'Sprouts grow in the dark; no light line.', rows: [] }] },
    media: { defaultMedium: 'none', notes: [] },
    profile: {
      compounds: [],
      nutrients: ['vitamin B', 'vitamin C', 'vitamin K', 'folate', 'fiber'],
      benefits: [{ statement: 'Vitamins B, C and K, folic acid and fiber.', evidence: 'supplier', rows: [59] }],
      glossary: ['sprout', 'dietary-fiber'],
    },
  },
];

export const VARIETY_BY_KEY: Readonly<Record<string, VarietyDef>> = Object.fromEntries(VARIETIES.map((v) => [v.key, v]));

export const VARIETY_BY_CODE: Readonly<Record<string, VarietyDef>> = Object.fromEntries(VARIETIES.map((v) => [v.code, v]));

/** Seed cost of one 1020 flat at the record's opening price. */
export function seedCostPer1020(v: VarietyDef, pricePerLb: number = v.seedPricePerLb.value): number {
  return (v.seedGramsPer1020.value / 453.592) * pricePerLb;
}
