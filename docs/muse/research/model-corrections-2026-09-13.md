# Model corrections — portion weight, cooked yields, labor basis (2026-09-13)

**Status: APPLIED 2026-09-13 (not committed).** The patch and the §7 call-site edits are in the
working tree; see `model-and-chiller-corrections-instruction-2026-09-13.md` Update Log and
`validation-notes.md` for what shipped. This document is the diagnosis of record and is otherwise
unchanged.

Every number below was recomputed from `_data/plan-data.ts` in an isolated vitest harness
running the real `_engine/index.ts`. The repo's own suite was not run — `node_modules` is
macOS-built and the review shell is Linux. **Run `pnpm --filter @ct/web test` after applying.**

---

## 1. The 9.5 oz "plated portion" is the as-purchased column, not the plated bowl

`recipe.statedPortionOz` is tagged `STATED` and described as "Total plated weight". It is not.
It is the sum of the **as-purchased** weights.

| Ingredient | AP oz/portion | Cooked oz/portion |
|---|---:|---:|
| Ground beef, 85/15 | 1.500 | 1.125 |
| Pinto beans, dry | 1.000 | 2.400 |
| Brown rice, long grain | 1.500 | 4.500 |
| Seasonal vegetables | 2.500 | 2.050 |
| Tomato, crushed | 1.000 | 0.950 |
| Onion, yellow | 0.300 | 0.264 |
| Garlic, peeled | 0.030 | 0.026 |
| Cheddar, shredded | 0.500 | 0.500 |
| Chili-cumin spice blend | 0.050 | 0.050 |
| Sea salt | 0.040 | 0.040 |
| Sunflower oil | 0.150 | 0.150 |
| Corn tortilla, 6 in | 0.880 (1 ea) | 0.880 (1 ea) |
| **Total** | **9.45** | **12.93** |

**9.45 oz as-purchased + a tortilla is where the 9.5 came from.** Dry pinto beans and dry
brown rice absorb water: 1.0 oz of dry beans finishes at 2.4 oz and 1.5 oz of dry rice at
4.5 oz. The bowl gains 40.7% of its weight in the kettle and the combi. Somebody totalled the
AP column and wrote it down as the plated weight.

This is the "portion-weight mismatch" in `validation-notes.md` §1. It is not an unresolved
measurement question — it is an as-purchased-vs-cooked column error, and it resolves in favour
of the cooked yields. **The derived batch size was never wrong because of this.**

**Fix:** delete `statedPortionOz` from the data and derive the plated weight in the engine
(`platedPortionOz()`, in the patch). A weight the customer receives is a computed output of the
recipe, same as batch size and cost per portion — CLAUDE.md §2.4. It should never have been a
typed input.

## 2. Two cooked yields were not on a published basis; three now are

The `status` / `source` fields on each ingredient line describe the **price**. Nothing on the
row described where the **yield factor** came from, and the yield is what drives chilled mass,
which drives batch size, which drives the whole capacity chain.

Checked against the USDA Food Buying Guide — the governing reference for school meal
procurement, which is the right authority for this kitchen:

| Ingredient | Was | Now | Basis |
|---|---:|---:|---|
| Ground beef, 85/15 | 0.75 | 0.75 | FBG §1: 1 lb AP = 0.75 lb cooked, drained, lean. **Already exactly right.** |
| Pinto beans, dry | 2.4 | **1.979** | FBG §1: 1 lb dry = 21 × ¼-cup cooked drained = 5.25 cups; FDC 171 g/cup → 1.979 lb/lb |
| Brown rice, long grain | 3.0 | **2.895** | FBG §4: 1 lb dry ≈ 6½ cups cooked; FDC 202 g/cup → 2.895 lb/lb |
| Onion, yellow | 0.88 | **0.78** | FBG §2: onions, mature, fresh — 1 lb AP = 0.78 lb cooked |
| Seasonal vegetables | 0.82 | 0.82 | unsourced — see §8 |
| Tomato, crushed | 0.95 | 0.95 | unsourced — see §8 |
| Garlic, peeled | 0.85 | 0.85 | unsourced — see §8 |

**The bean yield carries a real caveat.** The FBG figure is *cooked and drained*. If the
beef-and-bean base is held with its cooking liquid, the wet yield is nearer the original 2.4,
chilled mass goes back up, and batch size returns to 550. One weighed, drained batch settles
it. The caveat is written into `yieldSource` on the line, not buried here.

## 3. The variable labor rate was divided by the wrong batch

