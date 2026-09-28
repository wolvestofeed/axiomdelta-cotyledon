# Science Library — the source register

Every benefit Cotyledon states about a variety traces to a row here. This file is the register the Sources module is seeded from in Phase 2; the glossary ([`glossary.md`](glossary.md)) cites rows by number. Nothing is stated to a subscriber without a citation, and a citation that is a company page or a blog is marked as such and never carries a clinical claim.

Four source documents, all Rob's compilations, Sept 2026:

- **A** — *The Clinical and Scientific Efficacy of Microgreens and Sprouts* (`docs/Microgreens Nutritional Research Data.docx`): what the compounds do in the body. Rows 1–56 are its works cited in its own order, so its inline superscripts map one for one.
- **B** — *Optimal Agronomic Practices for Microgreens: Growth Media and Lighting Optimization* (`docs/Optimal Agronomic Practices for Microgreens_ Growth Media and Lighting Optimization.docx`; the file ending in 2 is the same text): how growing conditions change what is in the crop. It shares 44 works with A; its 15 new works are rows 61–75, and §1b maps its own numbering onto the register.
- **C** — *Clinical Research and Blend Optimization for Specific Microgreen Varieties* (`docs/Clinical Research and Blend Optimization for Specific Microgreen Varieties.docx`): five blends of the twelve varieties, and the clinical and phytochemical profiles of fenugreek, borage, amaranth, chia and wheat. Its 17 new works are rows 76–92; §1c maps its numbering.
- **D** — *Comparative Analysis of Hemp Mats and Coco Coir: Sustainability, Hydroponics, and Agronomic Outcomes* (`docs/Comparative Analysis of Hemp Mats and Coco Coir_ Sustainability, Hydroponics, and Agronomic Outcomes.docx`): the hemp mat against coir in an Austin grow room. Its 11 new works are rows 93–103; §1d maps its numbering. Most of its agronomic statements cite commercial pages (grade C), which carry no claim; the hemp mat's specifications are its makers' published statements (grade S) and one study is primary (row 103).

The register in code is `src/data/science-library.ts`; `rowFor('B', n)` resolves a document B superscript.

## 1. Works cited

Grade: **P** primary study or trial, **R** review or meta-analysis, **T** trial registry, **S** a supplier's published statement about its own seed or product: a seed supplier's variety summary or packaging (nutrient and flavor statements), a medium maker's product specification (no clinical claim either way), **C** commercial or advocacy page (context only, no clinical claim).

