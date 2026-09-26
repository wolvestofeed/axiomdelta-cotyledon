# Impact OS — the CompTable contract

**Version 1** (Roadmap O4, `roadmaps/people-roadmap.md`). Co-versioned with
`apps/web/src/app/(muse)/muse/_engine/comptable-contract.ts` (the schemas and the builders and
readers) and `_lib/comptable-signing.ts` (the notice signature). A change to a document's fields is
a new version; both sides accept only the version they were built for.

Muse Kitchen's HR runs in CompTable: roster, wages, burden, benefits, the published schedule,
payroll. Muse is the production system: it knows the labor hours the plan requires and takes the
punches on the Floor and the Sales portal. This contract is what crosses between them.

## 1. What crosses

| Document | From → to | When | Carries | Never carries |
|---|---|---|---|---|
| `muse.punches` | Muse → CompTable | As punches are taken on the Floor and the Sales portal | CompTable employee reference, punch kind, the work role of the shift (operator or sales — payroll reads hours by role, Roadmap P2), time, kitchen-local work date, clock or manual with reason; a count of punches held back for staff with no CompTable reference | Names, notes, pay |
| `muse.staff_demand` | Muse → CompTable | Two weeks out, from the production plans (O3) | Per day: task, station, headcount, hours; recipes with batches and no time study at all (a recipe with no adopted study is staffed from its estimated study) | Positions, pay |
| `muse.labor_demand` | Muse → CompTable | Per forecast version | The forecast (scenario id, saved-at), hours by month, task and station | Pay |
| `comptable.published_schedule` | CompTable → Muse | Each published week | Shifts: employee reference, full name, position, start, end | Pay |
| `comptable.closed_payroll_period` | CompTable → Muse | When a pay period closes | Period, pay date, totals by account (wages, payroll taxes, workers' comp, benefits) in cents, regular and overtime hours | Any individual's pay |
| `comptable.labor_cost` | CompTable → Muse | In answer to a labor demand | The forecast it answers, the CompTable scenario that priced it, cents by month and account | Any individual's pay |
| `comptable.staff_joined` | CompTable → Muse | When a person is hired | CompTable employee reference, display name, role, sign-in email, start date | Pay, employment classification, any personal detail |
| `comptable.staff_record` | CompTable → Muse (read) | When an admin opens a person on HR | Name, position, employment type, status, hire and term dates, FLSA status, base wage, scheduled hours, bonus | — (confidential; never stored in `muse.*`, never sent to an operator's browser) |

Every document is validated strictly: a field the version does not name is refused, so a wage
cannot ride along on a shift or a per-person breakdown on a payroll period.

**`comptable.staff_joined` is the onboarding trigger** (Robert), part of version 1. CompTable owns
HR, so a hire is an event there. Muse handles the notice by opening or reactivating the local register row — a mirror, matched on `employeeRef` — and assigning
every training document in force. One entry point, `onStaffJoined` in `_lib/onboarding.ts`, serves
both this and an admin adding a person in Muse, so the two paths cannot drift.

The staff RECORD stays unannounced and read-through: it carries pay. The announcement carries a
reference, a display name, the role, the sign-in email and the start date, and the schema refuses
anything else.

Onboarding fires on the notice, never on someone opening a page. `syncOrientationAssignments` runs
on the Training page as an idempotent backstop for drift only; it is not the onboarding mechanism.

## 2. Rules per document

- **Punches.** A punch is dated on the kitchen's local day (`America/Chicago`). Punches by staff
  with no CompTable reference are not sent; they are counted in `unmatched`.
- **Staff demand.** The O3 document (`staffDemandDocument`). A day is a production day, a delivery
  day or both: batch-stream tasks fall on the production day (per batch cooked), dispatch-stream tasks on the delivery day (per portion
  shipped; loading once that day). The stream is not a field; CompTable maps task and station to
  its positions.
- **Published schedule.** CompTable publishes a week at a time (`schedule_periods` is a seven-day
  window), so a two-week schedule arrives as two documents. When a week is published more than once,
  the latest publish of that week is the one in force. A shift ends after it starts. Coverage by day compares scheduled
  hours and distinct people against demand hours and headcount, a shift counting on the local date
  it starts (`coverageByDay`).
- **Closed payroll period.** Totals are whole cents, the period ends on or after it starts, the pay
  date is on or after the period end. Received, it becomes a `muse.payroll_periods` row
  (`closedPeriodFromDocument`) and O1 posts the Actual ledger from it.
- **Labor cost.** One line per month and account. It names the forecast it answered; when that
  forecast is saved again the cost reads as out of date (`laborCostIsCurrent`).
- **Staff record.** Read at request time for an admin and rendered on the server; not stored.

## 3. Transport (gated)

- **Notice.** `{ contract: "muse-comptable", version: 1, eventId (uuid), kind, account, documentRef,
  occurredAt }`, posted to the receiver. It names the event and the document; it carries no
  document content.
- **Signature.** HMAC-SHA256 over `<unix seconds>.<raw body>`, sent as
  `x-muse-comptable-signature: t=<seconds>,v1=<hex>`. Refused if more than 300 seconds old or new,
  or if it matches none of the current secrets (two secrets are held during a rotation). Compared in
  constant time.
- **Read.** The receiver reads `documentRef` through an authenticated, read-only API scoped to the
  Muse Kitchen account.
- **Once.** Each `eventId` is recorded when handled; a repeated notice is dropped
  (`unhandledNotices`).

Waiting on: Muse on its own domain; the Muse Kitchen account (one org, one location) in
CompTable; signing secrets; the endpoints on both sides; a Muse table recording handled events.

## 4. CompTable's side — what exists and the gaps

What CompTable produces, and what the contract needs from it that it does not have.
The CompTable side is a CompTable change, approved separately under the Muse scope boundary
(`CLAUDE.md` §7).

| Contract need | CompTable | Gap |
|---|---|---|
| An employee reference Muse can hold | `employees.id` (uuid) under `rosters` → `locations` → `orgs`; names, position (free text), employment type, status, hire / term dates, FLSA status, base wage, scheduled hours, bonus | None for the reference: `muse.staff.comptable_employee_ref` holds `employees.id` |
| Receive punches | No clock table. Scheduler Phase 6e plans `actual_shifts` for POS clock-ins, not built | A landing place for punches (in, breaks, out) per employee |
| Receive staff demand, map to positions | No demand intake; the native scheduler (`native_shifts`) is authored by hand | A demand intake and a task/station → position map |
| Publish a schedule | Native scheduler: `native_shifts` (employee, start, end, role, draft / published), `schedule_periods` (one row per published week), `shift_change_log` | An outbound notice on publish; nothing else |
| Close a pay period | No pay run or pay-period close. The ledger has month-end `period_locks` and the accounts (2120 accrued payroll taxes, 2130 accrued workers' comp, 6100 employer payroll taxes, 6110 workers' comp) | A biweekly pay-period close producing kitchen totals by account and hours |
| Price labor demand | `runScenario` + `decomposePayroll` give **annual** wages, service-charge distribution, employer payroll taxes, workers' comp and benefits (and the FICA tip credit, which does not apply to Muse) | Pricing hours by task from Muse rather than a roster, and a monthly split |
| Staff record read-through | The data is in `employees`; the only outside read is the per-employee `/me/[token]` share view | An authenticated, org-scoped read API |
| Signed notices, once | `webhook_events` (raw payload, received / processed, error) and `tool_connections` (provider, status, credentials pointer) exist; the provider list has no Muse entry; signature checks are planned in Scheduler 6c | A Muse connection and a signed receiver |

## 5. Mapping the accounts

| Contract account | Muse accrual (`_data/coa-muse.ts`) | CompTable |
|---|---|---|
| `wages` | 2110 accrued wages | `wagesGross` + `serviceChargeDistribution` |
| `payroll_taxes` | 2120 accrued payroll taxes | 2120 / 6100, `employerPayrollTaxes` |
| `workers_comp` | 2130 accrued workers' comp | 2130 / 6110, `workersCompPremium` |
| `benefits` | 2140 accrued benefits | `benefitsCost` |
