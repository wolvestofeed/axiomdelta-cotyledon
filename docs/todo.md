# To do

Open one-off items that belong to no phase step. An item is deleted when done, not ticked.

## Needs Rob

- The app runs on localhost against Neon: the connection string is in `.env` and `.env.local`, migrations `0001` to `0022` are applied and `0023` is written and waits for `pnpm db:migrate`, Clerk is off for local development (`FARM_DEV_BYPASS_AUTH=1`). `pnpm dev` from the repo root, then `http://localhost:3000/farm`.
- Six retired files need `git rm`, which a session cannot run: `src/data/subscription-cycles.ts`, `src/engine/services.ts`, `src/engine/flat-plans.ts`, `src/engine/participation.ts`, `src/components/FlatPlanForm.tsx`, `test/support/service-subscribers.ts`. Nothing imports them; typecheck fails only in them.
- The opening position and the payroll calendar (`src/data/working-capital.ts`): $200,000 opening equity, no loan, biweekly pay periods paid the Friday after, all PLACEHOLDER until you state them. The shrink allowance (3% of seed, medium and nutrient) and the end-of-day closedown (one person, 30 minutes) likewise.
- Brand name and domain for the software (working title MicroFarm). The facility trades as Axiom Delta Wellness Center.
- Default Phase 1 unit: 1020 flat or large tray. Vallecito households mostly bought large trays.
- Sprouts in or out of the first menu, pending the FSMA Subpart M check for Texas.
- The variety records carry PLACEHOLDER harvest weights until closed sowings observe them; if Vallecito harvest weights exist anywhere, they replace the placeholders as DATED.
- Supplier matching on Suppliers finds certified operations for a plan's lines by keywords, and the keywords on file are Phase 1-era (beef, beans, tortillas); a grow plan's seed, medium, nutrient and light lines have none, so every line matches nothing. Which words a seed or medium line should match on is yours to state.
- The Restaurants and Retail and wholesale prices per 1020 flat are a $30 placeholder; Subscriptions is $30, stated.
- The grow-room temperature and humidity band for the temperature-and-humidity control point: readings are recorded and none is judged until the produce safety plan states the band.
- The labor rate is the $29.28/h placeholder loaded wage until Staffing's rates arrive; a live 1020 flat carries 21 minutes on the three streams from your 2023 study.
- Quantities and prices for the home grow list on Equipment, Home: 25 rows sit at quantity 1 with no price.
- Whether the 1010 tray and the 12 oz and 16 oz mason jars become tray formats for costing (seed grams, harvest grams, trays a shelf) or stay equipment only. The formats today are the 1020 flat, the 7x11, the 5x5 insert and the pint jar.
- The incurred side of the tray wear and sanitizer a tray takes. The ledger applies them to work in process at their standard per tray (5195), but the forecast bills no trays and no sanitizer. Where each is billed (trays as equipment, sanitizer as a supply) is yours to state..
- The first real time study to approve: until one is, every plan runs on its estimated labor and the placeholder watering (mist 1 fl oz, bottom 14 fl oz per 1020).
- Allergens present and allergen-free claims on each grow plan, typed in the grow plan editor: blank on all 12 until stated.
- The first seed receipts: until one is recorded, each variety is priced at its record's opening price (True Leaf, January 2024), or a supplier's catalog price once one is linked on Procurement.
- Buckwheat for the Cardio-Lipid Shield (BLEND-07, held in R&D): its seed supplier, price per pound and grams per 1020, so it can join the seed library as a variety.
- Where Bootstrap Farmer's hemp mats (Paris TX, $241 for 140, no shipping) are grown and made: the origin the Phase 5 footprint of coir against a US-made hemp mat reads. A receipt date on the price makes it DATED.
- The Barrina T5's wattage: 20 W a tube by the fixture's name, PLACEHOLDER until you confirm it; three a shelf is stated.
- The energy rate the cost card prices light at is a code constant, $0.13/kWh (PLACEHOLDER, Austin Energy blended residential; Vallecito paid $0.1256). No page edits it; it can become a forecast input on the Home running costs panel when you want to state yours.

## Code

- The first load of a page after a restart seeds every library on first read against a cold Neon branch and can take 20 to 35 seconds; later loads take a few seconds. Trim by seeding once at workspace creation instead of on each first read.
- pg warns on every page that `client.query()` is called while a query is executing: the workspace transaction is one client and pages fire their reads in parallel on it. The queries still queue and complete; pg 9 drops the queueing. Serialize reads inside a scope (a promise chain on the scope's handle) before upgrading pg.
- The forecast simulation is slower on the grow model: three years of the seed book take about 5.7 s (`simulateForecast`), where the posting takes under 100 ms. The shelf ledger places every sowing day by day across its cycle; the Plan ledger and Calendar pages run a year of it in the browser. Profile `ShelfLedger.place` and `calendarFromSowings` when a page feels slow.
- Lint: three react-hooks errors carried from the source, `OmniSearch.tsx`, `ProspectsCRM.tsx`, `useLinkedEntities.ts`; fix when those files are touched.
- Nested async server components rendered as JSX elements lose the workspace scope; only the dashboard does it today, by calling them as functions. Add a structural check if the pattern spreads.
- The Muse-era topic build plans in `roadmaps/` describe kitchen builds; re-base or delete each in the phase that touches its module.
- The facility engine still carries the source client's kitchen rules, which no seed row now triggers: hood runs and canopy overhang, the dish machine within 5 ft of a floor drain, the two blackout-rack streams, drains placed by kettle and braising-pan names, the hot line and a la carte zones, the tumble chiller's clearances, the 34°F hold room and the 7- or 30-day shelf-life configurations (`facility.ts`, `facility-arrange.ts`, `facility-layout.ts`, `facility-design.ts`, `facility-conformance.ts`). Restate them for a grow facility when a commercial facility is designed.

## Across the products

- One client across bodywork, microgreens and Feed The Wolf: shared Clerk identity, shared email, or a wellness-center client record the products reference. Not a MicroFarm build item until the products need to share it.
