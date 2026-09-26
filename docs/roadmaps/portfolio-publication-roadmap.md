# BUILD PLAN — portfolio publication: MicroFarm on axiomdelta.ai

MicroFarm is added to the AxiomDelta venture-studio pickup point as its fourth platform, ordered first, with
a homepage card, an entry on `/projects` and a full project detail page. This plan owns the Farm
half of that work: what may be said publicly, the fact table the page is built from, and the
accuracy review before it ships. The page itself is built in a different repo
(`/Users/robertbogatin/Documents/WTF Publishing/axiomdelta-ai`) under that repo's own conventions,
and its build plan is `docs/farm-impact-os-portfolio.md` there. Both files carry the full phase list
so each stands alone; each is authoritative only for its own side.

**No code in this repo changes.** Nothing under `apps/web/`, `packages/` or `test/` is touched. The
Farm scope boundary (CLAUDE.md §7) permits `docs/**`, which is this file and the status row in
[`../roadmap.md`](../roadmap.md).

Status (2026-09-25): **PP1, PP2, PP3 and PP5 DONE; PP4 part done** (three captures cleared, the
Sales CRM capture refused). PP6 on this file is the last step. The AD page is built and passes its
machine checks; Robert's on-screen review is outstanding and nothing is committed in either repo.

Earlier status line, kept for the record: **PP1 DONE** — the fact table in §3.4 is 25 of 25 cleared. **PP4 part done** —
three captures cleared and handed over, the Sales CRM capture refused (see `PP4`). PP2, PP3, PP5 and
PP6 remain. On the AD side the page itself is not built yet. Nothing committed in either repo.

---

## 0. Decisions with Robert (2026-09-22)

Code comments and the AD-side plan cite these by number.

1. **MicroFarm may be named publicly.** CLAUDE.md §1: "**MicroFarm** and
   **MicroFarm** are Robert Bogatin's own brand and product names, owned and used by him … they may
   appear publicly." The confidentiality rule covers the source company, its incubator, its
   standards partner and their people — never these two names. axiomdelta.ai is the same kind of
   public surface as the Wolves To Feed publishing page named in that rule.
2. **The confidentiality rule travels with the copy.** Everything CLAUDE.md §1 forbids in this repo
   is equally forbidden on the marketing page: no source company, no incubator, no standards
   partner, no individual associated with them. The RATING carve-out is narrower still — it is
   permitted *in the platform where ratings are concerned*, and is therefore **out of scope for the
   marketing page entirely**.
3. **All seed data is invented, and the page never presents it as a subscriber.** No supplier, prospect,
   subscriber or person from the seed set appears, quoted or named. No screenshot ships with a seeded
   name legible in it without a scrub pass.
4. **The no-advice rule binds any description of the product.** CLAUDE.md §5: findings cite a limit
   and a computed impact; the operator decides. The page must not describe the OS as recommending,
   optimising or advising — that would misdescribe the thing it is selling. The product's own
   sentences are the safe ones: *the model proposes, the engine computes*; *report, never repair*;
   *both tables report, neither picks*.
5. **Every figure on the page is verified against this repo at build time.** Not against a summary,
   a roadmap line, or this plan. A figure that cannot be re-derived from the code or the data files
   does not ship. Illustrative figures are labelled as illustrative, the same rule the product
   applies to itself.
6. **The page links to `/farm` and calls the product live**: "Just use the
   forward slash farm URL. I know it's not public. That's the URL for it." The OS runs at `/farm`
   behind Clerk on the Staffing deployment and moves to its own address at launch
   ([`../roadmap.md`](../roadmap.md), Locked decisions); until then that path is its address and the
   page says so without hedging. Two consequences for this side: the link publicly associates Impact
   OS with the Staffing deployment, which the confidentiality perimeter permits since it covers the
   source company and not Robert's own two products; and when the OS moves, the AD link moves with
   it, so the move belongs on the launch checklist.
7. **The Farm brand is used as authored**: "We're not going to adjust the brand
   to fit on the AxiomDelta page. We need to adjust AxiomDelta's page to accommodate Farm." Nothing
   on this side recolors, re-types or re-crops the brand for the AD ground. The brand sheet in
   [`../images/`](../images/) is handed over as it stands and AD changes its own card system around
   it. Mechanism chosen the same day: the Farm cards on the AD pickup point get the Farm *ground* — deep
   emerald `#0B2A22` as the card fill, emerald `#0E6B4E` as the stroke it is on the brand sheet, mint
   `#9FD8BE` as the text on it — rather than a farm-derived accent fitted into AD's palette. No value
   on the brand sheet changes.
8. **The public name is "MicroFarm"**, with **MicroFarm** as the
   short form. Both are permitted by decision 1 and both match CLAUDE.md §1: the company brand and
   the product name, in that order. The AD slug is `/projects/farm-impact-os`.
