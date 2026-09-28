# Cotyledon — Outline of Record

**Cotyledon**, powered by Ember OS: the microgreens and sprouts production operating system of Axiom Delta Wellness Center, and a product other farmers subscribe to. This document is the whole plan. When something changes, the old text is replaced here.

---

## 1. The business and where Cotyledon sits

**Axiom Delta Wellness Center** is one business operation, Robert Bogatin's (Joshin's), with one client base. A client may at once be a bodywork client, a microgreens subscriber and a Feed The Wolf subscriber.

| Name | Role |
|---|---|
| Axiom Delta Wellness Center | The business and Rob's personal practice |
| Wolves To Feed | Marketing website for Rob's whole coaching practice |
| Feed The Wolf | Rob's own digital coaching platform: ancient wisdom and his collected work in a library, delivered as an online digital sequencing platform |
| AxiomDelta Coaching Engine | The product other coaches license and subscribe to for their own businesses |
| Ember OS | The platform brand. Each application on it keeps its own mark and is endorsed "powered by Ember OS": Muse Kitchen for the commissary kitchen, Cotyledon for the farm |
| Cotyledon | The production OS for the microgreens and sprouts facility, and a product other farmers subscribe to. Powered by Ember OS |

Cotyledon is two things at once:

1. **The facility.** The wellness center's microgreens and sprouts production, the successor to Vallecito Micro Farm (Bayfield CO, 2023–24). It sells live flats and trays, still growing, to subscribers who water and harvest them at home, each composed for the subscriber's own nutritional needs and performance objectives. It runs from Rob's South Austin home until the center is operating well enough to take a commercial facility.
2. **The software.** The operating system that runs the facility, ported from Muse Kitchen (the commissary kitchen application of Ember OS, which Rob built inside Comptable, Sept 2026) with the kitchen vocabulary replaced by growing vocabulary. Multi-tenant from the start. The wellness center's facility is tenant zero.

Bodywork, coaching, the library and sequencing live in the other products. Cotyledon holds a subscriber's nutrition targets for their flats and nothing else about them as a client of the center.

## 2. Locked decisions

- **Repo:** this folder, `WTF Publishing/Ember OS/Micro Farm`. Its own repo, its own Clerk app, its own Neon database. Developed on localhost until a domain is registered.
- **Source:** everything in Muse comes over: the `(muse)` route groups, `_engine`, `_lib`, `_data`, `_components`, `_state`, the `muse` schema and its 37 migrations, the 59 tests, the `muse:*` scripts, `docs/`, and the ledger package, now `src/ledger`. Nothing else from Comptable.
- **Vocabulary:** a full swap, §3. Code, schema, copy, tests, docs, seeds.
- **No CompTable connection.** The HR contract, signed notices and transport are dropped. Staffing is an internal module (§6, People).
- **Scheduler ↔ Staffing.** The production scheduler reads the internal staff roster and schedule and reports coverage against the plan's labor demand on the Staffing page.
- **Coaching and bodywork live outside Cotyledon** (Feed The Wolf, the AxiomDelta Coaching Engine, and whatever books in-person sessions). Cotyledon holds a subscriber's nutrition targets, nothing more about them.
- **Multi-tenant:** every farm is a workspace. Built in from the port, not retrofitted.
- **Subscriptions:** a first-class module: weekly, every-two-weeks and monthly cadences, each distribution billed through Stripe as it is handed over.
- **Documents replace, they do not log** (CLAUDE.md §1).
- **The practice's phases:** home-based microgreens for individuals now; massage school Oct/Nov 2026 to a Texas LMT license Apr/May 2027; massage therapy from summer 2027, still from the house; a commercial facility only when the center is operating well. Only the production facility is in Cotyledon's scope.

## 3. Vocabulary swap (the only authority)

