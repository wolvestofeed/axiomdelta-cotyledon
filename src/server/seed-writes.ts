import { eq, inArray, ne, sql } from 'drizzle-orm';
import { farmSubscribers, farmSubscriberPickupPoints, farmSubscriberServices, farmServiceVolumePicks, farmPickupPointCalendarRanges, farmEquipment, farmFixedCostLines, farmLeaseholdLines, farmLoans, farmSubscriptionCycles, farmSubscriptionCycleDays, farmPackages, farmCropPlans, farmCropPlanLines, farmTimeStudies, farmTimeStudyLines, type DbHandle } from '@/db';
import type { EquipmentLine, LeaseholdLine } from '@/data/capex';
import { seedLoans, type FixedCostLineDef, type LoanDef } from '@/data/finance';
import type { PackageSeed } from '@/data/packaging';
import type { TimeStudySeed } from '@/data/time-studies';
import { planSeedSubscribers, type SubscriberDef } from '@/data/subscribers';
import { seedSubscriptionCycles, seedFlatPlans, DEFAULT_WEEKDAYS, type SubscriptionCycleDef } from '@/data/subscription-cycles';
import { growPlanSeed } from '@/data/grow-plans-seed';
import type { GrowPlanDef } from '@/data/grow-plan';
import { cropPlanToRows, type LibraryCropPlan } from '@/engine/crop-plan-library';

/**
 * MicroFarm — the placeholder seed, written once.
 *
 * One writer for the read layers (`_lib/subscribers.ts`, `_lib/crop-plans.ts`,
 * `_lib/orders.ts`) and the reset script (`pnpm farm:reseed`), so the rows the
 * database starts with come from one place. Every seed runs inside a
 * transaction holding an advisory lock: the layout and a page read the same
 * table in parallel on a first render, and without the lock both inserted the
 * placeholders.
 *
 * Not `server-only`: the reset script runs outside Next.
 */

/** Any Drizzle handle or transaction that can read and write. */
export type SeedDb = Pick<DbHandle['db'], 'select' | 'insert' | 'delete' | 'update'>;

const LOCK = { cropPlans: 74_001, subscribers: 74_002, cycles: 74_003, equipment: 74_004, packaging: 74_005, timeStudies: 74_006, finance: 74_007, leasehold: 74_008 } as const;

