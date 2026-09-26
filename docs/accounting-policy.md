# MicroFarm — inventory & cost accounting policy

The authority behind every number the platform posts. Co-versioned with
`_engine/production-ledger.ts`, `_engine/index.ts` and `_data/coa-farm.ts`: if a rule
here changes, the engine changes with it, and the reverse.

Written for a reader who has to sign off on the books — a CPA, a lender, or a
district's finance office. It states what the platform does and the authority for
doing it. It does not counsel; the operator decides.

---

## 1. Framework and posture

- **US GAAP**, ASC 330 *Inventory*, on a **perpetual** inventory system at
  **standard cost**, with variances isolated at the point they arise.
- **IAS 2** is satisfied by the same engine. The two converged on the points that
  matter here (normal-capacity absorption, abnormal waste, standard cost as an
  approximation), so no second calculation exists. LIFO is not used, which keeps
  the IFRS path open.
- Cost flow assumption: **weighted average at standard**, with FIFO lot
  consumption for physical and traceability purposes. Standard cost is the
  carrying basis; the lot register is the physical record.

## 2. What is a product cost and what is not

ASC 330-10-30-1 — inventory carries the expenditures and charges incurred to bring
an article to its existing condition and location.

**Inventoriable**

| Element | Treatment |
|---|---|
| Purchased inputs | Seed, medium and nutrient at standard purchase price; freight-in and duties capitalise. Issued from raw materials to WIP-Sow on the trays sown |
| Packaging | Each plan's own picks from the packaging library at the library's cost (Roadmap N1, N9) — never a flat charge on every crop plan; received into its own inventory at standard and charged at the pack stage |
| Direct labor | Standard hours × standard loaded rate on the trays sown, absorbed by stream: the sowing stream to WIP-Sow, the daily stream to WIP-Grow, the harvest stream to WIP-Pack, split by the plan's study |
| Variable manufacturing overhead | The light a tray takes (to WIP-Grow), its tray wear and the sanitizer (to WIP-Sow), applied at their standard per tray on the trays sown and credited to 5195. None of them is bought into raw materials |
| Fixed manufacturing overhead | Absorbed at a predetermined rate set on **normal capacity** (§4) |
| Normal spoilage | Inside the 3% shrink allowance; already in standard cost |

**Not inventoriable**

| Element | Authority |
|---|---|
| Distribution and distribution to pickup points | ASC 330-10-30-8 — selling costs are period costs |
| Abnormal spoilage | ASC 330-10-30-7 — a current-period charge |
| Unabsorbed fixed overhead | ASC 330-10-30-3 — expensed as incurred |
| General and administrative expense | ASC 330-10-30-8 |

Distribution is a selling cost: it is deducted after the
**cost of a unit** (food, labor, packaging) to reach contribution, and it is excluded
from the **inventory** figure. Fixed cost is in neither; it is a period expense, with
fixed cost per unit reported as a period metric (§4). The **cost to serve** shown on
Crop plans is the management figure that adds distribution back to the
cost of a unit; storage stays out of it. The cost of a unit is built by sowing: the
planned cost of one full-line sowing from bulk inputs, the sowing's yield, and the sowing
cost divided into its units (`sowingCosting`).

## 3. The chart of accounts

Staffing's `DEFAULT_HOSPITALITY_COA` is a restaurant chart with one inventory
account and no work in process. A facility growing trays is a manufacturer:
trays sit in WIP for their cycle carrying absorbed labor and overhead. Farm
**extends** that chart rather than editing it (`_data/coa-farm.ts`); every other
Staffing surface keeps the accounts it has.

