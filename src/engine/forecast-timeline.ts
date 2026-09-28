/**
 * MicroFarm — the forecast timeline (Roadmap N4b, operating-model-roadmap §2.2).
 *
 * Ledger-free, database-free, deterministic. A forecast is a dated timeline
 * from its start date: one year by default, expandable to two or three on the
 * forecast. Nothing in it is automated:
 * the engine takes what the forecast carries — its subscribers and their
 * subscriptions, equipment dates, loans and fixed-cost lines — runs it
 * across the calendar, and writes out the documents the business would record,
 * in the same shapes as actuals, so the Plan ledger posts them through
 * the same functions as the Actual ledger.
 *
 *   orders          the order book: every distribution each subscription carries,
 *                   one order per flat plan line (`orderBook`)
 *   production      the rolling horizon — the trays ordered, net of stock, lines in
 *                   service on the date, shelf life (`planHorizon`)
 *   sowing records   each production day's runs at standard, labor at the
 *                   grow plan's own standard
 *   distributions      each order at the share its grow plan could be filled that day,
 *                   at the contracted price, else the channel price
 *   purchasing      each production day's inputs in whole cases, net of
 *                   what earlier case rounding left on hand; received on the
 *                   production date
 *   supplier bills  and their payments on the terms on file; with no supplier or
 *                   no terms, billed on receipt and paid that day, named
 *   invoices        one per invoiced subscriber per month, issued at month end,
 *                   collected on the due date, or on the issue date with no
 *                   terms on file, named
 *   pay periods     the biweekly calendar, loaded at the sowing records' standard
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

import type { DistributionDoc, SowingRecordDoc, ReceiptDoc, ReceiptLine, PeriodBillDoc, CapitalPurchaseDoc, LoanDrawDoc, LoanPaymentDoc, EquityContributionDoc, ProcessorDepositDoc } from '@/engine/actuals';
import { CHANNEL_COMMISSION_PHASE3 } from '@/engine/phase';
import { BILL_ACCOUNTS, billCategoryForLine, periodEnd, periodOf, periodStart, standardSowingRecordPrefill } from '@/engine/actuals';
import type { InvoiceDoc, SubscriberPaymentDoc, SupplierBillDoc, SupplierPaymentDoc } from '@/engine/working-capital';
import { addMonths, amortizationSchedule, dueOn, invoiceNumberFor } from '@/engine/working-capital';
import type { ClosedPayrollPeriodDoc } from '@/engine/payroll';
import { payPeriodsOverlapping } from '@/engine/payroll';
import { assumptionsFor, type ResolvedInputs } from '@/engine/scenario';
import { orderBook, isoAddDays, type BookOrder } from '@/engine/orders';
import { planHorizon, type HorizonPlan } from '@/engine/production-plan';
import { countsTowardCapital } from '@/engine/equipment';
import { extendedCost, lineInForceOn, loanPrincipal } from '@/engine/fixed-costs';
import { libraryLabel } from '@/engine/standards';
import { laborForDay } from '@/engine';
import { splitLoadedLaborCents } from '@/engine/comp';
import { INVOICED_CHANNELS, PAID_AT_ORDER_CHANNELS } from '@/data/working-capital';
import type { SubscriberDef } from '@/data/subscribers';

// ── Documents the actuals have no shape for yet ─────────────────────────────

/** A purchase order the plan raises: one per supplier per production day. */
export interface PlanPurchaseOrderDoc {
  id: string;
  orderedOn: string;
  expectedOn: string;
  supplierId: string | null;
  supplierName: string;
  lines: { input: string; qty: number; unit: 'lb' | 'each'; unitPriceCents: number; cases: number; packSize: number }[];
}