| Muse | Cotyledon | Note |
|---|---|---|
| Muse Kitchen, Muse, the OS | Cotyledon | Origin may be cited in docs only |
| kitchen, commissary | farm, grow room | |
| recipe | grow plan | One per variety, or a blend of varieties |
| recipe code | crop code | |
| ingredient line | seed line, medium line, nutrient line, light line | What the lines buy are the plan's inputs, the farming term. Water is a stage, never a line |
| component (served) | variety | The unit of sowing, lot coding and nutrient profiling inside a blend |
| portion, meal | unit | A unit is a flat, tray, insert, jar or cut ounce; the format is a property of the grow plan |
| batchPortions | batchUnits | |
| batch | sowing | A sowing record is one sow of one grow plan = one lot |
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
| menu cycle | subscription, on a cadence | Weekly, every two weeks or monthly; no cycle object |
| meal plan | flat plan | A subscriber's standing composition |
| meal pattern, crediting, grade group | nutrient profile, nutrition targets, tray format | See §4 |
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

**Variety.** The master record and the costing basis. A short code (`BROC`, `RAD`, `SUN`, `PEA`, `FEN`, `BOR`, `AMA`, `CAB`, `CHIA`, `MUNG`, `LEN`, `WHT`), seed source and supplier with the supplier's short code (`TLM`) and item number, organic and heirloom status, origin, last price paid per pound from its most recent receipt (the supplier's catalog price until the first receipt; a price typed on a forecast stands over both), a rolling 12-month average price as a key figure, observed yield per pound by tray format from closed sowings, soak and stage days, and the nutrient profile: compounds, nutrients and stated benefits, each citing a row of [`science-library.md`](science-library.md). Vallecito's twelve varieties seed the library.

**Tray format.** 1020 flat, 7x11 large tray, 5x5 insert, pint jar, cut ounce. A format names its dimensions, its grow-unit footprint (four 1020s per 48-inch shelf), and each variety's seeding density in grams.

**Grow plan.** How a variety, or a blend, is grown. Lines are the inputs to one tray, per format, and every line feeds the costing formula:
- **Seed line**: a variety, its grams per tray, and its share of a blend. Costed at the variety's last price paid per pound. The only line that carries provenance and nutrition.
- **Medium line**: a row of the workspace's Media library, with quantity per tray: the hemp fiber mat by default (stated by Rob), or coconut coir, jute fiber, vermiculite or a hydroponic pad. Costed at the medium's price per unit. Varieties differ in the medium they grow best on, so the medium belongs to the plan.
- **Nutrient line**: a nutrient solution or supplement from the workspace's Nutrients & Supplements library, its concentration in ml per gallon, and the stage it starts. Costed at concentration times water volume times price.
- **Light line**: the light spec for the light stage: spectrum (fixture or wavelength mix), photoperiod in hours per day, intensity as PPFD at canopy or fixture height, and the stage it starts. Costed as fixture watts times hours times the energy rate, per tray per day, plus the fixture's amortized cost. Varieties are grown under different spectra and configurations, and light changes nutrient content (science library rows 2, 8), so light belongs to the plan.

A plan also carries the allergens present and the allergen-free claims, as stated. A single-variety flat is a grow plan with one seed line. A blend is a grow plan with two or more, composed to a nutrition target; it is developed through experiments (below) and goes in service only once they show it grows to a stable yield. A plan's code is its lead variety's code and a serial (`BROC-01`, `BROC-02`); a blend is `BLEND-01`. The unit a subscriber buys is a customer SKU: the plan code and the packaged format (`BROC-01-1020`, `BROC-01-7X11`), so one plan packed in two formats is two SKUs. Tray sets, labels, inserts and sanitizer are consumables costed per tray by format, not lines. Watering is never a line; it is a stage. A light line is what the plan asks for and what its light is costed at; any lit shelf takes it.

**Stage schedule.** The process of a grow plan: soak → sow and weight → germination → blackout → light → harvest window → packed. Each stage carries its days, its watering method, a control point where one exists, and a labor basis. Watering repeats daily and changes shape across the cycle: misting from above through germination and blackout, bottom watering once roots reach through the perforated tray under light. A nutrient line names the stage it starts, and the watering step at that stage reads it. The schedule is what the grow calendar, the time study and the scheduler run on.

**Control point.** A check recorded on a stage: seed sanitation before soak, spent-water test for sprouts, temperature and humidity through germination and light. Replaces the kitchen's thermal critical control points.