| Code | Account | Why it exists |
|---|---|---|
| 1410 | Inventory — Food | Raw materials |
| 1415 | Inventory — Packaging & Disposables | Packaging is a product cost charged at pack |
| 1430 | Work in Process — Sow | Trays sown: seed, medium and nutrient, tray wear and sanitizer, the sowing stream, fixed overhead |
| 1435 | Work in Process — Grow | Trays on the shelves: light and the daily stream over the cycle |
| 1440 | Work in Process — Pack | Harvested trays at the check and in packing: the harvest stream |
| 1450 | Inventory — Finished Goods | Packed units awaiting distribution |
| 2015 | Goods Received Not Invoiced | Clearing between receipt and vendor invoice |
| 2160 | Accrued Manufacturing Overhead | Budgeted lease and utilities accrued at month end until the bill settles it (§4) |
| 5110 | Purchase Price Variance | Invoice against standard, at receipt |
| 5120 | Material Usage Variance | Actual issue against standard, at standard price |
| 5130 | Direct Labor Rate Variance | Actual rate against standard, on actual hours |
| 5140 | Direct Labor Efficiency Variance | Actual hours against standard, at standard rate |
| 5150 | MOH Spending Variance | Actual fixed overhead against budget |
| 5160 | MOH Volume Variance | Budget not absorbed because volume < normal capacity |
| 5170 | Production Labor Not Charged to a Sowing | Loaded labor on the time clock beyond what sowing records charged; a period production cost (§16) |
| 5180 | Manufacturing Overhead Control | Fixed manufacturing overhead actually incurred in the period |
| 5190 | Manufacturing Overhead Applied | Contra for fixed overhead; cleared against control at period end |
| 5195 | Variable Manufacturing Overhead Applied | Contra for light, tray wear and sanitizer applied at their standard per tray; the electricity, trays and sanitizer are expensed as billed |
| 5910 | Abnormal Spoilage | Its own P&L line, never buried in cost of goods sold |
| 7910 | Marketplace Commissions | Retained by a marketplace on ghost-farm orders; a selling cost (§16) |

**Three WIP stages, not one.** A tray is sown on one day, sits on its grow unit for its
cycle and is harvested and packed at the end of it. Making each a costing boundary means
a sowing held across a period end can be valued at the stage it is actually in, and a
tray lost on the shelves leaves with the cost it had reached.

## 4. Fixed overhead absorption — the material policy

**Rule.** Fixed manufacturing overhead is absorbed at a predetermined rate:

```
rate per unit = budgeted annual fixed manufacturing overhead
              ÷ NORMAL CAPACITY in units
```

**What is in the budget.** Only MANUFACTURING overhead: for a home grow room, the grow
room's share of the household electricity; for a rented commercial facility, its rent and
utilities; and straight-line depreciation of the equipment and any build-out
(ASC 330-10-30-1 — costs of bringing product to its condition and location).
Admin, insurance, software and licenses are general and administrative expense and
debt service is financing; ASC 330-10-30-8 keeps both in the period. The engine
(`manufacturingOverheadBudget`) reports the excluded amounts beside the budget so
the base is auditable. The cost of a unit carries none of it: a unit is food, labor and
packaging. Fixed cost per unit is a **period metric** on the expense
basis — the period's lease, utilities, depreciation, admin and interest over that period's
units distributed, computed on each ledger's statement periods (`StatementPeriod.fixedExpense`),
with principal repaid reported beside it as financing — and is never a unit cost.

**Normal capacity** (ASC 330-10-20) is "the production expected to be achieved over
a number of periods or seasons under normal circumstances, taking into account the
loss of capacity resulting from planned maintenance." For this facility that is the
production the plan itself expects — the forecast's own sowings, made on the lines in
service on each date, so never more than the plant can make — net of planned maintenance
and sanitation downtime. It is **not** the theoretical daily ceiling. An engine call given no
rate absorbs on the production in the documents it posts, annualised and net of downtime
(`bundleAbsorption`) — for a plan's documents, the plan's own production.

**The Plan ledger.** A forecast posted as a Plan ledger absorbs on
its **own** production: normal capacity is the units the forecast produces a year over its horizon,
net of planned downtime, and the rate is the horizon's budgeted manufacturing overhead a year over
it. Each forecast therefore absorbs its overhead in full apart from the downtime allowance; forecasts
are not measured against the plan of record's volume. The budget each month is the manufacturing-
overhead fixed-cost lines in force that month, and depreciation runs straight-line on each capital
purchase from the month it is bought (§17).

**Consequences:**

- The rate does not move with volume. What moves is how much of the budget is
  absorbed.