export interface TimelineDocuments {
  orders: BookOrder[];
  purchaseOrders: PlanPurchaseOrderDoc[];
  receipts: ReceiptDoc[];
  supplierBills: SupplierBillDoc[];
  supplierPayments: SupplierPaymentDoc[];
  sowings: SowingRecordDoc[];
  distributions: DistributionDoc[];
  invoices: InvoiceDoc[];
  subscriberPayments: SubscriberPaymentDoc[];
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
  | 'no_subscriber_terms'
  | 'paid_at_order_deposits'
  | 'distribution_cost_payment_timing'
  | 'no_supplier'
  | 'no_supplier_terms'
  | 'fixed_cost_payment_timing'
  | 'unfilled_units'
  | 'no_grow_unit'
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
  orderedUnits: number;
  distributedUnits: number;
  producedUnits: number;
  sowings: number;
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
   * Normal capacity on the plan's own production (§4 N4b): units produced
   * over the horizon, a year's worth, net of planned downtime.
   */
  normalCapacity: { producedUnits: number; perYear: number; plannedDowntimeRate: number; netPerYear: number };
  gaps: TimelineGap[];
}

export interface TimelineInput {
  /** The forecast, resolved: its overlay applied to the definitions. */
  inputs: ResolvedInputs;
  /** Years from the start date. Absent = the forecast's own choice, one year unless expanded to two or three. */
  horizonYears?: 1 | 2 | 3;
}

const cents = (dollars: number) => Math.round(dollars * 100);
const receiptUnit = (unit: string): 'lb' | 'each' => (unit === 'each' ? 'each' : 'lb');

