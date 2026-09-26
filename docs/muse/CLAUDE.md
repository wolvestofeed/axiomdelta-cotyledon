# CLAUDE.md — Muse Kitchen Impact OS

Project and programmatic oversight for **Impact OS**, the operations and production-planning
platform of **Muse Kitchen**, a commissary (cook-chill) kitchen — built as a private, authenticated
route group **inside the CompTable repo** (`apps/web/src/app/(muse)/muse`).

This file governs HOW work is done on Muse. It is scoped to the `(muse)` route group and its
`muse.*` database schema. The repo-root `CLAUDE.md` (CompTable) governs the monorepo,
build tooling, and shared git rules.

---

## 1. Hard naming and confidentiality rules (non-negotiable)

- **Muse Kitchen** is the company brand; **Impact OS** is the product (Robert, 2026-09-15). In
  docs, plans, code and commits the platform is called **Muse** or **the OS**, never "Austin Muse
  Kitchen" or "ERP". The mark and name logo sits upper left in the header;
  the brand and product name ("Muse Kitchen · Impact OS") also run in the footers and on documents —
  invoices and exports — but never on a page header (Robert, 2026-09-19). Nothing else names the product.
- **No mention anywhere** — code, comments, commits, docs, seed data, UI copy, meta tags — of
  the source company, its incubator, its standards partner, or any individual associated with
  them. The originating business is in stealth. The source spreadsheets carry a different
  company name and recipe code; those are **scrubbed** on the way in — the recipe code is
  `AMK-E-001` and no other identifier carries over.
- The route group is **behind Clerk authentication**. Nothing is indexed. Admins and operators are named
  individuals granted access explicitly (§10).
- **One exception (Robert, 2026-09-12):** the certification mark **ERRA** may be named in the
  platform *where ratings are concerned* — the rating pills, their headers, legends and tooltips,
  and the `_data/mark.ts` constant. Nothing else about the standards organization, its structure,
  its relationship to the kitchen, or its people appears anywhere. The rule above stands for all
  other mentions.
- All seed data is **invented**. No real supplier, school, customer, or person appears.
- This is Robert's intellectual property, built inside his own product. Nothing implies
  otherwise and no third-party branding goes anywhere near it.
- **Muse Kitchen** and **Impact OS** are Robert Bogatin's own brand and product names, owned and
  used by him (Robert, 2026-09-21). They are *not* the confidential source company's name, and they
  may appear publicly, for example on the Wolves To Feed publishing page at wolvestofeed.com. The
  confidentiality rule above covers the source company, its incubator, its standards partner and
  their people, never these two names.

## 2. Engine invariants (the model is the product)

1. **Derived batch size is never a typed input — a batch is what one unit of each vessel it
   passes through takes.** One cabinet bounds the chilled portion (`cabinet lb ÷ chilled mass per
   portion`), one skillet or kettle or combi bounds the component it cooks; the tightest wins,
   floored to nearest 25. A second unit of any vessel is a parallel stream the production plan
   places as its own batch — never a larger batch, and never a multiplier on the ceiling, which is
   one stream until the scheduler places the rest (Robert, 2026-09-15; 2026-09-17). Vessel
   capacities come from the equipment library's **Phase 1** rows, are estimated open fields until
   stated, and planned build-outs never count. Chilled mass per portion is the sum of *hot*
   cooked-component yields only (tortilla and cheese are cold-packed and excluded). Batch size is
   therefore **per recipe**. This is the single most important rule in the model. See
   `deriveCapacity` / `batchBounds` in `_engine/index.ts`, `batchVesselsFrom` in
   `_engine/equipment.ts`, and `lines` on `planProductionDay` in `_engine/production-plan.ts`.
1a. **The batch is the costing basis.** Batch costing (bulk as-purchased inputs at the derived
   batch) → yield (cooked, chilled and plated pounds against purchased) → costing down (batch cost
   ÷ portions = unit food cost; cost to serve adds conversion labor, packaging and distribution —
   never storage). A recipe's quantities are written for `batchPortions` and scale to the batch;
   nothing is authored, stored or shown per 100 portions. See `batchCosting` / `costToServe`.