- When actual volume is **below** normal capacity, the unabsorbed remainder is a
  **period charge**, not inventory. In the period it sits as Overhead Control
  (5180, incurred) against Overhead Applied (5190) and closes to the volume
  variance (5160) at period end. The ANNUAL volume variance is a period-end
  computation and is never posted on a sowing.
- When actual volume is **above** normal capacity, the per-unit rate falls so
  inventory is not carried above cost.
- **Monthly accrual.** One twelfth of the budgeted lease
  and utilities is accrued into Overhead Control at month end against Accrued
  Manufacturing Overhead (2160); depreciation posts its own twelfth. A lease or
  utilities bill recorded for the period settles the accrual, and the difference
  between the bill and the budget is the **spending variance** (5150), a period
  charge or credit. A category with no bill on file stays accrued as a liability
  until its bill is recorded. Overhead incurred is therefore the budget every
  month; what the bills did is in 5150, what the volume did is in 5160.

On the Plan ledger the downtime allowance shows as a small favourable volume variance. Fixed
cost per unit as a period metric is a different figure: it adds admin and interest to the
period's overhead and divides by the period's own units.

## 5. Standard cost and variance disposition

ASC 330-10-30-12/13 permits standard cost **only** where it approximates cost on a
recognised basis and is **revised at reasonably regular intervals** to reflect
current conditions.

- Standards are effective-dated and versioned (`farm.standard_versions`). A version is
  the crop plan as resolved on the plan of record plus the cost assumptions, frozen when a
  super admin approves it with an effective date. The ledger costs
  a sowing at the version in force on its production date and the sowing record names it,
  so a reviewer can reproduce the cost; a sowing dated before any approved version is
  costed at the live library and the period says so. An effective date inside a locked
  period is refused. Editing the library or the plan changes what the next approval
  freezes; it never moves a standard already in force.
- Revision interval: `assumptions.standardCost.revisionIntervalMonths`.
- **Disposition.** Net variance above
  `assumptions.standardCost.varianceProrationThreshold` (5% of standard cost of
  goods sold) **prorates** across ending raw materials, WIP, finished goods and
  COGS. At or below it, the whole net variance goes to COGS. Writing every
  variance to COGS regardless of size would carry inventory at a standard that no
  longer approximates cost.
- **Abnormal spoilage never prorates.** It is a period charge by rule and is
  excluded from the proration base.

**Sowing and period.** Purchase price, material usage and labor variances arise on
a sowing and are dispositioned on the sowing's net. Overhead under- or
over-absorption is a period figure — incurred against applied — and is reported
beside the sowing net, not inside it.

**The run buys for the allowance.** The purchase order for a run is built on
`units × (1 + shrink allowance)`: the allowance is trim, over-packing and
spoilage — pounds that are bought and never packed — so the quantity received
carries it and raw materials are relieved by no more than they were received.

**Case-rounding is not a variance.** A purchase order rounded up to whole cases
costs more than the crop plan standard for the run. That difference is *quantity*, not
price: it is inventory on hand and it nets against the next run's requirement.
Treating it as a purchase price variance would book a phantom unfavourable variance
every production day. Purchase price variance is measured at receipt, on the **price received**
against standard; a supplier bill that differs from what was received adds its difference to the
variance while it is flagged (§16).

## 6. Spoilage — normal against abnormal

The distinction decides inventory against expense, so it is a captured field, not a
judgement made at close.

Every scrap transaction carries a **disposition reason code** (`_engine/sowing.ts`).
ISO 9001:2015 clause 8.7 (control of nonconforming outputs) is the record format;
ISO 22400 draws the same line between planned and actual scrap.

| Normal — inventoriable | Abnormal — period charge (ASC 330-10-30-7) |
|---|---|
| Trim: seed sorted out before sowing, trim at harvest | Temperature excursion |
| | Equipment failure |
| | Contamination (a tray removed at the harvest check) |
| | Dropped or damaged |
| | Recall or withdrawal |
| | Shelf life exceeded |

