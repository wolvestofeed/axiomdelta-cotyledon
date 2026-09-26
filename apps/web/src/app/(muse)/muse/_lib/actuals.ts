import 'server-only';
import { desc, isNotNull } from 'drizzle-orm';
import { museBatchRecords, museReceipts, museDeliveries, musePeriodBills, museOrders } from '@ct/db';
import { db } from '@/lib/db';
import { loadStandards } from './standards';
import { loadWorkingCapital, loadTimeClock, loadClosedPayrollPeriods } from './working-capital';
import { isPaymentTerms } from '../_data/working-capital';
import type {
  ActualsBundle,
  BatchRecordDoc,
  ReceiptDoc,
  DeliveryDoc,
  PeriodBillDoc,
  BillCategory,
  CrewHoursLine
} from '../_engine/actuals';
import { coolingLoadsOf, type ComponentExecution } from '../_engine/batch';

/**
 * Impact OS — actuals read layer (server-only).
 *
 * Rows become the engine's document shapes here and nowhere else. Dates come
 * back as ISO strings; cents stay cents. The working-capital documents and the
 * time clock (Roadmap Phase K) ride in the same bundle, because the ledger
 * posts them in the same periods.
 */

const iso = (d: string | Date | null): string | null =>
  d === null ? null : typeof d === 'string' ? d : d.toISOString().slice(0, 10);

type BatchRow = typeof museBatchRecords.$inferSelect;
type DeliveryRow = typeof museDeliveries.$inferSelect;

const toBatchDoc = (r: BatchRow): BatchRecordDoc => ({
  id: r.id,
  batchId: r.batchId,
  recipeCode: r.recipeCode,
  productionDate: iso(r.productionDate)!,
  standardVersion: r.standardVersion,
  plannedPortions: r.plannedPortions,
  goodPortions: r.goodPortions,
  batchesRun: r.batchesRun,
  mealsProduced: r.mealsProduced,
  // Cooling is one record per cabinet load; a record written before the lot was
  // the cook holds a single object, read as one load.
  components: ((r.components ?? []) as ComponentExecution[]).map((c) => {
    const loads = coolingLoadsOf(c);
    const rest: ComponentExecution = { ...c };
    delete rest.cooling;
    return loads.length ? { ...rest, cooling: loads } : rest;
  }),
  crew: (r.crew ?? []) as CrewHoursLine[],
  actualLaborHours: r.actualLaborHours,
  actualLaborRate: r.actualLaborRate,
  closedBy: r.closedBy,
  closedAt: r.closedAt ? r.closedAt.toISOString() : null,
  notes: r.notes,
});

/** A delivery names its recipe through the order it was recorded against (Roadmap N9). */
const toDeliveryDoc = (r: DeliveryRow, recipeByDelivery: ReadonlyMap<string, string>): DeliveryDoc => ({
  id: r.id,
  deliveredOn: iso(r.deliveredOn)!,
  phase: r.phase,
  siteId: r.siteId,
  siteName: r.siteName,
  meals: r.meals,
  pricePerMealCents: r.pricePerMealCents,
  lotCodes: (r.lotCodes ?? []) as string[],
  deliveredBy: r.deliveredBy,
  handoffTempF: r.handoffTempF,
  receivedBy: r.receivedBy,
  customerId: r.customerId,
  invoiceId: r.invoiceId,
  routeCompletedAt: r.routeCompletedAt ? r.routeCompletedAt.toISOString() : null,
  notes: r.notes,
  recipeCode: recipeByDelivery.get(r.id) ?? null,
});

async function loadRecipeByDelivery(): Promise<Map<string, string>> {
  const rows = await db.select({ deliveryId: museOrders.deliveryId, recipeCode: museOrders.recipeCode }).from(museOrders).where(isNotNull(museOrders.deliveryId));
  return new Map(rows.filter((r) => r.deliveryId).map((r) => [r.deliveryId!, r.recipeCode]));
}

/**
 * The production records only — closed batches and deliveries — for pages that read
 * stock and output and must not load the staff register or the clock (the operator
 * dashboard, Roadmap N9).
 */
export async function loadProductionRecords(): Promise<Pick<ActualsBundle, 'batches' | 'deliveries'>> {
  const [batches, deliveries, recipeByDelivery] = await Promise.all([
    db.select().from(museBatchRecords).orderBy(desc(museBatchRecords.productionDate)),
    db.select().from(museDeliveries).orderBy(desc(museDeliveries.deliveredOn)),
    loadRecipeByDelivery(),
  ]);
  return { batches: batches.map(toBatchDoc), deliveries: deliveries.map((r) => toDeliveryDoc(r, recipeByDelivery)) };
}

export async function loadActuals(): Promise<ActualsBundle> {
  const [batches, receipts, deliveries, recipeByDelivery, bills, standards, wc, clock, payrollPeriods] = await Promise.all([
    db.select().from(museBatchRecords).orderBy(desc(museBatchRecords.productionDate)),
    db.select().from(museReceipts).orderBy(desc(museReceipts.receivedOn)),
    db.select().from(museDeliveries).orderBy(desc(museDeliveries.deliveredOn)),
    loadRecipeByDelivery(),
    db.select().from(musePeriodBills).orderBy(desc(musePeriodBills.period)),
    loadStandards(),
    loadWorkingCapital(),
    loadTimeClock(),
    loadClosedPayrollPeriods(),
  ]);

  return {
    standards,
    ...wc,
    ...clock,
    payrollPeriods,
    batches: batches.map(toBatchDoc),
    receipts: receipts.map(
      (r): ReceiptDoc => ({
        id: r.id,
        poId: r.poId,
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        receivedOn: iso(r.receivedOn)!,
        invoiceNumber: r.invoiceNumber,
        invoiceTotalCents: r.invoiceTotalCents,
        lines: (r.lines ?? []) as ReceiptDoc['lines'],
        receivedBy: r.receivedBy,
        notes: r.notes,
      }),
    ),
    deliveries: deliveries.map((r) => toDeliveryDoc(r, recipeByDelivery)),
    bills: bills.map(
      (r): PeriodBillDoc => ({
        id: r.id,
        period: r.period,
        category: r.category as BillCategory,
        accountCode: r.accountCode,
        amountCents: r.amountCents,
        vendor: r.vendor,
        invoiceNumber: r.invoiceNumber,
        incurredOn: iso(r.incurredOn),
        paidOn: iso(r.paidOn),
        paymentTerms: isPaymentTerms(r.paymentTerms) ? r.paymentTerms : null,
        notes: r.notes,
      }),
    ),
  };
}
