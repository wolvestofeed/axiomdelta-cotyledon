# BUILD PLAN — The live domain: foodismymuse.com, the Ember OS welcome site, and Cotyledon on its subdomain

The deployment plan. Rob holds the domain **foodismymuse.com** (2 October 2026). The apex is the Ember OS welcome site: a marketing page or two whose one job is to present Ember OS as the operating system and give an entry into either product. Cotyledon runs on a subdomain behind the private preview gate; Muse Kitchen runs on a second subdomain once it lifts out of Comptable, and until then the welcome site links to getcomptable.com/muse. Phase 6 (`phase-6-software-as-a-product.md`) owns this plan; `../billing.md` is the Stripe wiring; `src/server/preview-gate.ts` is the gate.

**How the session that does this starts.** Read `CLAUDE.md`, `docs/outline.md` §1 and §7, `docs/roadmap.md`, this file, then `docs/roadmaps/phase-6-software-as-a-product.md` and `.env.example`. Run `pnpm typecheck` and `pnpm test` (81 files, 991 tests green at commit `ff4636b`). Then ask Rob the five questions in §7 before touching DNS or Vercel; every step below is reversible except the DNS cut-over and the Stripe webhook registration, and both are easy to redo. Work the way Rob works: agree before building, one step per commit, nothing committed or pushed without his word for that commit. `CLAUDE.md` §6 still says there is no deployment target; it is Rob's file, and the line is updated only when he says so (§6 of this plan).

---

## 1. What is decided

- **The domain is foodismymuse.com.** Mission-driven, chosen to speak to the message rather than the technology. A company called Ember OS already trades at emberos.ai in another industry and holds the Ember OS domain names; none of them is registered, imitated or linked. Ember OS remains the platform mark on the products ("powered by Ember OS") and the name of the welcome site; it is not the domain.
- **One domain, a subdomain per product, repos separate** (2 October 2026). Cotyledon is its own repo (`wolvestofeed/axiomdeltamicrofarm`), its own Neon database and its own Vercel project. Muse Kitchen stays inside Comptable at getcomptable.com/muse until it lifts out (`../../Muse Kitchen/README.md`). Path-based routing under one host was rejected.
- **The welcome site is its own small project**, not a route in either app: a static or near-static site with the Ember OS mark, a sentence on the mission, and two entries. Indexable. Rob writes or approves the copy.
- **The private preview gate replaces Clerk sign-up** while everything is pre-revenue: one password Rob hands out, every visitor the admin of the one workspace, the deployment marked noindex. Clerk goes back on the door the day a second tenant or a real subscriber signs in (§5).
- **Stripe stays in test mode** on the gated deployment.

## 2. The shape

| Host | What | Project | Index |
|---|---|---|---|
| `foodismymuse.com` (and `www`) | The Ember OS welcome site: the mission, the two products, two entries | A new small repo, one Vercel project | yes |
| `cotyledon.foodismymuse.com` | Cotyledon, behind the preview gate | `wolvestofeed/axiomdeltamicrofarm`, one Vercel project | no (the gate sets noindex) |
| `muse.foodismymuse.com` | Muse Kitchen, once lifted out of Comptable; until then the welcome site links to getcomptable.com/muse | later | no, behind the same gate |

The subdomain names are the plan's; Rob confirms them in §7.

## 3. Steps, in order

Each step ends with a check that passes before the next begins.

### A. Accounts and the questions (§7)
- [ ] Rob answers §7: the registrar, the Vercel account or team, the production database, the subdomain names, the password and who receives it.
- [x] Vercel: a team or personal account signed in with GitHub access to `wolvestofeed/AxiomDelta-Cotyledon` (renamed from `axiomdeltamicrofarm` on 3 October 2026).

