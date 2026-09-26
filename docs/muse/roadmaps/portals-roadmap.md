# BUILD PLAN — the portals

Impact OS is an administrative workspace with a portal for every stakeholder, so the kitchen owns the
communication with each of them. Each portal is its own shell with its own address: a person is sent the
link for their role, signs in, and lands on their portal's home page. Nothing in an external portal links
into the OS.

Status lives in [`../roadmap.md`](../roadmap.md) (Phase P); this file owns the phases, decisions and gates.

## 1. Decisions (Robert)

1. **The surfaces.**

   | Surface | Who | Sign-in | Address |
   |---|---|---|---|
   | Front door | everyone | the one sign-in | `/muse` |
   | Impact OS | admins, and operators by the role matrix | internal | `/muse/dashboard` |
   | Floor | kitchen operators (production and dispatch) | internal | `/muse/floor` |
   | Sales | sales staff | internal, with the time clock | `/muse/sales-portal` |
   | Customer | corporate, catering and special-events clients | external | `/muse/customer-portal` |
   | Supplier | suppliers | external | `/muse/supplier-portal` |
   | Parent | parents | external | `/muse/parent-portal` |

2. **The UI surface first.** The portals are shown to people now; wiring follows. Nothing is gated
   beyond the staff sign-in while they are developed: Muse Kitchen staff see each external portal as it
   will look.