The time study's fourteen tasks reconcile exactly:

- fixed tasks → **285** labor minutes — matches `fixedMinutesPerBatch`. Correct.
- variable tasks → **750** labor minutes.
- every task's `laborMinutes` equals `staff × elapsedMin`. No arithmetic errors.

`variableMinutesPerPortion` is stored as **1.3636**, which is 750 ÷ **550**. But the study was
estimated at a **500**-portion batch (`timeStudy.estimatedAtBatchSize`). Dividing observed
minutes by a batch size larger than the one they were observed at understates the rate by
**9.1%** — it is exactly the error `validation-notes.md` §2 warns about, committed in the data.

**Fix:** 750 ÷ 500 = **1.5000**, with a test asserting the rate always equals the study's own
variable minutes over its own basis so it cannot drift again. The re-basing warning stays live:
the study is an estimate, not an observation, and still needs re-timing at the real batch.

## 4. Two direct-labor numbers exist and they disagree by 50%

- `laborForDay()` runs off the time study: at a full batch that is **$0.9739/portion**, or 30.1
  meals per labor hour.
- `costPerMeal()` and `ledger-model.ts` divide the blended wage by
  `designTargetMealsPerLaborHour` = **20**, giving **$1.4640/meal**.

Production Planning shows one, Unit Economics and the P&L show the other, for the same meal.
The patch adds a `labor-basis-conflict` validation warning so the gap is recorded. **It does not
pick a winner — that is your call.** The two live options: derive `costPerMeal()`'s direct
labor from the time study and keep 20 as a labelled conservative planning target shown beside
it, or keep the 20 and label the Production Planning figure as the time-study view.

## 5. Provenance on a row now separates price from yield

`IngredientLine` gains `yieldStatus` and `yieldSource` alongside `status` and `source`. A line
can have a quoted price and a guessed yield, or the reverse; one tag could not carry both, and
before this change every yield on the recipe was effectively untagged.

`unitMassOz` is added for each-unit items so the tortilla has a mass in the plated-weight math
(0.88 oz / 25 g, USDA FoodData Central). It was previously weightless.

---

## 6. Net effect on the model

| Figure | Before | After |
|---|---:|---:|
| Chilled mass per portion | 0.7222 lb (11.55 oz) | **0.6841 lb (10.95 oz)** |
| Plated bowl | "9.5 oz" (wrong) | **12.33 oz (derived)** |
| Standard batch size, phase 1 | 550 | **575** |
| Max portions / day | 2,200 | **2,300** |
| Batch size, phases 2–3 (1.5×) | 350 | **375** |
| Max portions / day, phases 2–3 | 1,400 | **1,500** |
| Variable labor rate | 1.3636 min/portion | **1.5000 min/portion** |
| Day labor, default scenario | 34.50 h / $1,010.16 | **38.25 h / $1,119.96** |
| Labor per portion | $0.9183 | **$0.9739** |
| Fixed share of a full batch | 27.5% | **24.8%** |
| Food cost per portion | $1.7801 | **$1.7801 — unchanged** |
| PO at the default plan | $2,436.75 (1,100 portions) | **$2,463.75 (1,150 portions)** |

Food cost and the purchase order are as-purchased-driven, so **no ingredient cost, contribution
margin, or revenue figure moves.** What moves is throughput, batch size, and the labor line.

## 7. Call sites the patch does NOT cover

Removing `statedPortionOz` breaks five references. Each needs the derived value instead:

1. `_engine/phase.ts:74` — `statedPortionOz: inputs.recipe.statedPortionOz.value * portionFactor`
   → `platedPortionOz(inputs.recipe, portionFactor).totalOz`
2. `_engine/phase.ts:91` — `export const basePortionOz = recipe.statedPortionOz.value`
   → `platedPortionOz(recipe).totalOz`
3. `capacity/page.tsx:40` — same substitution; the "Portion size" column then reads 12.3 / 18.5 oz
   rather than 9.5 / 14.3 oz
4. `financials/unit-economics/page.tsx:144` — reads `e.statedPortionOz` off `phaseEconomics`, so it
   follows automatically once (1) is done
5. `recipes/page.tsx:85` — the `sub` string "Stated plated portion 9.5 oz" → the derived plated
   weight, and the label should say derived, not stated

`_engine/scenario.ts:395` already recomputes `cookedYieldPer100` from AP × yield on resolve, so
the scenario overlay path is correct as it stands.

