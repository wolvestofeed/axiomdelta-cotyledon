# BUILD PLAN: page headers (Phase U)

**Status: APPROVED 2026-09-19; U0–U6, U8 and the D4 part of U7 built the same day. Open: the glossary, the Plan/Actual chip, the print footnote.** Phase U is in
[`../roadmap.md`](../roadmap.md) with the bullet highlights; this file keeps the detail.

**Goal:** a new user should be able to scan any page header in about 10 seconds and know three
things: what they do on the page, what is on it, and which pages feed it or depend on it. The
engine rules the current ledes explain are all kept. They move into a collapsed "How this page
works" panel, which is where the teaching content lives.

**How this was assessed:** on 2026-09-19 four review passes ran over every `PageHeader`, 60 headers
in total. One was a design pass on the component, `farm.css` and the nav. Three were UX-copy
passes: production and planning; finance and commercial; sustainability, people and portals.

---

## 1. Findings

- **Volume.** 60 headers carry about 3,250 words of lede. The median is about 56 words, and 12 pages
  run over 85 words. The worst are Capacity (131), Inventory (128), Compare (106), Process (106),
  Orders (103), Schedule (97), Time Studies (89) and Day Schedule (88).
- **Every lede is a single paragraph at one weight.** What the page is for, how it connects to other
  pages, and the engine rules all share one colour, one size and one block. Readers scan the first
  line and the left edge, and a paragraph gives them nothing to catch on. On Capacity the real rules
  sit mid-paragraph, where nobody reads.
- **Most ledes open by defining a noun, not by saying what the user does.** Examples: "Capacity is a
  property of the plant.", "The grow plan library.", "Three levels."
- **Line length.** Since 2026-09-18 the lede runs full width (`max-width: none`). At 14px that is
  about 180–200 characters per line, about 2.5 times the comfortable reading measure. This is fine
  for one short line and hard work for a paragraph. See decision D2.
- **The same text shows on every visit.** A method explained once helps. Explained at full length on
  every visit, it slows the page down and pushes the KPI tiles below the fold.
- **The same rules are repeated across pages:**
  - Plan/Actual ledger: 6 finance pages and 4 sustainability pages
  - the two streams (sowing and harvest): Process, Day Schedule, Schedule
  - labor standard: Time Studies, Schedule, Process
  - stock = receipts less issues: Inventory, Procurement
  - "same journal": Ledger, Balance Sheet, P&L
  - factor/version on every posting and "two bases, always both": the sustainability pages
- **Ledes carry content that belongs elsewhere.**
  - Legends and metric lists belong in table captions: Calendar, Compare, Process.
  - Attribute lists belong in column headers: Packaging, Equipment.
  - Empty-state wording belongs in the empty state: Actuals, Inventory.
  - Build-status notes belong in the status pill or a staff banner: Supplier Portal, Subscriber Portal,
    Parent Admin, Parent Portal.
- **Portal ledes are written about the outside user, in the third person, not to them.** Two also
  contain developer notes ("while sign-in is being built", "the subscriber is picked below").
- **Nav blurbs.** `nav.ts` has a `blurb` field on every page, but the sidebar never renders it.
  Several blurbs repeat or contradict the lede.

### Defects found along the way (fix regardless of this plan)

| # | Page | Issue |
|---|---|---|
| F1 | Process | The lede says "edited for this **scenario**", which breaks the rule in CLAUDE.md §9. It was missed by the 2026-09-18 vocabulary pass. |
| F2 | Training | The nav blurb says "Sequenced audio/video content". The page is documents, a read record, courses and certificates. The nav label says "Training" and the title says "Training & Certification". |
| F3 | Sales | The H1 says "Sales" and the nav says "CRM". Pick one. |
| F4 | Profit & Loss | The lede says "fixed cost is a period expense, never inside the cost of a unit". `accounting-policy.md` absorbs fixed *manufacturing* overhead at normal capacity. Check the wording, e.g. "Fixed operating cost…". |
| F5 | Pickup Points & Routes | The lede says "daily forecast units" per pickup point. Subscribers says demand is units per service on each pickup point's calendar. Check whether this is one source of demand or two. |
| F6 | Supplier LCA data | Title case. Every other title is Title Case: "Supplier LCA Data". |
| F7 | Inputs, Refrigerants | Refer to "the study" and "the rule thresholds" without a Sources link. |