3. **Accounts.**
   - Suppliers: the link is set by an admin (an invitation from the supplier's record); suppliers sign in
     only, with no open sign-up.
   - Catering clients and parents: open sign-up — anyone may create an account.
   - Every new account notifies the admin emails and sends the new user a verification email.
   - The policy stated on every external portal: new accounts, orders and supplier submissions are
     reviewed by staff before they are committed to production; call the kitchen for faster service.
4. **Work roles are held together.** Staff may hold more than one work role at any time — operator
   (production and dispatch, the Floor) and sales (the Sales portal). Kitchen and office work carry
   different liability costs; Muse reports the hours worked by role and payroll does the rest. No class
   code is held in Muse.
5. **One source of truth.** A customer's or supplier's contact information lives on its master record;
   the portal page reads the same record the OS page reads. Parents get their own profiles in the database.
6. **Admins are universal logins.** An admin always lands on the Admin Dashboard and opens every role and
   portal.
7. **Staff holding both Operator and Sales get a chooser** after sign-in: the Floor or the Sales Portal.
8. **The menu order.** The top links (Dashboard, Reports); a thin rule; the OS sections — Production,
   Financials & Accounting, Cold Chain, Supply Chain, Sustainability, People, Sales, Distribution; a
   heavier rule; the external portal sections Customer, Supplier, Parent (`EXTERNAL_SECTIONS` in
   `_components/nav.ts`); Sources last. The signed-in person's name sits in a pill at the sidebar foot.
   The Dashboard is "Admin Dashboard" for admins and "Dashboard" for operators.
9. **The front door's look.** The whole page is the logo mark's landscape: its sky (`#0E6B4E`) with the
   three soil bands across the page at the mark's heights, each with a gentle wave
   (`_components/FrontDoorLandscape.tsx`). The brand is stacked as in the OS header: the mark, MUSE KITCHEN
   in the logo's dark green, IMPACT OS in copper; then "Welcome to the operating system built specifically for
   regenerative, scratch kitchens" and a "Login" button.

## 2. Phases

| Phase | Content | Status |
|---|---|---|
| **P1** | Menu restructure; basic portal pages (Sales Portal, Customer Portal, Order Builder, Supplier Portal) | Built |
| **P1b** | Every portal in its own shell (`_components/PortalShell.tsx`): Customer, Supplier and Parent shells; customer and parent sign-up pages and the supplier invitation welcome page, each with the review policy; the Sales shell's time clock for the signed-in person; Parent Admin in the OS under Parent | Built |
| **P2** | Work roles held together on the staff register (`staff.roles`); each punch carries the role of its shift (`time_punches.role`, migration 0074 — the Floor clocks operator, the Sales portal sales); hours by role on HR and on `muse.punches` to payroll | Built |
| **P3** | External sign-in: sign-in and sign-up inside each portal shell (Clerk forms, `_components/PortalAuth.tsx`; suppliers sign in only), public in `proxy.ts`; a signed-out visit to a portal goes to its own sign-in; a signed-in account that is not staff sees "under review" and no data, checked on the layout and the page (`_components/PortalPending.tsx`); the Sales shell is staff only | Built |
| **P4** | Accounts: supplier invitation links from the supplier record; admin notification and user verification emails | Placeholder — the internal and external email clients are to be discussed |
| **P5** | Contacts on the master records: a customer's and a supplier's portal contacts on the one record the OS and the portal read; linking an external account to exactly one record; parent profiles (fields to be set with Robert) | Open — a migration |
| **P6** | Wiring the forms: Order Builder submissions as orders pending review; supplier line sheets, specials, new items and rating assessments as submissions pending review; each reviewed by staff before it reaches production | Open — after P3–P5 |
| **P7** | The front door (beta): the welcome page at `/muse`, one sign-in, and a router that sends each person to their surface by the list their email is on; the Dashboard at `/muse/dashboard` | Built; `/muse` public is open (§2a) |

## 2a. P7 — the front door

**Context.** When the OS goes live it moves to its own address, off CompTable, and the main URL becomes a
marketing site with several pages; sign-up (any role) and sign-in modals live on those pages and their top
bars. For the beta, embedded in CompTable, the front door is kept simple and simple to change: the router is
what the marketing site's modals will call.

**As built.**
- `(front)/` — a sibling route group like the portals, served without the OS sidebar and scenario bar; its
  layout draws the landscape (decision 9).
  - `muse/page.tsx` — the welcome page; the button goes to the sign-in, or straight to the router when
    signed in.
  - `muse/sign-in` — `FrontDoorSignIn` in `_components/PortalAuth.tsx`, a Clerk `<SignIn>` in the same look,
    with a "Create account" link.
  - `muse/sign-up` — `FrontDoorSignUp`: anyone creates their own account, and both forms return to the router.
    An account opens nothing by itself; the admin list and the staff register decide where it lands, so a
    new person is added by putting their email on one of them.
  - `muse/enter` — the router.
- `_engine/front-door.ts` — `landingFor`, checked in order: an admin → `/muse/dashboard`; both the Operator
  and Sales work roles → the chooser; the Sales work role → `/muse/sales-portal`; operator access →
  `/muse/floor` (a named operator not on the register included); none → "account under review" with the
  review policy. `MuseAccess.staffRoles` carries the register's work roles. Tests:
  `test/muse-front-door.test.ts`.
- The Dashboard is `muse/dashboard/page.tsx`, first in the menu. The sidebar logo and the Floor and Sales
  "Workspace" links go to `/muse/dashboard`.
- `/muse` (exact), `/muse/sign-in` and `/muse/sign-up` are public in `proxy.ts`; every other `/muse` path, the router
  included, stays behind sign-in.
- The direct links stay: `/muse/customer-portal`, `/muse/parent-portal`, `/muse/supplier-portal`,
  `/muse/sales-portal`, `/muse/floor`.

**Open.**
- [ ] An external account linked to a customer, supplier or parent record routes to that portal. Waits on
      linking (P5); until then it lands on its portal's "under review".

## 3. Rules

1. **No invented figures, fields or codes.** A class code, a profile field or a policy phrase comes from
   Robert; a placeholder is labelled as one.
2. **External users see only their own record.** Every external read filters to the linked record on the
   server; the OS's throwing guards refuse external accounts.
3. **Review before production.** Nothing an external user submits posts to an order book, a catalog or a
   rating until staff approve it; the approval is on the posting trail.
4. **One source of truth** for contacts and records; a portal never keeps a copy.
5. **No commit or push without per-action approval**, and the Muse scope boundary holds: `proxy.ts` is a
   CompTable change.