Normal spoilage is already inside the 3% shrink allowance and rides into WIP with
the standard. Abnormal spoilage is relieved from the stage it occurred in and
charged to 5910, **at the fully absorbed cost of the stages it passed**, per gram of
the standard harvest: seed lost before or at sowing (stage `SOW`) is raw material at
its purchase price; a gram lost on the shelves (`GROW`) carries the sow and grow
stages, one lost at the harvest check or in packing (`PACK`) the pack stage as well,
and one lost after packing (`FINISHED`) the packaging too. A tray removed at the
check therefore leaves with the material, labor and overhead already spent on it,
and a packed tray still costs the standard.

**The allowance is on the record.** The standard issue for a sowing is the quantity
the trays sown were bought for, `trays × (1 + shrink allowance)`, and each variety lot
carries its allowance in grams. The standard record shows the allowance as normal
`TRIM` scrap at stage `SOW` — seed sorted out before sowing — so a record that ran
exactly to standard balances and has no usage variance. A scrap event with a normal
reason is normal only up to the lot's allowance, consumed in the order recorded; the
grams beyond it are abnormal spoilage and leave inventory. An abnormal reason is
abnormal in full.

## 7. The mass balance invariant

A sowing is one lot per variety, in grams: the seed issued in, the harvest out. It does
not close unless every lot reconciles:

```
harvested − scrap at the check or in packing = packed
```

Seed and harvest are not balanced against each other: growing turns seed into many
times its weight, and the variety record's yield, not the balance, says by how much.
The seed side must still hold — seed scrapped before sowing cannot exceed the seed
issued. Every gram harvested must resolve to packed product or scrap with a reason
code. Tolerance is 5 g; a residual that drifts is a control failure, not scale noise.

## 8. Revenue

ASC 606. The performance obligation is a distributed unit; control transfers on
distribution to the pickup point, which is when revenue and cost of goods sold are recognised
together. Where a contract carries a right of return on undelivered or unserved
units, that is a refund liability and a right-to-recover asset, not a reduction of
inventory.

## 9. Traceability and the consumption journal

FSMA 204 (21 CFR Part 1 subpart S) treats grow as a **transformation**
critical tracking event: the traceability lot codes and quantities of every input,
and the lot code, quantity and unit of the output.

That is the same data as the material consumption entry. **One capture, two
postings** — the ledger and the traceability record come off the same transaction,
so they cannot drift. Each variety lot on a sowing is one event: its seed lot in, its
packed grams out, and the medium and nutrient the trays took, in the lot's share of the
seed. An input with no recorded lot code is reported as a gap rather than filled with a
placeholder that would read as a record.

Compliance date carried: **2028-07-20**, FDA's proposed 30-month extension (published
2025-08-07) of the 2026-01-20 date in the rule. Carried as a field, not as logic, so it can be
corrected without a code change.

## 10. unit-pattern nutrition as a costing constraint

A prospect entree's packed weight is not a preference. It is the weight that distributes
its nutrition contribution under 7 CFR 210.10(c) for its tray format. The chain
therefore runs:

```
packed spec (nutrient profile) → SOWN required → ÷ growing yield → ÷ trim yield
→ + planned waste → SEED requirement → ÷ pack size, round up to case → PO
```

Costing runs the inverse over the same factors. Dollars are conserved through
growing; mass is not, so there is a distinct cost per pound at each stage:

```
SOWN cost/lb     = SEED cost/lb ÷ trim yield
harvested cost/lb = SEED cost/lb ÷ yield to harvest
```

Nutrition runs on the **as-served component**, not the input line: a salsa is
served as a salsa, and scored input by input every line falls under the
1/8-cup minimum and the salsa credits as nothing. Component totals are rounded once,
**down**, per USDA — to the nearest 1/4 oz eq for meats/meat alternates and grains,
and the nearest 1/8 cup for vegetables.

## 11. Internal controls the platform enforces

Not SOX — this is a private company — but these are what an auditor's completeness
and cutoff testing goes at.

- **The ledger posts from the sowing execution record only.** Planning surfaces never
  write journals. A plan change cannot restate the books. (ISA-95 / IEC 62264: the
  Level 3 production performance object is the source, not the Level 4 schedule.)