---

## 2. The new header (component design)

`PageHeader` gains four optional slots. The existing `lede` prop keeps working, so pages migrate one
at a time.

```ts
PageHeader({
  title, status, right, brand,                                  // unchanged
  purpose?: string,                                             // one line, always visible
  functions?: string[],                                         // "On this page" chips
  connects?: { href: string; dir: 'from' | 'to' | 'both' }[],   // labels looked up from nav.ts
  howItWorks?: React.ReactNode,                                 // collapsed disclosure, bullets
  lede?: string,                                                // @deprecated
})
```

| Slot | What it holds | Budget | Look |
|---|---|---|---|
| **Purpose** | What the user does or decides here. Starts with a verb. Never "This page…" | 1 sentence, ≤ 15 words (≤ 140 chars) | `--farm-fs-md`, `--farm-ink-soft` |
| **On this page** | The names of the page's tabs and cards, word for word, so no new vocabulary is introduced | 2–5 items, 1–3 words each | Plain `.farm-chip` row. An item is an `#anchor` link only when it jumps to a section |
| **Connects** | Workflow links: `From` Equipment · Grow plans, `To` Production Planning | ≤ 4 links | One `fs-xs` line. "From" and "To" are real words (no icons, per the house rule) |
| **How this page works** | The rules and method, one rule per bullet. This is the teaching content | 3–6 bullets, ≤ 25 words each, ≤ 120 words total | Native `<details>`, collapsed by default, text affordance "Show / Hide", copper left rule when open |

**Always-visible text drops from 60–130 words per page to about 25–35 words.** Nothing is deleted.

Behaviour:

- **Open or closed state is remembered per page.** It is stored in `localStorage` under
  `farm.hiw.<route>` inside try/catch, so it is a convenience only. The server always renders the
  panel collapsed, which avoids a hydration mismatch.
- **Not auto-opened on a first visit.** Auto-opening would bring back the wall of text.
- **Print and export.** Purpose prints. How this page works prints expanded. Chips and links are
  hidden, since they are navigation. On `brand` statements (P&L, Balance Sheet, Cash Flow, reports),
  How this page works prints as a "Basis of preparation" footnote at the end.
- **Plan/Actual pages** (Inventory, Plan v Actual, HR admin/operator) pick their purpose and bullets
  by mode. The first bullet names the mode it describes.
- **Accessibility.** The disclosure is native `<details>`/`<summary>`, which gives keyboard support
  and the expanded/collapsed announcement. Connects is a `<nav aria-label="Related pages">`. Chips
  are a `<ul>`.
- **A lite header** (purpose + connects only) for short pages: Ledger, Sales Portal, Supplier detail,
  Sources.
- **Not added:** a help drawer, rule tooltips, a first-run tour, a separate tips slot, or icons.

### Shared explainers: one home for each repeated rule

