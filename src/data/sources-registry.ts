/**
 * Cotyledon — the reference sources the platform cites.
 *
 * RULE: every source of data the platform cites publicly — a code, a rule, a
 * dataset, a rate schedule, a study, a spec sheet — is registered on the Sources
 * page. A figure without a registered source is not shown as sourced. This file
 * is the register for the sources that are not in the factor library
 * (`emission-factors.ts` seeds its own rows); `pnpm farm:sources` writes it to
 * `farm.sources`, and `test/farm-sources-registry.test.ts` fails the build when
 * a URL cited in `_data/` or `_engine/` is missing from both.
 *
 * Kind follows the Sources page's vocabulary. `year` is the edition or data
 * year where one is stated; null where the source is a living page.
 */

import type { SourceKind } from '@/engine/sources';
import { SCIENCE_REFERENCE_SOURCES } from '@/data/science-library';

export interface ReferenceSource {
  /** Stable key; the seed matches on it so a title change does not duplicate the row. */
  key: string;
  kind: SourceKind;
  title: string;
  publisher: string;
  year: number | null;
  citation: string;
  sourceUrl: string | null;
  /** Where the platform uses it — the module or engine, so a reader can trace it. */
  usedFor: string;
  /** Aliases: other URLs the code cites for the same source. */
  alsoUrls?: string[];
}

