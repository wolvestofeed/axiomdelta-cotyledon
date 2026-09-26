# Science Library — the source register

Every benefit MicroFarm states about a variety traces to a row here. This file is the register the Sources module is seeded from in Phase 2; the glossary ([`glossary.md`](glossary.md)) cites rows by number. Nothing is stated to a subscriber without a citation, and a citation that is a company page or a blog is marked as such and never carries a clinical claim.

Two source documents, both Rob's compilations, Sept 2026:

- **A** — *The Clinical and Scientific Efficacy of Microgreens and Sprouts* (`docs/Microgreens Nutritional Research Data.docx`): what the compounds do in the body. Rows 1–56 are its works cited in its own order, so its inline superscripts map one for one.
- **B** — *Optimal Agronomic Practices for Microgreens: Growth Media and Lighting Optimization* (`docs/Optimal Agronomic Practices for Microgreens_ Growth Media and Lighting Optimization.docx`): how growing conditions change what is in the crop. It shares 44 works with A; its 15 new works are rows 61–75, and §1b maps its own numbering onto the register.

The register in code is `apps/web/src/app/(farm)/farm/_data/science-library.ts`; `rowFor('B', n)` resolves a document B superscript.

## 1. Works cited

Grade: **P** primary study or trial, **R** review or meta-analysis, **T** trial registry, **S** seed supplier's published variety summary or packaging (nutrient and flavor statements, no clinical claim), **C** commercial or advocacy page (context only, no clinical claim).

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

### 1b. Document B's numbering

Document B's inline superscript *n* cites the register row in position *n* of this list: 1, 61, 5, 6, 25, 62, 8, 63, 2, 64, 3, 11, 9, 50, 4, 10, 13, 65, 66, 67, 51, 52, 53, 21, 22, 55, 68, 69, 70, 71, 72, 73, 74, 75, 14, 20, 23, 24, 26, 27, 30, 28, 29, 38, 19, 41, 42, 43, 44, 45, 36, 33, 31, 32, 34, 16, 17, 18, 49.

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
| 1.09% red cabbage microgreens in a high-fat diet: 34% lower LDL, 23% lower liver triglycerides, less liver inflammation. | red cabbage | *animal* | 31 |
| Microgreen extracts reduce AGE formation and inflammatory markers (RAGE, MCP-1, ICAM-1) while raising eNOS. | brassicas | *cell/animal* | 35 |
| Two cups a day of red cabbage or beet microgreens for two weeks: 95.6% compliance; gastrointestinal inflammation symptoms improved with red cabbage. | red cabbage, bull's blood beet | primary, human | 36 |
| Meta-analysis of broccoli sprout trials: systolic pressure down 10.9 mmHg, diastolic down 6.95 mmHg. | broccoli | meta-analysis | 37 |
| Rutin in buckwheat supports capillary resilience and blood pressure regulation. | buckwheat | review | 16, 49 |

### Glucose and metabolism

| Claim | Varieties | Evidence | Rows |
|---|---|---|---|
| 10 g/day broccoli sprout powder for 4 weeks lowered fasting insulin and HOMA-IR in type 2 diabetes. | broccoli | primary, human | 38 |
| 10 g/day broccoli sprout powder lowered malondialdehyde and oxidized LDL. | broccoli | primary, human | 29 |
| Sulforaphane redirects glucose toward the pentose phosphate pathway and one-carbon metabolism, generating NADPH for glutathione synthesis; entirely Nrf2-dependent. | broccoli | *cell* | 21 |
| Sulforaphane suppresses liver gluconeogenesis and fat formation, promotes browning of white fat and fatty-acid oxidation. | broccoli | *animal* | 40, 41, 42 |

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

### Media (document B)

| Claim | Varieties | Evidence | Rows |
|---|---|---|---|
| Cocopeat: high cation exchange capacity, pH 5.5 to 7.0, porosity 90 to 95%, low bulk density, naturally antifungal; more fresh and dry weight than field soil mixes. | all | review | 65 |
| Peat and vermiculite blends aerate the root zone and prevent the hypoxia behind damping-off. | all | review | 2 |
| Green and red basil on vermiculite and jute fiber carried more antioxidants; a resistive substrate is a mild stressor. | basil | review | 8 |
| Sugarcane filter cake, white sphagnum and vermicompost work as media but need microbial and nitrate monitoring. | all | review | 8 |
| Hydroponic mats with monitored water drastically reduce the pathogen vectors of soil and organic media. | all | review | 65, 50, 53 |
| Sulfur supplementation in a hydroponic reservoir raises glucosinolate biosynthesis in brassicas. | brassicas | review | 21 |

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

From the report's Table 2, each row citing the claims above. This is the seed for each variety's nutrient profile in Phase 2.

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

Varieties Rob grows that the report does not profile and that need their own rows before a benefit is stated: fenugreek, borage, red garnet amaranth, purple Rambo radish, chia, hard red winter wheat. The Vallecito research database (`_inventory/raw-extracts/Microgreens_Research_Database__*.txt`) has starting citations for fenugreek iron (Journal of Food Science & Nutrition, doi:10.1002/fsn3.1209) and lentil protein (Food Chemistry, doi:10.1016/j.foodchem.2018.06.123).

### 4b. Light and media responses by variety

What the grow plan editor shows beside the light and medium lines. Each response cites its row; where a variety has no studied response the row is empty and the default regime applies.

| Variety | Light response | Media response | Rows |
|---|---|---|---|
| Broccoli | PPFD 50 to 70, damage above 100; 5:1 red-to-blue for balance; 25:75 for iron; 20% far-red at 50 to 75 µmol for vitamin C and glucosinolates; continuous light for weight and antioxidant enzymes | cocopeat default; sulfur in hydroponic water raises glucosinolates | 68, 73, 75, 21 |
| Red cabbage | brassica: blue-rich for anthocyanins and phenolics; continuous light | cocopeat default; sulfur as broccoli | 68, 75, 21 |
| Radish | 100% blue for a 16.3% antioxidant rise; continuous light | cocopeat; soilless media give superior shoot height and width in Sango | 68, 75, 66 |
| Pea | blue maximizes phenolics | cocopeat, soil preferred by the supplier | 70, 59 |
| Basil | — | more antioxidants on vermiculite and jute | 8 |
| Sunflower, fenugreek, borage, amaranth, chia, lentil, mung bean, wheat | no studied response on file; the default regime applies | cocopeat default; sprouts take no medium | — |

## 5. Rules for stating a benefit

- A statement to a subscriber names the variety, the compound, the outcome, and the row.
- Human trial results may be stated as human results, with the population and duration. Animal and cell results are stated as such, never as what the flat will do for the person.
- Grade C rows never carry a claim on their own. Grade S rows carry the supplier's nutrient and flavor statements, not clinical outcomes.
- Dosing is not stated. The trials used extracts and powders at set grams per day; a flat is not a dose.
- MicroFarm surfaces the evidence and the math. It does not counsel. No "recommend", "should", "best", "optimal", "consider" (CLAUDE.md §5).
