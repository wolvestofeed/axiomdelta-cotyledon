/**
 * Impact OS — actuals: the recorded facts, engine-side.
 *
 * Ledger-free. These are the document shapes the `muse.batch_records`,
 * `muse.receipts`, `muse.deliveries` and `muse.period_bills` tables hold, the
 * conversion from a stored batch record to the `BatchExecution` the ledger
 * posts from, and the small helpers a capture form needs (a standard-cost
 * prefill, a batch id, the period a date falls in). Nothing here computes a
 * dollar from a typed total; the ledger derives cost from weights, hours, lots
 * and prices.
 */

import { recipe as defaultRecipe, assumptions as defaultAssumptions } from '../_data/plan-data';
import { componentCosting } from './index';
import { standardBatch, type BatchExecution, type ComponentExecution } from './batch';
import { traceabilityLotCode } from './traceability';
import { libraryLabel, type StandardVersionDoc } from './standards';
import type { PaymentTerms } from '../_data/working-capital';
import type { InvoiceDoc, CustomerPaymentDoc, SupplierBillDoc, SupplierPaymentDoc } from './working-capital';
import type { StaffDoc, PunchDoc, ClosedPayrollPeriodDoc } from './payroll';

type Recipe = typeof defaultRecipe;

// ── Documents ───────────────────────────────────────────────────────────────

/** One person's (or one crew's) hours on a batch, with the loaded rate when known. */
export interface CrewHoursLine {
  name: string;
  hours: number;
  /** Loaded $/h for this person; null when only the hours were taken. */
  ratePerHour: number | null;
}

/**
 * The labor totals a record's crew rows imply: hours summed; the rate
 * weighted by hours, and only when every line with hours carries a rate —
 * a partly-priced crew has no honest average. Empty crew → no totals.
 */
export function laborFromCrew(crew: readonly CrewHoursLine[]): { hours: number | null; rate: number | null } {
  const worked = crew.filter((c) => c.hours > 0);
  if (worked.length === 0) return { hours: null, rate: null };
  const hours = worked.reduce((s, c) => s + c.hours, 0);
  const priced = worked.every((c) => c.ratePerHour !== null);
  const rate = priced ? worked.reduce((s, c) => s + c.hours * (c.ratePerHour ?? 0), 0) / hours : null;
  return { hours, rate };
}

export interface BatchRecordDoc {
  id: string;
  batchId: string;
  recipeCode: string;
  /** ISO date. */
  productionDate: string;
  standardVersion: string;
  plannedPortions: number;
  /** Base-portion equivalents that passed and were packed. */
  goodPortions: number;
  /**
   * Cabinet loads filled from this cook. A batch record is one cook and the cook
   * is the lot (Robert, 2026-09-17): a double batch — two cabinets from one
   * cook — is one record with `batchesRun` 2 and one lot per component; two
   * cooks of one recipe on one day are two records and two lots.
   */
  batchesRun: number;
  /** Meals the portions became; null = one meal per portion. */
  mealsProduced: number | null;
  components: ComponentExecution[];
  /** Crew hours by person (Roadmap I3). Absent on records written before 0053. */
  crew?: CrewHoursLine[];
  actualLaborHours: number | null;
  actualLaborRate: number | null;
  closedBy: string | null;
  closedAt: string | null;
  notes: string | null;
}

/** What the receiver found at the dock. A rejected line is on the record and out of stock. */
export type ReceiptCondition = 'accepted' | 'accepted_with_note' | 'rejected';

export const RECEIPT_CONDITION_LABELS: Record<ReceiptCondition, string> = {
  accepted: 'Accepted',
  accepted_with_note: 'Accepted with note',
  rejected: 'Rejected',
};

