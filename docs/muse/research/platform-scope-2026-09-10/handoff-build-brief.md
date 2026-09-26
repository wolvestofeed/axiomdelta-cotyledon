# HANDOFF — Muse Kitchen Impact OS

> **Scoping record, 2026-09-10.** Moved into the repo on 2026-09-14 from the confidential source
> folder; the build brief the first repo session started from. Historical: where it disagrees with `../../roadmap.md`, the roadmap is current.

**For a new Claude Code session. Read this file completely before writing any code.**

Prepared 2026-09-10 by the Cowork session that designed the operating model.
Owner: Robert (Rob) W. Bogatin · github.com/wolvestofeed

---

## 0. Orient before you build

Do these in order. Do not scaffold anything until step 0 is done.

1. **Ask Robert for the path to the `getcomptable` repo** and open it. Impact OS is being built
   as a private, password-protected page set **inside that repo**, not as a standalone project.
2. **Read that repo's existing conventions and conform to them.** Directory layout, route grouping,
   Drizzle schema style and migration workflow, Clerk middleware and route protection, component and
   styling conventions, env var naming, and the deploy configuration. Whatever CompTable does, do that.
   This document describes *what* to build. The existing repo is the authority on *how*.
3. **Inventory the two source products for reusable modules.** Ask Robert for paths to the AXiomDelta
   Coaching Platform repo and confirm the CompTable one. Produce a short written inventory of what can be
   lifted versus what must be new, and show it to Robert before you start porting anything.
4. **Read the source material** listed in section 12. The operating model, the research file and the
   module scope docs are the specification. Numbers come from there, not from you.
5. **Create the project docs** described in section 11 before the first feature commit.

---

## 1. What this is

**Impact OS** is Muse Kitchen's commissary kitchen operations platform: recipe costing, production planning,
lot-level finished-goods inventory, cook-chill capacity scheduling, HACCP records, procurement and
supplier verification, and labor costing.

It is being built to be **live and viewable by outside leadership before an interview next week.** That
deadline drives everything in section 10. A deployed, narrow, working system beats a broad local one.

### Hard naming and confidentiality rules

- The company brand is **Muse Kitchen**; the product is **Impact OS** (renamed 2026-09-15).
- **No mention anywhere** — code, comments, commits, docs, seed data, UI copy, meta tags — of the
  source company, its incubator, its standards partner, or any individual associated with them. The company is
  in stealth. This is not negotiable and it is not a style preference.
- The repo is **private**. The page set is **behind authentication**. Nothing is indexed.
- All seed data is invented. See section 9. No real supplier, school, customer or person appears.
- This is **Robert's intellectual property**, built inside his own product. Nothing in the repo should
  imply otherwise, and no third-party branding goes anywhere near it.

---

## 2. Stack

Match the other `wolvestofeed` repos exactly:

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), React, TypeScript |
| Database | Neon Postgres |
| ORM | Drizzle |
| Auth | Clerk |
| Payments | Stripe (not needed in v1; do not wire it) |
| Hosting | Vercel |
| Source control | GitHub, private, under `wolvestofeed` |

Confirm versions against the existing repo rather than pulling latest.

---

## 3. Where it lives

A route group inside the CompTable repo, for example `app/(muse)/muse/...`, served under the existing
domain and protected by Clerk middleware.

**Access:** use Clerk, not a shared password. Robert invites three named viewers. That gives him a list of
who opened it and lets him revoke one person without changing anything for the others. If Clerk
organizations are already in use in that repo, put the viewers in their own org with a read-only role.

Confirm the route prefix and the auth approach with Robert before scaffolding.

---

## 4. Domain model

This is the part that matters. The model below is not a guess; it comes out of a working financial and
operating model. Implement it in Drizzle and let the UI follow from it.

### Core entities

**`ingredients`** — name, spec text, unit (lb / each), as-purchased unit cost, yield-to-cooked factor,
allergen flags, supplier reference, certification flags (organic, regenerative), lead time days.

**`recipes`** — code, name, category, stated portion size, production method, costing basis (per 100
portions), allergen summary. A recipe has many `recipe_ingredients` rows carrying as-purchased quantity
per 100 portions.

