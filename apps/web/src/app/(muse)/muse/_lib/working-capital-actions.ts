'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  museCustomers,
  museDeliveries,
  museInvoices,
  museCustomerPayments,
  museSupplierBills,
  museSupplierPayments,
  museSupplierTerms,
  museOpeningBalances,
  museReceipts,
} from '@ct/db';
import { db } from '@/lib/db';
import { accessRefusal, requireMuseOperator, requireMuseSuperAdmin } from './access';
import { refuseIfLocked } from './periods';
import { appendPosting } from './posting-log';
import { loadActuals } from './actuals';
import { listPurchaseOrders } from './supplier-catalog';
import { periodOf } from '../_engine/actuals';
import {
  billBalances,
  billPaymentRefusal,
  dueOn,
  invoiceBalances,
  invoiceNumberFor,
  nextInvoiceSequence,
  routeCompletion,
  threeWayMatch,
  type BillLine,
} from '../_engine/working-capital';
import { isCustomerPaymentTerms, isPaymentTerms } from '../_data/working-capital';

/**
 * Impact OS — working capital, writes (Roadmap Phase K).
 *
 * Invoices, bills and payments are recorded by super admins and operators
 * (Robert, 2026-09-14) — `requireMuseOperator`, which super admins pass. The
 * opening balance and the removal of a record stay super admin. Nothing posts
 * into a locked period, and every posting and removal is an entry on the
 * hash-chained trail written in the same transaction as the record.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const cents = z.number().int();

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });
const today = () => new Date().toISOString().slice(0, 10);

/** Serialises invoice numbering and route completion. */
const INVOICE_LOCK_KEY = 774_100_157;

// ── Payment terms ───────────────────────────────────────────────────────────

const SupplierTermsInput = z.object({
  supplierId: z.string().trim().min(1).max(120),
  supplierName: z.string().max(200).nullable().default(null),
  paymentTerms: z.enum(['due_on_receipt', 'net_15', 'net_30', 'net_60', 'net_90']),
});

/** Set a supplier's payment terms. There is no default; a supplier with none has none. */
export async function setSupplierTerms(input: unknown): Promise<Result> {
  const parsed = SupplierTermsInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  await db.transaction(async (tx) => {
    await tx
      .insert(museSupplierTerms)
      .values({ supplierId: d.supplierId, supplierName: d.supplierName, paymentTerms: d.paymentTerms, updatedBy: access.userId })
      .onConflictDoUpdate({ target: museSupplierTerms.supplierId, set: { supplierName: d.supplierName, paymentTerms: d.paymentTerms, updatedBy: access.userId, updatedAt: new Date() } });
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'set_payment_terms', recordKind: 'supplier_terms', recordId: d.supplierId, period: periodOf(today()), detail: { supplierName: d.supplierName, paymentTerms: d.paymentTerms } });
  });
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

// ── Opening balance (K6) ────────────────────────────────────────────────────

const OpeningInput = z.object({
  asOf: isoDate,
  ownerEquityCents: cents.min(0),
  fixedAssetsCents: cents.min(0).default(0),
  longTermDebtCents: cents.min(0).default(0),
  notes: z.string().max(2000).nullable().default(null),
});

