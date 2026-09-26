# BUILD PLAN — People: HR, time studies, staff demand

Roadmap Phase O. Runs alongside Phase N (`operating-model-roadmap.md`). The CompTable contract it
depends on is [`../comptable-contract.md`](../comptable-contract.md).

---

## 1. Scope

1. **HR belongs to CompTable.** Muse Kitchen runs its HR on CompTable — roster, wages, burden,
   benefits, the published schedule, payroll. Muse is the production system: it knows the labor
   hours the plan requires, the hours charged to each batch, and the punches taken on its clocks.
2. **Pay is confidential.** No pay or confidential employee information is held in Muse, and none
   reaches an operator.
3. **Labor standards exist per recipe.** Every recipe in the library carries a log of time studies,
   and its labor standard comes from that log.

## 2. Decisions (Robert)

1. **Two access roles: admin and operator.** Admins are the named super admins (Robert, Amy, Ford, Brian);
   an admin is always an operator. An active person on the staff register whose sign-in email is on
   their record is an operator. Named operators outside the register are listed in `_lib/access.ts`.
2. **No pay or confidential employee information is held in Muse.** CompTable owns it; admins view
   it in Muse, read from CompTable at request time and never stored in `muse.*`. Operators never see
   pay, payroll totals, burden or benefits.
3. **Full names of staff may be shown in Muse** (the Floor, the clock, shifts).
4. **People holds HR, Schedule and Training.** HR is one page for the clock, hours, payroll and the
   CompTable connection. Time Studies sits under Production.
5. **Production labor cost is visible to operators** — labor hours and labor cost per batch and per
   day on Time Studies. HR totals (payroll by account, burden, benefits) and the financial statements
   are admin-only.
6. **Labor is time studies per recipe.** Each recipe has a time study log on a cadence, trends
   graphed, quality assurance recorded; the log panel shows 10 rows and scrolls. A study entry holds
   date, recipe, batch size, observer, task lines (task, stream, station, staff, elapsed minutes,
   labor minutes, fixed or variable) and a quality result (pass / hold / fail) with notes. Each
   recipe has a re-study interval and a next-due date. An admin adopts the study that is the
   recipe's labor standard.
7. **Every recipe has an estimated study.** A mock estimated time study is seeded for every recipe
   and labelled Estimated; it stands in as the labor standard until an observed study is adopted.
   The Time Study Sheet is downloadable, and a timed batch is entered in the OS as a dated log entry.
8. **Schedule is production staff demand.** Muse generates a two-week staff demand schedule from the
   production plan and sends it to CompTable; an admin adjusts it in CompTable, publishes it to
   staff, and CompTable sends the published schedule back to Muse biweekly. Demand is sent as
   headcount and hours by task and station per day; CompTable maps it to its positions.
9. **Clock times flow Muse → CompTable.** Punches are taken on the Floor and the Sales portal, each
   carrying the work role of its shift (Roadmap P2).
10. **Operators edit and save their own forecasts.** Customer contract prices are visible to
    operators and admins. Company financials are admin-only everywhere; admins get the Admin
    Dashboard, operators the operator dashboard without financials.
11. **Training** is developed with the Axiom Delta coaching engine (credentials-gated).

## 3. Who sees what in People

| Section | Operator | Admin |
|---|---|---|
| HR — their own clock, punches, shifts and hours (matched by sign-in email) | Yes | Yes, everyone's |
| HR — the staff register and hours by work role | — | Yes |
| HR — pay-period totals by account, burden and benefits | — | Yes |
| HR — individual pay and personal details (read from CompTable) | — | Yes |
| HR — the CompTable connection | — | Yes |
| Time Studies — studies, trends, quality results | Yes | Yes (records, adopts) |
| Time Studies — labor hours, labor cost per batch and per day | Yes | Yes |
| Schedule — staff demand, published schedule, coverage | Yes | Yes |
| Training | See, complete assignments | Also publish, version and archive documents |

Admin-only data is fetched and rendered on the server for an admin; it is never serialized to an
operator's client.

## 4. Steps

**O1 — the HR page, and pay out of Muse** — built
- [x] `/muse/hr` under People; `/muse/payroll`, `/muse/comp` and `/muse/comptable` redirect to it.
- [x] Sections gated by §3, server-side. An operator sees their own clock, shifts, hours and punches
      only; with no matched sign-in, no record is shown. Admin data is loaded only for an admin; the
      CompTable reference, sign-in email and staff notes are withheld from operators on HR and the
      Floor. Until CompTable is connected the admin sections state the details are held there.
- [x] Migration 0060: `muse.staff.comptable_employee_ref`, `muse.payroll_periods` (closed periods,
      totals by account). Migration 0062 drops the staff pay columns. Migration 0063: `staff.email`,
      lowercased, one person per email. The staff form holds full name, work roles, sign-in email,
      CompTable reference, start date and status.