Derived per recipe, and these must be computed, never stored as typed values:
- food cost per portion, including a shrink allowance
- **chilled mass per portion** = sum of cooked yields of hot components only, divided by 100.
  Tortillas, cheese and other cold-packed components are excluded. This number drives batch size.

**`equipment`** — name, category, phase, new/used, critical flag, unit cost, quantity, and for capacity
items: **capacity value and unit** (lb per cycle, gallons, pan positions) and cycle time in minutes.

**`capacity_profile`** — the constraint chain, computed:
```
chiller units × capacity per unit          = lb per cycle
lb per cycle ÷ chilled mass per portion    = portions per cycle
floor to nearest 25                        = STANDARD BATCH SIZE   (per recipe)
chill window minutes ÷ cycle time          = cycles available per day
batch size × cycles per day                = maximum portions per day
```
Batch size is **derived per recipe**, because chilled mass per portion differs by recipe. It is never a
typed input. This is the single most important rule in the model.

**`production_runs`** — date, recipe, batches, portions produced, shift, status. Each run creates lots.

**`lots`** — lot code, recipe, production run, quantity produced, quantity remaining, production
timestamp, hold-life expiry timestamp, location, status. **FIFO draw.** Lot-level ageing is the thing a
spreadsheet cannot do and is the main reason this platform exists.

**`inventory_transactions`** — every movement: production in, shipment out, waste out, adjustment. Never
mutate a lot quantity without a transaction row.

**`sites`** — delivery locations with service windows and daily forecast portions.

**`shipments`** — date, site, recipe, portions, lots drawn, temperature at load and at delivery.

**`suppliers`** — name, county, categories carried, delivery range, delivery fee, certifications on file,
whether they already sell into schools, lead time. Compliance documents attach per supplier and per lot.

**`labor_tasks`** (time study) — task, station, staff count, elapsed minutes, labor minutes, and a
**`scales_with`** enum of `fixed` | `variable`.
Labor for any production day is:
```
labor minutes = (batches × fixed minutes per batch) + (portions × variable minutes per portion)
```
Never a flat throughput rate. Roughly 28% of a full batch's labor does not scale with volume, which is
exactly why the system must plan in whole batches.

**`ccp_logs`** — HACCP critical control point records: CCP id, lot, process step, reading, timestamp,
recorded by, verified by, pass/fail, corrective action. CCP-2 (two-stage cooling) is the one that matters:
135°F to 70°F within 2 hours, then 70°F to 41°F within 4 more.

**`shifts`** — two overlapping day shifts, 05:00–13:30 and 09:30–18:00, overlapping four hours. **No
overnight crew.** The building is unstaffed 22:00–05:00 and runs passive processes only. Any CCP cycle
completing in that window needs a named on-call responder recorded against it.

### The planning loop

This is the core algorithm. Implement it as a pure function with tests before it has a UI.

```
target_inventory   = daily_forecast × days_of_cover_target
projected          = opening_inventory − daily_forecast
shortfall          = max(0, target_inventory − projected)
batches_to_run     = ceil(shortfall ÷ batch_size)         // whole batches only
portions_produced  = batches_to_run × batch_size
closing_inventory  = projected + portions_produced
days_of_cover      = closing_inventory ÷ daily_forecast
hold_life_check    = days_of_cover > hold_life ? OVER : OK
cycles_required    = batches_to_run
capacity_check     = cycles_required > cycles_available ? OVER_CAPACITY : OK
```

Whole-batch production always overshoots demand. That overshoot is **inventory while it is inside hold
life and waste the moment it is not.** Knowing which is the platform's job.

---

## 5. Module surface

Build the full navigation surface. Every module gets a real page with real layout, real empty states and
honest labelling. Modules that are not yet functional say so on the page rather than showing fake charts.

1. **Dashboard** — today's production plan, inventory position, capacity utilisation, expiring lots, open CCP items
2. **Recipes** — library, ingredient detail, yields, allergen matrix, derived cost per portion, derived batch size
3. **Costing** — cost-per-meal build-up, contribution margin by channel, sensitivity
4. **Production Planning** — the loop in section 4, by day and by recipe
5. **Inventory** — lot register, FIFO position, ageing against hold life, expiry alerts
6. **Capacity** — equipment register, the constraint chain, cycles booked against the two shifts
7. **Procurement** — purchase orders driven by portions produced, not by forecast
8. **Suppliers** — directory, certifications, compliance documents, lead times, delivery ranges
9. **Food Safety** — CCP logs, cooling records, allergen changeover, corrective actions, mock recall
10. **Labor** — time study, fixed versus variable split, shift structure, cost per portion
11. **Sites and Delivery** — locations, forecasts, routes, temperature at load and delivery
12. **Reports** — production history, waste, forecast accuracy, cost trend