Each repeated rule gets written once and linked from the other pages ("How the Plan and Actual
ledgers work →").

| Rule | Home |
|---|---|
| Plan vs Actual ledger | Forecast bar, plus a `Plan · Sep 2026` chip in the header's `right` slot on ledger pages |
| Sowing = one unit of each grow unit; a second unit is a parallel stream; a crew never sets the ceiling | Capacity |
| The two streams (sowing and harvest) | Process |
| Labor standard (adopted or estimated study) | Time Studies |
| Stock = receipts less issues, oldest first | Inventory |
| Recorded only where the event happens | Actuals |
| Same journal → three statements | Ledger |
| GHG scopes, factor + version, the two paired bases, where citations live | Inventory & Audit: "How the inventory is built" |
| "Reported, never repaired; neither picks" | One standard closing line on every planning page's How this page works |

### Glossary

About 50 terms recur without definition. Examples: rated day, operating day, one-stream ceiling,
shelf life, makespan, weight chain, channel allocation, control-point-2/4, seed/sown, three-way match, GRNI,
standard cost, plan of record, Scope 1/2/3, location/market basis, ton-mile, WARM, COD/BOD, circuit,
normalizer.

Proposal: one `_data/glossary.ts`. Each term gets a dotted underline and a one-line definition on
hover or tap, inside How this page works only. Always-visible copy avoids jargon rather than
defining it.

---

## 3. Copy standard (goes into CLAUDE.md §9 once approved)

1. The purpose line starts with a verb and says what the user does or decides. It never defines a noun.
2. Name things, don't narrate them. Functions are the page's own tab and card names.
3. One rule per bullet. No nested dashes or semicolon chains.
4. Legends, metric lists and attribute lists go in captions and column headers, never in the header.
5. Empty states, build status and developer notes never appear in header copy.
6. Portal copy speaks to the user as "you", is task-first, has no internal vocabulary, and reads at
   6th–8th grade for parents.
7. Existing rules still apply: forecast, never scenario; no advice words; confidentiality (§1).

---

## 4. Build steps

| Step | Work | Notes |
|---|---|---|
| U0 | Fix F1–F7 | DONE 2026-09-19. F4 reads: fixed cost never enters the cost of a unit; manufacturing overhead is absorbed at normal capacity and the unabsorbed remainder is a period charge; G&A is a period expense. F5 reads: a pickup point's daily units come from its subscriber's services on Subscribers where one is linked, else the pickup point's own typed figure. F7 cites the study and the EPA leak-repair rule inline through `Cite`. |
| U1 | `PageHeader` slots + CSS + print rules, backward compatible | DONE 2026-09-19. `purpose`, `functions`, `connects` (labels from `nav.ts`), `howItWorks` (`_components/HowItWorks.tsx`); `lede` now a ReactNode; dev warning over 60 words or 140 characters |
| U2 | Pilot three pages: Capacity, Inventory, Payables | DONE 2026-09-19 with the appendix drafts; chips are the pages' own card and tile names. Robert reviews before U3 |
| U3 | Production and planning pages (17) | DONE 2026-09-19 on the drafts. Where a draft named a card that does not exist, the chip is the page's real card, tile or tab name; rules the drafts dropped stayed as bullets; relocations whose target sits in a client component (Compare's metric list, Process's legend, Actuals' empty state) stayed as bullets. Sources has no connects ("every page" is not four links); `sources/[id]` keeps its byline as a subtitle |
| U4 | Finance and commercial pages (16) | DONE 2026-09-19 on the drafts. Reports' as-of date and world label sit in the header's `right` slot. `suppliers/[id]` keeps its location subtitle. Balance Sheet has no connects (its footer links the statements). The **Plan/Actual chip is NOT built** |
| U5 | Sustainability, people (13) + the "How the inventory is built" hub | DONE 2026-09-19. Inventory & Audit's panel is the hub (six bullets). Facility's tab components carry no subtitle, so its per-tab lines are bullets and Normalizers dropped from the chips to stay at five. HR's admin and operator variants carry their own purpose. The Staffing connect on HR and Schedule points at Staffing's app dashboard with a label |
| U6 | Portals (10 headers) | DONE 2026-09-19: a second-person purpose line, at most one help line, no chips, connects or panel. Build notes ("while sign-in is being built", "the subscriber is picked below", "invitations are not connected yet") were removed, not moved to a banner. Flat Builder's channel-and-price rule left the header; it is a fact for the Subscribers page's panel if wanted |
| U7 | Glossary + nav blurbs | Blurbs DELETED 2026-09-19 (D4). Glossary NOT STARTED |
| U8 | Guard test | First cut DONE 2026-09-19 (`test/farm-page-headers.test.ts`): purpose ≤ 140 characters and one sentence; no `lede` on a migrated page; 2–5 chips; no nav blurb. The migrated list grows with U3–U6 |

---

## 5. Decisions

- **D1 → use the drafts, pilot first.** The appendix drafts are the copy for the three pilots; Robert reviews
  them before the other pages move, and edits wording page by page.
- **D2 → keep the full-width lede.** The purpose line runs full width; the open panel is held to 68ch.
- **D3 → remember the panel per page** (`localStorage`, `farm.hiw.<route>`, try/catch, collapsed on the server).
- **D4 → delete the nav blurbs.** The `blurb` field is gone from `nav.ts`; the purpose line is the one description.
- **D5 → plain chips for now.** No anchor links until the tab pattern lands on a page.
- **D6 → CRM · Training.** The Sales H1 is now CRM to match the nav; the Training title is Training.
- **D7 → pilots as proposed:** Capacity, Inventory, Payables.
- *As built:* the disclosure is a button and a region, not a native `<details>`, because print cannot open a
  closed `<details>` and the panel prints expanded; keyboard and the expanded/collapsed announcement are kept
  through `aria-expanded` / `aria-controls`. The "Basis of preparation" footnote placement on brand statements
  is not built; the panel prints expanded in place.

