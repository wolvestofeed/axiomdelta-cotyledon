# Impact OS — Validation Notes (internal)

**Status decision (2026-09-10, Robert):** known model inconsistencies are documented here in the
repo and kept **out of the public UI surface**. The engine computes them
(`_engine/validationWarnings()`, with its test), but no `<Notice>` block renders them on any Muse
page. The record lives here instead.

**Posture (2026-09-13, Robert — "follow the science"):** the platform is the instrument being used
to *design* the operation, not a record of a decided one. Figures sort into two buckets. **Defects**
(a number that contradicts its own inputs, a figure transcribed wrong, a derived value stored as a
typed one) are fixed. **Design parameters** (the shift pattern, the crew count, the chill window,
load/unload/sanitize minutes) are exposed as scenario inputs with a tag on them and never pinned.
Anything carrying a citation (USDA Food Buying Guide yields, FDA Food Code cooling limits) and the
engine invariants in CLAUDE.md §2 stay non-negotiable — a scenario may violate a limit; the engine
then *says so* rather than refusing the edit.

Full diagnosis of the 2026-09-13 corrections: [`model-corrections-2026-09-13.md`](model-corrections-2026-09-13.md).
Instruction and issue register: [`model-and-chiller-corrections-instruction-2026-09-13.md`](model-and-chiller-corrections-instruction-2026-09-13.md).

---

## 1. Portion-weight mismatch — RESOLVED 2026-09-13 (it was a column error, not a measurement gap)