2. **Labor is fixed-per-batch plus variable-per-portion, never a flat throughput rate.**
   `labor minutes = (batches × fixed min/batch) + (portions × variable min/portion)`. Roughly
   a fifth of a full batch's labor does not scale — which is exactly why the platform plans in
   whole batches. See `_engine/time-studies.ts`. The day is two streams (Robert, 2026-09-15): time-study
   lines on the batch stream count per batch cooked; lines on the dispatch stream run on the
   delivery day and count per portion shipped that day, a fixed dispatch line once per delivery
   day (`_engine/staff-demand.ts`). There is no second blast chill.
3. **Whole batches only.** `batches = ceil(shortfall ÷ batch size)`. Whole-batch production
   overshoots demand; the overshoot is inventory while inside hold life and waste the moment it
   is not. Knowing which is the platform's job.
4. **Every dollar shown is computed, not stored.** Cost per portion, contribution margin, the
   planning loop, and the purchase order all recompute from the reference data in `_data/`.
5. **The plated portion is derived from the meal pattern, not authored.** A school entree's
   served weight is whatever weight delivers its crediting contribution for its grade group
   under 7 CFR 210.10(c). The chain runs plated spec → EP → AP → pack rounding; costing runs
   the inverse over the same factors. As-purchased weight per portion is **not** the bowl, and
   the two are never shown without both being labelled. See `_engine/crediting.ts`.
6. **Dollars are conserved through cooking; mass is not.** Dry rice and beans take on water, so
   cooked weight EXCEEDS as-purchased weight for this recipe. There is a distinct cost per pound
   at every stage (`AP`, `EP`, `cooked`, `plated`) and the Recipes page shows all of them — the
   absence of any intermediate rate is what let a 30% portion drift sit invisible behind correct
   dollars.
7. **The served COMPONENT is the unit, not the ingredient line.** Components are what is cooked,
   blast chilled, lot coded, credited and costed into work in process. USDA credits what is
   served: scored line by line, every ingredient in the salsa falls under the 1/8-cup minimum
   and the salsa credits as nothing.
8. **Only the batch execution record posts journals.** No planning surface ever writes to the
   ledger — a plan change must not be able to restate the books. This is the ISA-95 / IEC 62264
   split: the Level 3 production performance object is the source, not the Level 4 schedule.
   See `_engine/batch.ts` and `_engine/production-ledger.ts`. The statements obey the same rule:
   the Plan ledger (`plan-ledger.ts`) and the Actual ledger (`actuals-ledger.ts`) post every batch
   through `productionBatchLedger()`.
8a. **A batch record is one cook, and the cook is the lot** (Robert, 2026-09-17). The record carries
   the cabinet loads filled from that cook (`batchesRun`), one lot code per component, one mass
   balance, and one CCP-2 cooling record per cabinet load — a lot with a load unrecorded is a gap,
   and a lot fails CCP-2 if any load fails. Two cabinets filled from one cook — a double batch — are
   one record and one lot; two cooks of one recipe on one day are two records and two lots. The Plan
   ledger writes its records the same way: batches loaded at the same minute are one cook
   (`forecast-timeline.ts`). See `coolingLoadsOf` in `_engine/batch.ts`.
9. **A batch that does not mass-balance does not close.** `AP issued + cook delta − chill loss −
   scrap = packed`, to 0.5 lb. The cook delta is signed. Every pound resolves to packed product,
   a named stage loss, or scrap carrying a disposition reason code.
10. **Fixed overhead absorbs on normal capacity, never on actual volume.** The rate is budgeted
   fixed overhead ÷ normal capacity (ASC 330-10-30-3). Unabsorbed overhead is a period charge.
   Normal capacity is the production the plan itself expects, net of planned downtime, so it is
   never more than the plant can make (`plan-ledger.ts`; `bundleAbsorption` in `actuals-ledger.ts`).
11. **Capacity is a property of the plant; labor is a requirement of the plan.** The daily ceiling
   comes off equipment, process minutes and the operating day the business chooses to run. The
   production plan emits the labor it needs — staff-hours by clock interval and the headcount each
   task needs at once — and a crew register is a proposed answer checked against it. A staffing
   gap is a finding on the schedule, never an input that shrinks capacity. No staff count, crew
   split or operating day has been stated; do not ask Robert for one — derive it and tag seeds
   PLACEHOLDER. See `_engine/staffing.ts`.

Accounting rules are not restated in this file. [`accounting-policy.md`](accounting-policy.md)
is the authority, co-versioned with `_engine/production-ledger.ts` and `_data/coa-muse.ts`.

## 3. Source of truth and status tags

