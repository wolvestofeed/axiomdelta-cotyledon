# MicroFarm — Master Roadmap

The one outline of every roadmap. Each software phase has its own file in `roadmaps/` with its steps and status; this file lists the phases, says where each stands, and links out. Status lives in the phase files and is summarized here; open one-off items live in [`todo.md`](todo.md). The business plan and the domain model are in [`outline.md`](outline.md).

Each phase ends with the app running on localhost and its tests green.

## Phases

| Phase | File | Status | Target |
|---|---|---|---|
| 0 — Lift | [`roadmaps/phase-0-lift.md`](roadmaps/phase-0-lift.md) | DONE, except the first run against a live database | — |
| 1 — Swap and tenancy | [`roadmaps/phase-1-swap-and-tenancy.md`](roadmaps/phase-1-swap-and-tenancy.md) | DONE | — |
| 2 — Growing domain | [`roadmaps/phase-2-growing-domain.md`](roadmaps/phase-2-growing-domain.md) | IN PROGRESS: parts 1–8 done (data, the grow plan, costing on four line kinds, capacity in trays, the daily labor stream, the grow calendar, nutrition targets, the stage control points and the sowing record); part 9 all but the blends; part 10's pages and its deep cut done: every module runs on plain grow plans, watering in fluid ounces and every other volume in gallons, the Nutrients & Supplements library, consumption on the Time Study with every study approved and averaged into the standard, and grow plan the only name in the database, the code and the docs. part 11, the books at actual cost, done: the Actual ledger at actual cost, cost of goods sold by element, a bill refused unless it matches, a version freezing only labor and overhead, a nutrient bought under the solution alone, the Media library, and the rolling 12-month average as a key figure. Part 12, R&D, done: blend is the one name for a tray of two or more varieties, the hemp mat is the default medium, the clinical and hemp research documents are registered; eleven of Rob's twelve blends are built as developing grow plans with the R&D Blends page (the twelfth waits on buckwheat), each read against a subscriber's or a chosen set of nutrition targets; experiments run on the grow units with the yield per variety read across them, are booked to Research and Development (7920), and a plan moves to in service on what they measured. Open: the watering shape by stage, the subscription cadence, the agentic assistant built fresh on grow plan lines. The phase file names the order | November 2026 |
| 3 — Subscriptions and distribution | [`roadmaps/phase-3-subscriptions-and-distribution.md`](roadmaps/phase-3-subscriptions-and-distribution.md) | NOT STARTED | December 2026 |
| 4 — Staffing | [`roadmaps/phase-4-staffing.md`](roadmaps/phase-4-staffing.md) | NOT STARTED | January 2027 |
| 5 — Facility and sustainability | [`roadmaps/phase-5-facility-and-sustainability.md`](roadmaps/phase-5-facility-and-sustainability.md) | NOT STARTED | spring 2027 for the home grow room |
| 6 — Software as a product | [`roadmaps/phase-6-software-as-a-product.md`](roadmaps/phase-6-software-as-a-product.md) | NOT STARTED | after the wellness center's facility runs on it |

## What each phase is

**Phase 0 — Lift.** The pnpm workspace; the Muse route groups, schema, migrations, tests, scripts and docs copied verbatim; CompTable removed; the app boots with the kitchen words still on screen.

**Phase 1 — Swap and tenancy.** The vocabulary of `outline.md` §3 applied to identifiers, schema, copy, tests, docs and seeds, with a test that fails on any surviving kitchen word; then one Clerk organization per farm, `workspace_id` on every table under row-level security, and every entry point in the workspace scope (`outline.md` §7).

**Phase 2 — Growing domain.** The variety as the master record and the cost basis; the grow plan with seed, medium, nutrient and light lines; the stage schedule with the daily watering stream replacing thermal processes; tray formats and grow units replacing vessels; nutrient profiles and nutrition targets replacing crediting, every benefit citing the science library; produce-safety control points; the science library on the Sources page and the glossary in the subscriber portal; Vallecito data seeded; the Grow Calendar; the books at actual cost; R&D, where blends are composed to targets and run as experiments before they go in service.

**Phase 3 — Subscriptions and distribution.** Stripe recurring billing, the Subscriber Portal and Flat Builder, Pickup Points and Routes, tray returns. What the facility needs to take its first paying subscriber.

**Phase 4 — Staffing.** Internal roster, wages, punches on the Grow Room clock, the schedule wired to the scheduler, pay periods closed as totals by account into the Actual ledger.

**Phase 5 — Facility and sustainability.** Grow-room layout by build phase, lighting and HVAC load, water, microgreens emission factors, the "acre-feet and fuels" comparison. First for the home grow room; sized up for a commercial facility when the center decides on one.

**Phase 6 — Software as a product.** Workspace onboarding, software plans and billing, marketing site, domain, deployment.

## Topic build plans ported from Muse

These came over with the code and describe the kitchen's builds of the scheduler, portals, facility, people, page headers and the rest. They are reference for how those modules were built, in the swapped vocabulary; each is re-based onto the growing domain in the phase that touches its module, and deleted if the module is rebuilt from the phase file instead.

- [`roadmaps/facility-design-roadmap.md`](roadmaps/facility-design-roadmap.md)
- [`roadmaps/operating-model-roadmap.md`](roadmaps/operating-model-roadmap.md)
- [`roadmaps/page-headers-roadmap.md`](roadmaps/page-headers-roadmap.md)
- [`roadmaps/people-roadmap.md`](roadmaps/people-roadmap.md)
- [`roadmaps/portals-roadmap.md`](roadmaps/portals-roadmap.md)
- [`roadmaps/portfolio-publication-roadmap.md`](roadmaps/portfolio-publication-roadmap.md)
- [`roadmaps/scheduler-roadmap.md`](roadmaps/scheduler-roadmap.md)
- [`roadmaps/tabbed-layout-roadmap.md`](roadmaps/tabbed-layout-roadmap.md)
- [`roadmaps/visual-quality-roadmap.md`](roadmaps/visual-quality-roadmap.md)

## How a session starts and ends

Start: read `CLAUDE.md`, `outline.md`, this file, then the phase file for the phase in progress, then `todo.md`. The phase file opens with how to start, where the work stands and what is next, in order, with the files each step touches; follow it. End: run typecheck and tests, update the phase file's step status and this file's status column, move anything one-off to `todo.md`, commit with Rob's approval.
