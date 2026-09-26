/**
 * Impact OS — posting the actuals.
 *
 * Server-side only (imports `@ct/ledger` through the production ledger). A
 * period with records posts from them; a period without has nothing here and
 * the pages show the forecast instead. The same chain as the forecast:
 *
 *   opening      Dr Cash, Dr Fixed Assets, Cr Long-Term Debt, Cr Owners' Equity
 *   receipt      Dr Raw Materials @ standard, Dr/Cr PPV, Cr GR/IR at the price
 *                received (accepted lines only)                       (receipt record)
 *   supplier bill Dr GR/IR at what was received, Dr/Cr PPV for any difference,
 *                Cr AP at the bill                                     (supplier bill)
 *   batch        issue → labor → overhead → cook → chill → pack → FG   (batch record,
 *                without its own receipt or shipment)
 *   delivery     Dr AR (invoiced channels) or Dr Processor Clearing (paid at
 *                order), Cr revenue; Dr COGS @ standard/meal, Cr FG;
 *                delivery expense; retail commission                  (delivery record)
 *   payment      Dr Cash, Cr AR (customer); Dr AP, Cr Cash (supplier)
 *   bill         Dr Accrued Overhead / G&A / named account, Cr AP;
 *                Dr AP, Cr Cash when paid                              (period bill)
 *   payroll      from CompTable's closed pay periods: at month end, the part
 *                of each period earned in the month against what the batch
 *                records charged, the difference to 5170; on each pay date,
 *                the closed period's loaded labor paid in cash
 *   month end    depreciation to Overhead Control; applied closed
 *                against incurred, the difference to the volume variance
 *
 * Receivables and payables stay open until a payment record applies to them.
 */

import {
  journalIsBalanced,
  type Account,
  type JournalEntry,
} from '@ct/ledger';
import {
  MUSE_COA,
  ACC_RAW_MATERIALS,
  ACC_FINISHED_GOODS,
  ACC_COGS,
  ACC_PPV,
  ACC_OH_VOLUME_VAR,
  ACC_OH_CONTROL,
  ACC_OH_APPLIED,
  ACC_MARKETPLACE_COMMISSION,
  ACC_AR,
  ACC_FOOD_SALES,
  ACC_ACCRUED_OH,
  ACC_OH_SPENDING_VAR,
  ACC_GRIR,
  ACC_PROCESSOR_CLEARING,
  ACC_FIXED_ASSETS,
  ACC_LONG_TERM_DEBT,
  ACC_OWNER_CONTRIBUTIONS,
  ACC_UNASSIGNED_PRODUCTION_LABOR,
} from '../_data/coa-muse';
import { PAID_AT_ORDER_CHANNELS } from '../_data/working-capital';
import { absorbOverhead, type OverheadAbsorption } from './index';
import { assumptionsFor } from './scenario';
import {
  manufacturingOverheadBudget,
  DEFAULT_DEPRECIATION,
  type DepreciationYears,
} from './fixed-costs';
import { CHANNEL_COMMISSION_PHASE3 } from './phase';
import { productionBatchLedger, type ProductionBatchLedger } from './production-ledger';
import {
  receivableBillingsCents,
  tradePurchasesCents,
  PAYROLL_LIABILITY_ACCOUNTS,
} from './ledger-model';
import { resolveScenarioInputs, type ResolvedInputs } from './scenario';
import {
  bundleForPeriod,
  costReceiptLines,
  openingCashCents,
  periodEnd,
  periodOf,
  periodStart,
  periodsIn,
  toBatchExecution,
  OVERHEAD_BILL_CATEGORIES,
  type ActualsBundle,
} from './actuals';
import { standardInForce, standardLabel, libraryLabel } from './standards';
import {
  amortizationSchedule,
  addMonths,
  billTotalCents,
  currentPortionOfDebt,
  daysInPeriod,
  daysOutstanding,
  receiptValueCents,
} from './working-capital';
import { earnedShareThrough, loadedFromClosedPeriod, localDate, shiftsFrom } from './payroll';
import type { LoadedLaborCents } from './comp';
import { isoAddDays } from './orders';
import { statementPeriods, type StatementSet } from './ledger-statements';

const ACC_AP = '2010';
const ACC_CASH = '1010';
const ACC_ACCUM_DEP = '1790';
const ACC_CATERING_SALES = '4200';
const ACC_DELIVERY = '7900';
const ACC_INTEREST = '8020';

function entryCents(
  id: string,
  date: string,
  description: string,
  legs: Array<{ account: string; cents: number; memo: string }>,
): JournalEntry {
  return {
    id,
    date,
    description,
    lines: legs
      .filter((l) => l.cents !== 0)
      .map((l) => ({
        accountCode: l.account,
        debitCents: l.cents > 0 ? l.cents : 0,
        creditCents: l.cents < 0 ? -l.cents : 0,
        memo: l.memo,
      })),
  };
}

function netDebit(entries: readonly JournalEntry[], code: string): number {
  let n = 0;
  for (const e of entries) for (const l of e.lines) if (l.accountCode === code) n += l.debitCents - l.creditCents;
  return n;
}

const short = (id: string) => id.replace(/-/g, '').slice(0, 8).toUpperCase();
const usd = (c: number) => (c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** Every YYYY-MM from `from` to `to` inclusive. */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let p = from; p <= to; p = periodOf(addMonths(`${p}-01`, 1))) out.push(p);
  return out;
}

const byAccount = (l: LoadedLaborCents): Record<(typeof PAYROLL_LIABILITY_ACCOUNTS)[number], number> => ({
  '2110': l.wagesCents,
  '2120': l.payrollTaxesCents,
  '2130': l.workersCompCents,
  '2140': l.benefitsCents,
});