### As proposed

- **D1. Voice.** The drafts in the appendix were written to the copy standard, not in Robert's own
  words. Treat them as structure. He sets the final wording page by page.
- **D2. Full-width lede (your 2026-09-18 call).** Keep it. With a one-line purpose, full width no
  longer hurts reading. Only the open How this page works panel would be held to about 68ch.
- **D3. Remember the panel per page, or always start collapsed?** The recommendation is to remember
  it per page.
- **D4. Nav blurbs.** Options:
  - (a) delete them;
  - (b) make them the single source for "On this page";
  - (c) show them in the sidebar as hover text.
- **D5. Tabs.** Phase T is on hold, so "On this page" chips could double as anchor links to the
  cards. Link them now, or wait for tabs?
- **D6. Sales vs CRM** (F3), and the **Training** name (F2).
- **D7. Pilot pages.** Capacity, Inventory and Payables are proposed.

---

## Appendix: draft rewrites (structure drafts; wording is Robert's to set)

Legend:

- **P** = purpose
- **On** = on this page
- **↔** = connects (← from, → to)
- **How** = How this page works (collapsed)
- *(v)* = verify against the page

### Production and planning

**Capacity** (131 words)
- **P:** See the most one blackout rack stream makes a day, and what limits it.
- **On:** Constraint chain · Ceiling by grow plan · Plant inputs · Blackout check · Staffing check
- **↔:** ← Equipment · → Production Planning · → Day Schedule
- **How:**
  - A sowing is one unit of each grow unit it passes through, and the tightest grow unit sets it.
  - A second unit is a parallel stream, never a larger sowing.
  - Cycles per day come from one rack's occupancy and the operating day, so the ceiling is one stream.
  - Grow unit sizes are estimates until they are stated on Equipment. Planned build-outs never count.
  - Labor is derived for the rated day. Crews are checked against it and never set the ceiling.
- **Relocate:** "Edit any input and the chain recomputes" → note on the Plant inputs card.

**Inventory** (128 words)
- **P:** See what stock is on hand, how old it is, and where each lot went.
- **On:** Stock totals · Finished-goods lots · Raw materials by use-by · Lot trace (Actual)
- **↔:** ← Production Planning · ← Procurement · ← Orders
- **How:**
  - Finished goods are good units from closed sowings, drawn oldest first and aged against shelf life.
  - Raw materials are received lots less what sowings issued, sorted by use-by date.
  - Days of cover is an average, and one ageing lot can hide inside it.
  - A trace runs from supplier lots to the pickup points the lot reached.
  - On Plan, stock comes from the forecast's timeline, so there is no trace.

**Compare** (106 words)
- **P:** Set one day under two forecasts, or two grow plans side by side.
- **On:** Day comparison · Grow plan comparison · Variant proposal
- **↔:** ← Day Schedule · ↔ Grow plans
- **How:**
  - Each side of a day runs its own forecast through the same scheduler.
  - A variant is built from a typed or dictated instruction, reviewed on a proposal card, and saved only on click.
  - Both tables report. Neither picks.
- **Relocate:** the metric list → Day table caption.

**Process** (106 words)
- **P:** Follow a grow plan's route step by step, and edit any step for this forecast.
- **On:** Route map · Sowing stream · Harvest stream · Step editor *(v)*
- **↔:** ← Time Studies · ← Equipment · → Day Schedule
- **How:** (home of the two-streams rule)
  - The sowing stream sows: receive, scale, prep and sow per hot component, blackout, turn the line.
  - The harvest stream ships what a sowing already blackout.
  - Steps come from the labor standard, stage map and Phase 1 equipment.
  - Edits apply to this forecast and move the Day Schedule.
- **Relocate:** columns and lines → map legend.

