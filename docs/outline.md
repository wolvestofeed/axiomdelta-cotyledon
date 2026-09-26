# MicroFarm — Outline of Record

Working title: **MicroFarm**. The microgreens and sprouts production operating system of Axiom Delta Wellness Center, and a product other farmers subscribe to. This document is the whole plan. When something changes, the old text is replaced here.

---

## 1. The business and where MicroFarm sits

**Axiom Delta Wellness Center** is one business operation, Robert Bogatin's (Joshin's), with one client base. A client may at once be a bodywork client, a microgreens subscriber and a Feed The Wolf subscriber.

| Name | Role |
|---|---|
| Axiom Delta Wellness Center | The business and Rob's personal practice |
| Wolves To Feed | Marketing website for Rob's whole coaching practice |
| Feed The Wolf | Rob's own digital coaching platform: ancient wisdom and his collected work in a library, delivered as an online digital sequencing platform |
| AxiomDelta Coaching Engine | The product other coaches license and subscribe to for their own businesses |
| MicroFarm | The production OS for the microgreens and sprouts facility, and a product other farmers subscribe to |

MicroFarm is two things at once:

1. **The facility.** The wellness center's microgreens and sprouts production, the successor to Vallecito Micro Farm (Bayfield CO, 2023–24). It sells live flats and trays, still growing, to subscribers who water and harvest them at home, each composed for the subscriber's own nutritional needs and performance objectives. It runs from Rob's South Austin home until the center is operating well enough to take a commercial facility.
2. **The software.** The operating system that runs the facility, ported from Muse Kitchen · Impact OS (a commissary-kitchen OS Rob built inside Comptable, Sept 2026) with the kitchen vocabulary replaced by growing vocabulary. Multi-tenant from the start. The wellness center's facility is tenant zero.

Bodywork, coaching, the library and sequencing live in the other products. MicroFarm holds a subscriber's nutrition targets for their flats and nothing else about them as a client of the center.

## 2. Locked decisions

- **Repo:** this folder, `WTF Publishing/Micro Farm`. Its own repo, its own Clerk app, its own Neon database. Developed on localhost until a domain is registered.
- **Source:** everything in Muse comes over: the `(muse)` route groups, `_engine`, `_lib`, `_data`, `_components`, `_state`, the `muse` schema and its 37 migrations, the 59 tests, the `muse:*` scripts, `docs/muse/`, and the `packages/ledger` package. Nothing else from Comptable.
- **Vocabulary:** a full swap, §3. Code, schema, copy, tests, docs, seeds.
- **No CompTable connection.** The HR contract, signed notices and transport are dropped. Staffing is an internal module (§6, People).
- **Scheduler ↔ Staffing.** The production scheduler reads the internal staff roster and schedule and reports coverage against the plan's labor demand on the Staffing page.
- **Coaching and bodywork live outside MicroFarm** (Feed The Wolf, the AxiomDelta Coaching Engine, and whatever books in-person sessions). MicroFarm holds a subscriber's nutrition targets, nothing more about them.
- **Multi-tenant:** every farm is a workspace. Built in from the port, not retrofitted.
- **Subscriptions:** Stripe recurring billing is a first-class module, bi-weekly and monthly cadences.
- **Documents replace, they do not log** (CLAUDE.md §1).
- **The practice's phases:** home-based microgreens for individuals now; massage school Oct/Nov 2026 to a Texas LMT license Apr/May 2027; massage therapy from summer 2027, still from the house; a commercial facility only when the center is operating well. Only the production facility is in MicroFarm's scope.

## 3. Vocabulary swap (the only authority)

