# INSTRUCTION — Model corrections and the chiller operational cycle

**For: the coding agent working the Muse build.**
**Author: review pass, 2026-09-13. Robert's direction: "follow the science."**

Companion files in this folder:
- `model-corrections-2026-09-13.md` — the diagnosis and the evidence behind ISSUE-01…09
- `model-corrections-2026-09-13.patch` — a tested diff for `_data/plan-data.ts` and
  `_engine/index.ts` covering ISSUE-01…09 only. **ISSUE-10…17 are not in the patch.**

---

## 0. Posture — read this before anything else

**Amended 2026-09-13 after Robert's direction. This section governs every issue below.**

This platform is not recording a plan that exists. It is the instrument being used to *design*
the operation — to test staffing shapes, equipment sequences, task orders and the constraints
between them, and to find out what the capacities actually are. Robert's words: *"we're using
this platform to see what our options are, to see what our capacities are, and to design the
model that's going to work."*

So sort every figure into one of two buckets and treat them completely differently.

**Bucket A — defects. Fix these.** A number that contradicts its own inputs, a published figure
transcribed wrong, a label that says one thing and holds another, a derived value stored as a
typed one. ISSUE-01 through 08, and 16, 17. These are wrong on their own terms and stay wrong
under every scenario.

**Bucket B — design parameters. Expose these, never pin them.** The time study was invented to
give the platform something to run on. The shift pattern, the crew count, the chill window, the
load and sanitize minutes, which equipment is used in what order, whether there are one or two
morning crews — **none of this is decided.** Treating any of it as a fact to be nailed down is
the wrong move and produces a platform that can answer one question instead of a thousand.
ISSUE-10 through 15 are all Bucket B: the job is to turn each buried constant into a scenario
input with a tag on it, not to find its "true" value.

**The test for a Bucket B change:** after it, can a user change that number on screen and watch
the whole chain recompute? If not, it is not done — regardless of how defensible the value is.

**Corollary — nothing here is blocked on the corrections.** Because every parameter becomes an
input, the corrected values are just better defaults. Build the scheduler against the scenario
store, not against constants, and Wave 2 becomes a change of defaults rather than a rebuild.

**What stays non-negotiable:** anything carrying a citation (the USDA Food Buying Guide yields,
the FDA Food Code cooling limits) and the engine invariants in CLAUDE.md §2. A scenario may set
a chill stage that violates the Food Code — the engine must then *say so*, not silently accept
it and not refuse the edit. Constraints are reported, not enforced by preventing the question.

---

## 0.1 Working rules for this task

1. **Do not `git commit` or `git push`.** Per-action approval only (CLAUDE.md §7).
2. **Do not run `next build`** against the working tree while the dev server holds `:3000`.
3. Run `pnpm --filter @ct/web test` after every wave. The suite was 744 green before this work.
4. Every new number is an **input carrying a status tag**. Nothing derived is stored
   (CLAUDE.md §2.4). If a figure has no published source it is `PLACEHOLDER` and says so in
   its note — do not dress an assumption as a specification.
5. **No advice voice in UI copy** (CLAUDE.md §5). Surface the limit and the computed impact.
6. Validation output stays **out of the viewer-facing UI** (CLAUDE.md §4). Engine computes it;
   `validation-notes.md` records it.

---

## 1. The governing science

Two different temperature regimes are in play and the model currently blurs them. **They are
not the same number and neither substitutes for the other.**

**A. The regulatory limit — FDA Food Code 3-501.14, two-stage cooling.** Cooked TCS food must
pass **135°F → 70°F within 2 hours**, and **135°F → 41°F within 6 hours total**. This is a
*maximum allowed*, a critical limit on the CCP. It is already stated correctly in
`_data/plan-data.ts` → `ccps` → CCP-2. It is not a production target and it is not an
equipment cycle time.

**B. The equipment rating — manufacturer / industry convention.** A blast chiller is rated to
take product from **160°F to 38°F in 90 minutes or less** at its rated load. Published capacity
ranges run roughly 17.5 lb to 1,380 lb per cycle. This is the *chill stage only*. It describes
the thermodynamics of the cabinet, not the time the cabinet is unavailable.

**C. What no published source gives you.** Load time, unload time, defrost duration, and
sanitation turnaround. Manufacturers list automatic defrost and UV cabinet sanitation as
*features*; none publishes a duration. Therefore these are `PLACEHOLDER` inputs, each tagged,
each replaceable from a spec sheet — never folded silently into the 90 minutes.