**Orders** (103 words)
- **P:** See every order by date and subscriber, forecast or on file.
- **On:** Flat plans · Order book · Confirmed counts · Distributions *(v)*
- **↔:** ← Subscribers · → Production Planning · → Inventory
- **How:**
  - Forecast order = the flat plan's grow plan on a date × units per service.
  - Forecast orders are computed from Subscribers on every load, never stored.
  - A typed count, a confirmed count or a distribution replaces the forecast order it stands for.
  - A prospect's distribution day is every order on that date for that subscriber.

**Schedule** (97 words)
- **P:** Build two weeks of production staff demand and send it to Staffing.
- **On:** Staff demand · Operating day · Crew check · Staffing handoff
- **↔:** ← Production Planning · ← Time Studies · ↔ Staffing · ↔ Day Schedule
- **How:**
  - Each scheduled sowing is staffed from its labor standard.
  - Demand is shown as people and staff-hours by task and station.
  - An admin adjusts and publishes in Staffing, and the published schedule returns every two weeks.
  - No shift pattern or headcount is decided.

**Time Studies** (89 words)
- **P:** Time each grow plan's sowing tasks and adopt the one that sets its labor standard.
- **On:** Study log · Trends · Labor standard · Labor hours and cost *(v)*
- **↔:** → Process · → Schedule · → Day Schedule
- **How:** (home of the labor-standard rule)
  - A study times one sowing: station, people, elapsed and labor minutes, and a quality result.
  - Task minutes are fixed per sowing or scale per unit.
  - An admin adopts one study. Until then the estimated study stands in.
  - Hours and cost are shown per sowing and day, never an individual's pay.

**Day Schedule** (88 words)
- **P:** Place one operating day on the clock and see what it breaks.
- **On:** Unit lanes · Crew demand · Findings
- **↔:** ← Calendar · ← Process · → Compare
- **How:**
  - Harvest ships to the distribution time. The sowing stream sows the next sowings into the blackout rack.
  - Lanes are Phase 1 units. The strip is crew demand against the people proposed.
  - Breaks are reported, never repaired. Change orders, crews, routes or policy and the day re-places.

**Grow plans** (86 words)
- **P:** Pick a grow plan to see its cost per unit, sowing size and unit spec.
- **On:** Library · Cost per unit · Sowing size · Unit spec · Edit grow plan
- **↔:** ← Equipment · ← Packaging · → Production Planning
- **How:**
  - Every grow plan that can be costed or planned is a library row with a status.
  - Editing SEED cost, quantity or yield here is a forecast edit. Edit grow plan changes the library.
  - The costing standard changes only when a super admin approves a version with an effective date.

**Production Planning** (85 words)
- **P:** Plan one grow plan run, one distribution day, or a whole period.
- **On:** Single run · Distribution day · Horizon · Close sowing record
- **↔:** ← Orders · → Day Schedule · → Procurement · → Actuals
- **How:**
  - A distribution day is every order on a date, netted against finished goods on hand.
  - The shortfall is sized into whole sowings per grow plan and placed on the shared blackout rack.
  - Sowing records close on the distribution day.
  - The horizon rolls the order book through a period.

**Calendar** (75 words)
- **P:** Scan the month for days that don't fit, then open one.
- **On:** Month grid · Day totals · Outlined days
- **↔:** ← Orders · → Day Schedule
- **How:**
  - The order book is rolled through production.
  - A day that doesn't fit, or breaks a limit, is outlined.
- **Relocate:** day metrics → legend.

**Actuals** (72 words)
- **P:** Record period bills and watch the period's records post to the statements.
- **On:** Sowings closed · Goods received · Units distributed · Period bills
- **↔:** ← Procurement · ← Production Planning · ← Orders · → Statements
- **How:** (home of the "recorded where it happens" rule)
  - Each event is recorded where it happens. Only period bills are recorded here.
  - Records post through the same chain the forecast uses.
- **Relocate:** "a period without records…" → empty state.

**Procurement** (64 words)
- **P:** See stock on hand and on order, and what the next run needs bought.
- **On:** Raw stock · Open purchase orders · Net requirement · Supplier links
- **↔:** ← Production Planning · → Inventory · → Payables
- **How:**
  - On order = issued purchase orders less receipts against them.
  - To buy = gross requirement less on hand and on order.
  - Purchase orders group by each input's supplier link.

