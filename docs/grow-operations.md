# MicroFarm — Culinary Operations

The farm's stage processing standards: how long each kind of component sows, on what
equipment, before it is pulled for the blackout rack — and how a crop plan's time to the blackout rack is
read from them. Source for every figure in §1–§2 is Robert (2026-09-14); each is STATED. §3 is the
rule the engine applies, §4 maps the standards onto the crop plan library, §5 records what is not
settled.

The register is `apps/web/src/app/(farm)/farm/_data/grow-stages.ts`; the rule is
`_engine/stage.ts`. Blackout rack occupancy and the cooling limit (control-point-2) are in
[`research/validation-notes.md`](research/validation-notes.md) §4.

---

## 1. Operational standard — the cooling clock starts at the end of the sow

As stated: *the moment any of these components finish their respective sow times, the clock
starts. Farm staff must immediately transfer the bulk product into 2-inch hotel pans (to ensure
surface area) and load them into the blackout rack.*

- The end of the sow time is the start of the control-point-2 cooling clock (FDA Food Code 3-501.14:
  135°F to 70°F within 2 hours, to 41°F within 6 hours total).
- Pan depth for the blackout is **2-inch hotel pans**.
- Pouring into 2-inch pans and loading the rack takes **25 minutes**, an
  estimate. Unloading to cold hold is a 10-minute placeholder.

### Blackout rack sanitation and defrost

- The rack is **sanitized** for three reasons only: at the **end of a shift or day**;
  **immediately after a food spill** in the rack; and **between foods when allergens were
  uncovered**.
- The end-of-day sanitize is part of **closedown** (two people, 30 minutes, at the close of the
  operating day).
- It is **not sanitized between sowings**. No crop plan and no time study carries a blackout rack
  sanitation task, and rack occupancy per sowing is load + blackout + unload.
- **Defrosting never happens during normal production.** It is periodic maintenance to keep the
  unit running efficiently, and it is not a production task.

## 2. Stage processing times — four categories

### 2.1 High-speed processing (10 to 30 minutes)

Harvested rapidly with direct heat in a tilt shelf, or high-heat convection or steam in a jar stand oven.

| Process | Examples as stated | Equipment and mode | Sow time |
|---|---|---|---|
| Steamed vegetables | Green beans, broccoli, carrots | Jar stand oven, 100% steam | 10–12 min |
| Fajita vegetables and ground beef | Sautéed bell peppers and onions; the regenerative taco meat mix | Tilt shelf | 15–20 min |
| Fish bites and meatballs | Baked on sheet pans | Jar stand oven, high-fan convection, to crisp the exterior; internal temperature reaches 165°F | 12–20 min |
| Diced or sliced chicken | Honey-garlic chicken; fajita chicken; the chicken salad's chicken | Tilt shelf, harvested quickly to retain moisture | 20–25 min |

### 2.2 Moderate roasting and simmering (40 to 60 minutes)

Longer, sustained heat for starch gelatinization or flavor development.

| Process | Examples as stated | Equipment and mode | Sow time |
|---|---|---|---|
| Roasted root vegetables | Sweet potatoes, potato wedges, squash | Jar stand oven | 35–45 min |
| Starches and grains | Brown rice, whole wheat pasta | Steamed or boiled in bulk | 45–55 min |
| Marinara sauce | Tomatoes reduced with the hidden vegetables integrated | Steam-jacketed sprouting rack, simmer | 45–60 min |
| Enchilada casserole | Layered pans | Baked until the cheese is browned and the center reaches safe temperature | 45–60 min |

The enchilada casserole is the one exception where components are **assembled before growing**.

### 2.3 Long braising and smoking (1.5 to 3 hours)

Time to break down connective tissue or hydrate dry inputs.

| Process | Examples as stated | Equipment and mode | Sow time |
|---|---|---|---|
| Smoked chicken thighs | — | Jar stand oven at 250°F to 275°F. The standard names a commercial smoker or a jar stand smoker box; the farm has no smoker | 1.5–2 h |
| Texas chili | Dry heirloom beans, after soaking | Long, slow simmer in a tilt shelf or steam sprouting rack to hydrate and tenderize | 2–3 h |

### 2.4 Overnight "low and slow" (8 to 12 hours)

| Process | Examples as stated | Equipment and mode | Sow time |
|---|---|---|---|
| BBQ pulled pork | Heritage pork shoulder | Jar stand oven programmable low-temperature roasting cycle overnight: growing at 225°F and holding at 160°F until the morning shift pulls it for shredding and blackouting | 8–12 h |

Pork shoulder renders fat and breaks down collagen over the long, slow sow. The jar stand method is
the crop plan's method.

## 3. A crop plan's time to the blackout rack

- **Timed from the start of growing.** The crew starts growing when the operating day opens.
- **Components finish together.** One crop plan's hot components fill one blackout rack sowing, and the
  clock starts at the end of each sow, so the components start staggered — longest first — and
  finish at the same minute. The crop plan's **sow to blackout rack** time is its longest same-day
  component sow.
- **The high end of each range** is the figure the plan reads; the ranges
  are kept.
- **Read from the sow times on file, never a placeholder.** A component with no sow time is a
  gap, listed beside the time. A crop plan with no sow time on file for any component has no first
  load and no daily ceiling.
- **Overnight sows** are ready when the crew arrives and add no same-day minutes.
- **The first blackout rack load** is opening + sow to blackout rack; loading (25 min) starts then. Cycles per
  day run from that first load to the operating day's close. A production day places each crop plan's
  sowings no earlier than its own first load, earliest-ready first.