export interface PostedPeriod {
  period: string;
  entries: JournalEntry[];
  batches: ProductionBatchLedger[];
  /**
   * Finished-goods cost ÷ meals for the batches in this period, or the carried
   * standard. Cents, UNROUNDED: a delivery rounds only its extended cost, so a
   * period whose deliveries equal its production relieves finished goods to
   * within a cent rather than leaving half a cent per meal behind.
   */
  standardCostPerMealCents: number;
  mealsProduced: number;
  mealsDelivered: number;
  overhead: {
    appliedCents: number;
    /** Overhead Control for the month: the accrued budget plus depreciation — the budget, by construction. */
    incurredCents: number;
    volumeVarianceCents: number;
    ratePerMeal: number;
    /** One twelfth of the budgeted lease + utilities (the accrued part; depreciation posts on its own). */
    budgetCents: number;
    /** Lease + utilities bills recorded for the period. */
    billedCents: number;
    /** billed − budget, for the categories with a bill; a period charge (or credit) in 5150. */
    spendingVarianceCents: number;
    /** Accrued budget for categories with no bill yet: the balance left in 2160 for the period. */
    accruedUnbilledCents: number;
  };
  purchasePriceVarianceCents: number;
  receivables: { billedCents: number; paidAtOrderCents: number; collectedCents: number };
  payables: { receivedCents: number; billedCents: number; billDifferenceCents: number; paidCents: number };
  /** Null when the month has no closed pay period, no pay date and no shift on the clock. */
  payroll: {
    /** Loaded payroll earned in the month, from CompTable's closed pay periods. */
    accruedLoadedCents: number;
    batchChargedCents: number;
    /** Accrued − batch-charged: to 5170. */
    unassignedCents: number;
    paidCents: number;
    payDates: string[];
    openShifts: number;
    /** Closed pay periods from CompTable that overlap the month. */
    closedPeriods: number;
    /** Hours on the clock in the month on dates no closed pay period covers yet. */
    uncoveredHours: number;
  } | null;
  massBalanceFailures: string[];
  traceabilityGaps: number;
  notes: string[];
}

export interface PostedActuals {
  entries: JournalEntry[];
  periods: PostedPeriod[];
  coa: Account[];
  balanced: boolean;
  /** The absorption the batches were costed at. */
  absorption: OverheadAbsorption;
}

export interface PostActualsOptions {
  /**
   * Pay periods are taken as paid on their pay date; no payroll run is
   * recorded yet (Roadmap M4). A pay date after this date is not posted.
   * Omitted = every pay date.
   */
  payrollPaidThrough?: string;
  /**
   * The Plan ledger (Roadmap N5): absorb at this rate — the forecast's own
   * production as its normal capacity (Robert, 2026-09-16). Omitted = the
   * plan's normal capacity.
   */
  absorption?: OverheadAbsorption;
  /** The budgeted lease and utilities accrued in a period, dollars. Omitted = a twelfth of the annual budget. */
  overheadBudgetFor?: (period: string) => { lease: number; utilities: number };
  /** Depreciation charged in a period, dollars. Omitted = a twelfth of the annual budget. */
  depreciationFor?: (period: string) => number;
  /** Periods posted even when no record falls in them — every month of a forecast. */
  periods?: readonly string[];
  /** The standard cost per meal before any batch is posted, cents. Omitted = zero. */
  openingStandardCostPerMealCents?: number;
  /**
   * The Plan ledger costs every batch at the live library by definition — the plan is where
   * standards come from — so the per-batch "no approved standard" note is not written.
   */
  liveLibraryIsStandard?: boolean;
}

/**
 * The fallback a bare call absorbs at (Roadmap N9): normal capacity is the production
 * in the documents being posted — for a plan bundle, the plan's own production —
 * annualised over the months it spans and net of planned downtime. The ledgers pass
 * their own absorption; the channel meals-a-day × days basis is retired.
 */
export function bundleAbsorption(bundle: Pick<ActualsBundle, 'batches'>, inputs: ResolvedInputs, annualFixedOverhead: number): OverheadAbsorption {
  const meals = bundle.batches.reduce((t, b) => t + (b.mealsProduced ?? b.goodPortions), 0);
  const months = new Set(bundle.batches.map((b) => b.productionDate.slice(0, 7))).size;
  const perYear = months > 0 ? (meals * 12) / months : 0;
  const downtime = inputs.assumptions.overhead.plannedMaintenanceDownRate.value;
  const netPerYear = perYear * (1 - downtime);
  const ratePerMeal = netPerYear > 0 ? annualFixedOverhead / netPerYear : 0;
  return { annualFixedOverhead, normalCapacityMeals: netPerYear, ratePerMeal, actualMeals: perYear, absorbed: ratePerMeal * perYear, volumeVariance: annualFixedOverhead - ratePerMeal * perYear, capacityUtilisation: netPerYear > 0 ? perYear / netPerYear : 0 };
}

/**
 * Post every record in the bundle, period by period. The standard cost per
 * meal a delivery relieves is the period's own batches when it has any, else
 * the last period that did, else the plan's standard.
 */