| # | Work | Grade | URL |
|---|---|---|---|
| 1 | Microgreens: nutritional properties, health benefits, production (PubMed) | R | https://pubmed.ncbi.nlm.nih.gov/41321944/ |
| 2 | Microgreens—A Comprehensive Review of Bioactive Molecules | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC9864543/ |
| 3 | Sprouts and Microgreens—Novel Food Sources for Healthy Diets (Ebert, 2022) | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC8877763/ |
| 4 | Sprouts vs. Microgreens as Novel Functional Foods | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC7587365/ |
| 5 | Microgreens on the rise: Expanding our horizons from farm to fork | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC10881865/ |
| 6 | Sources & Research — Honor Harvest Farms | C | https://honorharvestfarms.net/sources/ |
| 7 | Systematic review on the role of microgreens in the diet to combat micronutrient deficiencies and hidden hunger | C | https://drannettevanonselen.co.za/systematic-review-on-the-role-of-microgreens-in-the-diet-to-combat-micronutrient-deficiencies-and-hidden-hunger/ |
| 8 | Prospects of microgreens as budding living functional food | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC9905132/ |
| 9 | Bioactive Composition and Nutritional Profile of Microgreens Cultivated in Thailand (MDPI) | P | https://www.mdpi.com/2076-3417/11/17/7981 |
| 10 | Enhanced nutritional value of mung bean microgreens compared to sprouts | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC12919383/ |
| 11 | Microgreens: nutritional properties, health benefits, production (PMC) | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC12662059/ |
| 12 | Bioactive Composition and Nutritional Profile of Microgreens (ResearchGate copy of 9) | P | https://www.researchgate.net/publication/354200345_Bioactive_Composition_and_Nutritional_Profile_of_Microgreens_Cultivated_in_Thailand |
| 13 | Enhanced nutritional value of mung bean microgreens compared to sprouts (PubMed copy of 10) | P | https://pubmed.ncbi.nlm.nih.gov/41726547/ |
| 14 | Nutritional quality profiles of six microgreens | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC11842852/ |
| 15 | A Comprehensive Antioxidant and Nutritional Profiling of Brassica microgreens | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC11852083/ |
| 16 | Analysis of Phenolic Compounds in Buckwheat (Fagopyrum) | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC9695562/ |
| 17 | Edible Plant Sprouts: Health Benefits, Trends, and Opportunities | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC8398379/ |
| 18 | Physiology and Metabolism Alterations in Flavonoid Accumulation | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC11644169/ |
| 19 | Sulforaphane—A Compound with Potential Health Benefits | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC10886109/ |
| 20 | A review of the neuroprotective mechanisms of sulforaphane | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC12271217/ |
| 21 | Sulforaphane rewires central metabolism to support antioxidant response (Axelsson et al., 2023) | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC10502441/ |
| 22 | Broccoli or Sulforaphane: Is It the Source or Dose That Matters? | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC6804255/ |
| 23 | Broccoli sprouts: an exceptionally rich source of inducers of enzymes (Johns Hopkins record of 25) | P | https://pure.johnshopkins.edu/en/publications/broccoli-sprouts-an-exceptionally-rich-source-of-inducers-of-enzy-3 |
| 24 | Broccoli sprouts: an exceptionally rich source of inducers (PMC copy of 25) | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC23369/ |
| 25 | Broccoli sprouts as inducers of carcinogen-detoxifying enzyme systems (Fahey et al., PNAS 1997) | P | https://www.pnas.org/doi/pdf/10.1073/pnas.94.21.11149 |
| 26 | Sulforaphane as a potential therapeutic agent | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC12451241/ |
| 27 | Sulforaphane Bioavailability from Glucoraphanin-Rich Broccoli (PLOS ONE) | P | https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0140963 |
| 28 | Phase 1 Study of a Sulforaphane-Containing Broccoli Sprout Homogenate in Sickle Cell Disease | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC4829228/ |
| 29 | Sulforaphane: Its "Coming of Age" as a Clinically Relevant Nutraceutical | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC6815645/ |
| 30 | Therapeutic potential of sulforaphane in liver diseases: a review | R | https://www.frontiersin.org/journals/pharmacology/articles/10.3389/fphar.2023.1256029/full |
| 31 | Red Cabbage Microgreens Lower Circulating LDL (Huang et al., USDA 2016) | P | https://pubmed.ncbi.nlm.nih.gov/27933986/ |
| 32 | What foods should be avoided to manage high cholesterol levels? | C | https://discovery.researcher.life/questions/what-foods-should-be-avoided-to-manage-high-cholesterol-levels/737041a7671d847f7d15de9b08e0d5cda187e35b |
| 33 | The Science — Enriched Being | C | https://enrichedbeing.com/pages/the-science |
| 34 | The protective effect of red cabbage on water-soluble fractions | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC9972813/ |
| 35 | Aqueous Extract of Glucoraphanin-Rich Broccoli Sprouts Inhibits AGE formation | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC6106845/ |
| 36 | Feasibility and Tolerability of Daily Microgreen Consumption (MDPI Nutrients 2025) | P | https://www.mdpi.com/2072-6643/17/3/467 |
| 37 | Beneficial Effects of Sulforaphane-Yielding Broccoli Sprout on Cardiometabolic Health: Systematic Review and Meta-analysis | R | https://www.researchgate.net/publication/364457446_Beneficial_Effects_of_Sulforaphane-Yielding_Broccoli_Sprout_on_Cardiometabolic_Health_A_Systematic_Review_and_Meta-analysis |
| 38 | Effect of broccoli sprouts on insulin resistance in type 2 diabetic patients (Bahadoran et al., 2012) | P | https://pubmed.ncbi.nlm.nih.gov/22537070/ |
| 39 | Sulforaphane and Broccoli-Derived Preparations in Obesity (MDPI) | R | https://www.mdpi.com/1424-8247/19/8/1244 |
| 40 | Sulforaphane reduces obesity by reversing leptin resistance | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC8947770/ |
| 41 | Sulforaphane Against the Metabolic Consequences of a High-Fat Diet | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC12943407/ |
| 42 | Potential of isothiocyanate sulforaphane to combat obesity and type 2 diabetes: Nrf2 pathway | R | https://ukrbiochemjournal.org/2024/12/potential-of-isothiocyanate-sulforaphane-from-broccoli-to-combat-obesity-and-type-2-diabetes-involvement-of-nrf2-regulatory-pathway.html |
| 43 | Sulforaphane from Broccoli Reduces Symptoms of Autism (Singh et al., Johns Hopkins 2014) | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC5672987/ |
| 44 | NCT01335971 — Broccoli Sprout Extracts Trial in COPD | T | https://clinicaltrials.gov/study/NCT01335971 |
| 45 | A Randomized Controlled Trial of the Effect of Broccoli Sprouts in asthma | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC5010455/ |
| 46 | Sulforaphane inhibits extracellular, intracellular, and antibiotic-resistant H. pylori (PNAS) | P | https://www.pnas.org/doi/pdf/10.1073/pnas.112203099 |
| 47 | Anticancer properties of sulforaphane: current insights | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC10313060/ |
| 48 | The Effects of Broccoli Sprout Extract Containing Sulforaphane (H. pylori trial) | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC4477992/ |
| 49 | A Narrative Review on Pseudocereals and Cardiometabolic Health | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC13075176/ |
| 50 | The Raw Truth About Raw Foods — Food Safety Magazine | C | https://www.food-safety.com/articles/10269-the-raw-truth-about-raw-foods |
| 51 | An Outbreak Investigation of Salmonella Typhimurium Illnesses linked to sprouts | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC10493856/ |
| 52 | Food Safety in Hydroponic Food Crop Production: A Review | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC12248475/ |
| 53 | Post-Harvest UV-C Treatment of Microgreens for Pathogen Inactivation (MDPI) | P | https://www.mdpi.com/2304-8158/15/6/974 |
| 54 | Microbial Quality of Leafy Greens Grown Under Soilless Production | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC12472353/ |
| 55 | Harnessing beneficial microbes to boost sprout and microgreen production | R | https://pubmed.ncbi.nlm.nih.gov/40552945/ |
| 56 | Microgreens and the Future of Food: The Food as Medicine Movement | C | https://microgreensworld.com/microgreens-and-the-future-of-food/ |
| 57 | Iron concentration in fenugreek microgreens (Journal of Food Science & Nutrition) | P | https://doi.org/10.1002/fsn3.1209 |
| 58 | Protein and folate content in sprouted lentils (Food Chemistry) | P | https://doi.org/10.1016/j.foodchem.2018.06.123 |
| 59 | True Leaf Market — variety pages and seed packaging | S | https://www.trueleafmarket.com/ |
| 60 | Tray Specific Microgreen Seeding Guide (On The Grow, 2023) | S | https://onthegrow.net/ |
| 61 | Microgreens: Functional Food for Nutrition and Dietary Diversification | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC11859409/ |
| 62 | Improving food security through indoor vertical farming of microgreens | R | https://www.frontiersin.org/journals/sustainable-food-systems/articles/10.3389/fsufs.2026.1809881/full |
| 63 | The Nutritional Quality Potential of Microgreens, Baby Leaves, and Adult Plants | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC8834567/ |
| 64 | Microgreens Production: Exploiting Environmental and Cultural Factors | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC11435253/ |
| 65 | Emergence of microgreens as a valuable food, current status and future prospects | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC11225695/ |
| 66 | Assessment of bioactive compounds, antioxidant properties and morphology of Brassica microgreens in soilless media | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC11464729/ |
| 67 | Trial Protocol for Evaluating Platforms for Growing Microgreens in Controlled Environments | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC9103178/ |
| 68 | Red:Blue LED Ratio Modulates Growth and Nutritional Quality of Microgreens | P | https://www.mdpi.com/2311-7524/12/10/1210 |
| 69 | Effects of Green Light Deprivation and Red-to-Blue Ratio on Growth and Mineral Accumulation | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC13075160/ |
| 70 | Effects of LED light treatments on the bioactive composition of microgreens | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC13253669/ |
| 71 | Light manipulation as a route to enhancement of antioxidant properties in microgreens | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC11186462/ |
| 72 | Optimization of light spectrum and intensity to enhance growth and phytochemicals in microgreens | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC12967691/ |
| 73 | Effect of Low Light Intensity With Supplemental Far-Red Light on Broccoli Microgreens | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC12208883/ |
| 74 | Effects of LED lighting on the nutritional properties and microbial quality of microgreens | P | https://www.frontiersin.org/journals/nutrition/articles/10.3389/fnut.2026.1869208/full |
| 75 | Continuous LED Lighting Enhances Yield and Nutritional Value of Brassica Microgreens | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC8781578/ |
| 76 | Metabolomics and bioactive attributes of fenugreek microgreens: antioxidant, antibacterial and antibiofilm potential | P | https://www.researchgate.net/publication/381002330_Metabolomics_and_bioactive_attributes_of_fenugreek_microgreens_Insights_into_antioxidant_antibacterial_and_antibiofilm_potential |
| 77 | Bioactive Potential and Health Benefits of Trigonella foenum-graecum | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC12411738/ |
| 78 | Antioxidant and Antimicrobial Effects of Baby Leaves of Amaranthus tricolor in Correlation with Their Phytochemical Composition | P | https://www.researchgate.net/publication/368079287_Antioxidant_and_Antimicrobial_Effects_of_Baby_Leaves_of_Amaranthus_tricolor_L_Harvested_as_Vegetable_in_Correlation_with_Their_Phytochemical_Composition |
| 79 | Recent Advances in the Therapeutic Potential of Bioactive Compounds | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC12157067/ |
| 80 | Extraction of Antioxidants from Borage (Borago officinalis L.) Leaves | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC4665488/ |
| 81 | Phenolic Profile and Comparison of the Antioxidant, Anti-Ageing Activities | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC9865334/ |
| 82 | Pressurized Liquid Extraction of Bioactive Compounds from Seeds | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC12191721/ |
| 83 | Boost Your Health with Borage Microgreens: A Nutritional Guide | C | https://microgreensworld.com/borage-microgreens-nutrition/ |
| 84 | Borage (PubMed) | R | https://pubmed.ncbi.nlm.nih.gov/30000849/ |
| 85 | Borago officinalis seed oil (BSO), a natural source of omega-6 fatty acids | P | https://pubmed.ncbi.nlm.nih.gov/30043014/ |
| 86 | Protective Effect of Borage Seed Oil and Gamma Linolenic Acid on DNA | P | https://pmc.ncbi.nlm.nih.gov/articles/PMC3584109/ |
| 87 | Protective effect of borage seed oil and gamma linolenic acid on DNA (PubMed copy of row 86) | P | https://pubmed.ncbi.nlm.nih.gov/23460824/ |
| 88 | Cancer Prevention and Health Benefices of Traditionally Consumed Borago officinalis | P | https://pubmed.ncbi.nlm.nih.gov/26797631/ |
| 89 | The protective effects of omega-6 fatty acids (PubMed) | P | https://pubmed.ncbi.nlm.nih.gov/11122253/ |
| 90 | Multifunctional Edible Amaranths: A Review of Nutritional Benefits | R | https://pmc.ncbi.nlm.nih.gov/articles/PMC12785712/ |
| 91 | Botany, ethnomedicine, phytochemistry and pharmacology of Amaranthus spp.: a review | R | https://www.researchgate.net/publication/389401145_Botany_ethnomedicine_phytochemistry_and_pharmacology_of_Amaranthus_spp-_a_review |
| 92 | The amaranth seeds as a source of nutrients and bioactive substances in human diet | R | https://www.researchgate.net/publication/348138296_THE_AMARANTH_SEEDS_AS_A_SOURCE_OF_NUTRIENTS_AND_BIOACTIVE_SUBSTANCES_IN_HUMAN_DIET |
| 93 | (Comparison) Best Growing Mediums for Microgreens — HerbSpeak | C | https://herbspeak.com/microgreens-growing-mediums/ |
| 94 | Coco Coir vs Hemp Grow Mats: An Honest Comparison — TerraFibre | S | https://terrafibre.ca/pages/coco-coir-vs-hemp-grow-mats/ |
| 95 | Multipurpose Biodegradable Fiber Mats and Mulch Sheets in Agriculture — PlantArc | C | https://plantarc.com/multipurpose-biodegradable-fiber-mats-and-mulch-sheets-in-agriculture-applications-in-microgreen-production-and-weed-suppression/ |
| 96 | Microgreen Growing Mediums: What We Found to be the Best — Home Microgreens | C | https://homemicrogreens.com/microgreen-growing-mediums-2/ |
| 97 | Microgreen Mats — FAQ and Guidance (microgreen-mats.com) | S | https://microgreen-mats.com/microgreen-mats-faq-guidance/ |
| 98 | Best Growing Mats for Microgreens: A Handy Comparison — RusticWise | C | https://rusticwise.com/best-growing-mats-for-microgreens/ |
| 99 | Biodegradable Grow Mats for Microgreens: A Complete Guide — Microgreens World | C | https://microgreensworld.com/biodegradable-grow-mats-for-microgreens/ |
| 100 | Coco Coir vs. Reusable Grow Medium: 35% Yield Test — On The Grow | C | https://onthegrow.net/blogs/microgreens/case-study-coco-coir-vs-reusable-microgreen-grow-medium-high-seeding-density/ |
| 101 | Hemp fiber mats, coco coir and nutrients (YouTube) | C | https://www.youtube.com/watch?v=FXBUp7J-mYo |
| 102 | Hemp Grow Pads Vs Coco Coir Mats for Clean Indoor Microgreens — Indoor Leaf Grow | C | https://indoorleafgrow.com/hemp-grow-pads-vs-coco-coir-mats-for-clean-indoor-microgreens/ |
| 103 | Hydroponic Fiber Mats Altered Shoot Growth and Mineral Nutrient Concentration of Microgreens | P | https://www.mdpi.com/2311-7524/10/12/1298/ |

