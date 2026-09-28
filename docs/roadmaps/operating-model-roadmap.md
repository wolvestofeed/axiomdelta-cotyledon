# BUILD PLAN — One operating model: definitions, the Plan ledger, the Actual ledger

Roadmap Phase N. Status: N1 and N3–N10 DONE; one clean-up item under N9 NOT STARTED; one decision
deferred (§3.13); one open item (§6).

---

## 1. What the model serves

1. **Planning.** Robert builds the business on paper — grow plans, equipment, subscribers, services,
   prices, growth — and reads what the business looks like.
2. **Operating.** From launch, recorded activity is the books. Before launch the books are zeros.

Both needs run on one model, with no mode switch between them.

## 2. The model

**One set of definitions, two ledgers, one engine.**

### 2.1 Definitions — what the business is and will be

Grow plans, inputs and supplier catalog prices, packaging, equipment, the leasehold schedule,
subscribers, pickup points and services, subscription cycles and flat plans, suppliers, payment terms, loans,
fixed-cost lines (lease, utilities, admin), the production calendar. Authored once on one master list
per kind, shared by both ledgers.

Every definition carries a **real-world status**, so one list holds what exists and what is planned:

| Definition | Not yet real | Real |
|---|---|---|
| Equipment | Planned (in-service date) · No · – (not selected) | In service |
| Subscriber | Prospect · Forecast Subscriber | Contracted |
| Grow plan | In development | In service |
| Supplier catalog item | Candidate | Approved |
| Loan | Planned (start date) | Funded |
| Fixed-cost line | Planned (start date) | In force (a signed lease, an open utility account) |
| Leasehold line | On record only | Counted |

Roster positions, wages and burden are Staffing's (Phase O, `people-roadmap.md`); Farm holds no pay.

Robert's research figures are the starting values of these definitions, carrying their status tag
(`STATED`, `PLACEHOLDER`, `SOURCED`…). Engines and seed modules take `plan-data.ts` as defaults and
seeds; no page, component, state module or server library reads a figure from it (conformance C2).

### 2.2 The Plan ledger — a forecast, derived, never stored

A forecast is a **dated timeline** from its start date, one to three years long (§3.3). For each
production day on the J1 calendar the engine takes the definitions active on that date — planned ones
included, as the forecast dates them — and generates the events the business would record, in the same
document shapes as actuals:

services × dated volume picks on each pickup point's calendar → orders from each subscriber's flat plan → the
production plan against the lines in service that day → net requirements → purchase orders → receipts
and supplier bills → sowing records at standard → distributions → monthly invoices by terms → collections;
sowing standard labor → pay periods; fixed-cost lines → bills and the overhead accrual; equipment
in-service dates → capital purchases → loan draws, loan payments and depreciation.

The generated events post through the **same posting function** as actuals (`postActuals`), into a
ledger keyed by the forecast. Statements come out by month, quarter and year. Growth, ramp and
seasonality are in the timeline because the timeline is dated. Nothing generated is written to the
database; a change to a definition or a forecast input recomputes the timeline.

Any number of forecasts; one is the **plan of record**.

### 2.3 The Actual ledger — recorded activity only

The Grow Room, receiving, sowing close, distributions, invoices, bills, payments, the time clock and the
sustainability records write here, and nowhere else. Before launch it is empty and every actual view
reads zero. It posts through the same function as the Plan ledger, so actual against plan is the same
report run twice.

### 2.4 The rule

Every page reads the same engine functions against a selected ledger — **Plan: the open forecast** or
**Actual**. Planning surfaces write only to the forecast; recording surfaces write only to Actual;
master-list edits are open on both. Approving a standard freezes the plan of record's Plan ledger
overhead rate, and actual sowings cost at the approved standard.

### 2.5 At launch

Nothing is archived or wiped. Definitions change status as things become real — the equipment is
bought, the subscriber signs, the staff are hired — and the Actual ledger fills from the first recorded
event. The plan of record remains the budget beside it.

## 3. Locked decisions

Numbers are cited from code comments; they are stable.

1. The model in §2.
2. **One master list per kind; no forecast-only definitions.** Anything possible goes on the master
   list carrying its real-world status — Planned equipment, a Developing grow plan, a Prospect subscriber, a
   Planned loan, a leasehold line On record only. Nothing reaches the books by being listed: the Actual
   ledger posts recorded events only. A forecast decides which planned items it uses and from what date,
   through its overlay. Three layers, kept distinct: **definitions** (the master list, read by both
   ledgers) · **plan of record** (one saved forecast, flagged as the budget) · **Actual** (recorded
   events only). A subscriber is created on the master list before a forecast uses it; where no prospect
   or contracted subscriber fits, a **Forecast Subscriber** is created — a master-list subscriber carrying
   manual figures, usable in forecasts and never on Actual.