Every figure traces to `_data/plan-data.ts`, which itself traces to the operating model
spreadsheet and research file in Robert's career folder. **Carry the status tag into the UI** —
a placeholder must look different from a quoted figure:

- `SOURCED` — cited third party (green)
- `STATED` — supplied by Robert (slate)
- `PLACEHOLDER` — working figure, no source yet (amber) — labelled as a placeholder every time
- `DERIVED` — calculated from other tagged rows (violet)
- `UNCONFIRMED` — believed, not verified (amber, never stated to a third party as fact)
- `DATED` — sourced but old (amber)

Ten of the twelve ingredient prices are placeholders. Being the first to say so is what makes
the model credible. Use the `<StatusBadge>` component; do not print a number without its tag
where a tag exists.

## 4. Known contradictions — documented offline, NOT surfaced in the UI

**Decision (2026-09-10, Robert):** the known model inconsistencies are documented in
[`research/validation-notes.md`](research/validation-notes.md) and kept **out of the public UI**.
The engine computes them (`validationWarnings()` in `_engine/index.ts`, with its test), and **no
Muse page renders validation `<Notice>` blocks.** A feature that surfaces the contradictions goes
to an internal/admin surface, not the operator-facing pages.

Placeholder provenance badges (`Placeholder`, etc.) are a separate thing and stay — they label a
figure's source and are not validation blocks.

## 5. No advice, no icons, no invented terms

- **Surface facts and math. Never counsel.** No "recommend / should / best / optimal / consider"
  in any Muse copy. Findings cite a limit and a computed impact; the operator decides.
- **No icons, illustrations, or decorative SVGs** in new content unless Robert explicitly asks.
  Default to text-only layouts.
- **Do not invent business terms** — tier names, segments, supplier names beyond the labelled
  invented seed, or framings. Invented seed data is labelled as invented.
- **Every cited source is on the Sources page (Robert, 2026-09-18).** Any source of data the
  platform cites publicly — a code, a rule, a dataset, a rate schedule, a study, a spec sheet — is
  registered in `muse.sources`: factor-library sources through `_data/emission-factors.ts`,
  everything else through `_data/sources-registry.ts`, both written by `pnpm muse:sources`.
  `test/muse-sources-registry.test.ts` fails when a URL cited in `_data/` or `_engine/` is in
  neither. Add the row with the citation; do not cite first and register later.

- **Page headers (Robert, 2026-09-19; `roadmaps/page-headers-roadmap.md` §3).** A header is a purpose line,
  "On this page" chips, connects and a collapsed "How this page works" — never a paragraph. The purpose line
  starts with a verb and says what the user does or decides here; it never defines a noun and never opens
  "This page…". Chips are the page's own tab and card names, word for word. One rule per bullet in the
  panel. Legends, metric lists and attribute lists go in captions and column headers; empty states, build
  status and developer notes never appear in header copy. Portal copy speaks to the user as "you". The
  guard is `test/muse-page-headers.test.ts`.

## 6. Working method — talk first, build second

When Robert raises a question or flags an issue, **discuss it in detail and reach agreement
before building or fixing anything.** He wants the conversation before the deliverable. The
exception is a factual correction that would mislead him if left standing.

## 7. Git

The repo-root rule stands and is the most-violated one: **never `git commit` or `git push`
without explicit per-action approval.** Approval is per-action, never carried across waves or
phases. Read-only git is fine. Do not run `next build` against the working tree while Robert's
dev server is on `:3000` — it shares `.next` and can 500 the running server.

**Branch (Robert, 2026-09-14): Muse work commits directly to `main`.** Vercel deploys `main`; a
commit that lands on any other branch is not deployed.

**Scope boundary (Robert, 2026-09-14): Muse work must not change CompTable code outside the
Muse folder.** A Muse commit may touch only:

- `apps/web/src/app/(muse)/**`
- `apps/web/test/muse-*.test.ts`
- `apps/web/scripts/*muse*`
- `packages/db/src/schema/muse.ts` and `packages/db/drizzle/NNNN_muse_*.sql`
- `docs/muse/**`
- `package.json` — only to add or edit a `muse:*` script line

Anything else — shared components, `@ct/calc`, `@ct/compliance`, the `public` schema, the
CompTable route groups, layouts, middleware, CI, Vercel config — is out of bounds for a Muse
task. If Muse needs a change there, stop, name the file and the reason, and get Robert's
explicit go-ahead as a separate CompTable change. Before every Muse commit, run
`git diff --cached --name-only` and confirm every path is on the list above.