export function postActuals(
  bundle: ActualsBundle,
  inputs: ResolvedInputs = resolveScenarioInputs(),
  depreciation: DepreciationYears = DEFAULT_DEPRECIATION,
  options: PostActualsOptions = {},
): PostedActuals {
  const budget = manufacturingOverheadBudget(inputs, depreciation);
  const absorption: OverheadAbsorption = options.absorption ?? bundleAbsorption(bundle, inputs, budget.annual);
  // Before any batch is posted there is no standard per meal to relieve; the first
  // period with batches sets it (the fiscal-year plan standard retired in Roadmap N6).
  const planStandardCents = options.openingStandardCostPerMealCents ?? 0;
  const deliveryPerMealCents = Math.round(inputs.assumptions.perMeal.delivery.value * 100);
  const punches = bundle.punches ?? [];
  const payrollPeriods = bundle.payrollPeriods ?? [];
  const paidThrough = options.payrollPaidThrough ?? '9999-12-31';

  // ── The periods to post: every period with a record; with shifts on the
  //    clock or closed pay periods from CompTable, every month from the first
  //    through the last such month (a pay date only once reached), so no pay
  //    period falls in a gap.
  let periodList = [...new Set([...periodsIn(bundle), ...(options.periods ?? [])])].sort();
  const workMonths = shiftsFrom(punches).shifts.map((s) => periodOf(s.workDate));
  const payrollMonths = payrollPeriods.flatMap((pp) => [periodOf(pp.periodStart), periodOf(pp.periodEnd), ...(pp.payDate <= paidThrough ? [periodOf(pp.payDate)] : [])]);
  if (workMonths.length > 0 || payrollMonths.length > 0) {
    const known = [...new Set([...periodList, ...workMonths, ...payrollMonths])].sort();
    periodList = monthsBetween(known[0]!, known.at(-1)!);
  }

  const all: JournalEntry[] = [];
  const periods: PostedPeriod[] = [];
  let carriedStandardCents = planStandardCents;
  /** Each recipe's standard cost per meal, carried from the last period that made it (audit A9). */
  const carriedByRecipe = new Map<string, number>();

  for (const period of periodList) {
    const p = bundleForPeriod(bundle, period);
    const entries: JournalEntry[] = [];
    const notes: string[] = [];
    const start = periodStart(period);
    const end = periodEnd(period);

    // ── Opening balance (Roadmap K6).
    for (const o of p.openingBalances ?? []) {
      entries.push(
        entryCents(`OPEN-${o.asOf}`, o.asOf, 'Opening balance sheet', [
          { account: ACC_CASH, cents: openingCashCents(o), memo: "Owners' equity and financing, less the fit-out" },
          { account: ACC_FIXED_ASSETS, cents: o.fixedAssetsCents, memo: 'Fit-out at cost' },
          { account: ACC_LONG_TERM_DEBT, cents: -o.longTermDebtCents, memo: 'Equipment and leasehold financing' },
          { account: ACC_OWNER_CONTRIBUTIONS, cents: -o.ownerEquityCents, memo: "Owners' equity" },
        ]),
      );
    }

    // ── The standard in force on a date (Roadmap J5): the approved snapshot,
    //    else the live library recipe and the plan's assumptions, with a note.
    const standards = bundle.standards ?? [];
    const standardFor = (recipeCode: string, date: string) => {
      const v = standardInForce(standards, recipeCode, date);
      if (v) {
        return {
          recipe: v.snapshot.recipe,
          assumptions: v.snapshot.assumptions,
          overheadRatePerMeal: v.snapshot.overheadRatePerMeal ?? null,
          label: standardLabel(v),
          approved: true,
        };
      }
      // No version in force: the live library recipe at its OWN assumptions — its
      // labor standard and packaging (Roadmap N3) — and the live overhead rate.
      return {
        recipe: inputs.recipes.find((r) => r.code === recipeCode) ?? inputs.recipe,
        assumptions: assumptionsFor(inputs, recipeCode),
        overheadRatePerMeal: null,
        label: libraryLabel(recipeCode),
        approved: false,
      };
    };

    // ── Equity, capital and loans (Roadmap N5): dated documents in cash.
    for (const e of p.equityContributions ?? []) {
      entries.push(
        entryCents(`EQUITY-${short(e.id)}`, e.contributedOn, "Owners' equity contributed", [
          { account: ACC_CASH, cents: e.amountCents, memo: 'Cash contributed' },
          { account: ACC_OWNER_CONTRIBUTIONS, cents: -e.amountCents, memo: "Owners' equity" },
        ]),
      );
    }
    for (const d of p.loanDraws ?? []) {
      entries.push(
        entryCents(`LOANDRAW-${short(d.id)}`, d.drawnOn, `Loan drawn — ${d.label}`, [
          { account: ACC_CASH, cents: d.principalCents, memo: 'Loan proceeds' },
          { account: ACC_LONG_TERM_DEBT, cents: -d.principalCents, memo: 'Long-term debt' },
        ]),
      );
    }
    for (const c of p.capitalPurchases ?? []) {
      entries.push(
        entryCents(`CAPEX-${short(c.id)}`, c.purchasedOn, `${c.kind === 'leasehold' ? 'Leasehold improvement' : 'Equipment'} — ${c.item}`, [
          { account: ACC_FIXED_ASSETS, cents: c.amountCents, memo: 'Fixed assets at cost' },
          { account: ACC_CASH, cents: -c.amountCents, memo: 'Cash paid' },
        ]),
      );
    }
    for (const lp of p.loanPayments ?? []) {
      entries.push(
        entryCents(`LOANPAY-${short(lp.id)}`, lp.paidOn, `Loan payment — ${lp.label}`, [
          { account: ACC_INTEREST, cents: lp.interestCents, memo: 'Interest expense' },
          { account: ACC_LONG_TERM_DEBT, cents: lp.principalCents, memo: 'Principal repaid' },
          { account: ACC_CASH, cents: -(lp.interestCents + lp.principalCents), memo: 'Cash paid' },
        ]),
      );
    }

    // ── Receipts: accepted lines at standard into raw materials, the price
    //    received against standard to PPV, and GR/IR until the bill arrives.
    //    An ingredient's standard is read from any recipe in the library that
    //    uses it, at the version in force on the receipt date (audit A5).
    const receiptStandard = (date: string) => {
      const ingredients = new Map<string, (typeof inputs.recipe.ingredients)[number]>();
      for (const r of inputs.recipes) {
        for (const ing of standardFor(r.code, date).recipe.ingredients) if (!ingredients.has(ing.name)) ingredients.set(ing.name, ing);
      }
      return { ...inputs.recipe, ingredients: [...ingredients.values()] };
    };
    const receiptStandards = new Map<string, ReturnType<typeof receiptStandard>>();
    let ppvCents = 0;
    let receivedCents = 0;
    for (const r of p.receipts) {
      const acceptedLines = r.lines.filter((l) => l.condition !== 'rejected');
      const rejected = r.lines.length - acceptedLines.length;
      let std = receiptStandards.get(r.receivedOn);
      if (!std) receiptStandards.set(r.receivedOn, (std = receiptStandard(r.receivedOn)));
      const costed = costReceiptLines(acceptedLines, std);
      const standardCents = costed.reduce((s, c) => s + c.standardCents, 0);
      const valueCents = costed.reduce((s, c) => s + c.invoiceCents, 0);
      const variance = valueCents - standardCents;
      ppvCents += variance;
      receivedCents += valueCents;
      const unknown = costed.filter((c) => c.standardUnitPriceCents === null).map((c) => c.line.ingredient);
      if (unknown.length > 0) {
        notes.push(`Receipt ${r.invoiceNumber ?? short(r.id)}: ${unknown.join(', ')} not on the recipe, received at the price received with no standard to vary against.`);
      }
      if (rejected > 0) notes.push(`Receipt ${short(r.id)}: ${rejected} rejected line${rejected === 1 ? '' : 's'} on the record, not received into stock and not payable.`);
      entries.push(
        entryCents(`RCPT-${short(r.id)}`, r.receivedOn, `Receive ${r.supplierName ?? 'goods'}`, [
          { account: ACC_RAW_MATERIALS, cents: standardCents, memo: `${acceptedLines.length} line${acceptedLines.length === 1 ? '' : 's'} at standard` },
          { account: ACC_PPV, cents: variance, memo: 'Purchase price variance — price received against standard' },
          { account: ACC_GRIR, cents: -valueCents, memo: 'Goods received, not invoiced' },
        ]),
      );
    }

    // ── Supplier bills (Roadmap K2): clear GR/IR at what the named receipts
    //    received; any difference is the bill against the receipt, charged to
    //    PPV while the bill is flagged, and gone once the bill is rectified.
    let supplierBilledCents = 0;
    let billDifferenceCents = 0;
    for (const b of p.supplierBills ?? []) {
      const covered = bundle.receipts.filter((r) => b.receiptIds.includes(r.id));
      const received = covered.reduce((s, r) => s + receiptValueCents(r), 0);
      const billed = billTotalCents(b);
      supplierBilledCents += billed;
      billDifferenceCents += billed - received;
      if (billed !== received) notes.push(`Bill ${b.billNumber} (${b.supplierName}): billed ${usd(billed)} against ${usd(received)} received; the difference is in purchase price variance until the bill is rectified.`);
      entries.push(
        entryCents(`SBILL-${short(b.id)}`, b.billDate, `Bill ${b.billNumber} — ${b.supplierName}`, [
          { account: ACC_GRIR, cents: received, memo: `Clear goods received on ${covered.length} receipt${covered.length === 1 ? '' : 's'}` },
          { account: ACC_PPV, cents: billed - received, memo: 'Billed against received' },
          { account: ACC_AP, cents: -billed, memo: 'Accounts payable at the bill' },
        ]),
      );
    }
    ppvCents += billDifferenceCents;

    // ── Batches: the chain without its own receipt or shipment.
    const batches: ProductionBatchLedger[] = [];
    let fgCents = 0;
    let mealsProduced = 0;
    const fgByRecipe = new Map<string, { cents: number; meals: number }>();
    for (const doc of p.batches) {
      const std = standardFor(doc.recipeCode, doc.productionDate);
      if (!std.approved && !options.liveLibraryIsStandard) notes.push(`${doc.batchId}: no approved standard in force for ${doc.recipeCode} on ${doc.productionDate}; costed at the live library (${std.label}).`);
      else if (doc.standardVersion !== std.label) notes.push(`${doc.batchId}: the record names ${doc.standardVersion}; the version in force on ${doc.productionDate} is ${std.label}, which is what it is costed at.`);
      if (std.approved && std.overheadRatePerMeal === null) {
        notes.push(`${doc.batchId}: ${std.label} was approved before standards froze the overhead rate; it absorbs at the live rate.`);
      }
      const led = productionBatchLedger(
        toBatchExecution(doc),
        {
          batches: doc.batchesRun,
          mealsProduced: doc.mealsProduced ?? doc.goodPortions,
          assumptions: std.assumptions,
          // A version approved since N3 absorbs at the rate it froze (audit A15).
          overhead: std.overheadRatePerMeal === null ? absorption : { ...absorption, ratePerMeal: std.overheadRatePerMeal },
          purchaseOrderCost: 0,
          receiptRecorded: true,
          shipments: [],
        },
        std.recipe,
      );
      batches.push(led);
      entries.push(...led.entries);
      fgCents += Math.round(led.amounts.finishedGoodsCost * 100);
      mealsProduced += led.amounts.mealsProduced;
      const byRecipe = fgByRecipe.get(doc.recipeCode) ?? { cents: 0, meals: 0 };
      byRecipe.cents += led.amounts.finishedGoodsCost * 100;
      byRecipe.meals += led.amounts.mealsProduced;
      fgByRecipe.set(doc.recipeCode, byRecipe);
      notes.push(...led.notes.map((n) => `${doc.batchId}: ${n}`));
      if (!led.massBalance.balanced) notes.push(...led.massBalance.failures.map((f) => `${doc.batchId}: ${f}`));
    }
    const standardCostPerMealCents = mealsProduced > 0 ? fgCents / mealsProduced : carriedStandardCents;
    carriedStandardCents = standardCostPerMealCents;
    for (const [code, v] of fgByRecipe) if (v.meals > 0) carriedByRecipe.set(code, v.cents / v.meals);

    // ── Deliveries: revenue and COGS at the standard per meal; delivery expense; commission.
    //    School lunches and Corporate catering go to receivables; Ghost kitchen was paid at order.
    let mealsDelivered = 0;
    let billedCents = 0;
    let paidAtOrderCents = 0;
    for (const d of p.deliveries) {
      const revenueCents = Math.round(d.meals * d.pricePerMealCents);
      // The recipe delivered, at its own standard per meal where the delivery names it (audit A9).
      const recipeStd = d.recipeCode ? carriedByRecipe.get(d.recipeCode) : undefined;
      const cogsCents = Math.round(d.meals * (recipeStd ?? standardCostPerMealCents));
      const deliveryCents = Math.round(d.meals * deliveryPerMealCents);
      const commissionCents = d.phase === 3 ? Math.round(revenueCents * CHANNEL_COMMISSION_PHASE3) : 0;
      const paidAtOrder = PAID_AT_ORDER_CHANNELS.includes(d.phase);
      const debitAccount = paidAtOrder ? ACC_PROCESSOR_CLEARING : ACC_AR;
      if (paidAtOrder) paidAtOrderCents += revenueCents;
      else billedCents += revenueCents;
      mealsDelivered += d.meals;
      entries.push(
        entryCents(`DLV-${short(d.id)}`, d.deliveredOn, `Deliver ${d.meals.toLocaleString()} meals — ${inputs.phases.find((ph) => ph.phase === d.phase)?.market ?? `Channel ${d.phase}`}${d.siteName ? ` — ${d.siteName}` : ''}`, [
          { account: debitAccount, cents: revenueCents, memo: paidAtOrder ? 'Paid at the time of ordering — captured, not yet deposited' : 'Accounts receivable' },
          { account: d.phase === 2 ? ACC_CATERING_SALES : ACC_FOOD_SALES, cents: -revenueCents, memo: `${d.meals.toLocaleString()} meals at $${(d.pricePerMealCents / 100).toFixed(2)}` },
          { account: ACC_COGS, cents: cogsCents, memo: `at $${((recipeStd ?? standardCostPerMealCents) / 100).toFixed(4)} standard per meal${recipeStd !== undefined ? ` (${d.recipeCode})` : ''}` },
          { account: ACC_FINISHED_GOODS, cents: -cogsCents, memo: 'Finished goods relieved' },
          { account: ACC_DELIVERY, cents: deliveryCents, memo: 'Delivery to sites — period cost' },
          { account: ACC_AP, cents: -deliveryCents, memo: 'Own fleet accrual' },
          { account: ACC_MARKETPLACE_COMMISSION, cents: commissionCents, memo: 'Marketplace commission' },
          { account: debitAccount, cents: -commissionCents, memo: 'Deducted from the remittance' },
        ]),
      );
    }
    for (const x of p.processorDeposits ?? []) {
      entries.push(
        entryCents(`DEPOSIT-${short(x.id)}`, x.depositedOn, 'Marketplace remittance deposited', [
          { account: ACC_CASH, cents: x.amountCents, memo: 'Deposit' },
          { account: ACC_PROCESSOR_CLEARING, cents: -x.amountCents, memo: 'Processor clearing relieved' },
        ]),
      );
    }
    if (paidAtOrderCents > 0 && (p.processorDeposits ?? []).length === 0) notes.push(`Ghost kitchen deliveries paid at the time of ordering (${usd(paidAtOrderCents)}) sit in processor clearing until a deposit is recorded; marketplace deposits are not recorded yet.`);

    // ── Customer and supplier payments (Roadmap K3).
    let collectedCents = 0;
    for (const cp of p.customerPayments ?? []) {
      collectedCents += cp.amountCents;
      const applied = cp.applications.reduce((s, a) => s + a.amountCents, 0);
      if (applied < cp.amountCents) notes.push(`Payment from ${cp.customerName} on ${cp.receivedOn}: ${usd(cp.amountCents - applied)} is not applied to an invoice.`);
      entries.push(
        entryCents(`CPAY-${short(cp.id)}`, cp.receivedOn, `Payment received — ${cp.customerName}${cp.reference ? ` — ${cp.reference}` : ''}`, [
          { account: ACC_CASH, cents: cp.amountCents, memo: cp.method ?? 'Cash received' },
          { account: ACC_AR, cents: -cp.amountCents, memo: 'Accounts receivable collected' },
        ]),
      );
    }
    let supplierPaidCents = 0;
    for (const sp of p.supplierPayments ?? []) {
      supplierPaidCents += sp.amountCents;
      entries.push(
        entryCents(`SPAY-${short(sp.id)}`, sp.paidOn, `Payment to ${sp.supplierName}${sp.reference ? ` — ${sp.reference}` : ''}`, [
          { account: ACC_AP, cents: sp.amountCents, memo: 'Accounts payable paid' },
          { account: ACC_CASH, cents: -sp.amountCents, memo: sp.method ?? 'Cash paid' },
        ]),
      );
    }

    // ── Period bills. Lease and utilities settle the month-end accrual of the
    //    budgeted manufacturing overhead (Roadmap J2); admin and other bills post
    //    to their own accounts.
    const isOverheadBill = (c: string): c is (typeof OVERHEAD_BILL_CATEGORIES)[number] => (OVERHEAD_BILL_CATEGORIES as readonly string[]).includes(c);
    for (const b of p.bills) {
      const on = b.incurredOn ?? periodStart(b.period);
      const account = isOverheadBill(b.category) ? ACC_ACCRUED_OH : b.accountCode;
      entries.push(
        entryCents(`BILL-${short(b.id)}`, on, `${b.vendor ?? b.category}${b.invoiceNumber ? ` — ${b.invoiceNumber}` : ''}`, [
          { account, cents: b.amountCents, memo: isOverheadBill(b.category) ? `${b.category} — settles the accrued budget` : b.category },
          { account: ACC_AP, cents: -b.amountCents, memo: 'Accounts payable' },
        ]),
      );
      if (b.paidOn) {
        supplierPaidCents += b.amountCents;
        entries.push(
          entryCents(`PAID-${short(b.id)}`, b.paidOn, `Paid ${b.vendor ?? b.category}`, [
            { account: ACC_AP, cents: b.amountCents, memo: 'Accounts payable cleared' },
            { account: ACC_CASH, cents: -b.amountCents, memo: 'Cash' },
          ]),
        );
      }
    }

    // ── Payroll (Roadmap K5, O1): CompTable closes each pay period and sends
    //    its totals by account; no individual's pay is held in Muse. At month
    //    end the part of each closed period earned in the month — by the hours
    //    on the clock, else by calendar days — is accrued against what the
    //    batch records charged, and the difference is production labor no
    //    batch carried. Each closed period is paid on its pay date.
    let payroll: PostedPeriod['payroll'] = null;
    const earnedIn = payrollPeriods.filter((pp) => pp.periodStart <= end && pp.periodEnd >= start);
    const paidIn = payrollPeriods.filter((pp) => pp.payDate >= start && pp.payDate <= end);
    const { shifts } = shiftsFrom(punches);
    const monthShifts = shifts.filter((s) => periodOf(s.workDate) === period);
    if (earnedIn.length > 0 || paidIn.length > 0 || monthShifts.length > 0) {
      const before = isoAddDays(start, -1);
      const accrued = { '2110': 0, '2120': 0, '2130': 0, '2140': 0 } as Record<(typeof PAYROLL_LIABILITY_ACCOUNTS)[number], number>;
      for (const pp of earnedIn) {
        const legs = byAccount(loadedFromClosedPeriod(pp));
        const through = earnedShareThrough(pp, punches, end);
        const prior = earnedShareThrough(pp, punches, before);
        for (const a of PAYROLL_LIABILITY_ACCOUNTS) accrued[a] += Math.round(legs[a] * through) - Math.round(legs[a] * prior);
      }
      const batchEntries = entries.filter((e) => e.id.endsWith('-LABOR'));
      const charged = Object.fromEntries(PAYROLL_LIABILITY_ACCOUNTS.map((a) => [a, -netDebit(batchEntries, a)])) as Record<(typeof PAYROLL_LIABILITY_ACCOUNTS)[number], number>;
      let unassignedCents = 0;
      if (earnedIn.length > 0) {
        const diffs = PAYROLL_LIABILITY_ACCOUNTS.map((a) => ({ account: a, cents: accrued[a] - charged[a] }));
        unassignedCents = diffs.reduce((s, d) => s + d.cents, 0);
        if (diffs.some((d) => d.cents !== 0)) {
          entries.push(
            entryCents(`PAYROLL-EARNED-${period}`, end, "Loaded payroll earned in the month from CompTable's closed pay periods, less what the batch records charged", [
              { account: ACC_UNASSIGNED_PRODUCTION_LABOR, cents: unassignedCents, memo: unassignedCents >= 0 ? 'Payroll no batch record charged' : 'Batch records charged more than payroll shows' },
              ...diffs.map((d) => ({ account: d.account, cents: -d.cents, memo: 'Accrued at the month-end cut-off' })),
            ]),
          );
        }
        if (unassignedCents < 0) notes.push(`Batch records in ${period} charged ${usd(-unassignedCents)} more loaded labor than CompTable's closed pay periods show for the month.`);
      }

      let paidCents = 0;
      const payDates: string[] = [];
      for (const pp of paidIn) {
        if (pp.payDate > paidThrough) continue;
        const legs = byAccount(loadedFromClosedPeriod(pp));
        const total = PAYROLL_LIABILITY_ACCOUNTS.reduce((s, a) => s + legs[a], 0);
        if (total === 0) continue;
        paidCents += total;
        payDates.push(pp.payDate);
        entries.push(
          entryCents(`PAYROLL-PAID-${pp.periodStart}`, pp.payDate, `Payroll for ${pp.periodStart} to ${pp.periodEnd}, paid ${pp.payDate} (CompTable ${pp.comptableRef})`, [
            ...PAYROLL_LIABILITY_ACCOUNTS.map((a) => ({ account: a, cents: legs[a], memo: 'Paid on the pay date' })),
            { account: ACC_CASH, cents: -total, memo: 'Cash paid' },
          ]),
        );
      }
      const covered = (d: string) => payrollPeriods.some((pp) => d >= pp.periodStart && d <= pp.periodEnd);
      const uncoveredHours = monthShifts.filter((s) => !s.open && !covered(s.workDate)).reduce((t, s) => t + s.workedMinutes, 0) / 60;
      payroll = {
        accruedLoadedCents: PAYROLL_LIABILITY_ACCOUNTS.reduce((s, a) => s + accrued[a], 0),
        batchChargedCents: PAYROLL_LIABILITY_ACCOUNTS.reduce((s, a) => s + charged[a], 0),
        unassignedCents,
        paidCents,
        payDates,
        openShifts: shifts.filter((s) => s.open && periodOf(localDate(s.inAt)) === period).length,
        closedPeriods: earnedIn.length,
        uncoveredHours,
      };
      if (uncoveredHours > 0) notes.push(`${uncoveredHours.toFixed(2)} hours on the clock in ${period} fall on dates no closed pay period from CompTable covers yet; no payroll is accrued for them.`);
      if (payroll.openShifts > 0) notes.push(`${payroll.openShifts} shift${payroll.openShifts === 1 ? '' : 's'} in ${period} ha${payroll.openShifts === 1 ? 's' : 've'} no clock-out and count no hours.`);
    }

    // ── Month end (Roadmap J2): accrue one twelfth of the budgeted lease and
    //    utilities into Overhead Control against Accrued Manufacturing Overhead.
    //    Where the period has a bill for the category, the accrual is trued to
    //    the bill and the difference is the spending variance; where it has
    //    none, the accrued budget stays a liability until the bill is recorded.
    let budgetCents = 0;
    let overheadBilledCents = 0;
    let spendingVarianceCents = 0;
    let accruedUnbilledCents = 0;
    const periodBudget = options.overheadBudgetFor?.(period);
    for (const category of OVERHEAD_BILL_CATEGORIES) {
      const monthlyBudgetCents = Math.round((periodBudget ? periodBudget[category] : budget[category] / 12) * 100);
      if (periodBudget && monthlyBudgetCents === 0 && !p.bills.some((b) => b.category === category)) continue;
      const billed = p.bills.filter((b) => b.category === category).reduce((s, b) => s + b.amountCents, 0);
      const hasBill = p.bills.some((b) => b.category === category);
      budgetCents += monthlyBudgetCents;
      overheadBilledCents += billed;
      entries.push(
        entryCents(`OHACCRUE-${category.toUpperCase()}-${period}`, end, `Accrue budgeted ${category} for the month`, [
          { account: ACC_OH_CONTROL, cents: monthlyBudgetCents, memo: `One twelfth of the budgeted ${category}` },
          { account: ACC_ACCRUED_OH, cents: -monthlyBudgetCents, memo: 'Accrued manufacturing overhead' },
        ]),
      );
      if (hasBill) {
        const variance = billed - monthlyBudgetCents;
        spendingVarianceCents += variance;
        entries.push(
          entryCents(`OHSPEND-${category.toUpperCase()}-${period}`, end, `${category}: bill against budget`, [
            { account: ACC_OH_SPENDING_VAR, cents: variance, memo: variance >= 0 ? 'Billed above budget — period charge' : 'Billed below budget — period credit' },
            { account: ACC_ACCRUED_OH, cents: -variance, memo: 'Accrual trued to the bill' },
          ]),
        );
      } else {
        accruedUnbilledCents += monthlyBudgetCents;
        notes.push(`${category[0]!.toUpperCase()}${category.slice(1)} for ${period}: no bill on file; the budgeted ${(monthlyBudgetCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} is accrued and unbilled.`);
      }
    }
    const depCents = Math.round((options.depreciationFor ? options.depreciationFor(period) : budget.depreciation / 12) * 100);
    entries.push(
      entryCents(`DEP-${period}`, end, 'Straight-line depreciation for the month, charged to manufacturing overhead', [
        { account: ACC_OH_CONTROL, cents: depCents, memo: 'One twelfth of the annual charge' },
        { account: ACC_ACCUM_DEP, cents: -depCents, memo: 'Accumulated depreciation' },
      ]),
    );
    const appliedCents = -netDebit(entries, ACC_OH_APPLIED);
    const incurredCents = netDebit(entries, ACC_OH_CONTROL);
    const volumeVarianceCents = incurredCents - appliedCents;
    entries.push(
      entryCents(`OHCLOSE-${period}`, end, 'Close manufacturing overhead applied against overhead incurred', [
        { account: ACC_OH_APPLIED, cents: appliedCents, memo: 'Overhead applied, cleared' },
        { account: ACC_OH_VOLUME_VAR, cents: volumeVarianceCents, memo: volumeVarianceCents >= 0 ? 'Under-absorbed — period charge' : 'Over-absorbed — period credit' },
        { account: ACC_OH_CONTROL, cents: -incurredCents, memo: 'Overhead control, cleared' },
      ]),
    );

    const posted = entries.filter((e) => e.lines.length > 0);
    all.push(...posted);
    periods.push({
      period,
      entries: posted,
      batches,
      standardCostPerMealCents,
      mealsProduced,
      mealsDelivered,
      overhead: { appliedCents, incurredCents, volumeVarianceCents, ratePerMeal: absorption.ratePerMeal, budgetCents, billedCents: overheadBilledCents, spendingVarianceCents, accruedUnbilledCents },
      purchasePriceVarianceCents: ppvCents,
      receivables: { billedCents, paidAtOrderCents, collectedCents },
      payables: { receivedCents, billedCents: supplierBilledCents, billDifferenceCents, paidCents: supplierPaidCents },
      payroll,
      massBalanceFailures: batches.flatMap((b) => b.massBalance.failures),
      traceabilityGaps: batches.reduce((s, b) => s + b.traceabilityGaps.length, 0),
      notes,
    });
  }

  return { entries: all, periods, coa: MUSE_COA, balanced: journalIsBalanced(all), absorption };
}

