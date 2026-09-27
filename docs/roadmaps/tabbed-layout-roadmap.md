# BUILD PLAN — tabbed page layout

Dense OS pages move from a long scroll of stacked cards to a top-bar tab menu over one full-width panel
card that grows lengthwise with the open tab. The Facility page (`sustainability/facility/FacilityClient.tsx`)
is the reference implementation: one tab bar, one panel, the open tab held in the URL hash.

Status lives in [`../roadmap.md`](../roadmap.md) (Phase T); this file owns the decisions, the audit, the
per-page plans and the rules.

## 1. Decisions

1. Pages whose content has grown dense move to the top-bar tab menu.
2. One large, full-width panel card holds the open tab's content and expands lengthwise with it.
3. The tab menu is polished: a stroke outline on every tab, shading and highlights.
4. Scope is the OS's active sections. Portals, the Grow Room, Dashboard, Reports and Sources are out.
   *Amended 2026-09-18:* the Reports library is built on the tab bar by decision — one tab per section
   of the main menu, in the menu's order — with the search, lens and sort controls above the bar and the open tab
   in the URL hash, as §6 requires. It is the one page outside the active sections that carries tabs.
   *Amended 2026-09-18:* Compare carries two tabs by decision, Day and Grow plan — two independent
   comparisons on one page, not a length conversion (`agentic-assistance-roadmap.md` decision 1); the Day
   tab's own selectors sit inside it.
5. No page is converted until Robert has confirmed the list (§4).
6. (2026-09-17, after the final risk pass in §4a) A page with any indication of risk under the tab pattern is
   not converted. Only pages selected for length that carry no risk convert. Keep it simple.

## 2. The rule applied

Screen 1440×900, sidebar excluded; one viewport = 900px. For an ERP working screen:

- **Convert** at ≥ 3.5 viewports (~3,150px), or ≥ 7 top-level cards covering ≥ 3 separable jobs.
- **Borderline** at 2.5–3.5 viewports, or 5–6 cards.
- **Keep** below that, or where the page is one continuous statement, table or canvas that tabs would cut.

Depths are static estimates from the code and the seed row counts (header ~160px, KPI row ~120px, card
chrome ~60px, table rows ~34px), not measured renders. Several pages are short only because records
(punches, lots, cooling loads, bills) have not accrued; for those both figures are given.

## 3. Phases

**T0 — the tab CSS**  DONE (2026-09-17)
- [x] `farm.css`, "Page tabs": folder tabs, each with a stroke, a bevel highlight and a shaded fill; hover
      lifts the fill and highlight; focus ring in copper.
- [x] Selected tab: copper top edge and soft glow, panel surface, bottom stroke dropped so it opens into the
      panel.
- [x] `.farm-tab-panel` is the full-width panel card: border-box, no fixed height, square top corners under
      the bar; cards inside it step down to stroke and bevel only.
- [x] `.farm-tab-count` pill; narrow screens scroll the bar sideways; print hides the bar and flattens the
      panel.

**T1 — page audit**  DONE (2026-09-17). 40 pages; results in §4. Final risk pass DONE (2026-09-17); results in §4a.

**T2 — convert, first wave**  Ledger DONE (2026-09-17); the rest HELD under decision 6 (§4a names the risk)
- [ ] HR
- [x] Ledger — Journal · Trial balance · Statement of income · Posting basis (the last only when it has content); status, period picker and KPI strip above the bar; hash-linked (2026-09-17). Paging the journal is still open.
- [ ] Actuals
- [ ] Orders
- [ ] Grow plans
- [ ] Capacity
- [ ] Production Planning (sub-tabs under Day and Horizon)

**T3 — convert, second wave**  NOT STARTED
- [ ] Produce Safety
- [ ] Training
- [ ] Inventory & Audit
- [ ] Receivables and Payables, as a pair
- [ ] Inventory

**T4 — borderline, Robert to decide**  OPEN
- [ ] Plan v Actual · Capital & Financing · Unit Economics · Time Studies · Subscribers · Logistics · Energy ·
      Water · Day Schedule

**T5 — raise in-card tabs to the page bar**  NOT STARTED
- [ ] Sales (CRM)
- [ ] Suppliers

## 4. The audit (2026-09-17)

