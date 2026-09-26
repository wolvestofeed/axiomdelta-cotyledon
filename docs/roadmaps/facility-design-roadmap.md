# BUILD PLAN — Facility design: footprint, layout and the shell size

Roadmap Phase Q. Derives the minimum facility the equipment library requires, from the library's own
rows and its own build-phase split. Depends on Phase N1 (the equipment library,
[`operating-model-roadmap.md`](operating-model-roadmap.md) §2.1) and feeds the leasehold schedule and
the sustainability normalizers.

---

## 1. Scope

1. **The equipment list is the input; the square footage is the output.** No facility size is assumed.
   The answer is derived from the 60 rows of `farm.equipment`, their footprints, their published
   clearances and the aisle standards that serve them.
2. **Two boundaries are reported, never merged.** The **production floor** is equipment plus the
   aisles and clearances that make it workable in facility alignment. The **building gross** adds
   receiving, storage, warewash rooms, office, staff spaces, trash and the structure.
3. **The build phases are cumulative, because the shell is leased once.** Phase 1, Phase 1+2 and
   Phase 1+2+3 are reported as cumulative requirements. The figure that sizes a lease is the
   Phase 1+2+3 number; the Phase 1 number states how much of it is carried idle at open.
4. **Every figure carries a basis.** A footprint is SOURCED when it comes off a named model's spec
   sheet, PLACEHOLDER otherwise. A standard is CODE when a section can be cited, GUIDANCE when it is
   a published rule of thumb. Nothing here is a designer's block plan or a landlord's rentable area.
5. **Out of scope:** mechanical and electrical room area (no published foodservice allowance exists —
   §11), rentable-vs-usable load factor, pickup point work, parking and dock apron beyond the dock itself.

## 2. Decisions

1. **Footprints are sourced.** Every row with floor reads its width, depth and published clearances
   off a named representative model's spec sheet (re-sourced 2026-09-17, decision 16); rows without
   floor say why. The 20 units the plan first sourced were the grow and cold-chain majors; tables,
   sinks, racks, carts and the a la carte line followed.
2. **The analysis lands in the OS, not only in this document.** Footprint and clearance become open
   fields on `farm.equipment` — the same pattern as `sowing_capacity_lb` — and a Facility page computes
   the requirement from the library, so the number moves when a phase, quantity or status is edited.
3. **Both boundaries are reported separately** (§1.2), because the gap between them is the finding.
4. **Cumulative phasing, with the idle carry named** (§1.3).
5. **Phase 1 production capacity target: 1,500 mixed-crop-plan units a day — a verbal placeholder,
   deliberately NOT wired to the platform**. It is the planning figure this
   document sizes the support program against, and nothing else. It is not entered in
   `plan-data.ts`, not in `capacityInputs`, not in `phases[].unitsPerDay`, and no engine reads it.
   `phases[].unitsPerDay` still holds 1,000, which is the Phase 1 *demand* assumption — a different
   quantity the capacity engine has never read. Neither figure is to be reconciled to the other until
   Robert says to make the switch; a future editor who "fixes" one to match the other has broken this
   decision.
6. **Both blackout racks move to Phase 1**. The build-out split held one back
   for Phase 2. Two racks at Phase 1 is a concurrency decision, not a capacity decision — see 7.
7. **Units of a grow unit are parallel streams, not a bigger sowing**. Two blast
   blackout racks do not make a 400 lb sowing; they make two 200 lb sowings that can run different crop plans,
   staggered. A sowing is bounded by ONE rack, one shelf, one sprouting rack. This corrects a defect in
   the engine, recorded as a finding (§11, finding 8) rather than acted on — this build plan changes
   no code.
8. **Seven days is the current shelf life and thirty days stays on the table**.
   The equipment on the Phase 1 list distributes a 7-day hold under Food Code 3-502.12(D)(c); that is the
   current operational status, not an error to be corrected. The 30-day path is retained as a build-out
   option because it may be what gets built. The two are carried side by side as the plan of record and
   a saved forecast (§10.8) — the earlier confusion between them dates from before the actual-versus-
   planned separation was settled in the platform.
9. **The 5,000 sq ft in `plan-data.ts` is a verbal approximation, not a constraint.** It was a
   spoken estimate, tagged STATED only because Robert said it. It plays no part in this derivation
   and is not compared against it. This build plan is the first evidence-based figure for the shell,
   and it supersedes that input (§11, finding 5).
10. **The Facility page is the existing Sustainability · Facility page, admin-only, with a top tab bar**
   . `/farm/sustainability/facility` carries six panels — Design & Build plan,
    Footprints, Space, Conformance, Layout, Normalizers — and the sidebar entry is "Facility", visible to
    admins only. No new route.
11. **Footprints are edited on the Facility page, not on Equipment**. The fields
    live on `farm.equipment` (one definition) and the Equipment page is unchanged.
12. **The potential rooms are documented on the Facility Design and Build plan and nowhere else**
   . The 34°F hold room and the conditioned packaging room are documented with
    their area, cost, impact and risk on the plan (`_data/facility-design.ts` `DESIGN_ROOMS`), shown on
    the Design & Build plan tab, and what each would add to the shell is computed live from its geometry.
    They are **not** equipment rows, **not** forecasts, **not** scenario inputs and never enter the Plan
    or Actual ledger. This supersedes the entry specification in §10.8 (kept for the record, marked).
    Robert's words: "we may build a packaging room, we may not. We may build a freezer room, but probably
    not for Phase 1, if at all" — the "freezer room" is read as the 34°F hold room the plan carries as
    Option A, and the plan says so.
13. **The engine is the source of truth for every figure** (agreed 2026-09-17). Where this document's
    hand-rounded arithmetic and `_engine/facility.ts` differ by rounding, the document is restated to
    the engine; the golden-value tests carry the tolerance. The hood rule is stated exactly: one canopy
    run per build phase's hot units, Σ widths + 6 in overhang at each open end (IMC §507.4.1), which
    restates the hood to 12.8 / 28.8 / 38.5 linear ft.
14. **Q4 and Q5 are deferred**. The leasehold schedule, the rent placeholder and the sustainability normalizers
    still read `facility.sizeSqFt`; the derived figure is shown beside it on the Normalizers tab.
16. **Real spec-sheet dimensions, held on the equipment table and shown on Facility only**. `farm.equipment` is the one source of truth and carries every footprint and spec-sheet
    column — width, depth, clearances, basis, zone, hood, source, manufacturer, model, spec-sheet link
    (migrations 0076, 0079). Different pages show different columns: the Equipment page in Production
    shows none of them; the Facility page's Footprints tab shows and edits all of them. Nothing is
    duplicated between the two. **The named models are representative units chosen by the agent for
    their dimensions, without Robert's selection. None is a selected or priced model, and the unit costs
    on Equipment are the capex tab's working figures, unrelated to them.** A selected model and its
    quote replace both, row by row (ToDo, Quotes to get).
15. **The scenario is scripted**. `pnpm farm:facility-scenario` sets the plan of
    record's `blackoutShelfLife` to 7 through the same mechanism as the OS — the config saved on the
    scenario row, the change posted to the trail as `set_plan_of_record` — creating the scenario when
    none is set.

## 3. The method — five layers

Each layer is a stated operation on the layer above it, so any figure can be traced back to a
spec sheet or a cited standard.

| Layer | What it is | How it is computed |
|---|---|---|
| **A — equipment envelope** | The plan area the units themselves occupy | Unit footprint (width × depth ÷ 144) × quantity, summed |
| **B — zone gross** | Layer A made workable: the aisle and service clearance each zone needs | Layer A × a zone circulation factor derived as (equipment depth + aisle width) ÷ equipment depth (§6), **except** where a manufacturer publishes its own clearances, which are used directly |
| **C — production floor** | Layer B plus the main cart route through the plant | Layer B + a 5 ft circulation spine (§6) |
| **D — support program** | The rooms no equipment row describes: dock, dry and chemical storage, warewash rooms, office, staff spaces, trash | Program allowances, mostly DoD Space Planning Criteria Ch. 510 at PSM 1,500, × 1.40 net-to-department-gross (§7) |
| **E — building gross** | The enclosed shell | (Layer C × 1.10 for walls, columns and partitions) + Layer D |

Layer C already carries its own circulation, so it takes only the 1.10 structural gross-up; Layer D is
true net area and takes the published 1.40 net-to-gross factor.

## 4. The standards, and which of them are actually code

Named so that a mandatory requirement is never confused with a convention.

| # | Figure | Status | Authority |
|---|---|---|---|
| 1 | Hood canopy overhangs the growing surface by **6 in on all open sides**; front lip no more than 4 ft above the surface | **CODE** | International Mechanical Code §507.4.1 (§507.1.6.1 in some editions). A UL 710 listing's own overhang governs over this baseline. |
| 2 | Accessible route clear width **36 in**, narrowing to 32 in for runs up to 24 in | **CODE** | 2010 ADA Standards §403.5.1; ICC A117.1 §403.5.1 |
| 3 | Egress aisle not less than **36 in**; nonpublic aisles serving fewer than 50 need not exceed 28 in | **CODE** | IBC §1018.2.2 |
| 4 | Corridors **44 in**, or 36 in where occupant load is under 50 | **CODE** | IBC Table 1020.3 |
| 5 | Walk-in envelope minimum **R-25** | **CODE** | 10 CFR 431 Subpart R |
| 6 | Aisles must have sufficient safe clearance where mechanical handling is used — **no number is given** | **CODE**, performance only | 29 CFR 1910.176(a) |
| 7 | Single aisle with protruding equipment **54 in**; double aisle with protruding equipment 72 in; single aisle, limited equipment 36 in; double 54 in; little traffic 48 in; major traffic 72 in | GUIDANCE | UC Berkeley UHS Dining Design Guidelines, Space Requirements appendix |
| 8 | Traffic aisle where mobile equipment travels **4 ft**; between two work tables 3.5 ft; between shelving 4 ft minimum; 4 linear ft of work table per production employee | GUIDANCE (dated) | USOE, *Design Criteria: Prospect Food Service Facilities*, 1973 |
| 9 | Personnel with carts need about **40 in** of aisle clearance | GUIDANCE | Foodservice Equipment Reports |
| 10 | Equipment occupies about **30%** of a farm's area | GUIDANCE, **single source, uncorroborated** | Thibodeaux, *Restaurant Design: Concept to Subscriber* |
| 11 | **2 in** clearance around walk-in panel exteriors; top-mount systems 4 in above and 24 in each side; remote condenser 12 in minimum (18 preferred) at the coil face and 24 in at the service end | GUIDANCE (manufacturer installation requirements) | U.S. Cooler, Master-Bilt |
| 12 | Walk-in interior clear is roughly nominal minus twice the panel thickness (about 8 in per dimension at 4 in panels); some makers size to nominal, others to actual | GUIDANCE | U.S. Cooler, Norlake |
| 13 | Rack conveyor dishwasher needs **20 in service clearance on both long faces**; total line length including load and unload tables is **not published by any manufacturer** | GUIDANCE | Hobart CL44eN and CLPS76eN spec sheets; Champion 80 PRO-HD |
| 14 | Farm area per unit: 0.9 sq ft at 1,000–2,000 units/day (1973, reheat era) vs about 1.0 sq ft per unit for fresh production, with fresh prep needing roughly twice a heat-and-serve farm | GUIDANCE, sources differ by up to 5× | USOE 1973; Marshall / The Marshall Associates |
| 15 | Food service net-to-department-gross factor **1.40**; program allowances by Peak Single Units | GUIDANCE here (mandatory on federal projects) | DoD Space Planning Criteria Ch. 510, 2015 |

Two corrections worth carrying, because both are repeated constantly in trade material and both are
wrong: **NFPA 96 does not state the 6 in hood overhang** — its Chapter 5 is performance language and
the 6 in figure is IMC; and **OSHA does not require a 3 ft or 4 ft aisle** — 1910.176(a) has no number
in it.


## 5. The equipment footprint table

Every row of the equipment library, in its build phase as of the decisions in §2 — both blast
blackout racks at Phase 1, which is why the library reads 59 rows here against the 60 the code split
produces today. `Ph` is the build phase the split
assigns the row, `Unit sq ft` is one unit's plan area, `Line sq ft` is that times the quantity. A dot
(**·**) marks a row flagged critical in the library. Rows with no footprint are bench-mounted, stored
on shelving, overhead, or a vehicle — they carry no incremental floor, and the note says which.