Navigation, layout shell, auth, and the design system come first and apply to all twelve. See section 10.

---

## 6. The golden path

One recipe, end to end, fully working. Use **Texas Ranch Beef & Bean Bowl**, code `AFC-E-001` —
**rename the code to `AMK-E-001`**, and check that no other identifier carries over.

The path a viewer should be able to walk without hitting a dead end:

1. Open the recipe. See ingredients, specs, yields, allergens.
2. See food cost per portion computed from the ingredient lines, not typed.
3. See **batch size derived** from chiller capacity and the recipe's own chilled mass per portion.
4. Enter or view a daily forecast for a site.
5. Watch the planning loop produce whole batches, and watch the capacity check flip to OVER CAPACITY when
   the forecast exceeds what the chiller can do. **Make that visible.** It is the most persuasive thing
   in the entire application.
6. Commit the production run. Lots are created with hold-life expiry.
7. Ship against a site order. FIFO draws the oldest lot first.
8. Record the CCP-2 cooling log for the run.
9. See the purchase order generated from portions produced.
10. See labor for the day as fixed-per-batch plus variable-per-portion, and cost per portion.

If time runs out, this path working is worth more than eleven half-built modules.

---

## 7. Porting from the other products

Expected to be reusable, to be confirmed by your own inventory in step 0:

**From CompTable:** the costing and unit-economics engine, table and data-grid components, import flows,
export and reporting, and whatever the app already does well for period-based records.

**From the AXiomDelta Coaching Platform:** the multi-tenant white-label shell, Clerk auth and role
patterns, the admin panel, the two-step import flow (external conversion then structured upload), and any
scheduling built on `react-big-calendar` — that maps directly onto shift and capacity scheduling.

Port patterns and components. Do not port business logic that does not belong here, and do not drag in
Stripe, course creation, or the AI scoring engine.

---

## 8. Assumptions to seed, and where they come from

All of these are placeholders from the operating model. Store them as editable settings, not constants,
and label them as placeholders in the UI.

| Setting | Value |
|---|---|
| Facility | 5,000 sq ft, leased raw shell |
| Shifts | 05:00–13:30 and 09:30–18:00, 4-hour overlap, no overnight crew |
| Blast chillers | 2 units × 200 lb per cycle |
| Chiller cycle time | 90 minutes |
| Chill window | 6.0 hours per production day |
| Derived batch size | 550 portions for the seeded recipe |
| Max portions per day | 2,200 |
| Chilled hold life | 30 days |
| Days of cover target | 5 |
| Fixed labor per batch | 285 minutes |
| Variable labor per portion | 1.36 minutes |
| Production cook / lead wage | $20 / $28 per hour |
| Payroll burden | 22% — **flagged as too thin to carry real benefits; 30–35% is realistic** |
| Shrink allowance | 3% |

**Two known inconsistencies. Do not silently resolve them. Surface them in the UI as validation warnings:**

1. The seeded recipe states a 9.5 oz plated portion, but its cooked yields total 11.6 oz of hot
   components per portion before tortilla and cheese. Batch size derives from the yields, so this
   propagates. It gets fixed by weighing a real batch.
2. The time study minutes were estimated at a 500-portion batch while the derived batch is 550. Spreading
   the same minutes over more portions flatters the labor line.

A system that shows you its own contradictions is worth more than one that hides them. Build the
validation surface for this.

---

## 9. Seed data

Everything invented. Nothing real.

- One complete recipe, twelve ingredient lines, real-looking specs
- Six to ten suppliers with invented names, Central Texas counties, categories, certifications, lead times
- Three to five delivery sites with invented names and daily forecasts
- Thirty to sixty days of production runs and lots so ageing, FIFO and reports have something to show,
  including **at least one lot close to expiry** so the alert state is visible