## 8. Where things live

- `apps/web/src/app/(muse)/muse/` — all Muse routes and the Muse shell (`layout.tsx`)
- `apps/web/src/app/(muse)/(floor)/` — the floor: a sibling route group serving `/muse/floor` with
  its own operator-gated shell, outside the OS sidebar and forecast bar (Roadmap I5)
- `apps/web/src/app/(muse)/(sales)/`, `(customer)/`, `(supplier)/`, `(parent)/` — the portals: sibling route groups
  serving `/muse/sales-portal`, `/muse/customer-portal`, `/muse/supplier-portal` and `/muse/parent-portal`, each in
  its own shell (`_components/PortalShell.tsx`), nothing linking into the OS (Roadmap P1, P1b;
  `roadmaps/portals-roadmap.md`)
- `apps/web/src/app/(muse)/(front)/` — the front door: the welcome page at `/muse`, the one sign-in at
  `/muse/sign-in`, the sign-up at `/muse/sign-up` and the router at `/muse/enter`; the OS's Dashboard is `/muse/dashboard` (Roadmap P7)
- `apps/web/src/app/(muse)/muse/_data/` — `plan-data.ts`, the typed source-of-truth reference
- `apps/web/src/app/(muse)/muse/_engine/` — pure calc functions (capacity, planning loop,
  labor, recipe costing, purchase order, the order book in `orders.ts`, production planning in
  three levels in `production-plan.ts`) + tests
