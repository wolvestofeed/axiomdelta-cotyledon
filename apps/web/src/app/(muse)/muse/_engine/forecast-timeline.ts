/**
 * Impact OS — the forecast timeline (Roadmap N4b, operating-model-roadmap §2.2).
 *
 * Ledger-free, database-free, deterministic. A forecast is a dated timeline
 * from its start date: one year by default, expandable to two or three on the
 * forecast (Robert, 2026-09-16 — recompute time grows with the customers a
 * forecast includes). Nothing in it is automated (decision 15):
 * the engine takes what the forecast carries — its customers, services, dated
 * volume, meal plans, equipment dates, loans and fixed-cost lines — runs it
 * across the calendar, and writes out the documents the business would record,
 * in the same shapes as actuals, so the Plan ledger (N5) posts them through
 * the same functions as the Actual ledger.
 *
 *   orders          the order book: every service on every date it runs, the
 *                   customer's meal plan recipe (`orderBook`)
 *   production      the rolling horizon — whole batches net of stock, lines in
 *                   service on the date, hold life (`planHorizon`)
 *   batch records   each production day's runs at standard, labor at the
 *                   recipe's own standard
 *   deliveries      each order at the share its recipe could be filled that day,
 *                   at the contracted price, else the channel price
 *   purchasing      each production day's ingredients in whole cases, net of
 *                   what earlier case rounding left on hand; received on the
 *                   production date
 *   supplier bills  and their payments on the terms on file; with no supplier or
 *                   no terms, billed on receipt and paid that day, named
 *   invoices        one per invoiced customer per month, issued at month end,
 *                   collected on the due date, or on the issue date with no
 *                   terms on file, named
 *   pay periods     the biweekly calendar, loaded at the batch records' standard
 *                   labor, split by account
 *   fixed costs     one bill per fixed-cost line per month it is in force
 *   capital         equipment on its in-service date in the forecast; counted
 *                   leasehold at the start
 *   loans           each drawn on its start date and repaid on its schedule
 *
 * Every place the definitions do not say how something happens is a named gap,
 * never a filled-in figure. Nothing generated is stored: a change to a
 * definition or to the forecast recomputes it (decision 16).
 */

import type { MenuCycleDef } from '../_data/menu-cycles';
import type { DeliveryDoc, BatchRecordDoc, ReceiptDoc, ReceiptLine, PeriodBillDoc, CapitalPurchaseDoc, LoanDrawDoc, LoanPaymentDoc, EquityContributionDoc, ProcessorDepositDoc } from './actuals';
import { CHANNEL_COMMISSION_PHASE3 } from './phase';
import { BILL_ACCOUNTS, billCategoryForLine, periodEnd, periodOf, periodStart, standardBatchRecordPrefill } from './actuals';
import type { InvoiceDoc, CustomerPaymentDoc, SupplierBillDoc, SupplierPaymentDoc } from './working-capital';
import { addMonths, amortizationSchedule, dueOn, invoiceNumberFor } from './working-capital';
import type { ClosedPayrollPeriodDoc } from './payroll';
import { payPeriodsOverlapping } from './payroll';
import { assumptionsFor, type ResolvedInputs } from './scenario';
import { orderBook, isoAddDays, type BookOrder } from './orders';
import { planHorizon, type HorizonPlan } from './production-plan';
import { equipmentInServiceOn, isBlastChiller, countsTowardCapital } from './equipment';
import { extendedCost, lineInForceOn, loanPrincipal } from './fixed-costs';
import { libraryLabel } from './standards';
import { laborForDay } from './index';
import { splitLoadedLaborCents } from './comp';
import { INVOICED_CHANNELS, PAID_AT_ORDER_CHANNELS } from '../_data/working-capital';
import type { CustomerDef } from '../_data/customers';

// ── Documents the actuals have no shape for yet ─────────────────────────────

/** A purchase order the plan raises: one per supplier per production day. */
export interface PlanPurchaseOrderDoc {
  id: string;
  orderedOn: string;
  expectedOn: string;
  supplierId: string | null;
  supplierName: string;
  lines: { ingredient: string; qty: number; unit: 'lb' | 'each'; unitPriceCents: number; cases: number; packSize: number }[];
}

