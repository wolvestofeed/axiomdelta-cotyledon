'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { museBatchRecords, museReceipts, museDeliveries, musePeriodBills, musePurchaseOrders, musePurchaseOrderLines } from '@ct/db';
import { db } from '@/lib/db';
import { accessRefusal, requireMuseOperator, requireMuseSuperAdmin } from './access';
import { BILL_ACCOUNTS, laborFromCrew, periodOf, periodStart } from '../_engine/actuals';
import { refuseIfLocked } from './periods';
import { appendPosting } from './posting-log';
import { massBalance, ABNORMAL_SCRAP_REASONS, type ScrapReason } from '../_engine/batch';
import { toBatchExecution } from '../_engine/actuals';
import { receiptCoverage } from '../_engine/net-requirements';

/**
 * Impact OS — recording actuals. Receipts, batch closes and
 * deliveries are recorded by OPERATORS (`requireMuseOperator`, Roadmap I1 —
 * super admins are operators); period bills and the removal of any record stay
 * SUPER ADMIN. Every action gates on a throwing guard.
 *
 * A batch record is refused if its mass balance does not reconcile — a batch
 * that does not balance does not close (docs/muse/CLAUDE.md §2 rule 9).
 *
 * Nothing posts into a locked period (Roadmap J3), and every posting and
 * removal is an entry on the hash-chained trail, written in the same
 * transaction as the record (Roadmap J4).
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Period must be YYYY-MM');

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}

const ScrapSchema = z.object({
  reason: z.enum([
    'TRIM', 'COOK_LOSS', 'PORTION_OVERAGE', 'CHILL_FAILURE', 'TEMPERATURE_EXCURSION',
    'EQUIPMENT_FAILURE', 'CONTAMINATION', 'DROPPED_OR_DAMAGED', 'RECALL_OR_WITHDRAWAL', 'EXPIRED_HOLD_LIFE',
  ]),
  lb: z.number().min(0),
  stage: z.enum(['PREP', 'COOK', 'CHILL', 'PACK', 'FINISHED']),
  note: z.string().max(400).default(''),
});

const CoolingSchema = z.object({ t0F: z.number(), t2F: z.number(), t6F: z.number(), startedAt: z.string(), endedAt: z.string() });

const ComponentSchema = z.object({
  component: z.string().min(1),
  outputLotCode: z.string().min(1),
  consumed: z.array(
    z.object({
      ingredient: z.string().min(1),
      inputLotCode: z.string().max(80).default('not recorded'),
      qty: z.number().min(0),
      unit: z.enum(['lb', 'each']),
      onFoodTraceabilityList: z.boolean().default(false),
    }),
  ),
  apIssuedLb: z.number().min(0),
  cookedLb: z.number().min(0).nullable(),
  chilledLb: z.number().min(0).nullable(),
  packedLb: z.number().min(0),
  scrap: z.array(ScrapSchema).default([]),
  shrinkAllowanceLb: z.number().min(0).optional(),
  cookEndTempF: z.number().nullable().optional(),
  // One cooling record per cabinet load (the cook is the lot); a single object
  // from an older client is read as one load.
  cooling: z
    .union([z.array(CoolingSchema), CoolingSchema.transform((c) => [c])])
    .optional(),
});

const BatchInput = z.object({
  batchId: z.string().trim().min(3).max(40),
  recipeCode: z.string().min(1),
  productionDate: isoDate,
  standardVersion: z.string().min(1),
  plannedPortions: z.number().min(0),
  goodPortions: z.number().min(0),
  batchesRun: z.number().int().min(1).default(1),
  mealsProduced: z.number().min(0).nullable().default(null),
  components: z.array(ComponentSchema).min(1),
  crew: z
    .array(z.object({ name: z.string().trim().min(1).max(80), hours: z.number().min(0), ratePerHour: z.number().min(0).nullable().default(null) }))
    .default([]),
  actualLaborHours: z.number().min(0).nullable().default(null),
  actualLaborRate: z.number().min(0).nullable().default(null),
  closedBy: z.string().trim().min(1, 'A batch record is signed by the person closing it').max(120),
  notes: z.string().max(2000).nullable().default(null),
});

export async function recordBatch(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = BatchInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;

  // Every scrap reason resolves to normal or abnormal — a reason outside the
  // register is not a record.
  for (const c of d.components) {
    for (const s of c.scrap) {
      const r = s.reason as ScrapReason;
      if (!ABNORMAL_SCRAP_REASONS.has(r) && !['TRIM', 'COOK_LOSS', 'PORTION_OVERAGE'].includes(r)) {
        return { ok: false, error: `Unknown scrap reason ${s.reason}.` };
      }
    }
  }

  const mb = massBalance(
    toBatchExecution({ ...d, id: '', closedAt: null, components: d.components }),
  );
  if (!mb.balanced) {
    return { ok: false, error: `The batch does not mass-balance and cannot close. ${mb.failures.join(' ')}` };
  }

  // Crew rows, when present, are the record: the totals the ledger reads are
  // derived from them, not typed beside them.
  const fromCrew = laborFromCrew(d.crew);
  const actualLaborHours = d.crew.length > 0 ? fromCrew.hours : d.actualLaborHours;
  const actualLaborRate = d.crew.length > 0 ? fromCrew.rate : d.actualLaborRate;

  const locked = await refuseIfLocked(d.productionDate);
  if (locked) return { ok: false, error: locked };

  const inserted = await db.transaction(async (tx) => {
    const rows = await tx
    .insert(museBatchRecords)
    .values({
      batchId: d.batchId,
      recipeCode: d.recipeCode,
      productionDate: d.productionDate,
      standardVersion: d.standardVersion,
      plannedPortions: d.plannedPortions,
      goodPortions: d.goodPortions,
      batchesRun: d.batchesRun,
      mealsProduced: d.mealsProduced,
      components: d.components,
      crew: d.crew,
      actualLaborHours,
      actualLaborRate,
      closedBy: d.closedBy,
      closedAt: new Date(),
      notes: d.notes,
      createdBy: access.userId,
    })
    .returning({ id: museBatchRecords.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_batch', recordKind: 'batch', recordId: row.id, period: periodOf(d.productionDate), detail: { batchId: d.batchId, recipeCode: d.recipeCode, productionDate: d.productionDate, goodPortions: d.goodPortions, closedBy: d.closedBy } });
    return rows;
  });
  if (!inserted[0]) return { ok: false, error: 'Failed to record the batch.' };
  revalidatePath('/muse', 'layout');
  return { ok: true, id: inserted[0].id };
}

const ReceiptInput = z.object({
  poId: z.string().uuid().nullable().default(null),
  supplierId: z.string().max(120).nullable().default(null),
  supplierName: z.string().max(200).nullable().default(null),
  receivedOn: isoDate,
  invoiceNumber: z.string().max(80).nullable().default(null),
  invoiceTotalCents: z.number().int().nullable().default(null),
  lines: z
    .array(
      z.object({
        ingredient: z.string().min(1),
        qty: z.number().min(0),
        unit: z.enum(['lb', 'each']),
        lotCode: z.string().max(80).default('not recorded'),
        unitPriceCents: z.number().int().min(0),
        useBy: isoDate.nullable().optional(),
        receivedTempF: z.number().nullable().optional(),
        condition: z.enum(['accepted', 'accepted_with_note', 'rejected']).optional(),
        onFoodTraceabilityList: z.boolean().optional(),
        poQty: z.number().min(0).nullable().optional(),
        poUnitPriceCents: z.number().int().min(0).nullable().optional(),
        overrideReason: z.string().max(400).nullable().optional(),
      }),
    )
    .min(1, 'A receipt needs at least one line')
    // Receiving has no tolerance (Robert, 2026-09-14): a line that differs from
    // its purchase-order line in quantity or price carries the reason.
    .refine(
      (ls) =>
        ls.every(
          (l) =>
            l.condition === 'rejected' ||
            (l.poQty ?? null) === null ||
            (Math.abs(l.qty - (l.poQty ?? 0)) <= 0.0005 && l.unitPriceCents === (l.poUnitPriceCents ?? l.unitPriceCents)) ||
            (l.overrideReason ?? '').trim().length > 0,
        ),
      { message: 'A line received short, over, or at a changed price carries an override reason' },
    ),
  receivedBy: z.string().max(120).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});

export async function recordReceipt(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = ReceiptInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const locked = await refuseIfLocked(d.receivedOn);
  if (locked) return { ok: false, error: locked };
  const inserted = await db.transaction(async (tx) => {
    const rows = await tx.insert(museReceipts).values({ ...d, createdBy: access.userId }).returning({ id: museReceipts.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_receipt', recordKind: 'receipt', recordId: row.id, period: periodOf(d.receivedOn), detail: { receivedOn: d.receivedOn, poId: d.poId, supplierName: d.supplierName, invoiceNumber: d.invoiceNumber, lines: d.lines.length, invoiceTotalCents: d.invoiceTotalCents } });
    return rows;
  });
  if (!inserted[0]) return { ok: false, error: 'Failed to record the receipt.' };
  // Receipts close the order (Roadmap H5): once every line of an issued order is
  // covered by the receipts naming it, the order is received. Closing stays the
  // accounting step on the order itself.
  if (d.poId) {
    const po = await db.select({ id: musePurchaseOrders.id, status: musePurchaseOrders.status }).from(musePurchaseOrders).where(eq(musePurchaseOrders.id, d.poId)).limit(1);
    if (po[0] && po[0].status === 'issued') {
      const [lines, receipts] = await Promise.all([
        db.select({ ingredient: musePurchaseOrderLines.ingredient, qty: musePurchaseOrderLines.qty, unit: musePurchaseOrderLines.unit }).from(musePurchaseOrderLines).where(eq(musePurchaseOrderLines.poId, d.poId)),
        db.select({ id: museReceipts.id, poId: museReceipts.poId, lines: museReceipts.lines }).from(museReceipts).where(eq(museReceipts.poId, d.poId)),
      ]);
      const cov = receiptCoverage(
        { id: d.poId, lines },
        receipts.map((r) => ({ id: r.id, poId: r.poId, supplierId: null, supplierName: null, receivedOn: '', invoiceNumber: null, invoiceTotalCents: null, lines: (r.lines ?? []) as { ingredient: string; qty: number; unit: 'lb' | 'each'; lotCode: string; unitPriceCents: number }[], receivedBy: null, notes: null })),
      );
      if (cov.covered) {
        await db.update(musePurchaseOrders).set({ status: 'received', receivedAt: new Date(), updatedAt: new Date() }).where(eq(musePurchaseOrders.id, d.poId));
      }
    }
  }
  revalidatePath('/muse', 'layout');
  return { ok: true, id: inserted[0].id };
}

const DeliveryInput = z.object({
  deliveredOn: isoDate,
  phase: z.number().int().min(1).max(3),
  siteId: z.string().max(120).nullable().default(null),
  siteName: z.string().max(200).nullable().default(null),
  meals: z.number().min(0),
  pricePerMealCents: z.number().int().min(0),
  lotCodes: z.array(z.string().max(80)).default([]),
  deliveredBy: z.string().max(120).nullable().default(null),
  handoffTempF: z.number().nullable().default(null),
  receivedBy: z.string().max(120).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});

export async function recordDelivery(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = DeliveryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireMuseOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const locked = await refuseIfLocked(d.deliveredOn);
  if (locked) return { ok: false, error: locked };
  const inserted = await db.transaction(async (tx) => {
    const rows = await tx.insert(museDeliveries).values({ ...d, createdBy: access.userId }).returning({ id: museDeliveries.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_delivery', recordKind: 'delivery', recordId: row.id, period: periodOf(d.deliveredOn), detail: { deliveredOn: d.deliveredOn, phase: d.phase, siteName: d.siteName, meals: d.meals, pricePerMealCents: d.pricePerMealCents, lotCodes: d.lotCodes } });
    return rows;
  });
  if (!inserted[0]) return { ok: false, error: 'Failed to record the delivery.' };
  revalidatePath('/muse', 'layout');
  return { ok: true, id: inserted[0].id };
}

const BillInput = z.object({
  period,
  category: z.enum(['lease', 'utilities', 'admin', 'other']),
  /** Required for 'other'; derived from the category otherwise. */
  accountCode: z.string().regex(/^\d{4}$/).optional(),
  amountCents: z.number().int(),
  vendor: z.string().max(200).nullable().default(null),
  invoiceNumber: z.string().max(80).nullable().default(null),
  incurredOn: isoDate.nullable().default(null),
  paidOn: isoDate.nullable().default(null),
  /** No default (Roadmap K3): the terms on the bill are chosen when it is recorded. */
  paymentTerms: z.enum(['due_on_receipt', 'net_15', 'net_30', 'net_60', 'net_90'], { message: 'Choose the payment terms on the bill' }),
  notes: z.string().max(2000).nullable().default(null),
});