/** The last day of an n-year window starting on `from`. */
export function horizonEnd(from: string, years: number): string {
  return isoAddDays(addMonths(from, 12 * years), -1);
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
  const channelPriceCents = Object.fromEntries(inputs.phases.map((p) => [p.phase, cents(p.pricePerUnit)]));
  const growPlanNames = Object.fromEntries(inputs.growPlans.map((r) => [r.code, r.name]));
  const orders = orderBook({ pickupPoints: inputs.demand.pickupPoints, subscribers: inputs.subscribers, orders: [], from, to, channelPriceCents, growPlanNames, closures: inputs.closures });

  // ── Production ────────────────────────────────────────────────────────────
  const assumptions = inputs.assumptions;
  const unitFactorByChannel = Object.fromEntries(inputs.phaseProfiles.map((p) => [p.phase, p.unitFactor.value]));
  const horizon = planHorizon({
    from,
    to,
    book: orders,
    growPlans: inputs.growPlans,
    capacityInputs: inputs.capacityInputs,
    assumptions,
    growPlanAssumptions: inputs.growPlanAssumptions,
    unitFactorByChannel,
    openingLots: [],
    channels: inputs.phases.map((p) => p.phase),
    closures: inputs.closures,
  });
  const noUnit = horizon.productionDays.reduce((n, d) => n + d.runs.filter((r) => r.net > 0 && r.sowingSize === 0).length, 0);
  if (noUnit > 0) gap('no_grow_unit', 'Orders for plans no grow unit in this forecast takes: nothing is sown for them, and those orders are unfilled.', noUnit);
  const undated = inputs.datedEquipment.filter((l) => l.inServiceBasis === 'undated' && l.qty > 0);
  if (undated.length > 0) gap('undated_equipment', 'Planned Phase 2 and 3 equipment with no in-service date in this forecast: not in service and not bought on any date.', undated.length);

  // ── Sowing records at standard ─────────────────────────────────────────────
  const shrink = assumptions.yield.shrinkAllowance.value;
  const sowings: SowingRecordDoc[] = [];
  const laborCostOn = new Map<string, number>();
  const laborHoursOn = new Map<string, number>();
  // A sowing record is one plan's sowings on one sow day: one sow, one lot.
  for (const day of horizon.productionDays) {
    let seq = 0;
    for (const run of day.runs) {
      if (run.produced <= 0) continue;
      const growPlan = inputs.growPlans.find((r) => r.code === run.growPlanCode);
      if (!growPlan) continue;
      const a = assumptionsFor(inputs, growPlan.code);
      seq += 1;
      const labor = laborForDay(run.sowingsScheduled, run.produced, a);
      const prefill = standardSowingRecordPrefill(day.productionDate, seq, run.produced, growPlan, shrink, libraryLabel(growPlan.code));
      sowings.push({
        ...prefill,
        id: `PLAN-sowing-${day.productionDate}-${seq}`,
        sowingsRun: run.sowingsScheduled,
        actualLaborHours: labor.totalLaborHours,
        actualLaborRate: a.labor.blendedLoadedWage.value,
        closedBy: 'plan',
        closedAt: day.productionDate,
      });
      laborCostOn.set(day.productionDate, (laborCostOn.get(day.productionDate) ?? 0) + run.laborCost);
      laborHoursOn.set(day.productionDate, (laborHoursOn.get(day.productionDate) ?? 0) + run.laborHours);
    }
  }

  // ── Distributions at the share each grow plan was filled ────────────────────────
  const fillOn = new Map<string, Map<string, number>>();
  for (const d of horizon.distributionDays) {
    fillOn.set(d.date, new Map(d.byGrowPlan.map((r) => [r.growPlanCode, r.orderedBase > 0 ? r.filledBase / r.orderedBase : 1])));
  }
  const distributions: DistributionDoc[] = [];
  let unfilledUnits = 0;
  const seqByDate = new Map<string, number>();
  for (const o of orders) {
    const share = fillOn.get(o.orderDate)?.get(o.growPlanCode) ?? 0;
    const units = o.units * share;
    unfilledUnits += o.units - units;
    if (units <= 0) continue;
    const n = (seqByDate.get(o.orderDate) ?? 0) + 1;
    seqByDate.set(o.orderDate, n);
    const id = `PLAN-DLV-${o.orderDate}-${n}`;
    distributions.push({
      id,
      distributedOn: o.orderDate,
      phase: o.channel,
      pickupPointId: o.distributionPickupPointId,
      pickupPointName: o.pickupPointName,
      units,
      pricePerUnitCents: o.pricePerUnitCents,
      lotCodes: [],
      distributedBy: null,
      subscriberId: o.subscriberId,
      invoiceId: null,
      growPlanCode: o.growPlanCode,
      notes: `${o.subscriberName} · ${o.growPlanCode} · ${o.priceBasis === 'own-use' ? 'own use' : o.priceBasis === 'contract' ? 'contracted price' : 'channel price'}`,
    });
  }
  if (unfilledUnits > 1e-6) gap('unfilled_units', 'Units ordered that no grow unit had room to sow in time: not distributed and not invoiced.', Math.round(unfilledUnits));

  // ── Purchasing: whole cases net of what rounding left on hand ─────────────
  const supplierOf = new Map<string, string | null>();
  for (const [key, price] of Object.entries(inputs.inputPrices)) {
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
      lines.push({ input: l.name, qty, unit: receiptUnit(l.unit), unitPriceCents: Math.round(l.unitCost * 100), cases, packSize: l.packSize });
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
        input: l.input,
        qty: l.qty,
        unit: l.unit,
        lotCode: `PLAN-${date}-${l.input}`,
        unitPriceCents: l.unitPriceCents,
        condition: 'accepted',
        poQty: l.qty,
        poUnitPriceCents: l.unitPriceCents,
      }));
      const receiptId = `PLAN-RCPT-${date}-${n}`;
      const totalCents = receiptLines.reduce((t, l) => t + Math.round(l.qty * l.unitPriceCents), 0);
      receipts.push({ id: receiptId, poId, supplierId, supplierName, receivedOn: date, invoiceNumber: null, invoiceTotalCents: totalCents, lines: receiptLines, receivedBy: 'plan', notes: null });
      // No supplier linked, or no terms on file: billed on receipt and paid that day, named.
      if (!supplierId) noSupplierReceipts += 1;
      const onFile = supplierId ? inputs.supplierTerms[supplierId] : undefined;
      if (supplierId && !onFile) noTermsReceipts += 1;
      const terms = onFile ?? 'due_on_receipt';
      const billId = `PLAN-SBILL-${date}-${n}`;
      supplierBills.push({ id: billId, supplierId, supplierName, billNumber: billId, billDate: date, paymentTerms: terms, receiptIds: [receiptId], lines: lines.map((l) => ({ input: l.input, qty: l.qty, unit: l.unit, unitPriceCents: l.unitPriceCents })), notes: onFile ? null : 'No payment terms on file: settled on the bill date.' });
      const paidOn = dueOn(date, terms);
      if (paidOn && paidOn <= to) {
        supplierPayments.push({ id: `PLAN-SPAY-${date}-${n}`, supplierId, supplierName, paidOn, amountCents: totalCents, method: null, reference: billId, applications: [{ documentId: billId, amountCents: totalCents }], notes: null });
      }
    }
  }
  if (noSupplierReceipts > 0) gap('no_supplier', 'Receipts for inputs with no supplier linked: received at the grow plan line price, billed on receipt and paid the same day.', noSupplierReceipts);
  if (noTermsReceipts > 0) gap('no_supplier_terms', 'Receipts from a supplier with no payment terms on file: billed on receipt and paid the same day.', noTermsReceipts);

  // ── Invoices and collections ──────────────────────────────────────────────
  const subscriberById = new Map<string, SubscriberDef>(inputs.subscribers.map((c) => [c.id, c]));
  const invoices: InvoiceDoc[] = [];
  const subscriberPayments: SubscriberPaymentDoc[] = [];
  const groups = new Map<string, DistributionDoc[]>();
  let paidAtOrder = 0;
  for (const d of distributions) {
    if (PAID_AT_ORDER_CHANNELS.includes(d.phase)) {
      paidAtOrder += 1;
      continue;
    }
    if (!INVOICED_CHANNELS.includes(d.phase) || !d.subscriberId || subscriberById.get(d.subscriberId)?.ownUse === true) continue;
    const key = `${d.subscriberId}|${periodOf(d.distributedOn)}`;
    const arr = groups.get(key) ?? [];
    arr.push(d);
    groups.set(key, arr);
  }
  // Retail and wholesale: paid at order; the marketplace remittance, net of its commission, is taken as
  // deposited on the distribution date, named.
  const processorDeposits: ProcessorDepositDoc[] = [];
  const remitByDate = new Map<string, number>();
  for (const d of distributions) {
    if (!PAID_AT_ORDER_CHANNELS.includes(d.phase)) continue;
    const revenue = Math.round(d.units * d.pricePerUnitCents);
    const commission = d.phase === 3 ? Math.round(revenue * CHANNEL_COMMISSION_PHASE3) : 0;
    remitByDate.set(d.distributedOn, (remitByDate.get(d.distributedOn) ?? 0) + revenue - commission);
  }
  for (const [date, amountCents] of [...remitByDate].sort(([a], [b]) => a.localeCompare(b))) {
    if (amountCents !== 0) processorDeposits.push({ id: `PLAN-DEPOSIT-${date}`, depositedOn: date, amountCents, notes: 'No remittance terms on file: deposited on the distribution date.' });
  }
  if (paidAtOrder > 0) gap('paid_at_order_deposits', 'Retail and wholesale orders are paid at the time of ordering; with no marketplace remittance terms on file, the remittance net of commission is deposited on the distribution date.', paidAtOrder);

  let noTermsInvoices = 0;
  const invoiceSeq = new Map<string, number>();
  for (const key of [...groups.keys()].sort((a, b) => a.split('|')[1]!.localeCompare(b.split('|')[1]!) || a.localeCompare(b))) {
    const ds = groups.get(key)!;
    const [subscriberId, period] = key.split('|') as [string, string];
    const subscriber = subscriberById.get(subscriberId);
    const openedOn = ds.reduce((m, d) => (d.distributedOn < m ? d.distributedOn : m), ds[0]!.distributedOn);
    const seq = (invoiceSeq.get(openedOn) ?? 0) + 1;
    invoiceSeq.set(openedOn, seq);
    const issuedOn = periodEnd(period);
    const terms = subscriber?.paymentTerms ?? null;
    // No terms on file: collected on the issue date, named.
    const due = dueOn(issuedOn, terms ?? 'due_on_receipt');
    const id = `PLAN-INV-${period}-${subscriberId}`;
    invoices.push({ id, invoiceNumber: invoiceNumberFor(openedOn, seq), subscriberId, subscriberName: subscriber?.name ?? subscriberId, period, status: 'issued', openedOn, paymentTerms: terms, issuedOn, dueOn: due, issuedBy: 'plan', notes: terms ? null : 'No payment terms on file: collected on the issue date.' });
    for (const d of ds) d.invoiceId = id;
    if (!terms) noTermsInvoices += 1;
    if (!due || due > to) continue;
    const amountCents = ds.reduce((t, d) => t + Math.round(d.units * d.pricePerUnitCents), 0);
    subscriberPayments.push({ id: `PLAN-CPAY-${period}-${subscriberId}`, subscriberId, subscriberName: subscriber?.name ?? subscriberId, receivedOn: due, amountCents, method: null, reference: invoices.at(-1)!.invoiceNumber, applications: [{ documentId: id, amountCents }], notes: null });
  }
  if (noTermsInvoices > 0) gap('no_subscriber_terms', 'Invoices to subscribers with no payment terms on file: collected on the issue date.', noTermsInvoices);

  // ── Own-fleet distribution cost: accrued to payables at distribution; with no terms on
  //    file, paid on the distribution date, named.
  const distributionPerUnitCents = Math.round(assumptions.perUnit.distribution.value * 100);
  const distributionCostByDate = new Map<string, number>();
  for (const d of distributions) distributionCostByDate.set(d.distributedOn, (distributionCostByDate.get(d.distributedOn) ?? 0) + Math.round(d.units * distributionPerUnitCents));
  let distributionPayments = 0;
  for (const [date, amountCents] of [...distributionCostByDate].sort(([a], [b]) => a.localeCompare(b))) {
    if (amountCents <= 0) continue;
    supplierPayments.push({ id: `PLAN-DELIVERYPAY-${date}`, supplierId: null, supplierName: 'Own fleet', paidOn: date, amountCents, method: null, reference: null, applications: [], notes: 'Distribution cost accrued at distribution; no terms on file, paid on the distribution date.' });
    distributionPayments += 1;
  }
  if (distributionPayments > 0) gap('distribution_cost_payment_timing', 'Own-fleet distribution cost carries no payment terms: paid on each distribution date.', distributionPayments);

  // ── Pay periods at the sowing records' standard labor ──────────────────────
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
      staffingRef: 'plan',
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
    const yDistributions = distributions.filter((d) => inYear(d.distributedOn));
    years.push({
      year: y + 1,
      from: yFrom,
      to: yTo,
      orderedUnits: orders.filter((o) => inYear(o.orderDate)).reduce((s, o) => s + o.units, 0),
      distributedUnits: yDistributions.reduce((s, d) => s + d.units, 0),
      producedUnits: pDays.reduce((s, p) => s + p.totalProduced, 0),
      sowings: pDays.reduce((s, p) => s + p.runs.reduce((a, r) => a + r.sowingsScheduled, 0), 0),
      revenueCents: yDistributions.reduce((s, d) => s + Math.round(d.units * d.pricePerUnitCents), 0),
      loadedLaborCents: pDays.reduce((s, p) => s + cents(p.laborCost), 0),
    });
  }
  const producedUnits = horizon.totals.producedBase;
  const plannedDowntimeRate = assumptions.overhead.plannedMaintenanceDownRate.value;
  const perYear = producedUnits / horizonYears;

  return {
    from,
    to,
    horizonYears,
    horizon,
    documents: { orders, purchaseOrders, receipts, supplierBills, supplierPayments, sowings, distributions, invoices, subscriberPayments, payrollPeriods, bills, capitalPurchases, loanDraws, loanPayments, equityContributions, processorDeposits },
    years,
    normalCapacity: { producedUnits, perYear, plannedDowntimeRate, netPerYear: perYear * (1 - plannedDowntimeRate) },
    gaps: [...gaps.values()],
  };
}