**Grow unit.** Shelf, rack, sprouting rack, jar stand, with capacity in trays per format, its lights shelf by shelf (a fixture and how many of it on each shelf: two Mars VG80 or three Barrina T5), and a build phase. A lit unit holds its format's trays per shelf times its shelves; a sowing larger than that is split across units. A dark rack holds a tray sowing only through its dark stages: stacked five high under a weight from the sow day through germination, one shelf place a stack, then spread four to a shelf in blackout; the trays then fill a lit rack for the light stage and the harvest window. The home grow room for 20 trays a week is two lit racks and two dark racks, all holding trays at once. Vallecito's Mars Hydro PPFD map is the first fixture record.

**Sowing.** The batch: the trays a grow plan's orders need, one flat the least. One grow plan, one sow day, one lot per variety, grow-unit loads, stage records, mass balance (seed issued + water gain − stage loss − scrap = packed), crew hours. Only a closed sowing posts journals. A sowing's output is a count of units in its format; there is no second billable count.

**Subscriber.** A customer with pickup points, payment via Stripe, nutrition targets, and subscriptions. A subscription is a standing order at one pickup point: a cadence (weekly, every two weeks, or monthly on the same weekday of the same week of the month) from its first distribution, and a flat plan (the grow plans and units each distribution carries, changed from the next distribution not yet sown). A distribution is skipped, or a subscription paused, only before the distribution's sow date; each distribution is billed as it is handed over, so a skipped or paused one bills nothing. Restaurants and retail/wholesale customers are the same object on a different channel without nutrition targets. A subscriber marked own use is Rob taking trays for his own consumption: its orders flow through production like any other and its distributions go to Owner Draws at cost, never sold.

**Nutrition targets.** Per subscriber: named targets (iron, protein, sulforaphane, vitamin C, folate, omega-3, fiber, …). The Flat Builder scores a flat plan against the targets from the variety nutrient profiles, and every benefit it shows cites its source row. This is the reason the facility exists.

**Experiment.** A titled run in R&D: one sowing of a developing grow plan, most often a blend, sown to find out whether it is feasible. Composing it reads two sets of facts side by side: how its varieties grow together, from the variety records (days to harvest, soak, blackout days, medium, light regime, seeding density), and what it carries nutritionally against a target set, every benefit citing its science-library row. An experiment records what the sowing record records (harvest grams per variety, the stage checks) and its time study, and takes its place on the grow units like any sowing. Across a plan's experiments the yield per variety is read as its mean and spread. When Rob judges the yield stable, the plan goes in service: each variety's mean grams per tray packed across its experiments becomes the plan's harvest for that variety, DERIVED; its approved time studies are its labor standard; and it enters forecasts and production. A forecast is business planning over the data already in the system; an experiment is research on a plan not yet in it.

**Order.** From a subscription cycle, derived on read until confirmed; confirmed and distributed orders are rows. Distribution is pickup or delivery on a distribution day; live trays carry a tray-return expectation.

**Science library and glossary.** [`science-library.md`](science-library.md) is the source register, seeded into the Sources module; [`glossary.md`](glossary.md) is the vocabulary in three tiers, published for subscribers and staff in tiers 1 and 2. A variety's benefits link to glossary entries, which link to sources.

**Workspace.** A farm. Every table carries a workspace id. The wellness center's facility is one row.

## 5. Engine rules (ported, restated for growing)

