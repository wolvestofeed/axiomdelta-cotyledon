# BUILD PLAN — Lighting: the research recipes, the fixtures on hand, and what it takes to run them

This plan sets out the light recipes the research supports, the light each variety in the database asks for, the fixtures carried over from Vallecito, and the equipment still needed to deliver each recipe at tray height. It is a working draft. Rob has not yet stated the equipment counts and models (§9), so every figure that depends on them is tagged `PLACEHOLDER` or `UNCONFIRMED`.

Related: [`../science-library.md`](../science-library.md) (source register rows 64 to 75), `src/data/inputs-catalog.ts` (`LIGHT_REGIMES`, `LIGHT_FIXTURES`), `src/data/varieties.ts` (`light` on each variety), migrations `0020_farm_dark_racks.sql` and `0021_farm_shelf_lights.sql`.

---

## 1. Scope

1. **The research comes first, then the application data.** The research docs in `docs/` say what each light treatment does. The app's regimes and variety defaults are how those findings were turned into plans. This plan checks the second against the first, then the fixtures against both.
2. **Delivered light is measured, never assumed.** A recipe counts as delivered only when its intensity at tray height has been read with a meter, its spectrum taken from a spec sheet or a spectrometer, and its hours set on a timer.
3. **Approximated and as-studied recipes are kept apart.** The red-to-blue studies used narrowband red and blue diodes. A white-based fixture with red or blue added only approximates them. Each recipe in this plan carries one label or the other.
4. **Out of scope:** sprouts, which grow in the dark, and the germination and blackout stages, which run on dark racks (migration 0020). This plan covers the light stage and the harvest window.

## 2. What the research says

The source docs are *Optimal Agronomic Practices for Microgreens: Growth Media and Lighting Optimization* (the copy named "… 2.docx" is identical and can be removed), *Clinical Research and Blend Optimization for Specific Microgreen Varieties*, *Microgreens Nutritional Research Data*, and *MIXED TRAY R&D*.

| Treatment | Wavelengths | What it does | Crops studied | Register row |
|---|---|---|---|---|
| Red-dominant (R:B 5 to 9) | Red 600–700 nm | Most fresh weight and dry matter; dilutes phytochemicals. 100% red gives the lowest antioxidant levels | Multiple | 68 |
| Balanced R:B 5:1 | Red + blue | Cited balance for broccoli: height, fresh weight, glucosinolates and antioxidants together. 75:25 gave the highest nitrogen | Broccoli | 68 |
| Blue-rich R:B 25:75 | Blue 400–500 nm | +15 to 20% bioavailable iron in broccoli versus monochromatic light | Broccoli | 68 |
| 100% blue | Blue 400–500 nm | +16.3% total antioxidant activity in radish and broccoli; maximizes phenolics in pea; compact growth, thicker leaves | Radish, broccoli, pea | 68, 70 |
| Blue-rich, blends | Blue | Raises rosmarinic acid in borage and anthocyanins in radish. The *Blend* doc uses R:B 1:1 for borage, radish, amaranth and chia | Borage, radish, amaranth, chia | 68 (via *Blend* doc) |
| Low light + far-red | 700–800 nm, 20% of total photon flux, 50–75 µmol/m²/s | Sharply raises vitamin C and total glucosinolates; longer hypocotyls and more fresh weight | Broccoli | 73 |
| Low intensity | 50–70 µmol/m²/s | Optimum for broccoli weight and phytochemicals; above 100 slows growth and builds damaging ROS | Broccoli | 73 |
| High intensity | 330–440 µmol/m²/s | Carotenoid peak in red pak choi; lower at 110 and at 545 | Red pak choi (not grown here) | 72 |
| Continuous light (24 h) | Any spectrum | More fresh and dry weight, mild oxidative stress, raised antioxidant enzymes, no visible damage | Arugula, broccoli, mizuna, radish | 75 |
| Green deprivation (R+B only) | No 500–600 nm | More macro- and micro-mineral uptake and nitrogen | Sage, cannabis (not microgreen crops here) | 69 |
| UV-C, acute | ~254 nm, about 10 min | Reported to double chlorophyll and raise carotenoids, glucosinolates and betalains | Microgreens; broccoli, cabbage, amaranth per *Blend* doc | 74 |

The *MIXED TRAY R&D* doc applies these as finishing protocols:

- 25:75 R:B for the last 3–4 days (red cabbage and buckwheat)
- 24-hour light for the last 48 hours (legume and radish tray)
- 10 minutes of UV-C a few days before harvest
- 5:1 R:B at 150–200 µmol/m²/s for legume trays, to keep stems from lodging
- 5:1 as the default for blends

## 3. What the database asks for