export interface TimelineDocuments {
  orders: BookOrder[];
  purchaseOrders: PlanPurchaseOrderDoc[];
  receipts: ReceiptDoc[];
  supplierBills: SupplierBillDoc[];
  supplierPayments: SupplierPaymentDoc[];
  batches: BatchRecordDoc[];
  deliveries: DeliveryDoc[];
  invoices: InvoiceDoc[];
  customerPayments: CustomerPaymentDoc[];
  payrollPeriods: ClosedPayrollPeriodDoc[];
  bills: PeriodBillDoc[];
  capitalPurchases: CapitalPurchaseDoc[];
  loanDraws: LoanDrawDoc[];
  loanPayments: LoanPaymentDoc[];
  equityContributions: EquityContributionDoc[];
  processorDeposits: ProcessorDepositDoc[];
}

export type { CapitalPurchaseDoc, LoanDrawDoc, LoanPaymentDoc, EquityContributionDoc, ProcessorDepositDoc };

export type TimelineGapKind =
  | 'no_customer_terms'
  | 'paid_at_order_deposits'
  | 'delivery_cost_payment_timing'
  | 'no_supplier'
  | 'no_supplier_terms'
  | 'fixed_cost_payment_timing'
  | 'unfilled_meals'
  | 'no_line_in_service'
  | 'undated_equipment';

export interface TimelineGap {
  kind: TimelineGapKind;
  /** A plain statement of what the definitions do not say and what the timeline did about it. */
  message: string;
  /** How many documents, dates or items it touches. */
  count: number;
}

export interface TimelineYear {
  /** 1-based year of the horizon. */
  year: number;
  from: string;
  to: string;
  orderedMeals: number;
  deliveredMeals: number;
  producedPortions: number;
  batches: number;
  revenueCents: number;
  loadedLaborCents: number;
}

export interface ForecastTimeline {
  from: string;
  to: string;
  horizonYears: number;
  horizon: HorizonPlan;
  documents: TimelineDocuments;
  years: TimelineYear[];
  /**
   * Normal capacity on the plan's own production (§4 N4b): portions produced
   * over the horizon, a year's worth, net of planned downtime.
   */
  normalCapacity: { producedPortions: number; perYear: number; plannedDowntimeRate: number; netPerYear: number };
  gaps: TimelineGap[];
}

export interface TimelineInput {
  /** The forecast, resolved: its overlay applied to the definitions. */
  inputs: ResolvedInputs;
  /** Saved menu cycles and the customers' meal plans on record; a forecast's own copies ride on the sites. */
  cycles: readonly MenuCycleDef[];
  /** Years from the start date. Absent = the forecast's own choice, one year unless expanded to two or three. */
  horizonYears?: 1 | 2 | 3;
}

const cents = (dollars: number) => Math.round(dollars * 100);
const receiptUnit = (unit: string): 'lb' | 'each' => (unit === 'each' ? 'each' : 'lb');

/** The last day of an n-year window starting on `from`. */
export function horizonEnd(from: string, years: number): string {
  return isoAddDays(addMonths(from, 12 * years), -1);
}

/**
 * Blast chillers in service on each date, as a step function over the dated
 * equipment. Each unit is one line (decision 20). A production day before the
 * forecast start makes the window's first deliveries, so it reads the lines
 * the forecast opens with.
 */
function linesOnFn(inputs: ResolvedInputs, from: string): (date: string) => number {
  const chillers = inputs.datedEquipment.filter((l) => isBlastChiller(l.item) && l.qty > 0);
  const cache = new Map<string, number>();
  return (date: string) => {
    let n = cache.get(date);
    if (n === undefined) {
      n = equipmentInServiceOn(chillers, date < from ? from : date).reduce((s, l) => s + l.qty, 0);
      cache.set(date, n);
    }
    return n;
  };
}