Also update: `test/muse-engine.test.ts` golden values (batch 550→575, max/day 2200→2300, chilled
mass 0.7222→0.6841, day labor $1010.16→$1119.96, labor/portion 0.9183→0.9739, fixed share
27.5%→24.8%, and the `portion-weight` warning id no longer exists — it is now `yield-integrity`,
which correctly does not fire). `validation-notes.md` §1 should be rewritten as **resolved, with
the diagnosis**, and §2 amended to say the rate is now held on the 500 basis.

## 8. What is still a guess

Nothing below is sourced. Each is labelled in the data; this is the consolidated list.

**Moves batch size and the daily ceiling:**
- **Blast chiller: 200 lb per unit, 2 units, 90-minute cycle, 6-hour chill window.** All four are
  placeholders pending a spec sheet, and the entire capacity chain rides on them.
- **Zero turnaround between chiller cycles.** 4 × 90 min exactly fills a 360-minute window with
  nothing to spare. Any load, unload, or sanitation time at all drops it to **3 cycles and 1,725
  portions/day, −25%**. Holding 4 cycles with a 15-minute turnaround needs a 7-hour window. This
  is the single most fragile number in the model.
- **Bean yield drained (1.979) vs held with liquid (2.4).** Batch 575 vs 550.
- **Vegetable blend yield 0.82.** The blend itself is not fixed, so no published figure applies.
- **Crushed tomato 0.95** — depends entirely on how far the salsa is reduced.
- **Garlic 0.85.** Too small a quantity to matter.
- **Tortilla 0.88 oz.** USDA reference for a 6-inch corn tortilla; the actual product has not been
  weighed. The sustainability module carries the same 25 g as a placeholder.

**Moves labor and cost:**
- **The entire time study.** Fourteen tasks, estimated, not observed, at an assumed 500-portion
  batch. Everything about the labor line is downstream of it.
- **Payroll burden 22%** — flagged in the data as too thin to carry real benefits; 30–35% is
  realistic. At 32% the blended loaded wage goes from $29.28 to $31.68, +8.2% on every labor figure.
- **Cook $20 / lead $28 wages** — Austin market placeholders, no quotes.
- **Design target of 20 meals per labor hour** — a stated assumption that contradicts the time
  study (§4).
- **Packaging $0.45 and delivery $0.35 per meal** — placeholders.

**Moves the P&L but not production:**
- **Ten of twelve ingredient prices.** Only grass-fed beef and organic pinto beans are cited.
- **Hold life 30 days vs the 14-day conservative alternative** — changes days-of-cover economics.

**Open questions I did not chase:**
- Whether the bowl as specified meets the NSLP vegetable component. Roasted vegetables at 2.05 oz
  plus salsa at 0.95 oz is roughly ⅜ cup against a ¾-cup daily requirement for grades 9–12. The
  meat/meat-alternate and grain components look comfortable (≈2.3 oz eq M/MA from beef and beans,
  ≈2.4 oz eq grains from rice and tortilla). This needs checking against the current meal pattern
  by somebody who has the full menu, not just the entree.
- Whether a 12.3 oz bowl is the intended school portion at all, and what a 1.5× corporate portion
  of **18.5 oz** implies. The portion factors were set against a 9.5 oz base that did not exist.

## 9. What was checked and found correct

- Every stored `cookedYieldPer100` equals `apQtyPer100 × yieldToCooked` to four decimals. No drift.
- Every time-study task's `laborMinutes` equals `staff × elapsedMin`. Fixed tasks total 285,
  matching `fixedMinutesPerBatch`.
- `blendedLoadedWage` $29.28 = average of $20 and $28, loaded at 22%. Correct.
- The beef cooking yield of 0.75 is the exact USDA Food Buying Guide figure.
- **The blast chiller recalibration is already in the code and is correct.** `capacityInputs`
  carries a 6-hour chill window and a 90-minute cycle — four 90-minute cycles inside a six-hour
  staffed window, not four six-hour cycles across a staffed night. The overnight assumption is
  gone. The only overnight process left in the model is the bean soak, which the time study
  already treats as prior-day.
- The planning loop, purchase-order, and recipe-costing math all reconcile.

## Update Log
- 2026-09-13 — Created. Diagnosed the 9.5 oz portion as the as-purchased column sum; sourced the
  beef, bean, rice and onion yields to the USDA Food Buying Guide; corrected the variable labor
  rate to its own time-study basis; separated yield provenance from price provenance; recorded the
  two-labor-bases conflict and the full list of remaining assumptions. Not applied to the repo.