**Equipment** (60 words)
- **P:** Keep the master list of every unit in service, planned or considered.
- **On:** Equipment list · Status and service date · Grow unit capacities
- **↔:** → Capital & Financing · → Capacity · → Facility
- **How:**
  - In-service and planned rows count toward capital and financing. "No" and "–" rows do not.
  - Only Phase 1 units set capacity. Grow unit sizes are estimates until stated.
  - A blank service date means TBD.

**Packaging** (56 words)
- **P:** Keep the library of packages units leave the farm in, with costs.
- **On:** Package library · Manual cost · Supplier-based cost
- **↔:** → Grow plans · ↔ Equipment
- **How:**
  - Containers, lids, labels and liners are packaging.
  - Sealers, coders and vacuum packers are equipment.

**Produce Safety** (56 words)
- **P:** Log critical control points and cooling, and trace any lot both ways.
- **On:** CONTROL POINT logs · Two-stage cooling · Allergen changeover · Corrective actions *(v)*
- **↔:** ← Production Planning · ↔ Inventory
- **How:**
  - Critical limits follow the FDA Food Code model. Verify with the local health authority before adoption.
  - control-point-2 cooling is pass/fail on the record, not at review.
  - Every record names a lot, traced to its suppliers and the pickup points it reached.

**Sources** (37 words) — lite header
- **P:** Look up any cited figure and the document behind it.
- **↔:** ← every page

**Dashboard** (35 words) — shorten `DASHBOARD_LEDE`
- **P:** Today's plan, stock, capacity and anything that needs attention.
- **On:** Today's plan · Inventory · Capacity · Expiring lots · Open CONTROL POINT items

### Finance and commercial

**Payables** (80 words)
- **P:** Match supplier bills to receipts, pay what matches, and track what is owed.
- **On:** Received not invoiced · Three-way match · Payments · Aging · Days to pay
- **↔:** ← Floor · ← Procurement · → Balance Sheet · → Cash Flow
- **How:**
  - A receipt waits in GRNI until a bill is recorded against it.
  - A bill must equal its receipts, input by input, in quantity and value.
  - Overrides carry a reason.
  - A bill that doesn't match is flagged and not paid until rectified.
  - Terms set the due date.

**Subscribers** (78 words)
- **P:** Set who is served, where, when and on what. All demand starts here.
- **On:** Subscribers by channel · Pickup point calendars · Units per service · Flat plans
- **↔:** ← CRM · → Orders · → Production Planning · → Receivables
- **How:**
  - Each pickup point has its own service calendar. One service is one loading and one harvest.
  - Units per service change on the dates entered.
  - Demand everywhere else is these figures run across the calendar.
  - A forecast keeps its own edits and never changes the subscriber record.

**Profit & Loss** (70 words)
- **P:** Read revenue, cost of goods and margin by month, quarter or year.
- **On:** Income statement · Manufacturing variances · Fixed cost · Period view
- **↔:** ← Ledger · ← Unit Economics · ← Capital & Financing · → Plan v Actual
- **How:**
  - Plan posts what the open forecast would record. Actual posts what was recorded.
  - COGS is at standard, with variances beneath it.
  - Fixed operating cost is a period expense (see F4).

**Receivables** (63 words)
- **P:** Invoice subscribers monthly, apply payments, and track what is owed.
- **On:** Monthly invoices · Payments applied · Aging · Days to collect
- **↔:** ← Orders · ← Subscribers · → Balance Sheet · → Cash Flow
- **How:**
  - Each completed route joins its subscriber's monthly invoice.
  - Revenue is receivable from distribution. Terms set the due date.
  - Ghost-farm orders are paid at order and never invoiced.

**Pickup Points & Routes** (60 words)
- **P:** Keep distribution pickup points and service windows, and log each shipment's temperatures.
- **On:** Pickup points · Service windows · Shipments · Temperature log
- **↔:** ← Subscribers · ← Inventory · → Logistics · → Receivables
- **How:**
  - A pickup point linked to a prospect-directory prospect uses that prospect's address for miles.
  - Shipments draw lots FIFO.
  - Temperature is logged at load and at distribution (control-point-4).

**Reports** (56 words)
- **P:** Read each section's management reports at summary level, and export the workbook.
- **On:** Report packages · Summary and detail · Workbook export
- **How:** Ledger figures follow the forecast bar. Records-only reports read the recorded documents.
- **Relocate:** the as-of date → a header chip. "Detail on the module page" → an "Open module" link on each card.

