/**
 * MicroFarm — the science library as data (`docs/science-library.md` is the register of record).
 *
 * One register keyed by URL. Rows 1–56 are the works cited by the nutritional research review
 * (document A) in its own order; rows 57–60 are the program's other sources; rows 61 onward are
 * the works the agronomy review (document B) adds. `DOCUMENT_ROWS` maps each document's inline
 * superscript numbers to rows, so a claim taken from either document cites the register.
 * Every row is registered on the Sources page through `sources-registry.ts`; a benefit stated
 * to a subscriber names its row (`varieties.ts`).
 */

import type { ReferenceSource } from './sources-registry';

/** P primary study, R review or meta-analysis, T trial registry, S seed supplier statement, C commercial page (context only). */
export type SourceGrade = 'P' | 'R' | 'T' | 'S' | 'C';

export interface ScienceSource {
  row: number;
  title: string;
  grade: SourceGrade;
  url: string;
  /** Author and year where a review names them. */
  cite?: string;
}

export const SCIENCE_SOURCES: readonly ScienceSource[] = [
  // ── Document A: The Clinical and Scientific Efficacy of Microgreens and Sprouts ──
  { row: 1, title: 'Microgreens: nutritional properties, health benefits, production (PubMed)', grade: 'R', url: 'https://pubmed.ncbi.nlm.nih.gov/41321944/' },
  { row: 2, title: 'Microgreens—A Comprehensive Review of Bioactive Molecules', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9864543/', cite: 'Kyriacou et al.' },
  { row: 3, title: 'Sprouts and Microgreens—Novel Food Sources for Healthy Diets', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8877763/', cite: 'Ebert, 2022' },
  { row: 4, title: 'Sprouts vs. Microgreens as Novel Functional Foods', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7587365/' },
  { row: 5, title: 'Microgreens on the rise: Expanding our horizons from farm to fork', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10881865/' },
  { row: 6, title: 'Sources & Research — Honor Harvest Farms', grade: 'C', url: 'https://honorharvestfarms.net/sources/' },
  { row: 7, title: 'Systematic review on the role of microgreens in the diet to combat micronutrient deficiencies and hidden hunger', grade: 'C', url: 'https://drannettevanonselen.co.za/systematic-review-on-the-role-of-microgreens-in-the-diet-to-combat-micronutrient-deficiencies-and-hidden-hunger/' },
  { row: 8, title: 'Prospects of microgreens as budding living functional food', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9905132/' },
  { row: 9, title: 'Bioactive Composition and Nutritional Profile of Microgreens Cultivated in Thailand', grade: 'P', url: 'https://www.mdpi.com/2076-3417/11/17/7981' },
  { row: 10, title: 'Enhanced nutritional value of mung bean microgreens compared to sprouts', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12919383/' },
  { row: 11, title: 'Microgreens: nutritional properties, health benefits, production (PMC)', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12662059/' },
  { row: 12, title: 'Bioactive Composition and Nutritional Profile of Microgreens (ResearchGate copy of row 9)', grade: 'P', url: 'https://www.researchgate.net/publication/354200345_Bioactive_Composition_and_Nutritional_Profile_of_Microgreens_Cultivated_in_Thailand' },
  { row: 13, title: 'Enhanced nutritional value of mung bean microgreens compared to sprouts (PubMed copy of row 10)', grade: 'P', url: 'https://pubmed.ncbi.nlm.nih.gov/41726547/' },
  { row: 14, title: 'Nutritional quality profiles of six microgreens', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11842852/' },
  { row: 15, title: 'A Comprehensive Antioxidant and Nutritional Profiling of Brassica microgreens', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11852083/' },
  { row: 16, title: 'Analysis of Phenolic Compounds in Buckwheat (Fagopyrum)', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9695562/' },
  { row: 17, title: 'Edible Plant Sprouts: Health Benefits, Trends, and Opportunities', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8398379/' },
  { row: 18, title: 'Physiology and Metabolism Alterations in Flavonoid Accumulation', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11644169/' },
  { row: 19, title: 'Sulforaphane—A Compound with Potential Health Benefits', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10886109/' },
  { row: 20, title: 'A review of the neuroprotective mechanisms of sulforaphane', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12271217/' },
  { row: 21, title: 'Sulforaphane rewires central metabolism to support antioxidant response', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10502441/', cite: 'Axelsson et al., 2023' },
  { row: 22, title: 'Broccoli or Sulforaphane: Is It the Source or Dose That Matters?', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6804255/' },
  { row: 23, title: 'Broccoli sprouts: an exceptionally rich source of inducers of enzymes (Johns Hopkins record)', grade: 'P', url: 'https://pure.johnshopkins.edu/en/publications/broccoli-sprouts-an-exceptionally-rich-source-of-inducers-of-enzy-3' },
  { row: 24, title: 'Broccoli sprouts: an exceptionally rich source of inducers (PMC copy of row 25)', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC23369/' },
  { row: 25, title: 'Broccoli sprouts as inducers of carcinogen-detoxifying enzyme systems', grade: 'P', url: 'https://www.pnas.org/doi/pdf/10.1073/pnas.94.21.11149', cite: 'Fahey et al., PNAS 1997' },
  { row: 26, title: 'Sulforaphane as a potential therapeutic agent', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12451241/' },
  { row: 27, title: 'Sulforaphane Bioavailability from Glucoraphanin-Rich Broccoli', grade: 'P', url: 'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0140963' },
  { row: 28, title: 'Phase 1 Study of a Sulforaphane-Containing Broccoli Sprout Homogenate in Sickle Cell Disease', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4829228/' },
  { row: 29, title: 'Sulforaphane: Its "Coming of Age" as a Clinically Relevant Nutraceutical', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6815645/' },
  { row: 30, title: 'Therapeutic potential of sulforaphane in liver diseases: a review', grade: 'R', url: 'https://www.frontiersin.org/journals/pharmacology/articles/10.3389/fphar.2023.1256029/full' },
  { row: 31, title: 'Red Cabbage Microgreens Lower Circulating LDL', grade: 'P', url: 'https://pubmed.ncbi.nlm.nih.gov/27933986/', cite: 'Huang et al., USDA 2016' },
  { row: 32, title: 'What foods should be avoided to manage high cholesterol levels?', grade: 'C', url: 'https://discovery.researcher.life/questions/what-foods-should-be-avoided-to-manage-high-cholesterol-levels/737041a7671d847f7d15de9b08e0d5cda187e35b' },
  { row: 33, title: 'The Science — Enriched Being', grade: 'C', url: 'https://enrichedbeing.com/pages/the-science' },
  { row: 34, title: 'The protective effect of red cabbage on water-soluble fractions', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9972813/' },
  { row: 35, title: 'Aqueous Extract of Glucoraphanin-Rich Broccoli Sprouts Inhibits AGE formation', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6106845/' },
  { row: 36, title: 'Feasibility and Tolerability of Daily Microgreen Consumption', grade: 'P', url: 'https://www.mdpi.com/2072-6643/17/3/467' },
  { row: 37, title: 'Beneficial Effects of Sulforaphane-Yielding Broccoli Sprout on Cardiometabolic Health: Systematic Review and Meta-analysis', grade: 'R', url: 'https://www.researchgate.net/publication/364457446_Beneficial_Effects_of_Sulforaphane-Yielding_Broccoli_Sprout_on_Cardiometabolic_Health_A_Systematic_Review_and_Meta-analysis' },
  { row: 38, title: 'Effect of broccoli sprouts on insulin resistance in type 2 diabetic patients', grade: 'P', url: 'https://pubmed.ncbi.nlm.nih.gov/22537070/', cite: 'Bahadoran et al., 2012' },
  { row: 39, title: 'Sulforaphane and Broccoli-Derived Preparations in Obesity', grade: 'R', url: 'https://www.mdpi.com/1424-8247/19/8/1244' },
  { row: 40, title: 'Sulforaphane reduces obesity by reversing leptin resistance', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8947770/' },
  { row: 41, title: 'Sulforaphane Against the Metabolic Consequences of a High-Fat Diet', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12943407/' },
  { row: 42, title: 'Potential of isothiocyanate sulforaphane to combat obesity and type 2 diabetes: Nrf2 pathway', grade: 'R', url: 'https://ukrbiochemjournal.org/2024/12/potential-of-isothiocyanate-sulforaphane-from-broccoli-to-combat-obesity-and-type-2-diabetes-involvement-of-nrf2-regulatory-pathway.html' },
  { row: 43, title: 'Sulforaphane from Broccoli Reduces Symptoms of Autism', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5672987/', cite: 'Singh et al., Johns Hopkins 2014' },
  { row: 44, title: 'NCT01335971 — Broccoli Sprout Extracts Trial in COPD', grade: 'T', url: 'https://clinicaltrials.gov/study/NCT01335971' },
  { row: 45, title: 'A Randomized Controlled Trial of the Effect of Broccoli Sprouts in asthma', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5010455/' },
  { row: 46, title: 'Sulforaphane inhibits extracellular, intracellular, and antibiotic-resistant H. pylori', grade: 'P', url: 'https://www.pnas.org/doi/pdf/10.1073/pnas.112203099' },
  { row: 47, title: 'Anticancer properties of sulforaphane: current insights', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10313060/' },
  { row: 48, title: 'The Effects of Broccoli Sprout Extract Containing Sulforaphane (H. pylori trial)', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4477992/' },
  { row: 49, title: 'A Narrative Review on Pseudocereals and Cardiometabolic Health', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13075176/' },
  { row: 50, title: 'The Raw Truth About Raw Foods — Food Safety Magazine', grade: 'C', url: 'https://www.food-safety.com/articles/10269-the-raw-truth-about-raw-foods' },
  { row: 51, title: 'An Outbreak Investigation of Salmonella Typhimurium Illnesses linked to sprouts', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10493856/' },
  { row: 52, title: 'Food Safety in Hydroponic Food Crop Production: A Review', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12248475/' },
  { row: 53, title: 'Post-Harvest UV-C Treatment of Microgreens for Pathogen Inactivation', grade: 'P', url: 'https://www.mdpi.com/2304-8158/15/6/974' },
  { row: 54, title: 'Microbial Quality of Leafy Greens Grown Under Soilless Production', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12472353/' },
  { row: 55, title: 'Harnessing beneficial microbes to boost sprout and microgreen production', grade: 'R', url: 'https://pubmed.ncbi.nlm.nih.gov/40552945/' },
  { row: 56, title: 'Microgreens and the Future of Food: The Food as Medicine Movement', grade: 'C', url: 'https://microgreensworld.com/microgreens-and-the-future-of-food/' },
  // ── The program's other sources ──
  { row: 57, title: 'Iron concentration in fenugreek microgreens', grade: 'P', url: 'https://doi.org/10.1002/fsn3.1209', cite: 'Journal of Food Science & Nutrition' },
  { row: 58, title: 'Protein and folate content in sprouted lentils', grade: 'P', url: 'https://doi.org/10.1016/j.foodchem.2018.06.123', cite: 'Food Chemistry' },
  { row: 59, title: 'True Leaf Market — variety pages and seed packaging', grade: 'S', url: 'https://www.trueleafmarket.com/' },
  { row: 60, title: 'Tray Specific Microgreen Seeding Guide', grade: 'S', url: 'https://onthegrow.net/', cite: 'On The Grow, 2023' },
  // ── Document B: Optimal Agronomic Practices — Growth Media and Lighting Optimization ──
  { row: 61, title: 'Microgreens: Functional Food for Nutrition and Dietary Diversification', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11859409/' },
  { row: 62, title: 'Improving food security through indoor vertical farming of microgreens', grade: 'R', url: 'https://www.frontiersin.org/journals/sustainable-food-systems/articles/10.3389/fsufs.2026.1809881/full' },
  { row: 63, title: 'The Nutritional Quality Potential of Microgreens, Baby Leaves, and Adult Plants', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8834567/' },
  { row: 64, title: 'Microgreens Production: Exploiting Environmental and Cultural Factors', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11435253/' },
  { row: 65, title: 'Emergence of microgreens as a valuable food, current status and future prospects', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11225695/' },
  { row: 66, title: 'Assessment of bioactive compounds, antioxidant properties and morphology of Brassica microgreens in soilless media', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11464729/' },
  { row: 67, title: 'Trial Protocol for Evaluating Platforms for Growing Microgreens in Controlled Environments', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9103178/' },
  { row: 68, title: 'Red:Blue LED Ratio Modulates Growth and Nutritional Quality of Microgreens', grade: 'P', url: 'https://www.mdpi.com/2311-7524/12/10/1210' },
  { row: 69, title: 'Effects of Green Light Deprivation and Red-to-Blue Ratio on Growth and Mineral Accumulation', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13075160/' },
  { row: 70, title: 'Effects of LED light treatments on the bioactive composition of microgreens', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC13253669/' },
  { row: 71, title: 'Light manipulation as a route to enhancement of antioxidant properties in microgreens', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11186462/' },
  { row: 72, title: 'Optimization of light spectrum and intensity to enhance growth and phytochemicals in microgreens', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12967691/' },
  { row: 73, title: 'Effect of Low Light Intensity With Supplemental Far-Red Light on Broccoli Microgreens', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12208883/' },
  { row: 74, title: 'Effects of LED lighting on the nutritional properties and microbial quality of microgreens', grade: 'P', url: 'https://www.frontiersin.org/journals/nutrition/articles/10.3389/fnut.2026.1869208/full' },
  { row: 75, title: 'Continuous LED Lighting Enhances Yield and Nutritional Value of Brassica Microgreens', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8781578/' },
];

export const SCIENCE_SOURCE_BY_ROW: Readonly<Record<number, ScienceSource>> = Object.fromEntries(SCIENCE_SOURCES.map((s) => [s.row, s]));

/**
 * Each document's own works-cited numbering, mapped to register rows, so an inline
 * superscript in either document resolves. Document A is the identity for 1–56.
 */
export const DOCUMENT_ROWS: Readonly<Record<'A' | 'B', readonly number[]>> = {
  A: Array.from({ length: 56 }, (_, i) => i + 1),
  B: [1, 61, 5, 6, 25, 62, 8, 63, 2, 64, 3, 11, 9, 50, 4, 10, 13, 65, 66, 67, 51, 52, 53, 21, 22, 55, 68, 69, 70, 71, 72, 73, 74, 75, 14, 20, 23, 24, 26, 27, 30, 28, 29, 38, 19, 41, 42, 43, 44, 45, 36, 33, 31, 32, 34, 16, 17, 18, 49],
};

/** The register row a document's inline number cites. */
export function rowFor(doc: 'A' | 'B', n: number): number {
  const row = DOCUMENT_ROWS[doc][n - 1];
  if (row === undefined) throw new Error(`Document ${doc} has no citation ${n}`);
  return row;
}

export type Evidence = 'human' | 'animal' | 'cell' | 'review' | 'meta-analysis' | 'registry' | 'supplier';

/** A claim as a document states it, the varieties it applies to, and the register rows it cites. */
export interface ScienceClaim {
  id: string;
  topic: 'nutrition' | 'mechanism' | 'cardiovascular' | 'metabolic' | 'neurological' | 'other-clinical' | 'safety' | 'media' | 'light';
  text: string;
  varieties: string[];
  evidence: Evidence;
  rows: number[];
}

const B = (n: number) => rowFor('B', n);

export const SCIENCE_CLAIMS: readonly ScienceClaim[] = [
  // ── Nutrient density and composition (document A) ──
  { id: 'density-4-40x', topic: 'nutrition', text: 'Microgreens exceed mature counterparts in nutrient density by 4 to 40 times depending on species and biomarker.', varieties: ['all'], evidence: 'review', rows: [4] },
  { id: 'antinutrients-degrade', topic: 'nutrition', text: 'Germination degrades antinutrients (phytic acid, tannins, trypsin inhibitors), raising the bioavailability of calcium, iron and zinc.', varieties: ['all'], evidence: 'review', rows: [3] },
  { id: 'fiber-double', topic: 'nutrition', text: 'Microgreens carry roughly double the dietary fiber of sprouts of the same species.', varieties: ['mung-bean'], evidence: 'human', rows: [10] },
  { id: 'legume-protein', topic: 'nutrition', text: 'Lentil microgreens deliver up to 6.47 g protein per 100 g fresh weight; mung bean 7.16 g carbohydrate per 100 g.', varieties: ['red-lentil', 'mung-bean'], evidence: 'human', rows: [9] },
  { id: 'minerals-panel', topic: 'nutrition', text: 'Potassium 187 to 416 mg, magnesium 46 to 87 mg, calcium 67 to 149 mg per 100 g fresh weight across six microgreens.', varieties: ['all'], evidence: 'human', rows: [14] },
  { id: 'trace-panel', topic: 'nutrition', text: 'Iron 524 to 2,610 µg, manganese 176 to 351 µg, zinc 32 to 130 µg, copper 459 to 956 µg per 100 g fresh weight.', varieties: ['all'], evidence: 'human', rows: [14] },
  { id: 'sunflower-calcium', topic: 'nutrition', text: 'Sunflower accumulates the most calcium of the panel.', varieties: ['sunflower'], evidence: 'human', rows: [14] },
  { id: 'broccoli-iron-manganese', topic: 'nutrition', text: 'Broccoli microgreens accumulate the most iron and manganese of the panel.', varieties: ['broccoli'], evidence: 'human', rows: [14] },
  { id: 'pea-phosphorus-copper', topic: 'nutrition', text: 'Pea microgreens accumulate the most phosphorus and copper of the panel.', varieties: ['pea'], evidence: 'human', rows: [14] },
  { id: 'vitamin-c-panel', topic: 'nutrition', text: 'Vitamin C: bean 80.45, pea 70.76, sunflower 67.55, broccoli 49.02, black radish 33.37, red beet 32.72 mg per 100 g fresh weight.', varieties: ['pea', 'sunflower', 'broccoli'], evidence: 'human', rows: [14] },
  { id: 'mung-vitamin-c', topic: 'nutrition', text: 'Mung bean microgreens hold more vitamin C (110.96 mg/100 g) than mung bean sprouts (88.89).', varieties: ['mung-bean'], evidence: 'human', rows: [10] },
  { id: 'lentil-chlorophyll', topic: 'nutrition', text: 'Lentil microgreens reach 112.62 mg per 100 g total chlorophyll and 28.37 mg carotenoids.', varieties: ['red-lentil'], evidence: 'human', rows: [9] },
  { id: 'radish-carotenoids', topic: 'nutrition', text: 'Kale and Sango radish accumulate lutein (996 mg/100 g) and beta-carotene (574 mg/100 g).', varieties: ['radish'], evidence: 'human', rows: [15] },
  { id: 'phenolics-panel', topic: 'nutrition', text: 'Broccoli microgreens reach 825.53 mg GAE per 100 g total phenolics; buckwheat 268.99 mg GAE with the highest DPPH scavenging.', varieties: ['broccoli'], evidence: 'human', rows: [9, 14] },
  { id: 'anthocyanins', topic: 'nutrition', text: 'Anthocyanins: purple radish 0.148 and red cabbage 0.246 mg CGE per 100 g.', varieties: ['radish', 'red-cabbage'], evidence: 'human', rows: [9] },
  { id: 'organic-acids', topic: 'nutrition', text: 'Organic acids: citric highest in red beet, succinic in beans, fumaric in sunflower.', varieties: ['sunflower'], evidence: 'human', rows: [14] },
  { id: 'brassica-ascorbic-glucosinolate', topic: 'nutrition', text: 'Brassica microgreens in soilless media carry 177.58 to 256.46 mg ascorbic acid per 100 g and 4.09 to 47.38 µmol/g glucosinolates; Sango radish reaches 76.82% DPPH and 88.49% ABTS inhibition.', varieties: ['broccoli', 'red-cabbage', 'radish'], evidence: 'human', rows: [B(19)] },
  // ── Mechanism ──
  { id: 'glucoraphanin-peak', topic: 'mechanism', text: 'Broccoli sprouts are the richest source of glucoraphanin; concentration peaks at 3 days, 10 to 100 times mature broccoli.', varieties: ['broccoli'], evidence: 'human', rows: [23, 25] },
  { id: 'myrosinase', topic: 'mechanism', text: 'Myrosinase, released when tissue is chewed or cut, converts glucoraphanin to sulforaphane.', varieties: ['broccoli', 'red-cabbage', 'radish'], evidence: 'review', rows: [22] },
  { id: 'phase-ii', topic: 'mechanism', text: 'Sulforaphane is among the most potent natural inducers of Phase II detoxification enzymes.', varieties: ['broccoli'], evidence: 'review', rows: [22] },
  { id: 'nrf2', topic: 'mechanism', text: 'Sulforaphane frees Nrf2 from Keap1; Nrf2 switches on 200-plus cytoprotective genes including HMOX1, NQO1 and glutathione synthesis.', varieties: ['broccoli'], evidence: 'review', rows: [19, 21] },
  { id: 'fresh-sprouts-bioavailability', topic: 'mechanism', text: 'Eating fresh whole sprouts gives up to 7-fold higher plasma and 5-fold higher urinary sulforaphane than myrosinase-inert extracts or cooked broccoli.', varieties: ['broccoli'], evidence: 'human', rows: [27] },
  // ── Cardiovascular ──
  { id: 'red-cabbage-ldl', topic: 'cardiovascular', text: '1.09% red cabbage microgreens in a high-fat diet: 34% lower LDL, 23% lower liver triglycerides, less liver inflammation.', varieties: ['red-cabbage'], evidence: 'animal', rows: [31] },
  { id: 'ages', topic: 'cardiovascular', text: 'Microgreen extracts reduce AGE formation and inflammatory markers (RAGE, MCP-1, ICAM-1) while raising eNOS.', varieties: ['broccoli', 'red-cabbage'], evidence: 'cell', rows: [35] },
  { id: 'daily-cups-feasibility', topic: 'cardiovascular', text: 'Two cups a day of red cabbage or beet microgreens for two weeks: 95.6% compliance; gastrointestinal inflammation symptoms improved with red cabbage.', varieties: ['red-cabbage'], evidence: 'human', rows: [36] },
  { id: 'blood-pressure-meta', topic: 'cardiovascular', text: 'Meta-analysis of broccoli sprout trials: systolic pressure down 10.9 mmHg, diastolic down 6.95 mmHg.', varieties: ['broccoli'], evidence: 'meta-analysis', rows: [37] },
  { id: 'rutin-vascular', topic: 'cardiovascular', text: 'Rutin in buckwheat supports capillary resilience and blood pressure regulation.', varieties: ['buckwheat'], evidence: 'review', rows: [16, 49] },
  // ── Metabolic ──
  { id: 'insulin-t2dm', topic: 'metabolic', text: '10 g/day broccoli sprout powder for 4 weeks lowered fasting insulin and HOMA-IR in type 2 diabetes.', varieties: ['broccoli'], evidence: 'human', rows: [38] },
  { id: 'lipid-peroxidation', topic: 'metabolic', text: '10 g/day broccoli sprout powder lowered malondialdehyde and oxidized LDL.', varieties: ['broccoli'], evidence: 'human', rows: [29] },
  { id: 'ppp-nadph', topic: 'metabolic', text: 'Sulforaphane redirects glucose toward the pentose phosphate pathway and one-carbon metabolism, generating NADPH for glutathione synthesis; entirely Nrf2-dependent.', varieties: ['broccoli'], evidence: 'cell', rows: [21] },
  { id: 'metabolic-animal', topic: 'metabolic', text: 'Sulforaphane suppresses liver gluconeogenesis and fat formation, promotes browning of white fat and fatty-acid oxidation.', varieties: ['broccoli'], evidence: 'animal', rows: [40, 41, 42] },
  // ── Neurological and other clinical ──
  { id: 'asd-trial', topic: 'neurological', text: '18 weeks of sulforaphane-rich extract improved irritability, lethargy, stereotypy, hyperactivity and social responsiveness in 44 young men with moderate to severe autism; gains reversed within 4 weeks of stopping.', varieties: ['broccoli'], evidence: 'human', rows: [43, 20] },
  { id: 'neuroprotection', topic: 'neurological', text: 'Sulforaphane crosses the blood-brain barrier; neuroprotection in Alzheimer\'s and Parkinson\'s models is preclinical.', varieties: ['broccoli'], evidence: 'animal', rows: [19, 20] },
  { id: 'copd-registry', topic: 'other-clinical', text: 'COPD trial NCT01335971 sought a safe sulforaphane dose that raises Nrf2 activity in airway cells.', varieties: ['broccoli'], evidence: 'registry', rows: [44] },
  { id: 'asthma-null', topic: 'other-clinical', text: 'A 3-day intervention in asthmatic adults raised serum sulforaphane without reducing exhaled nitric oxide.', varieties: ['broccoli'], evidence: 'human', rows: [45, 26] },
  { id: 'sickle-cell-phase1', topic: 'other-clinical', text: 'Phase 1 sickle cell trial: broccoli sprout homogenate was safe and raised HMOX1 mRNA, with a trend in fetal hemoglobin.', varieties: ['broccoli'], evidence: 'human', rows: [28] },
  { id: 'h-pylori', topic: 'other-clinical', text: 'Sulforaphane is bactericidal against H. pylori including antibiotic-resistant strains; two months of daily sprouts reduces colonization but does not eradicate it.', varieties: ['broccoli'], evidence: 'human', rows: [46, 48] },
  { id: 'fenugreek-iron', topic: 'nutrition', text: 'Fenugreek microgreens are rich in iron.', varieties: ['fenugreek'], evidence: 'human', rows: [57] },
  { id: 'lentil-protein-folate', topic: 'nutrition', text: 'Sprouted lentils are a good source of protein and folate.', varieties: ['red-lentil'], evidence: 'human', rows: [58] },
  // ── Safety ──
  { id: 'sprout-pathogens', topic: 'safety', text: 'Sprouts grown warm, humid and dark are the highest-risk format for Salmonella and STEC; contamination is often inside the seed coat where surface sanitizers miss it.', varieties: ['mung-bean', 'red-lentil', 'wheat'], evidence: 'review', rows: [17, 50, 51, 53] },
  { id: 'microgreen-risk', topic: 'safety', text: 'Microgreens under light with airflow and lower humidity carry lower risk, but root uptake and foliar contamination still require Good Agricultural Practices.', varieties: ['all'], evidence: 'review', rows: [54] },
  { id: 'pgpr', topic: 'safety', text: 'Seed or substrate inoculation with PGPR and protective endophytes (Bacillus, Exiguobacterium, Pseudomonas, Enterobacter) excludes pathogens, fixes nitrogen and raises yield.', varieties: ['all'], evidence: 'review', rows: [55] },
  { id: 'hydroponic-phytosanitary', topic: 'safety', text: 'Hydroponic systems on sterile inert mats with monitored water drastically reduce the pathogen vectors of soil and organic media.', varieties: ['all'], evidence: 'review', rows: [B(18), B(14), B(23)] },
  // ── Media (document B) ──
  { id: 'cocopeat-traits', topic: 'media', text: 'Cocopeat has high cation exchange capacity, pH 5.5 to 7.0, porosity 90 to 95% and low bulk density; it is naturally antifungal and gives more fresh and dry weight than field soil mixes.', varieties: ['all'], evidence: 'review', rows: [B(18)] },
  { id: 'peat-vermiculite-aeration', topic: 'media', text: 'Peat and vermiculite blends aerate the root zone and prevent the hypoxia behind damping-off.', varieties: ['all'], evidence: 'review', rows: [B(9)] },
  { id: 'substrate-elicitation', topic: 'media', text: 'Green and red basil grown on vermiculite and jute fiber carried augmented antioxidant concentrations; a resistive substrate acts as a mild stressor.', varieties: ['basil'], evidence: 'review', rows: [B(7)] },
  { id: 'alternative-media', topic: 'media', text: 'Sugarcane filter cake, white sphagnum and vermicompost work as media but must be monitored for microbial load and nitrate accumulation.', varieties: ['all'], evidence: 'review', rows: [B(7)] },
  { id: 'sulfur-glucosinolates', topic: 'media', text: 'Controlled sulfur supplementation in a hydroponic reservoir raises glucosinolate biosynthesis in Brassicaceae microgreens.', varieties: ['broccoli', 'red-cabbage', 'radish'], evidence: 'review', rows: [B(24)] },
  // ── Light (document B) ──
  { id: 'red-biomass', topic: 'light', text: 'Red light (600 to 700 nm) drives photosynthesis and biomass through phytochrome, but monochromatic red gives the lowest antioxidant and secondary-metabolite concentrations.', varieties: ['all'], evidence: 'human', rows: [B(27)] },
  { id: 'blue-antioxidants', topic: 'light', text: '100% blue light gave radish and broccoli microgreens a 16.3% average increase in total antioxidant activity and shorter, thicker growth.', varieties: ['radish', 'broccoli'], evidence: 'human', rows: [B(27)] },
  { id: 'blue-pea-phenolics', topic: 'light', text: 'Blue light maximizes total phenolic content in pea microgreens.', varieties: ['pea'], evidence: 'human', rows: [B(29)] },
  { id: 'rb-ratios-broccoli', topic: 'light', text: 'In broccoli, a 5:1 red-to-blue ratio balances shoot height, fresh weight, glucosinolates and antioxidants; 75:25 gave the highest nitrogen; 25:75 raised bioavailable iron 15 to 20%; red-dominant 5 to 9 ratios maximize weight but dilute phytochemicals.', varieties: ['broccoli'], evidence: 'human', rows: [B(27)] },
  { id: 'far-red-biofortify', topic: 'light', text: 'Far-red at 20% of flux with a low 50 to 75 µmol PPFD lengthens hypocotyls and raises fresh weight, and sharply raises ascorbic acid and total glucosinolates in broccoli.', varieties: ['broccoli'], evidence: 'human', rows: [B(32)] },
  { id: 'uvc-elicitation', topic: 'light', text: 'A brief UV-C exposure of about 10 minutes doubled chlorophyll and raised carotenoid synthesis in microgreens grown under red and blue LEDs.', varieties: ['all'], evidence: 'human', rows: [B(33)] },
  { id: 'green-deprivation', topic: 'light', text: 'Withholding green light under a high red-to-blue ratio raised macro- and micromineral accumulation and nitrogen in Salvia officinalis and Cannabis sativa.', varieties: ['all'], evidence: 'human', rows: [B(28)] },
  { id: 'broccoli-ppfd', topic: 'light', text: 'Broccoli microgreens grow and accumulate phytochemicals best at 50 to 70 µmol/m²/s; above 100 growth slows and reactive oxygen species damage tissue.', varieties: ['broccoli'], evidence: 'human', rows: [B(32), B(12)] },
  { id: 'pak-choi-ppfd', topic: 'light', text: 'Red pak choi carotenoids peak at 330 to 440 µmol/m²/s, lower at 110 and at 545.', varieties: ['pak-choi'], evidence: 'human', rows: [B(32)] },
  { id: 'continuous-light', topic: 'light', text: 'Continuous 24-hour light (DLI 15.6 and 23.3 mol/m²/day) raised fresh and dry weight and antioxidant enzyme activity in arugula, broccoli, mizuna and radish versus a 16-hour photoperiod, with no visible photodamage inside the harvest window.', varieties: ['broccoli', 'radish', 'arugula', 'mizuna'], evidence: 'human', rows: [B(34)] },
  { id: 'cea-decouples', topic: 'light', text: 'Controlled environment agriculture decouples yield from nutritional quality: deliberate abiotic stress through blue-rich light, far-red, UV, continuous photoperiods and resistive media raises secondary metabolites before harvest.', varieties: ['all'], evidence: 'review', rows: [B(6), B(10)] },
];

export const SCIENCE_CLAIM_BY_ID: Readonly<Record<string, ScienceClaim>> = Object.fromEntries(SCIENCE_CLAIMS.map((c) => [c.id, c]));

/** Claims that apply to a variety key, including the ones that apply to all. */
export function claimsForVariety(key: string): ScienceClaim[] {
  return SCIENCE_CLAIMS.filter((c) => c.varieties.includes(key) || c.varieties.includes('all'));
}

const GRADE_KIND: Record<SourceGrade, ReferenceSource['kind']> = { P: 'study', R: 'study', T: 'study', S: 'supplier_report', C: 'other' };
const GRADE_LABEL: Record<SourceGrade, string> = { P: 'primary study', R: 'review', T: 'trial registry', S: 'seed supplier statement', C: 'commercial page, context only' };

/** The rows as Sources-page registrations; `sources-registry.ts` merges them into the register. */
export const SCIENCE_REFERENCE_SOURCES: readonly ReferenceSource[] = SCIENCE_SOURCES.map((s) => ({
  key: `science:${s.row}`,
  kind: GRADE_KIND[s.grade],
  title: s.title,
  publisher: s.cite ?? new URL(s.url).hostname.replace(/^www\./, ''),
  year: null,
  citation: `Science library row ${s.row} (${GRADE_LABEL[s.grade]})`,
  sourceUrl: s.url,
  usedFor: 'Variety nutrient profiles, light and media responses, and the stated benefits behind them (docs/science-library.md)',
}));
