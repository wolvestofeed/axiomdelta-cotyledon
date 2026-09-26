# Impact OS — ToDo

Open one-off items and open questions not in a Roadmap phase.

## Open questions for Robert
- [ ] **The operating day.** Not stated; research decides it. 07:00–19:00 is the two-shift
      PLACEHOLDER and opening runs one shift on smaller demand. It sets the plant's cycles per day.
      Staffing is not an input to it: the plan derives the labor it needs and proposed crews are
      checked against that (Capacity, Schedule, Production Planning). Robert: the Phase 1 floor day
      is likely shorter while the order book is built, with 07:00–19:00 still possible; evening
      workshops and events are booked in the open hours and their revenue is booked against the fixed
      cost of those hours. No figures stated; nothing is built until they are.
- [ ] **Adult protein serving per meal.** The protein serving leads: recipe development states the
      ounces of chicken, beef or beans an adult meal serves; with no spec the target defaults by type,
      meat 6 or 8 oz, plant-based 4–6 oz (Robert). AMK-A-002 … 011 carry the low end as a PLACEHOLDER
      `proteinTargetOz` (meat 6, plant 4), the protein multiplier DERIVED from it, and vegetables × 1.6
      (PLACEHOLDER). Stated servings go in `ADULT_PROTEIN_SPEC_OZ` (`_data/recipes-menu.ts`), then
      `pnpm muse:reseed`. To decide: which meat meals are 8 oz; which meals are lighter (the chicken
      salad is named; 14 oz plated against 16 oz); whether the enchilada casserole's cheese counts as
      its protein with the pinto beans.
- [ ] **Hold life default.** The plan of record carries 7 days (Food Code 3-502.12(D)(c), the current
      capability); `plan-data.ts` still defaults to 30, the 34°F-room path documented on the Facility
      Design and Build plan. Whether the default moves to 7 or stays 30 for demo forecasts is open.
- [ ] **The tumble chiller and the pump fill station: Phase 1 or Phase 2?** Both sit on Phase 2, so
      Phase 1 is blast-chill-and-hold on two cabinets and a chill cabinet. The tumble chiller is 179.5
      sq ft of envelope with its clearances, the second-largest space decision in the plant
      (facility-design-roadmap §11 finding 2).
- [ ] **Does the ghost kitchen share the commissary shell?** Phase 3 adds about 136 sq ft of production
      floor and 9.6 linear feet of Type I hood for fry, griddle and charbroiler — a different hood, a
      different suppression zone, a different rhythm. Commissary shell 7,422 sq ft without it, 7,571
      with. To weigh against a second small lease (facility-design-roadmap §11 finding 4).
- [ ] **Facility square footage: the stated 5,000 still feeds the leasehold and the normalizers.** The
      derived building gross is 6,077 / 7,422 / 7,571 sq ft by phase and is shown beside the stated figure
      on the Facility page's Normalizers tab. Reconnecting the leasehold rates, the rent placeholder and
      the intensity metrics to it is Roadmap Q4/Q5, deferred 2026-09-17.
- [ ] **IP / licensing position** (source doc 09) — governs any ownership or attribution copy. None is
      written until a position is chosen.
- [ ] **Weekend retail service.** The retail test service runs Monday to Friday, one recipe per
      production day; no weekend service is on file.

- [ ] **Two recipes carry the capacity mean and neither is verified.** AMK-E-005 chicken salad sits at
      0.18 lb chilled per portion and is the only recipe on the menu bound by the skillet rather than
      the chiller — confirm whether a cold salad passes through a cabinet at all. AMK-E-009 pulled pork
      carries a cook-to-chill of 0 minutes with a thermal gap, which is missing data. Those two alone
      carry the library mean from 1,478 to 2,070 portions/day; until they are confirmed the benchmark
      stands at ~1,450–1,500 (facility-design-roadmap §9).
- [ ] **PSM: does 1,500 dispatch as one wave?** The facility support program is sized at Peak Single
      Meals 1,500, the conservative read. A day split across two dispatches lowers PSM and shrinks dry
      storage, warewash and the dock (facility-design-roadmap §7).

