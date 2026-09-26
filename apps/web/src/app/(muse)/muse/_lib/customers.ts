import 'server-only';
import { NOT_RATED, type MarkRating } from '../_data/mark';
import { asc, inArray } from 'drizzle-orm';
import { museCustomers, museCustomerSites, museCustomerServices, museServiceVolumePicks, museSiteCalendarRanges } from '@ct/db';
import { db } from '@/lib/db';
import type { CustomerDef, CustomerKind, CustomerServiceDef, CustomerStatus, CustomerSiteStatus, SiteCalendarRangeDef } from '../_data/customers';
import { withSeedLock, insertCustomers, dbSeedCustomers, insertMissingMealPlans } from './seed-writes';
import { isCustomerPaymentTerms } from '../_data/working-capital';

/**
 * Impact OS — customers read layer (server-only).
 *
 * On first read of an empty table the Plan seed is inserted, `source = 'seed'`
 * (`seed-writes.ts`): the one contracted customer at its stated 125 meals a
 * day, and a prospect per channel carrying no volume. The insert runs under an
 * advisory lock so two parallel first reads cannot both seed.
 */

const iso = (d: string | Date | null): string | null =>
  d === null ? null : typeof d === 'string' ? d : d.toISOString().slice(0, 10);

async function seedIfEmpty(): Promise<void> {
  const any = await db.select({ id: museCustomers.id }).from(museCustomers).limit(1);
  if (any[0]) return;
  await withSeedLock(db, 'customers', async (tx) => {
    const again = await tx.select({ id: museCustomers.id }).from(museCustomers).limit(1);
    if (again[0]) return;
    await insertCustomers(tx, dbSeedCustomers());
  });
  await withSeedLock(db, 'cycles', (tx) => insertMissingMealPlans(tx));
}

export async function listCustomers(): Promise<CustomerDef[]> {
  await seedIfEmpty();
  const rows = await db.select().from(museCustomers).orderBy(asc(museCustomers.channel), asc(museCustomers.createdAt));
  if (rows.length === 0) return [];
  const sites = await db
    .select()
    .from(museCustomerSites)
    .where(inArray(museCustomerSites.customerId, rows.map((r) => r.id)))
    .orderBy(asc(museCustomerSites.createdAt));
  const siteIds = sites.map((s) => s.id);
  const [serviceRows, calendarRows] = siteIds.length
    ? await Promise.all([
        db.select().from(museCustomerServices).where(inArray(museCustomerServices.customerSiteId, siteIds)).orderBy(asc(museCustomerServices.position), asc(museCustomerServices.createdAt)),
        db.select().from(museSiteCalendarRanges).where(inArray(museSiteCalendarRanges.customerSiteId, siteIds)).orderBy(asc(museSiteCalendarRanges.startDate)),
      ])
    : [[], []];
  const pickRows = serviceRows.length
    ? await db.select().from(museServiceVolumePicks).where(inArray(museServiceVolumePicks.serviceId, serviceRows.map((r) => r.id))).orderBy(asc(museServiceVolumePicks.effectiveDate))
    : [];
  const servicesBySite = new Map<string, CustomerServiceDef[]>();
  for (const r of serviceRows) {
    const arr = servicesBySite.get(r.customerSiteId) ?? [];
    arr.push({
      id: r.id,
      name: r.name,
      weekdays: Array.isArray(r.weekdays) ? (r.weekdays as number[]).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : [1, 2, 3, 4, 5],
      status: r.status === 'inactive' ? 'inactive' : 'active',
      notes: r.notes,
      picks: pickRows.filter((p) => p.serviceId === r.id).map((p) => ({ id: p.id, effectiveDate: iso(p.effectiveDate)!, meals: p.meals, notes: p.notes })),
    });
    servicesBySite.set(r.customerSiteId, arr);
  }
  const calendarBySite = new Map<string, SiteCalendarRangeDef[]>();
  for (const r of calendarRows) {
    const arr = calendarBySite.get(r.customerSiteId) ?? [];
    arr.push({ id: r.id, kind: r.kind === 'break' ? 'break' : 'term', label: r.label, startDate: iso(r.startDate)!, endDate: iso(r.endDate)! });
    calendarBySite.set(r.customerSiteId, arr);
  }
  const byCustomer = new Map<string, typeof sites>();
  for (const s of sites) {
    const arr = byCustomer.get(s.customerId) ?? [];
    arr.push(s);
    byCustomer.set(s.customerId, arr);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind as CustomerKind,
    channel: r.channel,
    status: (['prospect', 'contracted', 'forecast', 'inactive'].includes(r.status) ? r.status : 'prospect') as CustomerStatus,
    pricePerMealCents: r.pricePerMealCents,
    paymentTerms: isCustomerPaymentTerms(r.paymentTerms) ? r.paymentTerms : null,
    contractStart: iso(r.contractStart),
    contractEnd: iso(r.contractEnd),
    schoolId: r.schoolId,
    notes: r.notes,
    source: r.source === 'seed' ? 'seed' : 'user_built',
    erra: customerRating(r.erraStatus, r.erraStars, r.erraRatedOn),
    sites: (byCustomer.get(r.id) ?? []).map((s) => ({
      id: s.id,
      siteId: s.siteId,
      name: s.name,
      gradeGroups: Array.isArray(s.gradeGroups) ? (s.gradeGroups as string[]) : [],
      serviceDaysPerYear: s.serviceDaysPerYear,
      enrollment: s.enrollment,
      participationRate: s.participationRate,
      expectedMealsPerDay: s.expectedMealsPerDay,
      status: s.status as CustomerSiteStatus,
      notes: s.notes,
      services: servicesBySite.get(s.id) ?? [],
      calendar: calendarBySite.get(s.id) ?? [],
    })),
  }));
}

/** A stored rating as the mark's rating: stars 1–3 when rated; anything else reads not rated. */
function customerRating(status: string | null, stars: number | null, ratedOn: string | Date | null): MarkRating {
  const on = ratedOn === null ? undefined : typeof ratedOn === 'string' ? ratedOn : ratedOn.toISOString().slice(0, 10);
  if (status === 'rated' && (stars === 1 || stars === 2 || stars === 3)) return { status: 'rated', stars, ratedOn: on };
  if (status === 'in_review') return { status: 'in_review', since: on };
  return NOT_RATED;
}
