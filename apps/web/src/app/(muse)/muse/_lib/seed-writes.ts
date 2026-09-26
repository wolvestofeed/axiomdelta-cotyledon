import { eq, inArray, ne, sql } from 'drizzle-orm';
import { museCustomers, museCustomerSites, museCustomerServices, museServiceVolumePicks, museSiteCalendarRanges, museEquipment, museFixedCostLines, museLeaseholdLines, museLoans, museMenuCycles, museMenuCycleDays, musePackages, museRecipes, museRecipeLines, museTimeStudies, museTimeStudyLines, type DbHandle } from '@ct/db';
import type { EquipmentLine, LeaseholdLine } from '../_data/capex';
import { seedLoans, equipmentPurchase, type FixedCostLineDef, type LoanDef } from '../_data/finance';
import { leaseholdSeed } from '../_data/capex';
import { countsTowardCapital } from '../_engine/equipment';
import type { PackageSeed } from '../_data/packaging';
import type { TimeStudySeed } from '../_data/time-studies';
import { planSeedCustomers, type CustomerDef } from '../_data/customers';
import { seedMenuCycles, seedMealPlans, DEFAULT_WEEKDAYS, type MenuCycleDef } from '../_data/menu-cycles';
import { seedLibrary } from '../_data/recipes-menu';
import { recipeToRows, type LibraryRecipe } from '../_engine/recipe-library';
import type { RecipeDef } from '../_data/plan-data';

/**
 * Impact OS — the placeholder seed, written once.
 *
 * One writer for the read layers (`_lib/customers.ts`, `_lib/recipes.ts`,
 * `_lib/orders.ts`) and the reset script (`pnpm muse:reseed`), so the rows the
 * database starts with come from one place. Every seed runs inside a
 * transaction holding an advisory lock: the layout and a page read the same
 * table in parallel on a first render, and without the lock both inserted the
 * placeholders (the doubled demand Robert saw on 2026-09-13).
 *
 * Not `server-only`: the reset script runs outside Next.
 */

/** Any Drizzle handle or transaction that can read and write. */
export type SeedDb = Pick<DbHandle['db'], 'select' | 'insert' | 'delete' | 'update'>;

