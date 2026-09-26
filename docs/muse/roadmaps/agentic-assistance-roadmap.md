# BUILD PLAN — agentic assistance: Compare in two modes

**For: the coding agent.** Master roadmap Phase R. The first AI surface in Muse. It borrows the
patterns CompTable's AI layer already runs (`apps/web/src/lib/ai/`, `docs/roadmaps/ai-surfaces-roadmap.md`)
and applies them to one page: **Compare** (`/muse/production-planning/compare`), which gains a second
tab. The hard rule carries over unchanged: **the model proposes, the engine computes.** No dollar,
minute, pound or count on the page comes from the model.

---

## 0. Decisions with Robert (2026-09-18)

Code comments cite these by number.

1. **Compare has two tabs, Day and Recipe.** Day is the page as built (scheduler build plan §5.3): one
   day placed under two forecasts. Recipe is new: two recipes costed under one forecast — the open
   forecast, or the plan of record. The tab bar follows the tabbed-layout plan's §6 rules; this is a
   "tabs by decision" page, not a length conversion (that plan's decision 4 is amended).
2. **The instruction is typed or spoken; the proposal is reviewed before anything runs.** The chef
   describes a change in plain language. The model returns a typed proposal — recipe changes, labor
   changes, open questions. The admin reviews and edits it; nothing runs until it is clean.
3. **Additions and removals are in scope**, not only edits: an ingredient line added or removed, a
   labor step added or removed, a step's minutes or staff changed, an ingredient swapped for another.
4. **Side B is a duplicated library recipe**, never a what-if overlay on side A. A different ingredient
   and a changed step make a different recipe with its own labor standard (CLAUDE.md §2 rule 2: labor
   is per recipe). The variant is built in memory, costed, and written to the library only when the
   admin clicks save — at status Developing, so it never enters production planning (Roadmap H).
5. **Cost and time, minutes and dollars.** The Recipe table carries the batch's food cost and cost to
   serve, its labor minutes, and labor dollars at the forecast's blended loaded wage assumption,
   labelled as that assumption. Day keeps minutes only (scheduler decision 20).
6. **Admin only.** The Recipe tab, the interpret action and the save action gate on
   `requireMuseSuperAdmin()`. An operator sees the Day tab alone.
7. **The model never fills a gap.** For every figure the instruction implies but does not state, the
   resolver first looks for it in the platform and cites it, then derives it where the engine already
   does, and otherwise asks. A question the chef waives becomes a **PLACEHOLDER**, tagged and noted,
   never a guess. Every figure on the variant is tagged: STATED (the chef typed it), SOURCED (a catalog
   line or approved standard), DERIVED (the engine), PLACEHOLDER (waived).
8. **Ambiguity is a question, never a pick.** A name that matches zero or more than one recipe,
   ingredient line, catalog line or study step is an open question listing the candidates.
9. **Names go to the model as they are** — recipe, ingredient, step and catalog item names. Prices,
   staff, customers and pay never do.
10. **Sonnet.** The action imports CompTable's `INGESTION_MODEL` constant (`lib/ai/client.ts`); no
    second model constant in Muse.
11. **Three uses of CompTable code outside the Muse folder are granted:** the AI client is imported, not
    copied; `test/no-advisory-scan.test.ts` walks the Muse `_lib` and `_engine` `.ts` files; usage rows go
    to `public.ai_cost_events` through `recordAiCostEvent()` with both owner ids null and a `muse-`
    surface prefix. Credit metering (`withMeter`) is not used: Muse has no org.
12. **Voice is the browser's Web Speech API** into the same text box — no vendor account, no audio
    leaves the browser as a file. Where the browser lacks it the control is absent.
13. **Vocabulary on screen:** forecast, plan of record, recipe, variant. "Scenario" never (CLAUDE.md §9).

---

## 1. Where the boundary sits — recipe data against forecast data

A recipe in the library is three definitions that stand together: its ingredient lines
(`muse.recipes`, `muse.recipe_lines`), its labor standard (the adopted or estimated study in
`muse.time_studies`, keyed by recipe code) and its packaging picks. Pre-cut carrots plus a dropped
wash-and-peel step is therefore a different recipe, not a different assumption.

The forecast supplies the context a recipe is costed in: the wage assumption, shrink allowance,
packaging library costs, delivery per meal, the equipment library (and so the derived batch size),
crews, schedule policy, the order book, and any what-if overlay the forecast holds on a definition.
Batch size and plated portion are never typed anywhere (CLAUDE.md §2 rules 1 and 5) and are never
asked.

So the two tabs are the same shape turned over: **Day** is one day under two forecasts; **Recipe** is
two recipes under one forecast.

## 2. What CompTable already has, and what is borrowed

| CompTable | Where | Borrowed as |
|---|---|---|
| Forced tool use; loose envelope, strict rows; `clarifications` | `lib/ai/ingest-roster.ts` | The proposal contract (§3) |
| Extract → deterministic apply with ambiguity refusal → engine → narrate from deltas only | `lib/ai/qna-scenario.ts` | The resolver (§4) |
| Review-before-commit modal: preview state, questions box, editable table, accept to draft | `components/roster-import-modal.tsx` | The proposal card (§6) |
| `findAdvisoryPhrase` fail-closed on every model string; source scan test | `@ct/compliance`, `test/no-advisory-scan.test.ts` | Unchanged |
| `wrapUntrustedBlock`, `escapeOperatorText` | `lib/redact/` | The instruction is fenced (roster fences; menu does not — fence) |
| `anthropic()`, `INGESTION_MODEL`, `logAnthropicUsage`, `recordAiCostEvent` | `lib/ai/client.ts`, `lib/cogs/record.ts` | Imported (decision 11) |
| `ai_surface` rate-limit bucket, defined and unused | `lib/rate-limit.ts` | Wired for the first time |

Not borrowed: the credit meter (no org), the diversity gate (one proposal, not eight), the narrators
(no narrative in v1; the table speaks).

## 3. The proposal contract (`_engine/agent-proposal.ts`, pure)

Zod, exported types, no I/O. The envelope is loose and the rows strict, as in roster ingestion: a
row that fails its schema becomes an open question, never a dropped row.

```
RecipeVariantProposal
  sourceRecipeCode      string            — resolved by the resolver, not trusted from the model
  variantName           string 3–80       — the chef's name for side B; "(variant)" suffix when none given
  lineChanges[]         discriminated on kind
    replace   { line, withItem, apQtyPerBatch?, unit?, yieldToCooked?, packSize?, apUnitCost? }
    edit      { line, apQtyPerBatch?, yieldToCooked?, packSize?, apUnitCost?, spec? }
    add       { name, spec, apQtyPerBatch, unit, yieldToCooked?, packSize?, apUnitCost?, isHotComponent }
    remove    { line }
  laborChanges[]        discriminated on kind
    edit      { step, laborMinutes?, elapsedMinutes?, staff?, scalesWith?, station? }
    add       { task, station?, staff, laborMinutes, elapsedMinutes, scalesWith, stream, after? }
    remove    { step }
  openQuestions[]       { id, about: 'line'|'step'|'catalog'|'recipe', field, question, waivable }
  facts[]               string — what the model read in the instruction, restated; no figures the chef
                                  did not state
```

`line`, `step`, `withItem` are names as the chef said them. Resolution to keys is the resolver's job
(§4). Every numeric field the model emits is marked STATED on the variant because it came from the
instruction; the model is told to emit a number only when the chef stated it and to ask otherwise.

The user message is the instruction inside `wrapUntrustedBlock('chef_instruction', …)`, followed by
the context block (§5). Bounds: instruction 1–10,000 characters; at most 40 line changes, 40 labor
changes, 20 questions.

## 4. The resolver and the gap rule (`_engine/agent-proposal.ts`, pure)

`resolveProposal(proposal, ctx)` → `{ variant: RecipeDef, study: TimeStudySeed, tags, questions }`.

Order of resolution for every figure the variant needs (decision 7):

1. **Find and cite.** A `replace` whose `withItem` matches one approved catalog line takes that line's
   price, pack size and supplier and is tagged SOURCED with the catalog row as its source. A
   `withItem` or `add` whose name matches one line on another library recipe takes that line's yield,
   spec, crediting and hot-component flag, tagged with that line's own status.
2. **Derive.** A `replace` of a raw line by a prepared one derives the new as-purchased quantity as
   `raw apQtyPerBatch × trimYield` when the raw line carries a separate `trimYield`; `cookedYieldPerBatch`
   is always `apQtyPerBatch × yieldToCooked`; the plated portion, chilled mass and batch size come off
   the engine as for any recipe. Derived figures are tagged DERIVED with the formula in the note.
3. **Ask.** Everything else is an open question: a price with no approved catalog line; a yield when
   the raw line's factor is a composite (USDA FBG factors are AP → cooked-and-drained; the split is not
   invented); the minutes on a step the chef did not put a number on; the station and staff of an
   added step; the crediting and Food Traceability List status of an added line (never inferred from a
   name — CLAUDE.md §2 rule 7 and the FTL rule on `IngredientLine`).