1. **A sowing is the orders flowing into production.** It is the whole trays a variety's orders need for a distribution day, net of stock, one flat the least; nothing is sown to fill a rack. A tray is sown on the day its days to harvest end on the distribution day (a Saturday), weekends included; sprouts start on a production day. The grow units bound what can be placed, and a sowing larger than one unit holds is split across units.
2. **The sowing is the costing basis, and the grow plan's lines are the cost.** On the plan, seed at the variety's last price paid per pound times grams sown, medium at price per tray, nutrients at concentration times volume, light at watts times hours times the energy rate per tray per day, over observed yield per pound by format, plus consumables and labor at the derived sowing → unit cost. Cost to serve adds harvest labor, packaging and distribution, never storage.
3. **Labor is fixed per sowing, plus variable per tray per day, plus variable per unit, on three streams.** Soak, sow and weight count per sowing on the sowing stream; misting, bottom watering and inspection count per tray per day on the daily stream across the stage schedule; harvest, pack and hand-off count per unit on the harvest stream on the distribution day. The daily stream is what a two-week living crop adds to the kitchen's model. Time studies per grow plan, each recording the labor lines and the water and supplements the studied sowing took; every observed study is approved, and the plan's labor, water and supplements per tray are the average of its approved studies weighted by the trays each timed; estimated until the first approval. Vallecito's 27-minute 1020 study, with its one-to-three minutes of daily watering per flat, is the first seed.
4. **Whole trays only.** A part tray is a whole one. Trays not distributed are inventory inside the harvest window and waste after it; live flats not distributed become cut product, then waste.
5. **Every dollar is computed from tagged reference data.** Provenance tags on every figure.
6. **Only the harvest record posts journals.** Plan ledger and Actual ledger are separate worlds. A sowing that does not mass-balance does not close. One sow = one lot per variety.
7. **US GAAP ASC 330 perpetual inventory at actual cost.** Materials by lot at the price paid; labor at the recorded hours and rate, the approved standard where no crew is recorded; fixed overhead absorbed on normal capacity; variable overhead at its standard per tray; distribution is a period cost. Purchase orders price at the supplier's published price in force, the plan at the last price paid, the ledger at the lot's cost; the rolling 12-month average is a key figure, never a posting. Cost of goods sold shows materials, labor and overhead with its subtotal. `docs/accounting-policy.md` is the authority.
8. **Capacity is a property of the grow room; labor is a requirement of the plan.** The plan emits staff-hours by interval; the internal roster is a proposed answer; a gap is a finding on the Staffing page.
9. **Plan of record, forecasts, working copy, Plan v Actual** keep their meaning and the forecast bar.
10. **No advice, no icons, headers by the rule, every source registered.**
11. **An experiment is research and development, expensed as incurred** (ASC 730-10-25-1). Its sowing posts through the same chain as any sowing, and its cost, finished or lost, goes to Research and Development (7920), never to inventory or cost of goods sold; a tray given away from it is not revenue.

## 6. Module map

Status per module is kept in `nav.ts`, not here. Legend: **port** = comes over with the swap; **swap** = comes over with a domain change; **new** = built here; **drop** = not ported.

| Section | Module | Plan |
|---|---|---|
| Overview | Dashboard, Reports, Sources | port |
| Production | Grow plans | swap (from Recipes) |
| | Varieties | new: the variety library, the master record; the rolling 12-month average seed price as a key figure |
| | Nutrients & Supplements | new: the solutions and supplements a nutrient line names, with strength, price and what each is meant to elicit; seeded, editable; the rolling 12-month average price as a key figure |
| | Media | new: the growing media a medium line names, with quantity per tray, price and traits; the rolling 12-month average price as a key figure |
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
| R&D | Blends | new: the blends under development as developing grow plans, each with its varieties' growing fit and the nutrition targets they carry, read against a subscriber's or a chosen target set |
| | Experiments | new: running a blend as titled experiments on the grow units, yield per variety read across its experiments, and the plan's promotion to in service; experiment cost to Research and Development |
| Workspace | Workspace admin, members, plan and billing for the software | new |

## 7. Tenancy

A workspace is a farm, and a farm is one Clerk organization. Roles come from the organization: `org:admin` is an admin, any member is an operator, and the platform admins named in `src/server/access.ts` are admins in every organization they belong to. External portal accounts hold neither role.

Isolation is enforced in the database. Every farm table carries `workspace_id`, and row-level security keyed on the transaction setting `app.workspace_id` shows a workspace its own rows and lets it insert into no other. Every entry point (page, layout, route handler, server action) runs inside `withWorkspace()`, which resolves the signed-in organization to its workspace, opens a transaction, sets the key, and runs the entry point in an async scope that `db` reads. A query outside a scope throws; a query that forgets its workspace sees nothing. Nothing in a read or an action names the workspace by hand. A workspace is provisioned the first time its organization signs in. Scripts run against one workspace through `FARM_WORKSPACE`.

## 8. Software build phases