const LOCK = { recipes: 74_001, customers: 74_002, cycles: 74_003, equipment: 74_004, packaging: 74_005, timeStudies: 74_006, finance: 74_007, leasehold: 74_008 } as const;

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
    .insert(museEquipment)
    .values(
      lines.map((l, position) => ({
        key: l.key,
        position,
        item: l.item,
        category: l.category,
        buildPhase: l.phase,
        status: l.status,
        inServiceDate: l.inServiceDate,
        newUsed: l.newUsed,
        qty: l.qty,
        unitCostCents: Math.round(l.unitCostNew * 100),
        critical: l.critical,
        notes: l.note ?? null,
        batchCapacityLb: l.batchCapacityLb ?? null,
        batchCapacityBasis: l.batchCapacityBasis ?? 'estimated',
        concurrentBatches: l.concurrentBatches ?? null,
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
    .onConflictDoNothing({ target: museEquipment.key });
  return lines.length;
}

/** Insert a time study and its task lines for a recipe (Roadmap O2). Returns the study id. */
export async function insertTimeStudy(db: SeedDb, recipeId: string, study: TimeStudySeed, source: 'seed' | 'user_built', createdBy: string | null = null): Promise<string | null> {
  const rows = await db
    .insert(museTimeStudies)
    .values({ recipeId, studiedOn: study.studiedOn, batchSize: study.batchSize, observer: study.observer, qualityResult: study.qualityResult, qualityNotes: study.qualityNotes, source, basis: study.basis, createdBy })
    .returning({ id: museTimeStudies.id });
  const id = rows[0]?.id ?? null;
  if (!id) return null;
  if (study.lines.length > 0) {
    await db.insert(museTimeStudyLines).values(
      study.lines.map((l, position) => ({ studyId: id, position, task: l.task, station: l.station, staff: l.staff, elapsedMinutes: l.elapsedMinutes, laborMinutes: l.laborMinutes, scalesWith: l.scalesWith, stream: l.stream })),
    );
  }
  return id;
}

/** Insert the packaging library seed (Roadmap N1). */
export async function insertPackages(db: SeedDb, rows: readonly PackageSeed[]): Promise<number> {
  if (rows.length === 0) return 0;
  await db.insert(musePackages).values(
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

/** Insert every seed recipe whose code is not in the library. Idempotent on the code. */
export async function seedMissingRecipes(db: SeedDb, library: readonly RecipeDef[] = seedLibrary, effectiveFrom = new Date().toISOString().slice(0, 10)): Promise<string[]> {
  const codes = library.map((r) => r.code);
  const have = new Set((await db.select({ code: museRecipes.code }).from(museRecipes).where(inArray(museRecipes.code, codes))).map((r) => r.code));
  const added: string[] = [];
  for (const r of library) {
    if (have.has(r.code)) continue;
    const { header, lines } = recipeToRows(r);
    const inserted = await db
      .insert(museRecipes)
      .values({ ...header, source: 'seed', effectiveFrom })
      .onConflictDoNothing({ target: museRecipes.code })
      .returning({ id: museRecipes.id });
    const id = inserted[0]?.id;
    if (!id) continue;
    if (lines.length > 0) await db.insert(museRecipeLines).values(lines.map((l) => ({ recipeId: id, ...l })));
    added.push(r.code);
  }
  return added;
}

/**
 * Bring every recipe still `source = 'seed'` in line with the code seed: the
 * header (channels, category, components, method, allergens, spec) and the
 * ingredient lines. Status is left alone (it is edited in the library). A row
 * someone has edited is `user_built` and is not touched. Used by the reset
 * script only; the read path inserts and never rewrites.
 */
export async function syncSeedRecipes(db: SeedDb, library: readonly RecipeDef[] = seedLibrary): Promise<string[]> {
  const rows = await db.select({ id: museRecipes.id, code: museRecipes.code, source: museRecipes.source, version: museRecipes.version }).from(museRecipes).where(inArray(museRecipes.code, library.map((r) => r.code)));
  const synced: string[] = [];
  for (const row of rows) {
    if (row.source !== 'seed') continue;
    const r = library.find((x) => x.code === row.code);
    if (!r) continue;
    const { header, lines } = recipeToRows(r);
    await db
      .update(museRecipes)
      .set({ channels: header.channels, category: header.category, components: header.components, productionMethod: header.productionMethod, allergensPresent: header.allergensPresent, allergenFreeClaims: header.allergenFreeClaims, spec: header.spec, version: row.version + 1, effectiveFrom: new Date().toISOString().slice(0, 10), updatedAt: new Date() })
      .where(eq(museRecipes.id, row.id));
    await db.delete(museRecipeLines).where(eq(museRecipeLines.recipeId, row.id));
    if (lines.length > 0) await db.insert(museRecipeLines).values(lines.map((l) => ({ recipeId: row.id, ...l })));
    synced.push(row.code);
  }
  return synced;
}

/** Insert the loan seed in list order (Roadmap N1). */
export async function insertLoans(db: SeedDb, loans: readonly LoanDef[]): Promise<number> {
  if (loans.length === 0) return 0;
  await db.insert(museLoans).values(
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
  );
  return loans.length;
}

/** Insert the leasehold schedule seed in list order (Roadmap N1). */
export async function insertLeaseholdLines(db: SeedDb, lines: readonly LeaseholdLine[]): Promise<number> {
  if (lines.length === 0) return 0;
  await db.insert(museLeaseholdLines).values(
    lines.map((l, position) => ({
      key: l.key,
      item: l.item,
      extendedCents: Math.round(l.extended * 100),
      counted: l.counted,
      notes: l.note ?? null,
      position,
      source: 'seed',
    })),
  );
  return lines.length;
}

/** Insert the fixed-cost line seed in list order (Roadmap N1). */
export async function insertFixedCostLines(db: SeedDb, lines: readonly FixedCostLineDef[]): Promise<number> {
  if (lines.length === 0) return 0;
  await db.insert(museFixedCostLines).values(
    lines.map((l, position) => ({
      key: l.key,
      label: l.label,
      category: l.category,
      treatment: l.treatment,
      status: l.status,
      monthlyAmountCents: l.monthlyAmountCents,
      startDate: l.startDate,
      endDate: l.endDate,
      notes: l.notes,
      position,
      source: 'seed',
    })),
  );
  return lines.length;
}

/**
 * The loan seed, with each principal read from the LIVE equipment library and
 * the leasehold schedule — so the seeded figure matches what Capital &
 * Financing showed on the day it ran. It does not track either afterwards; the
 * schedule is reported beside the principal instead (Roadmap N1).
 */
export function dbSeedLoans(equipment: readonly EquipmentLine[]): LoanDef[] {
  const equipmentTotal = equipment
    .filter((l) => countsTowardCapital(l.status))
    .reduce((s, l) => s + l.qty * l.unitCostNew * (l.newUsed === 'Used' ? equipmentPurchase.usedDiscount : 1), 0);
  const leasehold = leaseholdSeed.filter((l) => l.counted).reduce((s, l) => s + l.extended, 0);
  return seedLoans({ equipmentCents: Math.round(equipmentTotal * 100), leaseholdCents: Math.round(leasehold * 100) });
}

export async function insertCustomers(db: SeedDb, customers: readonly CustomerDef[]): Promise<number> {
  let n = 0;
  for (const c of customers) {
    const inserted = await db
      .insert(museCustomers)
      .values({
        name: c.name,
        kind: c.kind,
        channel: c.channel,
        status: c.status,
        pricePerMealCents: c.pricePerMealCents,
        paymentTerms: c.paymentTerms,
        contractStart: c.contractStart,
        contractEnd: c.contractEnd,
        schoolId: c.schoolId,
        notes: c.notes,
        source: 'seed',
      })
      .returning({ id: museCustomers.id });
    const id = inserted[0]?.id;
    if (!id) continue;
    n++;
    for (const s of c.sites) {
      const site = await db
        .insert(museCustomerSites)
        .values({
          customerId: id,
          siteId: s.siteId,
          name: s.name,
          gradeGroups: s.gradeGroups,
          serviceDaysPerYear: s.serviceDaysPerYear,
          enrollment: s.enrollment,
          participationRate: s.participationRate,
          expectedMealsPerDay: s.expectedMealsPerDay,
          status: s.status,
          notes: s.notes,
        })
        .returning({ id: museCustomerSites.id });
      const siteId = site[0]?.id;
      if (!siteId) continue;
      await insertSiteServices(db, siteId, s);
    }
  }
  return n;
}

/** A site's services, their volume picks and its calendar (Roadmap N4a). */
export async function insertSiteServices(db: SeedDb, siteId: string, s: Pick<CustomerDef['sites'][number], 'services' | 'calendar'>): Promise<void> {
  for (const [position, sv] of s.services.entries()) {
    const row = await db
      .insert(museCustomerServices)
      .values({ customerSiteId: siteId, name: sv.name, weekdays: sv.weekdays, status: sv.status, position, notes: sv.notes })
      .returning({ id: museCustomerServices.id });
    const serviceId = row[0]?.id;
    if (!serviceId || sv.picks.length === 0) continue;
    await db.insert(museServiceVolumePicks).values(sv.picks.map((p) => ({ serviceId, effectiveDate: p.effectiveDate, meals: p.meals, notes: p.notes })));
  }
  if (s.calendar.length > 0) {
    await db.insert(museSiteCalendarRanges).values(s.calendar.map((r) => ({ customerSiteId: siteId, kind: r.kind, label: r.label, startDate: r.startDate, endDate: r.endDate })));
  }
}

export async function insertMenuCycles(db: SeedDb, cycles: readonly MenuCycleDef[]): Promise<number> {
  let n = 0;
  for (const c of cycles) {
    const inserted = await db
      .insert(museMenuCycles)
      .values({
        channel: null,
        customerId: c.customerId,
        customerServiceId: c.customerServiceId,
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
      .returning({ id: museMenuCycles.id });
    const id = inserted[0]?.id;
    if (!id) continue;
    n++;
    if (c.days.length) await db.insert(museMenuCycleDays).values(c.days.map((d) => ({ cycleId: id, day: d.day, recipeCode: d.recipeCode })));
  }
  return n;
}

/**
 * The database's customer seed (Roadmap N1): the one contracted customer at its
 * stated 125 meals a day, and a prospect per channel carrying no volume. The
 * recipe library is no longer read for it — seeded demand is what is
 * contracted, not what the chiller could hold (Robert, 2026-09-15).
 */
export function dbSeedCustomers(): CustomerDef[] {
  return planSeedCustomers();
}

export function dbSeedMenuCycles(library: readonly (RecipeDef | LibraryRecipe)[], today: string): MenuCycleDef[] {
  return seedMenuCycles(library, today);
}

/**
 * A meal plan for every customer that is not inactive and has none, copied
 * from the saved cycle its channel's recipes are offered from (Roadmap N4a).
 * Runs after either seed, so whichever of customers and cycles lands second
 * completes the pair. Returns the plans inserted.
 */
export async function insertMissingMealPlans(db: SeedDb): Promise<number> {
  const customers = await db.select({ id: museCustomers.id, channel: museCustomers.channel, status: museCustomers.status }).from(museCustomers).where(ne(museCustomers.status, 'inactive'));
  if (customers.length === 0) return 0;
  const rows = await db.select().from(museMenuCycles);
  const saved = rows.filter((r) => r.customerId === null);
  if (saved.length === 0) return 0;
  const days = await db.select().from(museMenuCycleDays).where(inArray(museMenuCycleDays.cycleId, saved.map((r) => r.id)));
  const cycles: MenuCycleDef[] = rows.map((r) => ({
    id: r.id,
    channel: null,
    customerId: r.customerId,
    customerServiceId: r.customerServiceId,
    fromCycleId: r.fromCycleId,
    name: r.name,
    startDate: typeof r.startDate === 'string' ? r.startDate : String(r.startDate),
    endDate: r.endDate === null ? null : String(r.endDate),
    lengthDays: r.lengthDays,
    weekdays: Array.isArray(r.weekdays) ? (r.weekdays as number[]) : [...DEFAULT_WEEKDAYS],
    status: r.status === 'inactive' ? 'inactive' : 'active',
    notes: r.notes,
    source: r.source === 'seed' ? 'seed' : 'user_built',
    days: days.filter((d) => d.cycleId === r.id).map((d) => ({ day: d.day, recipeCode: d.recipeCode })),
  }));
  return insertMenuCycles(db, seedMealPlans(customers, cycles));
}

/** Remove every seed row (source = 'seed') so the next read seeds afresh. Orders on seed customers cascade. */
export async function deleteSeedRows(db: SeedDb): Promise<{ customers: number; cycles: number }> {
  const c = await db.delete(museCustomers).where(eq(museCustomers.source, 'seed')).returning({ id: museCustomers.id });
  const y = await db.delete(museMenuCycles).where(eq(museMenuCycles.source, 'seed')).returning({ id: museMenuCycles.id });
  return { customers: c.length, cycles: y.length };
}