Name matching is exact, then case-insensitive, then a contained-word match; zero or several matches
at the last stage is a question listing the candidates (decision 8). `remove` of a line that is the
recipe's only hot component is refused with a finding, since the variant would have no chilled mass.

**Waiver.** Each question carries `waivable`. A waived question resolves to the source recipe's own
figure (or, for an added line, zero and `crediting: NONE`) tagged PLACEHOLDER with the question text as
the note. A question that is not waivable (a `replace` with no item resolved, a `remove` naming no
line) blocks the run until answered.

**The labor standard of the variant.** Start from the source recipe's labor standard (`laborStandardFor`);
apply the labor changes line by line; the result is a `TimeStudySeed` with `basis: 'estimated'`,
`source: 'user_built'`, `studiedOn: null`, `batchSize` = the source standard's studied batch. It is
the variant's estimated study and shows as Estimated everywhere until an observed one is adopted, the
same rule every seeded recipe follows.

**Re-interpretation.** Answers typed on the card are appended to the instruction as a second fenced
block (`chef_answers`) and the whole is interpreted again as one turn; the model is told which
questions it asked and must not ask them again when an answer is present.

## 5. Context sent to the model (decision 9)

One JSON block, built server-side, prices and people excluded:

- the recipe library: code, name, status, channels, and each line's name, spec, unit, `apQtyPerBatch`,
  `yieldToCooked`, `packSize`, `isHotComponent`;