9. **Claude captures the screenshots through Robert's own Chrome**. The OS is
   behind Clerk and that session exists in his browser; the in-app browser is isolated and has none.
   The scrub in `PP4` is unchanged by who holds the camera, and nothing is handed over until it
   passes.
10. **The page is about the application, not the business**: "We're not saying
    anything specifically about MicroFarm, the business. We're only writing up what the
    application can do itself. We're only talking about the main components found in the left bar,
    main navigation section headers, and the summary write-up." Three content sources, listed in
    §3.1, and nothing else. This subsumes much of decision 2: a page that never describes a business
    cannot describe the confidential one. The perimeter still stands for anything that reaches the
    page through a screenshot.
11. **The Staffing integration stays on the page**: "It will be eventually
    connected API and webhook to Staffing." It is a property of the application — a versioned
    integration boundary the OS was built to have — so it survives decision 10 and is added to §3.1
    as a fourth content source, narrow and named.
12. **That section is written in two tenses, and the split is not optional.** The contract is
    specified and the schemas are built; the transport is not. [`../roadmap.md`](../roadmap.md) has
    Phase M NOT STARTED and O4 as "contract DONE, transport NOT STARTED", and
    [`../staffing-contract.md`](../staffing-contract.md) §4 is an explicit gap table: Staffing has
    no clock table, no demand intake, no pay-period close, no org-scoped read API and no Farm
    connection. Present tense for the contract, the eight documents, the strict validation and the
    signed-notice scheme; future tense for the connection. Under decision 5 an "integrates with
    Staffing" claim would be a figure that cannot be re-derived, and under §1's third point it
    would be a self-refuting error on a page whose subject is traceability.
13. **The training one-pager may be excerpted as a visual**. It covers the
    plan-of-record / forecast / Compare vocabulary, which is platform and not business, so it
    survives decision 10. `../training/plan-forecasts-compare-training.html` and its PDF are
    self-contained and print-ready; an excerpt gives the AD page a second image without a capture.

---

## 1. Why this is a Farm plan and not only an AD one

The AD pickup point's job is to describe MicroFarm accurately. Three things make that harder than it looks,
and all three live on this side of the boundary:

- **The content sources are files, not prose.** Under decision 10 the page is built from `nav.ts`,
  from the `PageHeader` calls on 51 pages, and from one framing paragraph. A writer working only
  from the AD repo cannot see any of them, and a summary of them is not good enough — the first
  pass of this plan carried "roughly 60 module pages" from a summary when the real module count is
  51 and 60 was a count of something else.
- **The status of any given capability is not what a roadmap headline says.** `nav.ts` carries the
  real per-module status (`live` / `partial` / `designed`), the master roadmap carries phase status,
  and the two disagree in at least one place. A page that calls a `designed` surface shipped is a
  false claim on a funder-facing pickup point.
- **The numbers are load-bearing.** The product's whole pitch is that its figures are computed and
  traceable. A wrong count on the page about it is a self-refuting error.

## 2. What the page says the product is

**The page describes the application, not MicroFarm** (decision 10). The framing, in Robert's
words (2026-09-22): an all-inclusive operating system for a sustainable scratch farm, with full
business operations, production planning, facility planning, and a sustainability suite that
provides carbon and resource metrics across everything you do, per unit.

The opening paragraph of [`../overview.md`](../overview.md) is therefore **not** the seed for the
hero copy — it opens on the facility, the grow units and the Austin prospects, all of which
are the business. Its second half is the part that survives, because it is about the platform:

> one shared operating model spanning production, finance, supply chain, cold chain, people, and
> sales. Every figure on screen traces to that model; nothing is typed in by hand, and illustrative
> values are labelled as such.

Two more sentences are usable as written, both already in the product and both about the platform:

- The welcome page's one marketing-voice line: *"Welcome to the operating system built specifically
  for regenerative, scratch farms."*
- [`operating-model-roadmap.md`](operating-model-roadmap.md) §2: *"One set of definitions, two
  ledgers, one engine."*

## 3. The fact table

The deliverable of Phase 1. Every claim destined for the page, with the file that proves it and the
status it may be described at. Built to this shape, one row per claim:

| # | Claim as it would appear | Evidence in repo | Status | Cleared |
|---|---|---|---|---|

Statuses come from `_components/nav.ts`, whose own doc comment defines them: `live` — real computed
numbers from the plan data; `partial` — real analysis, some surfaces still designed; `designed` —
layout and an honest empty state, data not yet wired. A `designed` surface may be named as designed
and never as shipped.

### 3.1 The three content sources, and nothing else