**The correction that follows from A + B + C:**

```
chiller occupancy per batch = load + chill + unload + defrost/sanitize
cycles per day              = f(occupancy, the STAFFED window, number of units)
```

`cycleTimeMinutes = 90` is stage B. The model uses it as if it were occupancy. That is the
error, and it is why four 90-minute cycles appeared to fit exactly inside a 360-minute window
with zero margin.

**Batch size does not change because of any of this.** Batch size is `lb per cycle ÷ chilled
mass per portion`, floored to 25. Occupancy changes **cycles per day** and therefore the daily
ceiling. Keep the two clearly separate in code and in copy.

---

## 2. Issue register

### ISSUE-01 — The stated plated portion is the as-purchased column

**Problem.** `recipe.statedPortionOz` is `t(9.5, 'STATED', 'oz', 'Total plated weight')`. It is
not the plated weight. It is the sum of the as-purchased weights: 8.57 oz of weighed
ingredients + one tortilla ≈ 9.45 oz. Dry beans and dry rice absorb water in cooking — the bowl
gains 40.7% between the kettle and the pan. The real plated weight is **12.33 oz**.

**Location.** `_data/plan-data.ts:148`. Call sites: `_engine/phase.ts:74`, `_engine/phase.ts:91`,
`_engine/index.ts` (`validationWarnings`), `capacity/page.tsx:40` and `:182`,
`financials/unit-economics/page.tsx:144`, `recipes/page.tsx:85`.

**Solution.** Delete the field. Add `platedPortionOz(recipe, portionFactor)` to `_engine/index.ts`
returning `{ hotOz, coldOz, eachOz, totalOz, apOz }` — in the patch. Repoint the five call sites:
`phase.ts:74` → `platedPortionOz(inputs.recipe, portionFactor).totalOz`; `phase.ts:91`
`basePortionOz` → `platedPortionOz(recipe).totalOz`; `capacity/page.tsx:40` likewise; the
unit-economics cell then follows from `phaseEconomics`; `recipes/page.tsx:85` sub-label changes
from "Stated plated portion 9.5 oz" to the derived weight and must read **derived**, not stated.

**Verify.** `platedPortionOz().totalOz` ≈ 12.33; `.apOz` ≈ 9.45. A test asserting the two are
different by more than 2 oz, so nobody re-conflates them.

### ISSUE-02 — Stored cooked yields can drift from their own inputs

**Problem.** `cookedYieldPer100` is typed on each line next to the `apQtyPer100` and
`yieldToCooked` that produce it. Nothing enforced the identity. Chilled mass — and therefore
batch size — reads the stored column.

**Location.** `_data/plan-data.ts:136` (interface) and every ingredient line.
`_engine/index.ts` `chilledMassPerPortion()`.

**Solution.** Keep the field (`_engine/scenario.ts:395` already recomputes it on resolve) and
add the identity as a test plus a `yield-integrity` validation warning — in the patch.

**Verify.** For every line, `apQtyPer100 * yieldToCooked` ≈ `cookedYieldPer100` to 3 dp.

### ISSUE-03 — Dry pinto bean yield was unsourced

**Problem.** `yieldToCooked: 2.4`, no basis recorded.

**Location.** `_data/plan-data.ts:176-177`.

**Solution.** USDA Food Buying Guide §1: 1 lb dry pinto = 21 servings of ¼ cup cooked, drained
= 5.25 cups; USDA FoodData Central 171 g per cup cooked → **1.9792 lb cooked per lb dry**;
`cookedYieldPer100` 15 → **12.37**. In the patch.

**Caveat that must survive into the data note.** The FBG figure is *drained*. If the
beef-and-bean base is held with its cooking liquid the wet yield is nearer 2.4 and batch size
returns to 550. One weighed, drained batch settles it. The caveat belongs in `yieldSource` on
the line, not only in the docs.

### ISSUE-04 — Brown rice yield was unsourced

**Problem.** `yieldToCooked: 3`, no basis.

**Location.** `_data/plan-data.ts:189-190`.

**Solution.** USDA FBG §4: 1 lb dry long-grain brown rice ≈ 6½ cups cooked; FDC 202 g per cup
→ **2.8946**; `cookedYieldPer100` 28.125 → **27.1369**. In the patch.

### ISSUE-05 — Onion yield was unsourced

