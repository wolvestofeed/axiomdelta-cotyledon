'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { farmSowingRecords, farmReceipts, farmDistributions, farmPeriodBills, farmPurchaseOrders, farmPurchaseOrderLines } from '@/db';
import { db } from '@/lib/db';
import { accessRefusal, requireFarmOperator, requireFarmSuperAdmin } from '@/server/access';
import { BILL_ACCOUNTS, laborFromCrew, periodOf, periodStart } from '@/engine/actuals';
import { refuseIfLocked } from '@/server/periods';
import { appendPosting } from '@/server/posting-log';
import { massBalance, ABNORMAL_SCRAP_REASONS, type ScrapReason } from '@/engine/sowing';
import { toSowingExecution } from '@/engine/actuals';
import { receiptCoverage } from '@/engine/net-requirements';
import { withWorkspace } from '@/server/workspace';

/**
 * MicroFarm — recording actuals. Receipts, sowing closes and
 * distributions are recorded by OPERATORS (`requireFarmOperator`, Roadmap I1 —
 * super admins are operators); period bills and the removal of any record stay
 * SUPER ADMIN. Every action gates on a throwing guard.
 *
 * A sowing record is refused if its mass balance does not reconcile — a sowing
 * that does not balance does not close (docs/farm/CLAUDE.md §2 rule 9).
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
    'TRIM', 'SOW_LOSS', 'UNIT_OVERAGE', 'BLACKOUT_FAILURE', 'TEMPERATURE_EXCURSION',
    'EQUIPMENT_FAILURE', 'CONTAMINATION', 'DROPPED_OR_DAMAGED', 'RECALL_OR_WITHDRAWAL', 'EXPIRED_SHELF_LIFE',
  ]),
  lb: z.number().min(0),
  stage: z.enum(['PREP', 'SOW', 'BLACKOUT', 'PACK', 'FINISHED']),
  note: z.string().max(400).default(''),
});

const CoolingSchema = z.object({ t0F: z.number(), t2F: z.number(), t6F: z.number(), startedAt: z.string(), endedAt: z.string() });

const ComponentSchema = z.object({
  component: z.string().min(1),
  outputLotCode: z.string().min(1),
  consumed: z.array(
    z.object({
      input: z.string().min(1),
      inputLotCode: z.string().max(80).default('not recorded'),
      qty: z.number().min(0),
      unit: z.enum(['lb', 'each']),
      onFoodTraceabilityList: z.boolean().default(false),
    }),
  ),
  seedIssuedLb: z.number().min(0),
  harvestedLb: z.number().min(0).nullable(),
  blackoutLb: z.number().min(0).nullable(),
  packedLb: z.number().min(0),
  scrap: z.array(ScrapSchema).default([]),
  shrinkAllowanceLb: z.number().min(0).optional(),
  sowEndTempF: z.number().nullable().optional(),
  // One stage record per rack load (the sow is the lot); a single object
  // from an older client is read as one load.
  cooling: z
    .union([z.array(CoolingSchema), CoolingSchema.transform((c) => [c])])
    .optional(),
});

const SowingInput = z.object({
  sowingId: z.string().trim().min(3).max(40),
  cropPlanCode: z.string().min(1),
  productionDate: isoDate,
  standardVersion: z.string().min(1),
  plannedUnits: z.number().min(0),
  goodUnits: z.number().min(0),
  sowingsRun: z.number().int().min(1).default(1),
  servingsProduced: z.number().min(0).nullable().default(null),
  components: z.array(ComponentSchema).min(1),
  crew: z
    .array(z.object({ name: z.string().trim().min(1).max(80), hours: z.number().min(0), ratePerHour: z.number().min(0).nullable().default(null) }))
    .default([]),
  actualLaborHours: z.number().min(0).nullable().default(null),
  actualLaborRate: z.number().min(0).nullable().default(null),
  closedBy: z.string().trim().min(1, 'A sowing record is signed by the person closing it').max(120),
  notes: z.string().max(2000).nullable().default(null),
});

export async function recordSowing(...args: Parameters<typeof recordSowingInner>): ReturnType<typeof recordSowingInner> {
  return withWorkspace(() => recordSowingInner(...args));
}

async function recordSowingInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = SowingInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;

  // Every scrap reason resolves to normal or abnormal — a reason outside the
  // register is not a record.
  for (const c of d.components) {
    for (const s of c.scrap) {
      const r = s.reason as ScrapReason;
      if (!ABNORMAL_SCRAP_REASONS.has(r) && !['TRIM', 'SOW_LOSS', 'UNIT_OVERAGE'].includes(r)) {
        return { ok: false, error: `Unknown scrap reason ${s.reason}.` };
      }
    }
  }

  const mb = massBalance(
    toSowingExecution({ ...d, id: '', closedAt: null, components: d.components }),
  );
  if (!mb.balanced) {
    return { ok: false, error: `The sowing does not mass-balance and cannot close. ${mb.failures.join(' ')}` };
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
    .insert(farmSowingRecords)
    .values({
      sowingId: d.sowingId,
      cropPlanCode: d.cropPlanCode,
      productionDate: d.productionDate,
      standardVersion: d.standardVersion,
      plannedUnits: d.plannedUnits,
      goodUnits: d.goodUnits,
      sowingsRun: d.sowingsRun,
      servingsProduced: d.servingsProduced,
      components: d.components,
      crew: d.crew,
      actualLaborHours,
      actualLaborRate,
      closedBy: d.closedBy,
      closedAt: new Date(),
      notes: d.notes,
      createdBy: access.userId,
    })
    .returning({ id: farmSowingRecords.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_sowing', recordKind: 'sowing', recordId: row.id, period: periodOf(d.productionDate), detail: { sowingId: d.sowingId, cropPlanCode: d.cropPlanCode, productionDate: d.productionDate, goodUnits: d.goodUnits, closedBy: d.closedBy } });
    return rows;
  });
  if (!inserted[0]) return { ok: false, error: 'Failed to record the sowing.' };
  revalidatePath('/farm', 'layout');
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
        input: z.string().min(1),
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
    // Receiving has no tolerance: a line that differs from
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

export async function recordReceipt(...args: Parameters<typeof recordReceiptInner>): ReturnType<typeof recordReceiptInner> {
  return withWorkspace(() => recordReceiptInner(...args));
}

async function recordReceiptInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = ReceiptInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const locked = await refuseIfLocked(d.receivedOn);
  if (locked) return { ok: false, error: locked };
  const inserted = await db.transaction(async (tx) => {
    const rows = await tx.insert(farmReceipts).values({ ...d, createdBy: access.userId }).returning({ id: farmReceipts.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_receipt', recordKind: 'receipt', recordId: row.id, period: periodOf(d.receivedOn), detail: { receivedOn: d.receivedOn, poId: d.poId, supplierName: d.supplierName, invoiceNumber: d.invoiceNumber, lines: d.lines.length, invoiceTotalCents: d.invoiceTotalCents } });
    return rows;
  });
  if (!inserted[0]) return { ok: false, error: 'Failed to record the receipt.' };
  // Receipts close the order (Roadmap H5): once every line of an issued order is
  // covered by the receipts naming it, the order is received. Closing stays the
  // accounting step on the order itself.
  if (d.poId) {
    const po = await db.select({ id: farmPurchaseOrders.id, status: farmPurchaseOrders.status }).from(farmPurchaseOrders).where(eq(farmPurchaseOrders.id, d.poId)).limit(1);
    if (po[0] && po[0].status === 'issued') {
      const [lines, receipts] = await Promise.all([
        db.select({ input: farmPurchaseOrderLines.input, qty: farmPurchaseOrderLines.qty, unit: farmPurchaseOrderLines.unit }).from(farmPurchaseOrderLines).where(eq(farmPurchaseOrderLines.poId, d.poId)),
        db.select({ id: farmReceipts.id, poId: farmReceipts.poId, lines: farmReceipts.lines }).from(farmReceipts).where(eq(farmReceipts.poId, d.poId)),
      ]);
      const cov = receiptCoverage(
        { id: d.poId, lines },
        receipts.map((r) => ({ id: r.id, poId: r.poId, supplierId: null, supplierName: null, receivedOn: '', invoiceNumber: null, invoiceTotalCents: null, lines: (r.lines ?? []) as { input: string; qty: number; unit: 'lb' | 'each'; lotCode: string; unitPriceCents: number }[], receivedBy: null, notes: null })),
      );
      if (cov.covered) {
        await db.update(farmPurchaseOrders).set({ status: 'received', receivedAt: new Date(), updatedAt: new Date() }).where(eq(farmPurchaseOrders.id, d.poId));
      }
    }
  }
  revalidatePath('/farm', 'layout');
  return { ok: true, id: inserted[0].id };
}

const DistributionInput = z.object({
  distributedOn: isoDate,
  phase: z.number().int().min(1).max(3),
  pickupPointId: z.string().max(120).nullable().default(null),
  pickupPointName: z.string().max(200).nullable().default(null),
  units: z.number().min(0),
  pricePerUnitCents: z.number().int().min(0),
  lotCodes: z.array(z.string().max(80)).default([]),
  distributedBy: z.string().max(120).nullable().default(null),
  handoffTempF: z.number().nullable().default(null),
  receivedBy: z.string().max(120).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});

export async function recordDistribution(...args: Parameters<typeof recordDistributionInner>): ReturnType<typeof recordDistributionInner> {
  return withWorkspace(() => recordDistributionInner(...args));
}

async function recordDistributionInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = DistributionInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmOperator();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const locked = await refuseIfLocked(d.distributedOn);
  if (locked) return { ok: false, error: locked };
  const inserted = await db.transaction(async (tx) => {
    const rows = await tx.insert(farmDistributions).values({ ...d, createdBy: access.userId }).returning({ id: farmDistributions.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_distribution', recordKind: 'distribution', recordId: row.id, period: periodOf(d.distributedOn), detail: { distributedOn: d.distributedOn, phase: d.phase, pickupPointName: d.pickupPointName, units: d.units, pricePerUnitCents: d.pricePerUnitCents, lotCodes: d.lotCodes } });
    return rows;
  });
  if (!inserted[0]) return { ok: false, error: 'Failed to record the distribution.' };
  revalidatePath('/farm', 'layout');
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

export async function recordPeriodBill(...args: Parameters<typeof recordPeriodBillInner>): ReturnType<typeof recordPeriodBillInner> {
  return withWorkspace(() => recordPeriodBillInner(...args));
}

async function recordPeriodBillInner(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = BillInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  const accountCode = d.category === 'other' ? d.accountCode : BILL_ACCOUNTS[d.category];
  if (!accountCode) return { ok: false, error: 'An "other" bill needs the ledger account it posts to.' };
  const locked = await refuseIfLocked(periodStart(d.period));
  if (locked) return { ok: false, error: locked };
  const inserted = await db.transaction(async (tx) => {
    const rows = await tx.insert(farmPeriodBills).values({ ...d, accountCode, createdBy: access.userId }).returning({ id: farmPeriodBills.id });
    const row = rows[0];
    if (row) await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'record_bill', recordKind: 'bill', recordId: row.id, period: d.period, detail: { category: d.category, accountCode, amountCents: d.amountCents, vendor: d.vendor, invoiceNumber: d.invoiceNumber } });
    return rows;
  });
  if (!inserted[0]) return { ok: false, error: 'Failed to record the bill.' };
  revalidatePath('/farm', 'layout');
  return { ok: true, id: inserted[0].id };
}

const DeleteInput = z.object({
  kind: z.enum(['sowing', 'receipt', 'distribution', 'bill']),
  id: z.string().uuid(),
});

/**
 * Remove a record. Super admin only; a fact of record is deleted, not edited.
 * Refused inside a locked period; the removal is itself an entry on the trail,
 * so a record that leaves the books leaves a mark.
 */