Decision 10 narrows the claim set to three places. A claim that cannot be traced to one of them does
not go on the page.

**(a) The left bar — `_components/nav.ts`.** Read 2026-09-22: **51 modules across 12 sections**, of
which **33 live, 11 partial, 7 designed**. Nine OS sections, then three external portal sections
below the rule that closes them.

| Section | n | Modules |
|---|---|---|
| Overview | 3 | Dashboard · Reports · Sources |
| Production | 11 | Crop plans · Time Studies · Production Planning · Day Schedule · Compare · Calendar · Process · Capacity · Equipment · Packaging · Floor |
| Financials & Accounting | 10 | Unit Economics · Profit & Loss · Balance Sheet · Cash Flow · Ledger · Plan v Actual · Actuals · Receivables · Payables · Capital & Financing |
| Cold Chain | 2 | Inventory · Produce Safety |
| Supply Chain | 2 | Procurement · Suppliers |
| Sustainability | 10 | Inventory & Audit · Facility · Energy (Scope 1 & 2) · Refrigerants · Equipment & Rebates · Inputs (Scope 3) · Supplier LCA Data · Logistics · Waste & End-of-Life · Water & Effluent |
| People | 3 | HR · Schedule · Training |
| Sales | 4 | Sales Portal · CRM · Subscribers · Orders |
| Distribution | 1 | Pickup Points & Routes |
| Subscriber | 2 | Subscriber Portal · Flat Builder |
| Supplier | 1 | Supplier Portal |
| Parent | 2 | Parent Portal · Parent Admin |

Module labels go on the page exactly as `nav.ts` spells them, including the ampersands and the scope
numbers in `Energy (Scope 1 & 2)` and `Inputs (Scope 3)`.

**(b) The page-header purpose lines.** One sentence per page, authored under
[`page-headers-roadmap.md`](page-headers-roadmap.md) and guarded by `test/farm-page-headers.test.ts`
at 140 characters and one sentence. They are the best copy the project has for this purpose and need
no rewriting: each starts with a verb and says what the user does on the page, which is precisely
what a portfolio page needs and is already non-advisory. Pull them verbatim from each page's
`PageHeader` call. The `connects` and `how this page works` slots are available where a section
needs a second line, but the purpose line alone carries most of it.

**(c) The product framing** in §2 above.

**(d) The Staffing integration** (decision 11), from
[`../staffing-contract.md`](../staffing-contract.md) — narrow, and the only claim on the page that
comes from outside (a)–(c). What may be said: eight named documents cross a versioned boundary;
every document is validated strictly, so a field the version does not name is refused — which is why
"a wage cannot ride along on a shift or a per-person breakdown on a payroll period"; notices are
HMAC-SHA256 signed with a replay window and single-handling per event id; Staffing owns
compensation and payroll while the OS owns production and sends the labor its plan requires. What
may **not** be said: that the two are connected today. See decision 12.

### 3.2 What the narrowing removes

Recorded so it is not reintroduced by accident. All of it is about the business, not the platform:
the facility and its grow production; Austin and the prospect channel; the three named
channels (Subscriptions, Restaurants, Retail and wholesale); the derived facility figures — the
production floor by phase, the hood run, the lease-sizing number and the idle share; the compiled
supplier operations and the Central Texas subset; every subscriber, supplier, prospect and person in the
seed set; the RATING mark and anything touching it.

Platform mechanics stay, stated as capability rather than as a fact about anyone's farm: derived
sowing size, whole sowings only, labor as fixed-per-sowing plus variable-per-unit, the two ledgers
on one engine, standard costing with variances isolated, normal-capacity absorption, the mass-balance
rule a sowing must satisfy before it closes, lot traceability both directions, the scope-by-scope
carbon inventory with factor-version stamps and per-unit normalizers, the six provenance tags, and
the agent rule that the model proposes while the engine computes.

### 3.3 Counts to re-derive, never quote

Each recounted from source before the page uses it. The ones read on 2026-09-22 are marked; the rest
are open. **51 modules**, **12 sections**, **33 live / 11 partial / 7 designed** — all read from
`nav.ts` directly. Still to recount: report packages, registered sources, page headers converted,
agent fixtures and tests. Note that the earlier figure of "roughly 60 module pages" was a count of
*headers*, not of nav modules, and the two are not the same number — which is exactly why decision 5
exists.


### 3.4 The fact table — built 2026-09-22 (PP1)

Every claim destined for the page. Status is `nav.ts`'s own word where a module is named. "Cleared"
is against decisions 2, 3, 4 and 10.

