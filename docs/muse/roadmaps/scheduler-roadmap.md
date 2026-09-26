# BUILD PLAN — Production Planning as a scenario scheduler

**For: the coding agent. Companion to `../research/model-and-chiller-corrections-instruction-2026-09-13.md` — read its
§0 Posture first.** Master roadmap Phase L.

---

## 0. Decisions with Robert

Code comments cite these by number.

1. The four resource attributes are estimated open fields — the same rule as the batch capacities.
2. No overnight activity other than soaking. A soak is an unattended prior-day step outside the
   operating day; a chill never runs into an empty building.
3. **The day is two streams.** First thing, that day's orders are assembled, sealed and readied
   for transport from components already chilled and staged, while other staff prep and cook the
   next batch. The batch stream is the cook — receiving, scaling, prep and cook per component,
   chill, stage. The dispatch stream is per delivery day, counted per portion shipped that day,
   not per batch cooked. Dispatch is scheduled against the delivery time.
4. Allergen changeover between batches is not modelled.
5. End-of-day closedown is two people for 30 minutes, placed once at the close of the operating day.
6. A task's crew size is fixed by its study line — most tasks take one or two people. More people
   on the floor means more tasks in parallel, never a faster task, until observed studies say
   otherwise. Concurrency is a scheduling result, never typed.
7. A delivery time exists on the order, on the production planner and on the batch paperwork
   (assumed until stated). The dispatch stream schedules backward from it and the engine reports
   against it.
8. Planning mode sweeps whole shifts, not headcount per interval, because that is how hiring
   happens. Shifts are four-hour or eight-hour; the default is full-time, an eight-hour shift. A
   sweep adds one eight-hour person at a time; a four-hour shift is the alternative the planner can
   pick per added crew.
9. **Closedown** is on no study. The scheduler places it once at the operating day's close as two
   people for 30 minutes.
10. **No second blast chill.** Meals are assembled cold from chilled, staged components and packed
    cold for transport; the temperature check at pack is a CCP verification, not a chiller run.
    The chiller's cycles belong to the batch stream alone.
11. **Cold hold is a hold, not labor.** Staging is part of the component chill line. CCP-3 is a
    monitoring point on the walk-in.
12. **One study per recipe, lines tagged by stream.** Each time-study line carries `stream`:
    `batch` or `dispatch` (a column on `muse.time_study_lines`). Batch lines take the study's batch
    size as their basis. Dispatch lines are per portion shipped that day; a fixed dispatch line
    (loading the vehicle) counts once per delivery day. The sheet and the log are one document per
    recipe.
13. **Delivery time** is a scenario default (`schedulePolicy.deliveryTimeMin`). The order carries
    an optional override once its shape is stated.
14. **Blast chiller sanitation and defrost** (culinary-operations.md §1). The cabinet is sanitized
    at the end of a shift or day, immediately after a food spill, and between foods when allergens
    were uncovered — never per batch, and no study carries it. Defrosting is periodic maintenance,
    never production. Occupancy is load + chill + unload.
15. **The cabinet on the clock** is the load, the chill stage (unattended) and the unload. Unload to
    storage (the production day, batch stream) and load for transport (the delivery day, dispatch
    stream) are two tasks on different days of the batch cycle, not one counted twice.
16. **Labor comes from the time studies.** The scheduler's labor reconciles to the studies
    (`staffDemand`).
17. **The cooling clock** runs from the last cook's end to the start of the chill stage, plus the
    chill stage, against 2 hours and 6 hours. Unload is off the clock. The cooks are placed to
    finish together at the load (`thermal.ts`).
18. **`crewMode`** in the schedule policy: `requirement` (default) places against the plant and
    reports crew gaps as findings; `constrained` holds staffed steps for free crew and reports what
    does not fit inside the day as unplaced. The shift sweep runs constrained.
19. **A day is the operating day** on its date: that date's dispatch, batches and closedown.
20. **No labor dollars in the scheduler.** Pay is held in CompTable; labor is minutes and hours.
21. **Line turnaround** is on every study: 2 people × 15 minutes, fixed per batch.
22. **Closedown covers the end-of-day chiller sanitize.** No separate chiller sanitize task is
    placed; spills and allergen changeovers are not modelled.
23. **Cabinet load and unload minutes are Capacity inputs, as estimates**, not time-study lines.
    The scheduler places the load, chill stage and unload from them.

## 1. What this module is

Not a schedule. **An instrument for discovering what schedules are possible.**

