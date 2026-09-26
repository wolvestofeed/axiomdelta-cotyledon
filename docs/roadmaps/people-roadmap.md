# BUILD PLAN — People: HR, time studies, staff demand

Roadmap Phase O. Runs alongside Phase N (`operating-model-roadmap.md`). The Staffing contract it
depends on is [`../staffing-contract.md`](../staffing-contract.md).

---

## 1. Scope

1. **HR belongs to Staffing.** MicroFarm runs its HR on Staffing — roster, wages, burden,
   benefits, the published schedule, payroll. Farm is the production system: it knows the labor
   hours the plan requires, the hours charged to each sowing, and the punches taken on its clocks.
2. **Pay is confidential.** No pay or confidential employee information is held in Farm, and none
   reaches an operator.
3. **Labor standards exist per crop plan.** Every crop plan in the library carries a log of time studies,
   and its labor standard comes from that log.

## 2. Decisions

1. **Two access roles: admin and operator.** Admins are the named super admins (Robert, Amy, Ford, Brian);
   an admin is always an operator. An active person on the staff register whose sign-in email is on
   their record is an operator. Named operators outside the register are listed in `_lib/access.ts`.
2. **No pay or confidential employee information is held in Farm.** Staffing owns it; admins view
   it in Farm, read from Staffing at request time and never stored in `farm.*`. Operators never see
   pay, payroll totals, burden or benefits.
3. **Full names of staff may be shown in Farm** (the Grow Room, the clock, shifts).
4. **People holds HR, Schedule and Training.** HR is one page for the clock, hours, payroll and the
   Staffing connection. Time Studies sits under Production.
5. **Production labor cost is visible to operators** — labor hours and labor cost per sowing and per
   day on Time Studies. HR totals (payroll by account, burden, benefits) and the financial statements
   are admin-only.
6. **Labor is time studies per crop plan.** Each crop plan has a time study log on a cadence, trends
   graphed, quality assurance recorded; the log panel shows 10 rows and scrolls. A study entry holds
   date, crop plan, sowing size, observer, task lines (task, stream, station, staff, elapsed minutes,
   labor minutes, fixed or variable) and a quality result (pass / hold / fail) with notes. Each
   crop plan has a re-study interval and a next-due date. An admin adopts the study that is the
   crop plan's labor standard.
7. **Every crop plan has an estimated study.** A mock estimated time study is seeded for every crop plan
   and labelled Estimated; it stands in as the labor standard until an observed study is adopted.
   The Time Study Sheet is downloadable, and a timed sowing is entered in the OS as a dated log entry.
8. **Schedule is production staff demand.** Farm generates a two-week staff demand schedule from the
   production plan and sends it to Staffing; an admin adjusts it in Staffing, publishes it to
   staff, and Staffing sends the published schedule back to Farm biweekly. Demand is sent as
   headcount and hours by task and station per day; Staffing maps it to its positions.
9. **Clock times flow Farm → Staffing.** Punches are taken on the Grow Room and the Sales portal, each
   carrying the work role of its shift (Roadmap P2).
10. **Operators edit and save their own forecasts.** Subscriber contract prices are visible to
    operators and admins. Company financials are admin-only everywhere; admins get the Admin
    Dashboard, operators the operator dashboard without financials.
11. **Training** is developed with the Axiom Delta coaching engine (credentials-gated).

## 3. Who sees what in People

| Section | Operator | Admin |
|---|---|---|
| HR — their own clock, punches, shifts and hours (matched by sign-in email) | Yes | Yes, everyone's |
| HR — the staff register and hours by work role | — | Yes |
| HR — pay-period totals by account, burden and benefits | — | Yes |
| HR — individual pay and personal details (read from Staffing) | — | Yes |
| HR — the Staffing connection | — | Yes |
| Time Studies — studies, trends, quality results | Yes | Yes (records, adopts) |
| Time Studies — labor hours, labor cost per sowing and per day | Yes | Yes |
| Schedule — staff demand, published schedule, coverage | Yes | Yes |
| Training | See, complete assignments | Also publish, version and archive documents |

Admin-only data is fetched and rendered on the server for an admin; it is never serialized to an
operator's client.

## 4. Steps

**O1 — the HR page, and pay out of Farm** — built
- [x] `/farm/staffing` under People; `/farm/payroll`, `/farm/comp` and `/farm/staffing` redirect to it.
- [x] Sections gated by §3, server-side. An operator sees their own clock, shifts, hours and punches
      only; with no matched sign-in, no record is shown. Admin data is loaded only for an admin; the
      Staffing reference, sign-in email and staff notes are withheld from operators on HR and the
      Floor. Until Staffing is connected the admin sections state the details are held there.