| # | Claim as it would appear | Evidence in repo | Status | Cleared |
|---|---|---|---|---|
| 1 | An operating system for a sustainable scratch farm: business operations, production planning, facility planning, and a sustainability suite reporting carbon and resource metrics per unit | Robert's framing, 2026-09-22; `(front)/farm/page.tsx` welcome line | framing | yes |
| 2 | 51 modules across 12 sections | `_components/nav.ts` — counted | live | yes |
| 3 | 33 modules live, 11 partial, 7 designed | `_components/nav.ts` `status` field | — | yes |
| 4 | Nine operating sections, then three external portal sections below the rule | `nav.ts` `SECTIONS` + `EXTERNAL_SECTIONS` | — | yes |
| 5 | One model across production, finance, supply chain, cold chain, people and sales; every figure computed, never stored | `overview.md`; CLAUDE.md §2 rule 4 | live | yes |
| 6 | A sowing is what one unit of each grow unit it passes through takes — never a typed input; whole sowings only | CLAUDE.md §2 rules 1, 3; `_engine/index.ts` `deriveCapacity` | live | yes |
| 7 | Labor is fixed-per-sowing plus variable-per-unit, never a flat throughput rate | CLAUDE.md §2 rule 2; `_engine/time-studies.ts` | live | yes |
| 8 | Plan of record, forecasts, working copy; two ledgers on one engine, no mode switch | CLAUDE.md §9; `operating-model-roadmap.md` §2 | live | yes |
| 9 | Double-entry journal; only the sowing execution record posts, so no planning surface can restate the books | CLAUDE.md §2 rule 8; `_engine/production-ledger.ts` | live | yes |
| 10 | Perpetual inventory at standard cost, variances isolated where they arise, overhead absorbed at normal capacity | `accounting-policy.md`; CLAUDE.md §2 rule 10 | live | yes |
| 11 | A sowing that does not mass-balance does not close | CLAUDE.md §2 rule 9; `_engine/sowing.ts` | live | yes |
| 12 | Lot traceability both directions; gaps reported, never filled with a placeholder | `_engine/sowing.ts`; Produce Safety purpose line | live | yes |
| 13 | Ten financial and accounting modules that close a set of books | `nav.ts` Financials & Accounting | live ×10 | yes |
| 14 | Ten sustainability modules; carbon by scope from the same postings, factor and version stamped on every line, normalized per unit | `nav.ts` Sustainability; Facility purpose line ("Normalizers are the denominators the sustainability pages divide by") | 2 live, 8 partial | yes — state the split |
| 15 | The equipment list is the input; the square footage is the output | `facility-design-roadmap.md`; Facility purpose line | live | yes — capability only, no building's figures |
| 16 | A chef types or dictates a change; the model returns a typed proposal; the engine costs it. *The model proposes, the engine computes.* A gap is found, derived or asked, never guessed | `agentic-assistance-roadmap.md`; Compare purpose line | live | yes |
| 17 | 12 agent fixtures; 59 Farm test files | `test/fixtures/farm-agent/` (12); `test/farm-*` (59) | — | yes |
| 18 | Six provenance tags on screen — SOURCED / STATED / PLACEHOLDER / DERIVED / UNCONFIRMED / DATED | CLAUDE.md §3; `<StatusBadge>` | live | yes |
| 19 | 28 report packages, at least one per section of the menu, in the menu's order | `_engine/reports.ts` `REPORT_CATALOG` — counted; spans all 12 sections | live | yes |
| 20 | Export page — the file equals the screen | `roadmap.md` Phase E | live | yes |
| 21 | 60 page headers, each with a one-sentence purpose line under a 140-character budget | 60 `<PageHeader>` calls; `test/farm-page-headers.test.ts` | live | yes |
| 22 | Every cited source is registered, and a test fails the build when one is not | CLAUDE.md §5; `test/farm-sources-registry.test.ts` | live | yes |
| 23 | **37 reference sources** | `_data/sources-registry.ts` (37); `facility-design.ts` (28 spec sheets); `emission-factors.ts` (10 publications) | live | yes |
| 24 | Eight documents cross a versioned boundary to Staffing, validated strictly, over HMAC-signed notices; built to connect, transport not yet built | `staffing-contract.md`; `_engine/staffing-contract.ts` | contract built, transport NOT STARTED | yes — **two tenses, decision 12** |
| 25 | Four external portals: Subscriber (with Flat Builder), Supplier, Parent, plus Parent Admin in the OS | `nav.ts` external sections | designed ×7 | yes — name as designed |

### 3.5 Findings