- CCP logs across those runs, including **one failed cooling record with a corrective action**, so the
  food safety module shows its teeth rather than a wall of green

Put the seed in a script that can be re-run against a clean database.

---

## 10. Build order

Sequenced so something is live and viewable as early as possible.

**Phase A — live and empty, day one.** Repo branch, route group, Clerk protection, Neon database, Drizzle
config, Vercel deploy. A protected page that says Muse Kitchen Impact OS and nothing else. **Get the URL
working before building features.** Confirm Robert can sign in.

**Phase B — the shell.** Navigation, layout, design system matched to the existing repo, all twelve module
pages with real empty states. Deploy again.

**Phase C — schema and seed.** Full Drizzle schema, migrations, seed script. Deploy.

**Phase D — the golden path.** Recipes, costing, capacity derivation, the planning loop, lots and FIFO,
CCP logging, purchase order generation, labor. In that order. Deploy after each.

**Phase E — the rest.** Reports, supplier documents, routes, forecast accuracy.

Deploy at the end of every phase. Never let the live site fall more than one phase behind.

---

## 11. Project documentation — create these first

Per Robert's standing convention, in a `Docs/` folder inside the page set:

- **`Docs/CLAUDE.md`** — project and programmatic oversight, rules and instructions. Start with the
  naming and confidentiality rules in section 1, the derived-batch-size rule, the fixed-plus-variable
  labor rule, the no-fabricated-real-entities rule, and this one: **when Robert raises a question or
  flags an issue, discuss it in detail and reach agreement before building or fixing anything.**
- **`Docs/ToDo-pursuit.md`** (confidential folder) — brief one-off items and open questions not yet in a roadmap phase.
- **`Docs/Roadmap-pursuit.md`** (confidential folder) — build phases by department and surface, each item open or completed, with an
  **Update Log at the bottom** that is appended to on every session.

---

## 12. Source material

In the git-ignored `docs/muse/confidential/` folder (see the Muse `CLAUDE.md` §1):

| File | What it is |
|---|---|
| `Research/RESEARCH.md` | **Source of truth.** Every figure, status-tagged. Sections 15–18 cover capital, shifts, labor law and the batch-size audit. Nothing numeric goes in the app that is not traceable here. |
| `Plan/AFC_Commissary_Operating_Model_v2.xlsx` | The working model. Eight tabs. Read `CapEx`, `Time_Study`, `Production_Planning`, `Unit_Costs`, `Recipe_RanchBowl`, `HACCP_QA`. This is the specification. |
| `05-production-planning-inventory-reorder.md` (this folder) | Scope for the inventory and reorder module, including what the platform must do that a spreadsheet cannot |
| `00-platform-overview.md` and `01-requirements-and-scope.md` (this folder) | Overall platform intent |
| `Docs/IP_and_Licensing_Position.md` (confidential folder) | **Read before writing any licensing, ownership or attribution text.** The position is not fully settled. |
| `Docs/CLAUDE.md` | The parent project's rules |

Status tags in RESEARCH.md: `[SOURCED]` cited third party · `[STATED]` from Robert · `[PLACEHOLDER]` no
source · `[DERIVED]` calculated · `[UNCONFIRMED]` believed not verified · `[DATED]` sourced but old.

**Carry the tags into the UI.** A placeholder cost should look different from a quoted one. That single
habit is most of what separates this from a demo.

---

## 13. Ask Robert before you start

1. Path to the `getcomptable` repo, and to the AXiomDelta Coaching Platform repo
2. Route prefix for the page set, and whether to use a Clerk organization or individual invites
3. Whether to branch or work on main, and whether he wants a preview deployment rather than production
4. Neon: new database, new branch on an existing one, or a shared instance
5. The three email addresses to invite
6. Confirm the date of the interview, so the phase plan in section 10 can be paced against it

---

## 14. What good looks like

A viewer signs in, opens one recipe, and watches the system derive a batch size from a piece of
equipment, plan whole batches against a real capacity ceiling, create lots that age, draw them FIFO,
log a cooling record, generate a purchase order, and cost the labor honestly. Then they see eleven other
modules that are clearly the same system rather than eleven mockups.

Nothing in it pretends to be finished. Placeholders are labelled. Contradictions are surfaced. That is
the point: it is an operator's tool built by someone who knows the difference between a number and a
quote.