- **Was stated:** plated portion **9.5 oz** (`recipe.statedPortionOz`, tagged STATED, "Total
  plated weight"), against **≈ 11.6 oz** of hot cooked mass per portion. The two could not both
  be true, and batch size derives from the cooked yields.
- **Diagnosis:** 9.5 oz was the **as-purchased column summed** — 8.57 oz of weighed ingredients
  plus one tortilla ≈ 9.45 oz. Dry pinto beans and dry brown rice take on water in the kettle and
  the combi; the bowl gains about 40% between the as-purchased line and the pan. Nobody weighed a
  plated bowl; somebody totalled the wrong column.
- **Resolution applied:** `statedPortionOz` deleted from the data. The plated weight is now
  **derived** by `platedPortionOz()` in `_engine/index.ts` — hot cooked oz + cold-packed oz +
  each-unit mass (tortilla 0.88 oz, USDA FoodData Central) — and reads **12.33 oz** at the base
  portion, with the as-purchased 9.45 oz reported alongside it as a procurement figure. A test
  asserts the two differ by more than 2 oz so they are not re-conflated. The `portion-weight`
  warning is gone; a `yield-integrity` warning now fires if any stored cooked yield drifts from
  `apQtyPer100 × yieldToCooked` (it does not fire today).
- **Still open, physically:** the bean yield is the USDA **drained** figure (1.979). If the
  beef-and-bean base is held with its cooking liquid the wet yield is nearer 2.4, chilled mass
  rises and batch size returns to 550 from 575. One weighed, drained batch settles it. The
  caveat is on the ingredient line's `yieldSource`, not only here.

## 2. Time-study re-basing — amended 2026-09-13

- **Observed at:** the 14-task time study minutes were estimated for a **500-portion** batch
  (`timeStudy.estimatedAtBatchSize = 500`).
- **Derived batch is now:** **575 portions** (USDA yields applied; was 550).
- **Correction applied:** `variableMinutesPerPortion` had been stored as 750 ÷ **550** = 1.3636 —
  the study's minutes divided by a batch larger than the one they were estimated at, understating
  the rate by 9.1%. It is now held on the study's own basis, **750 ÷ 500 = 1.5000**, and a test
  asserts the rate always equals the study's variable minutes over `estimatedAtBatchSize`. The
  fixed minutes (285) already reconciled exactly and are asserted too.
- **Why the warning stays live:** the study is an estimate, not an observation. Holding the rate
  on the 500 basis stops the minutes being flattered; it does not make them right. Re-observe at
  the real batch size once a weighed batch confirms it. `estimatedAtBatchSize` is deliberately
  **not** changed to match the derived batch — that would erase the warning, not resolve it.

## 3. Two direct-labor bases disagree by 50% — RESOLVED 2026-09-15 (ISSUE-09)

**Robert, 2026-09-15:** the design target was made up by an agent. It is deleted from the plan data,
the scenario overlay, the engine and every page; the `labor-basis-conflict` warning is gone. Direct labor
in the cost of a meal is the time study at the derived batch — the basis Production Planning and the
ledger already used. The record below is kept as the diagnosis.

- `laborForDay()` runs off the time study: at a 575 batch, **$0.9739/portion**, 30.1 meals per
  labor hour.
- `costPerMeal()` and `ledger-model.ts` divide the blended wage by
  `designTargetMealsPerLaborHour` = **20**: **$1.4640/meal**.
- Production Planning renders the first; Unit Economics and the P&L render the second, for the
  same meal. A `labor-basis-conflict` warning now records the gap. **No winner has been picked.**
  The two options: derive `costPerMeal()` direct labor from the time study and keep 20 as a
  labelled conservative planning target shown beside it; or keep 20 as the costing basis and label
  the Production Planning figure explicitly as the time-study view.

## 4. Chiller occupancy and the chill window — decomposed 2026-09-13 (ISSUE-10, 11, 12)

- **The error:** `cycleTimeMinutes = 90` was used as the cabinet's occupancy per batch. It is the
  **chill stage only** — the rated 160°F → 38°F thermodynamic cycle. Four 90-minute chills
  back-to-back filled a 360-minute window with zero minutes to load, unload, defrost or clean.
- **What replaced it (all in `capacityInputs`, all scenario-editable):**

  | Element | Default | Tag | Basis |
  |---|---:|---|---|
  | `loadMinutes` | 25 | PLACEHOLDER | Time-study task "Component blast chill and stage" |
  | `chillMinutes` | 90 | PLACEHOLDER | Equipment rating, industry convention; spec sheet replaces it |
  | `unloadMinutes` | 10 | PLACEHOLDER | Time-study task "Cold hold to dispatch" |
  | `sanitizeMinutes` | 15 | PLACEHOLDER | No published duration exists; an assumption, labelled |
  | **occupancy** | **140** | DERIVED | sum of the four |

  Batch size is **unchanged** by any of them — it comes off mass. What moves is cycles per day.
- **The chill window is a property of the plant — the chain was inverted, turned around
  2026-09-14.** From 2026-09-13 the window was derived from the crew register
  (`chillWindowFromCrews`: first load to the end of staffed minutes), so the plant's ceiling — and
  the P&L, unit economics and annual capacity check built on it — was a function of an invented
  headcount and two invented clock times, every one tagged STATED. Capacity now comes off
  equipment, process minutes and the **operating day** (`operatingOpenMin` / `operatingCloseMin`,
  PLACEHOLDER 07:00–19:00: Robert's two-shift presumption — nothing is decided, and opening runs
  one shift) less `firstLoadAfterOpenMin` (PLACEHOLDER, 300 min). No crew enters it.
- **Labor is a requirement of the plan.** `_engine/staffing.ts` places each batch's cabinet load,
  unload and defrost-and-sanitize on the clock with the people each needs at once (`loadStaff` /
  `unloadStaff` / `sanitizeStaff`, PLACEHOLDER from the time study), reports staff-hours by
  15-minute interval, and carries the other time-study tasks as unplaced staff-hours until the
  scheduler routes them (Roadmap L5). The crew register is a **proposed staffing answer**, seeded
  empty; the retired two-shift pattern resolves only for a saved scenario that edits it, as
  PLACEHOLDER. Proposed crews are checked against the requirement and the old flags survive as
  findings on the schedule — `staffedAtLoadAndUnload`, `chillCrossesUnstaffed`,
  `unattendedChillExtraCycle` — beside no crew or too few at a placed task, crew hours below the
  requirement, a crew outside the operating day, and the crew register against the roster's
  on-floor positions. None of them moves the ceiling.
- **The first load is read from the recipe's cook times (2026-09-14).** The 12:00 first load was
  a placeholder with nothing behind it. A recipe's time to the chiller is now its longest same-day
  component cook under the thermal processing standards (`docs/muse/culinary-operations.md` §3),
  high end of each range, cooking from opening; a component with no cook time is a gap listed
  beside it and nothing stands in for it. The 25-minute load is stated.
- **Effect on the headline:** AMK-E-001 loads at 07:55 (rice, 55 min), so its daily ceiling is
  **4 cycles × 575 = 2,300 portions** (07:55–19:00 ÷ 140 min); the 12:00 placeholder gave 3 × 575 =
  1,725, the crew-derived chain 2 × 575 = 1,150, the zero-turnaround model 4 × 550 = 2,200. The live
  library lists AMK-E-001 last, so the statements' reference recipe is AMK-E-002 (batch 950, 07:55,
  4 cycles = 3,800). The instruction's table remains a golden test.