- **Every posting carries a source document reference** — the sowing id.
- **A sowing that does not mass-balance does not close.**
- **Scrap cannot be recorded without a disposition reason code.**
- **Standard cost changes are effective-dated**, so the standard in force on any
  production date is reproducible.
- **Work in process clears to zero** when a sowing is packed. Asserted by test, in
  cents: rounding a combined figure once leaves a cent in a stage account that
  reads as inventory which does not exist and never clears.

## 12. Open items

These are named rather than resolved. Nothing here is settled by the engine.

- Ten of twelve input prices are placeholders.
- The serving grow unit capacity is a placeholder. It is the cheapest physical check
  on any unit change and is a packaging quote, not a model output.
- The packing utensil is not specified. A standardized crop plan states it by size.
- Budgeted fixed manufacturing overhead is the manufacturing-overhead fixed-cost
  lines (lease, utilities) plus straight-line depreciation, not a cost budget with
  maintenance and production supplies.
- The plant capacity a forecast's production is bound by rides on a presumed
  operating day (07:00–19:00, PLACEHOLDER) that has not been decided.
- Planned maintenance downtime is a 3% placeholder.
- No trim yield is observed separately from growing yield. USDA Food Buying Guide
  factors are SEED → harvested-and-drained and already include trim, so the composite is
  used and the split is left undefined rather than invented.
- The light a tray takes, its tray wear and the sanitizer are applied to work in process
  at their standard per tray (5195); the forecast bills no electricity by tray-day, no
  trays and no sanitizer against them, so on the Plan ledger their applied credit stands
  with nothing incurred beside it. The electricity sits in the utilities of the fixed
  overhead budget.
- A sowing record with no actual labor hours posts labor at standard, so both labor
  variances are zero on it. Plan ledger sowings carry none; a recorded sowing carries
  them only when its crew hours or a total are entered.

## 14. Actuals

A recorded period posts from its records through the same posting functions as the
Plan ledger (§17); nothing is typed as a dollar total.

