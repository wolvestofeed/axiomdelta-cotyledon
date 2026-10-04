# Cotyledon — inventory & cost accounting policy

The authority behind every number the platform posts. Co-versioned with
`src/engine/production-ledger.ts`, `src/engine/index.ts` and `src/data/coa-farm.ts`: if a rule
here changes, the engine changes with it, and the reverse.

Written for a reader who has to sign off on the books — a CPA, a lender or an
investor. It states what the platform does and the authority for
doing it. It does not counsel; the operator decides.

---

## 1. Framework and posture

- **US GAAP**, ASC 330 *Inventory*, on a **perpetual** inventory system at **actual cost**.
  Every purchase order, receipt, supplier bill and payment carries the price actually quoted
  and paid, and the ledger carries the same dollars.
- **Materials** (seed, medium, nutrients, packaging) are carried by **lot at the price paid**:
  specific identification where the sowing names the lot it drew, first in, first out where
  it does not (ASC 330-10-30-9). The lot register is both the physical and the cost record.
- **Direct labor** is the sowing record's recorded hours at the recorded rate. A sowing whose
  crew is not recorded carries the approved labor standard (§5) and says so.
- **Fixed manufacturing overhead** is absorbed at a predetermined rate on normal capacity
  (§4), as ASC 330-10-30-3 requires under any cost method. **Variable manufacturing
  overhead** that is not metered per sowing (the light a tray takes, its tray wear, the
  sanitizer) is applied at its standard per tray (§2).
- **IAS 2** is satisfied by the same engine: actual cost by specific identification and FIFO,
  normal-capacity absorption and abnormal waste as a period charge. LIFO is not used.

## 2. What is a product cost and what is not

ASC 330-10-30-1 — inventory carries the expenditures and charges incurred to bring
an article to its existing condition and location.

**Inventoriable**

| Element | Treatment |
|---|---|
| Purchased inputs | Seed, medium and nutrient at the price paid for the lot; freight-in and duties capitalise into the lot. Issued from raw materials to WIP-Sow at the cost of the lot drawn, on the quantity issued |
| Packaging | Each plan's own picks from the packaging library at the library's cost — never a flat charge on every grow plan; received into its own inventory at the price paid and charged at the pack stage at the cost of the lot drawn |
| Direct labor | The sowing record's recorded hours × recorded loaded rate; with no crew recorded, the approved standard hours × standard loaded rate on the trays sown. Absorbed by stream: the sowing stream to WIP-Sow, the daily stream to WIP-Grow, the harvest stream to WIP-Pack, split by the plan's study |
| Variable manufacturing overhead | The light a tray takes (to WIP-Grow), its tray wear and the sanitizer (to WIP-Sow), applied at their standard per tray on the trays sown and credited to 5195. None of them is bought into raw materials |
| Fixed manufacturing overhead | Absorbed at a predetermined rate set on **normal capacity** (§4) |
| Normal spoilage | Inside the 3% shrink allowance; stays in the sowing's cost |

**Not inventoriable**

| Element | Authority |
|---|---|
| Distribution and distribution to pickup points | ASC 330-10-30-8 — selling costs are period costs |
| Abnormal spoilage | ASC 330-10-30-7 — a current-period charge |
| Unabsorbed fixed overhead | ASC 330-10-30-3 — expensed as incurred |
| General and administrative expense | ASC 330-10-30-8 |
| Research and development: an experiment's sowing, finished or lost | ASC 730-10-25-1 — expensed as incurred (§14) |

Distribution is a selling cost: it is deducted after the
**cost of a unit** (food, labor, packaging) to reach contribution, and it is excluded
from the **inventory** figure. Fixed cost is in neither; it is a period expense, with
fixed cost per unit reported as a period metric (§4). The **cost to serve** shown on
Grow plans is the management figure that adds distribution back to the
cost of a unit; storage stays out of it. The cost of a unit is built by sowing: the
planned cost of one full-line sowing from bulk inputs, the sowing's yield, and the sowing
cost divided into its units (`sowingCosting`).

## 3. The chart of accounts