// ── Working capital and the Actual ledger's statements ──────────────────────

export interface PeriodWorkingCapital {
  receivableCents: number;
  /** Ghost kitchen orders paid at order and captured, not yet deposited. */
  processorClearingCents: number;
  /** Accounts payable plus goods received not invoiced. */
  payableCents: number;
  goodsReceivedNotInvoicedCents: number;
  accruedPayrollCents: number;
  /** Receivables over the period's billings to receivables × its calendar days. */
  daysToCollect: number | null;
  /** Trade payables over the period's trade purchases × its calendar days. */
  daysToPay: number | null;
  /** Presented, not posted: principal the loan schedule falls due for in the twelve months after period end. */
  currentPortionOfDebtCents: number;
  openingRecorded: boolean;
}

/** Working capital at a period's end from a posted journal — the same figures on either ledger (Roadmap N6). */
export function periodWorkingCapital(entries: readonly JournalEntry[], period: string, currentPortionOfDebtCents: number, openingRecorded: boolean): PeriodWorkingCapital {
  const start = periodStart(period);
  const end = periodEnd(period);
  const upToEnd = entries.filter((e) => e.date <= end);
  const receivableCents = netDebit(upToEnd, ACC_AR);
  const payableCents = -netDebit(upToEnd, ACC_AP) - netDebit(upToEnd, ACC_GRIR);
  return {
    receivableCents,
    processorClearingCents: netDebit(upToEnd, ACC_PROCESSOR_CLEARING),
    payableCents,
    goodsReceivedNotInvoicedCents: -netDebit(upToEnd, ACC_GRIR),
    accruedPayrollCents: PAYROLL_LIABILITY_ACCOUNTS.reduce((s, a) => s - netDebit(upToEnd, a), 0),
    daysToCollect: daysOutstanding(receivableCents, receivableBillingsCents(entries, start, end), daysInPeriod(period)),
    daysToPay: daysOutstanding(payableCents, tradePurchasesCents(entries, start, end), daysInPeriod(period)),
    currentPortionOfDebtCents,
    openingRecorded,
  };
}

