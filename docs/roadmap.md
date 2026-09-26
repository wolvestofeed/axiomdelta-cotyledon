# MicroFarm — Roadmap

Phase status only, one line per step. The phases are defined in [`outline.md`](outline.md) §8.

## Phase 0 — Lift  status: DONE
- [x] pnpm workspace: `apps/web`, `packages/db`, `packages/ledger`
- [x] Route groups, engine, data, components, state copied verbatim from Muse
- [x] The schema and its migrations; ledger package; the tests, scripts and docs
- [x] CompTable removed: contract, signing, transport, its test, its named people; the four small helpers rewritten in `apps/web/src/lib`
- [x] Own Clerk middleware (`src/proxy.ts`), root layout, redirect from `/` to the OS
- [x] Typecheck clean; 918 web tests and 78 ledger tests pass; production build compiles every route
- [ ] Runs on localhost against a new Clerk app and a new Neon database (needs the keys in `apps/web/.env.local`, then `pnpm db:migrate` and `pnpm dev`)

## Phase 1 — Swap and tenancy  status: IN PROGRESS
- [x] Vocabulary swap applied to identifiers, schema, copy, tests, docs and seeds (`docs/outline.md` §3); packages renamed `@mf/*`; route group `(farm)`, OS at `/farm`
- [x] Parent portal, ERRA copy and the CompTable pieces removed; HR is Staffing, Floor is Grow Room, Customers are Subscribers, Sites are Pickup Points
- [x] One consolidated migration, `packages/db/drizzle/0001_farm_init.sql`
- [x] `test/farm-vocabulary.test.ts` fails on any surviving kitchen word outside the Phase 2 allowlist (the seeded crop plan, nutrient profile, grow stages, produce-safety plan, fixtures)
- [x] Typecheck clean; 918 tests pass
- [x] Workspaces: `farm.workspaces`, `workspace_id` on all 51 tables with row-level security (migration 0002), one Clerk organization per workspace, roles from the organization, every entry point in `withWorkspace()`, scripts via `FARM_WORKSPACE` (`docs/outline.md` §7)
- [ ] Lint: three react-hooks errors carried over from the source (`OmniSearch.tsx`, `ProspectsCRM.tsx`, `useLinkedEntities.ts`)
## Phase 2 — Growing domain  status: NOT STARTED
## Phase 3 — Subscriptions and distribution  status: NOT STARTED
## Phase 4 — Staffing  status: NOT STARTED
## Phase 5 — Facility and sustainability  status: NOT STARTED
## Phase 6 — Software as a product  status: NOT STARTED