### 3.1 Regimes (`LIGHT_REGIMES`)

| Regime | R:B | Far-red share | PPFD target (µmol/m²/s) | Hours a day | UV-C | Label |
|---|---|---|---|---|---|---|
| Yield | 7:1 (SOURCED, range 5–9) | 0 | 150 PLACEHOLDER | 16 STATED | 0 | as studied only on narrowband R+B |
| Balanced 5:1 (default) | 5:1 SOURCED | 0 | 100 PLACEHOLDER; broccoli 50–70 | 16 STATED | 0 | as studied only on narrowband R+B |
| Nutrition-forward blue | 1:3 (25:75) SOURCED | 0 | 100 PLACEHOLDER | 16 STATED | 0 | as studied only on narrowband R+B |
| Low light + far-red | 5:1 PLACEHOLDER base | 0.20 SOURCED | 60 SOURCED (50–75) | 16 STATED | 0 | needs a far-red channel |
| Continuous | 5:1 PLACEHOLDER (any) | 0 | 180 labelled SOURCED (see §4.1) | 24 SOURCED | 0 | any fixture |

The schema has a `uvcMinutes` field, but no regime uses UV-C. Daily light integral (DLI) is computed as PPFD × hours × 3600 ÷ 1,000,000.

### 3.2 Variety defaults (`varieties.ts`)

| Variety | Default regime | Variety PPFD | Light notes on record |
|---|---|---|---|
| Di Cicco broccoli | Balanced | 50–70 (row 73) | 5:1; 25:75 for iron; 20% far-red; continuous |
| Rambo purple radish | Nutrition-forward | — | 100% blue +16.3% antioxidants; continuous |
| Red Acre cabbage | Nutrition-forward | — | Blue-rich raises anthocyanins and phenolics; continuous |
| Red garnet amaranth | Nutrition-forward | — | — |
| Black oil sunflower | Balanced | — | — |
| Speckled pea | Balanced | — | Blue maximizes phenolics |
| Fenugreek | Balanced | — | — |
| Borage | Balanced | — | The *Blend* doc puts borage on blue-rich light; the variety has no note |
| Chia | Balanced | — | The *Blend* doc puts chia on blue-rich light; the variety has no note |
| Mung bean, red lentil, hard red winter wheat | — | — | Sprouts, grown dark |

Light stage on record: four days for broccoli and sunflower (Vallecito, DATED).

## 4. Data corrections to make

- [ ] **4.1 Continuous-light PPFD.** The regime carries 180 µmol/m²/s labelled SOURCED, taken as "DLI 15.6 over 24 h". The study's two DLIs, 15.6 and 23.3 mol/m²/day, both equal about 270 µmol/m²/s, run for 16 h and for 24 h. That reads as a 16-hour versus 24-hour comparison at one intensity, with 24 h at about 270. Retag UNCONFIRMED until the methods section of row 75 (PMC8781578) is read; PubMed Central refused an automated read on 2026-10-02.
- [ ] **4.2 Mars VG80 fixture row.** The manufacturer's sheet lists one VG80 as two 40 W bars:
  - 80 W in all
  - 155 µmol/s
  - 1.98 µmol/J
  - 4800–5000 K white, plus 455–465 nm blue and 650–665 nm red
  - not dimmable
  - 1150 mm long

  The row carries 80 W a fixture and two a shelf, which is 160 W. Confirm whether "two Mars lights a shelf" means two kits (four bars) or two bars (one kit). The row's `delivers` R:B 3–5 has no source; retag it PLACEHOLDER until a spectrum is read.
- [ ] **4.3 Barrina T5 fixture row.**
  - The ML20 line is 20 W a tube, not dimmable, with an on/off switch on each tube. The 20 W is now SOURCED, which closes the to-do item.
  - Barrina sells the ML20 in pink full-spectrum, 5000 K and 6500 K. Confirm which tubes are on hand; the row says 6000 K.
  - Barrina publishes no PPF. The PPFD (120) and R:B (2–3) stay PLACEHOLDER.
- [ ] **4.4 VIVOSUN.** It is named on the supplier record but has no `LIGHT_FIXTURES` row. Add one for each square panel once the models are stated.
- [ ] **4.5 White-spectrum R:B.** A 5000–6500 K white LED puts roughly as many photons in blue as in red, about 1:1 to 2:1, and a large share in green (estimate, to replace with a measured spectrum). No white fixture on hand reaches 5:1 or 25:75 without added channels.
- [ ] **4.6 Borage and chia.** The *Blend* doc assigns them blue-rich light; the variety rows default to Balanced. Rob to state which governs.
- [ ] **4.7 Duplicate research doc.** Remove "Optimal Agronomic Practices … 2.docx", which is identical to the first copy.