| Page | Cards | Est. depth | Viewports | Verdict |
|---|---|---|---|---|
| **Production** | | | | |
| Grow plans | 9 + KPI band | ~4,750 | 5.3 | CONVERT |
| Time Studies | 6 | ~2,100 (~2,750 form open) | 2.3–3.1 | BORDERLINE |
| Production Planning | Day 7 · Horizon 7–8 · Run 3–4 | ~4,500 · ~5,000 · ~1,700 | 5.0 · 5.5 · 1.9 | CONVERT (Day, Horizon) |
| Day Schedule | 4 | ~3,100 | 3.4 | BORDERLINE, lean keep |
| Compare | 2 | ~1,630 | 1.8 | KEEP for length; tabbed by decision 2026-09-18 (Day · Grow plan) |
| Calendar | 2 | ~1,920 | 2.1 | KEEP |
| Process | 4–5 | ~1,800–2,170 | 2.0–2.4 | KEEP |
| Capacity | 7 | ~4,870 | 5.4 | CONVERT |
| Equipment | 1 | ~1,000–1,420 | 1.1–1.6 | KEEP |
| Packaging | 1 | ~930 | 1.0 | KEEP |
| **Financials & Accounting** | | | | |
| Unit Economics | 6 | ~2,520 | 2.8 | BORDERLINE |
| Profit & Loss | 3 | ~1,690 | 1.9 | KEEP |
| Balance Sheet | 3 | ~1,230 | 1.4 | KEEP |
| Cash Flow | 2 | ~1,350 | 1.5 | KEEP |
| Ledger | 5 | ~6,500 (Actual month) – ~36,000 (Plan year) | 7–40 | CONVERT |
| Plan v Actual | 4 | ~3,120–3,270 | ~3.5 | BORDERLINE |
| Actuals | 7 | ~4,800–6,300 | 5.4–7 | CONVERT |
| Receivables | 5–6 | ~3,090–3,250 | 3.4–3.6 | CONVERT |
| Payables | 5 | ~3,100 (~3,820 form open) | 3.4–4.2 | CONVERT |
| Capital & Financing | 6 | ~2,610 | 2.9 | BORDERLINE |
| **Cold Chain · Supply Chain** | | | | |
| Inventory | 2 | ~700 now → ~5,700 operating | 0.8 → 6.3 | CONVERT (2 tabs) |
| Produce Safety | 4 | ~1,350 now → 5,500+ | 1.5 → 6+ | CONVERT |
| Procurement | 2 | ~4,100 | 4.6 | KEEP (filter the supply table) |
| Suppliers | 2 (in-card tabs) | ~2,800–5,400 | 3.1–6 | RAISE TABS |
| **Sustainability** | | | | |
| Inventory & Audit | 3 | ~3,900 | 4.3 | CONVERT |
| Energy | 3–4 | ~1,600 Plan / ~2,900 Actual | 1.8 / 3.2 | BORDERLINE |
| Refrigerants | 2 | ~1,200–1,600 | 1.3–1.8 | KEEP |
| Equipment & Rebates | 2 | ~2,200 | 2.4 | KEEP |
| Inputs | 2 | ~1,350–1,650 | 1.5–1.8 | KEEP |
| Supplier LCA | 1–2 | ~1,100 | 1.2 | KEEP |
| Logistics | 2 | ~2,900 | 3.2 | BORDERLINE |
| Waste | 2 | ~1,160 | 1.3 | KEEP |
| Water | 2–3 | ~1,250 Plan / ~3,200 Actual | 1.4 / 3.6 | BORDERLINE |
| Facility | 6 tabs | — | — | ALREADY TABBED |
| **People** | | | | |
| HR | 8 | ~2,900 now → ~22,000 operating | 3.2 → 24 | CONVERT |
| Schedule | 2 | ~1,600 | 1.8 | KEEP |
| Training | 5–7 | ~2,300 → ~4,000 | 2.5 → 4.4 | CONVERT |
| **Sales · Distribution** | | | | |
| CRM | 2 (in-card tabs) | ~4,500 | 5.0 | RAISE TABS |
| Subscribers | 4 + forms | ~2,700 (grows ~190px per prospect pickup point) | 3.0 | BORDERLINE |
| Orders | 5 + forms | ~4,800 | 5.3 | CONVERT |
| Pickup points | 1 | ~800 | 0.9 | KEEP |

## 4a. Final risk pass (2026-09-17)

Every T2–T5 page and every borderline page was read against the Facility pattern, whose inactive tabs are
unmounted. Depths are re-estimated from today's seed rows. Under decision 6 a page converts only when this
table names no risk for it. **Ledger** is the only such page and is converted.

