# BUILD PLAN — One operating model: definitions, the Plan ledger, the Actual ledger

Roadmap Phase N. Status: N1 and N3–N10 DONE; one clean-up item under N9 NOT STARTED; one decision
deferred (§3.13); one open item (§6).

---

## 1. What the model serves

1. **Planning.** Robert builds the business on paper — recipes, equipment, customers, services,
   prices, growth — and reads what the business looks like.
2. **Operating.** From launch, recorded activity is the books. Before launch the books are zeros.

Both needs run on one model, with no mode switch between them.

## 2. The model

**One set of definitions, two ledgers, one engine.**

### 2.1 Definitions — what the business is and will be

Recipes, ingredients and supplier catalog prices, packaging, equipment, the leasehold schedule,
customers, sites and services, menu cycles and meal plans, suppliers, payment terms, loans,
fixed-cost lines (lease, utilities, admin), the production calendar. Authored once on one master list
per kind, shared by both ledgers.

Every definition carries a **real-world status**, so one list holds what exists and what is planned:

| Definition | Not yet real | Real |
|---|---|---|
| Equipment | Planned (in-service date) · No · – (not selected) | In service |
| Customer | Prospect · Forecast Customer | Contracted |
| Recipe | In development | In service |
| Supplier catalog item | Candidate | Approved |
| Loan | Planned (start date) | Funded |
| Fixed-cost line | Planned (start date) | In force (a signed lease, an open utility account) |
| Leasehold line | On record only | Counted |

Roster positions, wages and burden are CompTable's (Phase O, `people-roadmap.md`); Muse holds no pay.

Robert's research figures are the starting values of these definitions, carrying their status tag
(`STATED`, `PLACEHOLDER`, `SOURCED`…). Engines and seed modules take `plan-data.ts` as defaults and
seeds; no page, component, state module or server library reads a figure from it (conformance C2).

### 2.2 The Plan ledger — a forecast, derived, never stored

A forecast is a **dated timeline** from its start date, one to three years long (§3.3). For each
production day on the J1 calendar the engine takes the definitions active on that date — planned ones
included, as the forecast dates them — and generates the events the business would record, in the same
document shapes as actuals:

services × dated volume picks on each site's calendar → orders from each customer's meal plan → the
production plan against the lines in service that day → net requirements → purchase orders → receipts
and supplier bills → batch records at standard → deliveries → monthly invoices by terms → collections;
batch standard labor → pay periods; fixed-cost lines → bills and the overhead accrual; equipment
in-service dates → capital purchases → loan draws, loan payments and depreciation.

The generated events post through the **same posting function** as actuals (`postActuals`), into a
ledger keyed by the forecast. Statements come out by month, quarter and year. Growth, ramp and
seasonality are in the timeline because the timeline is dated. Nothing generated is written to the
database; a change to a definition or a forecast input recomputes the timeline.

Any number of forecasts; one is the **plan of record**.

### 2.3 The Actual ledger — recorded activity only

The Floor, receiving, batch close, deliveries, invoices, bills, payments, the time clock and the
sustainability records write here, and nowhere else. Before launch it is empty and every actual view
reads zero. It posts through the same function as the Plan ledger, so actual against plan is the same
report run twice.

### 2.4 The rule

Every page reads the same engine functions against a selected ledger — **Plan: the open forecast** or
**Actual**. Planning surfaces write only to the forecast; recording surfaces write only to Actual;
master-list edits are open on both. Approving a standard freezes the plan of record's Plan ledger
overhead rate, and actual batches cost at the approved standard.

### 2.5 At launch

Nothing is archived or wiped. Definitions change status as things become real — the equipment is
bought, the customer signs, the staff are hired — and the Actual ledger fills from the first recorded
event. The plan of record remains the budget beside it.

## 3. Locked decisions

Numbers are cited from code comments; they are stable.

1. The model in §2.
2. **One master list per kind; no forecast-only definitions.** Anything possible goes on the master
   list carrying its real-world status — Planned equipment, a Developing recipe, a Prospect customer, a
   Planned loan, a leasehold line On record only. Nothing reaches the books by being listed: the Actual
   ledger posts recorded events only. A forecast decides which planned items it uses and from what date,
   through its overlay. Three layers, kept distinct: **definitions** (the master list, read by both
   ledgers) · **plan of record** (one saved forecast, flagged as the budget) · **Actual** (recorded
   events only). A customer is created on the master list before a forecast uses it; where no prospect
   or contracted customer fits, a **Forecast Customer** is created — a master-list customer carrying
   manual figures, usable in forecasts and never on Actual.
