# MicroFarm

The production operating system for microgreens and sprouts farms, and the back end of Axiom Delta Wellness Center's live-nutrition subscription program. Plan of record: [`docs/outline.md`](docs/outline.md). Rules: [`CLAUDE.md`](CLAUDE.md).

## Run locally

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in Clerk, Neon and Anthropic keys
cp .env.example .env                  # DATABASE_URL for migrations
pnpm --filter @ct/ledger build && pnpm --filter @ct/db build
pnpm db:migrate
pnpm dev                              # http://localhost:3000 → /muse
```

## Check

```bash
pnpm typecheck
pnpm test
```