The ledger's `DEFAULT_HOSPITALITY_COA` (`src/ledger`) is a restaurant chart with one inventory
account and no work in process. A facility growing trays is a manufacturer:
trays sit in WIP for their cycle carrying absorbed labor and overhead. Cotyledon
**extends** that chart rather than editing it (`src/data/coa-farm.ts`).

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
| 5011 | Cost of Goods Sold — Materials | Seed, medium, nutrient and packaging in the units distributed |
| 5012 | Cost of Goods Sold — Labor | Direct labor in the units distributed |
| 5013 | Cost of Goods Sold — Overhead | Variable overhead applied and fixed overhead absorbed in the units distributed. The shared chart's 5010 is not posted |
| 5150 | MOH Spending Variance | Actual fixed overhead against budget |
| 5160 | MOH Volume Variance | Budget not absorbed because volume < normal capacity |
| 5170 | Production Labor Not Charged to a Sowing | Loaded labor on the time clock beyond what sowing records charged; a period production cost (§16) |
| 5180 | Manufacturing Overhead Control | Fixed manufacturing overhead actually incurred in the period |
| 5190 | Manufacturing Overhead Applied | Contra for fixed overhead; cleared against control at period end |
| 5195 | Variable Manufacturing Overhead Applied | Contra for light, tray wear and sanitizer applied at their standard per tray; the electricity, trays and sanitizer are expensed as billed |
| 5910 | Abnormal Spoilage | Its own P&L line, never buried in cost of goods sold |
| 7910 | Marketplace Commissions | Retained by a marketplace on ghost-farm orders; a selling cost (§16) |
| 7920 | Research and Development | An experiment's sowing at its full cost: materials, labor, overhead applied and absorbed, and any loss (§14) |

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
room's share of the household services other than the grow lights' electricity, which is
variable overhead applied per tray (§2); for a rented commercial facility, its rent and
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

## 5. Standards: labor and overhead only

Materials are carried at actual cost and need no standard. What stands in for an actual cost
until one is recorded is the **labor standard** and the **overhead rates**, and those are
effective-dated and versioned (`farm.standard_versions`):

- A version is the grow plan's labor standard (minutes per sowing, per unit and on the daily
  stream per unit, at the loaded rate), its variable overhead per tray (the light it takes, its tray
  wear and the sanitizer) and the fixed overhead absorption rate, as resolved on the plan of record,
  frozen when a super admin approves it with an effective date. It freezes no material price and no
  line of the plan. The ledger reads from the version in force on a sowing's production date its
  labor standard (for a sowing with no crew recorded), its variable overhead per tray and its fixed
  overhead rate, and the sowing record names the version, so a reviewer can reproduce the cost. A
  version approved before only labor and overhead were frozen is read for the labor standard and
  overhead per tray it froze; its grow plan and prices are not used. A sowing dated
  before any approved version reads them from the live library and the period says so. An
  effective date inside a locked period is refused. Editing the library or the plan changes
  what the next approval freezes; it never moves a standard already in force.
- Approving a time study approves a version effective that day, so the plan's labor standard
  moves to the new average of its approved studies for sowings from that day; a sowing sown
  before it keeps the version it was sown at.
- Revision interval: `assumptions.standardCost.revisionIntervalMonths`.

**The run buys for the allowance.** The purchase order for a run is built on
`units × (1 + shrink allowance)`: the allowance is seed and medium bought and never packed,
so the quantity received carries it and raw materials are relieved by no more than was
received.

**Case-rounding is quantity, not cost.** A purchase order rounded up to whole cases buys more
than the run needs. The extra is inventory on hand at the price paid, and it nets against the
next run's requirement.

## 6. Spoilage — normal against abnormal

The distinction decides inventory against expense, so it is a captured field, not a
judgement made at close.

Every scrap transaction carries a **disposition reason code** (`src/engine/sowing.ts`).
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

Normal spoilage is inside the 3% shrink allowance and stays in the sowing's cost.
Abnormal spoilage is relieved from the stage it occurred in and charged to 5910, **at
the fully absorbed cost of the stages it passed**, per gram of the sowing's harvest:
seed lost before or at sowing (stage `SOW`) is raw material at the lot's price paid; a gram lost on the shelves (`GROW`) carries the sow and grow
stages, one lost at the harvest check or in packing (`PACK`) the pack stage as well,
and one lost after packing (`FINISHED`) the packaging too. A tray removed at the
check therefore leaves with the material, labor and overhead already spent on it,
and a packed tray carries the sowing's cost.