3. **Forecast horizon:** one year from the start date by default; a forecast expands it to two or three
   years (`forecast.horizonYears`).
4. **Rolling forecast, budget-based:** actuals through the as-of date (today), the plan of record as
   planned after it — no trend re-estimation. It is a column on Plan v Actual, computed and never saved;
   the balance sheet opens from actuals.
5. **The cost of a meal is food + labor + packaging;** fixed cost is not in it. Fixed cost per meal is a
   side metric on the **expense** basis (lease, utilities, admin, depreciation, interest for the period ÷
   the period's meals). No break-even-meals metric. The cost of a meal is built by BATCH — batch costing
   from bulk inputs at the batch one unit of each Phase 1 vessel takes, the batch's yield, the batch
   cost divided into its portions — and the **cost to serve** adds distribution on top (a management
   figure; storage is never in it). A batch binds to one unit of each vessel it passes through — the
   tightest bounds it, a second unit is a parallel stream, never a larger batch (Robert, 2026-09-17) —
   and planned build-outs never count.
6. The equipment library is the master equipment list (under Production), with inline quantity and
   price, the status filter In service / Planned / No / –, rows with no quantity sorted last. Capital &
   Financing reads its totals from it.
7. **Ingredient price:** the supplier catalog item price is the source when one is on file; the recipe
   line price stands only until then.
8. **People:** CompTable owns positions, wages and burden; Muse holds no pay (Phase O). Labor minutes
   come from each recipe's time study; the loaded labor rate is the blended loaded wage, a labelled
   PLACEHOLDER until CompTable's rates arrive (O4). The staff register drives the Actual ledger's
   punches.
9. **What is real today:** one client — a private school (name not on file), School lunches, 125 meals a
   day, five days a week. It is a contracted customer definition. Every other customer, site and piece of
   equipment in the account is a Plan definition.
10. **Equipment seed status:**
    - **Planned — Phase 1:** everything that makes one hot line and one cold chain — one blast chiller,
      the main cook line (one of each hot-production unit), one walk-in cooler, one walk-in freezer, the
      prep, packaging, warewash, instruments, transport and technology lines the line needs — and about
      25% of the starting wares.
    - **Planned — Phase 2:** the second hot line and cold-chain storage (the second unit of each line
      split out of the quantity-2 rows, the second walk-in cooler and freezer) and more wares; the
      corporate-catering lines.
    - The ghost-kitchen lines are Planned at Phase 3. Service date is **TBD** on every planned row. The
      split is computed from the capex list; no line-by-line review.
11. **Packaging library** — a Packaging page under Production: every package used, sorted by channel,
    hot / cold, material, size and end-of-use rank, with a manual cost and a supplier-based cost. Recipes
    have a packaging card with a picker from the library. A package is picked (assigned to a recipe) or
    unpicked (in the library only). A recipe's packaging per meal is the sum of its picks at the library's
    cost; a package with no cost entered counts as zero, and a recipe that picks nothing carries zero.
12. **Forecast start date:** 2027-01-01, with the Phase K fiscal year and loan start.
13. **Deferred:** where delivery and marketplace commission sit relative to contribution — the current
    treatment stands until raised.
14. **Build-time calls, not questions:** station and capacity details (rice's station, assembly and sealer
    capacity) are taken from the time study and the capex list at build time; a missing figure is shown
    as a gap.
15. **Two forecasts, one chain.** The **Production Planning Forecast** is an open planning calculator
    built by hand: which customers and sites, their services, meals per service, service days, service
    calendar, meal plans, volume changes, equipment in-service dates. **Nothing in it is automated** — no
    growth rate, conversion curve or fill-to-capacity; the engine only extends the entered figures across
    the dated calendar and reports what they produce against capacity and staffing. The **Budget
    Forecast** lives in the accounting engine and works as a traditional budget built from a saved
    Production Planning Forecast (the plan of record). The purpose: plan growth on capacity and staffing,
    intentional expansions, and the sales velocity that becomes known over time.
16. **The budget stays linked.** Every forecast, the Budget Forecast included, always reads current
    values; a change to a definition (an ingredient price, a time study) recomputes every forecast (§2.2).
17. **A service is one meal occasion** — one loading and dispatch/delivery of an order. Two orders to a
    site in a day are two services that day. Volume is meals per service.
18. **Volume changes are dated picks that carry forward.** A service's volume is raised or lowered on
    dates the operator picks; from each pick the volume extends until the next, and is zero before the
    first.
19. **Channels, menu cycles and meal plans.**
    - A customer's **channel** groups it with that revenue channel and sets which recipes are offered to it
      (the recipe's `channels`). It says nothing about what the customer is served.
    - Every customer has its own **meal plan** — its recipe schedule — set up one of two ways: a saved
      **menu cycle** assigned to the customer in one click, or a recipe schedule programmed for that
      customer alone. A programmed plan is not saved or offered to anyone else and can change at any time.
    - **Menu cycles** are a shared list of named, saved recipe sequences, used only as a starting point for
      a customer's meal plan. Channels are not assigned cycles.
    - Assigning a cycle copies it into the customer's meal plan. When a saved cycle is edited, a picker
      applies the change to **selected customers** or to **all customers** whose plan came from it; a
      customer not picked keeps its plan as it is.
    - **In a forecast** a customer's meal plan loads as it stands on the customer record and can be edited
      there without changing the record. Until the forecast edits it, it follows the record (decision 16);
      once edited, the forecast holds its own. Customer records and recorded orders drive real operations;
      a forecast never writes to either.
    - Every service has a meal plan. Only recorded orders post to a customer's Actuals. The seeded
      two-week school menu is the menu; the recipe library and cycles are edited in place.
20. **Service calendar and equipment dates.** Every site has its own service calendar — term dates and
    breaks for a school — entered when the customer account is set up and held on the site; no two are
    assumed alike. A site with no term entered serves every service weekday the kitchen is open, and
    Customers says the calendar is not on file. The kitchen runs year-round. Planned Phase 1 equipment is
    in service from the forecast start; Phase 2 and 3 are out of service until a forecast dates them.

## 4. Steps

Each step is built and reviewed on its own before the next starts.

**N1 — definitions with real-world status — DONE**
- [x] `muse.equipment` (migration 0058) from the capex seed: item, category, status (in_service / planned
      / no / unset), quantity, unit cost, new/used, build-out phase, critical, service date (null = TBD),
      notes, list position. Sustainability's equipment attributes, spec-sheet links and entity links key
      on the row's stable `key` — the item name; a split row's second half is `<item> (Phase 2)`.
- [x] Equipment seed status per §3.10, computed by `equipmentSeed`: Phase 1 $589,200, Phase 2 $527,775,
      Phase 3 $77,800; $1,194,775 in total.
- [x] The equipment library page (`/muse/equipment`, Production): inline quantity, unit cost, status,
      phase, service date and new/used (super admins); the status filter In service / Planned / No / –;
      rows with no quantity last; add a row; collapses by category, one open at a time. Capital &
      Financing, depreciation, financing, the Dashboard, Sustainability Equipment and Refrigerants, the
      GHG inventory, the evidence pack and the entity directory read it through the resolver
      (`ResolvedInputs.equipment`).
- [x] Customers carry prospect / contracted (and forecast, N4a). The one real client (§3.9) is seeded
      contracted — a private school on School lunches, 125 meals a day, five days a week, name and
      contracted price not on file, and the row says so. Every other seed customer is a prospect carrying
      no volume. `planSeedCustomers()` is the database seed; `seedCustomers()` is the engine default for an
      empty library. Demand carries the split — `contractedMealsPerDay`, `contractedAnnualMeals`,
      `contractedCustomers` per channel and `contractedAnnualMeals` in total — and the Customers page reads
      contracted against planned on every channel tile.
- [x] `muse.packages` and `muse.recipe_packages` (migration 0059) — the packaging library: what a meal
      leaves the kitchen in (containers, lids, labels), never packaging equipment. Channels, hot / cold,
      material, size, end of use and its rank, a manual unit cost, and a supplier catalog item whose price
      is the supplier-based cost (per each, or per pack ÷ units per pack). `/muse/packaging` under
      Production, grouped by channel and collapsing one at a time, sorted hot / cold, material, size, rank.
      Recipe picks carry a per-meal count; the packaging card is on Recipes. Seeded with three packages —
      bowl, lid, label — and no cost. The in-table edit controls are shared (`_components/InlineCells`).
- [x] Supplier catalog items carry candidate / approved and an effective-dated price (migration 0067).
      `status` is a decision about the line, not a property of the sheet it arrived on, so it survives a
      re-import; only an APPROVED line prices the plan or a purchase order, and a candidate that was passed
      over is named on the line. Prices live in `supplier_item_prices`, one row per item per effective
      date, with no end date — the price in force on a date is the latest row on or before it, so a
      purchase order reads the price in force on its own order date. Import governs the SET of lines: a
      line on both sheets keeps its id, approval and past prices and gains the new sheet's price from the
      sheet's date; a new line arrives as a candidate. The Catalog tab carries the status pill, Approve /
      Set candidate, the price in force with its date, and the per-line price history with an
      in-force-from editor.
- [x] Recipe lines price from the ingredient item (decision 7). `resolveIngredientPrice`
      (`_engine/ingredient-price.ts`) is the one answer: the line's linked supplier → that supplier's
      APPROVED catalog line → the price in force on the date → and its basis must be the unit the line is
      bought in. A price per case against a line bought by the pound is not converted — the catalog's pack
      size is free text. Every refusal carries its reason, one entry per line in
      `ResolvedInputs.ingredientPrices`. Precedence: a price typed on the scenario, then the catalog, then
      the recipe line's own figure. Where the catalog prices a line the resolver writes it onto
      `apUnitCost` and tags the line SOURCED with the supplier, item and effective date, so costing, net
      requirements, purchase orders and both ledgers read it. Recipes and Procurement show the provenance
      per line; with no catalog on file every line reads its recipe figure and says no supplier is linked.
- [x] `muse.loans` (planned / funded, principal, APR, term, start date) and `muse.fixed_cost_lines`
      (category, monthly amount, start and end dates, status, `treatment`) (migration 0068). A loan's
      principal is TYPED: a loan may be for less than the capex it finances or carry a deposit, so the
      capex total for the same purpose is reported beside it and any gap is named, not closed. Financing
      is what the loans say, each on its own principal, rate, term and start date, through `capexRollup`,
      `fixedExpenseForMonth` and the current portion of long-term debt. A fixed-cost line's `treatment` is
      the accounting fact, never inferred from the label — manufacturing overhead absorbs into inventory on
      normal capacity and G&A stays out (ASC 330-10-30-8). A month before a line starts carries none of it.
      Capital & Financing edits both per scenario; a super admin adds or removes rows in the library.
- [x] `muse.leasehold_lines` (migration 0069): the leasehold schedule as a definition. Each line is
      **counted** or **on record only**; an uncounted line keeps its figure and stays out of the subtotal,
      total capital, depreciation and the leasehold loan's comparison, reported separately. Extended cost
      is the figure of record; $/sq ft derives from it against the facility size. None of the rates is a
      quote, and the card says so.

**N3 — the standard cost of a meal, per recipe per date — DONE**
- [x] One function per quantity: food (catalog price in force × the recipe's AP quantities, with shrink)
      + labor (the recipe's own labor standard: fixed minutes per batch and variable minutes per portion
      from its time study, at the loaded labor rate) + packaging (the sum of the recipe's picked packages,
      each at its supplier cost when on file, else its manual cost; zero where no cost is entered or
      nothing is picked). The resolver writes each recipe's own labor standard and packaging into
      per-recipe assumptions (`recipeAssumptions`, read through `assumptionsFor`, built in
      `_engine/meal-cost.ts`), so `costPerMeal`, `laborForDay` and the batch ledger are the single
      functions and receive the recipe's inputs. `assumptions` is the reference recipe's, so `recipe` and
      `assumptions` always describe the same recipe. Unit Economics, Recipes, Production Planning, the
      order week, the dashboard averages and both ledgers call it.
- [x] `laborSplit` is derived per recipe from its labor standard (the adopted study, else its estimated
      study), never typed. The time-study library is passed to every resolver, so an adopted OBSERVED
      study reaches the books; with no library loaded (a test, a script) each recipe carries the code
      estimate the database is seeded with. A loaded library with no study for a recipe is a gap: zero
      minutes, tagged so, and counted. The 180 min/batch and 1.5 min/portion in `plan-data.ts` are the
      fallback for a bare engine call only, labelled so. Labor per meal rests on ESTIMATED studies until an
      observed one is adopted, and is labelled so.
- [x] An approved standard freezes food, labor, packaging **and** the overhead absorption rate. The
      snapshot takes the recipe's own assumptions and `overheadRatePerMeal`, the predetermined rate in force
      at approval. A batch costed at that standard absorbs at the frozen rate; a standard with no frozen
      rate absorbs at the live rate and the ledger says so. `standardDiffers` compares the rate only when
      both sides carry one.
- [x] Fixed cost is not in the cost of a meal; the side metric (§3.5) is computed per period from the
      selected ledger (N6).

**N4a — menu cycles, services and the forecast's inputs — DONE** (decisions 15–20; migration 0071)
- [x] Meal plans (decision 19): a saved menu cycle and a customer's meal plan share `muse.menu_cycles` —
      `customer_id` null is a saved cycle on the shared list, set is that customer's plan, with
      `from_cycle_id` naming the cycle it was copied from and `customer_service_id` scoping a plan to one
      service (it wins over the all-services plan). `assignMenuCycle` copies a saved cycle onto one or many
      customers in one click; `updateMenuCycle` on a saved cycle takes `applyToPlanIds`, the Orders page's
      apply-to picker (this cycle only / all / selection). A programmed plan offers only the recipes listed
      on the customer's channel. `orderBook` reads each customer's plan (`_engine/meal-plans.ts`). Seeded
      saved cycles are the student and adult menus with no channel; a customer without a plan is given a
      copy by the seed writer (`insertMissingMealPlans`).
- [x] Services (decision 17): `muse.customer_services` — name, weekdays, status. An order names its service
      (`orders.customer_service_id`); two services a day are two orders, and the order key carries the
      service.
- [x] Dated volume picks (decision 18): `muse.service_volume_picks`, one per service per date, carried
      forward by `volumeOn`.
- [x] Service calendar (decision 20): `muse.site_calendar_ranges`, terms and breaks per site
      (`siteTakesMealsOn`). Annual demand is the services run across the forecast's first year from its
      start date (`channelDemand`).
- [x] Forecast Customer: customer status `forecast`; stored orders and deliveries against one are refused.
- [x] The forecast's inputs on its overlay (`MuseScenarioConfig.forecast`): start date, horizon, customers
      left out, service picks and weekdays, its own copy of a customer's meal plans, and per-equipment
      status and in-service date (`datedEquipment`, `equipmentInServiceOn`). Equipment has an "In the open
      forecast" column, shown on Plan.
- [x] `planHorizon` and the same-day delivery path pass calendar closures to `productionDateFor` on all
      five planning surfaces.

**N4b — the forecast timeline engine — DONE**
- [x] Enrollment is entered on the site when a school account is created; participation is calculated per
      site on Customers — meals per service on confirmed and delivered orders ÷ enrollment
      (`_engine/participation.ts`) — a sales figure that feeds nothing else.
- [x] `simulateForecast({ inputs, cycles })` (`_engine/forecast-timeline.ts`) runs the resolved forecast
      from its start date for its horizon (decision 3; the selector is beside the start date on Customers
      on Plan) and returns the documents in the actuals shapes — orders (`orderBook`), the rolling
      production horizon (`planHorizon`), batch records at standard — one per cook, the batches loaded at
      the same minute, since the cook is the lot — deliveries at the share each recipe
      was filled, receipts, supplier bills and payments, monthly invoices and collections, biweekly pay
      periods split by account, fixed-cost bills, purchase orders (`PlanPurchaseOrderDoc`), capital
      purchases (`CapitalPurchaseDoc`), loan draws and payments (`LoanDrawDoc`, `LoanPaymentDoc`).
- [x] Capacity on a date: each blast chiller cabinet in service that date is one line — a parallel
      stream running the same one-cabinet batch, never a larger batch
      (`planProductionDay` takes `lines`; batches load on whichever line is free first; zero lines = the
      day's batches are a shortfall). A production day before the forecast start reads the lines the
      forecast opens with.
- [x] Price is the order's, else the customer's contracted price, else the channel price (`orderBook`).
- [x] Normal capacity on the plan's own production: portions produced over the horizon, a year's worth,
      net of planned downtime (`ForecastTimeline.normalCapacity`).
- [x] Linked and deterministic: nothing stored; the same definitions and forecast give the same timeline
      (tested). Measured: the engine-default forecast in 36 ms; three years of five customers at 300–400
      meals a service on the full menu (3,910 orders, 1,514 batch records) in 160 ms. It runs on the client.
- [x] Named gaps instead of filled-in figures: customers with no payment terms (invoices issued, never
      collected), ingredients with no supplier linked or a supplier with no terms (received, not billed),
      ghost-kitchen deposits, fixed-cost lines with no payment terms (taken as paid on the first of the
      month), unfilled meals, production dates with no line in service, undated Phase 2 and 3 equipment.
- Build-time calls: purchasing buys each production day's ingredients in whole cases net of what earlier
  rounding left on hand, received on the production date (no lead time on file); pay periods carry the
  batch records' standard labor (the study's fixed and variable minutes cover both streams); invoices are
  one per invoiced customer per month, issued at month end.

**N5 — the Plan ledger — DONE**
- [x] `postPlanLedger({ timeline, inputs })` (`_engine/plan-ledger.ts`) posts the timeline's documents
      through `postActuals` — one posting path. Document kinds posted there for both ledgers include equity
      contributions, capital purchases, loan draws and payments, and marketplace deposits
      (`_engine/actuals.ts`).
- [x] Monthly, quarterly (calendar) and annual (fiscal = calendar year) statements clipped to the window:
      classified income statement, classified balance sheet at each period end, cash flow direct and
      indirect, asserted equal and balanced every period (tested at one and three years).
- [x] Each forecast absorbs overhead on its **own** production (accounting-policy §4, §17). With no terms
      on file every invoice, bill, delivery cost and marketplace remittance settles on its document date,
      named in the timeline's gaps.
- [x] Build-time calls: the overhead budget each month is the manufacturing-overhead lines in force that
      month; depreciation is straight-line per capital purchase from the month bought; the indirect cash
      flow classifies capital and debt by whether cash moved.
- [x] A receipt's standard is each ingredient's, from any recipe that uses it. A delivery naming its recipe
      relieves that recipe's standard per meal.
- Measured: the engine-default forecast posts in about 115 ms for one year; five customers on the full menu
  for three years (16,811 entries) post in about 1.6 s, server-side.

**N6 — the ledger selector, and every surface on it — DONE**

Statement pages recompute live — the browser sends the working copy and the server posts it, unsaved
edits included. Built in four slices, each reviewed before the next.

- [x] Slice 1 — the selector and the statements. The scenario bar carries a **Plan / Actual** toggle
      (cookie `muse_ledger`, `_state/ledger.tsx`). `loadLedgerBook` and `loadLedgerJournal`
      (`_lib/ledger-actions.ts`, super admins) post Plan through `simulateForecast` → `postPlanLedger` on
      the working copy, and Actual through `postActualLedger` on the recorded documents; both build their
      statements with one function (`_engine/ledger-statements.ts`). P&L, Balance Sheet, Cash Flow and
      Ledger render one layout against the selection with a month / quarter / year picker; Actual with
      nothing on record reads zero with its period named. The Ledger shows the period's journal (evidence
      links on Actual only — Plan entries are generated) and the trial balance through its end.
- [x] A production day does not count stock that expires before the delivery it serves (`planHorizon`,
      tested). Measured on the live definitions: loading them takes about 3 s from a laptop to the
      database; posting the one-year Plan takes about 135 ms.
- [x] Slice 2 — the financial pages. Dashboard (the financials card reads the selected ledger's fiscal year
      on the saved forecast; open purchase orders on record), Unit Economics (the per-meal cost card on the
      definitions; fixed cost per meal and absorption off the selected ledger by month, quarter or year),
      Capital & Financing (a card of capital and debt on the selected ledger beside the definitions it
      edits), Receivables and Payables (server pages on the selected ledger with a month picker in the URL
      — Plan shows the timeline's invoices, bills, purchase orders and aging read-only; Actual records),
      Actuals (always the Actual ledger; its forecast column is the Plan ledger's own month for the same
      period). One server path for pages and actions: `postLedger` / `postSelectedLedger`
      (`_lib/ledgers.ts`).
- [x] Statement periods carry fixed cost per meal on the expense basis and the period's absorption
      (applied, incurred, volume and spending variances) — one computation for both ledgers.
- [x] One absorption basis: Actual batches with no approved standard absorb at the rate the same forecast's
      Plan ledger sets on its own production, and approving a standard freezes the plan of record's Plan
      ledger rate (`standard-actions.ts`). Before any batch posts, the standard per meal to relieve is zero.
      `phaseEconomics` is the per-channel cost of a meal.
- [x] Slice 3 — operations pages on two worlds. **Plan** is the open forecast's own run, nothing
      recordable; **Actual** is customer records, orders on file, recorded stock, receipts and purchase
      orders, with recording live. Master-list edits are open in both, forecast edits on Plan only,
      recording on Actual only. `useOperationsWorld` (`_state/ledger.tsx`) and the note on each page;
      Production Planning, its Calendar and Day Schedule, People Schedule, Procurement, Orders and
      Customers on the two worlds; Compare always runs the Plan world. Inventory is a server page on the
      selected world: Plan reads the saved open forecast's timeline (its batches, receipts and deliveries)
      as of the end of a month picked in the URL, with no trace or recorded links; Actual reads the
      records. Equipment's open-forecast column shows on Plan only. Capacity (plant inputs, crews), Process
      (the route) and Recipes (ingredient lines, supplier links) are read-only on Actual (`EditableNumber`
      takes `disabled`); the recipe library, packaging and standard approval edit in both. HR: punches on
      Actual only; the register edits in both. The Floor always runs Actual: its order book reads the
      customer records' sites with no forecast edit.
- [x] Slice 4 — Sales and the Parent Portal. Sales' quote defaults are the open forecast's School lunches
      price and serving days; Parent Admin and the signup portal read the School lunches price on record
      with no forecast edit (`_lib/channel-price.ts`).
- [x] Slice 4 — Sustainability follows the toggle. Plan reads the forecast's first year from its start
      date; Actual reads the calendar reporting year. Energy and water quantities are records on Actual;
      Plan runs what is loaded into the scenario. Refrigerant service is entered and shown on Actual only.
      The evidence pack follows the toggle. `sustainabilityBasis` (`_engine/sustainability-basis.ts`) turns
      either ledger's documents into the period's meals by recipe and channel, production, receipts and
      deliveries by site, and portions past hold life unshipped; the food footprint is recipe by recipe at
      each channel's portion (`mixFoodFootprint`), with meals naming no recipe and ingredients with no
      food-factor mapping named, never given a factor. Migration 0072: `muse.sustainability_readings`
      (bills, lab results, grease-trap inspections) and `muse.refrigerant_service`, entered by an operator
      and removed by a super admin with the reason, both on the posting trail
      (`_lib/sustainability-record-actions.ts`), folded over the year by `_engine/sustainability-records.ts`.
      Facility, Energy, Water, Waste, Logistics, Refrigerants, Ingredients and Inventory & Audit run on
      `useSustainabilityWorld`; `fullInventory` takes the world (basis, energy, service). Forecast edits
      (LCA basis, supplier links, compost share) are Plan only; the reporting year and audit settings edit
      on either.
- [x] Write separation. Recording surfaces (Floor, receiving, batch close, delivery, invoice, bill,
      payment, punch, sustainability records) write to Actual only; planning surfaces write to the forecast
      only. Every recording control shows on Actual only and an open record form closes on Plan;
      `muse-write-separation.test.ts` asserts no server module writes both a forecast and a recorded
      document, and no recording module reaches the scenario writers.

**N7 — actual against plan — DONE**
- [x] `/muse/financials/plan-v-actual` (admin), under Financials & Accounting: per month or quarter, the
      plan of record's figure, the actual and the difference — the same report on the two ledgers. A totals
      table by group — operations, financial, sustainability, ERRA ratings: meals, revenue, orders, food
      cost, labor hours and cost, served cost per meal, batches, new customers, waste, water, energy,
      emissions (total and by scope), Scope 3 coverage across suppliers, ERRA-rated suppliers and customers
      by stars — and meals, revenue, food cost and orders by recipe, channel and customer.
      `_engine/plan-v-actual.ts` computes one side from its documents and postings — food, labor and
      packaging cost from each batch's posting, distribution from the income statement, sustainability
      through `sustainabilityBasis` and `fullInventory` on the month; `_lib/plan-v-actual.ts` posts each
      distinct plan applied once. A quarter sums its months; ratings read at the last month. Recipes served
      with unmapped ingredients are named, since their food emissions and waste mass read low.
- [x] Rules: each month compares with the plan of record in force at its end; the Plan column of ratings
      tallies the plan's customers; a customer is new in the month of its first order; the plan's annual
      energy and water spread by the meals it makes each month.
- [x] Customer ERRA ratings (migration 0073): status, stars and date on `muse.customers`, set by a super
      admin on Customers (`setCustomerRating`). Muse Kitchen assigns ERRA ratings.
- [x] The plan of record's history. Setting the plan of record posts `set_plan_of_record` to the trail with
      the config as applied (`_engine/plan-of-record.ts`, dated on the kitchen clock) and a copy of the
      master records and meal plans as they stand (`loadDefinitions`, `listMenuCycles`). Plan v Actual posts
      each past month on the copy in force at its end, so an edit to a definition after the plan was set
      does not restate the months it covered. An entry with no copy reads the master records as they stand;
      a month before the first entry reads the plan of record set now and says so.
- Open: the two Scope 3 coverage measures carry working definitions, to be confirmed with Robert.

**N8 — the rolling forecast — DONE** (decision 4)
- [x] Actuals through the as-of date (today), the forecast timeline from the next day: `_lib/plan-v-actual.ts`
      posts a rolling side per month from the records dated through today and the current plan of record's
      timeline documents dated after it, each batch at the posting of the ledger that posted it; the month
      holding today splits at today (selling and distribution, energy and water pro rata to the plan's meals
      after today). Cash at the period end opens from the actual cash balance on the as-of date and rolls the
      plan's cash entries forward from the next day.
- [x] The rolling forecast is a column on Plan v Actual. The plan of record stays unchanged as the budget;
      the rolling forecast is computed, never saved.

**N9 — one source per figure — DONE, one item NOT STARTED**
- [x] Dashboard "today" (`_engine/dashboard-today.ts`) from the order book on the selected world planned as a
      production day; days of cover as finished stock over the coming orders; food cost and batch size as
      active-recipe averages; the food footprint from the sustainability basis. The operator dashboard reads
      production records only (`loadProductionRecords`).
- [x] The supplier directory's linked lines from the next run's net requirement (`_lib/next-run.ts`).
- [x] Unit Economics on the selected recipe's own standard, with a by-channel card on each channel's offered
      recipes (`channelRecipeEconomics`).
- [x] Food Safety's cooling log and the lot directory from closed batch records.
- [x] Recorded deliveries name their recipe through their order; channel names come from the definitions;
      no default price per meal.
- [x] Normal capacity on the plan's own production; a bare engine call absorbs on the production it posts
      (`bundleAbsorption`).
- [x] Volume is the selected world's orders, batches and deliveries, recipe by recipe.
      `accounting-policy.md` §2, §4, §14 and `CLAUDE.md` §9 state this.
- [ ] NOT STARTED — drop `customer_sites.service_days_per_year` and `expected_meals_per_day`. No demand
      reads them; the site loader and seed writer still carry them.

**N10 — conformance — DONE** — `test/muse-conformance.test.ts`
- [x] C1 — a recipe's cost per meal is identical on Unit Economics, Recipes, Production Planning, the Plan
      ledger and the Actual ledger at the same standard.
- [x] C2 — no page, component, state module or server library imports a figure from `plan-data.ts`; labels,
      the HACCP plan and named stated references (facility size, comparison capacities, the NSLP benchmark,
      the plan's 14-task estimate) are allowed by name. Engines and seed modules take plan-data as defaults
      and seeds.
- [x] C3 — the same event posts the same entries whether generated (Plan) or recorded (Actual).
- [x] C4 — with no records, every Actual figure is zero.
- [x] C5 — one test per rule in §5 (A1–A17).
- [x] C6 — every Plan ledger month balances, and its cash flow direct equals indirect (the engine-default
      forecast with its seeded meal plans).

## 5. Conformance rules A1–A17 (asserted by C5)

| # | Rule |
|---|---|
| A1 | Labor has one formula: the cost card and the active-recipe averages charge the same labor per meal |
| A2 | Every recipe carries its own labor standard |
| A3 | Wage has one source: CompTable; the staff register holds no pay |
| A4 | Payroll burden has one source: the timeline and the batch posting read the resolved burden |
| A5 | A receipt of any recipe's ingredient posts at that ingredient's standard, with its price variance |
| A6 | Packaging is each recipe's own picks |
| A7 | The cost of a meal is food, labor and packaging only; fixed cost is not in it |
| A8 | The forecast is costed recipe by recipe, not as one recipe for the year |
| A9 | A delivery naming its recipe relieves that recipe's standard |
| A10 | Normal capacity reads the plan's own production, not a channel table |
| A11 | No typed portions-per-day figure drives any page |
| A12 | The Actuals forecast month is the Plan ledger's own month |
| A13 | Forecast revenue uses the price on the order — contracted or channel — as deliveries do |
| A14 | Parent Portal and Sales read no seed price or days |
| A15 | An approved standard freezes the overhead rate |
| A16 | No hard-coded price and no fixed production-day date |
| A17 | Equipment is the library, and Sustainability keys attributes by the line key |

## 6. Open

- **Recording capital and financing on Actual.** Capital purchases, loan draws, loan payments, equity
  contributions and marketplace deposits post on both ledgers (N5); Actual has no recording surface for
  them yet, so they read zero there.
- **Delivery and commission placement** relative to contribution — deferred (§3.13).