- the source recipe's labor standard: each line's task, station, staff, elapsed and labor minutes,
  `scalesWith`, `stream`, in order;
- approved catalog lines: item name, unit, pack size, supplier name (the seed suppliers are invented
  and labelled so);
- the Phase 1 equipment keys and item names (so "the second combi" resolves to a unit or a question).

Nothing else. No `apUnitCost`, no staff register, no customers, no forecast figures.

## 6. The Recipe tab (`production-planning/compare/RecipeCompareClient.tsx`)

Above the table, in the page toolbar's scope group: the source recipe (a `RecipeSelector`), and the
forecast the run reads, named from the forecast bar. In the panel:

1. **Describe the change** — a text box; a Dictate control beside it where the browser has
   `SpeechRecognition` (decision 12), writing into the same box; Interpret.
2. **The proposal card** — the recipe changes as editable rows (line, what changes, from → to, tag), the
   labor changes as editable rows (step, minutes, staff, stream, tag), and **Open questions** as a list
   with an answer field on each and a Waive control on the waivable ones; a free-text follow-up box;
   Re-interpret and Run. Run is disabled while a non-waivable question stands. Every figure on the card
   carries its `<StatusBadge>`.
3. **The comparison** — the same `muse-table` and `CompareRow` shape the Day tab renders, side A the
   source recipe, side B the variant, Δ and a "What it means" column:

   | Row | Direction marked |
   |---|---|
   | Derived batch size (portions) | none — a different bound is a different constraint |
   | Binding vessel | none |
   | As-purchased lb per batch · cooked lb · plated lb | none |
   | Batch food cost · with shrink | fewer |
   | Unit food cost | fewer |
   | Labor minutes per batch (fixed + variable at the batch) | fewer |
   | Labor minutes per portion | fewer |
   | Labor dollars per batch · per portion, at the forecast's blended loaded wage | fewer |
   | Packaging per meal | none |
   | Cost to serve per meal | fewer |
   | Lines uncreditable · labor basis · placeholders on the variant | fewer |

   `better` marks the rows where less is plainly less; the rest are facts. Every row is off
   `batchCosting`, `costToServe`, `laborStandardFor` and `summarizeStudy`, computed for both sides at
   the same forecast's resolved inputs. Nothing on the table is authored by the model. The table
   never picks a recipe. *As built:* there is no Run button — the comparison appears the moment the proposal
   is clean and re-resolves live as a question is answered or waived, the platform's figures-recompute-live
   rule. The table markup is one component both tabs render (`_components/CompareTable.tsx`), with `dollars`
   and `pounds` added to `CompareFormat`.