The kitchen does not exist yet. The crew shape is undecided — one morning crew or two, a split
chill window, a later dispatch, all open. The task order is an assumption and the time studies are
estimates that stand in until observed ones are adopted. What *is* known is the shape of the
constraints: whole batches, a batch bounded by every vessel it passes through, fixed-plus-variable
labor, a cooling CCP with a hard clock, and a building nobody is in overnight.

The module takes **a staffing shape + the Phase 1 units + each recipe's route**, places the work in
time against those constraints, and reports what comes out the other side: portions placed, crew
hours, idle crew hours, which unit binds, the makespan, and every rule the plan breaks. Run it
again under a different scenario and put the two side by side.

The Production Planning page answers "how many batches today." This module answers "what does a
day look like, and how do two ways of running it differ."

**The one rule that decides the architecture: nothing in the scheduler is a constant.** Every
duration, crew count, precedence edge, capacity and changeover is a scenario input resolved
through the `muse.scenarios` overlay.

---

## 2. Where it plugs into what exists

| Existing | Role here |
|---|---|
| Equipment library (`muse.equipment`, `_engine/equipment.ts`) | The resource register. Phase 1 rows carry batch capacities and the four resource attributes; planned build-outs never count. |
| `deriveCapacity` / `batchBounds` (`_engine/index.ts`) | The batch, bounded by every vessel it passes through. The scheduler places the result; it never re-derives it. |
| Labor standards (`_engine/time-studies.ts`, `_engine/time-study-estimate.ts`) | Each recipe's adopted study, or the estimated study that stands in. Its lines, in order and by stream, are the route. |
| Thermal map (`_engine/thermal.ts`, `_data/thermal-processes.ts`) | Each cook's process and vessel; the cooking-clock start. |
| Capacity inputs (`operatingOpenMin` / `operatingCloseMin`, cabinet load / chill / unload minutes and staff) | The operating day and the cabinet on the clock. |
| `planHorizon` (`_engine/production-plan.ts`) | The order book rolled through production day by day with lot-level FIFO and hold-life expiry; supplies each date's batches and shipments. |
| Fiscal calendar closures (`loadCalendar`) | Which days produce. |
| `staffDemand` (`_engine/staff-demand.ts`) | The labor reconciliation target. |
| `_engine/staffing.ts` | The labor requirement and the crew check on Capacity and Production Planning. |
| `_engine/scenario.ts` + `_state/scenario-store.tsx` | The spine: the `crews`, `routing`, `resources` and `schedulePolicy` sections and their setters. |
| Plan / Actual world (`useOperationsWorld`) | Which orders, batches and deliveries the Day Schedule and Calendar read. |
| `muse.entity_links` (0046) | Production order → lot, once orders are committed (W6). |

**No new dependency.** No Gantt or calendar library: each brings its own theme and icon set against
CLAUDE.md §5, and the scheduler has to be pure and testable in `_engine/` regardless.

---

## 3. Data — all scenario-editable

### 3.1 Resources — the Phase 1 units

The equipment library is the register. Each Phase 1 unit carries a batch capacity in pounds a run
(`batch_capacity_lb`) and four resource attributes (migration 0066): `concurrent_batches`,
`changeover_minutes`, `attended_run`, `may_run_unattended`, with a `resource_basis` (estimated,
stated or observed). They are open fields on Equipment; estimated seeds with a note per unit are
`RESOURCE_SEED` in `_data/capex.ts`.

`routeResources(equipment, overlay)` in `_engine/routing.ts` resolves the Phase 1 units that carry
an attribute into `RouteResource` rows — key, item, units, and each attribute tagged: a scenario
edit is `STATED`, a library value `PLACEHOLDER` while estimated and `STATED` once stated or
observed. A unit's slots are units × concurrent batches.

### 3.2 Routing — the process map (`_engine/routing.ts`)

A route is derived from the recipe's labor standard, never authored beside it. `deriveRoute` makes
one `RouteStep` per study line, in study order, on the line's stream:

- **kind** off the time-study scaffold, which is what precedence reads;
- **resource** off the thermal map and the Phase 1 list: a cook's vessel from its thermal process,
  the blast chiller for the chill, the cutter mixer for a prep at the VCM, the tray sealer for the
  seal;
- **minutes** off the line: a fixed line's elapsed minutes are setup, a per-portion line's are run
  minutes per portion at the batch studied. `duration = setup + portions × run`, labor the same on
  labor minutes. Portions are the batch's on the batch stream and the day's shipped on the dispatch
  stream;
