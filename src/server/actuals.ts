import 'server-only';
import { EMPTY_STAGE_RECORDS, type StageRecords } from '@/engine/sowing-record';
import type { TrayFormatKey } from '@/data/tray-formats';
import { desc, isNotNull } from 'drizzle-orm';
import { farmSowingRecords, farmReceipts, farmDistributions, farmPeriodBills, farmOrders } from '@/db';
import { db } from '@/lib/db';
import { loadStandards } from '@/server/standards';
import { loadWorkingCapital, loadTimeClock, loadClosedPayrollPeriods } from '@/server/working-capital';
import { isPaymentTerms } from '@/data/working-capital';
import type {
  ActualsBundle,
  SowingRecordDoc,
  ReceiptDoc,
  DistributionDoc,
  PeriodBillDoc,
  BillCategory,
  CrewHoursLine
} from '@/engine/actuals';
import type { SowingIssue, VarietyLot } from '@/engine/sowing';

/**
 * MicroFarm — actuals read layer (server-only).
 *
 * Rows become the engine's document shapes here and nowhere else. Dates come
 * back as ISO strings; cents stay cents. The working-capital documents and the
 * time clock (Roadmap Phase K) ride in the same bundle, because the ledger
 * posts them in the same periods.
 */

const iso = (d: string | Date | null): string | null =>
  d === null ? null : typeof d === 'string' ? d : d.toISOString().slice(0, 10);

type SowingRow = typeof farmSowingRecords.$inferSelect;
type DistributionRow = typeof farmDistributions.$inferSelect;

const toSowingDoc = (r: SowingRow): SowingRecordDoc => ({
  id: r.id,
  sowingId: r.sowingId,
  growPlanCode: r.growPlanCode,
  productionDate: iso(r.productionDate)!,
  standardVersion: r.standardVersion,
  plannedUnits: r.plannedUnits,
  goodUnits: r.goodUnits,
  sowingsRun: r.sowingsRun,
  servingsProduced: r.servingsProduced,
  lots: (r.lots ?? []) as VarietyLot[],
  issues: (r.issues ?? []) as SowingIssue[],
  crew: (r.crew ?? []) as CrewHoursLine[],
  actualLaborHours: r.actualLaborHours,
  actualLaborRate: r.actualLaborRate,
  closedBy: r.closedBy,
  closedAt: r.closedAt ? r.closedAt.toISOString() : null,
  notes: r.notes,
  format: (r.format as TrayFormatKey | null) ?? null,
  traysSown: r.traysSown ?? null,
  traysPacked: r.traysPacked ?? null,
  growUnitKey: r.growUnitKey ?? null,
  packedOn: iso(r.packedOn),
  stageRecords: r.stageRecords ? { ...EMPTY_STAGE_RECORDS, ...(r.stageRecords as Partial<StageRecords>) } : null,
  experimentId: r.experimentId ?? null,
});

/** A distribution names its grow plan through the order it was recorded against (Roadmap N9). */
const toDistributionDoc = (r: DistributionRow, growPlanByDistribution: ReadonlyMap<string, string>): DistributionDoc => ({
  id: r.id,
  distributedOn: iso(r.distributedOn)!,
  phase: r.phase,
  pickupPointId: r.pickupPointId,
  pickupPointName: r.pickupPointName,
  units: r.units,
  pricePerUnitCents: r.pricePerUnitCents,
  lotCodes: (r.lotCodes ?? []) as string[],
  distributedBy: r.distributedBy,
  handoffTempF: r.handoffTempF,
  receivedBy: r.receivedBy,
  subscriberId: r.subscriberId,
  invoiceId: r.invoiceId,
  routeCompletedAt: r.routeCompletedAt ? r.routeCompletedAt.toISOString() : null,
  notes: r.notes,
  growPlanCode: growPlanByDistribution.get(r.id) ?? null,
});

async function loadGrowPlanByDistribution(): Promise<Map<string, string>> {
  const rows = await db.select({ distributionId: farmOrders.distributionId, growPlanCode: farmOrders.growPlanCode }).from(farmOrders).where(isNotNull(farmOrders.distributionId));
  return new Map(rows.filter((r) => r.distributionId).map((r) => [r.distributionId!, r.growPlanCode]));
}

/**
 * The production records only — closed sowings and distributions — for pages that read
 * stock and output and must not load the staff register or the clock (the operator
 * dashboard, Roadmap N9).
 */
export async function loadProductionRecords(): Promise<Pick<ActualsBundle, 'sowings' | 'distributions'>> {
  const [sowings, distributions, growPlanByDistribution] = await Promise.all([
    db.select().from(farmSowingRecords).orderBy(desc(farmSowingRecords.productionDate)),
    db.select().from(farmDistributions).orderBy(desc(farmDistributions.distributedOn)),
    loadGrowPlanByDistribution(),
  ]);
  return { sowings: sowings.map(toSowingDoc), distributions: distributions.map((r) => toDistributionDoc(r, growPlanByDistribution)) };
}

export async function loadActuals(): Promise<ActualsBundle> {
  const [sowings, receipts, distributions, growPlanByDistribution, bills, standards, wc, clock, payrollPeriods] = await Promise.all([
    db.select().from(farmSowingRecords).orderBy(desc(farmSowingRecords.productionDate)),
    db.select().from(farmReceipts).orderBy(desc(farmReceipts.receivedOn)),
    db.select().from(farmDistributions).orderBy(desc(farmDistributions.distributedOn)),
    loadGrowPlanByDistribution(),
    db.select().from(farmPeriodBills).orderBy(desc(farmPeriodBills.period)),
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
    sowings: sowings.map(toSowingDoc),
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
    distributions: distributions.map((r) => toDistributionDoc(r, growPlanByDistribution)),
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
