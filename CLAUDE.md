# CLAUDE.md — MicroFarm

**MicroFarm** (working title) is the microgreens and sprouts production operating system of **Axiom Delta Wellness Center**, Robert Bogatin's (Joshin's) one business operation. It is ported from his Muse Kitchen · Impact OS and re-vocabularied for growing. Tenant zero is the wellness center's own production facility, which starts in Rob's South Austin home. Other microgreens farmers subscribe to the software.

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
| MicroFarm | This repo. The production OS for the microgreens and sprouts facility, and a product other farmers subscribe to. |

MicroFarm's scope is the facility: crop plans, sowings, grow units, inventory, produce safety, suppliers, sustainability, staffing, subscribers and their flat plans and nutrition targets, orders, distribution, and the books of the facility. Bodywork bookings, coaching sessions, the library and sequencing live in the other products. Nothing about a client's sessions or health beyond their nutrition targets for their flats is held here.

- Multi-tenant: every farm is a workspace. The wellness center's facility is one workspace, never a special case in code.
- No connection to CompTable. No webhooks, no contract, no shared database. Staffing, wages and pay periods are an internal module.
- Nothing from the Muse Kitchen source client carries over: no names, no recipe codes, no seed data, no ERRA mark. Muse Kitchen and Impact OS are Rob's names and may be cited as the origin.

## 3. Vocabulary

The Muse vocabulary is replaced in full: code identifiers, table and column names, UI copy, tests, docs, seed data. The swap table lives in `docs/outline.md` §3 and is the only authority. Kitchen words (recipe, portion, meal, cook, chill, kettle, cabinet, plated, kitchen, school, parent) do not appear anywhere once the swap is done, except in `docs/outline.md` §3 itself.

## 4. Engine rules

The engine invariants are stated in `docs/outline.md` §5. In short: the batch is a sowing and is derived from grow-unit capacity, never typed; the sowing is the costing basis; labor is fixed per sowing plus variable per unit on two streams; whole sowings only; every dollar is computed from tagged reference data; only the harvest record posts journals; capacity is a property of the grow room, labor a requirement of the plan.

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

Next.js App Router + React + TypeScript, Tailwind 4, Clerk, Stripe (subscriptions), Resend, Neon Postgres + Drizzle with hand-written SQL migrations, pnpm workspace. The `packages/ledger` package is ported from Comptable with the Muse route groups; nothing else from Comptable comes along.

## 8. Where things live

- `docs/outline.md` — the outline of record: the business and its products, decisions, vocabulary, domain model, modules, engine rules, tenancy, build phases, the practice's plan.
- `docs/next-session.md` — where the current phase stands and what to do first, replaced at the end of every session. A new session reads it after this file and the outline.
- `docs/glossary.md` and `docs/science-library.md` — the vocabulary and the source register; `_data/glossary.ts` and `_data/science-library.ts` carry them into the app.
- `docs/` — every other canonical doc, one fact in one place, each linking to the others rather than restating.
- `_inventory/` — the temporary survey of the source material (Vallecito, Wolves To Feed, Muse) made before the outline. Reference only; delete once the port has consumed it. `_inventory/raw-extracts/` is git-ignored.
- `apps/web/` — the application. `packages/db/` — schema and migrations. `packages/ledger/` — the ledger engine.