export async function deleteActual(...args: Parameters<typeof deleteActualInner>): ReturnType<typeof deleteActualInner> {
  return withWorkspace(() => deleteActualInner(...args));
}

async function deleteActualInner(input: unknown): Promise<Result> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  let access;
  try {
    access = await requireFarmSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { kind, id } = parsed.data;
  const dated = async (): Promise<{ date: string; label: string } | null> => {
    if (kind === 'sowing') {
      const r = (await db.select({ d: farmSowingRecords.productionDate, l: farmSowingRecords.sowingId }).from(farmSowingRecords).where(eq(farmSowingRecords.id, id)).limit(1))[0];
      return r ? { date: String(r.d), label: r.l } : null;
    }
    if (kind === 'receipt') {
      const r = (await db.select({ d: farmReceipts.receivedOn, l: farmReceipts.invoiceNumber }).from(farmReceipts).where(eq(farmReceipts.id, id)).limit(1))[0];
      return r ? { date: String(r.d), label: r.l ?? 'receipt' } : null;
    }
    if (kind === 'distribution') {
      const r = (await db.select({ d: farmDistributions.distributedOn, l: farmDistributions.pickupPointName }).from(farmDistributions).where(eq(farmDistributions.id, id)).limit(1))[0];
      return r ? { date: String(r.d), label: r.l ?? 'distribution' } : null;
    }
    const r = (await db.select({ p: farmPeriodBills.period, l: farmPeriodBills.vendor }).from(farmPeriodBills).where(eq(farmPeriodBills.id, id)).limit(1))[0];
    return r ? { date: periodStart(r.p), label: r.l ?? 'bill' } : null;
  };
  const target = await dated();
  if (!target) return { ok: false, error: 'Record not found.' };
  const locked = await refuseIfLocked(target.date);
  if (locked) return { ok: false, error: locked };
  await db.transaction(async (tx) => {
    if (kind === 'sowing') await tx.delete(farmSowingRecords).where(eq(farmSowingRecords.id, id));
    else if (kind === 'receipt') await tx.delete(farmReceipts).where(eq(farmReceipts.id, id));
    else if (kind === 'distribution') await tx.delete(farmDistributions).where(eq(farmDistributions.id, id));
    else await tx.delete(farmPeriodBills).where(eq(farmPeriodBills.id, id));
    await appendPosting(tx, { actorUserId: access.userId, actorEmail: access.email, action: 'delete_record', recordKind: kind, recordId: id, period: periodOf(target.date), detail: { label: target.label, date: target.date } });
  });
  revalidatePath('/farm', 'layout');
  return { ok: true };
}
