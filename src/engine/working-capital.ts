/**
 * MicroFarm — working capital, engine-side (Roadmap Phase K).
 *
 * Pure: no database, no ledger import. Payment terms and due dates, invoice
 * numbers, the loan amortisation schedule and the current unit of
 * long-term debt, receivable and payable balances, aging, days-to-collect and
 * days-to-pay, the three-way match of purchase order, receipt and bill, and
 * what a completed distribution route adds to which monthly invoice. Nothing here
 * computes a dollar from a typed total.
 */

import { PAYMENT_TERMS_DAYS, INVOICED_CHANNELS, type PaymentTerms, type SubscriberPaymentTerms } from '@/data/working-capital';
import { isoAddDays } from '@/engine/orders';
import { periodEnd, periodOf } from '@/engine/actuals';
import type { DistributionDoc, ReceiptDoc, ReceiptLine } from '@/engine/actuals';

// ── Dates ───────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Calendar days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** The same day `n` months later, clamped to the month's last day. */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Calendar days in the YYYY-MM period. */
export const daysInPeriod = (period: string): number => Number(periodEnd(period).slice(8, 10));

/** Calendar days in a year. */
export const daysInYear = (year: number): number => daysBetween(`${year}-01-01`, `${year + 1}-01-01`);

// ── Terms ───────────────────────────────────────────────────────────────────

export const termsDays = (terms: PaymentTerms | null | undefined): number | null => (terms ? PAYMENT_TERMS_DAYS[terms] : null);

/** The due date of a document dated `date` on `terms`; null when no terms are set. */
export function dueOn(date: string, terms: PaymentTerms | null | undefined): string | null {
  const days = termsDays(terms);
  return days === null ? null : isoAddDays(date, days);
}

// ── Document numbers ────────────────────────────────────────────────────────

/** `AMK-INV-YYYYMMDD-NN`, dated the day the invoice was opened. */
export function invoiceNumberFor(date: string, sequence: number): string {
  return `AMK-INV-${date.replaceAll('-', '')}-${String(sequence).padStart(2, '0')}`;
}

/** The next sequence number for invoices opened on `date`, given the numbers on file. */
export function nextInvoiceSequence(date: string, numbers: readonly string[]): number {
  const prefix = `AMK-INV-${date.replaceAll('-', '')}-`;
  const used = numbers.filter((n) => n.startsWith(prefix)).map((n) => Number(n.slice(prefix.length))).filter((n) => Number.isFinite(n));
  return (used.length ? Math.max(...used) : 0) + 1;
}

// ── Long-term debt ──────────────────────────────────────────────────────────

export interface DebtPayment {
  /** 1-based payment number. */
  n: number;
  /** The last day of the payment's month: the first payment falls in the month the loan starts. */
  date: string;
  payment: number;
  interest: number;
  principal: number;
  /** Principal outstanding after the payment. */
  balance: number;
}

