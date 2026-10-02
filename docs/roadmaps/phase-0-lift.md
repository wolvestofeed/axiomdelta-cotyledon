# Phase 0 — Lift  status: DONE

Muse Kitchen lifted verbatim from the Comptable repo into this one, with everything that tied it to CompTable removed. Commit `e69f0e9`.

## Steps

- [x] One Next.js app at the repo root, the house layout: `src/app` routes, `src/engine`, `src/data`, `src/server`, `src/components`, `src/db`, `drizzle/`, `src/ledger`; one `package.json`
- [x] Route groups, engine, data, components, state copied verbatim from Muse
- [x] The schema and its 37 migrations; the ledger package with its 5 test files; 58 tests; 11 scripts; the docs without the confidential folder or the brand images
- [x] CompTable removed: the HR contract, signing, transport, their test, and the source client's named people; the four small helpers Muse imported from CompTable rewritten in `src/lib` with the same signatures
- [x] Own Clerk middleware (`src/proxy.ts`), root layout, redirect from `/` to the OS
- [x] Typecheck clean; the web and ledger suites pass; the production build compiles every route
- [ ] Runs on localhost against a new Clerk app and a new Neon database: the keys in `.env.local` and `.env`, then `pnpm db:migrate`, then `pnpm dev`. Migrations `0001` and `0002` have never been applied to a live database, so the first run is itself a test (`todo.md`)

## This lift, again, for Muse Kitchen itself

Muse Kitchen is a standalone application built inside the Comptable repo to borrow its paid Vercel, Clerk and Neon; it is live at `getcomptable.com/muse`. When it gets its own domain it leaves Comptable by the procedure above, written out for Muse in Comptable's `docs/muse/standalone-migration.md` (the seam measured 2026-10-02: the Drizzle handle, the `muse.*` schema and its 37 migrations, the ledger package, four small `src/lib` helpers, the Clerk matcher and the root layout). The new repo goes in `WTF Publishing/Ember OS/Muse Kitchen/`, which today holds a README and aliases into Comptable. This repo is the layout to copy, file for file.