| Page | Today (vp) | Risk that holds it |
|---|---|---|
| Grow plans | 4.9 | `GrowPlanEditor` draft lives inside the Library card; `GrowPlanSelector.setCode` (`router.replace`, no fragment) drops the hash; `SectionSave` inside the input-lines card; ⌘P prints one tab |
| Capacity | 4.4 | Two `SectionSave`s both claim `capacity` — Revert in one tab discards the other's edits; selector drops the hash; every input in Plant inputs is read in three other tabs |
| Production Planning | 3.8 / 3.4 | Distribution day and Horizon cards are shared controls not lifted; Horizon Summary is empty for an operator; five `?level=day` links, not four |
| Actuals | 2.8 → 7 | `OpeningBalanceForm` rendered outside `ActualsClient`; two server cards need slots; `?period=` links drop the hash; `msg` spans three tabs |
| Orders | 3.3 → 20 | `ShipForm` (lots, temperature, signature; posts revenue and COGS) and `FlatPlanForm` keep their draft inside the form |
| HR | 2.8 → 28 | Punches tab is empty for an operator on Plan; `StaffingConnection` is a server card; period selector inside the Hours card |
| Produce Safety | 1.1 → 75+ | All server-rendered; failure notices (cooling log) and the recall trace are one derived set split across two tabs; the log is unbounded and needs paging first |
| Training | 2.0 → 5.1 | `UploadPanel` state and an in-flight `fetch` inside a tab; Roster and Course catalog are server cards |
| Inventory & Audit | 3.1, fixed | `sources/by/[provenanceId]` redirects to `#<factorId>` and relies on native anchor scroll to a registry row; hash is not decoded, ids contain `:` |
| Receivables / Payables | 1.1 / 1.0 → 2.9 / 3.5 | `LedgerMonthBar` `?period=` links drop the hash; Aging is a server card; Collections and Payments tabs are near-empty on Plan |
| Inventory | 0.7 → 4.9 | All server-rendered; `LedgerMonthBar` drops the hash |
| Sales (CRM) | 4.4 | Native GET filter form and bare Reset link drop the hash (needs `?tab=`); `SectionSave` two levels down; `PinMap` rebuilds and refetches tiles per open |
| Suppliers | 3.6 | Native GET filter form and Reset drop the hash; `SectionSave` inside the card |
| Subscribers | 3.5 | Subscriber and pickup point forms render outside every channel card; the channel select can move a record into another tab on save; growth is all in one channel |
| Capital & Financing | 2.9 | One `capex` save inside the Loans card covers three tabs; `err` from six mutations renders only in Loans; leasehold edits feed the loan-gap line in another tab |
| Unit Economics | 2.7 | The lede promises live recompute from Inputs; tabs separate the control from every output; selector drops the hash |
| Plan v Actual | 2.4 → 3.4 | No client code; four server slots; 18 `?period=` links drop the hash |
| Time Studies | 1.9 / 2.7 | Under the bar; log already height-capped; Log → Trends is one statement; Record tab is admin-only |
| Day Schedule | 4.5 | Depth is two degenerate tables (crew short-bucket list with no crews seeded); `flagged` couples three of four cards; Gantt and crew strip share one axis. Collapse the two tables instead |
| Logistics | 1.6 | Under the bar (the §4 figure was ~2×) |
| Energy / Water | 1.7 / 1.4 | Under the bar on both worlds today; `SustainabilityReadingsCard` keeps a 7-field bill draft inside the card; tab set differs Plan vs Actual |
| Ledger | 40+ | none — converted |

Cross-cutting: the Facility client renders the default tab on the server and swaps to the hash after hydration,
so a deep link flashes the default tab; print captures only the open tab; `useSustainabilityWorld`,
`useLedgerBook`, `useLedgerJournal`, `useLinkedEntities` and `useLinkedSuppliers` must stay in the page-level
client or they re-fetch or re-post on every tab open.

## 5. Per-page plans

Above the tabs = stays outside the panel, visible on every tab.

**HR** — Above: message, Plan notice, the pay-period selector (lifted out of the Hours card). Tabs: Clock ·
Hours · Shifts · Punches · Staff register · Payroll & Staffing (admin). Risks: `periodStart`, `msg`,
`pending` shared; the tab set is role-dependent.

**Ledger** — Above: status, period picker, KPI strip. Tabs: Journal · Trial balance · Statement of income
(duplicates P&L; may drop) · Posting basis. Also page the journal (`_lib/ledger-actions.ts` `limit`
defaults to 400) and consider month as this page's default. Risk: one `useLedgerJournal` feeds KPIs, trial
balance and journal — keep it in the parent.

**Actuals** — Above: period banner, KPI strip, `msg`. Tabs: Month (income v plan, position) · Records (with
the period-bill form) · Close (lock, posting trail) · Setup (calendar closures, opening balance). Risks:
server cards need client-shell slots; "opening balance recorded below" copy; the links from Orders
(`OrdersClient.tsx:188, :443`) and Production Planning (`:419`) should land on Records.

