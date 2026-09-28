# Cotyledon

Repo: [wolvestofeed/axiomdeltamicrofarm](https://github.com/wolvestofeed/axiomdeltamicrofarm).

Cotyledon, powered by Ember OS: the production operating system for microgreens and sprouts farms, and the back end of Axiom Delta Wellness Center's live-nutrition subscription program. Plan of record: [`docs/outline.md`](docs/outline.md). Rules: [`CLAUDE.md`](CLAUDE.md).

## Run locally

```bash
pnpm install
cp .env.example .env.local            # the app: Neon, Clerk, Anthropic keys
cp .env.example .env                  # the migration runner and scripts: DATABASE_URL
pnpm db:migrate
pnpm dev                              # http://localhost:3000 → /farm
```

A farm is a Clerk organization. Create one in the Clerk dashboard, make yourself its admin, and sign in; the workspace is provisioned on first entry. For local development set `FARM_DEV_BYPASS_AUTH=1` in `.env.local`: every request is then the admin of a local workspace, Clerk is not mounted and no Clerk keys are needed. The flag is ignored in production. Scripts run against one workspace: set `FARM_WORKSPACE` to its id or its Clerk organization id.

## Check

```bash
pnpm typecheck
pnpm test
```