### 1b. Document B's numbering

Document B's inline superscript *n* cites the register row in position *n* of this list: 1, 61, 5, 6, 25, 62, 8, 63, 2, 64, 3, 11, 9, 50, 4, 10, 13, 65, 66, 67, 51, 52, 53, 21, 22, 55, 68, 69, 70, 71, 72, 73, 74, 75, 14, 20, 23, 24, 26, 27, 30, 28, 29, 38, 19, 41, 42, 43, 44, 45, 36, 33, 31, 32, 34, 16, 17, 18, 49.

### 1c. Document C's numbering

Document C's inline superscript *n* cites the register row in position *n* of this list: 2, 5, 3, 11, 64, 53, 65, 31, 34, 26, 22, 23, 76, 77, 9, 78, 79, 80, 81, 68, 70, 71, 82, 83, 13, 10, 84, 85, 86, 87, 88, 89, 90, 91, 92, 72, 74, 61.

### 1d. Document D's numbering

Document D's inline superscript *n* cites the register row in position *n* of this list: 5, 61, 9, 65, 64, 53, 93, 2, 3, 11, 13, 10, 94, 95, 96, 97, 98, 99, 100, 101, 102, 68, 72, 70, 103, 23, 22, 26, 31, 34, 84, 86, 80, 83, 89, 85, 87, 88, 76, 77, 82, 78, 90, 79, 92.

