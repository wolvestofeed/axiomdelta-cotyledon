'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { museCustomers, museCustomerSites, museCustomerServices, museServiceVolumePicks, museSiteCalendarRanges } from '@ct/db';
import { db } from '@/lib/db';
import { accessRefusal, requireMuseSuperAdmin } from './access';

/**
 * Impact OS — customers and sites, writes. SUPER ADMIN ONLY.
 *
 * A customer and its sites are facts of record: the contract, the price, the
 * places served, each site's services, their dated volume picks and the site's
 * service calendar (Roadmap N4a). A forecast's edits live on its `forecast`
 * overlay and never write here.
 */

type Result<T = unknown> = ({ ok: true } & (T extends object ? T : object)) | { ok: false; error: string };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

function refuse(e: unknown): { ok: false; error: string } {
  const refused = accessRefusal(e);
  if (refused) return refused;
  throw e;
}
const fail = (issues: z.ZodIssue[]) => ({ ok: false as const, error: issues.map((i) => i.message).join('; ') });

const CustomerInput = z.object({
  name: z.string().trim().min(1, 'Name the customer').max(200),
  kind: z.enum(['district', 'company', 'marketplace', 'other']),
  channel: z.number().int().min(1).max(3),
  status: z.enum(['prospect', 'contracted', 'forecast', 'inactive']),
  pricePerMealCents: z.number().int().min(0).nullable().default(null),
  /** No default (Roadmap K3): null until someone chooses the customer's terms. */
  paymentTerms: z.enum(['due_on_receipt', 'net_15', 'net_30']).nullable().default(null),
  contractStart: isoDate.nullable().default(null),
  contractEnd: isoDate.nullable().default(null),
  schoolId: z.string().max(120).nullable().default(null),
  notes: z.string().max(2000).nullable().default(null),
});

