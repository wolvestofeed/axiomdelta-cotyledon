# Muse research and review records

Diagnoses, review passes and scoping records behind the engine. Canonical status lives in
[`../roadmap.md`](../roadmap.md); open items in [`../TODO.md`](../TODO.md); the accounting rules in
[`../accounting-policy.md`](../accounting-policy.md). Nothing here is a source of current status.

| File | What it is |
|---|---|
| `validation-notes.md` | The known model inconsistencies, kept out of the UI by decision (2026-09-10), with their resolution history. |
| `model-corrections-2026-09-13.md` | Diagnosis of record for the portion-weight, cooked-yield and labor-basis corrections (ISSUE-01…09). |
| `model-and-chiller-corrections-instruction-2026-09-13.md` | The instruction and issue register the 2026-09-13 corrections were applied from. |
| `batch-resource-instruction-2026-09-17.md` | The instruction to bind a batch to one unit of each vessel and register concurrent units as a multi-batch run. Supersedes the remedy in ISSUE-13. |
| `os-assessment-checklist-2026-09-14.md` | The gap checklist Roadmap Phases I–M were sequenced from. |
| `Impact OS competitors.txt` | Notes on competing commissary, bakery and food-safety systems; their product names are theirs. |
| `platform-scope-2026-09-10/` | The scoping documents and build brief from before the first repo session, moved in from the confidential source folder on 2026-09-14 with stealth names scrubbed. |

The confidential source material (company research, the operating-model workbooks, application
and interview material) stays in the git-ignored `docs/muse/confidential/` folder and is never committed.
Derived, attributed datasets are generated out of it by `apps/web/scripts/*muse*`.