**Problem.** `yieldToCooked: 0.88`, no basis.

**Location.** `_data/plan-data.ts:228-229`.

**Solution.** USDA FBG §2, onions mature fresh: 1 lb AP = 0.78 lb cooked → **0.78**;
`cookedYieldPer100` 1.65 → **1.4625**. In the patch.

### ISSUE-06 — One provenance tag was carrying two different figures

**Problem.** `status` / `source` on an ingredient line describe the **price**. Every `source`
string in the file is about cost. The **yield** — which drives chilled mass, batch size and the
entire capacity chain — had no provenance at all.

**Location.** `_data/plan-data.ts:131-143` (interface) and all twelve lines.

**Solution.** Add `yieldStatus: StatusTag` and `yieldSource: string` to `IngredientLine`;
populate all twelve. In the patch. **Then surface it:** the Recipes ingredient table shows a
`<StatusBadge>` for the price; it needs a second one for the yield, or the yield column is an
untagged number on a page whose whole premise is that numbers carry their tags (CLAUDE.md §3).

**Verify.** A test that every ingredient line has a non-empty `yieldSource`.

### ISSUE-07 — The tortilla had no mass

**Problem.** It is an `each`-unit line, so it contributed nothing to any weight calculation
while still being part of the bowl.

**Location.** `_data/plan-data.ts:250-260`.

**Solution.** `unitMassOz: 0.88` (25 g, USDA FoodData Central, 6-inch corn tortilla), optional
field on `IngredientLine`, consumed by `platedPortionOz()`. In the patch. Note the sustainability
module carries the same 25 g as a placeholder — **use one constant, not two.** Check
`_data/emission-factors.ts` / `_engine/carbon.ts` for the existing 0.025 kg and reconcile.

### ISSUE-08 — The variable labor rate is divided by the wrong batch size

**Problem.** `variableMinutesPerPortion: 1.3636` = 750 ÷ **550**. The time study's 750 variable
minutes were estimated at a **500**-portion batch (`timeStudy.estimatedAtBatchSize`). Dividing
observed minutes by a larger batch than they were observed at understates the rate by **9.1%**.
This is precisely the error `validation-notes.md` §2 warns about, committed into the data.

**Location.** `_data/plan-data.ts:93`. Consumers: `_engine/index.ts` `laborForDay()` and
`fixedLaborShareOfFullBatch()`, `production-planning/page.tsx:253`.

**Solution.** **1.5000**, with the basis written into the note. In the patch. Keep
`estimatedAtBatchSize: 500` — changing it to match the derived batch would erase the warning
rather than resolve it. The `time-study-rebasing` warning stays live until the study is
re-observed.

**Verify.** Test: variable-tagged task minutes ÷ `estimatedAtBatchSize` equals
`variableMinutesPerPortion`. And: fixed-tagged task minutes equals `fixedMinutesPerBatch` (285 —
this one already reconciles exactly).

### ISSUE-09 — Two direct-labor bases disagree by 50%

**Problem.** `laborForDay()` runs off the time study → **$0.9739/portion**, 30.1 meals per labor
hour. `costPerMeal()` and `ledger-model.ts` divide the blended wage by
`designTargetMealsPerLaborHour` = 20 → **$1.4640/meal**. Production Planning renders one, Unit
Economics and the P&L render the other, for the same meal.

**Location.** `_engine/index.ts` `costPerMeal()`, `_engine/ledger-model.ts:137`,
`_data/plan-data.ts:57`, `financials/unit-economics/page.tsx:48`, `labor/page.tsx:42`.

**Solution.** The patch adds a `labor-basis-conflict` validation warning so the gap is on the
record. **Do not pick a winner — this is Robert's call.** Bring him the two options: derive
`costPerMeal()` direct labor from `laborForDay()` at the derived batch and keep 20 as a labelled
conservative planning target shown beside it; or keep 20 as the costing basis and label the
Production Planning figure explicitly as the time-study view.

---

### ISSUE-10 — `cycleTimeMinutes` is used as chiller occupancy. It is the chill stage only.

**This is the structural one. Everything else in §2 is arithmetic; this is a modelling error.**

**Problem.** `cyclesPerDay = floor(chillWindowHours × 60 ÷ cycleTimeMinutes)`. With a 6-hour
window and a 90-minute cycle that is exactly 4, with zero minutes to spare. The chiller in that
model is loaded instantaneously, unloaded instantaneously, never defrosted and never cleaned.
Four 90-minute chill stages back to back is not four cycles of work — it is 6 hours of
compressor runtime with no human in the loop.