export function simulateForecast(input: TimelineInput): ForecastTimeline {
  const { inputs } = input;
  const horizonYears = input.horizonYears ?? inputs.forecast.horizonYears;
  const from = inputs.forecast.startDate;
  const to = horizonEnd(from, horizonYears);
  const gaps = new Map<TimelineGapKind, TimelineGap>();
  const gap = (kind: TimelineGapKind, message: string, n = 1) => {
    const g = gaps.get(kind);
    if (g) g.count += n;
    else gaps.set(kind, { kind, message, count: n });
  };

  // ── Orders ────────────────────────────────────────────────────────────────
  const channelPriceCents = Object.fromEntries(inputs.phases.map((p) => [p.phase, cents(p.pricePerMeal)]));
  const recipeNames = Object.fromEntries(inputs.recipes.map((r) => [r.code, r.name]));
  const orders = orderBook({ sites: inputs.demand.sites, customers: inputs.customers, cycles: input.cycles, orders: [], from, to, channelPriceCents, recipeNames, closures: inputs.closures });

  // ── Production ────────────────────────────────────────────────────────────
  const linesOn = linesOnFn(inputs, from);
  const assumptions = inputs.assumptions;
  const holdLifeDays = assumptions.inventory.chilledHoldLife.value;
  const portionFactorByChannel = Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.portionFactor.value]));
  const horizon = planHorizon({
    from,
    to,
    book: orders,
    recipes: inputs.recipes,
    capacityInputs: inputs.capacityInputs,
    assumptions,
    recipeAssumptions: inputs.recipeAssumptions,
    portionFactorByChannel,
    openingLots: [],
    holdLifeDays,
    channels: inputs.phases.map((p) => p.phase),
    closures: inputs.closures,
    linesOn,
  });
  const noLine = horizon.productionDays.filter((d) => d.cyclesAvailable === 0 && d.runs.length > 0);
  if (noLine.length > 0) gap('no_line_in_service', 'Production dates with orders and no blast chiller in service in this forecast: nothing is made, and those orders are unfilled.', noLine.length);
  const undated = inputs.datedEquipment.filter((l) => l.inServiceBasis === 'undated' && l.qty > 0);
  if (undated.length > 0) gap('undated_equipment', 'Planned Phase 2 and 3 equipment with no in-service date in this forecast: not in service and not bought on any date.', undated.length);

  // ── Batch records at standard ─────────────────────────────────────────────
  const shrink = assumptions.yield.shrinkAllowance.value;
  const batches: BatchRecordDoc[] = [];
  const laborCostOn = new Map<string, number>();
  const laborHoursOn = new Map<string, number>();
  // A batch record is one cook and the cook is the lot (Robert, 2026-09-17).
  // The day plan loads a recipe's batches on whichever cabinet is free; the
  // batches loaded at the same minute were filled from one cook — a double batch
  // — and are one record with that many cabinet loads. A batch loaded later is
  // another cook: another record, another lot.
  for (const day of horizon.productionDays) {
    let seq = 0;
    for (const run of day.runs) {
      if (run.produced <= 0) continue;
      const recipe = inputs.recipes.find((r) => r.code === run.recipeCode);
      if (!recipe) continue;
      const a = assumptionsFor(inputs, recipe.code);
      const loads = day.schedule.filter((b) => b.fits && b.recipeCode === run.recipeCode);
      const cooks = new Map<number, number>();
      for (const b of loads) cooks.set(b.loadMin, (cooks.get(b.loadMin) ?? 0) + 1);
      const perCook = cooks.size ? [...cooks.entries()].sort((x, y) => x[0] - y[0]).map(([, n]) => n) : [run.batchesScheduled];
      for (const cabinetLoads of perCook) {
        seq += 1;
        const portions = cabinetLoads * run.batchSize;
        const labor = laborForDay(cabinetLoads, portions, a);
        const prefill = standardBatchRecordPrefill(day.productionDate, seq, portions, recipe, shrink, libraryLabel(recipe.code));
        batches.push({
          ...prefill,
          id: `PLAN-BATCH-${day.productionDate}-${seq}`,
          batchesRun: cabinetLoads,
          actualLaborHours: labor.totalLaborHours,
          actualLaborRate: a.labor.blendedLoadedWage.value,
          closedBy: 'plan',
          closedAt: day.productionDate,
        });
      }
      laborCostOn.set(day.productionDate, (laborCostOn.get(day.productionDate) ?? 0) + run.laborCost);
      laborHoursOn.set(day.productionDate, (laborHoursOn.get(day.productionDate) ?? 0) + run.laborHours);
    }
  }

  // ── Deliveries at the share each recipe was filled ────────────────────────
  const fillOn = new Map<string, Map<string, number>>();
  for (const d of horizon.deliveryDays) {
    fillOn.set(d.date, new Map(d.byRecipe.map((r) => [r.recipeCode, r.orderedBase > 0 ? r.filledBase / r.orderedBase : 1])));
  }
  const deliveries: DeliveryDoc[] = [];
  let unfilledMeals = 0;
  const seqByDate = new Map<string, number>();
  for (const o of orders) {
    const share = fillOn.get(o.orderDate)?.get(o.recipeCode) ?? 0;
    const meals = o.meals * share;
    unfilledMeals += o.meals - meals;
    if (meals <= 0) continue;
    const n = (seqByDate.get(o.orderDate) ?? 0) + 1;
    seqByDate.set(o.orderDate, n);
    const id = `PLAN-DLV-${o.orderDate}-${n}`;
    deliveries.push({
      id,
      deliveredOn: o.orderDate,
      phase: o.channel,
      siteId: o.deliverySiteId,
      siteName: o.siteName,
      meals,
      pricePerMealCents: o.pricePerMealCents,
      lotCodes: [],
      deliveredBy: null,
      customerId: o.customerId,
      invoiceId: null,
      recipeCode: o.recipeCode,
      notes: `${o.customerName} · ${o.serviceName ?? 'service'} · ${o.recipeCode} · ${o.priceBasis === 'contract' ? 'contracted price' : 'channel price'}`,
    });
  }
  if (unfilledMeals > 1e-6) gap('unfilled_meals', 'Meals ordered that the lines in service could not make in time: not delivered and not invoiced.', Math.round(unfilledMeals));

  // ── Purchasing: whole cases net of what rounding left on hand ─────────────
  const supplierOf = new Map<string, string | null>();
  for (const [key, price] of Object.entries(inputs.ingredientPrices)) {
    const name = key.split('::').slice(1).join('::');
    if (!supplierOf.has(name) || (supplierOf.get(name) === null && price.supplierId)) supplierOf.set(name, price.supplierId);
  }
  const onHand = new Map<string, number>();
  const purchaseOrders: PlanPurchaseOrderDoc[] = [];
  const receipts: ReceiptDoc[] = [];
  const supplierBills: SupplierBillDoc[] = [];
  const supplierPayments: SupplierPaymentDoc[] = [];
  let noSupplierReceipts = 0;
  let noTermsReceipts = 0;
  for (const day of horizon.productionDays) {
    const bySupplier = new Map<string, PlanPurchaseOrderDoc['lines']>();
    for (const l of day.purchase.lines) {
      const key = `${l.name}|${l.unit}`;
      const have = onHand.get(key) ?? 0;
      const need = Math.max(0, l.requiredForProduction - have);
      const cases = l.packSize > 0 ? Math.ceil(need / l.packSize - 1e-9) : 0;
      const qty = cases * l.packSize;
      onHand.set(key, have + qty - l.requiredForProduction);
      if (cases <= 0) continue;
      const supplier = supplierOf.get(l.name) ?? null;
      const s = supplier ?? '';
      const lines = bySupplier.get(s) ?? [];
      lines.push({ ingredient: l.name, qty, unit: receiptUnit(l.unit), unitPriceCents: Math.round(l.apUnitCost * 100), cases, packSize: l.packSize });
      bySupplier.set(s, lines);
    }
    let n = 0;
    for (const [supplierKey, lines] of bySupplier) {
      n += 1;
      const supplierId = supplierKey || null;
      const supplierName = supplierId ?? 'No supplier linked';
      const date = day.productionDate;
      const poId = `PLAN-PO-${date}-${n}`;
      purchaseOrders.push({ id: poId, orderedOn: date, expectedOn: date, supplierId, supplierName, lines });
      const receiptLines: ReceiptLine[] = lines.map((l) => ({
        ingredient: l.ingredient,
        qty: l.qty,
        unit: l.unit,
        lotCode: `PLAN-${date}-${l.ingredient}`,
        unitPriceCents: l.unitPriceCents,
        condition: 'accepted',
        poQty: l.qty,
        poUnitPriceCents: l.unitPriceCents,
      }));
      const receiptId = `PLAN-RCPT-${date}-${n}`;
      const totalCents = receiptLines.reduce((t, l) => t + Math.round(l.qty * l.unitPriceCents), 0);
      receipts.push({ id: receiptId, poId, supplierId, supplierName, receivedOn: date, invoiceNumber: null, invoiceTotalCents: totalCents, lines: receiptLines, receivedBy: 'plan', notes: null });
      // No supplier linked, or no terms on file: billed on receipt and paid that day (Robert, 2026-09-16), named.
      if (!supplierId) noSupplierReceipts += 1;
      const onFile = supplierId ? inputs.supplierTerms[supplierId] : undefined;
      if (supplierId && !onFile) noTermsReceipts += 1;
      const terms = onFile ?? 'due_on_receipt';
      const billId = `PLAN-SBILL-${date}-${n}`;
      supplierBills.push({ id: billId, supplierId, supplierName, billNumber: billId, billDate: date, paymentTerms: terms, receiptIds: [receiptId], lines: lines.map((l) => ({ ingredient: l.ingredient, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })), notes: onFile ? null : 'No payment terms on file: settled on the bill date.' });
      const paidOn = dueOn(date, terms);
      if (paidOn && paidOn <= to) {
        supplierPayments.push({ id: `PLAN-SPAY-${date}-${n}`, supplierId, supplierName, paidOn, amountCents: totalCents, method: null, reference: billId, applications: [{ documentId: billId, amountCents: totalCents }], notes: null });
      }
    }
  }
  if (noSupplierReceipts > 0) gap('no_supplier', 'Receipts for ingredients with no supplier linked: received at the recipe line price, billed on receipt and paid the same day.', noSupplierReceipts);
  if (noTermsReceipts > 0) gap('no_supplier_terms', 'Receipts from a supplier with no payment terms on file: billed on receipt and paid the same day.', noTermsReceipts);

  // ── Invoices and collections ──────────────────────────────────────────────
  const customerById = new Map<string, CustomerDef>(inputs.customers.map((c) => [c.id, c]));
  const invoices: InvoiceDoc[] = [];
  const customerPayments: CustomerPaymentDoc[] = [];
  const groups = new Map<string, DeliveryDoc[]>();
  let paidAtOrder = 0;
  for (const d of deliveries) {
    if (PAID_AT_ORDER_CHANNELS.includes(d.phase)) {
      paidAtOrder += 1;
      continue;
    }
    if (!INVOICED_CHANNELS.includes(d.phase) || !d.customerId) continue;
    const key = `${d.customerId}|${periodOf(d.deliveredOn)}`;
    const arr = groups.get(key) ?? [];
    arr.push(d);
    groups.set(key, arr);
  }
  // Ghost kitchen: paid at order; the marketplace remittance, net of its commission, is taken as
  // deposited on the delivery date (Robert, 2026-09-16: no terms → the document date), named.
  const processorDeposits: ProcessorDepositDoc[] = [];
  const remitByDate = new Map<string, number>();
  for (const d of deliveries) {
    if (!PAID_AT_ORDER_CHANNELS.includes(d.phase)) continue;
    const revenue = Math.round(d.meals * d.pricePerMealCents);
    const commission = d.phase === 3 ? Math.round(revenue * CHANNEL_COMMISSION_PHASE3) : 0;
    remitByDate.set(d.deliveredOn, (remitByDate.get(d.deliveredOn) ?? 0) + revenue - commission);
  }
  for (const [date, amountCents] of [...remitByDate].sort(([a], [b]) => a.localeCompare(b))) {
    if (amountCents !== 0) processorDeposits.push({ id: `PLAN-DEPOSIT-${date}`, depositedOn: date, amountCents, notes: 'No remittance terms on file: deposited on the delivery date.' });
  }
  if (paidAtOrder > 0) gap('paid_at_order_deposits', 'Ghost kitchen orders are paid at the time of ordering; with no marketplace remittance terms on file, the remittance net of commission is deposited on the delivery date.', paidAtOrder);

  let noTermsInvoices = 0;
  const invoiceSeq = new Map<string, number>();
  for (const key of [...groups.keys()].sort((a, b) => a.split('|')[1]!.localeCompare(b.split('|')[1]!) || a.localeCompare(b))) {
    const ds = groups.get(key)!;
    const [customerId, period] = key.split('|') as [string, string];
    const customer = customerById.get(customerId);
    const openedOn = ds.reduce((m, d) => (d.deliveredOn < m ? d.deliveredOn : m), ds[0]!.deliveredOn);
    const seq = (invoiceSeq.get(openedOn) ?? 0) + 1;
    invoiceSeq.set(openedOn, seq);
    const issuedOn = periodEnd(period);
    const terms = customer?.paymentTerms ?? null;
    // No terms on file: collected on the issue date (Robert, 2026-09-16), named.
    const due = dueOn(issuedOn, terms ?? 'due_on_receipt');
    const id = `PLAN-INV-${period}-${customerId}`;
    invoices.push({ id, invoiceNumber: invoiceNumberFor(openedOn, seq), customerId, customerName: customer?.name ?? customerId, period, status: 'issued', openedOn, paymentTerms: terms, issuedOn, dueOn: due, issuedBy: 'plan', notes: terms ? null : 'No payment terms on file: collected on the issue date.' });
    for (const d of ds) d.invoiceId = id;
    if (!terms) noTermsInvoices += 1;
    if (!due || due > to) continue;
    const amountCents = ds.reduce((t, d) => t + Math.round(d.meals * d.pricePerMealCents), 0);
    customerPayments.push({ id: `PLAN-CPAY-${period}-${customerId}`, customerId, customerName: customer?.name ?? customerId, receivedOn: due, amountCents, method: null, reference: invoices.at(-1)!.invoiceNumber, applications: [{ documentId: id, amountCents }], notes: null });
  }
  if (noTermsInvoices > 0) gap('no_customer_terms', 'Invoices to customers with no payment terms on file: collected on the issue date.', noTermsInvoices);

  // ── Own-fleet delivery cost: accrued to payables at delivery; with no terms on
  //    file, paid on the delivery date (Robert, 2026-09-16), named.
  const deliveryPerMealCents = Math.round(assumptions.perMeal.delivery.value * 100);
  const deliveryCostByDate = new Map<string, number>();
  for (const d of deliveries) deliveryCostByDate.set(d.deliveredOn, (deliveryCostByDate.get(d.deliveredOn) ?? 0) + Math.round(d.meals * deliveryPerMealCents));
  let deliveryPayments = 0;
  for (const [date, amountCents] of [...deliveryCostByDate].sort(([a], [b]) => a.localeCompare(b))) {
    if (amountCents <= 0) continue;
    supplierPayments.push({ id: `PLAN-DELIVERYPAY-${date}`, supplierId: null, supplierName: 'Own fleet', paidOn: date, amountCents, method: null, reference: null, applications: [], notes: 'Delivery cost accrued at delivery; no terms on file, paid on the delivery date.' });
    deliveryPayments += 1;
  }
  if (deliveryPayments > 0) gap('delivery_cost_payment_timing', 'Own-fleet delivery cost carries no payment terms: paid on each delivery date.', deliveryPayments);

  // ── Pay periods at the batch records' standard labor ──────────────────────
  const burden = assumptions.labor.payrollBurden.value;
  const payrollPeriods: ClosedPayrollPeriodDoc[] = [];
  for (const pp of payPeriodsOverlapping(from, to, inputs.payCalendar)) {
    let dollars = 0;
    let hours = 0;
    for (let d = pp.start; d <= pp.end; d = isoAddDays(d, 1)) {
      dollars += laborCostOn.get(d) ?? 0;
      hours += laborHoursOn.get(d) ?? 0;
    }
    if (dollars <= 0) continue;
    const split = splitLoadedLaborCents(cents(dollars), burden);
    payrollPeriods.push({
      id: `PLAN-PAY-${pp.start}`,
      comptableRef: 'plan',
      periodStart: pp.start,
      periodEnd: pp.end,
      payDate: pp.payDate,
      wagesCents: split.wagesCents,
      payrollTaxesCents: split.payrollTaxesCents,
      workersCompCents: split.workersCompCents,
      benefitsCents: split.benefitsCents,
      regularHours: hours,
      overtimeHours: 0,
      receivedAt: pp.end,
    });
  }

  // ── Fixed-cost bills ──────────────────────────────────────────────────────
  const bills: PeriodBillDoc[] = [];
  let fixedBills = 0;
  for (let p = periodOf(from); p <= periodOf(to); p = periodOf(addMonths(periodStart(p), 1))) {
    for (const line of inputs.fixedCostLines) {
      if (line.monthlyAmountCents <= 0 || !lineInForceOn(line, periodEnd(p))) continue;
      const category = billCategoryForLine(line);
      bills.push({
        id: `PLAN-BILL-${p}-${line.key}`,
        period: p,
        category,
        accountCode: BILL_ACCOUNTS[category],
        amountCents: line.monthlyAmountCents,
        vendor: line.label,
        invoiceNumber: null,
        incurredOn: periodStart(p),
        paidOn: periodStart(p),
        notes: `${line.label} — ${line.category}`,
      });
      fixedBills += 1;
    }
  }
  if (fixedBills > 0) gap('fixed_cost_payment_timing', 'Fixed-cost lines carry no payment terms: each month’s bill is taken as incurred and paid on the first of the month.', fixedBills);

  // ── Capital and loans ─────────────────────────────────────────────────────
  const capitalPurchases: CapitalPurchaseDoc[] = [];
  for (const l of inputs.datedEquipment) {
    if (!countsTowardCapital(l.status) || l.inServiceFrom === null || l.inServiceFrom > to || l.qty <= 0) continue;
    const amountCents = cents(extendedCost(l, inputs.equipmentPurchase));
    if (amountCents <= 0) continue;
    capitalPurchases.push({ id: `PLAN-CAPEX-${l.key}`, kind: 'equipment', key: l.key, item: l.item, purchasedOn: l.inServiceFrom < from ? from : l.inServiceFrom, amountCents });
  }
  for (const l of inputs.leasehold) {
    if (!l.counted || l.extended <= 0) continue;
    capitalPurchases.push({ id: `PLAN-LEASEHOLD-${l.key}`, kind: 'leasehold', key: l.key, item: l.item, purchasedOn: from, amountCents: cents(l.extended) });
  }
  capitalPurchases.sort((a, b) => a.purchasedOn.localeCompare(b.purchasedOn) || a.id.localeCompare(b.id));

  // Owners' equity at the start (Roadmap K6's opening position).
  const equityContributions: EquityContributionDoc[] =
    inputs.openingPosition.ownerEquity > 0 ? [{ id: 'PLAN-EQUITY', contributedOn: from, amountCents: cents(inputs.openingPosition.ownerEquity), notes: "Owners' equity at the forecast start" }] : [];

  const loanDraws: LoanDrawDoc[] = [];
  const loanPayments: LoanPaymentDoc[] = [];
  for (const loan of inputs.loans) {
    if (loan.principalCents <= 0 || loan.startDate > to) continue;
    loanDraws.push({ id: `PLAN-LOAN-${loan.key}`, loanKey: loan.key, label: loan.label, drawnOn: loan.startDate, principalCents: loan.principalCents });
    if (loan.termMonths <= 0) continue;
    for (const p of amortizationSchedule(loanPrincipal(loan), loan.apr, loan.termMonths, loan.startDate)) {
      if (p.date < from || p.date > to) continue;
      loanPayments.push({ id: `PLAN-LOANPAY-${loan.key}-${p.n}`, loanKey: loan.key, label: loan.label, paidOn: p.date, interestCents: cents(p.interest), principalCents: cents(p.principal) });
    }
  }

  // ── Years and normal capacity ─────────────────────────────────────────────
  const years: TimelineYear[] = [];
  for (let y = 0; y < horizonYears; y++) {
    const yFrom = addMonths(from, 12 * y);
    const yTo = horizonEnd(yFrom, 1);
    const inYear = (d: string) => d >= yFrom && d <= yTo;
    const pDays = horizon.productionDays.filter((p) => inYear(p.productionDate));
    const yDeliveries = deliveries.filter((d) => inYear(d.deliveredOn));
    years.push({
      year: y + 1,
      from: yFrom,
      to: yTo,
      orderedMeals: orders.filter((o) => inYear(o.orderDate)).reduce((s, o) => s + o.meals, 0),
      deliveredMeals: yDeliveries.reduce((s, d) => s + d.meals, 0),
      producedPortions: pDays.reduce((s, p) => s + p.totalProduced, 0),
      batches: pDays.reduce((s, p) => s + p.runs.reduce((a, r) => a + r.batchesScheduled, 0), 0),
      revenueCents: yDeliveries.reduce((s, d) => s + Math.round(d.meals * d.pricePerMealCents), 0),
      loadedLaborCents: pDays.reduce((s, p) => s + cents(p.laborCost), 0),
    });
  }
  const producedPortions = horizon.totals.producedBase;
  const plannedDowntimeRate = assumptions.overhead.plannedMaintenanceDownRate.value;
  const perYear = producedPortions / horizonYears;

  return {
    from,
    to,
    horizonYears,
    horizon,
    documents: { orders, purchaseOrders, receipts, supplierBills, supplierPayments, batches, deliveries, invoices, customerPayments, payrollPeriods, bills, capitalPurchases, loanDraws, loanPayments, equityContributions, processorDeposits },
    years,
    normalCapacity: { producedPortions, perYear, plannedDowntimeRate, netPerYear: perYear * (1 - plannedDowntimeRate) },
    gaps: [...gaps.values()],
  };
}