**Finding 1 — "78 registered sources" does not survive decision 5.** It is a `farm.sources` row
count after `pnpm farm:sources` has run, and the seed writes from three places plus documents loaded
out of the research folder. What is derivable from committed files: **37** reference sources
(`REFERENCE_SOURCES`), **28** manufacturer spec sheets (unique `specSheetUrl` in
`facility-design.ts`), and **10** factor publications (unique `sourceUrl` in `emission-factors.ts`)
— **75**. The remaining rows are stored documents, which exist in the database and not in the repo.
Decision 5 says a figure that cannot be re-derived from the code or the data files does not ship, so
the stat tile cannot read 78. For Robert: use **37** (one file, exactly verifiable, and the honest
name is "reference sources"), or **75** (the composition above, documented in this table). Either
works for the tile; 78 does not.

**Finding 2 — headers are not modules, and the earlier count conflated them.** There are **60**
`<PageHeader>` calls and **51** nav modules. The difference is detail routes and role-split headers
— `/farm/sources/[id]`, `/farm/suppliers/[id]`, `/farm/receivables/invoices/[id]`, and the Dashboard
and HR pages, which render a different header per role. Both numbers are true and they are not the
same claim. This is where the plan's first pass went wrong, carrying "roughly 60 module pages" from
a summary.

**Finding 3 — the Grow Room has no `PageHeader`.** It carries an H1 and a lede instead, so if the page
lists every module with its purpose line, the Grow Room's line comes from that lede: "Today's queue:
receive what comes off the truck against its purchase order, close each sowing as it is packed, ship
each confirmed order as it leaves. What is typed here is the record the books post from." Longer
than a purpose line; trim or quote in full.

**Finding 4 — one purpose line names the brand.** Supplier Portal reads "Keep your catalog with
MicroFarm up to date." Permitted by decision 1 — it is the brand name, not the confidential
source company — but worth noticing before 51 lines are pasted onto a public page.

**Finding 5 — the sustainability suite is the most `partial` section on the board.** Two of its ten
modules are `live` (Facility, Inputs (Scope 3); Waste & End-of-Life is also live — three), the
rest `partial`. It is also the pillar with no equivalent on the other three AxiomDelta products. The
page can lead on it as long as the statuses are stated; "ten sustainability modules" without the
split would be the kind of claim decision 5 exists to stop.

### 3.6 Appendix — the module inventory with its purpose lines

The copy source for the page's section tiles. Every line verbatim from its `PageHeader`.

**Overview** (3)

- **Dashboard** — See today's plan, stock, capacity and anything that needs attention.
- **Reports** — Read each section’s management reports at summary level, and export the workbook.
- **Sources** — Look up any cited figure and the document behind it.

**Production** (11)

- **Crop plans** — Pick a crop plan to see its cost per unit, sowing size and unit spec.
- **Time Studies** — Time each crop plan's sowing tasks and adopt the one that sets its labor standard.
- **Production Planning** — Plan one crop plan run, one distribution day, or a whole period.
- **Day Schedule** — Place one operating day on the clock and see what it breaks.
- **Compare** — Set one day under two forecasts, or two crop plans side by side.
- **Calendar** — Scan the month for days that don't fit, then open one.
- **Process** — Follow a crop plan's route step by step, and edit any step for this forecast.
- **Capacity** — See the most one blackout rack stream makes a day, and what limits it.
- **Equipment** — Keep the master list of every unit in service, planned or considered.
- **Packaging** — Keep the library of packages units leave the farm in, with costs.
- **Grow Room** — No `PageHeader`; from its lede: today's queue — receive what comes off the truck against its purchase order, close each sowing as it is packed, ship each confirmed order as it leaves. (Finding 3)

**Financials & Accounting** (10)

- **Unit Economics** — Test price and unit per channel against a crop plan’s cost per unit.
- **Profit & Loss** — Read revenue, cost of goods and margin by month, quarter or year.
- **Balance Sheet** — Read the business’s position at each period end.
- **Cash Flow** — See where cash moved, by the direct and indirect methods.
- **Ledger** — Trace every journal entry and prove debits equal credits.
- **Plan v Actual** — Compare each month’s records with the plan of record in force at month end.
- **Actuals** — Record period bills and watch the period's records post to the statements.
- **Receivables** — Invoice subscribers monthly, apply payments, and track what is owed.
- **Payables** — Match supplier bills to receipts, pay what matches, and track what is owed.
- **Capital & Financing** — Size the fit-out, set the loans that fund it, and set monthly fixed costs.

**Cold Chain** (2)

- **Inventory** — See what stock is on hand, how old it is, and where each lot went.
- **Produce Safety** — Log critical control points and cooling, and trace any lot both ways.

**Supply Chain** (2)

- **Procurement** — See stock on hand and on order, and what the next run needs bought.
- **Suppliers** — Find approved suppliers and record volume, price and lead time from conversations.

**Sustainability** (10)