## 2. Headline studies

The seven studies the report leads with. These are the ones a subscriber-facing benefit statement cites first.

| Study | Year | Finding as stated | Row |
|---|---|---|---|
| Fahey et al., PNAS | 1997 | Broccoli sprouts hold 10 to 100 times the glucoraphanin of mature broccoli; potent inducer of Phase II detoxifying enzymes. | 25 |
| Huang et al., USDA | 2016 | A high-fat mouse diet with 1.09% red cabbage microgreens cut circulating LDL by 34% and liver triglycerides by 23%. Animal model. | 31 |
| Bahadoran et al. | 2012 | 10 g/day broccoli sprout powder for 4 weeks lowered fasting insulin and HOMA-IR in 81 adults with type 2 diabetes. Randomized, placebo-controlled. | 38 |
| Singh et al., Johns Hopkins | 2014 | 18 weeks of sulforaphane from broccoli sprout extract improved ABC and SRS behavior scores in 44 young men with autism; scores regressed after stopping. Randomized, placebo-controlled. | 43 |
| Axelsson et al. | 2023 | Sulforaphane redirects glucose toward NADPH-producing pathways under high glucose, entirely through Nrf2 (CRISPR knockdown). Cell model. | 21 |
| Ebert | 2022 | Review of sprout and microgreen nutrient density, short cycles and functional use. | 3 |
| Kyriacou et al. | 2019 to 2021 | Macro- and micronutrient, phenolic and antioxidant profiles across microgreen families. | 2, 4 |