| Record | Posts |
|---|---|
| Sowing record | Issue → apply → labor → overhead → sow → grow → pack → finished goods, at standard on the trays sown, with usage and labor variances from the actual grams, quantities and hours, and abnormal spoilage for trays removed at the check. No receipt or shipment of its own. Refused at close unless the mass balance reconciles. |
| Receipt | Accepted lines: raw materials at standard — the input's standard from any crop plan in the library that uses it, at the version in force on the receipt date (Roadmap N5); the price received against standard to purchase price variance; goods received not invoiced (2015) at the price received. A rejected line posts nothing. An input on no crop plan is received at the price received with no variance and named in the notes. |
| Supplier bill | Clears goods received not invoiced at what its receipts received; payable at the bill; any difference to purchase price variance while the bill is flagged (§16). |
| Absorption | A sowing with no approved standard absorbs at the rate the same forecast's Plan ledger sets on its own production (§4, §17); an approved standard absorbs at the rate it froze, which is the plan of record's Plan ledger rate at approval (Roadmap N6). |
| Distribution | A recorded distribution names its crop plan through the order it was recorded against (Roadmap N9). Revenue by channel, to receivables for Subscriptions and Restaurants and to processor clearing (1200) for Retail and wholesale; cost of goods sold at the standard per unit of the crop plan distributed when the distribution names it (that crop plan's sowings in the period, else the last period that made it), otherwise the period's standard per unit (the period's own sowings, else the last period that had any; zero before any sowing has posted); distribution expense; retail commission deducted from the remittance. |
| Subscriber / supplier payment | Cash against receivables / payables, applied to invoices / bills. |
| Opening balance | Cash, the fit-out at cost, long-term debt and owners' equity as of its date. |
| Payroll | At month end, loaded labor earned on the time clock less what the month's sowing records charged, to 5170 against the four payroll liabilities; on each pay date through today, the pay period's loaded labor paid in cash (§16). |
| Period bill | Lease and utilities to Overhead Control; admin to G&A; other to the named account; payable until a paid-on date posts the payment. |
| Month end | One twelfth of annual depreciation to Overhead Control; applied closed against incurred, the difference to the volume variance. |
| Equity contribution | Cash against owners' equity (3100) (Roadmap N5). |
| Capital purchase | Fixed assets (1700) at cost against cash (Roadmap N5). |
| Loan draw / payment | Draw: cash against long-term debt (2900). Payment: interest to 8020, principal against 2900, cash (Roadmap N5). |
| Marketplace deposit | Cash against processor clearing (1200) (Roadmap N5). |

The standard per unit is carried unrounded and only a distribution's extended cost
rounds, so a period whose distributions equal its production relieves finished goods
to within a cent. Receivables and payables are not settled unless a payment record
applies to them: the actuals position carries real working capital, and it opens
from the opening balance record once one is recorded (§16). The forecast-month column
on Actuals is the Plan ledger's own month for the same period (Roadmap N6). A shipment given no
price posts no revenue and says so; there is no default price (Roadmap N9).

## 15. Periods, the lock and the posting trail

Fiscal periods are calendar months and the fiscal year is the calendar year. A period is open until a super admin locks it. **A locked
period refuses every posting dated inside it** — sowing close, receipt, distribution,
period bill, and the removal of any record — at the server, whatever the page
shows. A super admin may reopen a locked period, and must state why; the lock
and the reopen are both entries on the posting trail.

The posting trail (`farm.posting_log`) is append-only: the database refuses
updates and deletions outright. Each entry carries who acted, when, the action,
the record it concerns, the period, a detail block, the previous entry's hash and
its own SHA-256 hash over the previous hash plus its canonical fields, from a
genesis hash. An edit or a removal anywhere breaks verification from that entry
on; Actuals recomputes the whole chain on every read and shows the result. The
entry is written in the same database transaction as the record it describes, so
a record and its trail entry commit together or not at all.

The production calendar is the service weekdays less dated closures (major
holidays; the farm runs year-round). A closure takes its dates out of production and out of the
derived forecast; orders already on file are unchanged.

## 16. Working capital, invoicing and payroll (Roadmap Phase K)

Decisions of record: Robert, 2026-09-14.

### Payment terms — the reference

| Terms | Due | Suppliers | Subscribers |
|---|---|---|---|
| Due on Receipt | the document date | yes | yes |
| Net 15 | document date + 15 calendar days | yes | yes |
| Net 30 | document date + 30 calendar days | yes | yes |
| Net 60 | document date + 60 calendar days | yes | — |
| Net 90 | document date + 90 calendar days | yes | — |

There is no default. A subscriber with no terms on file cannot be issued an invoice; a supplier with
no terms on file cannot have a bill recorded; a period bill is recorded with its terms. The
document date is the invoice's issue date and the bill's date.

### Receivables

Subscriptions and Restaurants are invoiced once a month per subscriber. Revenue and the
receivable are recognised at distribution (§8); the invoice is the billing document, not the
recognition event. Each completed distribution route adds its distributions to the subscriber's open invoice
for the month, and an invoice is issued on or after its last distribution with the subscriber's terms at
that moment. Invoice numbers are `AMK-INV-YYYYMMDD-NN`, dated the day the invoice was opened.
Subscriber payments are applied to invoices; an unapplied remainder stays a credit in receivables.
Retail and wholesale orders are paid at the time of ordering: the distribution debits processor clearing
(1200), the marketplace commission is deducted from it (7910), and no receivable arises.

### Payables and the three-way match

A receipt posts raw materials at standard and credits goods received not invoiced (2015) at the
price received; the price received against standard is the purchase price variance (§5). Receiving
has no tolerance: each line keeps its purchase-order quantity and price, and a line received short,
over or at a changed price states the override reason. The supplier's bill is recorded against the
receipts it covers and clears 2015 at what they received; the bill is credited to accounts payable.
The match is exact: order against receipt needs the override reason for any difference, and the bill
must equal what was received, input by input, in quantity and value. A bill that does not
match is posted — the liability exists — with the difference in the purchase price variance, is
flagged on Payables and the Dashboard, and is not paid until rectified.

### Aging and days outstanding

Aging counts calendar days past the due date: not yet due, 0–30, 31–60, 61–90, 90+. Days to collect
is the period-end receivable over the period's billings to receivables × the period's calendar days;
days to pay is period-end trade payables (2010 + 2015) over the period's trade purchases × its
calendar days.

### The forecast window

A forecast runs from its start date — 2027-01-01, the year the loans start, unless the forecast
carries another — for one year, or two or three (§17). It opens with owners' equity in cash (3100)
at the start ($200,000 on file) and draws each loan on its start date (2027-01-01 on file).
Invoiced subscribers are invoiced at each month end and collected on the due date; supplier bills
are dated on receipt and paid on their due dates. Amounts with no terms on file settle as §17
states and the timeline names them.

### Long-term debt

Each loan amortises at a level monthly payment, paid at month end from the month it starts. Interest
is expensed and principal reduces the debt. The current unit — principal due in the twelve months
after the statement date (ASC 470-10-45) — is presented among current liabilities and is never
posted.

### Payroll and the cut-off

Loaded labor is owed as wages (2110), employer FICA, FUTA and SUTA (2120), workers' comp (2130) and
benefits (2140). No pay is held in Farm (Roadmap O1): Staffing holds wages, burden and benefits,
closes each pay period and sends its totals by account; the clock times go to Staffing. Time is
kept on the internal time clock: clock in, start and end a break, clock out. A shift is clock-in to
clock-out less breaks; a shift with no clock-out counts no hours; hours past 40 in a Monday–Sunday
workweek are overtime (29 U.S.C. 207(a)(1)). Pay periods are biweekly, Monday through the second
Sunday, paid the Friday five days later; the date the sequence counts from is a placeholder. At each
month end the part of each closed pay period earned in the month — by the hours on the clock, else by
calendar days — is accrued against what the month's sowing records charged to work in process, and
the difference is production labor not charged to a sowing (5170), a period production cost. Hours on
the clock on dates no closed pay period covers accrue nothing and are noted. Each closed pay period
is paid in cash on its pay date; no payroll run is recorded yet, so the pay date is taken as the
payment through today. Sowing records charge standard labor at the plan's placeholder rate until
Staffing's loaded rates arrive. Pay periods paid after the forecast window ends stay accrued.

### Opening balance

The actuals carry one opening balance record: owners' equity, the fit-out at cost and the long-term
debt, as of a date. Opening cash is equity plus debt less the fit-out.

## 17. The Plan ledger (Roadmap N5)

A forecast's timeline (`simulateForecast`) posts through `postActuals` — the same functions as the
actuals (§14) — so actual against plan is the same report run twice. Nothing is stored.

| Element | Plan treatment |
|---|---|
| Documents | Sowing records at standard, receipts, supplier bills and payments, distributions, monthly invoices and collections, closed pay periods, fixed-cost bills, capital purchases, loan draws and payments, equity at the start, marketplace deposits — all generated by the timeline |
| Standard | Every sowing at the live library: the plan is where standards come from, so no per-sowing approval note is written |
| Absorption | The forecast's own production as normal capacity (§4) |
| Overhead budget | Each month, the manufacturing-overhead fixed-cost lines in force that month, lease or utilities by the category their bill settles |
| Depreciation | Straight-line on each capital purchase from the month it is bought over its class life (equipment and leasehold years) |
| No terms on file | Invoices collected on the issue date; supplier bills — including inputs with no supplier linked — paid on the bill date; own-fleet distribution cost paid on the distribution date; fixed-cost bills paid on the first of the month; marketplace remittances, net of commission, deposited on the distribution date. Each is named in the timeline's gaps |
| Statements | By month, calendar quarter and fiscal year (§15), clipped to the forecast window: classified income statement (revenue by channel, cost of goods sold at standard, manufacturing variances, gross margin, selling and distribution, general and administrative, operating income, interest, net income), classified balance sheet with inventory by stage, cash flow by the direct and the indirect method asserted equal, every period balanced. Each crop plan is costed on its own standard |

The indirect cash flow classifies capital and debt by whether cash moved in the entry: capital bought
for cash is investing, a loan drawn or repaid in cash is financing, and a fit-out capitalised and
financed in one entry stays a non-cash disclosure.
