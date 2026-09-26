# Phase 2 — Growing domain  status: IN PROGRESS (part 1 done)

The variety as the master record and the cost basis; the grow plan with seed, medium, nutrient and light lines replacing the crop plan; the stage schedule replacing thermal processes; tray formats and grow units replacing vessels; nutrition targets replacing crediting; produce-safety control points; the science library and the glossary in the app; Vallecito data seeded. `outline.md` §4 is the domain model, §5 the engine rules, `glossary.md` the naming authority, `science-library.md` the source register.

The old kitchen model is still what the engine runs on. Part 1 put the new data beside it; parts 2 to 10 put it under it. Each part keeps the suite green; the tests tied to the kitchen model (`farm-engine`, `farm-crediting`, `farm-routing`, `farm-scheduler`, `farm-menu-seed`, `farm-conformance`, `farm-production-plan`, `farm-forecast-timeline`) are rewritten as the model they test is replaced, not deleted.

## Part 1 — Data foundations  DONE (commit `026742c`)

All under `apps/web/src/app/(farm)/farm/_data/`, tested by `test/farm-varieties.test.ts`.

- [x] `varieties.ts` — the 12 Vallecito varieties as master records: supplier and provenance, seed price per lb (DATED, True Leaf 5 lb tier Jan 2024), grams per 1020 (STATED, what Vallecito sowed), soak hours, stage days, harvest grams (PLACEHOLDER), flavor and color, light response, media response, nutrient profile with benefits citing science-library rows, glossary links
- [x] `tray-formats.ts` — 1020 flat, 7x11, 5x5 insert, pint jar, cut ounce; area, density factor, trays per 48-inch shelf
- [x] `stage-schedule.ts` — soak, sow, germination, blackout, light, harvest window, packed; watering method and frequency, labor basis (sowing, tray-day, unit), control point, grow-unit occupancy; the sprout schedule; `cycleDays`, `daysToHarvest`, `wateringsOverCycle`
- [x] `inputs-catalog.ts` — media (cocopeat default, jute, hemp, vermiculite, peat blend, hydro pad, none) with traits and rows; nutrient solutions with EC and pH targets and elicitation; fixtures (Vallecito's Mars Hydro VG80, Barrina T5, a tunable red-blue-far-red fixture not yet bought) with what each delivers; light regimes (yield, balanced 5:1, nutrition-forward blue, biofortify far-red, continuous); `dailyLightIntegral`, `fixtureDelivers`, `lightCostPerTrayDay`
- [x] `science-library.ts` — 75 rows (document A 1–56, program sources 57–60, document B 61–75), `DOCUMENT_ROWS` mapping each document's own numbering, `rowFor`, 60 claims by topic, `claimsForVariety`; merged into `sources-registry.ts` so the sources test enforces it
- [x] `glossary.ts` — generated from `glossary.md` tiers 1 and 2 (117 entries); tier 3 is internal and is not generated

## Part 2 — Grow plan replaces crop plan

- [ ] In `_data/plan-data.ts`, `CropPlanDef` becomes the grow plan: `format` (a `TrayFormatKey`); `lines` typed by kind — `seed` with `varietyKey`, grams per tray and share of a mixed tray; `medium` with `MediumKey`; `nutrient` with `NutrientKey`, ml/L and the stage it starts; `light` with `LightRegimeKey`, an optional PPFD override and the stage it starts; `stageDays` overriding the variety's
- [ ] Drop `isHotComponent`, `component`, `nutrition` (NSLP), `unitMassOz`, `trimYield`, `blackoutYield`
- [ ] `farm.crop_plans` / `crop_plan_lines` store the same shape as JSON: migration `0003`, `crop-plan-library.ts`, `recipe-rows` equivalents, `_lib/crop-plans.ts` and the actions follow

## Part 3 — Costing on the four line kinds

- [ ] `_engine/index.ts` `costCropPlan`, `sowingCosting`, `costPerUnit`, `costToServe`: seed at the variety's rolling cost per lb times grams sown; medium at price per tray; nutrients at ml/L times liters over the cycle times price; light via `lightCostPerTrayDay` times light-stage days; over the format's units; plus consumables and labor
- [ ] The yield chain is seed weight → sown → harvested → packed; the AP/EP/cooked/plated chain and its rates go
- [ ] Rolling seed cost from receipts replaces the variety's opening price once receipts exist (`input-price.ts`)

## Part 4 — Capacity in trays and cycle days

- [ ] `deriveCapacity`, `sowingBounds`: a sowing is what one grow unit takes in trays of the format (`perShelf48in` times shelves); occupancy is `cycleDays`, not minutes; the daily ceiling is trays across grow units over cycle days
- [ ] `equipment.ts` `SowingGrowUnit` gains trays per unit by format and a fixture key; `capacityInputs` loses the blackout-rack cycle inputs; `capex.ts` equipment becomes racks, shelves, fixtures and jar stands from Vallecito's capex

## Part 5 — The daily labor stream

- [ ] `_data/time-studies.ts`, `_engine/time-studies.ts`, `staff-demand.ts`: a third stream `daily` (per tray per day) beside `sowing` and `harvest`
- [ ] The estimated study seeded from Vallecito's 27-minute 1020 study (prep, sow, watering per day, harvest and pack) in `_inventory/raw-extracts/…Time_Study.txt`

## Part 6 — Stages replace thermal

- [ ] `_data/grow-stages.ts` and `_engine/stage.ts` replaced by `stage-schedule.ts`; `routing.ts` routes are the stage schedule per plan
- [ ] `scheduler.ts` places sowings on grow units for `cycleDays` with the light line matched by `fixtureDelivers`
- [ ] `production-plan.ts` `productionDateFor` becomes distribution date minus `daysToHarvest`; `forecast-timeline.ts` follows

## Part 7 — Nutrition targets replace crediting

- [ ] `_engine/nutrition.ts`, `_data/nutrient-profile.ts` and the Flat Builder: a subscriber's named targets scored against `varieties.ts` profiles, every shown benefit citing its row; `claimsForVariety` behind it

## Part 8 — Produce safety

- [ ] `_engine/produce-safety.ts` and `plan-data.ts` `controlPoints`: the stage control points from `stage-schedule.ts` (seed sanitation, spent-water test for sprouts, temperature and humidity, harvest check) replace the thermal CCPs

## Part 9 — Seeds

- [ ] `crop-plans-seed.ts` becomes one single-variety grow plan per variety (12) plus two or three mixed trays composed to targets
- [ ] `sources-registry.ts` drops the USDA school-meal rows; `nslpReimbursementBenchmark` and the NSLP constants go
- [ ] `servings` dropped: a sowing's output is one count in its format

## Part 10 — UI and the rename

- [ ] The Crop Plans editor becomes the Grow Plan editor with four line kinds and the variety's light and media notes beside the light and medium lines
- [ ] A Varieties page; a Glossary page in the subscriber portal (tiers 1 and 2); the Grow Calendar
- [ ] The rename: crop plan → grow plan, input → the line kinds, by the same approach as Phase 1a; `outline.md` §3 and the vocabulary guard's allowlist updated (it still allows the kitchen-data files until here)
- [ ] `glossary.ts` regeneration made a script (`pnpm farm:glossary`) instead of a session snippet