**Location.** `_data/plan-data.ts:106-118` (`capacityInputs`); `_engine/index.ts`
`deriveCapacity()`; `capacity/page.tsx` constraint-chain rows and the capacity-inputs table;
`production-planning/page.tsx` capacity check.

**Solution.** Decompose. Replace `cycleTimeMinutes` with four tagged inputs and one derived
occupancy:

```ts
export const chillerCycle = {
  loadMinutes:      t(25, 'PLACEHOLDER', 'min',
    'Transfer from kettle/combi into pans and racks and into the cabinet. Seeded from the time study task "Component blast chill and stage" (25 min elapsed, 2 staff). No published figure exists.'),
  chillMinutes:     t(90, 'PLACEHOLDER', 'min',
    'The rated thermodynamic cycle: 160°F to 38°F in 90 minutes or less at rated load, industry convention. Replace from the equipment spec sheet. This is the ONLY element the HACCP cooling limit applies to.'),
  unloadMinutes:    t(10, 'PLACEHOLDER', 'min',
    'Out of the cabinet to cold hold. Seeded from the time study task "Cold hold to dispatch" (10 min elapsed, 1 staff). No published figure exists.'),
  sanitizeMinutes:  t(15, 'PLACEHOLDER', 'min',
    'Defrost plus food-contact cleaning between loads. Manufacturers list automatic defrost and UV cabinet sanitation as features; none publishes a duration. This figure is an assumption and is labelled as one.'),
} as const;
```

Then in `_engine/index.ts`:

```ts
export function chillerOccupancyMinutes(c = chillerCycle): number {
  return c.loadMinutes.value + c.chillMinutes.value + c.unloadMinutes.value + c.sanitizeMinutes.value;
}
```

and `deriveCapacity()` divides the window by **occupancy**, not by `chillMinutes`. Add
`occupancyMinutes` and its four components to `CapacityProfile` so the Capacity page can show
the build-up as a row per element rather than a single opaque number.

**The Capacity page constraint chain gains rows.** Today it shows six steps and jumps from
"chill window ÷ cycle time" to cycles. It must show load / chill / unload / sanitize / = occupancy
/ ÷ into the window / = cycles, each with its `<StatusBadge>`.

**What it costs.** Occupancy 140 min against the current 360-minute window is **2 cycles and
1,150 portions/day**, down from 4 and 2,300. That is the honest number for a 6-hour window, and
it is why ISSUE-11 matters.

| load | chill | unload | sanitize | occupancy | 6.0 h window | 7.5 h window | 8.0 h window |
|---:|---:|---:|---:|---:|---|---|---|
| 0 | 90 | 0 | 0 | 90 | 4 cyc / 2,300 | 5 cyc / 2,875 | 5 cyc / 2,875 |
| 15 | 90 | 10 | 0 | 115 | 3 cyc / 1,725 | 3 cyc / 1,725 | 4 cyc / 2,300 |
| **25** | **90** | **10** | **15** | **140** | **2 cyc / 1,150** | **3 cyc / 1,725** | **3 cyc / 1,725** |
| 25 | 90 | 10 | 30 | 155 | 2 cyc / 1,150 | 2 cyc / 1,150 | 3 cyc / 1,725 |
| 25 | 120 | 10 | 15 | 170 | 2 cyc / 1,150 | 2 cyc / 1,150 | 2 cyc / 1,150 |

(portions at a 575 batch, ISSUE-03/04/05 applied)

**Verify.** Golden test at the defaults: occupancy 140, cycles 2 at a 6-hour window, 3 at 7.5.
And a test that `deriveCapacity().batchSize` is **unchanged** by any occupancy element — batch
size comes off mass, not time, and must not move.

### ISSUE-11 — The chill window is typed, and it implies a crew that does not exist

**Problem.** `chillWindowHours: t(6, 'PLACEHOLDER')` is a free-floating number. Nothing ties it
to the staffed day. The building is unstaffed 18:00–05:00 and there is no overnight crew, so
**the last unload has to land inside staffed hours** — and the model has no constraint saying so.
Load and unload are human tasks; the chill stage is not.

**Location.** `_data/plan-data.ts:106-118`, `shifts` at `:411`, `operatingWindows` at `:434`.