- `apps/web/src/app/(muse)/muse/_components/` — Muse-only UI (shell, status badge, KPI tiles)
- `muse.*` Postgres schema — isolated from CompTable's `public` schema. By migration:
  - 0043 `scenarios`, `workspace_state`
  - 0044 `sources`, `source_figures`
  - 0045 `supplier_lca_options`
  - 0046 `entity_links` — links that are facts of record, not scenario edits
  - 0047 `supplier_items`, `purchase_orders`, `purchase_order_lines`
  - 0048 `batch_records`, `receipts`, `deliveries`, `period_bills` — actuals
  - 0049 `recipes`, `recipe_lines` — the recipe library; the code recipe is its seed
  - 0050 `customers`, `customer_sites`
  - 0051 `menu_cycles`, `menu_cycle_days`, `orders` — a forecast order from a cycle is derived on
    read, never stored; typed, confirmed and delivered orders are rows
  - 0052 `deliveries.handoff_temp_f` / `received_by`
  - 0053 `batch_records.crew` — crew hours by person
  - 0054 `fiscal_periods`, `calendar_closures`, `posting_log` — the period lock, the production
    calendar and the append-only hash-chained posting trail; 0055 — closure kinds are holiday and
    closure only
  - 0056 `standard_versions` — approved, effective-dated standard-cost snapshots the ledger costs
    batches at
  - 0057 `supplier_terms`, `invoices`, `customer_payments`, `supplier_bills`, `supplier_payments`,
    `opening_balances`, `staff`, `time_punches`, and terms / customer / invoice columns on
    `customers`, `period_bills` and `deliveries` — working capital, invoicing and the time clock
    (Roadmap Phase K)
  - 0058 `equipment` — the equipment library, a definition with real-world status (Roadmap N1)
  - 0059 `packages`, `recipe_packages` — the packaging library a meal leaves in and each recipe's
    picks (Roadmap N1)
  - 0060 `payroll_periods`, `staff.comptable_employee_ref` — pay periods closed in CompTable as
    totals by account; 0062 — the staff register carries no pay columns. No pay is held in Muse
    (Roadmap O1)
  - 0061 `time_studies`, `time_study_lines`, `time_study_intervals` — time studies per recipe, the
    adopted labor standard and the re-study cadence (Roadmap O2)
  - 0063 `staff.email` — the sign-in email that makes an active person an operator matched to their
    own record (Roadmap O5)
  - 0064 `time_studies.basis` — estimated or observed; every recipe is seeded with an estimated
    study that stands in until an observed one is adopted
  - 0065 `recipes.batch_portions`, recipe lines keyed on the batch, `equipment.batch_capacity_lb` /
    `batch_capacity_basis` — the batch is the costing basis; vessel capacities as estimated open
    fields
  - 0066 `time_study_lines.stream`, `equipment.concurrent_batches` / `changeover_minutes` /
    `attended_run` / `may_run_unattended` / `resource_basis` — study lines on the batch or dispatch
    stream; the unit as a scheduling resource, estimated open fields
  - 0067 `supplier_item_prices`, `supplier_items.status` / `approved_at` / `approved_by` — a catalog
    line is candidate or approved and its price is effective-dated, held only in
    `supplier_item_prices`: the price in force on a date is the latest row on or before it
    (Roadmap N1)
  - 0068 `loans`, `fixed_cost_lines` — financing and monthly fixed costs as definitions with a
    real-world status; a loan's principal is typed and a fixed-cost line states its own
    `treatment`, manufacturing overhead or G&A
  - 0069 `leasehold_lines` — the leasehold schedule as a definition, each line counted or on record
    only
  - 0070 `training_docs`, `training_assignments` — a training document is a family of versions, none
    overwritten, each timestamped in and out of active status; completion is recorded against the
    version, and assignment follows the staff register
  - 0071 `customer_services`, `service_volume_picks`, `site_calendar_ranges`,
    `menu_cycles.customer_id` / `customer_service_id` / `from_cycle_id` / `end_date`,
    `orders.customer_service_id` — a service is one loading and dispatch, its volume is dated picks
    carried forward, each site has its own calendar, and a row of `menu_cycles` with a customer is
    that customer's meal plan (Roadmap N4a)
  - 0072 `sustainability_readings`, `refrigerant_service` — utility bills, lab results, grease-trap
    inspections and refrigerant service tickets as records Actual reads over the reporting year
    (Roadmap N6)
  - 0073 `customers.erra_status` / `erra_stars` / `erra_rated_on` — the ERRA rating Muse Kitchen
    assigns a customer (Roadmap N7)
  - 0074 `staff.roles`, `time_punches.role` — work roles held together, the role of each shift
    (Roadmap P2)
  - 0075 — both blast chillers on Phase 1 (data only; Roadmap Q4b)
  - 0076 `equipment.footprint_width_in` / `footprint_depth_in` / `clearance_*_in` / `footprint_basis` /
    `zone` / `under_hood` / `footprint_source` — the plan footprint and published clearances as open
    fields, sourced or estimated (Roadmap Q1)
  - 0077 `facility_layouts` — the floor drawing per scenario and build phase, versions never overwritten;
    a drawing, not a ledger entry (Roadmap Q6)
  - 0078 — the pot sink row without a disposer (data only; Austin City Code §25-12-153)
  - 0079 `equipment.manufacturer` / `model` / `spec_sheet_url`, footprints re-sourced to spec sheets —
    shown on the Facility page's Footprints tab, never on Equipment (Roadmap Q1)

  Seed rows (`source = 'seed'`) are written once, under an advisory lock, by `_lib/seed-writes.ts`;
  `pnpm muse:reseed` resets them. Hand-written SQL in `packages/db/drizzle/`;
  `pnpm --filter @ct/db db:migrate` applies; rebuild `@ct/db` after a schema change so the web
  app's types see it. Ordering: an additive migration is applied before the code that reads it —
  the dev server included — and a column drop ships only after the release that stops reading it.
- `docs/muse/` — the Muse docs, laid out like CompTable's `docs/`. Canonical docs at the root:
  this file (rules; links out, never restates status), `overview.md` (what the OS is),
  `roadmap.md` (the master build plan: phases, sequencing and status, linking to each build plan),
  `TODO.md` (open one-off items), `accounting-policy.md` (the accounting rules of record),
  `culinary-operations.md` (thermal processing standards and their mapping onto the recipes),
  `comptable-contract.md` (the CompTable contract, co-versioned with `_engine/comptable-contract.ts`);
  the mark and name logo files in `images/`.
  Build plans in `roadmaps/` (`*-roadmap.md`, one per topic). Review passes, diagnoses and
  scoping records in `research/` (indexed by its `README.md`). Training documents authored in-house
  in `training/`: self-contained, branded HTML (the lockup inlined, print-ready), one file per
  document, versioned in the file's masthead; loaded into the Training library through
  `pnpm muse:training` once the importer takes HTML, or as a PDF printed from the page until then. The same fact never lives in two
  of these; a doc that needs it links to the canonical one.
- Styling — no inline `style` in Muse pages except values computed from data; sizes from the `--muse-fs-*`
  scale (`muse-fs-*`), text colours from the ink and semantic tokens (`muse-c-*`), layout and spacing from
  Tailwind utilities; no hex in `.tsx` beyond brand artwork and data palettes
  (`roadmaps/visual-quality-roadmap.md` §5).