- **Inventory & Audit** — Assemble the year's greenhouse-gas inventory by scope, with the controls auditors check.
- **Facility** — Size the building the equipment list requires, by build phase.
- **Energy (Scope 1 & 2)** — Measure the year's fuel and electricity emissions, planned or billed.
- **Refrigerants** — Track each circuit's annual leak rate against the rule thresholds.
- **Equipment & Rebates** — Set each equipment line's energy and refrigerant attributes, and review the utility's rebate list.
- **Inputs (Scope 3)** — Compare each unit's food footprint on the reference and selected bases.
- **Supplier LCA Data** — Record a supplier's footprint figure for an input, cited to their document.
- **Logistics** — Measure freight ton-miles in from suppliers and out to distribution pickup points.
- **Waste & End-of-Life** — Measure food waste from production, and landfill against compost.
- **Water & Effluent** — Project the city's wastewater surcharge from metered water and lab results.

**People** (3)

- **HR** — Track clock punches, shifts and hours for everyone. (Operator view: "Check your own punches, shifts and hours.")
- **Schedule** — Build two weeks of production staff demand and send it to Staffing.
- **Training** — Track who has read each training document, and the certificates each role holds.

**Sales** (4)

- **Sales Portal** — Check the prospect pipeline, subscribers on file and upcoming orders.
- **CRM** — Work each prospect prospect from first contact to quote and scope of work.
- **Subscribers** — Set who is served, where, when and on what, since all demand starts here.
- **Orders** — See every order by date and subscriber, forecast or on file.

**Distribution** (1)

- **Pickup Points & Routes** — Keep distribution pickup points and service windows, and log each shipment’s temperatures.

**Subscriber** (2)

- **Subscriber Portal** — Place an order, check past orders, and pay invoices.
- **Flat Builder** — Pick a date, choose your units and quantities, and tell us how to distribute.

**Supplier** (1)

- **Supplier Portal** — Keep your catalog with MicroFarm up to date.

**Parent** (2)

- **Parent Portal** — Choose how to pay for your child's prospect units.
- **Parent Admin** — Review enrolled parents, their payment plans and account history.

## 4. Brand assets

In [`../images/`](../images/): `farm-logo-files/svg/` — nine vector masters, text outlined,
no fonts required, in horizontal and stacked lockups for light and dark grounds; `png/` — 21
rasters, lockups at 1x and @2x plus the icon at 1024 / 512 / 180 / 32; and the two source JPEGs. The
in-app icon copies live under `(farm)/farm/_assets/`.

The brand sheet, verbatim from `README.txt`:

> Icon: Living Sprout tile - three soil layers with a rolling horizon, a seedling, and a setting sun
> gauge.
>
> Colors — Emerald (sky) #0E6B4E · Deep emerald (dark bg) #0B2A22 / text #0A3F31 · Copper #B8733A ·
> Light copper (sun) #D9A06F · Deep copper #8E5323 · Soil base #6B3C1A · Mint #9FD8BE · Limestone
> cream #F4EEE3
>
> Type — FARM FARM: Cormorant Garamond SemiBold, tracked +120 · IMPACT OS: Poppins Medium,
> tracked +500

Two consequences for the AD page:

- **The palette is handed over intact and AD accommodates it** (decision 7). The friction is real —
  emerald `#0E6B4E` has too little contrast to be text on AD's `#090b10`, the copper family sits on
  AD's `ad` `#faae61` and `gold` `#d4a24e`, and mint `#9FD8BE` sits on `rv` `#7db07a` — but it is
  AD's to resolve, by giving the Farm surfaces the Farm ground rather than dropping a single
  farm-derived accent into AD's system. Mechanism is AD question Q1. Nothing about it changes a
  value on the brand sheet.
- **There are no product screenshots in this repo.** No `screenshots/` directory exists under
  `docs/` or the route group. The only rendered product artifact is the training one-pager in
  [`../training/`](../training/). Robert has ruled out a brand-art substitute, so `PP4` is now on the
  critical path rather than conditional.

## 5. Steps

Each step is done and reviewed on its own before the next starts.

**PP1 — the fact table — DONE 2026-09-22**
- [x] `_components/nav.ts` read: 51 modules across 12 sections, 33 live / 11 partial / 7 designed
- [x] The §3.4 table built, 25 rows, each with its evidence file and status
- [x] Every count re-derived from source, not from a summary
- [x] Each row marked cleared or not against decisions 2, 3, 4 and 10 — 24 of 25 clear
- [x] Stat-strip figures: 51 modules and 12 sections read from `nav.ts`; **28 report packages**
      confirmed by counting `REPORT_CATALOG`, and they span all 12 sections; **78 registered sources
      does not survive** — Finding 1, the one row not cleared
- [x] The Staffing row written with its tense marked, per decision 12
- [x] Five findings recorded in §3.5; the module inventory with all 51 purpose lines in §3.6

