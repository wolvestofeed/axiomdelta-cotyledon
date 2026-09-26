# Phase 2 — Growing domain  status: IN PROGRESS (parts 1–6 and the seed of part 9 done)

The variety as the master record and the cost basis; the grow plan with seed, medium, nutrient and light lines replacing the crop plan; the stage schedule replacing thermal processes; tray formats and grow units replacing vessels; nutrition targets replacing crediting; produce-safety control points; the science library and the glossary in the app; Vallecito data seeded. `outline.md` §4 is the domain model, §5 the engine rules, `glossary.md` the naming authority, `science-library.md` the source register.

The library stores grow plans and the engine costs and sizes them on the grow model. The modules Phase 2 has not yet moved (the stage and routing code, the scheduler and production plan, crediting, produce safety, the carbon and agent modules) read a library plan through its projection (`_engine/grow-plan-bridge.ts`): one input line per grow line, one tray as the unit, every line rolling up into its variety. Each remaining part moves its module onto the grow plan and the projection goes with part 10. The kitchen-model tests (`farm-engine`, `farm-crediting`, `farm-routing`, `farm-scheduler`, `farm-menu-seed`, `farm-conformance`, `farm-production-plan`, `farm-forecast-timeline`) and the ten-unit menu they run on (`crop-plans-seed.ts`) stay as fixtures until the part that replaces their model rewrites them; the database never sees the menu.

## Part 1 — Data foundations  DONE (commit `026742c`)

All under `apps/web/src/app/(farm)/farm/_data/`, tested by `test/farm-varieties.test.ts`.

