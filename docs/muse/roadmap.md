# Impact OS — Roadmap

Build phases for Impact OS, Muse Kitchen's operations and production-planning platform, a private
authenticated route group inside CompTable. Interview deadline: **Friday 2026-09-18.** The
organizing goal for that date: a full navigable module surface driven by real plan data, with a
working golden path through one recipe.

Vocabulary mirrors CompTable: **Build plan → Phases → Steps.** This file is the outline and the
only place phase status lives; step detail for Phases L, N, O and P and the scheduler lives in the
build plans in [`roadmaps/`](roadmaps/).

## Locked decisions

- **Code location:** route groups under `apps/web/src/app/(muse)/` inside `@ct/web` — the OS in
  `muse/` with its own layout; the Floor, the portals and the front door as sibling route groups,
  each with its own shell (CLAUDE.md §8).
- **Database:** the `muse` Postgres schema in CompTable's Neon database, isolated from `public`, with
  its own hand-written migrations (`packages/db/drizzle/NNNN_muse_*.sql`).
- **URL:** the OS runs at `/muse` on the CompTable deployment. When it goes live it moves to its own
  address, off CompTable, and the main URL becomes a marketing site whose sign-in and sign-up call the
  P7 router ([`roadmaps/portals-roadmap.md`](roadmaps/portals-roadmap.md) §2a).
- **Git:** Muse work commits directly to `main`, which Vercel deploys, within the Muse scope boundary
  (CLAUDE.md §7).
- **Shell:** built in CompTable's Clerk-7 / Tailwind-4 conventions with a scoped `muse.css`, isolated
  from CompTable's `ct-` theme; the Muse Kitchen brand stack in the sidebar; text-only nav (no icons).
- **Training:** training documents are built (Phase E). The course/sequence model and staged import are
  ported from the Coach Website Template, with players built fresh.

## Phases

### Phase A — live and empty  status: DONE
- [x] `docs/muse/` docs
- [x] Route group + own layout, Clerk gate on the admin and operator roles (CLAUDE.md §10)
- [x] `proxy.ts` protected-matcher entry for `/muse`
- [x] Authenticated shell + Dashboard as the landing surface
- [x] Deployed from `main` on Vercel; the admins sign in

### Phase B — the shell + all modules  status: DONE
- [x] Muse shell: sidebar nav (text-only), topbar, brand, status-badge component, KPI tiles,
      scoped `muse.css`
- [x] Every module page with real layout and honest states; the sidebar, sections and per-module
      live / partial / designed status are one list in `_components/nav.ts`

### Phase E — the rest  status: IN PROGRESS
- [x] **Reports** (2026-09-18) — the report library at `/muse/reports`: a tab per section of the main menu in
      the menu's order, at least one report package per section (28 in all), each opening at summary rows with
      its detail rows on a toggle; search, a lens filter (performance · loss & leakage · alerts & compliance ·
      utilisation & staffing · sustainability), sort by menu order, title or most recently viewed; a "Most
      recently viewed" box listing the last five opened, held in a cookie per reader (`muse_recent_reports`);
      and a workbook export per section or per report (`/muse/reports/export`). Every row is built on the server
      from the same engine functions and records the module pages read (`_lib/reports.ts`); the catalog, the
      filter, sort and recent helpers are pure (`_engine/reports.ts`, tested). Admin-only packages — the
      financial statements, aging, Plan v Actual, hours by person, customer invoices — are built for admins alone,
      so an operator's page never reads them. Reports that follow the ledger say so; records-only reports read the
      recorded documents whatever is selected. The tab pattern's scope decision is amended for this page
      (`roadmaps/tabbed-layout-roadmap.md` §1.4). The four subjects named at design time map to: production history
      → *Production history by month*; waste → *Waste and end-of-life* and *Inventory position*; forecast accuracy →
      *Order book and delivered against ordered* and *Plan v Actual*; cost trend → *Cost of a meal and fixed cost
      per meal, by month*.
- [x] **Export page** (2026-09-18) — the Reports follow-up: an *Export page — XLSX* button in the right column of every page
      header inside the OS (Robert, 2026-09-18), so every module page exports as it stands. The button reads what the page rendered — every KPI tile and every table, each
      under the title of the card it sits in — and posts it to `/muse/export`, which writes the workbook
      (`_engine/page-export.ts` bounds and validates the body; `_lib/page-export.ts` writes it; tested). The file
      equals the screen: the open tab, the selected world and period, unsaved edits included; nothing is recomputed.
      Operator-gated, and an admin-only page never rendered for an operator, so the route widens nothing.
- [ ] Reports follow-ups still open: a print stylesheet for the library (TODO.md § Reports).
- [ ] Sites & Delivery: supplier compliance documents, delivery routes, temperature at load
      (temperature at hand-off is on the delivery record, I4)
- [x] **Training documents** (migration 0070): `muse.training_docs` holds every version of a document —
      never overwritten, each timestamped in (`published_at`) and out (`archived_at`) of active status,
      with the version that follows it recorded. Publishing archives its predecessor at the same
      instant, so the record shows no gap and the database enforces at most one active version per
      document. `muse.training_assignments` records completion against the VERSION, so "read and
      acknowledged v1" stays true after v2. Assignment follows the staff register: joining it is the
      assignment, so a new hire's orientation list appears without anyone creating it. Publishing
      carries a checkbox, defaulted ON (Robert): everyone re-completes, or the people who completed the
      previous version carry it forward — whichever was chosen is recorded on the version. The file is
      stored inline and served only to a signed-in operator. Completing is the person's own act; no one
      records it for anyone else. Loaded: "Commissary Kitchen Operations & Culinary Foundations" v1.
- [x] **Training document: Plan, Forecasts and Compare** (2026-09-19) — `docs/muse/training/plan-forecasts-compare-training.html`,
      an in-house branded one-pager: the vocabulary (plan of record, forecast, working copy, Plan and Actual, figure
      tags), the Plan/Actual toggle, editing a plan and saving it as a forecast, and the Compare page's Day and Recipe
      tabs step by step. Not yet loaded into the Training library: the importer takes pdf/docx/xlsx/csv/txt/md, not HTML.
- [ ] Training course port (course/sequence model + staged import + fresh media player)

### Phase F — CPA-grade production accounting  status: DONE

Cross-referenced against ISO/IEC 62264 (ISA-95) for the plant/enterprise split, ISO 22400 for the
planned-vs-actual scrap distinction, ISO 9001:2015 §8.7 for the nonconforming-output record,
ISO 22000 / FDA Food Code for the cooling CCP, FSMA 204 for traceability, and ASC 330 / IAS 2 for
measurement. Policy lives in [`accounting-policy.md`](accounting-policy.md).

**F1 — the portion spec is a constraint, not a preference**
- [x] `_data/meal-pattern.ts` — NSLP lunch pattern by grade group, effective-dated; Exhibit A grain
      groups; M/MA and legume conversions; USDA round-DOWN rounding; production-record elements
- [x] `_engine/crediting.ts` — crediting on the served COMPONENT, the 1/8-cup floor per component,
      component totals rounded once; `minimumPortionFactor()` solves the portion floor
- [x] Crediting spec on every ingredient line, with the cooked cup weight a volume-credited line
      requires — a line without one is reported as uncreditable, never guessed
- [x] The portion by citation: AMK-E-001 is AP 9.450 oz / plated 12.33 oz; it credits 2.75 oz eq M/MA
      and exactly 2.00 oz eq grains = the grades 9-12 daily minimum, with 5.3% headroom.

**F2 — the weight and cost chain**
- [x] Stage weights per line and per component (AP, EP, cooked, chilled, plated) with a cost rate at
      each: `$/lb AP`, `$/lb EP`, `$/lb cooked`, `$/plated oz`
