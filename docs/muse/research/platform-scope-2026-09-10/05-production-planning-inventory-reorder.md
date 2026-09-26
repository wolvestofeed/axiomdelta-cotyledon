# Module 05 — Production Planning, Inventory and Reorder

> **Scoping record, 2026-09-10.** Moved into the repo on 2026-09-14 from the confidential source
> folder; the scope that became Roadmap Phases D/H and the planning loop. Historical: where it disagrees with `../../roadmap.md`, the roadmap is current.

> **SOURCE OF TRUTH.** Every figure traces to a tagged row in
> [`Research/RESEARCH.md`](../Research/RESEARCH.md). If a number is not there, it does not go here.

**Decision 2026-09-10 (Robert):** the platform owns inventory and reorder logic. The spreadsheet carries
a single-day sketch of it only, enough to prove the logic and to show the constraint. Anything that
requires lot-level state, history or multi-day projection belongs here.

---

## Why this module exists

Cook-chill decouples production from service. A meal shipped Tuesday was produced days earlier and pulled
from finished inventory. That is the whole economic advantage of the blast chiller, and it means the
planning question is never "what do we cook today for today." It is:

1. What did we ship, and what is left?
2. How many days of cover does that leave?
3. Are we below the reorder point?
4. How many **whole batches** does that trigger?
5. Does the chiller have the cycles to run them?
6. Is anything in the walk-in about to age out of hold life?

A spreadsheet can answer 1 through 5 for one day. It cannot answer 6 at all, because 6 needs lot-level
state that persists.

## The constraint chain

Batch size is **derived, not chosen**. It comes off the smallest capacity in the chain, which in a
cook-chill kitchen is the blast chiller.

```
blast chiller capacity (lb/cycle)
        ÷ chilled mass per portion (lb)          [from the recipe's cooked yields]
        = portions per cycle
        → rounded down = STANDARD BATCH SIZE
        × cycles available per day               [chill window ÷ cycle time]
        = maximum portions per day
```

Modeled today: 2 units × 200 lb = 400 lb per cycle · 0.722 lb per portion · **550 portions per batch** ·
4 cycles per day · **2,200 portions per day maximum**. All `[PLACEHOLDER]` pending real equipment specs.

## What the platform must do that the spreadsheet cannot

- **Lot-level inventory.** Every batch is a lot with a production date, a quantity, a hold-life expiry and
  a location. FIFO draw against ship orders. This is also the traceability requirement from HACCP.
- **Ageing and expiry alerts.** Days remaining on every lot, flagged before it becomes waste rather than
  after. The spreadsheet can only compare aggregate days-of-cover against hold life, which hides a single
  old lot inside a healthy average.
- **Multi-day projection.** Forecast forward across the school calendar, corporate bookings and retail
  demand, and show when the chiller becomes the binding constraint before it happens.
- **Whole-batch reorder triggers per recipe**, not per aggregate. Each SKU has its own batch size because
  each has its own chilled mass per portion.
- **Forecast accuracy tracking.** Forecast versus actual shipped, by site and by day. This is what turns
  the carrying-inventory gap into a number somebody can manage.
- **Capacity scheduling.** Chiller cycles, kettle loads, combi racks and oven time as bookable resources
  against the two shifts, so a plan that does not fit is rejected at planning time, not at 14:00.
- **Overproduction carry-forward.** Whole-batch production always overshoots demand. That overshoot is
  inventory while it is inside hold life and waste the moment it is not. The platform is what knows which.

## What stays in the spreadsheet

A one-day sketch: opening inventory, forecast draw, target cover, shortfall, whole batches triggered,
portions produced, closing inventory, days of cover, hold-life check, chiller capacity check, and the
labor those batches actually cost. It exists to prove the logic and to make the constraint visible in a
document somebody can read in an interview. It is not an operating system.

## Labor costing note

Labor is **fixed per batch plus variable per portion**, never a flat throughput rate. From the time study:
285 fixed labor minutes per batch (receiving, kettle and combi loads, salsa, cold hold, sanitation) and
750 variable minutes spread across the batch. Roughly 28% of a full batch's labor does not scale. That is
why a runt batch is expensive and why the platform must plan in whole batches.

## Open

- Real blast chiller capacity, cycle time and pan configuration from a spec sheet, not a placeholder
- Real chilled mass per portion, weighed, per recipe
- Whether hold life is 14 or 30 days, which changes days-of-cover economics substantially
- Whether the chiller stays the binding constraint once real batch weights are checked against kettle,
  skillet and combi capacity

## Update Log
- 2026-09-10 — File created empty.
- 2026-09-10 — Scoped. Robert decided the platform owns inventory and reorder logic and the spreadsheet
  carries only a single-day sketch. Documented the constraint chain, the lot-level requirements the
  spreadsheet cannot meet, and the fixed-plus-variable labor rule.