3. **Forecast horizon:** one year from the start date by default; a forecast expands it to two or three
   years (`forecast.horizonYears`).
4. **Rolling forecast, budget-based:** actuals through the as-of date (today), the plan of record as
   planned after it — no trend re-estimation. It is a column on Plan v Actual, computed and never saved;
   the balance sheet opens from actuals.
5. **The cost of a unit is food + labor + packaging;** fixed cost is not in it. Fixed cost per unit is a
   side metric on the **expense** basis (lease, utilities, admin, depreciation, interest for the period ÷
   the period's units). No break-even-units metric. The cost of a unit is built by SOWING — sowing costing
   from bulk inputs at the sowing one unit of each Phase 1 grow unit takes, the sowing's yield, the sowing
   cost divided into its units — and the **cost to serve** adds distribution on top (a management
   figure; storage is never in it). A sowing binds to one unit of each grow unit it passes through — the
   tightest bounds it, a second unit is a parallel stream, never a larger sowing —
   and planned build-outs never count.
6. The equipment library is the master equipment list (under Production), with inline quantity and
   price, the status filter In service / Planned / No / –, rows with no quantity sorted last. Capital &
   Financing reads its totals from it.
7. **Input price:** the supplier catalog item price is the source when one is on file; the grow plan
   line price stands only until then.
8. **People:** Staffing owns positions, wages and burden; Farm holds no pay (Phase O). Labor minutes
   come from each grow plan's time study; the loaded labor rate is the blended loaded wage, a labelled
   PLACEHOLDER until Staffing's rates arrive (O4). The staff register drives the Actual ledger's
   punches.
9. **What is real today:** one client — a private prospect (name not on file), Subscriptions, 125 units a
   day, five days a week. It is a contracted subscriber definition. Every other subscriber, pickup point and piece of
   equipment in the account is a Plan definition.
10. **Equipment seed status:**
    - **Planned — Phase 1:** everything that makes one hot line and one cold chain — one blackout rack,
      the main sow line (one of each hot-production unit), one walk-in cooler, one walk-in freezer, the
      prep, packaging, warewash, instruments, transport and technology lines the line needs — and about
      25% of the starting wares.
    - **Planned — Phase 2:** the second hot line and cold-chain storage (the second unit of each line
      split out of the quantity-2 rows, the second walk-in cooler and freezer) and more wares; the
      corporate-restaurant lines.
    - The ghost-farm lines are Planned at Phase 3. Service date is **TBD** on every planned row. The
      split is computed from the capex list; no line-by-line review.
11. **Packaging library** — a Packaging page under Production: every package used, sorted by channel,
    hot / cold, material, size and end-of-use rank, with a manual cost and a supplier-based cost. Grow plans
    have a packaging card with a picker from the library. A package is picked (assigned to a grow plan) or
    unpicked (in the library only). A grow plan's packaging per unit is the sum of its picks at the library's
    cost; a package with no cost entered counts as zero, and a grow plan that picks nothing carries zero.
12. **Forecast start date:** 2027-01-01, with the Phase K fiscal year and loan start.
13. **Deferred:** where distribution and marketplace commission sit relative to contribution — the current
    treatment stands until raised.
14. **Build-time calls, not questions:** station and capacity details (rice's station, assembly and sealer
    capacity) are taken from the time study and the capex list at build time; a missing figure is shown
    as a gap.
15. **Two forecasts, one chain.** The **Production Planning Forecast** is an open planning calculator
    built by hand: which subscribers and pickup points, their services, units per service, service days, service
    calendar, flat plans, volume changes, equipment in-service dates. **Nothing in it is automated** — no
    growth rate, conversion curve or fill-to-capacity; the engine only extends the entered figures across
    the dated calendar and reports what they produce against capacity and staffing. The **Budget
    Forecast** lives in the accounting engine and works as a traditional budget built from a saved
    Production Planning Forecast (the plan of record). The purpose: plan growth on capacity and staffing,
    intentional expansions, and the sales velocity that becomes known over time.
16. **The budget stays linked.** Every forecast, the Budget Forecast included, always reads current
    values; a change to a definition (an input price, a time study) recomputes every forecast (§2.2).
17. **A service is one unit occasion** — one loading and harvest/distribution of an order. Two orders to a
    pickup point in a day are two services that day. Volume is units per service.
18. **Volume changes are dated picks that carry forward.** A service's volume is raised or lowered on
    dates the operator picks; from each pick the volume extends until the next, and is zero before the
    first.
19. **Channels, subscription cycles and flat plans.**
    - A subscriber's **channel** groups it with that revenue channel and sets which grow plans are offered to it
      (the grow plan's `channels`). It says nothing about what the subscriber is served.
    - Every subscriber has its own **flat plan** — its grow plan schedule — set up one of two ways: a saved
      **subscription cycle** assigned to the subscriber in one click, or a grow plan schedule programmed for that
      subscriber alone. A programmed plan is not saved or offered to anyone else and can change at any time.
    - **Subscription cycles** are a shared list of named, saved grow plan sequences, used only as a starting point for
      a subscriber's flat plan. Channels are not assigned cycles.
    - Assigning a cycle copies it into the subscriber's flat plan. When a saved cycle is edited, a picker
      applies the change to **selected subscribers** or to **all subscribers** whose plan came from it; a
      subscriber not picked keeps its plan as it is.
    - **In a forecast** a subscriber's flat plan loads as it stands on the subscriber record and can be edited
      there without changing the record. Until the forecast edits it, it follows the record (decision 16);
      once edited, the forecast holds its own. Subscriber records and recorded orders drive real operations;
      a forecast never writes to either.
    - Every service has a flat plan. Only recorded orders post to a subscriber's Actuals. The seeded
      two-week prospect menu is the menu; the grow plan library and cycles are edited in place.
20. **Service calendar and equipment dates.** Every pickup point has its own service calendar — term dates and
    breaks for a prospect — entered when the subscriber account is set up and held on the pickup point; no two are
    assumed alike. A pickup point with no term entered serves every service weekday the farm is open, and
    Subscribers says the calendar is not on file. The farm runs year-round. Planned Phase 1 equipment is
    in service from the forecast start; Phase 2 and 3 are out of service until a forecast dates them.

## 4. Steps

Each step is built and reviewed on its own before the next starts.

**N1 — definitions with real-world status — DONE**
- [x] `farm.equipment` (migration 0058) from the capex seed: item, category, status (in_service / planned
      / no / unset), quantity, unit cost, new/used, build-out phase, critical, service date (null = TBD),
      notes, list position. Sustainability's equipment attributes, spec-sheet links and entity links key
      on the row's stable `key` — the item name; a split row's second half is `<item> (Phase 2)`.
- [x] Equipment seed status per §3.10, computed by `equipmentSeed`: Phase 1 $589,200, Phase 2 $527,775,
      Phase 3 $77,800; $1,194,775 in total.
- [x] The equipment library page (`/farm/grow-units`, Production): inline quantity, unit cost, status,
      phase, service date and new/used (super admins); the status filter In service / Planned / No / –;
      rows with no quantity last; add a row; collapses by category, one open at a time. Capital &
      Financing, depreciation, financing, the Dashboard, Sustainability Equipment and Refrigerants, the
      GHG inventory, the evidence pack and the entity directory read it through the resolver
      (`ResolvedInputs.equipment`).
- [x] Subscribers carry prospect / contracted (and forecast, N4a). The one real client (§3.9) is seeded
      contracted — a private prospect on Subscriptions, 125 units a day, five days a week, name and
      contracted price not on file, and the row says so. Every other seed subscriber is a prospect carrying
      no volume. `planSeedSubscribers()` is the database seed; `seedSubscribers()` is the engine default for an
      empty library. Demand carries the split — `contractedUnitsPerDay`, `contractedAnnualUnits`,
      `contractedSubscribers` per channel and `contractedAnnualUnits` in total — and the Subscribers page reads
      contracted against planned on every channel tile.
- [x] `farm.packages` and `farm.growPlan_packages` (migration 0059) — the packaging library: what a unit
      leaves the farm in (containers, lids, labels), never packaging equipment. Channels, hot / cold,
      material, size, end of use and its rank, a manual unit cost, and a supplier catalog item whose price
      is the supplier-based cost (per each, or per pack ÷ units per pack). `/farm/packaging` under
      Production, grouped by channel and collapsing one at a time, sorted hot / cold, material, size, rank.
      Grow plan picks carry a per-unit count; the packaging card is on Grow plans. Seeded with three packages —
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
- [x] Grow plan lines price from the input item (decision 7). `resolveInputPrice`
      (`_engine/input-price.ts`) is the one answer: the line's linked supplier → that supplier's
      APPROVED catalog line → the price in force on the date → and its basis must be the unit the line is
      bought in. A price per case against a line bought by the pound is not converted — the catalog's pack
      size is free text. Every refusal carries its reason, one entry per line in
      `ResolvedInputs.inputPrices`. Precedence: a price typed on the scenario, then the catalog, then
      the grow plan line's own figure. Where the catalog prices a line the resolver writes it onto
      `seedUnitCost` and tags the line SOURCED with the supplier, item and effective date, so costing, net
      requirements, purchase orders and both ledgers read it. Grow plans and Procurement show the provenance
      per line; with no catalog on file every line reads its grow plan figure and says no supplier is linked.
- [x] `farm.loans` (planned / funded, principal, APR, term, start date) and `farm.fixed_cost_lines`
      (category, monthly amount, start and end dates, status, `treatment`) (migration 0068). A loan's
      principal is TYPED: a loan may be for less than the capex it finances or carry a deposit, so the
      capex total for the same purpose is reported beside it and any gap is named, not closed. Financing
      is what the loans say, each on its own principal, rate, term and start date, through `capexRollup`,
      `fixedExpenseForMonth` and the current unit of long-term debt. A fixed-cost line's `treatment` is
      the accounting fact, never inferred from the label — manufacturing overhead absorbs into inventory on
      normal capacity and G&A stays out (ASC 330-10-30-8). A month before a line starts carries none of it.
      Capital & Financing edits both per scenario; a super admin adds or removes rows in the library.
- [x] `farm.leasehold_lines` (migration 0069): the leasehold schedule as a definition. Each line is
      **counted** or **on record only**; an uncounted line keeps its figure and stays out of the subtotal,
      total capital, depreciation and the leasehold loan's comparison, reported separately. Extended cost
      is the figure of record; $/sq ft derives from it against the facility size. None of the rates is a
      quote, and the card says so.

**N3 — the standard cost of a unit, per grow plan per date — DONE**
- [x] One function per quantity: food (catalog price in force × the grow plan's SEED quantities, with shrink)
      + labor (the grow plan's own labor standard: fixed minutes per sowing and variable minutes per unit
      from its time study, at the loaded labor rate) + packaging (the sum of the grow plan's picked packages,
      each at its supplier cost when on file, else its manual cost; zero where no cost is entered or
      nothing is picked). The resolver writes each grow plan's own labor standard and packaging into
      per-grow-plan assumptions (`growPlanAssumptions`, read through `assumptionsFor`, built in
      `_engine/unit-cost.ts`), so `costPerUnit`, `laborForDay` and the sowing ledger are the single
      functions and receive the grow plan's inputs. `assumptions` is the reference grow plan's, so `grow_plan` and
      `assumptions` always describe the same grow plan. Unit Economics, Grow plans, Production Planning, the
      order week, the dashboard averages and both ledgers call it.
- [x] `laborSplit` is derived per grow plan from its labor standard (the adopted study, else its estimated
      study), never typed. The time-study library is passed to every resolver, so an adopted OBSERVED
      study reaches the books; with no library loaded (a test, a script) each grow plan carries the code
      estimate the database is seeded with. A loaded library with no study for a grow plan is a gap: zero
      minutes, tagged so, and counted. The 180 min/sowing and 1.5 min/unit in `plan-data.ts` are the
      fallback for a bare engine call only, labelled so. Labor per unit rests on ESTIMATED studies until an
      observed one is adopted, and is labelled so.
- [x] An approved standard freezes food, labor, packaging **and** the overhead absorption rate. The
      snapshot takes the grow plan's own assumptions and `overheadRatePerUnit`, the predetermined rate in force
      at approval. A sowing costed at that standard absorbs at the frozen rate; a standard with no frozen
      rate absorbs at the live rate and the ledger says so. `standardDiffers` compares the rate only when
      both sides carry one.
- [x] Fixed cost is not in the cost of a unit; the side metric (§3.5) is computed per period from the
      selected ledger (N6).

**N4a — subscription cycles, services and the forecast's inputs — DONE** (decisions 15–20; migration 0071)
- [x] Flat plans (decision 19): a saved subscription cycle and a subscriber's flat plan share `farm.subscription_cycles` —
      `subscriber_id` null is a saved cycle on the shared list, set is that subscriber's plan, with
      `from_cycle_id` naming the cycle it was copied from and `subscriber_service_id` scoping a plan to one
      service (it wins over the all-services plan). `assignSubscriptionCycle` copies a saved cycle onto one or many
      subscribers in one click; `updateSubscriptionCycle` on a saved cycle takes `applyToPlanIds`, the Orders page's
      apply-to picker (this cycle only / all / selection). A programmed plan offers only the grow plans listed
      on the subscriber's channel. `orderBook` reads each subscriber's plan (`_engine/flat-plans.ts`). Seeded
      saved cycles are the student and adult menus with no channel; a subscriber without a plan is given a
      copy by the seed writer (`insertMissingFlatPlans`).
- [x] Services (decision 17): `farm.subscriber_services` — name, weekdays, status. An order names its service
      (`orders.subscriber_service_id`); two services a day are two orders, and the order key carries the
      service.
- [x] Dated volume picks (decision 18): `farm.service_volume_picks`, one per service per date, carried
      forward by `volumeOn`.
- [x] Service calendar (decision 20): `farm.pickupPoint_calendar_ranges`, terms and breaks per pickup point
      (`pickupPointTakesUnitsOn`). Annual demand is the services run across the forecast's first year from its
      start date (`channelDemand`).
- [x] Forecast Subscriber: subscriber status `forecast`; stored orders and distributions against one are refused.
- [x] The forecast's inputs on its overlay (`FarmScenarioConfig.forecast`): start date, horizon, subscribers
      left out, service picks and weekdays, its own copy of a subscriber's flat plans, and per-equipment
      status and in-service date (`datedEquipment`, `equipmentInServiceOn`). Equipment has an "In the open
      forecast" column, shown on Plan.
- [x] `planHorizon` and the same-day distribution path pass calendar closures to `productionDateFor` on all
      five planning surfaces.

**N4b — the forecast timeline engine — DONE**
- [x] Enrollment is entered on the pickup point when a prospect account is created; participation is calculated per
      pickup point on Subscribers — units per service on confirmed and distributed orders ÷ enrollment
      (`_engine/participation.ts`) — a sales figure that feeds nothing else.
- [x] `simulateForecast({ inputs, cycles })` (`_engine/forecast-timeline.ts`) runs the resolved forecast
      from its start date for its horizon (decision 3; the selector is beside the start date on Subscribers
      on Plan) and returns the documents in the actuals shapes — orders (`orderBook`), the rolling
      production horizon (`planHorizon`), sowing records at standard — one per sow, the sowings loaded at
      the same minute, since the sow is the lot — distributions at the share each grow plan
      was filled, receipts, supplier bills and payments, monthly invoices and collections, biweekly pay
      periods split by account, fixed-cost bills, purchase orders (`PlanPurchaseOrderDoc`), capital
      purchases (`CapitalPurchaseDoc`), loan draws and payments (`LoanDrawDoc`, `LoanPaymentDoc`).
- [x] Capacity on a date: each blackout rack rack in service that date is one line — a parallel
      stream running the same one-rack sowing, never a larger sowing
      (`planProductionDay` takes `lines`; sowings load on whichever line is free first; zero lines = the
      day's sowings are a shortfall). A production day before the forecast start reads the lines the
      forecast opens with.
- [x] Price is the order's, else the subscriber's contracted price, else the channel price (`orderBook`).
- [x] Normal capacity on the plan's own production: units produced over the horizon, a year's worth,
      net of planned downtime (`ForecastTimeline.normalCapacity`).
- [x] Linked and deterministic: nothing stored; the same definitions and forecast give the same timeline
      (tested). Measured: the engine-default forecast in 36 ms; three years of five subscribers at 300–400
      units a service on the full menu (3,910 orders, 1,514 sowing records) in 160 ms. It runs on the client.
- [x] Named gaps instead of filled-in figures: subscribers with no payment terms (invoices issued, never
      collected), inputs with no supplier linked or a supplier with no terms (received, not billed),
      ghost-farm deposits, fixed-cost lines with no payment terms (taken as paid on the first of the
      month), unfilled units, production dates with no line in service, undated Phase 2 and 3 equipment.
- Build-time calls: purchasing buys each production day's inputs in whole cases net of what earlier
  rounding left on hand, received on the production date (no lead time on file); pay periods carry the
  sowing records' standard labor (the study's fixed and variable minutes cover both streams); invoices are
  one per invoiced subscriber per month, issued at month end.

**N5 — the Plan ledger — DONE**
- [x] `postPlanLedger({ timeline, inputs })` (`_engine/plan-ledger.ts`) posts the timeline's documents
      through `postActuals` — one posting path. Document kinds posted there for both ledgers include equity
      contributions, capital purchases, loan draws and payments, and marketplace deposits
      (`_engine/actuals.ts`).
- [x] Monthly, quarterly (calendar) and annual (fiscal = calendar year) statements clipped to the window:
      classified income statement, classified balance sheet at each period end, cash flow direct and
      indirect, asserted equal and balanced every period (tested at one and three years).
- [x] Each forecast absorbs overhead on its **own** production (accounting-policy §4, §17). With no terms
      on file every invoice, bill, distribution cost and marketplace remittance settles on its document date,
      named in the timeline's gaps.
- [x] Build-time calls: the overhead budget each month is the manufacturing-overhead lines in force that
      month; depreciation is straight-line per capital purchase from the month bought; the indirect cash
      flow classifies capital and debt by whether cash moved.
- [x] A receipt's standard is each input's, from any grow plan that uses it. A distribution naming its grow plan
      relieves that grow plan's standard per unit.
- Measured: the engine-default forecast posts in about 115 ms for one year; five subscribers on the full menu
  for three years (16,811 entries) post in about 1.6 s, server-side.

**N6 — the ledger selector, and every surface on it — DONE**

Statement pages recompute live — the browser sends the working copy and the server posts it, unsaved
edits included. Built in four slices, each reviewed before the next.

- [x] Slice 1 — the selector and the statements. The scenario bar carries a **Plan / Actual** toggle
      (cookie `farm_ledger`, `_state/ledger.tsx`). `loadLedgerBook` and `loadLedgerJournal`
      (`_lib/ledger-actions.ts`, super admins) post Plan through `simulateForecast` → `postPlanLedger` on
      the working copy, and Actual through `postActualLedger` on the recorded documents; both build their
      statements with one function (`_engine/ledger-statements.ts`). P&L, Balance Sheet, Cash Flow and
      Ledger render one layout against the selection with a month / quarter / year picker; Actual with
      nothing on record reads zero with its period named. The Ledger shows the period's journal (evidence
      links on Actual only — Plan entries are generated) and the trial balance through its end.
- [x] A production day does not count stock that expires before the distribution it serves (`planHorizon`,
      tested). Measured on the live definitions: loading them takes about 3 s from a laptop to the
      database; posting the one-year Plan takes about 135 ms.
- [x] Slice 2 — the financial pages. Dashboard (the financials card reads the selected ledger's fiscal year
      on the saved forecast; open purchase orders on record), Unit Economics (the per-unit cost card on the
      definitions; fixed cost per unit and absorption off the selected ledger by month, quarter or year),
      Capital & Financing (a card of capital and debt on the selected ledger beside the definitions it
      edits), Receivables and Payables (server pages on the selected ledger with a month picker in the URL
      — Plan shows the timeline's invoices, bills, purchase orders and aging read-only; Actual records),
      Actuals (always the Actual ledger; its forecast column is the Plan ledger's own month for the same
      period). One server path for pages and actions: `postLedger` / `postSelectedLedger`
      (`_lib/ledgers.ts`).
- [x] Statement periods carry fixed cost per unit on the expense basis and the period's absorption
      (applied, incurred, volume and spending variances) — one computation for both ledgers.
- [x] One absorption basis: Actual sowings with no approved standard absorb at the rate the same forecast's
      Plan ledger sets on its own production, and approving a standard freezes the plan of record's Plan
      ledger rate (`standard-actions.ts`). Before any sowing posts, the standard per unit to relieve is zero.
      `phaseEconomics` is the per-channel cost of a unit.
- [x] Slice 3 — operations pages on two worlds. **Plan** is the open forecast's own run, nothing
      recordable; **Actual** is subscriber records, orders on file, recorded stock, receipts and purchase
      orders, with recording live. Master-list edits are open in both, forecast edits on Plan only,
      recording on Actual only. `useOperationsWorld` (`_state/ledger.tsx`) and the note on each page;
      Production Planning, its Calendar and Day Schedule, People Schedule, Procurement, Orders and
      Subscribers on the two worlds; Compare always runs the Plan world. Inventory is a server page on the
      selected world: Plan reads the saved open forecast's timeline (its sowings, receipts and distributions)
      as of the end of a month picked in the URL, with no trace or recorded links; Actual reads the
      records. Equipment's open-forecast column shows on Plan only. Capacity (plant inputs, crews), Process
      (the route) and Grow plans (input lines, supplier links) are read-only on Actual (`EditableNumber`
      takes `disabled`); the grow plan library, packaging and standard approval edit in both. HR: punches on
      Actual only; the register edits in both. The Grow Room always runs Actual: its order book reads the
      subscriber records' pickup points with no forecast edit.
- [x] Slice 4 — Sales and the Parent Portal. Sales' quote defaults are the open forecast's Subscriptions
      price and serving days; Parent Admin and the signup portal read the Subscriptions price on record
      with no forecast edit (`_lib/channel-price.ts`).
- [x] Slice 4 — Sustainability follows the toggle. Plan reads the forecast's first year from its start
      date; Actual reads the calendar reporting year. Energy and water quantities are records on Actual;
      Plan runs what is loaded into the scenario. Refrigerant service is entered and shown on Actual only.
      The evidence pack follows the toggle. `sustainabilityBasis` (`_engine/sustainability-basis.ts`) turns
      either ledger's documents into the period's units by grow plan and channel, production, receipts and
      distributions by pickup point, and units past shelf life unshipped; the food footprint is grow plan by grow plan at
      each channel's unit (`mixFoodFootprint`), with units naming no grow plan and inputs with no
      food-factor mapping named, never given a factor. Migration 0072: `farm.sustainability_readings`
      (bills, lab results, grease-trap inspections) and `farm.refrigerant_service`, entered by an operator
      and removed by a super admin with the reason, both on the posting trail
      (`_lib/sustainability-record-actions.ts`), folded over the year by `_engine/sustainability-records.ts`.
      Facility, Energy, Water, Waste, Logistics, Refrigerants, Inputs and Inventory & Audit run on
      `useSustainabilityWorld`; `fullInventory` takes the world (basis, energy, service). Forecast edits
      (LCA basis, supplier links, compost share) are Plan only; the reporting year and audit settings edit
      on either.
- [x] Write separation. Recording surfaces (Grow Room, receiving, sowing close, distribution, invoice, bill,
      payment, punch, sustainability records) write to Actual only; planning surfaces write to the forecast
      only. Every recording control shows on Actual only and an open record form closes on Plan;
      `farm-write-separation.test.ts` asserts no server module writes both a forecast and a recorded
      document, and no recording module reaches the scenario writers.

**N7 — actual against plan — DONE**
- [x] `/farm/financials/plan-v-actual` (admin), under Financials & Accounting: per month or quarter, the
      plan of record's figure, the actual and the difference — the same report on the two ledgers. A totals
      table by group — operations, financial, sustainability, RATING ratings: units, revenue, orders, food
      cost, labor hours and cost, served cost per unit, sowings, new subscribers, waste, water, energy,
      emissions (total and by scope), Scope 3 coverage across suppliers, rating-rated suppliers and subscribers
      by stars — and units, revenue, input cost and orders by grow plan, channel and subscriber.
      `_engine/plan-v-actual.ts` computes one side from its documents and postings — food, labor and
      packaging cost from each sowing's posting, distribution from the income statement, sustainability
      through `sustainabilityBasis` and `fullInventory` on the month; `_lib/plan-v-actual.ts` posts each
      distinct plan applied once. A quarter sums its months; ratings read at the last month. Grow plans served
      with unmapped inputs are named, since their food emissions and waste mass read low.
- [x] Rules: each month compares with the plan of record in force at its end; the Plan column of ratings
      tallies the plan's subscribers; a subscriber is new in the month of its first order; the plan's annual
      energy and water spread by the units it makes each month.
- [x] Subscriber RATING ratings (migration 0073): status, stars and date on `farm.subscribers`, set by a super
      admin on Subscribers (`setSubscriberRating`). The farm assigns RATING ratings.
- [x] The plan of record's history. Setting the plan of record posts `set_plan_of_record` to the trail with
      the config as applied (`_engine/plan-of-record.ts`, dated on the farm clock) and a copy of the
      master records and flat plans as they stand (`loadDefinitions`, `listSubscriptionCycles`). Plan v Actual posts
      each past month on the copy in force at its end, so an edit to a definition after the plan was set
      does not restate the months it covered. An entry with no copy reads the master records as they stand;
      a month before the first entry reads the plan of record set now and says so.
- Open: the two Scope 3 coverage measures carry working definitions, to be confirmed with Robert.

**N8 — the rolling forecast — DONE** (decision 4)
- [x] Actuals through the as-of date (today), the forecast timeline from the next day: `_lib/plan-v-actual.ts`
      posts a rolling side per month from the records dated through today and the current plan of record's
      timeline documents dated after it, each sowing at the posting of the ledger that posted it; the month
      holding today splits at today (selling and distribution, energy and water pro rata to the plan's units
      after today). Cash at the period end opens from the actual cash balance on the as-of date and rolls the
      plan's cash entries forward from the next day.
- [x] The rolling forecast is a column on Plan v Actual. The plan of record stays unchanged as the budget;
      the rolling forecast is computed, never saved.

**N9 — one source per figure — DONE, one item NOT STARTED**
- [x] Dashboard "today" (`_engine/dashboard-today.ts`) from the order book on the selected world planned as a
      production day; days of cover as finished stock over the coming orders; input cost and sowing size as
      active-grow-plan averages; the food footprint from the sustainability basis. The operator dashboard reads
      production records only (`loadProductionRecords`).
- [x] The supplier directory's linked lines from the next run's net requirement (`_lib/next-run.ts`).
- [x] Unit Economics on the selected grow plan's own standard, with a by-channel card on each channel's offered
      grow plans (`channelGrowPlanEconomics`).
- [x] Produce Safety's cooling log and the lot directory from closed sowing records.
- [x] Recorded distributions name their grow plan through their order; channel names come from the definitions;
      no default price per unit.
- [x] Normal capacity on the plan's own production; a bare engine call absorbs on the production it posts
      (`bundleAbsorption`).
- [x] Volume is the selected world's orders, sowings and distributions, grow plan by grow plan.
      `accounting-policy.md` §2, §4, §14 and `CLAUDE.md` §9 state this.
- [ ] NOT STARTED — drop `subscriber_pickupPoints.service_days_per_year` and `expected_units_per_day`. No demand
      reads them; the pickup point loader and seed writer still carry them.

**N10 — conformance — DONE** — `test/farm-conformance.test.ts`
- [x] C1 — a grow plan's cost per unit is identical on Unit Economics, Grow plans, Production Planning, the Plan
      ledger and the Actual ledger at the same standard.
- [x] C2 — no page, component, state module or server library imports a figure from `plan-data.ts`; labels,
      the HACCP plan and named stated references (facility size, comparison capacities, the NSLP benchmark,
      the plan's 14-task estimate) are allowed by name. Engines and seed modules take plan-data as defaults
      and seeds.
- [x] C3 — the same event posts the same entries whether generated (Plan) or recorded (Actual).
- [x] C4 — with no records, every Actual figure is zero.
- [x] C5 — one test per rule in §5 (A1–A17).
- [x] C6 — every Plan ledger month balances, and its cash flow direct equals indirect (the engine-default
      forecast with its seeded flat plans).

## 5. Conformance rules A1–A17 (asserted by C5)

| # | Rule |
|---|---|
| A1 | Labor has one formula: the cost card and the active-grow-plan averages charge the same labor per unit |
| A2 | Every grow plan carries its own labor standard |
| A3 | Wage has one source: Staffing; the staff register holds no pay |
| A4 | Payroll burden has one source: the timeline and the sowing posting read the resolved burden |
| A5 | A receipt of any grow plan's input posts into raw materials at the price received, with no price variance |
| A6 | Packaging is each grow plan's own picks |
| A7 | The cost of a unit is food, labor and packaging only; fixed cost is not in it |
| A8 | The forecast is costed grow plan by grow plan, not as one grow plan for the year |
| A9 | A distribution naming its grow plan relieves that grow plan's standard |
| A10 | Normal capacity reads the plan's own production, not a channel table |
| A11 | No typed units-per-day figure drives any page |
| A12 | The Actuals forecast month is the Plan ledger's own month |
| A13 | Forecast revenue uses the price on the order — contracted or channel — as distributions do |
| A14 | Parent Portal and Sales read no seed price or days |
| A15 | An approved standard freezes the overhead rate |
| A16 | No hard-coded price and no fixed production-day date |
| A17 | Equipment is the library, and Sustainability keys attributes by the line key |

## 6. Open

- **Recording capital and financing on Actual.** Capital purchases, loan draws, loan payments, equity
  contributions and marketplace deposits post on both ledgers (N5); Actual has no recording surface for
  them yet, so they read zero there.
- **Distribution and commission placement** relative to contribution — deferred (§3.13).