export interface ReceiptLine {
  ingredient: string;
  qty: number;
  unit: 'lb' | 'each';
  /** The supplier's lot code as printed on the case — the FSMA 204 receiving KDE. */
  lotCode: string;
  /** Invoice price per unit, cents. */
  unitPriceCents: number;
  /** Use-by / best-by date printed on the case, ISO. Null when the case carries none. */
  useBy?: string | null;
  /** Product temperature at the dock, °F. Null when not taken. */
  receivedTempF?: number | null;
  condition?: ReceiptCondition;
  /** Copied from the ingredient line at receipt so the record stands on its own. */
  onFoodTraceabilityList?: boolean;
  /** The quantity on the purchase order line, copied at receipt (Roadmap K2). */
  poQty?: number | null;
  /** The price on the purchase order line, cents, copied at receipt. `unitPriceCents` is the price received. */
  poUnitPriceCents?: number | null;
  /** Why the quantity or price received differs from the order. Receiving has no tolerance. */
  overrideReason?: string | null;
}

export interface ReceiptDoc {
  id: string;
  poId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  receivedOn: string;
  invoiceNumber: string | null;
  invoiceTotalCents: number | null;
  lines: ReceiptLine[];
  receivedBy: string | null;
  notes: string | null;
}

export interface DeliveryDoc {
  id: string;
  deliveredOn: string;
  phase: number;
  siteId: string | null;
  siteName: string | null;
  meals: number;
  pricePerMealCents: number;
  lotCodes: string[];
  deliveredBy: string | null;
  /** Product temperature at hand-off, °F (Roadmap I4). Null when not taken. */
  handoffTempF?: number | null;
  /** Who signed for it at the site. */
  receivedBy?: string | null;
  /** The customer, when the delivery was recorded against an order (Roadmap K1). */
  customerId?: string | null;
  /** The monthly invoice its completed route was added to. */
  invoiceId?: string | null;
  /** The recipe delivered, when known: cost of goods sold relieves that recipe's standard (Roadmap N5, audit A9). */
  recipeCode?: string | null;
  routeCompletedAt?: string | null;
  notes: string | null;
}

export type BillCategory = 'lease' | 'utilities' | 'admin' | 'other';

export interface PeriodBillDoc {
  id: string;
  /** YYYY-MM */
  period: string;
  category: BillCategory;
  accountCode: string;
  amountCents: number;
  vendor: string | null;
  invoiceNumber: string | null;
  incurredOn: string | null;
  paidOn: string | null;
  /** Terms on the bill (Roadmap K3); absent on bills recorded before them. */
  paymentTerms?: PaymentTerms | null;
  notes: string | null;
}

/** The opening balance sheet of the actuals (Roadmap K6). */
export interface OpeningBalanceDoc {
  id: string;
  asOf: string;
  ownerEquityCents: number;
  fixedAssetsCents: number;
  longTermDebtCents: number;
  notes: string | null;
}

/** Opening cash: the equity and the financing brought in, less the fit-out they paid for. */
export const openingCashCents = (o: Pick<OpeningBalanceDoc, 'ownerEquityCents' | 'fixedAssetsCents' | 'longTermDebtCents'>): number =>
  o.ownerEquityCents + o.longTermDebtCents - o.fixedAssetsCents;

/** Capital bought for cash: an equipment line or leasehold improvement (Roadmap N4b / N5). */
export interface CapitalPurchaseDoc {
  id: string;
  kind: 'equipment' | 'leasehold';
  key: string;
  item: string;
  purchasedOn: string;
  amountCents: number;
}

/** A loan drawn in cash. */
export interface LoanDrawDoc {
  id: string;
  loanKey: string;
  label: string;
  drawnOn: string;
  principalCents: number;
}

/** One payment on a loan: interest expensed, principal against the debt. */
export interface LoanPaymentDoc {
  id: string;
  loanKey: string;
  label: string;
  paidOn: string;
  interestCents: number;
  principalCents: number;
}

/** A marketplace remittance deposited: clears processor clearing into cash (Roadmap N5). */
export interface ProcessorDepositDoc {
  id: string;
  depositedOn: string;
  amountCents: number;
  notes: string | null;
}

/** Owners' equity contributed in cash. */
export interface EquityContributionDoc {
  id: string;
  contributedOn: string;
  amountCents: number;
  notes: string | null;
}