**Solution (Bucket B — this is a parameter, not a fact to be found).** There is no settled shift
schedule. The current two-shift, 05:00–18:00 pattern was built around early-morning staff getting
the school delivery out; a second morning crew is equally plausible and the personnel plan does
not exist. So **do not derive the window from *the* shift schedule. Derive it from *whichever*
crew and shift scenario is loaded**, and make crews and shifts editable scenario inputs:

```ts
export function chillWindowFromCrews(
  crews: CrewShift[],           // scenario input, not a constant
  routing: RouteStep[],         // when the first cooked component is available
): { startMin: number; endMin: number; minutes: number; staffedAtUnload: boolean }
```

Rules the function encodes, which *are* structural and hold under every staffing shape:
first load cannot precede the first cooked component; **load and unload are human tasks and must
fall inside staffed minutes**; the chill stage itself needs no crew. The typed
`chillWindowHours` survives only as an explicit override, tagged, and flagged when it disagrees
with what the loaded crew scenario can actually staff.

The 450-minute / 7.5 h figure in the table above is **one scenario's answer**, not the answer.
Two overlapping morning crews, a split chill window, or a later dispatch each give a different
one — which is the point of building it this way.

**HACCP interaction that must be modelled, not assumed away.** A chill stage that begins late
enough to complete after the building empties is exactly the case CCP-2's verification note
already anticipates: *"Any chill completing after 18:00 runs on a continuous datalogger with
alarm to a named on-call responder."* So the scheduler needs two distinct rules — **load and
unload must be inside staffed hours; the chill stage may cross into unstaffed hours only on the
datalogger-and-alarm path**, and a plan that relies on it should say so rather than silently
book it.

**Verify.** A test that no scheduled unload lands outside staffed minutes, and that a chill
crossing 18:00 raises the datalogger flag.

### ISSUE-12 — The HACCP limits are documented but never checked against the model

**Problem.** CCP-2's critical limit lives in `ccps` as display text. Nothing in the engine
validates that the modelled chill stage complies with it, and nothing prevents somebody editing
`chillMinutes` to a value the Food Code forbids. Separately, the equipment endpoints
(160°F → 38°F) and the regulatory endpoints (135°F → 41°F) appear in the same file without
either saying it is a different measurement from the other.

**Location.** `_data/plan-data.ts` `ccps` CCP-2 at `:371`, `capacityInputs.cycleTimeMinutes`
note at `:109`.

**Solution.** Add to `_engine/index.ts`:

```ts
export interface CoolingConformance {
  stageOneLimitMin: 120;   // 135°F -> 70°F, FDA Food Code 3-501.14
  totalLimitMin: 360;      // 135°F -> 41°F
  modelledChillMin: number;
  stageOneOk: boolean;
  totalOk: boolean;
  marginMin: number;       // headroom against the 2-hour stage
}
export function coolingConformance(c = chillerCycle): CoolingConformance
```

Only `chillMinutes` is tested against it — load, unload and sanitize are outside the cooling
clock because the product is not in the cooling window during them. **Do not add occupancy to
the HACCP check; that would be a category error.** At 90 minutes the model passes both stages
with 30 minutes of headroom on stage one.

Add the two limits as named constants sourced to the Food Code, and amend the
`cycleTimeMinutes` note so it states plainly that 160→38 is an equipment rating and 135→41 is
the regulatory limit, and that they measure different things.

**Verify.** Table test: 75 and 90 pass both; 150 fails stage one and passes total; 400 fails both.

### ISSUE-13 — Two chiller units are modelled as one lockstep resource

**Problem.** `lbPerCycle = blastChillerUnits × capacityPerUnitLb` treats two 200 lb cabinets as
one 400 lb cabinet that loads, chills, unloads and defrosts in unison. Real cabinets are
independent: one can be chilling while the other is being loaded or defrosted.

**Location.** `_engine/index.ts` `deriveCapacity()`.

**Solution — superseded 2026-09-17.** The remedy below is withdrawn by
[`batch-resource-instruction-2026-09-17.md`](batch-resource-instruction-2026-09-17.md): a batch binds
to one cabinet, lockstep is gone from the headline (now labelled the one-stream ceiling), and the
independent-resource part is done. The diagnosis stands. Original text:

For the closed-form capacity headline, keep lockstep — it is conservative and it
is what the Capacity page explains. For **the scheduler (the production-planning module), model
each cabinet as its own resource** with its own occupancy blocks, and let cycles per day fall
out of the placement rather than a division.