| # | Item | Ph | Qty | Unit sq ft | Line sq ft | Zone | Basis | Footprint source |
|---|---|---|---|---|---|---|---|---|
| 1 | Steam-jacketed tilting sprouting rack, 100 gal **·** | 1 | 1 | 15.58 | 15.58 | Hot line | SOURCED | Cleveland KEL-100-T, 51 x 44 in |
| 2 | Steam-jacketed tilting sprouting rack, 60 gal **·** | 2 | 1 | 16.20 | 16.20 | Hot line | SOURCED | Cleveland KGL-60-T, 49-3/8 x 47-1/4 in |
| 3 | Tilting braising pan / shelf, 40 gal **·** | 1 | 1 | 14.67 | 14.67 | Hot line | SOURCED | Cleveland SGL-40-TR, 48 x 44 in |
| 4 | Tilting braising pan / shelf, 40 gal **·** | 2 | 1 | 14.67 | 14.67 | Hot line | SOURCED | Cleveland SGL-40-TR, 48 x 44 in |
| 5 | Jar stand oven, full size 20-pan **·** | 1 | 1 | 13.02 | 13.02 | Hot line | SOURCED | Rational iJarStand Pro 20-full, 42-5/8 x 44 in total |
| 6 | Jar stand oven, full size 20-pan **·** | 2 | 1 | 13.02 | 13.02 | Hot line | SOURCED | Rational iJarStand Pro 20-full, 42-5/8 x 44 in total |
| 7 | Convection oven, double stack | 2 | 1 | 11.50 | 11.50 | Hot line | SOURCED | Vulcan VC44ED, 40-1/4 x 41-1/8 in |
| 8 | Vertical cutter mixer, 45 qt | 1 | 1 | 8.53 | 8.53 | Prep | SOURCED | Hobart HCM450, 36-1/8 x 34 in |
| 9 | Buffalo chopper / food processor | 1 | 1 | — | — | — | PLACEHOLDER | Bench-mounted on a prep table; no incremental floor |
| 10 | Planetary mixer, 80 qt | 2 | 1 | 8.70 | 8.70 | Prep | SOURCED | Hobart HL800, 27-1/4 x 46 in; the bowl swings out to 60-3/16 in, carried as 14-3/16 in front clearance |
| 11 | Commercial slicer | 1 | 1 | — | — | — | PLACEHOLDER | Bench-mounted on a prep table; no incremental floor |
| 12 | Stainless prep tables, 8 ft | 1 | 3 | 20.00 | 60.00 | Prep | SOURCED | Advance Tabco TTS-308, 96 x 30 in |
| 13 | Stainless prep tables, 8 ft | 2 | 3 | 20.00 | 60.00 | Prep | SOURCED | Advance Tabco TTS-308, 96 x 30 in |
| 14 | Prep sinks, 3-comp and 2-comp | 1 | 2 | 17.63 | 35.25 | Prep | SOURCED | Advance Tabco 94-3-54-24RL (103 x 27 in) and 94-2-36-24RL (85 x 27 in), one of each, averaged to 94 x 27 in |
| 15 | Blackout rack, 200 lb capacity **·** | 1 | 2 | 9.97 | 19.93 | Grow | SOURCED | Traulsen TBC13 (supersedes RBC200), 41 x 35 in, 200 lb rated |
| 16 | Tumble blackout rack / ice water bath system **·** | 2 | 1 | 63.29 | 63.29 | Grow | SOURCED | Cleveland P-TC-220 vertical tumble blackout rack, 98 x 93 in. Published clearances 60 in front, 24 in rear, 12 in one side and 36 in the electrical side (carried as 24 in each side) |
| 17 | Grow pump fill station **·** | 2 | 1 | 7.33 | 7.33 | Grow | SOURCED | Cleveland MFS Metering Filling Station, 48 x 22 in |
| 18 | Casing handling, blackout carts **·** | 1 | 1 | 15.28 | 15.28 | Grow | SOURCED | Cres Cor R-171-SUA-20E BlackoutTemp two-door mobile refrigerated rack, 62 x 35-1/2 in |
| 19 | Tray sealer, semi-automatic **·** | 1 | 1 | 14.99 | 14.99 | Packaging | SOURCED | Ilpra FoodPack Synergy, 1280 x 1088 mm |
| 20 | Date and lot coder, inkjet **·** | 1 | 1 | — | — | — | PLACEHOLDER | Mounts on the sealer or its conveyor; no incremental floor |
| 21 | Vacuum packaging machine, chamber **·** | 1 | 1 | 21.35 | 21.35 | Packaging | SOURCED | VacMaster VP800 double chamber, 75 x 41 in |
| 22 | Label printer / applicator | 1 | 1 | — | — | — | PLACEHOLDER | Bench-mounted; no incremental floor |
| 23 | Label printer / applicator | 2 | 1 | — | — | — | PLACEHOLDER | Bench-mounted; no incremental floor |
| 24 | Packaging tables, stainless | 1 | 3 | 20.00 | 60.00 | Packaging | SOURCED | Advance Tabco TTS-308, 96 x 30 in |
| 25 | Walk-in cooler, 12x20, with refrigeration **·** | 1 | 1 | 240.00 | 240.00 | Walk-in | SOURCED | Nominal 12 x 20 ft from the item name; door on the 12 ft wall |
| 26 | Walk-in cooler, 10x12, with refrigeration **·** | 2 | 1 | 120.00 | 120.00 | Walk-in | SOURCED | Nominal 10 x 12 ft from the item name; door on the 10 ft wall |
| 27 | Walk-in freezer, 10x12, with refrigeration **·** | 1 | 1 | 120.00 | 120.00 | Walk-in | SOURCED | Nominal 10 x 12 ft from the item name; door on the 10 ft wall |
| 28 | Walk-in freezer, 8x10, with refrigeration **·** | 2 | 1 | 80.00 | 80.00 | Walk-in | SOURCED | Nominal 8 x 10 ft from the item name; door on the 8 ft wall |
| 29 | Reach-in refrigerator, 2-door | 1 | 2 | 11.09 | 22.18 | Cold storage | SOURCED | True T-49-HC two-section reach-in, 54-1/8 x 29-1/2 in |
| 30 | Reach-in refrigerator, 2-door | 2 | 2 | 11.09 | 22.18 | Cold storage | SOURCED | True T-49-HC two-section reach-in, 54-1/8 x 29-1/2 in |
| 31 | Mobile refrigerated holding rack **·** | 1 | 3 | 7.35 | 22.05 | Cold storage | SOURCED | Cres Cor R-171-SUA-10E BlackoutTemp single-door mobile refrigerated rack, 28-5/16 x 37-3/8 in |
| 32 | Mobile refrigerated holding rack **·** | 2 | 3 | 7.35 | 22.05 | Cold storage | SOURCED | Cres Cor R-171-SUA-10E BlackoutTemp single-door mobile refrigerated rack, 28-5/16 x 37-3/8 in |
| 33 | Rack conveyor dishwasher + booster **·** | 1 | 1 | 15.57 | 15.57 | Warewash | SOURCED | Champion 80 PRO-HD, 84 x 26-11/16 in |
| 34 | Pot sink, 3-comp with drainboards | 1 | 1 | 27.34 | 27.34 | Warewash | SOURCED | Advance Tabco 94-43-72-24RL, three 24 x 24 in compartments and two 24 in drainboards, 127 x 31 in |
| 35 | Hand sinks and mop sink | 1 | 6 | 1.83 | 10.96 | Warewash | SOURCED | Lot of 6: five Advance Tabco 7-PS-60 wall-hung hand sinks, 17-1/4 x 15-1/4 in each (the unit carried), and one 9-OP-40 floor mop sink, 25 x 21 in |
| 36 | Sanitation cart, chemical dispensing | 1 | 1 | 7.37 | 7.37 | Warewash | SOURCED | Rubbermaid FG9T7200 high-capacity janitor cart, 48-1/4 x 22 in |
| 37 | Wire shelving and dunnage racks | 1 | 1 | — | — | — | PLACEHOLDER | Lives in dry storage; that room is sized by program allowance |
| 38 | Wire shelving and dunnage racks | 2 | 1 | — | — | — | PLACEHOLDER | Lives in dry storage; that room is sized by program allowance |
| 39 | Sheet pans, hotel pans, cambros, smallwares | 1 | 1 | — | — | — | PLACEHOLDER | Stored on the shelving above; no incremental floor |
| 40 | Sheet pans, hotel pans, cambros, smallwares | 2 | 1 | — | — | — | PLACEHOLDER | Stored on the shelving above; no incremental floor |
| 41 | Scales, receiving and unit **·** | 1 | 3 | — | — | — | PLACEHOLDER | Bench and dock-mounted; no incremental floor |
| 42 | Scales, receiving and unit **·** | 2 | 3 | — | — | — | PLACEHOLDER | Bench and dock-mounted; no incremental floor |
| 43 | Thermometers, dataloggers, calibration kit **·** | 1 | 1 | — | — | — | PLACEHOLDER | No floor |
| 44 | Insulated transport carts **·** | 1 | 6 | 3.13 | 18.75 | Harvest | SOURCED | Cambro UPC400 Ultra Pan Carrier, front loading, 18 x 25 in |
| 45 | Insulated transport carts **·** | 2 | 6 | 3.13 | 18.75 | Harvest | SOURCED | Cambro UPC400 Ultra Pan Carrier, front loading, 18 x 25 in |
| 46 | Refrigerated distribution van **·** | 1 | 1 | — | — | — | PLACEHOLDER | Vehicle. Dock and parking, not enclosed building area |
| 47 | Network, temperature monitoring, cameras **·** | 1 | 1 | — | — | — | PLACEHOLDER | IT closet; inside the support program |
| 48 | Terminals, tablets, label printers | 1 | 1 | — | — | — | PLACEHOLDER | Bench-mounted; no incremental floor |
| 49 | Hot holding racks, insulated | 2 | 4 | 6.54 | 26.15 | Harvest | SOURCED | Cres Cor H-137-UA-12D insulated holding rack, 28-3/4 x 32-3/4 in |
| 50 | Restaurant transport, chafing, beverage | 2 | 1 | — | — | — | PLACEHOLDER | Lot; stored on shelving in wares storage |
| 51 | Refrigerated distribution van, second | 2 | 1 | — | — | — | PLACEHOLDER | Vehicle. Dock and parking, not enclosed building area |
| 52 | Buffet and action station equipment | 2 | 1 | — | — | — | PLACEHOLDER | Lot; stored on shelving in wares storage |
| 53 | Fry station, double vat | 3 | 1 | 7.46 | 7.46 | A la carte | SOURCED | Pitco SG14-2FD Solstice two-vat floor fryer with filter drawer, 31-1/4 x 34-3/8 in |
| 54 | Griddle / plancha, 36 in | 3 | 1 | 7.88 | 7.88 | A la carte | SOURCED | Vulcan MSA36 heavy-duty countertop griddle on an equipment stand, 36 x 31-1/2 in |
| 55 | Charbroiler and salamander | 3 | 1 | 6.81 | 6.81 | A la carte | SOURCED | Vulcan VCCB36 radiant charbroiler on a stand, 36 x 27-1/4 in; salamander wall-mounted above |
| 56 | A la carte line refrigeration units | 3 | 2 | 10.46 | 20.91 | A la carte | SOURCED | True TWT-48-HC two-section worktop refrigerator, 48-3/8 x 31-1/8 in |
| 57 | Heated expo and pickup shelving | 3 | 1 | 8.13 | 8.13 | A la carte | SOURCED | Hatco GRS-60-I Glo-Ray free-standing heated shelf, 60 x 19-1/2 in |
| 58 | Hood extension for the line | 3 | 1 | — | — | — | PLACEHOLDER | Overhead; no floor. Drives hood linear feet through the units under it |
| 59 | POS and distribution integration hardware | 3 | 1 | — | — | — | PLACEHOLDER | Bench and wall-mounted; no incremental floor |
**Layer A totals — equipment envelope only, no aisle:** Phase 1 **701.6 sq ft** · cumulative through
Phase 2 **1,185.4 sq ft** · cumulative through Phase 3 **1,236.6 sq ft**. 59 rows: 31 at Phase 1,
21 added at Phase 2, 7 at Phase 3. Every row with floor (39 of 59) is SOURCED to a named model's spec
sheet, re-sourced 2026-09-17; the live table, with manufacturer, model and the sheet's link per row, is
the Facility page's Footprints tab.

Two rows dominate and both deserve to be seen on their own:

- **The tumble blackout rack is the largest single object in the plant.** The Cleveland P-TC-220 is 98 × 93
  in — 63.3 sq ft of plan area, five times the jar stand oven. Its published clearances are 60 in at the
  front, 24 in at the rear, 12 in at the sides and 36 in on one side for electrical access, so its
  true envelope is (98+12+36) × (93+60+24) = **179.5 sq ft**. It is on Phase 2.
- **The walk-ins are already dimensioned by their own names.** 12×20 + 10×12 freezer at Phase 1 is
  360 sq ft of nominal box; Phase 2 adds a 10×12 cooler and an 8×10 freezer for 200 more. With 2 in
  panel clearance and a 6 ft loading apron on each door wall they gross **322.8**, **187.4**, **187.4**
  and **134.1** sq ft respectively.

## 6. Zone gross — Layer B and the circulation spine

Each zone's factor is derived from the depth of the equipment in it and the aisle that serves it:
factor = (depth + aisle) ÷ depth. The aisle comes from the Berkeley guidance in §4 item 7, chosen by
whether the zone's equipment has doors or tilt arcs that swing into the aisle.

| Zone | Derivation | Factor |
|---|---|---|
| Hot production line | D = 44 in average equipment depth; A = 54 in, single aisle with protruding equipment — jar stand and convection doors swing and the sprouting rack and shelf tilt forward into a cart. (44+54)/44 | **2.23** |
| Prep | D = 30 in table depth; A = 48 in, single aisle, little traffic. (30+48)/30 | **2.60** |
| Packaging | D = 30 in table depth; A = 48 in. (30+48)/30. Ambient in the baseline; +77.5 sq ft as an enclosed conditioned room (§10.3, Option B) | **2.60** |
| Grow critical path | Traulsen TBC13 is 59-1/8 in deep with the door open against a 35 in body, plus 5-1/2 in side clearance at 105°F ambient; the Cleveland MFS needs 36 in of front access | **2.20** |
| Cold storage, reach-in and mobile | D = 34 in reach-in depth; A = 42 in front clearance (USOE 3.5 ft). (34+42)/34 | **2.24** |
| A la carte line (Phase 3) | D = 33 in average line depth; A = 48 in. (33+48)/33 | **2.45** |
| Harvest staging | Cart park plus a 48 in marshalling lane to the dock | **2.50** |
| Warewash | 20 in service clearance on both long faces of the conveyor, plus load and unload tables and a 48 in aisle | **3.00** |
| Tumble blackout rack | Manufacturer's published clearances used directly, not a factor | 179.5 sq ft |
| Walk-ins | Nominal box + 2 in panel clearance + a 6 ft loading apron on the door wall | per box |