| Muse | MicroFarm | Note |
|---|---|---|
| Muse Kitchen · Impact OS, Muse, the OS | MicroFarm | Origin may be cited in docs only |
| kitchen, commissary | farm, grow room | |
| recipe | crop plan | One per variety, or a blend of varieties |
| recipe code | crop code | |
| ingredient line | input line | Seed, medium, nutrient, water |
| component (served) | variety | The unit of sowing, lot coding and nutrient profiling inside a blend |
| portion, meal | unit | A unit is a flat, tray, insert, jar or cut ounce; the format is a property of the crop plan |
| batchPortions | batchUnits | |
| batch | sowing | A sowing record is one sow of one crop plan = one lot |
| cook, cook day | sow, sow day | |
| cooked | germinated | |
| blast chill, chill | blackout | Stage rename only; see §4 stages |
| chilled mass | canopy mass | Harvestable mass at end of light stage |
| plated, plated weight | packed, packed weight | Live: flat count and mass; cut: ounces |
| hold life | shelf life | Live flats: harvest window in days; cut: cold life |
| AP (as purchased) | seed weight | Purchased seed and medium |
| EP (edible portion) | sown weight | After soak and sort |
| yieldToCooked | yieldToHarvest | |
| vessel (cabinet, kettle, skillet, combi) | grow unit (shelf, rack, sprouting rack, jar stand) | |
| cabinet loads | rack loads | |
| CCP, cooling record | control point, stage record | Seed sanitation, spent-water test, temperature and humidity |
| thermal processes | grow stages | |
| batch stream | sowing stream | Per sowing on the sow day |
| dispatch stream | harvest stream | Per unit on the distribution day |
| delivery day, delivery | distribution day, distribution | Pickup or delivery |
| delivery site, site | pickup point | A subscriber's address or a shared pickup location |
| school lunches, corporate catering, ghost kitchen | subscriptions, restaurants, retail & wholesale | The three channels, added in that order |
| menu cycle | subscription cycle | |
| meal plan | flat plan | A subscriber's standing composition |
| meal pattern, crediting, grade group | nutrient profile, nutrition targets | See §4 |
| Floor | Grow Room | Operator surface |
| Sites & Delivery | Pickup Points & Routes | |
| Customer Portal, Order Builder | Subscriber Portal, Flat Builder | |
| Parent Portal, Parent Admin | (removed) | |
| Sales Portal, CRM, Customers, Orders | Sales Portal, Prospects, Subscribers, Orders | |
| ERRA rating, mark | (removed) | |
| CompTable contract, punches document, staff demand document | (removed) | Staffing is internal |
| HR | Staffing | Roster, wages, schedule, punches, pay periods |
| kitchen-local day (America/Chicago) | farm-local day (workspace time zone) | |
| Training | SOPs & Training | |
| culinary-operations.md | grow-operations.md | |
| accounting-policy.md | accounting-policy.md | Kept; nouns swapped |

Words that must not survive the swap anywhere but this table: recipe, portion, meal, cook, chill, kettle, cabinet, skillet, combi, plated, kitchen, commissary, school, parent, lunch, catering, ERRA, CompTable.

## 4. Domain model

**Variety.** Seed variety with its supplier item, seeding density per tray format, soak / weight / blackout / light days, expected yield, and its nutrient profile (the Vallecito Nutrients Master, ~70 nutrients × significant / moderate / low). Vallecito's 13 varieties seed the library.

