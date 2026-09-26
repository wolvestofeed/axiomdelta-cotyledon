# MicroFarm

Repo: [wolvestofeed/axiomdeltamicrofarm](https://github.com/wolvestofeed/axiomdeltamicrofarm).

The production operating system for microgreens and sprouts farms, and the back end of Axiom Delta Wellness Center's live-nutrition subscription program. Plan of record: [`docs/outline.md`](docs/outline.md). Rules: [`CLAUDE.md`](CLAUDE.md).

## Run locally

```bash
pnpm install
cp .env.example apps/web/.env.local   # fill in Clerk, Neon and Anthropic keys
cp .env.example .env                  # DATABASE_URL for migrations
pnpm --filter @mf/ledger build && pnpm --filter @mf/db build
pnpm db:migrate
pnpm dev                              # http://localhost:3000 → /farm
```

A farm is a Clerk organization. Create one in the Clerk dashboard, make yourself its admin, and sign in; the workspace is provisioned on first entry. Scripts run against one workspace: set `FARM_WORKSPACE` to its id or its Clerk organization id.

## Check

```bash
pnpm typecheck
pnpm test
```