/** Record the opening balance sheet of the actuals. One is kept; a second is refused. */
export async function recordOpeningBalance(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = OpeningInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const existing = await db.select({ id: museOpeningBalances.id }).from(museOpeningBalances).limit(1);
  if (existing[0]) return { ok: false, error: 'An opening balance is already on file; remove it to record another.' };
  const locked = await refuseIfLocked(d.asOf);
  if (locked) return { ok: false, error: locked };
  const id = await db.transaction(async (tx) => {
    const rows = await tx.insert(museOpeningBalances).values({ ...d, createdBy: access.userId }).returning({ id: museOpeningBalances.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_opening_balance', recordKind: 'opening_balance', recordId: row.id, period: periodOf(d.asOf), detail: { ...d } });
    return row?.id ?? null;
  });
  if (!id) return { ok: false, error: 'Failed to record the opening balance.' };
  revalidatePath('/muse', 'layout');
  return { ok: true, id };
}

// ── Routes and invoices (K1) ────────────────────────────────────────────────

const RouteInput = z.object({
  date: isoDate,
  customerId: z.string().uuid().nullable().default(null),
});

/**
 * Complete the route on a date: every delivery on it for School lunches or
 * Corporate catering, not yet on an invoice, is added to its customer's open
 * invoice for the month — opened now if there is none (Robert, 2026-09-14).
 */
export async function completeRoute(input: unknown): Promise<Result<{ invoices: number; deliveries: number; skipped: string[] }>> {
  const parsed = RouteInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const locked = await refuseIfLocked(d.date);
  if (locked) return { ok: false, error: locked };

  const bundle = await loadActuals();
  const plan = routeCompletion(bundle.deliveries, d.date, d.customerId);
  if (plan.groups.length === 0) {
    return { ok: false, error: plan.skipped.length ? plan.skipped.map((s) => s.reason).join(' ') : `No delivery on ${d.date} is waiting to be invoiced.` };
  }
  const customerIds = [...new Set(plan.groups.map((g) => g.customerId))];
  const customers = await db.select({ id: museCustomers.id, name: museCustomers.name }).from(museCustomers).where(inArray(museCustomers.id, customerIds));
  const nameOf = new Map(customers.map((c) => [c.id, c.name]));

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${INVOICE_LOCK_KEY})`);
    const numbers = (await tx.select({ n: museInvoices.invoiceNumber }).from(museInvoices)).map((r) => r.n);
    const now = new Date();
    for (const g of plan.groups) {
      const open = await tx
        .select({ id: museInvoices.id, invoiceNumber: museInvoices.invoiceNumber })
        .from(museInvoices)
        .where(and(eq(museInvoices.customerId, g.customerId), eq(museInvoices.period, g.period), eq(museInvoices.status, 'open')))
        .limit(1);
      let invoiceId = open[0]?.id;
      let invoiceNumber = open[0]?.invoiceNumber;
      if (!invoiceId) {
        invoiceNumber = invoiceNumberFor(d.date, nextInvoiceSequence(d.date, numbers));
        numbers.push(invoiceNumber);
        const created = await tx
          .insert(museInvoices)
          .values({ invoiceNumber, customerId: g.customerId, customerName: nameOf.get(g.customerId) ?? 'Customer', period: g.period, status: 'open', openedOn: d.date, createdBy: access.userId })
          .returning({ id: museInvoices.id });
        invoiceId = created[0]?.id;
      }
      if (!invoiceId) throw new Error('The invoice was not created.');
      await tx.update(museDeliveries).set({ invoiceId, routeCompletedAt: now }).where(inArray(museDeliveries.id, g.deliveryIds));
      await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'complete_route', recordKind: 'invoice', recordId: invoiceId, period: g.period, detail: { invoiceNumber, date: d.date, deliveryIds: g.deliveryIds, meals: g.meals, amountCents: g.amountCents } });
    }
  });
  revalidatePath('/muse', 'layout');
  return { ok: true, invoices: plan.groups.length, deliveries: plan.groups.reduce((s, g) => s + g.deliveryIds.length, 0), skipped: plan.skipped.map((s) => s.reason) };
}

const IssueInput = z.object({ invoiceId: z.string().uuid(), issuedOn: isoDate });

/** Issue an open invoice with the customer's terms and its due date. Refused without terms on file. */
export async function issueInvoice(input: unknown): Promise<Result<{ dueOn: string }>> {
  const parsed = IssueInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const inv = (await db.select().from(museInvoices).where(eq(museInvoices.id, d.invoiceId)).limit(1))[0];
  if (!inv) return { ok: false, error: 'Invoice not found.' };
  if (inv.status !== 'open') return { ok: false, error: `${inv.invoiceNumber} is already issued.` };
  const customer = (await db.select({ paymentTerms: museCustomers.paymentTerms, name: museCustomers.name }).from(museCustomers).where(eq(museCustomers.id, inv.customerId)).limit(1))[0];
  if (!customer || !isCustomerPaymentTerms(customer.paymentTerms)) return { ok: false, error: `${customer?.name ?? 'The customer'} has no payment terms on file; an invoice is issued with the customer's terms.` };
  const lines = await db.select({ deliveredOn: museDeliveries.deliveredOn }).from(museDeliveries).where(eq(museDeliveries.invoiceId, inv.id));
  if (lines.length === 0) return { ok: false, error: `${inv.invoiceNumber} carries no deliveries.` };
  const last = lines.map((l) => String(l.deliveredOn)).sort().at(-1)!;
  if (d.issuedOn < last) return { ok: false, error: `${inv.invoiceNumber} carries a delivery on ${last}; it is issued on or after that date.` };
  const locked = await refuseIfLocked(d.issuedOn);
  if (locked) return { ok: false, error: locked };
  const due = dueOn(d.issuedOn, customer.paymentTerms)!;
  await db.transaction(async (tx) => {
    await tx.update(museInvoices).set({ status: 'issued', paymentTerms: customer.paymentTerms, issuedOn: d.issuedOn, dueOn: due, issuedBy: access.email ?? access.userId, updatedAt: new Date() }).where(eq(museInvoices.id, inv.id));
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'issue_invoice', recordKind: 'invoice', recordId: inv.id, period: periodOf(d.issuedOn), detail: { invoiceNumber: inv.invoiceNumber, issuedOn: d.issuedOn, dueOn: due, paymentTerms: customer.paymentTerms } });
  });
  revalidatePath('/muse', 'layout');
  return { ok: true, dueOn: due };
}