**The allowance is on the record.** The planned issue for a sowing is the quantity
the trays sown were bought for, `trays × (1 + shrink allowance)`, and each variety lot
carries its allowance in grams. The prefilled record shows the allowance as normal
`TRIM` scrap at stage `SOW` — seed sorted out before sowing — so a record that ran
exactly to plan balances. A scrap event with a normal
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

## 10. Prices: the plan's, the order's and the ledger's

Three prices are kept apart, and only one of them is on the ledger.

| Price | Where it is used | What it is |
|---|---|---|
| **The plan's price** | The cost card, the forecast, the plan of record, Unit Economics | For a seed line, the variety's **last price paid** per pound, from its most recent accepted receipt; the supplier's catalog price until the first receipt; the variety record's opening price until then. For a medium or nutrient line, its library price. A price typed on a forecast stands over all of them |
| **The order's price** | Purchase orders | The supplier's published price in force, from the approved catalog; the last price paid where no catalog price is on file; the record's price until then |
| **The ledger's price** | Receipts, issues, work in process, finished goods, cost of goods sold | What was paid for the lot drawn (§1) |

The **rolling 12-month average** — the dollars over the quantity on the accepted receipt lines of
the last twelve months, per variety, medium and nutrient — is a key performance figure on seed,
media and nutrient costs. It is shown beside each item and reported on Reports. It is not a
price any plan, order or posting uses, and nothing on the ledger reads it.

## 11. Internal controls the platform enforces

Not SOX — this is a private company — but these are what an auditor's completeness
and cutoff testing goes at.

- **The ledger posts from the sowing execution record only.** Planning surfaces never
  write journals. A plan change cannot restate the books. (ISA-95 / IEC 62264: the
  Level 3 production performance object is the source, not the Level 4 schedule.)
- **Every posting carries a source document reference** — the sowing id.
- **A sowing that does not mass-balance does not close.**
- **Scrap cannot be recorded without a disposition reason code.**
- **Labor and overhead standards are effective-dated**, so the standard in force on any
  production date is reproducible; material cost is the lot's, so it is reproducible from
  the lot register.
- **Work in process clears to zero** when a sowing is packed. Asserted by test, in
  cents: rounding a combined figure once leaves a cent in a stage account that
  reads as inventory which does not exist and never clears.

## 12. Open items

These are named rather than resolved. Nothing here is settled by the engine.

- Most medium and nutrient prices are placeholders until their first receipt.
- Budgeted fixed manufacturing overhead is the manufacturing-overhead fixed-cost
  lines (lease, utilities) plus straight-line depreciation, not a cost budget with
  maintenance and production supplies.
- The plant capacity a forecast's production is bound by rides on a presumed
  operating day (07:00–19:00, PLACEHOLDER) that has not been decided.
- Planned maintenance downtime is a 3% placeholder.
- The light a tray takes, its tray wear and the sanitizer are applied to work in process
  at their standard per tray (5195); the forecast bills no electricity by tray-day, no
  trays and no sanitizer against them, so on the Plan ledger their applied credit stands
  with nothing incurred beside it.
- A sowing record with no crew recorded posts labor at the approved standard; Plan ledger
  sowings carry none.

## 14. Actuals

A recorded period posts from its records through the same posting functions as the
Plan ledger (§17); nothing is typed as a dollar total.