- [x] `componentCosting()` — the served component as the unit of cooking, chilling, lot coding,
      crediting and work-in-process costing
- [x] `reconcileToSpec()` — spec floor against authored quantities, and against the serving vessel
- [x] Optional `trimYield` and `chillYield` on a line, left undefined rather than invented: USDA FBG
      factors are AP → cooked-and-drained and already include trim, and no chill-stage loss has been
      observed
- [x] The cooked-to-chilled gap is the cold-packed cheese and tortilla. Only hot components enter the
      cabinet.

**F3 — three-stage work in process and the standard-cost ledger**
- [x] `_data/coa-muse.ts` — manufacturing extension to CompTable's shared chart (WIP-Cook, WIP-Chill,
      WIP-Pack, Finished Goods, Packaging, GR/IR, six variance accounts, overhead applied, abnormal
      spoilage, marketplace commission 7910). The shared chart is untouched.
- [x] `_engine/production-ledger.ts` — receipt → issue → labor → overhead → cook → chill → pack →
      finished goods → shipment, with PPV, material usage, labor rate and efficiency, and overhead
      volume variances, and variance disposition against a materiality threshold
- [x] Delivery expensed, not capitalised (ASC 330-10-30-8)
- [x] Normal-capacity overhead absorption (ASC 330-10-30-3); unabsorbed overhead to the period
- [x] Abnormal spoilage relieved from the stage it occurred in, to its own P&L line
- [x] Work in process asserted to clear to zero in cents

**F4 — the batch record, mass balance and traceability**
- [x] `_engine/batch.ts` — the ISA-95 production performance object; scrap disposition reason codes
      resolving to normal or abnormal; the mass balance invariant with a signed cook delta
- [x] `_engine/traceability.ts` — FSMA 204 transformation CTE with key data elements, GS1-style
      traceability lot codes, ISO 8601 dates; gaps reported, never filled with a placeholder
- [x] Traceability emitted by the same consumption that posts the inventory relief, so the two cannot
      drift
- [x] The ledger posts from the batch record only; no planning surface writes journals

**F5 — surfaces**
- [x] Recipes: plated oz, $/lb AP, $/lb cooked, $/plated oz per line; a portion-spec card carrying the
      crediting totals, the component rollup, the spec floor and the portion headroom
- [x] Production Planning: purchased / cooked / chilled / plated pounds for the run, and the purchase
      order against recipe standard with the case-rounding difference named as inventory
- [x] Unit Economics: the weight basis on the food-cost line, and the overhead absorption rate, budget
      and normal capacity off the selected ledger

### Phase G — plan of record, forecasts, actuals  status: DONE

One platform, one engine. The vocabulary is CLAUDE.md §9: **plan of record** (the one saved scenario
the workspace reports against, set by a super admin; plan-data defaults when none is set),
**forecasts** (any saved scenario; open one and every page, client and server, renders it — the open
forecast is a viewer cookie, not workspace state), the **working copy** (unsaved browser edits), and
**Plan and Actual** (Phase N6).

**G2 — the vocabulary on the shell**
- [x] "Plan of record", "forecast", "working copy". `Set as plan of record`, `Open forecast…`,
      `Save forecast` / `Save as new forecast`, `Back to plan of record`
- [x] `getScenarioView()` — the open forecast (cookie `muse_open_forecast`, owner or super admin) or
      the plan of record; every server page renders it. `getActiveScenario()` is the plan of record for
      the evidence pack
- [x] Save updates the open forecast in place; "Save as new" forks it
- [x] The state is named in the scenario bar; no theme change, chip or colour signals it

**G3 — actuals**
Each actual is a table under `muse.*` (migration 0048), read by the same engine the forecast feeds.
No page computes a dollar from a typed total.
- [x] **Production record** — `muse.batch_records`: the `BatchExecution` shape the ledger consumes
      (planned / good portions, chiller batches run, per-component issued / cooked / chilled / packed
      weights, scrap with reason codes, input lot codes, actual labor hours and rate, cooling t0 / t2 /
      t6, closed-by). Prefilled at the recipe standard for the portions typed; the mass balance is shown
      live and the record is refused at close if it does not reconcile.
- [x] **Receipts** — `muse.receipts`: lines with quantity, lot code and invoice price, optionally
      against a purchase order (lines prefilled). Raw materials post at standard; invoice against
      standard is the purchase price variance.
- [x] **Deliveries** — `muse.deliveries`: meals by channel, site, date, price and lot codes. Revenue,
      COGS at the delivered recipe's standard per meal, delivery expense and the marketplace commission
      (7910) post from these.
- [x] **Period bills** — `muse.period_bills`: lease and utilities to Overhead Control, admin to G&A,
      other to a named account; paid-on posts the payment. Monthly depreciation and the overhead close
      post at month end.
- [x] `/muse/actuals` — always the Actual ledger: period selector, the period's statements against the
      Plan ledger's own month, cumulative position, variances, mass-balance and traceability flags, the
      opening balance record, closures, the period lock and the posting trail. `_engine/actuals.ts`,
      `_engine/actuals-ledger.ts`, `_lib/actuals.ts`, `_lib/actuals-actions.ts` (operators record).

### Phase H — the OS object chain: recipes, customers, orders, production planning  status: DONE

Every manufacturing operating system runs the same object chain, and Muse adopts it: item and recipe →
customer, site and service → order → production plan (MRP) → work order → delivery, receipt, ledger.
Execution and finance (Phases F and G) post from the batch record; this phase builds what sits in
front of them. How a forecast's volume is entered — services, dated volume picks, meal plans, site
calendars — is Phase N4a ([`roadmaps/operating-model-roadmap.md`](roadmaps/operating-model-roadmap.md)
decisions 15–20).