/** Level monthly payment on an amortising loan. */
function levelPayment(principal: number, annualApr: number, months: number): number {
  const r = annualApr / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/**
 * The amortisation schedule of a loan starting `startDate`. Payments are
 * monthly at month end, the first in the month the loan starts — the
 * convention the forecast has always used (twelve payments in the first year).
 */
export function amortizationSchedule(principal: number, annualApr: number, termMonths: number, startDate: string): DebtPayment[] {
  if (principal <= 0 || termMonths <= 0) return [];
  const pay = levelPayment(principal, annualApr, termMonths);
  const r = annualApr / 12;
  const rows: DebtPayment[] = [];
  let balance = principal;
  for (let n = 1; n <= termMonths; n++) {
    const interest = balance * r;
    const principalPart = n === termMonths ? balance : pay - interest;
    balance -= principalPart;
    rows.push({ n, date: periodEnd(periodOf(addMonths(`${startDate.slice(0, 7)}-01`, n - 1))), payment: interest + principalPart, interest, principal: principalPart, balance: Math.max(0, balance) });
  }
  return rows;
}

/** Interest and principal paid on the schedule with a date inside [from, to]. */
export function debtServiceBetween(schedule: readonly DebtPayment[], from: string, to: string): { interest: number; principal: number } {
  let interest = 0;
  let principal = 0;
  for (const p of schedule) {
    if (p.date < from || p.date > to) continue;
    interest += p.interest;
    principal += p.principal;
  }
  return { interest, principal };
}

/**
 * The current unit of long-term debt at `asOf`: principal the schedules fall
 * due for in the twelve months after the date (ASC 470-10-45). A presentation
 * figure — no entry moves it.
 */
export function currentUnitOfDebt(schedules: readonly (readonly DebtPayment[])[], asOf: string): number {
  const until = addMonths(asOf, 12);
  let due = 0;
  for (const s of schedules) for (const p of s) if (p.date > asOf && p.date <= until) due += p.principal;
  return due;
}

// ── Aging ───────────────────────────────────────────────────────────────────

export type AgingBucket = 'not_due' | 'd0_30' | 'd31_60' | 'd61_90' | 'd90_plus' | 'no_terms';

export const AGING_BUCKETS: readonly AgingBucket[] = ['not_due', 'd0_30', 'd31_60', 'd61_90', 'd90_plus', 'no_terms'];

export const AGING_LABELS: Record<AgingBucket, string> = {
  not_due: 'Not yet due',
  d0_30: '0–30 days past due',
  d31_60: '31–60',
  d61_90: '61–90',
  d90_plus: '90+',
  no_terms: 'No terms on file',
};

/** The bucket for an open item due `due` as of `asOf`, in calendar days past the due date. */
export function agingBucket(due: string | null, asOf: string): AgingBucket {
  if (due === null) return 'no_terms';
  const past = daysBetween(due, asOf);
  if (past <= 0) return 'not_due';
  if (past <= 30) return 'd0_30';
  if (past <= 60) return 'd31_60';
  if (past <= 90) return 'd61_90';
  return 'd90_plus';
}

export interface OpenItem {
  id: string;
  party: string;
  document: string;
  date: string;
  dueOn: string | null;
  amountCents: number;
  openCents: number;
}

export interface AgingRow {
  party: string;
  buckets: Record<AgingBucket, number>;
  totalCents: number;
}

export interface AgingReport {
  asOf: string;
  rows: AgingRow[];
  totals: Record<AgingBucket, number>;
  totalCents: number;
}

const emptyBuckets = (): Record<AgingBucket, number> => ({ not_due: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, no_terms: 0 });

/** Open items by party and bucket. Items with nothing open are left out. */
export function agingReport(items: readonly OpenItem[], asOf: string): AgingReport {
  const byParty = new Map<string, AgingRow>();
  const totals = emptyBuckets();
  for (const it of items) {
    if (it.openCents === 0 || it.date > asOf) continue;
    const b = agingBucket(it.dueOn, asOf);
    const row = byParty.get(it.party) ?? { party: it.party, buckets: emptyBuckets(), totalCents: 0 };
    row.buckets[b] += it.openCents;
    row.totalCents += it.openCents;
    totals[b] += it.openCents;
    byParty.set(it.party, row);
  }
  const rows = [...byParty.values()].sort((a, b) => b.totalCents - a.totalCents || a.party.localeCompare(b.party));
  return { asOf, rows, totals, totalCents: rows.reduce((s, r) => s + r.totalCents, 0) };
}

/**
 * Days outstanding: the period-end balance over the period's flow, times the
 * period's calendar days. Days-to-collect uses receivables over invoiced
 * revenue; days-to-pay uses trade payables over trade purchases. Null when the
 * period has no flow to divide by.
 */
export function daysOutstanding(balanceCents: number, flowCents: number, calendarDays: number): number | null {
  if (flowCents <= 0) return null;
  return (balanceCents / flowCents) * calendarDays;
}

// ── Subscriber invoices ───────────────────────────────────────────────────────

export type InvoiceStatus = 'open' | 'issued';

export interface InvoiceDoc {
  id: string;
  invoiceNumber: string;
  subscriberId: string;
  subscriberName: string;
  period: string;
  status: InvoiceStatus;
  openedOn: string;
  paymentTerms: SubscriberPaymentTerms | null;
  issuedOn: string | null;
  dueOn: string | null;
  issuedBy: string | null;
  notes: string | null;
}

export interface PaymentApplication {
  /** The invoice (subscriber payments) or the bill (supplier payments). */
  documentId: string;
  amountCents: number;
}

export interface SubscriberPaymentDoc {
  id: string;
  subscriberId: string;
  subscriberName: string;
  receivedOn: string;
  amountCents: number;
  method: string | null;
  reference: string | null;
  applications: PaymentApplication[];
  notes: string | null;
}

export interface InvoiceBalance {
  invoice: InvoiceDoc;
  distributions: DistributionDoc[];
  units: number;
  amountCents: number;
  paidCents: number;
  openCents: number;
  lastDistributedOn: string | null;
}

/** A distribution's revenue in cents, as the ledger posts it. */
export const distributionRevenueCents = (d: Pick<DistributionDoc, 'units' | 'pricePerUnitCents'>): number => Math.round(d.units * d.pricePerUnitCents);

/** Every invoice with the distributions that name it, what it bills, and what has been applied against it. */
export function invoiceBalances(invoices: readonly InvoiceDoc[], distributions: readonly DistributionDoc[], payments: readonly SubscriberPaymentDoc[], asOf?: string): InvoiceBalance[] {
  return invoices.map((invoice) => {
    const on = distributions.filter((d) => d.invoiceId === invoice.id).sort((a, b) => a.distributedOn.localeCompare(b.distributedOn));
    const amountCents = on.reduce((s, d) => s + distributionRevenueCents(d), 0);
    const paidCents = payments
      .filter((p) => asOf === undefined || p.receivedOn <= asOf)
      .flatMap((p) => p.applications)
      .filter((a) => a.documentId === invoice.id)
      .reduce((s, a) => s + a.amountCents, 0);
    return {
      invoice,
      distributions: on,
      units: on.reduce((s, d) => s + d.units, 0),
      amountCents,
      paidCents,
      openCents: amountCents - paidCents,
      lastDistributedOn: on.at(-1)?.distributedOn ?? null,
    };
  });
}

export interface RouteCompletionGroup {
  subscriberId: string;
  period: string;
  distributionIds: string[];
  units: number;
  amountCents: number;
}

export interface RouteCompletion {
  date: string;
  groups: RouteCompletionGroup[];
  /** Distributions on the date that no invoice can carry, and why. */
  skipped: { distributionId: string; reason: string }[];
}

/**
 * What completing the route on `date` adds to which monthly invoice: every
 * distribution on the date for an invoiced channel, with a subscriber on the record,
 * not yet on an invoice — for one subscriber or for all. Ghost-farm distributions
 * are paid at order and are never invoiced.
 */
/** Distributions of a date to add to invoices, by subscriber and month; the owner's own trays (`ownUseIds`) are never invoiced. */
export function routeCompletion(distributions: readonly DistributionDoc[], date: string, subscriberId: string | null = null, ownUseIds: ReadonlySet<string> = new Set()): RouteCompletion {
  const groups = new Map<string, RouteCompletionGroup>();
  const skipped: RouteCompletion['skipped'] = [];
  for (const d of distributions) {
    if (d.distributedOn !== date) continue;
    if (subscriberId !== null && d.subscriberId !== subscriberId) continue;
    if (d.invoiceId) continue;
    if (!INVOICED_CHANNELS.includes(d.phase)) continue;
    if (d.subscriberId && ownUseIds.has(d.subscriberId)) continue;
    if (!d.subscriberId) {
      skipped.push({ distributionId: d.id, reason: 'The distribution record names no subscriber, so no invoice can carry it.' });
      continue;
    }
    const key = `${d.subscriberId}|${periodOf(d.distributedOn)}`;
    const g = groups.get(key) ?? { subscriberId: d.subscriberId, period: periodOf(d.distributedOn), distributionIds: [], units: 0, amountCents: 0 };
    g.distributionIds.push(d.id);
    g.units += d.units;
    g.amountCents += distributionRevenueCents(d);
    groups.set(key, g);
  }
  return { date, groups: [...groups.values()], skipped };
}

// ── Supplier bills and the three-way match ──────────────────────────────────

export interface BillLine {
  input: string;
  qty: number;
  unit: 'lb' | 'each';
  unitPriceCents: number;
}

export interface SupplierBillDoc {
  id: string;
  supplierId: string | null;
  supplierName: string;
  billNumber: string;
  billDate: string;
  paymentTerms: PaymentTerms;
  receiptIds: string[];
  lines: BillLine[];
  notes: string | null;
}

export interface SupplierPaymentDoc {
  id: string;
  supplierId: string | null;
  supplierName: string;
  paidOn: string;
  amountCents: number;
  method: string | null;
  reference: string | null;
  applications: PaymentApplication[];
  notes: string | null;
}

/** An ordered line, for the match. */
export interface OrderedLine {
  input: string;
  qty: number;
  unit: string;
  unitPriceCents: number;
}

export interface MatchLine {
  input: string;
  unit: string;
  orderedQty: number | null;
  orderedCents: number | null;
  receivedQty: number;
  receivedCents: number;
  billedQty: number;
  billedCents: number;
}

export interface ThreeWayMatch {
  status: 'matched' | 'mismatched';
  lines: MatchLine[];
  issues: string[];
  receivedCents: number;
  billedCents: number;
  /** Billed − received, cents. Zero on a matched bill. */
  differenceCents: number;
}

const QTY_EPS = 0.0005;
const accepted = (l: ReceiptLine) => l.condition !== 'rejected';
export const receiptLineCents = (l: Pick<ReceiptLine, 'qty' | 'unitPriceCents'>): number => Math.round(l.qty * l.unitPriceCents);

/** The received value of a receipt: accepted lines at the price received. */
export const receiptValueCents = (r: Pick<ReceiptDoc, 'lines'>): number => r.lines.filter(accepted).reduce((s, l) => s + receiptLineCents(l), 0);

export const billTotalCents = (b: Pick<SupplierBillDoc, 'lines'>): number => b.lines.reduce((s, l) => s + receiptLineCents(l), 0);

/**
 * The three-way match. Receiving has no tolerance: what
 * came off the truck is recorded exactly, and a quantity or price that differs
 * from the purchase order carries an override reason on the receipt. The bill
 * must then equal what was received, input by input, in quantity and
 * in value. Every difference is an issue; a bill with any issue is mismatched,
 * flagged, and not paid until it is rectified.
 */
export function threeWayMatch(
  bill: Pick<SupplierBillDoc, 'lines'>,
  receipts: readonly ReceiptDoc[],
  purchaseOrders: readonly { id: string; poNumber?: string; lines: readonly OrderedLine[] }[],
): ThreeWayMatch {
  const issues: string[] = [];
  const key = (input: string, unit: string) => `${input}|${unit}`;
  const lines = new Map<string, MatchLine>();
  const row = (input: string, unit: string): MatchLine => {
    const k = key(input, unit);
    const existing = lines.get(k);
    if (existing) return existing;
    const created: MatchLine = { input, unit, orderedQty: null, orderedCents: null, receivedQty: 0, receivedCents: 0, billedQty: 0, billedCents: 0 };
    lines.set(k, created);
    return created;
  };

  if (receipts.length === 0) issues.push('The bill names no receipt.');

  // Purchase order against receipt: a difference needs an override reason.
  for (const r of receipts) {
    const po = r.poId ? purchaseOrders.find((p) => p.id === r.poId) : undefined;
    for (const l of r.lines) {
      if (!accepted(l)) continue;
      const m = row(l.input, l.unit);
      m.receivedQty += l.qty;
      m.receivedCents += receiptLineCents(l);
      if (!r.poId) continue;
      const ordered = po?.lines.find((o) => o.input === l.input);
      if (ordered) {
        m.orderedQty = (m.orderedQty ?? 0) + (l.poQty ?? ordered.qty);
        m.orderedCents = (m.orderedCents ?? 0) + Math.round((l.poQty ?? ordered.qty) * (l.poUnitPriceCents ?? ordered.unitPriceCents));
      }
      const reason = (l.overrideReason ?? '').trim();
      if (reason) continue;
      const poLabel = po?.poNumber ?? 'the purchase order';
      if (!ordered && !(l.poQty !== undefined && l.poQty !== null)) {
        issues.push(`${l.input}: received on ${r.receivedOn} but not on ${poLabel}, with no override reason.`);
        continue;
      }
      const orderedQty = l.poQty ?? ordered?.qty ?? 0;
      const orderedPrice = l.poUnitPriceCents ?? ordered?.unitPriceCents ?? 0;
      if (Math.abs(l.qty - orderedQty) > QTY_EPS) issues.push(`${l.input}: received ${l.qty} ${l.unit} against ${orderedQty} ordered on ${poLabel}, with no override reason.`);
      if (l.unitPriceCents !== orderedPrice) issues.push(`${l.input}: received at $${(l.unitPriceCents / 100).toFixed(2)} against $${(orderedPrice / 100).toFixed(2)} on ${poLabel}, with no override reason.`);
    }
  }

  // Receipt against bill: exact, in quantity and value.
  for (const l of bill.lines) {
    const m = row(l.input, l.unit);
    m.billedQty += l.qty;
    m.billedCents += receiptLineCents(l);
  }
  for (const m of lines.values()) {
    if (m.billedQty === 0 && m.billedCents === 0 && m.receivedQty > 0) {
      issues.push(`${m.input}: received ${round3(m.receivedQty)} ${m.unit} and not on the bill.`);
      continue;
    }
    if (m.receivedQty === 0 && m.receivedCents === 0 && m.billedQty > 0) {
      issues.push(`${m.input}: billed ${round3(m.billedQty)} ${m.unit} and not received on the receipts the bill names.`);
      continue;
    }
    if (Math.abs(m.billedQty - m.receivedQty) > QTY_EPS) issues.push(`${m.input}: billed ${round3(m.billedQty)} ${m.unit} against ${round3(m.receivedQty)} received.`);
    else if (m.billedCents !== m.receivedCents) issues.push(`${m.input}: billed $${(m.billedCents / 100).toFixed(2)} against $${(m.receivedCents / 100).toFixed(2)} received.`);
  }

  const receivedCents = receipts.reduce((s, r) => s + receiptValueCents(r), 0);
  const billedCents = billTotalCents(bill);
  return {
    status: issues.length === 0 ? 'matched' : 'mismatched',
    lines: [...lines.values()].sort((a, b) => a.input.localeCompare(b.input)),
    issues,
    receivedCents,
    billedCents,
    differenceCents: billedCents - receivedCents,
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export interface BillBalance {
  bill: SupplierBillDoc;
  match: ThreeWayMatch;
  dueOn: string;
  amountCents: number;
  paidCents: number;
  openCents: number;
}

export function billBalances(
  bills: readonly SupplierBillDoc[],
  receipts: readonly ReceiptDoc[],
  purchaseOrders: readonly { id: string; poNumber?: string; lines: readonly OrderedLine[] }[],
  payments: readonly SupplierPaymentDoc[],
  asOf?: string,
): BillBalance[] {
  return bills.map((bill) => {
    const match = threeWayMatch(bill, receipts.filter((r) => bill.receiptIds.includes(r.id)), purchaseOrders);
    const amountCents = billTotalCents(bill);
    const paidCents = payments
      .filter((p) => asOf === undefined || p.paidOn <= asOf)
      .flatMap((p) => p.applications)
      .filter((a) => a.documentId === bill.id)
      .reduce((s, a) => s + a.amountCents, 0);
    return { bill, match, dueOn: isoAddDays(bill.billDate, PAYMENT_TERMS_DAYS[bill.paymentTerms]), amountCents, paidCents, openCents: amountCents - paidCents };
  });
}

/** Receipts with accepted lines that no bill names yet — goods received, not invoiced. */
export function unbilledReceipts(receipts: readonly ReceiptDoc[], bills: readonly SupplierBillDoc[]): ReceiptDoc[] {
  const billed = new Set(bills.flatMap((b) => b.receiptIds));
  return receipts.filter((r) => !billed.has(r.id) && receiptValueCents(r) > 0);
}

/**
 * Why a payment cannot be applied to a bill, or null when it can: a bill that
 * does not match is not paid until rectified, and a
 * payment never applies more than is open.
 */
export function billPaymentRefusal(balance: BillBalance, amountCents: number): string | null {
  if (balance.match.status === 'mismatched') return `Bill ${balance.bill.billNumber} does not match its purchase order and receipts (${balance.match.issues.length} issue${balance.match.issues.length === 1 ? '' : 's'}); it is not paid until rectified.`;
  if (amountCents > balance.openCents) return `Bill ${balance.bill.billNumber} has $${(balance.openCents / 100).toFixed(2)} open; $${(amountCents / 100).toFixed(2)} is more than that.`;
  return null;
}

// ── The forecast year's trade balances ──────────────────────────────────────

/**
 * The share of a year's revenue still receivable at year end when the year's
 * distributions are invoiced at each month's end and collected on the due date:
 * the months whose invoice falls due after the year ends. Revenue is carried
 * evenly by month, the forecast month's basis.
 */
export function monthlyInvoiceOutstandingShare(year: number, terms: PaymentTerms): number {
  const yearEnd = `${year}-12-31`;
  let months = 0;
  for (let m = 1; m <= 12; m++) {
    const invoiced = periodEnd(`${year}-${String(m).padStart(2, '0')}`);
    if (isoAddDays(invoiced, PAYMENT_TERMS_DAYS[terms]) > yearEnd) months++;
  }
  return months / 12;
}

/**
 * The share of a year's purchases still payable at year end when bills are
 * dated on receipt, receipts run evenly through the year, and each bill is
 * paid on its due date.
 */
export function dailyBillOutstandingShare(year: number, terms: PaymentTerms): number {
  const days = daysInYear(year);
  return Math.min(PAYMENT_TERMS_DAYS[terms], days) / days;
}