| Record | Posts |
|---|---|
| Sowing record | Issue → apply → labor → overhead → sow → grow → pack → finished goods: the seed, medium and nutrient issued at the cost of the lots drawn, labor at the recorded hours and rate (the approved standard where no crew is recorded), variable overhead at its standard per tray and fixed overhead at the rate in force, on the trays sown; abnormal spoilage for trays removed at the check. The sowing's cost per packed unit is kept by element (materials, labor, overhead). No receipt or shipment of its own. Refused at close unless the mass balance reconciles. |
| Experiment | A sowing record that names an experiment in R&D (`experiment_id`). It posts the sowing chain above, drawing its lots, charging its labor and applying and absorbing overhead as any sowing does, so its cost is built the same way and the lot register and payroll stay whole. At pack its trays go from the pack stage straight to Research and Development (7920) at their cost, never into finished goods, so no distribution relieves them and they are no part of the cost per unit made; a loss at any stage goes to 7920 too rather than to Abnormal Spoilage (5910), and a loss after packing is already inside that charge: a failed experiment is the cost of the research (ASC 730-10-25-1). It ships nothing. A tray given away from it is not a distribution and is not revenue. 7920 sits among operating expenses on the statement of income. |
| Receipt | Accepted lines: raw materials by lot at the price received, against goods received not invoiced (2015) at the same amount. A rejected line posts nothing. |
| Supplier bill | Recorded only when it equals its receipts, line for line in quantity and value; it clears goods received not invoiced and credits the payable at the same amount (§16). |
| Absorption | A sowing with no approved version in force absorbs at the rate the same forecast's Plan ledger sets on its own production (§4, §17); a version absorbs at the rate it froze, which is the plan of record's Plan ledger rate at approval. |
| Distribution | A recorded distribution names its grow plan through the order it was recorded against. Revenue by channel, to receivables for Subscriptions and Restaurants and to processor clearing (1200) for Retail and wholesale; cost of goods sold at the cost per unit of the finished goods relieved, first in, first out by sowing within the grow plan the distribution names (else across every grow plan's finished goods), by element to 5011, 5012 and 5013; distribution expense; retail commission deducted from the remittance. Units beyond the finished goods on hand are costed at the grow plan's most recent sowing cost per unit, else its cost card, else zero; finished goods goes negative by that amount and the period's notes name the units. |
| Own use | A distribution to a subscriber marked own use: the owner's own trays leave finished goods at their cost, first in, first out as any distribution relieves them, to Owner Draws (3200). No revenue, no receivable, no cost of goods sold, no distribution expense and no invoice: goods the owner takes for his own consumption are a draw on his equity, not a sale. |
| Subscriber / supplier payment | Cash against receivables / payables, applied to invoices / bills. |
| Opening balance | Cash, the fit-out at cost, long-term debt and owners' equity as of its date. |
| Payroll | At month end, loaded labor earned on the time clock less what the month's sowing records charged, to 5170 against the four payroll liabilities; on each pay date through today, the pay period's loaded labor paid in cash (§16). |
| Period bill | Lease and utilities to Overhead Control; admin to G&A; other to the named account; payable until a paid-on date posts the payment. |
| Month end | One twelfth of annual depreciation to Overhead Control; applied closed against incurred, the difference to the volume variance. |
| Equity contribution | Cash against owners' equity (3100). |
| Capital purchase | Fixed assets (1700) at cost against cash. |
| Loan draw / payment | Draw: cash against long-term debt (2900). Payment: interest to 8020, principal against 2900, cash. |
| Marketplace deposit | Cash against processor clearing (1200). |

Each sowing is a layer of finished goods from its sow date, holding its units and its cost
by element in cents; a distribution that takes a layer's last unit takes what the layer has
left, so finished goods clears to the cent once everything made is distributed. Receivables and payables are not settled unless a payment record
applies to them: the actuals position carries real working capital, and it opens
from the opening balance record once one is recorded (§16). The forecast-month column
on Actuals is the Plan ledger's own month for the same period. A shipment given no
price posts no revenue and says so; there is no default price.

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

## 16. Working capital, invoicing and payroll

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

A receipt posts raw materials by lot at the price received and credits goods received not invoiced
(2015) at the same amount. Receiving
has no tolerance: each line keeps its purchase-order quantity and price, and a line received short,
over or at a changed price states the override reason. The supplier's bill is recorded against the
receipts it covers and clears 2015 at what they received; the bill is credited to accounts payable.
The match is exact: order against receipt needs the override reason for any difference, and the bill
must equal what was received, input by input, in quantity and value. A bill that does not
match is refused at recording with its differences listed: a bill that differs from the purchase
order is a misunderstanding to rectify with the supplier before any money moves. Until the
corrected bill is recorded, goods received not invoiced carries the liability at what was received.

### Aging and days outstanding

Aging counts calendar days past the due date: not yet due, 0–30, 31–60, 61–90, 90+. Days to collect
is the period-end receivable over the period's billings to receivables × the period's calendar days;
days to pay is period-end trade payables (2010 + 2015) over the period's trade purchases × its
calendar days.

### The forecast window

A forecast runs from its start date — 2027-01-01, the year the loans start, unless the forecast
carries another — for one year, or two or three (§17). It opens with owners' equity in cash (3100)
at the start ($2,500 on file, the owner's contribution Rob stated) and draws each loan on its start date (2027-01-01 on file).
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
benefits (2140). Pay is held in Staffing, the internal module (Phase 4): it holds wages, burden and benefits,
closes each pay period and posts its totals by account; the clock times are its record. Time is
kept on the internal time clock: clock in, start and end a break, clock out. A shift is clock-in to
clock-out less breaks; a shift with no clock-out counts no hours; hours past 40 in a Monday–Sunday
workweek are overtime (29 U.S.C. 207(a)(1)). Pay periods are biweekly, Monday through the second
Sunday, paid the Friday five days later; the date the sequence counts from is a placeholder. At each
month end the part of each closed pay period earned in the month — by the hours on the clock, else by
calendar days — is accrued against what the month's sowing records charged to work in process, and
the difference is production labor not charged to a sowing (5170), a period production cost. Hours on
the clock on dates no closed pay period covers accrue nothing and are noted. Each closed pay period
is paid in cash on its pay date; no payroll run is recorded yet, so the pay date is taken as the
payment through today. A sowing record charges its recorded crew hours at the recorded rate, and
the approved labor standard at the plan's placeholder rate where no crew is recorded, until
the Staffing module's loaded rates arrive (Phase 4). Pay periods paid after the forecast window ends stay accrued.

### Opening balance

The actuals carry one opening balance record: owners' equity, the fit-out at cost and the long-term
debt, as of a date. Opening cash is equity plus debt less the fit-out.

## 17. The Plan ledger

A forecast's timeline (`simulateForecast`) posts through `postActuals` — the same functions as the
actuals (§14) — so actual against plan is the same report run twice. Nothing is stored.

| Element | Plan treatment |
|---|---|
| Documents | Sowing records at the plan's labor standard, receipts at the order's price, supplier bills and payments, distributions, monthly invoices and collections, closed pay periods, fixed-cost bills, capital purchases, loan draws and payments, equity at the start, marketplace deposits — all generated by the timeline |
| Standard | Every sowing at the live library for its labor standard and overhead; the plan is where standards come from, so no per-sowing approval note is written. Its seed, medium and nutrient issue at the cost of the lots the forecast's receipts bought, at the order's price, as an actual sowing issues its lots |
| Absorption | The forecast's own production as normal capacity (§4) |
| Overhead budget | Each month, the manufacturing-overhead fixed-cost lines in force that month, lease or utilities by the category their bill settles |
| Depreciation | Straight-line on each capital purchase from the month it is bought over its class life (equipment and leasehold years) |
| No terms on file | Invoices collected on the issue date; supplier bills — including inputs with no supplier linked — paid on the bill date; own-fleet distribution cost paid on the distribution date; fixed-cost bills paid on the first of the month; marketplace remittances, net of commission, deposited on the distribution date. Each is named in the timeline's gaps |
| Statements | By month, calendar quarter and fiscal year (§15), clipped to the forecast window: classified income statement (revenue by channel; cost of goods sold by element — materials, labor, overhead — with its subtotal, and the overhead spending and volume variances; gross margin; selling and distribution, general and administrative, operating income, interest, net income), classified balance sheet with inventory by stage, cash flow by the direct and the indirect method asserted equal, every period balanced. Each grow plan is costed on its own lines |

The indirect cash flow classifies capital and debt by whether cash moved in the entry: capital bought
for cash is investing, a loan drawn or repaid in cash is financing, and a fit-out capitalised and
financed in one entry stays a non-cash disclosure.
