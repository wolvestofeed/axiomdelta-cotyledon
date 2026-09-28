# CLAUDE.md — Cotyledon

**Cotyledon** is the microgreens and sprouts production operating system of **Axiom Delta Wellness Center**, Robert Bogatin's (Joshin's) one business operation, and an application of **Ember OS**, his platform brand. It is ported from his Muse Kitchen, the commissary kitchen application of Ember OS, and re-vocabularied for growing. Tenant zero is the wellness center's own production facility, which starts in Rob's South Austin home. Other microgreens farmers subscribe to the software.

The outline of record is [`docs/outline.md`](docs/outline.md). This file governs how work is done.

## 1. Documents replace, they do not log

When a decision, a plan, a rule or a figure changes, **delete the old version and write the new one in its place.** No changelogs, no update logs, no "decision (date)" trails, no "was X, now Y" notes, no strikethroughs, no dated sections. A document says what is true now. Git history is the only record of what was true before. This applies to every file in `docs/`, to this file, to code comments and to seed data.

## 2. The business and its products

**Axiom Delta Wellness Center** is the umbrella. One business, one client base. A client may at the same time be a bodywork client, a microgreens subscriber and a Feed The Wolf subscriber.

| Name | What it is |
|---|---|
| Axiom Delta Wellness Center | The business. Rob's personal practice: microgreens grown for individuals by nutritional need and performance objective now; massage therapy from summer 2027; coaching in meditation, Ayurveda and nutrition as it grows. Home-based until the center is operating well enough to take a commercial facility. |
| Wolves To Feed | The marketing website. Presents Rob's whole coaching practice. |
| Feed The Wolf | Rob's own digital coaching platform: ancient wisdom and his collection of work in a library, delivered as an online digital sequencing platform. |
| AxiomDelta Coaching Engine | The product other coaches license and subscribe to for their own businesses. Those coaches are Rob's clients. |
| Ember OS | The platform brand. Each application on it keeps its own mark and is endorsed "powered by Ember OS": Muse Kitchen for the commissary kitchen, Cotyledon for the farm. |
| Cotyledon | This repo. The production OS for the microgreens and sprouts facility, and a product other farmers subscribe to. Powered by Ember OS. |

Cotyledon's scope is the facility: grow plans, sowings, grow units, inventory, produce safety, suppliers, sustainability, staffing, subscribers and their flat plans and nutrition targets, orders, distribution, and the books of the facility. Bodywork bookings, coaching sessions, the library and sequencing live in the other products. Nothing about a client's sessions or health beyond their nutrition targets for their flats is held here.

- Multi-tenant: every farm is a workspace. The wellness center's facility is one workspace, never a special case in code.
- No connection to CompTable. No webhooks, no contract, no shared database. Staffing, wages and pay periods are an internal module.
- Nothing from the Muse Kitchen source client carries over: no names, no recipe codes, no seed data, no ERRA mark. Muse Kitchen is Rob's name and may be cited as the origin.

## 3. Vocabulary

The Muse vocabulary is replaced in full: code identifiers, table and column names, UI copy, tests, docs, seed data. The swap table lives in `docs/outline.md` §3 and is the only authority. Kitchen words (recipe, portion, meal, cook, chill, kettle, cabinet, plated, kitchen, school, parent) do not appear anywhere once the swap is done, except in `docs/outline.md` §3 itself.

## 4. Engine rules

The engine invariants are stated in `docs/outline.md` §5. In short: the batch is a sowing, the whole trays its orders need, one flat the least; the sowing is the costing basis; labor is fixed per sowing, plus variable per tray per day, plus variable per unit, on three streams (sowing, daily, harvest); whole trays only; every dollar is computed from tagged reference data; only the harvest record posts journals; capacity is a property of the grow room, labor a requirement of the plan.

Every figure carries a provenance tag: `SOURCED`, `STATED`, `PLACEHOLDER`, `DERIVED`, `UNCONFIRMED`, `DATED`. A placeholder looks different from a quoted figure on every surface. Every cited source is registered on the Sources page before it is cited.

## 5. Working method

- Talk first, build second. When Rob raises a question or flags an issue, discuss it and reach agreement before building. The exception is a factual correction that would mislead him if left standing.
- Surface facts and math. UI copy does not counsel: no "recommend", "should", "best", "optimal", "consider".
- Text-only layouts by default. No icons, illustrations or decorative SVGs unless Rob asks.
- Page headers: a purpose line starting with a verb, chips naming the page's own tabs and cards, a collapsed "How this page works". Never a paragraph.
- Do not invent business terms, tier names, segments or supplier names. Seed data is labelled invented unless it is Rob's own Vallecito data, which is labelled `STATED` or `DATED`.

## 6. Git

Never `git commit` or `git push` without explicit per-action approval from Rob. Approval is per action, never carried across tasks. Read-only git is always fine. Development is on localhost only until a domain is registered; there is no deployment target yet.

## 7. Stack

Next.js App Router + React + TypeScript, Tailwind 4, Clerk, Stripe (subscriptions), Resend, Neon Postgres + Drizzle with hand-written SQL migrations. One Next.js app at the repo root with one `package.json`, the house layout of every WTF Publishing app. `src/ledger` is ported from Comptable with the Muse route groups; nothing else from Comptable comes along.

## 8. Where things live

- `docs/outline.md` — the outline of record: the business and its products, decisions, vocabulary, domain model, modules, engine rules, tenancy, build phases, the practice's plan.
- `docs/roadmap.md` — the master roadmap: every phase, its status, a link to its file in `docs/roadmaps/phase-N-*.md`. `docs/todo.md` holds open one-off items. A session starts by reading this file, the outline, the master roadmap, the phase file in progress, then the to-do list; it ends by updating the phase file and the master roadmap's status.
- `docs/glossary.md` and `docs/science-library.md` — the vocabulary and the source register; `_data/glossary.ts` and `_data/science-library.ts` carry them into the app.
- `docs/` — every other canonical doc, one fact in one place, each linking to the others rather than restating.
- `_inventory/` — the temporary survey of the source material (Vallecito, Wolves To Feed, Muse) made before the outline. Reference only; delete once the port has consumed it. `_inventory/raw-extracts/` is git-ignored.
- `src/app/` — routes only: the `(farm)` OS under `/farm` and the portal route groups. `src/engine/` — the pure engine. `src/data/` — reference data and seeds. `src/server/` — read layers and server actions. `src/components/`, `src/state/`, `src/assets/`, `src/lib/` — UI, client stores, images, shared helpers. `src/db/` — the Drizzle schema and client; `drizzle/` — the SQL migrations; `src/ledger/` — the ledger engine. `scripts/` — the farm scripts and `migrate.ts`; `test/` — every test. `.env.local` carries the app's keys, `.env` the migration runner's.