**PP2 — clearance pass — DONE 2026-09-25**
- [x] Fact table read against CLAUDE.md §1 line by line
- [x] No forbidden noun, no seeded name, no RATING reference on the page
- [x] `partial` and `designed` surfaces described as what they are — the sustainability section says
      three live and seven partial rather than "ten modules" flat, and the portal sections are named
      as portals rather than as shipped features
- [ ] Robert's sign-off — outstanding, folded into his on-screen review

**PP3 — hand-off — DONE 2026-09-25**
- [x] Cleared table distributed; the AD page's copy is written from §3.4 and §3.6
- [ ] Confirm the host the AD link resolves to, and add the address change to the launch checklist
      for when the OS moves off the Staffing deployment

**PP4 — screenshots — PART DONE 2026-09-22**

Robert captured four himself and put them in [`../images/`](../images/); the Chrome route in
decision 9 was never needed. Three cleared, one held.

- [x] Captured: Admin Dashboard, Production Planning, Sustainability (Inventory & Audit), Sales CRM
- [ ] Scrub: no seeded supplier, prospect, subscriber or person legible; no forbidden noun in any
      visible string; no signed-in individual's name in the shell
- [x] Three cleared, optimized (1800px, q65) and handed to the AD repo's `public/images/`
- [x] **One refused: `microfarm_sales_CRM.png` is not publishable.** It is a real prospect pipeline,
      not seed data — two named real organizations with street addresses, two named individuals with
      job titles, a banner naming the internal research it was compiled from, and 67 prospects split
      by commercial status down to which are "In Talks" and which are "Signed — active". Publishing
      it would put third parties' names and commercial standing on a public marketing page. It
      breaches decision 3 (no real prospect, subscriber or person), decision 10 (application, not
      business) and decision 2, and it is a privacy problem independent of any of them. Cropping does
      not fix it: the aggregate tiles disclose as much as the table. A CRM image on the page needs a
      capture taken against invented data
- [ ] Optional: recapture Sustainability on the **Plan** ledger. The supplied shot is on Actual, so
      every figure reads `0.00` — correct and honest, but an empty table as an image

**PP5 — accuracy review of the drafted page — DONE 2026-09-25**
- [x] AD copy read against the fact table claim by claim
- [x] Decision 4 holds — the page uses the product's own sentences (*the model proposes, the engine
      computes*; the scheduler reports rather than repairs; a gap is found, derived or asked, never
      guessed) and never says the OS recommends, optimises or advises
- [x] Decision 12 holds — the Staffing section is present tense for the contract, schemas, strict
      validation and signed notices; future tense for the connection
- [x] Every numeral re-verified a second time. **One error caught and fixed:** the `/projects` panel
      read "4 External portals"; `EXTERNAL_SECTIONS` is three (Subscriber, Supplier, Parent), and the
      fourth had come from counting Parent Admin, which sits inside the OS. Now "3 External portal
      sections". The twelve section tiles on the detail page sum to 51, checked against `nav.ts`
- [ ] Robert approves — outstanding

**PP6 — record — NOT STARTED**
- [ ] Update Log here and the status row in [`../roadmap.md`](../roadmap.md)

## 6. Rules for whoever builds it

1. **No code in this repo changes.** Docs only. If a step seems to need a code change, it is
   out of scope and goes to Robert.
2. **Verify, do not quote a summary.** Every figure comes from the file that computes it.
3. **Status before adjective.** Read `nav.ts` before writing that anything is shipped.
4. **The confidentiality perimeter is not negotiable and has no marketing exception.**
5. **Describe the product in its own sentences.** They are already non-advisory; rewriting them into
   marketing voice is how the rule gets broken.
6. **Illustrative is labelled illustrative**, on the page as on the screens.
7. **Do not commit or push without per-action approval.**

## 7. Open for Robert — not blockers

Decisions 10 and 13 cleared everything this section used to carry: the Austin-prospects line and the
derived facility figures are out as business facts, the Staffing section is in under decisions 11
and 12, and the training one-pager is approved as a visual. One item remains, raised by the fact
table rather than carried into it:

- **Finding 1 — which registered-sources figure the stat tile uses.** 78 cannot ship; it is a
  `farm.sources` row count after seeding. Derivable from committed files: **37** reference sources,
  or **75** counting the 28 manufacturer spec sheets and 10 factor publications alongside them.
  Robert picks. Nothing else in the table is blocked by it.

## Update Log