4. **Save variant to library** — writes the variant through `createRecipe` at status Developing and its
   estimated study through the time-study actions, both on the posting trail; the card then links to the
   new recipe on Recipes. Until then the variant is in memory only and leaves with the page.

The Day tab is the current client, unchanged, with its A / B / Day selectors moved inside its tab
(tabbed-layout §6 rule 1 does not apply: they belong to one tab). Open tab in the URL hash.

## 7. Phases

**R0 — plumbing**  DONE (2026-09-19)
- [x] `_lib/agent-actions.ts` (`'use server'`): `interpretRecipeInstruction`, `saveRecipeVariant`; both
      gate on `requireMuseSuperAdmin()`; `rateLimit('ai_surface', userId)`; `recordAiCostEvent` with
      surface `muse-recipe-variant`, outcome success / validation_error / api_error.
- [x] `test/no-advisory-scan.test.ts` walks `(muse)/muse/_lib` and `_engine` `.ts`.
- [x] `_engine/agent-proposal.ts`: the Zod contract (§3), `findAdvisoryPhrase` over `facts` and every
      question, tests for the envelope and for a malformed row becoming a question.

**R1 — the resolver**  DONE (2026-09-19)
- [x] `resolveProposal` (§4): find → derive → ask; name matching and ambiguity; waiver to PLACEHOLDER;
      the variant's `TimeStudySeed`; refusal on the last hot component. Tests: the carrot case end to end
      (raw → pre-cut with an approved catalog line; without one; with and without a separate trim yield;
      with and without a stated prep change), an added line's crediting and FTL as questions, a step
      removed, an ambiguous step name.

**R2 — the comparison engine**  DONE (2026-09-19)
- [x] `_engine/recipe-compare.ts` (pure): `compareRecipes(a, b, resolved)` → `CompareRow[]` per §6.3,
      reusing `CompareRow` from `_engine/compare.ts`. Tests: identical recipes give an identical table; a
      dropped step moves only the labor rows; a placeholder on B is counted.

**R3 — the page**  DONE (2026-09-19)
- [x] The tab bar on Compare (Day · Recipe), Recipe admin-only, hash-linked; the Day client moved under
      its tab unchanged.
- [x] `RecipeCompareClient.tsx` per §6; `nav.ts` blurb and the page lede rewritten for two modes; the
      tabbed-layout plan's decision 4 amended and Compare's row in its audit annotated.
- [x] Save variant to library; the new recipe's provenance visible on Recipes.

**R4 — voice**  DONE (2026-09-19)
- [x] Dictate control on the text box via `SpeechRecognition` / `webkitSpeechRecognition`; interim
      results shown, final text appended; absent where unsupported; no audio stored.

**R5 — beyond the recipe**  NOT STARTED, scope with Robert first
- [ ] Instructions that are forecast questions (a second unit, a crew, a schedule policy) resolve to a
      forecast overlay on the Day tab instead of a recipe variant. Same contract, second discriminant.

**R6 — the interpretive layer**  R6.1–R6.8 BUILT (2026-09-19); fixtures grow with each live misread

Why: the first live runs (§9, the E003 sweet potato hash → crispy potatoes run) came back with too many
open questions. The review on 2026-09-19 found the causes in both layers: the name matcher is too literal
for spoken English ("the hash prep", "sweet potato", "the green bean prep step" all miss); the prompt
carries rules but no worked example; a processing change ("buy it pre-cut") has no shape of its own and
is split by the model into a line replace and a step edit on a step the chef never named; the model and
the resolver both author questions; the step names the model sees are the built estimate's ("Prep — Sweet
potato hash: wash, trim, cut, scale"), which no chef will ever say; and nothing captures a live misread.
Nothing here is training in the weights sense — accuracy comes from what the prompt shows the model, how
forgiving the matcher is, and a fixture set that pins both down. Steps in order:

- [x] **R6.1 Capture fixtures.** A dev-only switch (`MUSE_AGENT_CAPTURE=1`, never in production) appends
      each live run — the instruction, the answers, the raw tool input the model returned and the parsed
      proposal — to `local/muse-agent-captures.jsonl` (gitignored). The question list is not captured:
      the resolver is deterministic and the fixture test reproduces it from the tool input. Every misread becomes a fixture under
      `test/fixtures/muse-agent/`. The fixtures of the runs that already misread come from Robert's
      memory of them.
- [x] **R6.2 Widen the matcher.** `matchName` strips stopwords (the, a, an, of, for, with, step, line,
      item…; "prep" and "cook" stay, they tell the steps apart), folds plurals (potatoes, beans,
      berries), and matches by containment of meaning-bearing words either way; among several
      containing candidates the one whose words are exactly the query's wins; a partial overlap of
      at least half the query's words is listed as candidates but never chosen (decision 8). Tested
      against the probe phrasings from the review.
- [x] **R6.3 A processing change of its own.** A `changeProcessing` line change: the line or component
      it belongs to, the item that takes the line's place (when the form changes: pre-cut, pre-diced,
      cooked), and the step edit inside it (minutes, staff, or removed). The resolver finds the step
      through the component the line belongs to, never through the chef's words for the step.
- [x] **R6.4 Every question is the resolver's.** `openQuestions` left the tool schema; the model emits
      changes, names and facts only, and a question it still writes is not read. An ambiguity the
      chef's words leave open is emitted as the ambiguous name and the resolver lists the candidates.
      New resolver questions: an added step's minutes (blocking) and scaling (waivable → fixed,
      PLACEHOLDER); a line edit that states no figure ("about half the chicken", waivable).
- [x] **R6.5 Worked examples in the prompt.** Four instruction → proposal pairs, the same four as the
      fixtures: a component swap, a processing change with its minutes, a step edit in the chef's words
      with a spoken number and a figure not stated, a form change with no minutes. The prompt, the tool
      and the context builder moved to `_lib/agent-prompt.ts` (no server directive) so the action and
      the eval script read one copy. Under the same cache breakpoint as the rules.
- [x] **R6.6 End-to-end fixture test.** `test/muse-agent-fixtures.test.ts` over `test/fixtures/muse-agent/*.json`
      in the seed kitchen (`kitchen.ts`: the menu library, built estimates at 500, no catalog). Each fixture's recorded tool input runs through
      `parseProposal` + `resolveProposal` against the seed library and the test asserts the exact
      question list, so a regression in either layer is caught.
- [x] **R6.7 Live eval script.** `pnpm muse:agent-eval` (`--only <name>`, `--dry`), outside vitest,
      replays the fixture instructions against the model and compares what the run MEANS — the exact
      question list, and the settled variant's lines, step figures and name — showing wording differences
      without failing on them. Runs append to `local/muse-agent-eval.jsonl`. First live run 2026-09-19:
      4 of 4 question lists and outcomes matched; the model copies listed names where the fixtures carry
      the chef's words, which the resolver reads the same. Never in CI.
- [x] **R6.9 The three live failure categories as fixtures** (Robert, 2026-09-19: chef language not
      mapping; unsaid steps not addressed; the library not searched first). Six fixtures in chef
      language — "86 the paprika and sub the fish plate's spuds in for the hash"; "a quarter hour with
      one guy"; "already smoked and diced so there's no smoking on our side"; "drop the green beans
      altogether"; "add broccoli florets, twenty pounds a batch"; "the marinara from the meatball plate".
      What they changed: dish words (plate, dish, bowl, meal, side) are stopwords, so "the fish plate" is
      AMK-E-004; `lookup` searches the recipe the chef named before every other; a removed line that
      empties its component takes the component's steps with it; an added line found on another recipe
      brings that component's steps across, and one found nowhere asks for its steps; a form that arrives
      cooked addresses the cook step (a second `changeProcessing` on the line, prompt rule 4a); kitchen
      shorthand in the prompt (rule 4b) and a fifth worked example; a line renamed by an earlier change
      still answers to its original name; a step the model removes that already left with its component
      passes silently; "replace" versus "swapComponent" drawn at the line (rule 4). Live replay after the
      fixes: 10 of 10 on outcome.