- **HACCP check moved into the engine (ISSUE-12):** `coolingConformance()` holds
  `chillMinutes` against FDA Food Code 3-501.14 — 120 min for 135°F → 70°F, 360 min for
  135°F → 41°F — as named constants. Only the chill stage is on the cooling clock; occupancy
  is never tested against it. At 90 min the model passes both with 30 min of headroom on stage
  one. A scenario that sets a forbidden chill raises `ccp2-cooling-limit`; the edit is not refused.
- **Downstream volumes were built on 2,200 — reconciled 2026-09-13.** The phase volumes are
  demand. `capacityReconciliation()` (`_engine/proforma.ts`) compares annual demand in
  base-portion equivalents (461,406) with annual capacity = daily ceiling × a new scenario input
  `productionDaysPerYear` (250 seed, PLACEHOLDER) = 287,500, and shows a capacity-constrained
  column beside the demand basis on the P&L: 62.3% of demand producible, every channel scaled by
  the same share. The "within capacity" / "producible" copy on the P&L and Production Planning
  pages is now conditional. The ledger spine stays on the demand basis; which channel gives up
  volume is not decided by the platform. Found in passing: `fixedOverheadAbsorbed` ($1.9445) was a
  stored derived value that did not move with volume — deleted in the 2026-09-13 review pass;
  the management figure and the GAAP absorption rate are both computed now
  (`accounting-policy.md` §4).
- **Re-based 2026-09-14 with the plant chain.** Production days per year count off the J1
  production calendar (2026 weekdays less dated closures: 261 with none entered) instead of a typed
  250. Annual capacity is 1,725 × 261 = 450,225 base portions against 461,406 of demand — 97.6%
  producible under equal distribution. Normal capacity for absorption is bound by the plant
  (`planNormalCapacity`): 367,604 planned meals × 97.6% × 95% = 340,761, a rate of $1.4119 per meal
  (was 349,224 and $1.3777, when normal capacity exceeded what the plant could make). Found in
  passing: `productionDayLedger()` read the plan-data defaults instead of the open scenario.

## 5. Other flagged assumptions (labelled placeholders in the UI, not "validation" blocks)

These remain visible in the UI as `Placeholder` provenance badges — they are labelled, not hidden:

- Ten of the twelve ingredient AP unit costs are placeholders (only grass-fed beef and organic
  pinto beans are cited). Every yield now carries its own `yieldStatus` / `yieldSource`, separate
  from the price: beef, beans, rice and onion are USDA Food Buying Guide figures; vegetables,
  tomato and garlic are unsourced working figures.
- Payroll burden is modelled at **22%** and is flagged in the data note as too thin to carry real
  benefits; **30–35%** is realistic.
- Chiller capacity per unit (200 lb), the four occupancy elements, the operating day and the
  first-load lead time are placeholders pending a real equipment spec sheet, a decided operating
  day and the scheduler's routed cook-step times — and the whole cycles-per-day derivation rides
  on them. Staff per cabinet task is a placeholder too, but it sizes the labor requirement only.