**Capital & Financing** (54 words)
- **P:** Size the fit-out, set the loans that fund it, and set monthly fixed costs.
- **On:** Capital required · Loans · Monthly fixed costs · Monthly financing
- **↔:** ← Equipment · → Profit & Loss · → Balance Sheet
- **How:** Edits recompute the monthly figures, which feed the P&L fixed-cost base.
- **Relocate:** "placeholder until quoted" stays visible through the PLACEHOLDER badges.

**Ledger** (53 words) — lite header
- **P:** Trace every journal entry and prove debits equal credits.
- **↔:** ← Actuals · → P&L · Balance Sheet · Cash Flow
- **How:** (home of the "same journal" rule)
  - The posting chain: receipt → issue → labor → overhead → sow → blackout → pack → finished goods → distribution.

**Plan v Actual** (53 words)
- **P:** Compare each month's records with the plan of record in force at month end.
- **On:** Months and quarters · Units and revenue · Food and labor cost · By grow plan, channel, subscriber
- **↔:** ← Actuals · ← Profit & Loss
- **How:** Both sides are computed the same way. A quarter is the sum of its months.

**Cash Flow** (48 words)
- **P:** See where cash moved, by the direct and indirect methods.
- **On:** Indirect · Direct · Tie-out
- **↔:** ← Ledger · ← Receivables · ← Payables · ← Capital & Financing
- **How:** Indirect starts from net income. Direct groups cash entries by counter-account. They tie.

**Balance Sheet** (47 words)
- **P:** Read the business's position at each period end.
- **On:** Classified balance sheet · Inventory by stage · Fixed assets
- **How:** Inventory is at standard cost by stage. Fixed assets are at cost less depreciation.

**Unit Economics** (41 words)
- **P:** Test price and unit per channel against a grow plan's cost per unit.
- **On:** Cost card · Price and unit · Contribution · Units per sowing
- **↔:** ← Grow plans · → Profit & Loss

**Suppliers** (37 words)
- **P:** Find approved suppliers and record volume, price and lead time from conversations.
- **On:** Directory · Certification · Prospect readiness · Grow plan match
- **↔:** → Procurement · → Logistics · → Supplier LCA Data

**Sales / CRM** (33 words)
- **P:** Work each prospect prospect from first contact to quote and scope of work.
- **On:** Prospect directory · Needs and communications · Quote of service · Scope of work
- **↔:** → Subscribers · → Pickup Points & Routes

**Supplier detail** (30 words) — lite header; keep the location subtitle
- **↔:** ← Suppliers · → Procurement

**Sales Portal** (27 words) — lite header
- **P:** Check the prospect pipeline, subscribers on file and upcoming orders.
- **↔:** "Open in workspace" links

### Sustainability and people

**HR** (85 words; admin and operator)
- **P (admin):** Track clock punches, shifts and hours for everyone. Pay is held in Staffing.
- **P (operator):** Check your own punches, shifts and hours.
- **On:** Time clock · Shifts & hours · Pay periods · Staffing link
- **↔:** ← Floor · ↔ Staffing
- **How:**
  - Overtime is hours past 40 in a Monday–Sunday workweek.
  - A pay period runs Monday through the second Sunday. Payday is the Friday five days later.
  - Pay and personal details are held in Staffing, admins only.

**Facility** (73 words)
- **P:** Size the building the equipment list requires, by build phase.
- **On:** Design & Build · Footprints · Space · Conformance · Layout · Normalizers
- **↔:** ← Equipment · → sustainability pages
- **Relocate:** one line per tab → tab subtitles.

**Training & Certification** (60 words)
- **P:** Track who has read each training document, and the certificates each role holds.
- **On:** Documents in force · Read record · Courses · Certificates by role
- **How:** A read is recorded against the version. New hires complete the versions in force at orientation.

**Energy** (60 words)
- **P:** Measure the year's fuel and electricity emissions, planned or billed.
- **On:** Fuel (Scope 1) · Electricity (Scope 2) · Location vs market · Postings
- **↔:** ← Equipment & Rebates · → Inventory & Audit