**Do not assume parallelism is free.** Staggered independent units at 200 lb give a per-unit
batch of floor(200 / 0.6841 / 25) × 25 = **275**, so two staggered units yield 6 × 275 = 1,650
portions in a 450-minute window against 3 × 575 = 1,725 lockstep. The rounding loss on the
smaller batch eats the staggering gain. This is the kind of result the Gantt exists to produce
and it should not be pre-judged in either direction.

### ISSUE-14 — The non-chiller stations have never been checked against the batch

**Problem.** `otherCapacities` (combi 40 pan positions, tilt skillet 80 gal, kettle 160 gal) is
labelled "shown for comparison only" and the chiller is *assumed* binding. `../TODO.md` carries the
open question. Nothing computes whether it is true.

**Location.** `_data/plan-data.ts:120-124`, `capacity/page.tsx` "Other capacities" card.

**Solution.** Compute required volume/pan positions per station per batch from the recipe's
cooked yields and the time study's station assignments, and compare to the station's capacity.
At a 575 batch the cooked mass is ~393 lb across the stations; whether that clears a 160-gal
kettle and 40 combi pans is arithmetic, not an assumption. If a station binds before the chiller,
the constraint chain on the Capacity page is naming the wrong constraint — and the scheduler in
the production-planning module has a second bottleneck to place work against.

**Verify.** A test per station: required ≤ capacity, or the station is flagged binding.

### ISSUE-15 — Allergen changeover is not resource time

**Problem.** `operatingWindows` carries "Sanitation, allergen changeover, closedown" as a daily
block, but changeover is a *between-batches* cost on a *station*, and the allergen matrix exists
(`allergenMatrix`). With one recipe this is invisible; the moment per-phase menus land
(`../TODO.md`, costing engine) it is a scheduling constraint.

**Location.** `_data/plan-data.ts` `allergenMatrix:390`, `operatingWindows:434`.

**Solution.** Not a fix today. When the scheduler lands, changeover minutes are a property of a
**transition between two batches on a station**, driven by whether the allergen sets differ —
not a fixed daily block. Leave a typed hook and a note; do not build it against one recipe.

### ISSUE-16 — `validationWarnings()` ids change; downstream must follow

**Problem.** The patch removes the `portion-weight` warning (resolved — it was an as-purchased
column error, not a measurement gap) and adds `yield-integrity`, `labor-rate-basis` and
`labor-basis-conflict`.

**Location.** `test/muse-engine.test.ts` (asserts `portion-weight`), `validation-notes.md` §1 and §2.

**Solution.** Update the test to the new ids. Rewrite `validation-notes.md` §1 as **resolved,
with the diagnosis** (the 9.5 oz was the AP column sum); amend §2 to record that the rate is now
held on the 500 basis and the study still needs re-observing; add a new section for the chiller
occupancy decomposition and the load/unload/sanitize placeholders.

### ISSUE-17 — Golden values move; update them deliberately, not by chasing red tests

**Problem.** `test/muse-engine.test.ts` locks the engine to the old model. Several values change.

**Location.** `test/muse-engine.test.ts`.

**Solution.** Replace the golden values in one deliberate edit, not incrementally:

| Assertion | Old | New |
|---|---:|---:|
| `chilledMassPerPortion()` | 0.7222 | **0.6841** |
| `deriveCapacity().batchSize` | 550 | **575** |
| `deriveCapacity().portionsPerCycleRaw` | 553.9 | **584.7** |
| `deriveCapacity().cyclesPerDay` | 4 | **2** at a 6 h window / **3** at the derived window |
| `deriveCapacity().maxPortionsPerDay` | 2200 | **1,150** / **1,725** per the above |
| planning loop `batchesToRun` / `portionsProduced` | 2 / 1100 | 2 / **1150** |
| `laborForDay(2, 1150).totalLaborHours` | 34.5 | **38.25** |
| `laborForDay(...).directLaborCost` | 1010.16 | **1119.96** |
| `laborForDay(...).laborCostPerPortion` | 0.9183 | **0.9739** |
| `fixedLaborShareOfFullBatch(575)` | 0.2754 | **0.248** |
| `buildPurchaseOrder(1150).total` | 2436.75 | **2463.75** |
| `costRecipe()` — all figures | — | **unchanged** |

Food cost, contribution margin and revenue do not move: the purchase order and the recipe cost
are as-purchased-driven. What moves is throughput, batch size and labor.