export interface ActualsBundle {
  batches: BatchRecordDoc[];
  receipts: ReceiptDoc[];
  deliveries: DeliveryDoc[];
  bills: PeriodBillDoc[];
  /** Approved standard-cost versions (Roadmap J5). Absent = every batch is costed at the live library. */
  standards?: StandardVersionDoc[];
  /** Roadmap K: the documents of working capital. Absent = none on file. */
  openingBalances?: OpeningBalanceDoc[];
  invoices?: InvoiceDoc[];
  customerPayments?: CustomerPaymentDoc[];
  supplierBills?: SupplierBillDoc[];
  supplierPayments?: SupplierPaymentDoc[];
  staff?: StaffDoc[];
  punches?: PunchDoc[];
  /** Pay periods closed in CompTable (Roadmap O1). Absent = none received. */
  payrollPeriods?: ClosedPayrollPeriodDoc[];
  /** Roadmap N5: capital bought, loans drawn and repaid, equity contributed — dated documents. Absent = none. */
  capitalPurchases?: CapitalPurchaseDoc[];
  loanDraws?: LoanDrawDoc[];
  loanPayments?: LoanPaymentDoc[];
  equityContributions?: EquityContributionDoc[];
  processorDeposits?: ProcessorDepositDoc[];
}

export const EMPTY_BUNDLE: ActualsBundle = { batches: [], receipts: [], deliveries: [], bills: [] };

/** Where a bill category posts. Lease and utilities are manufacturing overhead; admin is G&A. */
/**
 * Where a bill posts. Lease and utilities settle the month-end accrual of the
 * budgeted manufacturing overhead (Roadmap J2); the ledger routes those two by
 * category, so rows written before the accrual existed post the same way.
 */
export const BILL_ACCOUNTS: Record<Exclude<BillCategory, 'other'>, string> = {
  lease: '2160',
  utilities: '2160',
  admin: '7080',
};

/**
 * The bill category a fixed-cost line posts under: general and administrative
 * lines are admin; a manufacturing-overhead line is the lease when its category
 * or label says lease or rent, else utilities and facility operating. The
 * accounting treatment is the line's own; this only picks the settling category.
 */
export function billCategoryForLine(line: { label: string; category: string; treatment: string }): Exclude<BillCategory, 'other'> {
  if (line.treatment === 'general_admin') return 'admin';
  return /lease|rent/i.test(`${line.category} ${line.label}`) ? 'lease' : 'utilities';
}

/** The bill categories that are budgeted manufacturing overhead. */
export const OVERHEAD_BILL_CATEGORIES: readonly Exclude<BillCategory, 'other' | 'admin'>[] = ['lease', 'utilities'];

export const BILL_CATEGORY_LABELS: Record<BillCategory, string> = {
  lease: 'Commissary lease',
  utilities: 'Utilities & facility operating',
  admin: 'Admin, insurance, software, licenses',
  other: 'Other (named account)',
};

// ── Periods ─────────────────────────────────────────────────────────────────

/** The YYYY-MM a date falls in. */
export const periodOf = (isoDate: string): string => isoDate.slice(0, 7);