/**
 * The current portion of long-term debt on the Actual ledger at a date, cents. The
 * loan schedule scaled to the debt the opening balance recorded, spread across the
 * loans in proportion to their principals, each on its own rate, term and start
 * date (Roadmap N1); plus the schedules of loans drawn on a dated document (N5).
 * Presentation only — never posted.
 */
export function actualCurrentPortionOfDebtCents(bundle: ActualsBundle, inputs: ResolvedInputs, asOf: string): number {
  const opening = (bundle.openingBalances ?? []).filter((o) => o.asOf <= asOf);
  const schedules: ReturnType<typeof amortizationSchedule>[] = [];
  if (opening.length > 0) {
    const debt = opening.reduce((s, o) => s + o.longTermDebtCents, 0) / 100;
    const planned = inputs.loans.reduce((s, l) => s + l.principalCents, 0) / 100;
    if (planned > 0) for (const l of inputs.loans) schedules.push(amortizationSchedule((debt * (l.principalCents / 100)) / planned, l.apr, l.termMonths, l.startDate));
  }
  for (const d of (bundle.loanDraws ?? []).filter((x) => x.drawnOn <= asOf)) {
    const loan = inputs.loans.find((l) => l.key === d.loanKey);
    if (loan) schedules.push(amortizationSchedule(d.principalCents / 100, loan.apr, loan.termMonths, d.drawnOn));
  }
  return schedules.length > 0 ? Math.round(currentPortionOfDebt(schedules, asOf) * 100) : 0;
}