export async function recordPeriodBill(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = BillInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const accountCode = d.category === 'other' ? d.accountCode : BILL_ACCOUNTS[d.category];
  if (!accountCode) return { ok: false, error: 'An "other" bill needs the ledger account it posts to.' };
  const locked = await refuseIfLocked(periodStart(d.period));
  if (locked) return { ok: false, error: locked };
  const inserted = await db.transaction(async (tx) => {
    const rows = await tx.insert(musePeriodBills).values({ ...d, accountCode, createdBy: access.userId }).returning({ id: musePeriodBills.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_bill', recordKind: 'bill', recordId: row.id, period: d.period, detail: { category: d.category, accountCode, amountCents: d.amountCents, vendor: d.vendor, invoiceNumber: d.invoiceNumber } });
    return rows;
  });
  if (!inserted[0]) return { ok: false, error: 'Failed to record the bill.' };
  revalidatePath('/muse', 'layout');
  return { ok: true, id: inserted[0].id };
}

const DeleteInput = z.object({
  kind: z.enum(['batch', 'receipt', 'delivery', 'bill']),
  id: z.string().uuid(),
});

/**
 * Remove a record. Super admin only; a fact of record is deleted, not edited.
 * Refused inside a locked period; the removal is itself an entry on the trail,
 * so a record that leaves the books leaves a mark.
 */
export async function deleteActual(input: unknown): Promise<Result> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { kind, id } = parsed.data;
  const dated = async (): Promise<{ date: string; label: string } | null> => {
    if (kind === 'batch') {
      const r = (await db.select({ d: museBatchRecords.productionDate, l: museBatchRecords.batchId }).from(museBatchRecords).where(eq(museBatchRecords.id, id)).limit(1))[0];
      return r ? { date: String(r.d), label: r.l } : null;
    }
    if (kind === 'receipt') {
      const r = (await db.select({ d: museReceipts.receivedOn, l: museReceipts.invoiceNumber }).from(museReceipts).where(eq(museReceipts.id, id)).limit(1))[0];
      return r ? { date: String(r.d), label: r.l ?? 'receipt' } : null;
    }
    if (kind === 'delivery') {
      const r = (await db.select({ d: museDeliveries.deliveredOn, l: museDeliveries.siteName }).from(museDeliveries).where(eq(museDeliveries.id, id)).limit(1))[0];
      return r ? { date: String(r.d), label: r.l ?? 'delivery' } : null;
    }
    const r = (await db.select({ p: musePeriodBills.period, l: musePeriodBills.vendor }).from(musePeriodBills).where(eq(musePeriodBills.id, id)).limit(1))[0];
    return r ? { date: periodStart(r.p), label: r.l ?? 'bill' } : null;
  };
  const target = await dated();
  if (!target) return { ok: false, error: 'Record not found.' };
  const locked = await refuseIfLocked(target.date);
  if (locked) return { ok: false, error: locked };
  await db.transaction(async (tx) => {
    if (kind === 'batch') await tx.delete(museBatchRecords).where(eq(museBatchRecords.id, id));
    else if (kind === 'receipt') await tx.delete(museReceipts).where(eq(museReceipts.id, id));
    else if (kind === 'delivery') await tx.delete(museDeliveries).where(eq(museDeliveries.id, id));
    else await tx.delete(musePeriodBills).where(eq(musePeriodBills.id, id));
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'delete_record', recordKind: kind, recordId: id, period: periodOf(target.date), detail: { label: target.label, date: target.date } });
  });
  revalidatePath('/muse', 'layout');
  return { ok: true };
}