- **staff** fixed by the line; **attended** when labor is staff × elapsed, otherwise tended;
  **ccp**; **priorDay** for a process that runs across the night before.

**The scaffold** (`_engine/time-study-estimate.ts`):
- Batch stream, in order: receiving, verification, put-away · dry goods scaling and mise en place ·
  per hot component: prep, cook (on its vessel) · component blast chill and stage · line
  turnaround and sanitation (2 × 15 min, fixed per batch).
- Dispatch stream, per delivery day: per cold component: cold assembly · portion and assemble ·
  seal, label, date and lot code · temperature check at pack (CCP verification) · load for
  transport (fixed per delivery day).

**Precedence** is finish-to-start, derived from the kinds, and an assumption the scenario overrides
step by step:
- batch — receiving → scaling → prep → cook (the cooks run alongside each other; a cook waits for
  its own component's prep) → chill, which waits for every cook → line turnaround;
- dispatch — the cold assemblies run alongside each other from staged components → portion and
  assemble, which waits for every one → seal → temperature check at pack → load.

No edge crosses the streams. `routeOrder` gives an order every edge respects; `routeDepths` gives
each step's precedence depth.

**Report, never repair.** A line no kind names, a cook with no vessel on the Phase 1 list, an
overnight process, an unknown predecessor or a cycle comes back as a `RouteFinding`. Nothing is
dropped or re-ordered to make the route fit.

A scenario edit to a step (`RouteStepOverlay`, keyed `<recipe code>::<step id>`) may set staff,
setup and run minutes, fixed and per-portion labor minutes, predecessors and resource; the step is
marked edited.

### 3.3 Crews — who is in the building (`_data/crews.ts`)

`CrewShift`: id, label, start and end minutes, headcount (each tagged), `canStaff`, `dayPattern`,
`focus`. **A proposed staffing answer, never a constraint.** The register is seeded empty: no staff
count or shift pattern has been decided. Capacity comes off the plant — equipment, process minutes
and the operating day — and the plan emits its labor requirement (`_engine/staffing.ts`); crews are
checked against it and a gap is a finding, never a reason to place less work. Crews are added,
edited and deleted on Capacity (`addCrew`, `setCrew`, `removeCrew`); a new crew takes its defaults
from the labor requirement (`newCrewDefaultsFor`). A saved scenario that edits the ids `shift-1` or
`shift-2` resolves onto an invented two-shift pattern tagged `PLACEHOLDER` (`LEGACY_SEED_CREWS`).

### 3.4 The operating calendar

Production days count off the fiscal calendar and its closures; `planHorizon` rolls the order book
across them on the service weekdays. No separate calendar register.

### 3.5 Scenario wiring

`MuseScenarioConfig` and `SCENARIO_SECTIONS` carry:

```ts
crews?:          Record<string, CrewOverlay>;        // keyed by crew id, with adds and removes
routing?:        Record<string, RouteStepOverlay>;   // keyed by '<recipe code>::<step id>'
resources?:      Record<string, ResourceOverlay>;    // keyed by equipment key
schedulePolicy?: SchedulePolicyOverlay;
```

Store setters: `setCrew`, `addCrew`, `removeCrew`, `setRouteStep`, `setResource`,
`setSchedulePolicy`. The resolved scenario exposes `crews`, `routing`, `resources` and
`schedulePolicy`.

**The schedule policy** (`_data/schedule-policy.ts`), each field tagged:

| Field | Default | Tag |
|---|---|---|
| `deliveryTimeMin` | 10:30 | PLACEHOLDER — assumed until stated |
| `closedownStaff` / `closedownMinutes` | 2 people / 30 min | STATED |
| `allowUnattendedChill` | false | STATED |
| `priorityRule` | `earliest-due` (also `longest-path`, `shortest-processing`) | PLACEHOLDER |
| `crewMode` | `requirement` (also `constrained`) | STATED |
| `dispatchDirection` | `backward` (also `forward`) | STATED |

The Day Schedule shows the policy with its tags. No page edits the `schedulePolicy` or `resources`
sections; resource attributes are edited on Equipment.

---

## 4. Engine

### 4.1 `_engine/scheduler.ts` — pure, deterministic, tested

`schedule(input: ScheduleInput): ScheduleResult` places one operating day.

**Input:** date; `ScheduleBatch[]` (one whole batch of a recipe with its route); `ScheduleDispatch[]`
(one recipe's shipment that day, in base portions); resources; crews; the capacity inputs
(operating open and close, cabinet load / chill / unload minutes, load and unload staff); the
schedule policy.

`scheduleInputsForDay` builds the batches and dispatches for a date from a production day's runs
and a delivery day's shipments, each on its recipe's route (labor standard, thermal map, Phase 1
list, the scenario's step edits). A recipe the library does not hold is listed, not placed.

**Algorithm: serial schedule generation (list scheduling).** Orders are taken in the policy's
priority order and each step is placed at the earliest (or, placed backward, the latest) minute
where its resource has a free slot for its whole duration plus changeover — and, in constrained
crew mode, where the crew has the people free for its labor.

- **Batch stream**, per whole batch. Steps before the cooks are placed forward from opening. The
  cooks are placed to finish together at the cabinet load: the load is the earliest minute every
  cook can have finished and the chiller is free. The route's chill step is the cabinet on the
  clock — load, the unattended chill stage and unload, their minutes and people from Capacity; the
  labor is the study's chill line, placed at the load and the unload in proportion to their
  staff-minutes. Steps after it are placed forward.
- **Dispatch stream**, per recipe shipped that day, from staged components. Placed backward from
  the delivery time by default or forward from opening. The vehicle load is placed once for the
  day. An order that cannot be placed backward inside the day is placed forward and reported
  against the delivery time.
- **Closedown** is placed once at the close.

A step's labor is placed as its study's people from the step's start for labor minutes ÷ people:
the whole run for an attended step, the tending allowance for a tended one.

**Output.** `ScheduledBlock[]` — order, recipe, stream (`batch`, `dispatch` or `day`), step, kind
(`step`, `cabinet-load`, `chill-stage`, `cabinet-unload`, `closedown`), task, resource, start, end,
staff, labor minutes, attended, CCP.

Violations:

| Kind | Raised when |
|---|---|
| `resource-over-capacity` | A unit's jobs run past the operating day |
| `outside-operating-day` | A block starts or ends outside the day |
| `crew-shortfall` | Placed work needs more people than the crews have on the floor |
| `unstaffed-attended-step` | An attended step has no crew |
| `ccp-cooling-stage` | The cooling clock breaks 2 hours (stage 1) or 6 hours (stage 2) |
| `unattended-chill` | A chill completes with no crew scheduled |
| `due-date-missed` | A dispatch finishes after the delivery time |
| `prior-day-step` | An overnight process, reported and not placed |
| `route` | A route finding on the order |
| `unplaced` | Constrained mode: a batch or dispatch order that does not fit inside the day, whole |

Metrics: batches placed and unplaced, portions placed, dispatches placed and unplaced, portions
shipped, first start and last end, makespan (closedown excluded), utilisation by resource (busy
minutes inside the day ÷ day × slots), the binding resource (nearest its ceiling), labor hours
(batch, dispatch), closedown hours, crew hours (Σ headcount × crew hours), idle crew hours.

**Non-negotiables:**
- **Report, never repair.** A plan that does not fit comes back with violations attached. In
  requirement mode crews never limit placement and every gap is a violation; in constrained mode an
  order that does not fit inside the day is unplaced, whole.
- **The chill stage is unattended; load and unload are not.**
- **Only the cooling clock of decision 17 is tested against the Food Code limits** (3-501.14:
  135→70 °F in ≤2 h, 135→41 °F in ≤6 h). Unload and sanitation are outside it.
- **Batch size is never set here.** It comes from `deriveCapacity()`; the scheduler places whole
  batches and nothing else (CLAUDE.md §2.1, §2.3).

### 4.2 The horizon

`planHorizon` in `_engine/production-plan.ts` runs the order book through production day by day
across the calendar, carrying lot-level FIFO inventory with hold-life expiry. Its `byDate` rows
carry, per date in the window: batches, portions made, cycles used against available, ordered and
filled, stock expired, closing stock, and whether the day fits. Rows cover the window only — a
Monday's orders made the Friday before it sit outside it.

### 4.3 The conformance test

The scheduler's labor hours reconcile to `staffDemand` for the same day, from the same time
studies (`muse-scheduler.test.ts`). Two labor numbers that disagree is a defect (ISSUE-09).

Tests: `muse-scheduler.test.ts` (a golden day; over-capacity, crew-shortfall, CCP-2 breach and
unattended-chill flips; due date and forward dispatch; constrained crews and whole batches; the
three priority rules; labor reconciled to `staffDemand`; AMK-E-001's rated day; an overnight cook
as a prior-day step; the policy resolved and tagged), `muse-routing.test.ts`,
`muse-timeline.test.ts`, `muse-compare.test.ts`.

---

## 5. UI

### 5.1 `_components/timeline/` — the primitives

- **`scale.ts`** (pure, tested) — `timeScale(startMin, endMin, granularity)` with granularity
  `'15min' | 'hour' | 'day'`; `spanOf` (the operating day and anything placed outside it);
  `laneRows` (overlapping blocks packed onto rows); `hhmm`.
- **`Timeline.tsx`** — `TimelineAxis`; `TimelineGrid` with a sticky lane-label column, lanes and
  blocks, and precedence arrows (toggleable on the Day Schedule); `CrewLoadStrip`, crew demand
  against the proposed headcount per 15-minute bucket.
- **`MonthGrid.tsx`** — a Monday-first month, text only; each day carries its lines, a utilisation
  bar and its finding count, and is outlined when it does not fit, expired stock or raised a
  finding.
- **`ProcessMap.tsx`** — a recipe's route as a DAG per stream: HTML nodes in columns by precedence
  depth, each showing unit, crew and duration; SVG edges for precedence.

Every chart has a table under it. No icons, no decorative SVG (CLAUDE.md §5). Status badges on
every tagged input shown.

### 5.2 Routes

All under Production in `_components/nav.ts`, status `live`:

```
/muse/production-planning            the planning loop
/muse/production-planning/schedule   Day Schedule — one operating day by unit, with crew load
/muse/production-planning/compare    Compare — the same day under two saved scenarios
/muse/production-planning/calendar   Calendar — the horizon month by month
/muse/production-planning/process    Process — a recipe's route, edited step by step
```

- **Day Schedule** reads the selected world (Plan: the open forecast's own orders, batches and
  deliveries; Actual: the recorded ones), rolls a 21-day horizon, and places the picked date (the
  `date` parameter). Lanes are the Phase 1 units; the crew load strip in 15-minute buckets; the
  violations and every block tabled. People → Schedule carries the two weeks of staff demand for
  CompTable and links to the Day Schedule.
- **Calendar** reads the selected world, draws `MonthGrid` over `planHorizon.byDate`, runs the
  scheduler per day for the finding counts, totals the month, tables it day by day, and opens a
  picked day on the Day Schedule.
- **Process** renders each stream in a card with the route and its findings tabled. A super admin
  editing a forecast picks a step and edits crew, setup, run and labor minutes, unit and
  predecessors into the `routing` section, with a reset per step and a section save. Editing a step
  moves the map and the Day Schedule.
- **Compare** — §5.3.

### 5.3 Compare (`_engine/compare.ts`)

Each side resolves its own saved scenario — crews, routes, units, schedule policy — builds the Plan
world's order book (no stored order, no recorded stock), rolls its own 21-day horizon and places the
same date with the same scheduler. `compareDays` (pure, tested) tables:

| Row | Direction marked |
|---|---|
| Portions placed | more |
| Batches placed | more |
| Batches unplaced | fewer |
| Portions shipped | more |
| Binding resource | none — a different unit is a different constraint |
| Makespan | shorter |
| Crew hours | none |
| Idle crew hours | fewer |
| Labor minutes | none |
| Labor minutes per portion placed | fewer |
| Closedown hours | none |
| Chiller utilisation | none |
| Findings | fewer |

`better` marks only the rows where more or less is plainly the direction for meals placed and crew
time used; the rest carry `null`. Labor is minutes, never dollars (decision 20). `violationDelta`
names the finding kinds the two sides differ on. The surface reports the two days; it never picks a
scenario.

---

## 6. Waves

| Wave | Content | Status |
|---|---|---|
| **W0** | **Step 1** `stream` on time-study lines (migration 0066); the estimator and the plan seed on the batch and dispatch streams; stream on the sheet, the study tables and the log; `staffDemand` counting batch lines per batch cooked and dispatch lines per portion shipped on the delivery day. **Step 2** the four resource attributes on Equipment (migration 0066), estimated seeds (`RESOURCE_SEED`). **Step 3** `_engine/routing.ts` — `deriveRoute`, `routeOrder`, `routeResources`. **Step 4** the `routing`, `resources` and `schedulePolicy` sections, resolver and store setters; `_data/schedule-policy.ts`. | DONE |
| **W1** | `_engine/scheduler.ts`: `schedule()` and `scheduleInputsForDay()`; list scheduling over the Phase 1 units and the crews; violations and metrics; `crewMode` and `dispatchDirection`; labor reconciled to `staffDemand` by test | DONE |
| **W2** | `_components/timeline/` and the Day Schedule (`/muse/production-planning/schedule`): lanes by unit, precedence arrows, crew load strip, violations and placements tabled | DONE |
| **W3** | `routeDepths`, `ProcessMap` and Process (`/muse/production-planning/process`): the route DAG per stream, a step edited into the `routing` section | DONE |
| **W4** | `planHorizon.byDate`, `MonthGrid` and Calendar (`/muse/production-planning/calendar`) | DONE |
| **W5** | `_engine/compare.ts` and Compare (`/muse/production-planning/compare`) | DONE |
| **W6** | Committed production orders as facts of record: a migration for production orders and task events, orders linked to lots through `muse.entity_links`; actuals capture (punches as paid hours by interval, batch records as task times and throughput) read into the same lanes, utilisation as productive task minutes over paid minutes; forecast-vs-actual into Reports | NOT STARTED — waits for the model to stop moving |

**Not yet waved — the planning calculator.** Inputs: the crews (headcount, start and end per shift)
and the operating day. Outputs per run: meals placed inside the day, makespan, batches, paid hours,
idle hours, the binding resource, violations. The sweep adds one shift at a time (decision 8) in
constrained crew mode (decision 18) and reports meals gained per person, flattening where a unit
binds. NOT STARTED.

**Master roadmap Phase L steps**

| Step | Content | Status |
|---|---|---|
| **L0** | Capacity is a property of the plant; labor is a requirement of the plan; the crew register seeded empty and checked as findings (`_engine/staffing.ts`) | DONE |
| **L1** | Station register as bookable resources: the equipment library's Phase 1 units with the four resource attributes (W0), booked on the clock by the scheduler (W1) | DONE |
| **L2** | Each vessel's required volume per batch against its capacity (`batchBounds`, ISSUE-14) | DONE in the closed form |
| **L3** | Two chiller cabinets as independent resources: the batch binds to one cabinet, `units` are slots the scheduler and `planProductionDay` (`lines`) place; the closed-form headline is the one-stream ceiling, labelled as such — lockstep is retired (batch-resource instruction, 2026-09-17, superseding ISSUE-13's remedy) | DONE 2026-09-17 |
| **L4** | Timeline primitives for the shift bars (`_components/timeline/`, W2) | DONE |
| **L5** | Cross-station routing per recipe (`deriveRoute`, W0), edited on Process (W3) | DONE |

---

## 7. Rules for whoever builds it

1. **No constants.** A number the scheduler reads that is not resolved through the scenario is a
   defect. The test: can a user change it and watch the chain recompute?
2. **Report, never repair.** Violations are output. The scheduler does not quietly fix a plan.
3. **Batch size stays derived** from the vessel bounds; whole batches only; labor stays
   fixed-per-batch plus variable-per-portion (CLAUDE.md §2).
4. **Scheduler labor reconciles to `staffDemand`.** Enforced by test.
5. **Only the cooling clock faces the Food Code limits** — last cook's end to chill start, plus the
   chill stage. Occupancy is a scheduling fact, not a HACCP one.
6. **Every displayed figure carries its `<StatusBadge>`** (CLAUDE.md §3). Most of these inputs are
   `PLACEHOLDER` and the interface makes that obvious.
7. **No new dependency, no icons, no decorative SVG.**
8. **Guards:** every `'use server'` action gates on the throwing `requireMuseOperator()` /
   `requireMuseSuperAdmin()` (CLAUDE.md §10). `workspace-guard-coverage.test.ts` catches it.
9. **Do not commit or push without per-action approval.**

## 8. Open for Robert — scenarios to run, not blockers

- One morning crew or two, and where the second one's hours go.
- Which unit binds once real vessel capacities replace the estimates. The scheduler names the
  binding resource rather than assuming it.
- Whether chilling may run unattended into the evening on the datalogger path
  (`allowUnattendedChill`), and what that buys.
- Backward dispatch from the delivery time against forward dispatch from opening — the scheduler
  places both.
- The delivery time itself, and its shape on the order (decision 13).
- What two cabinets buy on a mixed day (L3): the batch is one cabinet's load and the second cabinet
  is a second slot, so the gain is concurrency — two recipes chilling at once — and whole-batch
  rounding on each stream can eat part of it. The Gantt produces that result; it is not pre-judged.