- [x] `varieties.ts` — the 12 Vallecito varieties as master records: supplier and provenance, seed price per lb (DATED, True Leaf 5 lb tier Jan 2024), grams per 1020 (STATED, what Vallecito sowed), soak hours, stage days, harvest grams (PLACEHOLDER), flavor and color, light response, media response, nutrient profile with benefits citing science-library rows, glossary links
- [x] `tray-formats.ts` — 1020 flat, 7x11, 5x5 insert, pint jar, cut ounce; area, density factor, trays per 48-inch shelf
- [x] `stage-schedule.ts` — soak, sow, germination, blackout, light, harvest window, packed; watering method and frequency, labor basis (sowing, tray-day, unit), control point, grow-unit occupancy; the sprout schedule; `cycleDays`, `daysToHarvest`, `wateringsOverCycle`
- [x] `inputs-catalog.ts` — media (cocopeat default, jute, hemp, vermiculite, peat blend, hydro pad, none) with traits and rows; nutrient solutions with EC and pH targets and elicitation; fixtures (Vallecito's Mars Hydro VG80, Barrina T5, a tunable red-blue-far-red fixture not yet bought) with what each delivers; light regimes (yield, balanced 5:1, nutrition-forward blue, biofortify far-red, continuous); `dailyLightIntegral`, `fixtureDelivers`, `lightCostPerTrayDay`
- [x] `science-library.ts` — 75 rows (document A 1–56, program sources 57–60, document B 61–75), `DOCUMENT_ROWS` mapping each document's own numbering, `rowFor`, 60 claims by topic, `claimsForVariety`; merged into `sources-registry.ts` so the sources test enforces it
- [x] `glossary.ts` — generated from `glossary.md` tiers 1 and 2 (117 entries); tier 3 is internal and is not generated

## Part 2 — Grow plan replaces crop plan  DONE

Tested by `test/farm-grow-plans.test.ts` and `test/farm-crop-plans.test.ts`.

- [x] `_data/grow-plan.ts` — `GrowPlanDef`: `format` (a `TrayFormatKey`), `lines` typed by kind (`seed` with `varietyKey`, grams per tray and share of a mixed tray; `medium` with `MediumKey` and a quantity or null for the catalog's; `nutrient` with `NutrientKey`, ml/L or null and the stage it starts; `light` with `LightRegimeKey`, a PPFD override or null and the stage it starts), `stageDays` overriding the varieties' (a mixed tray runs on the slowest variety at each stage), `note`; `singleVarietyPlan`, `seedLineFor`, `planStageDays`, `growPlanProblems`
- [x] The code: the lead variety's code and a serial (`BROC-01`), `MIX-NN` for a mixed tray; `code` on every variety, `code: 'TLM'` on the supplier; the customer SKU is the plan code and the format code (`unitSku`: `BROC-01-1020`) — `outline.md` §4
- [x] `farm.crop_plans` gains `format`, `stage_days`, `note` (migration `0003`); `crop_plan_lines.line` is the typed grow line; `crop-plan-library.ts` (`rowsToGrowPlan`, `rowsToCropPlan`, `cropPlanToRows`, `nextCropPlanCode` under a prefix), `_lib/crop-plans.ts`, `crop-plan-rows.ts`, the actions (zod on the four line kinds; a typed figure is STATED by the editor, null defers to the catalog or the record) and `seed-writes.ts` follow
- [x] The Phase 1-era fields (`isHotComponent`, `component`, `nutrition`, `unitMassOz`, `trimYield`, `blackoutYield`) exist only on the projection now; they leave with `plan-data.ts` in part 10

## Part 3 — Costing on the four line kinds  DONE

- [x] `_engine/grow-costing.ts` `costGrowPlan`: seed at the variety's price per lb (a receipt or what-if standing over it) times grams per tray; medium at the catalog quantity per 1020 scaled to the format, or the typed quantity, times price; nutrient at ml/L times the liters the tray takes from the stage it starts (`waterLitersFrom`, placeholder liters per watering in `stage-schedule.ts`) times price per ml; light via `lightCostPerTrayDay` on the facility's fixture (`fixtureFor`: the first that delivers the regime) at the variety's own intensity or the regime's, times the days under light from the stage it starts; consumables as the tray set over its uses plus sanitizer (Vallecito's 2023 figures on `tray-formats.ts` and `inputs-catalog.ts`)
- [x] `costCropPlan`, `sowingCosting`, `costPerUnit`, `costToServe` read the grow costing for a library plan: one tray is the unit, the seed lines carry the weight chain (seed grams → harvest grams, packed as harvested), the other lines cost and add no mass
- [x] The yield chain is seed weight → sown → harvested → packed on a live tray; the AP/EP/cooked/plated rates remain only on the projection
- [ ] Rolling seed cost from receipts replaces the variety's opening price once receipts exist (`input-price.ts` prices by line name today; the seed line's `varietyKey` is the hook)

## Part 4 — Capacity in trays and cycle days  DONE, except the removal of the Phase 1-era equipment

- [x] `_engine/grow-capacity.ts`: a grow unit is an equipment row with `shelves`, `shelfWidthIn` and `fixtureKey` (migration `0003`, open fields on Grow Units); a sowing is what one unit takes in trays of the format (`perShelf48in` scaled to the shelf, times shelves); a plan with a light line is placed only on a unit whose fixture delivers it; the sustained ceiling is trays across the units over `cycleDays`
- [x] `deriveCapacity` sizes a library plan on the grow units, never off mass; `CapacityProfile.grow` carries the sowing, the binding unit, the total trays, the cycle and the ceiling. The one-day figures the Phase 1-era production plan and staffing read (`cyclesPerDay`, the window) are a load per unit inside the operating day until part 6 places sowings on grow units for their cycle days
- [x] `capex.ts`: Vallecito's starter rack as bought (DATED, $1,058: 6-tier 24x48 shelving with five lit tiers under five Mars Hydro VG80, four fans, sixteen 1020 flat sets) seeds the grow room as the first grow unit; the rack carries no floor until Phase 5 lays the room out
- [ ] The Phase 1-era equipment rows (sprouting racks, blackout racks, walk-ins and the rest of the kitchen schedule) leave the seed in part 6, when the routing and the scheduler stop reading them and the facility goldens are restated to the grow room

## Part 5 — The daily labor stream  DONE

Tested by `test/farm-time-studies.test.ts`, `farm-staff-demand.test.ts`, `farm-time-study-estimate.test.ts` and `farm-grow-plans.test.ts`.

- [x] `_data/time-studies.ts`, `_engine/time-studies.ts`: a third stream `daily` beside `sowing` and `harvest`; a daily line's labor minutes are one day's minutes for the sowing studied (per tray per day when variable, once a day when fixed); a study records the `cycleDays` its daily lines multiply by (migration `0004`); `summarizeStudy` carries the daily stream into the minutes per unit; `unit-cost.ts` writes each plan's `laborSplit.dailyMinutesPerUnit` and `costPerUnit` and `laborForDay` read it
- [x] `staff-demand.ts`: the daily stream from the trays on the shelves; `traysOnShelf` derives the shelf from the sowings and each plan's cycle days (`cycleDaysByCode`); the Schedule page and the staff demand report pass it
- [x] Vallecito's 2023 1020 tray study (DATED) is the data: 18 minutes of growing labor and 9 of harvest per tray at one person; `growPlanTimeStudy` builds a grow plan's estimated study from it on the three streams, each daily task's total spread over the plan's cycle days, the knife harvest and the weigh left off a live tray (21 minutes a live 1020); the scaffold on the Time Study Sheet is the same
- [ ] The watering shape by stage (mist through germination and blackout, bottom water under light) is placed by the grow calendar in part 6; the total over the cycle is the sheet's

## Part 6 — Stages replace thermal  DONE for grow plans

Tested by `test/farm-grow-calendar.test.ts`.

- [x] `_engine/grow-calendar.ts`: `stageOn` reads the stage a tray is in on any day from the plan's stage days (soak before the sow date, then sow, germination, blackout, light, harvest window, off); `sowDateFor` is the distribution date less days to harvest, moved back to a production day; `ShelfLedger` places a sowing on a unit whose fixture delivers the plan's light line and which has room on every day of the cycle, largest unit first, and refuses one that does not fit; `calendarFromSowings` reads each day by stage, by unit, trays sown, trays in their harvest window and the waterings the daily stream owes; `planGrowCalendar` back-plans requirements
- [x] `production-plan.ts`: each order is made on its plan's sow date (a Phase 1-era plan the day before, as before); the horizon runs one shelf ledger across the window, `planProductionDay` places a grow plan's sowing through it instead of a rack cycle inside the day, a sowing with no room is a shortfall and the day does not fit; recorded sowings inside their cycle open the window on the shelves (`openingSowings`); `HorizonPlan.growCalendar` carries the calendar; `forecast-timeline.ts` follows through the horizon
- [x] `routing.ts`: a grow plan's route is its sow and harvest lines at the stations on no equipment, the daily lines left to the calendar; the day scheduler places it with no rack and no cooling clock
- [x] The Grow Calendar page (`production-planning/grow-calendar`): the month by trays on the shelves, sown, in the harvest window, waterings and trays with no room; a day by stage and by unit; the sowings across the month with their unit and today's stage
- [ ] `_data/grow-stages.ts` and `_engine/stage.ts` still serve the Phase 1-era plans through the projection; they go with the projection in part 10, when `deriveCapacity` also drops the one-day window
- [ ] The Phase 1-era equipment rows leave `capex.ts` in part 10 with the projection; the facility, equipment, scheduler and routing goldens are restated then

## Part 7 — Nutrition targets replace crediting  IN PROGRESS

- [x] `_data/nutrition-targets.ts`: the target catalog is the union of the nutrients and compounds on the variety records, each target with the varieties that carry it and `benefitsFor` the stated benefits that mention it, citing their rows; `_engine/nutrition-targets.ts` `scoreFlat` reports which targets a flat of plans covers, by which varieties on which plans with their benefits, and which library plans carry the rest, with `claimsForVariety` behind the portal's citations
- [ ] The subscriber carries `nutritionTargets` (a jsonb list on `farm.subscribers`, migration `0005`), read and written through the subscriber layer and actions
- [ ] The Flat Builder scores the flat against the subscriber's targets and cites the rows; its subscriber list stops excluding the subscriptions channel
- [ ] The Crop Plans page shows the plan's nutrient profile and the targets it carries in place of the Phase 1-era unit spec; `nutrition.ts` and `nutrient-profile.ts` go with the projection in part 10
- [ ] Two or three mixed trays composed to targets join the seed (`grow-plans-seed.ts`)
- [ ] Tests for the catalog and the score

## Part 8 — Produce safety  IN PROGRESS

- [x] `_data/produce-safety.ts`: the four stage control points (seed sanitation, spent sprout irrigation water test, temperature and humidity, harvest check) with hazard, critical limit, monitoring, corrective action, verification and record; the sprout limits SOURCED to 21 CFR Part 112 Subpart M, the grow-room band PLACEHOLDER until the produce safety plan states it
- [ ] Register the FSMA Produce Safety Rule (21 CFR Part 112) on `sources-registry.ts` under the key `fda:fsma-produce-safety-rule` the control points cite; the sources test enforces it
- [ ] `_engine/produce-safety.ts`: `controlPointsForPlan` (the points along a plan's stages), `evaluateSpentWaterTest`; the Produce Safety page shows the stage control points and, per plan, which apply; the thermal CCPs and `evaluateCcp2` stay for the Phase 1-era sowing records until the sowing record is re-based in part 10

## Part 9 — Seeds

- [x] `grow-plans-seed.ts`: one single-variety grow plan per variety (12), built from the variety records so every figure carries the record's tag; microgreens on the 1020 flat, sprouts in the pint jar; the library seeds from it on first read
- [ ] `sources-registry.ts` drops the USDA school-meal rows; `nslpReimbursementBenchmark` and the NSLP constants go (with part 7)
- [ ] `servings` dropped: a sowing's output is one count in its format
- [ ] `subscription-cycles.ts`: the seeded cycles are the Phase 1-era ten-day menus and fall back to five days of the first In Service plan; the subscription cadence replaces them in Phase 3

## Part 10 — UI and the rename

- [x] The Crop Plans editor is the grow plan editor: four line kinds, the code following the lead variety, the live cost per tray, the variety's light and media notes beside the light and medium lines; the Crop Plans page shows the grow plan card (lines by kind with cost, seed and harvest grams, cycle, water, the sowing in trays, the ceiling, the unit SKU) above the Phase 1-era detail
- [ ] The rest of the Crop Plans page, Capacity, Unit Economics and Grow Units re-framed on the grow model; a Varieties page; a Glossary page in the subscriber portal (tiers 1 and 2); the Grow Calendar
- [ ] The rename: crop plan → grow plan, input → the line kinds, by the same approach as Phase 1a; `plan-data.ts` and the projection go; `outline.md` §3 and the vocabulary guard's allowlist updated (it still allows the kitchen-data files until here)
- [ ] The agentic assistant re-based onto grow plan lines (its "save variant" is refused by validation until then, `todo.md`)
- [ ] `glossary.ts` regeneration made a script (`pnpm farm:glossary`) instead of a session snippet