export async function createCustomer(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = CustomerInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const inserted = await db.insert(museCustomers).values({ ...parsed.data, createdBy: access.userId }).returning({ id: museCustomers.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to save the customer.' };
  revalidatePath('/muse', 'layout');
  return { ok: true, id: inserted[0].id };
}

export async function updateCustomer(input: unknown): Promise<Result> {
  const parsed = CustomerInput.extend({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...rest } = parsed.data;
  await db.update(museCustomers).set({ ...rest, source: 'user_built', updatedAt: new Date() }).where(eq(museCustomers.id, id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

const RatingInput = z.object({
  id: z.string().uuid(),
  status: z.enum(['rated', 'in_review', 'not_rated']),
  stars: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().default(null),
  ratedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').nullable().default(null),
}).refine((v) => v.status !== 'rated' || v.stars !== null, { message: 'A rating carries one, two or three stars.' });

/** The ERRA rating Muse Kitchen assigns a customer (Roadmap N7). Super admin. */
export async function setCustomerRating(input: unknown): Promise<Result> {
  const parsed = RatingInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const d = parsed.data;
  await db
    .update(museCustomers)
    .set({ erraStatus: d.status === 'not_rated' ? null : d.status, erraStars: d.status === 'rated' ? d.stars : null, erraRatedOn: d.status === 'not_rated' ? null : d.ratedOn, updatedAt: new Date() })
    .where(eq(museCustomers.id, d.id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

export async function deleteCustomer(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.delete(museCustomers).where(eq(museCustomers.id, parsed.data.id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

const SiteInput = z.object({
  customerId: z.string().uuid(),
  siteId: z.string().max(120).nullable().default(null),
  name: z.string().trim().min(1, 'Name the site').max(200),
  gradeGroups: z.array(z.enum(['K-5', '6-8', '9-12'])).default([]),
  /** Entered when a school account is set up; participation is calculated from orders against it. */
  enrollment: z.number().int().min(0).nullable().default(null),
  status: z.enum(['active', 'planned', 'inactive']).default('active'),
  notes: z.string().max(2000).nullable().default(null),
});

export async function createCustomerSite(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = SiteInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  let access;
  try {
    access = await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const inserted = await db.insert(museCustomerSites).values({ ...parsed.data, createdBy: access.userId }).returning({ id: museCustomerSites.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to save the site.' };
  // Every site is served through at least one service; it starts with one, no volume until a pick is entered.
  await db.insert(museCustomerServices).values({ customerSiteId: inserted[0].id, name: 'Service 1', createdBy: access.userId });
  revalidatePath('/muse', 'layout');
  return { ok: true, id: inserted[0].id };
}

export async function updateCustomerSite(input: unknown): Promise<Result> {
  const parsed = SiteInput.extend({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  const { id, ...rest } = parsed.data;
  await db.update(museCustomerSites).set({ ...rest, updatedAt: new Date() }).where(eq(museCustomerSites.id, id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

export async function deleteCustomerSite(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  try {
    await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
  await db.delete(museCustomerSites).where(eq(museCustomerSites.id, parsed.data.id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

// ── Services (Roadmap N4a) ──────────────────────────────────────────────────

const weekdays = z.array(z.number().int().min(0).max(6)).min(1, 'A service runs on at least one weekday');

const ServiceInput = z.object({
  customerSiteId: z.string().uuid(),
  name: z.string().trim().min(1, 'Name the service').max(120),
  weekdays,
  status: z.enum(['active', 'inactive']).default('active'),
  notes: z.string().max(2000).nullable().default(null),
});

async function gate(): Promise<{ userId: string } | { ok: false; error: string }> {
  try {
    return await requireMuseSuperAdmin();
  } catch (e) {
    return refuse(e);
  }
}

export async function createCustomerService(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = ServiceInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const access = await gate();
  if ('ok' in access) return access;
  const d = parsed.data;
  const count = await db.select({ id: museCustomerServices.id }).from(museCustomerServices).where(eq(museCustomerServices.customerSiteId, d.customerSiteId));
  const inserted = await db
    .insert(museCustomerServices)
    .values({ ...d, weekdays: [...new Set(d.weekdays)].sort(), position: count.length, createdBy: access.userId })
    .returning({ id: museCustomerServices.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to save the service.' };
  revalidatePath('/muse', 'layout');
  return { ok: true, id: inserted[0].id };
}

export async function updateCustomerService(input: unknown): Promise<Result> {
  const parsed = ServiceInput.omit({ customerSiteId: true }).extend({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const access = await gate();
  if ('ok' in access) return access;
  const { id, ...rest } = parsed.data;
  await db.update(museCustomerServices).set({ ...rest, weekdays: [...new Set(rest.weekdays)].sort(), updatedAt: new Date() }).where(eq(museCustomerServices.id, id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

export async function deleteCustomerService(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const access = await gate();
  if ('ok' in access) return access;
  await db.delete(museCustomerServices).where(eq(museCustomerServices.id, parsed.data.id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

const PickInput = z.object({
  serviceId: z.string().uuid(),
  effectiveDate: isoDate,
  meals: z.number().min(0, 'Meals cannot be negative'),
  notes: z.string().max(2000).nullable().default(null),
});

/** Set the meals per service from a date; a pick already on that date is replaced. */
export async function setVolumePick(input: unknown): Promise<Result> {
  const parsed = PickInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const access = await gate();
  if ('ok' in access) return access;
  const d = parsed.data;
  const existing = await db
    .select({ id: museServiceVolumePicks.id })
    .from(museServiceVolumePicks)
    .where(and(eq(museServiceVolumePicks.serviceId, d.serviceId), eq(museServiceVolumePicks.effectiveDate, d.effectiveDate)))
    .limit(1);
  if (existing[0]) await db.update(museServiceVolumePicks).set({ meals: d.meals, notes: d.notes, updatedAt: new Date() }).where(eq(museServiceVolumePicks.id, existing[0].id));
  else await db.insert(museServiceVolumePicks).values({ ...d, createdBy: access.userId });
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

export async function deleteVolumePick(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const access = await gate();
  if ('ok' in access) return access;
  await db.delete(museServiceVolumePicks).where(eq(museServiceVolumePicks.id, parsed.data.id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}

// ── Site service calendar (Roadmap N4a) ─────────────────────────────────────

const CalendarRangeInput = z
  .object({
    customerSiteId: z.string().uuid(),
    kind: z.enum(['term', 'break']),
    label: z.string().max(120).nullable().default(null),
    startDate: isoDate,
    endDate: isoDate,
  })
  .refine((r) => r.endDate >= r.startDate, { message: 'The end date is before the start date.' });

export async function createSiteCalendarRange(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = CalendarRangeInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const access = await gate();
  if ('ok' in access) return access;
  const inserted = await db.insert(museSiteCalendarRanges).values({ ...parsed.data, createdBy: access.userId }).returning({ id: museSiteCalendarRanges.id });
  if (!inserted[0]) return { ok: false, error: 'Failed to save the date range.' };
  revalidatePath('/muse', 'layout');
  return { ok: true, id: inserted[0].id };
}

export async function deleteSiteCalendarRange(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues);
  const access = await gate();
  if ('ok' in access) return access;
  await db.delete(museSiteCalendarRanges).where(eq(museSiteCalendarRanges.id, parsed.data.id));
  revalidatePath('/muse', 'layout');
  return { ok: true };
}