- [x] **R6.8 The pre-typed example.** *Revised 2026-09-19 (Robert):* the recipe selector sits inside the Describe card, directly above the text box, not on the page toolbar (the toolbar's own rule: a control that sets one card's content stays in the page); the two-line helper text is gone; the example is built from the selected recipe — its hot vegetable line, else its first hot line — so every part it names is on that recipe. The text box's placeholder names a part on the open recipe,
      what replaces it, the step by its component, the new minutes and staff, and the variant's name;
      one line of helper text under the box says what a complete instruction contains.

## 8. Rules for whoever builds it

1. **The model writes no number the chef did not state.** The prompt says so; the resolver enforces it
   by tagging every model-emitted figure STATED and refusing any figure not traceable to the
   instruction, a catalog row, another recipe's line or a formula.
2. **Every displayed figure carries its `<StatusBadge>`** (CLAUDE.md §3). A placeholder on the variant is
   obvious on the card and counted on the table.
3. **No advice.** `findAdvisoryPhrase` on every model string, fail-closed; the scan test covers the new
   files. The table has no verdict column and the page never picks a recipe.
4. **Fence the instruction.** `wrapUntrustedBlock` on the chef's text and on the answers block; the
   prompt treats their contents as data.
5. **The library is written only on the save click**, at status Developing, through the existing
   recipe and time-study actions. No other write. The ledger is never touched by anything here.
6. **Guards throw** (CLAUDE.md §10): `requireMuseSuperAdmin()` at the top of both actions;
   `workspace-guard-coverage.test.ts` catches an omission.
7. **Scope boundary** (CLAUDE.md §7) with the three grants in decision 11 and nothing more.
8. **No new dependency, no icons, no decorative SVG.**
9. **Do not commit or push without per-action approval.**

## 9. Open for Robert — not blockers

**The interpretive logic** — moved to phase R6 (§7) on 2026-09-19 with the review's findings; the earlier to-do list here is superseded by R6.1–R6.8.

- Whether a variant saved to the library should record which recipe it was duplicated from (a column
  on `muse.recipes`, migration) so Recipes can show lineage. v1 puts it in the recipe's notes text.
- Whether the Recipe tab should also run a `Planned` or `Developing` source recipe, or only In Service.
  v1 runs any library recipe.
- Whether the comparison should carry the crediting totals per side (a variant that drops a vegetable
  line can fall under the meal-pattern minimum). v1 counts uncreditable lines only; the full crediting
  card is on Recipes.

## Update Log