- [x] The Actual ledger's payroll posts from CompTable's closed pay periods: at month end the part of
      each period earned in the month (by hours on the clock, else calendar days) against what batch
      records charged, the difference to 5170; each period paid on its pay date. With none received
      it posts nothing and notes the uncovered hours. `_engine/payroll.ts` holds hours only.
- [x] The plan-data roster keeps role titles for Training only. The Dashboard People tile shows the
      register, on the clock, hours and open shifts; the operator dashboard shows their own clock and
      hours.
- [x] Tests: the staff document and the hours run carry no pay field; payroll posting from closed
      periods, the month split and the uncovered-hours note (`muse-payroll.test.ts`).

**O2 — Time Studies: per recipe** — built
- [x] Migration 0061: `muse.time_studies` (recipe, studied on, batch size, observer, quality result,
      quality notes, adopted at / by), `muse.time_study_lines` (task, station, staff, elapsed minutes,
      labor minutes, fixed or variable), `muse.time_study_intervals` (re-study days per recipe).
      Migration 0064: `time_studies.basis`, `estimated` or `observed`. Migration 0066:
      `time_study_lines.stream`, batch or dispatch.
- [x] Seeding: on read, every library recipe with no study gets an estimated study at its derived
      batch at the plan's defaults (`source = 'seed'`), idempotent per recipe under the advisory
      lock. AMK-E-001's is the plan's 14-task time study at its stated batch size, with no date,
      observer or quality result. Every other recipe's is built by `_engine/time-study-estimate.ts`
      (pure): the task scaffold off the recipe's own served components on the two streams — on the
      batch stream receiving, scaling and mise en place, a prep and a cook per hot component,
      component blast chill and stage, and the line turnaround (two people, 15 minutes); on the
      dispatch stream a cold assembly per cold component, portion and assemble, seal and label, the
      temperature check at pack, and the load. The common tasks carry the plan's estimate minutes;
      each cook's elapsed minutes come from the thermal standard at the plan's point of the range,
      its labor minutes the tended time (the whole run for a high-speed process, an allowance for a
      roast, braise or overnight run; skillet sautés attended and per portion). A component with no
      cook time on file gets the allowance and says so. There is no second blast chill, no cold-hold
      line and no end-of-day closedown line. Labelled ESTIMATED and PLACEHOLDER.
- [x] The labor standard (`laborStandard`): the study adopted most recently; with none adopted, the
      recipe's estimated study stands in. An observed study that is not adopted does not stand in.
      Earlier adoptions stay on the record.
- [x] The Time Studies page (`/muse/time-studies`, under Production): recipe selector; KPIs (studies
      and the standard's source, labor minutes per portion, labor hours and cost per batch at the
      derived batch size, labor cost per rated day, next study due); the log in a ten-row scrolling
      panel with a Basis column and the estimate marked "Stands in"; the selected study's task lines
      and quality result; trend lines of labor minutes per portion and fixed minutes per batch (one
      point per dated study, hover and keyboard readout, the log as the table); the re-study
      interval; the recording form, starting from the standard.
- [x] An admin adopts an observed study as the recipe's labor standard (`adopt_time_study` on the
      posting trail). Fixed and variable minutes are derived from a study's lines, never typed.
- [x] Labor cost per batch and per day at the plan's placeholder loaded rate. No individual wage.
- [x] Download the Time Study Sheet (`time-studies/time-study-sheet`, operator-gated, exceljs): Read
      Me, one scaffold block per recipe with the observer's cells shaded and the standard's minutes as
      reference, the standards on file, the studies on file, the plan's task library; the recipe open
      on the page listed first. A timed batch is entered on the page; the sheet is not imported.
- [x] Recipe costing reads each recipe's own labor standard (Roadmap N3).
- [x] Tests: `muse-time-studies.test.ts`, `muse-time-study-estimate.test.ts`.
- [ ] `pnpm muse:reseed` resetting the estimated studies. It does not reset them; deleting a
      recipe's estimated row re-seeds it.
- [ ] Importing a filled sheet back into the log, if timing on paper turns out to be the practice.

**O3 — Schedule: production staff demand** — built; the published schedule waits on O4 transport
- [x] Two weeks of staff demand from the production plans (`_engine/staff-demand.ts`): the order book
      rolled through production with the same `planHorizon` as Production Planning; each recipe
      staffed from its labor standard on two streams — batch lines on the production day, a fixed
      line once per batch and a variable line per portion produced; dispatch lines on the delivery
      day, per portion shipped, a fixed line once that day — as people and staff-hours by task and
      station per day. A recipe with work and no study at all is listed and carries no demand. What
      delivered orders drew from stock is one shared function (`deliveredConsumption`).