The **warewash zone's gross is not counted on the production floor**. It is carried inside the support
program (§7) as the warewash room, so the dishwasher, pot sink, hand sinks and sanitation cart are
counted exactly once.

**The circulation spine.** The zone factors buy the aisle *inside* each zone; they buy nothing for the
cart route that runs receiving → storage → prep → hot line → blackout → pack → cold hold → harvest. A
5 ft clear spine is carried for it (Berkeley puts a major-traffic aisle at 6 ft; FER puts personnel
with carts at 40 in). Its length is taken as 1.7 × the side of a square block of the zone gross —
one run the length of the plant and a cross leg.

| Cumulative through | Zone gross | Spine | **Production floor** |
|---|---|---|---|
| Phase 1 | 1,350.4 sq ft | 312 sq ft (5 ft × 62.5 ft) | **1,663 sq ft** |
| Phase 1+2 | 2,369.8 sq ft | 414 sq ft (5 ft × 82.8 ft) | **2,784 sq ft** |
| Phase 1+2+3 | 2,495.2 sq ft | 425 sq ft (5 ft × 84.9 ft) | **2,920 sq ft** |

These are the **baseline** — current equipment, ambient packaging. The 34°F holding room and the
conditioned packaging room are options carried in §10.8, not in these figures.

Zone gross by phase, cumulative:

| Zone | Phase 1 | Phase 1+2 | Phase 1+2+3 |
|---|---|---|---|
| Hot production line | 96.5 | 220.0 | 220.0 |
| A la carte line | — | — | 125.4 |
| Prep | 269.8 | 437.2 | 437.2 |
| Packaging | 250.5 | 250.5 | 250.5 |
| Grow, excl. tumble blackout rack | 77.5 | 93.6 | 93.6 |
| Tumble blackout rack | — | 179.5 | 179.5 |
| Cold storage, reach-in and mobile | 99.1 | 198.1 | 198.1 |
| Walk-in cooler 12×20 | 322.8 | 322.8 | 322.8 |
| Walk-in 10×12 (cooler and freezer) | 187.4 | 374.8 | 374.8 |
| Walk-in freezer 8×10 | — | 134.1 | 134.1 |
| Harvest staging | 46.9 | 159.1 | 159.1 |
| **Zone gross** | **1,350.4** | **2,369.8** | **2,495.2** |

## 7. The support program — Layer D

The rooms the equipment library cannot describe. Allowances are DoD Space Planning Criteria Ch. 510
at **PSM 1,500** — Peak Single Units, read as the whole of the 1,500-unit placeholder target (§2
decision 5) harvesting in one prospect-unit wave, which is the conservative reading; a day ever split
across two dispatches lowers PSM and shrinks this program. Except where noted. The net-to-department-gross factor of **1.40** is DoD's own for Food and Nutrition Service.

| Space | Phase 1 NSF | Phase 1+2 NSF | Basis |
|---|---|---|---|
| Warewash room | 294 | 294 | Derived: warewash zone gross 183.7 sq ft × 1.6 for soiled landing, clean staging and a cart lane |
| Cart wash | 120 | 120 | DoD 510 |
| Loading dock | 200 | 280 | DoD 510: 200 base for two lanes, +80 per lane beyond two — Phase 2 adds the second van |
| Dry food storage | 750 | 750 | DoD 510: 100 + 10 per 20 PSM over 200, at PSM 1,500 |
| Wares storage | 300 | 300 | **PLACEHOLDER**: 60 linear ft of 24 in shelving × 2.5 circulation. DoD 510 gives 900 sq ft, but it sizes for on-premise tray service — this facility ships in single-use packaging |
| Non-food and chemical storage | 500 | 500 | DoD 510: 100 + 50 per 20 PSM over 200, capped at 500 |
| Office, chief food service | 120 | 120 | DoD 510 |
| Staff lounge | 120 | 120 | DoD 510: 120 minimum at 10 FTE or fewer |
| Locker and changing, two rooms | 240 | 240 | DoD 510: 120 each |
| Staff toilet and shower, two | 120 | 120 | DoD 510: 60 per unit |
| Trash holding | 90 | 90 | DoD 510 |
| Refrigerated waste | 90 | 90 | DoD 510 |
| Recyclables holding | 90 | 90 | DoD 510 |
| **Support net** | **3,034** | **3,114** | |
| **Support gross** (× 1.40) | **4,248** | **4,360** | DoD 510 net-to-department-gross |

Phase 3 adds no support space: the retail and wholesale's a la carte line is production floor and its POS and
expo hardware are bench-mounted.

Only **dry food storage** moves with the target: it is the one line here on a PSM formula that is not
capped and not substituted, so raising the placeholder from 1,000 to 1,500 units took it from 500 to
750 sq ft and nothing else in the program changed. Non-food and chemical storage was already at its
cap. Warewash, wares storage and cart wash are derived or substituted, not PSM formulas. Office,
lounge, lockers and toilets scale on FTE, and no staffing count is decided — they hold at the
minimums and will move when it is.

Three of these deserve their doubt stated rather than buried. **Wares storage** is the one figure here
that was substituted rather than cited, for the reason in the table. **Non-food and chemical storage**
at the 500 sq ft cap is the largest soft number in the program; USOE's cross-check — dry storage at
roughly one third of the farm — would put all dry storage near 555 sq ft against the 1,300 sq ft
this program carries, and the two cannot both be right. **Warewash** is derived from this project's own
equipment rather than taken from DoD's 650 + 253 + 120 + 80, again because DoD is sizing a tray-service
dining facility.

## 8. The answer

| Cumulative through | Equipment envelope | Production floor | Support gross | **Building gross** | Type I hood |
|---|---|---|---|---|---|
| **Phase 1** — subscriptions | 702 sq ft | **1,663 sq ft** | 4,248 sq ft | **6,077 sq ft** | 12.8 linear ft |
| **Phase 1+2** — + restaurants | 1,185 sq ft | **2,784 sq ft** | 4,360 sq ft | **7,422 sq ft** | 28.8 linear ft |
| **Phase 1+2+3** — + retail and wholesale | 1,237 sq ft | **2,920 sq ft** | 4,360 sq ft | **7,571 sq ft** | 38.4 linear ft |

This is the **baseline configuration**: current equipment, ambient packaging, a 7-day hold. The two
potential rooms and what each adds are in §10.8. Figures restated 2026-09-17 to `_engine/facility.ts`
(§2 decision 13); the tests in `apps/web/test/farm-facility.test.ts` hold them within 1.5 sq ft.

Building gross = (production floor × 1.10 for walls, columns and partitions) + support gross.

**The shell to sign for is the Phase 1+2+3 figure: about 7,600 sq ft at baseline, 7,900 with both build-out options (§10.8).** A lease is signed once, and
every one of the Phase 2 rows is an existing line in the equipment library, not a someday idea.

**What Phase 1 carries idle:** 1,257 sq ft of production floor and **1,495 sq ft of building gross —
20% of the shell** — sits unused from the day the doors open until Phase 2 equipment lands. That is
the cost of the option to grow without moving, and it should be priced as such against the alternative
in §11 finding 4.

Per-unit cross-check against the 1,500-unit placeholder target: the production floor is 1.13 sq ft per
unit and the building gross 4.03 sq ft per unit. The published benchmarks (§4 item 14) put a prospect
farm at 0.9–1.0 sq ft per unit, but both of those figures describe a pickup point farm that receives and
serves, not a facility that holds 30 days of grow inventory, blackouts, packages and ships.
The gap is the cold chain and the packaging room, and it is expected.

## 9. The capacity benchmark this is sized against

Run 2026-09-17 against the live engine: `ceilingByCropPlan` over the ten student menu crop plans
(AMK-E-002 … 011) with the resolved default capacity inputs — the same call the Capacity page makes.

| Code | Blackout lb/unit | Sowing | Cycles/day | One-stream ceiling | Bound by |
|---|---|---|---|---|---|
| E-002 Beef & Black Bean Bowl | 0.4150 | 475 | 5 | 2,375 | blackout rack |
| E-003 Smoked Chicken & Sweet Potato | 0.6995 | 275 | 4 | 1,100 | blackout rack |
| E-004 Gulf Coast Fish & Potatoes | 0.6870 | 275 | 5 | 1,375 | blackout rack |
| E-005 Farmhouse Chicken Salad | 0.1800 | 825 | 5 | 4,125 | **shelf**, on the salad |
| E-006 Three-Bean Chili | 0.7050 | 275 | 4 | 1,100 | blackout rack |
| E-007 Chicken Fajitas | 0.5970 | 325 | 5 | 1,625 | blackout rack |
| E-008 Meatballs & Marinara | 0.6870 | 275 | 5 | 1,375 | blackout rack |
| E-009 BBQ Pulled Pork | 0.2070 | 950 | 5 | 4,750 | blackout rack |
| E-010 Squash & Corn Enchilada | 0.6500 | 300 | 5 | 1,500 | blackout rack |
| E-011 Honey-Garlic Chicken | 0.7095 | 275 | 5 | 1,375 | blackout rack |

Mean sowing **425** units, median 288. Mean one-stream ceiling **2,070** a day, median 1,438. Mean
cycles 4.8.

**The mean overstates it.** Two rows carry it, and they are the two least trustworthy in the library.
E-005 chicken salad sits at 0.18 lb blackout per unit and is the only crop plan on the menu not bound
by the blackout rack — it is a cold salad, and whether it passes through a rack at all is an open
question. E-009 pulled pork sits at 0.207 lb and carries a sow-to-blackout time of **0 minutes** with a
stage gap, which is missing data rather than a fast crop plan. Excluding those two, the other eight
give **mean sowing 309, mean one-stream ceiling 1,478 a day**.

**The defensible benchmark today is about 1,450–1,500 units a day**, which is what the 1,500
placeholder in §2 decision 5 is set against. 2,070 becomes the honest figure once those two crop plans
are confirmed.

**Nine of the ten crop plans are bound by the blackout rack.** Capacity here is one rack, not a
farm. That is why the second blackout rack moved to Phase 1 — and it is worth being exact about what it
buys, because the reason is not the obvious one:

- It does **not** raise the sowing. A sowing is one rack load. Two racks are two 200 lb sowings,
  never one 400 lb sowing (§2 decision 7).
- It buys **concurrency**: two crop plans blackout at once, staggered, so the day is not a single serial
  queue through one rack. On the blackout rack alone, one rack at 4.8 cycles already covers 1,500
  units against either mean sowing size — 3.5 sowings at 425, 4.8 at 309. The second rack is bought
  for parallel crop plans, for stagger, and for not having a single point of failure on the one control-point-2
  asset in the plant.
- Its ceiling is the sow side, not the racks. The Phase 1 hot line is one sprouting rack, one shelf and
  one jar stand, and it has to feed both racks. Two blackout racks do not double output; what they actually
  yield is a scheduling question for the Phase L scheduler, not an equipment multiplication.

In facility terms the second rack costs 9.97 sq ft of envelope and about 22 sq ft of zone gross.

## 10. Zones, buffer spaces and conformance

The regulatory basis for the layout, established 2026-09-17. Every item is marked **CODE** (a section
can be cited and an inspector can enforce it), **SCHEME** (a certification standard, binding only if
the farm is audited against it), or **CONVENTION** (published design practice, no force). The
distinction is the point: most of what circulates as "farm code" is convention, and a design
document that blurs the two will not survive an Austin Public Health plan review.

### 10.1 What law actually applies here

**Texas does not write its own food construction code.** 25 TAC §228.1 **adopts the FDA Food Code 2017
and its Supplement by reference**, effective 2021-08-08. Chapter 228 keeps only a short list of Texas
amendments, and there is **no Texas amendment on handwashing sinks, warewashing, ventilation, dressing
rooms, toilets, garbage or backflow**. So nearly every requirement below is cited as a **Food Code 2017
section, as adopted by 25 TAC §228.1** — not as a "TFER section."

This matters practically. DSHS's own currently-posted guidance still cites 2015-era TFER numbers
(§228.75, §228.76, §228.244) that no longer carry that content under the 2021 chapter. Citing Food Code
sections is correct regardless of which text a reviewer is working from.

Texas **has not adopted the 2022 Food Code.** Everything here is the 2017 edition.

The two Texas-specific rules a designer needs:

| Rule | Requirement | Note |
|---|---|---|
| 25 TAC §228.171 | Walls, wall coverings and ceilings of walk-ins, food prep areas, warewash areas, toilet rooms and vestibules **should be light in color**, or meet the regulatory authority's approval. Darker colors may require additional lighting per Food Code 6-303.11. | Drafted "should" — advisory with a discretionary hook. Treat as the default. |
| 25 TAC §228.241, §228.243 | Plans **may** be required by the regulatory authority; the authority may conduct preoperational inspections against the approved plans. | State makes plan review discretionary. **Austin makes it mandatory** (§10.7). |

Texas does **not** adopt Food Code 8-201.11 or 8-203.10 (those are replaced by §228.241 / §228.243), but
**does** adopt 8-201.12 (contents of plans), 8-201.13 and 8-201.14 (when a HACCP plan is required and
what it contains), and 8-103.10 / .11 / .12 (variances). Those are the legal hooks for the grow
HACCP plan.

### 10.2 Grow: no variance needed, and the shelf life the equipment actually distributes

**Food Code 3-502.11(D) requires a variance for reduced oxygen packaging — except where 3-502.12 is
met.** A compliant grow operation therefore **does not need a variance.** That is the single most
important regulatory fact for this build.

**3-502.12(D) is the grow paragraph.** Without a variance, the operation must: sow to 3-401.11
parameters; seal the package before growing, or immediately after growing and before the food falls
below 135°F; cool to 41°F **in the sealed package** per 3-501.14; hold in a unit with **continuous
electronic time and temperature monitoring, visually examined twice daily**; label with product name
and packaging date; keep records **6 months**; and operate to written procedures and a training program.
Then the shelf life branches:

| Path | Requirement | Shelf life |
|---|---|---|
| (a) | Cooled to **34°F within 48 hours** of reaching 41°F, held there | **30 days** from packaging |
| (b) | Cooled to 34°F within 48 hours, then removed to 41°F or less | 72 hours after removal |
| (c) | Held at **41°F or less** — no 34°F stage | **7 days** |
| (d) | Frozen | No limit while frozen |

**On the equipment as listed the legal shelf life is 7 days** — path (c). The 30-day path is (a), and
it requires a dedicated **34°F** holding room or unit plus a second-stage blackout load from 41°F to 34°F
within 48 hours that the refrigeration sizing has to carry. The library's four walk-ins are specified
generically with no 34°F room among them, and Austin Public Health's own guidance states "all units
must hold foods at 41°F or below."

**This is a status, not a defect**. Seven days is the current operational
capability and is recorded as such; thirty days stays on the table as a build-out. Both are carried,
side by side, in §10.8.

The monitoring requirement is already partly bought: "Network, temperature monitoring, cameras" is on
the Phase 1 equipment list. It has to be specified as continuous electronic recording with a visible
readout at the unit, because a reviewer reading 3-502.12(D) will look for it on the equipment schedule.

**The HACCP plan goes to Austin Public Health before implementation**, not to DSHS — APH is the local
regulatory authority. DSHS handles variances only where DSHS is the authority.

### 10.3 The packaging room, and the zoning fork underneath it

**Status: an option, not a decision.** The design intent is a conditioned
packaging room with its own envelope, but whether the budget and the appetite exist for it is open.
It is therefore carried as **Option B** in §10.8 and is **not** in the baseline figures.

There is **no US code setting a room temperature for a blackout packaging room.** Not in the Food Code,
not in 9 CFR 416.2, not in FSIS guidance. The nearest published figure is European: the European
Blackout Food Federation's *Recommendations for the Production of Prepackaged Blackout Food* §2.2.2 puts
production areas at **≤12°C (53.6°F)**. The room is therefore documented as **≤50°F (10°C) as a design
target** — more conservative than the only published benchmark — and it is a HACCP control protecting
the 3-501.14 cooling clock and limiting post-lethality exposure, **not a code-mandated space**.
Construction is the standard "box within a box": insulated metal panel walls and ceiling inside the
shell, located in the building interior rather than on an exterior wall, humidity held 40–60% to
control condensation (CONVENTION, CRB).

**The fork that decides how heavy this room has to be.** Under BRCGS, a blackout ready-to-eat product is
**high risk** — fully harvested, supports pathogen growth, no further lethality before consumption — and
high risk requires **full physical segregation by floor-to-ceiling barriers**, its own services,
filtered air under positive pressure, drains flowing away from the zone, dedicated captive footwear and
a gowning sequence at entry. High care, by contrast, says "should" and allows a documented risk
assessment instead of walls.

But that classification depends on whether product is **exposed after the kill step**:

- **Phase 1 packs after growing.** The tray sealer and chamber vacuum machine take product that has
  been harvested, blackout and then handled into packages. Product is post-lethality exposed, so the
  packaging room is **high risk**.
- **Phase 2 does not.** The grow pump fill station on the Phase 2 list bags **direct from the
  sprouting rack** — sealed before blackout, never exposed after the kill step. On that flow the room is not a
  high-risk zone at all.

So the conditioned, segregated packaging room is a **Phase 1** exposure that Phase 2 equipment removes.
That is the opposite of the intuitive read, and it argues for deciding the Phase 2 pump fill station's
timing before committing capital to the room — if the pump fill station arrives early, the room's
justification weakens considerably.

**Space it would carry:** packaging zone gross 250.5 sq ft, plus 21.5 sq ft for a 4-inch panel
envelope, plus a **56 sq ft gowning vestibule** (7 × 8 ft: bench barrier, footwear change, hand sink,
sanitiser) — **328 sq ft against 250.5 ambient, a delta of 77.5 sq ft.** The vestibule is a
PLACEHOLDER: no published standard gives a changing-room area per person or a step-over barrier
dimension.

Air handling is **not in the square footage.** Campden BRI's air quality guidelines, via IFST, put
high-hygiene zones at **10 air changes per hour minimum** with F7 then F9 filtration and continuous
positive pressure; no published pascal figure exists in a free source. The air handling equipment that
implies has no home in this model, because no published foodservice allowance covers mechanical space
(§13).

### 10.4 The conformance register

Each item, its authority, and what it does to the floor plan. This is the register the block plan is
drawn against and the list a plan review submission answers.

| # | Requirement | Status | Authority | Spatial consequence |
|---|---|---|---|---|
| C-01 | Raw animal food separated from raw and harvested ready-to-eat food during storage, prep, holding and display. Types of raw animal food separated from each other by separate equipment, by arrangement, **or by preparing at different times or in separate areas** | **CODE** | Food Code 3-302.11, per 25 TAC §228.1 | **Satisfied by time separation — it does not require a wall.** A dedicated raw protein prep area is a choice; a documented time-separation SOP is the alternative. Open decision (§10.6) |
| C-02 | One-directional flow; layout and movement of personnel and material such that cross-contamination is prevented, using physical separation, distance and traffic flow | **CODE** (international) | Codex CXC 1-1969 §9.1.2 | Receiving → storage → prep → hot → blackout → pack → cold hold → harvest, with no loop and no cross-back. Drives the spine route |
| C-03 | Drainage does not flow from raw production or toilet areas toward areas where finished food is exposed | **CODE** (international) | Codex CXC 1-1969 §9.2.1 | sprouting-rack-bay trench cannot discharge under or toward the packaging room |
| C-04 | Handwashing sinks in food prep, food dispensing and warewashing areas, in a number necessary for convenient use; located to allow convenient use and in or immediately adjacent to toilet rooms | **CODE** | Food Code 5-203.11, 5-204.11, 6-401.10 | Sinks at each work zone. **No travel distance is codified** — see C-05 |
| C-05 | 25 ft maximum travel to a hand sink | **CONVENTION here** | Code in WA (WAC 246-215-05255), NYC (§81.21) and NV (NAC 446.581). **Not** in the Food Code, **not** in 25 TAC 228, **not** in the APH plan review application | Adopted as a self-imposed design standard to satisfy 5-204.11's "convenient use" performance criterion. Labelled as such. Austin Public Health's own page says "hand sinks in all prep, dish, and service areas" — firmer than the Food Code, still not numeric |
| C-06 | Handwashing at the point of entry to a production area | **SCHEME** | BRCGS 4.8.4, 7.2.2, 8.4 | Hand sink inside the packaging room vestibule. **Not a Food Code requirement** — the Food Code governs when to wash (2-301.14), not room-entry geometry |
| C-07 | Hands-free taps, liquid soap, single-use towels or air dryer, signage at each station | **SCHEME** / partly CODE | BRCGS 4.8.4; Food Code 6-301.11, 6-301.12 (soap and drying are code; hands-free is scheme) | Fixture spec, no floor area |
| C-08 | Poisonous or toxic materials stored so they cannot contaminate food, equipment, utensils, linens or single-service articles — separated by spacing or partitioning and **not located above** them | **CODE** | Food Code 7-201.11 | The chemical store is already a separate room in the support program. Warewash-area cleaners and sanitisers are exempted where contamination cannot result |
| C-09 | Floors, walls and ceilings smooth and easily cleanable | **CODE** | Food Code 6-201.11 | Finish schedule. The leasehold line for urethane or quarry tile flooring is the response |
| C-10 | **Water-flush cleaned areas:** floor/wall junctures **coved and sealed**, floors **graded to drain**, floor drains provided. Where flush cleaning is not used, junctures coved and closed to **no more than 1 mm (1/32 in)** | **CODE** | Food Code 6-201.13(A), (B) | This is the code basis for the trench and area drains, not convention. **The 3/8 in or 1 in radius cove everyone specifies is not a Food Code dimension** — 1 mm maximum gap is the only codified figure |
| C-11 | No open rafters or exposed ductwork in food areas | **CODE (local)** | Austin Public Health, Fixed Food Establishments | Finished ceiling throughout production. Interacts with hood and walk-in top closure |
| C-12 | Light-coloured walls and ceilings in walk-ins, prep, warewash, toilet rooms and vestibules | **CODE (state, advisory)** | 25 TAC §228.171 — drafted "should" | Finish schedule default |
| C-13 | Lighting: 10 fc in walk-ins and dry storage, 20 fc at handwashing, warewashing and toilet areas, 50 fc where food is worked with knives or slicers | **CODE** | Food Code 6-303.11; restated by APH | Fixture layout per zone |
| C-14 | Mechanical ventilation of sufficient capacity to keep rooms free of excessive heat, steam, condensation, vapours, odours, smoke and fumes | **CODE**, performance only | Food Code 6-304.11 | **No CFM, no capture velocity, no hood type in the food code.** The numbers come from the Austin-adopted IMC and NFPA 96 |
| C-15 | Hood canopy overhangs the appliance by **6 in on all open sides**; front lip no more than **4 ft** above the growing surface | **CODE** | IMC §507.4.1 | Already carried: 12.8 / 28.8 / 38.5 linear ft by phase (§8; one run per phase, Σ widths + 6 in at each open end) |
| C-16 | Hood to combustible construction **18 in**; 3 in to limited-combustible; 0 to noncombustible. Grease duct 18 in to combustible | **CODE** | IMC §507.2.6, §506.3.6 / NFPA 96 §4.2 | Drives clear height in the sow bay |
| C-17 | Grease filter to flame: 0.5 ft no exposed flame, 2 ft exposed flame, 3.5 ft charbroiler | **CODE** | IMC Table 507.2.8 | Phase 3 charbroiler sets the tallest requirement |
| C-18 | Designated dressing area if employees routinely change on pickup point; lockers for orderly storage of clothing and possessions, located where contamination cannot occur | **CODE** | Food Code 6-305.11, 6-403.11 | A facility with shift change triggers this — a requirement, not an amenity. **No minimum area, no locker count, no separate-room requirement in code.** The support program carries two 120 sq ft changing rooms |
| C-19 | Personnel route: entry → lockers → changing → footwear change over a bench barrier → gown → hand wash → sanitise → zone | **SCHEME / CONVENTION** | BRCGS 8.4; ECFF §2.2.4; Techni-K | The packaging room vestibule. **No published dimension exists** for a changing room per person or a step-over barrier |
| C-20 | At least one toilet and not fewer than required by law; conveniently located and accessible during all hours of operation | **CODE** | Food Code 5-203.12, 6-402.11 | **Fixture count is not in the food code** — it comes from the Austin-adopted plumbing code occupancy table. Do not put a count in this plan sourced to the food rules |
| C-21 | At least one service sink or curbed cleaning facility with a floor drain, conveniently located. A toilet may not be used as a service sink | **CODE** | Food Code 5-203.13 | On the equipment list within "Hand sinks and mop sink." **Austin adds backflow prevention on it** |
| C-22 | Supply-side air gap at least twice the diameter of the water supply inlet, never less than **1 inch** | **CODE** | Food Code 5-202.13 | The one hard number in this area |
| C-23 | No direct connection between the sewage system and a drain from equipment holding food, portable equipment or utensils. Exceptions: a floor drain originating in a refrigerated space structurally part of the building; a warewashing machine **within 5 ft** of a trapped floor drain | **CODE** | Food Code 5-402.11 | Prep sinks, sprouting racks, shelves, ice, dipper wells and walk-in condensate discharge indirectly through an air gap to a floor sink |
| C-24 | Commercial sinks, scullery sinks, dishwashing machines and similar fixtures connected to the drainage system **indirectly** | **CODE (local)** | Austin City Code §25-12-153, UPC §704.3 | The cleaner Austin citation for indirect waste |
| C-25 | **Food waste and garbage disposal units are prohibited in commercial farms** unless approved under §301.3 | **CODE (local)** | Austin City Code §25-12-153, UPC §616.0 | No disposer on the equipment list: the pot sink carries two drainboards and scrap goes by hand to the refrigerated waste room in the support program |
| C-26 | Grease interceptor required for commercial or institutional food preparation facilities, expressly including facilities serving prospects. Minimum 100 gal; **minimum 500 gal where there is a dishwasher**. Sizing: fixture units × 3 gpm × 12 min. Two compartments, first at 7-minute retention, second at 5 | **CODE (local)** | Austin City Code Ch. 15-10; §25-12-153 UPC §1014.1, §1014.1.3; Austin Water sizing criteria | The leasehold line for the grease interceptor is the response. Pumped every 90 days or at 50% wetted height; manifests kept 3 years; City-permitted haulers only |
| C-27 | Each fixture individually trapped and vented; trap seal primers on infrequently used floor drains | **CODE (local)** | §25-12-153, UPC §1014.1.1, §1007.0 | Plumbing rough |
| C-28 | Trench drain under the dish machine discharge; floor drains positioned under the sprouting rack and shelf dump arc; floor sinks for ice, steamers and combis; separate condensate lines from walk-ins; floor slope 1/8 to 1/4 in per foot | **CONVENTION** | Aldevra, drainage design guidance | **No code requires a trench drain anywhere.** The code requirement is 6-201.13(B) — graded to drain with drains provided |
| C-29 | Floor drains prohibited inside walk-ins except in refrigerated processing rooms | **CONVENTION** (institutional standards) | UMN Div. 13 00 30; McLean County | Cold storage layout |
| C-30 | Outdoor refuse storage on a smooth, durable, nonabsorbent surface graded to drain | **CODE** | Food Code 5-501.11, 6-405.10 | Dock apron, outside the building gross |
| C-31 | Waste and soiled ware leave by a route that does not cross clean product flow; high-risk waste by a dedicated route | **SCHEME / CONVENTION** | BRCGS 4.12, 4.12.3, 8.6; SQF 11.8; Codex §9.1.2. **No US code requirement** — the Food Code regulates refuse storage, not routing | Waste egress on the opposite side of the spine from the pack room |
| C-32 | Soiled dish table does not drain into the wash compartment; scupper the full flat section | **CONVENTION** (institutional standard) | UMN Div. 13 00 30 Part 20 §3.ii.C | Warewash room detail |
| C-33 | Accessible route: 36 in clear, 32 in at pinch points up to 24 in long; 60 × 60 in passing spaces where the route is under 60 in | **CODE** | 2010 ADA Standards §403.5.1–.3 | Every aisle in §6 exceeds this. The spine at 5 ft does not require passing spaces |
| C-34 | Egress aisle not less than 36 in; corridors 44 in, or 36 in where occupant load is under 50; capacity 0.2 in per occupant | **CODE** | IBC §1018.2.2, Table 1020.3, §1005.3 | Two exits and travel distance to be checked against the block plan |
| C-35 | Ceiling height: no food-specific minimum in the Food Code or the model codes; IBC baseline 7 ft 6 in for occupiable space | **CODE** (general) / **CONVENTION** | IBC 1208.2. Some jurisdictions set 8 ft for food establishments (e.g. LA City §91.6302) — **Austin's own figure is unverified (§13)** | Design rule: **12–14 ft clear in the sow and sprouting rack bay** to carry a hood bottom at 78–84 in AFF plus hood depth plus grease duct at 18 in combustible clearance; **10 ft clear in the packaging room** for the IMP ceiling and refrigeration piping above; walk-in tops closed to structure or louvred |

