# Spec sheet — 1020 Pre-cut Hemp Mats for Microgreens, Bootstrap Farmer

The hemp fiber mat under every tray the farm grows: the default medium of the Media library (`hemp-mat` in `src/data/inputs-catalog.ts`). Every figure here is the supplier's own, as published on its product page; the page is registered on the Sources page as a spec sheet (`bootstrap-farmer:hemp-grow-mats` in `src/data/sources-registry.ts`).

- **Product:** 1020 Pre-cut Hemp Mats for Microgreens ("Hemp Grow Mats")
- **Supplier:** Bootstrap Farmer, Paris, TX
- **Page:** https://www.bootstrapfarmer.com/products/hemp-grow-mats
- **Also sold as:** a 5-inch mat, https://www.bootstrapfarmer.com/collections/new-products/products/5-hemp-grow-mats

## Specifications

| Attribute | As published | Tag | Where the app reads it |
|---|---|---|---|
| Size | Pre-cut to fit a standard 1020 microgreens tray | SOURCED | One mat per 1020 tray on the medium line |
| Grade | 300 gsm (g/m²) | SOURCED | `HEMP_MAT_GRADE_G_PER_M2`: the mat's mass in the tray footprint |
| Material | Industrial hemp fiber | SOURCED | The medium's traits |
| Made in | Alberta, Canada | SOURCED | The mat's origin; the mill's town is not published |
| pH | Neutral | SOURCED | The medium's traits |
| Water held | Hemp fibers hold 1050% of their weight in water | SOURCED | The medium's traits |
| Watering | Capillary action draws water to the seed; sown directly on the mat, saturated and kept moist through the grow | SOURCED | The stage schedule's bottom watering |
| End of life | 100% biodegradable and compostable | SOURCED, a supplier statement | The mat's end-of-life line; the compost share is a setting |
| Carbon | "Carbon capturing" | SOURCED, a supplier statement | Noted, never netted from the footprint (Phase 5, decision 6) |
| Crops | Microgreens, wheatgrass and sprouts | SOURCED | — |

## Derived

| Figure | Arithmetic | Tag |
|---|---|---|
| Mass of one mat | 1020 inside area 21 × 10¾ in = 0.1456 m² × 300 g/m² = 43.7 g | DERIVED |
| Water one mat can hold | 43.7 g × 10.5 = 459 g, about 15.5 fl oz | DERIVED |

## Price and shipping

| Pack | Price a mat | Tag |
|---|---|---|
| 10 mats | $2.90 ($28.99 a pack) | SOURCED, read 5 October 2026 |
| 140 mats | $1.72; Rob paid $241 for 140 with no shipping | SOURCED on the page; STATED for the purchase |

Ships from Texas; free shipping on orders over $75 in the contiguous United States.

## Not published

- The mill in Alberta and where the hemp is grown: the leg from Alberta to Paris, TX is not in the freight figure, which runs Paris, TX to the home pin.
- A life cycle figure for the fiber or the mat: no factor is on file, so the fiber's production carries no CO2e in the tray footprint.
- Thickness, and the mat's dry weight as packed.
