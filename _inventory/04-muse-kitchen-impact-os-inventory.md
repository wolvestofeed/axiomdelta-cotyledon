# Inventory 04 — Muse Kitchen · Impact OS (candidate operating system for MicroFarm)

Source: `/Users/robertbogatin/Documents/WTF Publishing/Comptable/apps/web/src/app/(muse)/` and `docs/muse/`.
Status: TEMPORARY inventory. Read-only survey. Nothing copied or changed.

## A. What it is

Impact OS is a full back-office operating system for a cook-chill commissary kitchen, built Sept 2026 as a private, Clerk-gated route group inside the CompTable monorepo. Live at getcomptable.com/muse. It is Rob's own brand and product (Muse Kitchen · Impact OS); the source client is confidential and scrubbed.

Size and shape:

| Area | Files | Lines | What |
|---|---|---|---|
| `_engine/` | 72 | 20,855 | Pure calc: capacity, batch, costing, ledgers, scheduler, carbon, facility, demand, orders, traceability |
| `_lib/` | 65 | 10,074 | DB reads and `'use server'` actions, access guards, exports |
| `_data/` | 30 | 5,097 | Typed source-of-truth plan data with provenance tags, chart of accounts, emission factors, seeds |
| `_components/` | 58 | 7,935 | Muse-only UI shell, tables, forms, timeline, ledger parts |
| pages + portals | ~100 | 17,449 | 60 OS pages, Floor, 5 portals, front door |
| `packages/db/src/schema/muse.ts` | 1 | 2,165 | 51 tables in an isolated `muse` Postgres schema, 37 hand-written migrations (0043–0079) |
| tests | 59 | — | `apps/web/test/muse-*.test.ts` |

Roughly 62k lines of TypeScript. Nearly all phases A–Q are DONE per `docs/muse/roadmap.md`; open items are scheduler L3/W6, portal P4–P6, integrations M, and the CompTable transport.

## B. Module surface (from `_components/nav.ts`)

- **Overview:** Dashboard, Reports (28 report packages, XLSX export of any page), Sources (every cited source registered).
- **Production:** Recipes, Time Studies, Production Planning (3 levels), Day Schedule, Compare, Calendar, Process, Capacity, Equipment, Packaging, Floor (operator punch clock and batch close).
- **Financials (admin):** Unit Economics, P&L, Balance Sheet, Cash Flow, Ledger, Plan v Actual, Actuals, Receivables (invoices), Payables, Capital & Financing (loans, fixed costs, leasehold).
- **Cold Chain:** Inventory (FIFO lots), Food Safety (HACCP CCPs, FSMA 204 traceability).
- **Supply Chain:** Procurement (POs, net requirements, reorder), Suppliers (approved directory with effective-dated catalog prices; seeded from USDA Organic INTEGRITY and TDA Farm Fresh Network for TX/CO/NM/LA).
- **Sustainability:** Inventory & Audit, Facility (footprints, layout drawings, normalizers, conformance), Energy scope 1&2, Refrigerants, Equipment & Rebates, Ingredients scope 3 (Poore & Nemecek food factors), Supplier LCA, Logistics, Waste & End-of-Life, Water & Effluent. Plus the ERRA customer rating.
- **People:** HR (pay lives in CompTable, contract v1 defined), Schedule (staff demand from the plan), Training (versioned documents, assignments follow the staff register).
- **Sales:** Sales Portal, CRM (prospect map, geocoded), Customers (sites, services, terms), Orders (order book, forecast vs confirmed vs delivered).
- **Distribution:** Sites & Delivery (designed, not wired).
- **External portals:** Customer Portal + Order Builder, Supplier Portal, Parent Portal + Parent Admin (each a sibling route group with its own shell; order submission not connected yet).

## C. The engine's core invariants (these are what we'd be adopting)

1. Batch size is derived from vessel capacity, never typed. A batch is what one unit of each vessel takes; a second unit is a parallel stream.
2. The batch is the costing basis: bulk inputs → yield chain (AP → EP → cooked → chilled → plated) → unit cost; cost to serve adds labor, packaging, distribution.
3. Labor = fixed minutes per batch + variable minutes per portion, on two streams (batch stream on the production day, dispatch stream on the delivery day). Time studies per recipe, estimated until observed.
4. Whole batches only; overshoot is inventory inside hold life and waste outside it.
5. Every dollar is computed from tagged reference data (SOURCED / STATED / PLACEHOLDER / DERIVED / UNCONFIRMED / DATED).
6. Only the batch execution record posts journals. Plan ledger and Actual ledger are separate worlds; a batch that does not mass-balance does not close. One cook = one lot.
7. US GAAP ASC 330 perpetual inventory at standard cost, fixed overhead absorbed on normal capacity; delivery is a period cost. Written for a CPA or lender to sign off.
8. Capacity is a property of the plant; labor is a requirement of the plan; staffing gaps are findings.
9. Plan of record / forecasts / working copy / Plan vs Actual vocabulary, with a forecast bar on every page.
10. No advice language, no icons, page-header discipline, every source cited.

## D. Mapping the kitchen onto a microgreens and sprouts farm

The abstractions transfer almost one-to-one. The nouns change.