| Date | Change |
|---|---|
| 2026-09-18 | Plan opened after the CompTable AI-layer survey and the Muse overlay review. Decisions 1–13 locked with Robert; the on-screen vocabulary pass (scenario → forecast, CLAUDE.md §9) done the same day ahead of it. |
| 2026-09-19 | **R0–R4 built.** `_engine/agent-proposal.ts` (contract, `matchName`, `resolveProposal`; 27 tests), `_engine/recipe-compare.ts` (`compareRecipes`; 6 tests), `_lib/agent-actions.ts` (the two admin-gated actions, `ai_surface` rate limit, `ai_cost_events` telemetry under `muse-recipe-variant`), `CompareTabs` (Day · Recipe, hash-linked), `RecipeCompareClient` (describe → proposal card → live comparison → save), `CompareTable` shared by both tabs, dictation via the Web Speech API. The advisory scan walks Muse `_lib` and `_engine`. R5 open. Not yet exercised against the live model. |
| 2026-09-19 | Live runs: the model's own questions no longer block on fields the resolver owns; a line found on another recipe raises one confirmation; `swapComponent` — a served component for another, found recipe → name → component → line → catalog, its lines scaled by portions and its steps carried across; the envelope absorbs list fields written as strings; dictation surfaces the browser's refusal reason. Still misreading on live runs — the interpretive-logic to-do is at the top of §9. |
| 2026-09-19 | **R6 opened.** Review of the interpretive layer after the live misreads: matcher too literal (probe: "the hash prep", "sweet potato", "the green bean prep step" all miss), no worked examples in the prompt, no processing-change kind, two question authors, built step names the chef never says, no capture of live runs. Steps R6.1–R6.8 written; §9's to-do superseded. |
| 2026-09-19 | **R6.1–R6.8 built.** Matcher widened (stopwords, plurals, containment; partials listed, never picked); `changeProcessing` line change with the step edit inside it; the model asks nothing — every question is the resolver's; four worked examples in the prompt, moved with the tool and context builder to `_lib/agent-prompt.ts`; capture switch; four fixtures and the end-to-end fixture test; `pnpm muse:agent-eval` live replay (4/4 matched on outcome on the first run); the placeholder rewritten against the sweet potato hash with the step's minutes and staff. 67 tests on the two agent files; web suite 1750 green. |
| 2026-09-19 | **R6.9.** Robert's three failure categories (chef language, unsaid steps, library first) as six chef-language fixtures; three live misses fixed the same day (replace vs swap at the line; original name after a rename; a removed step that already departed). Ten fixtures, 10/10 on outcome against Sonnet; 93 tests on the agent files. |
| 2026-09-19 | Recipe tab: selector moved into the Describe card above the text box; helper text removed; example built from the selected recipe. |
| 2026-09-19 | Robert's first live run recorded as a fixture (`robert-hash-to-crispy-potatoes`, 11 fixtures, 11/11 on outcome). **Save variant did not land:** `RecipeInput` required a positive `yieldToCooked`, and the seed authors olive oil at 0 (absorbed into its component, mass carried on another line), so no recipe with an absorbed line could be written through the recipe actions at all — the same gate would refuse an edit of E003 or E004 on Recipes. Relaxed to `min(0)` with the convention noted; validation errors now name their field; the save's error renders beside the Save button, not at the top of the Describe card where it was missed. |
| 2026-09-19 | **Food Traceability List flag made a library fact** (Robert: everything is database and deterministic). The flag was already stored — a recipe line is one JSON document — but the recipe actions' write schema stripped it, the Recipes editor had no control for it, and the proposal contract could not carry an answer. Now: `RecipeInput` keeps `foodTraceabilityList`; the Recipes editor has a Traceability list column reading `FOOD_TRACEABILITY_LIST_CATEGORIES` from `_engine/traceability.ts`; `replace`, `changeProcessing` and `add` carry a stated category, matched to the list's own name, and "not listed" clears it; the resolver's question names the categories. The seed flags one line only (E001 peppers) — which menu lines are on the list is Robert's to state, never inferred from a name. Yield input on the editor allows the authored 0. |
| 2026-09-19 | Seed flags authored as received (Robert: scratch kitchen by default, raw in and cut in house; a default is not an exclusion — a line bought pre-cut carries the fresh-cut category): Gulf drum Finfish; Texas melon Melons (fresh); dill Herbs (fresh); bell peppers Peppers (fresh). `pnpm muse:sync-recipes` syncs seed recipes alone to the database, without the full reseed's customer and menu reset. |
| 2026-09-19 | **Dictate locked on the published site:** the platform's `Permissions-Policy` header sends `microphone=()` on every route, so the speech recognizer could never open the microphone in production. `next.config.ts` now overrides the Compare route alone with `microphone=(self)`; every other page keeps the denial. |
| 2026-09-19 | Robert's second live instruction (E005, chicken bought pre-prepared, "adjust time and labor costs as needed") recorded as fixture 12. The model removed the cook step on its own with "pre-prepared" as the only basis; rule 4a now says `removeStep` is the chef's words only and "pre-prepared" / "adjust as needed" are not those words — the platform asks what the step becomes. The eval compares variant names without case. |
| 2026-09-19 | **Phase R6 closed for now.** Dictate confirmed working on the published site after the Permissions-Policy override. The Recipe tab opens on AMK-E-003 (the recipe the tab was built and tested on) and lists recipes by code, pinned in code so database order cannot move it. Twelve fixtures. Open: the variant save on the published site is still unverified end to end, and the Food Traceability List answer on a new line has no catalog to be found on. |
