'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  farmSubscribers,
  farmDistributions,
  farmInvoices,
  farmSubscriberPayments,
  farmSupplierBills,
  farmSupplierPayments,
  farmSupplierTerms,
  farmOpeningBalances,
  farmReceipts,
} from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmOperator, requireFarmSuperAdmin } from '@/server/access';
import { refuseIfLocked } from '@/server/periods';
import { appendPosting } from '@/server/posting-log';
import { loadActuals } from '@/server/actuals';
import { listPurchaseOrders } from '@/server/supplier-catalog';
import { periodOf } from '@/engine/actuals';
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
} from '@/engine/working-capital';
import { isSubscriberPaymentTerms, isPaymentTerms } from '@/data/working-capital';
import { withWorkspace } from '@/server/workspace';

/**
 * MicroFarm — working capital, writes (Roadmap Phase K).
 *
 * Invoices, bills and payments are recorded by super admins and operators
 * — `requireFarmOperator`, which super admins pass. The
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
export async function setSupplierTerms(...args: Parameters<typeof setSupplierTermsInner>): ReturnType<typeof setSupplierTermsInner> {
  return withWorkspace(() => setSupplierTermsInner(...args));
}

async function setSupplierTermsInner(input: unknown): Promise<Result> {
  const parsed = SupplierTermsInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  await db.transaction(async (tx) => {
    await tx
      .insert(farmSupplierTerms)
      .values({ supplierId: d.supplierId, supplierName: d.supplierName, paymentTerms: d.paymentTerms, updatedBy: access.userId })
      .onConflictDoUpdate({ target: [farmSupplierTerms.workspaceId, farmSupplierTerms.supplierId], set: { supplierName: d.supplierName, paymentTerms: d.paymentTerms, updatedBy: access.userId, updatedAt: new Date() } });
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'set_payment_terms', recordKind: 'supplier_terms', recordId: d.supplierId, period: periodOf(today()), detail: { supplierName: d.supplierName, paymentTerms: d.paymentTerms } });
  });
  revalidatePath('/farm', 'layout');
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
export async function recordOpeningBalance(...args: Parameters<typeof recordOpeningBalanceInner>): ReturnType<typeof recordOpeningBalanceInner> {
  return withWorkspace(() => recordOpeningBalanceInner(...args));
}

async function recordOpeningBalanceInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = OpeningInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const existing = await db.select({ id: farmOpeningBalances.id }).from(farmOpeningBalances).limit(1);
  if (existing[0]) return { ok: false, error: 'An opening balance is already on file; remove it to record another.' };
  const locked = await refuseIfLocked(d.asOf);
  if (locked) return { ok: false, error: locked };
  const id = await db.transaction(async (tx) => {
    const rows = await tx.insert(farmOpeningBalances).values({ ...d, createdBy: access.userId }).returning({ id: farmOpeningBalances.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_opening_balance', recordKind: 'opening_balance', recordId: row.id, period: periodOf(d.asOf), detail: { ...d } });
    return row?.id ?? null;
  });
  if (!id) return { ok: false, error: 'Failed to record the opening balance.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id };
}

// ── Routes and invoices (K1) ────────────────────────────────────────────────

const RouteInput = z.object({
  date: isoDate,
  subscriberId: z.string().uuid().nullable().default(null),
});

/**
 * Complete the route on a date: every distribution on it for Subscriptions or
 * Restaurants, not yet on an invoice, is added to its subscriber's open
 * invoice for the month — opened now if there is none.
 */
export async function completeRoute(...args: Parameters<typeof completeRouteInner>): ReturnType<typeof completeRouteInner> {
  return withWorkspace(() => completeRouteInner(...args));
}