### 10.5 Zones and their adjacencies

Eleven zones, in flow order. Adjacency is what the block plan resolves; this is the requirement it
resolves against.

| Zone | Must be adjacent to | Must be separated from | Governing items |
|---|---|---|---|
| Receiving dock | Dry store, cold store, receiving scale | Waste egress, finished goods harvest | C-02, C-30 |
| Dry and chemical store | Receiving, prep | Food contact surfaces (chemicals not above food) | C-08 |
| Cold store (walk-ins) | Receiving, prep, and the blackout outfeed | — | C-29, and the 34°F question in §10.2 |
| Raw protein prep | Cold store, hot line | RTE handling and the packaging room | C-01 |
| Prep (produce and RTE) | Cold store, hot line | Raw protein handling | C-01 |
| Hot line (sprouting rack, shelf, jar stand) | Prep infeed, **both blackout racks** | — | C-14 to C-17, C-28 |
| Grow (2 racks, blackout carts) | Hot line discharge, packaging room, cold store | — | C-28, and 3-502.12(D) |
| **Packaging room (conditioned, ≤50°F)** | Blackout outfeed via pass-through, finished goods cold store | Raw prep, warewash, waste, drainage from the sprouting rack bay | C-03, C-06, C-19, §10.3 |
| Finished goods cold store | Packaging room, harvest staging | Raw materials | 3-502.12(D) monitoring |
| Harvest staging | Finished goods, dock | Receiving flow, waste | C-02 |
| Warewash | Pot and pan return from all zones, clean ware back to prep and pack | Clean product flow | C-31, C-32, C-23 |

**The two-stream hot line.** Phase 1 runs one 100 gal sprouting rack, one 40 gal tilting shelf and one 20-pan
jar stand feeding **two** blackout racks. Two concurrent sow→blackout streams are achieved by grow unit
assignment, not duplicate equipment — the sprouting rack on one component to rack A while the shelf and
jar stand work another to rack B. The layout consequence is that **both racks must be reachable from
the hot line without the two streams crossing each other**, which rules out stacking both racks at
one end of a single aisle. Positions for the Phase 2 second line — 60 gal sprouting rack, second shelf,
second jar stand, convection oven — are reserved in the block plan so nothing relocates when they land.

### 10.6 Open decisions the block plan needs

1. **Is MicroFarm audited against BRCGS, SQF or FSSC 22000?** If yes, the packaging room's
   floor-to-ceiling segregation, filtered positive-pressure air and gowning sequence are requirements,
   not choices, and the high-risk classification in §10.3 applies. If no, they are prudent practice and
   the room can be lighter. A facility selling into prospects is often audited. This single answer
   changes the envelope cost more than any other item in this section.
2. **Raw protein prep: separate area or time separation?** Food Code 3-302.11 permits either (C-01).
   A separate area costs floor; a time-separation SOP costs schedule and depends on the scheduler
   placing it. The prep zone is currently modelled as one zone.
3. **The 34°F holding room** (§10.2). Without it the shelf life is 7 days, not 30.
4. **Whether the Phase 2 pump fill station changes the packaging room's classification** and therefore
   whether the room should be built once for the Phase 1 flow or built for the flow it ends up with.

### 10.7 Plan review — and the drawing standard this plan will be drawn to

Austin Public Health requires plan review for new construction and remodels; it is one of three gates
before opening, with the pre-opening inspection and the operational permit. Fee for new construction is
$312 in the City of Austin and interlocal municipalities.

**The submission sets the drawing standard, so the block plan will be drawn to it from the start:**
plans **to scale at 1/4 inch = 1 foot**, minimum sheet **11 × 14 inches**, showing the location of all
equipment, plumbing, electrical and mechanical ventilation. Plus: a pickup point plan with outside equipment and
the dumpster; **room dimensions and minimum aisle space and spacing between equipment**; an equipment
list keyed to the plan with manufacturer specification sheets; the proposed menu; plumbing details
covering floor drains, floor sinks, water supply, wastewater connections and backflow prevention; hot
water capacity and recovery rate; ventilation information **for each room**; the mop sink location; the
toxic chemical storage area; separate storage for employee personal items; refrigerated and frozen
storage adequacy with walk-in and reach-in specifications; a **finish schedule** for farm, bar,
storage, toilet rooms, garbage areas and warewash; and lighting levels in foot-candles.

Austin Public Health also states plainly, beyond the state rules: a three-compartment sink or commercial
dishwasher; **hand sinks in all prep, dish and service areas**; a mop sink **with backflow prevention**;
grease traps meeting industrial waste requirements; all units holding food at 41°F or below; and **no
open rafters or exposed ductwork in food areas**.

City of Austin projects also route through Development Services commercial plan review. The grease
interceptor is a separate Austin Water matter under Chapter 15-10 (C-26), not part of the APH review.

### 10.8 Current capability versus the build-out options

**Clarification of record.** The seven-day hold is **the current operational
status** — it is what the equipment on the Phase 1 list can legally distribute under Food Code
3-502.12(D)(c). The thirty-day path is **not withdrawn**: it may well be what gets built. The two are
not in conflict and neither replaces the other; the confusion arose while the platform was being built,
before the actual-versus-planned separation was settled. What the platform needs is both, side by side,
so the difference can be seen and priced.

**Equipment is not a ledger concept, so this is not a ledger split.** Plan and Actual are the two
ledgers — Plan is a forecast's own run, Actual is recorded facts. Equipment is a **definition** carrying
a real-world status (in service / planned / no / unset) and an in-service date, and shelf life is a
**scenario input** (`assumptions.inventory.blackoutShelfLife`, already overlayable per forecast). So
current capability versus build-out is the **plan of record versus saved forecasts** distinction, which
is the mechanism the platform already has.

#### Baseline — the plan of record

| What | Value | Why |
|---|---|---|
| Equipment | The Phase 1 list as it stands, both blackout racks included | Current capability |
| Packaging | Ambient, on the open production floor | Option B not taken |
| Cold storage | The four walk-ins, none at 34°F | No 34°F room on the list |
| `blackoutShelfLife` | **7 days** | Food Code 3-502.12(D)(c): held at 41°F or less, consumed or discarded within 7 days |
| Production floor / building gross | **1,663 / 2,784 / 2,920** and **6,077 / 7,422 / 7,571 sq ft** | §8 |

The default in `plan-data.ts` is 30 days tagged STATED. Setting the plan of record's overlay to 7
distributes the correct baseline without any code change; the default underneath stays 30 and stays
mislabelled, which is a separate one-line correction recorded in the ToDo for the coding agent. **No
code is changed by this build plan.**

#### Option A — the 34°F holding room, for a 30-day hold

Food Code 3-502.12(D)(a): cooled to **34°F within 48 hours** of reaching 41°F and held there, consumed
or discarded within 30 days of packaging.

**Sizing, and the finding inside it.** Shelf life is an expiry limit; **days of cover is what is
actually kept**, and `daysOfCoverTarget` is 5 days (STATED). Mean canopy mass across the ten student
crop plans is 0.5537 lb per unit, so at the 1,500 units/day placeholder:

| Days of cover | Finished goods held | Interior floor needed |
|---|---|---|
| 5 (current target) | 4,153 lb | ~39 sq ft |
| 10 | 8,306 lb | ~77 sq ft |
| 15 | 12,458 lb | ~116 sq ft |
| 30 | 24,917 lb | ~231 sq ft |

Basis: ~28 lb per cubic foot of rack volume for bagged product, 7 ft usable rack height, rack occupying
~55% of box floor. All three are **PLACEHOLDER** — no published density figure for bagged grow
product was found.

**The finding: at the current 5-day cover the 34°F room is small.** An **8 × 10 walk-in — 134.1 sq ft
gross** by the same method as the other boxes (§6) — holds roughly three times the 5-day requirement
and covers cover targets out past 15 days. **The 30-day capability is cheap in floor terms. What it
costs is refrigeration duty and the second-stage blackout load from 41°F to 34°F within 48 hours**, plus
the continuous electronic monitoring 3-502.12(D) requires. The square footage is not the obstacle, and
the plan should not be argued as though it were.

A caveat that cuts the other way: the reason to hold 30 days is to run larger, less frequent sowings,
which would itself raise days of cover. **The room cannot be finally sized until the days-of-cover
target under a 30-day hold is decided** — that is the input, not the room.

#### Option B — the conditioned packaging room

§10.3. Adds **77.5 sq ft**. Changes no shelf life; it buys the high-risk zoning posture, and its
justification weakens if the Phase 2 pump fill station arrives early.

#### What each option costs in square feet

| Configuration | Production floor | Building gross | Shelf life |
|---|---|---|---|
| **Baseline** — current equipment, ambient packaging | 1,663 / 2,784 / 2,920 | **6,077 / 7,422 / 7,571** | 7 days |
| **+ Option A** — 34°F holding room (8 × 10) | 1,812 / 2,929 / 3,065 | **6,241 / 7,582 / 7,731** | 30 days |
| **+ Option B** — conditioned packaging room | 1,749 / 2,868 / 3,004 | **6,172 / 7,514 / 7,664** | 7 days |
| **+ Both** | 1,898 / 3,013 / 3,149 | **6,335 / 7,674 / 7,824** | 30 days |

Cumulative through Phases 1, 2 and 3 in each cell. **The full spread between doing nothing and doing
both is 251 sq ft of gross at full build — about 3%.** Neither option is a square-footage decision;
both are capital, refrigeration and compliance decisions that happen to occupy floor.

#### The entry specification — SUPERSEDED 2026-09-17 (§2 decision 12)

**Superseded.** The potential rooms are documented on the Facility Design and Build plan
(`_data/facility-design.ts` `DESIGN_ROOMS`, shown on the Design & Build plan tab of the Facility page)
with their area, cost, impact and risk, and what each adds to the shell is computed live from its
geometry. They are not equipment rows, not forecasts and never in a ledger. Only step 1 below survived,
as `pnpm farm:facility-scenario` (§2 decision 15). The original text is kept for the record.

To be entered through the OS by an admin, or handed to the coding agent — **not written to the database
directly.** Plan-of-record changes post to the audit trail with the config as applied, which is what
lets a past month compare against the plan actually in force at its end; direct SQL bypasses that trail,
the seed lock and the server actions' validation.

**1. Plan of record — set `assumptions.inventory.blackoutShelfLife` = 7.** Tag as the current operational
limit under 3-502.12(D)(c).

**2. Forecast "30-day cold chain" — one new equipment row, via `createEquipment`:**

| Field | Value |
|---|---|
| item | Walk-in cooler, 8x10, 34°F finished goods hold |
| category | Cold storage |
| build phase | 1 |
| status | planned |
| in-service date | TBD (null) |
| qty | 1 |
| critical | true — it is the 30-day shelf life |
| unit cost | PLACEHOLDER pending quote, consistent with the other boxes |
| note | Food Code 3-502.12(D)(a): 34°F within 48 h of reaching 41°F, 30-day limit. Requires continuous electronic time/temperature monitoring examined twice daily. Sized at 8x10 against a 5-day cover target; re-size when the cover target under a 30-day hold is set. |

Plus the overlay `assumptions.inventory.blackoutShelfLife` = 30.

**3. Forecast "Conditioned packaging room" — one new equipment row:**

| Field | Value |
|---|---|
| item | Packaging room, conditioned ≤50°F, insulated panel |
| category | Grow critical path |
| build phase | 1 |
| status | planned |
| in-service date | TBD (null) |
| qty | 1 |
| critical | false — it is a zoning posture, not a shelf-life control |
| unit cost | PLACEHOLDER pending quote |
| note | ≤50°F design target; no US code sets one (ECFF §2.2.2 ≤12°C is the published benchmark). Carries a 56 sq ft gowning vestibule and needs filtered positive-pressure air. Justification weakens if the Phase 2 pump fill station lands early. |

No `blackoutShelfLife` overlay — this option changes no shelf life.

**4. Forecast "30-day cold chain + conditioned packaging"** — both rows, `blackoutShelfLife` = 30.