## Held out of the platform on purpose
- [ ] **The 1,500 meals/day Phase 1 capacity target is a placeholder** and is not a demand or capacity
      input anywhere: not `capacityInputs`, not `phases[].mealsPerDay` (1,000, demand). Its one home is
      `SUPPORT_PROGRAM_PSM`, the Peak Single Meals figure that sizes the facility's support program and
      nothing else.

## Quotes to get
- [ ] **Equipment: the models on Facility are not selections and the costs on Equipment are not theirs.**
      Every unit cost is the capex tab's working figure. The manufacturer, model and spec sheet on each
      row (Facility · Footprints) are representative units chosen for dimensions, not selected or priced
      equipment. A selected model and its quote replace both, row by row.
- [ ] **Exhaust hood and fire suppression, and HVAC and makeup air.** Both leasehold lines were
      authored 2026-09-10 before any equipment run was laid out: $92,000 and $78,000. The derived hood
      run is 12.8 / 28.8 / 38.4 linear ft by phase (Facility · Space). Re-quote both against a length,
      and makeup air against the exhaust CFM that length implies (facility-design-roadmap §11 finding 6).
- [ ] **A foodservice designer's block plan.** The derived figures put equipment at 42% of the
      production floor against the one published rule of thumb of 30%; at 30% the shell would be nearer
      8,700 sq ft. Until a designer's plan exists the §8 figures are the tight end of a range
      (facility-design-roadmap §11 finding 7).
- [ ] **Mechanical and electrical room area.** No published foodservice allowance exists for it, so it
      is excluded from the derived building gross entirely. It is not zero; it has to come from an MEP
      engineer (facility-design-roadmap §13).

## Data to enter
- [ ] **The current school's term dates on Customers** (Roadmap N4a). With no term on file the site
      serves every weekday the kitchen is open (125 × 261 = 32,625 meals a year). The term and its
      breaks are the school's own calendar; nothing is entered in their place.
- [ ] **Packaging costs in the packaging library.** The bowl, lid and label carry no cost, so every
      recipe that picks them (AMK-E-002) shows $0.00 packaging until a manual cost or a supplier catalog
      price is entered.
- [ ] **Observed time studies** (Roadmap N3). Every recipe's study is the seeded estimate, so the cost of
      a meal, the P&L and the ledger's standard labor are estimates until an observed study, timed at the
      recipe's derived batch, is adopted.
- [ ] **Cook-time gaps** (culinary-operations.md §5): black and pinto beans, roasted zucchini,
      AMK-E-001's roasted vegetables and salsa roja, and the steps with no time (marinara vegetable
      roast, enchilada pre-roast and assembly, pork shredding). Each gap is listed on Recipes; a step
      before a cook makes that recipe's time to the chiller longer than shown.
- [ ] **Ingredient prices.** Ten of twelve are placeholders; two are cited (ground beef USDA Q2 2026;
      pinto beans WebstaurantStore). Quotes replace them before anything leaves the building.
- [ ] **Menu data not on the baseline sheet.** Yields for green beans, carrots, fajita vegetables (1.0
      carried); cooked cup weights for every vegetable and fruit line (working figures); every price
      except beef and pinto beans; the summed component yields against the sheet's stated totals
      (validation-notes §6).
- [ ] **Payment terms** for the test customers and for the suppliers linked to recipe lines. None are on
      file, so the forecast settles every trade balance on its document date and invoices cannot be
      issued.
- [ ] **The first pay period's start date.** Pay periods run Monday through the second Sunday, paid the
      Friday after (STATED); the first Monday is 2027-01-04 (PLACEHOLDER,
      `payrollCalendar.firstPeriodStart`). It moves the year-end payroll accrual.

## Menu and crediting
- [ ] **The grade group against the district contract.** 9-12 is carried as a PLACEHOLDER from what the
      authored quantities credit. If the contract is K-5 or 6-8 the bowl over-delivers and the portion
      has headroom.
- [ ] **Serving vessel capacity** is a 16 oz PLACEHOLDER — the physical bound on plated weight; a
      packaging quote replaces it.
- [ ] **The portioning utensil** is not specified. A standardized recipe states it by size (scoop number,
      ladle or spoodle ounces); the production record and portion control need it.