## 3. Claims register

Each claim as the report states it, the varieties it applies to, the kind of evidence, and the rows it cites. "FW" is fresh weight. A claim marked *animal* or *cell* is never stated to a subscriber as a human outcome.

### Nutrient density and composition

| Claim | Varieties | Evidence | Rows |
|---|---|---|---|
| Microgreens exceed mature counterparts in nutrient density by 4 to 40 times depending on species and biomarker. | all | review | 4 |
| Germination degrades antinutrients (phytic acid, tannins, trypsin inhibitors), raising the bioavailability of calcium, iron and zinc. | all sprouts and micros | review | 3 |
| Microgreens carry roughly double the dietary fiber of sprouts of the same species. | mung bean, legumes | primary | 10 |
| Lentil microgreens deliver up to 6.47 g protein per 100 g FW; mung bean 7.16 g carbohydrate per 100 g FW. | lentil, mung bean | primary | 9 |
| Lipid fraction is low (0.15 to 0.66 g/100 g) and rich in alpha-linolenic acid (up to 35%), linoleic (11%) and oleic (5%). | all | review | 2 |
| Potassium 187 to 416 mg, magnesium 46 to 87 mg, calcium 67 to 149 mg per 100 g FW across six microgreens. | six-species panel | primary | 14 |
| Iron 524 to 2,610 µg, manganese 176 to 351 µg, zinc 32 to 130 µg, copper 459 to 956 µg per 100 g FW. | six-species panel | primary | 14 |
| Sunflower accumulates the most calcium; broccoli the most iron and manganese; pea the most phosphorus and copper. | sunflower, broccoli, pea | primary | 14 |
| Vitamin C: bean 80.45, pea 70.76, sunflower 67.55, broccoli 49.02, black radish 33.37, red beet 32.72 mg/100 g FW. | as named | primary | 14 |
| Mung bean microgreens hold more vitamin C (110.96 mg/100 g) than mung bean sprouts (88.89). | mung bean | primary | 10 |
| Pre-harvest stress can raise vitamin C by up to 187%. | all | review | 2 |
| Lentil microgreens reach 112.62 mg/100 g total chlorophyll. | lentil | primary | 9 |
| Kale and Sango radish accumulate lutein (996 mg/100 g) and beta-carotene (574 mg/100 g). | kale, Sango radish | primary | 15 |
| Broccoli microgreens reach 825.53 mg GAE/100 g total phenolics; bean 758 mg RE/100 g flavonoids; buckwheat 268.99 mg GAE/100 g with the highest DPPH scavenging. | broccoli, bean, buckwheat | primary | 9, 14 |
| Anthocyanins: purple radish 0.148 and red cabbage 0.246 mg CGE/100 g. | purple radish, red cabbage | primary | 9 |
| Organic acids: citric highest in red beet, succinic in beans, fumaric in sunflower. | red beet, bean, sunflower | primary | 14 |

### Mechanism: glucoraphanin, sulforaphane, Nrf2

| Claim | Varieties | Evidence | Rows |
|---|---|---|---|
| Broccoli sprouts are the richest source of glucoraphanin; concentration peaks at 3 days, 10 to 100 times mature broccoli. | broccoli | primary | 23, 25 |
| Myrosinase, released when tissue is chewed or cut, converts glucoraphanin to sulforaphane. | broccoli, brassicas | review | 22 |
| Sulforaphane is among the most potent natural inducers of Phase II detoxification enzymes. | broccoli | review | 22 |
| Sulforaphane frees Nrf2 from Keap1; Nrf2 then switches on 200-plus cytoprotective genes including HMOX1, NQO1 and glutathione synthesis. | broccoli | review | 19, 21 |
| Eating fresh whole sprouts gives up to 7-fold higher plasma and 5-fold higher urinary sulforaphane than myrosinase-inert extracts or cooked broccoli. | broccoli | primary, human | 27 |

### Cardiovascular and lipids

| Claim | Varieties | Evidence | Rows |
|---|---|---|---|
| In mice on a high-fat diet, 1.09% red cabbage microgreens lowered LDL 34% and liver triglycerides 23%, with less liver inflammation. | red cabbage | *animal* | 31 |
| In cell and animal studies, a glucoraphanin-rich broccoli sprout extract reduced AGE formation and inflammatory markers (RAGE, MCP-1, ICAM-1) while raising eNOS. | broccoli | *cell/animal* | 35 |
| Two cups a day of red cabbage or beet microgreens for two weeks: 95.6% compliance; gastrointestinal inflammation symptoms improved with red cabbage. | red cabbage, bull's blood beet | primary, human | 36 |
| Meta-analysis of broccoli sprout trials: systolic pressure down 10.9 mmHg, diastolic down 6.95 mmHg. | broccoli | meta-analysis | 37 |
| Rutin in buckwheat supports capillary resilience and blood pressure regulation. | buckwheat | review | 16, 49 |

### Glucose and metabolism