**Inputs** (59 words)
- **P:** Compare each unit's food footprint on the reference and selected bases.
- **On:** Per-unit footprint · Basis selector · Period total · Supplier credit
- **↔:** ← Grow plans · ← Supplier LCA Data · → Inventory & Audit

**Inventory & Audit** (56 words) — hub for "How the inventory is built"
- **P:** Assemble the year's greenhouse-gas inventory by scope, with the controls auditors check.
- **On:** Inventory by scope · Factor registry · Baseline & materiality · Restatement check · Evidence pack

**Logistics** (56 words)
- **P:** Measure freight ton-miles in from suppliers and out to distribution pickup points.
- **On:** Inbound · Outbound
- **↔:** ← Grow plans · ← Pickup Points & Routes · → Inventory & Audit

**Equipment & Rebates** (55 words)
- **P:** Set each equipment line's energy and refrigerant attributes, and review the utility's rebate list.
- **On:** Energy attributes · Refrigerant charge · ENERGY STAR · Rebate table
- **↔:** ← Equipment · → Energy · → Refrigerants

**Waste** (53 words)
- **P:** Measure food waste from production, and landfill against compost.
- **On:** Sowing shrink · Expired units · Landfill vs compost
- **How:** Needs no new input: both figures come from the period's production.

**Water & Effluent** (50 words)
- **P:** Project the city's wastewater surcharge from metered water and lab results.
- **On:** Monthly volumes · Lab results · Grease trap · Surcharge projection

**Supplier LCA Data** (49 words)
- **P:** Record a supplier's footprint figure for an input, cited to their document.
- **↔:** ← Sources · ← Suppliers · → Inputs

**Refrigerants** (49 words)
- **P:** Track each circuit's annual leak rate against the rule thresholds.
- **On:** Circuit register · Service additions · Leak rates · Findings

**Parent Admin** (8 words)
- **P:** Review enrolled parents, their payment plans and account history.
- **Relocate:** "simple draft" → the status pill.

### Portals (outside users: different pattern)

Each portal page gets a purpose line in the second person, a primary action, and at most one help
line. No Connects and no How this page works. Build notes move to a staff-only banner.

- **Supplier Portal:** "Keep your catalog with the farm up to date."
  - [Upload a line sheet] [Submit a new item] [Complete RATING rating]
- **Flat Builder:** "Pick a date, choose your units and quantities, and tell us how to distribute."
  - Steps: Date · Units · Allergies · Packaging · Distribution
- **Subscriber Portal:** "Place an order, check past orders, and pay invoices."
  - [Start a new order]
- **Welcome, supplier:** "The farm invited you to the Supplier Portal. Confirm your contact details to get started."
- **Sign in (supplier):** "Sign in to manage your catalog with the farm."
  - Help: "New here? You need an invitation from the farm."
- **Create an account (subscriber):** "Order units for your office, restaurant or special event."
  - Help: "We'll send a verification email, and our team reviews every new account before your first order."
- **Parent Portal:** "Choose how to pay for your child's prospect units."
  - Steps: Pick a plan · Allergies · Pay

### Word count

| Group | Always visible now | Always visible after |
|---|---|---|
| Production and planning (17) | 1,439 | ~530 |
| Finance and commercial (16) | 865 | ~490 |
| Sustainability, people, portals (21) | 924 | ~460 |
| **Total** | **~3,230** | **~1,480 (−54%)**, mostly chips and links rather than sentences |

The longest always-visible sentence drops from 131 words to 15.

---

## Update Log

| Date | Change |
|---|---|
| 2026-09-19 | Plan drafted from four review passes (component design + three UX-copy groups over 60 headers). Status PROPOSED; awaiting Robert's decisions D1–D7 before any build. Not yet entered in `roadmap.md`: another session has that file open with uncommitted edits. |
| 2026-09-19 | Approved (D1–D7 above). Built: U0 (F1–F7), U1 (the slots, CSS, print, dev warning), U2 (Capacity, Inventory, Payables on the drafts), the D4 half of U7 (blurbs deleted), a first cut of U8. U3–U6, the glossary and the print footnote remain. |
| 2026-09-19 | **U3–U6 built** across every remaining header (56 more), the Orders page included. The brand line ("Cotyledon") no longer renders on any page header: the `brand` prop is gone; the line stays on the footer and on documents. U8 now checks every page: no `lede` beyond the two subtitles. |