- Page tabs — a dense OS page uses the top-bar tab menu (`.muse-tabs`, `.muse-tab`, `.muse-tab-panel` in
  `_components/muse.css`) over one full-width panel card; which pages, and the rules every conversion
  follows, are in `roadmaps/tabbed-layout-roadmap.md` (§4, §6).
- `docs/muse/confidential/` — **git-ignored, confidential.** Company research, the
  operating-model workbooks, application and interview material, and the pursuit's own
  management docs. No OS document lives there; derived datasets are generated out of it by
  `apps/web/scripts/*muse*` into committed files.

## 9. Plan of record, forecasts, actuals — the vocabulary

- **Plan of record** — the one saved scenario the workspace reports against
  (`muse.workspace_state.active_scenario_id`). Set by a super admin; each change posts to the trail
  with the config as applied, so a past month compares with the plan in force at its end (Roadmap
  N7). Plan-data defaults when none is set. Never call it "live" or "applied".
- **Forecast** — any saved scenario. Anyone opens one (`openForecast`, cookie
  `muse_open_forecast`) and every page — client store and server pages alike — renders it until
  they return to the plan of record. Save writes back to the open forecast; "Save as new" forks it.
- **On screen, the word is always "forecast" (Robert, 2026-09-18).** "Scenario" is the code and table
  name (`muse.scenarios`, `MuseScenarioConfig`, the store) and never appears in UI copy: a saved one is
  a forecast, the marked one is the plan of record, the top bar is the forecast bar, and an edit held
  in one is "this forecast's".
- **Working copy** — the browser draft with unsaved edits. Only client pages see it; a server page
  shows the last saved version and says so.
- **Plan and Actual** — the two ledgers and the two worlds (Roadmap N6), chosen with the toggle in the
  forecast bar. **Plan** is the open forecast's own run: its timeline's orders, batches, purchases and
  deliveries, posted as the Plan ledger; nothing is recorded on it. **Actual** is the recorded facts
  (batch records, receipts, deliveries, bills, payments, punches, sustainability records), posted as the
  Actual ledger; recording happens only there. The Floor and Food Safety always read Actual; the Parent
  Portal reads the records only; Sales follows the open forecast.
- **Channels and phases** (Robert, 2026-09-13) — the three channels are named by name everywhere
  a channel row appears: **School lunches**, **Corporate catering**, **Ghost kitchen**
  (`phases[].market` in plan-data). "Phase 1 / 2 / 3" are the same three things but mean the
  build-out order — customers added one channel at a time — and the word "phase" is used only
  when the text is about that expansion sequence (capital additions by phase, the roadmap).
  Never "Phase 2 — Corporate catering" as a row label.
- **Volume** — what a figure counts is the orders, batches and deliveries of the selected world, recipe
  by recipe (Roadmap N9). No theme change, chip or colour signals which world is
  open; the forecast bar names it.

## 10. Access control — guards throw, they do not report

**Two access roles (Robert, 2026-09-15, Roadmap O5): admin and operator.** Work roles on the staff register —
operator and sales, held together — set which clock a shift is worked on and are reported as hours by role
(Roadmap P2). External portal accounts (customers, parents, suppliers) hold neither access role: they sign in
inside their portal and see "under review" until linked to their record (Roadmap P3). Admins are the named super
admins; an admin is always an operator; there is no third role. An active person on the staff
register whose email is their sign-in is an operator and sees their own HR record only. The page-by-page matrix is in
[`roadmaps/people-roadmap.md`](roadmaps/people-roadmap.md) §6. Admin-only pages return the notice
before they load anything; a layout gate alone is not enough for a server page.

Every Muse `'use server'` action gates on **`requireMuseOperator()`** or
**`requireMuseSuperAdmin()`** from `_lib/access.ts`. Both **throw** `MuseAccessError`,
so an action body cannot run for a caller who is not entitled to it. `getMuseAccess()`
is for read paths that branch on access, but **an action must never gate on
it** — it returns a record, and a returned denial can be ignored.

Convert a refusal to the `{ ok: false, error }` result with `accessRefusal(e)`, and
rethrow anything it does not recognise. `workspace-guard-coverage.test.ts` enforces all
of this: Muse is a scoped extension of the tenant-guard gate (single-tenant, no
workspace id), not an exemption from it.