| Claim | Varieties | Evidence | Rows |
|---|---|---|---|
| 10 g/day broccoli sprout powder for 4 weeks lowered fasting insulin and HOMA-IR in type 2 diabetes. | broccoli | primary, human | 38 |
| 10 g/day broccoli sprout powder lowered malondialdehyde and oxidized LDL. | broccoli | primary, human | 29 |
| In cells under high glucose, sulforaphane redirects glucose toward the pentose phosphate pathway and one-carbon metabolism, generating NADPH for glutathione synthesis; entirely Nrf2-dependent. | broccoli | *cell* | 21 |
| In animal models, sulforaphane suppresses liver gluconeogenesis and fat formation and promotes browning of white fat and fatty-acid oxidation. | broccoli | *animal* | 40, 41, 42 |

### Neurological, respiratory, hematological, gastric

| Claim | Varieties | Evidence | Rows |
|---|---|---|---|
| 18 weeks of sulforaphane-rich extract improved irritability, lethargy, stereotypy, hyperactivity and social responsiveness in 44 young men with moderate to severe autism; gains reversed within 4 weeks of stopping. | broccoli | primary, human | 43, 20 |
| Sulforaphane crosses the blood-brain barrier; neuroprotection in Alzheimer's and Parkinson's models is preclinical. | broccoli | *animal/early* | 19, 20 |
| COPD trial NCT01335971 sought a safe sulforaphane dose that raises Nrf2 activity in airway cells. | broccoli | trial registry | 44 |
| A 3-day intervention in asthmatic adults raised serum sulforaphane without reducing exhaled nitric oxide. | broccoli | primary, human, null result | 45, 26 |
| Phase 1 sickle cell trial: broccoli sprout homogenate was safe and raised HMOX1 mRNA, with a trend in fetal hemoglobin. | broccoli | primary, human, phase 1 | 28 |
| Sulforaphane is bactericidal against H. pylori including antibiotic-resistant strains; two months of daily sprouts reduces colonization but does not eradicate it. | broccoli | primary | 46, 48 |

### Agronomy and safety

| Claim | Varieties | Evidence | Rows |
|---|---|---|---|
| Vermiculite, coconut coir, jute fiber and organic biomaterials are effective alternatives to peat; substrate changes nitrate, dry matter and antioxidant profile. Red basil expressed more antioxidants on vermiculite and jute. | all | review | 8 |
| Total phenols drive sweetness, sourness, bitterness and astringency. | all | review | 8 |
| Sprouts grown warm, humid and dark are the highest-risk format for Salmonella and STEC; contamination is often inside the seed coat where surface sanitizers miss it. | all sprouts | review, outbreak data | 17, 50, 51, 53 |
| Microgreens under light with airflow and lower humidity carry lower risk, but root uptake and foliar contamination still require Good Agricultural Practices. | all micros | review | 54 |
| Seed or substrate inoculation with PGPR and protective endophytes (Bacillus, Pseudomonas and others) excludes pathogens and raises yield. | all | review | 55 |

### Clinical profiles (document C)

| Claim | Varieties | Evidence | Rows |
|---|---|---|---|
| Fenugreek microgreens carry steroidal saponins (diosgenin), the alkaloid trigonelline and galactomannan fiber; GC-MS profiling finds 1-nonadecene, tetracosane and eicosane, which track their antioxidant capacity. | fenugreek | primary | 76 |
| Methanolic fenugreek microgreen extracts are high in flavonoids and tannins and scavenge ABTS, DPPH and hydrogen peroxide radicals, reaching 90.6% total antioxidant capacity in vitro. | fenugreek | cell | 76 |
| Sprouting fenugreek raises alpha-tocopherol (vitamin E) nearly three-fold and beta-carotene by 55%, and raises the ratio of polyunsaturated to saturated fatty acids. | fenugreek | primary | 82 |
| Fenugreek extracts inhibit alpha-glucosidase by up to 99% and alpha-amylase by 95% in vitro, the enzymes that break carbohydrates into glucose. | fenugreek | cell | 82 |
| Galactomannan fiber thickens gut contents, delaying carbohydrate digestion and blunting the rise in blood glucose after eating. | fenugreek | review | 77 |
| Fenugreek microgreen extracts inhibit Staphylococcus aureus, Pseudomonas aeruginosa and Aeromonas hydrophila, and their biofilms by more than 70%, in vitro. | fenugreek | cell | 76 |
| The mucilaginous fiber in fenugreek binds bile acids in the gut and raises their excretion, so the liver draws on circulating cholesterol to make new ones. | fenugreek | review | 77 |
| Borage is one of the rare plant sources of gamma-linolenic acid (GLA); its leaves carry rosmarinic acid and other phenolic acids. | borage | primary | 80, 81 |
| Mature borage makes pyrrolizidine alkaloids, which are toxic to the liver; early-harvested microgreens accumulate little, and seed lines are monitored and bred for alkaloid-free profiles. | borage | review | 84 |
| In C. elegans and in diet-induced obese rats, borage seed oil reduced fat accumulation by raising peroxisomal beta-oxidation; the rats gained less weight and white fat, with Cebpa lowered and no change in what they ate. | borage | animal | 85 |
| In Drosophila, borage seed oil and GLA protected DNA against hydrogen peroxide damage. | borage | animal | 86, 87 |
| In Drosophila, whole borage extended health span where isolated GLA slightly shortened lifespan; the whole-plant extract was cytotoxic to HL60 leukemia cells. | borage | animal | 87 |
| GLA is lengthened to DGLA, which competes with arachidonic acid for the COX and LOX enzymes and shifts production toward the anti-inflammatory series-1 prostaglandins (PGE1). | borage | review | 84 |
| The red of red garnet amaranth is betalains, chiefly the betacyanin amaranthin, free-radical scavengers whose synthesis rises under light, drought and temperature stress. | amaranth | primary | 78, 79 |
| Amaranth carries squalene, the precursor of plant and animal sterols. | amaranth | review | 92 |
| Amaranth protein is high in lysine and methionine, the amino acids cereals and legumes lack. | amaranth | review | 90 |
| Squalene and amaranthin protect lipids from peroxidation, including the oxidative modification of LDL. | amaranth | review | 90 |
| Germinating wheat raises its vitamin E, the tocopherols and tocotrienols, 5.3-fold over the dormant seed. | wheat | primary | 82 |