Compare then reads the four configurations against each other on capital, inventory, waste and shelf
life, which is what the question needs.

## 11. Findings

1. **The equipment list is sized past the volume it is planned against.** Phase 1 carries a 100 gal
   sprouting rack, a 40 gal shelf, a 20-pan jar stand and two 200 lb blackout racks against a 1,500 unit/day
   placeholder target that §9 shows one rack already covers. The facility this analysis derives is
   a facility for that equipment, not for that volume. The
   square footage will not come down by trimming aisles; it comes down only by deciding the equipment
   list is larger than the business needs at open.
2. **The tumble blackout rack and the pump fill station are on Phase 2, and they are the grow line.**
   The 30-day slush hold that the whole model's inventory logic rests on is a Phase 2 capability as
   the library currently splits it. At Phase 1 the grow critical path is one blackout rack and a
   blackout cart. Either the split is wrong or the Phase 1 operating model is blackout-and-hold, not
   grow — and the 179.5 sq ft the tumble blackout rack absorbs is the second-largest space decision in
   the plant after the walk-ins. The blackout racks moved to Phase 1 on 2026-09-17; these two did
   not, and whether they should is open in the ToDo.
3. **Cold storage is 36% of the Phase 1 production floor.** 611 of 1,693 sq ft is walk-in boxes,
   aprons, reach-ins and mobile racks — 510 sq ft of it the two walk-ins alone, which is 31% of the
   floor for two rows of the library. Before the circulation spine is added it is 44% of the zone gross.
   That is the physical form of the model's own statement that cold storage is the binding
   constraint on buying at volume.
4. **The a la carte line does not belong in the facility shell.** Phase 3 adds 136 sq ft of
   production floor and 9.4 linear feet of Type I hood for fry, griddle and charbroiler — equipment
   with a different hood, a different fire suppression zone and a different operating rhythm than a
   grow line. Splitting it to its own small location removes 163 sq ft of gross and 9.4 linear
   feet of hood from the facility, and the difference between the Phase 1+2 shell (7,466 sq ft) and
   the Phase 1+2+3 shell (7,629 sq ft) is the number to weigh against a second lease.
5. **`facility.sizeSqFt` in `plan-data.ts` needs to change.** It holds 5,000 sq ft tagged STATED
   because it was said out loud; it is a verbal approximation and was excluded from this derivation
   entirely. It is a live input: the sustainability normalizers divide by it, the leasehold schedule
   derives dollars per square foot from it, and the $12,000 a month rent placeholder in
   `finance.ts` is quoted against it. Replacing it with the derived figure moves every intensity
   metric and every per-square-foot rate in the model.
6. **The leasehold schedule was authored without a hood length.** The hood and fire suppression line
   is $92,000 and the HVAC and makeup air line is $78,000, both written on 2026-09-10 before any
   equipment run was laid out. This analysis puts **38.5 linear feet** of Type I canopy over the full
   build — 12.8 at Phase 1, 28.8 through Phase 2 — one run per phase, Σ widths + 6 in overhang at each
   open end (IMC §507.4.1). Both
   lines need re-quoting against a hood length, and makeup air follows the exhaust CFM that length
   implies.
7. **Equipment occupies 42% of the production floor in this model**, against the single published
   rule of thumb of 30%. The rule has one source and no corroboration, and this model's aisles are
   derived unit by unit rather than assumed, so the divergence is not by itself a defect — but it is
   the direction that tightens if a designer disagrees. At 30% the production floor would be 4,250 sq ft
   at full build rather than 3,037, and the shell would be nearer 8,700 sq ft. **A foodservice
   designer's block plan is the step that settles this**, and until one exists the figures in §8
   should be read as the tight end of a range.

8. **The engine multiplies grow unit units into the sowing bound, and it should not.** `sowingBounds` and
   `deriveCapacity` in `_engine/index.ts` compute a grow unit's bound as `capacityLb × units`, so two
   blackout racks produce a single 400 lb sowing and two combis a single 480 lb load. That is wrong on
   the operating model (§2 decision 7) and it contradicts the equipment library's own `RESOURCE_SEED`,
   which sets `concurrentSowings: 1` on the blackout rack with the note "One sowing a rack load."
   Both cannot be true. The sowing must bind to one unit; additional units are parallel streams the
   scheduler places. This reaches CLAUDE.md §2 invariant 1, whose wording — "a sowing is one full
   Phase 1 line" — reads as the aggregate and needs restating as one unit of each grow unit.
   **Fixed 2026-09-17 (Q4b).** The bound is one unit; `units` on a grow unit is the count of parallel
   streams the production plan and the scheduler place. The fix shipped in the same change as the
   blackout rack move, and the code seed had held one unit of every grow unit on Phase 1 until then, so no
   sowing size in the library moved and none was ever quoted overstated. The §9 benchmark stands.

9. **The current shelf life is 7 days, and the 30-day path costs refrigeration, not floor.** Food Code
   3-502.12(D) gives grow four shelf-life paths; on the equipment as listed the operation is on
   path (c), 41°F and 7 days. Reaching 30 days means path (a) — 34°F within 48 hours of reaching 41°F,
   held there. The instinct is that a 30-day hold needs a large room. It does not: shelf life is an
   expiry limit and **days of cover is what is actually kept**, currently 5 days, so an 8 × 10 walk-in
   covers it three times over and adds **134 sq ft of gross — about 2%**. What the 30-day path actually
   costs is the second-stage blackout load, the refrigeration duty and the continuous electronic
   monitoring the paragraph requires. Arguing it as a square-footage decision would be arguing the
   wrong thing. See §10.8, Option A.

10. **The conformance work found more convention than code, and the gap runs one way.** Of the 35
    items in the register, the ones most often quoted as requirements turn out not to be: the 25 ft
    hand sink travel distance is code in Washington, New York City and Nevada but nowhere in Texas or
    Austin; the 3/8 in coving radius is not a Food Code dimension, which specifies only a 1 mm maximum
    gap; NFPA 96 does not state the 6 in hood overhang, the IMC does; OSHA states no aisle width; and
    handwashing at entry to a production area is a BRCGS requirement, not a Food Code one. Every one of
    those is worth doing. None of them should be presented to a plan reviewer as law, and this plan
    carries each with its status attached so a later reader cannot lose the distinction.

## 12. Steps

**Q1 — footprint and clearance as open fields on the equipment library**  DONE 2026-09-17
- [x] Migration `0076_farm_facility_footprints`: `footprint_width_in`, `footprint_depth_in`,
      `clearance_front_in`, `clearance_rear_in`, `clearance_side_in`, `footprint_basis`
      (**sourced** / estimated / stated / observed — `sourced` added, because "off a named model's spec
      sheet" is a different provenance from stated or observed), `zone`, `under_hood`, `footprint_source`
- [x] Seeded from the table in §5 by item name (`FOOTPRINT_SEED`), 20 rows sourced, the rest estimated;
      the code seed and the migration write the same values
- [x] Edited on the **Facility page's Footprints tab**, not on Equipment (§2 decision 11); the basis badge
      beside each row; rows not counted shown and deriving nothing

**Q2 — the space engine**  DONE 2026-09-17
- [x] `_engine/facility.ts`: `facilityRows`, `equipmentEnvelope`, `zoneGross`, `productionFloor`,
      `supportProgram`, `hoodRuns`, `facilityRequirement`, `facilityConfigurations` — pure, 26
      golden-value tests against §5–§8 and §10.8 (`test/farm-facility.test.ts`)
- [x] Zone factors, walk-in and spine rules, support allowances and the PSM figure as named constants in
      `_data/facility-design.ts` with their derivations
- [x] Cumulative by phase, reading each row's `build_phase` and the forecast's status overlay
- [x] Potential rooms enter only as `extraRooms` read from `DESIGN_ROOMS`, never as equipment

**Q3 — the Facility page**  DONE 2026-09-17
- [x] `/farm/sustainability/facility`, admin-only, six tabs on a top bar (§2 decision 10): Design & Build
      plan (approved configuration, the shell under each configuration, the two potential rooms with
      area / cost / impact / risk, open decisions, what moves the number), Footprints, Space (Layers A–E
      by phase, zone gross, the support program with a PSM what-if, the hood), Conformance, Layout,
      Normalizers (the denominators, with the derived gross beside the stated figure)
- [x] Follows the open forecast: reads `resolved.datedEquipment`, so a forecast that re-phases or
      deselects equipment re-derives the shell
- [x] Status badges on every figure that carries a basis
- [x] **Q3b — the conformance register as data.** `_data/facility-conformance.ts`: the 15 space standards
      (§4), the legal basis (§10.1), the grow rule and its four paths (§10.2), the 35-item register
      (§10.4) each CODE / SCHEME / GUIDANCE / CONVENTION with its layout check named where one exists, the
      zone adjacencies (§10.5), the two-stream rule, and the numeric limits the layout checks run against.
      Co-versioned with this document. Rendered as the Conformance tab with a status filter

**Q4 — the leasehold schedule reconnected**  DEFERRED
- [ ] `perSqFtOf` reads the derived building gross instead of `facility.sizeSqFt`
- [ ] Hood and fire suppression, and HVAC and makeup air, carry the derived hood linear feet as their
      basis and are flagged for re-quote
- [ ] The rent placeholder in `finance.ts` is restated against the derived shell

**Q4b — the two figures that must not drift (§2 decisions 5 and 6)**
- [x] Both blackout racks on Phase 1 in `farm.equipment` — done 2026-09-17: the code seed's
      `PHASE_1_UNITS` no longer splits the blackout rack (one row, qty 2, Phase 1) and migration
      `0075_farm_blast_blackoutRacks_phase_1` merges the seeded rows the same way
- [x] The 1,500 unit/day target stays OUT of the platform as a demand or capacity input. It is not
      `phases[].unitsPerDay`, which holds 1,000 and means demand, not capacity. The one place it appears
      in code is `SUPPORT_PROGRAM_PSM` in `_data/facility-design.ts`, tagged PLACEHOLDER: the space
      planner's Peak Single Units input, which sizes the support program only (dry food storage is the
      one line that moves), is a what-if field on the Space tab, and is read by no capacity or planning
      engine
- [x] The baseline entered: `pnpm farm:facility-scenario` sets the plan of record's `blackoutShelfLife`
      to 7 and posts `set_plan_of_record` to the trail with the config as applied (§2 decision 15). The
      two build-out options are **not** entered as forecasts: documented on the Design and Build plan
      (§2 decision 12)
- [x] `blackoutShelfLife` default in `plan-data.ts` stays 30 tagged STATED (it was said); its note now
      says the plan of record overlays 7 as the current capability and 30 is the 34°F-room path
- [x] The unit-multiplication defect in `sowingBounds` / `deriveCapacity` (§11 finding 8) fixed
      2026-09-17, in the same change as the blackout rack move so no capacity figure was ever derived with
      two racks multiplied in. No sowing size moved

**Q5 — `facility.sizeSqFt` retired as an input**  DEFERRED; the derived gross is shown beside the stated figure on the Normalizers tab
- [ ] Replace the STATED 5,000 with the derived figure, tagged DERIVED
- [ ] Re-run the sustainability normalizers (`_engine/carbon.ts`, `_engine/inventory.ts`) and record
      the restatement, since every intensity metric moves

**Q6 — the layout, not just the area**
- [x] Zone adjacency and the conformance register (§10): eleven zones in flow order, 35 conformance
      items each marked CODE, SCHEME or CONVENTION with its spatial consequence