async function completeRouteInner(input: unknown): Promise<Result<{ invoices: number; distributions: number; skipped: string[] }>> {
  const parsed = RouteInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const locked = await refuseIfLocked(d.date);
  if (locked) return { ok: false, error: locked };

  const bundle = await loadActuals();
  const ownUse = await db.select({ id: farmSubscribers.id }).from(farmSubscribers).where(eq(farmSubscribers.ownUse, true));
  const plan = routeCompletion(bundle.distributions, d.date, d.subscriberId, new Set(ownUse.map((r) => r.id)));
  if (plan.groups.length === 0) {
    return { ok: false, error: plan.skipped.length ? plan.skipped.map((s) => s.reason).join(' ') : `No distribution on ${d.date} is waiting to be invoiced.` };
  }
  const subscriberIds = [...new Set(plan.groups.map((g) => g.subscriberId))];
  const subscribers = await db.select({ id: farmSubscribers.id, name: farmSubscribers.name }).from(farmSubscribers).where(inArray(farmSubscribers.id, subscriberIds));
  const nameOf = new Map(subscribers.map((c) => [c.id, c.name]));

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${INVOICE_LOCK_KEY})`);
    const numbers = (await tx.select({ n: farmInvoices.invoiceNumber }).from(farmInvoices)).map((r) => r.n);
    const now = new Date();
    for (const g of plan.groups) {
      const open = await tx
        .select({ id: farmInvoices.id, invoiceNumber: farmInvoices.invoiceNumber })
        .from(farmInvoices)
        .where(and(eq(farmInvoices.subscriberId, g.subscriberId), eq(farmInvoices.period, g.period), eq(farmInvoices.status, 'open')))
        .limit(1);
      let invoiceId = open[0]?.id;
      let invoiceNumber = open[0]?.invoiceNumber;
      if (!invoiceId) {
        invoiceNumber = invoiceNumberFor(d.date, nextInvoiceSequence(d.date, numbers));
        numbers.push(invoiceNumber);
        const created = await tx
          .insert(farmInvoices)
          .values({ invoiceNumber, subscriberId: g.subscriberId, subscriberName: nameOf.get(g.subscriberId) ?? 'Subscriber', period: g.period, status: 'open', openedOn: d.date, createdBy: access.userId })
          .returning({ id: farmInvoices.id });
        invoiceId = created[0]?.id;
      }
      if (!invoiceId) throw new Error('The invoice was not created.');
      await tx.update(farmDistributions).set({ invoiceId, routeCompletedAt: now }).where(inArray(farmDistributions.id, g.distributionIds));
      await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'complete_route', recordKind: 'invoice', recordId: invoiceId, period: g.period, detail: { invoiceNumber, date: d.date, distributionIds: g.distributionIds, units: g.units, amountCents: g.amountCents } });
    }
  });
  revalidatePath('/farm', 'layout');
  return { ok: true, invoices: plan.groups.length, distributions: plan.groups.reduce((s, g) => s + g.distributionIds.length, 0), skipped: plan.skipped.map((s) => s.reason) };
}

const IssueInput = z.object({ invoiceId: z.string().uuid(), issuedOn: isoDate });

/** Issue an open invoice with the subscriber's terms and its due date. Refused without terms on file. */
export async function issueInvoice(...args: Parameters<typeof issueInvoiceInner>): ReturnType<typeof issueInvoiceInner> {
  return withWorkspace(() => issueInvoiceInner(...args));
}

async function issueInvoiceInner(input: unknown): Promise<Result<{ dueOn: string }>> {
  const parsed = IssueInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const inv = (await db.select().from(farmInvoices).where(eq(farmInvoices.id, d.invoiceId)).limit(1))[0];
  if (!inv) return { ok: false, error: 'Invoice not found.' };
  if (inv.status !== 'open') return { ok: false, error: `${inv.invoiceNumber} is already issued.` };
  const subscriber = (await db.select({ paymentTerms: farmSubscribers.paymentTerms, name: farmSubscribers.name }).from(farmSubscribers).where(eq(farmSubscribers.id, inv.subscriberId)).limit(1))[0];
  if (!subscriber || !isSubscriberPaymentTerms(subscriber.paymentTerms)) return { ok: false, error: `${subscriber?.name ?? 'The subscriber'} has no payment terms on file; an invoice is issued with the subscriber's terms.` };
  const lines = await db.select({ distributedOn: farmDistributions.distributedOn }).from(farmDistributions).where(eq(farmDistributions.invoiceId, inv.id));
  if (lines.length === 0) return { ok: false, error: `${inv.invoiceNumber} carries no distributions.` };
  const last = lines.map((l) => String(l.distributedOn)).sort().at(-1)!;
  if (d.issuedOn < last) return { ok: false, error: `${inv.invoiceNumber} carries a distribution on ${last}; it is issued on or after that date.` };
  const locked = await refuseIfLocked(d.issuedOn);
  if (locked) return { ok: false, error: locked };
  const due = dueOn(d.issuedOn, subscriber.paymentTerms)!;
  await db.transaction(async (tx) => {
    await tx.update(farmInvoices).set({ status: 'issued', paymentTerms: subscriber.paymentTerms, issuedOn: d.issuedOn, dueOn: due, issuedBy: access.email ?? access.userId, updatedAt: new Date() }).where(eq(farmInvoices.id, inv.id));
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'issue_invoice', recordKind: 'invoice', recordId: inv.id, period: periodOf(d.issuedOn), detail: { invoiceNumber: inv.invoiceNumber, issuedOn: d.issuedOn, dueOn: due, paymentTerms: subscriber.paymentTerms } });
  });
  revalidatePath('/farm', 'layout');
  return { ok: true, dueOn: due };
}