- [x] The Schedule page shows the demand, a production day per collapsing group, the recipes staffed
      from an estimate, and the CompTable status (demand prepared, not sent; no published schedule
      received). The operating day and the proposed crews are edited on Capacity; one day on the clock
      is the Day Schedule under Production. The demand document for CompTable is
      `staffDemandDocument` — tasks, stations, people, hours; no positions, no pay.
- [x] Tests: `muse-staff-demand.test.ts`.
- [ ] When CompTable is connected: the published schedule received biweekly, shown against demand as
      coverage by day (`coverageByDay`).

**O4 — the CompTable feeds for People** — contract built; transport gated
- [x] Contract version 1 ([`../comptable-contract.md`](../comptable-contract.md)): punches and staff
      demand and labor demand (Muse → CompTable); published schedule, closed payroll periods, labor
      cost line items per forecast version, the staff-joined notice and the confidential staff
      read-through for admins (CompTable → Muse). Built in Muse: the document schemas, the punches
      builder, the payroll-period and labor-cost readers, coverage by day, handled-once filtering and
      the notice signature (`_engine/comptable-contract.ts`, `_lib/comptable-signing.ts`,
      `muse-comptable-contract.test.ts`).
- [ ] Transport: Muse Kitchen on its own domain, a Muse Kitchen account in CompTable, signing secrets,
      endpoints on both sides, a Muse table of handled events.
- [ ] The CompTable side (punch landing, demand intake and position map, a biweekly pay-period close,
      monthly labor pricing from hours, an org-scoped read API, a Muse connection; contract §4). Each
      is a CompTable change Robert approves separately under the Muse scope boundary
      (docs/muse/CLAUDE.md §7).

**O5 — the OS-wide role matrix** — built
- [x] Every page and data class against operator and admin — see, edit, record (§6).
      `_lib/access.ts` holds the admin and operator lists and the staff sign-in match; admin-only
      entries are left out of operators' navigation; admin-only server pages return the notice before
      loading anything, and the financials layout covers the client pages there; Production Planning's
      run economics and by-channel view are admin-only. Tests: `muse-access-guards.test.ts`,
      `muse-role-matrix.test.ts`.
- [ ] A CPA role, working in CompTable. Not built.

## 5. Rules Phase N works under

- CompTable owns positions, wages and burden; Phase N holds no roster positions and no payroll
  burden set.
- N3's labor per recipe comes from O2's labor standard × the loaded rate (the plan's placeholder
  rate until CompTable prices it).
- N4's labor cost for a forecast comes back from CompTable as line items (`comptable.labor_cost`,
  O4); until connected it uses the plan placeholder.

## 6. The role matrix

| Page | Operator | Admin |
|---|---|---|
| Dashboard | The operator dashboard: production, cold chain, supply, sustainability, distribution, their own clock and hours; no company financials, no one else's staff data | The Admin Dashboard: all of it, financials and people included, supplier-bill alerts |
| Sources | See | See, register and edit |
| Recipes, Equipment, Packaging | See (unit costs included) | See and edit |
| Production Planning, Day Schedule, Compare, Calendar, Process | See, close batch records; no run economics or by-channel view | All |
| Capacity | See | See |
| Floor | Record: receive, close batches, ship, punches | Record; link to Actuals |
| Unit Economics, Profit & Loss, Balance Sheet, Cash Flow, Ledger, Plan v Actual, Actuals, Receivables (and invoices), Payables, Capital & Financing | — (not in navigation; the page shows "Admins only") | All |
| Inventory, Food Safety | See, record | See, record |
| Procurement | See, receive against a purchase order | See, edit, receive |
| Suppliers | See | See, edit |
| Sustainability (every page but Facility) | See, enter | See, enter |
| Sustainability · Facility (the Design and Build plan, footprints, space, conformance, layout, normalizers) | Admins only (Robert, 2026-09-17; Roadmap Q3) | See, edit footprints, draw and save layouts |
| Time Studies | Studies, trends, quality results, labor hours and cost per batch and per day | Also records and adopts studies |
| HR | Their own record: clock, shifts, hours, punches (matched by sign-in email) | Everyone's, plus payroll totals, pay and personal details (from CompTable), the CompTable connection |
| Schedule | Staff demand, coverage | Same |
| Training | See, complete assignments | Also publish, version and archive documents |
| Sales Portal, CRM, Parent Admin, Parent Portal | See, work the CRM | Same |
| Customers, Orders | See, contract prices included | See and edit |
| Sites & Delivery, Reports | See | See |
| Forecasts | Open, edit, save and delete their own | Also set the plan of record |

The portals' access rules are in [`portals-roadmap.md`](portals-roadmap.md).