- Two 200 lb cabinets are modelled in lockstep (one 400 lb resource) for the closed-form
  headline. Independent, staggered cabinets are a scheduler result (ISSUE-13): per-unit batches
  round down harder (275 × 2 = 550 against 575), so staggering is not free.
- The non-chiller stations (combi 40 pans, tilt skillet 80 gal, kettle 160 gal) have never been
  checked against the batch's cooked mass (ISSUE-14). The chiller is *assumed* binding.
- Chilled hold life is modelled at **30 days**; **14 days** is the conservative alternative.

## 6. Menu sheet: stated totals against summed component yields — recorded 2026-09-13

The ten-meal baseline batch sheet states a total yield for some dishes that does not equal the
sum of its own component yields. The library carries the COMPONENT yields (the engine sums them
into plated weight); the stated totals are recorded here, not reconciled by adjusting a line.

| Recipe | Sheet total | Sum of stated components | Gap |
|---|---|---|---|
| AMK-E-002 beef & bean mix | ~15.6 lb (2.5 oz × 100) | 9 + 6.5 + 1 = 16.5 lb | +0.9 lb |
| AMK-E-005 chicken salad | ~22 lb (3.5 oz × 100) | 18 + 3 + 3 + 0.1 = 24.1 lb | +2.1 lb |
| AMK-E-006 chili | ~37.5 lb (6 oz × 100) | 22 + 5 + 15 + 3 + 0.5 = 45.5 lb | +8.0 lb (simmer reduction not stated) |
| AMK-E-010 casserole | 37.5 lb (6 oz × 100) | 10 + 8 + 12 + 5 + 5 = 40 lb | +2.5 lb |

A weighed batch settles each; the chili gap is large enough to move its batch size (550 at the
summed mass; 575 at the stated total).

## Update Log
- 2026-09-14 — §4: the first chiller load is read from each recipe's cook times (thermal
  processing standards), not a placeholder; AMK-E-001 at 2,300 a day, demand fits the plant at the
  defaults; AMK-E-001 listed last in the library.
- 2026-09-14 — §4: the capacity chain turned around. The chill window comes off the operating day
  (PLACEHOLDER 07:00–19:00), not the crew register; labor is a requirement emitted by the plan and
  proposed crews are checked against it as findings; the crew register is seeded empty and its old
  STATED tags are gone; production days count off the J1 calendar; normal capacity is bound by the
  plant. Golden values restated: ceiling 1,725, annual capacity 450,225, absorption rate $1.4119.
- 2026-09-13 — §6 added: menu sheet stated totals against summed component yields.
- 2026-09-13 — Review pass on the production-accounting build: absorption base corrected to
  manufacturing overhead only; annual volume variance no longer posted on a batch; day ledger
  runs the day's batches; stored overhead constant deleted. §3 remains OPEN — the note elsewhere
  that the labor gap "posts as a variance" was withdrawn.
- 2026-09-13 — Capacity reconciliation added to §4: annual demand vs annual capacity, the
  producible share, and the constrained P&L column; `fixedOverheadAbsorbed` flagged as a stored
  derived value.
- 2026-09-13 — Waves 1–2 of the model corrections applied. §1 rewritten as resolved with the
  diagnosis (the 9.5 oz was the as-purchased column); §2 amended (rate held on the 500 basis,
  study still to be re-observed); §3 records the two labor bases as Robert's open call; §4 added
  for the chiller occupancy decomposition, the crew-derived chill window and the Food Code
  conformance check; §5 consolidated. Golden values restated: batch 575, ceiling 1,150 at the
  default crews, day labor $1,119.96. Food cost, contribution margin and revenue unchanged.
- 2026-09-10 — Created. Recorded the decision to keep the two model contradictions in the repo
  docs and remove the validation `<Notice>` blocks from the Dashboard, Recipes, and Labor pages.
  Engine `validationWarnings()` and its test are retained.
