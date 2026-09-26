# Next session — where Phase 2 stands and what to do first

Read `CLAUDE.md`, then `docs/outline.md` (§4 domain model, §5 engine rules, §8 phases), then `docs/glossary.md` tier 3 and this file. This file is replaced at the end of every session; it never accumulates.

## State of the repo

Commits on `main`: outline and rules → Phase 0 lift → Phase 1a vocabulary swap → science library, glossary and the grow-plan decision → Phase 1b tenancy → Phase 2 data foundations (this session).

Green: typecheck clean, 938 tests across 61 files, production build compiles every route. Lint carries three react-hooks errors from the Muse source (`OmniSearch.tsx`, `ProspectsCRM.tsx`, `useLinkedEntities.ts`).

Not yet run anywhere: the app against a real database. Rob still has to create the Clerk organization and the Neon database and put the keys in `apps/web/.env.local` and `.env` (README has the steps). Migrations `0001` and `0002` have never been applied to a live database, so the first `pnpm db:migrate` is itself a test.

## What Phase 2 has so far (data foundations, additive, not yet wired into the engine)

All under `apps/web/src/app/(farm)/farm/_data/`, all tested by `test/farm-varieties.test.ts`:

- `varieties.ts` — the 12 Vallecito varieties as the master records: supplier and provenance, seed price per lb (DATED, True Leaf 5 lb tier Jan 2024), grams per 1020 (STATED, what Vallecito sowed), soak hours, stage days, harvest grams (PLACEHOLDER), flavor and color, light response, media response, nutrient profile with benefits citing science-library rows, glossary links.
- `tray-formats.ts` — 1020 flat, 7x11, 5x5 insert, pint jar, cut ounce; area, density factor, trays per 48-inch shelf.
- `stage-schedule.ts` — soak, sow, germination, blackout, light, harvest window, packed; watering method and frequency, labor basis (sowing, tray-day, unit), control point, grow-unit occupancy; sprout schedule; `cycleDays`, `daysToHarvest`, `wateringsOverCycle`.
- `inputs-catalog.ts` — growing media (cocopeat default, jute, hemp, vermiculite, peat blend, hydro pad, none) with traits and rows; nutrient solutions with EC and pH targets and elicitation; light fixtures (Vallecito's Mars Hydro VG80, Barrina T5, a tunable red-blue-far-red fixture not yet bought) with what each can deliver; light regimes (yield, balanced 5:1, nutrition-forward blue, biofortify far-red, continuous); `dailyLightIntegral`, `fixtureDelivers`, `lightCostPerTrayDay`.
- `science-library.ts` — 75 source rows (document A rows 1–56, program sources 57–60, document B rows 61–75), `DOCUMENT_ROWS` mapping each document's own numbering, `rowFor('B', n)`, 60 claims by topic, `claimsForVariety`. Merged into the Sources register through `sources-registry.ts`, so the sources test enforces it.
- `glossary.ts` — generated from `docs/glossary.md` tiers 1 and 2 (117 entries) by the Python snippet in the session; regenerate it the same way after editing the document. Tier 3 is internal and is not generated.

Documents: `docs/science-library.md` (register of record, rows 1–75, document B map, claims by topic, variety profiles, light and media responses), `docs/glossary.md` (three tiers), the two research `.docx` files under `docs/`.

## What Phase 2 still needs, in order

The old kitchen model is still what the engine runs on. The new data is beside it, not under it. The port is:

1. **Grow plan replaces crop plan.** In `_data/plan-data.ts`, `CropPlanDef` becomes the grow plan: `format` (a `TrayFormatKey`), `lines` typed by kind (`seed` with `varietyKey` and grams per tray and share; `medium` with `MediumKey`; `nutrient` with `NutrientKey`, ml/L and the stage it starts; `light` with `LightRegimeKey`, optional PPFD override and the stage it starts), and `stageDays` overriding the variety's. Drop `isHotComponent`, `component`, `nutrition` (NSLP), `unitMassOz`, `trimYield`, `blackoutYield`. The DB rows in `farm.crop_plans` / `crop_plan_lines` store the same shape as JSON, so this is a schema-content change plus a migration `0003`.
2. **Costing** (`_engine/index.ts` `costCropPlan`, `sowingCosting`, `costPerUnit`, `costToServe`): seed at the variety's rolling cost per lb times grams sown, medium at price per tray, nutrients at ml/L times liters over the cycle times price, light via `lightCostPerTrayDay` times light-stage days, over the format's units, plus consumables and labor. The yield chain is seed weight → sown → harvested → packed. Remove the AP/EP/cooked/plated chain.
3. **Capacity** (`deriveCapacity`, `sowingBounds`): a sowing is what one grow unit takes in trays of the format (`perShelf48in` times shelves); occupancy is `cycleDays`, not minutes; daily ceiling is trays across grow units over cycle days. `equipment.ts` `SowingGrowUnit` gains `traysPerUnit` by format and a `fixture` key; `capacityInputs` loses the blackout-rack cycle inputs.
4. **Labor** (`_data/time-studies.ts`, `_engine/time-studies.ts`, `staff-demand.ts`): a third stream `daily` (per tray per day) beside `sowing` and `harvest`; seed the estimated study from Vallecito's 27-minute 1020 study (prep, sow, watering per day, harvest and pack) in `_inventory/raw-extracts/…Time_Study.txt`.
5. **Stages replace thermal** (`_data/grow-stages.ts`, `_engine/stage.ts`, `routing.ts`, `scheduler.ts`): routes are the stage schedule per plan; scheduler places sowings on grow units for `cycleDays` with the light line matched by `fixtureDelivers`; `production-plan.ts` `productionDateFor` becomes distribution date minus `daysToHarvest`; `forecast-timeline.ts` follows.
6. **Nutrition targets replace crediting** (`_engine/nutrition.ts`, `_data/nutrient-profile.ts`, the Flat Builder): a subscriber's named targets scored against `varieties.ts` profiles, every shown benefit citing its row.
7. **Produce safety** (`_engine/produce-safety.ts`, `plan-data.ts` `controlPoints`): the stage control points from `stage-schedule.ts` (seed sanitation, spent-water test for sprouts, temperature and humidity, harvest check) replace the thermal CCPs.
8. **Seed data**: `crop-plans-seed.ts` becomes one single-variety grow plan per variety (12) plus two or three mixed trays; `capex.ts` equipment becomes racks, shelves, fixtures and jar stands from Vallecito's capex; `sources-registry.ts` drops the USDA school-meal rows.
9. **UI**: Crop Plans editor becomes the Grow Plan editor with four line kinds and the variety's light and media notes beside the light and medium lines; a Varieties page; a Glossary page in the subscriber portal; Grow Calendar.
10. **Rename** crop plan → grow plan, input → line kinds, through the same swap approach as Phase 1a, and update `docs/outline.md` §3 and the vocabulary guard's allowlist (it still allows `plan-data.ts`, `crop-plans-seed.ts`, `nutrient-profile.ts`, `grow-stages.ts`, `nutrition.ts`, `produce-safety.ts` and the fixtures because they hold kitchen data until this work replaces it).

Each step keeps the suite green; tests tied to the kitchen model (`farm-engine`, `farm-crediting`, `farm-routing`, `farm-scheduler`, `farm-menu-seed`, `farm-conformance`, `farm-production-plan`, `farm-forecast-timeline`) are rewritten as the model they test is replaced, not deleted.

## Rules that bit this session

- The dated-note stripper in the Phase 1 swap script used a regex that could span lines and once ate a line of code; anything like it must be single-line. The script is gone with the session scratchpad; the approach is described in the Phase 1a commit.
- Never `rm` with a shell variable in the path; use literal absolute paths.
- Rob's research and the seed supplier's summaries cover every variety; do not flag a variety as unsupported because one document lacks it. Supplier statements are grade S.
- Documents replace, they do not log. This file included.