| Date | Change |
|---|---|
| 2026-09-25 | **PP2, PP3 and PP5 done; the AD page is built.** The page's copy comes from §3.4 and the §3.6 purpose lines. PP5 caught one error before it shipped: the `/projects` scope panel claimed "4 External portals" when `EXTERNAL_SECTIONS` is three — the fourth had come from counting Parent Admin, which is inside the OS, not a portal. Fixed. The twelve section tiles sum to 51 against `nav.ts`. Decision 4 and decision 12 both verified on the drafted copy. Robert's on-screen review and sign-off are the only things left, and nothing is committed. |
| 2026-09-22 | **PP4 part done, and one image refused.** Robert supplied four captures. Three cleared, optimized and handed to the AD repo. The Sales CRM capture is **not publishable**: it shows a real prospect pipeline — named organizations with addresses, named individuals with titles, the internal research named in a banner, and 67 prospects by commercial status. That is decisions 2, 3 and 10 all at once, and a privacy problem on its own terms; cropping does not fix it. Also settled: the registered-sources claim is **37 reference sources**, so row 23 of §3.4 clears and the table is 25 of 25. Noted: the Sustainability capture is on the Actual ledger so it reads all zeros, and the Admin Dashboard capture shows the three channel names as column headers — UI in a screenshot rather than a claim in copy, so left alone. |
| 2026-09-22 | **PP1 done — the fact table is built.** 25 claims in §3.4, each with its evidence file and its real `nav.ts` status; 24 cleared. Counts re-derived rather than quoted: 51 modules / 12 sections / 33 live / 11 partial / 7 designed, 28 report packages spanning all 12 sections, 60 page headers, 12 agent fixtures, 59 Farm test files. Five findings in §3.5, the material one being that **78 registered sources cannot ship** — it is a `farm.sources` row count after seeding, and the committed files carry 37 reference sources + 28 spec sheets + 10 factor publications = 75. Also recorded: headers are not modules (60 vs 51, the error the first pass made), the Grow Room has no `PageHeader`, and the sustainability suite is mostly `partial` so its split has to be stated. §3.6 carries all 51 purpose lines as the copy source. Decision 13 added: the training one-pager may be excerpted. |
| 2026-09-22 | **Last two answered**. The stat strip is the basics — 51 modules, 12 sections, 28 report packages, 78 registered sources. The Staffing integration stays: "It will be eventually connected API and webhook to Staffing" — a property of the application, so it survives decision 10 and joins §3.1 as a fourth, narrow content source. Decision 12 pins the tense: the contract and schemas are built and the transport is not, so "integrates with Staffing" would be false today while "built to connect, contract already specified" is both true and the stronger claim. Decisions 11 and 12 recorded; §3.1 and `PP1` extended. No questions remain but the training one-pager. |
| 2026-09-22 | **Scope narrowed to the application**: "We're not saying anything specifically about MicroFarm, the business. We're only writing up what the application can do itself." Decision 10 recorded; §2 and §3 rewritten around three content sources — the left bar, the page-header purpose lines, and the product framing. `nav.ts` read directly: **51 modules across 12 sections, 33 live, 11 partial, 7 designed**; the section table is now in §3.1 and the removed business material is listed in §3.2 so it is not reintroduced. The earlier "roughly 60 module pages" was a header count carried from a summary and is dropped — an instance of exactly what decision 5 exists to prevent. Two of the three questions in §7 are answered by the narrowing; the Staffing-section question is added. |
| 2026-09-22 | **The remaining four answered**. The palette mechanism is a branded ground for the Farm cards on the AD pickup point — deep emerald fill, emerald stroke, mint text — so no brand value changes and the mint-against-sage collision dissolves. Public name is "MicroFarm", short form "MicroFarm", slug `/projects/farm-impact-os`. Screenshots are captured by Claude through Robert's signed-in Chrome rather than handed over, which takes `PP4` off Robert's pack. Decisions 7–9 recorded; `PP3` and `PP4` rewritten. |
| 2026-09-22 | **Four decisions answered**. The page links to `/farm` and calls the product live; the Farm brand is used as authored and AD adjusts its own card system around it, not the reverse; screenshots are captured rather than substituted with brand art, which puts `PP4` on the critical path; and the pickup point reads "four live platforms". Decisions 6 and 7 recorded, §4 and `PP4` rewritten. Open on this side: whether the Austin-prospects line may run publicly as written, whether the derived facility figures are for public reading, and whether the training one-pager may be excerpted. |
| 2026-09-22 | **Plan opened.** MicroFarm goes on axiomdelta.ai as the fourth platform, ordered first. This file owns the Farm half: the confidentiality clearance, the fact table the page is built from, and the accuracy review. Six decisions recorded, six steps drafted, three questions open for Robert. No code in this repo changes. The build plan for the page itself is `docs/farm-impact-os-portfolio.md` in the axiomdelta-ai repo, where seven decisions are open — the three that gate the most work being that there is no public URL to link to, there are no product screenshots in this repo, and no Farm brand color can be used verbatim as an accent on that pickup point's dark ground. |