- [x] Migration 0060: `farm.staff.staffing_employee_ref`, `farm.payroll_periods` (closed periods,
      totals by account). Migration 0062 drops the staff pay columns. Migration 0063: `staff.email`,
      lowercased, one person per email. The staff form holds full name, work roles, sign-in email,
      Staffing reference, start date and status.
- [x] The Actual ledger's payroll posts from Staffing's closed pay periods: at month end the part of
      each period earned in the month (by hours on the clock, else calendar days) against what sowing
      records charged, the difference to 5170; each period paid on its pay date. With none received
      it posts nothing and notes the uncovered hours. `_engine/payroll.ts` holds hours only.
- [x] The plan-data roster keeps role titles for Training only. The Dashboard People tile shows the
      register, on the clock, hours and open shifts; the operator dashboard shows their own clock and
      hours.
- [x] Tests: the staff document and the hours run carry no pay field; payroll posting from closed
      periods, the month split and the uncovered-hours note (`farm-payroll.test.ts`).

**O2 — Time Studies: per crop plan** — built
- [x] Migration 0061: `farm.time_studies` (crop plan, studied on, sowing size, observer, quality result,
      quality notes, adopted at / by), `farm.time_study_lines` (task, station, staff, elapsed minutes,
      labor minutes, fixed or variable), `farm.time_study_intervals` (re-study days per crop plan).
      Migration 0064: `time_studies.basis`, `estimated` or `observed`. Migration 0066:
      `time_study_lines.stream`, sowing or harvest.
- [x] Seeding: on read, every library crop plan with no study gets an estimated study at its derived
      sowing at the plan's defaults (`source = 'seed'`), idempotent per crop plan under the advisory
      lock. AMK-E-001's is the plan's 14-task time study at its stated sowing size, with no date,
      observer or quality result. Every other crop plan's is built by `_engine/time-study-estimate.ts`
      (pure): the task scaffold off the crop plan's own served components on the two streams — on the
      sowing stream receiving, scaling and mise en place, a prep and a sow per hot component,
      component blackout and stage, and the line turnaround (two people, 15 minutes); on the
      harvest stream a cold assembly per cold component, unit and assemble, seal and label, the
      temperature check at pack, and the load. The common tasks carry the plan's estimate minutes;
      each sow's elapsed minutes come from the stage standard at the plan's point of the range,
      its labor minutes the tended time (the whole run for a high-speed process, an allowance for a
      roast, braise or overnight run; shelf sautés attended and per unit). A component with no
      sow time on file gets the allowance and says so. There is no second blackout, no cold-hold
      line and no end-of-day closedown line. Labelled ESTIMATED and PLACEHOLDER.
- [x] The labor standard (`laborStandard`): the study adopted most recently; with none adopted, the
      crop plan's estimated study stands in. An observed study that is not adopted does not stand in.
      Earlier adoptions stay on the record.
- [x] The Time Studies page (`/farm/time-studies`, under Production): crop plan selector; KPIs (studies
      and the standard's source, labor minutes per unit, labor hours and cost per sowing at the
      derived sowing size, labor cost per rated day, next study due); the log in a ten-row scrolling
      panel with a Basis column and the estimate marked "Stands in"; the selected study's task lines
      and quality result; trend lines of labor minutes per unit and fixed minutes per sowing (one
      point per dated study, hover and keyboard readout, the log as the table); the re-study
      interval; the recording form, starting from the standard.
- [x] An admin approves each observed study (`approve_time_study` on the posting trail); the labor
      standard is the tray-weighted average of the approved studies. Fixed and variable minutes are derived from a study's lines, never typed.
- [x] Labor cost per sowing and per day at the plan's placeholder loaded rate. No individual wage.
- [x] Download the Time Study Sheet (`time-studies/time-study-sheet`, operator-gated, exceljs): Read
      Me, one scaffold block per crop plan with the observer's cells shaded and the standard's minutes as
      reference, the standards on file, the studies on file, the plan's task library; the crop plan open
      on the page listed first. A timed sowing is entered on the page; the sheet is not imported.
- [x] Crop plan costing reads each crop plan's own labor standard (Roadmap N3).
- [x] Tests: `farm-time-studies.test.ts`, `farm-time-study-estimate.test.ts`.
- [ ] `pnpm farm:reseed` resetting the estimated studies. It does not reset them; deleting a
      crop plan's estimated row re-seeds it.
- [ ] Importing a filled sheet back into the log, if timing on paper turns out to be the practice.

**O3 — Schedule: production staff demand** — built; the published schedule waits on O4 transport
- [x] Two weeks of staff demand from the production plans (`_engine/staff-demand.ts`): the order book
      rolled through production with the same `planHorizon` as Production Planning; each crop plan
      staffed from its labor standard on two streams — sowing lines on the production day, a fixed
      line once per sowing and a variable line per unit produced; harvest lines on the distribution
      day, per unit shipped, a fixed line once that day — as people and staff-hours by task and
      station per day. A crop plan with work and no study at all is listed and carries no demand. What
      distributed orders drew from stock is one shared function (`distributedConsumption`).