| Impact OS concept | MicroFarm equivalent | Fit |
|---|---|---|
| Recipe (components, ingredient lines, batchPortions) | Crop plan per variety: seed line(s), medium, nutrients, tray size; "portions" = flats or trays or cut ounces | Strong. A blend flat (3 varieties) is a multi-component recipe. |
| Vessel capacity → derived batch | Rack shelf capacity → derived batch (a batch is what one shelf or one rack takes; a second rack is a parallel stream) | Strong. Same rule, different vessel. |
| Yield chain AP → cooked → chilled → plated | Seed weight → sown → germinated → harvest weight (cut) or live flat count | Strong. Vallecito already has oz seed per flat and harvest gram tables. |
| Hold life / blast chill / CCP cooling | Grow-cycle stages: soak, weighted germination, blackout, light, harvest window, live-flat shelf life | Needs a stage model swap. Thermal CCPs become sprout seed sanitizing, water testing, temperature/humidity logs. |
| Time studies (fixed per batch + variable per portion, two streams) | Vallecito 27-min 1020 time study fits exactly: sow/prep is per batch, watering is per day, harvest/pack is per portion on delivery day | Strong. Direct import. |
| Production planning from an order book with hold life | Sowing schedule back-planned from subscription delivery dates by variety grow-days | Strong. The scheduler already places batches against a calendar and capacity. |
| Whole batches, overshoot = inventory or waste | Whole trays; unsold live flats become cut product, then waste | Strong. |
| Inventory FIFO lots, mass balance | Seed lots, medium lots, flats by sow date; harvest mass balance | Strong. |
| Food safety, FSMA 204 traceability, HACCP | FSMA Produce Safety Rule; sprouts Subpart M (seed treatment, spent irrigation water testing); lot traceability by seed lot | Strong, and sprouts need it. |
| Suppliers, effective-dated catalog prices | True Leaf and regional seed suppliers, media, trays | Strong. |
| Customers → sites → services → menu cycles → orders | Subscribers → pickup point or address → bi-weekly/monthly cadence → standing flat orders | Strong; menu cycles become subscription cycles. The engine has no subscription/recurring billing concept yet. |
| Channels (school / catering / ghost kitchen), phases = build-out order | Channels: home subscription / restaurants / wholesale / wellness-center retail; phases = home → flex space | Strong. |
| Packaging library | Tray sets (Bootstrap, OTG), bags, jars, care inserts | Strong. |
| Equipment library with footprints, zones, layout drawings | Racks, lights, fans, pumps, dehumidifier; grow room layout in the flex space | Strong. Facility module already draws a floor plan by build phase. |
| Sustainability (energy, water, ingredients scope 3, waste) | Lighting kWh, water, coir/medium, compost; the "acre-feet and fuels" question in The Big Picture | Strong. Emission factors will need microgreens rows. |
| Working capital, invoicing, AR/AP, loans, leasehold | Same | Direct. |
| HR via CompTable contract | Solo operator at first; keeps working with one person | Direct, or bypass. |
| Training docs | Grow SOPs, customer care sheets | Direct. |
| Parent Portal (school meals) | No equivalent; drop. Customer Portal = subscriber portal; Supplier Portal keeps. | Drop one, keep two. |
| Meal pattern crediting (7 CFR 210.10) | No equivalent; replace with the nutrient matrix (Nutrients Master) so a flat can be composed for iron, protein, sulforaphane, etc. | Swap. This is the one module that maps to the "grow for deficiencies" pitch. |

Not present in Muse and needed for MicroFarm: recurring subscription billing (Stripe subscriptions), delivery/pickup routing and tray return tracking, live-flat shelf-life after handoff, per-customer nutrition targets, and a wellness-center layer (treatment rooms, bodywork bookings, classes, retail POS).

## E. Coupling and extraction

- Muse lives inside CompTable and imports `@ct/db` (48 sites), `@/lib/db` (46), `@ct/ledger` (8), plus `@ct/compliance`, `@/lib/ai/client`, `@/lib/rate-limit`, `@/lib/redact` once each. The Clerk shell and Neon database are CompTable's.
- Its own scope boundary rule already forbids touching CompTable outside the Muse folder, so the code is largely self-contained by discipline. Extraction means: the `(muse)` route groups, `packages/db/src/schema/muse.ts` + 37 migrations, `packages/ledger`, the test files, the `muse:*` scripts, and a new Clerk app and Neon database.
- The roadmap already says the OS moves to its own domain when it goes live.

## F. Three ways to reuse it (for discussion, not decided)

1. **Fork into this repo as a new app.** Copy the route groups, schema, ledger package, tests; rename the domain nouns (recipe → crop plan, portion → flat, vessel → shelf, cook → sow, chill → blackout); drop Parent and meal-pattern crediting; add subscriptions. Highest fidelity, largest one-time port, and a second codebase to maintain.
2. **Generalize Muse into a multi-tenant "production OS" and run MicroFarm as a second tenant inside CompTable.** Cheapest to start, but the kitchen vocabulary is hard-coded in copy, types, and tests, and CompTable's scope rules make this a CompTable change.
3. **Extract Muse into its own package or repo as the generic OS (Impact OS), with Muse Kitchen and MicroFarm as two domain configurations on top.** Cleanest long-term and it matches Rob's stated intent to publish Impact OS as a product, but it is the biggest refactor.

## G. Reference docs worth reading before deciding

- `docs/muse/CLAUDE.md` — engine invariants and working rules.
- `docs/muse/overview.md` — pillar and module table.
- `docs/muse/roadmap.md` and `docs/muse/roadmaps/*.md` — status and build plans per topic.
- `docs/muse/accounting-policy.md` — the cost accounting rules of record.
- `docs/muse/comptable-contract.md` — the HR/payroll boundary.
- `docs/muse/research/platform-scope-2026-09-10/` — original requirements, production planning, sustainability scope.