---

## 3. Order of work

**Wave 1 — apply the patch.** `git apply docs/muse/model-corrections-2026-09-13.patch`, then the
five call-site edits in ISSUE-01, then the yield badge in ISSUE-06 and the tortilla-mass
reconciliation in ISSUE-07. Update the tests per ISSUE-17. Green suite before moving on.

**Wave 2 — the chiller cycle.** ISSUE-10, then ISSUE-11, then ISSUE-12. Capacity page constraint
chain rebuilt to show the occupancy build-up. This is the wave that changes the headline
throughput number, so stop and show Robert the before/after before going further.

**Wave 3 — the constraint, honestly.** ISSUE-14 (is the chiller actually binding?) and ISSUE-13
(units as independent resources). Both feed the production-planning scheduler; neither should be
guessed.

**Wave 4 — records.** ISSUE-16, `validation-notes.md`, and the `../roadmap.md` update log.

**Not in this task.** ISSUE-09 (Robert's decision) and ISSUE-15 (waits for per-phase menus).

---

## 4. What must not change

- **Batch size is derived from the binding constraint and is never typed** (CLAUDE.md §2.1).
  Nothing in this work makes it an input.
- **Labor is fixed-per-batch plus variable-per-portion** (§2.2). The rate changes; the shape does not.
- **Whole batches only** (§2.3).
- **Every dollar is computed, not stored** (§2.4). The new chiller inputs are inputs; occupancy,
  cycles and the ceiling are all derived.
- **No new dependency.** Nothing here needs one.
- **Confidentiality (§1) and the no-advice rule (§5)** apply to every line of copy added.

## 5. Decisions to bring back to Robert

**Framing note (amended):** items 2–4 below are Bucket B. They are not blockers — they are the
first scenarios to run once the parameters are exposed. Bring Robert the *comparison*, not a
request for a value.

1. **ISSUE-09** — which direct-labor basis governs cost per meal.
2. **The sanitize/defrost placeholder (15 min).** It is an assumption with no published source
   and it is the difference between 2 and 3 cycles at some window lengths. A spec sheet or one
   observed changeover replaces it.
3. **Bean yield drained (1.979 → batch 575) vs held with liquid (2.4 → batch 550).** One weighed
   drained batch settles it.
4. **The daily ceiling falls from 2,200 to somewhere between 1,150 and 1,725** once occupancy is
   honest. Every downstream volume figure — phase meals per day, annual revenue, the P&L — was
   built on 2,200. Robert needs to see that before the numbers are restated.

## Update Log
- 2026-09-13 — **Waves 1 and 2 applied** (not committed). ISSUE-01…08, 10, 11, 12, 16, 17 done;
  ISSUE-09 left for Robert; ISSUE-13, 14 (Wave 3) and 15 not started, per §3 "stop and show
  Robert the before/after". Departures from the sketches in §2, all in the direction of §0:
  the four chiller elements live inside `capacityInputs` (flat, so the existing `capacity`
  overlay and `setCapacity` carry them) rather than a separate `chillerCycle` const;
  `chillWindowHours` is replaced by `firstLoadMin` (PLACEHOLDER, seeded 12:00 so the default
  window equals the old 6 h) plus `chillWindowOverrideHours` (empty = derive from crews);
  `chillWindowFromCrews(cap, crews)` takes the capacity inputs, and the "first cooked component"
  is the `firstLoadMin` input until the scheduler's routing supplies it. The crew register
  (`_data/crews.ts`, scenario section `crews`, add/edit/remove) is the scheduler plan's W0 §3.3,
  built here because ISSUE-11 needed it. Golden values in ISSUE-17 confirmed exactly; the carbon
  footprint moved by 0.1 g CO2e/portion from the tortilla's 25 g → 24.95 g single constant.
- 2026-09-13 — Amended after Robert's direction: added §0 Posture. The platform is a scenario
  planner for designing the operation, not a record of a decided one. Issues re-sorted into
  defects (fix) and design parameters (expose, never pin). ISSUE-11 rewritten — the chill window
  derives from whichever crew scenario is loaded, and crews/shifts become scenario inputs.
- 2026-09-13 — Created. Seventeen issues named with location and solution. Chiller occupancy
  decomposed into load / chill / unload / sanitize against FDA Food Code 3-501.14 and the
  published equipment rating; the chill window tied to the staffed shift schedule; HACCP
  conformance moved from display text into an engine check.