export interface ActualLedger {
  from: string;
  to: string;
  entries: JournalEntry[];
  coa: Account[];
  periods: PostedPeriod[];
  months: StatementSet['months'];
  quarters: StatementSet['quarters'];
  years: StatementSet['years'];
  /** True when nothing is on record: every figure is zero for the period named. */
  empty: boolean;
  balanced: boolean;
  absorption: OverheadAbsorption;
}

/**
 * The Actual ledger (Roadmap N6): every recorded document posted, with statements
 * by month, quarter and year from the first period on record to the later of the
 * last period on record and `asOf`'s month. With no records it is the current
 * month, every figure zero.
 */
export function postActualLedger(
  bundle: ActualsBundle,
  inputs: ResolvedInputs,
  asOf: string,
  depreciation: DepreciationYears = DEFAULT_DEPRECIATION,
  options: Pick<PostActualsOptions, 'absorption'> = {},
): ActualLedger {
  const onFile = periodsIn(bundle);
  const empty = onFile.length === 0;
  const posted = postActuals(bundle, inputs, depreciation, { payrollPaidThrough: asOf, absorption: options.absorption, openingStandardCostPerMealCents: options.absorption ? 0 : undefined });
  const firstPeriod = onFile[0] ?? periodOf(asOf);
  const lastPeriod = [onFile.at(-1) ?? periodOf(asOf), periodOf(asOf)].sort().at(-1)!;
  const from = periodStart(firstPeriod);
  const to = periodEnd(lastPeriod);
  const set = statementPeriods({
    entries: posted.entries,
    coa: posted.coa,
    from,
    to,
    posted: posted.periods,
    currentPortionAt: (d) => actualCurrentPortionOfDebtCents(bundle, inputs, d),
  });
  return { from, to, entries: posted.entries, coa: posted.coa, periods: posted.periods, months: set.months, quarters: set.quarters, years: set.years, empty, balanced: posted.balanced && set.balanced, absorption: posted.absorption };
}
