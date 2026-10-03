# Phase 6 — Software as a product  status: NOT STARTED (the private preview gate built; the domain plan decided)

After the wellness center's facility is running on it. `outline.md` §1 (the software), §7 (tenancy).

## The domain and the private preview

**One Ember OS domain, a subdomain per product.** Decided 2 October 2026. Cotyledon runs on one subdomain, Muse Kitchen on a second once it lifts out of Comptable (today it is at getcomptable.com/muse); the apex is a one-page entry site in its own small project, naming the two products and linking to each. The repos stay separate, one Vercel project per app, each with its own database and keys; a product-specific domain can be added later as an alias on the same project. Path-based routing under one host was rejected: two separate apps behind one host means multi-zone proxying, a base path baked into each, and two auth systems on one cookie jar. Before Cotyledon's Clerk production instance is created: Clerk cautions against two separate production instances on sibling subdomains of one root domain, because some of its cookies sit at the root; one Ember OS Clerk application across the products is the likely answer and it matches the open item on one client identity across bodywork, microgreens and Feed The Wolf (`todo.md`).

**The private preview gate** (`src/server/preview-gate.ts`, `src/proxy.ts`, `/enter`). Pre-revenue, the software is shown to people Rob chooses, and a Clerk sign-up is friction he does not want. With `FARM_PREVIEW_PASSWORD` set on the deployment, every request without a valid cookie goes to `/enter`, where one password Rob hands out sets a signed, HttpOnly cookie for 30 days (the expiry and an HMAC of it keyed on the password, so a cookie cannot be forged and changing the password signs everyone out at once). Behind the gate the deployment runs as the local development bypass does: every visitor is the admin of the one workspace, Clerk is not mounted, and the page metadata and an `X-Robots-Tag` header ask search engines not to index. Exempt from the gate: `/enter` itself, the Stripe webhook, and the browser's own fetches. A visitor is sent on only to a path on this host. The gate is a courtesy lock for a preview, not security: it comes down, and Clerk goes back on the door unchanged, the day a second tenant or a real subscriber signs in. Stripe stays in test mode on the gated deployment.

## Steps

- [ ] Workspace onboarding: a new farm's organization, its first admin, its seeds
- [ ] Software plans and billing on Stripe against `farm.workspaces`
- [ ] The Ember OS domain, Cotyledon's subdomain and its Vercel project behind the preview gate; the apex entry site; the brand and its assets (the lifted icons are Muse Kitchen's)
- [ ] Sales Portal and Prospects re-based on farm prospects, or dropped
