# Impact OS — Overview

**Muse Kitchen** is a single commissary producing cook-chill meals for
Austin-area schools. **Impact OS** (the OS) is the integrated back-office
platform that runs it — one shared operating model spanning production,
finance, supply chain, cold chain, people, and sales. Every figure on screen
traces to that model; nothing is typed in by hand, and illustrative values are
labelled as such.

Live at `getcomptable.com/muse`, deployed from `main` — a private preview, `noindex`, behind
Clerk sign-in. The welcome page is `/muse`, the one sign-in `/muse/sign-in`, the sign-up `/muse/sign-up`, and the OS's
Dashboard `/muse/dashboard`. Two access roles: **admins** (the named super admins) and
**operators**; an active person on the staff register signs in with the email on the register and
is an operator. Customers, suppliers and parents sign in inside their own portals. Roles and the
page-by-page matrix: [CLAUDE.md](CLAUDE.md) §10.

## Why an operating system

The OS covers every back-office pillar in one data model — not MRP, SCM, or
CRM, each of which is only a slice:

| Section | Pillar | Modules |
|---|---|---|
| **Overview** | — | Dashboard (the Admin Dashboard for admins; operators get one without company financials), Reports, Sources |
| **Production** | Manufacturing / MRP | Recipes, Time Studies, Production Planning, Day Schedule, Compare, Calendar, Process, Capacity, Equipment, Packaging, Floor |
| **Financials & Accounting** (admins) | Finance / GL | Unit Economics, Profit & Loss, Balance Sheet, Cash Flow, Ledger, Plan v Actual, Actuals, Receivables, Payables, Capital & Financing |
| **Cold Chain** | Inventory & quality | Inventory (FIFO lots), Food Safety (HACCP / CCPs) |
| **Supply Chain** | Procurement / SCM | Procurement, Suppliers (approved directory) |
| **Sustainability** | Carbon & resource accounting | Inventory & Audit, Facility & Normalizers, Energy, Refrigerants, Equipment & Rebates, Ingredients, Supplier LCA data, Logistics, Waste & End-of-Life, Water & Effluent |
| **People** | HR / labor (pay held in CompTable) | HR, Schedule (staff demand), Training |
| **Sales** | Sales / CRM | Sales Portal, CRM (school prospects), Customers, Orders |
| **Distribution** | Delivery | Sites & Delivery |
| **Customer**, **Supplier**, **Parent** | External portals | Customer Portal and Order Builder, Supplier Portal, Parent Portal and Parent Admin |

The **Dashboard** rolls these up: a headline strip plus one card per section, each surfacing that
section's key metrics and linking into its modules. The admin's headline strip is the averages
over every active recipe, each on its own one-line batch and its own labor standard: as purchased
against cost to serve per meal, food cost per meal, batch time, labor minutes per meal and labor
cost per meal — the seeded estimates until actuals replace them, and nothing tied to one recipe.
The admin's Production card is the week of orders from today: meals on order by channel and day,
with the food and labor cost of those meals. Operators see the active-recipe average batch, the
batches on the next production day, days of cover and food cost per portion, their own clock and
hours, and no company financials.

## How the engine thinks

- **Cook-chill, whole-batch planning.** Components are cooked, blast-chilled,
  held, and reheated on site. A batch is what one unit of each vessel it passes
  through takes — one cabinet, one kettle — and a second cabinet is a parallel
  stream, never a larger batch; one cabinet's cycles set the one-stream ceiling.
  Demand draws finished inventory, and inventory shortfalls trigger *whole*
  batches — not a flat throughput rate — because a fixed share of each batch's
  labor does not scale with volume.
- **Absorption costing.** Direct labor is capitalized into finished goods and
  reaches the P&L as COGS only for portions actually shipped — the cook-chill
  carry a period-cost model would misstate.
- **Three channels, added in build-out order.** School lunches → corporate
  catering → ghost kitchen, each with its own price per meal. Volume is the
  orders, batches and deliveries of the selected world, recipe by recipe.

## Data & trust

- **Suppliers** are compiled from public records — USDA Organic INTEGRITY
  (certification) and the TDA Farm Fresh Network (school-readiness).
- **School prospects** come from an internal market-analysis compilation (the
  Sales CRM seed).
- Maps geocode in-house (U.S. Census, ZIP centroids) — free, no third-party
  API keys.
- Volume, pricing, and lead times that no public directory carries are
  operator-entered, never fabricated.

## Current state

Status is recorded once, in [roadmap.md](roadmap.md). Each module's nav entry carries a status
(`live` / `partial` / `designed`) and a preview surface says so on the page. Build conventions are
in [CLAUDE.md](CLAUDE.md); the accounting rules in [accounting-policy.md](accounting-policy.md); the
thermal processing standards in [culinary-operations.md](culinary-operations.md); the CompTable
contract in [comptable-contract.md](comptable-contract.md).