The phases, their status and their steps live in [`roadmap.md`](roadmap.md), the master roadmap, and one file per phase under `roadmaps/`. In one line each: 0 lift, 1 swap and tenancy, 2 growing domain, 3 subscriptions and distribution, 4 staffing, 5 facility and sustainability, 6 software as a product. Each ends with the app running on localhost and its tests green.

## 9. Repo structure

```
Micro Farm/
├── CLAUDE.md                 rules
├── docs/
│   ├── outline.md            this document
│   ├── glossary.md           the vocabulary in three tiers; Phase 2's naming authority
│   ├── science-library.md    the source register every stated benefit cites
│   ├── accounting-policy.md  ported, nouns swapped
│   ├── grow-operations.md    stages, control points, produce safety (replaces culinary-operations.md)
│   ├── roadmap.md            the master roadmap: every phase, its status, links to its file
│   ├── todo.md               open one-off items that belong to no phase step
│   └── roadmaps/             one file per phase (phase-N-*.md), plus the topic build plans ported from Muse
├── src/
│   ├── app/                  routes only: the (farm) OS under /farm; (grow-room), (subscriber), (supplier), (sales), (front)
│   ├── engine/               the pure engine: costing, capacity, calendar, ledgers, scheduling
│   ├── data/                 reference data and seeds: varieties, formats, stages, inputs, science library, glossary
│   ├── server/               read layers and server actions (server-only)
│   ├── components/ state/ assets/ lib/
│   ├── db/                   Drizzle schema and client
│   └── ledger/               the ledger engine, ported from Comptable
├── drizzle/                  hand-written SQL migrations, applied by scripts/migrate.ts
├── scripts/  test/  public/
└── _inventory/               temporary survey; delete once consumed
```

## 10. The practice — plan in brief

Everything runs from Rob's house until Axiom Delta Wellness Center is operating well enough to take a commercial facility. No date is set for that.

**Now.** Microgreens and sprouts grown for individuals by nutritional need and performance objective, after a short intake. Live 1020 flats, large trays and 5x5 inserts, plus pint-jar sprouts once Texas rules are confirmed. Subscribers on a weekly, bi-weekly or monthly cadence with a Saturday pickup at the house, a central pickup point or a delivery route once density allows. The first objective is 20 trays a week, Rob's own among them, on two lit racks and two dark racks. First pool: the Austin men's group, neighbors, Feed The Wolf subscribers, then restaurants. Pricing is $30 a 1020 flat on subscription, against Vallecito's ~$11.40 cost of which ~$9 was labor; live uncut flats remove most harvest labor. Capacity: home racks at ~$1,058 per 6-tier rack. Coaching in meditation, Ayurveda and nutrition may be added as it grows, on Feed The Wolf.

**Oct/Nov 2026 to Apr/May 2027.** Massage school toward a Texas LMT license, while the microgreens program runs.

**Summer 2027.** Massage therapy begins as Rob's in-person practice, from the house. Bodywork clients, microgreens subscribers and Feed The Wolf subscribers are one client base.

**Later, undated.** A commercial facility with the production room in back and treatment, movement, retail and reception in front, when the center is operating well. Vallecito's layout math (10x30 ft ≈ 360 flats on 18 racks) is the sizing reference. Cotyledon plans and runs the production room; the front of house is the other products.

**Regulatory, to research before sprouts ship:** FSMA Produce Safety Rule and its small-farm exemptions; sprouts Subpart M (seed treatment, spent irrigation water testing, records); Texas and Travis County rules for raw uncut produce sold direct from a home; Austin home-occupation rules for a grow room and, later, for a massage practice at the house.

## 11. Open items

- The domain for the software. The facility trades as Axiom Delta Wellness Center.
- Default Phase 1 unit: 1020 flat or large tray. Vallecito households mostly bought large trays.
- Sprouts in or out of the first menu, pending the Subpart M check.
- Whether the Sales Portal and Prospects stay in the first release or wait for Phase 6.
- One client across three products: how a bodywork client, microgreens subscriber and Feed The Wolf subscriber are recognized as the same person (shared Clerk identity, shared email, or a wellness-center client record that the products reference). Not a Cotyledon build item until the products need to share it.