- [x] **The layout editor, v1** (2026-09-17). The Layout tab: one drawing per build phase under the open
      scenario, in feet on a half-foot grid, drawn as SVG with no drawing library. Units come off the
      library at their footprints and are placed by drag, rotated in 90° steps, with their working
      clearance drawn (the zone's aisle at the front, published clearances at sides and rear, a
      walk-in's panel clearance and apron); later phases' units can stand as reserved positions. Rooms
      (zone rooms and support-program rooms at their derived areas by default), the cart spine, hood
      canopies, exits, floor drains and hand sinks are drawn as rectangles and resized by a handle. The
      register's layout checks run live on what is drawn — inside the shell, working clearance, aisle
      under 36 in, spine under 5 ft or obstructed, hood overhang on open sides, dish machine within 5 ft
      of a drain, hand sink within 25 ft (labelled convention), the two blackout racks against the hot
      line's centre, and exits with the longest straight line to one — each finding stating the measured
      figure beside the cited one. Drawn areas are measured against the derived zone gross, spine and
      support allowances, and once a room is drawn its area is the figure of record for that zone. Saved
      to `farm.facility_layouts` (0077), versions never overwritten. Print sets the plan at
      1/4 in = 1 ft with a title block
- [x] **The generated arrangement** (2026-09-17, Robert: "go, build it"). `_engine/facility-arrange.ts`
      lays the whole floor out in the register's flow order from the derived areas and the spacing rules
      the register carries, and hands it to the Layout tab as a draft ("Generate arrangement", with the
      dock wall selectable). The shell is read as a U: a support band across the top (waste rooms,
      warewash, cart wash, wares, lockers, toilets, lounge, office), receiving → dry store → chemical
      store → raw walk-ins, then prep → hot line → grow, the 5 ft cart spine, then packaging →
      finished-goods cold store → harvest staging → harvest dock, with the a la carte line and its own
      hood at the street end. Units stand in rows with their working faces to the aisle at the zone's
      aisle width, separated by their published side and rear clearances; the two blackout racks take
      opposite ends of the grow block; hoods are drawn per run at the 6 in overhang, floor drains
      under the sprouting rack and shelf dump arcs and beside the dish machine, the library's hand sinks one
      per production block, two exits on opposite walls. Later phases' units stand at the far end of
      each block inside a dashed **boundary** (a new marker kind), labelled "Phase 2 reserved" / "Phase 3
      reserved". Against the seed the result passes every layout check against a limit with either dock
      wall (`test/farm-facility-arrange.test.ts`), and lands at about 13,000 sq ft of shell against the
      7,571 derived: the measured-against-derived table shows the gap, which is the band structure and
      the walk-in depth, and is the direction §11 finding 7 named. An arrangement from the rules, not a
      designer's plan: it knows nothing of columns, the slab, utilities or the dock's real position
- [ ] Not in v1, named so none reads as a surprise: a solver that compacts the arrangement toward the
      derived gross, MEP routing, DXF export, path-based egress travel distance (v1 reports the straight
      line and says so). The APH submission set is the designer's and the MEP engineer's; the OS drawing
      is true-dimensioned and printable at scale, not the submission
- [ ] **The Phase 1 block plan itself** — generate, then settle by hand on the Layout tab and save: the
      spine route, the reserved Phase 2 positions, the hood run, two exits. A drawing task, not a coding
      task
- [ ] The conditioned packaging room drawn as an enclosed box with its gowning vestibule, pass-through
      and drainage falling away from it (§10.3, C-03) — when and if the room is decided
- [ ] Fire suppression zones on the hood run (not modelled in v1)

## 13. What would change the number

Named so that none of these reads as a surprise later.

- **A foodservice designer's block plan.** The single largest source of movement, in the direction of
  more space (§11 finding 7).
- **Mechanical and electrical room area.** No published foodservice allowance exists for it; it is
  excluded from §8 entirely and has to come from an MEP engineer. It is not zero.
- **Actual selected models.** 21 rows are SOURCED against a representative model, not a purchase
  order. A different jar stand, blackout rack or tumble blackout rack moves its zone.
- **The walk-in manufacturer's sizing convention.** Nominal, exterior and interior clear differ by up
  to 8 in per dimension, and manufacturers do not agree on which one they quote (§4 item 12). The two
  Phase 1 boxes alone are 31% of the Phase 1 production floor, so this is not a rounding question.
- **The 1,500 placeholder itself.** It is a verbal figure (§2 decision 5). Dry food storage is the
  one line that moves with it — at PSM 1,000 it was 500 sq ft, at 1,500 it is 750 — so a revised
  target moves the shell by roughly 1.4 sq ft of gross per 1 sq ft of storage.
- **Whether 1,500 dispatches as one wave.** PSM is peak single units, not units per day. Sizing here
  assumes one prospect-unit wave, which is the conservative read; a day split across two dispatches
  lowers PSM and shrinks the support program.
- **The unit-multiplication defect** (§11 finding 8). It does not move the square footage, but it
  moves every sowing size the capacity benchmark in §9 rests on, and §9 is what the 1,500 placeholder
  was sanity-checked against.
- **The Phase 2 and Phase 3 volumes.** Both are 0 units/day in the plan data. The support program is
  sized at PSM 1,500 throughout; entering real corporate and ghost-farm volumes will grow storage,
  warewash and dock.
- **Austin Public Health plan review and the adopted IBC and IMC editions.** The code figures in §4
  are cited to the model codes; the adopted local edition governs.
- **Whether the retail and wholesale shares the shell** (§11 finding 4).
- **Austin Building Criteria Manual, Section 2 (Food Establishments)** — exists, is directly on point,
  and its text could not be retrieved (Municode serves it through a JavaScript application). It is the
  most likely home of any Austin-specific numeric construction criteria, including a local hand-sink
  placement rule. **Highest-priority gap; pull it manually before plan review.**
- **Austin City Code Chapter 10-3 section text**, particularly 10-3-2 (whether it adopts the state
  rules and layers anything) and Article 4, which covers **Central Preparation Facilities** — directly
  relevant to a facility. Text unretrieved for the same reason.
- **Whether the farm is audited against BRCGS, SQF or FSSC 22000** (§10.6 decision 1). It decides
  whether the packaging room's segregation is required or merely prudent.
- **BRCGS Appendix 2 zone definitions verbatim** — paywalled. The high-risk classification in §10.3 is
  built from secondary sources and needs one copy of the Standard before it is quoted to an auditor.
- **The 34°F question** (§11 finding 9). Answering it adds a refrigerated room this plan does not carry.
- **Positive-pressure differential for the packaging room** — no published pascal figure in any free
  source, and no published sizing rule (sq ft per line, sq ft per unit) for a blackout packaging room.
  The 328 sq ft in §6 is derived from the equipment, not from a benchmark.
- **Ceiling height in Austin** — no food-specific minimum found in the Food Code or the model codes,
  and Austin's own figure is unverified pending the Building Criteria Manual.

## 14. Sources

**Equipment spec sheets** (the SOURCED footprints in §5)

- Cleveland KEL-100-T — https://www.clevelandrange.com/product/kel100t-electric-steam-sprouting-racks-quad-leg-tilting/ (Cleveland makes no 100 gal *gas* tilting sprouting rack; the gas KGL-T line tops out at 80 gal, so the 100 gal row is electric or direct-steam)
- Cleveland KGL-40/60/80-T — https://www.clevelandrange.com/wp-content/uploads/2025/02/KE004046-73-KGL-40-60-80-T.pdf
- Cleveland SGL-30/40-TR braising pan — https://www.clevelandrange.com/wp-content/uploads/2025/02/KE004046-93-SGL-30-40TR.pdf
- Rational iJarStand Pro 20-full size — https://www.webstaurantstore.com/documents/specsheets/pro_20-full.pdf
- Vulcan VC44E series — https://www.vulcanequipment.com/pickup-points/default/files/webdam_asset/85620879.pdf
- Hobart HCM450 vertical cutter mixer — https://www.hobartcorp.com/pickup-points/default/files/webdam-assets/HCM450%20Cutter%20Mixer%20Spec%20Sheet%20F7734%20(04-23).pdf
- Hobart HL800 Legacy+ 80 qt mixer — https://www.hobartcorp.com/pickup-points/default/files/webdam-assets/HL800%20Legacy%20PLUS%20Spec%20Sheet%20F40113%20(07-21).pdf
- Traulsen TBC13 blackout rack, 200 lb — https://www.hobart.ca/wp-content/uploads/2024/03/TBC13-Blast-blackout-rack-Reach-In-Spec-Sheet-TR36053-10-23.pdf (supersedes the RBC200)
- Cleveland tumble blackout rack (P-TC-220 / P-TC-320) — https://www.clevelandrange.com/wp-content/uploads/2026/06/Tumble_BlackoutRack.pdf
- Cleveland MFS metering filling station — https://www.clevelandrange.com/product/fam_lfgsem/mfs-metering-filling-station/
- Ilpra FoodPack Synergy traysealer — https://ilpra.com/packaging_machine/foodpack-synergy/
- VacMaster VP800 double chamber — https://alfaco.com/product/vacmaster-vp800-double-chamber-vacuum-sealer/
- Champion 80 PRO-HD rack conveyor — https://www.championindustries.com/80-PRO-Heavy-Duty-Prewash-Rack-Conveyor
- Hobart CL44eN-BAS (the 20 in service clearance) — https://www.hobart.ca/wp-content/uploads/pdfs/warewash/CL44eN-BAS-F40453.pdf
- Cres Cor R-171-SUA-20E mobile blackout rack — https://www.crescor.com/wp-content/uploads/2021/03/R-171-SUA-20E_K-2.pdf

Unified Brands / CapKold publishes no dimensions for its pump-fill stations or tumble blackout racks ("consult
factory"), which is why the other Welbilt grow line, Cleveland Range, is the representative model
for both. No manufacturer publishes a recommended total installation length for a rack conveyor
dishwasher including its load and unload tables; the warewash room in §7 is derived instead.

**Spec sheets added 2026-09-17** (the re-sourced rows; links carried on each row of `farm.equipment`)

- Advance Tabco 94-3-54-24RL and 94-2-36-24RL sinks, 94-43-72-24RL pot sink, 7-PS-60 hand sink, 9-OP-40 mop sink, TTS-308 work table — retailer spec pages (WebstaurantStore, GoFoodservice) and https://advancetabco.com/specs/floor_mopsink.pdf
- Hobart HL800 — https://www.hobartcorp.com/pickup-points/default/files/webdam-assets/HL800%20Legacy%20PLUS%20Spec%20Sheet%20F40113%20(07-21).pdf (27-1/4 × 46 in; 60-3/16 in with the bowl swung out)
- Cres Cor R-171-SUA-20E — https://www.crescor.com/product/r171sua20e/ ; R-171-SUA-10E — https://www.katom.com/546-R171SUA10E.html ; H-137-UA-12D — WebstaurantStore
- True T-49-HC — https://www.truemfg.com/product/t-49-hc/ ; TWT-48-HC — https://www.truemfg.com/wp-content/uploads/true-media/spec-sheets/TWT-48-HC.pdf
- Cambro UPC400 — WebstaurantStore; Rubbermaid FG9T7200 — https://www.katom.com/007-FG9T7200BLA.html
- Pitco SG14 series — https://www.pitco.com/wp-content/uploads/2022/02/L10-294-R2-SG14-with-Options.pdf ; Vulcan MSA36 — https://www.vulcanequipment.com/griddles/36-msa-series-flat-top-gas-griddle ; Vulcan VCCB36 — https://www.katom.com/207-VCCB36NG.html ; Hatco GRS — https://www.hatcocorp.com/cms/SPECSHEETS/000000004171201-00014-20161121.PDF

**Standards and space-planning references** (§4)

- 2010 ADA Standards / ICC A117.1, accessible route — https://www.access-board.gov/ada/chapter/ch04/
- IBC §1018.2.2 egress aisles, as adopted — https://www.revisor.mn.gov/rules/1305.1018/
- IMC §507.4.1 / §507.1.6.1 canopy size and location — https://up.codes/s/canopy-size-and-location
- Hood overhang in practice, and the NFPA 96 correction — https://www.philackland.com/wp-content/uploads/2012/03/07-hoods.pdf and https://kitchenventilation.com/2017/02/19/what-are-the-standards-for-hood-overhang-to-specific-growing-equipment-is-it-based-on-ul-listings-of-the-hood/
- 29 CFR 1910.176(a), aisles (no numeric width) — https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XVII/part-1910/subpart-N/section-1910.176
- 10 CFR 431 Subpart R, walk-in envelope — https://www.ecfr.gov/current/title-10/chapter-II/subchapter-D/part-431/subpart-R
- UC Berkeley UHS Dining Design Guidelines, aisle widths — https://uhs.berkeley.edu/pickup-points/default/files/diningdesignguidelines.pdf
- USOE, *Design Criteria: Prospect Food Service Facilities*, 1973 — https://files.eric.ed.gov/fulltext/ED082373.pdf
- DoD Space Planning Criteria Ch. 510, Food Service — https://www.wbdg.org/api/documents/media/f62e96a7-94e4-418c-9361-d022ea1ce18c/file
- Marshall / The Marshall Associates on fresh-production farm sizing — https://www.ecoliteracy.org/article/answers-architect-prospect-food-facilities
- Thibodeaux, *Restaurant Design: Concept to Subscriber*, the 30% equipment ratio — https://workforce.libretexts.org/Bookshelves/Food_Production_Service_and_Culinary_Arts/Restaurant_Design%3A_Concept_to_Subscriber_(Thibodeaux)/07%3A_Materializing_the_Concept_-_The_Facility/7.05%3A_Spatial_Aspects_of_Restaurant
- U.S. Cooler installation guide, panel clearance — https://www.uscooler.com/support/installation-guide/
- Master-Bilt Quick Ship walk-ins and condensing-unit IOM — https://master-bilt.com/wp-content/uploads/2025/06/Quick-Ship-Walk-Ins-Spec-Sheet.pdf and https://www.partstown.com/modelManual/MB-B-M_iom.pdf
- Norlake on nominal vs actual sizing — https://norlake.com/learn/walk-in-cooler-and-freezer-buying-guide/
- Foodservice Equipment Reports, walk-in specification and cart aisle clearance — https://www.fermag.com/articles/9372-equipment-comparison-walk-in-coolers/

**Regulatory and zoning** (§10)

- Texas Food Establishment Rules, 25 TAC Ch. 228 (DSHS PDF, Aug 2021) — https://www.dshs.texas.gov/pickup-points/default/files/foodestablishments/pdf/GuidanceDocs/TFER-2021_TAC-228_August-2021.pdf ; codification — https://regulations.justia.com/states/texas/title-25/part-1/chapter-228/
- FDA Food Code 2017, the edition Texas adopts — https://www.fda.gov/food/fda-food-code/food-code-2017 (PDF https://www.fda.gov/media/110822/download)
- 25 TAC §228.171 wall and ceiling coverings — https://regulations.justia.com/states/texas/title-25/part-1/chapter-228/subchapter-f/section-228-171/
- 25 TAC §228.241 plans, §228.243 preoperational inspection — https://regulations.justia.com/states/texas/title-25/part-1/chapter-228/subchapter-i/section-228-241/ and .../section-228-243/
- Food Code 3-502.12 ROP without a variance, codified text — https://law.lis.virginia.gov/admincode/title12/agency5/chapter421/section870/ ; Washington's adoption — https://www.law.cornell.edu/regulations/washington/WAC-246-215-03540
- Food Code 3-302.11 separation, codified text — https://www.law.cornell.edu/regulations/hawaii/Haw-Code-R-SS-11-50-32
- Food Code 5-204.11 hand sinks, codified text — https://www.law.cornell.edu/regulations/delaware/16-Del-Admin-Code-SS-5-204.11 ; Ch. 5 and Ch. 6 text — https://regulations.justia.com/states/maine/10/144/chapter-200/chapter-5/section-144-200-5-2 and .../chapter-6/section-144-200-6-2
- DSHS variance request procedures — https://www.dshs.texas.gov/pickup-points/default/files/foodestablishments/pdf/GuidanceDocs/VarianceRequestProcedures.pdf ; ROP guidance — https://www.dshs.texas.gov/pickup-points/default/files/foodestablishments/pdf/GuidanceDocs/23-14680DSHS_GuidanceForROP.pdf
- Austin Public Health, fixed food establishments — https://www.austintexas.gov/health/programs/fixed-food-establishments ; plan review application — https://austin.widen.net/content/dwggogoqte/pdf/10125PR.pdf ; sample floor plan — https://austin.widen.net/content/fhynxofuta/pdf/Sample_Floor_Plan.pdf
- Austin City Code §25-12-153, local plumbing amendments (UPC §616.0 disposers, §704.3 indirect waste, §1014 interceptors) — http://austin-tx.elaws.us/code/ldc_title25_ch25-12_art6_sec25-12-153
- Austin Water grease trap sizing and design criteria — https://www.austintexas.gov/water/grease-trap-sizing-design-criteria ; maintenance — https://www.austintexas.gov/water/grease-trap-maintenance
- Austin City Code Ch. 10-3, Food and Food Handlers — https://library.municode.com/tx/austin/codes/code_of_ordinances?nodeId=TIT10PUHESESA_CH10-3FOFOHA
- Austin Building Criteria Manual, Section 2 Food Establishments — https://library.municode.com/tx/austin/codes/building_criteria_manual?nodeId=S2FOES **(text not retrieved — see §13)**
- European Blackout Food Federation, *Recommendations for the Production of Prepackaged Blackout Food*, 2nd ed. — https://www.ecff.eu/wp-content/uploads/2018/10/ECFF_Recommendations_2nd_ed_18_12_06.pdf
- Codex Alimentarius CXC 1-1969, General Principles of Food Hygiene — https://www.fao.org/fao-who-codexalimentarius/
- BRCGS Issue 9 production risk zones (sample) — https://www.brcgs.com/media/2172804/fsi9riskzone22-sample.pdf ; SQF Food Manufacturing Ed. 9 — https://www.sqfi.com/docs/sqfilibraries/code-documents/edition-9/code-pdfs/20227fmin_foodmanufacturing_v3-2-final-w-links.pdf
- High-risk vs high-care zoning — https://techni-k.co.uk/risk-based-facilities/high-risk-and-high-care-facilities/ and https://ascfoodsafety.com/layout-process-flow-hygienic-zoning-risk-assessment/
- Temperature-controlled room construction — https://www.crbgroup.com/insights/food-beverage/temperature-controls-in-food-manufacturing-facilities ; air quality zones (Campden BRI via IFST) — https://www.ifst.org/pickup-points/default/files/S%20Langford%20-%20IFST%20Hygiene%2025th%20February.pdf
- Grow ROP practice — https://www.produce-safety.com/articles/4494-grow-reduced-oxygen-packaging-in-retail-and-foodservice-operations
- Hand sink 25 ft where it IS code — WAC 246-215-05255, NYC Rules §81.21 (https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCrules/0-0-0-46257), NAC 446.581 (https://regulations.justia.com/states/nevada/chapter-446/physical-facilities/section-446-581)
- Institutional design standards — Univ. of Minnesota Div. 13 00 30 — https://cpm.umn.edu/pickup-points/cpm.umn.edu/files/2023-04/division13_00_30.pdf
- Farm drainage practice — https://www.aldevra.com/articles/drainage-in-commercial-farms-what-you-need-to-know
- Hood clearances — https://www.polygeeesp.com/commercial-farm-hood-clearance-requirements/

## 15. Update Log

| Date | Change |
|---|---|
| 2026-09-17 | **Footprints re-sourced to spec sheets** (§2 decision 16). Every row with floor now reads a named representative model: Advance Tabco 94-3-54-24RL / 94-2-36-24RL prep sinks (94 × 27 averaged), TTS-308 tables, 94-43-72-24RL pot sink (127 × 31), 7-PS-60 hand sinks and 9-OP-40 mop sink; Hobart HL800 at 27-1/4 × 46 with the bowl swing carried as 14-3/16 in front clearance; Cres Cor R-171-SUA-20E blackout rack (62 × 35-1/2, replacing a back-derived figure) and R-171-SUA-10E mobile racks (28-5/16 × 37-3/8); True T-49-HC reach-ins and TWT-48-HC worktops; Cambro UPC400 carriers (18 × 25); Cres Cor H-137-UA-12D hot racks; Rubbermaid FG9T7200 cart; Pitco SG14-2FD, Vulcan MSA36 and VCCB36, Hatco GRS-60-I. Manufacturer, model and spec-sheet link on the row (0079), shown on Facility only. Figures restated: envelope 702 / 1,185 / 1,237, production floor **1,663 / 2,784 / 2,920**, building gross **6,077 / 7,422 / 7,571**, hood 12.8 / 28.8 / 38.4 ft, idle 1,495 sq ft (20%). The generated arrangement passes every check on the new footprints. |
| 2026-09-17 | **The generated arrangement** on the Layout tab: `_engine/facility-arrange.ts` lays the whole floor out in flow order from the derived areas and the register's spacing rules, with the support rooms, both dock lanes, the spine, hoods, drains, hand sinks, exits and dashed Phase 2 / Phase 3 boundaries; a draft until saved, dock wall selectable. Passes every layout check against a limit on the seed. Zone factor derivations completed with a depth and aisle for grow, harvest and warewash so their working clearances draw. `boundary` added as a marker kind. |
| 2026-09-17 | **Pot sink without a disposer.** Austin City Code §25-12-153 (UPC §616.0) prohibits food waste disposers in commercial farms, so the Phase 1 row is now "Pot sink, 3-comp with drainboards" (migration 0078; the code seed, footprint seed and C-25 agree): two drainboards, scrap by hand to the refrigerated waste room the support program already carries. The former open decision and finding are removed rather than carried. |
| 2026-09-17 | **Q1, Q2, Q3, Q3b and Q6 v1 built; Q4b closed; Q4 and Q5 deferred** (Robert's seven decisions, §2 items 10–15). Migration 0076 puts footprint, clearances, basis (`sourced` added), zone, under-hood and source on `farm.equipment`, seeded by item name from §5. `_engine/facility.ts` derives Layers A–E, the hood and the four configurations; 26 golden tests hold the §6–§8 and §10.8 figures within 1.5 sq ft, and the document is restated to the engine: production floor **1,692 / 2,890 / 3,037**, building gross **6,037 / 7,466 / 7,628**, hood **12.8 / 28.8 / 38.5** ft on the stated rule (one run per phase, Σ widths + 6 in each open end). The Facility page is the Sustainability · Facility page, admin-only, six tabs: Design & Build plan, Footprints (edited here, not on Equipment), Space, Conformance (`_data/facility-conformance.ts`: 15 standards, 35 register items, legal basis, grow paths, adjacencies, limits), Layout, Normalizers. **The two potential rooms are documented on the Design and Build plan only** — `DESIGN_ROOMS` with area, cost (no quote, PLACEHOLDER), impact and risk, what each adds computed live — not equipment rows, not forecasts, never in a ledger; the §10.8 entry specification is superseded and marked. `pnpm farm:facility-scenario` sets the plan of record's shelf life to 7 and posts to the trail. The layout editor v1 (`_engine/facility-layout.ts`, `farm.facility_layouts` 0077, 16 tests): drag-placed units with working clearances, rooms and markers, live register checks, measured against derived, print at 1/4 in = 1 ft. `facility.sizeSqFt` still feeds the leasehold and normalizers (Q4/Q5 deferred); the derived gross is shown beside it. |
| 2026-09-17 | **Q4b shipped** (the two of its three bullets that are code): both blackout racks on Phase 1 — `PHASE_1_UNITS` no longer splits the blackout rack, migration `0075_farm_blast_blackoutRacks_phase_1` merges the seeded rows — and finding 8 fixed: `sowingBounds` / `deriveCapacity` bound on one unit, `growUnitForProcess` picks the largest single unit, the day plan's blackout ceiling is one rack's load across the lines in service, the `blackoutRackUnits` input retired. The Capacity page's headline is labelled the one-stream ceiling. Golden values that moved: Phase 1 equipment 589,200 → 625,200, Phase 2 add 527,775 → 491,775, `phase1Capex` 1,412,200; the forecast opens with two lines; the scheduler's rated day for AMK-E-001 finishes sooner on two slots. Not moved: any sowing size, bound or one-stream ceiling — the seed had one unit of every grow unit on Phase 1, so the defect was latent. The 1,500 placeholder is still out of the platform. Open: one lot code or two for a double sowing (ToDo). |
| 2026-09-17 | **§10.8 added: current capability versus the build-out options**. Seven days is recorded as the current operational shelf life under Food Code 3-502.12(D)(c), and thirty days is retained as a build-out rather than withdrawn — the two were conflated before the actual-versus-planned separation was settled. Equipment is a definition with a status, not a ledger entry, so the split is plan of record versus saved forecasts, and `blackoutShelfLife` is already a scenario overlay field. §10.3 reclassified: the conditioned packaging room is **Option B, not a decision**, so the baseline reverts to ambient packaging and the headline figures return to production floor 1,693 / 2,889 / 3,037 and gross 6,038 / 7,466 / 7,629. Option A (34°F holding room, 8 × 10) adds 134 sq ft of gross; Option B adds 77.5; both together 251 sq ft, about 3% at full build. Finding 9 rewritten: **the 30-day path costs refrigeration duty and the second-stage blackout load, not floor** — days of cover is 5, not 30, so an 8 × 10 box covers it three times over. A row-by-row entry specification is given for the plan of record and three forecasts, to be entered through the OS rather than written to the database so plan-of-record changes post to the audit trail. **No code changed by this pass.** |
| 2026-09-17 | **§10 added: zones, buffer spaces and conformance.** Texas adopts the FDA Food Code 2017 by reference (25 TAC §228.1, eff. 2021-08-08) with almost no construction amendments, so requirements are cited as Food Code sections as adopted, not as TFER sections. **Grow needs no variance** where Food Code 3-502.12(D) is met. 35-item conformance register (C-01…C-35), each marked CODE, SCHEME or CONVENTION with its spatial consequence; eleven zones with their adjacencies; the two-stream hot line geometry — one sprouting rack, one shelf, one jar stand feeding both racks without the streams crossing, Phase 2 positions reserved. **Packaging room is a conditioned enclosed space** at a ≤50°F design target — no US code sets one; ECFF §2.2.2's ≤12°C is the published benchmark — carrying 250.5 zone + 21.5 panel envelope + 56 gowning vestibule = 328 sq ft. Findings 9–11 added: the **30-day hold needs 34°F storage the equipment list does not contain** (at 41°F the legal shelf life is 7 days); **Austin prohibits the garbage disposer** on the Phase 1 pot sink; and the register found more convention than code, all of it now labelled. Figures restated: production floor **1,778 / 2,974 / 3,120 sq ft**, building gross **6,132 / 7,559 / 7,720 sq ft**, hood unchanged. Q6 partly done; the block plan will be drawn to the Austin Public Health submission standard, 1/4 in = 1 ft on an 11 × 14 in minimum sheet. |
| 2026-09-17 | Decisions recorded (§2.5–2.7, Robert): Phase 1 production capacity target set to a **1,500 mixed-crop-plan units/day verbal placeholder, deliberately not wired to the platform** — it is not `phases[].unitsPerDay` (which holds 1,000 and means demand) and no engine reads it; **both blackout racks moved to Phase 1**; and **units of a grow unit are parallel streams, not a bigger sowing** — two racks are two 200 lb sowings, never one 400 lb sowing. Every 400 lb figure removed. New §9 records the capacity benchmark run against the live engine over the ten student crop plans: mean sowing 425 / median 288, mean one-stream ceiling 2,070/day, with the mean shown to be carried by two suspect rows (E-005 bound by the shelf at 0.18 lb blackout/unit; E-009 carrying a 0-minute sow-to-blackout) and the defensible benchmark stated as ~1,450–1,500/day. Nine of ten crop plans bind on the blackout rack. Finding 8 added: `sowingBounds` / `deriveCapacity` multiply `capacityLb × units`, contradicting both the operating model and the library's own `concurrentSowings: 1` — recorded, not fixed; this plan changes no code. Figures restated for the second blackout rack at Phase 1 and PSM 1,500: production floor **1,693 / 2,889 / 3,037 sq ft**, building gross **6,038 / 7,466 / 7,629 sq ft**, hood unchanged at 13.3 / 29.3 / 38.7 linear ft, idle at open 1,591 sq ft (21%). Dry food storage 500 → 750 sq ft is the only support line that moved. Step Q4b added. |
| 2026-09-17 | Build plan created. Full equipment library read at 60 post-split rows (31 Phase 1, 22 Phase 2, 7 Phase 3). Footprints sourced to named models for 21 rows carrying 63% of the equipment envelope; the remainder category-typical and tagged PLACEHOLDER. Five-layer method established (§3) with the aisle, hood, walk-in and program standards cited and separated into CODE and GUIDANCE (§4). Derived: production floor 1,668 / 2,889 / 3,037 sq ft and building gross 5,661 / 7,116 / 7,279 sq ft cumulative through Phases 1, 2 and 3, with 38.7 linear feet of Type I hood at full build (§8). Seven findings recorded (§9), including the tumble blackout rack and pump fill station sitting on Phase 2, cold storage at 37% of the Phase 1 floor, and the leasehold hood and HVAC lines having been authored without a hood length. `facility.sizeSqFt` = 5,000 excluded from the derivation as a verbal approximation and scheduled for replacement in Q5. Steps Q1–Q6 drafted; none started. |
