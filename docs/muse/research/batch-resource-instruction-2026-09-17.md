# INSTRUCTION — A batch binds to one unit; concurrent units are a multi-batch run

**For: the coding agent working the Muse build.**
**Author: facility-design pass, 2026-09-17. Robert's direction, verbatim below.**

This **supersedes the "Solution" of ISSUE-13** in
[`model-and-chiller-corrections-instruction-2026-09-13.md`](model-and-chiller-corrections-instruction-2026-09-13.md),
which said to keep lockstep aggregation for the closed-form capacity headline. Robert has ruled
against lockstep at the batch bound. The diagnosis in ISSUE-13 stands; its remedy does not.

Related: this is the engine side of Roadmap Phase Q finding 8
([`../roadmaps/facility-design-roadmap.md`](../roadmaps/facility-design-roadmap.md) §10).

---

## 1. Robert's direction (2026-09-17)

> "Just because we add a piece of equipment doesn't mean every recipe automatically gets doubled in
> size and the batch doubles just because we have two pieces of equipment. The whole point is that
> you can run two different recipes at the same time and stagger your production."

> "All resources have the possibility of operating in fluctuating production workflows. Some orders
> may prompt a production run that uses two lines and both chillers at the same time, but it will be
> registered as running a double batch."

Two rules follow, and they are the whole of this instruction:

1. **A batch is bounded by ONE unit of each vessel it passes through** — one cabinet, one kettle,
   one skillet, one combi. Never the sum of the units on the list.
2. **Concurrency is expressed as a count of batches, never as a larger batch.** A run that seizes
   two lines and both cabinets at once is a **double batch**: two batch records executing in
   parallel, each bound by its own vessel, not one batch of twice the size.

## 2. The defect

`batchBounds()` and `deriveCapacity()` in `_engine/index.ts` compute each vessel's bound as
`capacityLb × units`:

```
lbPerCycle = chiller.capacityLb * chiller.units
portions   = (vessel.capacityLb * vessel.units) / lbPerPortion
```

So two 200 lb blast chillers become one 400 lb cabinet, and two 20-pan combis become one 40-pan
load. Every downstream figure inherits it: batch size, batch costing, the fixed-per-batch half of
the labor standard, whole-batch rounding, normal-capacity absorption, the planning loop.

It also contradicts the equipment library's own seed. `RESOURCE_SEED` in `_data/capex.ts` sets
`concurrentBatches: 1` on the blast chiller with the note *"One batch a cabinet load."* The library
says one cabinet is one batch; the engine says two cabinets are one batch. Both cannot be true.

**This became live on 2026-09-17**, when both blast chillers moved to Phase 1 (facility-design
roadmap §2 decision 6). Until it is fixed, every batch size in the library is overstated — not one
edge case.

## 3. What to change

**3.1 The bound drops the multiplication.** In `batchBounds()` and `deriveCapacity()`, a vessel's
bound is `capacityLb / lbPerPortion` for one unit. `BatchVessel.units` stops being a capacity
multiplier and becomes what it actually is: how many independent resources of that kind exist.

**3.2 The daily ceiling stops being a division.** `maxPortionsPerDay = batchSize × cyclesPerDay`
describes one serial stream through one cabinet. With N independent units it is a placement result,
not arithmetic — ISSUE-13's "model each cabinet as its own resource with its own occupancy blocks"
is the part of that issue that still holds. Until the scheduler produces it, the Capacity page's
headline is the **one-stream** ceiling and must be labelled as such, not as the plant ceiling.

**3.3 A multi-batch run is N batch records.** *Superseded 2026-09-17 by Robert's answer to §5: the
cook is the lot, so a double batch is ONE batch record with `batchesRun` 2 — one lot per component,
one mass balance, labor as fixed × loads + variable × portions — and one CCP-2 cooling record per
cabinet load. On the plan and the schedule it is still two batches on two cabinets; the record that
closes them is one. Original text follows.* A run using two lines and both cabinets registers as a
double batch: two records, each with its own vessel occupancy, its own mass balance, its own labor.
Nothing about three-stage WIP, batch costing or `productionBatchLedger()` changes — they are already
per batch record, which is exactly why the batch must not silently grow.

**3.4 Do not assume parallelism is free.** ISSUE-13's arithmetic still applies: whole-batch rounding
on the smaller per-unit batch can eat the staggering gain. The Gantt exists to produce that result.
Do not pre-judge it in either direction, and do not "optimise" toward either shape.

**3.5 ISSUE-14 gets sharper, not softer.** With the bound on a single unit, whether a cooking vessel
binds before the chiller is now decided per recipe rather than assumed. It already happens: on the
current library AMK-E-005 binds on the tilting skillet, not the chiller. The constraint chain must
name the vessel that actually binds, recipe by recipe.

## 4. What this reaches

- `_engine/index.ts` — `batchBounds`, `deriveCapacity`, and anything reading `CapacityProfile`
- `_engine/equipment.ts` — `batchVesselsFrom` and the meaning of `BatchVessel.units`
- `capacity/page.tsx` — the constraint chain, the ceiling headline and its label
- `_engine/production-plan.ts` — `ceilingByRecipe`, and the planning loop's `cyclesAvailable`
- The scheduler (Phase L) — units as independent resources with their own occupancy
- **CLAUDE.md §2 invariant 1** — "a batch is one full Phase 1 line" reads as the aggregate. It needs
  restating as one unit of each vessel. That is a CLAUDE.md edit and needs Robert's approval as its
  own change, not a side effect of this one.
- Golden-value tests across capacity, batch costing, labor and absorption. **Every one of these will
  move. Update them by checking that each number moved for the right reason — do not re-baseline.**

## 5. Open question for Robert, not to be decided in code

A double batch is two batch records. Does it carry **one traceability lot code or two**? FSMA 204
keys on the transformation event, and two cabinets loaded from one cook are arguably one
transformation. `_engine/traceability.ts` currently emits per batch record. Flag it; do not choose.

**Answered (Robert, 2026-09-17): one — the cook is the lot.** Two cabinets filled from one cook are
one record and one lot; two cooks of one recipe on one day are two records and two lots. Built the
same day: CLAUDE.md §2 invariant 8a, `coolingLoadsOf` in `_engine/batch.ts`, the Plan timeline's
record per cook.

## 6. Not in scope

This instruction changes engine behaviour only. It does not move any equipment between build phases,
does not enter any capacity target in `plan-data.ts`, and does not touch `phases[].mealsPerDay`. The
1,500 meals/day Phase 1 target is a **verbal placeholder held in documentation only** and is
deliberately not wired to the platform (facility-design roadmap §2 decision 5).
