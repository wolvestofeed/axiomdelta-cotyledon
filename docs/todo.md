# To do

Open one-off items that belong to no phase step. An item is deleted when done, not ticked.

## Needs Rob

- The app runs on localhost against Neon: the connection string is in `.env` and `.env.local`, migrations `0001` to `0008` are applied, Clerk is off for local development (`FARM_DEV_BYPASS_AUTH=1`). `pnpm dev` from the repo root, then `http://localhost:3000/farm`. Nothing is pushed to GitHub yet; push when you decide to.
- Brand name and domain for the software (working title MicroFarm). The facility trades as Axiom Delta Wellness Center.
- Default Phase 1 unit: 1020 flat or large tray. Vallecito households mostly bought large trays.
- Sprouts in or out of the first menu, pending the FSMA Subpart M check for Texas.
- The variety records carry PLACEHOLDER harvest weights until closed sowings observe them; if Vallecito harvest weights exist anywhere, they replace the placeholders as DATED.
- The restaurant channel price ($15) is a placeholder; the subscription ($20) and retail ($25) prices per 1020 flat are Vallecito's (DATED).
- The grow-room temperature and humidity band for the temperature-and-humidity control point: readings are recorded and none is judged until the produce safety plan states the band.
- The labor rate is the $29.28/h placeholder loaded wage until Staffing's rates arrive; a live 1020 flat carries 21 minutes on the three streams from your 2023 study.

- Phase 1-era content still on live pages, waiting on your call (remove, or rebuild in its own phase): Produce Safety's control-point-2 cooling log card, its "Blackout lots with every load recorded" and "Failed stage records" KPIs and the "Coverage and the unstaffed window" card; Sustainability Inputs' "What-if: beef quantity" card and the kitchen food map in `emission-factors.ts` (the microgreens factors are Phase 5); Training's placeholder courses ("control-point-2 Two-Stage Cooling", "Allergen Changeover & Segregation", "sow-blackout Fundamentals").

## Code

- The first load of a page after a restart seeds every library on first read against a cold Neon branch and can take 20 to 35 seconds; later loads take a few seconds. Trim by seeding once at workspace creation instead of on each first read.
- pg warns on every page that `client.query()` is called while a query is executing: the workspace transaction is one client and pages fire their reads in parallel on it. The queries still queue and complete; pg 9 drops the queueing. Serialize reads inside a scope (a promise chain on the scope's handle) before upgrading pg.
- Lint: three react-hooks errors carried from the source, `OmniSearch.tsx`, `ProspectsCRM.tsx`, `useLinkedEntities.ts`; fix when those files are touched.
- Nested async server components rendered as JSX elements lose the workspace scope; only the dashboard does it today, by calling them as functions. Add a structural check if the pattern spreads.
- The Muse-era topic build plans in `roadmaps/` describe kitchen builds; re-base or delete each in the phase that touches its module.

## Across the products

- One client across bodywork, microgreens and Feed The Wolf: shared Clerk identity, shared email, or a wellness-center client record the products reference. Not a MicroFarm build item until the products need to share it.