export async function withSeedLock<T>(db: DbHandle['db'], key: keyof typeof LOCK, fn: (tx: SeedDb) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK[key]})`);
    return fn(tx as unknown as SeedDb);
  });
}

/** Insert the equipment library seed in list order (Roadmap N1). Idempotent on the key. */
export async function insertEquipment(db: SeedDb, lines: readonly EquipmentLine[]): Promise<number> {
  if (lines.length === 0) return 0;
  await db
    .insert(farmEquipment)
    .values(
      lines.map((l, position) => ({
        key: l.key,
        position,
        item: l.item,
        category: l.category,
        setting: l.setting,
        buildPhase: l.phase,
        status: l.status,
        inServiceDate: l.inServiceDate,
        newUsed: l.newUsed,
        qty: l.qty,
        unitCostCents: Math.round(l.unitCostNew * 100),
        critical: l.critical,
        notes: l.note ?? null,
        shelves: l.shelves ?? null,
        shelfWidthIn: l.shelfWidthIn ?? null,
        fixtureKey: l.fixtureKey ?? null,
        sowingCapacityLb: l.sowingCapacityLb ?? null,
        sowingCapacityBasis: l.sowingCapacityBasis ?? 'estimated',
        concurrentSowings: l.concurrentSowings ?? null,
        changeoverMinutes: l.changeoverMinutes ?? null,
        attendedRun: l.attendedRun ?? null,
        mayRunUnattended: l.mayRunUnattended ?? null,
        resourceBasis: l.resourceBasis ?? 'estimated',
        footprintWidthIn: l.footprintWidthIn ?? null,
        footprintDepthIn: l.footprintDepthIn ?? null,
        clearanceFrontIn: l.clearanceFrontIn ?? null,
        clearanceRearIn: l.clearanceRearIn ?? null,
        clearanceSideIn: l.clearanceSideIn ?? null,
        footprintBasis: l.footprintBasis ?? 'estimated',
        zone: l.zone ?? null,
        underHood: l.underHood ?? false,
        footprintSource: l.footprintSource ?? null,
        manufacturer: l.manufacturer ?? null,
        model: l.model ?? null,
        specSheetUrl: l.specSheetUrl ?? null,
        source: 'seed',
      })),
    )
    .onConflictDoNothing({ target: [farmEquipment.workspaceId, farmEquipment.key] });
  return lines.length;
}

/** Insert a time study and its task lines for a crop plan (Roadmap O2). Returns the study id. */
export async function insertTimeStudy(db: SeedDb, cropPlanId: string, study: TimeStudySeed, source: 'seed' | 'user_built', createdBy: string | null = null): Promise<string | null> {
  const rows = await db
    .insert(farmTimeStudies)
    .values({ cropPlanId, studiedOn: study.studiedOn, sowingSize: study.sowingSize, cycleDays: study.cycleDays, observer: study.observer, qualityResult: study.qualityResult, qualityNotes: study.qualityNotes, source, basis: study.basis, consumption: study.consumption, createdBy })
    .returning({ id: farmTimeStudies.id });
  const id = rows[0]?.id ?? null;
  if (!id) return null;
  if (study.lines.length > 0) {
    await db.insert(farmTimeStudyLines).values(
      study.lines.map((l, position) => ({ studyId: id, position, task: l.task, station: l.station, staff: l.staff, elapsedMinutes: l.elapsedMinutes, laborMinutes: l.laborMinutes, scalesWith: l.scalesWith, stream: l.stream })),
    );
  }
  return id;
}

/** Insert the packaging library seed (Roadmap N1). */
export async function insertPackages(db: SeedDb, rows: readonly PackageSeed[]): Promise<number> {
  if (rows.length === 0) return 0;
  await db.insert(farmPackages).values(
    rows.map((p) => ({
      name: p.name,
      channels: p.channels,
      temperature: p.temperature,
      material: p.material,
      sizeValue: p.sizeValue,
      sizeUnit: p.sizeUnit,
      endOfUse: p.endOfUse,
      endOfUseRank: p.endOfUseRank,
      manualUnitCost: p.manualUnitCost,
      supplierItemId: p.supplierItemId,
      supplierUnitsPerPack: p.supplierUnitsPerPack,
      notes: p.notes,
      source: 'seed',
    })),
  );
  return rows.length;
}

/** Insert every seed grow plan whose code is not in the library. Idempotent on the code. */
export async function seedMissingCropPlans(db: SeedDb, library: readonly GrowPlanDef[] = growPlanSeed, effectiveFrom = new Date().toISOString().slice(0, 10)): Promise<string[]> {
  const codes = library.map((r) => r.code);
  const have = new Set((await db.select({ code: farmCropPlans.code }).from(farmCropPlans).where(inArray(farmCropPlans.code, codes))).map((r) => r.code));
  const added: string[] = [];
  for (const r of library) {
    if (have.has(r.code)) continue;
    const { header, lines } = cropPlanToRows(r);
    const inserted = await db
      .insert(farmCropPlans)
      .values({ ...header, source: 'seed', effectiveFrom })
      .onConflictDoNothing({ target: [farmCropPlans.workspaceId, farmCropPlans.code] })
      .returning({ id: farmCropPlans.id });
    const id = inserted[0]?.id;
    if (!id) continue;
    if (lines.length > 0) await db.insert(farmCropPlanLines).values(lines.map((l) => ({ cropPlanId: id, ...l })));
    added.push(r.code);
  }
  return added;
}

/**
 * Bring every plan still `source = 'seed'` in line with the code seed: the header (channels,
 * format, stage days, note) and the lines. Status is left alone (it is edited in the library). A
 * row someone has edited is `user_built` and is not touched. Used by the reset script only; the
 * read path inserts and never rewrites.
 */
export async function syncSeedCropPlans(db: SeedDb, library: readonly GrowPlanDef[] = growPlanSeed): Promise<string[]> {
  const rows = await db.select({ id: farmCropPlans.id, code: farmCropPlans.code, source: farmCropPlans.source, version: farmCropPlans.version }).from(farmCropPlans).where(inArray(farmCropPlans.code, library.map((r) => r.code)));
  const synced: string[] = [];
  for (const row of rows) {
    if (row.source !== 'seed') continue;
    const r = library.find((x) => x.code === row.code);
    if (!r) continue;
    const { header, lines } = cropPlanToRows(r);
    await db
      .update(farmCropPlans)
      .set({ name: header.name, channels: header.channels, format: header.format, stageDays: header.stageDays, note: header.note, version: row.version + 1, effectiveFrom: new Date().toISOString().slice(0, 10), updatedAt: new Date() })
      .where(eq(farmCropPlans.id, row.id));
    await db.delete(farmCropPlanLines).where(eq(farmCropPlanLines.cropPlanId, row.id));
    if (lines.length > 0) await db.insert(farmCropPlanLines).values(lines.map((l) => ({ cropPlanId: row.id, ...l })));
    synced.push(row.code);
  }
  return synced;
}

/** Insert the loan seed in list order (Roadmap N1). */
export async function insertLoans(db: SeedDb, loans: readonly LoanDef[]): Promise<number> {
  if (loans.length === 0) return 0;
  await db.insert(farmLoans).values(
    loans.map((l, position) => ({
      key: l.key,
      label: l.label,
      purpose: l.purpose,
      status: l.status,
      principalCents: l.principalCents,
      apr: l.apr,
      termMonths: l.termMonths,
      startDate: l.startDate,
      notes: l.notes,
      position,
      source: 'seed',
    })),
  )
    .onConflictDoNothing({ target: [farmLoans.workspaceId, farmLoans.key] });
  return loans.length;
}

/** Insert the leasehold schedule seed in list order (Roadmap N1). */
export async function insertLeaseholdLines(db: SeedDb, lines: readonly LeaseholdLine[]): Promise<number> {
  if (lines.length === 0) return 0;
  await db.insert(farmLeaseholdLines).values(
    lines.map((l, position) => ({
      key: l.key,
      item: l.item,
      extendedCents: Math.round(l.extended * 100),
      counted: l.counted,
      notes: l.note ?? null,
      position,
      source: 'seed',
    })),
  )
    .onConflictDoNothing({ target: [farmLeaseholdLines.workspaceId, farmLeaseholdLines.key] });
  return lines.length;
}

/** Insert the fixed-cost line seed in list order (Roadmap N1). */
export async function insertFixedCostLines(db: SeedDb, lines: readonly FixedCostLineDef[]): Promise<number> {
  if (lines.length === 0) return 0;
  await db.insert(farmFixedCostLines).values(
    lines.map((l, position) => ({
      key: l.key,
      label: l.label,
      category: l.category,
      setting: l.setting,
      treatment: l.treatment,
      status: l.status,
      monthlyAmountCents: l.monthlyAmountCents,
      startDate: l.startDate,
      endDate: l.endDate,
      notes: l.notes,
      position,
      source: 'seed',
    })),
  )
    .onConflictDoNothing({ target: [farmFixedCostLines.workspaceId, farmFixedCostLines.key] });
  return lines.length;
}

/** The loan seed: none (`seedLoans`). */
export function dbSeedLoans(): LoanDef[] {
  return seedLoans();
}

export async function insertSubscribers(db: SeedDb, subscribers: readonly SubscriberDef[]): Promise<number> {
  let n = 0;
  for (const c of subscribers) {
    const inserted = await db
      .insert(farmSubscribers)
      .values({
        name: c.name,
        kind: c.kind,
        channel: c.channel,
        status: c.status,
        pricePerUnitCents: c.pricePerUnitCents,
        paymentTerms: c.paymentTerms,
        contractStart: c.contractStart,
        contractEnd: c.contractEnd,
        prospectId: c.prospectId,
        notes: c.notes,
        source: 'seed',
      })
      .returning({ id: farmSubscribers.id });
    const id = inserted[0]?.id;
    if (!id) continue;
    n++;
    for (const s of c.pickupPoints) {
      const pickupPoint = await db
        .insert(farmSubscriberPickupPoints)
        .values({
          subscriberId: id,
          pickupPointId: s.pickupPointId,
          name: s.name,
          trayFormats: s.trayFormats,
          serviceDaysPerYear: s.serviceDaysPerYear,
          enrollment: s.enrollment,
          participationRate: s.participationRate,
          expectedUnitsPerDay: s.expectedUnitsPerDay,
          status: s.status,
          notes: s.notes,
        })
        .returning({ id: farmSubscriberPickupPoints.id });
      const pickupPointId = pickupPoint[0]?.id;
      if (!pickupPointId) continue;
      await insertPickupPointServices(db, pickupPointId, s);
    }
  }
  return n;
}

/** A pickup point's services, their volume picks and its calendar (Roadmap N4a). */
export async function insertPickupPointServices(db: SeedDb, pickupPointId: string, s: Pick<SubscriberDef['pickupPoints'][number], 'services' | 'calendar'>): Promise<void> {
  for (const [position, sv] of s.services.entries()) {
    const row = await db
      .insert(farmSubscriberServices)
      .values({ subscriberPickupPointId: pickupPointId, name: sv.name, weekdays: sv.weekdays, status: sv.status, position, notes: sv.notes })
      .returning({ id: farmSubscriberServices.id });
    const serviceId = row[0]?.id;
    if (!serviceId || sv.picks.length === 0) continue;
    await db.insert(farmServiceVolumePicks).values(sv.picks.map((p) => ({ serviceId, effectiveDate: p.effectiveDate, units: p.units, notes: p.notes })));
  }
  if (s.calendar.length > 0) {
    await db.insert(farmPickupPointCalendarRanges).values(s.calendar.map((r) => ({ subscriberPickupPointId: pickupPointId, kind: r.kind, label: r.label, startDate: r.startDate, endDate: r.endDate })));
  }
}

export async function insertSubscriptionCycles(db: SeedDb, cycles: readonly SubscriptionCycleDef[]): Promise<number> {
  let n = 0;
  for (const c of cycles) {
    const inserted = await db
      .insert(farmSubscriptionCycles)
      .values({
        channel: null,
        subscriberId: c.subscriberId,
        subscriberServiceId: c.subscriberServiceId,
        fromCycleId: c.fromCycleId,
        name: c.name,
        startDate: c.startDate,
        endDate: c.endDate,
        lengthDays: c.lengthDays,
        weekdays: c.weekdays,
        status: c.status,
        notes: c.notes,
        source: 'seed',
      })
      .returning({ id: farmSubscriptionCycles.id });
    const id = inserted[0]?.id;
    if (!id) continue;
    n++;
    if (c.days.length) await db.insert(farmSubscriptionCycleDays).values(c.days.map((d) => ({ cycleId: id, day: d.day, cropPlanCode: d.cropPlanCode })));
  }
  return n;
}

/**
 * The database's subscriber seed (Roadmap N1): the one contracted subscriber at its
 * stated 125 units a day, and a prospect per channel carrying no volume. The
 * crop plan library is no longer read for it — seeded demand is what is
 * contracted, not what the grow units could hold.
 */
export function dbSeedSubscribers(): SubscriberDef[] {
  return planSeedSubscribers();
}

export function dbSeedSubscriptionCycles(library: readonly (GrowPlanDef | LibraryCropPlan)[], today: string): SubscriptionCycleDef[] {
  return seedSubscriptionCycles(library, today);
}

/**
 * A flat plan for every subscriber that is not inactive and has none, copied
 * from the saved cycle its channel's crop plans are offered from (Roadmap N4a).
 * Runs after either seed, so whichever of subscribers and cycles lands second
 * completes the pair. Returns the plans inserted.
 */
export async function insertMissingFlatPlans(db: SeedDb): Promise<number> {
  const subscribers = await db.select({ id: farmSubscribers.id, channel: farmSubscribers.channel, status: farmSubscribers.status }).from(farmSubscribers).where(ne(farmSubscribers.status, 'inactive'));
  if (subscribers.length === 0) return 0;
  const rows = await db.select().from(farmSubscriptionCycles);
  const saved = rows.filter((r) => r.subscriberId === null);
  if (saved.length === 0) return 0;
  const days = await db.select().from(farmSubscriptionCycleDays).where(inArray(farmSubscriptionCycleDays.cycleId, saved.map((r) => r.id)));
  const cycles: SubscriptionCycleDef[] = rows.map((r) => ({
    id: r.id,
    channel: null,
    subscriberId: r.subscriberId,
    subscriberServiceId: r.subscriberServiceId,
    fromCycleId: r.fromCycleId,
    name: r.name,
    startDate: typeof r.startDate === 'string' ? r.startDate : String(r.startDate),
    endDate: r.endDate === null ? null : String(r.endDate),
    lengthDays: r.lengthDays,
    weekdays: Array.isArray(r.weekdays) ? (r.weekdays as number[]) : [...DEFAULT_WEEKDAYS],
    status: r.status === 'inactive' ? 'inactive' : 'active',
    notes: r.notes,
    source: r.source === 'seed' ? 'seed' : 'user_built',
    days: days.filter((d) => d.cycleId === r.id).map((d) => ({ day: d.day, cropPlanCode: d.cropPlanCode })),
  }));
  return insertSubscriptionCycles(db, seedFlatPlans(subscribers, cycles));
}

/** Remove every seed row (source = 'seed') so the next read seeds afresh. Orders on seed subscribers cascade. */
export async function deleteSeedRows(db: SeedDb): Promise<{ subscribers: number; cycles: number }> {
  const c = await db.delete(farmSubscribers).where(eq(farmSubscribers.source, 'seed')).returning({ id: farmSubscribers.id });
  const y = await db.delete(farmSubscriptionCycles).where(eq(farmSubscriptionCycles.source, 'seed')).returning({ id: farmSubscriptionCycles.id });
  return { subscribers: c.length, cycles: y.length };
}

/**
 * Bring a workspace's seed rows in line with the code seed for the home and commercial setup:
 * equipment and fixed-cost lines still `source = 'seed'` take the seed's values, seed rows the
 * seed no longer carries are removed (the retired build-out and loans with them), and seed rows
 * a workspace lacks are added. A row edited in the app is user-built and untouched, except that
 * a Grow room row is a home row wherever it came from.
 */
export async function syncSetupSeed(db: SeedDb, equipment: readonly EquipmentLine[], fixedCosts: readonly FixedCostLineDef[]): Promise<{ equipmentRemoved: number; equipmentUpdated: number; fixedRemoved: number; fixedUpdated: number; leaseholdRemoved: number; loansRemoved: number }> {
  const keys = new Set(equipment.map((l) => l.key));
  const seedRows = await db.select({ id: farmEquipment.id, key: farmEquipment.key }).from(farmEquipment).where(eq(farmEquipment.source, 'seed'));
  const retired = seedRows.filter((r) => !keys.has(r.key));
  if (retired.length) await db.delete(farmEquipment).where(inArray(farmEquipment.id, retired.map((r) => r.id)));
  let equipmentUpdated = 0;
  for (const r of seedRows.filter((x) => keys.has(x.key))) {
    const position = equipment.findIndex((l) => l.key === r.key);
    const l = equipment[position]!;
    await db
      .update(farmEquipment)
      .set({
        position, item: l.item, category: l.category, setting: l.setting, buildPhase: l.phase, status: l.status, inServiceDate: l.inServiceDate, newUsed: l.newUsed, qty: l.qty,
        unitCostCents: Math.round(l.unitCostNew * 100), critical: l.critical, notes: l.note ?? null, shelves: l.shelves ?? null, shelfWidthIn: l.shelfWidthIn ?? null, fixtureKey: l.fixtureKey ?? null,
        sowingCapacityLb: l.sowingCapacityLb ?? null, sowingCapacityBasis: l.sowingCapacityBasis ?? 'estimated', concurrentSowings: l.concurrentSowings ?? null, changeoverMinutes: l.changeoverMinutes ?? null,
        attendedRun: l.attendedRun ?? null, mayRunUnattended: l.mayRunUnattended ?? null, resourceBasis: l.resourceBasis ?? 'estimated',
      })
      .where(eq(farmEquipment.id, r.id));
    equipmentUpdated += 1;
  }
  await insertEquipment(db, equipment);
  await db.update(farmEquipment).set({ setting: 'home' }).where(eq(farmEquipment.category, 'Grow room'));

  const fixedKeys = new Set(fixedCosts.map((l) => l.key));
  const fixedRows = await db.select({ id: farmFixedCostLines.id, key: farmFixedCostLines.key }).from(farmFixedCostLines).where(eq(farmFixedCostLines.source, 'seed'));
  const fixedRetired = fixedRows.filter((r) => !fixedKeys.has(r.key));
  if (fixedRetired.length) await db.delete(farmFixedCostLines).where(inArray(farmFixedCostLines.id, fixedRetired.map((r) => r.id)));
  let fixedUpdated = 0;
  for (const r of fixedRows.filter((x) => fixedKeys.has(x.key))) {
    const position = fixedCosts.findIndex((l) => l.key === r.key);
    const l = fixedCosts[position]!;
    await db
      .update(farmFixedCostLines)
      .set({ position, label: l.label, category: l.category, setting: l.setting, treatment: l.treatment, status: l.status, monthlyAmountCents: l.monthlyAmountCents, startDate: l.startDate, endDate: l.endDate, notes: l.notes })
      .where(eq(farmFixedCostLines.id, r.id));
    fixedUpdated += 1;
  }
  const have = new Set((await db.select({ key: farmFixedCostLines.key }).from(farmFixedCostLines)).map((r) => r.key));
  const missing = fixedCosts.filter((l) => !have.has(l.key));
  if (missing.length) await insertFixedCostLines(db, missing);

  const leasehold = await db.delete(farmLeaseholdLines).where(eq(farmLeaseholdLines.source, 'seed')).returning({ id: farmLeaseholdLines.id });
  const loans = await db.delete(farmLoans).where(eq(farmLoans.source, 'seed')).returning({ id: farmLoans.id });
  return { equipmentRemoved: retired.length, equipmentUpdated, fixedRemoved: fixedRetired.length, fixedUpdated, leaseholdRemoved: leasehold.length, loansRemoved: loans.length };
}