**Tray format.** 1020 flat, 7x11 large tray, 5x5 insert, pint jar, cut ounce. A crop plan names its format; a format names its grow-unit footprint (four 1020s per 48" shelf, per On The Grow).

**Crop plan.** One variety or a blend. Input lines (seed, medium, nutrient), batchUnits, format, channels it serves, and the stage schedule. A blend carries a per-variety split so each variety is its own lot and nutrient contribution.

**Grow stages.** Soak → sow → weighted germination → blackout → light → harvest window → packed. Each stage has days, a control point where one exists (seed sanitation before soak; spent-water test for sprouts; temperature and humidity during germination and light), and a stage record. This replaces Muse's thermal model end to end.

**Grow unit.** Shelf, rack, sprouting rack, jar stand, with capacity in units per format, lighting watts, and a build phase. A sowing is what one grow unit takes; a second unit is a parallel stream.

**Sowing.** The batch. One crop plan, one sow day, one lot per variety, rack loads, stage records, mass balance (seed issued + water gain − stage loss − scrap = packed), crew hours. Only a closed sowing posts journals.

**Subscriber.** A customer with pickup points, a cadence (bi-weekly or monthly), payment terms via Stripe, nutrition targets, and a flat plan (standing composition of crop plans and formats). Restaurants and retail/wholesale customers are the same object on a different channel without nutrition targets.

**Nutrition targets.** Per subscriber: named targets (iron, protein, sulforaphane, vitamin K, folate, omega-3, fiber, …). The Flat Builder scores a flat plan against the targets from the variety nutrient profiles. This is the replacement for meal-pattern crediting and the reason the facility exists.

**Order.** From a subscription cycle, derived on read until confirmed; confirmed and distributed orders are rows. Distribution is pickup or delivery on a distribution day; live flats carry a tray-return expectation.

**Workspace.** A farm. Every table carries a workspace id. The wellness center's facility is one row.

## 5. Engine rules (ported, restated for growing)

1. **A sowing is derived from grow-unit capacity, never typed.** One shelf or rack bounds the units of a format; a second grow unit is a parallel stream the production plan places as its own sowing.
2. **The sowing is the costing basis.** Seed and medium at the derived sowing → yield chain (seed → sown → harvested → packed) → unit cost. Cost to serve adds harvest labor, packaging and distribution, never storage.
3. **Labor is fixed per sowing plus variable per unit, on two streams.** Prep, sow and daily watering count per sowing on the sowing stream; harvest, pack and hand-off count per unit on the harvest stream on the distribution day. Time studies per crop plan; estimated until observed. Vallecito's 27-minute 1020 study is the first seed.
4. **Whole sowings only.** Overshoot is inventory inside the harvest window and waste after it; live flats not distributed become cut product, then waste.
5. **Every dollar is computed from tagged reference data.** Provenance tags on every figure.
6. **Only the harvest record posts journals.** Plan ledger and Actual ledger are separate worlds. A sowing that does not mass-balance does not close. One sow = one lot per variety.
7. **US GAAP ASC 330 perpetual inventory at standard cost.** Fixed overhead absorbed on normal capacity; distribution is a period cost. `docs/accounting-policy.md` is the authority, ported with nouns swapped.
8. **Capacity is a property of the grow room; labor is a requirement of the plan.** The plan emits staff-hours by interval; the internal roster is a proposed answer; a gap is a finding on the Staffing page.
9. **Plan of record, forecasts, working copy, Plan v Actual** keep their meaning and the forecast bar.
10. **No advice, no icons, headers by the rule, every source registered.**

## 6. Module map

Status per module is kept in `nav.ts`, not here. Legend: **port** = comes over with the swap; **swap** = comes over with a domain change; **new** = built here; **drop** = not ported.

| Section | Module | Plan |
|---|---|---|
| Overview | Dashboard, Reports, Sources | port |
| Production | Crop Plans | swap (from Recipes) |
| | Time Studies | port |
| | Production Planning, Sow Schedule, Compare, Calendar, Process | port (stages replace thermal in Process) |
| | Grow Calendar | new: stages per sowing across days, back-planned from distribution days |
| | Capacity, Grow Units, Packaging | port (Grow Units from Equipment) |
| | Grow Room | swap (from Floor): punch clock, stage records, sowing close |
| Financials (admin) | Unit Economics, P&L, Balance Sheet, Cash Flow, Ledger, Plan v Actual, Actuals, Receivables, Payables, Capital & Financing | port |
| Inventory & Quality | Inventory (FIFO seed and medium lots, flats by sow date) | port |
| | Produce Safety | swap (from Food Safety): Produce Safety Rule, sprouts Subpart M, lot traceability |
| Supply Chain | Procurement, Suppliers | port; seed directory rebuilt for seed and media suppliers |
| Sustainability | Inventory & Audit, Facility, Energy, Refrigerants, Equipment & Rebates, Inputs (Scope 3), Supplier LCA, Logistics, Waste, Water | port; emission factors gain microgreens rows; refrigerants stays for cold storage |
| People | Staffing | new, replacing HR and the CompTable contract: roster, work roles, wages, punches, schedule, pay periods closed internally as totals by account |
| | Schedule | port; reads the internal roster |
| | SOPs & Training | port |
| Sales | Sales Portal, Prospects, Subscribers, Orders | port |
| | Subscriptions | new: cadence, Stripe recurring billing, pause/skip, cycle → orders |
| | Nutrition Targets | new: per-subscriber targets scored against variety profiles |
| Distribution | Pickup Points & Routes | swap (from Sites & Delivery): pickup points, delivery routes, tray returns |
| Subscriber portal | Subscriber Portal, Flat Builder | swap (from Customer Portal, Order Builder) |
| Supplier portal | Supplier Portal | port |
| Parent portal | — | drop |
| Workspace | Workspace admin, members, plan and billing for the software | new |

## 7. Tenancy

Muse is single-tenant: no workspace id, guards scoped to one account, one time zone constant. MicroFarm adds `workspace_id` to every table in the port, a `workspaces` table (name, time zone, Stripe customer for the software subscription, plan), Clerk organizations mapped to workspaces, and `requireWorkspaceOperator()` / `requireWorkspaceAdmin()` in place of the Muse guards. Seed data is written per workspace. Tenancy is done in the port (Phase 1 below), because retrofitting it later would touch every read and action twice.

## 8. Software build phases

Each phase ends with the app running on localhost and its tests green. Dates are targets against the business phases.

**Phase 0 — Lift.** Scaffold the pnpm workspace (`apps/web`, `packages/db`, `packages/ledger`). Copy the Muse route groups, schema, migrations, tests, scripts and docs verbatim. New Clerk app, new Neon database. Remove every `@ct/*` import that is not the ledger, the CompTable contract, signing, transport, the Parent portal and ERRA. Boots on localhost with kitchen words still on screen. Target: early October 2026.

**Phase 1 — Swap and tenancy.** Apply §3 to identifiers, schema (one consolidated migration set, no history to preserve), copy, tests, docs, seeds. Add workspaces and the guards (§7). A test fails on any surviving kitchen word. Target: October 2026.

**Phase 2 — Growing domain.** Grow stages replace thermal processes; tray formats and grow units replace vessels; variety library, nutrient profiles and Nutrition Targets replace crediting; Produce Safety replaces Food Safety; Vallecito data seeded as `STATED` / `DATED` (varieties, densities, time study, costs, rack capex, nutrient matrix). Grow Calendar. Target: November 2026.

**Phase 3 — Subscriptions and distribution.** Subscriptions module on Stripe, Subscriber Portal and Flat Builder, Pickup Points & Routes, tray returns. This is what the facility needs to take its first paying subscriber. Target: December 2026.

**Phase 4 — Staffing.** Internal roster, wages, punches (Grow Room clock), schedule wired to the scheduler, pay periods closed as totals by account into the Actual ledger. Target: January 2027.

**Phase 5 — Facility and sustainability.** Grow-room layout by build phase, lighting and HVAC load, water, microgreens emission factors, the "acre-feet and fuels" comparison. First for the home grow room; sized up for a commercial facility when the center decides on one. Target: spring 2027 for the home room.

**Phase 6 — Software as a product.** Workspace onboarding, software plans and billing, marketing site, domain, deployment. Target: after the wellness center's facility is running on it.

## 9. Repo structure

```
Micro Farm/
├── CLAUDE.md                 rules
├── docs/
│   ├── outline.md            this document
│   ├── accounting-policy.md  ported, nouns swapped
│   ├── grow-operations.md    stages, control points, produce safety (replaces culinary-operations.md)
│   ├── roadmap.md            phase status only, one line per step
│   └── roadmaps/             one build plan per topic, ported and swapped
├── apps/web/                 Next.js app: (farm) OS, (grow-room), (subscriber), (supplier), (sales), (front)
├── packages/db/              schema + hand-written SQL migrations
├── packages/ledger/          ledger engine, ported
└── _inventory/               temporary survey; delete once consumed
```

## 10. The practice — plan in brief

Everything runs from Rob's house until Axiom Delta Wellness Center is operating well enough to take a commercial facility. No date is set for that.

**Now.** Microgreens and sprouts grown for individuals by nutritional need and performance objective, after a short intake. Live 1020 flats, large trays and 5x5 inserts, plus pint-jar sprouts once Texas rules are confirmed. Subscribers on a bi-weekly or monthly cadence; pickup at the house or a central pickup point, a delivery route once density allows. First pool: the Austin men's group, neighbors, Feed The Wolf subscribers, then restaurants. Pricing starts from Vallecito's $25 retail / $20 subscription per 1020 flat against a ~$11.40 cost of which ~$9 was labor; live uncut flats remove most harvest labor. Capacity: home racks at ~$1,058 per 6-tier rack. Coaching in meditation, Ayurveda and nutrition may be added as it grows, on Feed The Wolf.

**Oct/Nov 2026 to Apr/May 2027.** Massage school toward a Texas LMT license, while the microgreens program runs.

**Summer 2027.** Massage therapy begins as Rob's in-person practice, from the house. Bodywork clients, microgreens subscribers and Feed The Wolf subscribers are one client base.

**Later, undated.** A commercial facility with the production room in back and treatment, movement, retail and reception in front, when the center is operating well. Vallecito's layout math (10x30 ft ≈ 360 flats on 18 racks) is the sizing reference. MicroFarm plans and runs the production room; the front of house is the other products.

**Regulatory, to research before sprouts ship:** FSMA Produce Safety Rule and its small-farm exemptions; sprouts Subpart M (seed treatment, spent irrigation water testing, records); Texas and Travis County rules for raw uncut produce sold direct from a home; Austin home-occupation rules for a grow room and, later, for a massage practice at the house.

## 11. Open items

- Brand name and domain for the software (working title MicroFarm). The facility trades as Axiom Delta Wellness Center.
- Default Phase 1 unit: 1020 flat or large tray. Vallecito households mostly bought large trays.
- Sprouts in or out of the first menu, pending the Subpart M check.
- Whether the Sales Portal and Prospects stay in the first release or wait for Phase 6.
- One client across three products: how a bodywork client, microgreens subscriber and Feed The Wolf subscriber are recognized as the same person (shared Clerk identity, shared email, or a wellness-center client record that the products reference). Not a MicroFarm build item until the products need to share it.
