import 'server-only';
import { asc } from 'drizzle-orm';
import { farmLoans, farmFixedCostLines, farmLeaseholdLines } from '@/db';
import { db } from '@/lib/db';
import {
  seedFixedCostLines,
  type FixedCostLineDef,
  type FixedCostStatus,
  type FixedCostTreatment,
  type LoanDef,
  type LoanPurpose,
  type LoanStatus,
} from '@/data/finance';
import { withSeedLock, insertLoans, insertFixedCostLines, insertLeaseholdLines, dbSeedLoans } from '@/server/seed-writes';
import { leaseholdSeed, type LeaseholdLine } from '@/data/capex';

/**
 * MicroFarm — loans and fixed-cost lines read layer (server-only).
 *
 * On first read of an empty table the seed is written under an advisory lock:
 * the two loans the plan carries, at the capex totals in force on the day the
 * seed runs, and the three monthly fixed costs the constants carried. Seeding
 * from the LIVE equipment library rather than the code schedule is deliberate —
 * the seeded principal then matches what Capital & Financing showed that day.
 */

const iso = (d: string | Date | null): string | null =>
  d === null ? null : typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);

async function seedLoansIfEmpty(): Promise<void> {
  const any = await db.select({ id: farmLoans.id }).from(farmLoans).limit(1);
  if (any[0]) return;
  await withSeedLock(db, 'finance', async (tx) => {
    const again = await tx.select({ id: farmLoans.id }).from(farmLoans).limit(1);
    if (again[0]) return;
    await insertLoans(tx, dbSeedLoans());
  });
}

async function seedFixedCostsIfEmpty(): Promise<void> {
  const any = await db.select({ id: farmFixedCostLines.id }).from(farmFixedCostLines).limit(1);
  if (any[0]) return;
  await withSeedLock(db, 'finance', async (tx) => {
    const again = await tx.select({ id: farmFixedCostLines.id }).from(farmFixedCostLines).limit(1);
    if (again[0]) return;
    await insertFixedCostLines(tx, seedFixedCostLines());
  });
}

export async function listLoans(): Promise<LoanDef[]> {
  await seedLoansIfEmpty();
  const rows = await db.select().from(farmLoans).orderBy(asc(farmLoans.position), asc(farmLoans.createdAt));
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    purpose: r.purpose as LoanPurpose,
    status: r.status as LoanStatus,
    principalCents: r.principalCents,
    apr: r.apr,
    termMonths: r.termMonths,
    startDate: iso(r.startDate) ?? r.startDate,
    notes: r.notes,
    source: r.source === 'seed' ? 'seed' : 'user_built',
  }));
}

export async function listFixedCostLines(): Promise<FixedCostLineDef[]> {
  await seedFixedCostsIfEmpty();
  const rows = await db
    .select()
    .from(farmFixedCostLines)
    .orderBy(asc(farmFixedCostLines.position), asc(farmFixedCostLines.createdAt));
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    label: r.label,
    category: r.category,
    setting: r.setting === 'home' ? 'home' : 'commercial',
    treatment: r.treatment as FixedCostTreatment,
    status: r.status as FixedCostStatus,
    monthlyAmountCents: r.monthlyAmountCents,
    startDate: iso(r.startDate),
    endDate: iso(r.endDate),
    notes: r.notes,
    source: r.source === 'seed' ? 'seed' : 'user_built',
  }));
}

async function seedLeaseholdIfEmpty(): Promise<void> {
  const any = await db.select({ id: farmLeaseholdLines.id }).from(farmLeaseholdLines).limit(1);
  if (any[0]) return;
  await withSeedLock(db, 'leasehold', async (tx) => {
    const again = await tx.select({ id: farmLeaseholdLines.id }).from(farmLeaseholdLines).limit(1);
    if (again[0]) return;
    await insertLeaseholdLines(tx, leaseholdSeed);
  });
}

export async function listLeasehold(): Promise<LeaseholdLine[]> {
  await seedLeaseholdIfEmpty();
  const rows = await db
    .select()
    .from(farmLeaseholdLines)
    .orderBy(asc(farmLeaseholdLines.position), asc(farmLeaseholdLines.createdAt));
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    item: r.item,
    extended: r.extendedCents / 100,
    counted: r.counted,
    note: r.notes ?? undefined,
  }));
}
