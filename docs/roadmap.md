# MicroFarm — Roadmap

Phase status only, one line per step. The phases are defined in [`outline.md`](outline.md) §8.

## Phase 0 — Lift  status: DONE
- [x] pnpm workspace: `apps/web`, `packages/db`, `packages/ledger`
- [x] Muse route groups, engine, data, components, state copied verbatim
- [x] `muse` schema and its 37 migrations; ledger package; 58 tests; 11 scripts; `docs/muse/`
- [x] CompTable removed: contract, signing, transport, its test, its named people; the four small helpers rewritten in `apps/web/src/lib`
- [x] Own Clerk middleware (`src/proxy.ts`), root layout, redirect from `/` to `/muse`
- [x] Typecheck clean; 918 web tests and 78 ledger tests pass; production build compiles every route
- [ ] Lint: three react-hooks errors carried over from the Muse source (`OmniSearch.tsx`, `SchoolsCRM.tsx`, `useLinkedEntities.ts`) and 32 unused-symbol warnings; cleared during the Phase 1 swap since those files are rewritten then
- [ ] Runs on localhost against a new Clerk app and a new Neon database (needs the keys in `apps/web/.env.local`, then `pnpm db:migrate` and `pnpm dev`)

## Phase 1 — Swap and tenancy  status: NOT STARTED
## Phase 2 — Growing domain  status: NOT STARTED
## Phase 3 — Subscriptions and distribution  status: NOT STARTED
## Phase 4 — Staffing  status: NOT STARTED
## Phase 5 — Facility and sustainability  status: NOT STARTED
## Phase 6 — Software as a product  status: NOT STARTED