## 5. Fixtures on hand (from Vallecito)

| Fixture | What is on record | Count on hand | Per shelf | Tag |
|---|---|---|---|---|
| Mars Hydro VG80 (4 ft, 2 × 40 W bars a kit) | Five units bought for $450 for the starter rack; also listed as $85 a pair (Vallecito 2023); 2023 PPFD map in the Vallecito admin folder: 250 µmol/m²/s at tray centre | Rob to state (bars and kits) | Two "lights" (STATED; see 4.2) | DATED / UNCONFIRMED |
| Barrina T5 ML20 (4 ft, 20 W) | 6-pack for $45 (Vallecito); "6000 K" | Rob to state | Three (STATED) | DATED / UNCONFIRMED |
| VIVOSUN square LED panels | Two, "very different" from each other (Rob) | 2 (STATED) | — | Model, wattage and spectrum UNCONFIRMED |
| 6 ft LED 4-packs | Line in the nutrient-flow rack design, 2 × $206 | Planned; bought or not unknown | — | UNCONFIRMED |

Racks: the Vallecito starter rack was a 6-tier 24 × 48 in shelf. A 48 × 24 in shelf is 0.743 m² and holds four 1020 flats (0.516 m² of trays). The number of lit shelves in South Austin is for Rob to state.

## 6. How the fixtures fit the recipes (estimates until measured)

All figures below are estimated from the spec-sheet PPF over a 0.743 m² shelf, assuming about 75–80% of the light lands on the trays. Each one is replaced by a meter reading in L0.

| Shelf setup | Watts | Estimated tray PPFD (µmol/m²/s) | Recipes it can serve |
|---|---|---|---|
| Two VG80 kits (4 bars) | 160 | ~250–330 (2023 map: 250 centre) | Over every target except continuous (~270) and the pak choi range |
| One VG80 kit (2 bars) | 80 | ~150–165 | Yield (150); legume trays (150–200) |
| Three Barrina | 60 | ~100–120 (no PPF published) | Balanced (100), Nutrition-forward (100) on intensity only |
| Two Barrina | 40 | ~65–80 | Broccoli (50–70); far-red base (50–75) |
| VIVOSUN panels | — | Unknown | If one is a red/blue ("blurple") panel, it is the closest fixture on hand to the as-studied R:B treatments |

**What this shows:** the fixtures already make more light than most recipes ask for. What's missing is a way to read the light, to set its intensity, and to add separate blue, red and far-red channels. The Mars and Barrina are not dimmable, so today intensity can be set only by how many fixtures or tubes are lit and how high they hang.

## 7. Gap by recipe

| Recipe | Delivered today? | What it needs |
|---|---|---|
| Balanced 5:1 | Approximated at best; white light is about 1:1 to 2:1 | Added 660 nm red (Mars VG80 Red, 650–665 nm, 209 µmol/s, 80 W, daisy-chains with the VG80). Because the red bar adds intensity, the white light must come down (fewer tubes or kits) to stay near 100 |
| Nutrition-forward 25:75 | No | Added 450 nm blue bars over a reduced white base, or a narrowband/blurple fixture |
| Blue for the last 3–4 days | No | Blue channel on its own timer |
| Yield 7:1 | No | More red than balanced; same channel as above |
| Low light + far-red | No | 730 nm far-red bar: about 12–15 µmol/m²/s at the tray over a ~60 µmol base (two Barrina). One small bar per shelf, raised or switched |
| Continuous 24 h (whole cycle or last 48 h) | Yes, in hardware | A timer per shelf; confirm the target PPFD (§4.1); heat and power checked at 24 h |
| Green deprivation | No | Narrowband R+B only; no white. Low priority: studied in non-microgreen crops |
| UV-C 10 min | No | Germicidal 254 nm in an enclosed, interlocked treatment box on a timer. UV-C burns eyes and skin, so never on open shelves. Horticultural "UV" bars (e.g. Spider Farmer UV) are UV-A/UV-B and do not reproduce the cited UV-C protocol |

## 8. Build phases

### L0 — Measure what is on hand
- [ ] Rob states the inventory (§9.1) and the space (§9.2).
- [ ] Buy a full-spectrum quantum PAR meter (Apogee MQ-500 class). For far-red, the ePAR version reads to 750 nm; a 400–700 nm meter does not see far-red.
- [ ] Read PPFD at tray height for each setup in §6 (centre, four corners, mean) at each hanging height in use.
- [ ] Record each fixture's spectrum from its spec sheet, or with a spectrometer if one is bought.
- [ ] Replace the PLACEHOLDER `ppfdAtTray` and `delivers` values in `LIGHT_FIXTURES` with the readings, tagged STATED with the date.