/** The last calendar day of a YYYY-MM period, ISO. */
export function periodEnd(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${period}-${String(last).padStart(2, '0')}`;
}

export const periodStart = (period: string): string => `${period}-01`;

/** Every period with at least one record, ascending. */
/**
 * Every period with at least one record, ascending. A punch's period is the
 * UTC month of its timestamp; the ledger dates payroll by the kitchen's local
 * work date and pay date, and adds those periods itself.
 */
export function periodsIn(bundle: ActualsBundle): string[] {
  const set = new Set<string>();
  for (const b of bundle.batches) set.add(periodOf(b.productionDate));
  for (const r of bundle.receipts) set.add(periodOf(r.receivedOn));
  for (const d of bundle.deliveries) set.add(periodOf(d.deliveredOn));
  for (const b of bundle.bills) set.add(b.period);
  for (const o of bundle.openingBalances ?? []) set.add(periodOf(o.asOf));
  for (const p of bundle.customerPayments ?? []) set.add(periodOf(p.receivedOn));
  for (const b of bundle.supplierBills ?? []) set.add(periodOf(b.billDate));
  for (const p of bundle.supplierPayments ?? []) set.add(periodOf(p.paidOn));
  for (const p of bundle.punches ?? []) set.add(periodOf(p.punchedAt));
  for (const c of bundle.capitalPurchases ?? []) set.add(periodOf(c.purchasedOn));
  for (const d of bundle.loanDraws ?? []) set.add(periodOf(d.drawnOn));
  for (const p of bundle.loanPayments ?? []) set.add(periodOf(p.paidOn));
  for (const e of bundle.equityContributions ?? []) set.add(periodOf(e.contributedOn));
  for (const x of bundle.processorDeposits ?? []) set.add(periodOf(x.depositedOn));
  return [...set].sort();
}

/**
 * The records dated inside a period. Reference documents a period's postings
 * read — invoices, staff, punches, standards — are carried whole: an invoice
 * issued later still names this month's deliveries, and a workweek can cross
 * a month end.
 */
export function bundleForPeriod(bundle: ActualsBundle, period: string): ActualsBundle {
  return {
    ...bundle,
    batches: bundle.batches.filter((b) => periodOf(b.productionDate) === period),
    receipts: bundle.receipts.filter((r) => periodOf(r.receivedOn) === period),
    deliveries: bundle.deliveries.filter((d) => periodOf(d.deliveredOn) === period),
    bills: bundle.bills.filter((b) => b.period === period),
    openingBalances: (bundle.openingBalances ?? []).filter((o) => periodOf(o.asOf) === period),
    customerPayments: (bundle.customerPayments ?? []).filter((p) => periodOf(p.receivedOn) === period),
    supplierBills: (bundle.supplierBills ?? []).filter((b) => periodOf(b.billDate) === period),
    supplierPayments: (bundle.supplierPayments ?? []).filter((p) => periodOf(p.paidOn) === period),
    capitalPurchases: (bundle.capitalPurchases ?? []).filter((c) => periodOf(c.purchasedOn) === period),
    loanDraws: (bundle.loanDraws ?? []).filter((d) => periodOf(d.drawnOn) === period),
    loanPayments: (bundle.loanPayments ?? []).filter((p) => periodOf(p.paidOn) === period),
    equityContributions: (bundle.equityContributions ?? []).filter((e) => periodOf(e.contributedOn) === period),
    processorDeposits: (bundle.processorDeposits ?? []).filter((x) => periodOf(x.depositedOn) === period),
  };
}

export function bundleThrough(bundle: ActualsBundle, period: string): ActualsBundle {
  return {
    ...bundle,
    batches: bundle.batches.filter((b) => periodOf(b.productionDate) <= period),
    receipts: bundle.receipts.filter((r) => periodOf(r.receivedOn) <= period),
    deliveries: bundle.deliveries.filter((d) => periodOf(d.deliveredOn) <= period),
    bills: bundle.bills.filter((b) => b.period <= period),
    openingBalances: (bundle.openingBalances ?? []).filter((o) => periodOf(o.asOf) <= period),
    customerPayments: (bundle.customerPayments ?? []).filter((p) => periodOf(p.receivedOn) <= period),
    supplierBills: (bundle.supplierBills ?? []).filter((b) => periodOf(b.billDate) <= period),
    supplierPayments: (bundle.supplierPayments ?? []).filter((p) => periodOf(p.paidOn) <= period),
    punches: (bundle.punches ?? []).filter((p) => periodOf(p.punchedAt) <= period),
    capitalPurchases: (bundle.capitalPurchases ?? []).filter((c) => periodOf(c.purchasedOn) <= period),
    loanDraws: (bundle.loanDraws ?? []).filter((d) => periodOf(d.drawnOn) <= period),
    loanPayments: (bundle.loanPayments ?? []).filter((p) => periodOf(p.paidOn) <= period),
    equityContributions: (bundle.equityContributions ?? []).filter((e) => periodOf(e.contributedOn) <= period),
    processorDeposits: (bundle.processorDeposits ?? []).filter((x) => periodOf(x.depositedOn) <= period),
  };
}

// ── The batch record as the ledger consumes it ──────────────────────────────

export function toBatchExecution(doc: BatchRecordDoc): BatchExecution {
  return {
    batchId: doc.batchId,
    recipeCode: doc.recipeCode,
    productionDate: doc.productionDate,
    standardVersion: doc.standardVersion,
    plannedPortions: doc.plannedPortions,
    goodPortions: doc.goodPortions,
    components: doc.components,
    actualLaborHours: doc.actualLaborHours,
    actualLaborRate: doc.actualLaborRate,
    closedBy: doc.closedBy ?? 'unsigned',
  };
}

/** A finished-goods lot: one component's output on a closed batch record. */
export interface FinishedLotRef {
  lotCode: string;
  recipeCode: string;
  component: string;
  productionDate: string;
}

/**
 * Every output lot on file across closed batch records, newest production date
 * first — the list a delivery picks its shipped lots from (Roadmap I4). Lots
 * with no code recorded are not on the list.
 */
export function finishedLotsOf(batches: readonly BatchRecordDoc[]): FinishedLotRef[] {
  const out: FinishedLotRef[] = [];
  for (const b of batches) {
    for (const c of b.components) {
      const lotCode = c.outputLotCode.trim();
      if (lotCode) out.push({ lotCode, recipeCode: b.recipeCode, component: c.component, productionDate: b.productionDate });
    }
  }
  return out.sort((a, b) => b.productionDate.localeCompare(a.productionDate) || a.lotCode.localeCompare(b.lotCode));
}

/** `B-YYMMDD-NN` — the operator-visible batch id for a production date. */
export function batchIdFor(productionDate: string, sequence: number): string {
  return `B-${productionDate.replaceAll('-', '').slice(2)}-${String(sequence).padStart(2, '0')}`;
}

/**
 * A batch record prefilled at standard for a production date, so the capture
 * form starts from the recipe's own weights and the operator types only what
 * differed. Every input lot code starts as "not recorded" and every weight as
 * the standard; the record is not closed until someone signs it.
 */
export function standardBatchRecordPrefill(
  productionDate: string,
  sequence: number,
  portions: number,
  recipe: Recipe = defaultRecipe,
  shrinkAllowance: number = defaultAssumptions.yield.shrinkAllowance.value,
  /** The standard the record names: an approved version's label, else the live library's. */
  standardVersion: string = libraryLabel(recipe.code),
): Omit<BatchRecordDoc, 'id' | 'closedAt'> {
  const batchId = batchIdFor(productionDate, sequence);
  const components = componentCosting(recipe, shrinkAllowance);
  const b = standardBatch(
    batchId,
    productionDate,
    portions,
    components,
    `${recipe.code}@${productionDate}`,
    (c) => traceabilityLotCode('AMK', recipe.code.replace(/-/g, ''), productionDate, c, sequence),
    recipe.code,
    shrinkAllowance,
  );
  return {
    batchId,
    recipeCode: recipe.code,
    productionDate,
    standardVersion,
    plannedPortions: portions,
    goodPortions: portions,
    batchesRun: 1,
    mealsProduced: null,
    components: b.components,
    crew: [],
    actualLaborHours: null,
    actualLaborRate: null,
    closedBy: null,
    notes: null,
  };
}

// ── Receipts against the standard ───────────────────────────────────────────

export interface ReceiptLineCost {
  line: ReceiptLine;
  /** Standard price per unit in cents, from the recipe line; null when the ingredient is not on the recipe. */
  standardUnitPriceCents: number | null;
  standardCents: number;
  invoiceCents: number;
  /** Positive = paid more than standard. */
  purchasePriceVarianceCents: number;
}

export function costReceiptLines(lines: readonly ReceiptLine[], recipe: Recipe = defaultRecipe): ReceiptLineCost[] {
  return lines.map((line) => {
    const ing = recipe.ingredients.find((i) => i.name === line.ingredient);
    const stdUnit = ing ? Math.round(ing.apUnitCost * 100) : null;
    const invoiceCents = Math.round(line.qty * line.unitPriceCents);
    const standardCents = stdUnit === null ? invoiceCents : Math.round(line.qty * stdUnit);
    return {
      line,
      standardUnitPriceCents: stdUnit,
      standardCents,
      invoiceCents,
      purchasePriceVarianceCents: invoiceCents - standardCents,
    };
  });
}