- [ ] **The corporate and ghost-kitchen portion factor** (1.5×, STATED) scales the base plated portion
      to 18.5 oz.
- [ ] **Vegetable subgroup for the roasted blend.** Red peppers and winter squash are red/orange; summer
      squash and green peppers are other. The blend splits across two subgroups once it is fixed; its
      cooked cup weight (175 g) and yield (0.82) are unsourced until a pan is weighed.
- [ ] **The beans' crediting election.** In AMK-E-001 the beans credit as M/MA and forfeit the legume
      vegetable credit (7 CFR 210.10(c)(2)(ii)(C)). The election is on the line and moves both the M/MA
      and the vegetable totals.
- [ ] **Bean yield** — drained (1.979) or held with liquid (2.4: more chilled mass, a smaller batch).
      One weighed, drained batch settles it.

## Accounting
- [ ] Planned maintenance and sanitation downtime in normal capacity is a 3% PLACEHOLDER.
- [ ] Loan payments and marketplace deposits out of processor clearing (1200) post in the engine
      (`_engine/actuals.ts`); no table or recording form for them exists on Actuals.
- [ ] Sending an invoice by email is not connected (no mail account).
- [ ] Parent Pay prepayments per meal / week / month at participating schools — deferred (Robert,
      2026-09-14).

## CompTable link
- [ ] **`comptable.staff_joined` has no transport.** The kind, the document schema and
      `handleStaffJoined` are built and tested; delivery waits on the gated items in
      `comptable-contract.md` §3 — Muse on its own domain, the Muse Kitchen account in CompTable,
      signing secrets, the endpoints both sides, and the handled-event ledger. Onboarding fires from an
      admin adding a person in Muse, through `onStaffJoined`.

## Suppliers
- [ ] Full TDA Farm Fresh pull via the ArcGIS endpoint (in the TDA extract) for per-producer product
      availability, delivery range and fees, and school-selling detail; only the Austin-metro producer
      names and coarse type are encoded. The generator ingests it.
- [ ] Re-run `pnpm muse:suppliers` whenever the source exports are refreshed (data-as-of dates).
- [ ] The catalog column set follows a standard wholesale sheet; review it against a real grower price
      sheet before the first live import.
- [ ] Equipment & Rebates vendor / manufacturer picker. Not built: no vendor directory exists and
      supplier names are not invented (CLAUDE.md §1, §5). It is one `KINDS` entry plus a mapper in
      `_lib/entity-directory.ts`.

## Sustainability
- [ ] Exercise the evidence-pack download and the streamed file route on the Vercel preview; confirm the
      17 MB workbook serves within the platform's response limits.
- [ ] A Vercel Blob token for in-app uploads above ~4.5 MB (S2b).
- [ ] Verify before any factor moves from `[UNCONFIRMED]` to `[SOURCED]`: eGRID ERCT data year and
      release; WARM v15 food-waste landfill (+0.68) and compost (−0.18) factors against the organics PDF;
      the four AIM Act thresholds against 40 CFR 84 Subpart C; R-404A AR4 exchange value (Subpart A);
      current-FY Austin Water unit charges; GreenChill certification criteria.
- [ ] Agribalyse: licence terms and download access before it enters the factor library.
- [ ] A NOAA station, if degree-day normalization is wanted (optional).

## Reports
- [ ] Print/PDF one-page pro-forma export (the repo has `docx` + `exceljs`). The library exports XLSX per
      section and per report (2026-09-18); print and PDF are still open.
- [x] An Export button on the module pages (Robert, 2026-09-18) — built the same day: *Export page — XLSX* in the page
      header's right column exports every page as rendered.
- [ ] Plan v Actual on the library reads the current calendar quarter; a period picker on the report is open.

## Launch-time steps (at subdomain attach)
- [ ] Attach `muse.getcomptable.com` in Vercel (Muse deploys from `main`).
- [ ] Confirm the `proxy.ts` host-rewrite approach (rewrite host → `/muse`, close bare-domain `/muse`) or
      keep the `/muse` path form; if the rewrite, add it in `proxy.ts`.
- [ ] Confirm the admin and operator lists in `_lib/access.ts` and the staff register's sign-in emails.
