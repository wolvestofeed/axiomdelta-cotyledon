# Module 08 — Sustainability (carbon and resource accounting)

> **Scoping record, 2026-09-10.** Moved into the repo on 2026-09-14 from the confidential source
> folder; the Sustainability module scope; the build plan S0–S5 is in `../../roadmap.md`. Historical: where it disagrees with `../../roadmap.md`, the roadmap is current.

> **SOURCE OF TRUTH.** Every figure traces to a tagged row in
> [`Research/RESEARCH.md`](../Research/RESEARCH.md), section 19. If a number is not there, it does not
> go here. Activity data for the facility does not exist yet; every activity input is a labelled
> `[PLACEHOLDER]` until the kitchen runs.

**Scoped 2026-09-12 with Robert** from `Research/Muse Kitchen Sustainabilty Research.docx`.
Decisions: the module family is named **Sustainability**; AR5 GWPs for the inventory and AR4 where the
AIM Act requires it; Poore & Nemecek is the v1 food factor set, Agribalyse added if its licence is free;
WFLDB excluded; no legacy carbon spreadsheets exist to seed activity baselines. Editable inputs go on
the scenario overlay now with a persistent activity ledger deferred to the Muse Phase C schema
(working assumption, still open with Robert).

---

## What the brief asks for

A carbon and resource accounting layer for the commissary, modelled on the GHG Protocol and ISO
14064-1, organised as ten spreadsheet-style modules plus an audit layer.

| # | Module | Activity data | Factor / rule source | Output |
|---|---|---|---|---|
| 0 | Facility parameters | sq ft, operating days, meals/day, degree days | NOAA | CO2e/meal, kWh/sq ft |
| 1 | Scope 1 stationary + mobile fuel | gas, propane, gasoline, diesel | EPA GHG Emission Factors Hub | MTCO2e |
| 2 | Scope 1 fugitive refrigerants | circuit register, charge, lb added | IPCC GWP, 40 CFR 84 Subpart C, GreenChill | leak %, MTCO2e, threshold findings |
| 3 | Scope 2 electricity | kWh, REC share | EPA eGRID ERCT | location- and market-based MTCO2e |
| 4 | Scope 3 ingredients | kg by food category | Poore & Nemecek, Agribalyse | food MTCO2e per meal |
| 5 | Supplier verification | cert numbers, practices | USDA Organic INTEGRITY, COMET-Farm | % spend meeting standard; sequestration evidence |
| 6 | Logistics | payload, distance, TRU plug-in hours | SmartWay, CARB | ton-mile MTCO2e |
| 7 | Equipment efficiency | kW, fuel, ENERGY STAR | ENERGY STAR CFS, Austin Energy | rebate eligibility, kWh/meal |
| 8 | Waste & end-of-life | food and packaging tons, destination | EPA WARM v15, packaging LCAs | net MTCO2e compost vs landfill |
| 9 | Water & effluent | gallons, BOD, TSS, COD, FOG | Austin Water Ch. 15-10 | water footprint, projected surcharge |
| — | Audit layer | — | ISO 14064-1 / 14064-3 | lineage, factor versions, baseline restatement, evidence pack |

## What already exists in the OS

| Module | Existing source | Day-one status |
|---|---|---|
| 0 | `facility.sizeSqFt`, phase meals/day and operating days | live |
| 4 | recipe as-purchased quantities × portions produced | live |
| 8 | planning-loop overshoot past hold life × chilled mass, plus shrink allowance | live, derived |
| 6 outbound | home pin + geocoded sites → ton-miles | live; inbound needs supplier coordinates |
| 5 | compiled USDA Organic cert status; PO-line → supplier link is an open item | partial |
| 7 | equipment schedule; needs fuel, kW, refrigerant, charge attributes | placeholder attributes |
| 1, 2, 3, 9 | none | preview, labelled placeholder inputs |

## Design rules

1. **Factors are versioned reference data, never live API calls.** Each factor row carries value,
   unit, source, URL, version, effective-from and status tag. Public APIs named in the brief become
   static tables, already-compiled local data, or operator-entered evidence.
2. **A carbon ledger mirrors the financial ledger.** Activity record × pinned factor version → an
   immutable posting carrying CO2, CH4, N2O, CO2e, scope, category, factor id and version. Nothing
   derived is stored. Aggregation by scope, period, normalizer.
3. **Two GWP tables**, AR5 and AR4, and every posting records which it used.
4. **Every figure carries its status tag in the UI**, as the rest of the platform does.
5. **No advice.** The brief's "empowers / optimize / prioritize" language does not reach the UI.
   Findings cite the rule and the computed impact. The rebate table is inventory with eligibility
   conditions and a computed amount. The Coolfood pledge is a reference, not an adopted target.
6. **Dual-basis reporting (replaces "never netted", decided 2026-09-12).** Every food line is
   computed on two bases, always both shown, the way Scope 2 shows location- and market-based:
   the **reference basis** is the Poore & Nemecek study mean and is never editable; the **selected
   basis** is the operator's choice per ingredient among study mean, a cited LCA from a registered
   document (e.g. the Quantis White Oak Pastures deck), or supplier-specific data with the supplier's
   own document attached. The gap between the two is the practice or supplier credit. Each option
   carries its boundary (farm gate, slaughter gate, retail); a derived "aligned to retail" figure adds
   the study's own downstream stages for that product, shown beside the raw figure. ISO 14064-1 and
   GHG Protocol practice govern how the two bases are presented. Rule of record: always refer to ISO
   and best practice.
7. **Editable inputs on the scenario overlay** (new `sustainability` section), base + overlay, Section
   Save → draft, Apply → live. Monthly invoices, service logs and lab results become a persistent
   ledger with Phase C.

