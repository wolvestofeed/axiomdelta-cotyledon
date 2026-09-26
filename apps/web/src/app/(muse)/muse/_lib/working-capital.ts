import 'server-only';
import { asc, desc } from 'drizzle-orm';
import {
  museSupplierTerms,
  museInvoices,
  museCustomerPayments,
  museSupplierBills,
  museSupplierPayments,
  museOpeningBalances,
  museStaff,
  museTimePunches,
  musePayrollPeriods,
} from '@ct/db';
import { db } from '@/lib/db';
import { isWorkRole } from '../_engine/payroll';
import { isPaymentTerms, isCustomerPaymentTerms, type PaymentTerms } from '../_data/working-capital';
import type { OpeningBalanceDoc } from '../_engine/actuals';
import type { InvoiceDoc, CustomerPaymentDoc, SupplierBillDoc, SupplierPaymentDoc, PaymentApplication, BillLine } from '../_engine/working-capital';
import type { StaffDoc, PunchDoc, PunchKind, ClosedPayrollPeriodDoc } from '../_engine/payroll';

/**
 * Impact OS — working capital and time clock, read layer
 * (server-only, Roadmap Phase K). Rows become the engine's document shapes
 * here and nowhere else. Dates come back as ISO strings; cents stay cents.
 */

const isoDay = (d: string | Date | null): string | null => (d === null ? null : typeof d === 'string' ? d : d.toISOString().slice(0, 10));

const applicationsOf = (v: unknown): PaymentApplication[] =>
  Array.isArray(v)
    ? v
        .map((a) => a as { documentId?: unknown; amountCents?: unknown })
        .filter((a) => typeof a.documentId === 'string' && typeof a.amountCents === 'number')
        .map((a) => ({ documentId: a.documentId as string, amountCents: a.amountCents as number }))
    : [];

/** Terms on file per supplier id. A supplier with none is absent. */
export async function loadSupplierTerms(): Promise<Record<string, PaymentTerms>> {
  const rows = await db.select().from(museSupplierTerms);
  const out: Record<string, PaymentTerms> = {};
  for (const r of rows) if (isPaymentTerms(r.paymentTerms)) out[r.supplierId] = r.paymentTerms;
  return out;
}

export interface WorkingCapitalDocs {
  openingBalances: OpeningBalanceDoc[];
  invoices: InvoiceDoc[];
  customerPayments: CustomerPaymentDoc[];
  supplierBills: SupplierBillDoc[];
  supplierPayments: SupplierPaymentDoc[];
}

export async function loadWorkingCapital(): Promise<WorkingCapitalDocs> {
  const [opening, invoices, cpay, bills, spay] = await Promise.all([
    db.select().from(museOpeningBalances).orderBy(asc(museOpeningBalances.asOf)),
    db.select().from(museInvoices).orderBy(desc(museInvoices.openedOn), desc(museInvoices.invoiceNumber)),
    db.select().from(museCustomerPayments).orderBy(desc(museCustomerPayments.receivedOn)),
    db.select().from(museSupplierBills).orderBy(desc(museSupplierBills.billDate)),
    db.select().from(museSupplierPayments).orderBy(desc(museSupplierPayments.paidOn)),
  ]);
  return {
    openingBalances: opening.map((r) => ({
      id: r.id,
      asOf: isoDay(r.asOf)!,
      ownerEquityCents: r.ownerEquityCents,
      fixedAssetsCents: r.fixedAssetsCents,
      longTermDebtCents: r.longTermDebtCents,
      notes: r.notes,
    })),
    invoices: invoices.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      customerId: r.customerId,
      customerName: r.customerName,
      period: r.period,
      status: r.status === 'issued' ? 'issued' : 'open',
      openedOn: isoDay(r.openedOn)!,
      paymentTerms: isCustomerPaymentTerms(r.paymentTerms) ? r.paymentTerms : null,
      issuedOn: isoDay(r.issuedOn),
      dueOn: isoDay(r.dueOn),
      issuedBy: r.issuedBy,
      notes: r.notes,
    })),
    customerPayments: cpay.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      customerName: r.customerName,
      receivedOn: isoDay(r.receivedOn)!,
      amountCents: r.amountCents,
      method: r.method,
      reference: r.reference,
      applications: applicationsOf(r.applications),
      notes: r.notes,
    })),
    supplierBills: bills
      .filter((r) => isPaymentTerms(r.paymentTerms))
      .map((r) => ({
        id: r.id,
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        billNumber: r.billNumber,
        billDate: isoDay(r.billDate)!,
        paymentTerms: r.paymentTerms as PaymentTerms,
        receiptIds: Array.isArray(r.receiptIds) ? (r.receiptIds as unknown[]).filter((x): x is string => typeof x === 'string') : [],
        lines: (Array.isArray(r.lines) ? r.lines : []) as BillLine[],
        notes: r.notes,
      })),
    supplierPayments: spay.map((r) => ({
      id: r.id,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      paidOn: isoDay(r.paidOn)!,
      amountCents: r.amountCents,
      method: r.method,
      reference: r.reference,
      applications: applicationsOf(r.applications),
      notes: r.notes,
    })),
  };
}

/**
 * Pay periods closed in CompTable (Roadmap O1): totals by account and hours.
 * None arrive until the CompTable connection exists.
 */
export async function loadClosedPayrollPeriods(): Promise<ClosedPayrollPeriodDoc[]> {
  const rows = await db.select().from(musePayrollPeriods).orderBy(asc(musePayrollPeriods.periodStart));
  return rows.map((r) => ({
    id: r.id,
    comptableRef: r.comptableRef,
    periodStart: isoDay(r.periodStart)!,
    periodEnd: isoDay(r.periodEnd)!,
    payDate: isoDay(r.payDate)!,
    wagesCents: r.wagesCents,
    payrollTaxesCents: r.payrollTaxesCents,
    workersCompCents: r.workersCompCents,
    benefitsCents: r.benefitsCents,
    regularHours: r.regularHours,
    overtimeHours: r.overtimeHours,
    receivedAt: r.receivedAt.toISOString(),
  }));
}

/** The staff register and the punches. No pay is held in Muse (Roadmap O1). */
export async function loadTimeClock(): Promise<{ staff: StaffDoc[]; punches: PunchDoc[] }> {
  const [staff, punches] = await Promise.all([
    db.select().from(museStaff).orderBy(asc(museStaff.name)),
    db.select().from(museTimePunches).orderBy(asc(museTimePunches.punchedAt)),
  ]);
  return {
    staff: staff.map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      roles: (r.roles ?? []).filter(isWorkRole),
      employeeRef: r.employeeRef,
      email: r.email,
      status: r.status === 'inactive' ? 'inactive' : 'active',
      startedOn: isoDay(r.startedOn),
      notes: r.notes,
    })),
    punches: punches.map((r) => ({
      id: r.id,
      staffId: r.staffId,
      kind: r.kind as PunchKind,
      punchedAt: r.punchedAt.toISOString(),
      role: isWorkRole(r.role) ? r.role : null,
      source: r.source === 'manual' ? 'manual' : 'clock',
      reason: r.reason,
      recordedBy: r.recordedBy,
    })),
  };
}