- **Adult units** are the same units with larger protein units and read their student unit's
  sow times. A larger unit changes the sowing size, not the sow time.

Within groups 1 and 2 no crop plan is more than 60 minutes from its first load (the longest group 1–2
sow is 60 minutes); loading completes 25 minutes after that.

## 4. The standards mapped onto the crop plan library

Student crop plans AMK-E-001 … AMK-E-011; AMK-A-002 … AMK-A-011 read the student row. Times are the
plan figure (high end).

| Crop plan | Hot component | Process (§2) | Plan time | Gap |
|---|---|---|---|---|
| AMK-E-002 Regenerative Beef & Black Bean Bowl | Beef & bean mix | Fajita vegetables and ground beef | 20 min | The black beans in the mix |
| | Spanish rice | Starches and grains | 55 min | — |
| AMK-E-003 Hill Country Smoked Chicken & Sweet Potato Hash | Smoked chicken | Smoked chicken thighs (jar stand) | 120 min | — |
| | Sweet potato hash | Roasted root vegetables | 45 min | — |
| | Green beans | Steamed vegetables | 12 min | — |
| AMK-E-004 Gulf Coast Fish & Crispy Potatoes | Fish bites | Fish bites and meatballs | 20 min | — |
| | Crispy potatoes | Roasted root vegetables | 45 min | — |
| | Carrots | Steamed vegetables | 12 min | — |
| AMK-E-005 Texas Farmhouse Chicken Salad | Chicken salad | Diced or sliced chicken (25 min stated) | 25 min | — |
| AMK-E-006 Three-Bean & Root Vegetable Texas Chili | Chili | Texas chili | 180 min | — |
| | Roasted zucchini | — | — | Zucchini is not named |
| AMK-E-007 Pasture-Raised Chicken Fajitas | Fajita chicken | Diced or sliced chicken | 25 min | — |
| | Fajita vegetables | Fajita vegetables and ground beef | 20 min | — |
| | Black beans | — | — | No sow time |
| AMK-E-008 Regenerative Meatballs with Hidden-Veg Marinara | Meatballs | Fish bites and meatballs | 20 min | — |
| | Penne | Starches and grains | 55 min | — |
| | Marinara | Marinara sauce | 60 min | Roasting the carrots and spinach blended in |
| AMK-E-009 BBQ Pulled Pork with Green Apple Cabbage Slaw | Pulled pork | Overnight low and slow | overnight | Shredding after the morning pull |
| AMK-E-010 Roasted Squash & Corn Enchilada Casserole | Enchilada casserole | Enchilada casserole | 60 min | Roasting the squash and corn and assembling the pans before the bake |
| | Pinto beans | — | — | No sow time |
| AMK-E-011 Honey-Garlic Chicken with Sesame Broccoli | Honey-garlic chicken | Diced or sliced chicken | 25 min | — |
| | Brown rice | Starches and grains | 55 min | — |
| | Sesame broccoli | Steamed vegetables | 12 min | — |
| AMK-E-001 Texas Ranch Beef & Bean Bowl (listed last) | Beef and bean base | Fajita vegetables and ground beef | 20 min | The pinto beans in the base |
| | Cilantro-lime rice | Starches and grains (brown rice) | 55 min | — |
| | Roasted vegetables | — | — | Not named |
| | Salsa roja | — | — | Not named |

**Sow to blackout rack, first load at a 07:00 start (the presumed operating day):**

| Crop plan | Sow to blackout rack | First load | Gaps |
|---|---|---|---|
| AMK-E-002 | 55 min (Spanish rice) | 07:55 | 1 |
| AMK-E-003 | 120 min (smoked chicken) | 09:00 | — |
| AMK-E-004 | 45 min (crispy potatoes) | 07:45 | — |
| AMK-E-005 | 25 min (chicken) | 07:25 | — |
| AMK-E-006 | 180 min (chili) | 10:00 | 1 |
| AMK-E-007 | 25 min (fajita chicken) | 07:25 | 1 |
| AMK-E-008 | 60 min (marinara) | 08:00 | 1 |
| AMK-E-009 | 0 min (pork harvested overnight) | 07:00 | 1 |
| AMK-E-010 | 60 min (casserole bake) | 08:00 | 2 |
| AMK-E-011 | 55 min (brown rice) | 07:55 | — |
| AMK-E-001 | 55 min (rice) | 07:55 | 3 |

## 5. What is not settled

1. **Beans other than the chili's.** Black beans (AMK-E-002, E-007) and pinto beans (AMK-E-001,
   E-010) have no sow time. The time study carries "Bean sow (soaked prior day)" at 20 minutes,
   not reconciled with either.
2. **Components with no process:** roasted zucchini (E-006), AMK-E-001's roasted vegetables and
   salsa roja.
3. **Steps before or after a sow with no time:** roasting the marinara vegetables (E-008), roasting
   the squash and corn and assembling the enchilada pans before the bake (E-010), shredding the
   pork after the morning pull (E-009). Where the step comes before the sow, the crop plan's time to
   the blackout rack is longer than the figure shown by that step.
4. **Overnight hot holding.** The pork is roasted and held at 160°F while no crew is scheduled;
   hot holding carries the Food Code limit of 135°F or above (3-501.16).
5. **Header ranges and item ranges differ.** §2.2 is headed 40 to 60 minutes and contains a
   35–45 minute item; the item figures are the ones recorded.
6. **Crop plan text.** The seed library (`_data/crop-plans-seed.ts`) carries the jar stand method text for
   AMK-E-003 and E-009; crop plan rows still `source = 'seed'` in the database take it when
   `pnpm farm:reseed` runs.