**Decisions locked (Robert, 2026-09-13)**
- **The three channels stay.** They are the expansion phases — Phase 1 schools, Phase 2 corporate
  catering, Phase 3 ghost kitchen / retail. A channel sets which recipes are offered to its customers
  (the recipe's `channels`). An order naming a recipe authored for its channel counts at the recipe's
  portion; the channel `portionFactor` applies only to a recipe served off its channel.
- **Add New Recipe saves to the library.** A recipe made up on Production Planning is a library recipe
  from the moment it is saved; only library recipes run on Unit Economics, Capacity and the plan. No
  throwaway recipes.
- **Recipe status:** `In Service` | `Planned` | `Developing`, a STATED field on every library row.
  Production Planning plans `In Service` recipes; `Planned` and `Developing` can be run singly.

**H1 — Recipe library**
- [x] `muse.recipes` + `muse.recipe_lines` (migration 0049): code, name, category, channels served,
      status, components, method, allergens, the `spec` block as JSONB, one row per ingredient line
      holding the engine's `IngredientLine` document whole. `version` bumps on every save and
      `effective_from` is set; approved standards are Phase J5.
- [x] The library is seeded from Robert's ten-meal baseline batch sheet: student recipes AMK-E-002 …
      011 on School lunches (`_data/recipes-menu.ts`), stated quantities and yields STATED, prices and
      cup weights PLACEHOLDER; adult variants AMK-A-002 … 011 on Corporate catering and Ghost kitchen by
      `adultVariant()` — the protein serving leads (`proteinTargetOz`, default meat 6 oz, plant-based
      4 oz, PLACEHOLDER), vegetables × 1.6 (PLACEHOLDER), grains and sides the student's. AMK-E-001 is
      the code recipe. Seed rows write once under an advisory lock (`_lib/seed-writes.ts`), by missing
      code; `pnpm muse:reseed` resets them.
- [x] **Add New Recipe** and **Edit recipe in the library** on Recipes and Production Planning (super
      admin): header, status, channels, grade group and vessel, lines blank or copied from any library
      recipe, crediting per line. New lines carry Placeholder provenance. Delete is refused while a
      batch record names the recipe.
- [x] **Recipe selector** (the `recipe` search parameter) on Recipes, Unit Economics, Capacity and
      Ingredients (Scope 3); Capacity shows the daily ceiling per recipe (`ceilingByRecipe`).
- [x] Sales quotes cost any library recipe linked; Suppliers "Match to recipe" and the entity directory
      read the library.

**H2 — Customers and sites**
- [x] `muse.customers` + `muse.customer_sites` (migration 0050): district / company / marketplace on
      one channel, status (prospect / contracted / forecast / inactive), contracted price (null = channel
      default), contract dates, CRM link; sites with a delivery-site link, grade groups, enrollment and
      status. Participation is calculated per site from confirmed and delivered orders, a sales figure
      that feeds nothing else (N4b).
- [x] `/muse/customers` (Sales): channel totals, customers, sites, services, volume picks and site
      calendars; super-admin CRUD. Sites & Delivery and Logistics read a linked site from here.
- [ ] Link a Sales prospect that signs to a customer in one step.

**H3 — Orders and menus**
- [x] `muse.orders` (migration 0051): date, customer, site, service, channel, recipe, meals, status
      `forecast` | `confirmed` | `delivered`, optional price (null = the customer's contract, else the
      channel price), `delivery_id` naming the delivery record once delivered, the cycle it was confirmed
      from, and a source (`typed` | `cycle` | `sales` | `portal`). **A forecast order is not stored**: it
      is derived on read (`_engine/orders.ts` `orderBook`) from the customer's meal plan and the
      service's volume on the date, so nothing stale sits in a table. A stored row replaces the derived
      order with its key.
- [x] `/muse/orders` (Sales): range and channel filter, meals by status per channel and the revenue at
      the prices in force, menu cycles and meal plans, the order book grouped by date with DERIVED /
      STATED badges, **Confirm count** on a derived order, **Deliver** on a confirmed order (writes the
      delivery record and links it; the order keeps the ordered count so the difference stays visible),
      typed forecast orders, and the delivery-day view by site and by recipe.
- [x] A school's full delivery day = every order on that date for that customer (`deliveryDay`).
- [ ] Confirmed orders from the Sales workspace and the Customer and Parent portals (`source` is ready;
      the Order Builder submission is P6).
- [ ] A choice menu (two recipes on one service day with a split); a meal plan names one recipe a day.

**H4 — Production Planning, three levels**
`_engine/production-plan.ts` (pure) and `/muse/production-planning?level=run|day|horizon`. Demand is
the order book.
- [x] **Single recipe run.** Recipe selector or Add New Recipe; meals, channel, price (blank = channel
      price), opening inventory. Batches, derived batch size, cycles against the window, the four
      weights, purchase against standard, and the economics of the meals (admins) — revenue, food at the
      recipe's portion, the run's own labor standard, packaging, delivery, Phase 3 commission,
      contribution. Purchase orders by supplier from the run.
- [x] **Delivery day.** A delivery date; production is the last production day before it. Every order
      on the date exploded into base portions per recipe (`requirementsFor`), netted against finished
      goods on hand (`finishedGoodsOnHand`: closed batch records inside hold life, less delivered orders,
      FIFO — no record, no stock; a typed on-hand is a STATED override for the view), sized into whole
      batches per recipe, placed on the chiller largest requirement first (`planProductionDay`), with the
      day's fit against capacity and a named shortfall. One merged purchase requirement
      (`mergePurchaseLines`) feeds the purchase-order generator. **Batch close lives here**
      (`BatchCloseForm`, prefilled at the recipe's standard).
- [x] **Horizon.** A date range rolled through production (`planHorizon`): each production day makes
      the next delivery date's orders net of stock, whole batches overshoot into stock inside hold life,
      expired stock is named, a delivery date draws from stock oldest first, and unfilled meals follow
      the recipe's filled share equally across its channels. Meals ordered and filled per channel;
      production days and delivery days tabled.
- Rule: the delivery-day requirement is the date's orders net of stock. Cover ahead comes from the
  horizon's rolling overshoot, never a typed days-of-cover target.

**H5 — Purchase orders from net requirements**
- [x] `_engine/net-requirements.ts`: raw stock on hand = receipt lines as lots less the issues on closed
      batch records, oldest lot first (an issue naming its input lot draws that lot); on order = issued
      purchase orders less the receipts booked against them (drafts shown, not counted); net = gross at
      the recipe standard − stock − on order arriving in time, rolled across the production days in date
      order, case-rounded on the net only. No receipt, no stock.
- [x] The purchase-order generator reads the net for a delivery day or the horizon, one order per
      supplier, with the catalog lead time giving each line an order-by date (need-by − lead) and a flag
      when that date has passed.
- [x] Receipts close the order: a receipt against an issued order that covers every line (to 0.5%)
      marks it received; closing is the manual accounting step on the order.
- [x] Procurement is the supply position: every library ingredient with on hand, on order, the next
      run's gross and net, and the supplier link.

### Phases I–M — from prototype to operating system

Sequenced 2026-09-14 (Robert) from the OS assessment checklist merged with the open ToDo follow-ups.
Ordered by what unlocks the most already-built machinery, then by what is buildable without a vendor
account (repo rule: no external integration until credentials are in hand). Each phase is built,
reviewed and committed on its own.

### Phase I — the production record is kept  status: DONE

No external dependency.

**I1 — the operator role**
- [x] `requireMuseOperator()` in `_lib/access.ts`, throwing like the other guard. An operator is an
      active person on the staff register signing in with their register email, a Clerk
      `museOperator: true` flag or the `MUSE_OPERATOR_EMAILS` list; a super admin is an operator.
      Operators record; they do not edit forecasts, standards or the plan of record.
- [x] Capture actions (receive, close, ship) gate on the operator guard; the guard-coverage test
      recognises it.

**I2 — receiving on the purchase order**
- [x] Receipt lines carry received qty, supplier lot code, use-by date, temperature at receipt °F,
      condition (accepted / accepted with note / rejected) and the FTL flag copied from the ingredient,
      on the `receipts.lines` JSONB. A rejected line is on the record and never in stock. The receipt is
      recorded on Procurement against the issued PO.
- [x] Ingredient lines carry `foodTraceabilityList` (FDA Food Traceability List). Fresh peppers in the
      roasted blend are the in-scope line; cheddar and canned tomato are out.
- [x] Inventory reads the records: finished-goods lots are closed batch records drawn FIFO by delivered
      orders and aged against hold life; raw lots are receipts less issues, by use-by; the trace per lot
      (suppliers in, sites out) is read from receipts and deliveries. Food Safety's cooling log and the
      lot directory read closed batch records.

**I3 — batch close**
- [x] Batch close on the delivery-day view, gated on the operator role: actual hours and loaded rate,
      cook delta, chill loss, scrap with a disposition reason code and stage, CCP-1 cook temperature and
      CCP-2 cooling record per cabinet load, input lots consumed from a picker of lots on hand, output lot code. Crew hours
      by person on the record (migration 0053, `crew` JSONB); the labor totals the ledger reads derive
      from the crew rows when any are entered.
- [x] The mass balance (CLAUDE.md §2 rule 9) is enforced at close; an unbalanced record does not post.
- [x] Shrink: the standard issue quantity carries the 3% allowance and the record shows it as normal
      `TRIM` scrap at stage `PREP`; a normal reason beyond the component's allowance is abnormal.
      Accounting policy §6–7 state the rule.

**I4 — delivery on the order**
- [x] Delivery recorded on the order (Orders page, operator role): meals delivered against the order,
      output lots picked from closed batch records, temperature at hand-off, who delivered and who signed
      at the site (migration 0052).
- [x] Per-site actual vs forecast on Orders: forecast, confirmed and delivered meals beside the count
      ordered, by site over the date range (`siteActualVsForecast`).

**I5 — the floor surface and expiry**
- [x] `/muse/floor` — tablet-first (44px targets via `.muse-floor`), today's queue only: receive against
      issued POs with lines outstanding, close today's planned batches, ship today's confirmed orders, the
      time clock. Served by the sibling route group `(muse)/(floor)/` with its own operator-gated shell,
      outside the OS sidebar and scenario bar. Prices are shown on the floor (Robert, 2026-09-14). The
      Floor always reads Actual.
- [x] Raw-material lots by earliest use-by, with the within-N-days view, on the floor. Ordering by
      use-by is a fact; the page states no action.
- [x] Capture happens where the event happens (Floor, Procurement, Production Planning, Orders); Actuals
      keeps the period statements.

### Phase J — periods  status: DONE

The CPA-completeness block. All internal.

**Locked decisions (Robert, 2026-09-14):** calendar months, fiscal year January–December; the kitchen
runs year-round and closes for major holidays only; a locked period refuses postings, a super admin can
reopen it, and both the lock and the reopen are events on the posting trail; standard-cost changes are
approved by a super admin with an effective date, no new role; overhead is a budgeted monthly accrual
(lease, utilities, depreciation) with bills recorded on Actuals posted against it and the difference a
spending variance. Build order: J1 → J3+J4 → J2 → J5 → J7.

- [x] J1 — period calendar: calendar months, fiscal year = calendar year; dated closures (holiday,
      closure) on `muse.calendar_closures` (migrations 0054, 0055); production days are service weekdays
      less closures (`productionDaysIn`); the production day before a delivery skips closures and no
      derived forecast order falls on a closed date. Closures are edited on Actuals.
- [x] J2 — monthly overhead accrual: one twelfth of the budgeted lease and utilities accrued into
      Overhead Control against Accrued Manufacturing Overhead (2160) at month end; lease and utilities
      bills settle the accrual and the difference is the spending variance (5150); a category with no
      bill stays accrued, with a note. Actuals shows budget / billed / spending variance / accrued
      unbilled.
- [x] J3 — period lock on `muse.fiscal_periods`: every posting and removal dated inside a locked period
      is refused server-side (batch, receipt, delivery, bill, deliver-order, delete); a super admin locks
      and reopens on Actuals, a reopen states its reason.
- [x] J4 — `muse.posting_log`: append-only (trigger refuses UPDATE/DELETE), SHA-256 hash-chained from a
      genesis hash, written in the same transaction as the record; every posting, removal, lock, reopen
      and closure change is an entry; Actuals verifies the whole chain on every read.
- [x] J5 — approved standard versions on `muse.standard_versions` (migration 0056): a super admin
      approves the plan of record's recipe and cost assumptions as a snapshot with an effective date
      (refused inside a locked period; an entry on the posting trail). The ledger costs every batch at the
      version in force on its production date and the record names it (`CODE@vN`; `CODE@library` with a
      note when none is in force). Library and plan edits change what the next approval freezes, never a
      standard in force. Recipes shows the standard in force, its history, and whether the live standard
      differs.
- [x] J7 — abnormal spoilage valued at the stage's fully absorbed cost per lb: material at the stage plus
      labor and absorbed overhead over the standard mass in the stage (packaging once packed); nothing
      before the kettle carries conversion. The batch ledger notes the rates it used.

### Phase K — working capital and invoicing  status: DONE

The document and the ledger entry, not the gateway. The balance sheet carries trade balances.

**Locked decisions (Robert, 2026-09-14):** one monthly invoice per customer for School lunches and
Corporate catering, each completed delivery route added to it as it finishes; revenue straight to
receivables at delivery; invoice numbers `AMK-INV-YYYYMMDD-NN`. Parent Pay is out of scope for now. Ghost
kitchen is paid at the time of ordering — ordinary take-out and delivery accounting, never invoiced.
Supplier bills: receipt to goods received not invoiced, the bill clears it. Receiving has no tolerance;
a quantity or price that differs from the order is an override with its reason on the receipt. A
mismatched bill is flagged, alerted on the Dashboard, and not paid until rectified. Terms: suppliers Due
on Receipt / Net 15 / Net 30 / Net 60 / Net 90, customers Due on Receipt / Net 15 / Net 30, no default;
the reference is in `accounting-policy.md` §16. Calendar days; aging groups 0–30 / 31–60 / 61–90 / 90+.
Current portion of long-term debt presented only. Loans start 2027-01-01 and the forecast starts FY2027.
$200,000 is opening owners' equity. Payroll biweekly, 26 periods, Monday through the second Sunday, paid
the Friday five days later; loaded labor split into wages, payroll taxes, workers' comp and benefits; an
internal time clock for all staff (clock in, break, clock out). Invoices, bills and payments are recorded
by super admins and operators. Build order K6 → K4 → K2 → K1 → K3 → K5. Migration 0057.

- [x] K1 — customer invoices built from delivered orders. `muse.invoices`; a delivery recorded against
      an order carries its customer. **Complete route** (Floor, Orders delivery day, Receivables) adds the
      date's School lunches and Corporate catering deliveries not yet invoiced to the customer's open
      invoice for the month, opening one when there is none (`routeCompletion`). An invoice is issued on
      or after its last delivery with the customer's terms and the due date they set; issuing is refused
      without terms on file. The invoice document at `/muse/receivables/invoices/[id]` is computed from
      the records. Ghost kitchen deliveries post to processor clearing (1200), never to receivables.
      Sending an invoice by email is not connected.
- [x] K2 — supplier bills against receipts, three-way match. Receipt lines keep the purchase-order
      quantity and price and carry an override reason when received differently (refused without one). A
      receipt posts raw materials at standard, PPV at the price received, and credits GR/IR (2015); a bill
      (`muse.supplier_bills`, takes the supplier's terms, refused without them) clears GR/IR at what its
      receipts received, any difference to PPV while flagged. `threeWayMatch`: order against receipt needs
      the reason, bill against receipt is exact by ingredient in quantity and value. A mismatched bill is
      refused payment and listed on the Dashboard; **Rectify** replaces its lines until a payment applies.
      Rejected receipt lines do not post into stock.
- [x] K3 — receivable and payable ledgers with terms. Customer terms on Customers, supplier terms on the
      supplier page (`muse.supplier_terms`), terms required on new period bills. Customer and supplier
      payments applied to invoices and bills (`muse.customer_payments`, `muse.supplier_payments`).
      `/muse/receivables` and `/muse/payables` on the selected ledger: open documents, aging by calendar
      days past due, days to collect and days to pay (period-end balance over the period's flow × calendar
      days). Cash flow indirect method carries the working-capital accounts.
- [x] K4 — current portion of long-term debt, presented. `amortizationSchedule` from the loan start
      (payments at month end from the start month); the current portion is the principal due in the twelve
      months after the statement date, shown among current liabilities on the Balance Sheet, never posted.
- [x] K5 — accrued payroll and the pay-period cut-off. Loaded labor is owed as wages (2110), payroll taxes
      (2120), workers' comp (2130) and benefits (2140). Time clock: `muse.staff`, `muse.time_punches`;
      punches on the Floor, the Sales portal and HR (operators), typed and removed punches with a reason on
      the trail (super admin). Shifts less breaks; overtime past 40 hours in a Monday–Sunday workweek at
      1.5×; salaried accrues over 364 days. Actuals accrue loaded labor earned in the month at month end
      against what batch records charged (the difference to 5170, production labor not charged to a
      batch) and pay each pay period on its pay date. The first pay period's start is PLACEHOLDER
      (2027-01-04).
- [x] K6 — owners' equity and the opening balance sheet. The forecast opens FY2027 with $200,000 of
      owners' equity in cash (3100) and the fit-out financed from 2027-01-01. Actuals: one opening balance
      record (`muse.opening_balances`, super admin) posts cash, the fit-out, the debt and the equity as of
      its date.

Open after K: recording loan payments against the actual debt, and marketplace deposits out of processor
clearing, on Actual (both post as document kinds on the Plan ledger, N5).

### Phase N — one operating model: definitions, the Plan ledger, the Actual ledger  status: N1, N3–N10 DONE; one N9 item (dropping two unused site columns) NOT STARTED

Build plan: [`roadmaps/operating-model-roadmap.md`](roadmaps/operating-model-roadmap.md) (steps N1–N10,
audit findings A1–A17, locked decisions 1–20). One set of definitions with real-world status (planned or
real), one master list per kind; a forecast timeline derived through the same posting chain as recorded
activity (the Plan ledger, one per forecast, never stored); the recorded Actual ledger — every page reads
the same engine against a selected ledger. N1's definitions come before L1–L5, which sit on them.

- [x] N1 — definitions with real-world status: equipment (0058), packaging (0059), customers contracted /
      prospect, catalog items candidate or approved with effective-dated prices (0067), recipe lines priced
      off the catalog, loans and fixed-cost lines (0068), the leasehold schedule (0069)
- [x] N3 — the standard cost of a meal per recipe per date: food + labor + packaging, each recipe at its
      own labor standard and packaging; approved standards freeze labor, packaging and the overhead rate
- [x] N4a — meal plans, services, dated volume picks, site calendars, the forecast's inputs (migration
      0071)
- [x] N4b — the forecast timeline engine; enrollment on the site and participation calculated from
      orders
- [x] N5 — the Plan ledger
- [x] N6 — the Plan / Actual selector and every surface on it, in four slices; sustainability records
      (migration 0072)
- [x] N7 — Plan v Actual; the plan of record's history with a copy of the master records on the trail;
      customer ERRA ratings (migration 0073)
- [x] N8 — the rolling forecast, budget-based, as a column on Plan v Actual
- [x] N9 — retirements with their replacements
- [x] N10 — conformance tests C1–C6 (`test/muse-conformance.test.ts`), including the plan-data import
      rule (C2)

### Phase O — People: HR, time studies, staff demand  status: O1–O3 DONE; O5 DONE; O4 contract DONE, transport NOT STARTED

Build plan: [`roadmaps/people-roadmap.md`](roadmaps/people-roadmap.md) (steps O1–O5). One HR page holds
the time clock, shifts and hours; no pay or confidential employee information is held in Muse — CompTable
owns it and admins (the named super admins) view it read from CompTable. Time studies per recipe on a
cadence with trends and quality results are the labor standard; Schedule is a two-week production staff
demand sent to CompTable, with the published schedule received biweekly.

- [x] O1 — the HR page; pay out of Muse; payroll from CompTable's closed pay periods (migrations 0060, 0062)
- [x] O2 — time studies per recipe (0061); every recipe seeded with an estimated study that stands in
      until an observed one is adopted (0064); the Time Study Sheet
- [x] O3 — two weeks of production staff demand by task and station for CompTable
- [ ] O3 — the published schedule received from CompTable and shown against demand as coverage by day
- [x] O4 — contract version 1 ([`comptable-contract.md`](comptable-contract.md)), with
      `comptable.staff_joined` as the onboarding trigger; schemas, builders, readers and the notice
      signature in Muse
- [ ] O4 — transport: signed webhook notices, authenticated reads, each event handled once. Gated on Muse
      Kitchen on its own domain and its CompTable account; the CompTable side is a separate CompTable change
- [x] O5 — the role matrix: admin and operator; staff sign in by email (migration 0063); the operator
      dashboard; Financials & Accounting admin-only

### Phase L — the scheduler  status: L0, L1, L2, L4, L5 DONE; scheduler W0–W5 DONE; W6 NOT STARTED; L3 NOT STARTED

Build plan: [`roadmaps/scheduler-roadmap.md`](roadmaps/scheduler-roadmap.md). W6 (committed production
orders as facts of record) waits for the model to stop moving. L3 waits for a second cabinet on the
Phase 1 list.

- [x] L0 — capacity is a property of the plant; labor is a requirement of the plan. The chill window comes
      off the operating day (`operatingOpenMin` / `operatingCloseMin`, PLACEHOLDER 07:00–19:00) and the
      first-load lead time, never the crew register. The production plan emits its labor requirement —
      staff-hours by 15-minute interval and headcount per placed task (`_engine/staffing.ts`) — and
      proposed crews are checked against it as findings on Capacity, Schedule and Production Planning. The
      crew register is seeded empty. Production days per year count off the J1 calendar; normal capacity
      is bound by the plant.
- [x] L1 — station register as bookable resources (scheduler W0). The equipment library is the register;
      each Phase 1 unit carries concurrent batches, changeover minutes, attended run and may run
      unattended as estimated open fields (migration 0066), resolved and tagged per scenario
      (`routeResources`).
- [x] L2 — each vessel's required volume per batch against its capacity (closed form: `batchBounds`).
- [ ] L3 — the chiller cabinets as independent resources, once a second cabinet is on the Phase 1 list.
- [x] L4 — timeline primitives (scheduler W2). `_components/timeline/` carries the time scale and lane
      packing (pure, tested), the grid with its sticky lane column, blocks, precedence arrows and the crew
      load strip. One day on the clock is the Day Schedule.
- [x] L5 — cross-station routing per recipe (scheduler W0). `deriveRoute` builds each recipe's route from
      its labor standard and thermal map on the batch and dispatch streams, with finish-to-start
      precedence and a resource per step; the scenario edits steps in the `routing` section on the
      Process map (W3).
- [x] Scheduler W1–W5: `_engine/scheduler.ts` places one operating day with violations and metrics; the
      Day Schedule, the Process map, the Calendar and Compare under Production Planning.

### Phase P — the portals  status: P1, P1b, P2, P3, P7 DONE; P4 a placeholder; P5, P6 NOT STARTED

Build plan: [`roadmaps/portals-roadmap.md`](roadmaps/portals-roadmap.md).

Decisions (Robert, 2026-09-16): the OS is an administrative workspace with stakeholder portals — the
Floor for the kitchen, a Sales portal, a Customer portal, a Parent portal and a Supplier portal — so the
kitchen owns the communication with every stakeholder. The menu: **Sales** (Sales Portal, CRM, Customers,
Orders); **Customer** (Customer Portal, Order Builder); **Parent** (Parent Portal, Parent Admin);
**Supplier** (Supplier Portal); **Distribution** is physical distribution — Sites & Delivery, and
vehicles, insurance, drivers and routes as they are defined; Reports sits under Dashboard. Portal pages are
basic while they are developed; a page may grow a top tab bar later.

- [x] P1 — menu restructure and basic portal pages: the Sales Portal (the pipeline by stage, customers by
      status and channel, orders on file in the next two weeks); the Customer Portal (order history,
      invoices and payments) and the Order Builder (date of service, arrival, headcount, recipes and
      quantities from the channel's in-service recipes, allergens, packaging from the channel's packages,
      delivery site or address, contact, delivery specifications and instructions, priced at the
      contracted or channel price; submitting not connected); the Supplier Portal (line sheet or specials
      upload, new item submission and ERRA rating assessment forms, not connected; the catalogs on file
      with their ratings). The Dashboard's Sales card.
- [x] P1b — every portal in its own shell (`(sales)`, `(customer)`, `(supplier)`, `(parent)` route groups on
      the shared `PortalShell`), nothing linking into the OS; the review policy on every external portal;
      Customer and Parent sign-up pages and the Supplier welcome page; the Sales shell's time clock for the
      signed-in person (`TimeClockCard`, shared with the Floor); Parent Admin in the OS at
      `/muse/parent-admin`.
- [x] P2 — work roles on the staff register (operator, sales, held together); each punch carries its
      shift's role; hours by role on HR and on the punches sent to CompTable (migration 0074).
- [x] P3 — sign-in and sign-up inside each external portal shell, public in `proxy.ts`; signed-in accounts
      that are not staff see "under review" and no data; the Sales shell is staff only.
- [ ] P4 — accounts: supplier invitation links from the supplier record; admin notification and user
      verification emails (email clients to be discussed with Robert).
- [ ] P5 — contacts on the master records, parent profiles, and linking an external account to exactly
      one record (a migration).
- [ ] P6 — wiring the forms: Order Builder submissions and supplier submissions as items pending staff
      review before they reach production.
- [x] P7 — the front door: the welcome page at `/muse`, one sign-in at `/muse/sign-in` and its sign-up at `/muse/sign-up`, the router at
      `/muse/enter` (admins → Admin Dashboard; Operator and Sales → a chooser; Sales → Sales Portal;
      operator → Floor; none → under review), the Dashboard at `/muse/dashboard`. `/muse`,
      `/muse/sign-in` and `/muse/sign-up` are public; every other `/muse` path is behind sign-in.

### Phase Q — the facility: footprint, layout and the shell size  status: Q1, Q2, Q3, Q3b, Q4b DONE; Q6 v1 DONE (the block plan itself is a drawing task in the OS); Q4, Q5 DEFERRED

Build plan: [`roadmaps/facility-design-roadmap.md`](roadmaps/facility-design-roadmap.md).

Derives the minimum facility from the equipment library's own rows and its own build-phase split,
rather than from an assumed shell size. Five layers: equipment envelope → zone gross (aisle and
published clearance) → production floor (+ the cart spine) → support program (DoD Space Planning
Criteria Ch. 510 at PSM 1,500, × 1.40 net-to-gross) → building gross. Every footprint carries a basis:
every row with floor (39 of 59) is SOURCED to a named model's spec sheet, with manufacturer, model and
the sheet's link on the row. Aisle, hood, walk-in and program standards are cited and split
into CODE and GUIDANCE, because most of the trade-press figures are neither.

**Derived, cumulative:** production floor **1,663 / 2,784 / 2,920 sq ft** and building gross
**6,077 / 7,422 / 7,571 sq ft** through Phases 1, 2 and 3, with **38.4 linear feet** of Type I hood at
full build (every footprint off a named model's spec sheet, 2026-09-17). The shell is leased once, so the
figure that sizes a lease is about **7,600 sq ft**, of which 1,495 sq ft — 20% — stands idle from open
until Phase 2 equipment lands. The two potential rooms (34°F hold room, conditioned packaging room) are documented on
the Facility Design and Build plan with area, cost, impact and risk, and are not equipment, forecasts or
ledger entries (Robert, 2026-09-17).

The decisions of 2026-09-17 are recorded in the build plan §2 (items 5–16): the 1,500 meals/day figure
sizes only the support program; both blast chillers are Phase 1 and a batch binds to one unit of each
vessel; the Facility page is the Sustainability · Facility page, admin-only, tabbed; footprints are
edited there; the potential rooms are documented only; the engine is the source of truth; Q4 and Q5 are
deferred; the named models are representative for dimensions, not selections, and the unit costs on
Equipment are not tied to them.

- [x] The analysis: the equipment footprint table, the zone factors, the support program, the phase
      totals, the capacity benchmark and eight findings (the build plan, §5–§10)
- [x] Q1 — footprint and clearance as open fields on `muse.equipment` (migration 0076 + seed), edited on the
      Facility page's Footprints tab (2026-09-17)
- [x] Q2 — `_engine/facility.ts`, the space engine, pure and tested to the build plan's golden values (2026-09-17)
- [x] Q3 — the Facility page at `/muse/sustainability/facility`, admin-only, six tabs on a top bar, following
      the open forecast (2026-09-17); Q3b — the conformance register as data and a tab (`_data/facility-conformance.ts`)
- [ ] Q4 — the leasehold schedule reading the derived gross; hood and HVAC re-quoted against 38.4 linear ft — DEFERRED
- [x] Q4b — both chillers on Phase 1 in `muse.equipment` and the batch bound to one unit of each vessel
      (2026-09-17); the plan of record's hold life set to 7 by `pnpm muse:facility-scenario`; the 1,500 figure
      sizes the support program only (`SUPPORT_PROGRAM_PSM`, PLACEHOLDER) and no capacity or planning engine reads it
- [ ] Q5 — `facility.sizeSqFt` retired as an input; the sustainability normalizers restated — DEFERRED
- [x] Q6 v1 — the layout editor on the Layout tab: drag-placed units with clearances, rooms and markers, the
      register's checks live on the drawing, measured against derived, `muse.facility_layouts` (0077), print at
      1/4 in = 1 ft (2026-09-17); the generated arrangement lays the whole floor out in flow order with dashed
      Phase 2 and Phase 3 boundaries as a draft (2026-09-17). The Phase 1 block plan itself is a drawing task in the OS

### Phase T — tabbed page layout  status: T0, T1 DONE; T2 Ledger DONE, rest HELD (decision 6)

Build plan: [`roadmaps/tabbed-layout-roadmap.md`](roadmaps/tabbed-layout-roadmap.md).

- [x] T0 — the tab CSS: stroked, shaded folder tabs over one full-width panel card that grows with the open tab (2026-09-17)
- [x] T1 — 40-page audit of the active sections (2026-09-17)
- [ ] T2 — convert, first wave: **Ledger DONE (2026-09-17)**; HR, Actuals, Orders, Recipes, Capacity, Production Planning held — each carries a risk named in the build plan §4a
- [ ] T3 — convert, second wave: Food Safety, Training, Inventory & Audit, Receivables + Payables, Inventory
- [ ] T4 — nine borderline pages, Robert to decide
- [ ] T5 — raise the in-card tabs on Sales (CRM) and Suppliers to the page bar

### Phase V — visual quality: palette, type, depth  status: V1, V2 DONE; V3 OPEN

Build plan: [`roadmaps/visual-quality-roadmap.md`](roadmaps/visual-quality-roadmap.md).

- [x] V1 — off-white ink ladder, one type scale (11px floor), elevation and tinted shadows, control borders ≥ 3:1, solid focus ring, copper page titles, blue stated, soil sidebar (2026-09-17)
- [x] V2 — inline styles to CSS; only data-computed inline styles remain (2026-09-17)
- [ ] V3 — review in the running app (dense tables at 14px, 200% zoom, the sidebar in place)

### Phase R — agentic assistance: Compare in two modes  status: R0–R4 BUILT (2026-09-19); interpretive logic OPEN (build plan §9); R5 NOT STARTED

Build plan: [`roadmaps/agentic-assistance-roadmap.md`](roadmaps/agentic-assistance-roadmap.md). The first AI
surface in Muse, on one page. Compare gains a second tab: **Day** is the page as built (one day under two
forecasts); **Recipe** costs two recipes under one forecast, side B a duplicated library recipe built from a
typed or spoken instruction, reviewed on a proposal card before it runs, saved to the library at Developing
only on click. The model proposes; the engine computes; a gap is found, derived or asked, never guessed
(decisions 1–13 in the plan). Admin only.

- [x] R0 — plumbing: the two server actions, rate limit, usage telemetry, the proposal contract
- [x] R1 — the resolver: find → derive → ask; waiver to PLACEHOLDER; the variant's estimated study
- [x] R2 — `compareRecipes` → `CompareRow[]`
- [x] R3 — the Day · Recipe tab bar, the Recipe tab, save variant to library
- [x] R4 — dictation via the browser's Web Speech API
- [ ] R5 — forecast-side instructions on the Day tab (scope with Robert first)

### Phase U — page headers  status: U0–U6, U8 DONE (2026-09-19); U7 blurbs DONE, glossary NOT STARTED; Plan/Actual chip and print footnote OPEN

Build plan: [`roadmaps/page-headers-roadmap.md`](roadmaps/page-headers-roadmap.md). A header a new user reads
in ten seconds: a one-line purpose that starts with a verb, "On this page" chips naming the page's own cards
and tabs, the pages it connects from and to, and the rules in a collapsed "How this page works" panel. The
teaching content is kept; it stops being a wall of text on every visit.

- [x] U0 — the seven defects found in the review (F1–F7)
- [x] U1 — `PageHeader` slots, CSS, print rules; `lede` kept for the pages not yet moved
- [x] U2 — pilots: Capacity, Inventory, Payables (Robert reviews before the rest move)
- [x] U3 — production and planning pages (17)
- [x] U4 — finance and commercial pages (16); [ ] the Plan/Actual chip
- [x] U5 — sustainability and people (13) + the "How the inventory is built" hub
- [x] U6 — portals (10 headers, second person, no panel)
- [x] U7 — nav blurbs deleted (D4); [ ] glossary
- [x] U8 — guard test over every page: purpose ≤ 140 characters and one sentence, no lede beyond two subtitles, 2–5 chips, no nav blurb
- [x] The brand line no longer renders on any page header (Robert, 2026-09-19); it stays on the footer and on documents

### Phase M — integrations, each gated on credentials  status: NOT STARTED

Nothing here starts until the account exists (repo rule). Internal precursors first.

- [ ] M1 — supplier PO acknowledgement page (tokenised link, no EDI); live price update on the catalog
      line from the acknowledgement.
- [ ] M2 — driver manifests from the day's deliveries; routing optimisation only if a 3PL is chosen.
- [ ] M3 — payments: B2B invoices and the parent portal. Decision first: a separate Stripe account from
      CompTable's, or none.
- [ ] M5 — scanner and IoT capture: barcode as keyboard-wedge input on receiving (no vendor);
      chiller / oven temperature import into the CCP records when a logger is chosen.

### Financials & Accounting suite  status: DONE

- [x] Sidebar section **Financials & Accounting** (admin only): Unit Economics, Profit & Loss, Balance
      Sheet, Cash Flow, Ledger, Plan v Actual, Actuals, Receivables, Payables, Capital & Financing;
      `/muse/financials` redirects to Unit Economics.
- [x] **Unit Economics** — the selected recipe's cost of a meal (food + labor + packaging), cost to serve,
      contribution by channel on each channel's own recipes, fixed cost per meal and absorption off the
      selected ledger, the NSLP benchmark.
- [x] **Profit & Loss, Balance Sheet, Cash Flow, Ledger** — one layout on the Plan or Actual ledger by
      month, quarter or year: classified income statement, classified balance sheet at each period end,
      cash flow direct and indirect (asserted equal), the period's journal and trial balance.
- [x] **Capital & Financing** — capital and debt on the selected ledger beside the equipment, leasehold,
      loan and fixed-cost definitions it edits; amortising monthly financing (PMT).
- [x] `_data/capex.ts` (the equipment seed), `_engine/financials.ts`, golden-value tests.

### Suppliers — real data  status: DONE
- [x] `scripts/generate-muse-suppliers.ts` + `pnpm muse:suppliers` — reads the git-ignored source (USDA
      Organic INTEGRITY 4 states + TDA Farm Fresh Austin-metro extract), emits committed, attributed
      `_data/suppliers-compiled.json`. Raw source stays local (git-ignored).
- [x] Filtered to agricultural producers (crops / livestock / dairy) — 682 certified producers + 18 TDA
      school-ready = 700 operations, 33 in Central Texas.
- [x] `_engine/suppliers.ts` — query/filter, cross-reference, recipe-line match (pure, tested).
- [x] Suppliers page: server component, searchParam filters (region default Central TX, scope,
      school-ready, product search), cross-reference KPIs, provenance notice, recipe-match table,
      directory; supplier pages with terms and catalog items (N1).
- Provenance rule (RESEARCH.md §13/§14): attributed public-records compilation; volume, pricing and lead
  time are operator-entered, never sourced. Certification and school-readiness are disjoint in the
  Austin-metro data ("both" = 0) — surfaced as a finding.
- Data handling: the whole `docs/muse/confidential/` source folder is git-ignored.

### Sustainability (carbon & resource accounting)  status: S0–S5 DONE

Figures in RESEARCH.md §19. Locked: section named **Sustainability**; AR5 GWPs for the inventory, AR4
where 40 CFR 84 requires it; Poore & Nemecek food factors, Agribalyse if its licence is free, WFLDB
excluded; factors are versioned static reference data, never live API calls; the carbon ledger mirrors
`@ct/ledger` (activity × pinned factor version → immutable posting, nothing derived stored); dual-basis
food reporting (reference = study mean, always shown; selected = the per-ingredient LCA basis: study mean
/ cited LCA / supplier data, each with its boundary and a derived retail-aligned figure); uploads and basis
edits super-admin only; Sustainability follows the Plan / Actual toggle (N6); no advice anywhere in the
copy.

- [x] **S0 — scope and records** (module doc, RESEARCH.md §19, this build plan)
- [x] **Mark rating pills.** The certification mark's rating as a status pill: 1 / 2 / 3 stars, NOT YET
      RATED, IN REVIEW; colour-coded, bold capitals; on recipe ingredient rows, supplier directory rows and
      fields, procurement PO lines. Mark name in one constant (`_data/mark.ts`, ERRA, under the CLAUDE.md
      §1 exception). Real producers are NOT YET RATED; no rating is assigned to a real operation without
      one on file.
- [x] **S1 — factor library + engine.** `_data/emission-factors.ts` (EPA Hub stationary/mobile, eGRID
      ERCT, IPCC AR4 + AR5 GWP, WARM organics, SmartWay, P&N food categories, Austin Water rates) and
      `_engine/carbon.ts` (`postActivity`, `co2e`, `aggregateByScope`, `normalize`, `annualizedLeakRate`,
      `aimActFindings`, `effluentSurcharge`, `warmNet`), with golden-value tests.
- [x] **S2 — live from model data.** Facility & normalizers, Scope 3 ingredients per meal, Waste &
      end-of-life (landfill vs compost side by side), Outbound logistics ton-miles from the site map.
- [x] **S2b — sources registry.** `muse.sources` + `muse.source_figures` (migration 0044); files in Neon
      (`bytea`) served through an authenticated route; CLI seed (`pnpm muse:sources`) loads the large
      documents from the research folder; in-app upload (super admin) under the Vercel request limit;
      `/muse/sources` and `/muse/sources/[id]`; `Cite` resolves provenance ids to source pages.
- [ ] S2b — Vercel Blob storage, when a token exists.
- [x] **S3 — activity inputs.** Scope 1 fuel; refrigerant register from the equipment attributes
      (per-circuit charge, annualized leak %, AIM Act + GreenChill findings); Scope 2 location + market
      with REC share; Water & effluent (Austin surcharge model, 90-day grease-trap interval); equipment
      energy and refrigerant attributes; rebate eligibility table as inventory. Plan runs the forecast's
      quantities; Actual reads the recorded bills, lab results, inspections and refrigerant service
      (migration 0072).
- [x] **LCA basis.** Dual-basis food reporting on Ingredients (Scope 3) and Inventory & Audit: reference
      column beside a selected column with a per-line selector among study mean and cited options in
      `_data/lca-options.ts`; selection stored in the scenario overlay (`sustainability.ingredientBasis`).
      `alignToRetail` brings farm/slaughter-gate figures to the study's boundary.
- [x] **S4 — supplier verification.** Ingredient line → supplier link; % spend with certification on file;
      inbound logistics from supplier location; supplier-specific LCA options (`muse.supplier_lca_options`,
      migration 0045) with the supplier's document attached, joining the basis selector.
- [x] **S5 — inventory statement + audit surface.** Scope 1/2/3 by period with normalizers; factor-version
      stamp on every line; baseline year + materiality (3–5%) setting with a restatement flag; the
      evidence pack — a workbook zipped with every stored source document, on the selected ledger.

### Phase X — portfolio publication: Impact OS on axiomdelta.ai  status: BUILT, awaiting review

Impact OS is added to the AxiomDelta venture-studio site as its fourth platform, ordered first.
This repo owns the confidentiality clearance, the fact table the page is built from, and the
accuracy review; the page itself is built in the `axiomdelta-ai` repo under its conventions. No code
here changes — docs only. Build plan in
[`roadmaps/portfolio-publication-roadmap.md`](roadmaps/portfolio-publication-roadmap.md); the
page-side plan is `docs/muse-impact-os-portfolio.md` in that repo.

- [x] PP1 — the fact table, DONE 2026-09-22: 25 claims with evidence and real `nav.ts` status, five
      findings, and all 51 module purpose lines as the copy source. Scope is the application only
      (decision 10). One figure did not survive verification — see Finding 1
- [x] PP2 — clearance pass against CLAUDE.md §1; Robert signs off before any copy is drafted
- [x] PP3 — hand-off, and the naming and accent answers the page needs
- [~] PP4 — screenshots: Robert supplied four; three cleared, optimized and handed over. The Sales
      CRM capture is **refused as unpublishable** — a real prospect pipeline with named
      organizations, named individuals and their commercial status
- [x] PP5 — accuracy review of the drafted page, claim by claim and numeral by numeral
- [ ] PP6 — record

## Update Log

| Date | Change |
|---|---|
| 2026-09-25 | **Phase X — the AD page is built.** PP2, PP3 and PP5 done; the page's copy comes from the fact table and the 51 purpose lines. PP5 caught a wrong portal count before it shipped. Impact OS now leads the homepage, `/projects` and the footer on axiomdelta.ai, with a detail page at `/projects/muse-impact-os`. Robert's on-screen review and PP6 are what remain; nothing committed. |
| 2026-09-22 | **Phase X — PP4 part done; one image refused.** Three of Robert's four captures cleared the scrub and went to the AD repo. `impact-OS_sales_CRM.png` did not and will not: it shows the real school prospect pipeline — named organizations with addresses, named individuals with job titles, the internal research named on the banner, and 67 prospects by commercial status. Decisions 2, 3 and 10, and a privacy problem on its own terms; cropping does not fix it. A CRM image for the page needs a capture against invented data. Sources claim settled at 37 reference sources, so §3.4 is 25 of 25 cleared. |
| 2026-09-22 | **Phase X — PP1 done.** The fact table: 25 claims, each with its evidence file and its real `nav.ts` status; 24 cleared. Verified from source: 51 modules / 12 sections / 33 live / 11 partial / 7 designed, 28 report packages spanning all 12 sections, 60 page headers, 12 agent fixtures, 59 Muse test files. Finding 1 is the material one — "78 registered sources" is a `muse.sources` row count after seeding and cannot ship under decision 5; the committed files carry 37 + 28 + 10 = 75. Decision 13: the training one-pager may be excerpted as a visual. |
| 2026-09-22 | **Phase X narrowed to the application** (Robert) — the AD page writes up what the OS does, not Muse Kitchen the business: the left-bar sections and module names, the page-header purpose lines, and the framing as an all-inclusive operating system for a sustainable scratch kitchen with business operations, production planning, facility planning and a per-meal sustainability suite. Decision 10 in the build plan; §2 and §3 rewritten. |
| 2026-09-22 | **Phase X opened** — portfolio publication: Impact OS goes on axiomdelta.ai as the fourth platform, ordered first. This repo's half is the clearance, the fact table and the accuracy review; no code here changes. Build plan in `roadmaps/portfolio-publication-roadmap.md`. Six decisions recorded — chief among them that CLAUDE.md §1 permits the two names publicly while the perimeter around the source company travels with the copy, and that no figure ships without being re-derived from source. Three questions open for Robert. |
| 2026-09-19 | **Phase U built out** — every one of the 60 headers is on the slots; the brand line is off the page header; Orders included. Open: glossary, Plan/Actual chip, print footnote. |
| 2026-09-19 | **Phase U opened and piloted** — page headers; build plan in `roadmaps/page-headers-roadmap.md` (Cowork's review of 60 headers, approved by Robert). The header gains purpose · on this page · connects · how this page works; Capacity, Inventory and Payables moved; F1–F7 fixed; nav blurbs deleted; Sales H1 is CRM, Training title is Training. |
| 2026-09-19 | **Phase R — R0–R4 built.** Compare carries Day · Recipe tabs; the Recipe tab (admins) turns a typed or dictated instruction into a proposal the engine resolves — find, derive, ask; waived → PLACEHOLDER — costs the variant against its source under the open forecast, and saves it to the library at Developing on click. Detail in `roadmaps/agentic-assistance-roadmap.md`. |
| 2026-09-18 | **Phase R opened** — agentic assistance; build plan in `roadmaps/agentic-assistance-roadmap.md`. Same day: the on-screen vocabulary pass — "scenario" never appears in UI copy, a saved one is a forecast and the top bar is the forecast bar (CLAUDE.md §9). |
| 2026-09-17 | **Phase T opened** — tabbed page layout; its build plan, audit and per-page plans are in `roadmaps/tabbed-layout-roadmap.md`. T0 (tab CSS) and T1 (40-page audit) done; no page converted yet. |
| 2026-09-17 | **Phase T — Ledger tabbed.** Final risk pass over every candidate (build plan §4a); decision 6: only risk-free pages convert. Ledger is the one; the rest of T2–T5 held. |
| 2026-09-18 | **Sources — every cited source registered** (Robert). Rule added to CLAUDE.md §5: a source of data the platform cites publicly is on the Sources page. `_data/sources-registry.ts` holds the 37 codes, rules, datasets, rate schedules, studies and guidance the OS cites outside the factor library (City of Austin, Texas DSHS and TDA, USDA, FDA, DOE, OSHA, DOL, DOJ, DoD, Census, FASB, ISO, GHG Protocol, Codex, BRCGS, ICC, ECFF, GS1, design guidance); `pnpm muse:sources` writes them and the 28 manufacturer spec sheets behind the equipment footprints; `test/muse-sources-registry.test.ts` fails when a URL in `_data/` or `_engine/` is unregistered. Registry now 78 rows. |
| 2026-09-18 | **The shell's two bars** (Robert): the scenario bar is the top bar, on deep soil continuous with the sidebar; the page toolbar below it, on the sunk ground with a copper rule, carries each page's own controls in three fixed groups — scope, view, action (`_components/PageControls.tsx`, `page-controls-slot.ts`) — then the condensed search and the page export. Page-level pickers, filters and downloads moved off the page bodies into the groups on every page audited; card-scoped controls, form inputs, save/revert and data edits stay in place; Reports keeps its own tabs and controls. The lede runs full width. |
| 2026-09-18 | **Phase E — Export page.** Every module page exports as it stands from its header (figures and tables as rendered → workbook via `/muse/export`). |
| 2026-09-18 | **Phase E — Reports built.** The report library: a tab per menu section, 28 packages at summary level with detail on a toggle, search / lens / sort, most recently viewed (cookie), XLSX export per section or report. `nav.ts` flips Reports to `live`. |
| 2026-09-17 | **Phase V opened** — visual quality; build plan in `roadmaps/visual-quality-roadmap.md`. V1 and V2 done; LedgerView held for the other session; V3 open. |