const BASE_REFERENCE_SOURCES: readonly ReferenceSource[] = [
  // ── City of Austin ────────────────────────────────────────────────────
  { key: 'austin:code-25-12-153', kind: 'regulation', title: 'Austin City Code §25-12-153 — Uniform Plumbing Code as amended', publisher: 'City of Austin', year: null, citation: 'Austin City Code Title 25, Ch. 25-12, §25-12-153 (UPC §616.0, §704.3, §1007.0, §1014.1, §1014.1.1, §1014.1.3)', sourceUrl: 'https://library.municode.com/tx/austin/codes/code_of_ordinances?nodeId=TIT25LADE_CH25-12TECO', usedFor: 'Facility conformance register: indirect waste, no disposer, grease interceptor sizing, trapping and venting.' },
  { key: 'austin:code-15-10', kind: 'regulation', title: 'Austin City Code Chapter 15-10 — Wastewater Regulations', publisher: 'City of Austin', year: null, citation: 'Austin City Code Title 15, Ch. 15-10', sourceUrl: 'https://library.municode.com/tx/austin/codes/code_of_ordinances?nodeId=TIT15UTSE_CH15-10WARE', usedFor: 'Effluent limits and the grease interceptor requirement.' },
  { key: 'austin:code-10-3', kind: 'regulation', title: 'Austin City Code Chapter 10-3, Article 4 — Central Preparation Facilities', publisher: 'City of Austin', year: null, citation: 'Austin City Code Title 10, Ch. 10-3, Art. 4', sourceUrl: 'https://library.municode.com/tx/austin/codes/code_of_ordinances?nodeId=TIT10HESA_CH10-3FOSA', usedFor: 'Facility design: the facility licence category. Text not yet retrieved; the highest-priority gap before plan review.' },
  { key: 'austin:aph-plan-review', kind: 'regulation', title: 'Austin Public Health — Food establishment plan review and Fixed Food Establishments rules', publisher: 'Austin Public Health', year: null, citation: 'APH Environmental Health Services, plan review application; Fixed Food Establishments', sourceUrl: 'https://www.austintexas.gov/department/food-establishment-plan-review', usedFor: 'Plan review gate before opening, drawing scale and sheet size, finished ceilings, HACCP plan filing.' },
  { key: 'austin:bcm-2', kind: 'regulation', title: 'Austin Building Criteria Manual §2 — Food Establishments', publisher: 'City of Austin', year: null, citation: 'Building Criteria Manual, Section 2', sourceUrl: 'https://library.municode.com/tx/austin/codes/building_criteria_manual', usedFor: 'Facility design. Text not yet retrieved.' },

  // ── Texas ─────────────────────────────────────────────────────────────
  { key: 'tx:25-tac-228', kind: 'regulation', title: '25 Texas Administrative Code Chapter 228 — Retail Food Establishments', publisher: 'Texas Department of State Health Services', year: 2021, citation: '25 TAC §228.1 (adopts the 2017 FDA Food Code and Supplement, effective 2021-08-08), §228.171, §228.241, §228.243', sourceUrl: 'https://texreg.sos.state.tx.us/public/readtac$ext.ViewTAC?tac_view=4&ti=25&pt=1&ch=228', usedFor: 'The legal basis of the facility conformance register: every food requirement is a Food Code section as adopted by Texas.' },
  { key: 'tx:tda-farm-fresh', kind: 'dataset', title: 'Texas Department of Agriculture — Farm Fresh Network', publisher: 'Texas Department of Agriculture', year: 2026, citation: 'Farm Fresh Network directory, Austin-metro extract as of 2026-09-10', sourceUrl: 'https://experience.arcgis.com/experience/c8f3e664cb3b40a59f399ac6f35f6009', usedFor: 'Supplier directory: the prospect-ready flag on producers.' },

  // ── Federal — USDA ────────────────────────────────────────────────────
  { key: 'usda:7-cfr-210', kind: 'regulation', title: '7 CFR Part 210 — National Prospect Unit Program', publisher: 'USDA Food and Nutrition Service', year: 2024, citation: '7 CFR 210.10(c) nutrient profile, 210.10(a)(3) production records, 210.9(b)(17) retention; component quantities unchanged by the 2024 final rule, 89 FR 31962', sourceUrl: 'https://www.ecfr.gov/current/title-7/subtitle-B/chapter-II/subchapter-A/part-210', usedFor: 'Nutrition: the packed unit is solved to the tray format\'s nutrition contribution.' },
  { key: 'usda:ams-beef-retail', kind: 'dataset', title: 'AMS National Retail Report — Beef', publisher: 'USDA Agricultural Marketing Service', year: 2026, citation: 'Grass-fed 80–89% lean, Q2 2026 retail average', sourceUrl: 'https://www.ams.usda.gov/market-news/retail', usedFor: 'The beef price reference against the direct-from-ranch target.' },
  { key: 'usda:organic-integrity', kind: 'dataset', title: 'USDA Organic INTEGRITY Database', publisher: 'USDA Agricultural Marketing Service', year: 2026, citation: 'Certified operations, TX / CO / NM / LA, as of 2026-09-10', sourceUrl: 'https://organic.ams.usda.gov/integrity/', usedFor: 'Supplier directory: certification, certifier, scope and products.' },
  { key: 'usoe:design-criteria-1973', kind: 'other', title: 'Design Criteria: Prospect Food Service Facilities', publisher: 'U.S. Office of Education', year: 1973, citation: 'USOE, 1973 (dated)', sourceUrl: null, usedFor: 'Facility space standards: cold-storage front clearance and the per-unit cross-check.' },

  // ── Federal — FDA ─────────────────────────────────────────────────────
  { key: 'fda:food-code-2017', kind: 'regulation', title: 'FDA Food Code 2017 and Supplement', publisher: 'U.S. Food and Drug Administration', year: 2017, citation: 'FDA Food Code 2017 with the 2019 Supplement, as adopted by 25 TAC §228.1; §3-501.14 two-stage cooling (control-point-2), §3-502.11/12 reduced-oxygen packaging, §3-501.16, and the facility sections cited on the conformance register', sourceUrl: 'https://www.fda.gov/food/fda-food-code/food-code-2017', usedFor: 'control-point-2 cooling limits, the seven-day shelf life, and the facility conformance register.' },
  { key: 'fda:fsma-produce-safety-rule', kind: 'regulation', title: '21 CFR Part 112 — Standards for the Growing, Harvesting, Packing, and Holding of Produce for Human Consumption (FSMA Produce Safety Rule)', publisher: 'U.S. Food and Drug Administration', year: 2015, citation: '21 CFR Part 112; Subpart M sprouts: §112.142 seed treatment, §112.144 to §112.147 spent sprout irrigation water testing, §112.148 corrective actions', sourceUrl: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-112', usedFor: 'The stage control points on the sowing record: seed sanitation and the spent sprout irrigation water test (src/data/produce-safety.ts).' },
  { key: 'fda:fsma-204', kind: 'regulation', title: '21 CFR Part 1 Subpart S — Food Traceability (FSMA 204)', publisher: 'U.S. Food and Drug Administration', year: 2022, citation: '21 CFR 1.1300–1.1465; Food Traceability List at 21 CFR 1.1990; compliance date proposed to 2028-07-20 (90 FR, docket FDA-2022-N-0083)', sourceUrl: 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-1/subpart-S', usedFor: 'Transformation critical tracking events and key data elements on every sowing; the Food Traceability List flag on inputs.' },

  // ── Federal — other ───────────────────────────────────────────────────
  { key: 'doe:10-cfr-431-r', kind: 'regulation', title: '10 CFR Part 431 Subpart R — Walk-in coolers and freezers', publisher: 'U.S. Department of Energy', year: null, citation: '10 CFR 431 Subpart R, envelope insulation minimum R-25', sourceUrl: 'https://www.ecfr.gov/current/title-10/chapter-II/subchapter-D/part-431/subpart-R', usedFor: 'Walk-in panel specification.' },
  { key: 'osha:29-cfr-1910-176', kind: 'regulation', title: '29 CFR 1910.176 — Handling materials, general', publisher: 'Occupational Safety and Health Administration', year: null, citation: '29 CFR 1910.176(a): sufficient safe clearance; no aisle width is stated', sourceUrl: 'https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XVII/part-1910/subpart-N/section-1910.176', usedFor: 'Aisle clearance: a performance requirement, not a number.' },
  { key: 'dol:flsa-207', kind: 'regulation', title: 'Fair Labor Standards Act §7 — Maximum hours', publisher: 'U.S. Department of Labor', year: null, citation: '29 U.S.C. 207(a)(1)', sourceUrl: 'https://www.law.cornell.edu/uscode/text/29/207', usedFor: 'Overtime over 40 hours a workweek on the time clock.' },
  { key: 'doj:ada-2010', kind: 'regulation', title: '2010 ADA Standards for Accessible Design', publisher: 'U.S. Department of Justice', year: 2010, citation: '2010 ADA Standards §403.5.1–.3; ICC A117.1 §403.5.1', sourceUrl: 'https://www.ada.gov/law-and-regs/design-standards/2010-stds/', usedFor: 'The 36-inch accessible route on the floor layout.' },
  { key: 'dod:space-planning-510', kind: 'other', title: 'DoD Space Planning Criteria, Chapter 510 — Food and Nutrition Service', publisher: 'U.S. Department of Defense', year: 2015, citation: 'Space Planning Criteria Ch. 510, 2015', sourceUrl: 'https://www.wbdg.org/ffc/dod/space-planning-criteria', usedFor: 'The facility support program: dock, storage, office, lounge, lockers, toilets, trash.' },
  { key: 'census:geocoder', kind: 'dataset', title: 'U.S. Census Bureau Geocoder', publisher: 'U.S. Census Bureau', year: null, citation: 'Geocoding Services API, one-line address', sourceUrl: 'https://geocoding.geo.census.gov/geocoder/', usedFor: 'Prospect street-address geocodes.' },
  { key: 'census:gazetteer-2023', kind: 'dataset', title: 'U.S. Census Bureau Gazetteer Files, 2023', publisher: 'U.S. Census Bureau', year: 2023, citation: 'ZCTA and county national files', sourceUrl: 'https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html', usedFor: 'ZIP and county centroids for supplier pins and the prospect fallback.' },

  // ── Standards bodies ──────────────────────────────────────────────────
  { key: 'fasb:asc-330', kind: 'regulation', title: 'FASB ASC 330 — Inventory', publisher: 'Financial Accounting Standards Board', year: null, citation: 'ASC 330-10-20, 330-10-30-1, -3, -7, -8, -12, -13; with ASC 606, 470-10-45, 835, 842, 360, 230 as cited in the accounting policy', sourceUrl: 'https://asc.fasb.org/330/tableOfContent', usedFor: 'Standard cost, normal-capacity absorption, abnormal spoilage, period costs: the whole costing policy.' },
  { key: 'iso:14064-1', kind: 'regulation', title: 'ISO 14064-1:2018 — Greenhouse gases, Part 1', publisher: 'International Organization for Standardization', year: 2018, citation: 'ISO 14064-1:2018; §6.4 materiality (band unconfirmed)', sourceUrl: 'https://www.iso.org/standard/66453.html', usedFor: 'Factor versioning, the baseline and the restatement check on the inventory.' },
  { key: 'ghg-protocol:corporate', kind: 'other', title: 'GHG Protocol Corporate Standard and Scope 2 Guidance', publisher: 'World Resources Institute / WBCSD', year: 2015, citation: 'Corporate Accounting and Reporting Standard; Scope 2 Guidance (dual reporting)', sourceUrl: 'https://ghgprotocol.org/corporate-standard', usedFor: 'Scope structure and location- and market-based Scope 2 side by side.' },
  { key: 'iso:9001-22400-62264', kind: 'regulation', title: 'ISO 9001:2015 §8.7, ISO 22400 and IEC 62264 (ISA-95)', publisher: 'ISO / IEC', year: null, citation: 'ISO 9001:2015 clause 8.7; ISO 22400 planned vs actual scrap; IEC 62264 production performance', sourceUrl: 'https://www.iso.org/standard/62085.html', usedFor: 'Scrap record format, planned against actual scrap, and the sowing record as the only posting source.' },
  { key: 'codex:cxc-1-1969', kind: 'regulation', title: 'Codex Alimentarius CXC 1-1969 — General Principles of Food Hygiene', publisher: 'FAO / WHO Codex Alimentarius', year: 2020, citation: 'CXC 1-1969 §9.1.2, §9.2.1', sourceUrl: 'https://www.fao.org/fao-who-codexalimentarius/codex-texts/codes-of-practice/en/', usedFor: 'One-directional flow and drainage direction on the floor layout.' },
  { key: 'brcgs:produce-safety', kind: 'other', title: 'BRCGS Global Standard Produce Safety', publisher: 'BRCGS', year: null, citation: 'Clauses 4.8.4, 4.12, 4.12.3, 7.2.2, 8.4, 8.6; Appendix 2 zone definitions (paywalled; cited through secondary sources)', sourceUrl: 'https://www.brcgs.com/our-standards/produce-safety/', usedFor: 'Handwash at production entry, gowning route, waste routing, high-risk zoning.' },
  { key: 'icc:imc-ibc', kind: 'regulation', title: 'International Mechanical Code and International Building Code, Austin-adopted editions', publisher: 'International Code Council', year: null, citation: 'IMC §507.4.1, §507.2.6, §506.3.6, Table 507.2.8; IBC §1018.2.2, Table 1020.3, §1005.3, §1208.2; with NFPA 96 §4.2 / Ch. 5 and UL 710', sourceUrl: 'https://codes.iccsafe.org/', usedFor: 'Hood overhang, grease-duct clearances, egress aisles, corridors, occupant capacity, ceiling height.' },
  { key: 'ecff:recommendations', kind: 'other', title: 'ECFF Recommendations for the Production of Prepacked Blackout Food', publisher: 'European Blackout Food Federation', year: 2006, citation: 'ECFF Recommendations §2.2.2, §2.2.4', sourceUrl: 'https://www.ecff.net/', usedFor: 'The 12°C production-area benchmark and the gowning sequence.' },
  { key: 'gs1:general-specifications', kind: 'other', title: 'GS1 General Specifications — Application Identifier (10)', publisher: 'GS1', year: null, citation: 'GS1 General Specifications, AI (10) sowing or lot number', sourceUrl: 'https://www.gs1.org/standards/barcodes-epcrfid-id-keys/gs1-general-specifications', usedFor: 'The lot code carrier on every component.' },

  // ── Academic and design guidance ──────────────────────────────────────
  { key: 'ucb:dining-design-guidelines', kind: 'other', title: 'UC Berkeley University Health Services Dining Design Guidelines — Space Requirements', publisher: 'University of California, Berkeley', year: null, citation: 'Dining Design Guidelines, space requirements appendix', sourceUrl: null, usedFor: 'The aisle in every zone circulation factor of the space engine.' },
  { key: 'fer:cart-clearance', kind: 'other', title: 'Foodservice Equipment Reports — cart clearance', publisher: 'Foodservice Equipment Reports', year: null, citation: 'Carts need roughly 40 in', sourceUrl: 'https://www.fermag.com/', usedFor: 'Harvest marshalling lane width.' },
];

/** The register: the platform's reference sources plus every row of the science library. */
export const REFERENCE_SOURCES: readonly ReferenceSource[] = [...BASE_REFERENCE_SOURCES, ...SCIENCE_REFERENCE_SOURCES];

/**
 * Sources held as stored documents (`scripts/seed-farm-sources.ts` STORED): registered by the
 * script from the file itself, so they are not rows here. Listed so the register knows them.
 */
export const STORED_DOCUMENT_URLS: readonly string[] = [
  'https://doi.org/10.1126/science.aaq0216', // Poore & Nemecek (2018), Data S2
  'https://doi.org/10.1016/j.agsy.2018.02.003', // Stanley et al. (2018), Agricultural Systems 162
];

/** URLs the code carries that are not sources of data: runtime services and vendor pages. */
export const NON_SOURCE_URL_PATTERNS: readonly RegExp[] = [
  /tile\.openstreetmap\.org/,
  /example\.(com|org)/,
  /localhost/,
  /vercel\.app/,
  /getstaffing\.com/,
  /clerk\./,
];

/** Every URL a registered source answers for: its own and its aliases, with the query and hash dropped. */
export const registeredUrls = (extra: readonly string[] = []): Set<string> => {
  const norm = (u: string) => u.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();
  const out = new Set<string>();
  for (const s of REFERENCE_SOURCES) {
    if (s.sourceUrl) out.add(norm(s.sourceUrl));
    for (const u of s.alsoUrls ?? []) out.add(norm(u));
  }
  for (const u of [...STORED_DOCUMENT_URLS, ...extra]) out.add(norm(u));
  return out;
};
