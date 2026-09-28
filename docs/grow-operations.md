# MicroFarm — Grow Operations

How a tray is grown: the stages a sowing runs through, the days each variety spends in them, the watering and the checks at each stage, the labor a tray takes, and how the grow calendar places a sowing on a grow unit. The domain terms are defined in [`outline.md`](outline.md) §4 and [`glossary.md`](glossary.md); the engine rules they obey are `outline.md` §5. The figures here are the ones the app runs on, each with its provenance tag.

The registers are `src/data/stage-schedule.ts` (the stages, watering, water volumes), `src/data/varieties.ts` (the days per stage for each variety), `src/engine/produce-safety.ts` (the control points), `src/data/time-studies.ts` (Vallecito's tray study) and `src/engine/grow-calendar.ts` (placement on the grow units).

---

## 1. The stages

A microgreen tray runs soak → sow and weight → germination → blackout → light → harvest window → packed. Day 0 is the sow date; the soak runs the day before it. A tray holds its grow unit from the sow day to the end of the harvest window.

| Stage | What happens | Watering | Waterings a day | Control point | On a grow unit | Under light |
|---|---|---|---|---|---|---|
| Soak | Large seed soaks in cold water for the variety's soak hours after seed sanitation; small seed skips it | — | 0 | Seed sanitation | no | no |
| Sow and weight | Medium filled and levelled, seed spread at the format's density, a weighted tray on top so roots go down and stems come up straight | mist | 1 | — | yes | no |
| Germination | Weighted and covered, misted from above, temperature and humidity logged | mist | 2 | Temperature and humidity | yes | no |
| Blackout | Weight off, cover on; the seedlings stretch up in the dark | mist | 1 | — | yes | no |
| Light | Cover off, under the plan's light line; bottom watered once roots reach through the perforated tray, and a nutrient line that starts here goes in the water | bottom | 1 | Temperature and humidity | yes | yes |
| Harvest window | Cotyledons full, first true leaves showing; a live tray is distributed in the window, cut greens are harvested from it | bottom | 1 | Harvest check | yes | yes |
| Packed | The unit leaves the grow unit: a live tray with its care insert, a jar, or cut greens weighed into their pack | — | 0 | — | no | no |

A sprout in a jar runs a shorter schedule: soak, then rinse and drain, then its harvest window. The jar sits inverted on its stand in the dark and is rinsed and drained three times a day; spent rinse water is tested before any batch is distributed.

| Stage | Watering | Waterings a day | Control point |
|---|---|---|---|
| Soak | — | 0 | Seed sanitation |
| Rinse and drain | rinse | 3 | Spent sprout irrigation water test |
| Harvest window | rinse | 1 | Harvest check |

## 2. Days per stage, by variety

The days are each variety's, on its record; a grow plan may override them, and a blend runs on the slowest of its varieties at each stage. Days to harvest is the sow day through the last day before the harvest window; the cycle adds the window.

| Variety | Soak | Sow | Germination | Blackout | Light | Harvest window | Days to harvest | Cycle | Tag | Basis |
|---|---|---|---|---|---|---|---|---|---|---|
| Di Cicco broccoli | 0 | 1 | 3 | 3 | 4 | 3 | 11 | 14 | DATED | Germination 2 to 3, blackout 2 to 4, harvest 8 to 12 (supplier); Vallecito ran a 4-day light cycle |
| Rambo purple radish | 0 | 1 | 3 | 2 | 4 | 3 | 10 | 13 | DATED | Germination 2 to 3, blackout 1 to 2, harvest 6 to 10 (supplier) |
| Black oil sunflower | 0 | 1 | 3 | 2 | 4 | 3 | 10 | 13 | DATED | Harvest 7 to 10 (supplier); Vallecito 4-day light cycle |
| Speckled pea | 0 | 1 | 3 | 4 | 4 | 4 | 12 | 16 | DATED | Germination 2 to 3, blackout 3 to 5, harvest 8 to 14 (supplier) |
| Fenugreek | 0 | 1 | 3 | 2 | 4 | 3 | 10 | 13 | STATED | Blackout 2 to 3, harvest 7 to 10 (Vallecito research database) |
| Borage | 0 | 1 | 3 | 3 | 6 | 4 | 13 | 17 | DATED | Days to maturity 10 to 20 (supplier) |
| Red garnet amaranth | 0 | 1 | 3 | 3 | 4 | 3 | 11 | 14 | DATED | Germination 2 to 3, blackout 2 to 4, harvest 8 to 12 (supplier) |
| Red Acre cabbage | 0 | 1 | 3 | 3 | 4 | 3 | 11 | 14 | DATED | As broccoli |
| Chia | 0 | 1 | 3 | 3 | 5 | 3 | 12 | 15 | DATED | Germination 2 to 3, blackout 2 to 4, harvest 8 to 12 (supplier); Vallecito research 10 to 14 |
| Mung bean | 1 | 0 | 3 | 0 | 0 | 1 | 3 | 4 | DATED | 2 to 4 days to harvest, rinsed 2 to 3 times a day |
| Red lentil | 1 | 0 | 3 | 0 | 0 | 1 | 3 | 4 | DATED | 2 to 4 days to harvest, rinsed 2 to 3 times a day |
| Hard red winter wheat | 1 | 0 | 4 | 0 | 0 | 1 | 4 | 5 | DATED | 4 to 5 days to maturity |

For the sprouts (mung bean, red lentil, wheat) the germination days are the rinse-and-drain days.

## 3. Control points

Each control point is recorded on the sowing it applies to; a sowing's record at each point is recorded, a gap, or failed, computed from the record, and a gap is never a pass. The limits are verified with Austin Public Health before adoption.

| Control point | Stages | Applies to | Critical limit | Tag | Monitoring | Record |
|---|---|---|---|---|---|---|
| Seed sanitation | soak | every plan | Sprout seed is treated with a scientifically valid method immediately before sprouting (21 CFR 112.142); the treatment, its concentration and contact time are recorded per lot. Microgreen seed follows the same treatment record until the produce safety plan states otherwise | SOURCED | The treatment, concentration, contact time and seed lot on every soak, entered on the sowing record by the person who treated the seed | Seed treatment record on the sowing |
| Spent sprout irrigation water test | rinse and drain | jar plans | Spent irrigation water from each batch is tested for Listeria species, Salmonella and E. coli O157:H7, no earlier than 48 hours after sprouting starts; no batch is distributed before a negative result (21 CFR 112.144, 112.147) | SOURCED | A sample of the spent rinse water from every jar batch is sent to the laboratory at or after 48 hours; the result is entered against the batch | Spent irrigation water test result on the sowing |
| Temperature and humidity | germination, blackout, light, harvest window | every plan | No band is on file; until the produce safety plan states the range and the reading interval, every reading is recorded and none is judged | PLACEHOLDER | Grow-room air temperature and relative humidity read at the inspection walk-through on the daily stream, with the date and the person | Grow-room readings log |
| Harvest check | harvest window | every plan | Every tray is inspected before it is packed; a tray with visible mold, off-odor, rot at the stem base or foreign matter is not distributed | STATED | The person packing inspects each tray; the count passed and the count removed are entered on the sowing record | Harvest inspection counts on the sowing |

The Produce Safety page shows each sowing's record against these points and traces a failed lot back to its suppliers and forward to the pickup points it reached.

## 4. Labor per tray

Labor runs on three streams (`outline.md` §5 rule 3). Until a plan's own study is observed and adopted, it runs on Vallecito's 2023 time study of one 1020 tray through its cycle (DATED), at one person on every task.

| Stream | Task | Station | Minutes per tray |
|---|---|---|---|
| Sowing, on the sow day | Supplies transfer and receiving in | Prep station | 1 |
| | Receiving and sorting seed | Prep station | 1 |
| | Prep station | Prep station | 1 |
| | Prep trays | Prep station | 1 |
| | Sow trays | Prep station | 3 |
| Daily, over the stage it covers | Germination watering | Grow rack | 1 |
| | Blackout watering | Grow rack | 1 |
| | Watering under lights | Grow rack | 3 |
| | Nutrient preparation | Prep station | 1 |
| | Inspection and sanitization | Grow rack | 5 |
| Harvest, on the distribution day | Prep harvest station | Harvest station | 1 |
| | Harvest tray with knife (cut trays only) | Harvest station | 5 |
| | Weigh harvest (cut trays only) | Harvest station | 1 |
| | Packaging and labels | Harvest station | 1 |
| | Clean station | Harvest station | 1 |

A live tray takes 7 minutes on the sow day, 11 over its cycle and 3 at harvest: 21 in all. A cut tray takes 9 at harvest, 27 in all. The estimate spreads each daily task's minutes evenly over the plan's cycle days; a jar plan skips the blackout watering, the watering under lights and the nutrient preparation. The Day Schedule places the sowing and harvest streams on the clock; the daily stream is listed beside it for the trays on the shelves that day.

## 5. Water

Watering is measured in fluid ounces; every other volume (media, nutrient strength, metered water) is in gallons. Volumes per 1020 tray (or pint jar) per watering are PLACEHOLDER until observed: a misting pass 1 fl oz, a bottom watering 14 fl oz on average, a jar rinse 16.9 fl oz. The rinse is the sprout jar's; a live tray has none. Water per tray per day is the volume per watering times the waterings that day. A nutrient line's strength is ml per gallon, and its volume over the cycle is the waterings from the stage it starts times these volumes. A time study records the ounces per watering by method and the supplements applied to the sowing it times; once a study is approved, the average of the plan's approved studies stands over these volumes, and a measured ml per tray over the line's strength.

## 6. Placing a sowing

- A sowing is the whole trays a plan's orders need, one flat the least, sown on the day its days to harvest end on the distribution day. A grow unit holds trays per 48-inch shelf (four 1020 flats, SOURCED) scaled to the shelf width, times the shelves; a sowing larger than that is split across units. A plan with a light line goes on any lit unit, its dark days on a dark rack where one has room; a rack's lights are set shelf by shelf, each shelf a fixture and how many of it (two Mars VG80, three Barrina T5).
- The sow date for a distribution date is that date less the plan's days to harvest, moved back to a production day.
- The grow calendar holds a sowing on its unit for every day of its cycle; a sowing no unit has room for is a shortfall, never squeezed onto a shelf.
- A sowing's trays are stock from the first day of its harvest window, and shelf life counts from there.

## 7. Not settled

- The grow-room temperature and humidity band for the temperature-and-humidity control point.
- Watering volumes, until a watering log observes them.
- Sprouts in or out of the first menu, pending the FSMA Subpart M check for Texas (`todo.md`).
- Observed stage days: every row in §2 is the supplier's or Vallecito's figure until closed sowings record their own.