### Media (document B)

| Claim | Varieties | Evidence | Rows |
|---|---|---|---|
| Cocopeat: high cation exchange capacity, pH 5.5 to 7.0, porosity 90 to 95%, low bulk density, naturally antifungal; more fresh and dry weight than field soil mixes. | all | review | 65 |
| Peat and vermiculite blends aerate the root zone and prevent the hypoxia behind damping-off. | all | review | 2 |
| Green and red basil on vermiculite and jute fiber carried more antioxidants; a resistive substrate is a mild stressor. | basil | review | 8 |
| Sugarcane filter cake, white sphagnum and vermicompost work as media but need microbial and nitrate monitoring. | all | review | 8 |
| Hydroponic mats with monitored water drastically reduce the pathogen vectors of soil and organic media. | all | review | 65, 50, 53 |
| Sulfur supplementation in a hydroponic reservoir raises glucosinolate biosynthesis in brassicas. | brassicas | review | 21 |

### Media (document D): the hemp mat

| Claim | Varieties | Evidence | Rows |
|---|---|---|---|
| Needle-punched hemp fiber mats use no binders or chemical treatment; they come pH-neutral and salt-free, need no buffering or rinsing, and are sold pre-cut for 1020 and 1010 trays. | all | supplier | 94, 97 |
| Hemp holds up to 1,050% of its weight in water; mat density sets retention: 400 g/m² (0.3 cm) low, 600 g/m² (0.5 cm) medium, 1,300 g/m² (1.0 cm) high. | all | supplier | 94, 97 |
| Bottom-watered, a hemp mat holds its water inside the fiber and keeps a drier surface than coir, which its maker ties to less damping-off and surface mold. | all | supplier | 94 |
| Grown on hemp mats, basil and dill microgreens carried more potassium; jute mats gave the highest iron and manganese in some species. | basil, dill | primary | 103 |

### Light (document B)

| Claim | Varieties | Evidence | Rows |
|---|---|---|---|
| Red light drives photosynthesis and biomass through phytochrome; monochromatic red gives the lowest antioxidant and secondary-metabolite concentrations. | all | primary | 68 |
| 100% blue gave radish and broccoli a 16.3% average rise in total antioxidant activity, with shorter, thicker growth. | radish, broccoli | primary | 68 |
| Blue light maximizes total phenolics in pea. | pea | primary | 70 |
| Broccoli: 5:1 red-to-blue balances height, weight, glucosinolates and antioxidants; 75:25 gave the most nitrogen; 25:75 raised bioavailable iron 15 to 20%; red-dominant 5 to 9 ratios maximize weight and dilute phytochemicals. | broccoli | primary | 68 |
| Far-red at 20% of flux with 50 to 75 µmol PPFD lengthens hypocotyls, raises fresh weight, and sharply raises ascorbic acid and glucosinolates in broccoli. | broccoli | primary | 73 |
| A brief UV-C exposure of about 10 minutes doubled chlorophyll and raised carotenoids under red and blue LEDs. | all | primary | 74 |
| Withholding green light under a high red-to-blue ratio raised mineral and nitrogen accumulation in *Salvia officinalis* and *Cannabis sativa*. | other species | primary | 69 |
| Broccoli grows and accumulates phytochemicals best at 50 to 70 µmol/m²/s; above 100, growth slows and reactive oxygen species damage tissue. | broccoli | primary | 73, 11 |
| Red pak choi carotenoids peak at 330 to 440 µmol/m²/s, lower at 110 and 545. | pak choi | primary | 73 |
| Continuous 24-hour light (DLI 15.6 and 23.3) raised fresh and dry weight and antioxidant enzyme activity in arugula, broccoli, mizuna and radish versus 16 hours, with no visible damage inside the harvest window. | brassicas | primary | 75 |
| Brassica microgreens in soilless media: ascorbic acid 177.58 to 256.46 mg/100 g, glucosinolates 4.09 to 47.38 µmol/g; Sango radish to 76.82% DPPH and 88.49% ABTS inhibition. | brassicas | primary | 66 |
| Controlled environment agriculture decouples yield from nutritional quality: deliberate abiotic stress before harvest raises secondary metabolites. | all | review | 62, 64 |