### B. The Cotyledon Vercel project
- [x] Import the repo. Framework Next.js, Node 20 (`.nvmrc`), install `pnpm install`, build `pnpm build`, output default. Production branch `main`. The first build failed because `next build` tried to prerender the farm pages and ran workspace queries; the five layouts under the farm route group now declare `dynamic = 'force-dynamic'` (commit `55b7bf7`).
- [x] Environment variables per §4, Production scope (Preview too if preview deployments are wanted; they then sit behind the same gate).
- [ ] Vercel's own Deployment Protection off for Production: the app's gate is the lock.
- [x] First deploy. Checked 3 October 2026 on the live host: `/farm` 307 → `/enter?next=/farm`; `/enter` 200 with `x-robots-tag: noindex, nofollow`; certificate issued (Let's Encrypt, to 1 January 2027). Rob confirms the password opens it.

### C. The production database
- [x] One database: Neon's default branch `production` is the live site's database and the laptop's. Vercel's `DATABASE_URL`, `.env.local` and `.env` all carry its string, so a save on localhost is a save on the live site's data, and `pnpm db:migrate` from the laptop migrates production.
- [x] Production carries migrations `0001` to `0026` and every row.
- [ ] Rob deletes the unused `development` branch in the Neon console.
- [x] The first page load after a deploy seeds the libraries against a cold branch and takes 20 to 35 seconds (`todo.md`); Rob warmed it with the password on 3 October 2026.

### D. DNS and the domain
- [x] Squarespace DNS, nameservers unchanged: A `@` → 216.198.79.1; CNAME `www` → the emberos project's vercel-dns target; CNAME `cotyledon` → `cname.vercel-dns.com`. `cotyledon.foodismymuse.com` added to the Cotyledon project; certificate issued.
- [x] Check: `https://cotyledon.foodismymuse.com/farm` redirects to `/enter`; the certificate is valid; `http://` redirects to `https://`.
- [ ] `NEXT_PUBLIC_BASE_URL=https://cotyledon.foodismymuse.com` set and redeployed (Stripe's return addresses read it).

### E. The welcome site
- [x] Built in `../../foodismymuse/` (its `PLAN.md` is the authority): three pages, Home, Platform, Mission, with two portal cards on Home that sign straight into each app. Repo `wolvestofeed/emberos`, Vercel project `emberos`, live at https://foodismymuse.com on 3 October 2026; `www` and `http` redirect to the apex (308). The Cotyledon card links to `https://cotyledon.foodismymuse.com` (the gate takes over); the Muse Kitchen card links to `https://getcomptable.com/muse` until the lift. Indexable.
- [x] Brand assets copied from the three kits into the site's `public/brand/`; copy from the site's `content/` decks, edited by Rob.

### F. Stripe on the live host (test mode)
- [ ] In the Stripe test dashboard, a webhook endpoint at `https://cotyledon.foodismymuse.com/api/stripe/webhook` for the events `billing.md` names; its signing secret becomes `STRIPE_WEBHOOK_SECRET`. The webhook path is exempt from the gate, so Stripe reaches it.
- [ ] Check: a test checkout from the Client Portal returns to the live host and the webhook posts; nothing is in live mode.

### G. Hand-over
- [ ] Rob sets the password's value himself in Vercel (§4), redeploys, and hands it out. To sign everyone out later: change the value and redeploy.
- [x] `CLAUDE.md` §6 rewritten (3 October 2026, Rob's word): names the repo and the live host, and states that a push to `main` is a deploy.
- [ ] `docs/roadmap.md` and `phase-6-software-as-a-product.md` updated; this file's checkboxes ticked as each step lands.

## 4. Environment variables on the Cotyledon Vercel project

Every variable the code reads is here. Values never go in the repo; `.env.example` documents the names.

| Variable | Production value | Why |
|---|---|---|
| `DATABASE_URL` | the Neon production branch's pooled string, `?sslmode=require` | every read and write; also what `pnpm db:migrate` and the `farm:*` scripts take when run from a laptop |
| `FARM_PREVIEW_PASSWORD` | the password Rob chooses; set by Rob | the gate: set, the deployment runs as the workspace admin, Clerk off the door, noindex; empty, Clerk is required |
| `FARM_DEV_BYPASS_AUTH` | unset | development only; the gate does its job in production |
| `FARM_DEV_EMAIL` | unset (defaults to Rob's address) | the email the gated identity carries; it matches the platform admin |
| `FARM_PLATFORM_ADMIN_EMAILS` | empty, or more admins by email | admins in every organization once Clerk is on; harmless under the gate |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | the development instance's test keys from `.env.local` for now | not used behind the gate, but present so the build never asks; swapped for production keys in §5 |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | test-mode keys | the Client Portal's card on file; test mode until Rob says live |
| `STRIPE_WEBHOOK_SECRET` | the live-host endpoint's signing secret (§3 F) | the webhook refuses without it |
| `NEXT_PUBLIC_BASE_URL` | `https://cotyledon.foodismymuse.com` | where Stripe returns the client after Checkout and the billing portal |
| `ANTHROPIC_API_KEY` | Rob's key, or unset | the agentic assistant, not yet built; unset is fine |
| `FARM_WORKSPACE` | not on Vercel | a script-only variable: the workspace the `farm:*` seeds run against (`org_local_dev`) |
| `FARM_ACTOR_USER_ID`, `FARM_ACTOR_EMAIL` | not on Vercel | script-only: who a script's writes are recorded as |

## 5. Clerk, when the gate comes down

Not for this session unless Rob says so. Recorded so the decision is made before Cotyledon's production instance exists, because moving a Clerk production domain afterwards is the painful step.

- Clerk cautions against two separate production instances on sibling subdomains of one root domain, because some of its cookies are set at the root. With Cotyledon on `cotyledon.` and Muse Kitchen on `muse.`, the plan is **one Ember OS Clerk application** that both products use, each product's farms as its organizations, which also answers the open item on one client identity across bodywork, microgreens and Feed The Wolf (`todo.md`). Confirm against Clerk's current documentation on the day.
- Creating the production instance: the application's production domain is the subdomain (or the root, for one shared application); Clerk's dashboard lists the DNS records to add at the registrar (the Frontend API CNAME, the accounts CNAME, and the email DKIM records); the production publishable and secret keys replace the test keys on Vercel; `FARM_PREVIEW_PASSWORD` is removed; the content security policy in `next.config.ts` already allows `*.clerk.com` and `*.clerk.accounts.dev`.
- The sign-in pages exist: `/farm/sign-in` for staff, `/farm/client-portal/sign-in` for clients; a client's sign-in links to its subscriber record by email (Phase 3, P5).
- Clerk's logs warn that `createRouteMatcher`, which `src/proxy.ts` uses, is deprecated for their next major release. Nothing is broken; before that upgrade the proxy's checks move into the pages and actions as Clerk's guide says. Not part of going live.

## 6. The gate, operated

- **Set** `FARM_PREVIEW_PASSWORD` on Vercel and redeploy: the whole host sits behind `/enter`.
- **Hand out** the password. A correct entry sets a signed, HttpOnly cookie for 30 days; the visitor lands on the page they asked for.
- **Sign everyone out** by changing the value and redeploying; every cookie signed with the old password stops verifying.
- **Take it down** by removing the variable, with Clerk's production keys in place (§5).
- **What it is not**: security. Anyone holding the password can pass it on, nothing records who did what, and the data behind it is the production branch's. It is a courtesy lock for a chosen audience while everything is pre-revenue.

## 7. Needs Rob, before DNS or Vercel is touched

1. Where foodismymuse.com is registered, and whether its nameservers move to Vercel (simplest) or stay with the registrar (records added by hand).
2. The Vercel account or team the two projects live in, and that it has GitHub access to the Cotyledon repo.
3. ~~The production database.~~ Answered: Neon's default branch `production` is the one database, live and on the laptop.
4. The subdomain names: `cotyledon.foodismymuse.com` and `muse.foodismymuse.com` as the plan writes them, or others.
5. The preview password's value (Rob sets it himself in Vercel; it is never written in the repo or in chat) and who receives it.
6. ~~The welcome site's copy and the name of its repo.~~ Answered: `wolvestofeed/emberos`; copy in `foodismymuse/content/`.