**Orders** — Above: Range card, KPI row. Tabs: Order book (order form and ShipForm move inside) · Distribution
day · Pickup points · Subscription cycles (with FlatPlanForm). Risk: from/to/channel shared by three tabs and the KPIs.

**Grow plans** — Above: grow plan selector, name, 8-tile KPI band, `SectionSave`. Tabs: Library · Costing (sowing
costing, input lines) · Process (sow to blackout rack) · Unit & nutrition (with allergens) · Packaging ·
Standard. Risk: "Select" in the Library should switch to a detail tab.

**Capacity** — Above: header with grow plan selector, KPI band, one save control. Tabs: Constraint chain (with
control-point-2 cooling) · Plant inputs (with other capacities) · By grow plan & unit · Staffing. Risks: "Propose a
crew on Capacity" links from Day Schedule and Production Planning need `?tab=staffing`; two `SectionSave`s
overlap; "a staffing finding, below" copy.

**Production Planning** — Keep Run / Day / Horizon (`?level=`) as the primary control; add `&tab=`.
Day: Requirements (with sowing records and the close form) · Blackout rack · Labor · Purchasing. Horizon: Summary
· Days · Purchasing. Run stays as it is. Risks: four inbound `?level=day` links; the close form must render
in the Requirements tab; on-hand overrides feed purchasing.

**Produce Safety** — Above: KPI row. Tabs: Cooling log (default) · Recall trace · CONTROL POINT plan · Coverage. The
cooling log needs a date range or paging regardless.

**Training** — Above: KPI row 1. Tabs: Documents · Drafts & upload (admin) · Roles & certificates · Course
catalog. Risk: `TrainingDocs` state (`msg`, `pending`, `openHistory`) must be lifted.

**Inventory & Audit** — Above: header with evidence-pack button, world note, KPI strip. Tabs: Statement ·
Baseline & restatement · Factor registry. Risk: `sources/by/[provenanceId]` redirects to
`#<factorId>`; an unknown hash matching a factor id must open the Registry tab and scroll to the row.

**Receivables / Payables** — Above: month bar, KPI strip, exceptions card, `msg`. Receivables: Billing ·
Collections · Aging. Payables: Matching (receipts, bill form, supplier bills — one tab, the form opens from
both tables) · Payments · Aging. Risk: Aging is server-rendered outside the client and needs a slot;
`?period=` links must carry the tab.

**Inventory** — Above: month bar, KPI row. Tabs: Finished goods · Raw materials.

**Borderline notes** — Plan v Actual: Totals · By grow plan · By channel · By subscriber. Capital: Capex · Loans ·
Fixed costs · On the ledger (the one `capex` save must move above the tabs). Unit Economics: Inputs · Cost
build-up · Channels · Fixed cost & absorption. Time Studies: Standard & log · Trends · Record & schedule.
Subscribers: one tab per channel, or a list/detail view as prospect pickup points grow. Logistics: Inbound · Outbound.
Energy and Water: long only on Actual, from the shared `SustainabilityReadingsCard` — convert both the same
way or neither. Day Schedule: collapse "Every block placed" instead of tabbing.

**Raise tabs (T5)** — Sales (CRM) and Suppliers already tab inside a card that opens ~650–700px down; move
the bar to the page-level `farm-tabs` and trim the chrome above it. Keep `/farm/sales?q=` (from
`_lib/entity-directory.ts:68`).

## 6. Rules for every conversion

1. Selectors, scenario and period bars, KPI strips and any save control whose section spans tabs stay above
   the tabs.
2. An inline form opens in the same tab as the button that opens it.
3. The open tab is linkable: the hash (Facility pattern), or `&tab=` where the page already routes on query
   params; period and filter links carry the tab.
4. Copy that says "above" or "below" is reworded.
5. Server-rendered cards go into a small client tab shell as slots.
6. Role-gated cards make role-gated tabs; an operator never sees an empty tab.
7. Farm code only; no change to Staffing outside the app folder.

## Update Log

| Date | Change |
|---|---|
| 2026-09-18 | Decision 4 amended a second time: Compare tabs by decision (Day · Grow plan), per the agentic-assistance plan. |
| 2026-09-17 | Plan opened. T0 built: the tab CSS polished in `farm.css`. T1 run: 40 pages audited by four sub-agents; 7 convert first, 6 second, 9 borderline, 2 in-card tab bars to raise, 16 kept. No page converted yet. |
| 2026-09-17 | Final risk pass (§4a) over every convert and borderline page. Decision 6: no page with any risk indication converts. **Ledger converted** — the only risk-free page. Everything else in T2–T5 held. |
