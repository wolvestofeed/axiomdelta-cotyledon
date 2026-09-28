# Phase 1 — Swap and tenancy  status: DONE

The kitchen vocabulary replaced in full (1a, commit `e5f34af`), then one Clerk organization per farm with isolation enforced in the database (1b, commit `1d3cb5c`).

## 1a — Vocabulary swap

- [x] `outline.md` §3 applied to identifiers, schema, routes, cookies, env vars, CSS, tests, scripts and docs by a case-preserving rename engine; packages renamed `@mf/*`; route group `(farm)`; the OS at `/farm`
- [x] Parent portal, ERRA copy, the CompTable pieces and the school-prospect dataset removed; HR is Staffing, Floor is Grow Room, Customers are Subscribers, Sites are Pickup Points, Recipes are grow plans, Equipment is Grow Units
- [x] The 37 migrations folded into `drizzle/0001_farm_init.sql`
- [x] `test/farm-vocabulary.test.ts` fails on any surviving kitchen word outside its allowlist (the files that name the origin or cite a source as it is titled, the compiled food factor table and `produce-safety.ts`), and on grow plan's former name in any form outside the migration that renames the tables
- [x] Muse's research notes, training documents and todo list deleted as build history; the per-topic build plans kept in `roadmaps/`
- [x] "Portions" and "meals" both became "units" and collided in the production ledger: a sowing's output count is `units`, the billable count is `servings` (one schema column, `servings_produced`). Phase 2 drops servings: a flat is a flat

## 1b — Tenancy (`outline.md` §7)

- [x] `farm.workspaces`, one row per Clerk organization, provisioned on first sign-in
- [x] `workspace_id` on all 51 tables, defaulted from the transaction setting, indexed; row-level security forced on every table; keys that were global made per workspace (migration `0002`)
- [x] Roles from the organization: `org:admin` is admin, any member is operator, platform admins named in `src/server/access.ts` are admins everywhere; the email allowlists gone
- [x] `withWorkspace()` around every page, layout, route handler and server action (87 entry points); `db` throws outside a scope; `test/farm-workspace-scope.test.ts` fails on an unwrapped entry point
- [x] Scripts scoped through `FARM_WORKSPACE`; the front door shows Clerk's organization picker with no org active

## Known limits carried forward

- Portal users must also be organization members to see anything, as before; real portal account linking is Phase 3
- Nested async server components rendered as JSX elements lose the scope; the dashboard calls them as functions, and the structural test does not catch new cases of the pattern
- Lint carries three react-hooks errors from the source (`todo.md`)