- [x] The Schedule page shows the demand, a production day per collapsing group, the crop plans staffed
      from an estimate, and the Staffing status (demand prepared, not sent; no published schedule
      received). The operating day and the proposed crews are edited on Capacity; one day on the clock
      is the Day Schedule under Production. The demand document for Staffing is
      `staffDemandDocument` — tasks, stations, people, hours; no positions, no pay.
- [x] Tests: `farm-staff-demand.test.ts`.
- [ ] When Staffing is connected: the published schedule received biweekly, shown against demand as
      coverage by day (`coverageByDay`).

**O4 — the Staffing feeds for People** — contract built; transport gated
- [x] Contract version 1 ([`../staffing-contract.md`](../staffing-contract.md)): punches and staff
      demand and labor demand (Farm → Staffing); published schedule, closed payroll periods, labor
      cost line items per forecast version, the staff-joined notice and the confidential staff
      read-through for admins (Staffing → Farm). Built in Farm: the document schemas, the punches
      builder, the payroll-period and labor-cost readers, coverage by day, handled-once filtering and
      the notice signature (`_engine/staffing-contract.ts`, `_lib/staffing-signing.ts`,
      `farm-staffing-contract.test.ts`).
- [ ] Transport: MicroFarm on its own domain, a MicroFarm account in Staffing, signing secrets,
      endpoints on both sides, a Farm table of handled events.
- [ ] The Staffing side (punch landing, demand intake and position map, a biweekly pay-period close,
      monthly labor pricing from hours, an org-scoped read API, a Farm connection; contract §4). Each
      is a Staffing change Robert approves separately under the Farm scope boundary
      (docs/CLAUDE.md §7).

**O5 — the OS-wide role matrix** — built
- [x] Every page and data class against operator and admin — see, edit, record (§6).
      `_lib/access.ts` holds the admin and operator lists and the staff sign-in match; admin-only
      entries are left out of operators' navigation; admin-only server pages return the notice before
      loading anything, and the financials layout covers the client pages there; Production Planning's
      run economics and by-channel view are admin-only. Tests: `farm-access-guards.test.ts`,
      `farm-role-matrix.test.ts`.
- [ ] A CPA role, working in Staffing. Not built.

## 5. Rules Phase N works under

- Staffing owns positions, wages and burden; Phase N holds no roster positions and no payroll
  burden set.
- N3's labor per crop plan comes from O2's labor standard × the loaded rate (the plan's placeholder
  rate until Staffing prices it).
- N4's labor cost for a forecast comes back from Staffing as line items (`staffing.labor_cost`,
  O4); until connected it uses the plan placeholder.

## 6. The role matrix

| Page | Operator | Admin |
|---|---|---|
| Dashboard | The operator dashboard: production, cold chain, supply, sustainability, distribution, their own clock and hours; no company financials, no one else's staff data | The Admin Dashboard: all of it, financials and people included, supplier-bill alerts |
| Sources | See | See, register and edit |
| Crop plans, Equipment, Packaging | See (unit costs included) | See and edit |
| Production Planning, Day Schedule, Compare, Calendar, Process | See, close sowing records; no run economics or by-channel view | All |
| Capacity | See | See |
| Floor | Record: receive, close sowings, ship, punches | Record; link to Actuals |
| Unit Economics, Profit & Loss, Balance Sheet, Cash Flow, Ledger, Plan v Actual, Actuals, Receivables (and invoices), Payables, Capital & Financing | — (not in navigation; the page shows "Admins only") | All |
| Inventory, Produce Safety | See, record | See, record |
| Procurement | See, receive against a purchase order | See, edit, receive |
| Suppliers | See | See, edit |
| Sustainability (every page but Facility) | See, enter | See, enter |
| Sustainability · Facility (the Design and Build plan, footprints, space, conformance, layout, normalizers) | Admins only | See, edit footprints, draw and save layouts |
| Time Studies | Studies, trends, quality results, labor hours and cost per sowing and per day | Also records and adopts studies |
| HR | Their own record: clock, shifts, hours, punches (matched by sign-in email) | Everyone's, plus payroll totals, pay and personal details (from Staffing), the Staffing connection |
| Schedule | Staff demand, coverage | Same |
| Training | See, complete assignments | Also publish, version and archive documents |
| Sales Portal, CRM, Parent Admin, Parent Portal | See, work the CRM | Same |
| Subscribers, Orders | See, contract prices included | See and edit |
| Pickup Points & Routes, Reports | See | See |
| Forecasts | Open, edit, save and delete their own | Also set the plan of record |

The portals' access rules are in [`portals-roadmap.md`](portals-roadmap.md).