// ── Customer payments (K3) ──────────────────────────────────────────────────

const Application = z.object({ documentId: z.string().uuid(), amountCents: cents.positive() });

const CustomerPaymentInput = z.object({
  customerId: z.string().uuid(),
  receivedOn: isoDate,
  amountCents: cents.positive('A payment is more than zero'),
  method: z.string().max(80).nullable().default(null),
  reference: z.string().max(120).nullable().default(null),
  applications: z.array(Application).default([]),
  notes: z.string().max(2000).nullable().default(null),
});

export async function recordCustomerPayment(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = CustomerPaymentInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const customer = (await db.select({ name: museCustomers.name }).from(museCustomers).where(eq(museCustomers.id, d.customerId)).limit(1))[0];
  if (!customer) return { ok: false, error: 'Customer not found.' };
  const applied = d.applications.reduce((s, a) => s + a.amountCents, 0);
  if (applied > d.amountCents) return { ok: false, error: 'The amounts applied are more than the payment.' };
  if (d.applications.length > 0) {
    const bundle = await loadActuals();
    const balances = invoiceBalances(bundle.invoices ?? [], bundle.deliveries, bundle.customerPayments ?? []);
    for (const a of d.applications) {
      const b = balances.find((x) => x.invoice.id === a.documentId);
      if (!b || b.invoice.customerId !== d.customerId) return { ok: false, error: 'An invoice applied to is not this customer’s.' };
      if (a.amountCents > b.openCents) return { ok: false, error: `${b.invoice.invoiceNumber} has $${(b.openCents / 100).toFixed(2)} open.` };
    }
  }
  const locked = await refuseIfLocked(d.receivedOn);
  if (locked) return { ok: false, error: locked };
  const id = await db.transaction(async (tx) => {
    const rows = await tx.insert(museCustomerPayments).values({ ...d, customerName: customer.name, createdBy: access.userId }).returning({ id: museCustomerPayments.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_customer_payment', recordKind: 'customer_payment', recordId: row.id, period: periodOf(d.receivedOn), detail: { customerName: customer.name, receivedOn: d.receivedOn, amountCents: d.amountCents, applications: d.applications, reference: d.reference } });
    return row?.id ?? null;
  });
  if (!id) return { ok: false, error: 'Failed to record the payment.' };
  revalidatePath('/muse', 'layout');
  return { ok: true, id };
}

// ── Supplier bills and the three-way match (K2) ─────────────────────────────

const BillLineSchema = z.object({
  ingredient: z.string().min(1).max(200),
  qty: z.number().min(0),
  unit: z.enum(['lb', 'each']),
  unitPriceCents: cents.min(0),
});

const SupplierBillInput = z.object({
  supplierId: z.string().max(120).nullable().default(null),
  supplierName: z.string().trim().min(1, 'Name the supplier').max(200),
  billNumber: z.string().trim().min(1, 'The supplier’s bill number').max(80),
  billDate: isoDate,
  receiptIds: z.array(z.string().uuid()).min(1, 'A bill is recorded against the receipts it covers'),
  lines: z.array(BillLineSchema).min(1, 'A bill needs at least one line'),
  notes: z.string().max(2000).nullable().default(null),
});

async function checkBill(d: z.infer<typeof SupplierBillInput>, billId: string | null): Promise<{ error: string } | { terms: string; status: 'matched' | 'mismatched'; issues: string[] }> {
  const receipts = await db.select({ id: museReceipts.id, supplierId: museReceipts.supplierId }).from(museReceipts).where(inArray(museReceipts.id, d.receiptIds));
  if (receipts.length !== d.receiptIds.length) return { error: 'A receipt named on the bill is not on file.' };
  if (d.supplierId && receipts.some((r) => r.supplierId && r.supplierId !== d.supplierId)) return { error: 'A receipt named on the bill is from a different supplier.' };
  const others = await db.select({ id: museSupplierBills.id, billNumber: museSupplierBills.billNumber, receiptIds: museSupplierBills.receiptIds }).from(museSupplierBills);
  for (const o of others) {
    if (o.id === billId) continue;
    const ids = Array.isArray(o.receiptIds) ? (o.receiptIds as string[]) : [];
    const clash = d.receiptIds.find((r) => ids.includes(r));
    if (clash) return { error: `A receipt on this bill is already on bill ${o.billNumber}.` };
  }
  let terms: string | null = null;
  if (d.supplierId) {
    const t = (await db.select({ paymentTerms: museSupplierTerms.paymentTerms }).from(museSupplierTerms).where(eq(museSupplierTerms.supplierId, d.supplierId)).limit(1))[0];
    terms = t?.paymentTerms ?? null;
  }
  if (!isPaymentTerms(terms)) return { error: `${d.supplierName} has no payment terms on file; a bill takes the supplier's terms. Terms are set on the supplier's page.` };
  const [bundle, pos] = await Promise.all([loadActuals(), listPurchaseOrders()]);
  const match = threeWayMatch(
    { lines: d.lines as BillLine[] },
    bundle.receipts.filter((r) => d.receiptIds.includes(r.id)),
    pos.map((p) => ({ id: p.id, poNumber: p.poNumber, lines: p.lines })),
  );
  return { terms, status: match.status, issues: match.issues };
}

/** Record a supplier's bill against its receipts. A mismatched bill is recorded, flagged, and not paid until rectified. */
export async function recordSupplierBill(input: unknown): Promise<Result<{ id: string; status: 'matched' | 'mismatched'; issues: string[] }>> {
  const parsed = SupplierBillInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const checked = await checkBill(d, null);
  if ('error' in checked) return { ok: false, error: checked.error };
  const locked = await refuseIfLocked(d.billDate);
  if (locked) return { ok: false, error: locked };
  const id = await db.transaction(async (tx) => {
    const rows = await tx.insert(museSupplierBills).values({ ...d, paymentTerms: checked.terms, createdBy: access.userId }).returning({ id: museSupplierBills.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_supplier_bill', recordKind: 'supplier_bill', recordId: row.id, period: periodOf(d.billDate), detail: { supplierName: d.supplierName, billNumber: d.billNumber, billDate: d.billDate, receiptIds: d.receiptIds, match: checked.status, issues: checked.issues } });
    return row?.id ?? null;
  });
  if (!id) return { ok: false, error: 'Failed to record the bill.' };
  revalidatePath('/muse', 'layout');
  return { ok: true, id, status: checked.status, issues: checked.issues };
}

/** Rectify a bill: replace its number, date, receipts and lines. Refused once a payment is applied to it. */
export async function updateSupplierBill(input: unknown): Promise<Result<{ status: 'matched' | 'mismatched'; issues: string[] }>> {
  const parsed = SupplierBillInput.extend({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...d } = parsed.data;
  const current = (await db.select({ billDate: museSupplierBills.billDate }).from(museSupplierBills).where(eq(museSupplierBills.id, id)).limit(1))[0];
  if (!current) return { ok: false, error: 'Bill not found.' };
  const payments = await db.select({ applications: museSupplierPayments.applications }).from(museSupplierPayments);
  if (payments.some((p) => Array.isArray(p.applications) && (p.applications as { documentId?: string }[]).some((a) => a.documentId === id))) {
    return { ok: false, error: 'A payment is applied to this bill; it is not edited.' };
  }
  const checked = await checkBill(d, id);
  if ('error' in checked) return { ok: false, error: checked.error };
  for (const date of [String(current.billDate), d.billDate]) {
    const locked = await refuseIfLocked(date);
    if (locked) return { ok: false, error: locked };
  }
  await db.transaction(async (tx) => {
    await tx.update(museSupplierBills).set({ ...d, paymentTerms: checked.terms, updatedAt: new Date() }).where(eq(museSupplierBills.id, id));
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_supplier_bill', recordKind: 'supplier_bill', recordId: id, period: periodOf(d.billDate), detail: { rectified: true, previousBillDate: String(current.billDate), billNumber: d.billNumber, billDate: d.billDate, receiptIds: d.receiptIds, match: checked.status, issues: checked.issues } });
  });
  revalidatePath('/muse', 'layout');
  return { ok: true, status: checked.status, issues: checked.issues };
}

// ── Supplier payments (K3) ──────────────────────────────────────────────────

const SupplierPaymentInput = z.object({
  supplierId: z.string().max(120).nullable().default(null),
  supplierName: z.string().trim().min(1).max(200),
  paidOn: isoDate,
  amountCents: cents.positive('A payment is more than zero'),
  method: z.string().max(80).nullable().default(null),
  reference: z.string().max(120).nullable().default(null),
  applications: z.array(Application).min(1, 'A supplier payment is applied to the bills it pays'),
  notes: z.string().max(2000).nullable().default(null),
});

/** Pay supplier bills. A bill that does not match its purchase order and receipts is refused. */
export async function recordSupplierPayment(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = SupplierPaymentInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const applied = d.applications.reduce((s, a) => s + a.amountCents, 0);
  if (applied !== d.amountCents) return { ok: false, error: 'The amounts applied to bills do not add up to the payment.' };
  const [bundle, pos] = await Promise.all([loadActuals(), listPurchaseOrders()]);
  const balances = billBalances(bundle.supplierBills ?? [], bundle.receipts, pos.map((p) => ({ id: p.id, poNumber: p.poNumber, lines: p.lines })), bundle.supplierPayments ?? []);
  for (const a of d.applications) {
    const b = balances.find((x) => x.bill.id === a.documentId);
    if (!b) return { ok: false, error: 'A bill applied to is not on file.' };
    if (d.supplierId && b.bill.supplierId && b.bill.supplierId !== d.supplierId) return { ok: false, error: `Bill ${b.bill.billNumber} is another supplier’s.` };
    const why = billPaymentRefusal(b, a.amountCents);
    if (why) return { ok: false, error: why };
  }
  const locked = await refuseIfLocked(d.paidOn);
  if (locked) return { ok: false, error: locked };
  const id = await db.transaction(async (tx) => {
    const rows = await tx.insert(museSupplierPayments).values({ ...d, createdBy: access.userId }).returning({ id: museSupplierPayments.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_supplier_payment', recordKind: 'supplier_payment', recordId: row.id, period: periodOf(d.paidOn), detail: { supplierName: d.supplierName, paidOn: d.paidOn, amountCents: d.amountCents, applications: d.applications, reference: d.reference } });
    return row?.id ?? null;
  });
  if (!id) return { ok: false, error: 'Failed to record the payment.' };
  revalidatePath('/muse', 'layout');
  return { ok: true, id };
}

// ── Removal ─────────────────────────────────────────────────────────────────

const DeleteInput = z.object({
  kind: z.enum(['customer_payment', 'supplier_payment', 'supplier_bill', 'opening_balance']),
  id: z.string().uuid(),
});

/** Remove a working-capital record. Super admin; refused inside a locked period; the removal is on the trail. */
export async function deleteWorkingCapitalRecord(input: unknown): Promise<Result> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { kind, id } = parsed.data;
  let date: string | null = null;
  let label = kind;
  if (kind === 'customer_payment') {
    const r = (await db.select({ d: museCustomerPayments.receivedOn, l: museCustomerPayments.customerName }).from(museCustomerPayments).where(eq(museCustomerPayments.id, id)).limit(1))[0];
    if (r) [date, label] = [String(r.d), `payment from ${r.l}` as typeof label];
  } else if (kind === 'supplier_payment') {
    const r = (await db.select({ d: museSupplierPayments.paidOn, l: museSupplierPayments.supplierName }).from(museSupplierPayments).where(eq(museSupplierPayments.id, id)).limit(1))[0];
    if (r) [date, label] = [String(r.d), `payment to ${r.l}` as typeof label];
  } else if (kind === 'supplier_bill') {
    const r = (await db.select({ d: museSupplierBills.billDate, l: museSupplierBills.billNumber }).from(museSupplierBills).where(eq(museSupplierBills.id, id)).limit(1))[0];
    if (r) [date, label] = [String(r.d), `bill ${r.l}` as typeof label];
    const payments = await db.select({ applications: museSupplierPayments.applications }).from(museSupplierPayments);
    if (payments.some((p) => Array.isArray(p.applications) && (p.applications as { documentId?: string }[]).some((a) => a.documentId === id))) {
      return { ok: false, error: 'A payment is applied to this bill; remove the payment first.' };
    }
  } else {
    const r = (await db.select({ d: museOpeningBalances.asOf }).from(museOpeningBalances).where(eq(museOpeningBalances.id, id)).limit(1))[0];
    if (r) date = String(r.d);
  }
  if (!date) return { ok: false, error: 'Record not found.' };
  const locked = await refuseIfLocked(date);
  if (locked) return { ok: false, error: locked };
  await db.transaction(async (tx) => {
    if (kind === 'customer_payment') await tx.delete(museCustomerPayments).where(eq(museCustomerPayments.id, id));
    else if (kind === 'supplier_payment') await tx.delete(museSupplierPayments).where(eq(museSupplierPayments.id, id));
    else if (kind === 'supplier_bill') await tx.delete(museSupplierBills).where(eq(museSupplierBills.id, id));
    else await tx.delete(museOpeningBalances).where(eq(museOpeningBalances.id, id));
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'delete_record', recordKind: kind, recordId: id, period: periodOf(date!), detail: { label, date } });
  });
  revalidatePath('/muse', 'layout');
  return { ok: true };
}