### L1 — Control what is on hand
- [ ] Put a programmable timer on each shelf's circuit: 16 h standard, 24 h finish, and end-of-day steps. At home the timer turns the lights on at 19:00 (Rob, STATED; `HOME_LIGHTS_ON_MIN`), so the 16 h run to 11:00 and the fixtures' heat falls in the night; a commercial facility's start is not stated.
- [ ] Set intensity by count and height: the number of Barrina tubes switched on, one or two VG80 kits, and hanging height. Write the setup for each regime against its reading.
- [ ] Decide whether dimmable fixtures replace the fixed-output ones on any shelf (§10.2).

### L2 — Production spectrum channels
Only for the regimes chosen in §10.1.
- [ ] Red: Mars VG80 Red bars for Balanced and Yield shelves.
- [ ] Blue: 450 nm bars for Nutrition-forward and the blue finish.
- [ ] A separate timer for each added channel.
- [ ] Re-read PPFD and the share each channel contributes after each addition.

### L3 — Far-red and the research shelf
- [ ] One 730 nm far-red bar for the broccoli biofortification recipe.
- [ ] Decide on a fully controllable research shelf: one fixture with separately dimmable white, red, blue and far-red channels, so recipes run as studied. It would tie into the experiments module (`test/farm-experiments.test.ts`) (§10.3).

### L4 — UV-C (decision first)
- [ ] Decide whether UV-C stays in scope (§10.4).
- [ ] If yes: an enclosed treatment box with an interlock and timer, a written operating procedure, and protective equipment. The tray moves into the box for the dose.

### L5 — Into the app
- [ ] `LIGHT_FIXTURES` rows for every fixture on hand, with measured values.
- [ ] Shelf setups recorded through `shelf_lights` (migration 0021).
- [ ] Each regime labelled "as studied" or "approximated" for the setup that delivers it.
- [ ] The UV-C minutes and the finishing protocols (24 h for the last 48 h, blue for the last 3–4 days) carried on the grow plan, if they are adopted.
- [ ] Light cost per tray recomputed from the measured fixtures and shelf counts.

## 9. Information Rob is to supply

1. **Inventory.**
   - Mars: number of bars and kits, and how many bars on a shelf.
   - Barrina: number of tubes and their colour (pink, 5000 K, 6500 K).
   - VIVOSUN: model and wattage from the label on each panel, and whether its diodes are white or red/blue (purple glow), with or without IR or UV.
   - Whether the 6 ft LED 4-packs were bought.
2. **Space.** The number of racks and lit shelves in South Austin, and the clearance from light to tray on each shelf.
3. **The Vallecito Mars PPFD map,** to be read against the new measurements.

## 10. Open decisions

1. **Which regimes run in production first.** Balanced and Nutrition-forward on production shelves, with far-red, continuous and UV-C as experiments? Or all five on production shelves?
2. **Dimming.** Keep fixed-output fixtures and set intensity by count and height, or move some shelves to dimmable fixtures.
3. **Research shelf.** One multi-channel controllable fixture, or added colour bars on every shelf.
4. **UV-C.** In or out, given the eye and skin hazard and the enclosure it needs.
5. **Update log.** The user preference puts an Update Log at the foot of every roadmap; `CLAUDE.md` rule 1 forbids logs in `docs/`. This file follows `CLAUDE.md` until Rob states which governs.

## 11. Sources consulted for the equipment

- Mars Hydro VG80 specifications — https://www.mars-hydro.com/vg80-80w-vegetable-led-grow-light
- Mars Hydro VG80 Red (650–665 nm) — https://www.mars-hydro.com/vg80r-red-led-grow-light
- Barrina T5 ML20 20 W — https://barrina-led.com/products/t5-led-grow-light-4ft-20w-full-spectrum-linkable-8-packs-ml20
- Barrina T5 ML20 5000 K — https://barrina-led.com/products/barrina-t5-20w-led-grow-light-4ft-5000k-full-spectrum-linkable-ml20
- Spider Farmer UV/IR supplemental bars — https://spider-farmer.com/collections/led-grow-light/supplemental-light/uv-ir-deep-red-supplemental-light-bar
- Photontek 50 W far-red bar — https://trimleaf.com/products/photontek-50w-far-red-led-bar-light
- Apogee MQ-500 quantum meter — https://hydrobuilder.com/products/apogee-instruments-mq-500-full-spectrum-quantum-meter
- VIVOSUN VS2000 — https://vivosun.com/-p68320123310964736-v58820960379612621

Prices for the add-on equipment are not on record; each is quoted when its phase is approved.
