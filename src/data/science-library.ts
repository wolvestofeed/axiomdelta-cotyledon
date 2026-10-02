/**
 * Cotyledon — the science library as data (`docs/science-library.md` is the register of record).
 *
 * One register keyed by URL. Rows 1–56 are the works cited by the nutritional research review
 * (document A) in its own order; rows 57–60 are the program's other sources; rows 61 onward are
 * the works the agronomy review (document B) adds; rows 76–92 the clinical and blend review's
 * (document C), rows 93–103 the hemp and coir review's (document D) and rows 104–170 the microgreens
 * LCA compilation's (document E, `research/`). `DOCUMENT_ROWS` maps each
 * document's inline superscript numbers to rows, so a claim taken from any of them cites the register.
 * Every row is registered on the Sources page through `sources-registry.ts`; a benefit stated
 * to a subscriber names its row (`varieties.ts`).
 */

import type { ReferenceSource } from '@/data/sources-registry';

/** P primary study, R review or meta-analysis, T trial registry, S a supplier's statement about its own seed or product, D a dataset, a declaration or an agency publication (a database's documentation, an EPD, a government page), C commercial page (context only). */
export type SourceGrade = 'P' | 'R' | 'T' | 'S' | 'D' | 'C';

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
  // ── Document C: Clinical Research and Blend Optimization for Specific Microgreen Varieties ──
  { row: 76, title: 'Metabolomics and bioactive attributes of fenugreek microgreens: antioxidant, antibacterial and antibiofilm potential', grade: 'P', url: 'https://www.researchgate.net/publication/381002330_Metabolomics_and_bioactive_attributes_of_fenugreek_microgreens_Insights_into_antioxidant_antibacterial_and_antibiofilm_potential' },
  { row: 77, title: 'Bioactive Potential and Health Benefits of Trigonella foenum-graecum', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12411738/' },
  { row: 78, title: 'Antioxidant and Antimicrobial Effects of Baby Leaves of Amaranthus tricolor in Correlation with Their Phytochemical Composition', grade: 'P', url: 'https://www.researchgate.net/publication/368079287_Antioxidant_and_Antimicrobial_Effects_of_Baby_Leaves_of_Amaranthus_tricolor_L_Harvested_as_Vegetable_in_Correlation_with_Their_Phytochemical_Composition' },
  { row: 79, title: 'Recent Advances in the Therapeutic Potential of Bioactive Compounds', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12157067/' },
  { row: 80, title: 'Extraction of Antioxidants from Borage (Borago officinalis L.) Leaves', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4665488/' },
  { row: 81, title: 'Phenolic Profile and Comparison of the Antioxidant, Anti-Ageing Activities', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9865334/' },
  { row: 82, title: 'Pressurized Liquid Extraction of Bioactive Compounds from Seeds', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12191721/' },
  { row: 83, title: 'Boost Your Health with Borage Microgreens: A Nutritional Guide', grade: 'C', url: 'https://microgreensworld.com/borage-microgreens-nutrition/' },
  { row: 84, title: 'Borage (PubMed)', grade: 'R', url: 'https://pubmed.ncbi.nlm.nih.gov/30000849/' },
  { row: 85, title: 'Borago officinalis seed oil (BSO), a natural source of omega-6 fatty acids', grade: 'P', url: 'https://pubmed.ncbi.nlm.nih.gov/30043014/' },
  { row: 86, title: 'Protective Effect of Borage Seed Oil and Gamma Linolenic Acid on DNA', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3584109/' },
  { row: 87, title: 'Protective effect of borage seed oil and gamma linolenic acid on DNA (PubMed copy of row 86)', grade: 'P', url: 'https://pubmed.ncbi.nlm.nih.gov/23460824/' },
  { row: 88, title: 'Cancer Prevention and Health Benefices of Traditionally Consumed Borago officinalis', grade: 'P', url: 'https://pubmed.ncbi.nlm.nih.gov/26797631/' },
  { row: 89, title: 'The protective effects of omega-6 fatty acids (PubMed)', grade: 'P', url: 'https://pubmed.ncbi.nlm.nih.gov/11122253/' },
  { row: 90, title: 'Multifunctional Edible Amaranths: A Review of Nutritional Benefits', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12785712/' },
  { row: 91, title: 'Botany, ethnomedicine, phytochemistry and pharmacology of Amaranthus spp.: a review', grade: 'R', url: 'https://www.researchgate.net/publication/389401145_Botany_ethnomedicine_phytochemistry_and_pharmacology_of_Amaranthus_spp-_a_review' },
  { row: 92, title: 'The amaranth seeds as a source of nutrients and bioactive substances in human diet', grade: 'R', url: 'https://www.researchgate.net/publication/348138296_THE_AMARANTH_SEEDS_AS_A_SOURCE_OF_NUTRIENTS_AND_BIOACTIVE_SUBSTANCES_IN_HUMAN_DIET' },
  // ── Document D: Comparative Analysis of Hemp Mats and Coco Coir ──
  { row: 93, title: '(Comparison) Best Growing Mediums for Microgreens — HerbSpeak', grade: 'C', url: 'https://herbspeak.com/microgreens-growing-mediums/' },
  { row: 94, title: 'Coco Coir vs Hemp Grow Mats: An Honest Comparison — TerraFibre', grade: 'S', url: 'https://terrafibre.ca/pages/coco-coir-vs-hemp-grow-mats/' },
  { row: 95, title: 'Multipurpose Biodegradable Fiber Mats and Mulch Sheets in Agriculture — PlantArc', grade: 'C', url: 'https://plantarc.com/multipurpose-biodegradable-fiber-mats-and-mulch-sheets-in-agriculture-applications-in-microgreen-production-and-weed-suppression/' },
  { row: 96, title: 'Microgreen Growing Mediums: What We Found to be the Best — Home Microgreens', grade: 'C', url: 'https://homemicrogreens.com/microgreen-growing-mediums-2/' },
  { row: 97, title: 'Microgreen Mats — FAQ and Guidance (microgreen-mats.com)', grade: 'S', url: 'https://microgreen-mats.com/microgreen-mats-faq-guidance/' },
  { row: 98, title: 'Best Growing Mats for Microgreens: A Handy Comparison — RusticWise', grade: 'C', url: 'https://rusticwise.com/best-growing-mats-for-microgreens/' },
  { row: 99, title: 'Biodegradable Grow Mats for Microgreens: A Complete Guide — Microgreens World', grade: 'C', url: 'https://microgreensworld.com/biodegradable-grow-mats-for-microgreens/' },
  { row: 100, title: 'Coco Coir vs. Reusable Grow Medium: 35% Yield Test — On The Grow', grade: 'C', url: 'https://onthegrow.net/blogs/microgreens/case-study-coco-coir-vs-reusable-microgreen-grow-medium-high-seeding-density/' },
  { row: 101, title: 'Hemp fiber mats, coco coir and nutrients (YouTube)', grade: 'C', url: 'https://www.youtube.com/watch?v=FXBUp7J-mYo' },
  { row: 102, title: 'Hemp Grow Pads Vs Coco Coir Mats for Clean Indoor Microgreens — Indoor Leaf Grow', grade: 'C', url: 'https://indoorleafgrow.com/hemp-grow-pads-vs-coco-coir-mats-for-clean-indoor-microgreens/' },
  { row: 103, title: 'Hydroponic Fiber Mats Altered Shoot Growth and Mineral Nutrient Concentration of Microgreens', grade: 'P', url: 'https://www.mdpi.com/2311-7524/10/12/1298/' },
  // ── Document E: Comprehensive Life Cycle Assessment and Phytonutrient Optimization in Controlled Environment Microgreen Agriculture (research/) ──
  { row: 104, title: 'Broccoli Microgreens Sulforaphane Benefits Explained — AquaGer Tech', grade: 'C', url: 'https://aquagertech.com/blogs/microgreens/sulforaphane-broccoli-microgreens' },
  { row: 105, title: 'Life Cycle Assessment (LCA): Everything You Need to Know — Ecochain', grade: 'C', url: 'https://ecochain.com/blog/life-cycle-assessment-lca-guide/' },
  { row: 106, title: 'Life Cycle Assessment (LCA) — ecoinvent knowledge base, use cases', grade: 'C', url: 'https://support.ecoinvent.org/ecoinvent-use-cases' },
  { row: 107, title: 'On Life Cycle Assessment to Quantify the Environmental Impact of Lighting Products — LED professional', grade: 'C', url: 'https://www.led-professional.com/resources-1/articles/on-life-cycle-assessment-to-quantify-the-environmental-impact-of-lighting-products' },
  { row: 108, title: 'Life Cycle Assessment of a Prospective Technology for Building-Integrated Production of Broccoli Microgreens (Atmosphere 13(8):1317)', grade: 'P', url: 'https://www.mdpi.com/2073-4433/13/8/1317' },
  { row: 109, title: 'Environmental Life Cycle Assessment of GrowOff Modular Vertical Farming (thesis, DiVA)', grade: 'P', url: 'https://diva-portal.org/smash/get/diva2:1750912/FULLTEXT01.pdf' },
  { row: 110, title: 'Life Cycle Assessment of Various Filtering Media for Greywater Treatment Using a Greenwall Filtration System', grade: 'P', url: 'https://www.researchgate.net/publication/348746908_Life_Cycle_Assessment_of_Various_Filtering_Media_for_Greywater_Treatment_Using_Greenwall_Filtration_System' },
  { row: 111, title: 'Life-Cycle Assessment in the Polymeric Sector: A Comprehensive Review', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7361975/' },
  { row: 112, title: 'Eutrophication Potential — AgImpacts (MIT)', grade: 'C', url: 'https://agimpacts.mit.edu/indicators/eutrophication-potential/' },
  { row: 113, title: 'Eutrophication potential — Designing Buildings Wiki', grade: 'C', url: 'https://www.designingbuildings.co.uk/wiki/Eutrophication_potential' },
  { row: 114, title: 'What is ecoinvent? Meet the LCI Database — Ecochain', grade: 'C', url: 'https://ecochain.com/blog/what-is-ecoinvent/' },
  { row: 115, title: 'Life Cycle Assessment (LCA): Conduct Studies with ecoinvent — ecoinvent.org', grade: 'C', url: 'https://ecoinvent.org/life-cycle-assessment/' },
  { row: 116, title: 'AGRIBALYSE documentation (EN): Link with ecoinvent and WFLDB', grade: 'D', url: 'https://doc.agribalyse.fr/documentation-en/agribalyse-program/link-with-ecoinvent-and-wfldb' },
  { row: 117, title: 'AGRIBALYSE documentation (EN): Life Cycle Assessment Method', grade: 'D', url: 'https://doc.agribalyse.fr/documentation-en/data-use/life-cycle-assessment-method' },
  { row: 118, title: 'Agribalyse — openLCA Nexus database page', grade: 'D', url: 'https://nexus.openlca.org/database/Agribalyse' },
  { row: 119, title: 'LCA Commons — Ag Data Commons (USDA, Figshare)', grade: 'D', url: 'https://agdatacommons.nal.usda.gov/articles/dataset/LCA_Commons/24660180' },
  { row: 120, title: 'Federal LCA Commons — Life Cycle Assessment (USDA)', grade: 'D', url: 'https://www.lcacommons.gov/' },
  { row: 121, title: 'Agri-footprint 5.0, Part 2: Description of Data — SimaPro', grade: 'D', url: 'https://simapro.com/wp-content/uploads/2020/10/Agri-Footprint-5.0-Part-2-Description-of-data.pdf' },
  { row: 122, title: 'Environmental Product Declaration — Ventilatieland (steel product, EPD sk22277)', grade: 'D', url: 'https://www.ventilatieland.nl/static/uploads/pictures/original/other/sk22277_Environmental_product_declaration_EN.pdf' },
  { row: 123, title: 'Environmental Product Declaration — XL-BYGG (steel product)', grade: 'D', url: 'https://www.xlbygg.se/media/attachments/806/00d/80600da6bcc48f432c478f9e2767727b.pdf' },
  { row: 124, title: 'Environmental Product Declaration — RSK Databasen (EPD 1061, 8824003)', grade: 'D', url: 'https://www.rskdatabasen.se/infodocs/EPD/EPD_1061_8824003.pdf' },
  { row: 125, title: 'Top 5 Best Growing Mediums for Microgreens — Bootstrap Farmer', grade: 'C', url: 'https://www.bootstrapfarmer.com/blogs/microgreens/microgreens-growing-media' },
  { row: 126, title: 'Torf und Torfersatzprodukte im Vergleich (Eymann et al., ZHAW 2015): peat and peat substitutes compared', grade: 'P', url: 'https://www.zhaw.ch/storage/lsfm/institute-zentren/iunr/oekobilanzierung/eymann-2015-lca-torf.pdf' },
  { row: 127, title: 'Comparative climate change impacts of different strawberry production substrates', grade: 'P', url: 'https://aspace.agrif.bg.ac.rs/bitstream/handle/123456789/7746/bitstream_29123.pdf?sequence=1&isAllowed=y' },
  { row: 128, title: 'Recent advances in organic agriculture: innovations, challenges and prospects', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12827596/' },
  { row: 129, title: 'Best Growing Media for Microgreens: Soil, Coco Coir and Mats — MP Seeds', grade: 'C', url: 'https://mpseeds.eu/ultimate-guide-to-growing-media' },
  { row: 130, title: 'Natural Fiber-Polyolefin Composites, Mini-Review (Cellulose Chemistry and Technology 2014)', grade: 'R', url: 'https://cellulosechemtechnol.ro/pdf/CCT7-8(2014)/p.599-611.pdf' },
  { row: 131, title: 'Bacterial-Retted Hemp Fiber/PLA Composites (Processes 13(4):1000)', grade: 'P', url: 'https://www.mdpi.com/2227-9717/13/4/1000' },
  { row: 132, title: 'Manufacturing and Properties of Jute Fiber-Reinforced Polymer Composites', grade: 'R', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11901065/' },
  { row: 133, title: 'A Comparative Life Cycle Assessment of a Composite Component (Chemical Engineering Transactions 32)', grade: 'P', url: 'https://www.aidic.it/cet/13/32/288.pdf' },
  { row: 134, title: 'Bio-based materials as a robust solution for building renovation (Padey et al., 2022; ETH research collection)', grade: 'P', url: 'https://www.research-collection.ethz.ch/bitstreams/1151ecb3-4e28-4f23-b0b9-5fbc375f44b6/download' },
  { row: 135, title: 'Bio-based materials as a robust solution for building renovation (HES-SO copy of row 134)', grade: 'P', url: 'https://arodes.hes-so.ch/record/10059/files/Padey_2022_bio-based_materials_robust_solution_building_renovation.pdf' },
  { row: 136, title: 'Life Cycle Assessment of a modular LED luminaire and quantified environmental benefits (UPCommons)', grade: 'P', url: 'https://upcommons.upc.edu/bitstreams/7a8f3095-d7c1-4f9f-affb-7484099d6e76/download' },
  { row: 137, title: 'Consumer Preference for Microgreens in the Presence of LED Lighting (HortScience 58(3))', grade: 'P', url: 'https://journals.ashs.org/view/journals/hortsci/58/3/article-p327.xml' },
  { row: 138, title: 'Life-Cycle Assessment of Energy and Environmental Impacts of LED Lighting Products (PNNL-21443)', grade: 'P', url: 'https://www.pnnl.gov/main/publications/external/technical_reports/pnnl-21443.pdf' },
  { row: 139, title: 'Barrina 4 ft Plant Grow Lights 5000K 252 W T8 6-pack — Lowe\'s listing', grade: 'C', url: 'https://www.lowes.com/pd/Barrina-4FT-Plant-Grow-Lights-5000K-Full-Spectrum-Daylight-White-252W-LED-T8-Grow-Light-Strips-6-Pack/8013252' },
  { row: 140, title: 'Barrina LED Grow Lights Instruction Manual, Full Spectrum T8 (manuals.plus)', grade: 'S', url: 'https://manuals.plus/asin/B0B76SJ5XF' },
  { row: 141, title: 'Barrina 4 ft T8 Plant Grow Light Review — letsallgrowcannabis', grade: 'C', url: 'https://www.letsallgrowcannabis.com/picks/grow-lights/barrina-4ft-t8-plant-grow-light-review/' },
  { row: 142, title: 'What Wattage LED Grow Light Do You Need for a 4x4 Grow Tent? — VIVOSUN', grade: 'S', url: 'https://vivosun.com/growing_guide/right-led-wattage-for-4x4-grow-tent/' },
  { row: 143, title: 'How Many Grow Lights Do You Need? — VIVOSUN', grade: 'S', url: 'https://vivosun.com/growing_guide/how-many-grow-lights-do-i-need/' },
  { row: 144, title: 'VIVOSUN 4-pack AeroLight 400 W LED Grow Light Review — VIVOSUN', grade: 'S', url: 'https://vivosun.com/growing_guide/vivosun-aerolight-grow-light-review/' },
  { row: 145, title: 'Grow Light Cost Calculator — Mars Hydro', grade: 'S', url: 'https://www.mars-hydro.com/grow-light-cost-calculator' },
  { row: 146, title: 'Best LED Grow Lights 2026: Efficiency and PPE Compared — Trimleaf', grade: 'C', url: 'https://trimleaf.com/blogs/guides/best-grow-lights' },
  { row: 147, title: 'Most Nutritious Microgreens: All 18 Varieties Ranked — AquaGer Tech', grade: 'C', url: 'https://aquagertech.com/blogs/microgreens/microgreens-nutrition-comparison' },
  { row: 148, title: 'Effects of LED light treatments on the bioactive composition of microgreens (Frontiers in Plant Science)', grade: 'P', url: 'https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2026.1834435/full' },
  { row: 149, title: 'LED Light Recipe, PPFD and Spectrum Requirements for Microgreens — CEA Union', grade: 'C', url: 'https://ceaunion.com/blog/vertical-farming/led-light-recipe-ppfd-and-spectrum-requirements-for-microgreens' },
  { row: 150, title: 'Fish Fertilizer: Is it Worth Buying? — Garden Myths', grade: 'C', url: 'https://www.gardenmyths.com/fish-fertilizer-worth-buying/comment-page-3/' },
  { row: 151, title: 'Life cycle assessment of the LimoFish process (ChemRxiv preprint, 2022)', grade: 'P', url: 'https://chemrxiv.org/doi/pdf/10.26434/chemrxiv-2022-6c3fd' },
  { row: 152, title: 'A Life Cycle and Environmental Cost Analysis of fish-based fertilizer in Denmark (ACS Agricultural Science & Technology)', grade: 'P', url: 'https://pubs.acs.org/doi/10.1021/acsagscitech.5c01013' },
  { row: 153, title: 'Liquid organic fertilizers in soilless cultivation: a systematic review (Frontiers in Sustainability)', grade: 'R', url: 'https://www.frontiersin.org/journals/sustainability/articles/10.3389/frsus.2026.1775182/full' },
  { row: 154, title: 'Nutrients and Eutrophication — U.S. Geological Survey', grade: 'D', url: 'https://www.usgs.gov/mission-areas/water-resources/science/nutrients-and-eutrophication' },
  { row: 155, title: 'Sources and Solutions: Agriculture — U.S. EPA nutrient pollution', grade: 'D', url: 'https://www.epa.gov/nutrientpollution/sources-and-solutions-agriculture' },
  { row: 156, title: 'Eutrophication Potential — Space4Water Portal', grade: 'C', url: 'https://www.space4water.org/water/eutrophication-potential' },
  { row: 157, title: 'Celebrating Our Roots: Legacy of Our Garden Members — National Garden Bureau', grade: 'C', url: 'https://ngb.org/celebrating-members/' },
  { row: 158, title: 'A review on global energy use patterns in major crop production systems (RSC)', grade: 'R', url: 'https://pubs.rsc.org/va/article/1/5/662/794408/A-review-on-global-energy-use-patterns-in-major' },
  { row: 159, title: 'Energy consumption in agriculture increased in 2016, driven mainly by diesel and fertilizer use — USDA ERS', grade: 'D', url: 'https://www.ers.usda.gov/data-products/charts-of-note/87964' },
  { row: 160, title: 'Energy use efficiency in paddy cultivation in Punjab (Ecology Journal 2021)', grade: 'P', url: 'https://www.ecologyjournal.in/assets/archives/2021/vol3issue1/3-1-90-473.pdf' },
  { row: 161, title: 'Estimation of energy flow and environmental impacts of quinoa cultivation', grade: 'P', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7245589/' },
  { row: 162, title: 'A Life Cycle Assessment of Organic and Chemical Fertilizers for Coffee Production (Sustainability 14(7):3912)', grade: 'P', url: 'https://www.mdpi.com/2071-1050/14/7/3912' },
  { row: 163, title: 'Mastering Organic Seed Production for Better Crops — LoginEKO', grade: 'C', url: 'https://www.logineko.com/knowledge/mastering-organic-seed-production-for-better-crops/' },
  { row: 164, title: 'A life cycle analysis (LCA) primer for the agricultural community (OSTI)', grade: 'R', url: 'https://www.osti.gov/servlets/purl/1802622' },
  { row: 165, title: 'Global database of GHG emissions related to feed crops (FAO)', grade: 'D', url: 'https://openknowledge.fao.org/server/api/core/bitstreams/c3b15795-3030-41c4-986e-31a090aa2ab4/content' },
  { row: 166, title: 'openLCA — free, professional life cycle assessment software (openlca.org)', grade: 'C', url: 'https://www.openlca.org/' },
  { row: 167, title: 'Inter-process communication with openLCA: introduction (API documentation)', grade: 'C', url: 'https://greendelta.github.io/openLCA-ApiDoc/' },
  { row: 168, title: 'Features — openLCA.org', grade: 'C', url: 'https://www.openlca.org/features/' },
  { row: 169, title: 'Concept — openLCA.org', grade: 'C', url: 'https://www.openlca.org/concept/' },
  { row: 170, title: 'How to Calculate the PCF of My Vertical Farm in openLCA? — ask.openLCA', grade: 'C', url: 'https://ask.openlca.org/8778/how-to-calculate-the-pcf-of-my-vertical-farm-in-openlca' },
  // ── The program's other sustainability sources: the primary publisher behind a figure document E cites through a secondary page ──
  { row: 171, title: 'Handbook on Life Cycle Assessment, Part 2b: Operational annex, Table 4.3.11.1 generic eutrophication factors (Guinée et al., CML Leiden, 2001)', grade: 'D', url: 'https://www.universiteitleiden.nl/binaries/content/assets/science/cml/publicaties_pdf/new-dutch-lca-guide/part2b.pdf' },
];

export const SCIENCE_SOURCE_BY_ROW: Readonly<Record<number, ScienceSource>> = Object.fromEntries(SCIENCE_SOURCES.map((s) => [s.row, s]));

/**
 * Each document's own works-cited numbering, mapped to register rows, so an inline
 * superscript in either document resolves. Document A is the identity for 1–56.
 */
export type ScienceDocument = 'A' | 'B' | 'C' | 'D' | 'E';

export const DOCUMENT_ROWS: Readonly<Record<ScienceDocument, readonly number[]>> = {
  A: Array.from({ length: 56 }, (_, i) => i + 1),
  B: [1, 61, 5, 6, 25, 62, 8, 63, 2, 64, 3, 11, 9, 50, 4, 10, 13, 65, 66, 67, 51, 52, 53, 21, 22, 55, 68, 69, 70, 71, 72, 73, 74, 75, 14, 20, 23, 24, 26, 27, 30, 28, 29, 38, 19, 41, 42, 43, 44, 45, 36, 33, 31, 32, 34, 16, 17, 18, 49],
  C: [2, 5, 3, 11, 64, 53, 65, 31, 34, 26, 22, 23, 76, 77, 9, 78, 79, 80, 81, 68, 70, 71, 82, 83, 13, 10, 84, 85, 86, 87, 88, 89, 90, 91, 92, 72, 74, 61],
  D: [5, 61, 9, 65, 64, 53, 93, 2, 3, 11, 13, 10, 94, 95, 96, 97, 98, 99, 100, 101, 102, 68, 72, 70, 103, 23, 22, 26, 31, 34, 84, 86, 80, 83, 89, 85, 87, 88, 76, 77, 82, 78, 90, 79, 92],
  E: [104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 74, 125, 62, 126, 127, 128, 129, 130, 131, 94, 98, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170],
};

/** The register row a document's inline number cites. */
export function rowFor(doc: ScienceDocument, n: number): number {
  const row = DOCUMENT_ROWS[doc][n - 1];
  if (row === undefined) throw new Error(`Document ${doc} has no citation ${n}`);
  return row;
}

/** `lca` is a life cycle study, declaration or dataset: a figure about a material or a system, not an outcome in a person. */
export type Evidence = 'human' | 'animal' | 'cell' | 'review' | 'meta-analysis' | 'registry' | 'supplier' | 'lca';

/** A claim as a document states it, the varieties it applies to, and the register rows it cites. */
export interface ScienceClaim {
  id: string;
  topic: 'nutrition' | 'mechanism' | 'cardiovascular' | 'metabolic' | 'neurological' | 'other-clinical' | 'safety' | 'media' | 'light' | 'sustainability';
  text: string;
  varieties: string[];
  evidence: Evidence;
  rows: number[];
}

const B = (n: number) => rowFor('B', n);
const C = (n: number) => rowFor('C', n);
const D = (n: number) => rowFor('D', n);
const E = (n: number) => rowFor('E', n);

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
  { id: 'red-cabbage-ldl', topic: 'cardiovascular', text: 'In mice on a high-fat diet, 1.09% red cabbage microgreens lowered LDL 34% and liver triglycerides 23%, with less liver inflammation.', varieties: ['red-cabbage'], evidence: 'animal', rows: [31] },
  { id: 'ages', topic: 'cardiovascular', text: 'In cell and animal studies, a glucoraphanin-rich broccoli sprout extract reduced AGE formation and inflammatory markers (RAGE, MCP-1, ICAM-1) while raising eNOS.', varieties: ['broccoli'], evidence: 'cell', rows: [35] },
  { id: 'daily-cups-feasibility', topic: 'cardiovascular', text: 'Two cups a day of red cabbage or beet microgreens for two weeks: 95.6% compliance; gastrointestinal inflammation symptoms improved with red cabbage.', varieties: ['red-cabbage'], evidence: 'human', rows: [36] },
  { id: 'blood-pressure-meta', topic: 'cardiovascular', text: 'Meta-analysis of broccoli sprout trials: systolic pressure down 10.9 mmHg, diastolic down 6.95 mmHg.', varieties: ['broccoli'], evidence: 'meta-analysis', rows: [37] },
  { id: 'rutin-vascular', topic: 'cardiovascular', text: 'Rutin in buckwheat supports capillary resilience and blood pressure regulation.', varieties: ['buckwheat'], evidence: 'review', rows: [16, 49] },
  // ── Metabolic ──
  { id: 'insulin-t2dm', topic: 'metabolic', text: '10 g/day broccoli sprout powder for 4 weeks lowered fasting insulin and HOMA-IR in type 2 diabetes.', varieties: ['broccoli'], evidence: 'human', rows: [38] },
  { id: 'lipid-peroxidation', topic: 'metabolic', text: '10 g/day broccoli sprout powder lowered malondialdehyde and oxidized LDL.', varieties: ['broccoli'], evidence: 'human', rows: [29] },
  { id: 'ppp-nadph', topic: 'metabolic', text: 'In cells under high glucose, sulforaphane redirects glucose toward the pentose phosphate pathway and one-carbon metabolism, generating NADPH for glutathione synthesis; entirely Nrf2-dependent.', varieties: ['broccoli'], evidence: 'cell', rows: [21] },
  { id: 'metabolic-animal', topic: 'metabolic', text: 'In animal models, sulforaphane suppresses liver gluconeogenesis and fat formation and promotes browning of white fat and fatty-acid oxidation.', varieties: ['broccoli'], evidence: 'animal', rows: [40, 41, 42] },
  // ── Neurological and other clinical ──
  { id: 'asd-trial', topic: 'neurological', text: '18 weeks of sulforaphane-rich extract improved irritability, lethargy, stereotypy, hyperactivity and social responsiveness in 44 young men with moderate to severe autism; gains reversed within 4 weeks of stopping.', varieties: ['broccoli'], evidence: 'human', rows: [43, 20] },
  { id: 'neuroprotection', topic: 'neurological', text: 'Sulforaphane crosses the blood-brain barrier; neuroprotection in Alzheimer\'s and Parkinson\'s models is preclinical.', varieties: ['broccoli'], evidence: 'animal', rows: [19, 20] },
  { id: 'copd-registry', topic: 'other-clinical', text: 'COPD trial NCT01335971 sought a safe sulforaphane dose that raises Nrf2 activity in airway cells.', varieties: ['broccoli'], evidence: 'registry', rows: [44] },
  { id: 'asthma-null', topic: 'other-clinical', text: 'A 3-day intervention in asthmatic adults raised serum sulforaphane without reducing exhaled nitric oxide.', varieties: ['broccoli'], evidence: 'human', rows: [45, 26] },
  { id: 'sickle-cell-phase1', topic: 'other-clinical', text: 'Phase 1 sickle cell trial: broccoli sprout homogenate was safe and raised HMOX1 mRNA, with a trend in fetal hemoglobin.', varieties: ['broccoli'], evidence: 'human', rows: [28] },
  { id: 'h-pylori', topic: 'other-clinical', text: 'Sulforaphane is bactericidal against H. pylori including antibiotic-resistant strains; two months of daily sprouts reduces colonization but does not eradicate it.', varieties: ['broccoli'], evidence: 'human', rows: [46, 48] },
  { id: 'fenugreek-iron', topic: 'nutrition', text: 'Fenugreek microgreens are rich in iron.', varieties: ['fenugreek'], evidence: 'human', rows: [57] },
  { id: 'lentil-protein-folate', topic: 'nutrition', text: 'Sprouted lentils are a good source of protein and folate.', varieties: ['red-lentil'], evidence: 'human', rows: [58] },
  // ── Document C: the clinical profiles of fenugreek, borage, amaranth and wheat ──
  { id: 'fenugreek-bioactives', topic: 'nutrition', text: 'Fenugreek microgreens carry steroidal saponins (diosgenin), the alkaloid trigonelline and galactomannan fiber; GC-MS profiling finds 1-nonadecene, tetracosane and eicosane, which track their antioxidant capacity.', varieties: ['fenugreek'], evidence: 'human', rows: [C(13)] },
  { id: 'fenugreek-antioxidant', topic: 'nutrition', text: 'Methanolic fenugreek microgreen extracts are high in flavonoids and tannins and scavenge ABTS, DPPH and hydrogen peroxide radicals, reaching 90.6% total antioxidant capacity in vitro.', varieties: ['fenugreek'], evidence: 'cell', rows: [C(13)] },
  { id: 'fenugreek-germination-vitamins', topic: 'nutrition', text: 'Sprouting fenugreek raises alpha-tocopherol (vitamin E) nearly three-fold and beta-carotene by 55%, and raises the ratio of polyunsaturated to saturated fatty acids.', varieties: ['fenugreek'], evidence: 'human', rows: [C(23)] },
  { id: 'fenugreek-enzyme-inhibition', topic: 'metabolic', text: 'Fenugreek extracts inhibit alpha-glucosidase by up to 99% and alpha-amylase by 95% in vitro, the enzymes that break carbohydrates into glucose.', varieties: ['fenugreek'], evidence: 'cell', rows: [C(23)] },
  { id: 'fenugreek-galactomannan-glucose', topic: 'metabolic', text: 'Galactomannan fiber thickens gut contents, delaying carbohydrate digestion and blunting the rise in blood glucose after eating.', varieties: ['fenugreek'], evidence: 'review', rows: [C(14)] },
  { id: 'fenugreek-antibacterial', topic: 'other-clinical', text: 'Fenugreek microgreen extracts inhibit Staphylococcus aureus, Pseudomonas aeruginosa and Aeromonas hydrophila, and their biofilms by more than 70%, in vitro.', varieties: ['fenugreek'], evidence: 'cell', rows: [C(13)] },
  { id: 'fenugreek-bile-acids', topic: 'cardiovascular', text: 'The mucilaginous fiber in fenugreek binds bile acids in the gut and raises their excretion, so the liver draws on circulating cholesterol to make new ones.', varieties: ['fenugreek'], evidence: 'review', rows: [C(14)] },
  { id: 'borage-gla-rosmarinic', topic: 'nutrition', text: 'Borage is one of the rare plant sources of gamma-linolenic acid (GLA); its leaves carry rosmarinic acid and other phenolic acids.', varieties: ['borage'], evidence: 'human', rows: [C(18), C(19)] },
  { id: 'borage-pyrrolizidine', topic: 'safety', text: 'Mature borage makes pyrrolizidine alkaloids, which are toxic to the liver; early-harvested microgreens accumulate little, and seed lines are monitored and bred for alkaloid-free profiles.', varieties: ['borage'], evidence: 'review', rows: [C(27)] },
  { id: 'borage-fat-oxidation', topic: 'metabolic', text: 'In C. elegans and in diet-induced obese rats, borage seed oil reduced fat accumulation by raising peroxisomal beta-oxidation; the rats gained less weight and white fat, with Cebpa lowered and no change in what they ate.', varieties: ['borage'], evidence: 'animal', rows: [C(28)] },
  { id: 'borage-dna-protection', topic: 'other-clinical', text: 'In Drosophila, borage seed oil and GLA protected DNA against hydrogen peroxide damage.', varieties: ['borage'], evidence: 'animal', rows: [C(29), C(30)] },
  { id: 'borage-health-span', topic: 'other-clinical', text: 'In Drosophila, whole borage extended health span where isolated GLA slightly shortened lifespan; the whole-plant extract was cytotoxic to HL60 leukemia cells.', varieties: ['borage'], evidence: 'animal', rows: [C(30)] },
  { id: 'gla-eicosanoids', topic: 'mechanism', text: 'GLA is lengthened to DGLA, which competes with arachidonic acid for the COX and LOX enzymes and shifts production toward the anti-inflammatory series-1 prostaglandins (PGE1).', varieties: ['borage'], evidence: 'review', rows: [C(27)] },
  { id: 'amaranth-betalains', topic: 'nutrition', text: 'The red of red garnet amaranth is betalains, chiefly the betacyanin amaranthin, free-radical scavengers whose synthesis rises under light, drought and temperature stress.', varieties: ['amaranth'], evidence: 'human', rows: [C(16), C(17)] },
  { id: 'amaranth-squalene', topic: 'nutrition', text: 'Amaranth carries squalene, the precursor of plant and animal sterols.', varieties: ['amaranth'], evidence: 'review', rows: [C(35)] },
  { id: 'amaranth-protein', topic: 'nutrition', text: 'Amaranth protein is high in lysine and methionine, the amino acids cereals and legumes lack.', varieties: ['amaranth'], evidence: 'review', rows: [C(33)] },
  { id: 'amaranth-ldl-oxidation', topic: 'cardiovascular', text: 'Squalene and amaranthin protect lipids from peroxidation, including the oxidative modification of LDL.', varieties: ['amaranth'], evidence: 'review', rows: [C(33)] },
  { id: 'wheat-vitamin-e', topic: 'nutrition', text: 'Germinating wheat raises its vitamin E, the tocopherols and tocotrienols, 5.3-fold over the dormant seed.', varieties: ['wheat'], evidence: 'human', rows: [C(23)] },
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
  // ── Media (document D): the hemp mat, from its makers' published specifications and one primary study ──
  { id: 'hemp-mat-specification', topic: 'media', text: 'Needle-punched hemp fiber mats use no binders or chemical treatment; they come pH-neutral and salt-free, need no buffering or rinsing, and are sold pre-cut for 1020 and 1010 trays.', varieties: ['all'], evidence: 'supplier', rows: [D(13), D(16)] },
  { id: 'hemp-mat-retention', topic: 'media', text: 'Hemp holds up to 1,050% of its weight in water; mat density sets retention: 400 g/m² (0.3 cm) low, 600 g/m² (0.5 cm) medium, 1,300 g/m² (1.0 cm) high.', varieties: ['all'], evidence: 'supplier', rows: [D(13), D(16)] },
  { id: 'hemp-mat-stratification', topic: 'media', text: 'Bottom-watered, a hemp mat holds its water inside the fiber and keeps a drier surface than coir, which its maker ties to less damping-off and surface mold.', varieties: ['all'], evidence: 'supplier', rows: [D(13)] },
  { id: 'fiber-mat-minerals', topic: 'media', text: 'Grown on hemp mats, basil and dill microgreens carried more potassium; jute mats gave the highest iron and manganese in some species.', varieties: ['basil', 'dill'], evidence: 'human', rows: [D(25)] },
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
  // ── Sustainability (document E): life cycle figures, each the cited study's own system, never the facility's ──
  { id: 'cited-microgreens-footprint', topic: 'sustainability', text: 'In a building-integrated broccoli microgreen system in Lisbon (LED tubes 14 hours a day, coconut-fibre substrate, the 2018 Portuguese grid), the cradle-to-gate footprint was 18.6 kg CO2e per kg delivered on campus and 22.2 off campus: electricity 54% on campus, of which LED lighting 4.39 and climate control 5.60 kg per kg; seed 4.04 kg per kg (22%); the substrate 2.06 kg per kg; the infrastructure 2.07 kg per kg, up to 11.3%.', varieties: ['broccoli'], evidence: 'lca', rows: [E(5)] },
  { id: 'seed-share-microgreens', topic: 'sustainability', text: 'Sown at about 0.07 kg of seed per kg of fresh weight harvested, the seed\'s field production was the second-largest line of the cited microgreen system, close to the electricity for its lights.', varieties: ['all'], evidence: 'lca', rows: [E(5), E(24)] },
  { id: 'peat-substitutes-gwp', topic: 'sustainability', text: 'Per cubic metre of substrate component used once, with decomposition in use counted: peat 254 kg CO2e, green-waste compost 177, coir fibre 85, coir pith 41, bark compost 33, rice husks 29, wood fibre 10; 64% of peat\'s figure is its organic matter decomposing to CO2 in use.', varieties: ['all'], evidence: 'lca', rows: [E(25)] },
  { id: 'coir-not-a-peat-substitute', topic: 'sustainability', text: 'Coir fibre carries less climate impact than peat but higher pollutant emissions to water, and the Swiss comparison does not rate it a suitable peat alternative on ecological criteria; coir pith scores better than coir fibre on every indicator.', varieties: ['all'], evidence: 'lca', rows: [E(25)] },
  { id: 'steel-product-epds', topic: 'sustainability', text: 'Three EPD Hub declarations for fabricated coated-steel products put the cradle-to-gate (A1 to A3) global warming potential at 2.78 kg CO2e per kg for galvanized spiral duct and 3.15 to 3.62 for powder-coated storage hardware and cabinets; two declare a 50-year reference service life and one declares none. None is stainless steel and none is a steel-stock factor.', varieties: ['all'], evidence: 'lca', rows: [E(19), E(20), E(21)] },
  { id: 'led-use-phase-dominates', topic: 'sustainability', text: 'Over a 25,000-hour life, 93.5% of an LED lamp\'s global warming potential was the electricity it used; raw materials and manufacturing were 16.2 of 251 kg CO2e per 20 million lumen-hours for a 2012 lamp. For a 47 W linear LED luminaire over 70,000 hours, production was about 1% of the total.', varieties: ['all'], evidence: 'lca', rows: [E(39), E(37)] },
  { id: 'eutrophication-equivalents', topic: 'sustainability', text: 'On the CML generic eutrophication factors, 1 kg of ammonia counts 0.35 kg phosphate-equivalent, nitrate 0.10, chemical oxygen demand 0.022, phosphate 1.0 and phosphorus 3.06.', varieties: ['all'], evidence: 'lca', rows: [171] },
  { id: 'cea-decouples', topic: 'light', text: 'Controlled environment agriculture decouples yield from nutritional quality: deliberate abiotic stress through blue-rich light, far-red, UV, continuous photoperiods and resistive media raises secondary metabolites before harvest.', varieties: ['all'], evidence: 'review', rows: [B(6), B(10)] },
];

export const SCIENCE_CLAIM_BY_ID: Readonly<Record<string, ScienceClaim>> = Object.fromEntries(SCIENCE_CLAIMS.map((c) => [c.id, c]));

/** Claims that apply to a variety key, including the ones that apply to all. */
export function claimsForVariety(key: string): ScienceClaim[] {
  return SCIENCE_CLAIMS.filter((c) => c.varieties.includes(key) || c.varieties.includes('all'));
}

const GRADE_KIND: Record<SourceGrade, ReferenceSource['kind']> = { P: 'study', R: 'study', T: 'study', S: 'supplier_report', D: 'dataset', C: 'other' };
const GRADE_LABEL: Record<SourceGrade, string> = { P: 'primary study', R: 'review', T: 'trial registry', S: 'supplier statement', D: 'dataset, declaration or agency publication', C: 'commercial page, context only' };

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