// ── Subscriber payments (K3) ──────────────────────────────────────────────────

const Application = z.object({ documentId: z.string().uuid(), amountCents: cents.positive() });

const SubscriberPaymentInput = z.object({
  subscriberId: z.string().uuid(),
  receivedOn: isoDate,
  amountCents: cents.positive('A payment is more than zero'),
  method: z.string().max(80).nullable().default(null),
  reference: z.string().max(120).nullable().default(null),
  applications: z.array(Application).default([]),
  notes: z.string().max(2000).nullable().default(null),
});

export async function recordSubscriberPayment(...args: Parameters<typeof recordSubscriberPaymentInner>): ReturnType<typeof recordSubscriberPaymentInner> {
  return withWorkspace(() => recordSubscriberPaymentInner(...args));
}

async function recordSubscriberPaymentInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = SubscriberPaymentInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const subscriber = (await db.select({ name: farmSubscribers.name }).from(farmSubscribers).where(eq(farmSubscribers.id, d.subscriberId)).limit(1))[0];
  if (!subscriber) return { ok: false, error: 'Subscriber not found.' };
  const applied = d.applications.reduce((s, a) => s + a.amountCents, 0);
  if (applied > d.amountCents) return { ok: false, error: 'The amounts applied are more than the payment.' };
  if (d.applications.length > 0) {
    const bundle = await loadActuals();
    const balances = invoiceBalances(bundle.invoices ?? [], bundle.distributions, bundle.subscriberPayments ?? []);
    for (const a of d.applications) {
      const b = balances.find((x) => x.invoice.id === a.documentId);
      if (!b || b.invoice.subscriberId !== d.subscriberId) return { ok: false, error: 'An invoice applied to is not this subscriber’s.' };
      if (a.amountCents > b.openCents) return { ok: false, error: `${b.invoice.invoiceNumber} has $${(b.openCents / 100).toFixed(2)} open.` };
    }
  }
  const locked = await refuseIfLocked(d.receivedOn);
  if (locked) return { ok: false, error: locked };
  const id = await db.transaction(async (tx) => {
    const rows = await tx.insert(farmSubscriberPayments).values({ ...d, subscriberName: subscriber.name, createdBy: access.userId }).returning({ id: farmSubscriberPayments.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_subscriber_payment', recordKind: 'subscriber_payment', recordId: row.id, period: periodOf(d.receivedOn), detail: { subscriberName: subscriber.name, receivedOn: d.receivedOn, amountCents: d.amountCents, applications: d.applications, reference: d.reference } });
    return row?.id ?? null;
  });
  if (!id) return { ok: false, error: 'Failed to record the payment.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id };
}

// ── Supplier bills and the three-way match (K2) ─────────────────────────────

const BillLineSchema = z.object({
  input: z.string().min(1).max(200),
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

/**
 * The checks a bill passes before it is recorded: its receipts on file and not on another bill,
 * the supplier's terms, and the three-way match. A bill that does not equal its receipts, line for
 * line in quantity and value, is refused with its differences listed (`accounting-policy.md` §16).
 */
async function checkBill(d: z.infer<typeof SupplierBillInput>, billId: string | null): Promise<{ error: string } | { terms: string }> {
  const receipts = await db.select({ id: farmReceipts.id, supplierId: farmReceipts.supplierId }).from(farmReceipts).where(inArray(farmReceipts.id, d.receiptIds));
  if (receipts.length !== d.receiptIds.length) return { error: 'A receipt named on the bill is not on file.' };
  if (d.supplierId && receipts.some((r) => r.supplierId && r.supplierId !== d.supplierId)) return { error: 'A receipt named on the bill is from a different supplier.' };
  const others = await db.select({ id: farmSupplierBills.id, billNumber: farmSupplierBills.billNumber, receiptIds: farmSupplierBills.receiptIds }).from(farmSupplierBills);
  for (const o of others) {
    if (o.id === billId) continue;
    const ids = Array.isArray(o.receiptIds) ? (o.receiptIds as string[]) : [];
    const clash = d.receiptIds.find((r) => ids.includes(r));
    if (clash) return { error: `A receipt on this bill is already on bill ${o.billNumber}.` };
  }
  let terms: string | null = null;
  if (d.supplierId) {
    const t = (await db.select({ paymentTerms: farmSupplierTerms.paymentTerms }).from(farmSupplierTerms).where(eq(farmSupplierTerms.supplierId, d.supplierId)).limit(1))[0];
    terms = t?.paymentTerms ?? null;
  }
  if (!isPaymentTerms(terms)) return { error: `${d.supplierName} has no payment terms on file; a bill takes the supplier's terms. Terms are set on the supplier's page.` };
  const [bundle, pos] = await Promise.all([loadActuals(), listPurchaseOrders()]);
  const match = threeWayMatch(
    { lines: d.lines as BillLine[] },
    bundle.receipts.filter((r) => d.receiptIds.includes(r.id)),
    pos.map((p) => ({ id: p.id, poNumber: p.poNumber, lines: p.lines })),
  );
  if (match.status === 'mismatched') return { error: `The bill does not match its receipts and is not recorded. ${match.issues.join(' ')}` };
  return { terms };
}

/** Record a supplier's bill against its receipts. A bill that does not match them is refused. */
export async function recordSupplierBill(...args: Parameters<typeof recordSupplierBillInner>): ReturnType<typeof recordSupplierBillInner> {
  return withWorkspace(() => recordSupplierBillInner(...args));
}

async function recordSupplierBillInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = SupplierBillInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const checked = await checkBill(d, null);
  if ('error' in checked) return { ok: false, error: checked.error };
  const locked = await refuseIfLocked(d.billDate);
  if (locked) return { ok: false, error: locked };
  const id = await db.transaction(async (tx) => {
    const rows = await tx.insert(farmSupplierBills).values({ ...d, paymentTerms: checked.terms, createdBy: access.userId }).returning({ id: farmSupplierBills.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_supplier_bill', recordKind: 'supplier_bill', recordId: row.id, period: periodOf(d.billDate), detail: { supplierName: d.supplierName, billNumber: d.billNumber, billDate: d.billDate, receiptIds: d.receiptIds, match: 'matched' } });
    return row?.id ?? null;
  });
  if (!id) return { ok: false, error: 'Failed to record the bill.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id };
}

/** Rectify a bill: replace its number, date, receipts and lines. Refused once a payment is applied to it, or when it does not match its receipts. */
export async function updateSupplierBill(...args: Parameters<typeof updateSupplierBillInner>): ReturnType<typeof updateSupplierBillInner> {
  return withWorkspace(() => updateSupplierBillInner(...args));
}

async function updateSupplierBillInner(input: unknown): Promise<Result> {
  const parsed = SupplierBillInput.extend({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...d } = parsed.data;
  const current = (await db.select({ billDate: farmSupplierBills.billDate }).from(farmSupplierBills).where(eq(farmSupplierBills.id, id)).limit(1))[0];
  if (!current) return { ok: false, error: 'Bill not found.' };
  const payments = await db.select({ applications: farmSupplierPayments.applications }).from(farmSupplierPayments);
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
    await tx.update(farmSupplierBills).set({ ...d, paymentTerms: checked.terms, updatedAt: new Date() }).where(eq(farmSupplierBills.id, id));
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_supplier_bill', recordKind: 'supplier_bill', recordId: id, period: periodOf(d.billDate), detail: { rectified: true, previousBillDate: String(current.billDate), billNumber: d.billNumber, billDate: d.billDate, receiptIds: d.receiptIds, match: 'matched' } });
  });
  revalidatePath('/farm', 'layout');
  return { ok: true };
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
export async function recordSupplierPayment(...args: Parameters<typeof recordSupplierPaymentInner>): ReturnType<typeof recordSupplierPaymentInner> {
  return withWorkspace(() => recordSupplierPaymentInner(...args));
}

async function recordSupplierPaymentInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = SupplierPaymentInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmOperator();
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
    const rows = await tx.insert(farmSupplierPayments).values({ ...d, createdBy: access.userId }).returning({ id: farmSupplierPayments.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_supplier_payment', recordKind: 'supplier_payment', recordId: row.id, period: periodOf(d.paidOn), detail: { supplierName: d.supplierName, paidOn: d.paidOn, amountCents: d.amountCents, applications: d.applications, reference: d.reference } });
    return row?.id ?? null;
  });
  if (!id) return { ok: false, error: 'Failed to record the payment.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id };
}

// ── Removal ─────────────────────────────────────────────────────────────────

const DeleteInput = z.object({
  kind: z.enum(['subscriber_payment', 'supplier_payment', 'supplier_bill', 'opening_balance']),
  id: z.string().uuid(),
});

/** Remove a working-capital record. Super admin; refused inside a locked period; the removal is on the trail. */
export async function deleteWorkingCapitalRecord(...args: Parameters<typeof deleteWorkingCapitalRecordInner>): ReturnType<typeof deleteWorkingCapitalRecordInner> {
  return withWorkspace(() => deleteWorkingCapitalRecordInner(...args));
}

async function deleteWorkingCapitalRecordInner(input: unknown): Promise<Result> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { kind, id } = parsed.data;
  let date: string | null = null;
  let label = kind;
  if (kind === 'subscriber_payment') {
    const r = (await db.select({ d: farmSubscriberPayments.receivedOn, l: farmSubscriberPayments.subscriberName }).from(farmSubscriberPayments).where(eq(farmSubscriberPayments.id, id)).limit(1))[0];
    if (r) [date, label] = [String(r.d), `payment from ${r.l}` as typeof label];
  } else if (kind === 'supplier_payment') {
    const r = (await db.select({ d: farmSupplierPayments.paidOn, l: farmSupplierPayments.supplierName }).from(farmSupplierPayments).where(eq(farmSupplierPayments.id, id)).limit(1))[0];
    if (r) [date, label] = [String(r.d), `payment to ${r.l}` as typeof label];
  } else if (kind === 'supplier_bill') {
    const r = (await db.select({ d: farmSupplierBills.billDate, l: farmSupplierBills.billNumber }).from(farmSupplierBills).where(eq(farmSupplierBills.id, id)).limit(1))[0];
    if (r) [date, label] = [String(r.d), `bill ${r.l}` as typeof label];
    const payments = await db.select({ applications: farmSupplierPayments.applications }).from(farmSupplierPayments);
    if (payments.some((p) => Array.isArray(p.applications) && (p.applications as { documentId?: string }[]).some((a) => a.documentId === id))) {
      return { ok: false, error: 'A payment is applied to this bill; remove the payment first.' };
    }
  } else {
    const r = (await db.select({ d: farmOpeningBalances.asOf }).from(farmOpeningBalances).where(eq(farmOpeningBalances.id, id)).limit(1))[0];
    if (r) date = String(r.d);
  }
  if (!date) return { ok: false, error: 'Record not found.' };
  const locked = await refuseIfLocked(date);
  if (locked) return { ok: false, error: locked };
  await db.transaction(async (tx) => {
    if (kind === 'subscriber_payment') await tx.delete(farmSubscriberPayments).where(eq(farmSubscriberPayments.id, id));
    else if (kind === 'supplier_payment') await tx.delete(farmSupplierPayments).where(eq(farmSupplierPayments.id, id));
    else if (kind === 'supplier_bill') await tx.delete(farmSupplierBills).where(eq(farmSupplierBills.id, id));
    else await tx.delete(farmOpeningBalances).where(eq(farmOpeningBalances.id, id));
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'delete_record', recordKind: kind, recordId: id, period: periodOf(date!), detail: { label, date } });
  });
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