## Phases

- **S0 — Scope and records.** DONE 2026-09-12. This document, RESEARCH.md §19, and the build plan in
  the repo's `docs/muse/roadmap.md`.
- **S1 — Factor library and carbon-ledger engine.** DONE 2026-09-12 (uncommitted). Pure functions with golden-value tests: 1,000
  therms; 10,000 kWh ERCT; 1 lb R-404A; a walk-in crossing the 20% trigger; a surcharge case on each
  side of the 2.25 COD/BOD ratio.
- **S2 — Modules live from existing model data.** DONE 2026-09-12 (uncommitted). Sidebar section **Sustainability**: Facility and
  normalizers; Scope 3 ingredients per meal with a beef-share what-if showing the delta; Waste and
  end-of-life, landfill and compost side by side; Outbound logistics. Honest Preview pages for the rest.
  Pre-interview cut ends here.
- **S3 — Activity-input modules on the overlay.** DONE 2026-09-12 (uncommitted). Scope 1 fuel; refrigerant register with leak rate
  and AIM Act / GreenChill findings; Scope 2 location- and market-based; Water and effluent with the
  Austin surcharge model and grease-trap interval; equipment attributes and rebate inventory.
- **S4 — Supplier verification.** DONE 2026-09-12 (uncommitted). PO line → supplier; % spend with a cert on file; inbound logistics;
  regenerative evidence shown separately. A practice-specific farm LCA (Quantis-style) is one such evidence
  document: entered per supplier with its own status tag, displayed beside the study-mean line for that
  ingredient with the gap computed, never substituted for it (RESEARCH.md §19, regenerative-beef debate).
- **S5 — Inventory statement and audit surface.** Scope 1/2/3 by period with normalizers;
  factor-version stamp on every line; baseline year and materiality setting with a restatement flag;
  evidence-pack export on the CompTable audit-pack pattern.


## Decisions 2026-09-12 (Robert)
- **Sources registry.** `muse.sources` (documents: title, authors, publisher, year, kind, DOI/URL,
  file, hash, licence note, uploader, date) and `muse.source_figures` (value, unit, locator such as
  slide or sheet/column, status tag, effective date). Provenance ids in the factor library are the
  join key. A `Cite` element on any figure opens the source page, which renders the document in the
  platform. Files stored in Neon for now; large files (the P&N workbook, the Quantis deck) load by
  CLI seed from the research folder because in-app uploads are capped by Vercel at about 4.5 MB;
  Vercel Blob added when Robert creates the token.
- **Sequencing.** S2 pages first with a `Cite` element that resolves to a static tooltip until the
  tables exist; then S2b sources registry; then S3; S4 carries the per-ingredient LCA basis options
  and supplier links; then S5.
- **Permissions.** Uploads and basis edits are super-admin only; viewers read.
- **Mark rating pills.** 1, 2 or 3 stars, NOT YET RATED, IN REVIEW; colour-coded, bold capitals;
  on ingredient rows, supplier fields and vendors. Real producers are always NOT YET RATED until a
  rating is on file. Mark name lives in one constant, neutral until the naming rule is settled.

## Open
- [x] Activity inputs on the overlay (built 2026-09-12); a persistent activity ledger is the Phase C follow-on
- [x] Standards partner's name in the repo — confirmed 2026-09-12, limited to the rating mark
- [ ] Vercel Blob token, for in-app uploads above the request limit
- [ ] Seven `[UNCONFIRMED]` verifications listed at the end of RESEARCH.md §19

## Update Log
- 2026-09-12 — S5 shipped; build plan S0–S5 complete. Statement on both bases, baseline and restatement check with factor fingerprint, evidence-pack ZIP with every stored document. Remaining work is data, not build: the seven unconfirmed factor verifications, utility and service records once the kitchen runs, supplier documents and ERRA ratings as they arrive.
- 2026-09-12 — S4 shipped: ingredient→supplier links, spend coverage, inbound logistics, supplier-specific LCA options with the vendor's document. Next: S5 inventory statement and audit surface.
- 2026-09-12 — S3 shipped: energy, refrigerant, water and equipment inputs live on the overlay; statement fills Scope 1 and 2. Next: S4 supplier verification, then S5 audit surface.
- 2026-09-12 — Dual-basis reporting live on Ingredients and the audit statement; White Oak selectable for beef with raw and retail-aligned figures. Supplier-specific options remain S4.
- 2026-09-12 — S2b shipped: sources registry in Neon, P&N workbook and Quantis deck stored and viewable in the platform, every factor cited to a registered source. Next: S3 activity-input modules.
- 2026-09-12 — S2 shipped: nine Sustainability pages, Cite links, dashboard card, ERRA rating pills on ingredient, PO and supplier rows. Next: S2b sources registry.
- 2026-09-12 — Rule 6 replaced by dual-basis reporting. Sources registry, sequencing, permissions, boundary alignment and the mark rating pills recorded as decisions.
- 2026-09-12 — S4 note: farm-specific LCAs as per-supplier evidence beside the study mean. No phase change.
- 2026-09-12 — Food factors sourced from the full Poore & Nemecek Data S2 workbook (43 products, weighted means). Recipe mapped; footprint 4.94 kg CO2e per portion, beef 85%. The Scope 3 ingredients module in S2 is no longer blocked.
- 2026-09-12 — S1 shipped in the repo: factor library with provenance on every row, carbon-ledger engine, 25 tests. Food factor values still pending the OWID pull into RESEARCH.md §19.
- 2026-09-12 — Populated from the sustainability research brief after the scoping conversation.
  Decisions and design rules recorded; phases S0–S5 set; S0 complete.
- 2026-09-10 — File created empty.