## 4. Variety benefit profiles

From document A's Table 2 and document C's profiles, each row citing the claims above: the seed for each variety's nutrient profile.

| Variety | Bioactives | Nutrients | Stated benefits | Rows |
|---|---|---|---|---|
| Broccoli (*Brassica oleracea* var. *italica*) | glucoraphanin, sulforaphane, phenolics | iron, manganese, vitamin C, vitamin K | Nrf2 activation, lower oxidative stress, lower HOMA-IR in T2DM, neuroprotective in ASD, chemopreventive | 14, 19, 22, 25, 38, 43, 47 |
| Red cabbage (*B. oleracea* var. *capitata*) | anthocyanins, glucosinolates, polyphenols | vitamin C, calcium, magnesium, beta-carotene | lower LDL, less liver inflammation (animal); GI symptom relief (human) | 9, 31, 34, 36 |
| Buckwheat (*Fagopyrum esculentum*) | rutin, quercetin, vitexin, orientin | potassium, zinc | blood pressure regulation, vascular resilience, top DPPH scavenging | 9, 16, 49 |
| Mung bean (*Vigna radiata*) | dietary fiber, flavonoids | protein, calcium, iron, vitamin C | digestible, glycemic modulation, more vitamin C as microgreen than sprout | 10 |
| Lentil (*Lens culinaris*) | carotenoids, chlorophyll | protein (albumins, globulins), vitamin C | antioxidant, muscle synthesis, tissue repair | 9 |
| Sunflower (*Helianthus annuus*) | fumaric acid, phenolic acids | calcium, potassium | skeletal minerals, cellular energy, antioxidant capacity | 14 |
| Radish, Sango (*Raphanus sativus*) | lutein, beta-carotene, anthocyanins | calcium, potassium, 16 amino acids | oxidative stress, ocular health, antibacterial | 9, 15 |
| Pea (*Pisum sativum*) | flavonoids, organic acids | phosphorus, copper, vitamin C | phosphorus and copper accumulation, vitamin C, gentle flavor | 14 |
| Fenugreek (*Trigonella foenum-graecum*) | diosgenin, trigonelline, galactomannans, saponins | iron, protein, fiber, magnesium | slower carbohydrate digestion and glucose rise (review); bile-acid binding (review); enzyme inhibition, antioxidant and antibacterial activity (in vitro) | 57, 76, 77, 82 |
| Borage (*Borago officinalis*) | gamma-linolenic acid, rosmarinic acid | vitamins B, C, K, folate, fiber | GLA to anti-inflammatory PGE1 (review); less fat accumulation (animal); DNA protection (animal); pyrrolizidine alkaloids in the mature plant (review, safety) | 80, 81, 84, 85, 86, 87 |
| Red garnet amaranth (*Amaranthus tricolor*) | betalains (amaranthin), carotenoids, squalene | lysine, methionine, vitamins K, E, C, calcium, iron | free-radical scavenging; complete amino acids (review); lipids and LDL protected from oxidation (review) | 78, 79, 90, 92 |
| Hard red winter wheat (*Triticum aestivum*) | superoxide dismutase, chlorophyll | vitamin E, B vitamins, vitamins C and K | vitamin E up 5.3-fold on germination | 82 |

Document C profiles chia's compounds (alpha-linolenic acid, chlorogenic acid, mucilage) with no inline citation, so chia's benefits stay the supplier's until a chia source is registered. Purple Rambo radish carries the supplier's statements and the radish rows above.

### 4b. Light and media responses by variety

What the grow plan editor shows beside the light and medium lines. Each response cites its row; where a variety has no studied response the row is empty and the default regime applies.

| Variety | Light response | Media response | Rows |
|---|---|---|---|
| Broccoli | PPFD 50 to 70, damage above 100; 5:1 red-to-blue for balance; 25:75 for iron; 20% far-red at 50 to 75 µmol for vitamin C and glucosinolates; continuous light for weight and antioxidant enzymes | hemp mat default; sulfur in hydroponic water raises glucosinolates | 68, 73, 75, 21 |
| Red cabbage | brassica: blue-rich for anthocyanins and phenolics; continuous light | hemp mat default; sulfur as broccoli | 68, 75, 21 |
| Radish | 100% blue for a 16.3% antioxidant rise; continuous light | hemp mat default; soilless media give superior shoot height and width in Sango | 68, 75, 66 |
| Pea | blue maximizes phenolics | hemp mat default; soil preferred by the supplier | 70, 59 |
| Basil | — | more antioxidants on vermiculite and jute | 8 |
| Sunflower, fenugreek, borage, amaranth, chia, lentil, mung bean, wheat | no studied response on file; the default regime applies | hemp mat default; sprouts take no medium | — |

## 5. Rules for stating a benefit

- A statement to a subscriber names the variety, the compound, the outcome, and the row.
- Human trial results may be stated as human results, with the population and duration. Animal and cell results are stated as such, never as what the flat will do for the person.
- Grade C rows never carry a claim on their own. Grade S rows carry the supplier's nutrient and flavor statements, not clinical outcomes.
- Dosing is not stated. The trials used extracts and powders at set grams per day; a flat is not a dose.
- Cotyledon surfaces the evidence and the math. It does not counsel. No "recommend", "should", "best", "optimal", "consider" (CLAUDE.md §5).
